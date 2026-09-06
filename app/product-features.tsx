"use client";
/* eslint-disable @next/next/no-img-element -- authenticated R2 note previews use dynamic same-origin URLs */

import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { PushNotifications } from "./push-notifications";
import { NoteFileActions } from "./note-file-actions";
import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatCircle } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { ThumbsDown } from "@phosphor-icons/react/dist/csr/ThumbsDown";
import { ThumbsUp } from "@phosphor-icons/react/dist/csr/ThumbsUp";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { curatedNotes, getCuratedSources, type CuratedNote } from "@/lib/curated-notes";

import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty, type WorkspaceHeaderAction } from "./workspace-ui";
import { matchesSearch, notificationHref } from "../lib/workspace-navigation";
import { notesHref, type NotesCourse, type NotesSource } from "../lib/notes-navigation";
import { AppLink, useAppNavigation } from "./app-navigation";
import { useScopedRequests } from "./use-scoped-requests";
export { UnifiedSearchResults } from "./unified-search";
import { useWorkspaceState } from "./use-workspace-state";
import { useAppLayer } from "./use-app-layer";
import { useContentTarget, clearContentTarget } from "./use-content-target";
import { invalidateProfileContent } from "../lib/profile-content-state";
import type { WorkspaceScreenId } from "../lib/workspace-capabilities";

export type FeatureCourse = { id: string; code: string; name: string };

export type Note = {
  id: string;
  ownerId?: string;
  ownerName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  title: string;
  description: string;
  noteType: string;
  examYear: number | null;
  examTerm: string | null;
  examKind: string | null;
  tags: string[];
  originalFileName: string;
  contentType: string;
  byteSize: number;
  pageCount: number | null;
  status: string;
  rejectionReason: string | null;
  time: string;
  saved: boolean;
  saveCount: number;
  viewCount: number;
  feedback: "helpful" | "unhelpful" | null;
  helpfulCount: number;
  unhelpfulCount: number;
  commentCount: number;
  own: boolean;
  fileUrl: string;
};

type NoteComment = {
  id: string;
  authorId?: string;
  authorName: string;
  initials: string;
  avatarUrl: string | null;
  content: string;
  time: string;
  edited: boolean;
  own: boolean;
};

type Community = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  joinPolicy: string;
  rules: string;
  status: string;
  courseId: string | null;
  courseCode: string | null;
  creatorName: string;
  memberCount: number;
  postCount: number;
  joined: boolean;
  pending: boolean;
  role: string | null;
  canManage: boolean;
};

type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  actorId?: string | null;
  read: boolean;
  time: string;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "Ü";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}

function withFeedbackVote(note: Note, vote: Note["feedback"]) {
  let helpfulCount = note.helpfulCount;
  let unhelpfulCount = note.unhelpfulCount;
  if (note.feedback === "helpful") helpfulCount = Math.max(0, helpfulCount - 1);
  if (note.feedback === "unhelpful") unhelpfulCount = Math.max(0, unhelpfulCount - 1);
  if (vote === "helpful") helpfulCount += 1;
  if (vote === "unhelpful") unhelpfulCount += 1;
  return { ...note, feedback: vote, helpfulCount, unhelpfulCount };
}

function formatVerifiedDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function FeatureHeader({ screenId, section, eyebrow, title, description, primaryAction }: { screenId: WorkspaceScreenId; section: "Notlar" | "Topluluklar"; eyebrow: string; title: string; description: string; primaryAction?: WorkspaceHeaderAction }) {
  return <WorkspaceHeader screenId={screenId} section={section} eyebrow={eyebrow} title={title} description={description} primaryAction={primaryAction}/>;
}

function EmptyState({ title, text }: { icon: string; title: string; text: string }) {
  return <WorkspaceEmpty title={title} description={text}/>;
}

const EDITORIAL_PAGE_SIZE = 8;
export type NotesPreview = { mode: "gallery"; request: (url: string, init: RequestInit) => Promise<unknown>; onUpload: () => void };

export function NotesWorkspace({ courses, initialCourse = null, initialSource = "students", preview }: { courses: FeatureCourse[]; initialCourse?: NotesCourse | null; initialSource?: NotesSource; preview?: NotesPreview }) {
  const owner = useAppNavigation()?.ownerScope ?? "";
  if (preview && process.env.NODE_ENV !== "development") return null;
  return <NotesWorkspaceView key={JSON.stringify([owner, initialCourse?.id, initialSource, Boolean(preview)])} courses={courses} initialCourse={initialCourse} initialSource={initialSource} preview={preview}/>;
}

