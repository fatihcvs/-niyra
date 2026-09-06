/** Short-lived, account-scoped client memory. No private content is put in URLs or browser storage. */
export function createWorkspaceState({ limit = 64, ttlMs = 15 * 60_000, now = Date.now } = {}) {
  let owner: string | null = null;
  const values = new Map<string, { value: unknown; updated: number }>();
  return {
    setOwnerScope(scope: string | null) { if (scope !== owner || scope === null) { values.clear(); owner = scope; } },
    read<T>(scope: string, key: string, initial: T): T {
      if (!scope || owner !== scope) return initial;
      const record = values.get(key);
      return record && now() - record.updated < ttlMs ? record.value as T : initial;
    },
    write<T>(scope: string, key: string, value: T) {
      if (!scope || owner !== scope) return;
      values.delete(key);
      values.set(key, { value, updated: now() });
      while (values.size > limit) values.delete(values.keys().next().value!);
    },
    remove(scope: string, key: string) { if (owner === scope) values.delete(key); },
  };
}
export const workspaceState = createWorkspaceState();
export const setWorkspaceStateOwnerScope = (scope: string | null) => workspaceState.setOwnerScope(scope);
