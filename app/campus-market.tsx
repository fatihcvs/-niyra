"use client";
/* eslint-disable @next/next/no-img-element */

import { MarketRequestError, useMarketRequests } from "./use-market-requests";
import { FormEvent, type MouseEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";


import { AppLink, useAppNavigation } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import { useWorkspaceState } from "./use-workspace-state";
import { useWorkspaceDrafts } from "./use-workspace-drafts";
import layerStyles from "./workspace-layer.module.css";
import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty } from "./workspace-ui";
import { CampusContentDetail } from "./campus-content-detail";
import { matchesSearch, listingHref } from "../lib/workspace-navigation";
import recoveryStyles from "./market-recovery.module.css";
import { Button, Sheet } from "./ui-primitives";
import { createMarketWriteKey } from "../lib/market-write-key";
import { useMarketDraft } from "./use-market-draft";
import { emptyMarketDraft, type MarketCreateRecovery, type MarketContactAttempt, type MarketDraftSnapshot } from "../lib/market-draft-store";

type Listing = { id:string; kind:string; category:string; title:string; description:string; priceCents:number|null; condition:string; meetupPlace:string; status:string; ownerId:string; ownerName:string; own:boolean; images:{id:string;url:string}[]; inquiryCount:number; time:string; updatedTime:string };
type Price = { id:string; placeName:string; itemName:string; category:string; latestPriceCents:number; minPriceCents:number; maxPriceCents:number; averagePriceCents:number; sampleCount:number; observedAt:string; sourceNote:string; freshness:{state:string;label:string;days:number}; own:boolean };
type Inquiry = { id:string; listingId:string; listingTitle:string; message:string; status:string; direction:"incoming"|"outgoing"; otherId:string|null; otherName:string; time:string };
type Place = { id:string; name:string };
type MarketResponse = { listings?:Listing[]; prices?:Price[]; inquiries?:Inquiry[]; places?:Place[]; error?:string };
type CreateRecovery = MarketCreateRecovery;
type ContactTarget = Pick<Listing,"id"|"title">;
type ContactAttempt = MarketContactAttempt;
export type CampusMarketTab = "store"|"prices"|"messages";

const listingCategories = [["books","Kitap ve not"],["electronics","Elektronik"],["home","Ev ve yurt"],["clothing","Giyim"],["sports","Spor"],["hobby","Hobi"],["transport","Ulaşım"],["other","Diğer"]] as const;
const priceCategories = [["food","Yemek"],["drink","İçecek"],["printing","Baskı-fotokopi"],["transport","Ulaşım"],["stationery","Kırtasiye"],["service","Hizmet"],["other","Diğer"]] as const;
const kindNames:Record<string,string>={sell:"Satılık",wanted:"Aranıyor",free:"Ücretsiz"};
const categoryNames:Record<string,string>=Object.fromEntries([...listingCategories,...priceCategories]);
const conditionNames:Record<string,string>={new:"Yeni","like-new":"Yeni gibi","used-good":"İyi durumda","used-fair":"Kullanılmış","not-applicable":"Uygulanamaz"};
const inquiryStatusNames:Record<string,string>={open:"Yanıt bekliyor",accepted:"Kabul edildi",declined:"Reddedildi",cancelled:"İptal edildi"};

