import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/phase5-api-fixture.mjs';

const email=id=>`${id}@test.local`;
function setup(t) {
  const f=fixture(t);
  f.database.exec(`INSERT INTO universities(id,name,short_name,city) VALUES('elsewhere','Elsewhere','ELSE','City');
    INSERT INTO faculties(id,university_id,name,short_name) VALUES('faculty','campus','Faculty','FAC');
    UPDATE departments SET faculty_id='faculty' WHERE id='department';`);
  for(const id of ['actor','other','creator'])f.database.prepare(`INSERT INTO student_social_profiles(user_email,interests_json,intents_json,availability) VALUES(?,'["books","music"]','["coffee"]','today')`).run(email(id));
  f.meetup=(id='target',status='pending',sender='other',recipient='actor',expires='2099-01-01',created='2020-01-01')=>f.database.prepare(`INSERT INTO meetup_requests(id,sender_email,recipient_email,activity,message,campus_place,status,expires_at,created_at) VALUES(?,?,?,'coffee','Synthetic invitation','Library',?,?,?)`).run(id,email(sender),email(recipient),status,expires,created);
  f.get=(query='')=>f.modules.get('app/api/social-match/route.ts').GET(new Request(`https://kampira.test/api/social-match${query}`));
  f.patch=(decision='accepted',id='target')=>f.request('social-match','PATCH',{id,decision});
  f.post=()=>f.request('social-match','POST',{action:'request',targetPublicId:'other',activity:'coffee',message:'Synthetic invitation',campusPlace:'Library'});
  return f;
}
const body=async(response,status)=>{const payload=await response.json();assert.equal(response.status,status,JSON.stringify(payload));return payload;};
const mutationCount=f=>[f.count('audit_logs'),f.count('notifications')];

test('exact target bypasses list80 and exposes only the established participant DTO',async t=>{
  const f=setup(t);f.meetup();for(let i=0;i<81;i++)f.meetup(`new-${i}`,'pending','other','actor','2099-01-01',`2026-01-01 00:00:${String(i%60).padStart(2,'0')}`);
  const list=await body(await f.get(),200);assert.equal(list.requests.length,80);assert.ok(!list.requests.some(row=>row.id==='target'));
  const response=await f.get('?id=target');assert.equal(response.headers.get('cache-control'),'private, no-store');const exact=await body(response,200);
  assert.deepEqual(Object.keys(exact.request).sort(),['id','direction','otherPublicId','otherName','activity','message','proposedTime','campusPlace','status','expiresAt','time'].sort());
  assert.equal(exact.request.id,'target');assert.equal(exact.request.direction,'incoming');assert.equal(exact.request.otherPublicId,'other');assert.doesNotMatch(JSON.stringify(exact),/@test.local/);
});

for(const status of ['pending','accepted','declined','cancelled','expired'])test(`exact target can read ${status} without writes`,async t=>{
  const f=setup(t);f.meetup('target',status);let writes=0;f.beforeSql((_sql,_values,kind)=>{if(kind==='run'||kind==='batch')writes++;});
  const result=await body(await f.get('?id=target'),200);assert.equal(result.request.status,status);assert.equal(writes,0);assert.deepEqual(mutationCount(f),[0,0]);
});
test('past pending is effectively expired for list and target without mutating stored state',async t=>{
  const f=setup(t);f.meetup('target','pending','other','actor','2000-01-01');assert.equal((await body(await f.get('?id=target'),200)).request.status,'expired');assert.equal((await body(await f.get(),200)).requests[0].status,'expired');assert.equal(f.database.prepare('SELECT status FROM meetup_requests').get().status,'pending');
  await body(await f.patch(),409);assert.deepEqual(mutationCount(f),[0,0]);
});
for(const query of ['?id=','?id=target&id=target','?id=target&id=missing','?id=%20target','?id=target%20','?id=%00target','?id=target%0A','?id=a%2Fb',`?id=${'x'.repeat(81)}`])test(`malformed exact ID rejected without normalization: ${query.slice(0,45)}`,async t=>{const f=setup(t);f.meetup();await body(await f.get(query),400);assert.deepEqual(mutationCount(f),[0,0]);});

