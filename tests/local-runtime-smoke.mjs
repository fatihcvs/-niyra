import assert from "node:assert/strict";

const baseUrl = process.env.UNIYRA_BASE_URL ?? "http://localhost:5173";
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const ownerEmail = `runtime.owner.${runId}@omu.edu.tr`;
const peerEmail = `runtime.peer.${runId}@omu.edu.tr`;

function headers(email, json = false) {
  const value = new Headers({
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(email === ownerEmail ? "Runtime Owner" : "Runtime Peer"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  if (json) value.set("content-type", "application/json");
  return value;
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

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).storage, "configured");

const owner = (await createProfile(ownerEmail)).body.profile;
const peer = (await createProfile(peerEmail)).body.profile;
assert.equal(owner.courses.length, 3);
assert.equal(peer.courses.length, 3);

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
await json("/api/communities", { method: "PATCH", body: JSON.stringify({ id: community.id, action: "archive" }) });

console.log("Üniyra local runtime smoke passed: profile, community, note/R2, search, notifications and safety.");
