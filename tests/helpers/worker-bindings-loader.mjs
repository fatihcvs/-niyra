// Host binding adapter for Node-only built Worker tests. register() also works
// on the repository's minimum Node22.13; no application module is substituted.
export function resolve(specifier, context, nextResolve) {
  return specifier === "cloudflare:workers" ? { url: "kampira-test:worker-bindings", shortCircuit: true } : nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  return url === "kampira-test:worker-bindings" ? { format: "module", source: 'export const env = globalThis[Symbol.for("kampira.api-auth.worker-bindings")];', shortCircuit: true } : nextLoad(url, context);
}
