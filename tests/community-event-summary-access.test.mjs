import assert from "node:assert/strict";
import test from "node:test";
import { v2Fixture } from "./helpers/v2-api-fixture.mjs";

const START = "2099-12-31T12:00:00.000Z";
const privateResponse = response => assert.equal(response.headers.get("cache-control"), "private, no-store");
function setup(t, { member = false } = {}) {
  const api = v2Fixture(t);
  // This legacy API must not depend on any new feature flag or planner data.
  api.database.exec(`UPDATE platform_settings SET value_json='false' WHERE key IN ('v2.courses','v2.communities','v2.planner');
    INSERT INTO communities(id,creator_email,name,slug,description,category,university_id,join_policy)
      VALUES('open','bob@example.invalid','Açık topluluk','summary-open','Keşfedilebilir topluluk açıklaması','akademik','a','open'),
        ('closed','bob@example.invalid','Kapalı topluluk','summary-closed','Keşfedilebilir kapalı topluluk','sosyal','a','request'),
        ('other','other@example.invalid','Başka kampüs','summary-other','Başka kampüs açıklaması','akademik','b','open');
    INSERT INTO community_members(community_id,user_email,role,status) VALUES
      ('open','bob@example.invalid','founder','active'),('closed','bob@example.invalid','founder','active'),('other','other@example.invalid','founder','active');`);
  if (member) api.database.exec("INSERT INTO community_members(community_id,user_email,role,status) VALUES('open','alice@example.invalid','member','active'),('closed','alice@example.invalid','member','active')");
  function event(id, communityId, { title = `Özel etkinlik ${id}`, startsAt = START, status = "active", creator = communityId === "other" ? "other" : "bob" } = {}) {
    api.database.prepare(`INSERT INTO community_events(id,community_id,creator_email,title,description,location,starts_at,status)
      VALUES(?,?,?,?,'Sentetik özel etkinlik açıklaması','Sentetik salon',?,?)`).run(id,communityId,`${creator}@example.invalid`,title,startsAt,status);
  }
  event("open-event","open"); event("closed-event","closed"); event("other-event","other");
  async function read(path="communities", status=200) {
    const response=await api.request(path); privateResponse(response);
    assert.equal(response.status,status,await response.clone().text()); return response.json();
  }
  const push=api.load("lib/push-target-access.ts");
  const target=(id,email="alice@example.invalid")=>push.pushTargetHref(api.DB,email,"community-event",id);
  return {api,event,read,target};
}

test("open outsiders discover events, closed outsiders retain community metadata without private event summaries", async t=>{
  const {api,read,target}=setup(t);
  const list=await read(); assert.equal(list.communities.length,2); assert.equal(list.stats.total,2); assert.equal(list.stats.upcomingEvents,1);
  for(const id of ["open","closed"]) {
    const card=list.communities.find(row=>row.id===id),detail=(await read(`communities?id=${id}`)).community;
    assert.equal(card.name,id==="open"?"Açık topluluk":"Kapalı topluluk");
    assert.equal(card.eventCount,id==="open"?1:0); assert.deepEqual(detail.nextEvent,card.nextEvent);
    assert.equal(detail.eventCount,card.eventCount);
    if(id==="closed") {assert.equal(card.nextEvent,null); assert.equal(await target("closed-event"),null); await read("community-events?id=closed-event",403);}
    else {assert.equal(card.nextEvent.title,"Özel etkinlik open-event"); assert.equal(card.nextEvent.startsAt,START); await read("community-events?id=open-event"); assert.equal(await target("open-event"),"/?view=communities&communityEvent=open-event");}
  }
  api.database.exec("INSERT INTO community_members(community_id,user_email,role,status) VALUES('closed','alice@example.invalid','member','active')");
  const joined=await read(); assert.equal(joined.stats.upcomingEvents,2); assert.equal((await read("communities?id=closed")).community.eventCount,1); await read("community-events?id=closed-event");
  assert.equal(await target("closed-event"),"/?view=communities&communityEvent=closed-event");
  api.as("other"); const other=await read(); assert.deepEqual(other.communities.map(row=>row.id),["other"]); assert.equal(other.stats.upcomingEvents,1);
  await read("communities?id=open",404); await read("community-events?id=open-event",404);
  assert.equal(await target("open-event","other@example.invalid"),null);
});

