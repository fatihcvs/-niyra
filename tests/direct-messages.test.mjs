import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("direct-message storage keeps one campus-scoped conversation per pair", async () => {
  const migration = await source("../drizzle/0018_direct_messages.sql");
  assert.match(migration, /CREATE TABLE `direct_conversations`/);
  assert.match(migration, /CREATE UNIQUE INDEX `direct_conversations_pair_unique`/);
  assert.match(migration, /member_one_email` < `member_two_email/);
  assert.match(migration, /CREATE TABLE `direct_messages`/);
  for (const column of ["attachment_type", "attachment_snapshot", "read_at", "deleted_at"]) assert.match(migration, new RegExp(column));
});

test("message API enforces campus, block, ownership and rate-limit boundaries", async () => {
  const route = await source("../app/api/messages/route.ts");
  assert.match(route, /sameOriginRequest/);
  assert.match(route, /requireProfile/);
  assert.match(route, /sp\.university_id = \?/);
  assert.match(route, /user_blocks/);
  assert.match(route, /direct-message-send/);
  assert.match(route, /direct-conversation-create/);
  assert.match(route, /n\.owner_email = \?/);
  assert.match(route, /creator_email = \?/);
  assert.match(route, /owner_email = \?/);
  assert.match(route, /Yalnızca daha önce eklediğin ve yayında olan içerikleri/);
});

test("message workspace provides responsive threads and content sharing", async () => {
  const [workspace, styles, page] = await Promise.all([
    source("../app/direct-messages.tsx"),
    source("../app/direct-messages.module.css"),
    source("../app/page.tsx"),
  ]);
  assert.match(workspace, /Kime mesaj göndereceksin/);
  assert.match(workspace, /Eklediklerim/);
  for (const label of ["Not", "Kütüphane", "Etkinlik", "Mekân", "İlan"]) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /entityType: "direct-message"/);
  assert.match(styles, /@media\(max-width:780px\)/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /data-theme="dark"/);
  assert.match(page, /label: "Mesajlar"/);
  assert.match(page, /messageUnreadCount/);
  assert.match(page, /Mesaj gönder/);
});

test("private messages are moderated only through participant reports", async () => {
  const [safety, admin, registry] = await Promise.all([
    source("../app/api/safety/route.ts"),
    source("../app/api/admin/route.ts"),
    source("../lib/admin-registry.ts"),
  ]);
  assert.match(safety, /entityType === "direct-message"/);
  assert.match(safety, /m\.sender_email <> \?/);
  assert.match(admin, /"direct-message".*UPDATE direct_messages/s);
  assert.match(registry, /visibility: "reported-only"/);
  assert.doesNotMatch(admin, /SELECT 'direct-message' AS entity_type/);
});
