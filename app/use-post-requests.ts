"use client";

// Existing post callers share the cancellation/body-timeout contract with workspaces.
export { useScopedRequests as usePostRequests } from "./use-scoped-requests";
