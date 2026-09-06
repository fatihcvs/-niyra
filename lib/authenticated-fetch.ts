export type AuthenticatedResponseCheck = {
  isCurrent: () => boolean;
  accept: (status: number) => boolean;
};
export type AuthenticatedFetch = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  /** Capture before starting a non-fetch transport; inspect its status without reading its body. */
  beginResponseCheck: (signal?: AbortSignal | null) => AuthenticatedResponseCheck;
};

/** A mounted owner scope, not a global fetch interceptor or an authentication authority. */
export function createAuthenticatedFetchScope(transport: typeof fetch = (input, init) => globalThis.fetch(input, init), initialOwnerScope = "") {
  let generation = 0;
  let active = false;
  let ownerScope = initialOwnerScope;
  let onSessionExpired: (() => void) | undefined;
  function deactivate() { generation++; active = false; }
  function beginResponseCheck(signal?: AbortSignal | null): AuthenticatedResponseCheck {
    const requestGeneration = generation;
    const requestOwner = ownerScope;
    const isCurrent = () => active && generation === requestGeneration && ownerScope === requestOwner && !signal?.aborted;
    return {
      isCurrent,
      accept(status) {
        if (!isCurrent()) return false;
        if (status === 401 && requestOwner && onSessionExpired) {
          // Invalidate parallel responses before the callback can cause another render.
          deactivate();
          onSessionExpired();
        }
        return true;
      },
    };
  }
  const scopedFetch: AuthenticatedFetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? (typeof input === "object" && input !== null && "signal" in input ? input.signal : undefined);
    const check = beginResponseCheck(signal);
    if (!check.isCurrent()) throw new DOMException("Bu istek artık aktif değil.", "AbortError");
    const response = await transport(input, init);
    if (!check.accept(response.status)) throw new DOMException("Bu istek artık aktif değil.", "AbortError");
    return response;
  }, { beginResponseCheck });
  return {
    fetch: scopedFetch,
    activate(scope: string) { generation++; ownerScope = scope; active = true; },
    setSessionExpiredHandler(handler: (() => void) | undefined) { onSessionExpired = handler; },
    deactivate,
  };
}
