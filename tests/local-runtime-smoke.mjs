import assert from "node:assert/strict";

const baseUrl = process.env.UNIYRA_BASE_URL ?? "http://localhost:5173";
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const ownerEmail = `runtime.owner.${runId}@omu.edu.tr`;
const peerEmail = `runtime.peer.${runId}@omu.edu.tr`;
const otherCampusEmail = `runtime.campus.${runId}@bogazici.edu.tr`;
const testPassword = `UniyraMvp${runId}!`;
const sessionCookies = new Map();

function headers(email, json = false) {
  const value = new Headers();
  const cookie = sessionCookies.get(email);
  if (cookie) value.set("cookie", cookie);
  if (json) value.set("content-type", "application/json");
  return value;
}

function storeSession(email, response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `Session cookie missing for ${email}`);
  sessionCookies.set(email, setCookie.split(";", 1)[0]);
}

async function register(email, displayName) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, displayName, password: testPassword }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, `Registration failed (${response.status}): ${body.error ?? JSON.stringify(body)}`);
  assert.equal(body.approvalRequired, false);
  storeSession(email, response);
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: testPassword }),
  });
  const body = await response.json();
  assert.ok(response.ok, `Login failed (${response.status}): ${body.error ?? JSON.stringify(body)}`);
  storeSession(email, response);
}

async function json(path, init = {}, email = ownerEmail) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: headers(email, Boolean(init.body) && !(init.body instanceof FormData)) });
  const body = await response.json();
  assert.ok(response.ok, `${init.method ?? "GET"} ${path} failed (${response.status}): ${body.error ?? JSON.stringify(body)}`);
  return { response, body };
}

async function createProfile(email) {
  return json("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      universityId: "omu",
      facultyId: "muhendislik",
      departmentId: "bilgisayar",
      classYear: 3,
      courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"],
    }),
  }, email);
}

async function createOtherCampusProfile() {
  return json("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      universityId: "tr-bogazici-universitesi",
      facultyName: "Mühendislik Fakültesi",
      departmentName: "Bilgisayar Mühendisliği",
      classYear: 2,
      customCourses: [
        { code: "CMPE 101", name: "Bilgisayar Mühendisliğine Giriş" },
        { code: "MATH 101", name: "Analiz I" },
        { code: "PHYS 101", name: "Fizik I" },
      ],
    }),
  }, otherCampusEmail);
}

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200);
const healthBody = await health.json();
assert.equal(healthBody.storage, "configured");
assert.equal(healthBody.version, "1.6.24");

const spoofedIdentity = await fetch(`${baseUrl}/api/profile`, {
  headers: {
    "oai-authenticated-user-id": "spoofed-user",
    "oai-authenticated-user-email": "spoofed@omu.edu.tr",
  },
});
assert.equal(spoofedIdentity.status, 401);

await register(ownerEmail, "Runtime Owner");
await register(peerEmail, "Runtime Peer");
await register(otherCampusEmail, "Runtime Campus");

const owner = (await createProfile(ownerEmail)).body.profile;
const peer = (await createProfile(peerEmail)).body.profile;
const otherCampus = (await createOtherCampusProfile()).body.profile;
assert.equal(owner.courses.length, 3);
assert.equal(peer.courses.length, 3);
assert.equal(otherCampus.universityName, "Boğaziçi Üniversitesi");
assert.equal(otherCampus.courses.length, 3);

const updatedOwner = (await json("/api/profile", {
  method: "PUT",
  body: JSON.stringify({
    displayName: "Runtime Owner Updated",
    universityId: "omu",
    facultyId: "muhendislik",
    departmentId: "bilgisayar",
    classYear: 4,
    courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"],
  }),
})).body.profile;
assert.equal(updatedOwner.publicId, owner.publicId);
assert.equal(updatedOwner.displayName, "Runtime Owner Updated");
assert.equal(updatedOwner.classYear, 4);
const refreshedOwner = (await json("/api/profile")).body.profile;
assert.equal(refreshedOwner.displayName, "Runtime Owner Updated");
assert.equal(refreshedOwner.classYear, 4);

