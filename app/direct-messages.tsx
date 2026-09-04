"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { Books } from "@phosphor-icons/react/dist/csr/Books";
import { CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { Checks } from "@phosphor-icons/react/dist/csr/Checks";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Paperclip } from "@phosphor-icons/react/dist/csr/Paperclip";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Storefront } from "@phosphor-icons/react/dist/csr/Storefront";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/csr/X";
import styles from "./direct-messages.module.css";

export type DirectMessageRecipient = {
  publicId: string;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  universityShortName: string;
  departmentName: string;
};

type Conversation = {
  id: string;
  person: DirectMessageRecipient;
  preview: string;
  lastMessageOwn: boolean;
  unreadCount: number;
  time: string;
};

type Attachment = {
  title: string;
  subtitle: string;
  detail: string;
  section: "Notlar" | "Kütüphane" | "Kampüs" | "Pazar";
};

type Message = {
  id: string;
  own: boolean;
  body: string;
  attachmentType: string | null;
  attachmentId: string | null;
  attachment: Attachment | null;
  read: boolean;
  removed: boolean;
  time: string;
};

type Shareable = {
  id: string;
  type: "note" | "library" | "event" | "place" | "listing";
  title: string;
  meta: string;
  detail: string;
  section: Attachment["section"];
};

type MessagesPayload = {
  conversations?: Conversation[];
  messages?: Message[];
  shareables?: Shareable[];
  error?: string;
};

const attachmentMeta = {
  note: { label: "Not", icon: FileText },
  library: { label: "Kütüphane", icon: Books },
  event: { label: "Etkinlik", icon: CalendarDots },
  place: { label: "Mekân", icon: MapPin },
  listing: { label: "İlan", icon: Storefront },
} as const;

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "K";
}

function PersonAvatar({ person, size = 44 }: { person: DirectMessageRecipient; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden="true">
      {person.avatarUrl ? <Image src={person.avatarUrl} alt="" width={size} height={size} unoptimized/> : initials(person.displayName)}
    </span>
  );
}

function AttachmentCard({ attachment, type, onOpen }: { attachment: Attachment; type: string | null; onOpen: () => void }) {
  const meta = attachmentMeta[(type as keyof typeof attachmentMeta) || "note"] ?? attachmentMeta.note;
  const AttachmentIcon = meta.icon;
  return (
    <button className={styles.attachmentCard} type="button" onClick={onOpen} aria-label={`${attachment.title} içeriğini aç`}>
      <span><AttachmentIcon size={19}/></span>
      <span><small>{meta.label}</small><strong>{attachment.title}</strong><em>{attachment.subtitle}</em></span>
      <b>Görüntüle</b>
    </button>
  );
}

