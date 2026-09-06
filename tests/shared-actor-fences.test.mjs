import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/phase5-api-fixture.mjs';

function sharedFixture(t) {
  const f=fixture(t);f.database.exec(`
    INSERT INTO communities(id,creator_email,university_id,name,slug,description,category,join_policy) VALUES('community','creator@test.local','campus','Synthetic group','synthetic-group','Preserved shared group','teknoloji','open');
    INSERT INTO community_members(community_id,user_email,role,status) VALUES('community','creator@test.local','founder','active'),('community','actor@test.local','admin','active'),('community','other@test.local','member','active');
    INSERT INTO community_events(id,community_id,creator_email,title,description,location,starts_at) VALUES('event','community','creator@test.local','Shared event','A synthetic shared event','Campus','2099-01-01T00:00:00Z');
    INSERT INTO campus_places(id,university_id,creator_email,name,category,description) VALUES('place','campus','actor@test.local','Synthetic library','library','A shared campus place');
    INSERT INTO campus_events(id,university_id,creator_email,title,description,category,starts_at) VALUES('campus-event','campus','actor@test.local','Synthetic event','A shared campus event','academic','2099-01-01T00:00:00Z');
    INSERT INTO library_areas(id,university_id,creator_email,name,floor_label,zone_label,description) VALUES('area','campus','actor@test.local','Synthetic area','1','A1','A shared study area');
    INSERT INTO library_checkins(id,area_id,user_email,expires_at) VALUES('other-checkin','area','other@test.local','2099-01-01T00:00:00Z');
  `);return f;
}
const tables=['communities','community_members','community_bans','community_audit_logs','community_events','community_event_attendees','campus_places','campus_events','campus_place_confirmations','library_areas','library_checkins','audit_logs','notifications'];
const snapshot=f=>Object.fromEntries(tables.map(table=>[table,JSON.stringify(f.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())]));
const cases=[
  ...['join','leave','notification','archive','restore','update','unban','approve','reject','remove','ban','role'].map(action=>({route:'communities',method:'PATCH',payload:{id:'community',action,targetId:'other',role:'moderator',level:'mute',description:'Updated shared group description',joinPolicy:'request'},setup(f){
    if(['approve','reject'].includes(action))f.database.exec("UPDATE community_members SET status='pending' WHERE user_email='other@test.local'");
    if(action==='unban')f.database.exec("INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES('community','other@test.local','creator@test.local')");
  }})),
  {route:'communities',method:'POST',payload:{name:'New synthetic group',description:'New synthetic shared group',category:'teknoloji',joinPolicy:'open'}},
  {route:'community-events',method:'POST',payload:{communityId:'community',title:'New synthetic event',description:'New synthetic shared event',location:'Campus',startsAt:'2099-01-01T00:00:00Z'}},
  ...['cancel','rsvp'].map(action=>({route:'community-events',method:'PATCH',payload:{id:'event',action}})),
  {route:'campus-guide',method:'POST',payload:{action:'place',name:'New campus point',description:'New synthetic campus point',category:'library',accessibility:[]}},
  {route:'campus-guide',method:'POST',payload:{action:'event',name:'New campus event',description:'New synthetic campus event',category:'academic',startsAt:new Date(Date.now()+86400000).toISOString()}},
  {route:'campus-guide',method:'PATCH',payload:{action:'confirm',id:'place',state:'current'}},
  {route:'campus-guide',method:'PATCH',payload:{action:'archive-place',id:'place'}},
  {route:'campus-guide',method:'PATCH',payload:{action:'archive-event',id:'campus-event'}},
  {route:'library-occupancy',method:'POST',payload:{action:'area',name:'New study area',zoneLabel:'A2',description:'New synthetic study area',features:[]}},
  {route:'library-occupancy',method:'POST',payload:{action:'check-in',areaId:'area',durationMinutes:60}},
  {route:'library-occupancy',method:'PATCH',payload:{action:'check-out',areaId:'area'},setup(f){f.database.exec("INSERT INTO library_checkins(id,area_id,user_email,expires_at) VALUES('actor-checkin','area','actor@test.local','2099-01-01T00:00:00Z')");}},
  {route:'library-occupancy',method:'PATCH',payload:{action:'archive-area',areaId:'area'}},
];
for(const c of cases)for(const boundary of ['active','freeze','changeGeneration'])test(`${c.route} ${c.payload.action??'create'}: ${boundary} at mutation commit`,async t=>{
  const f=sharedFixture(t);c.setup?.(f);const before=snapshot(f);let fenced=false;
  if(boundary!=='active')f.beforeSql(sql=>{if(!fenced&&(sql==='BATCH'||(/^\s*(INSERT|UPDATE|DELETE)/.test(sql)&&sql.includes('active_actor.public_id')))){fenced=true;f[boundary]();}});
  const response=await f.request(c.route,c.method,c.payload);const body=await response.json();
  if(boundary==='active')assert.equal(response.status,c.method==='POST'?201:200,JSON.stringify(body));
  else {assert.ok(fenced,'Actual request reached its guarded SQL after initial authorization');assert.equal(response.status,409,JSON.stringify(body));assert.deepEqual(snapshot(f),before,'No shared rows, another member, audit or notification changed');}
});

test('remaining manager can update a container and cancel its event after creator becomes a deleted tombstone',async t=>{
  const f=sharedFixture(t);f.database.exec("UPDATE users SET status='deleted' WHERE email='creator@test.local'");
  assert.equal((await f.request('communities','PATCH',{id:'community',action:'update',description:'Managed by a remaining member',joinPolicy:'open'})).status,200);
  assert.equal((await f.request('community-events','PATCH',{id:'event',action:'cancel'})).status,200);
  assert.equal(f.count('community_members',"user_email='other@test.local'"),1);
});

test('stale actor cannot add audit details after a valid primary write and subsequent account generation change',async t=>{
  const f=sharedFixture(t);let paused=false;f.beforeSql(sql=>{if(!paused&&sql.startsWith('INSERT INTO audit_logs')){paused=true;f.changeGeneration();}});
  assert.equal((await f.request('communities','PATCH',{id:'community',action:'update',description:'Valid change before erasure',joinPolicy:'open'})).status,409);
  assert.ok(paused);assert.equal(f.count('audit_logs'),0);assert.equal(f.count('notifications'),0);
});
