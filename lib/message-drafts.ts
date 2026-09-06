import { createSecureRandomKey } from "./secure-random-key";

/** Private message state lives only in this tab's memory. The authenticated root owns its lifetime. */
export type MessageRecipient = { publicId: string; deleted?: boolean; displayName: string; handle: string; avatarUrl?: string | null; universityShortName: string; departmentName: string };
export type MessageAttachment = { title: string; subtitle: string; detail: string; section: "Notlar" | "Kütüphane" | "Kampüs" | "Pazar" };
export type MessageShareable = { id: string; type: "note" | "library" | "event" | "place" | "listing"; title: string; meta: string; detail: string; section: MessageAttachment["section"] };
export type SessionMessage = { id: string; createdAt: string; own: boolean; body: string; attachmentType: string | null; attachmentId: string | null; attachment: MessageAttachment | null; read: boolean; removed: boolean; time: string };
export type MessageConversation = { id: string; person: MessageRecipient; preview: string; lastMessageOwn: boolean; unreadCount: number; time: string };
export type MessageThreadState = { conversationId: string | null; person: MessageRecipient; text: string; attachment: MessageShareable | null; messages: SessionMessage[]; olderCursor: string | null; historyLoaded: boolean; scrollTop: number | null; nearBottom: boolean };
export type MessageSendAttempt = { key: string; body: string; attachment: MessageShareable | null; status: "sending" | "failed" | "sent"; error: string; message?: SessionMessage; conversationId?: string };
type Session = { selected: { conversationId: string | null; person: MessageRecipient } | null; conversations: MessageConversation[]; shareables: MessageShareable[]; loaded: boolean };
const emptySession = (): Session => ({ selected: null, conversations: [], shareables: [], loaded: false });
const sameContent = (a: { body: string; attachment: MessageShareable | null }, b: { body: string; attachment: MessageShareable | null }) => a.body.trim() === b.body.trim() && a.attachment?.id === b.attachment?.id && a.attachment?.type === b.attachment?.type;

