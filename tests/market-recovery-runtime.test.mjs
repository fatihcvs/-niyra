import assert from "node:assert/strict";
import test from "node:test";
import { act,createElement as h,useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";
import { IDBFactory, IDBObjectStore } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const data=(listings=[],inquiries=[])=>({listings,prices:[],places:[],inquiries});
const listing=(id="listing-a",own=true)=>({id,kind:"sell",category:"books",title:"Kampüs kitabı",description:"Çok iyi durumda ders kitabı.",priceCents:10000,condition:"used-good",meetupPlace:"Kütüphane",status:"active",ownerId:own?"owner":"seller",ownerName:"Örnek Öğrenci",own,images:[],inquiryCount:0,time:"şimdi",updatedTime:"şimdi"});
const top=(ui)=>[...ui.document.querySelectorAll('[role="dialog"]')].at(-1);
const button=(scope,label)=>[...scope.querySelectorAll("button")].find((node)=>node.textContent.trim()===label||node.getAttribute("aria-label")===label);

test("market retries preserve the exact key and payload across unknown outcomes, quota rejection and workspace remount",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.openCreate();await ui.submit();
    const original=ui.requests[1].options;
    assert.match(original.headers["Idempotency-Key"],/^market:[a-f0-9]{32}$/);
    await act(async()=>ui.requests[1].reject(new Error("Lost acknowledgement")));
    await ui.until(()=>ui.document.activeElement===top(ui).querySelector('[aria-label="Pazar kayıt kurtarma"]'));
    await ui.click(button(top(ui),"Kaydı tekrar dene"));
    assert.equal(ui.requests[2].options.body,original.body);
    assert.equal(ui.requests[2].options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(ui.requests[2],{error:"Biraz sonra yeniden dene"},429);
    assert.equal(top(ui).querySelector('[name="title"]').disabled,true);
    await ui.remount();await ui.resolve(ui.requests.at(-1),data());
    await ui.click(button(ui.host,"Kaydı tekrar dene"));
    const replay=ui.requests.at(-1);
    assert.equal(replay.options.body,original.body);
    assert.equal(replay.options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(replay,{listing:{id:"same-listing"},idempotentReplay:true},201);
    await ui.resolve(ui.requests.at(-1),data([listing("same-listing")]));
    assert.equal(ui.host.querySelector('[aria-label="Pazar kayıt kurtarma"]'),null);
    await ui.openCreate();await ui.submit();
    assert.notEqual(ui.requests.at(-1).options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(ui.requests.at(-1),{error:"Geçerli bir kayıt gir"},400);
  }finally{await ui.close();}
});

test("a confirmed removed market target keeps the draft and starts a new key only after explicit editing",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.openCreate();await ui.submit();const key=ui.requests[1].options.headers["Idempotency-Key"];
    await act(async()=>ui.requests[1].reject(new Error("Response lost")));
    await ui.click(button(top(ui),"Kaydı tekrar dene"));await ui.resolve(ui.requests[2],{error:"Önceki kayıt kaldırılmış."},410);
    assert.equal(button(top(ui),"Kaydı tekrar dene"),undefined);
    assert.equal(top(ui).querySelector('[name="title"]').value,"Kampüs kitabı");
    await ui.click(button(top(ui),"Taslağı düzenle"));await ui.submit();
    assert.notEqual(ui.requests[3].options.headers["Idempotency-Key"],key);
    await ui.resolve(ui.requests[3],{error:"Geçerli bir kayıt gir"},400);
  }finally{await ui.close();}
});

