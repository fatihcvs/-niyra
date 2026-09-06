"use client";

import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from "react";
import { appLocationFor, isPlainLinkActivation, navigateAppHref } from "../lib/app-links";
import type { ProfilePostChanges } from "../lib/profile-content-state";

export type FollowChange = { targetId: string; active: boolean; followerCount: number; viewerFollowingCount: number };
type AppNavigation = { onBack: () => void; ownerScope: string; onSessionExpired: () => void; onPostInteraction?: (id: string | number, changes: ProfilePostChanges) => void; onSafetyChanged?: (targetId: string, action: "block" | "mute", active: boolean) => void; onFollowChanged?: (change: FollowChange) => void };
const AppNavigationContext = createContext<AppNavigation | null>(null);

export function AppNavigationProvider({ onBack, ownerScope, onSessionExpired, onPostInteraction, onSafetyChanged, onFollowChanged, children }: AppNavigation & { children: ReactNode }) {
  return <AppNavigationContext.Provider value={{ onBack, ownerScope, onSessionExpired, onPostInteraction, onSafetyChanged, onFollowChanged }}>{children}</AppNavigationContext.Provider>;
}

export function useAppNavigation() {
  return useContext(AppNavigationContext);
}

/** Real anchors retain open-in-new-tab, download and external-navigation behavior. */
export function AppLink({ href, onClick, onNavigate, target, download, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: () => void }) {
  return <a {...props} href={href} target={target} download={download} onClick={(event) => {
    onClick?.(event);
    if (!isPlainLinkActivation(event, target, download) || !appLocationFor(href, window.location.href)) return;
    event.preventDefault();
    onNavigate?.();
    navigateAppHref(href);
  }}>{children}</a>;
}