test("each current event ACL revocation removes titles and counts together while preserving allowed metadata", async t=>{
  const cases = {
    forwardBlock: "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('alice@example.invalid','bob@example.invalid')",
    reverseBlock: "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('bob@example.invalid','alice@example.invalid')",
    passiveCreator: "UPDATE users SET status='suspended' WHERE email='bob@example.invalid'",
    hiddenEvent: "UPDATE community_events SET status='hidden' WHERE community_id IN ('open','closed')",
    bannedMembership: "UPDATE community_members SET status='banned' WHERE user_email='alice@example.invalid'",
  };
  for(const [name,sql] of Object.entries(cases)) await t.test(name,async t=>{
    const {api,read,target}=setup(t,{member:true}); api.database.exec(sql);
    const list=await read(); assert.equal(list.communities.length,2); assert.equal(list.stats.upcomingEvents,0);
    for(const id of ["open","closed"]) {
      const card=list.communities.find(row=>row.id===id),detail=(await read(`communities?id=${id}`)).community;
      assert.equal(card.eventCount,0); assert.equal(card.nextEvent,null); assert.equal(detail.eventCount,0); assert.equal(detail.nextEvent,null);
      await read(`community-events?id=${id}-event`,404); assert.equal(await target(`${id}-event`),null);
    }
    assert.doesNotMatch(JSON.stringify(list),/Özel etkinlik/);
  });
});

test("community bans, moderation and archive keep existing discovery visibility and hide all event summaries", async t=>{
  for(const [name,sql] of Object.entries({
    explicitBan:"INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES('open','alice@example.invalid','bob@example.invalid'),('closed','alice@example.invalid','bob@example.invalid')",
    moderation:"UPDATE communities SET moderation_status='hidden' WHERE university_id='a'",
    archived:"UPDATE communities SET status='archived' WHERE university_id='a'",
  })) await t.test(name,async t=>{
    const {api,read,target}=setup(t,{member:true}); api.database.exec(sql);
    const list=await read(); assert.deepEqual(list.communities,[]); assert.equal(list.stats.upcomingEvents,0);
    await read("communities?id=open",404); await read("community-events?id=open-event",404); assert.equal(await target("open-event"),null);
  });
  await t.test("archived manager metadata remains available with zero upcoming events",async t=>{
    const {api,read}=setup(t,{member:true});
    api.database.exec("UPDATE community_members SET role='moderator' WHERE community_id='open' AND user_email='alice@example.invalid'; UPDATE communities SET status='archived' WHERE id='open'");
    const body=await read("communities?id=open"); assert.equal(body.community.status,"archived"); assert.equal(body.community.eventCount,0); assert.equal(body.community.nextEvent,null);
  });
});

test("cancelled and past events remain explicit detail targets but do not count as upcoming active events", async t=>{
  const {api,read,target}=setup(t,{member:true});
  api.database.exec("UPDATE community_events SET status='cancelled' WHERE id='open-event'; UPDATE community_events SET starts_at='2000-01-01T12:00:00.000Z' WHERE id='closed-event'");
  const list=await read(); assert.equal(list.stats.upcomingEvents,0);
  for(const card of list.communities) {assert.equal(card.eventCount,0);assert.equal(card.nextEvent,null);}
  assert.equal((await read("community-events?id=open-event")).event.status,"cancelled");
  await read("community-events?id=closed-event"); assert.equal(await target("open-event"),"/?view=communities&communityEvent=open-event");
});

