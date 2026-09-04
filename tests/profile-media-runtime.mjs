import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// This test creates synthetic accounts and changes only their local fixture rows.
// It deliberately refuses public hosts and never uses production credentials.
const baseUrl = process.env.UNIYRA_BASE_URL ?? "http://127.0.0.1:5173";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname), "Use a local development server.");
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const ownerEmail = `profile.owner.${runId}@omu.edu.tr`;
const peerEmail = `profile.peer.${runId}@omu.edu.tr`;
const otherEmail = `profile.other.${runId}@bogazici.edu.tr`;
const password = `ProfileMedia${runId}!`;
const cookies = new Map();
const keepFixtures = process.env.PROFILE_MEDIA_KEEP_FIXTURES === "1";
const createdPosts = [];
const createdNotes = [];
const createdCommunities = [];
let checks = 0;

function headers(email, body, extra = {}) {
  const result = new Headers(extra);
  if (cookies.has(email)) result.set("cookie", cookies.get(email));
  if (body && !(body instanceof FormData)) result.set("content-type", "application/json");
  return result;
}

async function request(path, init = {}, email = ownerEmail, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: headers(email, init.body, init.headers) });
  const body = await response.json();
  assert.equal(response.status, expected, `${init.method ?? "GET"} ${path}: ${JSON.stringify(body)}`);
  checks++;
  return { response, body };
}

async function register(email, displayName, otherCampus = false) {
  const { response } = await request("/api/auth/register", {
    method: "POST", body: JSON.stringify({ email, displayName, password }),
  }, email, 201);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "Registration must create a real session.");
  cookies.set(email, cookie.split(";", 1)[0]);
  const profile = otherCampus ? {
    universityId: "tr-bogazici-universitesi", facultyName: "Mühendislik Fakültesi",
    departmentName: "Bilgisayar Mühendisliği", classYear: 2,
    customCourses: [
      { code: "CMPE 101", name: "Bilgisayar Mühendisliğine Giriş" },
      { code: "MATH 101", name: "Analiz I" },
      { code: "PHYS 101", name: "Fizik I" },
    ],
  } : {
    universityId: "omu", facultyId: "muhendislik", departmentId: "bilgisayar", classYear: 3,
    courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"],
  };
  return (await request("/api/profile", { method: "PUT", body: JSON.stringify(profile) }, email)).body.profile;
}

async function localDatabase() {
  const directory = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  for (const name of names) {
    const db = new DatabaseSync(fileURLToPath(new URL(name, directory)));
    db.exec("PRAGMA busy_timeout = 5000");
    try {
      if (db.prepare("SELECT email FROM users WHERE email = ?").get(ownerEmail)) return db;
    } catch { /* Another local binding can have an unrelated schema. */ }
    db.close();
  }
  throw new Error("The local D1 fixture database could not be located.");
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5s8AAAAASUVORK5CYII=", "base64");
// A minimal ISO BMFF fixture is sufficient for exact byte-range transport checks.
// Browser playback is verified separately with a playable user-flow fixture.
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.from([0, 0, 2, 0]), Buffer.from("isommp42"), Buffer.from([0, 0, 0, 12]), Buffer.from("mdat"), Buffer.from([1, 2, 3, 4])]);

async function post(content, file, email = ownerEmail) {
  const body = file ? new FormData() : JSON.stringify({ content });
  if (file) { body.set("content", content); body.set("media", file); }
  const result = (await request("/api/posts", { method: "POST", body }, email, 201)).body.post;
  createdPosts.push({ id: result.id, email });
  return result;
}

async function content(user, tab, email = ownerEmail, cursor) {
  const params = new URLSearchParams({ user, tab });
  if (cursor) params.set("cursor", cursor);
  const result = await request(`/api/profile/content?${params}`, {}, email);
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  for (const key of ["posts", "notes", "communities"]) assert.ok(Array.isArray(result.body[key]));
  return result.body;
}

