import assert from "node:assert/strict";
import test from "node:test";
import { v2Fixture } from "./helpers/v2-api-fixture.mjs";

test("beta revocation discards event details, community summaries and notifications already read", async t => {
  for (const path of ["community-events?id=event", "communities?id=club", "communities", "notifications"]) await t.test(path, async t => {
    const api = v2Fixture(t);
    api.database.exec(`INSERT INTO communities(id,creator_email,name,slug,description,category,university_id,join_policy)
      VALUES('club','alice@example.invalid','Synthetic club','club','Synthetic only','akademik','a','open');
      INSERT INTO community_events(id,community_id,creator_email,title,description,location,starts_at)
      VALUES('event','club','alice@example.invalid','Private beta event','Private description','Synthetic room','2099-01-01T12:00:00.000Z');
      INSERT INTO test_accounts(id,user_email,kind,status) VALUES('beta-account','bob@example.invalid','generated','active');
      UPDATE platform_settings SET value_json='true' WHERE key='betaAccessOnly';
      INSERT INTO notifications(id,user_email,kind,title,body,entity_type,entity_id)
      VALUES('notice','bob@example.invalid','community','Private beta event','Private description','community-event','event')`);
    api.as('bob'); let changed = false;
    api.beforeSql(sql => {
      if (!changed && (sql.endsWith('SELECT 1 FROM event_viewer') || sql.endsWith('SELECT 1 FROM notification_viewer'))) {
        changed = true;
        api.database.exec("UPDATE test_accounts SET status='revoked' WHERE id='beta-account'");
      }
    });
    const response = await api.request(path);
    assert.equal(changed, true); assert.equal(response.status, 409);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(await response.text(), /Private beta|Private description|Synthetic club/);
  });
});
