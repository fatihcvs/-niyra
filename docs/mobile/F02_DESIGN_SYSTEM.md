# Kampira — Yön A ve gerçek bileşen galerisi

5 Eylül 2026 · F02/F05/F06 için uygulama ve doğrulama yüzeyi.

Seçilen referans `exports/mobile-quality-implementation-2026-09-05/direction-a.png`: açıkça görünen Genel / Takip / Kampüs sekmeleri, nötr içerik yüzeyi, sınırlı mor vurgu ve içeriğin önüne geçmeyen alt gezinme. Kampira markası, Geist ailesi ve mevcut Phosphor ikonları korunur. Galeri yeni bir tasarım kütüphanesi veya bağımsız starter kullanmaz.

## Açma ve kapsam

Yerel geliştirme sunucusu açıkken `/design-lab` adresi workbench'i açar. Ekran, tema, 320/390/780/781/1440px iframe genişliği ve azaltılmış hareket seçilebilir. iframe kendi gerçek CSS viewport'una sahiptir; 390px görünümü büyük masaüstü viewport'unda CSS ile küçültülmüş bir resim değildir. Dar workbench'te geniş iframe'in yatay kaydırılması bir test aracıdır, ürün taşma kabulü değildir.

`/design-lab?canvas=1&theme=dark&screen=feed` aynı tuvali ayrı sekmede açar. `screen` değerleri: `feed`, `campus`, `notes`, `messages`, `profile`, `states`. `motion=reduced` uygulamanın azaltılmış hareket seçimini açar; normal mod işletim sistemi tercihini geçersiz kılmaz.

Yalnız `process.env.NODE_ENV === "development"` erişime izin verir. Production, test ve tanımsız ortamlar `notFound()` ile kapanır. Fixture parametreleri gate geçilmeden okunmaz; route robots index/follow izni vermez. Bu, yayınlanmış production 404 kanıtı değil, kod ve yerel test kanıtıdır.

Her tuvalde **GALERİ SİMÜLASYONU** etiketi görünür. Composer'ın üstünde de aynı sınır bulunur. Örnek öğrenciler, metinler, sayaçlar ve konuşmalar sentetiktir. Var olan `/kampira-mark.png` ve `/social-live/library-study.webp` kullanılır. Gerçek kullanıcı/veritabanı kaydı oluşturulmaz.

## Gerçek bileşenler ve açık adaptör sınırı

| Yüzey | Kaynak | Galerideki davranış |
| --- | --- | --- |
| Gönderi, aksiyonlar, yorumlar, owner menüsü, bildirme | `app/feed-post.tsx` | Ana uygulamayla aynı bileşen; explicit `preview` ile yerel state/callback |
| Avatar ve sayı biçimi | `app/social-primitives.tsx` | Ana sayfa ve gönderi bileşeninin ortak primitive'leri |
| Fotoğraf/video ve medya hata yüzeyi | `app/post-media-view.tsx` | FeedPost içindeki gerçek media renderer |
| Mobil üst/alt gezinme | `app/mobile-app.tsx` | Aynı düğme/ikon/label markup'ı; callback yalnız galeri ekranını değiştirir |
| Gönderi oluşturma | `app/mobile-app.tsx` MobilePostComposer | Aynı form, medya seçimi ve kontroller; yayınlama yalnız galeri listesine ekler |
| İkincil başlık, arama, filtre, empty/error | `app/workspace-ui.tsx` | Gerçek WorkspaceHeader/Search/Empty; çocuk callback galeriye ait |
| Kampüs araçları ve hesap kısayolları | `app/mobile-app.tsx` | Gerçek MobileCampusHub/MobileAccountLinks |
| Mesaj kontrol örneği | Gerçek `direct-messages.module.css`, Avatar ve aynı ikonlar | Sunum adaptörü; authenticated DM workspace/polling/delivery mount edilmez |
| Profil boş örneği | Gerçek Avatar, WorkspaceEmpty, MobileAccountLinks | Sunum adaptörü; ProfileContent veri deposu ve authenticated fetch mount edilmez |

Notlar ve profil adaptörlerindeki bazı sekme/ekleme callbacks yalnız görünür simülasyon sonucu üretir. Bu galeri canlı NotesWorkspace veya ProfileContent akışını test ettiğini iddia etmez. Ana uygulamadaki CUA kontrolleri bunların ayrıca kabul yüzeyidir.

`preview?: { onAction?: (action: "profile" | "share" | "report" | "delete") => void }` varsayılan olarak yoktur. Verildiğinde string ID bile authenticated gönderi kabul edilmez; like/save/comment/edit/delete yerel dallarda kalır, report ve share açıkça simülasyon sonucu verir, author anchor normal gezinmeyi önler. Native share, clipboard, confirm veya fetch kullanılmaz. Preview verilmediğinde mevcut sunucu onayı, hata rollback'i ve `useAppNavigation().onPostInteraction` ile `onInteractionUpdated` raporlaması korunur. Gallery callback'leri ana sayfa state'ine bağlı değildir.

