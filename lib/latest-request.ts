/** Own a single read request; replacing or closing its view invalidates late replies. */
export function createLatestRequest() {
  let active: AbortController | null = null;
  return {
    begin() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return { signal: controller.signal, isCurrent: () => active === controller && !controller.signal.aborted };
    },
    cancel() {
      active?.abort();
      active = null;
    },
  };
}