const logout = await fetch(`${baseUrl}/api/auth/session`, { method: "DELETE", headers: headers(otherCampusEmail) });
assert.equal(logout.status, 200);
sessionCookies.delete(otherCampusEmail);
assert.equal((await fetch(`${baseUrl}/api/profile`, { headers: headers(otherCampusEmail) })).status, 401);
await login(otherCampusEmail);

const isolatedPeople = (await json(`/api/people?q=${encodeURIComponent("Runtime")}`)).body.people;
assert.ok(!isolatedPeople.some((item) => item.publicId === otherCampus.publicId));
const crossCampusFollow = await fetch(`${baseUrl}/api/follows`, {
  method: "POST",
  headers: headers(ownerEmail, true),
  body: JSON.stringify({ targetId: otherCampus.publicId }),
});
assert.equal(crossCampusFollow.status, 403);

const otherCampusPost = (await json("/api/posts", {
  method: "POST",
  body: JSON.stringify({ content: `Diğer kampüs gönderisi ${runId}`, courseId: otherCampus.courses[0].id }),
}, otherCampusEmail)).body.post;
const ownerCampusFeed = (await json("/api/posts?feed=campus")).body.posts;
assert.ok(!ownerCampusFeed.some((item) => item.id === otherCampusPost.id));

const otherCampusPulse = (await json("/api/campus-pulse", {
  method: "POST",
  body: JSON.stringify({ kind: "live", category: "transport", content: `Diğer kampüs servis bilgisi ${runId}`, campusZone: "Kuzey durak", durationHours: 3 }),
}, otherCampusEmail)).body.item;
const isolatedPulse = (await json("/api/campus-pulse?kind=live")).body.items;
assert.ok(!isolatedPulse.some((item) => item.id === otherCampusPulse.id));

const livePulse = (await json("/api/campus-pulse", {
  method: "POST",
  body: JSON.stringify({ kind: "live", category: "food", content: `Merkez yemekhane sırası hızlı ilerliyor #yemekhane ${runId}`, campusZone: "Merkez yemekhane", durationHours: 3 }),
})).body.item;
const pulseImageForm = new FormData();
pulseImageForm.set("kind", "live");
pulseImageForm.set("category", "event");
pulseImageForm.set("content", `Kampüs meydanındaki etkinlik görselle paylaşıldı ${runId}`);
pulseImageForm.set("campusZone", "Merkez kampüs meydanı");
pulseImageForm.set("durationHours", "3");
pulseImageForm.set("image", new File([
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
], `campus-${runId}.png`, { type: "image/png" }));
const visualPulse = (await json("/api/campus-pulse", { method: "POST", body: pulseImageForm })).body.item;
assert.equal(visualPulse.imageUrl, `/api/campus-pulse/image?id=${visualPulse.id}`);
const confession = (await json("/api/campus-pulse", {
  method: "POST",
  body: JSON.stringify({ kind: "confession", category: "social", content: `Bu hafta yetişemediğimi hissediyorum ${runId}` }),
})).body.item;
const livePulseFeed = (await json("/api/campus-pulse?kind=live")).body;
assert.ok(livePulseFeed.items.some((item) => item.id === livePulse.id));
assert.equal(livePulseFeed.items.find((item) => item.id === visualPulse.id)?.imageUrl, visualPulse.imageUrl);
assert.ok(livePulseFeed.topics.some((item) => item.topic === "#yemekhane"));
const visualPulseImage = await fetch(`${baseUrl}${visualPulse.imageUrl}`, { headers: headers(ownerEmail) });
assert.equal(visualPulseImage.status, 200);
assert.equal(visualPulseImage.headers.get("content-type"), "image/png");
assert.ok((await visualPulseImage.arrayBuffer()).byteLength > 0);
const isolatedPulseImage = await fetch(`${baseUrl}${visualPulse.imageUrl}`, { headers: headers(otherCampusEmail) });
assert.equal(isolatedPulseImage.status, 404);
const confessionFeed = (await json("/api/campus-pulse?kind=confession", {}, peerEmail)).body.items;
const anonymousItem = confessionFeed.find((item) => item.id === confession.id);
assert.equal(anonymousItem.authorName, "Anonim öğrenci");
assert.equal(anonymousItem.authorId, null);
const pulseReaction = (await json("/api/campus-pulse", {
  method: "PATCH",
  body: JSON.stringify({ action: "react", id: livePulse.id, reaction: "confirm" }),
}, peerEmail)).body;
assert.equal(pulseReaction.confirmCount, 1);
const pulseReport = await fetch(`${baseUrl}/api/safety`, {
  method: "POST",
  headers: headers(peerEmail, true),
  body: JSON.stringify({ action: "report", entityType: "pulse", entityId: confession.id, reason: "other", details: "Otomatik anonim paylaşım moderasyon kanıtı kontrolü." }),
});
assert.equal(pulseReport.status, 201);

