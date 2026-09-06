import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
const scheduled = new Set();
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/community-requests.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, { exports, AbortController, DOMException, Error, setTimeout(callback) { scheduled.add(callback); return callback; }, clearTimeout(callback) { scheduled.delete(callback); } });
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
const response = (data,status=200) => ({ status,json:async()=>data });

test("target switches reject an old JSON body even when its transport already completed", async () => {
  const body=deferred(); const requests=exports.createCommunityRequests({fetcher:async()=>({status:200,json:()=>body.promise})}); const detach=requests.attach();
  requests.setTarget("a"); const old=requests.read("/api/communities?id=a"); await Promise.resolve(); requests.setTarget("b");
  body.resolve({community:{id:"a",description:"[SYNTHETIC] private A"}});
  await assert.rejects(old,{name:"AbortError"}); detach(); assert.equal(scheduled.size,0);
});

test("confirmed mutations invalidate preceding target reads while independent directory reads remain valid", async () => {
  const old=deferred(); const requests=exports.createCommunityRequests({fetcher:async(url)=>url.includes("old")?old.promise:response({saved:true})});const detach=requests.attach();requests.setTarget("a");
  const pending=requests.read("/old"); const directory=requests.read("/old-directory",{},false);requests.invalidate();
  assert.equal((await requests.read("/mutation",{method:"POST"})).data.saved,true);
  old.resolve(response({posts:["old"]})); await assert.rejects(pending,{name:"AbortError"}); assert.deepEqual((await directory).data.posts,["old"]);
  detach();assert.equal(scheduled.size,0);
});

test("an unmounted owner cannot expire a new session; active 401 expires once and stops later requests", async () => {
  const late=deferred();let expired=0;let calls=0;
  const requests=exports.createCommunityRequests({onSessionExpired:()=>expired++,fetcher:async()=>{calls++;return late.promise;}});
  const detach=requests.attach();const pending=requests.read("/old-account");detach();late.resolve(response({},401));await assert.rejects(pending,{name:"AbortError"});assert.equal(expired,0);
  const close=requests.attach();await assert.rejects(requests.read("/active"),{name:"AbortError"});assert.equal(expired,1);
  await assert.rejects(requests.read("/after-expiry"),{name:"AbortError"});assert.equal(calls,2);close();assert.equal(scheduled.size,0);
});

test("timeout is an actionable error; external cancellation is silent and releases its timer", async () => {
  const requests=exports.createCommunityRequests({fetcher:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}))});const detach=requests.attach();
  const timed=requests.read("/timeout");[...scheduled][0]();await assert.rejects(timed,/zaman aşımına/);
  const external=new AbortController();const cancelled=requests.read("/cancelled",{signal:external.signal});external.abort();await assert.rejects(cancelled,{name:"AbortError"});detach();assert.equal(scheduled.size,0);
});

test("a swallowed abort cannot leave a body pending and active 401 never parses its body", async () => {
  const body = deferred(); let parsed = 0;
  const requests = exports.createCommunityRequests({ fetcher: async (url) => url === "/expired" ? { status: 401, json() { parsed++; return body.promise; } } : { status: 200, json: () => body.promise } });
  const detach = requests.attach();
  const timed = requests.read("/body"); await Promise.resolve(); [...scheduled][0](); await assert.rejects(timed, /zaman aşımına/); assert.equal(scheduled.size, 0);
  await assert.rejects(requests.read("/expired"), { name: "AbortError" }); assert.equal(parsed, 0); assert.equal(scheduled.size, 0);
  body.resolve({ late: true }); detach();
});