function NotesWorkspaceView({ courses, initialCourse, initialSource, preview }: { courses: FeatureCourse[]; initialCourse: NotesCourse | null; initialSource: NotesSource; preview?: NotesPreview }) {
  const ownerScope = useAppNavigation()?.ownerScope ?? "";
  const locationTarget = useContentTarget("note", "notes");
  const targetId = preview ? "" : locationTarget;
  const [targetState, setTargetState] = useState<"idle" | "loading" | "error">("idle");
  const [targetError, setTargetError] = useState("");
  const [targetRetry, setTargetRetry] = useState(0);
  const fetch = useAuthenticatedFetch();
  const liveRequests = useScopedRequests();
  const requests = useMemo(() => preview ? { json: async <T extends { error?: string }>(url: string, init: RequestInit) => await preview.request(url, init) as T, isActive: () => true } : liveRequests, [preview, liveRequests]);
  const contextKey = `notes:${initialCourse?.id ?? "all"}:${initialSource}`;
  const [notes, setNotes] = useState<Note[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useWorkspaceState(`${contextKey}:query`, "");
  const [noteSort, setNoteSort] = useWorkspaceState(`${contextKey}:sort`, "recent");
  const [courseId, setCourseId] = useWorkspaceState(`${contextKey}:course`, initialCourse?.id ?? "");
  const [source, setSource] = useWorkspaceState<NotesSource>(`${contextKey}:source`, initialSource);
  const [editorialPage, setEditorialPage] = useWorkspaceState(`${contextKey}:page`, 0);
  const [scope, setScope] = useWorkspaceState<"all" | "exams" | "mine" | "saved">(`${contextKey}:scope`, "all");
  const [examYear, setExamYear] = useWorkspaceState(`${contextKey}:exam-year`, "");
  const [examKind, setExamKind] = useWorkspaceState(`${contextKey}:exam-kind`, "");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useWorkspaceState(`${contextKey}:upload-type`, "ders-notu");
  const [selected, setSelected] = useState<Note | null>(null);
  const [selectedCurated, setSelectedCurated] = useState<CuratedNote | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Note | null>(null);
  const [uploadDraft, setUploadDraft] = useWorkspaceState<Record<string, string>>(`${contextKey}:upload`, {});
  const [uploadFile, setUploadFile] = useWorkspaceState<File | null>(`${contextKey}:file`, null);
  const draftField = (name: string, fallback = "") => ({ value: uploadDraft[name] ?? fallback, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setUploadDraft((current) => ({ ...current, [name]: event.target.value })) });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const actionLocks = useRef(new Set<string>());
  const [pendingActions, setPendingActions] = useState<string[]>([]);
  const actionPending = (key: string) => pendingActions.includes(key);
  function beginAction(key: string) { if (actionLocks.current.has(key)) return false; actionLocks.current.add(key); setPendingActions([...actionLocks.current]); return true; }
  function endAction(key: string) { actionLocks.current.delete(key); if (requests.isActive()) setPendingActions([...actionLocks.current]); }
  const [noteComments, setNoteComments] = useState<NoteComment[]>([]);
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [commentsReloadKey, setCommentsReloadKey] = useState(0);
  const [commentsError, setCommentsError] = useState("");
  const [commentDrafts, setCommentDrafts] = useWorkspaceState<Record<string, string>>(`${contextKey}:comments`, {});
  const selectedIdRef = useRef("");
  const commentDraft = selected ? commentDrafts[selected.id] ?? "" : "";
  const setCommentDraft = (value: string) => { if (selected) setCommentDrafts((current) => ({ ...current, [selected.id]: value })); };
  const commentBusy = selected ? actionPending(`comment:${selected.id}`) : false;
  const [deleteError, setDeleteError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRequest = useRef(0);
  const noteUpload = useRef<XMLHttpRequest | null>(null);
  useEffect(() => () => {
    const request = noteUpload.current;
    noteUpload.current = null;
    if (request) { request.onload = null; request.onerror = null; request.ontimeout = null; request.onabort = null; request.upload.onprogress = null; request.abort(); }
  }, [fetch]);
  const editorialHeading = useRef<HTMLHeadingElement>(null);
  const [resolvedNotesFilter, setResolvedNotesFilter] = useState("");
  const lastNote = useRef<Note | null>(null);
  const lastCuratedNote = useRef<CuratedNote | null>(null);
  const lastDeleteNote = useRef<Note | null>(null);
  const uploadLayer = useAppLayer({ id: "notes.upload", open: showUpload, busy: uploading, onClose: () => setShowUpload(false), onRestore: () => setShowUpload(true) });
  const noteLayer = useAppLayer({ id: "notes.detail", history: targetId ? "route" : "layer", open: Boolean(selected) || Boolean(targetId && targetState !== "idle"), onClose: () => { lastNote.current = selected; setSelected(null); setTargetState("idle"); if (targetId) clearContentTarget("note", targetId, "notes"); }, onRestore: () => setSelected(lastNote.current) });
  const curatedLayer = useAppLayer({ id: "notes.editorial", open: Boolean(selectedCurated), onClose: () => { lastCuratedNote.current = selectedCurated; setSelectedCurated(null); }, onRestore: () => setSelectedCurated(lastCuratedNote.current) });
  const deleteLayer = useAppLayer({ id: "notes.delete", open: Boolean(deleteConfirm), busy: Boolean(deleteConfirm && actionPending(`delete:${deleteConfirm.id}`)), onClose: () => { lastDeleteNote.current = deleteConfirm; setDeleteConfirm(null); }, onRestore: () => setDeleteConfirm(lastDeleteNote.current) });
  const notesFilter = JSON.stringify([query.trim(), courseId, scope, examYear, examKind]);
  const notesLoading = state === "loading" || resolvedNotesFilter !== notesFilter;
  const filterCourses = useMemo(() => initialCourse && !courses.some((course) => course.id === initialCourse.id) ? [initialCourse, ...courses] : courses, [courses, initialCourse]);
  const selectedCourse = useMemo(() => filterCourses.find((course) => course.id === courseId), [courseId, filterCourses]);
  const visibleCuratedNotes = useMemo(() => {
    return curatedNotes.filter((item) => {
      const normalizeCode = (code: string) => code.toLocaleUpperCase("tr-TR").replace(/\s/g, "");
      if (selectedCourse && !item.courseCodes.some((code) => normalizeCode(code) === normalizeCode(selectedCourse.code))) return false;
      const sources = getCuratedSources(item);
      return matchesSearch(query, item.title, item.summary, item.category, ...item.courseCodes, ...item.tags, ...sources.flatMap((source) => [source.name, source.publisher]));
    });
  }, [query, selectedCourse]);
  const editorialPageCount = Math.ceil(visibleCuratedNotes.length / EDITORIAL_PAGE_SIZE);
  const currentEditorialPage = Math.min(editorialPage, Math.max(0, editorialPageCount - 1));
  const pageNotes = visibleCuratedNotes.slice(currentEditorialPage * EDITORIAL_PAGE_SIZE, (currentEditorialPage + 1) * EDITORIAL_PAGE_SIZE);

  useEffect(() => {
    if (!targetId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setSelected(null); setTargetState("loading"); setTargetError("");
      return requests.json<{ note?: Note; error?: string }>(`/api/notes?id=${encodeURIComponent(targetId)}`, { signal: controller.signal, cache: "no-store" }, "Not bulunamadı veya bu nota erişim iznin yok.");
    }).then((data) => {
      if (controller.signal.aborted || !data) return;
      if (!data.note || data.note.id !== targetId) throw new Error("Not bulunamadı veya bu nota erişim iznin yok.");
      lastNote.current = data.note; setSelected(data.note); setTargetState("idle");
    }).catch((cause) => {
      if (controller.signal.aborted || !requests.isActive()) return;
      lastNote.current = null; setTargetState("error"); setTargetError(cause instanceof Error ? cause.message : "Not açılamadı.");
    });
    return () => controller.abort();
  }, [targetId, targetRetry, requests]);

  function changeQuery(value: string) { setQuery(value); setEditorialPage(0); }
  function resetFilters() { setQuery(""); changeCourse(""); setScope("all"); setNoteSort("recent"); setExamYear(""); setExamKind(""); setEditorialPage(0); }
  function changeSource(value: NotesSource) {
    setSource(value);
    setEditorialPage(0);
    if (!preview) window.history.replaceState(window.history.state, "", notesHref(selectedCourse, value));
  }
  function changeCourse(value: string) {
    setCourseId(value);
    setEditorialPage(0);
    if (!preview) window.history.replaceState(window.history.state, "", notesHref(filterCourses.find((course) => course.id === value), source));
  }
  function changeEditorialPage(value: number) {
    setEditorialPage(value);
    editorialHeading.current?.focus({ preventScroll: true });
    editorialHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  async function loadNotes(signal?: AbortSignal) {
    const requestId = ++notesRequest.current;
    setState("loading");
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (courseId) params.set("courseId", courseId);
      if (scope === "exams") params.set("noteType", "cikmis-soru");
      if (scope === "exams" && examYear) params.set("examYear", examYear);
      if (scope === "exams" && examKind) params.set("examKind", examKind);
      if (scope === "mine") params.set("mine", "1");
      if (scope === "saved") params.set("saved", "1");
      const data = await requests.json<{ notes?: Note[]; error?: string }>(`/api/notes?${params}`, { headers: { accept: "application/json" }, signal }, "Notlar getirilemedi.");
      if (!Array.isArray(data?.notes)) throw new Error(data?.error ?? "Notlar getirilemedi.");
      if (!requests.isActive() || signal?.aborted || requestId !== notesRequest.current) return;
      setNotes(data.notes);
      setState("ready");
      setResolvedNotesFilter(notesFilter);
    } catch (loadError) {
      if (!requests.isActive() || signal?.aborted || requestId !== notesRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : "Notlar getirilemedi.");
      setState("error");
      setResolvedNotesFilter(notesFilter);
    }
  }

  useEffect(() => {
    if (source === "editorial") return;
    const controller = new AbortController();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadNotes(controller.signal), query ? 260 : 0);
    return () => { controller.abort(); if (searchTimer.current) clearTimeout(searchTimer.current); };
  // loadNotes is intentionally scoped to the selected filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, courseId, scope, examYear, examKind, source, requests]);

  const selectedNoteId = selected?.id ?? "";
  const selectedNoteStatus = selected?.status ?? "";
  useLayoutEffect(() => { selectedIdRef.current = selectedNoteId; }, [selectedNoteId]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!selectedNoteId || (selectedNoteStatus !== "published" && selectedNoteStatus !== "erased")) {
        setNoteComments([]);
        setCommentsState("idle");
        setCommentsError("");
        return;
      }
      setNoteComments([]);
      setCommentsState("loading");
      setCommentsError("");
      const data = await requests.json<{ comments?: NoteComment[]; error?: string }>(`/api/note-comments?noteId=${encodeURIComponent(selectedNoteId)}`, { headers: { accept: "application/json" }, signal: controller.signal }, "Yorumlar getirilemedi.");
      if (!Array.isArray(data?.comments)) throw new Error(data?.error ?? "Yorumlar getirilemedi.");
      if (!cancelled) { setNoteComments(data.comments); setCommentsState("ready"); }
    }).catch((commentError) => {
      if (!cancelled && requests.isActive()) {
        setCommentsError(commentError instanceof Error ? commentError.message : "Yorumlar getirilemedi.");
        setCommentsState("error");
      }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [selectedNoteId, selectedNoteStatus, commentsReloadKey, requests]);

  function updateNote(noteId: string, updater: (note: Note) => Note) {
    if (lastNote.current?.id === noteId) lastNote.current = updater(lastNote.current);
    if (lastDeleteNote.current?.id === noteId) lastDeleteNote.current = updater(lastDeleteNote.current);
    setNotes((current) => current.map((item) => item.id === noteId ? updater(item) : item));
    setSelected((current) => current?.id === noteId ? updater(current) : current);
  }

  async function toggleFeedback(note: Note, vote: Exclude<Note["feedback"], null>) {
    const key = `feedback:${note.id}`;
    if (note.status !== "published" || !beginAction(key)) return;
    const nextVote = note.feedback === vote ? null : vote;
    updateNote(note.id, (current) => withFeedbackVote(current, nextVote));
    setError("");
    setNoteErrors((current) => ({ ...current, [note.id]: "" }));
    try {
      const data = await requests.json<{ vote?: Note["feedback"]; helpfulCount?: number; unhelpfulCount?: number; error?: string }>("/api/note-actions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: note.id, type: vote, active: nextVote !== null }),
      }, "Geri bildirim kaydedilemedi.");
      if (!data || !(data.vote === null || data.vote === "helpful" || data.vote === "unhelpful")) throw new Error("Geri bildirim kaydedilemedi.");
      updateNote(note.id, (current) => ({ ...current, feedback: data.vote ?? null, helpfulCount: data.helpfulCount ?? current.helpfulCount, unhelpfulCount: data.unhelpfulCount ?? current.unhelpfulCount }));
    } catch (cause) {
      if (!requests.isActive()) return;
      updateNote(note.id, (current) => ({ ...current, feedback: note.feedback, helpfulCount: note.helpfulCount, unhelpfulCount: note.unhelpfulCount }));
      const message = cause instanceof Error ? cause.message : "Geri bildirim kaydedilemedi.";
      setError(message);
      setNoteErrors((current) => ({ ...current, [note.id]: message }));
    } finally { endAction(key); }
  }

  async function sendNoteComment() {
    const note = selected;
    const content = commentDraft.trim();
    if (!note || note.status !== "published" || commentsState !== "ready" || content.length < 2 || content.length > 500) return;
    const key = `comment:${note.id}`;
    if (!beginAction(key)) return;
    setCommentsError("");
    try {
      const data = await requests.json<{ comment?: NoteComment; count?: number; error?: string }>("/api/note-comments", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ noteId: note.id, content }),
      }, "Yorum paylaşılamadı.");
      if (!data?.comment?.id) throw new Error("Yorum paylaşılamadı.");
      updateNote(note.id, (current) => ({ ...current, commentCount: data.count ?? current.commentCount + 1 }));
      setCommentDrafts((current) => current[note.id]?.trim() === content ? { ...current, [note.id]: "" } : current);
      if (selectedIdRef.current === note.id) {
        setNoteComments((current) => [...current.filter((item) => item.id !== data.comment!.id), data.comment!]);
        setCommentsState("ready");
        setCommentsReloadKey((value) => value + 1);
      }
    } catch (cause) {
      if (requests.isActive() && selectedIdRef.current === note.id) setCommentsError(cause instanceof Error ? cause.message : "Yorum paylaşılamadı.");
    } finally { endAction(key); }
  }

  async function deleteNoteComment(comment: NoteComment) {
    const noteId = selected?.id;
    const key = `comment-delete:${comment.id}`;
    if (!noteId || !comment.own || !beginAction(key)) return;
    setCommentsError("");
    try {
      const data = await requests.json<{ deleted?: boolean; count?: number; error?: string }>("/api/note-comments", {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: comment.id }),
      }, "Yorum silinemedi.");
      if (data?.deleted !== true) throw new Error("Yorum silinemedi.");
      updateNote(noteId, (current) => ({ ...current, commentCount: data.count ?? Math.max(0, current.commentCount - 1) }));
      if (selectedIdRef.current === noteId) { setNoteComments((current) => current.filter((item) => item.id !== comment.id)); setCommentsReloadKey((value) => value + 1); }
    } catch (cause) {
      if (requests.isActive() && selectedIdRef.current === noteId) setCommentsError(cause instanceof Error ? cause.message : "Yorum silinemedi.");
    } finally { endAction(key); }
  }

  async function toggleSave(note: Note) {
    const key = `save:${note.id}`;
    if (note.status === "erased" || !beginAction(key)) return;
    setError("");
    setNoteErrors((current) => ({ ...current, [note.id]: "" }));
    updateNote(note.id, (current) => ({ ...current, saved: !note.saved }));
    try {
      const data = await requests.json<{ active?: boolean; count?: number; error?: string }>("/api/note-actions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id, type: "save", active: !note.saved }),
      }, "Not kaydı değiştirilemedi.");
      if (typeof data?.active !== "boolean") throw new Error("Not kaydı değiştirilemedi.");
      updateNote(note.id, (current) => ({ ...current, saved: data.active!, saveCount: data.count ?? current.saveCount }));
      if (scope === "saved" && !data.active) setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (cause) {
      if (!requests.isActive()) return;
      updateNote(note.id, (current) => ({ ...current, saved: note.saved }));
      const message = cause instanceof Error ? cause.message : "Not kaydı değiştirilemedi.";
      setError(message);
      setNoteErrors((current) => ({ ...current, [note.id]: message }));
    } finally { endAction(key); }
  }

  function uploadNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) { preview.onUpload(); setUploadError("Galeri simülasyonu: dosya sunucuya yüklenmedi."); return; }
    if (noteUpload.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (uploadFile) data.set("file", uploadFile);
    setUploading(true);
    setProgress(0);
    setUploadError("");
    const request = new window.XMLHttpRequest();
    const check = fetch.beginResponseCheck();
    noteUpload.current = request;
    request.open("POST", "/api/notes");
    request.responseType = "json";
    request.timeout = 120_000;
    request.upload.onprogress = (progressEvent) => {
      if (noteUpload.current !== request || !check.isCurrent()) return;
      if (progressEvent.lengthComputable) setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
    };
    request.onload = () => {
      if (noteUpload.current !== request || !check.accept(request.status)) return;
      noteUpload.current = null;
      setUploading(false);
      const body = request.response as { note?: Note; error?: string } | null;
      if (request.status < 200 || request.status >= 300 || !body?.note) {
        setUploadError(body?.error ?? "Not yüklenemedi. Bağlantını kontrol edip yeniden dene.");
        return;
      }
      setNotes((current) => [body.note!, ...current]);
      invalidateProfileContent(ownerScope, undefined, ["notes"]);
      setShowUpload(false);
      form.reset(); setUploadDraft({}); setUploadFile(null);
      setUploadType("ders-notu");
      setProgress(0);
      setUploadError("");
    };
    const uploadInterrupted = () => {
      if (noteUpload.current !== request || !check.isCurrent()) return;
      noteUpload.current = null;
      setUploading(false);
      setUploadError("Yüklemenin sonucu doğrulanamadı. Dosyan ve taslağın korundu. Yeniden yüklemeden önce Notlarım'da kaydın oluşup oluşmadığını kontrol et.");
    };
    request.onerror = uploadInterrupted;
    request.ontimeout = uploadInterrupted;
    request.onabort = uploadInterrupted;
    request.send(data);
  }

  async function removeNote(note: Note) {
    const key = `delete:${note.id}`;
    if (!beginAction(key)) return;
    setDeleteError("");
    try {
      const data = await requests.json<{ deleted?: boolean; error?: string }>("/api/notes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id }) }, "Not silinemedi.");
      if (data?.deleted !== true) throw new Error("Not silinemedi.");
      if (!preview) invalidateProfileContent(ownerScope, undefined, ["notes"]);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setDeleteConfirm((current) => current?.id === note.id ? null : current);
      setSelected((current) => current?.id === note.id ? null : current);
      if (lastNote.current?.id === note.id) lastNote.current = null;
      if (lastDeleteNote.current?.id === note.id) lastDeleteNote.current = null;
      setCommentDrafts((current) => { const next = { ...current }; delete next[note.id]; return next; });
    } catch (cause) {
      if (requests.isActive()) setDeleteError(cause instanceof Error ? cause.message : "Not silinemedi.");
    } finally { endAction(key); }
  }

  return <div data-scroll-pending={source === "students" && notesLoading} className="workspace-view feature-workspace notes-workspace">
    <FeatureHeader screenId="notes" section="Notlar" eyebrow="NOT KÜTÜPHANESİ" title="Ders notları" description="Kampüsünden paylaşımlar ve kaynakları doğrulanmış çalışma notları." primaryAction={{ id: "notes.upload", label: source === "students" && scope === "exams" ? "Soru yükle" : "Not yükle", icon: <Plus size={22}/>, onPress: () => { setUploadType(source === "students" && scope === "exams" ? "cikmis-soru" : "ders-notu"); setShowUpload(true); } }}/>
    <div className="notes-source-switch" role="group" aria-label="Not kaynağı">
      <button type="button" aria-pressed={source === "students"} onClick={() => changeSource("students")}><strong>Öğrenci notları</strong><span>Kampüsünden paylaşımlar</span></button>
      <button type="button" aria-pressed={source === "editorial"} onClick={() => changeSource("editorial")}><strong>Editoryal kaynaklar</strong><span>Doğrulanmış çalışma notları</span></button>
    </div>
    <WorkspaceSearch value={query} onChange={changeQuery} placeholder={source === "editorial" ? "Kaynaklarda ara" : scope === "exams" ? "Çıkmış sorularda ara" : "Notlarda ara"} resultCount={source === "editorial" ? visibleCuratedNotes.length : notesLoading || state === "error" ? undefined : notes.length} onReset={query || courseId || (source === "students" && (scope !== "all" || noteSort !== "recent" || examYear || examKind)) ? resetFilters : undefined} filterCount={Number(Boolean(courseId)) + (source === "students" ? Number(scope !== "all") + Number(noteSort !== "recent") + Number(Boolean(examYear)) + Number(Boolean(examKind)) : 0)}>
    <div className="feature-toolbar notes-toolbar">
      {source === "students" && <div role="group" aria-label="Öğrenci notu görünümü">{([['all','Tümü'],['exams','Çıkmış Sorular'],['mine','Notlarım'],['saved','Kaydettiklerim']] as const).map(([value,label]) => <button aria-pressed={scope === value} className={scope === value ? "active" : ""} type="button" onClick={() => setScope(value)} key={value}>{label}</button>)}</div>}
      <section className="notes-filter-controls" aria-label="Ders ve sıralama"><label>Ders<select aria-label="Ders filtresi" value={courseId} onChange={(event) => changeCourse(event.target.value)}><option value="">Tümü</option>{filterCourses.map((course) => <option value={course.id} key={course.id}>{course.code}{course.name ? ` · ${course.name}` : ""}</option>)}</select></label>{source === "students" && <label><span>Sıralama</span><select aria-label="Öğrenci notlarını sırala" value={noteSort} onChange={(event) => setNoteSort(event.target.value)}><option value="recent">En yeni</option><option value="helpful">En yararlı</option><option value="views">En çok görüntülenen</option></select></label>}</section>
    </div>
    {source === "students" && scope === "exams" && <section className="exam-filter-strip" aria-label="Çıkmış soru filtreleri"><div><span><FileText size={22} aria-hidden="true"/></span><p><strong>Dersini seç, geçmiş sınavları karşılaştır.</strong><small>Yüklemeler resmî cevap anahtarı olarak kabul edilmez; çözümleri ders kaynağınla doğrula.</small></p></div><label>Yıl<select value={examYear} onChange={(event) => setExamYear(event.target.value)}><option value="">Tümü</option>{Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>Sınav<select value={examKind} onChange={(event) => setExamKind(event.target.value)}><option value="">Tümü</option><option value="vize">Vize</option><option value="final">Final</option><option value="butunleme">Bütünleme</option><option value="quiz">Quiz</option></select></label></section>}
    </WorkspaceSearch>
    {(selectedCourse || (source === "students" && scope !== "all")) && <div className="notes-active-filters" aria-label="Etkin not filtreleri">{selectedCourse && <button type="button" onClick={() => changeCourse("")} aria-label={`${selectedCourse.code} ders filtresini kaldır`}><span>{selectedCourse.code}{selectedCourse.name ? ` · ${selectedCourse.name}` : ""}</span><X size={16} aria-hidden="true"/></button>}{source === "students" && scope !== "all" && <button type="button" onClick={() => setScope("all")} aria-label="Not görünümü filtresini kaldır"><span>{scope === "exams" ? "Çıkmış Sorular" : scope === "mine" ? "Notlarım" : "Kaydettiklerim"}</span><X size={16} aria-hidden="true"/></button>}</div>}
    {source === "students" && error && <p className="feature-error" role="alert">{error} <button type="button" onClick={() => void loadNotes()}>Yeniden dene</button></p>}
    {source === "editorial" ? <section className="curated-library" aria-labelledby="curated-library-title">
      <header className="curated-library-header"><div><span>KAMPIRA EDİTORYAL · KAYNAKLI</span><h2 id="curated-library-title" ref={editorialHeading} tabIndex={-1}>Doğrulanmış çalışma notları</h2><p>Resmi kurumlar, üniversite açık dersleri ve açık ders kitaplarından araştırılarak özgün biçimde hazırlandı.</p></div><strong>{visibleCuratedNotes.length}<small>{query || selectedCourse ? "eşleşen not" : "editoryal not"}</small></strong></header>
      {visibleCuratedNotes.length > 0 ? <><nav className="notes-pagination" aria-label="Editoryal kaynak sayfaları"><span role="status">{currentEditorialPage * EDITORIAL_PAGE_SIZE + 1}–{Math.min((currentEditorialPage + 1) * EDITORIAL_PAGE_SIZE, visibleCuratedNotes.length)} / {visibleCuratedNotes.length} kaynak</span><div><button type="button" disabled={currentEditorialPage === 0} onClick={() => changeEditorialPage(currentEditorialPage - 1)}><ArrowLeft size={16} aria-hidden="true"/> Önceki</button><button type="button" disabled={currentEditorialPage + 1 >= editorialPageCount} onClick={() => changeEditorialPage(currentEditorialPage + 1)}>Sonraki <ArrowRight size={16} aria-hidden="true"/></button></div></nav><div className="curated-note-grid">{pageNotes.map((item) => {
        const sources = getCuratedSources(item);
        return <article className="curated-note-card" key={item.id}>
          <button className="curated-note-main" type="button" onClick={() => setSelectedCurated(item)}>
            <span className="curated-note-badge"><Check size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }}/> KAYNAKLI</span>
            <small>{item.courseCodes.join(" · ")} · {item.readingMinutes} dk</small>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
          </button>
          <footer><span>{sources[0].publisher}</span><button type="button" onClick={() => setSelectedCurated(item)}>Notu aç <ArrowRight size={16} aria-hidden="true"/></button></footer>
        </article>;
      })}</div></> : <WorkspaceEmpty title="Bu filtreyle editoryal kaynak bulunamadı" description="Arama terimini veya ders filtresini değiştirerek yeniden dene." action={<button type="button" onClick={resetFilters}>Filtreleri temizle</button>}/>}
    </section> : <>
    {notes.length > 0 && <div className="campus-notes-heading"><div><span>{scope === "exams" ? "SINAV ARŞİVİ" : "KAMPÜS KÜTÜPHANESİ"}</span><h2>{scope === "exams" ? "Öğrencilerin yüklediği sorular" : "Öğrenci notları"}</h2></div></div>}
    {notesLoading ? <EmptyState icon="…" title="Notlar getiriliyor" text="Kampüs kütüphanen hazırlanıyor."/> : state === "error" ? null : notes.length === 0 ? <WorkspaceEmpty title={query || courseId || examYear || examKind ? "Bu filtrelerle öğrenci notu bulunamadı" : scope === "mine" ? "Henüz not paylaşmadın" : scope === "saved" ? "Henüz kaydettiğin not yok" : "Kampüsünde henüz öğrenci notu yok"} description={scope === "saved" ? "Beğendiğin öğrenci notlarını kaydederek burada bir araya getirebilirsin." : "İlk notu sen paylaşabilir veya editoryal çalışma kaynaklarına göz atabilirsin."} action={<div className="notes-empty-actions">{query || courseId || examYear || examKind ? <button type="button" onClick={resetFilters}>Filtreleri temizle</button> : <button type="button" onClick={() => { setUploadType(scope === "exams" ? "cikmis-soru" : "ders-notu"); setShowUpload(true); }}>İlk notunu paylaş</button>}<button type="button" onClick={() => changeSource("editorial")}>Editoryal kaynaklara bak</button></div>}/> : <div className="feature-note-grid">{[...notes].sort((a,b) => noteSort === "helpful" ? b.helpfulCount - a.helpfulCount : noteSort === "views" ? b.viewCount - a.viewCount : 0).map((note) => <article className="feature-note-card" key={note.id}>
      <button className="feature-note-cover" type="button" onClick={() => setSelected(note)} aria-label={`${note.title} belgesini aç`}><FileText size={28} aria-hidden="true"/><strong>{note.contentType === "application/pdf" ? "PDF" : note.originalFileName.split('.').at(-1)?.toLocaleUpperCase("tr-TR")}</strong></button>
      <div className="feature-note-body"><div><span>{note.courseCode}</span><button className={note.saved ? "active" : ""} type="button" disabled={note.status === "erased" || actionPending(`save:${note.id}`)} onClick={() => void toggleSave(note)} aria-label={note.saved ? "Notu kayıtlardan çıkar" : "Notu kaydet"}><BookmarkSimple size={20} weight={note.saved ? "fill" : "regular"} aria-hidden="true"/></button></div>{note.noteType === "cikmis-soru" && <div className="exam-note-meta"><span>{note.examYear}</span><span>{({ vize: "Vize", final: "Final", butunleme: "Bütünleme", quiz: "Quiz" } as Record<string, string>)[note.examKind ?? ""] ?? note.examKind}</span><span>{({ guz: "Güz", bahar: "Bahar", yaz: "Yaz" } as Record<string, string>)[note.examTerm ?? ""] ?? "Dönem belirtilmemiş"}</span></div>}<button className="feature-note-title" type="button" onClick={() => setSelected(note)}>{note.title}</button><p>{note.ownerName}</p><small>{formatBytes(note.byteSize)} · {note.viewCount.toLocaleString("tr-TR")} görüntülenme</small>
        {note.status !== "published" && <span className={`feature-status status-${note.status}`}>{note.status === "erased" ? "Dosya silindi" : note.status === "processing" ? "İşleniyor" : "İncelendi"}</span>}
      </div>
        {note.status === "published" && <div className="note-feedback-row" aria-label={`${note.title} geri bildirimleri`}>
          <button className={note.feedback === "helpful" ? "active helpful" : ""} type="button" onClick={() => void toggleFeedback(note, "helpful")} disabled={actionPending(`feedback:${note.id}`)} aria-pressed={note.feedback === "helpful"}><ThumbsUp size={15} weight={note.feedback === "helpful" ? "fill" : "regular"}/><span>Yararlı</span><b>{note.helpfulCount}</b></button>
          <button className={note.feedback === "unhelpful" ? "active unhelpful" : ""} type="button" onClick={() => void toggleFeedback(note, "unhelpful")} disabled={actionPending(`feedback:${note.id}`)} aria-pressed={note.feedback === "unhelpful"}><ThumbsDown size={15} weight={note.feedback === "unhelpful" ? "fill" : "regular"}/><span>Yararlı değil</span><b>{note.unhelpfulCount}</b></button>
          <button type="button" onClick={() => setSelected(note)} aria-label={`${note.commentCount} yorumu aç`}><ChatCircle size={15}/><span>Yorum</span><b>{note.commentCount}</b></button>
        </div>}
    </article>)}</div>}
    </>}

    <div style={{ display: showUpload ? undefined : "none" }} className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) uploadLayer.close(); }}><section ref={uploadLayer.ref} className="feature-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title"><header><div><span>GÜVENLİ YÜKLEME</span><h2 id="upload-title">{uploadType === "cikmis-soru" ? "Çıkmış soru ekle" : "Yeni ders notu"}</h2></div><button type="button" onClick={uploadLayer.close} disabled={uploading} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header><form onSubmit={uploadNote}>
      <label>Başlık<input name="title" {...draftField("title")} required minLength={3} maxLength={120} placeholder="Örn. Lineer Cebir Final Özeti"/></label>
      <label>Ders<select name="courseId" required {...draftField("courseId", initialCourse?.id ?? "")}><option value="" disabled>Dersini seç</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label>
      <div className="feature-field-row"><label>Not türü<select name="noteType" value={uploadType} onChange={(event) => setUploadType(event.target.value)}><option value="ders-notu">Ders notu</option><option value="formul-kagidi">Formül kâğıdı</option><option value="cikmis-soru">Çıkmış soru</option><option value="sunum">Sunum</option></select></label><label>Etiketler<input name="tags" {...draftField("tags")} maxLength={240} placeholder="final, integral, özet"/></label></div>
      {uploadType === "cikmis-soru" && <div className="exam-upload-fields"><label>Yıl<input name="examYear" {...draftField("examYear", String(new Date().getFullYear()))} type="number" min="2000" max={new Date().getFullYear() + 1} required/></label><label>Dönem<select name="examTerm" required {...draftField("examTerm")}><option value="" disabled>Seç</option><option value="guz">Güz</option><option value="bahar">Bahar</option><option value="yaz">Yaz</option></select></label><label>Sınav türü<select name="examKind" required {...draftField("examKind")}><option value="" disabled>Seç</option><option value="vize">Vize</option><option value="final">Final</option><option value="butunleme">Bütünleme</option><option value="quiz">Quiz</option></select></label></div>}
      <label>Açıklama<textarea name="description" {...draftField("description")} maxLength={600} rows={3} placeholder="Notta hangi konuların bulunduğunu kısaca anlat."/></label>
      <label className="feature-file-field"><span>Dosya seç</span><input name="file" type="file" required={!uploadFile} onChange={(event) => { const file = event.target.files?.[0]; if (file) setUploadFile(file); }} accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"/><small>{uploadFile ? `${uploadFile.name} · ${formatBytes(uploadFile.size)}` : "PDF, DOCX, PNG, JPG veya WEBP · en fazla 15 MB"}</small></label>
      {uploadType === "cikmis-soru" && <p className="exam-upload-warning">Yalnız paylaşma hakkın olan materyali yükle. Kişisel bilgi, izinsiz ticari soru bankası veya “resmî” diye doğrulanmamış cevap anahtarı ekleme.</p>}
      {uploading && <div className="feature-progress" aria-live="polite"><span style={{ width: `${progress}%` }}/><strong>%{progress} yükleniyor</strong></div>}
      {uploadError && <p className="feature-error" role="alert">{uploadError}</p>}
      <footer><button type="button" onClick={uploadLayer.close} disabled={uploading}>Vazgeç</button><button className="feature-primary" type="submit" disabled={uploading}>{uploading ? "Yükleniyor…" : uploadType === "cikmis-soru" ? "Soruyu yükle" : "Notu yükle"}</button></footer>
    </form></section></div>

    {targetId && !selected && targetState !== "idle" && <div className="feature-overlay" role="presentation"><section ref={noteLayer.ref} className="feature-dialog feature-detail" role="dialog" aria-modal="true" aria-labelledby="note-target-title"><header><h2 id="note-target-title">{targetState === "loading" ? "Not açılıyor…" : "Not açılamadı"}</h2><button type="button" onClick={noteLayer.close} aria-label="Pencereyi kapat"><X size={22}/></button></header>{targetState === "loading" ? <p role="status">Bağlantıdaki not kontrol ediliyor.</p> : <><p role="alert">{targetError}</p><button type="button" onClick={() => setTargetRetry((value) => value + 1)}>Yeniden dene</button></>}</section></div>}
    {selected && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) noteLayer.close(); }}><section ref={noteLayer.ref} className="feature-dialog feature-detail" role="dialog" aria-modal="true" aria-labelledby="note-detail-title"><header><div><span>{selected.courseCode} · {({ "ders-notu": "Ders notu", "cikmis-soru": "Çıkmış soru", "formul-kagidi": "Formül kâğıdı", sunum: "Sunum" } as Record<string, string>)[selected.noteType] ?? "Çalışma belgesi"}</span><h2 id="note-detail-title">{selected.title}</h2></div><button type="button" onClick={noteLayer.close} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header>
      <div className="feature-detail-meta"><span className="feature-avatar">{initials(selected.ownerName)}</span><div><strong>{selected.ownerName}</strong><small>{selected.time} önce · {formatBytes(selected.byteSize)}</small></div><span className={`feature-status status-${selected.status}`}>{selected.status === "erased" ? "Dosya silindi" : selected.status === "published" ? "Yayında" : selected.status === "processing" ? "İşleniyor" : "Reddedildi"}</span></div>
      {selected.description && <p className="feature-detail-description">{selected.description}</p>}
      {selected.noteType === "cikmis-soru" && <div className="exam-note-meta detail"><span>{selected.examYear}</span><span>{({ guz: "Güz", bahar: "Bahar", yaz: "Yaz" } as Record<string, string>)[selected.examTerm ?? ""] ?? "Dönem belirtilmemiş"}</span><span>{({ vize: "Vize", final: "Final", butunleme: "Bütünleme", quiz: "Quiz" } as Record<string, string>)[selected.examKind ?? ""] ?? selected.examKind}</span></div>}
      {selected.tags.length > 0 && <div className="feature-tags">{selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {noteErrors[selected.id] && <p className="feature-error" role="alert">{noteErrors[selected.id]}</p>}
      {selected.status === "published" && <section className="note-feedback-summary" aria-labelledby="note-feedback-title">
        <div><span>TOPLULUK GERİ BİLDİRİMİ</span><strong id="note-feedback-title">Bu not işine yaradı mı?</strong></div>
        <div>
          <button className={selected.feedback === "helpful" ? "active helpful" : ""} type="button" onClick={() => void toggleFeedback(selected, "helpful")} disabled={actionPending(`feedback:${selected.id}`)} aria-pressed={selected.feedback === "helpful"}><ThumbsUp size={18} weight={selected.feedback === "helpful" ? "fill" : "regular"}/><span>Yararlı</span><b>{selected.helpfulCount}</b></button>
          <button className={selected.feedback === "unhelpful" ? "active unhelpful" : ""} type="button" onClick={() => void toggleFeedback(selected, "unhelpful")} disabled={actionPending(`feedback:${selected.id}`)} aria-pressed={selected.feedback === "unhelpful"}><ThumbsDown size={18} weight={selected.feedback === "unhelpful" ? "fill" : "regular"}/><span>Yararlı değil</span><b>{selected.unhelpfulCount}</b></button>
        </div>
      </section>}
      {preview ? <WorkspaceEmpty title="Galeri belge örneği" description="Bu örnek dosya indirmez veya sunucuya bağlanmaz."/> : selected.status === "erased" ? <EmptyState icon="DOCX" title="Dosya silindi" text="Paylaşan hesap silindi. Diğer öğrencilerin mevcut yorumları aşağıda korunuyor."/> : selected.status === "published" ? <div className="feature-preview">{selected.contentType.startsWith("image/") ? <img src={selected.fileUrl} alt={`${selected.title} önizlemesi`}/> : selected.contentType === "application/pdf" ? <iframe src={selected.fileUrl} title={`${selected.title} PDF önizlemesi`}/> : <EmptyState icon="DOCX" title="Belge indirilmeye hazır" text="DOCX dosyaları güvenli indirme bağlantısıyla açılır."/>}</div> : <EmptyState icon="!" title={selected.status === "processing" ? "Dosya işleniyor" : "Dosya yayınlanmadı"} text={selected.rejectionReason ?? "İnceleme tamamlandığında burada görünecek."}/>}
      {(selected.status === "published" || selected.status === "erased") && <section className="note-comments-panel" aria-labelledby="note-comments-title">
        <header><div><span>ÖĞRENCİ YORUMLARI</span><h3 id="note-comments-title">Not hakkında konuş</h3></div><strong><ChatCircle size={16} weight="fill"/>{selected.commentCount}</strong></header>
        {selected.status === "published" && <form onSubmit={(event) => { event.preventDefault(); void sendNoteComment(); }}>
          <label className="sr-only" htmlFor={`note-comment-${selected.id}`}>Yorum yaz</label>
          <textarea id={`note-comment-${selected.id}`} disabled={commentBusy || commentsState !== "ready"} value={commentDraft} onChange={(event) => { setCommentDraft(event.target.value); setCommentsError(""); }} minLength={2} maxLength={500} rows={2} placeholder="Notla ilgili sorunu, düzeltmeni veya teşekkürünü yaz…"/>
          <footer><small>{commentDraft.length}/500</small><button className="feature-primary" type="submit" disabled={commentDraft.trim().length < 2 || commentBusy || commentsState !== "ready"}><PaperPlaneTilt size={16}/>{commentBusy ? "Gönderiliyor…" : "Yorum yap"}</button></footer>
        </form>}
        {commentsError && <p className="note-comments-error" role="alert">{commentsError}{commentsState === "error" && <button type="button" onClick={() => setCommentsReloadKey((value) => value + 1)}>Yeniden dene</button>}</p>}
        {commentsState === "loading" && <p className="note-comments-state" aria-live="polite">Yorumlar getiriliyor…</p>}
        {commentsState === "ready" && noteComments.length === 0 && <p className="note-comments-state">İlk yorumu sen bırak.</p>}
        {noteComments.length > 0 && <div className="note-comment-list">{noteComments.map((comment) => <article key={comment.id}>
          {comment.avatarUrl ? <img src={comment.avatarUrl} alt=""/> : <span>{comment.initials}</span>}
          <div><header><strong>{comment.authorName}</strong><small>{comment.time === "şimdi" ? comment.time : `${comment.time} önce`}</small></header><p>{comment.content}{comment.edited && <small> · düzenlendi</small>}</p></div>
          {comment.own && <button type="button" onClick={() => void deleteNoteComment(comment)} disabled={actionPending(`comment-delete:${comment.id}`)} aria-label="Yorumu sil"><Trash size={15}/></button>}
        </article>)}</div>}
      </section>}
      <footer>{selected.status !== "erased" && <button type="button" onClick={() => void toggleSave(selected)} disabled={actionPending(`save:${selected.id}`)} aria-pressed={selected.saved}>{selected.saved ? "Kaydedildi" : "Kaydet"}</button>}{selected.own && <button className="feature-danger" type="button" onClick={() => { setDeleteError(""); setDeleteConfirm(selected); }}>Notu sil</button>}{selected.status === "published" && !preview && <><NoteFileActions fileUrl={selected.fileUrl}/></>}</footer>
    </section></div>}

    {selectedCurated && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) curatedLayer.close(); }}><section ref={curatedLayer.ref} className="feature-dialog feature-detail curated-detail" role="dialog" aria-modal="true" aria-labelledby="curated-detail-title"><header><div><span>KAMPIRA EDİTORYAL · {selectedCurated.courseCodes.join(" · ")}</span><h2 id="curated-detail-title">{selectedCurated.title}</h2></div><button type="button" onClick={curatedLayer.close} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header>
      <div className="curated-detail-intro"><span><Check size={15} aria-hidden="true" style={{ verticalAlign: "-2px" }}/> Kaynakları doğrulandı</span><p>{selectedCurated.summary}</p><small>{selectedCurated.level} · {selectedCurated.readingMinutes} dakika · {formatVerifiedDate(selectedCurated.verifiedOn)} tarihinde doğrulandı</small></div>
      <div className="curated-detail-columns"><section><h3>Bilmen gerekenler</h3><ul>{selectedCurated.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul></section><section><h3>Çalışma kontrolü</h3><ol>{selectedCurated.checklist.map((step) => <li key={step}>{step}</li>)}</ol></section></div>
      <div className="feature-tags">{selectedCurated.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      <section className="curated-sources"><h3>Kaynaklar</h3><p>Bu kısa not özgün olarak hazırlandı. Konuyu ayrıntılı çalışmak ve güncel metni doğrulamak için birincil kaynağı aç.</p>{getCuratedSources(selectedCurated).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.key}><span><strong>{source.name}</strong><small>{source.publisher}</small></span><i aria-hidden="true"><ArrowUpRight size={18}/></i></a>)}</section>
      <footer><button type="button" onClick={curatedLayer.close}>Kapat</button><a className="feature-primary" href={getCuratedSources(selectedCurated)[0].url} target="_blank" rel="noreferrer">Ana kaynağı aç <ArrowUpRight size={17} aria-hidden="true"/></a></footer>
    </section></div>}

    {deleteConfirm && <div className="feature-overlay feature-confirm-layer"><section ref={deleteLayer.ref} className="feature-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-note-title"><span><WarningCircle size={28} aria-hidden="true"/></span><h2 id="delete-note-title">Not kalıcı olarak silinsin mi?</h2><p>“{deleteConfirm.title}” dosyası ve ilişkili kayıtları geri getirilemeyecek.</p><p role="alert">{deleteError}</p><div><button type="button" disabled={actionPending(`delete:${deleteConfirm.id}`)} onClick={deleteLayer.close}>Vazgeç</button><button className="feature-danger" type="button" disabled={actionPending(`delete:${deleteConfirm.id}`)} onClick={() => void removeNote(deleteConfirm)}>{actionPending(`delete:${deleteConfirm.id}`) ? "Siliniyor…" : "Notu sil"}</button></div></section></div>}
  </div>;
}

