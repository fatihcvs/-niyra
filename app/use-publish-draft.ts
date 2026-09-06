"use client";

import { useEffect, useRef, useState } from "react";
import { createPublishDraftStore, type DurablePublishDraft, type DraftStoreFailure, type DraftPrepareResult, type DraftClearResult } from "../lib/publish-draft-store";
import { copyPublishDraft, publishDraftMedia, type PublishAttemptSnapshot, type PublishDraft } from "../lib/publish-attempt";

export type PublishDraftView = {
  owner: string | null;
  phase: "loading" | "recovery" | "ready" | "saving" | "saved" | "error" | "inactive";
  candidate: DurablePublishDraft | null;
  ready: boolean;
  message: string;
};
const initial = (owner: string | null): PublishDraftView => ({ owner, phase: owner ? "loading" : "inactive", candidate: null, ready: false, message: "" });
const storageMessage = (result: DraftStoreFailure) => result.status === "unavailable" && result.reason === "quota"
  ? "Cihazda taslak için yeterli alan yok. Depolama alanı açıp yeniden dene; gönderim başlamadı."
  : "Taslak bu cihaza kaydedilemiyor. Tarayıcı depolama iznini kontrol edip yeniden dene; gönderim başlamadı.";

export function usePublishDraft({ ownerId, draft, paused, onRestore, onInvalidate }: {
  ownerId: string | null;
  draft: PublishDraft;
  paused: boolean;
  onRestore: (record: DurablePublishDraft) => void;
  onInvalidate: () => void;
}) {
  const [state, setState] = useState<PublishDraftView>(() => initial(ownerId));
  const [savedDraft, setSavedDraft] = useState<PublishDraft | null>(null);
  const pendingClearKey = useRef<string | null>(null);
  const binding = useRef<{ store: ReturnType<typeof createPublishDraftStore>; owner: string | null; muted: boolean } | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const latest = useRef({ draft, onRestore, onInvalidate });
  const stateRef = useRef(state);
  useEffect(() => { latest.current = { draft, onRestore, onInvalidate }; stateRef.current = state; });

  useEffect(() => {
    const lifecycle = generation;
    const epoch = ++lifecycle.current;
    let active = true;
    const current = { store: null as unknown as ReturnType<typeof createPublishDraftStore>, owner: ownerId, muted: true };
    current.store = createPublishDraftStore({ onInvalidate: () => {
      if (!active || current.muted) return;
      generation.current++;
      setState(initial(null));
      latest.current.onInvalidate();
    } });
    binding.current = current;
    current.store.setOwner(ownerId ? { publicId: ownerId, confirmed: true } : null);
    current.muted = false;
    busy.current = false;
    pendingClearKey.current = null;
    void current.store.load().then((result) => {
      if (!active || epoch !== generation.current) return;
      if (result.status === "loaded") {
        const candidate = result.record && (result.record.content.trim() || result.record.media || result.record.immutableAttempt) ? result.record : null;
        setState({ owner: ownerId, phase: candidate ? "recovery" : "ready", candidate, ready: !candidate, message: "" });
      } else if (result.status === "unavailable") setState({ ...initial(ownerId), phase: "error", message: storageMessage(result) });
      else setState(initial(null));
    });
    return () => { active = false; lifecycle.current++; current.muted = true; current.store.dispose(); if (binding.current === current) binding.current = null; };
  }, [ownerId]);

  const matchesSaved = savedDraft?.content === draft.content && savedDraft.audience === draft.audience && savedDraft.courseId === draft.courseId
    && publishDraftMedia(savedDraft).length === publishDraftMedia(draft).length && publishDraftMedia(savedDraft).every((file, index) => file === publishDraftMedia(draft)[index]);
  const ownerView = state.owner === ownerId ? state : initial(ownerId);
  const view: PublishDraftView = ownerView.phase === "saved" && !matchesSaved ? { ...ownerView, phase: "saving" } : ownerView;
  const { content, audience, courseId, media, mediaFiles } = draft;
  const canSave = Boolean(ownerId && view.ready && !view.candidate && !paused);
  useEffect(() => {
    if (!canSave || busy.current || !binding.current) return;
    const current = binding.current;
    const epoch = generation.current;
    let active = true;
    const snapshot = copyPublishDraft({ content, audience, courseId, media, ...(mediaFiles !== undefined ? { mediaFiles } : {}) });
    const task = !content && !publishDraftMedia(snapshot).length && !courseId ? current.store.clearCurrent() : current.store.scheduleSave(snapshot);
    void task.then((result) => {
      if (!active || epoch !== generation.current) return;
      if (result.status === "saved") { setSavedDraft(snapshot); setState({ owner: ownerId, phase: "saved", candidate: null, ready: true, message: "" }); }
      else if (result.status === "cleared") { setSavedDraft(null); setState({ owner: ownerId, phase: "ready", candidate: null, ready: true, message: "" }); }
      else if (result.status === "recovery-required") setState({ owner: ownerId, phase: "recovery", candidate: result.record, ready: false, message: "" });
      else if (result.status === "unavailable") setState({ owner: ownerId, phase: "error", candidate: null, ready: true, message: storageMessage(result) });
    });
    return () => { active = false; };
  }, [canSave, content, audience, courseId, media, mediaFiles, ownerId]);

  async function retry() {
    const current = binding.current;
    if (!current || current.owner !== ownerId || !ownerId || busy.current) return;
    const epoch = generation.current;
    if (pendingClearKey.current) { await clearAttempt(pendingClearKey.current); return; }
    if (!stateRef.current.ready) {
      const result = await current.store.load();
      if (epoch !== generation.current) return;
      if (result.status === "loaded") setState({ owner: ownerId, phase: result.record ? "recovery" : "ready", candidate: result.record, ready: !result.record, message: "" });
      else if (result.status === "unavailable") setState({ ...initial(ownerId), phase: "error", message: storageMessage(result) });
      return;
    }
    const snapshot = copyPublishDraft(latest.current.draft);
    const result = await current.store.saveNow(snapshot);
    if (epoch !== generation.current) return;
    if (result.status === "saved") { setSavedDraft(snapshot); setState({ owner: ownerId, phase: "saved", candidate: null, ready: true, message: "" }); }
    else if (result.status === "unavailable") setState((value) => ({ ...value, phase: "error", message: storageMessage(result) }));
    else if (result.status === "recovery-required") setState({ owner: ownerId, phase: "recovery", candidate: result.record, ready: false, message: "" });
  }
  function restore() {
    if (view.candidate?.owner !== ownerId || !ownerId || busy.current) return;
    onRestore(view.candidate);
    setSavedDraft(view.candidate);
    setState({ owner: ownerId, phase: "saved", candidate: null, ready: true, message: "" });
  }
  async function discard() {
    const current = binding.current;
    if (!current || current.owner !== ownerId || !ownerId || busy.current) return;
    busy.current = true;
    const epoch = generation.current;
    const result = await current.store.clearCurrent();
    if (epoch !== generation.current) return;
    busy.current = false;
    if (result.status === "cleared") setState({ owner: ownerId, phase: "ready", candidate: null, ready: true, message: "" });
    else if (result.status === "unavailable") setState((value) => ({ ...value, phase: "error", message: "Kaydedilmiş taslak silinemedi. Depolama iznini kontrol edip tekrar silmeyi dene." }));
  }
  async function prepare(attempt: PublishAttemptSnapshot): Promise<DraftPrepareResult> {
    const current = binding.current;
    if (!ownerId || current?.owner !== ownerId || !view.ready || view.candidate) return { status: "inactive" };
    busy.current = true;
    const epoch = generation.current;
    const result = await current.store.preparePublish(attempt);
    if (epoch !== generation.current) return { status: "stale" };
    busy.current = false;
    if (result.status === "prepared") { setSavedDraft(result.attempt.draft); setState({ owner: ownerId, phase: "saved", candidate: null, ready: true, message: "" }); }
    else if (result.status === "recovery-required") setState({ owner: ownerId, phase: "recovery", candidate: result.record, ready: false, message: "" });
    else if (result.status === "unavailable") setState((value) => ({ ...value, phase: "error", message: storageMessage(result) }));
    return result;
  }
  async function clearAttempt(key: string): Promise<DraftClearResult> {
    const current = binding.current;
    if (!ownerId || current?.owner !== ownerId) return { status: "inactive" };
    busy.current = true;
    const epoch = generation.current;
    const result = await current.store.clearCurrent(key);
    if (epoch !== generation.current) return { status: "stale" };
    busy.current = false;
    if (result.status === "cleared") { pendingClearKey.current = null; setSavedDraft(null); setState({ owner: ownerId, phase: "ready", candidate: null, ready: true, message: "" }); }
    else if (result.status === "unavailable") { pendingClearKey.current = key; setState((value) => ({ ...value, phase: "error", ready: false, message: "Yayın sonucu alındı ancak cihazdaki taslak temizlenemedi. Depolama iznini kontrol edip yeniden dene." })); }
    return result;
  }
  function suspend() {
    generation.current++;
    const current = binding.current;
    if (current) { current.muted = true; current.store.setOwner(null); current.muted = false; current.owner = null; }
    busy.current = false;
    setState(initial(null));
  }
  async function logout() {
    generation.current++;
    const current = binding.current;
    if (!current) return { status: "inactive" } as DraftClearResult;
    current.muted = true;
    const result = await current.store.clearOnExplicitLogout();
    current.muted = false;
    current.owner = null;
    busy.current = false;
    setState(initial(null));
    return result;
  }
  return { view, blocked: !view.ready || Boolean(view.candidate), restore, discard, retry, prepare, clearAttempt, suspend, logout };
}
