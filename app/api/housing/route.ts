import { getBooleanPlatformSetting } from "../../../lib/platform-settings";
import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

type HousingMessageRow = {
  id: string;
  content: string;
  is_anonymous: number;
  created_at: string;
  author_email: string;
  author_name: string;
  author_handle: string;
};

function serializeMessage(row: HousingMessageRow, viewerEmail: string) {
  return {
    id: row.id,
    content: row.content,
    anonymous: Boolean(row.is_anonymous),
    authorName: row.is_anonymous ? "Anonim öğrenci" : row.author_name,
    authorHandle: row.is_anonymous ? null : row.author_handle,
    own: row.author_email === viewerEmail,
    time: relativeTime(row.created_at),
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Yurt deneyimlerini görmek için giriş yapmalısın.");
  const placeId = cleanText(new URL(request.url).searchParams.get("placeId"), 80);
  if (!placeId) return Response.json({ error: "Konaklama kaydını seçmelisin." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const place = await DB.prepare(
      `SELECT id, name FROM campus_places WHERE id = ? AND university_id = ? AND category = 'housing' AND status = 'active' LIMIT 1`,
    ).bind(placeId, profile.university_id).first<{ id: string; name: string }>();
    if (!place) return Response.json({ error: "Bu konaklama kaydı kampüsünde bulunamadı." }, { status: 404 });
    const messages = await DB.prepare(
      `SELECT h.id, h.content, h.is_anonymous, h.created_at, h.author_email,
              u.display_name AS author_name, u.handle AS author_handle
       FROM housing_discussions h
       JOIN users u ON u.email = h.author_email
       JOIN student_profiles sp ON sp.user_email = h.author_email
       WHERE h.place_id = ? AND h.status = 'active' AND sp.university_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = h.author_email)
              OR (b.blocker_email = h.author_email AND b.blocked_email = ?)
         )
         AND NOT EXISTS (SELECT 1 FROM user_mutes m WHERE m.muter_email = ? AND m.muted_email = h.author_email)
       ORDER BY h.created_at DESC, h.id DESC LIMIT 80`,
    ).bind(placeId, profile.university_id, identity.email, identity.email, identity.email).all<HousingMessageRow>();
    return Response.json({ place, messages: messages.results.map((row) => serializeMessage(row, identity.email)) });
  } catch (error) {
    return unavailableResponse(error, "Yurt deneyimleri şu anda getirilemiyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Yurt deneyimi paylaşmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Paylaşım bilgisi geçerli değil." }, { status: 400 }); }
  const placeId = cleanText(payload.placeId, 80);
  const content = cleanText(payload.content, 600);
  const anonymous = payload.anonymous === true;
  if (!placeId || content.length < 3) return Response.json({ error: "Konaklama kaydı ve en az 3 karakterlik deneyim gerekli." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    if (!(await getBooleanPlatformSetting(DB, "housingContributionsOpen"))) {
      return Response.json({ error: "Yurt ve konaklama katkıları owner tarafından geçici olarak durduruldu." }, { status: 503 });
    }
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const place = await DB.prepare(
      `SELECT id FROM campus_places WHERE id = ? AND university_id = ? AND category = 'housing' AND status = 'active' LIMIT 1`,
    ).bind(placeId, profile.university_id).first();
    if (!place) return Response.json({ error: "Bu konaklama kaydı kampüsünde bulunamadı." }, { status: 404 });
    const limit = await enforceRateLimit(DB, identity.email, "housing-message", 20, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO housing_discussions (id, place_id, author_email, content, is_anonymous) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, placeId, identity.email, content, anonymous ? 1 : 0).run();
    await audit(DB, identity.email, "housing-message.created", "housing-message", id, { placeId, anonymous });
    return Response.json({ message: { id, content, anonymous, authorName: anonymous ? "Anonim öğrenci" : identity.displayName, own: true, time: "şimdi" } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Yurt deneyimi şu anda paylaşılamıyor.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Silinecek paylaşım bilgisi geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  if (!id) return Response.json({ error: "Silinecek paylaşım gerekli." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const result = await DB.prepare(
      `UPDATE housing_discussions SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND author_email = ? AND status = 'active'`,
    ).bind(id, identity.email).run();
    if (!Number(result.meta.changes ?? 0)) return Response.json({ error: "Silinebilecek paylaşım bulunamadı." }, { status: 404 });
    await audit(DB, identity.email, "housing-message.deleted", "housing-message", id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return unavailableResponse(error, "Paylaşım şu anda silinemiyor.");
  }
}
