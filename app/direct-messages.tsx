"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { Books } from "@phosphor-icons/react/dist/csr/Books";
import { CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { Checks } from "@phosphor-icons/react/dist/csr/Checks";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Paperclip } from "@phosphor-icons/react/dist/csr/Paperclip";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Storefront } from "@phosphor-icons/react/dist/csr/Storefront";
import { X } from "@phosphor-icons/react/dist/csr/X";
import styles from "./direct-messages.module.css";
import { MessageContextActions, type MessageActionTarget } from "./message-context-actions";
import { mergeMessages, shouldFollowMessages } from "@/lib/message-scroll";
import { createLatestRequest } from "@/lib/latest-request";
import { pushAppLocation } from "@/lib/mobile-navigation";
import { messageSessionState, type MessageThreadState } from "@/lib/message-drafts";
import { useAppNavigation } from "./app-navigation";
import { useContentTarget, clearContentTarget } from "./use-content-target";
import { useScopedRequests } from "./use-scoped-requests";
import { notificationHref } from "../lib/workspace-navigation";
import { navigateAppHref } from "../lib/app-links";

export type DirectMessageRecipient = {
  publicId: string;
  deleted?: boolean;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  universityShortName: string;
  departmentName: string;
};

type MessageHistoryEntry = {
  layer: "list" | "thread" | "new-chat";
  conversationId: string | null;
  recipient: DirectMessageRecipient | null;
};

function readMessageHistory(state: unknown): MessageHistoryEntry | null {
  if (!state || typeof state !== "object" || !("kampiraMessage" in state)) return null;
  const entry = state.kampiraMessage;
  if (!entry || typeof entry !== "object" || !("layer" in entry) || !("recipient" in entry) || !("conversationId" in entry)) return null;
  if (entry.layer !== "list" && entry.layer !== "thread" && entry.layer !== "new-chat") return null;
  if (entry.conversationId !== null && typeof entry.conversationId !== "string") return null;
  const person = entry.recipient;
  if (person !== null && (typeof person !== "object" || !["publicId", "displayName", "handle", "universityShortName", "departmentName"].every((key) => key in person && typeof (person as Record<string, unknown>)[key] === "string"))) return null;
  if (entry.layer === "thread" && !person) return null;
  const recipient = person as DirectMessageRecipient | null;
  // Explicit fields keep drafts, messages and API payloads out of persisted browser history.
  return {
    layer: entry.layer,
    conversationId: entry.layer === "list" ? null : entry.conversationId,
    recipient: entry.layer === "list" || !recipient ? null : {
      publicId: recipient.publicId,
      displayName: recipient.displayName,
      handle: recipient.handle,
      avatarUrl: typeof recipient.avatarUrl === "string" ? recipient.avatarUrl : null,
      universityShortName: recipient.universityShortName,
      departmentName: recipient.departmentName,
      ...(recipient.deleted ? { deleted: true } : {}),
    },
  };
}

/** Same-URL entries let Android Back dismiss message layers without reloading the workspace. */
export function createMessageMobileHistory(onRestore: (entry: MessageHistoryEntry) => void, ownerScope?: string, route = false) {
  const location = () => `${window.location.pathname}${window.location.search}`;
  const workspaceLocation = location();
  const media = window.matchMedia("(max-width: 780px)");
  const list: MessageHistoryEntry = { layer: "list", conversationId: null, recipient: null };
  let closing = false;
  const enabled = () => media.matches && location() === workspaceLocation && !new URLSearchParams(window.location.search).has("compose");
  const current = () => ownerScope && window.history.state?.kampiraMessageOwner !== ownerScope ? null : readMessageHistory(window.history.state);
  const replace = (entry: MessageHistoryEntry) => window.history.replaceState({ ...window.history.state, ...(ownerScope ? { kampiraMessageOwner: ownerScope } : {}), kampiraMessage: readMessageHistory({ kampiraMessage: entry }) }, "");
  const open = (entry: MessageHistoryEntry) => {
    if (!enabled() || closing) return;
    const previous = current();
    if (!previous) replace(list);
    // Picking a recipient consumes the transient search layer rather than reopening it on Back.
    if (previous?.layer !== "new-chat" && !(previous?.layer === "thread" && entry.layer === "thread" && previous.recipient?.publicId === entry.recipient?.publicId)) {
      pushAppLocation(`${workspaceLocation}${window.location.hash}`);
    }
    replace(entry);
  };
  const restore = () => {
    closing = false;
    // Shared dialog entries sit above the current thread and intentionally contain no private DM state.
    // Let useAppLayer restore those entries; treating their missing conversation as a list closes both layers.
    if (window.history.state?.kampiraLayer) return;
    if (enabled()) onRestore(current() ?? list);
  };
  window.addEventListener("popstate", restore);
  return {
    initialize(recipient: DirectMessageRecipient | null, conversationId: string | null = null) {
      if (!enabled()) return;
      const existing = current();
      if (existing) { onRestore(existing); return; }
      if (route && recipient) { replace({ layer: "thread", conversationId, recipient }); onRestore(current()!); return; }
      replace(list);
      if (recipient) {
        open({ layer: "thread", conversationId: null, recipient });
        onRestore(current()!);
      }
    },
    openThread(conversationId: string | null, recipient: DirectMessageRecipient) { open({ layer: "thread", conversationId, recipient }); },
    openNewChat(conversationId: string | null, recipient: DirectMessageRecipient | null) { open({ layer: "new-chat", conversationId, recipient }); },
    close(layer: "thread" | "new-chat") {
      if (!enabled() || current()?.layer !== layer || (route && Number(window.history.state?.kampiraDepth ?? 0) === 0)) return false;
      if (!closing) { closing = true; window.history.back(); }
      return true;
    },
    resolveThread(conversationId: string, recipientId: string) {
      const entry = current();
      if (enabled() && entry?.recipient?.publicId === recipientId) replace({ ...entry, conversationId });
    },
    dispose() { window.removeEventListener("popstate", restore); },
  };
}