export function CommunitiesWorkspace({ courses }: { courses: FeatureCourse[] }) {
  const fetch = useAuthenticatedFetch();
  const [items, setItems] = useState<Community[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Community | null>(null);
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [posts, setPosts] = useState<Array<{ id: string; authorName?: string; content: string; time: string; pinned: boolean; own: boolean }>>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setState("loading"); setError("");
    try {
      const params = new URLSearchParams(); if (query) params.set("q", query); if (mine) params.set("mine", "1");
      const response = await fetch(`/api/communities?${params}`);
      const data = await response.json() as { communities?: Community[]; error?: string };
      if (!response.ok || !data.communities) throw new Error(data.error ?? "Topluluklar getirilemedi.");
      setItems(data.communities); setState("ready");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Topluluklar getirilemedi."); setState("error"); }
  }
  useEffect(() => { const timer = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(timer); }, [query, mine, fetch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openCommunity(community: Community) {
    setSelected(community); setError("");
    try {
      const [detailResponse, postsResponse] = await Promise.all([fetch(`/api/communities?id=${community.id}`), fetch(`/api/community-posts?communityId=${community.id}`)]);
      const detail = await detailResponse.json() as { community?: Community; members?: Array<Record<string, unknown>>; error?: string };
      const postData = await postsResponse.json() as { posts?: typeof posts; error?: string };
      if (!detailResponse.ok || !detail.community) throw new Error(detail.error ?? "Topluluk açılamadı.");
      setSelected(detail.community); setMembers(detail.members ?? []); setPosts(postData.posts ?? []);
    } catch (openError) { setError(openError instanceof Error ? openError.message : "Topluluk açılamadı."); }
  }

  async function membership(community: Community) {
    const action = community.joined || community.pending ? "leave" : "join";
    const optimistic = { ...community, joined: action === "join" && community.joinPolicy === "open", pending: action === "join" && community.joinPolicy === "request" };
    setItems((current) => current.map((item) => item.id === community.id ? optimistic : item));
    try {
      const response = await fetch("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: community.id, action }) });
      const data = await response.json() as { joined?: boolean; pending?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Üyelik değiştirilemedi.");
      setItems((current) => current.map((item) => item.id === community.id ? { ...item, joined: Boolean(data.joined), pending: Boolean(data.pending), memberCount: Math.max(0, item.memberCount + (data.joined && !community.joined ? 1 : !data.joined && community.joined ? -1 : 0)) } : item));
    } catch (membershipError) { setItems((current) => current.map((item) => item.id === community.id ? community : item)); setError(membershipError instanceof Error ? membershipError.message : "Üyelik değiştirilemedi."); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/communities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const data = await response.json() as { community?: Community; error?: string };
      if (!response.ok || !data.community) throw new Error(data.error ?? "Topluluk kurulamadı.");
      setItems((current) => [data.community!, ...current]); setCreateOpen(false); void openCommunity(data.community);
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Topluluk kurulamadı."); }
    finally { setBusy(false); }
  }

  async function createPost() {
    if (!selected || !draft.trim()) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/community-posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, content: draft.trim() }) });
      const data = await response.json() as { post?: { id: string; content: string; time: string; pinned: boolean; own: boolean }; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderi paylaşılamadı.");
      setPosts((current) => [{ ...data.post!, authorName: "Sen" }, ...current]); setDraft("");
    } catch (postError) { setError(postError instanceof Error ? postError.message : "Gönderi paylaşılamadı."); }
    finally { setBusy(false); }
  }

  async function togglePin(postId: string) {
    if (!selected) return;
    const response = await fetch("/api/community-posts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, postId }) });
    const data = await response.json() as { active?: boolean; error?: string };
    if (!response.ok || typeof data.active !== "boolean") { setError(data.error ?? "Gönderi sabitlenemedi."); return; }
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, pinned: data.active! } : post));
  }

  async function manageMember(targetId: string, action: "approve" | "role", role?: string) {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action, targetId, role }) });
      const data = await response.json() as { updated?: boolean; error?: string };
      if (!response.ok || !data.updated) throw new Error(data.error ?? "Üye rolü güncellenemedi.");
      await openCommunity(selected);
    } catch (memberError) { setError(memberError instanceof Error ? memberError.message : "Üye rolü güncellenemedi."); }
    finally { setBusy(false); }
  }

  async function archiveCommunity() {
    if (!selected) return;
    const action = selected.status === "archived" ? "restore" : "archive";
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action }) });
      const data = await response.json() as { status?: string; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error ?? "Topluluk durumu değiştirilemedi.");
      setSelected((current) => current ? { ...current, status: data.status! } : current);
      if (data.status === "archived") setItems((current) => current.filter((item) => item.id !== selected.id));
    } catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : "Topluluk durumu değiştirilemedi."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-view feature-workspace">
    <FeatureHeader screenId="communities" section="Topluluklar" eyebrow="TOPLULUKLAR" title="Kampüs çevreni birlikte kur" description="Ders, kampüs ve ilgi alanlarında kalıcı topluluklara katıl veya kendi çevreni oluştur." primaryAction={{ id: "community.create", label: "Topluluk kur", icon: <Plus size={22}/>, onPress: () => setCreateOpen(true) }}/>
    <section className="feature-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topluluk adı, ders veya kategori ara"/><button type="button" onClick={() => setMine((value) => !value)} className={mine ? "active" : ""}>{mine ? "Tümünü göster" : "Üyeliklerim"}</button></section>
    {error && <p className="feature-error" role="alert">{error}</p>}
    {state === "loading" ? <EmptyState icon="…" title="Topluluklar hazırlanıyor" text="Kampüsteki çevreler getiriliyor."/> : items.length === 0 ? <EmptyState icon="◎" title="Henüz eşleşen topluluk yok" text="Aramayı değiştir veya ilk topluluğu sen kur."/> : <div className="feature-community-grid">{items.map((community) => <article className="feature-community-card" key={community.id}><button className="feature-community-main" type="button" onClick={() => void openCommunity(community)}><span className={`feature-community-mark tone-${community.category}`}>{community.courseCode ?? initials(community.name)}</span><div><small>{community.category} {community.courseCode && `· ${community.courseCode}`}</small><h2>{community.name}</h2><p>{community.description}</p><footer><span>{community.memberCount} üye</span><span>{community.postCount} gönderi</span>{community.joinPolicy === "request" && <span>Onaylı katılım</span>}</footer></div></button><button className={community.joined ? "joined" : community.pending ? "pending" : ""} type="button" onClick={() => void membership(community)}>{community.joined ? "Katıldın" : community.pending ? "İstek gönderildi" : "Katıl"}</button></article>)}</div>}
    {createOpen && <div className="feature-overlay"><section className="feature-dialog" role="dialog" aria-modal="true" aria-labelledby="community-create-title"><header><div><span>YENİ ÇEVRE</span><h2 id="community-create-title">Topluluk kur</h2></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header><form onSubmit={create}>
      <label>Topluluk adı<input name="name" required minLength={3} maxLength={80}/></label><label>Amaç ve kapsam<textarea name="description" required minLength={12} maxLength={500} rows={3}/></label>
      <div className="feature-field-row"><label>Kategori<select name="category" defaultValue="akademik"><option value="akademik">Akademik</option><option value="teknoloji">Teknoloji</option><option value="kampus">Kampüs</option><option value="kariyer">Kariyer</option><option value="ilgi">İlgi alanı</option></select></label><label>Katılım<select name="joinPolicy" defaultValue="open"><option value="open">Herkese açık</option><option value="request">İstekle katılım</option></select></label></div>
      <label>Ders bağlamı<select name="courseId" defaultValue=""><option value="">Genel topluluk</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label><label>Topluluk kuralları<textarea name="rules" maxLength={800} rows={3} placeholder="Saygılı ol, kaynak belirt, kişisel veri paylaşma…"/></label>
      <footer><button type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kuruluyor…" : "Topluluğu kur"}</button></footer>
    </form></section></div>}
    {selected && <div className="feature-overlay"><section className="feature-dialog feature-community-detail" role="dialog" aria-modal="true" aria-labelledby="community-detail-title"><header><div><span>{selected.category} {selected.courseCode && `· ${selected.courseCode}`}</span><h2 id="community-detail-title">{selected.name}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Pencereyi kapat"><X size={22} aria-hidden="true"/></button></header><p className="feature-detail-description">{selected.description}</p>{selected.rules && <aside className="feature-rules"><strong>Topluluk kuralları</strong><p>{selected.rules}</p></aside>}
      {selected.joined && <div className="feature-community-composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} placeholder="Topluluğunla bir şey paylaş…"/><button className="feature-primary" type="button" onClick={() => void createPost()} disabled={!draft.trim() || busy}>Paylaş</button></div>}
      <div className="feature-community-posts">{posts.length === 0 ? <EmptyState icon="✦" title="Henüz gönderi yok" text="İlk paylaşım topluluğun ritmini başlatır."/> : posts.map((post) => <article className={post.pinned ? "pinned" : ""} key={post.id}><div><strong>{post.authorName ?? "Kampira öğrencisi"}</strong><small>{post.time} önce</small>{post.pinned && <span>Sabitlendi</span>}</div><p>{post.content}</p>{selected.canManage && <button type="button" onClick={() => void togglePin(post.id)}>{post.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}</button>}</article>)}</div>
      {members.length > 0 && <details><summary>Üyeler ve roller ({members.length})</summary><div className="feature-member-list">{members.map((member) => <span key={String(member.public_id)}><b>{String(member.display_name)}</b><small>@{String(member.handle)} · {String(member.role)} · {String(member.status)}</small>{String(member.role) !== "founder" && selected.canManage && <div>{String(member.status) === "pending" && <button type="button" onClick={() => void manageMember(String(member.public_id), "approve")}>Onayla</button>}<select aria-label={`${String(member.display_name)} rolü`} value={String(member.role)} onChange={(event) => void manageMember(String(member.public_id), "role", event.target.value)} disabled={busy || String(member.status) !== "active"}><option value="member">Üye</option><option value="moderator">Moderatör</option><option value="admin">Yönetici</option></select></div>}</span>)}</div></details>}
      <footer>{selected.role !== "founder" && <button type="button" onClick={() => void membership(selected)}>{selected.joined ? "Topluluktan ayrıl" : selected.pending ? "İsteği geri çek" : "Topluluğa katıl"}</button>}{['founder','admin'].includes(selected.role ?? '') && <button className="feature-danger" type="button" onClick={() => void archiveCommunity()} disabled={busy}>{selected.status === "archived" ? "Topluluğu geri aç" : "Topluluğu arşivle"}</button>}</footer>
    </section></div>}
  </div>;
}

