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
  if (entityType === "user") return `/?profile=${encodeURIComponent(actorId || entityId)}`;
  const areas: Record<string, string> = { note: "Notlar", community: "Topluluklar", "community-event": "Topluluklar", community_event: "Topluluklar", event: "Kampüs", meetup: "Eşleş", "direct-message": "Mesajlar", message: "Mesajlar", conversation: "Mesajlar", listing: "Pazar" };
  return Object.hasOwn(areas, entityType) ? workspaceHref(areas[entityType]) : null;
}
