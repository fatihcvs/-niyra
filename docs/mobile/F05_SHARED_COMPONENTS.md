# Ortak kontroller ve ekran sözleşmesi — 5 Eylül 2026

Bu teslim mevcut Kampira yönünü ve gerçek uygulama bileşenlerini genişletir. Yerel DOM ve tarayıcı kanıtı; gerçek hesap, fiziksel Android, IME veya mağaza kabulü yerine geçmez.

## Ekran kimliği ve eylemler

`lib/workspace-capabilities.ts`, bütün mevcut route slug'ları ile `public-profile` için typed kayıt tutar: mobil başlığı kimin çizdiği, semantik ikon, arama biçimi ve içerik oluşturma yeteneği. `WorkspaceHeader` zorunlu `screenId` alır. `section`, `title` ve `mobileTitle` sadece görünür metindir; başlık değişmesi ekran yeteneğini değiştirmez. Mevcut görünür ad kullanan navigation sınırında `workspaceScreenIdFromSection` adapter'ı vardır; bilinmeyen ad `null` döner. Bu kayıt sunucu izin denetimi değildir.

Gerçek Header caller'ları `primaryAction` / `secondaryActions` descriptor'larına taşındıktan sonra `actions`, `legacyPrimary`, CSS sınıfından primary arayan kod ve görünür başlıktan ikon/başlık sahibi çıkarımı kaldırıldı. Çocuk callback'leri, busy/disabled durumu ve contextual Back korunur. Eski CSS sınıfı `feature-primary` yalnız stil için kalır.

## Kontrol sözleşmeleri

| Bileşen | Davranış |
| --- | --- |
| Button / IconButton | Varsayılan `type=button`; zorunlu ikon kontrol adı; 48px hedef; görünür klavye odağı; native disabled ve aria-busy; bekleme ikonu; quiet/primary/danger tonları. |
| Badge | Dekoratif veya açık etiketli sayaç; nötr/vurgu/tehlike tonları; kendi başına tıklanabilir işlem değildir. |
| Tabs | Controlled değer; tek Tab durağı; ok tuşları, Home/End, disabled atlama ve döngü; yatay/dikey, RTL, otomatik veya Enter/Space ile seçim. Dış değer değişince odak çalınmaz. Geçersiz/disabled değere sahte seçili panel atanmaz. `panelId` verilirse aria-controls üretilir; panel başlığını sahip ekran yönetir. |
| InlineError | Yerinde role=alert; işlem sonucu ve taslak kaybı hakkında doğru metin; tekrar deneme callback'i; busy sırasında ikinci retry engellenir. |
| EmptyState / Skeleton | Tek durum duyurusu; anlamlı başlık/açıklama/eylem; skeleton dekoratif satırları erişilebilir ağaçta gizlidir; 1–8 satır ve card varyantı. |
| Toast | Odağı çalmaz. Durum bildirimi süre sonunda kapanır; focus/hover ve arka plan sekmesinde sayaç durur. Hata veya eylem içeren bildirimler otomatik kaybolmaz. Kapanış bir kez bildirilir, timer unmount'ta temizlenir. Yeni mesaj için kimlik değişir. |
| Sheet / Dialog | Mevcut `useAppLayer`: body portal, gerçek modal rolü/başlık, kardeş izolasyonu, focus trap/restore, Escape ve Back/Forward; mobil sheet alt kenardan, desktop merkezde. İçerik tek iç scroll alanında. Controlled taslağı ve onRestore kararını çağıran ekran tutar. |

Hareket kuralları hem `prefers-reduced-motion` hem uygulamanın `data-reduce-motion` tercihini karşılar. Native navigasyon veya Android geri hareketi uygulanmış sayılmaz.

## Gerçek kullanım

`WorkspaceHeader` gerçek Button/IconButton; `WorkspaceSearch` IconButton/Badge; `WorkspaceEmpty` ortak EmptyState; RefreshButton ortak Button kullanır. Uzun mobil CTA'nın görünür ikonu ve tam erişilebilir adı korunur. Eski mobil arama CSS'inin 36px clear kontrolü 48px'e yükseltildi. IconButton iç sarmalayıcısı eski “Diğer” etiketi gizleme kuralıyla ikonun kaybolmasına yol açmaz; desktop Back gizleme sahipliği korunur.

