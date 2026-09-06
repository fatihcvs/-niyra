"use client";

import { useLayoutEffect, useMemo } from "react";
import { createAuthenticatedFetchScope } from "../lib/authenticated-fetch";
import { useAppNavigation } from "./app-navigation";

/** Explicit scope also supports a future caller above AppNavigationProvider. */
export function useAuthenticatedFetch(explicit?: { ownerScope: string; onSessionExpired: () => void }) {
  const navigation = useAppNavigation();
  const ownerScope = explicit?.ownerScope ?? navigation?.ownerScope ?? "";
  const onSessionExpired = explicit?.onSessionExpired ?? navigation?.onSessionExpired;
  const scope = useMemo(() => createAuthenticatedFetchScope((input, init) => fetch(input, init), ownerScope), [ownerScope]);
  useLayoutEffect(() => {
    scope.setSessionExpiredHandler(onSessionExpired);
  }, [scope, onSessionExpired]);
  useLayoutEffect(() => {
    scope.activate(ownerScope);
    return () => scope.deactivate();
  }, [scope, ownerScope]);
  return scope.fetch;
}