async function allContent(user, tab, email = ownerEmail) {
  const key = tab === "notes" || tab === "communities" ? tab : "posts";
  const items = [];
  const cursors = new Set();
  let cursor;
  do {
    const body = await content(user, tab, email, cursor);
    assert.ok(body[key].length <= 12, "Profile content must be bounded per page.");
    items.push(...body[key]);
    cursor = body.nextCursor;
    if (cursor) { assert.ok(!cursors.has(cursor), "Pagination must make progress."); cursors.add(cursor); }
  } while (cursor);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, "Pages must not duplicate records.");
  return items;
}

async function note(label) {
  const body = new FormData();
  body.set("title", `Profil ${label} ${runId}`);
  body.set("description", "Profil bölümlerinde yayın ve dosya erişimi doğrulaması.");
  body.set("courseId", "bilgisayar-mat101");
  body.set("noteType", "ders-notu");
  body.set("file", new File(["%PDF-1.7\n%%EOF\n"], "profile.pdf", { type: "application/pdf" }));
  const result = (await request("/api/notes", { method: "POST", body }, ownerEmail, 201)).body.note;
  createdNotes.push(result.id);
  return result;
}

async function community(label, joinPolicy) {
  const result = (await request("/api/communities", { method: "POST", body: JSON.stringify({
    name: `Profil ${label} ${runId}`, description: "Profil üyelik görünürlüğü için yerel doğrulama topluluğu.",
    category: "akademik", joinPolicy, courseId: "bilgisayar-mat101", rules: "Saygılı ve kaynak göstererek paylaş.",
  }) }, ownerEmail, 201)).body.community;
  createdCommunities.push(result.id);
  return result;
}

assert.equal((await request("/api/health")).body.storage, "configured");
await request("/api/profile/content", {}, null, 401);
const owner = await register(ownerEmail, "Profil Medya Deneme");
const peer = await register(peerEmail, "Profil Ziyaretçisi");
await register(otherEmail, "Diğer Kampüs Deneme", true);
if (keepFixtures) await writeFile(new URL("../.wrangler/profile-media-fixtures.json", import.meta.url), JSON.stringify({ baseUrl, email: ownerEmail, password, publicId: owner.publicId, peerEmail, peerPublicId: peer.publicId, runId }, null, 2));
const db = await localDatabase();