export function NotificationsWorkspace() {
  const fetch = useAuthenticatedFetch();
  const [items, setItems] = useState<Notice[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({ interactions: true, courses: true, communities: true });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.notifications) throw new Error(data.error ?? "Bildirimler getirilemedi.");
      if (!controller.signal.aborted) { setItems(data.notifications); if (data.preferences) setPreferences(data.preferences); setState("ready"); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Bildirimler getirilemedi."); setState("error"); } });
    return () => controller.abort();
  }, [revision, fetch]);
  async function update(action: "read" | "read-all" | "preferences", id?: string, next?: typeof preferences) {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id, ...next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bildirim güncellenemedi.");
      if (action === "preferences" && next) setPreferences(next);
      else setItems((current) => current.map((item) => action === "read-all" || item.id === id ? { ...item, read: true } : item));
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bildirim güncellenemedi."); return false; }
    finally { setBusy(false); }
  }
  const visible = items.filter((item) => (tab === "all" || item.kind === tab) && (!unreadOnly || !item.read) && matchesSearch(query, item.title, item.body));
  const unread = items.filter((item) => !item.read).length;
  return <div className="workspace-view feature-workspace"><WorkspaceHeader screenId="notifications" section="Bildirimler" eyebrow="HESABINDAKİ GELİŞMELER" title="Bildirimler" description={unread ? `${unread} okunmamış bildirimin var. İlgili paylaşımı aç veya daha sonra dönmek için burada tut.` : "Gönderilerin, notların ve topluluklarındaki gelişmeler bir arada."} primaryAction={{ id: "notifications.read-all", label: "Tümünü okundu yap", icon: <Check size={22}/>, disabled: !unread || busy, onPress: () => update("read-all") }} secondaryActions={[{ id: "notifications.refresh", label: "İçeriği yenile", busy: state === "loading" || busy, onPress: () => { setState("loading"); setError(""); setRevision((value) => value + 1); } }]}/>
    <section className="feature-preferences"><button className="feature-preferences-toggle" type="button" aria-expanded={showPreferences} onClick={() => setShowPreferences((value) => !value)}>Bildirim tercihleri <span>{showPreferences ? "−" : "+"}</span></button>{showPreferences && <><p>Hangi gelişmelerin bildirim listene düşeceğini seç.</p>{([['interactions','Etkileşimler'],['courses','Ders çevreleri'],['communities','Topluluklar']] as const).map(([key,label]) => <label key={key}><span><strong>{label}</strong><small>{key === 'interactions' ? 'Beğeni, yorum ve takipler' : key === 'courses' ? 'Seçtiğin derslerdeki hareketler' : 'Üye olduğun topluluklar'}</small></span><input type="checkbox" disabled={busy} checked={preferences[key]} onChange={(event) => void update("preferences", undefined, { ...preferences, [key]: event.target.checked })}/></label>)}<PushNotifications/></>}</section>
    <WorkspaceSearch value={query} onChange={setQuery} placeholder="Bildirimlerde ara" resultCount={state === "loading" ? undefined : visible.length} onReset={query || unreadOnly || tab !== "all" ? () => { setQuery(""); setUnreadOnly(false); setTab("all"); } : undefined}><label><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)}/>Sadece okunmamışlar</label></WorkspaceSearch>
    <div className="workspace-filter-pills" role="group" aria-label="Bildirim türü">{([['all','Tümü'],['interaction','Etkileşimler'],['course','Dersler'],['community','Topluluklar']] as const).map(([value,label]) => <button type="button" aria-pressed={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{label}</button>)}</div>
    {error && <p className="feature-error" role="alert">{error}</p>}
    {state === "loading" ? <WorkspaceEmpty title="Bildirimler yükleniyor…" description="Son gelişmeler hazırlanıyor."/> : state === "error" ? <WorkspaceEmpty error title="Bildirimler açılamadı" description="Yenile düğmesiyle tekrar deneyebilirsin."/> : visible.length === 0 ? <WorkspaceEmpty title={items.length ? "Bu filtrede bildirim yok" : "Her şey güncel"} description={items.length ? "Aramanı veya bildirim türünü değiştirebilirsin." : "Yeni etkileşimler ve kampüs gelişmeleri burada görünecek."}/> : <div className="feature-notice-list">{visible.map((item) => {
      const href = notificationHref(item.entityType, item.entityId, item.actorId);
      return <article className={item.read ? "" : "unread"} key={item.id}><span className="feature-avatar">{item.kind === "community" ? <UsersThree size={22} aria-hidden="true"/> : item.kind === "course" ? <FileText size={22} aria-hidden="true"/> : <Heart size={22} aria-hidden="true"/>}</span><div>{href ? <AppLink className="notice-open" href={href} onNavigate={() => { if (!item.read) void update("read", item.id); }}><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}<small>{item.time} önce · {item.entityType === "post" || item.entityType === "user" ? "İçeriği aç" : "Bölüme git"} <ArrowUpRight size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }}/></small></AppLink> : <><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}<small>{item.time} önce</small></>}</div><div className="notice-row-actions">{!item.read && <button type="button" disabled={busy} onClick={() => void update("read", item.id)} aria-label={`${item.title}: okundu işaretle`}><Check size={20} aria-hidden="true"/></button>}</div></article>;
    })}</div>}

  </div>;
}