function money(cents:number|null){if(cents===null)return "Fiyat konuşulur";if(cents===0)return "Ücretsiz";return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:cents%100?2:0}).format(cents/100);}
function photoSelectionError(files:File[]){
  if(files.length>6||files.some((file)=>!file.size||file.size>5*1024*1024)||files.reduce((sum,file)=>sum+file.size,0)>20*1024*1024)return "En fazla 6 fotoğraf; dosya başına 5 MB ve toplam 20 MB seçebilirsin.";
  if(files.some((file)=>!file.name||file.name.length>140||/[\\/\0]/.test(file.name)))return "Fotoğraf dosya adı en fazla 140 karakter olmalı; klasör işaretleri içermemeli.";
  const extensions:Record<string,string[]>={"image/png":["png"],"image/jpeg":["jpg","jpeg"],"image/webp":["webp"]};
  if(files.some((file)=>!extensions[file.type]?.includes(file.name.split(".").at(-1)?.toLowerCase()??"")))return "PNG, JPG veya WEBP fotoğraf seç; dosya uzantısı türüyle eşleşmeli.";
  return "";
}
function terminalPhotoFailure(cause:unknown){return cause instanceof MarketRequestError&&[400,410,413,415].includes(cause.status??0);}
function observed(value:string){if(!Number.isFinite(Date.parse(value)))return "Tarih belirtilmedi";return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium"}).format(new Date(value));}

export function CampusMarketWorkspace({universityShortName,initialTab="store",ownerId}:{universityShortName:string;initialTab?:CampusMarketTab;ownerId?:string}){
  const owner=useAppNavigation()?.ownerScope??"";
  const confirmedOwner=ownerId??(/^([A-Za-z0-9_-]{1,160}):\d+$/.exec(owner)?.[1]??null);
  return <CampusMarketContent key={owner} ownerId={owner?confirmedOwner:null} universityShortName={universityShortName} initialTab={initialTab}/>;
}
function CampusMarketContent({universityShortName,initialTab="store",ownerId}:{universityShortName:string;initialTab?:CampusMarketTab;ownerId:string|null}){
  const navigation=useAppNavigation();
  const {json,capture}=useMarketRequests();
  const [query,setQuery]=useWorkspaceState("market:query",""); const [categoryFilter,setCategoryFilter]=useWorkspaceState("market:categoryFilter",""); const [sort,setSort]=useWorkspaceState("market:sort","recent"); const [ownOnly,setOwnOnly]=useWorkspaceState("market:ownOnly",false);
  const [listings,setListings]=useState<Listing[]>([]);const [prices,setPrices]=useState<Price[]>([]);const [inquiries,setInquiries]=useState<Inquiry[]>([]);const [places,setPlaces]=useState<Place[]>([]);
  const [tab,setTab]=useWorkspaceState<CampusMarketTab>(`market:tab:${initialTab}`, initialTab);const [dialog,setDialog]=useState<"listing"|"price"|null>(null);const [contacting,setContacting]=useState<ContactTarget|null>(null);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState<{message:string;target:string}|null>(null);const error=failure?.message??"";const [notice,setNotice]=useState("");const [kind,setKind]=useWorkspaceState("market:kind","sell");const [listingImages,setListingImages]=useWorkspaceState<File[]>("market:images",[]);const imageCount=listingImages.length;
  const [recovery,setRecovery]=useWorkspaceState<CreateRecovery|null>("market:create-recovery",null);
  const [uncertainContacts,setUncertainContacts]=useWorkspaceState<Record<string,ContactAttempt>>("market:contact-attempts",{});
  const [reviewedPhotos,setReviewedPhotos]=useState(false);
  const [removeId,setRemoveId]=useState("");const lastRemove=useRef("");
  const pending=useRef(false);const readRequest=useRef<AbortController|null>(null);
  const draftState=useWorkspaceDrafts("market:forms",busy);
  const currentSnapshot:MarketDraftSnapshot={kind,forms:draftState.values,images:listingImages,recovery,contacts:uncertainContacts};
  const snapshotRef=useRef(currentSnapshot);useLayoutEffect(()=>{snapshotRef.current=currentSnapshot;});
  const restoreDraft=(record:MarketDraftSnapshot)=>{setKind(record.kind);draftState.setValues(record.forms);setListingImages(record.images);setRecovery(record.recovery);setUncertainContacts(record.contacts);};
  const durable=useMarketDraft({ownerId,snapshot:currentSnapshot,paused:busy,onRestore:restoreDraft,onInvalidate:()=>navigation?.onSessionExpired()});
  const formLocked=busy||!durable.canEdit||Boolean(recovery&&dialog===recovery.kind);
  const draft={...draftState,field:(bucket:string,name:string,fallback="")=>({...draftState.field(bucket,name,fallback),disabled:formLocked})};
  const nextSnapshot=(changes:Partial<MarketDraftSnapshot>={})=>({...snapshotRef.current,...changes});
  const setError=useCallback((message:string,target="workspace")=>setFailure(message?{message,target}:null),[]);
  const lastDialog=useRef<"listing"|"price">("listing");
  const lastContact=useRef<ContactTarget|null>(null);
  const {ref:createDialogRef,close:closeCreate}=useAppLayer({id:"market.create",open:dialog!==null,busy,onClose:()=>{if(dialog)lastDialog.current=dialog;setDialog(null);},onRestore:()=>setDialog(lastDialog.current)});
  const {ref:contactDialogRef,close:closeContact}=useAppLayer({id:"market.contact",open:Boolean(contacting),busy,onClose:()=>{lastContact.current=contacting;setContacting(null);},onRestore:()=>setContacting(lastContact.current)});
  useEffect(()=>{
    const storageFailed=["error","conflict"].includes(durable.view.state);
    if((!failure&&!storageFailed)||busy)return;
    const target=storageFailed?(dialog?`create:${dialog}`:`contact:${contacting?.id}`):failure?.target;
    const container=target===`create:${dialog}`?createDialogRef.current:target===`contact:${contacting?.id}`?contactDialogRef.current:null;
    if(!container)return;
    const frame=window.requestAnimationFrame(()=>{
      const active=document.activeElement;
      if(!container.isConnected||container.closest("[inert]")||(active instanceof HTMLElement&&active.closest('[role="dialog"]')!==container&&active!==document.body))return;
      const prompt=(storageFailed?container.querySelector<HTMLElement>('[aria-label="Pazar taslak durumu"]'):container.querySelector<HTMLElement>('[aria-label="Pazar kayıt kurtarma"]'))??container.querySelector<HTMLElement>('[role="alert"]');
      if(prompt){
        const header=container.querySelector<HTMLElement>(":scope > header");
        prompt.style.scrollMarginTop=`${(header?.getBoundingClientRect().height??0)+12}px`;
        prompt.tabIndex=-1;prompt.focus({preventScroll:true});prompt.scrollIntoView?.({block:"nearest",behavior:"instant"});
      }
    });
    return()=>window.cancelAnimationFrame(frame);
  },[failure,busy,dialog,contacting,createDialogRef,contactDialogRef,durable.view.state]);
  const openCreate=(kind:"listing"|"price")=>{
    if(pending.current||!durable.canEdit)return;
    const target=recovery?.kind??kind;
    if(target==="price"&&draft.values.price?.observedAt===undefined){
      const now=new Date();
      const localDate=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const initialDate=recovery?.kind==="price"&&typeof recovery.payload.observedAt==="string"?recovery.payload.observedAt:localDate;
      draft.setValues((current)=>current.price?.observedAt!==undefined?current:{...current,price:{...current.price,observedAt:initialDate}});
    }
    lastDialog.current=target;setDialog(target);
  };
  const openContact=(item:ContactTarget)=>{if(pending.current)return;lastContact.current=item;setContacting(item);};
  function openPendingContact(event:MouseEvent<HTMLButtonElement>){
    const id=event.currentTarget.dataset.listingId;if(!id)return;const attempt=uncertainContacts[id];
    if(attempt)openContact({id,title:attempt.title??"İlan mesajı"});
  }
  const applyData=useCallback((data:MarketResponse)=>{setListings(data.listings??[]);setPrices(data.prices??[]);setInquiries(data.inquiries??[]);setPlaces(data.places??[]);},[]);
  const load=useCallback(async()=>{
    const check=capture();readRequest.current?.abort();const controller=new AbortController();readRequest.current=controller;setLoading(true);
    try{const data=await json<MarketResponse>("/api/campus-market",{signal:controller.signal,cache:"no-store"},"Kampüs pazarı getirilemedi.");if(!check.isCurrent()||controller.signal.aborted)return null;if(!Array.isArray(data.listings)||!Array.isArray(data.inquiries)||!Array.isArray(data.prices))throw new Error("Pazar yanıtı doğrulanamadı.");applyData(data);return data;}
    catch(cause){if(check.isCurrent()&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Kampüs pazarı getirilemedi.");return null;}
    finally{if(check.isCurrent()&&!controller.signal.aborted)setLoading(false);}
  },[applyData,json,capture,setError]);
  useEffect(()=>{
    const check=capture(),controller=new AbortController();readRequest.current=controller;
    void json<MarketResponse>("/api/campus-market",{signal:controller.signal,cache:"no-store"},"Kampüs pazarı getirilemedi.").then((data)=>{if(!check.isCurrent()||controller.signal.aborted)return;if(!Array.isArray(data.listings)||!Array.isArray(data.inquiries)||!Array.isArray(data.prices))throw new Error("Pazar yanıtı doğrulanamadı.");applyData(data);}).catch((cause:unknown)=>{if(check.isCurrent()&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Kampüs pazarı getirilemedi.");}).finally(()=>{if(check.isCurrent()&&!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[json,capture,applyData,setError]);
  const lock=()=>{if(pending.current)return false;pending.current=true;setBusy(true);setError("");return true;};
  const unlock=(check:ReturnType<typeof capture>)=>{if(check.isCurrent()){pending.current=false;setBusy(false);}};
  async function completeCreate(record:CreateRecovery,message:string){
    const ownsLock=!pending.current;if(ownsLock&&!lock())return false;const check=capture();
    try{
      const current=snapshotRef.current;
      const saved=await durable.persist({...current,recovery:null,forms:{...current.forms,[record.kind]:{}},images:record.kind==="listing"?[]:current.images},[record.key]);
      if(saved.status!=="saved"||!check.isCurrent())return false;
      setReviewedPhotos(false);setNotice(message);setDialog((value)=>value===record.kind?null:value);return true;
    }finally{if(ownsLock)unlock(check);}
  }
  async function releaseCreate(){
    if(!recovery||!lock())return;const check=capture();
    try{const saved=await durable.persist(nextSnapshot({recovery:null}),[recovery.key]);if(saved.status==="saved"&&check.isCurrent())setError("");}finally{unlock(check);}
  }
  async function releaseContact(id:string,clearFields=false){
    const attempt=snapshotRef.current.contacts[id];if(!attempt)return false;
    const current=snapshotRef.current,contacts={...current.contacts};delete contacts[id];
    const forms={...current.forms};if(clearFields)delete forms[`contact:${id}`];
    const saved=await durable.persist({...current,contacts,forms},[attempt.key]);
    return saved.status==="saved";
  }
  async function editContact(id:string){
    if(!lock())return;const check=capture();try{if(await releaseContact(id)&&check.isCurrent())setError("");}finally{unlock(check);}
  }
  async function uploadPhotos(record:CreateRecovery){
    if(!record.listingId||!record.photoKey)throw new MarketRequestError("Fotoğrafların ekleneceği ilan doğrulanamadı.");
    const upload=new FormData();upload.set("listingId",record.listingId);for(const image of record.images)upload.append("images",image);
    const result=await json<{images?:{id:string;url:string}[]}>("/api/campus-market/images",{method:"POST",headers:{"Idempotency-Key":record.photoKey},body:upload},"Ürün fotoğrafları yüklenemedi.");
    if(!Array.isArray(result.images)||result.images.length!==record.images.length||result.images.some((image)=>!image.id||!image.url))throw new MarketRequestError("Fotoğraf yükleme sonucu doğrulanamadı. İlandaki fotoğrafları kontrol et.");
  }
  async function retryPhotos(reviewed=false){
    if(!recovery?.listingId||recovery.phase==="photos-ended"||(!reviewed&&!recovery.photoKey&&recovery.phase!=="photos-retry")||!lock())return;
    const record={...recovery,images:[...recovery.images],photoKey:recovery.photoKey??createMarketWriteKey()},check=capture();
    setRecovery({...record,phase:"photos-unknown"});setReviewedPhotos(false);
    try{const saved=await durable.persist(nextSnapshot({recovery:{...record,phase:"photos-unknown"}}));if(saved.status!=="saved"||!check.isCurrent())return;await uploadPhotos(saved.record.recovery!);if(!check.isCurrent())return;if(await completeCreate(record,`İlanın ${record.images.length} ürün fotoğrafıyla hazır.`))await load();}
    catch(cause){if(check.isCurrent()){const next:CreateRecovery={...record,phase:terminalPhotoFailure(cause)?"photos-ended":cause instanceof MarketRequestError&&!cause.uncertain?"photos-retry":"photos-unknown"};setRecovery(next);await durable.persist(nextSnapshot({recovery:next}));if(check.isCurrent())setError(`İlanın kayıtlı; fotoğraflar henüz doğrulanamadı. ${cause instanceof Error?cause.message:"Taslağın korunuyor."}`,`create:${record.kind}`);}}
    finally{unlock(check);}
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!dialog||pending.current||durable.blocked)return;
    if(recovery){if(recovery.kind===dialog&&recovery.phase==="photos-retry")await retryPhotos();return;}
    const submittedKind=dialog,form=new FormData(event.currentTarget),images=submittedKind==="listing"?[...listingImages]:[];
    const photoError=photoSelectionError(images);if(photoError){setError(photoError,`create:${submittedKind}`);return;}
    const selectedPlace=places.find((place)=>place.id===form.get("placeId"));
    const text=(name:string)=>typeof form.get(name)==="string"?String(form.get(name)):null;
    const payload:Record<string,string|null>=submittedKind==="listing"?{action:"listing",kind,category:text("category"),title:text("title"),description:text("description"),price:text("price"),condition:text("condition"),meetupPlace:text("meetupPlace")}:{action:"price",category:text("category"),placeId:selectedPlace?.id??"",placeName:selectedPlace?.name??text("placeName"),itemName:text("itemName"),price:text("price"),observedAt:text("observedAt"),sourceNote:text("sourceNote")};
    const record:CreateRecovery={kind:submittedKind,payload:Object.freeze(payload),images,phase:"create-unknown",key:createMarketWriteKey()};
    await sendCreate(record);
  }
  async function sendCreate(attempt:CreateRecovery,retrying=false){
    if(!attempt.key||durable.blocked||!lock())return;
    let record={...attempt,images:[...attempt.images]};const check=capture();
    try{
      const prepared=await durable.persist(nextSnapshot({recovery:record}));if(prepared.status!=="saved"||!check.isCurrent())return;
      record=prepared.record.recovery!;
      const result=await json<{listing?:{id:string};price?:{id:string}}>("/api/campus-market",{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":record.key},body:JSON.stringify(record.payload)},"Kayıt oluşturulamadı.");
      if(!check.isCurrent())return;
      const id=record.kind==="listing"?result.listing?.id:result.price?.id;if(!id)throw new MarketRequestError("Kayıt sonucu doğrulanamadı. Tekrar oluşturmadan güncel kayıtlarını kontrol et.");
      if(record.kind==="listing"&&record.images.length){record={...record,listingId:id,photoKey:record.photoKey??createMarketWriteKey(),phase:"photos-unknown"};setRecovery(record);const saved=await durable.persist(nextSnapshot({recovery:record}));if(saved.status!=="saved"||!check.isCurrent())return;record=saved.record.recovery!;await uploadPhotos(record);if(!check.isCurrent())return;}
      if(await completeCreate(record,record.kind==="listing"?record.images.length?`İlanın ${record.images.length} ürün fotoğrafıyla kampüsüne açıldı.`:"İlanın aynı kampüsteki öğrencilere açıldı.":"Fiyat gözlemin tarih ve kaynak notuyla eklendi."))await load();
    }catch(cause){if(check.isCurrent()){
      const uncertain=!(cause instanceof MarketRequestError)||cause.uncertain;
      if(record.listingId){record={...record,phase:terminalPhotoFailure(cause)?"photos-ended":uncertain?"photos-unknown":"photos-retry"};setRecovery(record);await durable.persist(nextSnapshot({recovery:record}));}
      else if(cause instanceof MarketRequestError&&cause.status===410){record={...record,phase:"create-ended"};setRecovery(record);await durable.persist(nextSnapshot({recovery:record}));}
      // A later quota/auth rejection cannot disprove an earlier request's unknown commit.
      else if(!retrying&&!uncertain&&!(cause instanceof MarketRequestError&&cause.status===409))await durable.persist(nextSnapshot({recovery:null}),[record.key]);
      if(!check.isCurrent())return;
      setError(record.listingId?`İlanın yayınlandı; fotoğrafların taslakta korunuyor. ${cause instanceof Error?cause.message:"Sonucu kontrol et."}`:uncertain?"Kayıt sonucu doğrulanamadı. Taslağın korunuyor; aynı kaydı güvenle tekrar deneyebilirsin.":cause.message,`create:${record.kind}`);
    }}finally{unlock(check);}
  }
  async function contact(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!contacting||pending.current||durable.blocked||uncertainContacts[contacting.id])return;
    const id=contacting.id,form=new FormData(event.currentTarget),message=String(form.get("message")??"");
    await sendContact(id,{message,key:createMarketWriteKey(),title:contacting.title});
  }
  async function sendContact(id:string,attempt:ContactAttempt,retrying=false){
    if(attempt.ended||durable.blocked||!lock())return;const check=capture();
    try{
      const saved=await durable.persist(nextSnapshot({contacts:{...snapshotRef.current.contacts,[id]:attempt}}));if(saved.status!=="saved"||!check.isCurrent())return;attempt=saved.record.contacts[id];
      const result=await json<{inquiry?:{id:string}}>("/api/campus-market",{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":attempt.key},body:JSON.stringify({action:"inquiry",listingId:id,message:attempt.message})},"Mesaj gönderilemedi.");if(!check.isCurrent())return;if(!result.inquiry?.id)throw new MarketRequestError("Mesaj sonucu doğrulanamadı.");
      if(!(await releaseContact(id,true))||!check.isCurrent())return;setContacting((current)=>current?.id===id?null:current);setTab("messages");setNotice("Mesajın ilan sahibine iletildi.");await load();
    }catch(cause){if(check.isCurrent()){if(cause instanceof MarketRequestError&&cause.status===410){const contacts={...snapshotRef.current.contacts,[id]:{...attempt,ended:true}};setUncertainContacts(contacts);await durable.persist(nextSnapshot({contacts}));}else if(!retrying&&cause instanceof MarketRequestError&&!cause.uncertain)await releaseContact(id);if(check.isCurrent())setError(cause instanceof Error?cause.message:"Mesaj sonucu doğrulanamadı.",`contact:${id}`);}}
    finally{unlock(check);}
  }
  async function verifyContact(id:string){
    if(!uncertainContacts[id]||!lock())return;const check=capture(),message=uncertainContacts[id].message;
    try{const data=await load();if(!check.isCurrent()||!data)return;const found=data.inquiries?.find((item)=>item.listingId===id&&item.direction==="outgoing"&&item.message===message.trim());if(found){if(!(await releaseContact(id,true))||!check.isCurrent())return;setContacting((current)=>current?.id===id?null:current);setTab("messages");setNotice("Gönderdiğin mesaj mevcut kayıtta doğrulandı. Tekrar gönderilmedi.");}else setError("Mesaj henüz listede doğrulanamadı. Taslağın korunuyor; tekrar gönderilmedi.",`contact:${id}`);}
    finally{unlock(check);}
  }
  async function update(action:"listing-status"|"inquiry-status"|"archive-price",id:string,status?:string){
    if(!lock())return;const check=capture();
    try{const result=await json<{status?:string;archived?:boolean}>("/api/campus-market",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action,id,status})});if(!check.isCurrent())return;if(action==="archive-price"?result.archived!==true:result.status!==status)throw new MarketRequestError("Güncelleme sonucu doğrulanamadı.");setNotice("Pazar kaydı güncellendi.");await load();}
    catch(cause){if(check.isCurrent())setError(cause instanceof Error?cause.message:"Kayıt güncellenemedi.");}finally{unlock(check);}
  }
  function requestRemoveImage(id:string){if(pending.current)return;lastRemove.current=id;setRemoveId(id);setError("");}
  async function removeImage(){
    if(!removeId||!lock())return;const id=removeId,check=capture();
    try{const result=await json<{deleted?:boolean;id?:string}>("/api/campus-market/images",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});if(!check.isCurrent())return;if(result.deleted!==true||result.id!==id)throw new MarketRequestError("Fotoğraf silme sonucu doğrulanamadı.");lastRemove.current="";setRemoveId("");setListings((current)=>current.map((item)=>({...item,images:item.images.filter((image)=>image.id!==id)})));setNotice("Ürün fotoğrafı ilandan kaldırıldı.");await load();}
    catch(cause){if(check.isCurrent())setError(cause instanceof Error?cause.message:"Fotoğraf kaldırılamadı.",`remove:${id}`);}finally{unlock(check);}
  }
  async function continueExistingListing(item:Listing){
    if(pending.current||!recovery||!item.own)return;
    if(!recovery.images.length){await completeCreate(recovery,"Mevcut ilanla devam ediyorsun. Yeni ilan oluşturulmadı.");return;}
    if(!lock())return;const check=capture();try{const saved=await durable.persist(nextSnapshot({recovery:{...recovery,listingId:item.id,phase:item.images.length?"photos-unknown":"photos-retry"}}));if(saved.status==="saved"&&check.isCurrent()){setReviewedPhotos(false);setError("");}}finally{unlock(check);}
  }
  async function discardEditableDrafts(){
    if(recovery||Object.keys(uncertainContacts).length||!lock())return;const check=capture();try{const result=await durable.persist(emptyMarketDraft());if(result.status==="saved"&&check.isCurrent())setNotice("Kaydedilmiş taslaklar temizlendi.");}finally{unlock(check);}
  }
  const storageNotice=<section className={["error","conflict"].includes(durable.view.state)?recoveryStyles.recovery:recoveryStyles.draftStatus} role="status" aria-label="Pazar taslak durumu" data-state={durable.view.state}><p>{durable.view.message}</p>{durable.view.state==="error"&&<button type="button" disabled={busy} onClick={()=>void durable.retry()}>Taslağı kaydetmeyi tekrar dene</button>}{durable.view.state==="conflict"&&<button type="button" disabled={busy} onClick={()=>void durable.restoreConflict()}>Kayıtlı taslağı aç</button>}{durable.view.state==="saved"&&!recovery&&!Object.keys(uncertainContacts).length&&<button className={recoveryStyles.clearDraft} type="button" disabled={busy} aria-label="Kaydedilmiş taslakları temizle" onClick={()=>void discardEditableDrafts()}>Temizle</button>}</section>;
  const savedContactDrafts=Object.entries(draft.values).filter(([bucket,fields])=>bucket.startsWith("contact:")&&fields.message?.trim()&&!uncertainContacts[bucket.slice(8)]&&contacting?.id!==bucket.slice(8));
  const recoveryNotice=recovery&&<section className={recoveryStyles.recovery} aria-label="Pazar kayıt kurtarma"><strong>{recovery.phase==="create-ended"?"Önceki kayıt kaldırılmış":recovery.phase==="photos-ended"?"Fotoğraf işlemi sona erdi":recovery.listingId?"İlanın kayıtlı, fotoğraflarını tamamla":"Önce önceki kayıt sonucunu kontrol et"}</strong><p>{recovery.phase==="create-ended"?"Taslağını düzenleyerek yeni bir kayıt oluşturabilirsin.":recovery.phase==="photos-ended"?"Bu yükleme yeniden gönderilmeyecek. İlanın son durumunu inceleyip fotoğraf taslağını kapatabilirsin.":recovery.listingId?`${recovery.images.length} fotoğraf ve taslağın korunuyor. ${recovery.photoKey?"Tekrar denediğinde aynı yükleme tamamlanır; fotoğraflar çoğalmaz.":"Devam etmeden ilandaki fotoğrafları kontrol et."}`:"Yanıt alınamadığı için ikinci bir kayıt otomatik oluşturulmaz. Tekrar denediğinde aynı kayıt doğrulanır; taslağın korunur."}</p>
    <div className={recoveryStyles.actions}>{recovery.phase==="create-unknown"&&recovery.key&&<button type="button" disabled={busy} onClick={()=>void sendCreate(recovery,true)}>Kaydı tekrar dene</button>}{recovery.phase==="create-ended"&&<button type="button" disabled={busy} onClick={()=>void releaseCreate()}>Taslağı düzenle</button>}<button type="button" disabled={busy} onClick={()=>void load()}>Son durumu kontrol et</button>{recovery.listingId&&<AppLink href={listingHref(recovery.listingId)}>İlanı ve fotoğrafları aç</AppLink>}{(recovery.phase==="photos-retry"||recovery.phase==="photos-unknown"&&recovery.photoKey)&&<button type="button" disabled={busy} onClick={()=>void retryPhotos()}>Fotoğrafları tekrar yükle</button>}</div>
    {recovery.phase==="photos-ended"&&<button type="button" disabled={busy} onClick={()=>completeCreate(recovery,"Sona eren fotoğraf taslağı kapatıldı.")}>Fotoğraf taslağını kapat</button>}
    {recovery.phase==="create-unknown"&&recovery.kind==="listing"&&listings.filter((item)=>item.own&&item.title===String(recovery.payload.title).trim()&&item.description===String(recovery.payload.description).trim()).map((item)=><div key={item.id} className={recoveryStyles.actions}><AppLink href={listingHref(item.id)}>{item.title} ilanını incele</AppLink><button type="button" disabled={busy} onClick={()=>continueExistingListing(item)}>Bu ilanla devam et</button></div>)}
    {recovery.phase==="create-unknown"&&recovery.kind==="price"&&prices.filter((item)=>item.own&&item.itemName===String(recovery.payload.itemName).trim()&&item.placeName===String(recovery.payload.placeName).trim()&&item.sourceNote===String(recovery.payload.sourceNote).trim()).map((item)=><button key={item.id} type="button" disabled={busy} onClick={()=>completeCreate(recovery,"Mevcut fiyat kaydıyla devam ediyorsun. Yeni kayıt oluşturulmadı.")}>{item.itemName} · {money(item.latestPriceCents)} kaydıyla devam et</button>)}
    {recovery.phase==="photos-unknown"&&!recovery.photoKey&&<><label><input type="checkbox" checked={reviewedPhotos} disabled={busy} onChange={(event)=>setReviewedPhotos(event.target.checked)}/> İlanı açıp fotoğrafları kontrol ettim.</label><div className={recoveryStyles.actions}><button type="button" disabled={busy||!reviewedPhotos} onClick={()=>completeCreate(recovery,"İlandaki fotoğrafları kontrol ederek taslağı tamamladın.")}>Fotoğraflar ilanda, tamamla</button><button type="button" disabled={busy||!reviewedPhotos} onClick={()=>void retryPhotos(true)}>Hiç fotoğraf eklenmemiş, yeniden yükle</button></div></>}
  </section>;

  const visibleListings=listings.filter((item)=>(!ownOnly||item.own)&&(!categoryFilter||item.category===categoryFilter)&&matchesSearch(query,item.title,item.description,item.meetupPlace)).sort((a,b)=>sort==="low"?(a.priceCents??Infinity)-(b.priceCents??Infinity):sort==="high"?(b.priceCents??-1)-(a.priceCents??-1):0);
  const visiblePrices=prices.filter((item)=>(!ownOnly||item.own)&&(!categoryFilter||item.category===categoryFilter)&&matchesSearch(query,item.itemName,item.placeName)).sort((a,b)=>sort==="low"?a.latestPriceCents-b.latestPriceCents:sort==="high"?b.latestPriceCents-a.latestPriceCents:0);
  const visibleInquiries=inquiries.filter((item)=>matchesSearch(query,item.listingTitle,item.message,item.otherName));
  const resetFilters=()=>{setQuery("");setCategoryFilter("");setSort("recent");setOwnOnly(false);};
  return <div className="workspace-view market-workspace"><WorkspaceHeader screenId="market" section="Pazar" eyebrow={universityShortName} title="Kampüs pazarı" description="İkinci el ihtiyaçlarını bul, ilanlarını yönet ve kampüsteki güncel fiyatları karşılaştır. Ödeme ve teslim öğrenciler arasında kararlaştırılır." primaryAction={tab === "messages" ? null : { id: "market.create", label: tab === "prices" ? "Fiyat ekle" : "İlan ver", icon: <Plus size={22}/>, disabled: busy, onPress: () => openCreate(tab === "prices" ? "price" : "listing") }} secondaryActions={[{ id: "market.refresh", label: "İçeriği yenile", busy: loading, onPress: load }, { id: "market.create-other", label: tab === "prices" ? "İlan ver" : "Fiyat ekle", disabled: busy, onPress: () => openCreate(tab === "prices" ? "listing" : "price") }]}/>
  <nav className="market-tabs" aria-label="Kampüs pazarı bölümleri"><button className={tab==="store"?"active":""} type="button" onClick={()=>{setTab("store");resetFilters();}}><strong>İlanlar</strong><small>{listings.length} açık ilan</small></button><button className={tab==="prices"?"active":""} type="button" onClick={()=>{setTab("prices");resetFilters();}}><strong>Fiyatlar</strong><small>{prices.length} ürün ve hizmet</small></button><button className={tab==="messages"?"active":""} type="button" onClick={()=>{setTab("messages");resetFilters();}}><strong>Mesajlar</strong><small>{inquiries.filter((item)=>item.status==="open").length} açık konuşma</small></button></nav>
  <WorkspaceSearch value={query} onChange={setQuery} placeholder={tab==="messages"?"İlan mesajlarında ara":"Ürün, ilan veya yer ara"} resultCount={loading?undefined:tab==="store"?visibleListings.length:tab==="prices"?visiblePrices.length:visibleInquiries.length} onReset={query||categoryFilter||ownOnly||sort!=="recent"?resetFilters:undefined}>{tab!=="messages"&&<><label><span className="sr-only">Kategori</span><select value={categoryFilter} onChange={(event)=>setCategoryFilter(event.target.value)}><option value="">Tüm kategoriler</option>{(tab==="store"?listingCategories:priceCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span className="sr-only">Sıralama</span><select value={sort} onChange={(event)=>setSort(event.target.value)}><option value="recent">En yeni</option><option value="low">Fiyat: düşükten yükseğe</option><option value="high">Fiyat: yüksekten düşüğe</option></select></label><label><input type="checkbox" checked={ownOnly} onChange={(event)=>setOwnOnly(event.target.checked)}/>Benim eklediklerim</label></>}</WorkspaceSearch>
  {!loading&&((tab==="store"&&listings.length>0&&visibleListings.length===0)||(tab==="prices"&&prices.length>0&&visiblePrices.length===0)||(tab==="messages"&&inquiries.length>0&&visibleInquiries.length===0))&&<WorkspaceEmpty action={<button type="button" onClick={resetFilters}>Filtreleri temizle</button>}/>}
  {!contacting&&Object.entries(uncertainContacts).map(([id,attempt])=><section key={id} className={recoveryStyles.recovery} aria-label="Bekleyen ilan mesajı"><strong>{attempt.title??"İlan mesajı"}</strong><p>İlan listede görünmese de mesajının sonucunu kontrol edebilirsin. Taslağın korunuyor.</p><button type="button" disabled={busy} data-listing-id={id} onClick={openPendingContact}>Mesaj taslağını aç</button></section>)}
  {!dialog&&!contacting&&storageNotice}{savedContactDrafts.map(([bucket])=><section key={bucket} className={recoveryStyles.recovery} aria-label="Kaydedilmiş ilan mesajı"><p>İlan mesajı taslağın saklanıyor.</p><button type="button" disabled={busy||durable.blocked} onClick={()=>openContact({id:bucket.slice(8),title:listings.find((item)=>item.id===bucket.slice(8))?.title??"İlan mesajı"})}>Mesaj taslağını aç</button></section>)}{(!dialog||dialog!==recovery?.kind)&&recoveryNotice}{notice&&<p className="market-notice" role="status">{notice}</p>}{error&&<p className="feature-feedback-state" role="alert">{error}</p>}
  {loading?<div className="market-empty"><strong>Kampüs pazarı hazırlanıyor…</strong></div>:tab==="store"?(listings.length===0?<div className="market-empty"><span>ÖĞRENCİ PAZARI</span><strong>Henüz açık ilan yok</strong><p>İlk satılık, aranan veya ücretsiz ilanı kampüsün için yayınlayabilirsin.</p><button type="button" onClick={()=>openCreate("listing")}>İlk ilanı ver</button></div>:<div className="listing-grid">{visibleListings.map((item)=><article className={`listing-card kind-${item.kind}`} key={item.id}>{item.images.length>0&&<div className={`listing-gallery images-${Math.min(item.images.length,6)}`}>{item.images.slice(0,6).map((image,index)=><figure className={index===0?"featured":""} key={image.id}><img src={image.url} alt={`${item.title} ürün fotoğrafı ${index+1}`} width={680} height={420} loading="lazy"/>{item.own&&<button type="button" disabled={busy} onClick={()=>requestRemoveImage(image.id)} aria-label={`${index+1}. ürün fotoğrafını kaldır`}><X size={22} aria-hidden="true"/></button>}</figure>)}</div>}<header><span>{kindNames[item.kind]??item.kind}</span><b>{categoryNames[item.category]??item.category}</b></header><h2><AppLink href={listingHref(item.id)}>{item.title}</AppLink></h2><strong>{money(item.priceCents)}</strong><p>{item.description}</p><dl><div><dt>Durum</dt><dd>{conditionNames[item.condition]??item.condition}</dd></div><div><dt>Teslim</dt><dd>{item.meetupPlace||"Birlikte kararlaştırılır"}</dd></div></dl><footer><div><AppLink href={`/?profile=${encodeURIComponent(item.ownerId)}`}>{item.ownerName}</AppLink><small>{item.time} önce</small></div>{item.own?<select aria-label="İlan durumu" value={item.status} disabled={busy} onChange={(event)=>void update("listing-status",item.id,event.target.value)}><option value="active">Aktif</option><option value="reserved">Rezerve</option><option value="sold">Satıldı</option><option value="closed">Kapat</option></select>:<button type="button" disabled={busy||item.status!=="active"} onClick={()=>openContact(item)}>{item.status==="reserved"?"Rezerve":"Mesaj gönder"}</button>}</footer></article>)}</div>):tab==="prices"?(prices.length===0?<div className="market-empty"><span>FİYAT TAKİBİ</span><strong>Henüz fiyat gözlemi yok</strong><p>Fiş veya menüde gördüğün gerçek fiyatı tarih ve kısa kaynak notuyla ekle.</p><button type="button" onClick={()=>openCreate("price")}>Fiyat ekle</button></div>:<><div className="price-trust-note"><strong>Fiyatlar öğrencilerin tarihli gözlemleridir.</strong><span>İşletmenin resmî fiyatı değildir; eski kayıtlarda uyarı gösterilir.</span></div><div className="price-grid">{visiblePrices.map((item)=><article className="price-card" key={`${item.placeName}-${item.itemName}`}><header><div><span>{categoryNames[item.category]??item.category}</span><h2>{item.itemName}</h2></div><b className={item.freshness.state}>{item.freshness.label}</b></header><p>{item.placeName}</p><strong>{money(item.latestPriceCents)}</strong>{item.sampleCount>1&&<small>{item.sampleCount} gözlem · aralık {money(item.minPriceCents)}–{money(item.maxPriceCents)} · ort. {money(item.averagePriceCents)}</small>}<blockquote>{item.sourceNote}</blockquote><footer><time dateTime={item.observedAt}>{observed(item.observedAt)} tarihinde görüldü</time>{item.own&&<button type="button" onClick={()=>void update("archive-price",item.id)}>Kaldır</button>}</footer></article>)}</div></>):inquiries.length===0?<div className="market-empty"><span>MESAJLAR</span><strong>Henüz ilan mesajın yok</strong><p>İlan sahibine kişisel bilgi vermeden ürünle ilgili soru sorabilirsin.</p></div>:<div className="market-message-list">{visibleInquiries.map((item)=><article key={item.id}><header><div><span>{item.direction==="incoming"?"GELEN MESAJ":"GÖNDERDİĞİN MESAJ"}</span><h2><AppLink href={listingHref(item.listingId)}>{item.listingTitle}</AppLink></h2></div><b>{inquiryStatusNames[item.status]??item.status}</b></header><p>{item.message}</p><footer><small>{item.otherName} · {item.time} önce</small><div>{item.status==="open"&&item.direction==="incoming"&&<><button type="button" onClick={()=>void update("inquiry-status",item.id,"declined")}>Reddet</button><button className="accept" type="button" onClick={()=>void update("inquiry-status",item.id,"accepted")}>Kabul et</button></>}{item.status==="open"&&item.direction==="outgoing"&&<button type="button" onClick={()=>void update("inquiry-status",item.id,"cancelled")}>İptal et</button>}</div></footer></article>)}</div>}
  {dialog&&<div className="feature-overlay" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)closeCreate();}}><section ref={createDialogRef} className={`feature-dialog market-dialog ${layerStyles.dialog}`} data-mobile-overlay="true" role="dialog" aria-modal="true" aria-labelledby="market-dialog-title"><header><div><span>{dialog==="listing"?"ÖĞRENCİ MAĞAZASI":"FİYAT GÖZLEMİ"}</span><h2 id="market-dialog-title">{dialog==="listing"?"İlan ver":"Kampüs fiyatı ekle"}</h2></div><button type="button" onClick={closeCreate} disabled={busy} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header><form onSubmit={create}>{storageNotice}{dialog===recovery?.kind&&recoveryNotice}{error&&failure?.target===`create:${dialog}`&&<p role="alert" className="feature-feedback-state">{error}</p>}{dialog==="listing"?<><div className="market-kind-tabs">{[["sell","Satılık"],["wanted","Aranıyor"],["free","Ücretsiz"]].map(([value,label])=><button className={kind===value?"active":""} type="button" key={value} disabled={formLocked} onClick={()=>setKind(value)}>{label}</button>)}</div><div className={`market-image-field ${recoveryStyles.photoField}`} data-market-photos="true" role="group" aria-label="Ürün fotoğrafları"><span>Ürün fotoğrafları <b>{imageCount}/6</b></span><div className={recoveryStyles.photoActions}><label className={recoveryStyles.pickPhotos} aria-disabled={formLocked}><span>{imageCount?"Fotoğrafları değiştir":"Fotoğraf seç"}</span><input className={recoveryStyles.fileInput} aria-label="Ürün fotoğrafları" name="images" type="file" disabled={formLocked} accept="image/png,image/jpeg,image/webp" multiple onChange={(event)=>{if(pending.current||recovery)return;const files=Array.from(event.currentTarget.files??[]);event.currentTarget.setCustomValidity("");const photoError=photoSelectionError(files);if(photoError){event.currentTarget.value="";setError(photoError,"create:listing");return;}setListingImages(files);setError("");}}/></label>{imageCount>0&&<button className={recoveryStyles.clearPhotos} type="button" aria-label="Seçili fotoğrafları temizle" disabled={formLocked} onClick={(event)=>{const input=event.currentTarget.closest('[data-market-photos="true"]')?.querySelector<HTMLInputElement>('input[type="file"]');if(input)input.value="";setListingImages([]);setError("");}}>Temizle</button>}</div><small>{imageCount>0?`${imageCount} fotoğraf seçili. Yeni seçim önceki fotoğrafların yerini alır.`:"İsteğe bağlı · PNG, JPG veya WEBP · dosya başına en fazla 5 MB"}</small>{listingImages.length>0&&<ol className={recoveryStyles.draftFiles} aria-label="Taslak ürün fotoğrafları">{listingImages.map((file,index)=><li key={`${index}:${file.name}`}>{file.name}</li>)}</ol>}</div><div className="market-form-row"><label>Başlık<input name="title" {...draft.field(dialog, "title")} minLength={3} maxLength={100} required placeholder="Örn. Temiz hesap makinesi"/></label><label>Kategori<select name="category" {...draft.field(dialog, "category", "books")}>{listingCategories.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div><label>Açıklama<textarea name="description" {...draft.field(dialog, "description")} minLength={12} maxLength={900} rows={4} required placeholder="Ürünün gerçek durumunu, eksiklerini ve teslim ayrıntısını yaz."/></label><div className="market-form-row"><label>Fiyat (₺)<input name="price" {...draft.field(dialog, "price")} type="number" min="0" max="10000000" step="0.01" required={kind==="sell"} disabled={formLocked||kind==="free"} placeholder={kind==="wanted"?"İsteğe bağlı":"0"}/></label><label>Durum<select name="condition" {...draft.field(dialog, "condition", kind==="wanted"?"not-applicable":"used-good")}><option value="new">Yeni</option><option value="like-new">Yeni gibi</option><option value="used-good">İyi durumda</option><option value="used-fair">Kullanılmış</option><option value="not-applicable">Uygulanamaz</option></select></label></div><label>Güvenli teslim noktası<input name="meetupPlace" {...draft.field(dialog, "meetupPlace")} maxLength={100} placeholder="Örn. Merkez kütüphane girişi"/></label></>:<><div className="market-form-row"><label>Mekân<select name="placeId" {...draft.field(dialog, "placeId", "")}><option value="">Listede yok / çevrede</option>{places.map((place)=><option value={place.id} key={place.id}>{place.name}</option>)}</select></label><label>Mekân adı<input name="placeName" {...draft.field(dialog, "placeName")} maxLength={100} placeholder="Seçmediysen adı yaz"/></label></div><div className="market-form-row"><label>Ürün veya hizmet<input name="itemName" {...draft.field(dialog, "itemName")} minLength={2} maxLength={100} required placeholder="Örn. Öğrenci menüsü"/></label><label>Kategori<select name="category" {...draft.field(dialog, "category", "food")}>{priceCategories.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div><div className="market-form-row"><label>Gördüğün fiyat (₺)<input name="price" {...draft.field(dialog, "price")} type="number" min="0" max="1000000" step="0.01" required/></label><label>Gözlem tarihi<input name="observedAt" type="date" {...draft.field(dialog, "observedAt")} required/></label></div><label>Kaynak notu<input name="sourceNote" {...draft.field(dialog, "sourceNote")} minLength={5} maxLength={240} required placeholder="Örn. Kasadaki menüde gördüm; içecek dahil."/></label></>}<p className="market-safety-note">Ödeme bilgisi, ev adresi veya kimlik belgesi paylaşma. Teslim için kalabalık bir kampüs alanı seç.</p><footer><button type="button" onClick={closeCreate} disabled={busy}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy||durable.blocked||Boolean(recovery&&recovery.phase!=="photos-retry")}>{busy?dialog==="listing"&&imageCount?"İlan ve fotoğraflar yükleniyor…":"Kaydediliyor…":recovery?.phase==="photos-retry"?"Fotoğrafları tekrar yükle":"Kaydet"}</button></footer></form></section></div>}
  <CampusContentDetail kind="listing" onContact={openContact}/>
  {contacting&&<div className="feature-overlay" role="presentation"><section ref={contactDialogRef} className={`feature-dialog market-dialog ${layerStyles.dialog}`} data-mobile-overlay="true" role="dialog" aria-modal="true" aria-labelledby="market-contact-title"><header><div><span>İLAN MESAJI</span><h2 id="market-contact-title">{contacting.title}</h2></div><button type="button" onClick={closeContact} disabled={busy} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header><form onSubmit={contact}>{storageNotice}{uncertainContacts[contacting.id]&&<div className={recoveryStyles.recovery} role="region" aria-label="Pazar kayıt kurtarma"><p>{uncertainContacts[contacting.id].ended?"Önceki mesaj kaydı kaldırılmış. Mesaj taslağın korunuyor.":"Mesajın sonucu belirsiz; taslağın korunuyor. Tekrar deneme aynı mesajı doğrular."}</p>{uncertainContacts[contacting.id].ended?<button type="button" disabled={busy} onClick={()=>void editContact(contacting.id)}>Mesaj taslağını düzenle</button>:<button type="button" disabled={busy} onClick={()=>void sendContact(contacting.id,uncertainContacts[contacting.id],true)}>Mesajı tekrar dene</button>}<button type="button" disabled={busy} onClick={()=>void verifyContact(contacting.id)}>Gönderilen mesajı kontrol et</button></div>}{error&&failure?.target===`contact:${contacting.id}`&&<p role="alert" className="feature-feedback-state">{error}</p>}<label>İlan sahibine mesajın<textarea name="message" {...draft.field(`contact:${contacting.id}`, "message")} disabled={busy||durable.blocked||Boolean(uncertainContacts[contacting.id])} minLength={8} maxLength={500} rows={5} required placeholder="Ürünün durumu veya kampüs teslimiyle ilgili sorunu yaz."/></label><p className="market-safety-note">Kampira ödeme aracısı değildir. Ürünü görmeden para gönderme.</p><footer><button type="button" onClick={closeContact} disabled={busy}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy||durable.blocked||Boolean(uncertainContacts[contacting.id])}>Mesaj gönder</button></footer></form></section></div>}
  <Sheet id="market.remove-image" open={Boolean(removeId)} busy={busy} title="Ürün fotoğrafını kaldır" description="Seçtiğin fotoğraf ilanından kaldırılacak." onClose={()=>setRemoveId("")} onRestore={()=>setRemoveId(lastRemove.current)} footer={(close)=><><Button disabled={busy} onClick={close}>Vazgeç</Button><Button busy={busy} onClick={()=>void removeImage()}>Fotoğrafı kaldır</Button></>}>{failure?.target===`remove:${removeId}`&&<p role="alert">{error}</p>}</Sheet>
  </div>;
}
