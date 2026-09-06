"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";

/** Bound the response body as well as transport, and reject delivery after owner/target cancellation. */
export function useScopedRequests(scope?: Parameters<typeof useAuthenticatedFetch>[0]) {
  const fetch = useAuthenticatedFetch(scope);
  const lifecycle = useRef({ generation: 0, mounted: false, controllers: new Set<AbortController>() });
  useLayoutEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    return () => {
      state.generation++;
      state.mounted = false;
      for (const controller of state.controllers) controller.abort();
      state.controllers.clear();
    };
  }, [fetch]);
  return useMemo(() => {
    const isActive = () => lifecycle.current.mounted && fetch.beginResponseCheck().isCurrent();
    async function json<T extends { error?: string }>(url: string, init: RequestInit, fallback: string): Promise<T> {
      const generation = lifecycle.current.generation;
      const controller = new AbortController();
      const check = fetch.beginResponseCheck(controller.signal);
      const callerSignal = init.signal;
      const abortFromCaller = () => controller.abort();
      lifecycle.current.controllers.add(controller);
      let rejectAbort: () => void = () => {};
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(new DOMException("İstek artık aktif değil.", "AbortError"));
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      if (callerSignal?.aborted) controller.abort();
      else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
      let timedOut = false;
      const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
      try {
        return await Promise.race([(async () => {
          const response = await fetch(url, { ...init, signal: controller.signal });
          if (!check.isCurrent()) throw new DOMException("İstek artık aktif değil.", "AbortError");
          const data = await response.json() as T;
          if (!check.isCurrent() || generation !== lifecycle.current.generation) throw new DOMException("İstek artık aktif değil.", "AbortError");
          if (!response.ok) throw new Error(data?.error ?? fallback);
          return data;
        })(), aborted]);
      } catch (cause) {
        if (timedOut && isActive() && generation === lifecycle.current.generation) throw new Error("Yanıt alınamadı. Son durumu kontrol edip yeniden dene.");
        throw cause;
      } finally {
        window.clearTimeout(timer);
        callerSignal?.removeEventListener("abort", abortFromCaller);
        controller.signal.removeEventListener("abort", rejectAbort);
        lifecycle.current.controllers.delete(controller);
      }
    }
    return { json, isActive };
  }, [fetch]);
}
