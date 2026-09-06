"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";

export class MarketRequestError extends Error {
  readonly uncertain: boolean;
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "MarketRequestError";
    this.uncertain = status === undefined || status < 400 || status >= 500;
  }
}

/** Timeout covers response bytes too. An unknown write outcome is never presented as a confirmed rejection. */
export function useMarketRequests() {
  const fetch = useAuthenticatedFetch();
  const lifecycle = useRef({ mounted: false, generation: 0, controllers: new Set<AbortController>() });
  useLayoutEffect(() => {
    const state = lifecycle.current; state.mounted = true;
    return () => { state.mounted = false; state.generation++; for (const controller of state.controllers) controller.abort(); state.controllers.clear(); };
  }, [fetch]);
  const capture = useCallback(() => {
    const state = lifecycle.current, generation = state.generation, owner = fetch.beginResponseCheck();
    return { isCurrent: () => state.mounted && state.generation === generation && owner.isCurrent() };
  }, [fetch]);
  const json = useCallback(async <T,>(url: string, init: RequestInit = {}, fallback = "Pazar işlemi tamamlanamadı."): Promise<T> => {
    const owner = capture(), controller = new AbortController(), external = init.signal;
    const check = fetch.beginResponseCheck(controller.signal);
    const cancel = () => controller.abort();
    external?.addEventListener("abort", cancel, { once: true });
    lifecycle.current.controllers.add(controller);
    let release = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      const abort = () => reject(new DOMException("Pazar isteği iptal edildi.", "AbortError"));
      controller.signal.addEventListener("abort", abort, { once: true });
      release = () => controller.signal.removeEventListener("abort", abort);
      if (external?.aborted || !owner.isCurrent()) controller.abort();
    });
    const timeout = window.setTimeout(cancel, 20_000);
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!owner.isCurrent() || !check.isCurrent()) throw new DOMException("Oturum değişti.", "AbortError");
        let result: unknown;
        try { result = await response.json(); }
        catch { throw new MarketRequestError("Sunucunun yanıtı okunamadı. Son durumu kontrol et.", response.ok ? undefined : response.status); }
        if (!owner.isCurrent() || !check.isCurrent()) throw new DOMException("Oturum değişti.", "AbortError");
        if (!response.ok) throw new MarketRequestError(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback, response.status);
        if (!result || typeof result !== "object" || Array.isArray(result)) throw new MarketRequestError("İşlem sonucu doğrulanamadı. Son durumu kontrol et.");
        return result as T;
      })()]);
    } catch (cause) {
      if (controller.signal.aborted && !external?.aborted && owner.isCurrent()) throw new MarketRequestError("Yanıt zamanında alınamadı. Sonuç doğrulanamadı; taslağın korunuyor.");
      throw cause;
    } finally {
      window.clearTimeout(timeout); release(); external?.removeEventListener("abort", cancel); lifecycle.current.controllers.delete(controller);
    }
  }, [fetch, capture]);
  return { json, capture };
}
