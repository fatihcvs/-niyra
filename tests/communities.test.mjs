import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("community hub ships a complete discovery and participation journey", async () => {
  const [page, workspace, styles] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/communities-workspace.tsx"),
    source("../app/communities-workspace.module.css"),
  ]);
  assert.match(page, /import\("\.\/communities-workspace"\)/);
  for (const label of ["Keşfet", "Topluluklarım", "Akış", "Etkinlikler", "Üyeler", "Hakkında"]) {
    assert.match(workspace, new RegExp(label));
  }
  for (const capability of ["post-actions", "comments", "community-events", "notification", "approve", "ban", "role"]) {
    assert.match(workspace, new RegExp(capability));
  }
  assert.match(workspace, /aria-modal="true"/);
  assert.match(workspace, /useAppLayer/);
  assert.match(styles, /@media\(max-width:780px\)/);
  assert.match(styles, /html\[data-theme="dark"\]/);
});

test("community APIs keep data campus-scoped and support structured content", async () => {
  const [directory, posts, events, migration, safety] = await Promise.all([
    source("../app/api/communities/route.ts"),
    source("../app/api/community-posts/route.ts"),
    source("../app/api/community-events/route.ts"),
    source("../drizzle/0019_community_hubs.sql"),
    source("../app/api/safety/route.ts"),
  ]);
  assert.match(directory, /c\.university_id = \?/);
  assert.match(directory, /community_bans/);
  assert.match(directory, /notification_level/);
  assert.match(posts, /community_post_meta/);
  assert.match(posts, /announcement/);
  assert.match(events, /community_event_attendees/);
  assert.match(events, /sameOriginRequest/);
  assert.match(safety, /community-event/);
  for (const table of ["community_post_meta", "community_bans", "community_events", "community_event_attendees"]) {
    assert.match(migration, new RegExp(`CREATE TABLE \`${table}\``));
  }
});
