export const MOBILE_PRIMARY_DESTINATIONS = ["Akış", "Keşfet", "Paylaş", "Mesajlar", "Profil"] as const;

/** Secondary screens keep their parent selected in the bottom navigation. */
export function mobileRootFor(destination: string): string {
  if (["Profil", "Ayarlar", "Güvenlik", "Kaydedilenler"].includes(destination)) return "Profil";
  if (destination === "Mesajlar") return "Mesajlar";
  if (["Akış", "Bildirimler"].includes(destination)) return "Akış";
  return "Keşfet";
}

export function pageLocationWithoutComposer(location: string): string {
  const url = new URL(location, "https://kampira.invalid");
  url.searchParams.delete("compose");
  return `${url.pathname}${url.search}`;
}

export function pushAppLocation(location: string): void {
  const current = window.history.state ?? {};
  window.history.replaceState({ ...current, kampiraScrollY: window.scrollY }, "");
  window.history.pushState({ kampiraDepth: (Number(current.kampiraDepth) || 0) + 1, kampiraScrollY: 0 }, "", location);
}
