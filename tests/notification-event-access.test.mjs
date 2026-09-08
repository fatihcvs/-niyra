import assert from "node:assert/strict";
import test from "node:test";
import { v2Fixture } from "./helpers/v2-api-fixture.mjs";

function setup(t, policy = "request") {
  const api = v2Fixture(t);
  api.database.prepare(`INSERT INTO communities(id,creator_email,name,slug,description,category,university_id,join_policy)
    VALUES('club','alice@example.invalid','Synthetic club','club','Synthetic only','akademik','a',?)`).run(policy);
  api.database.exec(`INSERT INTO community_members(community_id,user_email,role,status)
      VALUES('club','alice@example.invalid','founder','active'),('club','bob@example.invalid','member','active');
    INSERT INTO community_events(id,community_id,creator_email,title,description,location,starts_at)
      VALUES('event','club','alice@example.invalid','Private event title','Private event description','Synthetic room','2099-01-01T12:00:00.000Z');
    INSERT INTO notifications(id,user_email,actor_email,kind,title,body,entity_type,entity_id)
      VALUES('event-notification','bob@example.invalid','alice@example.invalid','community','Private event title','Private event description','community-event','event'),
        ('ordinary','bob@example.invalid',NULL,'system','Ordinary system message','','system',NULL);`);
  api.as("bob");
  return api;
}
async function inbox(api) {
  const response = await api.request("notifications");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.status, 200);
  return response.json();
}

test("event inbox retains accessible active/cancelled events and ordinary notifications", async t => {
  const api = setup(t);
  for (const state of ["active", "cancelled"]) {
    api.database.prepare("UPDATE community_events SET status=? WHERE id='event'").run(state);
    const body = await inbox(api);
    assert.equal(body.notifications.length, 2); assert.equal(body.unreadCount, 2);
    assert.equal(body.notifications.find(item => item.id === "event-notification").entityId, "event");
  }
});

test("event notification title, body, actor and unread count honor current target access", async t => {
  const changes = {
    left: "DELETE FROM community_members WHERE user_email='bob@example.invalid'",
    bannedMembership: "UPDATE community_members SET status='banned' WHERE user_email='bob@example.invalid'",
    ban: "INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES('club','bob@example.invalid','alice@example.invalid')",
    block: "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('bob@example.invalid','alice@example.invalid')",
    reverseBlock: "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('alice@example.invalid','bob@example.invalid')",
    inactiveCreator: "UPDATE users SET status='suspended' WHERE email='alice@example.invalid'",
    hiddenCommunity: "UPDATE communities SET moderation_status='hidden' WHERE id='club'",
    archivedCommunity: "UPDATE communities SET status='archived' WHERE id='club'",
    hiddenEvent: "UPDATE community_events SET status='hidden' WHERE id='event'",
    campusChanged: "UPDATE student_profiles SET university_id='b' WHERE user_email='bob@example.invalid'",
    missingTarget: "UPDATE notifications SET entity_id='missing' WHERE id='event-notification'",
    onboardingIncomplete: "UPDATE student_profiles SET onboarding_completed=0 WHERE user_email='bob@example.invalid'",
  };
  for (const [name, sql] of Object.entries(changes)) await t.test(name, async t => {
    const api = setup(t); api.database.exec(sql);
    const body = await inbox(api);
    assert.deepEqual(body.notifications.map(item => item.id), ["ordinary"]);
    assert.equal(body.unreadCount, 1); assert.doesNotMatch(JSON.stringify(body), /Private event|alice/);
  });
});

test("open community allows nonmember discovery and both event aliases still respect bans", async t => {
  const api = setup(t, "open");
  api.database.exec("DELETE FROM community_members WHERE user_email='bob@example.invalid'; UPDATE notifications SET entity_type='community_event' WHERE id='event-notification'");
  assert.equal((await inbox(api)).notifications.length, 2);
  api.database.exec("INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES('club','bob@example.invalid','alice@example.invalid')");
  assert.equal((await inbox(api)).notifications.length, 1);
});

test("hidden event notifications are removed before the 80 item inbox limit", async t => {
  const api = setup(t);
  api.database.exec("UPDATE community_events SET status='hidden' WHERE id='event'; UPDATE notifications SET created_at='2020-01-01' WHERE id='ordinary'");
  const insert = api.database.prepare(`INSERT INTO notifications(id,user_email,kind,title,body,entity_type,entity_id,created_at)
    VALUES(?,'bob@example.invalid','community','Private event title','Private event description','community-event','event','2099-01-01')`);
  for (let index = 0; index < 90; index++) insert.run(`hidden-${index}`);
  const body = await inbox(api);
  assert.deepEqual(body.notifications.map(item => item.id), ["ordinary"]); assert.equal(body.unreadCount, 1);
});

test("a separate blocked notification actor cannot leak through an accessible event", async t => {
  const api = setup(t, "open");
  api.database.exec(`UPDATE student_profiles SET university_id='a' WHERE user_email='other@example.invalid';
    UPDATE notifications SET actor_email='other@example.invalid' WHERE id='event-notification';
    INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('other@example.invalid','bob@example.invalid')`);
  assert.equal((await inbox(api)).notifications.length, 1);
});

test("account and campus changes discard previously read private inbox rows", async t => {
  for (const sql of ["UPDATE users SET public_id='replacement' WHERE email='bob@example.invalid'", "UPDATE student_profiles SET university_id='b' WHERE user_email='bob@example.invalid'"]) {
    await t.test(sql, async t => {
      const api = setup(t); let changed = false;
      api.beforeSql(query => {
        if (!changed && query.endsWith("SELECT 1 FROM notification_viewer")) { changed = true; api.database.exec(sql); }
      });
      const response = await api.request("notifications");
      assert.equal(changed, true); assert.equal(response.status, 409);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.doesNotMatch(await response.text(), /Private event|Ordinary system/);
    });
  }
});

test("anonymous and failed inbox reads are private and do not expose SQL details", async t => {
  const api = setup(t); api.as(null);
  const anonymous = await api.request("notifications");
  assert.equal(anonymous.status, 401); assert.equal(anonymous.headers.get("cache-control"), "private, no-store");
  api.as("bob"); api.beforeSql(() => { throw new Error("sensitive-sql-sentinel"); });
  const failure = await api.request("notifications");
  assert.equal(failure.status, 503); assert.equal(failure.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(await failure.text(), /sensitive-sql-sentinel/);
});
