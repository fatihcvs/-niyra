import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const migrations = await Promise.all((await readdir(new URL('drizzle/', root))).filter(name => /^\d+.*\.sql$/.test(name)).sort().map(name => readFile(new URL(`drizzle/${name}`, root), 'utf8')));
const paths = ['lib/account-deletion.ts','lib/account-erasure.ts','lib/account-erasure-inventory.ts','lib/app-auth.ts','lib/staff-auth.ts','lib/server-api.ts','app/api/admin/account-deletion/route.ts'];
const sources = Object.fromEntries(await Promise.all(paths.map(async path => [path, ts.transpileModule(await readFile(new URL(path, root),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText])));
function load(path,deps={}) {
 const exports={}; runInNewContext(sources[path],{exports,crypto,Response,Request,Headers,URL,TextEncoder,TextDecoder,Uint8Array,btoa,atob,require(name){assert.ok(name in deps,`Unexpected dependency ${name}`);return deps[name];}}); return exports;
}
const deletion=load('lib/account-deletion.ts');
const inventory=load('lib/account-erasure-inventory.ts');
const erasure=load('lib/account-erasure.ts',{'./account-deletion':deletion,'./account-erasure-inventory':inventory});
const appAuth=load('lib/app-auth.ts');
const email='subject@test.local', peer='peer@test.local';

function fixture(t) {
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');for(const migration of migrations)sql.exec(migration);
 sql.exec(`INSERT INTO users(email,public_id,display_name,handle) VALUES ('${email}','subject-id','Subject Person','subject'),('${peer}','peer-id','Peer Person','peer');
 INSERT INTO universities(id,name,short_name,city) VALUES ('uni','University','UNI','City');
 INSERT INTO faculties(id,university_id,name,short_name) VALUES ('faculty','uni','Faculty','F');
 INSERT INTO departments(id,faculty_id,name) VALUES ('department','faculty','Department');
 INSERT INTO courses(id,department_id,code,name) VALUES ('course','department','C1','Course');
 INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES ('${email}','uni','department',1),('${peer}','uni','department',1);
 INSERT INTO staff_accounts(id,username,display_name,role,password_hash,password_salt,password_iterations,must_change_password) VALUES ('owner','owner','Owner','owner','hash','salt',1000,0),('admin','admin','Admin','admin','hash','salt',1000,0);
 INSERT INTO account_deletion_requests(id,user_email,status,note) VALUES ('request-erasure-01','${email}','in_review','Erase my account');
 INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES ('subject-session','${email}','2099-01-01');
 INSERT INTO push_subscriptions(id,owner_email,session_hash,device_id,kind,endpoint_hash,token) VALUES ('push-sub','${email}','subject-session','device-generation','fcm','endpoint-hash','synthetic-token');`);
 const errors=[];let loseAck=null;let failQuery=null;
 const DB={prepare(query){const bound=values=>({query,values,bind(...next){return bound(next);},async first(){try{return sql.prepare(query).get(...values)??null;}catch(e){errors.push({query,message:e.message});throw e;}},async all(){return{results:sql.prepare(query).all(...values)};},async run(){try{if(failQuery?.(query))throw Error('Synthetic database fault');return{success:true,meta:sql.prepare(query).run(...values)};}catch(e){errors.push({query,message:e.message});throw e;}}});return bound([]);},async batch(statements){sql.exec('BEGIN');let result;try{result=statements.map(({query,values})=>{if(failQuery?.(query))throw Error('Synthetic database fault');return{success:true,meta:sql.prepare(query).run(...values)};});sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');errors.push({message:e.message});throw e;}if(loseAck&&statements.some(s=>loseAck(s.query))){loseAck=null;throw Error('Synthetic committed ACK lost');}return result;}};
 const objects=new Map();const deleted=[];let deleteFailure=false;let deleteAckLost=false;let headPresent=false;let listFailure=false;let deleteHook=null;
 const FILES={async list({cursor,limit=100}={}){if(listFailure)throw Error('Synthetic list unavailable');const keys=[...objects.keys()].sort().filter(key=>!cursor||key>cursor);const selected=keys.slice(0,limit);return{objects:selected.map(key=>({key,customMetadata:objects.get(key).metadata})),truncated:keys.length>limit,cursor:selected.at(-1)};},async delete(key){deleted.push(key);if(deleteHook)await deleteHook(key);if(deleteFailure)throw Error('Synthetic delete unavailable');objects.delete(key);if(deleteAckLost){deleteAckLost=false;throw Error('Synthetic delete ACK lost');}},async head(key){return headPresent?{key}:objects.has(key)?{key}:null;}};
 const server=load('lib/server-api.ts',{'../app/chatgpt-auth':{}});
 const runtime={...server,getRuntime:async()=>({DB,FILES})};
 const staff=load('lib/staff-auth.ts',{'./app-auth':appAuth,'./server-api':runtime});
 const route=load('app/api/admin/account-deletion/route.ts',{'../../../../lib/account-deletion':deletion,'../../../../lib/account-erasure':erasure,'../../../../lib/server-api':runtime,'../../../../lib/staff-auth':staff});
 return {sql,DB,FILES,objects,deleted,errors,put(key,metadata={owner:email}){objects.set(key,{metadata,bytes:new Uint8Array([1,2,3])});},setDeleteHook(v){deleteHook=v;},setDeleteFailure(v){deleteFailure=v;},loseDeleteAck(){deleteAckLost=true;},setHeadPresent(v){headPresent=v;},setListFailure(v){listFailure=v;},loseAck(predicate){loseAck=predicate;},failQuery(predicate){failQuery=predicate;},
  accept:()=>erasure.acceptAccountErasure(DB,'owner','request-erasure-01'),resume:(id,options)=>erasure.resumeAccountErasure(DB,FILES,'owner',id,options),
  async api(method,payload,{role='owner',context=true,origin='https://kampira.test',cookie:cookieOverride}={}){const cookie=cookieOverride??(await staff.createStaffSession(DB,role,new Request('https://kampira.test'))).cookie.split(';')[0];const headers=new Headers({cookie,origin,'content-type':'application/json'});if(context)headers.set('X-Staff-Context',typeof context==='string'?context:await staff.staffAccountContext(headers,role));return route[method](new Request('https://kampira.test/api/admin/account-deletion',{method,headers,...(method==='GET'?{}:{body:JSON.stringify(payload)})}));},
 };
}
function seedShared(f) {
 f.sql.exec(`INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email) VALUES ('conversation','uni','${peer}','${email}');
 INSERT INTO direct_messages(id,conversation_id,sender_email,body) VALUES ('subject-message','conversation','${email}','private subject body'),('peer-message','conversation','${peer}','Keep this peer body');
 INSERT INTO posts(id,author_email,content) VALUES ('subject-post','${email}','subject post text'),('peer-post','${peer}','Keep peer post');
 INSERT INTO post_comments(id,post_id,author_email,content) VALUES ('peer-comment','subject-post','${peer}','Keep peer reply'),('subject-comment','peer-post','${email}','subject reply');
 INSERT INTO notes(id,owner_email,course_id,title,object_key,original_file_name,content_type,byte_size,status) VALUES ('subject-note','${email}','course','private title','notes/subject@test.local/note.pdf','Private.pdf','application/pdf',3,'published'),('subject-note-two','${email}','course','private title2','notes/subject@test.local/note2.pdf','Private2.pdf','application/pdf',3,'published');
 INSERT INTO note_comments(id,note_id,author_email,content) VALUES ('peer-note-comment','subject-note','${peer}','Keep note reply');
 INSERT INTO communities(id,creator_email,name,slug,description) VALUES ('community','${email}','Personal community','personal-community','personal description');
 INSERT INTO community_members(community_id,user_email,role) VALUES ('community','${peer}','moderator'),('community','${email}','owner');
 INSERT INTO community_events(id,community_id,creator_email,title,starts_at) VALUES ('community-event','community','${email}','private event','2099-01-01');
 INSERT INTO community_event_attendees(event_id,user_email) VALUES ('community-event','${peer}');
 INSERT INTO community_bans(community_id,user_email,banned_by_email,reason) VALUES ('community','${peer}','${email}','private reason');
 INSERT INTO campus_places(id,university_id,creator_email,name,category) VALUES ('place','uni','${email}','private place','study');
 INSERT INTO housing_discussions(id,place_id,author_email,content) VALUES ('peer-housing','place','${peer}','Keep housing reply');
 INSERT INTO library_areas(id,university_id,creator_email,name,place_id) VALUES ('library','uni','${email}','private library','place');
 INSERT INTO library_checkins(id,area_id,user_email,expires_at) VALUES ('peer-checkin','library','${peer}','2099-01-01');
 INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description) VALUES ('listing','uni','${email}','sell','books','private listing','private description');
 INSERT INTO marketplace_inquiries(id,listing_id,sender_email,message) VALUES ('peer-inquiry','listing','${peer}','Keep inquiry');
 INSERT INTO content_reports(id,reporter_email,entity_type,entity_id,reason,details,evidence_json) VALUES ('report','${peer}','post','subject-post','spam','private snapshot','{"nested":{"owner":"${email}"}}');
 INSERT INTO notifications(id,user_email,actor_email,kind,title,body,entity_type,entity_id) VALUES ('notice','${peer}','${email}','comment','Subject Person replied','private snapshot','post','subject-post');
 INSERT INTO audit_logs(id,actor_email,action,detail) VALUES ('own-audit','${email}','test','{"private":"data"}'),('peer-audit','${peer}','test','{"nested":{"email":"${email}"}}');
 INSERT INTO community_audit_logs(id,community_id,actor_email,action,target_email,detail) VALUES ('community-audit','community','${peer}','test','${email}','{"private":"snapshot"}');
 UPDATE direct_messages SET attachment_type='note',attachment_id='subject-note',attachment_snapshot='{"title":"Private.pdf","owner":"${email}"}' WHERE id='peer-message';`);
 f.put('notes/subject@test.local/note.pdf');f.put('notes/subject@test.local/note2.pdf');
}
async function complete(f,id) {let job;for(let step=0;step<15;step++){job=await f.resume(id);if(job.state==='completed')return job;if(job.lastErrorCode)break;}assert.fail(`Erasure incomplete ${JSON.stringify(job)}; ${JSON.stringify(f.errors)}`);}

test('explicit inventory covers every pre-erasure direct users foreign key',t=>{const f=fixture(t);const actual=f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().flatMap(({name})=>f.sql.prepare(`PRAGMA foreign_key_list(${name})`).all().filter(ref=>ref.table==='users').map(ref=>`${name}.${ref.from}`)).sort();const declared=Array.from(inventory.ERASURE_USER_RELATIONS).flatMap(([table,...columns])=>columns.map(c=>`${table}.${c}`)).sort();assert.deepEqual(declared,actual);});

test('real SQLite preserves peer messages, replies, inquiries and shared containers, erases original PII and purges receipt manifests',async t=>{const f=fixture(t);seedShared(f);const job=await f.accept();assert.equal(f.sql.prepare('SELECT status FROM users WHERE email=?').get(email).status,'deleting');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_sessions WHERE user_email=?').get(email).n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);const done=await complete(f,job.id);assert.equal(done.removedObjectCount,2);assert.ok(done.preservedContainerCount>=8);assert.equal(f.sql.prepare("SELECT body,attachment_snapshot FROM direct_messages WHERE id='peer-message'").get().body,'Keep this peer body');assert.equal(f.sql.prepare("SELECT attachment_snapshot FROM direct_messages WHERE id='peer-message'").get().attachment_snapshot,'{}');for(const table of ['post_comments','note_comments','marketplace_inquiries','community_event_attendees','housing_discussions','library_checkins'])assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1);assert.equal(f.sql.prepare("SELECT erased_university_id FROM posts WHERE id='subject-post'").get().erased_university_id,'uni');assert.equal(f.sql.prepare("SELECT erased_university_id FROM notes WHERE id='subject-note'").get().erased_university_id,'uni');assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM notes WHERE object_key='' AND status='rejected'").get().n,2);const anonymous=f.sql.prepare("SELECT * FROM users WHERE status='deleted'").get();assert.equal(anonymous.public_id,null);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM student_profiles WHERE user_email=?').get(anonymous.email).n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_credentials WHERE user_email=?').get(anonymous.email).n,0);const conversation=f.sql.prepare('SELECT * FROM direct_conversations').get();assert.ok(conversation.member_one_email<conversation.member_two_email);assert.ok([conversation.member_one_email,conversation.member_two_email].includes(peer));for(const {name}of f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){const rows=f.sql.prepare(`SELECT * FROM ${name}`).all();assert.ok(!JSON.stringify(rows).includes(email),`${name} retains original email`);}for(const table of ['account_erasure_subjects','account_erasure_objects','account_erasure_entities','media_upload_operations'])assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);assert.deepEqual(await f.resume(job.id),done);});

test('request execute/cancel race and duplicate/lost-ACK acceptance have one winner and no duplicate freeze',async t=>{const f=fixture(t);f.loseAck(query=>query.startsWith('INSERT INTO account_erasure_jobs'));const [first,second]=await Promise.all([f.accept(),f.accept()]);assert.equal(first.id,second.id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM account_erasure_jobs').get().n,1);await assert.rejects(deletion.cancelAccountDeletionRequest(f.DB,email,'request-erasure-01'),e=>e.status===409);assert.equal(f.sql.prepare('SELECT status FROM account_deletion_requests').get().status,'in_review');});

test('cancelled/requested requests and non-owner execution cannot freeze an account',async t=>{const f=fixture(t);await assert.rejects(erasure.acceptAccountErasure(f.DB,'admin','request-erasure-01'),e=>e.status===403);f.sql.exec("UPDATE account_deletion_requests SET status='requested'");await assert.rejects(f.accept(),e=>e.status===409);await deletion.cancelAccountDeletionRequest(f.DB,email,'request-erasure-01');await assert.rejects(f.accept(),e=>e.status===409);assert.equal(f.sql.prepare('SELECT status FROM users WHERE email=?').get(email).status,'active');});

test('late generic PUT stays blocked despite absent HEAD and elapsed time; fulfilled settlement permits cleanup',async t=>{const f=fixture(t);f.sql.prepare("INSERT INTO media_upload_operations(id,owner_email,owner_public_id,object_key,kind,state) VALUES ('upload',?,'subject-id','posts/future/image.png','post','putting')").run(email);const job=await f.accept();let pending=await f.resume(job.id,{now:()=>Date.now()+86400000});assert.equal(pending.state,'blocked');assert.equal(pending.lastErrorCode,'UPLOAD_UNRESOLVED');assert.equal(f.deleted.length,0);f.put('posts/future/image.png',{});f.sql.exec("UPDATE media_upload_operations SET state='settled',settled_at=CURRENT_TIMESTAMP WHERE id='upload'");const done=await complete(f,job.id);assert.equal(done.state,'completed');assert.equal(f.objects.size,0);});

test('unknown rejected PUT remains quarantined and does not falsely complete even if bytes exist',async t=>{const f=fixture(t);f.sql.prepare("INSERT INTO media_upload_operations(id,owner_email,owner_public_id,object_key,kind,state) VALUES ('unknown',?,'subject-id','profiles/future/photo.png','profile','unknown')").run(email);f.put('profiles/future/photo.png');const job=await f.accept();for(let i=0;i<3;i++)assert.equal((await f.resume(job.id)).lastErrorCode,'UPLOAD_UNRESOLVED');assert.equal(f.objects.size,1);assert.equal(f.deleted.length,0);});

test('storage delete failure, absent acknowledgement and nonempty HEAD all retain resumable state',async t=>{const f=fixture(t);f.put('profiles/orphan/old.png');const job=await f.accept();f.setDeleteFailure(true);assert.equal((await f.resume(job.id)).state,'storage_pending');assert.equal(f.objects.size,1);f.setDeleteFailure(false);f.loseDeleteAck();assert.equal((await f.resume(job.id)).state,'storage_pending');f.setHeadPresent(true);assert.equal((await f.resume(job.id)).state,'storage_pending');f.setHeadPresent(false);assert.equal((await complete(f,job.id)).state,'completed');});

test('failed replacement and legacy market metadata are exact-owner scoped; missing ambiguous ownership blocks',async t=>{const f=fixture(t);f.put('profiles/subject-test-local/old.png');f.put('market/subject@test.local/listing/legacy.png');f.put('profiles/subject-test-local/other-owner.png',{owner:peer});const job=await f.accept();await complete(f,job.id);assert.equal(f.objects.size,1);assert.ok(f.objects.has('profiles/subject-test-local/other-owner.png'));const g=fixture(t);g.put('profiles/subject-test-local/ambiguous.png',{});const blocked=await g.resume((await g.accept()).id);assert.equal(blocked.lastErrorCode,'LEGACY_OWNERSHIP_UNKNOWN');assert.equal(g.deleted.length,0);});

test('legacy post/market pending manifests cannot be erased as settled and active write fences reject paused SQL',async t=>{const f=fixture(t);f.sql.exec(`INSERT INTO posts(id,author_email,content) VALUES ('post','${email}','x');
 INSERT INTO post_publish_requests(id,author_email,idempotency_key,payload_hash,post_id) VALUES ('publish','${email}','idempotency-key','${'a'.repeat(64)}','future');
 INSERT INTO post_publish_attempts(id,request_id,object_key) VALUES ('attempt','publish','posts/future/late.png');
 INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description) VALUES ('listing','uni','${email}','sell','book','x','x');
 INSERT INTO market_media_requests(owner_email,idempotency_key,university_id,listing_id,payload_hash) VALUES ('${email}','market-key','uni','listing','${'b'.repeat(64)}');
 INSERT INTO market_media_attempts(id,owner_email,idempotency_key) VALUES ('market-attempt','${email}','market-key');
 INSERT INTO market_media_attempt_objects(image_id,attempt_id,ordinal,object_key) VALUES ('image','market-attempt',0,'market/attempts/late.png');`);const job=await f.accept();for(const query of [`INSERT INTO posts(id,author_email,content) VALUES ('late','${email}','x')`,`UPDATE student_profiles SET bio='late' WHERE user_email='${email}'`,`INSERT INTO post_media(id,post_id,kind,object_key,original_file_name,content_type,byte_size) VALUES ('late','post','image','late','late','image/png',3)`,`INSERT INTO post_comments(id,post_id,author_email,content) VALUES ('late-comment','post','${peer}','x')`,`UPDATE users SET status='active' WHERE email='${email}'`])assert.throws(()=>f.sql.exec(query),/ACCOUNT_ERASURE_FROZEN/);assert.equal((await f.resume(job.id)).lastErrorCode,'UPLOAD_UNRESOLVED');});

test('final transaction failure rolls back data preservation and purge; lost final ACK returns the completed receipt',async t=>{const f=fixture(t);seedShared(f);const job=await f.accept();f.failQuery(query=>query.startsWith('DELETE FROM users'));let failed;for(let i=0;i<6;i++){failed=await f.resume(job.id);if(failed.lastErrorCode)break;}assert.equal(failed.state,'storage_pending');assert.equal(failed.lastErrorCode,'ERASURE_RETRY_REQUIRED');assert.ok(f.errors.length>0);assert.equal(f.sql.prepare("SELECT content FROM posts WHERE id='subject-post'").get().content,'subject post text');assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM users WHERE status='deleted'").get().n,0);f.failQuery(null);f.loseAck(query=>query.startsWith('DELETE FROM users'));assert.equal((await complete(f,job.id)).state,'completed');});

test('all five current media families and settled post/market orphan ledgers are copied before source removal',async t=>{const f=fixture(t);f.sql.exec(`
 INSERT INTO notes(id,owner_email,course_id,title,object_key,original_file_name,content_type,byte_size,status) VALUES ('note','${email}','course','n','notes/live.pdf','n.pdf','application/pdf',3,'published');
 INSERT INTO profile_media(user_email,kind,object_key,original_file_name,content_type,byte_size) VALUES ('${email}','avatar','profiles/live.png','a.png','image/png',3);
 INSERT INTO campus_pulse_posts(id,author_email,university_id,kind,content,image_object_key) VALUES ('pulse','${email}','uni','post','x','pulse/live.png');
 INSERT INTO posts(id,author_email,content) VALUES ('post','${email}','x');
 INSERT INTO post_media(id,post_id,kind,object_key,original_file_name,content_type,byte_size) VALUES ('photo','post','image','posts/post/live.png','p.png','image/png',3);
 INSERT INTO post_publish_requests(id,author_email,idempotency_key,payload_hash,post_id) VALUES ('publish','${email}','publish-key','${'a'.repeat(64)}','orphan-post');
 INSERT INTO post_publish_attempts(id,request_id,object_key,state) VALUES ('attempt','publish','posts/orphan/settled.png','cleanup');
 INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description) VALUES ('listing','uni','${email}','sell','book','x','x');
 INSERT INTO marketplace_listing_images(id,listing_id,uploader_email,object_key,original_file_name,content_type,byte_size) VALUES ('market-photo','listing','${email}','market/live.png','m.png','image/png',3);
 INSERT INTO market_media_requests(owner_email,idempotency_key,university_id,listing_id,payload_hash) VALUES ('${email}','market-key','uni','listing','${'b'.repeat(64)}');
 INSERT INTO market_media_attempts(id,owner_email,idempotency_key,puts_settled) VALUES ('market-attempt','${email}','market-key',1);
 INSERT INTO market_media_attempt_objects(image_id,attempt_id,ordinal,object_key) VALUES ('old-image','market-attempt',0,'market/orphan/settled.png');
 INSERT INTO market_media_tombstones(image_id,owner_email,university_id,listing_id,object_key) VALUES ('removed-image','${email}','uni','listing','market/removed/settled.png');`);
 const keys=['notes/live.pdf','profiles/live.png','pulse/live.png','posts/post/live.png','posts/orphan/settled.png','market/live.png','market/orphan/settled.png','market/removed/settled.png'];for(const key of keys)f.put(key,key.startsWith('posts/')?{}:{owner:email});const job=await f.accept();assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM account_erasure_objects').get().n,8);const done=await complete(f,job.id);assert.equal(done.removedObjectCount,8);assert.deepEqual([...new Set(f.deleted)].sort(),keys.sort());assert.equal(f.objects.size,0);});

test('concurrent resumes share a lease and an expired former worker cannot replace the successor receipt',async t=>{const f=fixture(t);f.put('profiles/delayed.png');const job=await f.accept();let release,started;const entered=new Promise(resolve=>{started=resolve;});const gate=new Promise(resolve=>{release=resolve;});let once=true;f.setDeleteHook(async()=>{if(once){once=false;started();await gate;}});const first=f.resume(job.id);await entered;const parallel=await f.resume(job.id);assert.notEqual(parallel.state,'completed');assert.equal(f.deleted.length,1);await f.resume(job.id,{now:()=>Date.now()+120000});release();await first;f.setDeleteHook(null);const done=await complete(f,job.id);assert.equal(done.removedObjectCount,1);assert.equal(f.sql.prepare('SELECT lease_token FROM account_erasure_jobs').get().lease_token,null);});

test('durable snapshot scan handles over100 rows and rejects new frozen-subject structured copies',async t=>{const f=fixture(t);for(let i=0;i<205;i++)f.sql.prepare('INSERT INTO audit_logs(id,actor_email,action,detail) VALUES (?, ?, ?, ?)').run(`audit-${String(i).padStart(3,'0')}`,peer,'test',JSON.stringify({owner:email}));const job=await f.accept();assert.throws(()=>f.sql.prepare('INSERT INTO audit_logs(id,actor_email,action,detail) VALUES (?, ?, ?, ?)').run('late-copy',peer,'test',JSON.stringify({owner:email})),/ACCOUNT_ERASURE_FROZEN/);const done=await complete(f,job.id);assert.equal(done.state,'completed');assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM audit_logs WHERE detail!='{}'").get().n,0);});

test('old pending jobs and visible request mappings remain recoverable beyond50 newer completed receipts',async t=>{const f=fixture(t);const job=await f.accept();for(let i=0;i<60;i++)f.sql.prepare("INSERT INTO account_erasure_jobs(id,source_request_id,state,created_at,updated_at,completed_at) VALUES (?,?,'completed','2099-01-01','2099-01-01','2099-01-01')").run(`completed-${i}`,`old-request-${i}`);const list=await(await f.api('GET')).json();assert.equal(list.jobs[0].id,job.id);assert.equal(list.requests[0].erasureJob.id,job.id);assert.equal(list.jobs.length,50);});

test('legacy untracked post keys require an exact captured post parent and nullable staff audit actors are scrubbed',async t=>{const f=fixture(t);f.sql.exec(`INSERT INTO posts(id,author_email,content) VALUES ('owned-post','${email}','x'),('peer-post','${peer}','keep');
 INSERT INTO post_publish_requests(id,author_email,idempotency_key,payload_hash,post_id) VALUES ('publish','${email}','publish-key','${'a'.repeat(64)}','reserved-post');
 INSERT INTO staff_audit_logs(id,staff_id,action,detail) VALUES ('system-copy',NULL,'legacy','{"email":"${email}"}');`);
 for(const key of ['posts/owned-post/orphan.png','posts/reserved-post/orphan.png','posts/peer-post/keep.png','posts/unassociated/unknown.png'])f.put(key,{});
 const done=await complete(f,(await f.accept()).id);assert.equal(done.removedObjectCount,2);assert.deepEqual([...f.objects.keys()].sort(),['posts/peer-post/keep.png','posts/unassociated/unknown.png']);assert.equal(f.sql.prepare("SELECT detail FROM staff_audit_logs WHERE id='system-copy'").get().detail,'{}');});

test('two accepted erasures with cross-account snapshots and shared conversation both finish',async t=>{
 const f=fixture(t);seedShared(f);
 f.sql.exec(`INSERT INTO account_deletion_requests(id,user_email,status) VALUES ('peer-erasure-request','${peer}','in_review');
 UPDATE direct_messages SET attachment_type='user',attachment_id='peer-id',attachment_snapshot='{"owner":"${peer}"}' WHERE id='subject-message';
 INSERT INTO content_reports(id,reporter_email,entity_type,entity_id,reason,evidence_json) VALUES ('cross-report','${email}','user','peer-id','privacy','{"owner":"${peer}"}');
 INSERT INTO notifications(id,user_email,actor_email,kind,title,body,entity_type,entity_id) VALUES ('cross-notice','${email}','${peer}','comment','Peer replied','private copy','user','peer-id');`);
 f.sql.exec(`INSERT INTO users(email,public_id,display_name,handle) VALUES ('third@test.local','third-id','Third','third');
 INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES ('third@test.local','uni','department',1);
 INSERT INTO post_comments(id,post_id,author_email,content) VALUES ('third-reply','subject-post','third@test.local','Keep third-party reply');
 INSERT INTO community_members(community_id,user_email,role) VALUES ('community','third@test.local','moderator');
 INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email) VALUES ('third-conversation','uni','${email}','third@test.local');
 INSERT INTO direct_messages(id,conversation_id,sender_email,body) VALUES ('third-message','third-conversation','third@test.local','Keep third-party message');`);
 const a=await f.accept(),b=await erasure.acceptAccountErasure(f.DB,'owner','peer-erasure-request');
 let states=[];for(let i=0;i<12;i++){states=await Promise.all([f.resume(a.id),f.resume(b.id)]);if(states.every(job=>job.state==='completed'))break;}
 assert.ok(states.every(job=>job.state==='completed'),JSON.stringify({states,errors:f.errors}));
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM account_erasure_subjects').get().n,0);
 for(const pair of f.sql.prepare('SELECT member_one_email,member_two_email FROM direct_conversations').all())assert.ok(pair.member_one_email<pair.member_two_email);
 assert.equal(f.sql.prepare("SELECT content FROM post_comments WHERE id='third-reply'").get().content,'Keep third-party reply');
 assert.equal(f.sql.prepare("SELECT body FROM direct_messages WHERE id='third-message'").get().body,'Keep third-party message');
 assert.equal(f.sql.prepare("SELECT role FROM community_members WHERE user_email='third@test.local'").get().role,'moderator');
});

test('cross-erasure redaction exceptions cover every unchanged schema column and reject body, status, profile and identity edits',async t=>{
 const f=fixture(t);seedShared(f);f.sql.exec(`INSERT INTO account_deletion_requests(id,user_email,status) VALUES ('peer-erasure-request','${peer}','in_review')`);
 await f.accept();await erasure.acceptAccountErasure(f.DB,'owner','peer-erasure-request');
 for(const query of [
  "UPDATE direct_messages SET body='stale writer',attachment_snapshot='{}' WHERE id='peer-message'",
  "UPDATE content_reports SET status='resolved',evidence_json='{}' WHERE id='report'",
  `UPDATE student_profiles SET bio='stale writer' WHERE user_email='${email}'`,
  `UPDATE users SET public_id='replacement' WHERE email='${email}'`,
  `UPDATE users SET status='active' WHERE email='${email}'`,
  `UPDATE audit_logs SET action='rewritten',detail='{}' WHERE id='peer-audit'`,
  "UPDATE notifications SET kind='rewritten',body='' WHERE id='notice'",
 ])assert.throws(()=>f.sql.exec(query),/ACCOUNT_ERASURE_FROZEN/);
 for(const table of ['direct_messages','content_reports','notifications','community_audit_logs','audit_logs','pilot_invites']){
  const trigger=f.sql.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(`erasure_${table}_update`).sql;
  for(const {name}of f.sql.prepare(`PRAGMA table_info(${table})`).all())assert.ok(trigger.includes(`NEW.${name} IS OLD.${name}`),`${table}.${name} missing explicit unchanged-column coverage`);
 }
 for(const [table,changed]of [['direct_conversations',['member_one_email','member_two_email']],['community_bans',['banned_by_email','reason']]]){
  const trigger=f.sql.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(`erasure_${table}_update`).sql;
  for(const {name}of f.sql.prepare(`PRAGMA table_info(${table})`).all())if(!changed.includes(name))assert.ok(trigger.includes(`NEW.${name} IS OLD.${name}`),`${table}.${name} transfer may change unrelated column`);
 }
 const subject=f.sql.prepare('SELECT * FROM account_erasure_subjects WHERE user_email=?').get(email);
 f.sql.prepare("INSERT INTO users(email,display_name,handle,status) VALUES (?,'Anonymous','anonymous','deleted')").run(subject.tombstone_email);
 const transfer="UPDATE direct_conversations SET member_one_email=min(?,?),member_two_email=max(?,?) WHERE id='conversation'";
 assert.throws(()=>f.sql.prepare(transfer).run(subject.tombstone_email,peer,subject.tombstone_email,peer),/ACCOUNT_ERASURE_FROZEN/,'Only a finalizing job can transfer ownership');
 f.sql.prepare("UPDATE account_erasure_jobs SET state='finalizing',lease_token='synthetic-lease' WHERE id=?").run(subject.job_id);
 assert.throws(()=>f.sql.prepare("UPDATE direct_conversations SET member_one_email=min(?,?),member_two_email=max(?,?),last_message_at='2099-01-01' WHERE id='conversation'").run(subject.tombstone_email,peer,subject.tombstone_email,peer),/ACCOUNT_ERASURE_FROZEN/,'Even an authorized transfer cannot rewrite conversation metadata');
});

test('legacy scans and object cleanup are bounded and resumable across pages',async t=>{const f=fixture(t);for(let i=0;i<105;i++)f.put(`profiles/bulk/${String(i).padStart(3,'0')}.png`);const job=await f.accept();const first=await f.resume(job.id,{objectLimit:7});assert.equal(first.state,'storage_pending');assert.equal(f.deleted.length,7);const done=await complete(f,job.id);assert.equal(done.removedObjectCount,105);assert.equal(f.objects.size,0);});

test('admin API requires owner, exact confirmation, same origin and current staff session context; response exposes only safe job fields',async t=>{const f=fixture(t);assert.equal((await f.api('PATCH',{action:'execute',id:'request-erasure-01',confirm:true},{role:'admin'})).status,403);assert.equal((await f.api('PATCH',{action:'execute',id:'request-erasure-01',confirm:true},{context:false})).status,409);assert.equal((await f.api('PATCH',{action:'execute',id:'request-erasure-01',confirm:true},{context:'stale'})).status,409);assert.equal((await f.api('PATCH',{action:'execute',id:'request-erasure-01'})).status,400);assert.equal((await f.api('PATCH',{action:'execute',id:'request-erasure-01',confirm:true},{origin:'https://other.test'})).status,403);const response=await f.api('PATCH',{action:'execute',id:'request-erasure-01',confirm:true});assert.equal(response.status,202,JSON.stringify(f.errors));const result=await response.json();assert.equal(result.deletionExecuted,false);assert.ok(!JSON.stringify(result).includes(email));assert.ok(!JSON.stringify(result).includes('object_key'));assert.ok(!JSON.stringify(result).includes('Erase my account'));await complete(f,result.job.id);const replay=await f.api('PATCH',{action:'execute',id:'request-erasure-01',confirm:true});assert.equal((await replay.json()).job.id,result.job.id);const list=await(await f.api('GET')).json();assert.equal(list.capabilities.canExecute,true);assert.match(list.staffContext,/^[a-f0-9]{64}$/);assert.equal(list.jobs[0].state,'completed');});