test("market inquiry retry preserves the original message and rejects same-frame repeats",async()=>{
  const ui=await setup();try{
    await ui.renderMarket([listing("seller-item",false)]);await ui.click(button(ui.host,"Mesaj gönder"));await ui.fill(top(ui).querySelector("textarea"),"Kitap hâlâ satılık mı?");await ui.submit();
    const original=ui.requests[1].options;
    await act(async()=>ui.requests[1].reject(new Error("Lost message reply")));
    await act(async()=>{const retry=button(top(ui),"Mesajı tekrar dene");retry.click();retry.click();});
    await ui.settle();
    assert.equal(ui.requests.length,3);assert.equal(ui.requests[2].options.body,original.body);assert.equal(ui.requests[2].options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(ui.requests[2],{error:"Biraz sonra tekrar dene"},429);
    assert.equal(top(ui).querySelector("textarea").disabled,true);
    await ui.click(button(top(ui),"Mesajı tekrar dene"));assert.equal(ui.requests[3].options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(ui.requests[3],{inquiry:{id:"same-inquiry"},idempotentReplay:true},201);await ui.resolve(ui.requests[4],data());assert.equal(top(ui),undefined);
  }finally{await ui.close();}
});

test("price date is persisted without editing the date control and survives a fresh workspace",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.click([...ui.host.querySelectorAll('.market-tabs button')].find((node)=>node.querySelector('strong')?.textContent==='Fiyatlar'));await ui.click(button(ui.host,"Fiyat ekle"));
    const initialDate=top(ui).querySelector('[name="observedAt"]').value,now=new Date();
    assert.equal(initialDate,`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
    await ui.fill(top(ui).querySelector('[name="itemName"]'),"Kaydedilen fiyat gözlemi");await ui.settle();
    const store=ui.load("lib/market-draft-store.ts").createMarketDraftStore();store.setOwner({publicId:"owner-a",confirmed:true});
    try{assert.equal((await store.load()).record.forms.price.observedAt,initialDate,"The date must be a persisted field, not a render-time fallback");}finally{store.dispose();}
    await ui.render(null);const memory=ui.load("lib/workspace-state.ts");memory.setWorkspaceStateOwnerScope(null);memory.setWorkspaceStateOwnerScope("owner-a:1");await ui.remount();await ui.resolve(ui.requests.at(-1),data());
    await ui.click([...ui.host.querySelectorAll('.market-tabs button')].find((node)=>node.querySelector('strong')?.textContent==='Fiyatlar'));await ui.click(button(ui.host,"Fiyat ekle"));
    assert.equal(top(ui).querySelector('[name="observedAt"]').value,initialDate);assert.equal(top(ui).querySelector('[name="itemName"]').value,"Kaydedilen fiyat gözlemi");assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,0);
  }finally{await ui.close();}
});

test("price reports retry the original observation rather than reading later form values",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.click([...ui.host.querySelectorAll('.market-tabs button')].find((node)=>node.querySelector('strong')?.textContent==='Fiyatlar'));await ui.click(button(ui.host,"Fiyat ekle"));
    for(const[name,value]of Object.entries({placeName:"Kampüs kafe",itemName:"Öğrenci menüsü",price:"100",sourceNote:"Kasadaki menü"}))await ui.fill(top(ui).querySelector(`[name="${name}"]`),value);
    await ui.submit();const original=ui.requests[1].options;assert.equal(JSON.parse(original.body).action,"price");
    await act(async()=>ui.requests[1].reject(new Error("Network disappeared")));
    await ui.click(button(top(ui),"Kaydı tekrar dene"));assert.equal(ui.requests[2].options.body,original.body);assert.equal(ui.requests[2].options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(ui.requests[2],{price:{id:"same-price"},idempotentReplay:true},201);await ui.resolve(ui.requests[3],data());assert.equal(top(ui),undefined);
  }finally{await ui.close();}
});

test("uncertain inquiry recovery can reopen after its listing becomes reserved or disappears from the results",async()=>{
  for(const rows of [[{...listing("seller-item",false),status:"reserved"}],[]]){
    const ui=await setup();try{
      await ui.renderMarket([listing("seller-item",false)]);await ui.click(button(ui.host,"Mesaj gönder"));await ui.fill(top(ui).querySelector("textarea"),"Kitap hâlâ satılık mı?");await ui.submit();
      const original=ui.requests[1].options;
      await act(async()=>ui.requests[1].reject(new Error("Lost message acknowledgement")));
      await ui.click(button(top(ui),"Pencereyi kapat"));await ui.until(()=>!top(ui));
      await ui.click(button(ui.host,"İçeriği yenile"));await ui.resolve(ui.requests[2],data(rows));
      const resume=button(ui.host,"Mesaj taslağını aç");
      assert.ok(resume,"The pending inquiry must remain reachable even when the source listing cannot open its contact form");
      await ui.click(resume);assert.equal(top(ui).querySelector("textarea").value,"Kitap hâlâ satılık mı?");
      await ui.click(button(top(ui),"Mesajı tekrar dene"));
      assert.equal(ui.requests[3].options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
      assert.equal(ui.requests[3].options.body,original.body);
      if(rows.length){await ui.resolve(ui.requests[3],{inquiry:{id:"same-inquiry"},idempotentReplay:true},201);await ui.resolve(ui.requests[4],data(rows));assert.equal(top(ui),undefined);}
      else{await ui.resolve(ui.requests[3],{error:"Önceki mesaj kaldırılmış."},410);assert.ok(button(top(ui),"Mesaj taslağını düzenle"));assert.equal(top(ui).querySelector("textarea").value,"Kitap hâlâ satılık mı?");}
    }finally{await ui.close();}
  }
});

test("removed inquiry recovery lets the user edit the preserved message explicitly",async()=>{
  const ui=await setup();try{
    await ui.renderMarket([listing("seller-item",false)]);await ui.click(button(ui.host,"Mesaj gönder"));await ui.fill(top(ui).querySelector("textarea"),"Kitap hâlâ satılık mı?");await ui.submit();
    await act(async()=>ui.requests[1].reject(new Error("Response lost")));
    await ui.click(button(top(ui),"Mesajı tekrar dene"));await ui.resolve(ui.requests[2],{error:"Önceki mesaj kaldırılmış."},410);
    assert.equal(button(top(ui),"Mesajı tekrar dene"),undefined);assert.equal(top(ui).querySelector("textarea").disabled,true);
    await ui.click(button(top(ui),"Mesaj taslağını düzenle"));assert.equal(top(ui).querySelector("textarea").value,"Kitap hâlâ satılık mı?");assert.equal(top(ui).querySelector("textarea").disabled,false);
    assert.equal(ui.requests.length,3,"Editing a draft must never send it");
  }finally{await ui.close();}
});
async function setup(){
  const requests=[];const ui=await createMobileDom({fetch:(url,options)=>{const request={url,options,...deferred()};requests.push(request);return request.promise;}});
  Object.defineProperty(ui.window,"indexedDB",{value:new IDBFactory(),configurable:true});
  // jsdom FormData understands HTML forms, while real File bytes use Node's cloneable File.
  const BrowserFormData=ui.window.FormData;
  ui.window.File=File;
  ui.window.FormData=class extends BrowserFormData{
    durableFiles=new Map();
    append(name,value,filename){if(value instanceof File){const files=this.durableFiles.get(name)??[];files.push(value);this.durableFiles.set(name,files);}else if(filename!==undefined)super.append(name,value,filename);else super.append(name,value);}
    getAll(name){return this.durableFiles.has(name)?this.durableFiles.get(name):super.getAll(name);}
  };
  const {AppNavigationProvider:Provider}=ui.load("app/app-navigation.tsx"),{CampusMarketWorkspace}=ui.load("app/campus-market.tsx"),state=ui.load("lib/workspace-state.ts");let changeOwner;
  function Harness(){const[owner,setOwner]=useState("owner-a:1");changeOwner=(next)=>{state.setWorkspaceStateOwnerScope(next);setOwner(next);};return h(Provider,{ownerScope:owner,onBack(){},onSessionExpired(){changeOwner("signed-out");}},h(CampusMarketWorkspace,{universityShortName:"TEST"}));}
  const until=async(check)=>{for(let index=0;index<100;index++){if(check())return;await act(async()=>{await new Promise((resolve)=>setTimeout(resolve,3));});}assert.ok(check(),ui.document.body.textContent);};
  const settle=async()=>{await act(async()=>{await new Promise((resolve)=>setTimeout(resolve,0));});await until(()=>!["loading","saving"].includes(ui.host.querySelector('[aria-label="Pazar taslak durumu"]')?.dataset.state));};
  return{...ui,requests,until,settle,click:async(element)=>{await ui.click(element);await settle();},remount:async()=>{await ui.render(null);await ui.render(h(Harness));await settle();},renderMarket:async(rows=[])=>{state.setWorkspaceStateOwnerScope("owner-a:1");await ui.render(h(Harness));await act(async()=>requests[0].resolve(Response.json(data(rows))));await settle();},resolve:async(request,body,status=200)=>{await act(async()=>request.resolve(Response.json(body,{status})));await settle();},switchOwner:async(owner)=>{await act(async()=>changeOwner(owner));await settle();},async openCreate(files=[]){await ui.click(button(ui.host,"İlan ver")??button(ui.host,"İlk ilanı ver"));await ui.fill(top(ui).querySelector('[name="title"]'),"Kampüs kitabı");await ui.fill(top(ui).querySelector('[name="description"]'),"Çok iyi durumda ders kitabı.");await ui.fill(top(ui).querySelector('[name="price"]'),"100");if(files.length){const input=top(ui).querySelector('[name="images"]');Object.defineProperty(input,"files",{value:files,configurable:true});await act(async()=>input.dispatchEvent(new ui.window.Event("change",{bubbles:true})));}},submit:async()=>{await act(async()=>top(ui).querySelector("form").dispatchEvent(new ui.window.Event("submit",{bubbles:true,cancelable:true})));await settle();}};
}

test("market disk restore replaces cleared workspace memory with the ordered files and immutable attempt",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();const files=[new ui.window.File(["first"],"first.png",{type:"image/png"}),new ui.window.File(["second"],"second.png",{type:"image/png"})];await ui.openCreate(files);await ui.submit();
    const original=ui.requests[1].options;await act(async()=>ui.requests[1].reject(new Error("Lost acknowledgement")));await ui.settle();
    await ui.render(null);const memory=ui.load("lib/workspace-state.ts");memory.setWorkspaceStateOwnerScope(null);memory.setWorkspaceStateOwnerScope("owner-a:1");await ui.remount();await ui.resolve(ui.requests.at(-1),data());
    await ui.click(button(ui.host,"İlan ver")??button(ui.host,"İlk ilanı ver"));
    assert.equal(top(ui).querySelector('[name="title"]').value,"Kampüs kitabı");assert.deepEqual([...top(ui).querySelectorAll('[aria-label="Taslak ürün fotoğrafları"] li')].map((node)=>node.textContent),["first.png","second.png"]);
    await ui.click(button(top(ui),"Kaydı tekrar dene"));const retried=ui.requests.at(-1);assert.equal(retried.options.body,original.body);assert.equal(retried.options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(retried,{listing:{id:"restored-listing"},idempotentReplay:true},201);const upload=ui.requests.at(-1);assert.deepEqual(await Promise.all(upload.options.body.getAll("images").map((file)=>file.text())),["first","second"]);
    await ui.resolve(upload,{images:[{id:"photo1",url:"/1"},{id:"photo2",url:"/2"}]},201);await ui.resolve(ui.requests.at(-1),data());
  }finally{await ui.close();}
});

test("market quota failure sends no POST and storage retry never auto-sends the preserved attempt",async()=>{
  const ui=await setup();const put=IDBObjectStore.prototype.put;try{
    await ui.renderMarket();await ui.openCreate();
    IDBObjectStore.prototype.put=function(...args){if(this.name==="drafts")throw new DOMException("Disk full","QuotaExceededError");return put.apply(this,args);};
    await ui.submit();assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,0);assert.equal(top(ui).querySelector('[name="title"]').value,"Kampüs kitabı");assert.match(top(ui).textContent,/yeterli alan yok/);
    assert.equal(top(ui).querySelector('[name="title"]').disabled,false,"A never-sent draft remains editable after storage failure");
    IDBObjectStore.prototype.put=put;await ui.click(button(top(ui),"Taslağı kaydetmeyi tekrar dene"));assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,0);
    await ui.submit();assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,1);
    await ui.resolve(ui.requests.at(-1),{error:"Kayıt kaldırıldı"},410);
  }finally{IDBObjectStore.prototype.put=put;await ui.close();}
});

test("invalid market photo selections retain the last valid files and quota recovery can remove photos",async()=>{
  const ui=await setup();const put=IDBObjectStore.prototype.put;try{
    await ui.renderMarket();const valid=new ui.window.File(["png"],"valid.png",{type:"image/png"});await ui.openCreate([valid]);await ui.settle();
    for(const files of [Array.from({length:7},()=>valid),[new ui.window.File(["gif"],"bad.gif",{type:"image/gif"})],[new ui.window.File([new Uint8Array(5*1024*1024+1)],"large.png",{type:"image/png"})],[new File(["png"],"wrong.gif",{type:"image/png"})],[new File(["png"],"x".repeat(141)+".png",{type:"image/png"})]]){
      const input=top(ui).querySelector('[name="images"]');Object.defineProperty(input,"files",{value:files,configurable:true});await act(async()=>input.dispatchEvent(new ui.window.Event("change",{bubbles:true})));await ui.settle();
      assert.deepEqual([...top(ui).querySelectorAll('[aria-label="Taslak ürün fotoğrafları"] li')].map((node)=>node.textContent),["valid.png"]);assert.equal(input.disabled,false);assert.equal(top(ui).querySelector('[name="title"]').disabled,false);
    }
    IDBObjectStore.prototype.put=function(...args){if(this.name==="drafts")throw new DOMException("Disk full","QuotaExceededError");return put.apply(this,args);};
    await ui.fill(top(ui).querySelector('[name="title"]'),"Updated title");await ui.until(()=>top(ui).querySelector('[aria-label="Pazar taslak durumu"]').dataset.state==="error");
    assert.equal(button(top(ui),"Seçili fotoğrafları temizle").disabled,false);IDBObjectStore.prototype.put=put;await ui.click(button(top(ui),"Seçili fotoğrafları temizle"));await ui.until(()=>top(ui).querySelector('[aria-label="Pazar taslak durumu"]').dataset.state==="saved");
    assert.equal(top(ui).querySelector('[aria-label="Taslak ürün fotoğrafları"]'),null);assert.equal(top(ui).querySelector('[name="title"]').value,"Updated title");assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,0);
  }finally{IDBObjectStore.prototype.put=put;await ui.close();}
});

test("same-frame market submits create one listing; rejected image upload preserves files and retries only the confirmed listing",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();const file=new ui.window.File(["png"],"book.png",{type:"image/png"});await ui.openCreate([file]);
    await act(async()=>{const form=top(ui).querySelector("form");for(let index=0;index<2;index++)form.dispatchEvent(new ui.window.Event("submit",{bubbles:true,cancelable:true}));});
    await ui.settle();
    assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,1);
    await ui.resolve(ui.requests[1],{listing:{id:"confirmed-listing"}},201);assert.equal(ui.requests[2].url,"/api/campus-market/images");assert.equal(ui.requests[2].options.body.get("listingId"),"confirmed-listing");
    await ui.resolve(ui.requests[2],{error:"Geçici yükleme kotası"},429);
    assert.equal(top(ui).querySelector('[name="title"]').value,"Kampüs kitabı");assert.match(top(ui).textContent,/1 fotoğraf seçili/);
    await ui.submit();assert.equal(ui.requests[3].url,"/api/campus-market/images");assert.equal(ui.requests[3].options.body.get("listingId"),"confirmed-listing");assert.equal(ui.requests[3].options.body.getAll("images")[0].name,"book.png");assert.equal(ui.requests.filter((request)=>request.options.method==="POST"&&request.url==="/api/campus-market").length,1);
    await ui.resolve(ui.requests[3],{images:[{id:"photo",url:"/photo"}]},201);await ui.resolve(ui.requests[4],data([listing("confirmed-listing")]));assert.equal(top(ui),undefined);assert.match(ui.host.textContent,/1 ürün fotoğrafıyla hazır/);
  }finally{await ui.close();}
});

test("unknown photo uploads recover from disk with the same key and ordered bytes without manual guessing",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.openCreate([new File(["first"],"first.png",{type:"image/png"}),new File(["second"],"second.png",{type:"image/png"})]);await ui.submit();
    await ui.resolve(ui.requests.at(-1),{listing:{id:"photo-listing"}},201);
    const original=ui.requests.at(-1).options;
    assert.match(original.headers["Idempotency-Key"],/^market:[a-f0-9]{32}$/);
    const api=ui.load("lib/market-draft-store.ts"),store=api.createMarketDraftStore({indexedDB:ui.window.indexedDB});store.setOwner({publicId:"owner-a",confirmed:true});
    try{assert.equal((await store.load()).record.recovery.photoKey,original.headers["Idempotency-Key"],"The photo key is committed before POST");}finally{store.dispose();}
    await act(async()=>ui.requests.at(-1).reject(new Error("Lost committed photo response")));await ui.settle();
    await ui.render(null);const memory=ui.load("lib/workspace-state.ts");memory.setWorkspaceStateOwnerScope(null);memory.setWorkspaceStateOwnerScope("owner-a:1");await ui.remount();await ui.resolve(ui.requests.at(-1),data());
    assert.ok(!ui.host.querySelector('[aria-label="Pazar kayıt kurtarma"] input[type="checkbox"]'));
    await ui.click(button(ui.host,"Fotoğrafları tekrar yükle"));
    const retry=ui.requests.at(-1);assert.equal(retry.url,"/api/campus-market/images");assert.equal(retry.options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);assert.equal(retry.options.body.get("listingId"),"photo-listing");assert.deepEqual(await Promise.all(retry.options.body.getAll("images").map((file)=>file.text())),["first","second"]);
    await ui.resolve(retry,{error:"Biraz sonra tekrar dene"},429);await ui.click(button(ui.host,"Fotoğrafları tekrar yükle"));assert.equal(ui.requests.at(-1).options.headers["Idempotency-Key"],original.headers["Idempotency-Key"]);
    await ui.resolve(ui.requests.at(-1),{images:[{id:"one",url:"/one"},{id:"two",url:"/two"}],idempotentReplay:true},201);await ui.resolve(ui.requests.at(-1),data());assert.equal(ui.host.querySelector('[aria-label="Pazar kayıt kurtarma"]'),null);
    assert.equal(ui.requests.filter((request)=>request.url==="/api/campus-market"&&request.options.method==="POST").length,1);
  }finally{await ui.close();}
});

test("terminal photo validation and removed operations can close their drafts without creating or deleting a listing",async()=>{
  for(const status of [400,410,413,415]){const ui=await setup();try{
    await ui.renderMarket();await ui.openCreate([new File(["first"],"first.png",{type:"image/png"})]);await ui.submit();await ui.resolve(ui.requests.at(-1),{listing:{id:"photo-listing"}},201);
    await ui.resolve(ui.requests.at(-1),{error:status===410?"Önceki fotoğraf kaldırılmış":"Bu fotoğraf kabul edilmedi"},status);
    assert.equal(button(top(ui),"Fotoğrafları tekrar yükle"),undefined);assert.equal(top(ui).querySelector('button[type="submit"]').disabled,true);
    const requests=ui.requests.length;await ui.click(button(top(ui),"Fotoğraf taslağını kapat"));assert.equal(top(ui),undefined);assert.equal(ui.requests.length,requests);
  }finally{await ui.close();}}
});

test("legacy unknown photo uploads still require review before acquiring their first photo key",async()=>{
  const ui=await setup();try{
    const api=ui.load("lib/market-draft-store.ts"),store=api.createMarketDraftStore({indexedDB:ui.window.indexedDB});store.setOwner({publicId:"owner-a",confirmed:true});
    const files=[new File(["legacy"],"legacy.png",{type:"image/png"})];
    try{assert.equal((await store.save({...api.emptyMarketDraft(),images:files,recovery:{kind:"listing",key:"market:legacy-create-key",listingId:"legacy-listing",phase:"photos-unknown",payload:{action:"listing",title:"Eski ilan"},images:files}},0)).status,"saved");}finally{store.dispose();}
    await ui.renderMarket();const panel=ui.host.querySelector('[aria-label="Pazar kayıt kurtarma"]');assert.ok(panel.querySelector('input[type="checkbox"]'));assert.equal(button(panel,"Fotoğrafları tekrar yükle"),undefined);
    assert.equal(button(panel,"Hiç fotoğraf eklenmemiş, yeniden yükle").disabled,true);assert.equal(ui.requests.length,1);
    await ui.click(panel.querySelector('input[type="checkbox"]'));await ui.click(button(panel,"Hiç fotoğraf eklenmemiş, yeniden yükle"));const upload=ui.requests.at(-1);assert.equal(upload.url,"/api/campus-market/images");assert.match(upload.options.headers["Idempotency-Key"],/^market:[a-f0-9]{32}$/);assert.equal(upload.options.body.get("listingId"),"legacy-listing");
    await ui.resolve(upload,{images:[{id:"legacy-photo",url:"/photo"}]},201);await ui.resolve(ui.requests.at(-1),data());
  }finally{await ui.close();}
});

test("unknown initial listing result blocks duplicate creation and can continue with a reviewed existing own listing",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.openCreate();await ui.submit();await act(async()=>ui.requests[1].reject(new Error("Network disappeared")));
    assert.match(top(ui).textContent,/ikinci bir kayıt otomatik oluşturulmaz/);await ui.submit();assert.equal(ui.requests.length,2);
    await ui.click(button(top(ui),"Son durumu kontrol et"));await ui.resolve(ui.requests[2],data([listing("already-created")]));await ui.click(button(top(ui),"Bu ilanla devam et"));assert.equal(top(ui),undefined);assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,1);assert.match(ui.host.textContent,/Yeni ilan oluşturulmadı/);
  }finally{await ui.close();}
});

test("an unknown message keeps its target draft and checks outgoing data instead of sending twice",async()=>{
  const ui=await setup();try{
    await ui.renderMarket([listing("seller-item",false)]);await ui.click(button(ui.host,"Mesaj gönder"));await ui.fill(top(ui).querySelector("textarea"),"Kitap hâlâ satılık mı?");await ui.submit();await act(async()=>ui.requests[1].reject(new Error("Response lost")));assert.equal(top(ui).querySelector("textarea").disabled,true);await ui.submit();assert.equal(ui.requests.length,2);
    await ui.click(button(top(ui),"Gönderilen mesajı kontrol et"));await ui.resolve(ui.requests[2],data([listing("seller-item",false)],[{id:"inquiry",listingId:"seller-item",listingTitle:"Kampüs kitabı",message:"Kitap hâlâ satılık mı?",status:"open",direction:"outgoing",otherId:"seller",otherName:"Seller",time:"şimdi"}]));assert.equal(top(ui),undefined);assert.match(ui.host.textContent,/mevcut kayıtta doğrulandı/);assert.equal(ui.requests.filter((request)=>request.options.method==="POST").length,1);
  }finally{await ui.close();}
});

test("photo removal uses an application confirmation, remains open on failure and rejects duplicate same-frame deletion",async()=>{
  const ui=await setup();try{
    ui.window.confirm=()=>{throw new Error("Native confirm must not be used");};const row={...listing(),images:[{id:"photo-a",url:"/photo"}]};await ui.renderMarket([row]);await ui.click(button(ui.host,"1. ürün fotoğrafını kaldır"));assert.equal(ui.requests.length,1);await ui.click(button(top(ui),"Vazgeç"));await ui.until(()=>!top(ui));assert.equal(ui.requests.length,1);
    await ui.click(button(ui.host,"1. ürün fotoğrafını kaldır"));await act(async()=>{const action=button(top(ui),"Fotoğrafı kaldır");action.click();action.click();});assert.equal(ui.requests.length,2);assert.equal(top(ui).getAttribute("aria-busy"),"true");await ui.key("Escape");assert.ok(top(ui),"Busy confirmation cannot be dismissed with Escape");await ui.resolve(ui.requests[1],{error:"Silme başarısız"},503);assert.match(top(ui).textContent,/Silme başarısız/);assert.ok(ui.host.querySelector(".listing-gallery img"));
    await ui.click(button(top(ui),"Fotoğrafı kaldır"));await ui.resolve(ui.requests[2],{deleted:true,id:"photo-a"});await ui.resolve(ui.requests[3],data([listing()]));assert.equal(top(ui),undefined);assert.equal(ui.host.querySelector(".listing-gallery img"),null);
  }finally{await ui.close();}
});

test("late response bodies from the previous owner cannot clear a new account's market state",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();await ui.openCreate();await ui.submit();const body=deferred();await act(async()=>ui.requests[1].resolve({ok:true,status:201,json:()=>body.promise}));await ui.switchOwner("owner-b:1");await ui.resolve(ui.requests[2],data([listing("other-owner")]));await act(async()=>body.resolve({listing:{id:"old-owner-created"}}));assert.equal(top(ui),undefined);assert.doesNotMatch(ui.host.textContent,/kampüsüne açıldı|taslağın korunuyor|önceki kayıt/);assert.equal(ui.requests.length,3);
  }finally{await ui.close();}
});

test("a stalled successful HTTP response body times out as uncertain and leaves a recoverable locked draft",async()=>{
  const ui=await setup();try{
    await ui.renderMarket();const timer=ui.window.setTimeout.bind(ui.window);ui.window.setTimeout=(callback,ms,...args)=>timer(callback,ms===20000?10:ms,...args);await ui.openCreate();await ui.submit();await act(async()=>ui.requests[1].resolve({ok:true,status:201,json:()=>new Promise(()=>{})}));await ui.until(()=>top(ui)?.textContent.includes("Kayıt sonucu doğrulanamadı"));assert.equal(top(ui).querySelector('[name="title"]').value,"Kampüs kitabı");assert.equal(top(ui).querySelector('button[type="submit"]').disabled,true);await ui.submit();assert.equal(ui.requests.length,2);
  }finally{await ui.close();}
});