await json("/api/social-match", {
  method: "POST",
  body: JSON.stringify({ action: "save-profile", interests: ["technology", "gaming", "books"], intents: ["coffee", "project"], bio: "Kampüste teknoloji projeleri ve kahve sohbetleri.", availability: "week", discoverable: true }),
});
await json("/api/social-match", {
  method: "POST",
  body: JSON.stringify({ action: "save-profile", interests: ["technology", "gaming", "sports"], intents: ["coffee", "gaming"], bio: "Ortak oyun ve teknoloji etkinlikleri arıyorum.", availability: "today", discoverable: true }),
}, peerEmail);
await json("/api/social-match", {
  method: "POST",
  body: JSON.stringify({ action: "save-profile", interests: ["technology", "gaming"], intents: ["coffee"], bio: "Diğer kampüs eşleşme izolasyonu.", availability: "now", discoverable: true }),
}, otherCampusEmail);
const socialMatches = (await json("/api/social-match")).body.matches;
assert.ok(socialMatches.some((item) => item.publicId === peer.publicId && item.score > 0));
assert.ok(!socialMatches.some((item) => item.publicId === otherCampus.publicId));
const meetup = (await json("/api/social-match", {
  method: "POST",
  body: JSON.stringify({ action: "request", targetPublicId: peer.publicId, activity: "coffee", message: "Merkez kütüphane önünde bir kahve içelim mi?", campusPlace: "Merkez kütüphane" }),
})).body.request;
const incomingMeetups = (await json("/api/social-match", {}, peerEmail)).body.requests;
assert.ok(incomingMeetups.some((item) => item.id === meetup.id && item.direction === "incoming"));
const acceptedMeetup = (await json("/api/social-match", {
  method: "PATCH",
  body: JSON.stringify({ id: meetup.id, decision: "accepted" }),
}, peerEmail)).body;
assert.equal(acceptedMeetup.status, "accepted");
const meetupReport = await fetch(`${baseUrl}/api/safety`, {
  method: "POST",
  headers: headers(peerEmail, true),
  body: JSON.stringify({ action: "report", entityType: "meetup", entityId: meetup.id, reason: "other", details: "Otomatik buluşma güvenlik kanıtı kontrolü." }),
});
assert.equal(meetupReport.status, 201);