test("ACL precedes earliest selection and normalized timestamp ties select the same title and date by stable id", async t=>{
  const {api,event,read}=setup(t,{member:true}); api.database.exec("DELETE FROM community_events");
  event("hidden-earliest","open",{startsAt:"2099-12-31T09:00:00.000Z",status:"hidden"});
  event("blocked-early","open",{startsAt:"2099-12-31T10:00:00.000Z",creator:"other"});
  api.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('alice@example.invalid','other@example.invalid')");
  event("cancelled-early","open",{startsAt:"2099-12-31T11:00:00.000Z",status:"cancelled"});
  event("z-tie","open",{title:"Sonradan seçilmemeli",startsAt:"2099-12-31T15:00:00.000Z"});
  event("a-tie","open",{title:"Eşit saatte sabit ilk kayıt",startsAt:"2099-12-31 15:00:00"});
  event("next","open",{title:"Daha sonraki erişilebilir",startsAt:"2099-12-31T16:00:00.000Z"});
  for(const suffix of ["", "?sort=new", "?sort=members", "?q=Açık", "?mine=1", "?category=akademik"]) {
    const list=await read(`communities${suffix}`),card=list.communities.find(row=>row.id==="open");
    assert.equal(list.stats.upcomingEvents,3); assert.equal(card.eventCount,3);
    assert.deepEqual(card.nextEvent,{title:"Eşit saatte sabit ilk kayıt",startsAt:"2099-12-31 15:00:00"});
    assert.doesNotMatch(JSON.stringify(list),/Özel etkinlik hidden|Özel etkinlik blocked|Özel etkinlik cancelled/);
  }
  const detail=(await read("communities?id=open")).community; assert.equal(detail.eventCount,3); assert.equal(detail.nextEvent.title,"Eşit saatte sabit ilk kayıt");
});

test("generation, campus, account status and onboarding races close list and detail responses before delivery", async t=>{
  const changes={
    generation:"UPDATE users SET public_id='new-alice-generation' WHERE email='alice@example.invalid'",
    campus:"UPDATE student_profiles SET university_id='b',department_id='db' WHERE user_email='alice@example.invalid'",
    status:"UPDATE users SET status='suspended' WHERE email='alice@example.invalid'",
    onboarding:"UPDATE student_profiles SET onboarding_completed=0 WHERE user_email='alice@example.invalid'",
  };
  for(const [name,sql] of Object.entries(changes)) for(const detail of [false,true]) await t.test(`${name}/${detail?"detail":"list"}`,async t=>{
    const {api,read}=setup(t,{member:true}); let changed=false;
    api.beforeSql(query=>{
      const late=detail ? query.includes("d.name AS department_name") : query.includes("AS upcoming_events");
      if(!changed&&late){changed=true;api.database.exec(sql);}
    });
    const body=await read(detail?"communities?id=open":"communities",409);
    assert.equal(changed,true); assert.doesNotMatch(JSON.stringify(body),/Özel etkinlik|Açık topluluk|Sentetik salon/);
    assert.match(body.error,/Hesap veya kampüs bilgisi değişti/);
  });
});

test("anonymous, validation, forbidden, success and database-error responses are private no-store without raw read errors", async t=>{
  const {api,read}=setup(t,{member:true});
  api.as(null); await read("communities",401);
  for(const method of ["POST","PATCH"]) {const response=await api.request("communities",method,{}); privateResponse(response);assert.equal(response.status,401);}
  api.as("alice");
  for(const method of ["POST","PATCH"]) {
    let response=await api.request("communities",method,{});privateResponse(response);assert.equal(response.status,400);
    response=await api.request("communities",method,{}, {origin:"https://unrelated.invalid"});privateResponse(response);assert.equal(response.status,403);
  }
  const changed=await api.request("communities","PATCH",{id:"open",action:"notification",level:"mute"}); privateResponse(changed);assert.equal(changed.status,200);assert.equal((await changed.json()).level,"mute");
  await read("communities?id=not-found",404);
  api.database.exec("INSERT INTO platform_settings(key,value_json) VALUES('communityCreationOpen','true') ON CONFLICT(key) DO UPDATE SET value_json='true'");
  const created=await api.request("communities","POST",{name:"Yeni sentetik topluluk",description:"Yalnız yerel test için oluşturulan açıklama",category:"sosyal",joinPolicy:"open"}); privateResponse(created);assert.equal(created.status,201,await created.clone().text());assert.ok((await created.json()).community.id);
  api.beforeSql(()=>{throw new Error("SQL SELECT secret-title FROM private-data failed");});
  const error=await read("communities",503);assert.equal(error.error,"Topluluklara şu anda ulaşılamıyor.");assert.doesNotMatch(JSON.stringify(error),/SQL|secret-title|private-data/);
});
