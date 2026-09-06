/** Glyph meanings; contextual accessible names remain the owning control's responsibility. */
export const phosphorMeanings = {
  Bed: "Konaklama", Buildings: "Bina veya yerleşke", ArrowSquareOut: "Dış bağlantıyı aç", NavigationArrow: "Yol tarifi", ArrowDown: "Aşağı git",
  ArrowClockwise: "Yenile veya yeniden dene", ArrowLeft: "Geri dön", ArrowRight: "İlerle veya ayrıntıyı aç", ArrowsOut: "Medyayı büyüt", ArrowUp: "Yukarı git", ArrowUpRight: "Bağlantıyı aç",
  Bell: "Bildirimler", BellSlash: "Bildirimleri sessize al", BookmarkSimple: "Kaydet veya kayıttan çıkar", BookOpen: "Ders kaynakları veya kütüphane", BookOpenText: "Ders içeriği", Books: "Kaynak koleksiyonu", Briefcase: "İş veya kariyer",
  CalendarBlank: "Etkinlik veya tarih", CalendarDots: "Etkinlik takvimi", CaretRight: "Alt sayfayı aç", ChatCircle: "Yorum veya sohbet", ChatCircleDots: "Mesajlar", Check: "Onaylandı veya seçildi", CheckCircle: "Başarılı işlem", Checks: "Okundu", Clock: "Saat veya bekleme", ClockCounterClockwise: "Geçmiş",
  Code: "Yazılım veya ders alanı", Compass: "Keşfet", Copy: "Kopyala", Desktop: "Sistem görünümü", DotsThree: "Diğer işlemler", Files: "Notlar ve belgeler", FileText: "Belge", FilmStrip: "Videolar", Flag: "Şikâyet et", ForkKnife: "Yeme içme", Gear: "Ayarlar", GearSix: "Ayarlar", GlobeHemisphereWest: "Platform kapsamı", GraduationCap: "Akademik bölüm veya ders", Heart: "Beğen veya beğeniyi kaldır", House: "Akış veya konaklama", ImageBroken: "Görsel yüklenemedi", ImageSquare: "Görseller", Lightning: "Kampüs Anlık", List: "Menü", LockKey: "Gizlilik veya koruma", MagnifyingGlass: "Ara", MapPin: "Konum veya kampüs", Megaphone: "Duyuru", Moon: "Koyu görünüm", Note: "Not", Palette: "Görünüm", Paperclip: "Dosya ekle", PaperPlaneTilt: "Gönder veya paylaş", PencilSimple: "Düzenle", Play: "Videoyu oynat", Plus: "Yeni içerik oluştur", PlusSquare: "Oluştur", Prohibit: "Engelle veya kullanılamıyor", Question: "Yardım veya bilgi", SealCheck: "Doğrulanmış", ShareNetwork: "Paylaş", ShieldCheck: "Güvenlik", SignOut: "Çıkış yap", SlidersHorizontal: "Filtreler veya tercihler", Sparkle: "Önerilen veya öne çıkan", SquaresFour: "Izgara görünümü", Stack: "Koleksiyon", Storefront: "Pazar", Sun: "Açık görünüm", ThumbsDown: "Faydalı değil", ThumbsUp: "Faydalı", Trash: "Sil", Trophy: "Başarı", User: "Profil", UserMinus: "Kişiyi çıkar veya takibi bırak", Users: "Kişiler", UsersThree: "Topluluk veya kişiler", VideoCamera: "Video", WarningCircle: "Hata veya dikkat", X: "Kapat veya temizle", XCircle: "Hata veya iptal",
} as const;

export const iconPresentation = {
  family: "Phosphor",
  decorative: true,
  weight: { default: "regular", selected: "fill", emphasis: "bold", decorativeSection: "duotone" },
  opticalSize: { metadata: 16, inlineAction: 20, navigation: 24, emptyState: 26 },
  minimumTouchTarget: 48,
  accessibleNameOwner: "Enclosing button/link or adjacent visible text; never the decorative SVG",
  disabledStateOwner: "Native disabled control; reduced opacity alone is insufficient",
  logo: "KampiraMark is a separate original brand image and is not an action glyph",
} as const;
