import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiOrigin, createApi } from "../src/api.ts";

const root = "https://example.invalid";
const profile = { publicId:"synthetic-viewer",displayName:"[SYNTHETIC] Öğrenci",handle:"synthetic",bio:"",universityName:"[SYNTHETIC] Kampüs",departmentName:"[SYNTHETIC] Bölüm",postCount:0,followerCount:0,followingCount:0,avatarUrl:null };
const session = { identity:{email:"synthetic@example.invalid",displayName:profile.displayName},profile };
const post = { id:"synthetic-post",authorId:profile.publicId,name:profile.displayName,text:"[SYNTHETIC] İzole sözleşme yanıtı",time:"şimdi",course:"GENEL",likes:0,comments:0,media:[] };
const json = (value,status=200) => Response.json(value,{status});
const deferred = () => { let resolve;const promise=new Promise((yes)=>{resolve=yes;});return{promise,resolve}; };

test("origin and media boundaries reject credentials, non-HTTPS and foreign private routes", () => {
  for (const url of ["http://example.invalid","https://secret@example.invalid","https://example.invalid/api","https://example.invalid?q=x"]) assert.throws(()=>apiOrigin(url),ApiError);
  const api=createApi({origin:root});
  assert.equal(api.mediaUrl("/api/posts/media?id=synthetic"),`${root}/api/posts/media?id=synthetic`);
  assert.equal(api.mediaUrl("https://foreign.invalid/api/posts/media?id=x"),null);
  assert.equal(api.mediaUrl("https://secret@example.invalid/api/profile/media?user=x"),null);
  assert.equal(api.mediaUrl("/private-file"),null);
});

test("login is accepted only after the native cookie transport returns the same actual profile", async () => {
  const calls=[];
  const api=createApi({origin:root,fetcher:async(url,options)=>{calls.push({url,options});return url.endsWith("auth/session")?json({user:session.identity}):json(session);}});
  const confirmed=await api.login("synthetic@example.invalid","[SYNTHETIC] Test only");
  assert.equal(confirmed.profile.publicId,profile.publicId);assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,"POST");assert.ok(calls[1].url.endsWith("/api/profile"));
  for(const {options} of calls){assert.equal(options.credentials,"include");assert.equal(options.cache,"no-store");assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);}
  assert.equal(JSON.parse(calls[0].options.body).password,"[SYNTHETIC] Test only");
});

test("a successful login response without a retained cookie, or an older account cookie, stays unconnected", async () => {
  let api=createApi({origin:root,fetcher:async(url)=>url.endsWith("auth/session")?json({user:session.identity}):json({error:"[SYNTHETIC] Oturum yok"},401)});
  await assert.rejects(api.login("synthetic@example.invalid","[SYNTHETIC]"),{status:401});
  api=createApi({origin:root,fetcher:async(url)=>url.endsWith("auth/session")?json({user:session.identity}):json({...session,identity:{...session.identity,email:"other@example.invalid"}})});
  await assert.rejects(api.login("synthetic@example.invalid","[SYNTHETIC]"),{status:401});
  api=createApi({origin:root,fetcher:async()=>json({...session,profile:null})});await assert.rejects(api.session(),{status:409});
});

test("HTML auth redirects and malformed successful payloads never become empty authenticated screens", async () => {
  let api=createApi({origin:root,fetcher:async()=>new Response("<html>Sign in</html>",{headers:{"content-type":"text/html"}})});
  await assert.rejects(api.session(),/JSON/);
  api=createApi({origin:root,fetcher:async()=>json({posts:"invalid",nextCursor:null})});await assert.rejects(api.feed(),/listesi/);
  api=createApi({origin:root,fetcher:async()=>({redirected:true,url:`${root}/login`,status:200,headers:new Headers({"content-type":"application/json"})})});await assert.rejects(api.session(),{status:401});
});

test("private profile mismatch and actual 403 are errors; feed cursor is passed without transformation", async () => {
  let received;
  const api=createApi({origin:root,fetcher:async(url)=>{received=new URL(url);return url.includes("/api/people")?json({person:{...profile,publicId:"wrong",posts:[]}}):json({posts:[post],nextCursor:"real::server::opaque"});}});
  const page=await api.feed("123::2026-09-05 10:00:00::id+a");assert.equal(received.searchParams.get("cursor"),"123::2026-09-05 10:00:00::id+a");assert.equal(page.nextCursor,"real::server::opaque");
  await assert.rejects(api.person("wanted"),/kimliği/);
  await assert.rejects(createApi({origin:root,fetcher:async()=>json({error:"[SYNTHETIC] Erişim yok"},403)}).conversations(),{status:403});
});

test("cancelled JSON cannot return private data even if the transport ignores AbortSignal", async () => {
  const body=deferred();const controller=new AbortController();
  const api=createApi({origin:root,fetcher:async()=>({ok:true,status:200,redirected:false,url:`${root}/api/profile`,headers:new Headers({"content-type":"application/json"}),json:()=>body.promise})});
  const pending=api.session(controller.signal);await Promise.resolve();controller.abort();body.resolve(session);await assert.rejects(pending,{name:"AbortError"});
});

test("text publication uses the existing endpoint and exact caller retry key; it never automatically retries", async () => {
  const calls=[];const key="synthetic-idempotency-key-0001";
  const api=createApi({origin:root,fetcher:async(url,options)=>{calls.push({url,options});return calls.length===1?json({error:"[SYNTHETIC] Retry manually"},503):json({post},201);}});
  await assert.rejects(api.publish(post.text,"campus",key),{status:503});assert.equal(calls.length,1);
  const confirmed=await api.publish(post.text,"campus",key);assert.equal(confirmed.id,post.id);
  assert.equal(calls[0].options.headers["Idempotency-Key"],calls[1].options.headers["Idempotency-Key"]);
  assert.deepEqual(JSON.parse(calls[1].options.body),{content:post.text,audience:"campus",courseId:null});
});

test("an abort-aware native request reaches the configured timeout without automatic retries", async () => {
  let calls=0;
  const api=createApi({origin:root,timeoutMs:5,fetcher:async(_url,{signal})=>{calls++;return new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}));}});
  await assert.rejects(api.session(),/zaman aşımına/);assert.equal(calls,1);
});
