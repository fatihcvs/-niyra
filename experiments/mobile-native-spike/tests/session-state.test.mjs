import assert from "node:assert/strict";
import test from "node:test";
import { createSessionState } from "../src/session-state.ts";
const post=(index)=>({id:`synthetic-${index}`,name:"[SYNTHETIC] Öğrenci",text:"[SYNTHETIC] İçerik",time:"şimdi",course:"GENEL",likes:0,comments:0,media:[]});

test("feed → profile → Back preserves actual page/cursor/offset and composer draft",()=>{
  const state=createSessionState();state.setOwner({publicId:"synthetic-a"});state.setFeed({posts:[post(1)],nextCursor:"opaque::cursor"},false);state.setFeedOffset(923);
  state.navigate({name:"profile",id:"synthetic-b"});assert.equal(state.back(),true);assert.equal(state.route.name,"feed");assert.equal(state.feedOffset,923);assert.equal(state.feed.nextCursor,"opaque::cursor");
  state.navigate({name:"composer"});state.editDraft("[SYNTHETIC] Taslak","campus");state.back();state.navigate({name:"messages"});state.navigate({name:"composer"});assert.equal(state.draft.text,"[SYNTHETIC] Taslak");assert.equal(state.back(),true);assert.equal(state.route.name,"messages");assert.equal(state.back(),true);assert.equal(state.back(),false);
});

test("logout/relogin and owner replacement discard all private state and reject former async work",()=>{
  const state=createSessionState();state.editDraft("must not persist");assert.equal(state.draft.text,"");state.setOwner({publicId:"synthetic-a"});state.editDraft("[SYNTHETIC] Private A");state.setFeed({posts:[post(1)],nextCursor:"a"},false);
  const old=state.begin("profile");const oldKey=state.publicationKey(()=>"old-key");state.setOwner({publicId:"synthetic-b"});assert.equal(old.current(),false);assert.equal(old.signal.aborted,true);assert.equal(state.draft.text,"");assert.equal(state.feed.posts.length,0);state.confirmPublish(oldKey,post(9));assert.equal(state.feed.posts.length,0);
  state.editDraft("[SYNTHETIC] B");state.setOwner(null);state.setOwner({publicId:"synthetic-b"});assert.equal(state.draft.text,"");assert.equal(state.feedLoaded,false);
});

test("background aborts all lanes but preserves draft; new foreground validation cannot accept an old result",()=>{
  const state=createSessionState();state.setOwner({publicId:"synthetic-a"});state.editDraft("[SYNTHETIC] Resume me");const old=state.begin("feed");state.pause();assert.equal(old.current(),false);assert.equal(state.draft.text,"[SYNTHETIC] Resume me");
  const current=state.begin("feed");old.finish();assert.equal(current.current(),true);const newer=state.begin("feed");assert.equal(current.current(),false);newer.cancel();assert.equal(newer.current(),false);
});

test("same draft retries retain the same key and only matching confirmed response clears it",()=>{
  const state=createSessionState();state.setOwner({publicId:"synthetic-a"});state.editDraft("[SYNTHETIC] Draft");const key=state.publicationKey(()=>"first-key");assert.equal(state.publicationKey(()=>"not-used"),key);
  state.editDraft("[SYNTHETIC] Edited");const next=state.publicationKey(()=>"second-key");state.confirmPublish(key,post(1));assert.equal(state.draft.text,"[SYNTHETIC] Edited");state.confirmPublish(next,post(2));assert.equal(state.draft.text,"");assert.deepEqual(state.feed.posts.map((p)=>p.id),["synthetic-2","synthetic-1"]);
});

test("200-post boundary keeps whole real pages and opaque cursor instead of trimming unseen history",()=>{
  const state=createSessionState();state.setOwner({publicId:"synthetic-a"});
  for(let page=0;page<17;page++)state.setFeed({posts:Array.from({length:12},(_,index)=>post(page*12+index)),nextCursor:`server-cursor-${page}`},page>0);
  assert.equal(state.feed.posts.length,204);assert.equal(state.canLoadMore,false);assert.equal(state.feed.nextCursor,"server-cursor-16");assert.equal(state.feed.posts[0].id,"synthetic-0");
});
