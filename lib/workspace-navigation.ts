export const workspaceRoutes = {
  "Akış": "feed", "Keşfet": "discover", "Mesajlar": "messages", "Kampüs Anlık": "pulse",
  "Eşleş": "match", "Kampüs": "campus", "Kütüphane": "library", "Pazar": "market",
  "Notlar": "notes", "Topluluklar": "communities", "Bildirimler": "notifications",
  "Kaydedilenler": "saved", "Güvenlik": "safety", "Ayarlar": "settings", "Profil": "profile",
} as const;

export function workspaceFromSearch(search: string) {
  const view = new URLSearchParams(search).get("view");
  return Object.entries(workspaceRoutes).find(([, slug]) => slug === view)?.[0] ?? "Akış";
}

export function workspaceHref(name: string) {
  const slug = Object.hasOwn(workspaceRoutes, name) ? workspaceRoutes[name as keyof typeof workspaceRoutes] : undefined;
  return slug && slug !== "feed" ? `/?view=${slug}` : "/";
}

export function matchesSearch(query: string, ...values: Array<string | null | undefined>) {
  const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  return normalize(query).trim().split(/\s+/).every((word) => normalize(values.filter(Boolean).join(" ")).includes(word));
}

export function notificationHref(entityType: string | null, entityId: string | null, actorId?: string | null) {
  if (!entityType || !entityId) return null;
  if (entityType === "post") return `/?post=${encodeURIComponent(entityId)}`;
  if (entityType === "comment" || entityType === "post-comment") return commentHref(entityId);
  if (entityType === "user") return `/?profile=${encodeURIComponent(actorId || entityId)}`;
  if (entityType === "conversation") return `/?view=messages&conversation=${encodeURIComponent(entityId)}`;
  if (entityType === "direct-message" || entityType === "message") return `/?view=messages&message=${encodeURIComponent(entityId)}`;
  if (entityType === "listing") return listingHref(entityId);
  if (entityType === "event") return campusEventHref(entityId);
  if (entityType === "meetup") return meetupHref(entityId);
  if (entityType === "note") return noteHref(entityId);
  if (entityType === "community") return communityHref(entityId);
  if (entityType === "community-event" || entityType === "community_event") return `/?view=communities&communityEvent=${encodeURIComponent(entityId)}`;
  const areas: Record<string, string> = { note: "Notlar", community: "Topluluklar", "community-event": "Topluluklar", community_event: "Topluluklar", event: "Kampüs", meetup: "Eşleş", "direct-message": "Mesajlar", message: "Mesajlar", conversation: "Mesajlar", listing: "Pazar" };
  return Object.hasOwn(areas, entityType) ? workspaceHref(areas[entityType]) : null;
}

export function noteHref(id: string) { return `/?view=notes&note=${encodeURIComponent(id)}`; }
export function commentHref(id: string, postId?: string) { return `/?view=feed&comment=${encodeURIComponent(id)}${postId ? `&post=${encodeURIComponent(postId)}` : ""}`; }
export function communityHref(id: string, eventId?: string) { return `/?view=communities&community=${encodeURIComponent(id)}${eventId ? `&communityEvent=${encodeURIComponent(eventId)}` : ""}`; }

/** Reject malformed IDs instead of silently selecting another truncated entity. */
export function contentTarget(search: string, key: string, view: string) {
  const params = new URLSearchParams(search);
  const value = params.get(key)?.trim() ?? "";
  return (params.get("view") ?? "feed") === view && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value) ? value : "";
}

export function listingHref(id: string) { return `/?view=market&listing=${encodeURIComponent(id)}`; }
export function campusEventHref(id: string) { return `/?view=campus&event=${encodeURIComponent(id)}`; }
export function meetupHref(id: string) { return `/?view=match&meetup=${encodeURIComponent(id)}`; }