export function DirectMessagesWorkspace({
  initialRecipient,
  onNavigate,
  onUnreadChange,
}: {
  initialRecipient: DirectMessageRecipient | null;
  onNavigate: (section: string) => void;
  onUnreadChange: (count: number) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftRecipient, setDraftRecipient] = useState<DirectMessageRecipient | null>(initialRecipient);
  const [messages, setMessages] = useState<Message[]>([]);
  const [shareables, setShareables] = useState<Shareable[]>([]);
  const [selectedAttachment, setSelectedAttachment] = useState<Shareable | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<"all" | Shareable["type"]>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<DirectMessageRecipient[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportNotice, setReportNotice] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((item) => item.id === selectedId) ?? null;
  const activePerson = activeConversation?.person ?? draftRecipient;
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((item) => `${item.person.displayName} ${item.person.handle} ${item.person.departmentName}`.toLocaleLowerCase("tr-TR").includes(query));
  }, [conversations, search]);
  const filteredShareables = pickerType === "all" ? shareables : shareables.filter((item) => item.type === pickerType);

  const updateConversations = useCallback((next: Conversation[]) => {
    setConversations(next);
    onUnreadChange(next.reduce((total, item) => total + item.unreadCount, 0));
  }, [onUnreadChange]);

  const loadList = useCallback(async (includeShareables = false) => {
    const response = await fetch(`/api/messages${includeShareables ? "?includeShareables=1" : ""}`, { cache: "no-store" });
    const data = await response.json() as MessagesPayload;
    if (!response.ok) throw new Error(data.error ?? "Konuşmalar yüklenemedi.");
    updateConversations(data.conversations ?? []);
    if (data.shareables) setShareables(data.shareables);
    return data.conversations ?? [];
  }, [updateConversations]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadList(true).then((items) => {
        if (cancelled) return;
        if (initialRecipient) {
          const existing = items.find((item) => item.person.publicId === initialRecipient.publicId);
          setSelectedId(existing?.id ?? null);
          setDraftRecipient(existing ? null : initialRecipient);
        }
        setError("");
      }).catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Konuşmalar yüklenemedi.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [initialRecipient, loadList]);

  const loadThread = useCallback(async (conversationId: string, showLoader = false) => {
    if (showLoader) setThreadLoading(true);
    try {
      const response = await fetch(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store" });
      const data = await response.json() as MessagesPayload;
      if (!response.ok) throw new Error(data.error ?? "Mesajlar yüklenemedi.");
      const loadedConversations = data.conversations ?? [];
      updateConversations(loadedConversations);
      setMessages(data.messages ?? []);
      setError("");
      if ((loadedConversations.find((item) => item.id === conversationId)?.unreadCount ?? 0) > 0) {
        await fetch("/api/messages", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "read", conversationId }),
        });
        updateConversations(loadedConversations.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Mesajlar yüklenemedi.");
    } finally {
      if (showLoader) setThreadLoading(false);
    }
  }, [updateConversations]);

  useEffect(() => {
    if (!selectedId) return;
    const firstLoad = window.setTimeout(() => void loadThread(selectedId, true), 0);
    const interval = window.setInterval(() => void loadThread(selectedId), 6000);
    return () => { window.clearTimeout(firstLoad); window.clearInterval(interval); };
  }, [selectedId, loadThread]);

  useEffect(() => {
    const interval = window.setInterval(() => void loadList().catch(() => undefined), 25000);
    return () => window.clearInterval(interval);
  }, [loadList]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedId]);

  useEffect(() => {
    if (!newChatOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPeopleLoading(true);
      try {
        const response = await fetch(`/api/people?q=${encodeURIComponent(peopleQuery.trim())}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json() as { people?: DirectMessageRecipient[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Öğrenciler yüklenemedi.");
        setPeople(data.people ?? []);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") setError(loadError instanceof Error ? loadError.message : "Öğrenciler yüklenemedi.");
      } finally { setPeopleLoading(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [newChatOpen, peopleQuery]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (sending || (!text.trim() && !selectedAttachment) || !activePerson) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedId,
          recipientId: selectedId ? undefined : activePerson.publicId,
          body: text,
          attachment: selectedAttachment ? { type: selectedAttachment.type, id: selectedAttachment.id } : undefined,
        }),
      });
      const data = await response.json() as { conversationId?: string; message?: Message; error?: string };
      if (!response.ok || !data.conversationId || !data.message) throw new Error(data.error ?? "Mesaj gönderilemedi.");
      setMessages((current) => [...current, data.message!]);
      setSelectedId(data.conversationId);
      setText("");
      setSelectedAttachment(null);
      setPickerOpen(false);
      await loadList();
      setDraftRecipient(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Mesaj gönderilemedi.");
    } finally { setSending(false); }
  }

  function choosePerson(person: DirectMessageRecipient) {
    const existing = conversations.find((item) => item.person.publicId === person.publicId);
    setSelectedId(existing?.id ?? null);
    setDraftRecipient(existing ? null : person);
    setMessages([]);
    setNewChatOpen(false);
    setPeopleQuery("");
  }

  async function reportMessage(event: FormEvent) {
    event.preventDefault();
    if (!reportTarget || reporting) return;
    setReporting(true);
    setReportNotice("");
    try {
      const response = await fetch("/api/safety", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "report", entityType: "direct-message", entityId: reportTarget.id, reason: reportReason, details: reportDetails }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Şikâyet gönderilemedi.");
      setReportTarget(null);
      setReportDetails("");
      setReportNotice("Mesaj güvenli biçimde moderasyon kuyruğuna iletildi.");
    } catch (reportError) {
      setReportNotice(reportError instanceof Error ? reportError.message : "Şikâyet gönderilemedi.");
    } finally { setReporting(false); }
  }

  return (
    <div className={`${styles.workspace} ${activePerson ? styles.hasThread : ""}`}>
      <aside className={styles.sidebar} aria-label="Konuşmalar">
        <header><div><span>ÖZEL MESAJLAR</span><h1>Mesajlar</h1></div><button type="button" onClick={() => setNewChatOpen(true)} aria-label="Yeni mesaj"><Plus size={20}/></button></header>
        <label className={styles.search}><MagnifyingGlass size={18}/><input aria-label="Konuşmalarda ara" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Konuşmalarda ara"/></label>
        <div className={styles.conversationList}>
          {loading ? <div className={styles.listState}>Konuşmalar yükleniyor…</div> : filteredConversations.length ? filteredConversations.map((conversation) => (
            <button className={selectedId === conversation.id ? styles.activeConversation : ""} type="button" key={conversation.id} onClick={() => { setSelectedId(conversation.id); setDraftRecipient(null); setMessages([]); }}>
              <PersonAvatar person={conversation.person}/>
              <span><strong>{conversation.person.displayName}</strong><small>{conversation.lastMessageOwn ? "Sen: " : ""}{conversation.preview}</small></span>
              <em>{conversation.time}{conversation.unreadCount > 0 && <b>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</b>}</em>
            </button>
          )) : <div className={styles.emptyList}><ChatCircleDots size={28}/><strong>Henüz konuşma yok</strong><p>Kampüsündeki bir öğrenciye ilk mesajı gönder.</p><button type="button" onClick={() => setNewChatOpen(true)}>Yeni mesaj</button></div>}
        </div>
      </aside>

      <section className={styles.thread} aria-label={activePerson ? `${activePerson.displayName} ile mesajlar` : "Mesaj alanı"}>
        {activePerson ? <>
          <header className={styles.threadHeader}>
            <button className={styles.mobileBack} type="button" onClick={() => { setSelectedId(null); setDraftRecipient(null); }} aria-label="Konuşmalara dön"><ArrowLeft size={21}/></button>
            <PersonAvatar person={activePerson} size={40}/><div><strong>{activePerson.displayName}</strong><small>@{activePerson.handle} · {activePerson.departmentName}</small></div>
          </header>
          <div className={styles.messages} aria-live="polite">
            <div className={styles.conversationIntro}><PersonAvatar person={activePerson} size={58}/><strong>{activePerson.displayName}</strong><p>{activePerson.universityShortName} · {activePerson.departmentName}</p><small>Bu konuşmadaki mesajlar özeldir. Şikâyet edilen tek bir mesaj gerektiğinde moderasyona gönderilir.</small></div>
            {threadLoading ? <div className={styles.threadState}>Mesajlar yükleniyor…</div> : messages.map((message) => (
              <article className={`${styles.message} ${message.own ? styles.own : styles.received} ${message.removed ? styles.removed : ""}`} key={message.id}>
                <div>
                  {message.body && <p>{message.body}</p>}
                  {message.attachment && <AttachmentCard attachment={message.attachment} type={message.attachmentType} onOpen={() => onNavigate(message.attachment!.section)}/>}
                </div>
                <footer><time>{message.time}</time>{message.own && message.read && <Checks size={15} weight="bold"/>}{!message.own && !message.removed && <button type="button" onClick={() => { setReportTarget(message); setReportNotice(""); }} aria-label="Mesajı şikâyet et"><WarningCircle size={15}/></button>}</footer>
              </article>
            ))}
            <div ref={messageEndRef}/>
          </div>
          {reportNotice && <p className={styles.notice} role="status">{reportNotice}</p>}
          <form className={styles.composer} onSubmit={sendMessage}>
            {selectedAttachment && <div className={styles.selectedAttachment}><span><strong>{selectedAttachment.title}</strong><small>{attachmentMeta[selectedAttachment.type].label} · {selectedAttachment.meta}</small></span><button type="button" onClick={() => setSelectedAttachment(null)} aria-label="Eki kaldır"><X size={17}/></button></div>}
            {error && <p role="alert">{error}</p>}
            <div><button type="button" onClick={() => setPickerOpen((open) => !open)} aria-label="Eklediğim içeriklerden paylaş" aria-expanded={pickerOpen}><Paperclip size={21}/></button><textarea rows={1} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Mesaj yaz…" maxLength={2000}/><button className={styles.sendButton} type="submit" disabled={sending || (!text.trim() && !selectedAttachment)} aria-label="Mesajı gönder"><PaperPlaneTilt size={20} weight="fill"/></button></div>
          </form>
          {pickerOpen && <section className={styles.picker} aria-label="Paylaşılabilir içerikler"><header><div><strong>Eklediklerim</strong><small>Yalnızca senin eklediğin, yayındaki içerikler</small></div><button type="button" onClick={() => setPickerOpen(false)} aria-label="Kapat"><X size={18}/></button></header><nav>{(["all", "note", "library", "event", "place", "listing"] as const).map((type) => <button className={pickerType === type ? styles.pickerActive : ""} type="button" key={type} onClick={() => setPickerType(type)}>{type === "all" ? "Tümü" : attachmentMeta[type].label}</button>)}</nav><div>{filteredShareables.length ? filteredShareables.map((item) => { const ShareIcon = attachmentMeta[item.type].icon; return <button type="button" key={`${item.type}-${item.id}`} onClick={() => { setSelectedAttachment(item); setPickerOpen(false); }}><span><ShareIcon size={18}/></span><span><strong>{item.title}</strong><small>{attachmentMeta[item.type].label}{item.meta ? ` · ${item.meta}` : ""}</small></span></button>; }) : <p>Bu kategoride henüz paylaşabileceğin bir içerik yok.</p>}</div></section>}
        </> : <div className={styles.emptyThread}><span><ChatCircleDots size={34}/></span><h2>Kampüsündekilerle konuş.</h2><p>Notlarını, kütüphane çalışma alanlarını, etkinlikleri, mekânları ve ilanlarını sohbet içinde paylaşabilirsin.</p><button type="button" onClick={() => setNewChatOpen(true)}><Plus size={18}/> Yeni mesaj</button></div>}
      </section>

      {newChatOpen && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewChatOpen(false); }}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="new-message-title"><header><div><span>YENİ SOHBET</span><h2 id="new-message-title">Kime mesaj göndereceksin?</h2></div><button type="button" onClick={() => setNewChatOpen(false)} aria-label="Kapat"><X size={20}/></button></header><label className={styles.dialogSearch}><MagnifyingGlass size={18}/><input aria-label="Mesaj gönderilecek öğrenciyi ara" autoFocus value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="İsim, kullanıcı adı veya bölüm ara"/></label><div className={styles.peopleList}>{peopleLoading ? <p>Öğrenciler aranıyor…</p> : people.length ? people.map((person) => <button type="button" key={person.publicId} onClick={() => choosePerson(person)}><PersonAvatar person={person}/><span><strong>{person.displayName}</strong><small>@{person.handle} · {person.departmentName}</small></span></button>) : <p>Kampüsünde eşleşen öğrenci bulunamadı.</p>}</div></section></div>}

      {reportTarget && <div className={styles.overlay} role="presentation"><form className={styles.reportDialog} role="dialog" aria-modal="true" aria-labelledby="report-message-title" onSubmit={reportMessage}><header><div><span>GÜVENLİK</span><h2 id="report-message-title">Bu mesajı şikâyet et</h2></div><button type="button" onClick={() => setReportTarget(null)} aria-label="Kapat"><X size={20}/></button></header><p>Yalnızca seçtiğin mesajın güvenli kanıt kopyası moderasyona gönderilir.</p><label>Neden?<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="harassment">Taciz veya zorbalık</option><option value="spam">Spam</option><option value="privacy">Gizlilik ihlali</option><option value="misinformation">Yanıltıcı içerik</option><option value="other">Diğer</option></select></label><label>Ek açıklama<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={800} rows={4} placeholder="İstersen ayrıntı ekle"/></label>{reportNotice && <p role="alert">{reportNotice}</p>}<footer><button type="button" onClick={() => setReportTarget(null)}>Vazgeç</button><button type="submit" disabled={reporting}>{reporting ? "Gönderiliyor…" : "Şikâyeti gönder"}</button></footer></form></div>}
    </div>
  );
}