`/design-lab?canvas=1&screen=states` gerçek Tabs, InlineError, Skeleton, Button/IconButton, Badge, Toast ve Sheet'i etkileşimli olarak çalıştırır. Her eylem yalnız galeri state'ini değiştirir. Ağ taşıması veya gerçek kullanıcı hesabı taklit edilmez. Sheet taslağı kontrollüdür ve Back/Forward ile korunur.

## İkon envanteri

`lib/icon-semantics.ts` bütün mevcut Phosphor import'larının anlamlarını, optik boyut/ağırlık seçimini, etiket sahibini ve disabled davranışını kaydeder. `scripts/mobile-quality/icon-inventory.mjs`, bütün `app/**/*.tsx` kaynaklarını TypeScript AST ile tarar; çıktı `F02_ICON_INVENTORY.json` dosyasındadır. Literal UiIcon adları gerçek glyph ile eşleşir. Dinamik bileşen, optik boyut, etiket ve owner bağlamı çözülemiyorsa `dynamic-unresolved` / `context-owner-unresolved` açıkça yazılır; erişilebilirlik geçişi varsayılmaz.

KampiraMark özgün marka görseli olarak ayrı kalır. SVG'ler dekoratiftir; buton veya bağlantının erişilebilir adı kullanım bağlamına göre sahibi tarafından verilir. Seçili ağırlık fill; varsayılan regular; vurgu bold; bölüm dekorasyonu duotone. 16/20/24/26px roller ikon boyutudur, dokunma hedefi değildir.

## Kanıt ve açık sınırlar

- `tests/ui-primitives-runtime.test.mjs`: busy/disabled, otomatik/manual/RTL sekmeler, dış seçim ve focus, hata/retry, toast süresi/dismiss/unmount, skeleton ve modal Back/Forward.
- `tests/ui-contract-inventory.test.mjs`: her route'un açık yeteneği, bilinmeyen adın null dönmesi, yeni glyph eklenince kayıtsız anlamın testte yakalanması ve dinamik belirsizliğin saklanması.
- Mevcut Header / FilterSheet / DesignLab DOM testleri ortak bileşenleri gerçek renderer ile çalıştırır.
- `exports/mobile-quality-continuation-2026-09-05/shared-ui-tests.txt`: **33/33** hedef test geçti. `shared-ui-lint.txt` ve `shared-ui-typecheck.txt`: exit 0. Genel suite/build'i kök görev kaynaklar sabitlendikten sonra çalıştırır.
- `shared-ui-browser/matrix.json` ve 16 PNG: **8/8** son kaynak matrisi geçti. 320×568, 390×844, 800×1280 ve 1280×800 × açık/koyu; HTTP 200, yatay taşma yok, ölçülen kontroller en az 48px, mobil Diğer ikonu görünür ve callback çalışır, klavye sekmesi, Toast kapatma, busy, azaltılmış hareket ve Sheet taslağının Back/Forward ile dönmesi doğrulandı. **0 pageerror, 0 GET dışı istek**. Son mobil ve tablet ekran görüntüleri ayrıca gözle incelendi. Bu bir galeri simülasyonudur.

Tarayıcı matrisi önce tablet/desktop birincil Header düğmesinin eski 44px CSS kuralına düşmesini yakaladı. Descriptor sahibi için 48px kuralı düzeltildikten sonra aynı 8 durum tekrar geçti. Önceki başarısız sonuç kabul yerine kullanılmadı.

Bu aşama ortak API ve somut caller geçişini sağlar. Bütün ürün ekranları tek tek bu primitive'lere taşınmış sayılmaz; özel medya/mesaj menüleri ve NavItem/Avatar mevcut kendi sahiplerini kullanır. Envanterdeki dinamik ikon/etiket bağlamlarının runtime erişilebilirlik kabulü, gerçek hesap akışları ve fiziksel cihaz matrisi ayrıca açıktır.