type Conversation = {
  id: string;
  readOnly?: boolean;
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
  createdAt: string;
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

type LinkedMessage = { id: string; body: string; own: boolean; createdAt: string };
type MessageTarget = { conversation: Conversation; linkedMessage?: LinkedMessage };
type MessagesPayload = {
  conversationId?: string;
  linkedMessage?: LinkedMessage;
  olderCursor?: string | null;
  conversations?: Array<Omit<Conversation, "person"> & { person: Omit<DirectMessageRecipient, "publicId"> & { publicId: string | null } }>;
  messages?: Message[];
  shareables?: Shareable[];
  error?: string;
};

function receivedConversations(items: MessagesPayload["conversations"] = []): Conversation[] {
  return items.map((item) => item.readOnly || item.person.deleted || !item.person.publicId
    ? { ...item, readOnly: true, person: { publicId: `erased:${item.id}`, deleted: true, displayName: "Silinmiş hesap", handle: "", universityShortName: "", departmentName: "", avatarUrl: null } }
    : { ...item, person: { ...item.person, publicId: item.person.publicId } });
}

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

function PersonAvatar({ person, size = 48 }: { person: DirectMessageRecipient; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden="true">
      {person.avatarUrl ? <Image src={person.avatarUrl} alt="" width={size} height={size} unoptimized/> : initials(person.displayName)}
    </span>
  );
}

function useMessageDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? [])];
    (dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0])?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const openDialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === "Tab") {
        const controls = focusable();
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);
  return dialogRef;
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
  const navigation = useAppNavigation();
  const conversationTarget = useContentTarget("conversation", "messages");
  const messageTarget = useContentTarget("message", "messages");
  useSyncExternalStore(messageSessionState.subscribe, messageSessionState.getRevision, messageSessionState.getRevision);
  if (!navigation?.ownerScope || !messageSessionState.isOwner(navigation.ownerScope)) return <div className={styles.listState} role="status">Mesaj oturumu hazırlanıyor…</div>;
  if (conversationTarget || messageTarget) return <MessageTargetWorkspace key={JSON.stringify([navigation.ownerScope, conversationTarget, messageTarget])} conversationId={conversationTarget} messageId={messageTarget} ownerScope={navigation.ownerScope} onNavigate={onNavigate} onUnreadChange={onUnreadChange} onSessionExpired={navigation.onSessionExpired}/>;
  return <MessageWorkspace key={`${navigation?.ownerScope ?? ""}:${initialRecipient?.publicId ?? ""}`} initialRecipient={initialRecipient} onNavigate={onNavigate} onUnreadChange={onUnreadChange} ownerScope={navigation?.ownerScope ?? ""} onSessionExpired={navigation?.onSessionExpired}/>;
}

function MessageTargetWorkspace({ conversationId, messageId, ownerScope, onNavigate, onUnreadChange, onSessionExpired }: { conversationId: string; messageId: string; ownerScope: string; onNavigate: (section: string) => void; onUnreadChange: (count: number) => void; onSessionExpired?: () => void }) {
  const requests = useScopedRequests();
  const [target, setTarget] = useState<MessageTarget | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (conversationId) params.set("conversationId", conversationId);
    if (messageId) params.set("messageId", messageId);
    void requests.json<MessagesPayload>(`/api/messages?${params}`, { signal: controller.signal, cache: "no-store" }, "Mesaj bulunamadı veya erişim iznin yok.").then((data) => {
      if (controller.signal.aborted) return;
      const conversation = receivedConversations(data.conversations).find((item) => item.id === data.conversationId);
      if (!conversation || (conversationId && conversation.id !== conversationId) || (messageId && data.linkedMessage?.id !== messageId)) throw new Error("Mesaj bulunamadı veya erişim iznin yok.");
      setTarget({ conversation, linkedMessage: data.linkedMessage });
    }).catch((cause) => { if (!controller.signal.aborted && requests.isActive()) setError(cause instanceof Error ? cause.message : "Mesaj açılamadı."); });
    return () => controller.abort();
  }, [conversationId, messageId, requests, retry]);
  if (target) return <MessageWorkspace initialRecipient={target.conversation.person} target={target} onNavigate={onNavigate} onUnreadChange={onUnreadChange} ownerScope={ownerScope} onSessionExpired={onSessionExpired}/>;
  function back() {
    if (Number(window.history.state?.kampiraDepth ?? 0) > 0) window.history.back();
    else { if (messageId) clearContentTarget("message", messageId, "messages"); if (conversationId) clearContentTarget("conversation", conversationId, "messages"); }
  }
  return <section className={styles.listState} aria-labelledby="message-target-title"><h1 id="message-target-title">{error ? "Mesaj açılamadı" : "Mesaj açılıyor…"}</h1><p role={error ? "alert" : "status"}>{error || "Bağlantıdaki konuşmaya erişimin kontrol ediliyor."}</p><button type="button" onClick={back}>Geri dön</button>{error && <button type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Yeniden dene</button>}</section>;
}

