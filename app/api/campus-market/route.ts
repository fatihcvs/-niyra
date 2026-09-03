import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  notify,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

const listingKinds = new Set(["sell", "wanted", "free"]);
const listingCategories = new Set(["books", "electronics", "home", "clothing", "sports", "hobby", "transport", "other"]);
const conditions = new Set(["new", "like-new", "used-good", "used-fair", "not-applicable"]);
const priceCategories = new Set(["food", "drink", "printing", "transport", "stationery", "service", "other"]);

function amountToCents(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
}

function freshness(observedAt: string) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 86_400_000));
  if (days <= 14) return { state: "fresh", label: "Güncel gözlem", days };
  if (days <= 30) return { state: "aging", label: "Yakında yenilenmeli", days };
  return { state: "stale", label: "Eski fiyat", days };
}

type PriceRow = { id: string; place_name: string; item_name: string; category: string; price_cents: number; observed_at: string; source_note: string; reporter_email: string };

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüs pazarını görmek için giriş yapmalısın.");
  const url = new URL(request.url);
  const query = cleanText(url.searchParams.get("q"), 80).toLocaleLowerCase("tr-TR");
  const category = cleanText(url.searchParams.get("category"), 24);
  if (category && !listingCategories.has(category) && !priceCategories.has(category)) return Response.json({ error: "Pazar kategorisi geçerli değil." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const [listingsResult, priceResult, inquiriesResult, placesResult] = await Promise.all([
      DB.prepare(
        `SELECT ml.id, ml.kind, ml.category, ml.title, ml.description, ml.price_cents, ml.condition,
                ml.meetup_place, ml.status, ml.owner_email, ml.created_at, ml.updated_at,
                u.public_id AS owner_id, u.display_name AS owner_name,
                (SELECT COUNT(*) FROM marketplace_inquiries mi WHERE mi.listing_id = ml.id AND mi.status = 'open') AS inquiry_count
         FROM marketplace_listings ml JOIN users u ON u.email = ml.owner_email
         WHERE ml.university_id = ? AND ml.status IN ('active', 'reserved')
           AND (? = '' OR ml.category = ?)
           AND (? = '' OR lower(ml.title || ' ' || ml.description || ' ' || ml.meetup_place) LIKE '%' || ? || '%')
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = ml.owner_email) OR (b.blocker_email = ml.owner_email AND b.blocked_email = ?))
         ORDER BY CASE ml.status WHEN 'active' THEN 0 ELSE 1 END, ml.created_at DESC LIMIT 120`,
      ).bind(profile.university_id, category, category, query, query, identity.email, identity.email).all<{
        id: string; kind: string; category: string; title: string; description: string; price_cents: number | null; condition: string;
        meetup_place: string; status: string; owner_email: string; owner_id: string; owner_name: string; created_at: string; updated_at: string; inquiry_count: number;
      }>(),
      DB.prepare(
        `SELECT id, place_name, item_name, category, price_cents, observed_at, source_note, reporter_email
         FROM campus_price_reports
         WHERE university_id = ? AND status = 'active' AND datetime(observed_at) >= datetime('now', '-180 days')
           AND (? = '' OR category = ?)
           AND (? = '' OR lower(place_name || ' ' || item_name || ' ' || source_note) LIKE '%' || ? || '%')
         ORDER BY datetime(observed_at) DESC LIMIT 500`,
      ).bind(profile.university_id, category, category, query, query).all<PriceRow>(),
      DB.prepare(
        `SELECT mi.id, mi.listing_id, mi.sender_email, mi.message, mi.status, mi.created_at,
                ml.title AS listing_title, ml.owner_email, sender.public_id AS sender_id, sender.display_name AS sender_name
         FROM marketplace_inquiries mi
         JOIN marketplace_listings ml ON ml.id = mi.listing_id
         JOIN users sender ON sender.email = mi.sender_email
         WHERE ml.university_id = ? AND (mi.sender_email = ? OR ml.owner_email = ?)
         ORDER BY CASE mi.status WHEN 'open' THEN 0 ELSE 1 END, mi.created_at DESC LIMIT 100`,
      ).bind(profile.university_id, identity.email, identity.email).all<{
        id: string; listing_id: string; sender_email: string; message: string; status: string; created_at: string;
        listing_title: string; owner_email: string; sender_id: string; sender_name: string;
      }>(),
      DB.prepare(`SELECT id, name FROM campus_places WHERE university_id = ? AND status = 'active' ORDER BY name LIMIT 100`).bind(profile.university_id).all<{ id: string; name: string }>(),
    ]);
    const grouped = new Map<string, PriceRow[]>();
    for (const report of priceResult.results) {
      const key = `${report.place_name.toLocaleLowerCase("tr-TR")}::${report.item_name.toLocaleLowerCase("tr-TR")}`;
      grouped.set(key, [...(grouped.get(key) ?? []), report]);
    }
    const prices = [...grouped.values()].map((reports) => {
      const latest = reports[0];
      const values = reports.map((report) => report.price_cents);
      return {
        id: latest.id, placeName: latest.place_name, itemName: latest.item_name, category: latest.category,
        latestPriceCents: latest.price_cents, minPriceCents: Math.min(...values), maxPriceCents: Math.max(...values),
        averagePriceCents: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), sampleCount: values.length,
        observedAt: latest.observed_at, sourceNote: latest.source_note, freshness: freshness(latest.observed_at), own: latest.reporter_email === identity.email,
      };
    });
    return Response.json({
      listings: listingsResult.results.map((listing) => ({
        id: listing.id, kind: listing.kind, category: listing.category, title: listing.title, description: listing.description,
        priceCents: listing.price_cents, condition: listing.condition, meetupPlace: listing.meetup_place, status: listing.status,
        ownerId: listing.owner_id, ownerName: listing.owner_name, own: listing.owner_email === identity.email,
        inquiryCount: Number(listing.inquiry_count), time: relativeTime(listing.created_at), updatedTime: relativeTime(listing.updated_at),
      })),
      prices,
      inquiries: inquiriesResult.results.map((item) => ({
        id: item.id, listingId: item.listing_id, listingTitle: item.listing_title, message: item.message, status: item.status,
        direction: item.owner_email === identity.email ? "incoming" : "outgoing", otherId: item.owner_email === identity.email ? item.sender_id : null,
        otherName: item.owner_email === identity.email ? item.sender_name : "İlan sahibi", time: relativeTime(item.created_at),
      })),
      places: placesResult.results,
    });
  } catch (error) {
    return unavailableResponse(error, "Kampüs pazarı şu anda getirilemiyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Pazar kaydı geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 20);
  if (!["listing", "inquiry", "price"].includes(action)) return Response.json({ error: "Pazar işlemi desteklenmiyor." }, { status: 400 });
  const kind = cleanText(payload.kind, 20);
  const category = cleanText(payload.category, 24);
  const title = cleanText(payload.title, 100);
  const description = cleanText(payload.description, 900);
  const condition = cleanText(payload.condition, 24);
  const meetupPlace = cleanText(payload.meetupPlace, 100);
  const priceCents = amountToCents(payload.price);
  const listingId = cleanText(payload.listingId, 80);
  const message = cleanText(payload.message, 500);
  const placeId = cleanText(payload.placeId, 80);
  const placeName = cleanText(payload.placeName, 100);
  const itemName = cleanText(payload.itemName, 100);
  const sourceNote = cleanText(payload.sourceNote, 240);
  const observedAtInput = cleanText(payload.observedAt, 40);
  if (action === "listing") {
    if (!listingKinds.has(kind) || !listingCategories.has(category) || !conditions.has(condition) || title.length < 3 || description.length < 12) return Response.json({ error: "İlan bilgileri yeterli veya geçerli değil." }, { status: 400 });
    if (kind === "sell" && (priceCents === null || Number.isNaN(priceCents) || priceCents < 0 || priceCents > 1_000_000_000)) return Response.json({ error: "Satılık ilan fiyatı geçerli değil." }, { status: 400 });
    if (kind === "free" && priceCents !== null && priceCents !== 0) return Response.json({ error: "Ücretsiz ilan fiyat içeremez." }, { status: 400 });
  }
  if (action === "inquiry" && (!listingId || message.length < 8)) return Response.json({ error: "İletişim mesajı en az 8 karakter olmalı." }, { status: 400 });
  let observedAt: string | null = null;
  if (action === "price") {
    const observedTimestamp = Date.parse(observedAtInput);
    if (!priceCategories.has(category) || placeName.length < 2 || itemName.length < 2 || sourceNote.length < 5 || priceCents === null || Number.isNaN(priceCents) || priceCents < 0 || priceCents > 100_000_000) return Response.json({ error: "Fiyat gözlemi bilgileri geçerli değil." }, { status: 400 });
    if (!Number.isFinite(observedTimestamp) || observedTimestamp > Date.now() + 24 * 60 * 60 * 1000 || observedTimestamp < Date.now() - 180 * 24 * 60 * 60 * 1000) return Response.json({ error: "Gözlem tarihi son 180 gün içinde olmalı." }, { status: 400 });
    observedAt = new Date(observedTimestamp).toISOString();
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, `campus-market-${action}`, action === "inquiry" ? 30 : 12, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (action === "listing") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO marketplace_listings (id, university_id, owner_email, kind, category, title, description, price_cents, condition, meetup_place)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, profile.university_id, identity.email, kind, category, title, description, kind === "free" ? 0 : priceCents, condition, meetupPlace).run();
      await audit(DB, identity.email, "market-listing.created", "listing", id, { kind, category });
      return Response.json({ listing: { id, title, status: "active" } }, { status: 201 });
    }
    if (action === "inquiry") {
      const listing = await DB.prepare(
        `SELECT ml.id, ml.owner_email, ml.title FROM marketplace_listings ml
         WHERE ml.id = ? AND ml.university_id = ? AND ml.owner_email <> ? AND ml.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = ml.owner_email) OR (b.blocker_email = ml.owner_email AND b.blocked_email = ?)) LIMIT 1`,
      ).bind(listingId, profile.university_id, identity.email, identity.email, identity.email).first<{ id: string; owner_email: string; title: string }>();
      if (!listing) return Response.json({ error: "İletişime açık ilan bulunamadı." }, { status: 404 });
      const duplicate = await DB.prepare(`SELECT id FROM marketplace_inquiries WHERE listing_id = ? AND sender_email = ? AND status = 'open' LIMIT 1`).bind(listingId, identity.email).first();
      if (duplicate) return Response.json({ error: "Bu ilan için açık bir mesajın zaten var." }, { status: 409 });
      const id = crypto.randomUUID();
      await DB.prepare(`INSERT INTO marketplace_inquiries (id, listing_id, sender_email, message) VALUES (?, ?, ?, ?)`).bind(id, listingId, identity.email, message).run();
      await Promise.all([
        notify(DB, { userEmail: listing.owner_email, actorEmail: identity.email, kind: "community", title: "İlanına yeni mesaj", body: `${listing.title} ilanına bir öğrenci mesaj gönderdi.`, entityType: "listing", entityId: listingId }),
        audit(DB, identity.email, "market-inquiry.created", "listing", listingId, { inquiryId: id }),
      ]);
      return Response.json({ inquiry: { id, status: "open" } }, { status: 201 });
    }
    if (placeId) {
      const place = await DB.prepare(`SELECT name FROM campus_places WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`).bind(placeId, profile.university_id).first<{ name: string }>();
      if (!place) return Response.json({ error: "Fiyat mekânı kampüsünde bulunamadı." }, { status: 404 });
      if (place.name.toLocaleLowerCase("tr-TR") !== placeName.toLocaleLowerCase("tr-TR")) return Response.json({ error: "Mekân adı seçilen kampüs noktasıyla eşleşmiyor." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO campus_price_reports (id, university_id, reporter_email, place_id, place_name, item_name, category, price_cents, observed_at, source_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, profile.university_id, identity.email, placeId || null, placeName, itemName, category, priceCents, observedAt, sourceNote).run();
    await audit(DB, identity.email, "campus-price.created", "price", id, { category, priceCents });
    return Response.json({ price: { id, placeName, itemName, priceCents, observedAt } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Kampüs pazarı kaydı şu anda oluşturulamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Pazar güncellemesi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 24);
  const id = cleanText(payload.id, 80);
  const status = cleanText(payload.status, 20);
  if (!id || !["listing-status", "inquiry-status", "archive-price"].includes(action)) return Response.json({ error: "Pazar güncellemesi desteklenmiyor." }, { status: 400 });
  if (action === "listing-status" && !["active", "reserved", "sold", "closed"].includes(status)) return Response.json({ error: "İlan durumu geçerli değil." }, { status: 400 });
  if (action === "inquiry-status" && !["accepted", "declined", "cancelled"].includes(status)) return Response.json({ error: "Mesaj durumu geçerli değil." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    if (action === "listing-status") {
      const updated = await DB.prepare(`UPDATE marketplace_listings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND university_id = ? AND owner_email = ? RETURNING id`).bind(status, id, profile.university_id, identity.email).first();
      if (!updated) return Response.json({ error: "Güncellenecek ilan bulunamadı." }, { status: 404 });
      await audit(DB, identity.email, "market-listing.status", "listing", id, { status });
      return Response.json({ status });
    }
    if (action === "inquiry-status") {
      const inquiry = await DB.prepare(
        `SELECT mi.sender_email, ml.owner_email FROM marketplace_inquiries mi JOIN marketplace_listings ml ON ml.id = mi.listing_id
         WHERE mi.id = ? AND ml.university_id = ? AND mi.status = 'open' LIMIT 1`,
      ).bind(id, profile.university_id).first<{ sender_email: string; owner_email: string }>();
      if (!inquiry || (status === "cancelled" ? inquiry.sender_email !== identity.email : inquiry.owner_email !== identity.email)) return Response.json({ error: "Yanıtlanabilecek mesaj bulunamadı." }, { status: 404 });
      await DB.prepare(`UPDATE marketplace_inquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(status, id).run();
      await audit(DB, identity.email, "market-inquiry.status", "inquiry", id, { status });
      return Response.json({ status });
    }
    const archived = await DB.prepare(`UPDATE campus_price_reports SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND university_id = ? AND reporter_email = ? AND status = 'active' RETURNING id`).bind(id, profile.university_id, identity.email).first();
    if (!archived) return Response.json({ error: "Arşivlenecek fiyat gözlemi bulunamadı." }, { status: 404 });
    await audit(DB, identity.email, "campus-price.archived", "price", id);
    return Response.json({ archived: true });
  } catch (error) {
    return unavailableResponse(error, "Kampüs pazarı şu anda güncellenemedi.");
  }
}
