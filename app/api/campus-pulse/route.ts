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

const kinds = new Set(["live", "confession"]);
const categories = new Set(["general", "transport", "food", "event", "lost-found", "study", "safety", "social"]);
const liveDurations = new Set([1, 3, 6, 12, 24]);
const reactionLabels = new Set(["support", "confirm", "outdated"]);

type PulseRow = {
  id: string;
  kind: string;
  category: string;
  content: string;
  campus_zone: string;
  is_anonymous: number;
  author_email: string;
  expires_at: string | null;
  created_at: string;
  display_name: string;
  public_id: string;
  support_count: number;
  confirm_count: number;
  outdated_count: number;
  viewer_reaction: string | null;
};

function serialize(row: PulseRow, viewerEmail: string) {
  const anonymous = Boolean(row.is_anonymous);
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    content: row.content,
    campusZone: row.campus_zone,
    anonymous,
    authorName: anonymous ? "Anonim öğrenci" : row.display_name,
    authorId: anonymous ? null : row.public_id,
    own: row.author_email === viewerEmail,
    expiresAt: row.expires_at,
    time: relativeTime(row.created_at),
    supportCount: Number(row.support_count),
    confirmCount: Number(row.confirm_count),
    outdatedCount: Number(row.outdated_count),
    viewerReaction: row.viewer_reaction,
  };
}

function trendingTopics(rows: PulseRow[]) {
  const scores = new Map<string, number>();
  for (const row of rows) {
    scores.set(row.category, (scores.get(row.category) ?? 0) + 1);
    for (const match of row.content.matchAll(/#([\p{L}\p{N}_-]{2,30})/gu)) {
      const tag = `#${match[1].toLocaleLowerCase("tr-TR")}`;
      scores.set(tag, (scores.get(tag) ?? 0) + 2);
    }
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "tr-TR"))
    .slice(0, 6)
    .map(([topic, score]) => ({ topic, score }));
}