export function createMessageSessionState({ maxThreads = 8, maxMessages = 300, createKey = createSecureRandomKey }: { maxThreads?: number; maxMessages?: number; createKey?: () => string } = {}) {
  let owner: string | null = null;
  let generation = 0;
  let revision = 0;
  let session = emptySession();
  const threads = new Map<string, MessageThreadState>();
  const attempts = new Map<string, MessageSendAttempt>();
  const restrictedRecipients = new Set<string>();
  const listeners = new Set<() => void>();
  const notify = () => { revision++; listeners.forEach((listener) => listener()); };
  const valid = (scope: string) => Boolean(scope && scope === owner);
  const trim = () => {
    for (const id of threads.keys()) {
      if (threads.size <= Math.max(1, maxThreads)) break;
      if (id === session.selected?.person.publicId || attempts.get(id)?.status === "sending") continue;
      threads.delete(id); attempts.delete(id);
    }
    for (const [id, attempt] of attempts) if (!threads.has(id) && attempt.status !== "sending" && id !== session.selected?.person.publicId) attempts.delete(id);
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getRevision: () => revision,
    setOwnerScope(scope: string | null) {
      if (scope === owner) return;
      owner = scope; generation++; session = emptySession(); threads.clear(); attempts.clear(); restrictedRecipients.clear(); notify();
    },
    isOwner: valid,
    capture(scope: string) { const token = generation; return { isCurrent: () => valid(scope) && generation === token }; },
    readSession(scope: string): Session { return valid(scope) ? session : emptySession(); },
    saveSession(scope: string, changes: Partial<Session>) {
      if (!valid(scope)) return;
      session = { ...session, ...changes, conversations: (changes.conversations ?? session.conversations).slice(0, 100), shareables: (changes.shareables ?? session.shareables).slice(0, 200) };
      session.conversations = session.conversations.filter((item) => !restrictedRecipients.has(item.person.publicId));
      if (session.selected && restrictedRecipients.has(session.selected.person.publicId)) session.selected = null;
    },
    readThread(scope: string, recipientId: string) { return valid(scope) ? threads.get(recipientId) : undefined; },
    saveThread(scope: string, state: MessageThreadState) {
      if (!valid(scope) || restrictedRecipients.has(state.person.publicId)) return;
      const messages = state.messages.slice(-Math.max(100, maxMessages));
      threads.delete(state.person.publicId);
      threads.set(state.person.publicId, { ...state, text: state.text.slice(0, 2000), messages, olderCursor: messages.length < state.messages.length ? messages[0].id : state.olderCursor });
      trim();
    },
    removeThread(scope: string, recipientId: string) {
      if (!valid(scope)) return;
      threads.delete(recipientId); attempts.delete(recipientId);
      if (session.selected?.person.publicId === recipientId) session = { ...session, selected: null };
      notify();
    },
    isRestricted(scope: string, recipientId: string) { return valid(scope) && restrictedRecipients.has(recipientId); },
    /** Apply only a confirmed server preference; pending/failed requests cannot restrict a recipient. */
    setRecipientRestriction(scope: string, recipientId: string, restricted: boolean) {
      if (!valid(scope)) return;
      if (restricted) {
        restrictedRecipients.add(recipientId); threads.delete(recipientId); attempts.delete(recipientId);
        session = { ...session, selected: session.selected?.person.publicId === recipientId ? null : session.selected, conversations: session.conversations.filter((item) => item.person.publicId !== recipientId) };
      } else restrictedRecipients.delete(recipientId);
      notify();
    },
    attempt(scope: string, recipientId: string) { return valid(scope) ? attempts.get(recipientId) : undefined; },
    beginSend(scope: string, recipientId: string, body: string, attachment: MessageShareable | null) {
      if (!valid(scope) || restrictedRecipients.has(recipientId)) return null;
      const previous = attempts.get(recipientId);
      if (previous?.status === "sending") return null;
      if ([...attempts.values()].filter((attempt) => attempt.status === "sending").length >= Math.max(1, maxThreads)) return null;
      const attempt: MessageSendAttempt = { key: previous?.status === "failed" && sameContent(previous, { body, attachment }) ? previous.key : createKey(), body, attachment, status: "sending", error: "" };
      attempts.set(recipientId, attempt); notify(); return attempt;
    },
    failSend(scope: string, recipientId: string, key: string, error: string) {
      const previous = valid(scope) ? attempts.get(recipientId) : undefined;
      if (!previous || previous.key !== key || previous.status !== "sending") return;
      attempts.set(recipientId, { ...previous, status: "failed", error }); trim(); notify();
    },
    completeSend(scope: string, recipientId: string, key: string, conversationId: string, message: SessionMessage) {
      const previous = valid(scope) ? attempts.get(recipientId) : undefined;
      if (!previous || previous.key !== key || previous.status !== "sending") return;
      const thread = threads.get(recipientId);
      if (thread) {
        const unchanged = sameContent(previous, { body: thread.text, attachment: thread.attachment });
        const all = [...thread.messages.filter((item) => item.id !== message.id), message].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        const messages = all.slice(-Math.max(100, maxMessages));
        threads.set(recipientId, { ...thread, conversationId, text: unchanged ? "" : thread.text, attachment: unchanged ? null : thread.attachment, messages, olderCursor: messages.length < all.length ? messages[0].id : thread.olderCursor });
      }
      if (session.selected?.person.publicId === recipientId) session = { ...session, selected: { ...session.selected, conversationId } };
      attempts.set(recipientId, { ...previous, status: "sent", error: "", conversationId, message }); trim(); notify();
    },
  };
}

export const messageSessionState = createMessageSessionState();
export const setMessageOwnerScope = (scope: string | null) => messageSessionState.setOwnerScope(scope);