const otherCampusPlace = (await json("/api/campus-guide", {
  method: "POST",
  body: JSON.stringify({ action: "place", name: `Kuzey Çalışma Alanı ${runId}`, category: "study", description: "Diğer kampüs izolasyonu için çalışma alanı.", address: "Kuzey kampüs", latitude: 41.084, longitude: 29.052, openingHours: "Hafta içi 09.00–18.00", accessibility: ["wifi"] }),
}, otherCampusEmail)).body.place;
const campusPlace = (await json("/api/campus-guide", {
  method: "POST",
  body: JSON.stringify({ action: "place", name: `Merkez Kütüphane ${runId}`, category: "library", description: "Sessiz çalışma salonu, grup odaları ve prizli masalar.", address: "Merkez kampüs", latitude: 41.365, longitude: 36.193, openingHours: "Hafta içi 08.00–22.00", accessibility: ["step-free", "quiet", "power", "wifi"] }),
})).body.place;
const isolatedPlaces = (await json("/api/campus-guide")).body.places;
assert.ok(isolatedPlaces.some((item) => item.id === campusPlace.id));
assert.ok(!isolatedPlaces.some((item) => item.id === otherCampusPlace.id));
await json("/api/campus-guide", { method: "PATCH", body: JSON.stringify({ action: "confirm", id: campusPlace.id, state: "current" }) });
await json("/api/campus-guide", { method: "PATCH", body: JSON.stringify({ action: "confirm", id: campusPlace.id, state: "current" }) }, peerEmail);
const verifiedPlace = (await json("/api/campus-guide")).body.places.find((item) => item.id === campusPlace.id);
assert.equal(verifiedPlace.verification.label, "Toplulukça güncel");
assert.equal(verifiedPlace.currentCount, 2);
const campusEvent = (await json("/api/campus-guide", {
  method: "POST",
  body: JSON.stringify({ action: "event", name: `Kampüs Teknoloji Buluşması ${runId}`, category: "social", description: "Öğrencilerin projelerini tanıttığı açık kampüs buluşması.", placeId: campusPlace.id, startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), endsAt: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString() }),
})).body.event;
const firstDaily = (await json("/api/campus-guide")).body.suggestion;
const secondDaily = (await json("/api/campus-guide")).body.suggestion;
assert.equal(firstDaily.id, secondDaily.id);
assert.ok((await json("/api/campus-guide")).body.events.some((item) => item.id === campusEvent.id && item.placeName.includes("Merkez Kütüphane")));

const otherLibraryArea = (await json("/api/library-occupancy", {
  method: "POST",
  body: JSON.stringify({ action: "area", name: `Kuzey Kütüphane ${runId}`, floorLabel: "1. Kat", zoneLabel: "Kuzey Salon", description: "Diğer kampüs doluluk izolasyonu için çalışma alanı.", capacity: 40, placeId: otherCampusPlace.id, features: ["quiet", "wifi"] }),
}, otherCampusEmail)).body.area;
const libraryArea = (await json("/api/library-occupancy", {
  method: "POST",
  body: JSON.stringify({ action: "area", name: `Merkez Kütüphane ${runId}`, floorLabel: "2. Kat", zoneLabel: "Sessiz Salon A", description: "Prizli masaları ve gün ışığı olan sessiz çalışma salonu.", capacity: 120, placeId: campusPlace.id, features: ["quiet", "power", "wifi", "natural-light"] }),
})).body.area;
const secondLibraryArea = (await json("/api/library-occupancy", {
  method: "POST",
  body: JSON.stringify({ action: "area", name: `Merkez Kütüphane ${runId}`, floorLabel: "3. Kat", zoneLabel: "Grup Çalışma B", description: "Küçük ekiplerin birlikte çalışabildiği grup masaları.", capacity: 60, placeId: campusPlace.id, features: ["group", "power", "wifi"] }),
})).body.area;
const initialLibraryAreas = (await json("/api/library-occupancy")).body.areas;
const initialLibraryArea = initialLibraryAreas.find((item) => item.id === libraryArea.id);
assert.equal(initialLibraryArea.estimatedFreeSeats, null);
assert.ok(!initialLibraryAreas.some((item) => item.id === otherLibraryArea.id));
const peerLibraryCheckin = (await json("/api/library-occupancy", {
  method: "POST", body: JSON.stringify({ action: "check-in", areaId: libraryArea.id, durationMinutes: 60 }),
}, peerEmail)).body.checkin;
const ownerLibraryCheckin = (await json("/api/library-occupancy", {
  method: "POST", body: JSON.stringify({ action: "check-in", areaId: libraryArea.id, durationMinutes: 90 }),
})).body.checkin;
const duplicateLibraryCheckin = await fetch(`${baseUrl}/api/library-occupancy`, {
  method: "POST", headers: headers(ownerEmail, true), body: JSON.stringify({ action: "check-in", areaId: secondLibraryArea.id, durationMinutes: 30 }),
});
assert.equal(duplicateLibraryCheckin.status, 409);
const occupiedLibraryArea = (await json("/api/library-occupancy")).body.areas.find((item) => item.id === libraryArea.id);
assert.equal(occupiedLibraryArea.activeCount, 2);
assert.equal(occupiedLibraryArea.estimatedFreeSeats, 118);
assert.equal(occupiedLibraryArea.viewerCheckin.id, ownerLibraryCheckin.id);
await json("/api/library-occupancy", { method: "PATCH", body: JSON.stringify({ action: "check-out", areaId: libraryArea.id }) });
await json("/api/library-occupancy", { method: "PATCH", body: JSON.stringify({ action: "check-out", areaId: libraryArea.id }) }, peerEmail);
const clearedLibraryArea = (await json("/api/library-occupancy")).body.areas.find((item) => item.id === libraryArea.id);
assert.equal(clearedLibraryArea.activeCount, 0);
assert.equal(clearedLibraryArea.estimatedFreeSeats, 120);
assert.equal(peerLibraryCheckin.areaId, libraryArea.id);

