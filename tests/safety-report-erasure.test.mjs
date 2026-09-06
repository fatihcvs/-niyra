import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { fixture } from './helpers/phase5-api-fixture.mjs';

const modules=new Map();
for(const path of ['account-deletion','account-erasure-inventory','account-erasure']){
 const exports={};const source=ts.transpileModule(await readFile(new URL(`../lib/${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(source,{exports,crypto,Date,Response,TextEncoder,TextDecoder,btoa,atob,require(name){assert.ok(modules.has(name));return modules.get(name);}});modules.set(`./${path}`,exports);
}
const engine=modules.get('./account-erasure');
const target='creator@test.local';
function safetyFixture(t){const f=fixture(t);f.database.exec(`
 INSERT INTO posts(id,author_email,content) VALUES ('post','${target}','Original private text');
 INSERT INTO post_comments(id,post_id,author_email,content) VALUES ('comment','post','${target}','Original comment');
 INSERT INTO notes(id,owner_email,course_id,title,object_key,original_file_name,content_type,byte_size,status) VALUES ('note','${target}','course','Original private title','notes/test.pdf','private.pdf','application/pdf',3,'published');
 INSERT INTO note_comments(id,note_id,author_email,content) VALUES ('note-comment','note','${target}','Original note comment');
 INSERT INTO communities(id,creator_email,university_id,name,slug) VALUES ('community','${target}','campus','Original community','original');
 INSERT INTO community_events(id,community_id,creator_email,title,starts_at) VALUES ('community-event','community','${target}','Original event','2099-01-01');
 INSERT INTO campus_pulse_posts(id,author_email,university_id,kind,content) VALUES ('pulse','${target}','campus','live','Original pulse');
 INSERT INTO meetup_requests(id,sender_email,recipient_email,activity,message,expires_at) VALUES ('meetup','${target}','actor@test.local','study','Original request','2099-01-01');
 INSERT INTO campus_places(id,university_id,creator_email,name,category) VALUES ('place','campus','${target}','Original place','study');
 INSERT INTO housing_discussions(id,place_id,author_email,content) VALUES ('housing-message','place','${target}','Original discussion');
 INSERT INTO campus_events(id,university_id,creator_email,title,category,starts_at) VALUES ('event','campus','${target}','Original campus event','study','2099-01-01');
 INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description) VALUES ('listing','campus','${target}','sell','book','Original listing','Original description');
 INSERT INTO campus_price_reports(id,university_id,reporter_email,place_name,item_name,category,price_cents,observed_at) VALUES ('price','campus','${target}','Place','Item','food',100,'2099-01-01');
 INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email) VALUES ('thread','campus','actor@test.local','${target}');
 INSERT INTO direct_messages(id,conversation_id,sender_email,body) VALUES ('direct-message','thread','${target}','Original message');
 `);return f;}
const types=['post','comment','note','note-comment','community','community-event','pulse','meetup','place','housing-message','event','listing','price','direct-message','user'];
const payload=type=>({action:'report',entityType:type,entityId:type==='user'?'creator':type,reason:'privacy',details:'Synthetic report'});
for(const type of types)for(const boundary of ['active','target-freeze','target-generation'])test(`report ${type}: ${boundary} after evidence snapshot`,async t=>{
 const f=safetyFixture(t);let paused=false;
 f.beforeSql(sql=>{if(!paused&&sql.includes("SELECT id FROM content_reports WHERE reporter_email")){paused=true;if(boundary==='target-freeze')f.database.prepare("UPDATE users SET status='deleting' WHERE email=?").run(target);if(boundary==='target-generation')f.database.prepare("UPDATE users SET public_id='replacement-generation' WHERE email=?").run(target);}});
 const response=await f.request('safety','POST',payload(type));const body=await response.json();assert.ok(paused,'Reached duplicate lookup after captured evidence');assert.equal(response.status,boundary==='active'?201:409,JSON.stringify(body));assert.equal(f.count('content_reports'),boundary==='active'?1:0);assert.equal(f.count('audit_logs'),boundary==='active'?1:0);
 if(boundary==='active'){const stored=f.database.prepare('SELECT evidence_json FROM content_reports').get().evidence_json;assert.doesNotMatch(stored,/_owner_\d_public_id|_target_email/);if(type==='user')assert.doesNotMatch(stored,/@test.local/);}
});
for(const boundary of ['freeze','changeGeneration'])test(`reporter ${boundary} at commit cannot write evidence or audit`,async t=>{const f=safetyFixture(t);let paused=false;f.beforeSql(sql=>{if(!paused&&sql==='BATCH'){paused=true;f[boundary]();}});const response=await f.request('safety','POST',payload('post'));assert.equal(response.status,409,JSON.stringify(await response.json()));assert.equal(f.count('content_reports'),0);assert.equal(f.count('audit_logs'),0);});

for(const type of ['user','post','direct-message'])test(`report ${type} paused through actual completed erasure and same-email registration is rejected`,async t=>{
 const f=safetyFixture(t);f.database.exec(`INSERT INTO staff_accounts(id,username,display_name,role,password_hash,password_salt,password_iterations,must_change_password) VALUES ('owner','owner','Owner','owner','hash','salt',1000,0);
 INSERT INTO account_deletion_requests(id,user_email,status) VALUES ('request-erasure','${target}','in_review');`);
 f.FILES.list=async()=>({objects:[],truncated:false});f.FILES.head=async()=>null;let erased=false;
 f.beforeSql(async sql=>{if(!erased&&sql.includes('SELECT id FROM content_reports WHERE reporter_email')){erased=true;const job=await engine.acceptAccountErasure(f.DB,'owner','request-erasure');let done;for(let i=0;i<10;i++){done=await engine.resumeAccountErasure(f.DB,f.FILES,'owner',job.id);if(done.state==='completed')break;}assert.equal(done.state,'completed');f.database.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES (?,'replacement','Replacement','replacement')").run(target);f.database.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES (?,'campus','department',1)").run(target);}});
 const response=await f.request('safety','POST',payload(type));assert.equal(response.status,409,JSON.stringify(await response.json()));assert.ok(erased);assert.equal(f.count('content_reports'),0);assert.equal(f.count('audit_logs'),0);
});

test('redacted nested third-party attachment snapshot cannot be reintroduced by a received-message report',async t=>{const f=safetyFixture(t);f.database.exec(`UPDATE direct_messages SET attachment_type='note',attachment_id='third-note',attachment_snapshot='{"owner":"other@test.local","title":"Third party private title"}' WHERE id='direct-message'`);let paused=false;f.beforeSql(sql=>{if(!paused&&sql.includes('SELECT id FROM content_reports WHERE reporter_email')){paused=true;f.database.exec("UPDATE direct_messages SET attachment_snapshot='{}',attachment_id=NULL,attachment_type=NULL WHERE id='direct-message'");}});const response=await f.request('safety','POST',payload('direct-message'));assert.equal(response.status,409,JSON.stringify(await response.json()));assert.equal(f.count('content_reports'),0);assert.equal(f.count('audit_logs'),0);});

test('post-write audit failure atomically rolls back the report',async t=>{const f=safetyFixture(t);f.database.exec("CREATE TRIGGER report_audit_fault BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'synthetic audit fault'); END");const response=await f.request('safety','POST',payload('post'));assert.equal(response.status,503);assert.equal(f.count('content_reports'),0);assert.equal(f.count('audit_logs'),0);});
