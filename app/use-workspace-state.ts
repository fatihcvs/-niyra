"use client";
import { useEffect, useState } from "react";
import { workspaceState } from "../lib/workspace-state";
import { useAppNavigation } from "./app-navigation";

/** The containing workspace remounts on identity/context changes; writes from an old owner are rejected. */
export function useWorkspaceState<T>(key: string, initial: T) {
  const scope = useAppNavigation()?.ownerScope ?? "";
  const [value, setValue] = useState<T>(() => workspaceState.read(scope, key, initial));
  useEffect(() => { workspaceState.write(scope, key, value); }, [key, scope, value]);
  return [value, setValue] as const;
}