const otherCampusListing = (await json("/api/campus-market", {
  method: "POST",
  body: JSON.stringify({ action: "listing", kind: "sell", category: "books", title: `Diğer Kampüs Kitabı ${runId}`, description: "Kampüsler arası ilan izolasyonu doğrulaması.", price: 250, condition: "used-good", meetupPlace: "Kuzey kampüs" }),
}, otherCampusEmail)).body.listing;
const listing = (await json("/api/campus-market", {
  method: "POST",
  body: JSON.stringify({ action: "listing", kind: "sell", category: "electronics", title: `Bilimsel Hesap Makinesi ${runId}`, description: "Tüm tuşları çalışan, temiz ve çiziksiz hesap makinesi.", price: 450.5, condition: "like-new", meetupPlace: "Merkez kütüphane girişi" }),
})).body.listing;
const listingImages = new FormData();
listingImages.set("listingId", listing.id);
listingImages.append("images", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "hesap-makinesi-on.png", { type: "image/png" }));
listingImages.append("images", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1])], "hesap-makinesi-arka.jpg", { type: "image/jpeg" }));
const uploadedListingImages = (await json("/api/campus-market/images", { method: "POST", body: listingImages })).body.images;
assert.equal(uploadedListingImages.length, 2);
const marketFeed = (await json("/api/campus-market")).body.listings;
assert.ok(marketFeed.some((item) => item.id === listing.id && item.priceCents === 45050 && item.images.length === 2));
assert.ok(!marketFeed.some((item) => item.id === otherCampusListing.id));
const firstListingImage = await fetch(`${baseUrl}${uploadedListingImages[0].url}`, { headers: headers(ownerEmail) });
assert.equal(firstListingImage.status, 200);
assert.match(firstListingImage.headers.get("content-type") ?? "", /^image\/png\b/i);
const secondListingImage = await fetch(`${baseUrl}${uploadedListingImages[1].url}`, { headers: headers(ownerEmail) });
assert.equal(secondListingImage.status, 200);
assert.match(secondListingImage.headers.get("content-type") ?? "", /^image\/jpeg\b/i);
const inquiry = (await json("/api/campus-market", {
  method: "POST",
  body: JSON.stringify({ action: "inquiry", listingId: listing.id, message: "Hesap makinesini yarın kampüste görebilir miyim?" }),
}, peerEmail)).body.inquiry;
const ownerInquiries = (await json("/api/campus-market")).body.inquiries;
assert.ok(ownerInquiries.some((item) => item.id === inquiry.id && item.direction === "incoming"));
assert.equal((await json("/api/campus-market", { method: "PATCH", body: JSON.stringify({ action: "inquiry-status", id: inquiry.id, status: "accepted" }) })).body.status, "accepted");
const observedAt = new Date().toISOString();
const ownerPrice = (await json("/api/campus-market", {
  method: "POST",
  body: JSON.stringify({ action: "price", category: "food", placeId: campusPlace.id, placeName: `Merkez Kütüphane ${runId}`, itemName: "Öğrenci tost menüsü", price: 95, observedAt, sourceNote: "Kasadaki güncel menüde içecek dahil gördüm." }),
})).body.price;
await json("/api/campus-market", {
  method: "POST",
  body: JSON.stringify({ action: "price", category: "food", placeId: campusPlace.id, placeName: `Merkez Kütüphane ${runId}`, itemName: "Öğrenci tost menüsü", price: 100, observedAt, sourceNote: "Aynı gün kasada ödenen menü fiyatı." }),
}, peerEmail);
const priceGroups = (await json("/api/campus-market")).body.prices;
const groupedPrice = priceGroups.find((item) => item.itemName === "Öğrenci tost menüsü");
assert.equal(groupedPrice.sampleCount, 2);
assert.equal(groupedPrice.minPriceCents, 9500);
assert.equal(groupedPrice.maxPriceCents, 10000);
assert.equal(groupedPrice.freshness.state, "fresh");

