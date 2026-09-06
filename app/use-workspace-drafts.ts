"use client";

import type { ChangeEvent } from "react";
import { useWorkspaceState } from "./use-workspace-state";

/** Bucketed by form kind or target ID: changing recipients never reuses another target's text. */
export function useWorkspaceDrafts(key: string, busy = false) {
  const [values, setValues] = useWorkspaceState<Record<string, Record<string, string>>>(key, {});
  const field = (bucket: string, name: string, fallback = "") => ({
    value: values[bucket]?.[name] ?? fallback,
    disabled: busy,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [bucket]: { ...current[bucket], [name]: value } }));
    },
  });
  return { values, setValues, field, clear: (bucket: string) => setValues((current) => ({ ...current, [bucket]: {} })) };
}
