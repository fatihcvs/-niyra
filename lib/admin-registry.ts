export const ADMIN_FEATURE_REGISTRY = [
  { key: "users", label: "Öğrenci hesapları", table: "users", moderation: true },
  { key: "profiles", label: "Akademik profiller", table: "student_profiles", moderation: false },
  { key: "profileMedia", label: "Profil görselleri", table: "profile_media", moderation: false },
  { key: "posts", label: "Gönderiler", table: "posts", moderation: true },
  { key: "comments", label: "Yorumlar", table: "post_comments", moderation: true },
  { key: "notes", label: "Çalışma notları", table: "notes", moderation: true },
  { key: "communities", label: "Topluluklar", table: "communities", moderation: true },
  { key: "pulse", label: "Kampüs Anlık", table: "campus_pulse_posts", moderation: true },
  { key: "market", label: "Öğrenci mağazası", table: "marketplace_listings", moderation: true },
  { key: "places", label: "Kampüs mekânları", table: "campus_places", moderation: true },
  { key: "events", label: "Kampüs etkinlikleri", table: "campus_events", moderation: true },
  { key: "prices", label: "Kampüs fiyatları", table: "campus_price_reports", moderation: true },
  { key: "matches", label: "Sosyal eşleşmeler", table: "meetup_requests", moderation: true },
  { key: "library", label: "Kütüphane kullanımı", table: "library_checkins", moderation: false },
  { key: "reports", label: "Şikâyetler", table: "content_reports", moderation: true },
] as const;

export const MODERATABLE_ENTITY_TYPES = ["post", "comment", "note", "community", "pulse", "listing", "place", "event", "price", "user"] as const;
export type ModeratableEntityType = typeof MODERATABLE_ENTITY_TYPES[number];