function MessageWorkspace({ initialRecipient, target, onNavigate, onUnreadChange, ownerScope, onSessionExpired }: { target?: MessageTarget; initialRecipient: DirectMessageRecipient | null; onNavigate: (section: string) => void; onUnreadChange: (count: number) => void; ownerScope: string; onSessionExpired?: () => void }) {
  const [linkedPreview, setLinkedPreview] = useState(target?.linkedMessage);
  const [sessionGuard] = useState(() => messageSessionState.capture(ownerScope));
  const [restored] = useState(() => {
    const session = messageSessionState.readSession(ownerScope);
    const ownedHistory = window.history.state?.kampiraMessageOwner === ownerScope ? readMessageHistory(window.history.state) : null;
    const remembered = window.matchMedia("(max-width: 780px)").matches ? ownedHistory?.layer === "thread" ? ownedHistory.recipient : null : session.selected?.person;
    const canonical = session.conversations.find((item) => item.id === ownedHistory?.conversationId);
    const person = initialRecipient ?? (canonical?.person.deleted ? canonical.person : remembered) ?? null;
    const thread = person ? messageSessionState.readThread(ownerScope, person.publicId) : undefined;
    const conversationId = target?.conversation.id ?? thread?.conversationId ?? session.conversations.find((item) => item.person.publicId === person?.publicId)?.id ?? null;
    return { session, person, thread, conversationId };
  });
  useSyncExternalStore(messageSessionState.subscribe, messageSessionState.getRevision, messageSessionState.getRevision);
  const [conversations, setConversations] = useState<Conversation[]>(target ? [target.conversation, ...restored.session.conversations.filter((item) => item.id !== target.conversation.id)] : restored.session.conversations);
  const [selectedId, setSelectedId] = useState<string | null>(restored.conversationId);
  const [draftRecipient, setDraftRecipient] = useState<DirectMessageRecipient | null>(restored.person);
  const [messages, setMessages] = useState<Message[]>(restored.thread?.messages ?? []);
  const [shareables, setShareables] = useState<Shareable[]>(restored.session.shareables);
  const [selectedAttachment, setSelectedAttachment] = useState<Shareable | null>(restored.thread?.attachment ?? null);
  const [text, setText] = useState(restored.thread?.text ?? "");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!restored.session.loaded);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<"all" | Shareable["type"]>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<DirectMessageRecipient[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<MessageActionTarget | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const selectionVersion = useRef(0);
  const threadRequest = useRef(createLatestRequest());
  const listRequest = useRef(createLatestRequest());
  const historyRequest = useRef(createLatestRequest());
  const historyLoaded = useRef(restored.thread?.historyLoaded ?? false);
  const threadRevision = useRef(0);
  const prependOffset = useRef<{ height: number; top: number } | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(restored.thread?.olderCursor ?? null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [erasureRevision, setErasureRevision] = useState(0);
  const nearBottom = useRef(restored.thread?.nearBottom ?? true);
  const restoreScrollTop = useRef(restored.thread?.scrollTop ?? null);
  const forceScroll = useRef(false);
  const lastScroll = useRef<{ conversationId: string | null; lastMessageId: string | null }>({ conversationId: null, lastMessageId: null });
  const activeRecipientId = useRef(restored.person?.publicId ?? null);
  const mounted = useRef(false);
  const savedThread = useRef<MessageThreadState | null>(restored.thread ?? null);
  const mobileHistory = useRef<ReturnType<typeof createMessageMobileHistory> | null>(null);
  const restoreMessageLayer = useRef<((entry: MessageHistoryEntry) => void) | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const newChatRef = useMessageDialog(newChatOpen, closeNewChat);

  const activeConversation = conversations.find((item) => item.id === selectedId) ?? null;
  const activePerson = activeConversation?.person ?? draftRecipient;
  const readOnly = Boolean(activeConversation?.readOnly || activePerson?.deleted);
  const attempt = activePerson ? messageSessionState.attempt(ownerScope, activePerson.publicId) : undefined;
  const sending = attempt?.status === "sending";
  const restricted = Boolean(activePerson && messageSessionState.isRestricted(ownerScope, activePerson.publicId));
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const threadScope = threadRequest.current;
    const listScope = listRequest.current;
    const historyScope = historyRequest.current;
    return () => {
      mounted.current = false; selectionVersion.current++;
      threadScope.cancel(); historyScope.cancel(); listScope.cancel();
      if (savedThread.current && sessionGuard.isCurrent()) messageSessionState.saveThread(ownerScope, savedThread.current);
      if (target && sessionGuard.isCurrent()) messageSessionState.saveSession(ownerScope, { selected: null });
    };
  }, [ownerScope, sessionGuard, target]);
  useEffect(() => {
    const state = activePerson ? { conversationId: selectedId, person: activePerson, text, attachment: selectedAttachment, messages, olderCursor, historyLoaded: historyLoaded.current, scrollTop: messagesRef.current?.scrollTop ?? null, nearBottom: nearBottom.current } : null;
    savedThread.current = state;
    messageSessionState.saveSession(ownerScope, { selected: activePerson ? { conversationId: selectedId, person: activePerson } : null });
    if (state) messageSessionState.saveThread(ownerScope, state);
  }, [activePerson, selectedId, text, selectedAttachment, messages, olderCursor, ownerScope]);
  useEffect(() => {
    if (!activePerson) return;
    let previous = messageSessionState.attempt(ownerScope, activePerson.publicId);
    return messageSessionState.subscribe(() => {
      const next = messageSessionState.attempt(ownerScope, activePerson.publicId);
      if (next === previous) return;
      previous = next;
      if (next?.status !== "sent" || !next.message || !next.conversationId) return;
      setText((current) => current === next.body ? "" : current);
      setSelectedAttachment((current) => current?.id === next.attachment?.id && current?.type === next.attachment?.type ? null : current);
      setMessages((current) => mergeMessages(current, [next.message!]));
      setSelectedId(next.conversationId);
    });
  }, [activePerson, ownerScope]);
  const checkSession = useCallback((response: Response) => {
    if (!sessionGuard.isCurrent()) return false;
    if (response.status === 401) {
      messageSessionState.setOwnerScope(null);
      if (mounted.current) { setMessages([]); setConversations([]); setText(""); setSelectedAttachment(null); setLoading(false); setThreadLoading(false); setError("Oturumun sona erdi. Yeniden giriş yapmalısın."); }
      onSessionExpired?.(); return false;
    }
    return true;
  }, [onSessionExpired, sessionGuard]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((item) => `${item.person.displayName} ${item.person.handle} ${item.person.departmentName}`.toLocaleLowerCase("tr-TR").includes(query));
  }, [conversations, search]);
  const filteredShareables = pickerType === "all" ? shareables : shareables.filter((item) => item.type === pickerType);

  const updateConversations = useCallback((next: Conversation[]) => {
    if (!sessionGuard.isCurrent() || !mounted.current) return;
    const previous = messageSessionState.readSession(ownerScope).conversations;
    const visible = next.map((item) => {
      const old = previous.find((entry) => entry.id === item.id);
      if (old?.person.deleted && !item.person.deleted) return old;
      if (item.person.deleted && old && !old.person.deleted) {
        messageSessionState.removeThread(ownerScope, old.person.publicId);
        if (activeRecipientId.current === old.person.publicId) {
          activeRecipientId.current = item.person.publicId; savedThread.current = null;
          threadRevision.current++; threadRequest.current.cancel(); historyRequest.current.cancel();
          historyLoaded.current = false; setOlderCursor(null); setMessages([]); setText(""); setSelectedAttachment(null); setLinkedPreview(undefined);
          setDraftRecipient(item.person); setPickerOpen(false); setActionTarget(null); setErasureRevision((value) => value + 1);
        }
      }
      return item;
    }).filter((item) => !messageSessionState.isRestricted(ownerScope, item.person.publicId));
    setConversations(visible);
    messageSessionState.saveSession(ownerScope, { conversations: visible, loaded: true });
    onUnreadChange(visible.reduce((total, item) => total + item.unreadCount, 0));
  }, [onUnreadChange, ownerScope, sessionGuard]);

  const loadList = useCallback(async (includeShareables = false, signal?: AbortSignal) => {
    if (!sessionGuard.isCurrent() || signal?.aborted) return [];
    const request = listRequest.current.begin();
    const revision = threadRevision.current;
    const abort = () => { if (request.isCurrent()) listRequest.current.cancel(); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(`/api/messages${includeShareables ? "?includeShareables=1" : ""}`, { cache: "no-store", signal: request.signal });
      const data = await response.json() as MessagesPayload;
      if (!request.isCurrent() || !checkSession(response) || !mounted.current || revision !== threadRevision.current) return [];
      if (!response.ok) throw new Error(data.error ?? "Konuşmalar yüklenemedi.");
      const loaded = receivedConversations(data.conversations);
      updateConversations(loaded);
      if (data.shareables) { setShareables(data.shareables); messageSessionState.saveSession(ownerScope, { shareables: data.shareables }); }
      return loaded.filter((item) => !messageSessionState.isRestricted(ownerScope, item.person.publicId));
    } finally { signal?.removeEventListener("abort", abort); }
  }, [updateConversations, checkSession, ownerScope, sessionGuard]);

  useEffect(() => {
    let cancelled = false;
    if (!pageVisible || !sessionGuard.isCurrent()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadList(true, controller.signal).then((items) => {
        if (cancelled || !sessionGuard.isCurrent()) return;
        // Back may have closed or changed the thread while the initial list was loading.
        const recipientId = activeRecipientId.current;
        const existing = recipientId ? items.find((item) => item.person.publicId === recipientId) : null;
        if (existing) {
          setSelectedId(existing.id);
          setDraftRecipient(null);
          mobileHistory.current?.resolveThread(existing.id, existing.person.publicId);
        }
        setError("");
      }).catch((loadError) => {
        if (!cancelled && sessionGuard.isCurrent() && (loadError as Error).name !== "AbortError") setError(loadError instanceof Error ? loadError.message : "Konuşmalar yüklenemedi.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [initialRecipient, loadList, pageVisible, sessionGuard]);

  useEffect(() => {
    if (!selectedId || !pageVisible || !sessionGuard.isCurrent()) return;
    const conversationId = selectedId;
    const scope = threadRequest.current;
    const request = scope.begin();
    const historyScope = historyRequest.current;
    let inFlight = false;
    const isCurrent = () => request.isCurrent() && sessionGuard.isCurrent() && mounted.current;
    async function loadThread(showLoader = false) {
      if (inFlight || !isCurrent()) return;
      inFlight = true;
      const revision = threadRevision.current;
      if (showLoader && !messageSessionState.readThread(ownerScope, activeRecipientId.current ?? "")?.messages.length) setThreadLoading(true);
      try {
        const linkedId = target?.conversation.id === conversationId ? target.linkedMessage?.id : undefined;
        const response = await fetch(`/api/messages?conversationId=${encodeURIComponent(conversationId)}${linkedId ? `&messageId=${encodeURIComponent(linkedId)}` : ""}`, { cache: "no-store", signal: request.signal });
        const data = await response.json() as MessagesPayload;
        if (!isCurrent() || !checkSession(response) || revision !== threadRevision.current) return;
        if (response.status === 403 || response.status === 404) {
          messageSessionState.removeThread(ownerScope, activeRecipientId.current ?? "");
          setMessages([]); setText(""); setSelectedAttachment(null); setOlderCursor(null);
          setLinkedPreview(undefined);
        }
        if (!response.ok) throw new Error(data.error ?? "Mesajlar yüklenemedi.");
        if (linkedId) setLinkedPreview(data.linkedMessage);
        const loadedConversations = receivedConversations(data.conversations);
        updateConversations(loadedConversations);
        if (!isCurrent()) return;
        if (!nearBottom.current && data.messages?.at(-1)?.id !== lastScroll.current.lastMessageId) setHasNewMessages(true);
        setMessages((current) => mergeMessages(current, data.messages ?? []));
        if (!historyLoaded.current) setOlderCursor(data.olderCursor ?? null);
        setError("");
        if ((loadedConversations.find((item) => item.id === conversationId)?.unreadCount ?? 0) > 0) {
          const readResponse = await fetch("/api/messages", {
            method: "PATCH",
            signal: request.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "read", conversationId }),
          });
          if (!isCurrent() || !checkSession(readResponse) || revision !== threadRevision.current) return;
          if (!readResponse.ok) throw new Error("Okundu bilgisi güncellenemedi. Yeniden denenecek.");
          updateConversations(loadedConversations.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
        }
      } catch (loadError) {
        if (isCurrent()) setError(loadError instanceof Error ? loadError.message : "Mesajlar yüklenemedi.");
      } finally {
        inFlight = false;
        if (showLoader && isCurrent()) setThreadLoading(false);
      }
    }
    const firstLoad = window.setTimeout(() => { setHistoryLoading(false); void loadThread(true); }, 0);
    const interval = window.setInterval(() => void loadThread(), 6000);
    return () => { scope.cancel(); historyScope.cancel(); window.clearTimeout(firstLoad); window.clearInterval(interval); };
  }, [selectedId, updateConversations, pageVisible, sessionGuard, checkSession, ownerScope, target, erasureRevision]);

  useEffect(() => {
    if (selectedId || !pageVisible) return; // The open thread already refreshes the conversation list.
    const controller = new AbortController();
    const interval = window.setInterval(() => void loadList(false, controller.signal).catch(() => undefined), 25000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [loadList, selectedId, pageVisible]);

  useEffect(() => {
    const next = { conversationId: selectedId, lastMessageId: messages.at(-1)?.id ?? null };
    if (messagesRef.current && restoreScrollTop.current !== null && messages.length) {
      messagesRef.current.scrollTop = restoreScrollTop.current;
      restoreScrollTop.current = null;
    } else if (messagesRef.current && prependOffset.current) {
      messagesRef.current.scrollTop = prependOffset.current.top + messagesRef.current.scrollHeight - prependOffset.current.height;
      prependOffset.current = null;
    } else if (messagesRef.current && shouldFollowMessages(lastScroll.current, next, nearBottom.current, forceScroll.current)) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      nearBottom.current = true;
    }
    lastScroll.current = next;
    forceScroll.current = false;
  }, [messages, selectedId]);

  useEffect(() => {
    if (!newChatOpen || !pageVisible || !peopleQuery.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPeopleLoading(true);
      try {
        const response = await fetch(`/api/people?q=${encodeURIComponent(peopleQuery.trim())}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json() as { people?: DirectMessageRecipient[]; error?: string };
        if (controller.signal.aborted || !checkSession(response) || !mounted.current) return;
        if (!response.ok) throw new Error(data.error ?? "Öğrenciler yüklenemedi.");
        setPeople(data.people ?? []);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") setError(loadError instanceof Error ? loadError.message : "Öğrenciler yüklenemedi.");
      } finally { if (!controller.signal.aborted) setPeopleLoading(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [newChatOpen, peopleQuery, pageVisible, checkSession]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (readOnly || restricted || sending || loading || (!text.trim() && !selectedAttachment) || !activePerson || !sessionGuard.isCurrent()) return;
    const outgoing = messageSessionState.beginSend(ownerScope, activePerson.publicId, text, selectedAttachment);
    if (!outgoing) { setError("Gönderilen mesajlar var. Biraz sonra tekrar deneyebilirsin."); return; }
    setError("");
    const version = selectionVersion.current;
    const recipientId = activePerson.publicId;
    threadRevision.current += 1;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedId,
          recipientId: selectedId ? undefined : activePerson.publicId,
          body: text,
          clientMessageKey: outgoing.key,
          attachment: selectedAttachment ? { type: selectedAttachment.type, id: selectedAttachment.id } : undefined,
        }),
      });
      const data = await response.json() as { conversationId?: string; message?: Message; error?: string };
      if (!checkSession(response) || messageSessionState.isRestricted(ownerScope, recipientId)) return;
      const currentAttempt = messageSessionState.attempt(ownerScope, recipientId);
      if (!currentAttempt || currentAttempt.key !== outgoing.key || currentAttempt.status !== "sending") return;
      if (!response.ok || !data.conversationId || !data.message) throw new Error(data.error ?? "Mesaj gönderilemedi.");
      messageSessionState.completeSend(ownerScope, recipientId, outgoing.key, data.conversationId, data.message);
      if (!mounted.current) return;
      threadRevision.current += 1;
      if (activeRecipientId.current === recipientId) {
        setText("");
        setSelectedAttachment(null);
      }
      if (version === selectionVersion.current) {
        forceScroll.current = true;
        setHasNewMessages(false);
        setMessages((current) => mergeMessages(current, [data.message!]));
        setSelectedId(data.conversationId);
        mobileHistory.current?.resolveThread(data.conversationId, recipientId);
        setText("");
        setSelectedAttachment(null);
        setPickerOpen(false);
      }
      // A refresh failure must never make a successfully sent message look unsent.
      await loadList().catch(() => { if (mounted.current && sessionGuard.isCurrent() && version === selectionVersion.current) setError("Mesaj gönderildi; konuşma listesi yenilenemedi."); });
      if (version === selectionVersion.current) setDraftRecipient(null);
    } catch (sendError) {
      if (!sessionGuard.isCurrent()) return;
      messageSessionState.failSend(ownerScope, recipientId, outgoing.key, controller.signal.aborted ? "Bağlantı zaman aşımına uğradı. Tekrar deneyebilirsin." : sendError instanceof Error ? sendError.message : "Mesaj gönderilemedi.");
    } finally { window.clearTimeout(timeout); }
  }

  function choosePerson(person: DirectMessageRecipient) {
    const existing = conversations.find((item) => item.person.publicId === person.publicId);
    changeConversation(existing?.id ?? null, person);
    setNewChatOpen(false);
    setPeopleQuery("");
  }

  function openNewChat() {
    mobileHistory.current?.openNewChat(selectedId, activePerson);
    setNewChatOpen(true);
    setPeople([]); setPeopleQuery(""); setPeopleLoading(false); setError("");
  }

  function closeNewChat() {
    if (!mobileHistory.current?.close("new-chat")) setNewChatOpen(false);
  }

  function closeConversation() {
    if (!mobileHistory.current?.close("thread")) {
      changeConversation(null, null, false);
      if (target) {
        if (Number(window.history.state?.kampiraDepth ?? 0) > 0) window.history.back();
        else {
          window.history.replaceState({ ...window.history.state, kampiraMessage: { layer: "list", conversationId: null, recipient: null } }, "");
          if (target.linkedMessage) clearContentTarget("message", target.linkedMessage.id, "messages");
          clearContentTarget("conversation", target.conversation.id, "messages");
        }
      }
    }
  }

  function changeConversation(id: string | null, person: DirectMessageRecipient | null, recordHistory = true) {
    const known = conversations.find((item) => item.id === id);
    if (known?.person.deleted) person = known.person;
    if (recordHistory && person) mobileHistory.current?.openThread(id, person);
    const nextId = person && messageSessionState.isRestricted(ownerScope, person.publicId) ? null : id;
    if (nextId === selectedId && person?.publicId === activePerson?.publicId) return;
    if (savedThread.current) messageSessionState.saveThread(ownerScope, { ...savedThread.current, text, attachment: selectedAttachment, scrollTop: messagesRef.current?.scrollTop ?? null, nearBottom: nearBottom.current });
    selectionVersion.current += 1;
    activeRecipientId.current = person?.publicId ?? null;
    threadRequest.current.cancel();
    historyRequest.current.cancel(); prependOffset.current = null;
    const saved = person ? messageSessionState.readThread(ownerScope, person.publicId) : undefined;
    historyLoaded.current = saved?.historyLoaded ?? false;
    setOlderCursor(saved?.olderCursor ?? null); setHistoryLoading(false);
    setText(saved?.text ?? "");
    setSelectedAttachment(saved?.attachment ?? null);
    setSelectedId(nextId);
    setDraftRecipient(person);
    setMessages(saved?.messages ?? []);
    setThreadLoading(Boolean(nextId) && !saved?.messages.length);
    setPickerOpen(false);
    setActionTarget(null);
    setError("");
    setHasNewMessages(false);
    nearBottom.current = saved?.nearBottom ?? true;
    restoreScrollTop.current = saved?.scrollTop ?? null;
  }

  useEffect(() => {
    restoreMessageLayer.current = (entry) => {
      setNewChatOpen(entry.layer === "new-chat");
      setPeopleQuery("");
      changeConversation(entry.conversationId, entry.recipient, false);
    };
  });

  useEffect(() => {
    const navigation = createMessageMobileHistory((entry) => restoreMessageLayer.current?.(entry), ownerScope, Boolean(target));
    mobileHistory.current = navigation;
    navigation.initialize(restored.person, restored.conversationId);
    return () => { navigation.dispose(); mobileHistory.current = null; };
  }, [ownerScope, restored.person, restored.conversationId, target]);

  async function loadOlderMessages() {
    if (!selectedId || !olderCursor || historyLoading || !pageVisible || !sessionGuard.isCurrent()) return;
    const request = historyRequest.current.begin();
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/messages?conversationId=${encodeURIComponent(selectedId)}&before=${encodeURIComponent(olderCursor)}`, { signal: request.signal, cache: "no-store" });
      const data = await response.json() as MessagesPayload;
      if (!request.isCurrent() || !checkSession(response) || !mounted.current) return;
      if (!response.ok) throw new Error(data.error ?? "Önceki mesajlar yüklenemedi.");
      const element = messagesRef.current;
      if (element) prependOffset.current = { height: element.scrollHeight, top: element.scrollTop };
      historyLoaded.current = true;
      setMessages((current) => mergeMessages(current, data.messages ?? []));
      setOlderCursor(data.olderCursor ?? null);
      setError("");
    } catch (loadError) {
      if (request.isCurrent()) setError(loadError instanceof Error ? loadError.message : "Önceki mesajlar yüklenemedi.");
    } finally { if (request.isCurrent()) setHistoryLoading(false); }
  }

  function applyRestriction(person: DirectMessageRecipient, blocked: boolean) {
    if (!sessionGuard.isCurrent() || !mounted.current) return;
    const changed = messageSessionState.isRestricted(ownerScope, person.publicId) !== blocked;
    if (!changed) return;
    threadRevision.current++;
    listRequest.current.cancel(); threadRequest.current.cancel(); historyRequest.current.cancel();
    savedThread.current = null;
    messageSessionState.setRecipientRestriction(ownerScope, person.publicId, blocked);
    if (blocked) {
      updateConversations(conversations.filter((item) => item.person.publicId !== person.publicId));
      if (activeRecipientId.current === person.publicId) {
        setDraftRecipient(person); setSelectedId(null); setMessages([]); setText(""); setSelectedAttachment(null); setOlderCursor(null);
        setPickerOpen(false); setThreadLoading(false); setHistoryLoading(false); setError("");
      }
    } else {
      void loadList().then((items) => {
        if (!mounted.current || !sessionGuard.isCurrent() || activeRecipientId.current !== person.publicId) return;
        const conversation = items.find((item) => item.person.publicId === person.publicId);
        if (conversation) { setSelectedId(conversation.id); mobileHistory.current?.resolveThread(conversation.id, person.publicId); }
      }).catch(() => { if (mounted.current && sessionGuard.isCurrent()) setError("Engel kaldırıldı; konuşma yenilenemedi. Yeniden açmayı deneyebilirsin."); });
    }
  }

  if (!messageSessionState.isOwner(ownerScope)) return <div className={styles.listState} role="status">Mesajlarına erişmek için yeniden giriş yapmalısın.</div>;

  return (
    <div className={`${styles.workspace} ${activePerson ? styles.hasThread : ""}`} data-message-thread={Boolean(activePerson)} data-mobile-overlay={newChatOpen || Boolean(actionTarget) || pickerOpen}>
      <aside className={styles.sidebar} aria-label="Konuşmalar">
        <header><div><h1>Mesajlar</h1><p>Kampüsteki sohbetlerin, bir arada.</p></div><button type="button" onClick={openNewChat} aria-label="Yeni mesaj"><Plus size={22}/></button></header>
        <label className={styles.search}><MagnifyingGlass size={18}/><input aria-label="Konuşmalarda ara" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Konuşmalarda ara"/></label>
        {error && !activePerson && <p className={styles.listError} role="alert">{error}</p>}
        <div className={styles.conversationList}>
          {loading ? <div className={styles.listState}>Konuşmalar yükleniyor…</div> : filteredConversations.length ? filteredConversations.map((conversation) => (
            <button className={`${selectedId === conversation.id ? styles.activeConversation : ""} ${conversation.unreadCount > 0 ? styles.unreadConversation : ""}`} aria-current={selectedId === conversation.id ? "true" : undefined} type="button" key={conversation.id} onClick={() => changeConversation(conversation.id, conversation.person)}>
              <PersonAvatar person={conversation.person}/>
              <span><strong>{conversation.person.displayName}</strong><small>{conversation.lastMessageOwn ? "Sen: " : ""}{conversation.preview}</small></span>
              <em>{conversation.time}{conversation.unreadCount > 0 && <b>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</b>}</em>
            </button>
          )) : <div className={styles.emptyList}><ChatCircleDots size={28}/><strong>{search.trim() ? "Eşleşen konuşma bulunamadı" : "Henüz konuşma yok"}</strong><p>{search.trim() ? "Başka bir isim veya kullanıcı adı deneyebilirsin." : "Kampüsündeki bir öğrenciye ilk mesajı gönder."}</p><button type="button" onClick={() => search.trim() ? setSearch("") : openNewChat()}>{search.trim() ? "Aramayı temizle" : "Yeni mesaj"}</button></div>}
        </div>
      </aside>

      <section className={styles.thread} aria-label={activePerson ? `${activePerson.displayName} ile mesajlar` : "Mesaj alanı"}>
        {activePerson ? <>
          <header className={styles.threadHeader}>
            <button className={styles.mobileBack} type="button" onClick={closeConversation} aria-label="Konuşmalara dön"><ArrowLeft size={21}/></button>
            <PersonAvatar person={activePerson} size={44}/><div><strong>{activePerson.displayName}</strong><small>{readOnly ? "Mesaj geçmişi" : `@${activePerson.handle} · ${activePerson.departmentName}`}</small></div>{!readOnly && <button type="button" aria-label="Kişi seçenekleri" aria-haspopup="dialog" aria-expanded={Boolean(actionTarget && !actionTarget.message)} onClick={() => setActionTarget({ person: activePerson })}><DotsThree size={24} weight="bold"/></button>}
          </header>
          <div className={styles.messages} data-has-messages={messages.length > 0} ref={messagesRef} aria-live="polite" onScroll={(event) => {
            const element = event.currentTarget;
            nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
            if (savedThread.current) { savedThread.current = { ...savedThread.current, scrollTop: element.scrollTop, nearBottom: nearBottom.current }; messageSessionState.saveThread(ownerScope, savedThread.current); }
            if (nearBottom.current) setHasNewMessages(false);
          }}>
            <div className={styles.conversationIntro}><PersonAvatar person={activePerson} size={58}/><strong>{activePerson.displayName}</strong>{!readOnly && <p>{activePerson.universityShortName} · {activePerson.departmentName}</p>}<small>Bu konuşmadaki mesajlar özeldir. Şikâyet edilen tek bir mesaj gerektiğinde moderasyona gönderilir.</small></div>
            {linkedPreview && !restricted && target?.conversation.id === selectedId && <aside className={styles.threadState} aria-label="Bağlantıdaki mesaj"><strong>Bağlantıdaki mesaj</strong><p>{linkedPreview.own ? "Sen: " : ""}{linkedPreview.body}</p><small>Konuşmanın son mesajları aşağıda gösteriliyor.</small></aside>}
            {olderCursor && <button className={styles.newMessages} type="button" disabled={historyLoading} onClick={() => void loadOlderMessages()}>{historyLoading ? "Yükleniyor…" : "Önceki mesajları yükle"}</button>}
            {threadLoading ? <div className={styles.threadState}>Mesajlar yükleniyor…</div> : messages.map((message) => (
              <article className={`${styles.message} ${message.own ? styles.own : styles.received} ${message.removed ? styles.removed : ""}`} key={message.id}>
                <div className={styles.messageBubble}>
                  {message.body && <p>{message.body}</p>}
                  {message.attachment && <AttachmentCard attachment={message.attachment} type={message.attachmentType} onOpen={() => { const href = message.attachmentId ? notificationHref(message.attachmentType, message.attachmentId) : null; if (!href || !navigateAppHref(href)) onNavigate(message.attachment!.section); }}/>}
                </div>
                <footer><time>{message.time}</time>{message.own && <span role="img" aria-label={message.read ? "Okundu" : "Gönderildi"} title={message.read ? "Okundu" : "Gönderildi"}>{message.read ? <Checks size={15} weight="bold" aria-hidden="true"/> : <Check size={15} aria-hidden="true"/>}</span>}</footer>
                {!readOnly && !message.removed && (message.body || !message.own) && <button className={styles.messageActions} type="button" aria-label={message.own ? "Gönderdiğin mesajın seçenekleri" : "Gelen mesajın seçenekleri"} aria-haspopup="dialog" aria-expanded={actionTarget?.message?.id === message.id} onClick={() => setActionTarget({ person: activePerson, message })}><DotsThree size={22} weight="bold"/></button>}
              </article>
            ))}
          </div>
          {hasNewMessages && <button className={styles.newMessages} type="button" onClick={() => {
            if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            nearBottom.current = true;
            setHasNewMessages(false);
          }}>Yeni mesajlar ↓</button>}
          {restricted && <p className={styles.notice} role="status">Bu kişiyi engelledin. Mesaj göndermek için kişi seçeneklerinden engeli kaldır.</p>}
          {readOnly && <p className={styles.notice} role="status">Bu hesap silindi. Kendi mesajlarını burada okuyabilirsin; yeni mesaj gönderilemez.</p>}
          {readOnly && error && <p className={styles.notice} role="alert">{error}</p>}
          {!readOnly && <form className={styles.composer} onSubmit={sendMessage}>
            {sending && <p className={styles.sendStatus} role="status">Gönderiliyor…</p>}
            {attempt?.status === "failed" && <div className={styles.sendFailure} role="alert"><span>Gönderilemedi. {attempt.error}</span><button type="submit" disabled={restricted || loading || (!text.trim() && !selectedAttachment)}>Tekrar dene</button></div>}
            {selectedAttachment && <div className={styles.selectedAttachment}><span><strong>{selectedAttachment.title}</strong><small>{attachmentMeta[selectedAttachment.type].label} · {selectedAttachment.meta}</small></span><button type="button" disabled={sending || restricted} onClick={() => setSelectedAttachment(null)} aria-label="Eki kaldır"><X size={17}/></button></div>}
            {error && <p role="alert">{error}</p>}
            <div><button type="button" disabled={sending || restricted} onClick={() => setPickerOpen((open) => !open)} aria-label="Eklediğim içeriklerden paylaş" aria-expanded={pickerOpen}><Paperclip size={21}/></button><textarea rows={1} aria-label="Mesajın" disabled={sending || restricted} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Mesaj yaz…" maxLength={2000}/><button className={styles.sendButton} type="submit" disabled={restricted || loading || sending || (!text.trim() && !selectedAttachment)} aria-label="Mesajı gönder"><PaperPlaneTilt size={20} weight="fill"/></button></div>
          </form>}
          {!readOnly && pickerOpen && <section className={styles.picker} aria-label="Paylaşılabilir içerikler"><header><div><strong>Eklediklerim</strong><small>Yalnızca senin eklediğin, yayındaki içerikler</small></div><button type="button" onClick={() => setPickerOpen(false)} aria-label="Kapat"><X size={18}/></button></header><nav>{(["all", "note", "library", "event", "place", "listing"] as const).map((type) => <button className={pickerType === type ? styles.pickerActive : ""} type="button" key={type} onClick={() => setPickerType(type)}>{type === "all" ? "Tümü" : attachmentMeta[type].label}</button>)}</nav><div>{filteredShareables.length ? filteredShareables.map((item) => { const ShareIcon = attachmentMeta[item.type].icon; return <button type="button" key={`${item.type}-${item.id}`} onClick={() => { setSelectedAttachment(item); setPickerOpen(false); }}><span><ShareIcon size={18}/></span><span><strong>{item.title}</strong><small>{attachmentMeta[item.type].label}{item.meta ? ` · ${item.meta}` : ""}</small></span></button>; }) : <p>Bu kategoride henüz paylaşabileceğin bir içerik yok.</p>}</div></section>}
        </> : <div className={styles.emptyThread}><span><ChatCircleDots size={40} weight="duotone"/></span><h2>Bir mesajla başla.</h2><p>Birlikte çalışacağın kişiyi bul, bir etkinlik paylaş ya da kampüsten bir arkadaşına merhaba de.</p><button type="button" onClick={openNewChat}><Plus size={18}/> Yeni mesaj</button></div>}
      </section>

      {newChatOpen && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeNewChat(); }}><section className={styles.dialog} ref={newChatRef} role="dialog" aria-modal="true" aria-labelledby="new-message-title"><header><div><span>YENİ SOHBET</span><h2 id="new-message-title">Yeni mesaj</h2></div><button type="button" onClick={closeNewChat} aria-label="Kapat"><X size={20}/></button></header><label className={styles.dialogSearch}><MagnifyingGlass size={18}/><input aria-label="Mesaj gönderilecek öğrenciyi ara" data-autofocus value={peopleQuery} onChange={(event) => { setPeopleQuery(event.target.value); setPeople([]); setPeopleLoading(Boolean(event.target.value.trim())); setError(""); }} placeholder="İsim, kullanıcı adı veya bölüm ara"/></label><div className={styles.peopleList}>{error && <p role="alert">{error}</p>}{!peopleQuery.trim() ? <p>Mesaj göndermek istediğin kişinin adını veya kullanıcı adını ara.</p> : peopleLoading ? <p>Öğrenciler aranıyor…</p> : people.length ? people.map((person) => <button type="button" key={person.publicId} onClick={() => choosePerson(person)}><PersonAvatar person={person}/><span><strong>{person.displayName}</strong><small>@{person.handle} · {person.departmentName}</small></span></button>) : <p>Kampüsünde eşleşen öğrenci bulunamadı.</p>}</div></section></div>}

      <MessageContextActions target={actionTarget} onClose={() => setActionTarget(null)} onRestore={(target) => { if (activeRecipientId.current === target.person.publicId) setActionTarget(target); }} onRestriction={applyRestriction}/>
    </div>
  );
}