const privacyCases={
  outsider:f=>f.identity('creator'),
  'sender suspended':f=>f.database.exec("UPDATE users SET status='suspended' WHERE public_id='other'"),
  'sender deleting':f=>f.database.exec("UPDATE users SET status='deleting' WHERE public_id='other'"),
  'sender deleted':f=>f.database.exec("UPDATE users SET status='deleted' WHERE public_id='other'"),
  'sender onboarding':f=>f.database.exec("UPDATE student_profiles SET onboarding_completed=0 WHERE user_email='other@test.local'"),
  'viewer onboarding':f=>f.database.exec("UPDATE student_profiles SET onboarding_completed=0 WHERE user_email='actor@test.local'"),
  'sender changed campus':f=>f.database.exec("UPDATE student_profiles SET university_id='elsewhere' WHERE user_email='other@test.local'"),
  'viewer changed campus':f=>f.database.exec("UPDATE student_profiles SET university_id='elsewhere' WHERE user_email='actor@test.local'"),
  'viewer blocks sender':f=>f.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('actor@test.local','other@test.local')"),
  'sender blocks viewer':f=>f.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('other@test.local','actor@test.local')"),
};
for(const [name,mutate] of Object.entries(privacyCases))test(`exact access: ${name} is indistinguishable from missing`,async t=>{
  const f=setup(t);f.meetup();mutate(f);const denied=await body(await f.get('?id=target'),404),missing=await body(await f.get('?id=missing'),404);assert.deepEqual(denied,missing);
  const list=await f.get();if(list.status===200)assert.ok(!(await list.json()).requests.some(row=>row.id==='target'));
});
test('candidate list excludes inactive and incomplete profiles',async t=>{const f=setup(t);f.database.exec("UPDATE users SET status='suspended' WHERE public_id='other'; UPDATE student_profiles SET onboarding_completed=0 WHERE user_email='creator@test.local'");assert.equal((await body(await f.get(),200)).matches.length,0);});
for(const boundary of ['generation','campus'])test(`multi-read list discards accumulated data after actor ${boundary} changes`,async t=>{const f=setup(t);let paused=false;f.beforeSql(sql=>{if(!paused&&sql.includes('FROM student_social_profiles WHERE user_email')){paused=true;if(boundary==='generation')f.changeGeneration();else privacyCases['viewer changed campus'](f);}});await body(await f.get(),409);assert.ok(paused);});

for(const decision of ['accepted','declined','cancelled'])test(`${decision} commits once and the desired-state replay has no second side effects`,async t=>{
  const f=setup(t);f.meetup();if(decision==='cancelled')f.identity('other');const first=await body(await f.patch(decision),200),second=await body(await f.patch(decision),200);assert.equal(first.status,decision);assert.equal(first.request.id,'target');assert.equal(first.request.status,decision);assert.deepEqual(second,first);assert.deepEqual(mutationCount(f),[1,decision==='cancelled'?0:1]);
});
test('wrong-role decision cannot mutate a visible request',async t=>{const f=setup(t);f.meetup();await body(await f.patch('cancelled'),404);f.identity('other');await body(await f.patch('accepted'),404);assert.equal(f.database.prepare('SELECT status FROM meetup_requests').get().status,'pending');assert.deepEqual(mutationCount(f),[0,0]);});
test('conflicting terminal decisions return409 and preserve prior decision',async t=>{const f=setup(t);f.meetup();await body(await f.patch('accepted'),200);await body(await f.patch('declined'),409);assert.deepEqual(mutationCount(f),[1,1]);});
for(const id of [' target','target ','target\n',`${'x'.repeat(81)}`,null,12])test(`PATCH ID does not truncate or normalize ${JSON.stringify(id).slice(0,40)}`,async t=>{const f=setup(t);f.meetup();await body(await f.patch('accepted',id),400);assert.deepEqual(mutationCount(f),[0,0]);});

