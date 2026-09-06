import { activeActor, ActiveActorError, ACTIVE_ACTOR_SQL } from "../../../lib/active-actor";
import {
  cleanText,
  enforceRateLimit,
  getRuntime,
  parseJsonArray,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

const areaFeatures = new Set(["quiet", "group", "power", "wifi", "computers", "accessible", "natural-light", "food-free"]);
const durations = new Set([30, 60, 90, 120, 180]);

function optionalInteger(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function allowedFeatures(value: unknown) {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return unique.length === value.length && unique.length <= 8 && unique.every((item) => areaFeatures.has(item)) ? unique : null;
}

async function expireStaleCheckins(DB: D1Database) {
  await DB.prepare(
    `UPDATE library_checkins
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active' AND datetime(expires_at) <= datetime('now')`,
  ).run();
}

type AreaRow = {
  id: string; name: string; floor_label: string; zone_label: string; description: string; capacity: number | null;
  features_json: string; creator_email: string; updated_at: string; place_id: string | null; place_name: string | null;
  latitude: number | null; longitude: number | null; active_count: number; last_signal_at: string | null;
  recent_signal_count: number; viewer_checkin_id: string | null; viewer_expires_at: string | null;
};

export async function GET() {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kütüphane doluluk alanını görmek için giriş yapmalısın.");
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    await expireStaleCheckins(DB);
    const [areasResult, placesResult] = await Promise.all([
      DB.prepare(
        `SELECT area.id, area.name, area.floor_label, area.zone_label, area.description, area.capacity,
                area.features_json, area.creator_email, area.updated_at, area.place_id,
                place.name AS place_name, place.latitude, place.longitude,
                (SELECT COUNT(*) FROM library_checkins active
                 WHERE active.area_id = area.id AND active.status = 'active' AND datetime(active.expires_at) > datetime('now')) AS active_count,
                (SELECT MAX(signal.updated_at) FROM library_checkins signal WHERE signal.area_id = area.id) AS last_signal_at,
                (SELECT COUNT(*) FROM library_checkins signal
                 WHERE signal.area_id = area.id AND datetime(signal.updated_at) >= datetime('now', '-2 hours')) AS recent_signal_count,
                (SELECT viewer.id FROM library_checkins viewer
                 WHERE viewer.area_id = area.id AND viewer.user_email = ? AND viewer.status = 'active'
                   AND datetime(viewer.expires_at) > datetime('now') LIMIT 1) AS viewer_checkin_id,
                (SELECT viewer.expires_at FROM library_checkins viewer
                 WHERE viewer.area_id = area.id AND viewer.user_email = ? AND viewer.status = 'active'
                   AND datetime(viewer.expires_at) > datetime('now') LIMIT 1) AS viewer_expires_at
         FROM library_areas area
         LEFT JOIN campus_places place ON place.id = area.place_id AND place.status = 'active'
         WHERE area.university_id = ? AND area.status = 'active'
         ORDER BY CASE WHEN area.capacity IS NULL THEN 1 ELSE 0 END, area.name, area.floor_label, area.zone_label`,
      ).bind(identity.email, identity.email, profile.university_id).all<AreaRow>(),
      DB.prepare(
        `SELECT id, name FROM campus_places
         WHERE university_id = ? AND status = 'active' AND category IN ('library', 'study')
         ORDER BY name LIMIT 100`,
      ).bind(profile.university_id).all<{ id: string; name: string }>(),
    ]);
    const areas = areasResult.results.map((area) => {
      const capacity = area.capacity === null ? null : Number(area.capacity);
      const activeCount = Number(area.active_count);
      const recentSignalCount = Number(area.recent_signal_count);
      const hasRecentSignal = recentSignalCount > 0;
      return {
        id: area.id, name: area.name, floorLabel: area.floor_label, zoneLabel: area.zone_label, description: area.description,
        capacity, features: parseJsonArray(area.features_json), placeId: area.place_id, placeName: area.place_name,
        latitude: area.latitude, longitude: area.longitude, coordinatesKnown: area.latitude !== null && area.longitude !== null,
        activeCount, recentSignalCount, hasRecentSignal,
        estimatedFreeSeats: capacity !== null && hasRecentSignal ? Math.max(0, capacity - activeCount) : null,
        occupancyPercent: capacity !== null && hasRecentSignal ? Math.min(100, Math.round((activeCount / capacity) * 100)) : null,
        lastSignalTime: area.last_signal_at ? relativeTime(area.last_signal_at) : null,
        viewerCheckin: area.viewer_checkin_id ? { id: area.viewer_checkin_id, expiresAt: area.viewer_expires_at } : null,
        own: area.creator_email === identity.email, updatedTime: relativeTime(area.updated_at),
      };
    });
    const viewerArea = areas.find((area) => area.viewerCheckin) ?? null;
    return Response.json({ areas, places: placesResult.results, viewerActiveAreaId: viewerArea?.id ?? null });
  } catch (error) {
    return unavailableResponse(error, "Kütüphane doluluk bilgisi şu anda getirilemiyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Kütüphane işlemi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 20);
  if (!['area', 'check-in'].includes(action)) return Response.json({ error: "Kütüphane işlemi desteklenmiyor." }, { status: 400 });
  const areaId = cleanText(payload.areaId, 80);
  const name = cleanText(payload.name, 100);
  const floorLabel = cleanText(payload.floorLabel, 60);
  const zoneLabel = cleanText(payload.zoneLabel, 80);
  const description = cleanText(payload.description, 600);
  const placeId = cleanText(payload.placeId, 80);
  const capacity = optionalInteger(payload.capacity);
  const features = allowedFeatures(payload.features);
  const durationMinutes = optionalInteger(payload.durationMinutes);
  if (action === "area") {
    if (name.length < 3 || zoneLabel.length < 2 || description.length < 12 || !features) return Response.json({ error: "Çalışma alanı bilgileri yeterli veya geçerli değil." }, { status: 400 });
    if (Number.isNaN(capacity) || (capacity !== null && (capacity < 1 || capacity > 5000))) return Response.json({ error: "Kapasite 1–5000 arasında olmalı veya bilinmiyorsa boş bırakılmalı." }, { status: 400 });
  }
  if (action === "check-in" && (!areaId || durationMinutes === null || Number.isNaN(durationMinutes) || !durations.has(durationMinutes))) {
    return Response.json({ error: "Check-in süresi 30 dakika ile 3 saat arasındaki seçeneklerden biri olmalı." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const actor = activeActor(DB, identity.email, profile.public_id);
    await expireStaleCheckins(DB);
    const limit = await enforceRateLimit(DB, identity.email, `library-${action}`, action === "area" ? 8 : 20, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (action === "area") {
      if (placeId) {
        const place = await DB.prepare(
          `SELECT id FROM campus_places WHERE id = ? AND university_id = ? AND status = 'active' AND category IN ('library', 'study') LIMIT 1`,
        ).bind(placeId, profile.university_id).first();
        if (!place) return Response.json({ error: "Seçilen kütüphane veya çalışma noktası kampüsünde bulunamadı." }, { status: 404 });
      }
      const duplicate = await DB.prepare(
        `SELECT id FROM library_areas
         WHERE university_id = ? AND status = 'active' AND lower(name) = lower(?)
           AND lower(floor_label) = lower(?) AND lower(zone_label) = lower(?) LIMIT 1`,
      ).bind(profile.university_id, name, floorLabel, zoneLabel).first();
      if (duplicate) return Response.json({ error: "Aynı kütüphane, kat ve bölgeyle aktif bir çalışma alanı zaten var." }, { status: 409 });
      const id = crypto.randomUUID();
      await actor.run(`INSERT INTO library_areas
         (id, university_id, place_id, creator_email, name, floor_label, zone_label, description, capacity, features_json)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ACTIVE_ACTOR_SQL}`, [id, profile.university_id, placeId || null, identity.email, name, floorLabel, zoneLabel, description, capacity, JSON.stringify(features)]);
      await actor.audit("library-area.created", "library-area", id, { capacity, placeId: placeId || null });
      return Response.json({ area: { id, name, floorLabel, zoneLabel, capacity } }, { status: 201 });
    }
    const area = await DB.prepare(
      `SELECT id, name, floor_label, zone_label FROM library_areas
       WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`,
    ).bind(areaId, profile.university_id).first<{ id: string; name: string; floor_label: string; zone_label: string }>();
    if (!area) return Response.json({ error: "Check-in yapılabilecek çalışma alanı bulunamadı." }, { status: 404 });
    const current = await DB.prepare(
      `SELECT checkin.id, area.name, area.floor_label, area.zone_label
       FROM library_checkins checkin JOIN library_areas area ON area.id = checkin.area_id
       WHERE checkin.user_email = ? AND checkin.status = 'active' AND datetime(checkin.expires_at) > datetime('now') LIMIT 1`,
    ).bind(identity.email).first<{ id: string; name: string; floor_label: string; zone_label: string }>();
    if (current) return Response.json({ error: `Önce ${current.name} ${current.floor_label} ${current.zone_label} alanındaki aktif check-in'ini bitirmelisin.` }, { status: 409 });
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + durationMinutes! * 60 * 1000).toISOString();
    try {
      await actor.run(`INSERT INTO library_checkins (id, area_id, user_email, expires_at) SELECT ?, ?, ?, ? WHERE ${ACTIVE_ACTOR_SQL}`, [id, areaId, identity.email, expiresAt]);
    } catch (error) {
    if (error instanceof ActiveActorError) return Response.json({ error: error.message, code: "ACCOUNT_CHANGED" }, { status: 409 });
      const detail = error instanceof Error ? error.message : "";
      if (detail.includes("library_checkins_one_active_user_idx") || detail.includes("library_checkins.user_email")) {
        return Response.json({ error: "Aynı anda yalnız bir çalışma alanında aktif check-in yapabilirsin." }, { status: 409 });
      }
      throw error;
    }
    await actor.audit("library-checkin.created", "library-area", areaId, { checkinId: id, durationMinutes });
    return Response.json({ checkin: { id, areaId, expiresAt } }, { status: 201 });
  } catch (error) {
    if (error instanceof ActiveActorError) return Response.json({ error: error.message, code: "ACCOUNT_CHANGED" }, { status: 409 });
    return unavailableResponse(error, "Kütüphane işlemi şu anda tamamlanamıyor.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Kütüphane güncellemesi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 24);
  const areaId = cleanText(payload.areaId, 80);
  if (!areaId || !["check-out", "archive-area"].includes(action)) return Response.json({ error: "Kütüphane güncellemesi desteklenmiyor." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const actor = activeActor(DB, identity.email, profile.public_id);
    await expireStaleCheckins(DB);
    if (action === "check-out") {
      const checkin = await actor.first<{ id: string }>(`UPDATE library_checkins SET status = 'checked-out', checked_out_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE area_id = ? AND user_email = ? AND status = 'active'
           AND EXISTS (SELECT 1 FROM library_areas area WHERE area.id = library_checkins.area_id AND area.university_id = ? AND area.status = 'active')
         AND ${ACTIVE_ACTOR_SQL} RETURNING id`, [areaId, identity.email, profile.university_id]);
      if (!checkin) return Response.json({ error: "Bitirilebilecek aktif check-in bulunamadı." }, { status: 404 });
      await actor.audit("library-checkin.completed", "library-area", areaId, { checkinId: checkin.id });
      return Response.json({ checkedOut: true, id: checkin.id });
    }
    const area = await actor.first<{ id: string }>(`UPDATE library_areas SET status = 'archived', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND university_id = ? AND creator_email = ? AND status = 'active' AND ${ACTIVE_ACTOR_SQL} RETURNING id`, [areaId, profile.university_id, identity.email]);
    if (!area) return Response.json({ error: "Arşivlenebilecek çalışma alanı bulunamadı." }, { status: 404 });
    await actor.run(`UPDATE library_checkins SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE area_id = ? AND status = 'active' AND ${ACTIVE_ACTOR_SQL}`, [areaId]);
    await actor.audit("library-area.archived", "library-area", areaId);
    return Response.json({ archived: true, id: areaId });
  } catch (error) {
    if (error instanceof ActiveActorError) return Response.json({ error: error.message, code: "ACCOUNT_CHANGED" }, { status: 409 });
    return unavailableResponse(error, "Kütüphane bilgisi şu anda güncellenemiyor.");
  }
}