const otherCampusCommunity = (await json("/api/communities", {
  method: "POST",
  body: JSON.stringify({
    name: `Runtime Kampüs ${runId}`,
    description: "Farklı üniversite veri izolasyonu doğrulama topluluğu.",
    category: "teknoloji",
    joinPolicy: "open",
    courseId: otherCampus.courses[0].id,
    rules: "Aynı kampüs içinde güvenli paylaşım yap.",
  }),
}, otherCampusEmail)).body.community;
const isolatedSearch = (await json(`/api/search?q=${encodeURIComponent(runId)}`)).body;
assert.ok(!isolatedSearch.communities.some((item) => item.id === otherCampusCommunity.id));
const crossCampusCommunity = await fetch(`${baseUrl}/api/communities?id=${encodeURIComponent(otherCampusCommunity.id)}`, { headers: headers(ownerEmail) });
assert.equal(crossCampusCommunity.status, 404);

const community = (await json("/api/communities", {
  method: "POST",
  body: JSON.stringify({
    name: `Runtime Matematik ${runId}`,
    description: "Otomatik yerel çalışma zamanı doğrulama topluluğu.",
    category: "akademik",
    joinPolicy: "open",
    courseId: "bilgisayar-mat101",
    rules: "Kaynak göster ve saygılı ol.",
  }),
})).body.community;
assert.equal(community.role, "founder");

const communityPost = (await json("/api/community-posts", {
  method: "POST",
  body: JSON.stringify({ communityId: community.id, content: "Otomatik kritik yol doğrulama gönderisi." }),
})).body.post;
const pin = (await json("/api/community-posts", {
  method: "PATCH",
  body: JSON.stringify({ communityId: community.id, postId: communityPost.id }),
})).body;
assert.equal(pin.active, true);

const upload = new FormData();
upload.set("title", `Runtime PDF ${runId}`);
upload.set("description", "R2 yükleme, arama, kaydetme, indirme ve silme kontrolü.");
upload.set("courseId", "bilgisayar-mat101");
upload.set("noteType", "ders-notu");
upload.set("tags", "runtime, final");
upload.set("file", new File(["%PDF-1.7\n%%EOF\n"], "runtime.pdf", { type: "application/pdf" }));
const note = (await json("/api/notes", { method: "POST", body: upload })).body.note;
assert.equal(note.status, "published");

