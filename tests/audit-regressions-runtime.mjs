import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const base = process.env.KAMPIRA_BASE_URL ?? "http://127.0.0.1:5173";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local synthetic fixtures only");
const marker = `Audit${Date.now()}`;
const password = `${marker}Test!`;
const accounts = {};
let checks = 0;
async function request(who, path, body, method = body ? "POST" : "GET", expected = 200) {
  const init = { method, headers: {
    ...(accounts[who]?.cookie ? { cookie: accounts[who].cookie } : {}),
    ...(body ? { "content-type": "application/json" } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) };
  const response = await fetch(`${base}${path}`, init).catch(async (error) => {
    if (method !== "GET" || error.cause?.code !== "ECONNRESET") throw new Error(`${method} ${path}: ${error.message}`, { cause: error });
    console.log(`Retrying read after local dev transport reset: ${path}`);
    return fetch(`${base}${path}`, init);
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${data.error ?? response.status}`);
  checks++;
  return { data, response };
}
for (const [key, name] of [["owner", "Deniz"], ["peer", "Ece"], ["third", "Mert"]]) {
  const email = `${marker}.${key}@omu.edu.tr`;
  const { response } = await request(key, "/api/auth/register", { email, password, displayName: `${name} Kontrol` }, "POST", 201);
  accounts[key] = { email, password, cookie: response.headers.get("set-cookie").split(";")[0] };
  accounts[key].profile = (await request(key, "/api/profile", { universityId: "omu", facultyId: "muhendislik", departmentId: "bilgisayar", classYear: 3, courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"] }, "PUT")).data.profile;
}
const community = (await request("owner", "/api/communities", { name: `${marker} Ders Topluluğu`, description: "Yerel kontrol için sentetik çalışma topluluğu.", category: "akademik", joinPolicy: "open" }, "POST", 201)).data.community;
const conversation = (await request("owner", "/api/messages", { recipientId: accounts.peer.profile.publicId, body: "Yerel kontrol başlangıcı" }, "POST", 201)).data.conversationId;
const otherConversation = (await request("owner", "/api/messages", { recipientId: accounts.third.profile.publicId, body: "İkinci sentetik konuşma" }, "POST", 201)).data.conversationId;
const directory = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url);
let db;
for (const name of await readdir(directory)) {
  if (!name.endsWith(".sqlite") || name === "metadata.sqlite") continue;
  const candidate = new DatabaseSync(fileURLToPath(new URL(name, directory)));
  candidate.exec("PRAGMA busy_timeout = 5000");
  try { if (candidate.prepare("SELECT email FROM users WHERE email = ?").get(accounts.owner.email.toLowerCase())) { db = candidate; break; } } catch { /* Another local binding. */ }
  candidate.close();
}
assert.ok(db, "Synthetic account database found");
try {
  // Seed only this run's conversation to cover >100 messages without bypassing any real user's limits.
  const insert = db.prepare("INSERT INTO direct_messages (id, conversation_id, sender_email, body, created_at) VALUES (?, ?, ?, ?, ?)");
  for (let index = 0; index < 205; index++) insert.run(`${marker}-${String(index).padStart(3, "0")}`, conversation, accounts.peer.email.toLowerCase(), `Geçmiş kontrol mesajı ${index}`, "2026-01-01T10:00:00.000Z");
  let cursor = null;
  const ids = [];
  let pages = 0;
  do {
    const data = (await request("owner", `/api/messages?conversationId=${conversation}${cursor ? `&before=${cursor}` : ""}`)).data;
    assert.ok(data.messages.length <= 100);
    assert.ok(data.messages.every((message) => message.createdAt));
    ids.push(...data.messages.map((message) => message.id));
    cursor = data.olderCursor;
    pages++;
    assert.ok(pages <= 3, "Cursor must advance");
  } while (cursor);
  assert.equal(ids.length, 206);
  assert.equal(new Set(ids).size, 206);
  assert.equal(pages, 3);
  await request("third", `/api/messages?conversationId=${conversation}`, null, "GET", 404);
  const foreignCursor = (await request("owner", `/api/messages?conversationId=${otherConversation}`)).data.messages[0].id;
  assert.equal((await request("owner", `/api/messages?conversationId=${conversation}&before=${foreignCursor}`)).data.messages.length, 0);

  const search = async () => (await request("peer", `/api/search?q=${marker}`)).data.communities;
  assert.ok((await search()).some((item) => item.id === community.id));
  db.prepare("UPDATE communities SET moderation_status = 'hidden' WHERE id = ? AND creator_email = ?").run(community.id, accounts.owner.email.toLowerCase());
  assert.ok(!(await search()).some((item) => item.id === community.id));
  await request("peer", `/api/communities?id=${community.id}`, null, "GET", 404);
  db.prepare("UPDATE communities SET moderation_status = 'active' WHERE id = ? AND creator_email = ?").run(community.id, accounts.owner.email.toLowerCase());
  db.prepare("UPDATE student_profiles SET university_id = 'tr-bogazici-universitesi' WHERE user_email = ?").run(accounts.owner.email.toLowerCase());
  assert.ok((await search()).some((item) => item.id === community.id), "A founder's campus change must not move the community");
  db.prepare("UPDATE student_profiles SET university_id = 'omu' WHERE user_email = ?").run(accounts.owner.email.toLowerCase());
  if (process.env.KAMPIRA_KEEP_BROWSER_FIXTURE === "1") {
    await writeFile(new URL("../.wrangler/full-audit-fixtures.json", import.meta.url), JSON.stringify({ marker, accounts, community, conversation, otherConversation }));
  } else {
    db.prepare("DELETE FROM direct_messages WHERE conversation_id IN (?, ?)").run(conversation, otherConversation);
    await request("owner", "/api/communities", { id: community.id, action: "archive" }, "PATCH");
  }
  console.log(`Audit regressions passed (${checks} requests): 206 messages across three pages, tied timestamps, cursor isolation, hidden communities and stable campus ownership.`);
} finally {
  db.prepare("UPDATE student_profiles SET university_id = 'omu' WHERE user_email = ?").run(accounts.owner.email.toLowerCase());
  db.prepare("UPDATE communities SET moderation_status = 'active' WHERE id = ? AND creator_email = ?").run(community.id, accounts.owner.email.toLowerCase());
  db.close();
}