type SafetyData = { reports: Array<{ id: string; entityType: string; reason: string; status: string; decision?: string; time: string }>; blocked: Array<{ public_id: string; display_name: string; handle: string }>; muted: Array<{ public_id: string; display_name: string; handle: string }>; moderator: boolean };
const safetyReasonNames: Record<string,string> = { spam: "Spam", harassment: "Taciz veya zorbalık", privacy: "Kişisel bilgi ihlali", copyright: "Telif hakkı", misinformation: "Yanıltıcı bilgi", other: "Diğer" };
const safetyEntityNames: Record<string,string> = { post: "Gönderi", comment: "Yorum", note: "Not", user: "Hesap", community: "Topluluk", meetup: "Buluşma isteği", message: "Mesaj", listing: "İlan" };
export function SafetyWorkspace() {
  const fetch = useAuthenticatedFetch();
  const [data, setData] = useState<SafetyData | null>(null);
  const [tab, setTab] = useState<"reports" | "blocked" | "muted">("reports");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busyId, setBusyId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/safety", { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Güvenlik merkezi getirilemedi."); if (!controller.signal.aborted) setData(body); }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Güvenlik merkezi getirilemedi."); });
    return () => controller.abort();
  }, [revision, fetch]);
  async function removeRestriction(userId: string) {
    if (busyId || tab === "reports") return;
    const list = tab;
    setBusyId(userId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: list === "blocked" ? "block" : "mute", targetId: userId, active: false }) });
      const body = await response.json();
      if (!response.ok || body.active !== false) throw new Error(body.error ?? "Kısıtlama kaldırılamadı. Listeyi yenileyip tekrar dene.");
      setData((current) => current ? { ...current, [list]: current[list].filter((user) => user.public_id !== userId) } : current);
      setNotice(list === "blocked" ? "Engel kaldırıldı. Bu hesapla tekrar iletişim kurabilirsin." : "Sessize alma kaldırıldı. Paylaşımlar akışında yeniden görünebilir.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kısıtlama kaldırılamadı."); }
    finally { setBusyId(""); }
  }
  const accounts = data && tab !== "reports" ? data[tab].filter((user) => matchesSearch(query, user.display_name, user.handle)) : [];
  const reports = data?.reports.filter((report) => matchesSearch(query, safetyReasonNames[report.reason] ?? report.reason, safetyEntityNames[report.entityType] ?? report.entityType, report.decision)) ?? [];
  return <div className="workspace-view feature-workspace"><WorkspaceHeader screenId="safety" section="Güvenlik" eyebrow="HESAP KONTROLLERİN" title="Güvenlik" description="Şikâyetlerini takip et; engellediğin veya sessize aldığın hesapları buradan yönet." secondaryActions={[{ id: "safety.refresh", label: "İçeriği yenile", busy: Boolean(busyId), onPress: () => { setError(""); setRevision((value) => value + 1); } }]}/>
    <div className="workspace-filter-pills workspace-safety-tabs" role="group" aria-label="Güvenlik bölümü">{([['reports','Şikâyetlerin'],['blocked','Engellenenler'],['muted','Sessize alınanlar']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={tab === value} className={tab === value ? "active" : ""} onClick={() => { setTab(value); setQuery(""); }}>{label} <span>{data?.[value].length ?? "—"}</span></button>)}</div>
    <WorkspaceSearch value={query} onChange={setQuery} placeholder={tab === "reports" ? "Şikâyetlerinde ara" : "Hesap adı veya kullanıcı adı ara"} resultCount={data ? tab === "reports" ? reports.length : accounts.length : undefined}/>
    {error && <p className="feature-error" role="alert">{error}</p>}{notice && <p className="social-notice" role="status">{notice}</p>}
    {!data ? <WorkspaceEmpty title={error ? "Güvenlik merkezi açılamadı" : "Kayıtların yükleniyor…"} description={error ? "Yenile düğmesiyle tekrar deneyebilirsin." : "Hesabına ait güvenlik kayıtları hazırlanıyor."} error={Boolean(error)}/> : tab === "reports" ? reports.length ? <div className="safety-columns"><section><h2>Şikâyetlerin</h2>{reports.map((report) => <article key={report.id}><span className={`feature-status status-${report.status}`}>{report.status === 'open' ? 'İncelemede' : report.status === 'appealed' ? 'İtirazda' : 'Sonuçlandı'}</span><strong>{safetyEntityNames[report.entityType] ?? "İçerik"} · {safetyReasonNames[report.reason] ?? "Diğer"}</strong><small>{report.time} önce</small>{report.decision && <p>{report.decision}</p>}</article>)}</section></div> : <WorkspaceEmpty title={query ? "Eşleşen şikâyet yok" : "Henüz bir şikâyetin yok"} description="Bir içerikte veya profilde Şikâyet et seçeneğini kullandığında sonucu burada takip edebilirsin."/> : accounts.length ? <div className="safety-columns"><section><h2>{tab === "blocked" ? "Engellediğin hesaplar" : "Sessize aldığın hesaplar"}</h2>{accounts.map((user) => <article className="safety-account-row" key={user.public_id}><div><strong>{user.display_name}</strong><small>@{user.handle}</small></div><button type="button" disabled={Boolean(busyId)} onClick={() => void removeRestriction(user.public_id)}>{busyId === user.public_id ? "Kaldırılıyor…" : tab === "blocked" ? "Engeli kaldır" : "Sesi aç"}</button></article>)}</section></div> : <WorkspaceEmpty title={query ? "Eşleşen hesap yok" : tab === "blocked" ? "Engellediğin hesap yok" : "Sessize aldığın hesap yok"} description={tab === "blocked" ? "Engellediğin hesaplarla birbirinizin profilini ve paylaşımlarını göremezsiniz." : "Sessize almak, hesabı engellemeden paylaşımlarını akışından kaldırır."}/>}
    <section className="safety-principles"><article><span>01</span><h2>Şikâyet ve kanıt</h2><p>Bildirdiğin içerik inceleme için kayda alınır.</p></article><article><span>02</span><h2>İki yönlü engelleme</h2><p>Engellediğin hesapla birbirinizin profilini ve paylaşımlarını göremezsiniz.</p></article><article><span>03</span><h2>Akışını düzenle</h2><p>Sessize alma ve engelleme tercihlerini istediğinde kaldırabilirsin.</p></article></section>
  </div>;
}

export { ProfileSafetyMenu } from "./profile-safety-menu";
