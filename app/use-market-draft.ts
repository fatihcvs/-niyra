"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { copyMarketDraft, createMarketDraftStore, emptyMarketDraft, hasMarketDraft, type DurableMarketDraft, type MarketDraftFailure, type MarketDraftSnapshot, type MarketDraftWrite } from "../lib/market-draft-store";

type DraftView = { owner: string | null; state: "loading" | "ready" | "saving" | "saved" | "error" | "conflict" | "inactive"; ready: boolean; message: string; conflict: DurableMarketDraft | null };
type Binding = { store: ReturnType<typeof createMarketDraftStore>; owner: string; revision: number; muted: boolean; loaded: boolean; conflicted: boolean; invalidated: boolean; tail: Promise<unknown>; sequence: number };
const closingWrites = new Map<string, Promise<unknown>>();
const initial = (owner: string | null): DraftView => ({ owner, state: owner ? "loading" : "inactive", ready: false, message: owner ? "Kaydedilmiş taslaklar kontrol ediliyor…" : "Taslakları kullanmak için giriş yapmalısın.", conflict: null });
const savedView = (owner: string, record: MarketDraftSnapshot): DraftView => ({ owner, state: hasMarketDraft(record) ? "saved" : "ready", ready: true, conflict: null, message: hasMarketDraft(record) ? "Taslak bu cihazda kaydedildi." : "Taslağın bu cihazda saklanır." });
const storageError = (result: MarketDraftFailure) => result.status === "unavailable" && result.reason === "quota"
  ? "Cihazda taslak için yeterli alan yok. Alan açıp yeniden dene; yeni gönderim başlamadı."
  : "Taslak bu cihaza kaydedilemedi. Depolama iznini kontrol edip yeniden dene; yeni gönderim başlamadı.";
function sameSnapshot(a: MarketDraftSnapshot | null, b: MarketDraftSnapshot) {
  return Boolean(a && a.kind === b.kind && JSON.stringify(a.forms) === JSON.stringify(b.forms) && JSON.stringify(a.contacts) === JSON.stringify(b.contacts)
    && JSON.stringify(a.recovery && { ...a.recovery, images: undefined }) === JSON.stringify(b.recovery && { ...b.recovery, images: undefined })
    && a.images.length === b.images.length && a.images.every((file, index) => file === b.images[index])
    && (a.recovery?.images.length ?? 0) === (b.recovery?.images.length ?? 0) && (a.recovery?.images.every((file, index) => file === b.recovery?.images[index]) ?? true));
}