const foundNotes = (await json(`/api/notes?q=${encodeURIComponent(runId)}`)).body.notes;
assert.equal(foundNotes.length, 1);
const save = (await json("/api/note-actions", { method: "POST", body: JSON.stringify({ id: note.id, type: "save" }) })).body;
assert.equal(save.active, true);
const download = await fetch(`${baseUrl}/api/notes/file?id=${encodeURIComponent(note.id)}&download=1`, { headers: headers(ownerEmail) });
assert.equal(download.status, 200);
assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
assert.ok((await download.arrayBuffer()).byteLength > 8);

const search = (await json(`/api/search?q=${encodeURIComponent(runId)}`)).body;
assert.ok(search.notes.some((item) => item.id === note.id));
assert.ok(search.communities.some((item) => item.id === community.id));

const follow = (await json("/api/follows", { method: "POST", body: JSON.stringify({ targetId: peer.publicId }) })).body;
assert.equal(follow.active, true);
const peerNotices = (await json("/api/notifications", {}, peerEmail)).body.notifications;
assert.ok(peerNotices.some((item) => item.kind === "interaction"));
const block = (await json("/api/safety", { method: "POST", body: JSON.stringify({ action: "block", targetId: peer.publicId }) })).body;
assert.equal(block.active, true);
const blockedSearch = (await json(`/api/people?q=${encodeURIComponent(peer.displayName)}`)).body.people;
assert.ok(!blockedSearch.some((item) => item.publicId === peer.publicId));

await json("/api/notes", { method: "DELETE", body: JSON.stringify({ id: note.id }) });
await json("/api/campus-pulse", { method: "DELETE", body: JSON.stringify({ id: livePulse.id }) });
await json("/api/campus-pulse", { method: "DELETE", body: JSON.stringify({ id: visualPulse.id }) });
assert.equal((await fetch(`${baseUrl}${visualPulse.imageUrl}`, { headers: headers(ownerEmail) })).status, 404);
await json("/api/campus-pulse", { method: "DELETE", body: JSON.stringify({ id: confession.id }) });
await json("/api/campus-guide", { method: "PATCH", body: JSON.stringify({ action: "archive-event", id: campusEvent.id }) });
await json("/api/campus-guide", { method: "PATCH", body: JSON.stringify({ action: "archive-place", id: campusPlace.id }) });
await json("/api/campus-guide", { method: "PATCH", body: JSON.stringify({ action: "archive-place", id: otherCampusPlace.id }) }, otherCampusEmail);
await json("/api/library-occupancy", { method: "PATCH", body: JSON.stringify({ action: "archive-area", areaId: libraryArea.id }) });
await json("/api/library-occupancy", { method: "PATCH", body: JSON.stringify({ action: "archive-area", areaId: secondLibraryArea.id }) });
await json("/api/library-occupancy", { method: "PATCH", body: JSON.stringify({ action: "archive-area", areaId: otherLibraryArea.id }) }, otherCampusEmail);
await json("/api/campus-market/images", { method: "DELETE", body: JSON.stringify({ id: uploadedListingImages[0].id }) });
await json("/api/campus-market/images", { method: "DELETE", body: JSON.stringify({ id: uploadedListingImages[1].id }) });
await json("/api/campus-market", { method: "PATCH", body: JSON.stringify({ action: "listing-status", id: listing.id, status: "closed" }) });
await json("/api/campus-market", { method: "PATCH", body: JSON.stringify({ action: "listing-status", id: otherCampusListing.id, status: "closed" }) }, otherCampusEmail);
await json("/api/campus-market", { method: "PATCH", body: JSON.stringify({ action: "archive-price", id: ownerPrice.id }) });
await json("/api/communities", { method: "PATCH", body: JSON.stringify({ id: community.id, action: "archive" }) });
await json("/api/communities", { method: "PATCH", body: JSON.stringify({ id: otherCampusCommunity.id, action: "archive" }) }, otherCampusEmail);

console.log("Üniyra v1.6.24 runtime smoke passed: auth, editable profiles, campus isolation, visual Campus Anlık, matching, meetups, campus guide, bounded library occupancy, six-image marketplace gallery, timestamped price aggregation, moderation, community, expanded verified note library/R2, search, notifications and safety.");