async function readCounts(db: D1Database, postId: string) {
  const counts = await db.prepare(
    `SELECT
       SUM(CASE WHEN reaction = 'support' THEN 1 ELSE 0 END) AS support_count,
       SUM(CASE WHEN reaction = 'confirm' THEN 1 ELSE 0 END) AS confirm_count,
       SUM(CASE WHEN reaction = 'outdated' THEN 1 ELSE 0 END) AS outdated_count
     FROM campus_pulse_reactions WHERE post_id = ?`,
  ).bind(postId).first<{ support_count: number | null; confirm_count: number | null; outdated_count: number | null }>();
  return {
    supportCount: Number(counts?.support_count ?? 0),
    confirmCount: Number(counts?.confirm_count ?? 0),
    outdatedCount: Number(counts?.outdated_count ?? 0),
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüs Anlık akışını görmek için giriş yapmalısın.");
  const requestedKind = new URL(request.url).searchParams.get("kind")?.trim() ?? "all";
  if (requestedKind !== "all" && !kinds.has(requestedKind)) {
    return Response.json({ error: "Akış türü geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const rows = await DB.prepare(
      `SELECT p.id, p.kind, p.category, p.content, p.campus_zone, p.is_anonymous,
              p.author_email, p.expires_at, p.created_at, u.display_name, u.public_id,
              (SELECT COUNT(*) FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.reaction = 'support') AS support_count,
              (SELECT COUNT(*) FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.reaction = 'confirm') AS confirm_count,
              (SELECT COUNT(*) FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.reaction = 'outdated') AS outdated_count,
              (SELECT reaction FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.user_email = ? LIMIT 1) AS viewer_reaction
       FROM campus_pulse_posts p
       JOIN users u ON u.email = p.author_email
       WHERE p.university_id = ?
         AND p.status = 'active'
         AND p.deleted_at IS NULL
         AND (? = 'all' OR p.kind = ?)
         AND (p.kind = 'confession' OR p.expires_at IS NULL OR datetime(p.expires_at) > CURRENT_TIMESTAMP)
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = p.author_email)
              OR (b.blocker_email = p.author_email AND b.blocked_email = ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_mutes m WHERE m.muter_email = ? AND m.muted_email = p.author_email
         )
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 80`,
    ).bind(identity.email, profile.university_id, requestedKind, requestedKind, identity.email, identity.email, identity.email).all<PulseRow>();
    const items = rows.results.map((row) => serialize(row, identity.email));
    return Response.json({ items, topics: trendingTopics(rows.results.filter((row) => row.kind === "live")) });
  } catch (error) {
    return unavailableResponse(error, "Kampüs Anlık akışına şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüste paylaşım yapmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Paylaşım bilgisi geçerli değil." }, { status: 400 }); }

  const kind = cleanText(payload.kind, 20);
  const category = cleanText(payload.category, 24) || "general";
  const content = cleanText(payload.content, 800);
  const campusZone = cleanText(payload.campusZone, 80);
  if (!kinds.has(kind)) return Response.json({ error: "Paylaşım türü geçerli değil." }, { status: 400 });
  if (!categories.has(category)) return Response.json({ error: "Kampüs kategorisi geçerli değil." }, { status: 400 });
  if (content.length < 12) return Response.json({ error: "Paylaşım en az 12 karakter olmalı." }, { status: 400 });
  const durationHours = Number(payload.durationHours ?? 6);
  if (kind === "live" && !liveDurations.has(durationHours)) {
    return Response.json({ error: "Anlık paylaşım süresi geçerli değil." }, { status: 400 });
  }

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, `campus-pulse-${kind}`, kind === "confession" ? 4 : 12, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const id = crypto.randomUUID();
    const anonymous = kind === "confession";
    const expiresAt = kind === "live" ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString() : null;
    await DB.prepare(
      `INSERT INTO campus_pulse_posts
       (id, author_email, university_id, kind, category, content, campus_zone, is_anonymous, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, identity.email, profile.university_id, kind, category, content, campusZone, anonymous ? 1 : 0, expiresAt).run();
    await audit(DB, identity.email, "campus-pulse.created", "pulse", id, { kind, category, anonymous });
    return Response.json({ item: { id, kind, category, content, campusZone, anonymous, expiresAt } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Kampüs paylaşımı şu anda yayınlanamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Tepki bilgisi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 20);
  const id = cleanText(payload.id, 80);
  const reaction = cleanText(payload.reaction, 20);
  if (action !== "react" || !id || !reactionLabels.has(reaction)) {
    return Response.json({ error: "Kampüs tepkisi geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const post = await DB.prepare(
      `SELECT id, kind FROM campus_pulse_posts
       WHERE id = ? AND university_id = ? AND status = 'active' AND deleted_at IS NULL
         AND (kind = 'confession' OR expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)
       LIMIT 1`,
    ).bind(id, profile.university_id).first<{ id: string; kind: string }>();
    if (!post) return Response.json({ error: "Kampüs paylaşımı bulunamadı veya süresi doldu." }, { status: 404 });
    if ((post.kind === "confession" && reaction !== "support") || (post.kind === "live" && reaction === "support")) {
      return Response.json({ error: "Bu tepki paylaşım türüne uygun değil." }, { status: 400 });
    }
    const current = await DB.prepare(
      `SELECT reaction FROM campus_pulse_reactions WHERE post_id = ? AND user_email = ? LIMIT 1`,
    ).bind(id, identity.email).first<{ reaction: string }>();
    if (current?.reaction === reaction) {
      await DB.prepare(`DELETE FROM campus_pulse_reactions WHERE post_id = ? AND user_email = ?`).bind(id, identity.email).run();
    } else {
      await DB.prepare(
        `INSERT INTO campus_pulse_reactions (post_id, user_email, reaction)
         VALUES (?, ?, ?)
         ON CONFLICT(post_id, user_email)
         DO UPDATE SET reaction = excluded.reaction, updated_at = CURRENT_TIMESTAMP`,
      ).bind(id, identity.email, reaction).run();
    }
    return Response.json({ active: current?.reaction !== reaction, reaction, ...(await readCounts(DB, id)) });
  } catch (error) {
    return unavailableResponse(error, "Kampüs tepkisi şu anda kaydedilemedi.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Silme isteği geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  if (!id) return Response.json({ error: "Kampüs paylaşımı seçilmedi." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const moderator = await DB.prepare(
      `SELECT 1 AS allowed FROM platform_roles WHERE user_email = ? AND role IN ('moderator', 'admin') LIMIT 1`,
    ).bind(identity.email).first();
    const removed = await DB.prepare(
      `UPDATE campus_pulse_posts
       SET status = 'removed', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL AND (author_email = ? OR ? = 1)
       RETURNING id, author_email`,
    ).bind(id, identity.email, moderator ? 1 : 0).first<{ id: string; author_email: string }>();
    if (!removed) return Response.json({ error: "Silinebilecek paylaşım bulunamadı." }, { status: 404 });
    await audit(DB, identity.email, "campus-pulse.removed", "pulse", id, { moderator: Boolean(moderator) });
    return Response.json({ deleted: true });
  } catch (error) {
    return unavailableResponse(error, "Kampüs paylaşımı şu anda silinemedi.");
  }
}
