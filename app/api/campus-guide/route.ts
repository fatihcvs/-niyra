import {
  audit,
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
import { getCuratedCampusPlaces } from "../../../lib/campus-place-catalog";
import { getBooleanPlatformSetting } from "../../../lib/platform-settings";

const placeCategories = new Set(["building", "library", "food", "study", "sports", "social", "transport", "health", "housing", "other", "area"]);
const eventCategories = new Set(["academic", "social", "sports", "culture", "career", "volunteering", "other"]);
const accessibilityOptions = new Set(["step-free", "elevator", "accessible-toilet", "quiet", "power", "wifi"]);

function allowedArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const items = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => accessibilityOptions.has(item)))];
  return items.length === value.length && items.length <= 6 ? items : null;
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function dayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function stableIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return Math.abs(hash >>> 0) % length;
}

type PlaceRow = {
  id: string; name: string; category: string; description: string; address: string; latitude: number | null; longitude: number | null;
  accessibility_json: string; opening_hours: string; verified_at: string | null; created_at: string; updated_at: string;
  creator_email: string; current_count: number; needs_update_count: number; viewer_state: string | null;
};

type EventRow = {
  id: string; title: string; description: string; category: string; starts_at: string; ends_at: string | null;
  place_id: string | null; place_name: string | null; creator_email: string; created_at: string;
};

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüs rehberini görmek için giriş yapmalısın.");
  const url = new URL(request.url);
  const category = cleanText(url.searchParams.get("category"), 24);
  const query = cleanText(url.searchParams.get("q"), 80).toLocaleLowerCase("tr-TR");
  if (category && !placeCategories.has(category)) return Response.json({ error: "Mekân kategorisi geçerli değil." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const [placesResult, eventsResult, social] = await Promise.all([
      DB.prepare(
        `SELECT cp.id, cp.name, cp.category, cp.description, cp.address, cp.latitude, cp.longitude,
                cp.accessibility_json, cp.opening_hours, cp.verified_at, cp.created_at, cp.updated_at, cp.creator_email,
                COALESCE(SUM(CASE WHEN cpc.state = 'current' THEN 1 ELSE 0 END), 0) AS current_count,
                COALESCE(SUM(CASE WHEN cpc.state = 'needs-update' THEN 1 ELSE 0 END), 0) AS needs_update_count,
                MAX(CASE WHEN cpc.user_email = ? THEN cpc.state ELSE NULL END) AS viewer_state
         FROM campus_places cp
         LEFT JOIN campus_place_confirmations cpc ON cpc.place_id = cp.id
         WHERE cp.university_id = ? AND cp.status = 'active'
           AND (? = '' OR cp.category = ?)
           AND (? = '' OR lower(cp.name || ' ' || cp.description || ' ' || cp.address) LIKE '%' || ? || '%')
         GROUP BY cp.id
         ORDER BY CASE WHEN cp.verified_at IS NULL THEN 1 ELSE 0 END, cp.verified_at DESC, cp.updated_at DESC
         LIMIT 120`,
      ).bind(identity.email, profile.university_id, category, category, query, query).all<PlaceRow>(),
      DB.prepare(
        `SELECT ce.id, ce.title, ce.description, ce.category, ce.starts_at, ce.ends_at,
                ce.place_id, cp.name AS place_name, ce.creator_email, ce.created_at
         FROM campus_events ce
         LEFT JOIN campus_places cp ON cp.id = ce.place_id AND cp.status = 'active'
         WHERE ce.university_id = ? AND ce.status = 'active'
           AND datetime(ce.starts_at) >= datetime('now', '-6 hours')
           AND datetime(ce.starts_at) <= datetime('now', '+45 days')
         ORDER BY datetime(ce.starts_at), ce.created_at
         LIMIT 100`,
      ).bind(profile.university_id).all<EventRow>(),
      DB.prepare(`SELECT interests_json FROM student_social_profiles WHERE user_email = ? LIMIT 1`).bind(identity.email).first<{ interests_json: string }>(),
    ]);
    const communityPlaces = placesResult.results.map((place) => ({
      id: place.id, name: place.name, category: place.category, description: place.description, address: place.address,
      latitude: place.latitude, longitude: place.longitude, coordinatesKnown: place.latitude !== null && place.longitude !== null,
      accessibility: parseJsonArray(place.accessibility_json), openingHours: place.opening_hours,
      currentCount: Number(place.current_count), needsUpdateCount: Number(place.needs_update_count), viewerState: place.viewer_state,
      verification: place.verified_at ? { label: "Toplulukça güncel", time: relativeTime(place.verified_at) } : { label: "Henüz doğrulanmadı", time: null },
      own: place.creator_email === identity.email, updatedTime: relativeTime(place.updated_at),
      curated: false, campusName: "", distanceMeters: null, source: null,
    }));
    const curatedPlaces = getCuratedCampusPlaces(profile.university_id, { category, query });
    const places = [...communityPlaces, ...curatedPlaces];
    const events = eventsResult.results.map((event) => ({
      id: event.id, title: event.title, description: event.description, category: event.category,
      startsAt: event.starts_at, endsAt: event.ends_at, placeId: event.place_id, placeName: event.place_name,
      own: event.creator_email === identity.email, time: relativeTime(event.created_at),
    }));
    const interests = new Set(parseJsonArray(social?.interests_json));
    const eventCandidates = events.filter((event) => interests.has(event.category) || (event.category === "culture" && (interests.has("art") || interests.has("music") || interests.has("cinema"))));
    const suggestionPool: Array<Record<string, unknown>> = eventCandidates.length
      ? eventCandidates.map((event) => ({ type: "event", ...event, reason: "İlgi alanlarınla eşleşen yaklaşan kampüs etkinliği" }))
      : events.length
        ? events.map((event) => ({ type: "event", ...event, reason: "Kampüsündeki yaklaşan etkinliklerden bugünün seçimi" }))
        : places.map((place) => ({
          type: "place",
          ...place,
          reason: place.verification.label === "Toplulukça güncel"
            ? "Öğrencilerin güncel olduğunu doğruladığı kampüs noktası"
            : place.source?.type === "official-university"
              ? "Resmî kurum kaynağında yayımlanan kampüs noktası"
              : place.source?.type === "openstreetmap"
                ? "Kampüs çevresindeki açık harita kayıtlarından bugünün seçimi"
                : "Kampüsünü keşfetmek için bugünün önerisi",
        }));
    const suggestion = suggestionPool.length ? suggestionPool[stableIndex(`${profile.university_id}:${identity.email}:${dayKey()}`, suggestionPool.length)] : null;
    return Response.json({ places, events, suggestion: suggestion ? { day: dayKey(), ...suggestion } : null });
  } catch (error) {
    console.error("[campus-guide] read failed", error);
    return unavailableResponse(error, "Kampüs rehberi şu anda getirilemiyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Kampüs rehberi bilgisi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 20);
  if (!["place", "event"].includes(action)) return Response.json({ error: "Kampüs rehberi işlemi desteklenmiyor." }, { status: 400 });
  const name = cleanText(payload.name, 100);
  const description = cleanText(payload.description, 700);
  const category = cleanText(payload.category, 24);
  const address = cleanText(payload.address, 180);
  const openingHours = cleanText(payload.openingHours, 120);
  const latitude = numberOrNull(payload.latitude);
  const longitude = numberOrNull(payload.longitude);
  const accessibility = allowedArray(payload.accessibility);
  const startsAtInput = cleanText(payload.startsAt, 40);
  const endsAtInput = cleanText(payload.endsAt, 40);
  const placeId = cleanText(payload.placeId, 80);
  if (name.length < 3 || description.length < 12) return Response.json({ error: "Ad ve açıklama yeterince ayrıntılı değil." }, { status: 400 });
  if (action === "place") {
    if (!placeCategories.has(category) || !accessibility) return Response.json({ error: "Mekân kategorisi veya erişilebilirlik bilgisi geçerli değil." }, { status: 400 });
    if ((latitude === null) !== (longitude === null) || Number.isNaN(latitude) || Number.isNaN(longitude) || (latitude !== null && (latitude < -90 || latitude > 90 || longitude! < -180 || longitude! > 180))) {
      return Response.json({ error: "Koordinatlar birlikte ve geçerli aralıkta girilmeli." }, { status: 400 });
    }
  }
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (action === "event") {
    if (!eventCategories.has(category)) return Response.json({ error: "Etkinlik kategorisi geçerli değil." }, { status: 400 });
    const startTimestamp = Date.parse(startsAtInput);
    const endTimestamp = endsAtInput ? Date.parse(endsAtInput) : Number.NaN;
    if (!Number.isFinite(startTimestamp) || startTimestamp < Date.now() - 6 * 60 * 60 * 1000 || startTimestamp > Date.now() + 180 * 24 * 60 * 60 * 1000) return Response.json({ error: "Etkinlik tarihi önümüzdeki 180 gün içinde olmalı." }, { status: 400 });
    if (endsAtInput && (!Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp)) return Response.json({ error: "Etkinlik bitişi başlangıçtan sonra olmalı." }, { status: 400 });
    startsAt = new Date(startTimestamp).toISOString();
    endsAt = endsAtInput ? new Date(endTimestamp).toISOString() : null;
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    if (action === "place" && category === "housing" && !(await getBooleanPlatformSetting(DB, "housingContributionsOpen"))) {
      return Response.json({ error: "Yurt ve konaklama katkıları owner tarafından geçici olarak durduruldu." }, { status: 503 });
    }
    const limit = await enforceRateLimit(DB, identity.email, `campus-guide-${action}`, action === "place" ? 8 : 12, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (action === "place") {
      const duplicate = await DB.prepare(`SELECT id FROM campus_places WHERE university_id = ? AND status = 'active' AND lower(name) = lower(?) LIMIT 1`).bind(profile.university_id, name).first();
      if (duplicate) return Response.json({ error: "Bu adla aktif bir kampüs noktası zaten var." }, { status: 409 });
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO campus_places
         (id, university_id, creator_email, name, category, description, address, latitude, longitude, accessibility_json, opening_hours)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, profile.university_id, identity.email, name, category, description, address, latitude, longitude, JSON.stringify(accessibility), openingHours).run();
      await audit(DB, identity.email, "campus-place.created", "place", id, { category, coordinatesKnown: latitude !== null });
      return Response.json({ place: { id, name, category } }, { status: 201 });
    }
    if (placeId) {
      const place = await DB.prepare(`SELECT id FROM campus_places WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`).bind(placeId, profile.university_id).first();
      if (!place) return Response.json({ error: "Etkinlik mekânı kampüsünde bulunamadı." }, { status: 404 });
    }
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO campus_events (id, university_id, creator_email, place_id, title, description, category, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, profile.university_id, identity.email, placeId || null, name, description, category, startsAt, endsAt).run();
    await audit(DB, identity.email, "campus-event.created", "event", id, { category, placeId: placeId || null });
    return Response.json({ event: { id, title: name, category, startsAt } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Kampüs rehberi kaydı şu anda oluşturulamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Kampüs güncellemesi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 20);
  const id = cleanText(payload.id, 80);
  if (!id || !["confirm", "archive-place", "archive-event"].includes(action)) return Response.json({ error: "Kampüs güncellemesi desteklenmiyor." }, { status: 400 });
  const state = cleanText(payload.state, 20);
  if (action === "confirm" && !["current", "needs-update"].includes(state)) return Response.json({ error: "Güncellik seçimi geçerli değil." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    if (action === "confirm") {
      const place = await DB.prepare(`SELECT id FROM campus_places WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`).bind(id, profile.university_id).first();
      if (!place) return Response.json({ error: "Kampüs noktası bulunamadı." }, { status: 404 });
      await DB.prepare(
        `INSERT INTO campus_place_confirmations (place_id, user_email, state) VALUES (?, ?, ?)
         ON CONFLICT(place_id, user_email) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP`,
      ).bind(id, identity.email, state).run();
      const counts = await DB.prepare(
        `SELECT SUM(CASE WHEN state = 'current' THEN 1 ELSE 0 END) AS current_count,
                SUM(CASE WHEN state = 'needs-update' THEN 1 ELSE 0 END) AS needs_update_count
         FROM campus_place_confirmations WHERE place_id = ?`,
      ).bind(id).first<{ current_count: number | null; needs_update_count: number | null }>();
      if (Number(counts?.current_count ?? 0) >= 2) await DB.prepare(`UPDATE campus_places SET verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
      await audit(DB, identity.email, "campus-place.confirmed", "place", id, { state });
      return Response.json({ state, currentCount: Number(counts?.current_count ?? 0), needsUpdateCount: Number(counts?.needs_update_count ?? 0) });
    }
    const table = action === "archive-place" ? "campus_places" : "campus_events";
    const archived = await DB.prepare(`UPDATE ${table} SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND university_id = ? AND creator_email = ? AND status = 'active' RETURNING id`).bind(id, profile.university_id, identity.email).first();
    if (!archived) return Response.json({ error: "Arşivlenebilecek kayıt bulunamadı." }, { status: 404 });
    await audit(DB, identity.email, action === "archive-place" ? "campus-place.archived" : "campus-event.archived", action === "archive-place" ? "place" : "event", id);
    return Response.json({ archived: true });
  } catch (error) {
    return unavailableResponse(error, "Kampüs rehberi şu anda güncellenemedi.");
  }
}