export function useMarketDraft({ ownerId, snapshot, paused, onRestore, onInvalidate }: {
  ownerId: string | null; snapshot: MarketDraftSnapshot; paused: boolean; onRestore: (snapshot: MarketDraftSnapshot) => void; onInvalidate: () => void;
}) {
  const [view, setView] = useState<DraftView>(() => initial(ownerId));
  const [lastSaved, setLastSaved] = useState<MarketDraftSnapshot | null>(null);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const binding = useRef<Binding | null>(null), generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), scheduled = useRef<MarketDraftSnapshot | null>(null);
  const latest = useRef({ snapshot, onRestore, onInvalidate });
  useLayoutEffect(() => { latest.current = { snapshot, onRestore, onInvalidate }; });
  function cancelTimer() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; scheduled.current = null; }

  function enqueue(current: Binding, next: MarketDraftSnapshot, resolvedKeys: readonly string[], explicit: boolean): Promise<MarketDraftWrite> {
    const epoch = generation.current, sequence = ++current.sequence;
    const copied = copyMarketDraft(next);
    const isVisible = () => binding.current === current && generation.current === epoch && !current.invalidated;
    if (isVisible()) setView((value) => ({ ...value, state: "saving", message: "Taslak kaydediliyor…" }));
    const task = current.tail.catch(() => {}).then(async (): Promise<MarketDraftWrite> => {
      if (current.invalidated || current.conflicted) return { status: "inactive" };
      const result = await current.store.save(copied, current.revision, resolvedKeys);
      if (result.status === "saved") current.revision = result.record.revision;
      else if (result.status === "conflict") current.conflicted = true;
      if (!isVisible()) return { status: "stale" };
      if (result.status === "saved") {
        setLastSaved(result.record);
        // A slow autosave may finish after another keystroke. Only apply its decoded
        // files/fields if that snapshot is still current; explicit writes lock the form.
        if (sequence === current.sequence && (explicit || sameSnapshot(copied, latest.current.snapshot))) latest.current.onRestore(result.record);
        setView(savedView(current.owner, result.record));
      } else if (result.status === "conflict") setView({ owner: current.owner, state: "conflict", ready: false, conflict: result.record, message: "Taslak başka bir sekmede değişti. Kayıtlı taslağı açmadan gönderim başlamaz." });
      else if (result.status === "unavailable") setView((value) => ({ ...value, state: "error", ready: false, message: storageError(result) }));
      return result;
    });
    current.tail = task;
    return task;
  }

  useEffect(() => {
    const lifecycle = generation;
    const epoch = ++lifecycle.current; let active = true;
    if (!ownerId) return;
    const current: Binding = { store: null as unknown as ReturnType<typeof createMarketDraftStore>, owner: ownerId, revision: 0, muted: true, loaded: false, conflicted: false, invalidated: false, tail: Promise.resolve(), sequence: 0 };
    current.store = createMarketDraftStore({ onInvalidate: () => {
      current.invalidated = true;
      if (active && !current.muted) { generation.current++; cancelTimer(); latest.current.onRestore(emptyMarketDraft()); setLastSaved(null); setLoadedOwner(null); setView(initial(null)); latest.current.onInvalidate(); }
    } });
    binding.current = current;
    current.store.setOwner({ publicId: ownerId, confirmed: true }); current.invalidated = false; current.muted = false;
    void (async () => {
      // Navigation can remount this workspace before its last debounced edit commits.
      await closingWrites.get(ownerId);
      if (!active || epoch !== generation.current) return;
      const result = await current.store.load();
      if (!active || epoch !== generation.current) return;
      if (result.status === "loaded") {
        current.revision = result.record?.revision ?? 0; current.loaded = true; setLoadedOwner(ownerId);
        const record = result.record ?? emptyMarketDraft(); setLastSaved(record); latest.current.onRestore(record);
        setView({ ...savedView(ownerId, record), ...(result.discarded === "expired" ? { message: "Süresi dolmuş taslak temizlendi." } : {}) });
      } else if (result.status === "unavailable") setView({ ...initial(ownerId), state: "error", message: storageError(result) });
      else setView(initial(null));
    })();
    return () => {
      active = false; lifecycle.current++; current.muted = true;
      const finalEdit = scheduled.current; cancelTimer();
      if (binding.current === current) binding.current = null;
      // Keep this already-confirmed owner context alive only until its queued writes
      // settle. Logout still invalidates it through the shared epoch/coordinator.
      if (finalEdit && current.loaded && !current.invalidated && !current.conflicted) void enqueue(current, finalEdit, [], false);
      const closing = current.tail.catch(() => {}).finally(() => { current.store.dispose(); if (closingWrites.get(ownerId) === closing) closingWrites.delete(ownerId); });
      closingWrites.set(ownerId, closing);
    };
  }, [ownerId]);

  async function persist(next: MarketDraftSnapshot, resolvedKeys: readonly string[] = []): Promise<MarketDraftWrite> {
    cancelTimer(); const current = binding.current;
    if (!current || current.owner !== ownerId || !current.loaded || current.conflicted || current.invalidated) return { status: "inactive" };
    return enqueue(current, next, resolvedKeys, true);
  }
  const { kind, forms, images, recovery, contacts } = snapshot;
  const canEdit = Boolean(ownerId && loadedOwner === ownerId && view.owner === ownerId && !["conflict", "inactive", "loading"].includes(view.state));
  const active = canEdit && !paused;
  useEffect(() => {
    const next = { kind, forms, images, recovery, contacts };
    if (!active || sameSnapshot(lastSaved, next)) return;
    cancelTimer(); scheduled.current = copyMarketDraft(next);
    const flush = () => {
      const pending = scheduled.current, current = binding.current; cancelTimer();
      if (pending && current?.loaded && !current.invalidated && !current.conflicted) void enqueue(current, pending, [], false);
    };
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    timer.current = setTimeout(flush, 350);
    window.addEventListener("pagehide", flush); document.addEventListener("visibilitychange", hide);
    return () => { cancelTimer(); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hide); };
    // Status-only renders must not restart the debounce. Snapshot fields change on edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, kind, forms, images, recovery, contacts]);

  async function reload() {
    const current = binding.current, epoch = generation.current; if (!current || current.invalidated) return;
    cancelTimer(); await current.tail;
    if (epoch !== generation.current) return;
    const result = await current.store.load();
    if (epoch !== generation.current) return;
    if (result.status === "loaded") {
      current.revision = result.record?.revision ?? 0; current.loaded = true; current.conflicted = false; setLoadedOwner(current.owner);
      const record = result.record ?? emptyMarketDraft(); setLastSaved(record); latest.current.onRestore(record); setView(savedView(current.owner, record));
    } else if (result.status === "unavailable") setView((value) => ({ ...value, state: "error", message: storageError(result) }));
  }
  async function retry() {
    const current = binding.current;
    if (!current || current.owner !== ownerId) return;
    if (!current.loaded) await reload(); else await persist(latest.current.snapshot);
  }
  const displayed = view.owner === ownerId ? view : initial(ownerId);
  const dirty = displayed.ready && !sameSnapshot(lastSaved, snapshot);
  return { view: dirty && ["ready", "saved"].includes(displayed.state) ? { ...displayed, state: "saving" as const, message: "Taslak kaydediliyor…" } : displayed, canEdit, blocked: view.owner !== ownerId || !view.ready, persist, retry, restoreConflict: reload };
}
