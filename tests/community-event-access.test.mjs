import assert from "node:assert/strict";
import test from "node:test";
import { v2Fixture } from "./helpers/v2-api-fixture.mjs";

function setup(t, policy = "approval") {
  const api = v2Fixture(t);
  api.database.prepare(`INSERT INTO communities(id,creator_email,name,slug,description,category,university_id,join_policy)
    VALUES('club','alice@example.invalid','Synthetic private club','synthetic-club','Synthetic test only','akademik','a',?)`).run(policy);
  api.database.exec(`INSERT INTO community_members(community_id,user_email,role,status)
      VALUES('club','alice@example.invalid','founder','active'),('club','bob@example.invalid','member','active');
    INSERT INTO community_events(id,community_id,creator_email,title,description,location,starts_at,ends_at)
      VALUES('event','club','alice@example.invalid','Private event title','Private event description','Synthetic room','2099-01-01T12:00:00.000Z','2099-01-01T13:00:00.000Z');
    INSERT INTO community_event_attendees(event_id,user_email,status) VALUES('event','bob@example.invalid','going');`);
  api.as("bob");
  const push = api.load("lib/push-target-access.ts");
  const target = () => push.pushTargetHref(api.DB, "bob@example.invalid", "community-event", "event");
  return { api, target };
}
const privateResponse = response => assert.equal(response.headers.get("cache-control"), "private, no-store");

test("event detail, list and push target expose the same existing event; cancellation stays explicit", async t => {
  const { api, target } = setup(t);
  api.database.exec("UPDATE platform_settings SET value_json='false' WHERE key IN ('v2.planner','v2.communities')");
  for (const state of ["active", "cancelled"]) {
    api.database.prepare("UPDATE community_events SET status=? WHERE id='event'").run(state);
    const response = await api.request("community-events?id=event"); privateResponse(response);
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.event.id, "event"); assert.equal(body.event.status, state); assert.equal(body.event.going, true);
    const list = await api.request("community-events?communityId=club"); privateResponse(list);
    assert.deepEqual((await list.json()).events.map(row => row.id), ["event"]);
    assert.equal(await target(), "/?view=communities&communityEvent=event");
  }
  assert.equal(api.count("community_events"), 1);
});

test("current membership, bans, blocks, campus and active creator deny all event content paths", async t => {
  const changes = {
    left: "UPDATE community_members SET status='left' WHERE user_email='bob@example.invalid'",
    bannedMember: "UPDATE community_members SET status='banned' WHERE user_email='bob@example.invalid'",
    ban: "INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES('club','bob@example.invalid','alice@example.invalid')",
    blocked: "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('bob@example.invalid','alice@example.invalid')",
    blockedReverse: "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('alice@example.invalid','bob@example.invalid')",
    creatorInactive: "UPDATE users SET status='suspended' WHERE email='alice@example.invalid'",
    communityHidden: "UPDATE communities SET moderation_status='hidden' WHERE id='club'",
    campusChanged: "UPDATE student_profiles SET university_id='b' WHERE user_email='bob@example.invalid'",
  };
  for (const [name, sql] of Object.entries(changes)) await t.test(name, async t => {
    const { api, target } = setup(t); api.database.exec(sql);
    const response = await api.request("community-events?id=event"); privateResponse(response);
    assert.ok([403, 404].includes(response.status)); assert.doesNotMatch(await response.text(), /Private event/);
    const list = await api.request("community-events?communityId=club"); privateResponse(list);
    const listBody = await list.text(); assert.doesNotMatch(listBody, /Private event/);
    if (list.status === 200) assert.deepEqual(JSON.parse(listBody).events, []);
    else assert.ok([403, 404].includes(list.status));
    assert.equal(await target(), null);
  });
});

test("open-community discovery permits nonmembers but never bypasses an explicit ban or block", async t => {
  const { api, target } = setup(t, "open");
  api.database.exec("DELETE FROM community_members WHERE user_email='bob@example.invalid'");
  assert.equal((await api.request("community-events?id=event")).status, 200); assert.ok(await target());
  api.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('alice@example.invalid','bob@example.invalid')");
  assert.equal((await api.request("community-events?id=event")).status, 404); assert.equal(await target(), null);
});

test("access changes after the initial lookup cannot leak the final event row", async t => {
  const { api } = setup(t);
  let changed = false;
  api.beforeSql(sql => {
    if (!changed && sql.includes("SELECT ce.id, ce.title")) {
      changed = true;
      api.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('bob@example.invalid','alice@example.invalid')");
    }
  });
  const response = await api.request("community-events?id=event");
  assert.equal(changed, true); assert.equal(response.status, 404); privateResponse(response);
  assert.doesNotMatch(await response.text(), /Private event/);
});

test("changed account generation invalidates already-read event rows", async t => {
  const { api } = setup(t); let changed = false;
  api.beforeSql(sql => {
    if (!changed && sql.endsWith("SELECT 1 FROM event_viewer")) {
      changed = true; api.database.exec("UPDATE users SET public_id='replacement-account' WHERE email='bob@example.invalid'");
    }
  });
  const response = await api.request("community-events?id=event");
  assert.equal(changed, true); assert.equal(response.status, 409); privateResponse(response);
  assert.doesNotMatch(await response.text(), /Private event/);
});

test("anonymous and database-error responses are private and do not serialize internal errors", async t => {
  const { api } = setup(t);
  api.as(null); const anonymous = await api.request("community-events?id=event");
  assert.equal(anonymous.status, 401); privateResponse(anonymous);
  api.as("bob"); api.beforeSql(sql => { if (sql.includes("SELECT ce.id, ce.title")) throw new Error("private sql value sentinel"); });
  const failure = await api.request("community-events?id=event");
  assert.equal(failure.status, 503); privateResponse(failure); assert.doesNotMatch(await failure.text(), /sentinel|Private event/);
});