## Token sözleşmesi

Bu değerlerin gerçek kaynağı `app/social-design.css`'tir; galeri modülü aynı CSS değişkenlerini tüketir. Mevcut stylesheet sırası `app/layout.tsx` içinde korunur.

| Token | Açık | Koyu | Kullanım |
| --- | --- | --- | --- |
| `--canvas` | `#f7f7f9` | `#101114` | Sayfa tabanı |
| `--card` | `#ffffff` | `#17181c` | İçerik yüzeyi |
| `--surface-interactive` | `#f2f2f5` | `#222328` | Arama, kontrol, alınan mesaj |
| `--ink` | `#202126` | `#f5f5f7` | Ana metin ve güçlü ikon |
| `--muted` | `#707178` | `#a0a1a9` | Meta ve ikincil bilgi |
| `--text-body` | `#505158` | `#c8c8cf` | Açıklama metni |
| `--line` | `#e9e9ed` | `#2d2e34` | İçerik ayrımı |
| `--brand` | `#6548e8` | `#b09bff` | Vurgu metni, focus, seçili işaret |
| `--brand-solid` | `#6548e8` | `#7857e8` | Beyaz etiketli ana işlem ve kendi mesaj balonu |
| `--brand-soft` | `#efebff` | `#2b2440` | Sınırlı seçili yüzey |

Mor her kartın arka planına yayılmaz. Tam mor zemin için `brand-solid`, mor yazı için `brand` kullanılır; koyu temada ikisi aynı değer değildir. Nötr yüzey hiyerarşisi ve metin ağırlığı, iç içe kenarlık/gölge eklemekten önce gelir.

## Tipografi, geometri ve hareket

- Font kaynağı root layout'taki Geist'tir; düğme ve inputlar `inherit` kullanır. Gönderi gövdesi mobilde 16px ve yaklaşık 1.65 satır yüksekliği; başlıklar 18–24px, meta 12–13px. Galeri araç etiketleri ürün meta metni değildir ve 11–14px aralığındadır.
- Mobil ana dokunma hedefi 48×48px; gezinme hücresi daha yüksek olabilir. İkon çizimi 22–26px olup dokunma hedefinin tamamı değildir. Mevcut bazı masaüstü/ikincil kontroller 44px kalır; bu belge bütün site hedeflerinin ölçüldüğü iddiası değildir.
- Kart 16px, diyalog yaklaşık 20px; mobil akış gönderileri ortak yüzeyde düz ayırıcı kullanır. Galerinin 24px iframe çerçevesi ürün kart token'ı değildir.
- `app/interaction-motion.css`: press 110ms, state 180ms, surface 260ms; ortak easing `cubic-bezier(.2,.8,.2,1)`. Katman/menü görünme ve basma durumları gerçek stilleri kullanır. `prefers-reduced-motion` ve uygulamanın `data-reduce-motion` seçimi korunur. Yerleşim/CSS animasyonu veya FPS başarısı jsdom'dan çıkarılmaz.

## Tekrar çalıştırılabilir doğrulama

```powershell
npm ci --prefix scripts/mobile-quality --ignore-scripts
npm run test:design --prefix scripts/mobile-quality
npx eslint app/feed-post.tsx app/social-primitives.tsx app/design-lab/page.tsx app/design-lab/design-lab.tsx
```

Kök uygulama bağımlılıkları ayrıca kurulu olmalıdır. Sabit `jsdom@26.1.0` sadece izole test tooling paketindedir; eksik kurulum skip yerine hataya yol açar.

`tests/design-lab-runtime.test.mjs` gerçek ReactDOM ile explicit preview'ın bütün mutation alanlarını, native share/clipboard/confirm yasağını, normal üretim dalının sunucu onayını ve rollback'ini, galeri composer/mesaj callback'lerini, iframe kontrol parametrelerini ve production gate'ini doğrular. Canlı API yerine sayılan mock kullanılır; preview senaryolarında **0 fetch ve 0 native action** beklenir.

Yerel HTTP okumasında `/design-lab` ve koyu feed tuvali **200**, fixture etiketi ve gerçek feed markup'ı görüldü. Bu okuma görsel kalite veya production gate deployment kanıtı değildir. CUA ekran görüntüleri, 780/781px sınırı, iki tema, overflow, klavye/Back, medya hata/retry, gerçek cihaz ve insan kabulü ayrı kaydedilmelidir.