try {
  // Keep an unrelated, visible community post in the database. A shared-post
  // lookup must not let the community-visibility OR bypass its exact id filter.
  const open = await community("Açık", "open");
  await request("/api/communities", { method: "PATCH", body: JSON.stringify({ id: open.id, action: "join" }) }, peerEmail);
  const unrelated = (await request("/api/community-posts", { method: "POST", body: JSON.stringify({ communityId: open.id, content: "Başka öğrencinin topluluk gönderisi.", postType: "discussion" }) }, peerEmail, 201)).body.post;
  createdPosts.push({ id: unrelated.id, email: peerEmail });
  await request("/api/communities", { method: "PATCH", body: JSON.stringify({ id: open.id, action: "leave" }) }, peerEmail);
  const images = [];
  for (let index = 0; index < 13; index++) {
    images.push(await post(`Kampüsten görsel ${index + 1}`, new File([png], `kampus-${index + 1}.png`, { type: "image/png" })));
  }
  const video = await post("Kampüsten video", new File([mp4], "kampus.mp4", { type: "video/mp4" }));
  const captionless = await post("", new File([png], "aciklamasiz.png", { type: "image/png" }));
  images.push(captionless);
  const plain = await post("Profildeki metin paylaşımım.");
  assert.deepEqual(plain.media, []);
  assert.equal(video.media[0].kind, "video");
  assert.equal(video.media[0].fileName, "kampus.mp4");
  for (const item of images) assert.equal(item.media[0].kind, "image");

  // Move one real API-created post outside the first campus feed page.
  db.prepare("UPDATE posts SET created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ? AND author_email = ?").run(images[0].id, ownerEmail);
  const firstImages = await content(owner.publicId, "images");
  assert.equal(firstImages.posts.length, 12);
  assert.ok(firstImages.nextCursor);
  const ownImages = await allContent(owner.publicId, "images");
  assert.deepEqual(new Set(ownImages.map((item) => item.id)), new Set(images.map((item) => item.id)));
  assert.ok(ownImages.every((item) => item.media.length === 1 && item.media[0].kind === "image"));
  const feed = (await request("/api/posts?feed=campus")).body.posts;
  assert.ok(!feed.some((item) => item.id === images[0].id), "Old image fixture must fall beyond the first feed page.");
  assert.ok(ownImages.some((item) => item.id === images[0].id), "Profile must still include old images omitted by the feed page.");
  assert.deepEqual((await allContent(owner.publicId, "videos", peerEmail)).map((item) => item.id), [video.id]);
  const peerView = await allContent(owner.publicId, "posts", peerEmail);
  assert.equal(peerView.length, 16);
  assert.ok(peerView.some((item) => item.id === plain.id));
  assert.deepEqual((await allContent(peer.publicId, "posts")).map((item) => item.id), [unrelated.id]);
  assert.ok(feed.every((item) => Array.isArray(item.media)), "Feed posts must expose their attached media.");
  assert.ok(feed.some((item) => item.media.length > 0), "Feed results must include uploaded media.");
  const sharedVideo = (await request(`/api/posts?id=${video.id}`, {}, peerEmail)).body.post;
  assert.equal(sharedVideo.id, video.id, "A shared post must match the requested id.");
  assert.deepEqual(sharedVideo.media, video.media, "A shared post must retain the uploaded video metadata.");

  const rejected = new FormData();
  rejected.set("media", new File([png], "fake.mp4", { type: "video/mp4" }));
  await request("/api/posts", { method: "POST", body: rejected }, ownerEmail, 415);
  await request("/api/profile/content?tab=unknown", {}, ownerEmail, 400);
  await request("/api/profile/content?tab=images&cursor=invalid", {}, ownerEmail, 400);

  const mediaUrl = `${baseUrl}${video.media[0].url}`;
  const full = await fetch(mediaUrl, { headers: headers(peerEmail) });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.match(full.headers.get("cache-control"), /private.*no-store/);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), mp4);
  for (const [range, start, end] of [["bytes=0-7", 0, 7], ["bytes=8-", 8, mp4.length - 1], ["bytes=-4", mp4.length - 4, mp4.length - 1]]) {
    const response = await fetch(mediaUrl, { headers: headers(peerEmail, null, { range }) });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${mp4.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp4.subarray(start, end + 1));
    checks++;
  }
  const invalidRange = await fetch(mediaUrl, { headers: headers(peerEmail, null, { range: "bytes=9999-10000" }) });
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get("content-range"), `bytes */${mp4.length}`);
  assert.equal((await fetch(mediaUrl)).status, 401);
  assert.equal((await fetch(mediaUrl, { headers: headers(otherEmail) })).status, 404);
  checks += 4;

  const published = await note("yayınlanan");
  const processing = await note("hazırlanan");
  const rejectedNote = await note("reddedilen");
  db.prepare("UPDATE notes SET status = ? WHERE id = ? AND owner_email = ?").run("processing", processing.id, ownerEmail);
  db.prepare("UPDATE notes SET status = ? WHERE id = ? AND owner_email = ?").run("rejected", rejectedNote.id, ownerEmail);
  const ownNotes = await allContent(owner.publicId, "notes");
  assert.equal(ownNotes.length, 3);
  assert.ok(ownNotes.every((item) => item.own));
  assert.deepEqual(new Set(ownNotes.map((item) => item.status)), new Set(["published", "processing", "rejected"]));
  const publicNotes = await allContent(owner.publicId, "notes", peerEmail);
  assert.deepEqual(publicNotes.map((item) => item.id), [published.id]);
  assert.equal(publicNotes[0].own, false);

  const privateCommunity = await community("Başvurulu", "request");
  const archived = await community("Arşiv", "open");
  await request("/api/communities", { method: "PATCH", body: JSON.stringify({ id: archived.id, action: "archive" }) });
  assert.deepEqual(new Set((await allContent(owner.publicId, "communities")).map((item) => item.id)), new Set([open.id, privateCommunity.id]));
  let publicCommunities = await allContent(owner.publicId, "communities", peerEmail);
  assert.deepEqual(publicCommunities.map((item) => item.id), [open.id]);
  assert.equal(publicCommunities[0].joined, false);
  assert.equal(publicCommunities[0].role, null, "A visitor must not inherit the profile owner's founder role.");
  await request("/api/communities", { method: "PATCH", body: JSON.stringify({ id: privateCommunity.id, action: "join" }) }, peerEmail);
  assert.equal((await allContent(peer.publicId, "communities", peerEmail)).length, 0, "Pending memberships must not appear as active profile memberships.");
  assert.deepEqual((await allContent(owner.publicId, "communities", peerEmail)).map((item) => item.id), [open.id]);
  await request("/api/communities", { method: "PATCH", body: JSON.stringify({ id: privateCommunity.id, action: "approve", targetId: peer.publicId }) });
  publicCommunities = await allContent(owner.publicId, "communities", peerEmail);
  assert.equal(publicCommunities.find((item) => item.id === privateCommunity.id).role, "member");
  assert.equal(publicCommunities.find((item) => item.id === privateCommunity.id).joined, true);

  for (const tab of ["posts", "images", "videos", "notes", "communities"]) {
    await request(`/api/profile/content?user=${owner.publicId}&tab=${tab}`, {}, otherEmail, 404);
  }
  await request("/api/safety", { method: "POST", body: JSON.stringify({ action: "block", targetId: peer.publicId }) });
  for (const tab of ["posts", "images", "videos", "notes", "communities"]) {
    await request(`/api/profile/content?user=${owner.publicId}&tab=${tab}`, {}, peerEmail, 404);
    await request(`/api/profile/content?user=${peer.publicId}&tab=${tab}`, {}, ownerEmail, 404);
  }
  assert.equal((await fetch(mediaUrl, { headers: headers(peerEmail) })).status, 404);
  await request("/api/safety", { method: "POST", body: JSON.stringify({ action: "block", targetId: peer.publicId }) });

  const deleted = images.at(-1);
  await request("/api/posts", { method: "DELETE", body: JSON.stringify({ id: deleted.id }) }, peerEmail, 404);
  await request("/api/posts", { method: "DELETE", body: JSON.stringify({ id: deleted.id }) });
  assert.equal((await fetch(`${baseUrl}${deleted.media[0].url}`, { headers: headers(ownerEmail) })).status, 404);
  assert.ok(!(await allContent(owner.publicId, "images")).some((item) => item.id === deleted.id));
  await request(`/api/posts?id=${deleted.id}`, {}, ownerEmail, 404);

  if (keepFixtures) {
    const fixture = { baseUrl, email: ownerEmail, password, publicId: owner.publicId, peerEmail, peerPublicId: peer.publicId, runId, imagePostId: images[0].id, videoPostId: video.id };
    await writeFile(new URL("../.wrangler/profile-media-fixtures.json", import.meta.url), JSON.stringify(fixture, null, 2));
    console.log("Synthetic local QA login saved to .wrangler/profile-media-fixtures.json");
  } else {
    for (const item of createdPosts.filter((item) => item.id !== deleted.id)) await request("/api/posts", { method: "DELETE", body: JSON.stringify({ id: item.id }) }, item.email);
    for (const id of createdNotes) await request("/api/notes", { method: "DELETE", body: JSON.stringify({ id }) });
    for (const id of createdCommunities.filter((id) => id !== archived.id)) await request("/api/communities", { method: "PATCH", body: JSON.stringify({ id, action: "archive" }) });
  }
  console.log(`Profile media runtime passed (${checks} requests checked): real auth/uploads/storage, filtered media data, old author posts and pagination, notes visibility, active community memberships, campus and block isolation, byte ranges, deletion revocation.`);
} finally {
  db.close();
}
