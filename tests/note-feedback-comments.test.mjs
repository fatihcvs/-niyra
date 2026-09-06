import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared notes expose useful feedback with one mutable vote per student", async () => {
  const [workspace, actions, notes, schema] = await Promise.all([
    source("../app/product-features.tsx"),
    source("../app/api/note-actions/route.ts"),
    source("../app/api/notes/route.ts"),
    source("../db/schema.ts"),
  ]);
  assert.match(workspace, /Yararlı değil/);
  assert.match(workspace, /toggleFeedback/);
  assert.match(actions, /\["save", "helpful", "unhelpful"\]/);
  assert.match(actions, /ON CONFLICT\(note_id, user_email\) DO UPDATE/);
  assert.match(notes, /helpfulCount/);
  assert.match(notes, /unhelpfulCount/);
  assert.match(schema, /noteFeedback = sqliteTable/);
  assert.match(schema, /primaryKey\(\{ columns: \[table\.noteId, table\.userEmail\] \}\)/);
});

test("note comments are campus-scoped, rate limited, removable and moderated", async () => {
  const [workspace, route, admin, registry, safety] = await Promise.all([
    source("../app/product-features.tsx"),
    source("../app/api/note-comments/route.ts"),
    source("../app/api/admin/route.ts"),
    source("../lib/admin-registry.ts"),
    source("../app/api/safety/route.ts"),
  ]);
  assert.match(workspace, /Not hakkında konuş/);
  assert.match(workspace, /sendNoteComment/);
  assert.match(route, /CASE WHEN owner\.status = 'deleted' THEN n\.erased_university_id ELSE owner_profile\.university_id END = \?/);
  assert.match(route, /enforceRateLimit\(DB, identity\.email, "note-comment", 20, 3600\)/);
  assert.match(route, /author_email = \? AND deleted_at IS NULL/);
  assert.match(route, /user_blocks/);
  assert.match(admin, /note_comments/);
  assert.match(registry, /"note-comment"/);
  assert.match(safety, /entityType === "note-comment"/);
});