const races={
  'actor frozen':f=>f.freeze(),
  'actor generation replaced':f=>f.changeGeneration(),
  'peer frozen':privacyCases['sender deleting'],
  'peer generation replaced':f=>f.database.exec("UPDATE users SET public_id='other-new' WHERE public_id='other'"),
  'actor campus changed':privacyCases['viewer changed campus'],
  'peer campus changed':privacyCases['sender changed campus'],
  'peer onboarding revoked':privacyCases['sender onboarding'],
  'actor onboarding revoked':privacyCases['viewer onboarding'],
  'new actor block':privacyCases['viewer blocks sender'],
  'new peer block':privacyCases['sender blocks viewer'],
};
for(const [name,mutate] of Object.entries(races))test(`PATCH commit fence: ${name}`,async t=>{
  const f=setup(t);f.meetup();let paused=false;f.beforeSql(sql=>{if(sql==='BATCH'&&!paused){paused=true;mutate(f);}});await body(await f.patch(),409);assert.ok(paused);assert.equal(f.database.prepare('SELECT status FROM meetup_requests').get().status,'pending');assert.deepEqual(mutationCount(f),[0,0]);
});
for(const decisions of [['accepted','accepted'],['accepted','declined']])test(`concurrent decisions ${decisions.join('/')} have one winner`,async t=>{
  const f=setup(t);f.meetup();const responses=await Promise.all(decisions.map(d=>f.patch(d)));assert.deepEqual(responses.map(r=>r.status).sort(),decisions[0]===decisions[1]?[200,200]:[200,409]);assert.deepEqual(mutationCount(f),[1,1]);
});
for(const table of ['audit_logs','notifications'])test(`decision ${table} fault rolls back status and all effects`,async t=>{const f=setup(t);f.meetup();f.database.exec(`CREATE TRIGGER synthetic_fault BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic fault'); END`);await body(await f.patch(),503);assert.equal(f.database.prepare('SELECT status FROM meetup_requests').get().status,'pending');assert.deepEqual(mutationCount(f),[0,0]);});
test('lost decision batch acknowledgement recovers the actual committed canonical row',async t=>{const f=setup(t);f.meetup();const batch=f.DB.batch.bind(f.DB);let lost=false;f.DB.batch=async statements=>{const result=await batch(statements);if(!lost){lost=true;throw new Error('synthetic lost ack');}return result;};assert.equal((await body(await f.patch(),200)).request.status,'accepted');await body(await f.patch(),200);assert.deepEqual(mutationCount(f),[1,1]);});

test('POST creates one pending pair atomically and preserves the existing response contract',async t=>{const f=setup(t);const response=await body(await f.post(),201);assert.deepEqual(Object.keys(response.request).sort(),['expiresAt','id','status']);assert.equal(response.request.status,'pending');await body(await f.post(),409);assert.equal(f.count('meetup_requests'),1);assert.deepEqual(mutationCount(f),[1,1]);});
for(const name of ['sender suspended','sender deleting','sender deleted','sender onboarding','sender changed campus','viewer blocks sender','sender blocks viewer'])test(`POST initial target privacy: ${name}`,async t=>{const f=setup(t);privacyCases[name](f);await body(await f.post(),404);assert.equal(f.count('meetup_requests'),0);assert.deepEqual(mutationCount(f),[0,0]);});
test('concurrent POST requests cannot create two open requests for the same pair',async t=>{const f=setup(t);const results=await Promise.all([f.post(),f.post()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(f.count('meetup_requests'),1);assert.deepEqual(mutationCount(f),[1,1]);});
for(const [name,mutate] of Object.entries({...races,'peer discoverability revoked':f=>f.database.exec("UPDATE student_social_profiles SET is_discoverable=0 WHERE user_email='other@test.local'")}))test(`POST commit fence: ${name}`,async t=>{const f=setup(t);let paused=false;f.beforeSql(sql=>{if(sql==='BATCH'&&!paused){paused=true;mutate(f);}});await body(await f.post(),409);assert.ok(paused);assert.equal(f.count('meetup_requests'),0);assert.deepEqual(mutationCount(f),[0,0]);});
for(const table of ['audit_logs','notifications'])test(`POST ${table} fault rolls back request and all effects`,async t=>{const f=setup(t);f.database.exec(`CREATE TRIGGER synthetic_fault BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic fault'); END`);await body(await f.post(),503);assert.equal(f.count('meetup_requests'),0);assert.deepEqual(mutationCount(f),[0,0]);});
test('lost creation batch acknowledgement recovers the same201 ID without another send',async t=>{const f=setup(t);const batch=f.DB.batch.bind(f.DB);f.DB.batch=async statements=>{await batch(statements);throw new Error('synthetic lost ack');};const payload=await body(await f.post(),201);assert.equal(payload.request.id,f.database.prepare('SELECT id FROM meetup_requests').get().id);assert.deepEqual(mutationCount(f),[1,1]);});
for(const boundary of ['active','actor generation replaced','actor frozen','actor campus changed'])test(`social profile upsert is generation and campus fenced: ${boundary}`,async t=>{
  const f=setup(t);let paused=false;f.beforeSql(sql=>{if(sql==='BATCH'&&!paused){paused=true;races[boundary]?.(f);}});await body(await f.request('social-match','POST',{action:'save-profile',interests:['music','cinema'],intents:['study'],bio:'Changed profile',availability:'week'}),boundary==='active'?200:409);assert.equal(f.database.prepare("SELECT social_bio FROM student_social_profiles WHERE user_email='actor@test.local'").get().social_bio,boundary==='active'?'Changed profile':'');assert.deepEqual(mutationCount(f),[boundary==='active'?1:0,0]);
});
