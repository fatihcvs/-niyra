import { activeActor, ActiveActorError, ACTIVE_ACTOR_SQL } from "../../../lib/active-actor";
import { sameOriginRequest } from "../../../lib/app-auth";
import {
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

const managerRoles = ["founder", "admin", "moderator"];

type EventRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: string;
  creator_id: string | null;
  creator_name: string;
  attendee_count: number;
  going: number;
};

function serialize(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity === null ? null : Number(row.capacity),
    status: row.status,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    attendeeCount: Number(row.attendee_count),
    going: Boolean(row.going),
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Topluluk etkinliklerini görmek için giriş yapmalısın.");
  const url = new URL(request.url);
  let communityId = cleanText(url.searchParams.get("communityId"), 80);
  const eventId = cleanText(url.searchParams.get("id"), 80);
  const past = url.searchParams.get("past") === "1";
  if (!communityId && !eventId) return Response.json({ error: "Topluluk zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    if (eventId) {
      const parent = await DB.prepare(`SELECT ce.community_id FROM community_events ce JOIN communities c ON c.id = ce.community_id WHERE ce.id = ? AND ce.status IN ('active','cancelled') AND c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active' LIMIT 1`).bind(eventId, profile.university_id).first<{ community_id: string }>();
      if (!parent || (communityId && parent.community_id !== communityId)) return Response.json({ error: "Etkinlik bulunamadı veya erişim iznin yok." }, { status: 404 });
      communityId = parent.community_id;
    }
    const access = await DB.prepare(
      `SELECT c.join_policy, cm.status AS membership_status FROM communities c
       LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_email = ?
       WHERE c.id = ? AND c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active'
       AND NOT EXISTS (SELECT 1 FROM community_bans b WHERE b.community_id = c.id AND b.user_email = ?) LIMIT 1`,
    ).bind(identity.email, communityId, profile.university_id, identity.email).first<{ join_policy: string; membership_status: string | null }>();
    if (!access) return Response.json({ error: "Topluluk bulunamadı." }, { status: 404 });
    if (access.membership_status === "banned") return Response.json({ error: "Etkinlik bulunamadı veya erişim iznin yok." }, { status: 404 });
    if (access.join_policy !== "open" && access.membership_status !== "active") return Response.json({ error: "Etkinlikleri görmek için katılımın onaylanmalı." }, { status: 403 });
    const rows = await DB.prepare(
      `SELECT ce.id, ce.title, ce.description, ce.location, ce.starts_at, ce.ends_at, ce.capacity, ce.status,
              u.public_id AS creator_id, u.display_name AS creator_name,
              (SELECT COUNT(*) FROM community_event_attendees cea WHERE cea.event_id = ce.id AND cea.status = 'going') AS attendee_count,
              EXISTS(SELECT 1 FROM community_event_attendees own WHERE own.event_id = ce.id AND own.user_email = ? AND own.status = 'going') AS going
       FROM community_events ce JOIN users u ON u.email = ce.creator_email
       WHERE ce.community_id = ? AND ce.status IN ('active','cancelled')
         AND (? = '' OR ce.id = ?)
         AND (? <> '' OR (${past ? "datetime(ce.starts_at) < datetime('now')" : "datetime(ce.starts_at) >= datetime('now', '-2 hours')"}))
       ORDER BY CASE ce.status WHEN 'active' THEN 0 ELSE 1 END, ce.starts_at ${past ? "DESC" : "ASC"} LIMIT 30`,
    ).bind(identity.email, communityId, eventId, eventId, eventId).all<EventRow>();
    if (eventId && !rows.results.length) return Response.json({ error: "Etkinlik bulunamadı veya erişim iznin yok." }, { status: 404 });
    return Response.json({ events: rows.results.map(serialize), ...(eventId ? { communityId, event: serialize(rows.results[0]) } : {}) });
  } catch (error) {
    return unavailableResponse(error, "Topluluk etkinliklerine ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan etkinlik isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Etkinlik oluşturmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Etkinlik bilgileri geçerli değil." }, { status: 400 }); }
  const communityId = cleanText(payload.communityId, 80);
  const title = cleanText(payload.title, 100);
  const description = cleanText(payload.description, 700);
  const location = cleanText(payload.location, 120);
  const startsAt = cleanText(payload.startsAt, 40);
  const endsAt = cleanText(payload.endsAt, 40) || null;
  const capacityValue = Number(payload.capacity);
  const capacity = Number.isInteger(capacityValue) && capacityValue >= 2 && capacityValue <= 5000 ? capacityValue : null;
  const starts = new Date(startsAt);
  const ends = endsAt ? new Date(endsAt) : null;
  if (!communityId || title.length < 3 || description.length < 12 || location.length < 3 || Number.isNaN(starts.getTime())) return Response.json({ error: "Başlık, açıklama, yer ve başlangıç zamanı zorunludur." }, { status: 400 });
  if (starts.getTime() < Date.now() - 10 * 60_000) return Response.json({ error: "Etkinlik başlangıcı geçmişte olamaz." }, { status: 400 });
  if (ends && (Number.isNaN(ends.getTime()) || ends <= starts)) return Response.json({ error: "Bitiş zamanı başlangıçtan sonra olmalı." }, { status: 400 });
  if (payload.capacity && capacity === null) return Response.json({ error: "Kontenjan 2 ile 5000 arasında olmalı." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const actor = activeActor(DB, identity.email, profile.public_id);
    const manager = await DB.prepare(
      `SELECT cm.role, c.name FROM community_members cm JOIN communities c ON c.id = cm.community_id
       WHERE cm.community_id = ? AND cm.user_email = ? AND cm.status = 'active' AND c.status = 'active'
         AND c.moderation_status = 'active' AND c.university_id = ? LIMIT 1`,
    ).bind(communityId, identity.email, profile.university_id).first<{ role: string; name: string }>();
    if (!manager || !managerRoles.includes(manager.role)) return Response.json({ error: "Etkinliği yalnızca topluluk ekibi oluşturabilir." }, { status: 403 });
    const limit = await enforceRateLimit(DB, identity.email, "community-event-create", 12, 86400);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await actor.batch([
      actor.statement(`INSERT INTO community_events (id, community_id, creator_email, title, description, location, starts_at, ends_at, capacity, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ACTIVE_ACTOR_SQL}`, [id, communityId, identity.email, title, description, location, starts.toISOString(), ends?.toISOString() ?? null, capacity, now, now]),
      actor.statement(`INSERT INTO community_event_attendees (event_id, user_email, status) SELECT ?, ?, 'going' WHERE ${ACTIVE_ACTOR_SQL}`, [id, identity.email]),
      actor.statement(`UPDATE communities SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${ACTIVE_ACTOR_SQL}`, [now, communityId]),
      actor.statement(`INSERT INTO notifications (id, user_email, actor_email, kind, title, body, entity_type, entity_id)
         SELECT LOWER(HEX(RANDOMBLOB(16))), cm.user_email, ?, 'community', ?, ?, 'community-event', ?
         FROM community_members cm LEFT JOIN notification_preferences np ON np.user_email = cm.user_email
         WHERE cm.community_id = ? AND cm.status = 'active' AND cm.user_email <> ? AND COALESCE(np.communities, 1) = 1 AND cm.notification_level <> 'mute' AND ${ACTIVE_ACTOR_SQL}`, [identity.email, `${manager.name} topluluğunda yeni etkinlik`, title, id, communityId, identity.email]),
    ]);
    await actor.audit("community.event.created", "community-event", id, { communityId, startsAt: starts.toISOString() });
    await actor.notify({ userEmail: identity.email, kind: "community", title: `${title} etkinliği oluşturuldu`, entityType: "community-event", entityId: id });
    return Response.json({ event: { id, title, description, location, startsAt: starts.toISOString(), endsAt: ends?.toISOString() ?? null, capacity, status: "active", creatorName: "Sen", attendeeCount: 1, going: true } }, { status: 201 });
  } catch (error) {
    if (error instanceof ActiveActorError) return Response.json({ error: error.message, code: "ACCOUNT_CHANGED" }, { status: 409 });
    return unavailableResponse(error, "Topluluk etkinliği oluşturulamadı.");
  }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan etkinlik isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Etkinlik işlemi için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Etkinlik işlemi geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  const action = cleanText(payload.action, 20);
  if (!id || !["rsvp", "cancel"].includes(action)) return Response.json({ error: "Etkinlik işlemi desteklenmiyor." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const actor = activeActor(DB, identity.email, profile.public_id);
    const event = await DB.prepare(
      `SELECT ce.id, ce.community_id, ce.title, ce.capacity, ce.status, cm.role, cm.status AS membership_status
       FROM community_events ce JOIN communities c ON c.id = ce.community_id
       LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_email = ?
       WHERE ce.id = ? AND c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active' LIMIT 1`,
    ).bind(identity.email, id, profile.university_id).first<{ id: string; community_id: string; title: string; capacity: number | null; status: string; role: string | null; membership_status: string | null }>();
    if (!event) return Response.json({ error: "Etkinlik bulunamadı." }, { status: 404 });
    if (action === "cancel") {
      if (!event.role || !managerRoles.includes(event.role) || event.membership_status !== "active") return Response.json({ error: "Etkinliği iptal etmek için yetkin yok." }, { status: 403 });
      await actor.run(`UPDATE community_events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${ACTIVE_ACTOR_SQL}`, [id]);
      await actor.audit("community.event.cancelled", "community-event", id, { communityId: event.community_id });
      return Response.json({ status: "cancelled" });
    }
    if (event.status !== "active" || event.membership_status !== "active") return Response.json({ error: "Katılmak için aktif bir topluluk üyesi olmalısın." }, { status: 403 });
    const existing = await DB.prepare(`SELECT status FROM community_event_attendees WHERE event_id = ? AND user_email = ? LIMIT 1`).bind(id, identity.email).first<{ status: string }>();
    const going = existing?.status === "going";
    if (!going && event.capacity) {
      const count = await DB.prepare(`SELECT COUNT(*) AS total FROM community_event_attendees WHERE event_id = ? AND status = 'going'`).bind(id).first<{ total: number }>();
      if (Number(count?.total ?? 0) >= event.capacity) return Response.json({ error: "Etkinlik kontenjanı dolu." }, { status: 409 });
    }
    await actor.run(`INSERT INTO community_event_attendees (event_id, user_email, status) SELECT ?, ?, ? WHERE ${ACTIVE_ACTOR_SQL} ON CONFLICT(event_id, user_email) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`, [id, identity.email, going ? "not-going" : "going"]);
    const count = await DB.prepare(`SELECT COUNT(*) AS total FROM community_event_attendees WHERE event_id = ? AND status = 'going'`).bind(id).first<{ total: number }>();
    await actor.audit(going ? "community.event.left" : "community.event.joined", "community-event", id, { communityId: event.community_id });
    return Response.json({ going: !going, attendeeCount: Number(count?.total ?? 0) });
  } catch (error) {
    if (error instanceof ActiveActorError) return Response.json({ error: error.message, code: "ACCOUNT_CHANGED" }, { status: 409 });
    return unavailableResponse(error, "Etkinlik işlemi tamamlanamadı.");
  }
}
