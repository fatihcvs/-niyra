/** Reject work from a closed workspace or a previously selected community, including transports that ignore abort. */
export function createCommunityRequests({ fetcher = fetch, onSessionExpired = () => {} }: { fetcher?: typeof fetch; onSessionExpired?: () => void } = {}) {
  let alive = false;
  let generation = 0;
  let revision = 0;
  let target: string | null = null;
  const controllers = new Set<AbortController>();
  const stale = () => new DOMException("Bu ekran artık etkin değil.", "AbortError");
  return {
    attach() { alive = true; generation++; return () => { alive = false; generation++; controllers.forEach((controller) => controller.abort()); controllers.clear(); }; },
    setTarget(id: string | null) { if (id !== target) { target = id; revision++; } },
    invalidate() { revision++; },
    async read<T>(url: string, init: RequestInit = {}, targetScoped = true): Promise<{ response: Response; data: T }> {
      if (!alive) throw stale();
      const requestGeneration = generation;
      const requestRevision = revision;
      const current = () => alive && generation === requestGeneration && (!targetScoped || requestRevision === revision);
      const controller = new AbortController(); controllers.add(controller);
      const abort = () => controller.abort();
      let timedOut = false;
      let rejectAbort = () => {};
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(stale());
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      if (init.signal?.aborted) controller.abort();
      init.signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => { timedOut = true; abort(); }, 20000);
      try {
        return await Promise.race([(async () => {
          const response = await fetcher(url, { cache: "no-store", ...init, signal: controller.signal });
          if (!current() || controller.signal.aborted) throw stale();
          if (response.status === 401) { alive = false; generation++; controllers.forEach((item) => item.abort()); onSessionExpired(); throw stale(); }
          const data = await response.json() as T;
          if (!current() || controller.signal.aborted) throw stale();
          return { response, data };
        })(), aborted]);
      } catch (error) {
        if (!current() || init.signal?.aborted) throw stale();
        if (timedOut) throw new Error("Bağlantı zaman aşımına uğradı. Yeniden deneyebilirsin.");
        throw error;
      } finally { clearTimeout(timeout); init.signal?.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", rejectAbort); controllers.delete(controller); }
    },
  };
}
