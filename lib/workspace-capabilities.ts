import { workspaceRoutes } from "./workspace-navigation";
import type { UiIconName } from "../app/ui-icon";

export type WorkspaceScreenId = typeof workspaceRoutes[keyof typeof workspaceRoutes] | "public-profile";
type WorkspaceCapability = {
  headerOwner: "shell" | "workspace" | "conversation" | "profile";
  icon: UiIconName;
  search: "none" | "inline" | "dedicated";
  createsContent: boolean;
};

/** Product identity is independent of translated headings and CSS class names. */
export const workspaceCapabilities = {
  feed: { headerOwner: "shell", icon: "home", search: "dedicated", createsContent: true },
  discover: { headerOwner: "shell", icon: "compass", search: "dedicated", createsContent: false },
  messages: { headerOwner: "conversation", icon: "message", search: "inline", createsContent: true },
  pulse: { headerOwner: "workspace", icon: "lightning", search: "inline", createsContent: true },
  match: { headerOwner: "workspace", icon: "users", search: "inline", createsContent: false },
  campus: { headerOwner: "workspace", icon: "map", search: "inline", createsContent: true },
  library: { headerOwner: "workspace", icon: "book", search: "inline", createsContent: true },
  market: { headerOwner: "workspace", icon: "store", search: "inline", createsContent: true },
  notes: { headerOwner: "workspace", icon: "notes", search: "inline", createsContent: true },
  communities: { headerOwner: "workspace", icon: "users", search: "inline", createsContent: true },
  notifications: { headerOwner: "workspace", icon: "bell", search: "none", createsContent: false },
  saved: { headerOwner: "workspace", icon: "bookmark", search: "inline", createsContent: false },
  safety: { headerOwner: "workspace", icon: "shield", search: "inline", createsContent: false },
  settings: { headerOwner: "workspace", icon: "settings", search: "none", createsContent: false },
  profile: { headerOwner: "profile", icon: "users", search: "none", createsContent: true },
  "public-profile": { headerOwner: "profile", icon: "users", search: "none", createsContent: false },
} as const satisfies Record<WorkspaceScreenId, WorkspaceCapability>;

/** Adapter for the existing route boundary; never infer a capability from UI copy. */
export function workspaceScreenIdFromSection(section: string): WorkspaceScreenId | null {
  if (section === "Öğrenci") return "public-profile";
  return Object.hasOwn(workspaceRoutes, section) ? workspaceRoutes[section as keyof typeof workspaceRoutes] : null;
}

export function ownsWorkspaceMobileHeader(screenId: WorkspaceScreenId) {
  return workspaceCapabilities[screenId].headerOwner === "workspace";
}
