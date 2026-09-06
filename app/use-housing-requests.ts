"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";

/** Bounded owner-scoped reads and writes. Cancelling the UI cannot undo a server commit. */
export function useHousingRequests() {
  const fetch = useAuthenticatedFetch();
  const lifecycle = useRef({ mounted: false, generation: 0, controllers: new Set<AbortController>() });
  useLayoutEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    return () => { state.mounted = false; state.generation++; for (const controller of state.controllers) controller.abort(); state.controllers.clear(); };
  }, [fetch]);
  const capture = useCallback(() => {
    const state = lifecycle.current, generation = state.generation, owner = fetch.beginResponseCheck();
    return { isCurrent: () => state.mounted && state.generation === generation && owner.isCurrent() };
  }, [fetch]);
  const json = useCallback(async <T,>(url: string, init: RequestInit = {}, fallback = "Konaklama işlemi tamamlanamadı."): Promise<T> => {
    const owner = capture(), controller = new AbortController(), external = init.signal;
    const check = fetch.beginResponseCheck(controller.signal);
    const cancel = () => controller.abort();
    external?.addEventListener("abort", cancel, { once: true });
    lifecycle.current.controllers.add(controller);
    let releaseAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      const abort = () => reject(new DOMException("İstek iptal edildi.", "AbortError"));
      controller.signal.addEventListener("abort", abort, { once: true });
      releaseAbort = () => controller.signal.removeEventListener("abort", abort);
      if (external?.aborted || !owner.isCurrent()) controller.abort();
    });
    const timeout = window.setTimeout(cancel, 20000);
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!owner.isCurrent() || !check.isCurrent()) throw new DOMException("Oturum değişti.", "AbortError");
        const result = await response.json() as T & { error?: string };
        if (!owner.isCurrent() || !check.isCurrent()) throw new DOMException("Oturum değişti.", "AbortError");
        if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : fallback);
        return result;
      })()]);
    } catch (cause) {
      if (controller.signal.aborted && !external?.aborted && owner.isCurrent()) throw new Error("Yanıt zamanında alınamadı. Sonuç doğrulanamadı; güncel durumu kontrol edip yeniden dene.");
      throw cause;
    } finally {
      window.clearTimeout(timeout); releaseAbort(); external?.removeEventListener("abort", cancel); lifecycle.current.controllers.delete(controller);
    }
  }, [fetch, capture]);
  return { json, capture };
}
