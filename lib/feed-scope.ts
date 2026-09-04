export type PostAudience = "platform" | "campus";
export type FeedScope = "all" | "following" | "campus";
export const FEED_SCOPES = [
  { key: "all", label: "Genel Akış", title: "Kampira'nın ortak paylaşım alanı", description: "Tüm üniversitelerden öğrenciler, fikirler, fotoğraflar ve videolar." },
  { key: "following", label: "Takip", title: "Takip ettiğin öğrenciler", description: "Üniversite sınırı olmadan takip ettiğin kişilerin sana açık paylaşımları." },
  { key: "campus", label: "Kampüsüm", title: "Kendi kampüsündeki paylaşımlar", description: "Üniversitendeki öğrencilerden haberler, dersler ve kampüs sohbetleri." },
] as const;
export function feedScopeFromSearch(search: string): FeedScope {
  const value = new URLSearchParams(search).get("feed");
  return value === "following" || value === "campus" ? value : "all";
}
export function isPostAudience(value: unknown): value is PostAudience { return value === "platform" || value === "campus"; }
export function audienceLabel(value: unknown) { return value === "platform" ? "Tüm öğrenciler" : "Kampüs içi"; }
