# F05 ortak CSS sahipliği ve mobil kabuk denetimi

Tarih: 5 Eylül 2026. Kapsam: mevcut web uygulamasının ortak CSS katmanları, başlık/alt gezinme/viewport ilişkisi ve azaltılmış hareket. Bu teslim F05'in bütün bileşenlerini veya fiziksel cihaz kabulünü tamamlandı saymaz. Ana sayfa, mobil React bileşenleri, API ve ürün mimarisi değiştirilmedi.

## Bulgular ve uygulanan dar düzeltmeler

1. **Alt gezinmenin son görünümü üç dosyaya dağılmıştı.** `mobile-app.css` temel ölçüyü veriyor, `visual-polish.css` ikon/etiket ölçülerini değiştiriyor, `interaction-motion.css` tekrar üst padding, hedef ve seçili gösterge geometrisi yazıyordu. Son geçerli değerler `mobile-app.css` içine taşındı; yalnız taşınan kurallar diğer iki dosyadan kaldırıldı. Son görünümdeki 68 px + alt güvenli alan, 56 px asgari hedef, 26 × 28 px ikon, 28 × 28 px paylaş ikonu ve gösterge geometrisi korundu. Başlık marka/yazı kurallarının ilgili son değerleri de aynı sahibine alındı.
2. **Sabit menü ile içeriğin ayırdığı yer ayrı sayılardı.** `--app-mobile-nav-height` artık hem menüyü hem mesaj listesi alt payını besler; normal akışta bunun üzerine 12 px boşluk eklenir. `--app-mobile-header-height` başlık ve hemen altındaki yapışkan akış sekmelerini aynı üst güvenli alanla bağlar. Sayısal değerler değiştirilmedi.
3. **Uygulama içi azaltılmış hareket tercihi eksikti.** Önceki `html[data-reduce-motion="true"] *` kuralı süreleri küçültüyor, sonsuz tekrar sayısını ve `html` kökünün `scroll-behavior:smooth` değerini bırakıyordu. Artık kök kaydırma `auto`, tekrar sayısı `1!important`. İşletim sisteminin azaltılmış hareket kuralları korunur. Ekran geçişindeki JavaScript animasyonunun mevcut iki tercih kontrolü de test edildi.
4. **Etkin kabukta içerik altında kalan bir z-index çakışması saptanmadı.** Akış sekmeleri 60, kabuk/çalışma alanı başlığı 70, alt gezinme 100, gönderi penceresi 400. Bu, CSS inceleme bulgusudur; bütün ekranların piksel kabulü değildir. Kabuk ve içerik kolonu üzerinde sabit katmanın kapsayıcısını değiştirecek transform/translate/contain eklenmedi.

## Dosya sahipliği

`app/layout.tsx` yükleme sırası: `globals.css` → `social-design.css` → `social-workspaces.css` → `mobile-app.css` → `mobile-workspaces.css` → `mobile-profile.css` → `visual-polish.css` → `interaction-motion.css`. `globals.css` önce `workspace-ui.css` dosyasını içe aktarır.

| Dosya | Bu teslim sonrası sahibi olduğu alan | Değişiklik sınırı |
| --- | --- | --- |
| `globals.css` | Temel web düzeni ve eski ortak sınıflar | Değiştirilmedi; tarihsel kabuk kuralları aşağıdaki borç listesinde |
| `workspace-ui.css` | WorkspaceHeader ve ortak kontrollerin temel/masaüstü görünümü | Değiştirilmedi |
| `social-design.css` | Tasarım tokenları, masaüstü kolonlar, genel sosyal yüzeyler | Değiştirilmedi; eski mobil taban kuralları henüz mevcut |
| `social-workspaces.css` | Paylaşılan çalışma alanı yüzey ve içerik görünümü | Değiştirilmedi |
| **`mobile-app.css`** | **Mobil kabuk/header/nav, ikon kutuları, seçili gösterge, güvenli alan payı, mesaj/katman açıkken menünün görünürlüğü** | Son geçerli kabuk kuralları burada toplandı |
| `mobile-workspaces.css` | Çalışma alanının sahip olduğu mobil başlık ve eylem satırı | Değiştirilmedi; 48 px kontroller ve başlık daralma kuralları incelendi |
| `mobile-profile.css` | Mobil profil düzeni ve profil içerik sekmeleri | Değiştirilmedi |
| `visual-polish.css` | İçerik/yüzeylerin kalan görsel iyileştirmeleri | Mobil header/nav kutularını yeniden tanımlamaz |
| **`interaction-motion.css`** | **Basış, giriş, seçim geçişleri ve hareket tercihi** | Mobil header/nav geometrisini tanımlamaz; göstergeye yalnız geçiş uygular |

## Route ve ikon sözleşme matrisi

Buradaki kaynaklar mevcut `MobileHeader`, `MobileNavigation`, `WorkspaceHeader`, `mobileRootFor` ve onların gerçek React testleridir. Simge görünürlüğü, metin taşması ve erişilebilir adlar birbirinden ayrılmıştır: dar alanda metin kesilebilir; düğmenin tam erişilebilir adı korunur.

| Route / durum | Üst alan sahibi | Alt gezinmede seçili alan | Dar alan / ikon sözleşmesi |
| --- | --- | --- | --- |
| Akış | MobileHeader, gerçek Kampira markası ve bildirim eylemi | Akış | House seçili; Bell 48 px hedef; akış sekmeleri başlığın altında |
| Keşfet | MobileHeader | Keşfet | Compass; başlık `min-width:0` + ellipsis, içerik/filtre ayrı |
| Profil | MobileHeader araç çubuğu + profil kahraman alanının gerçek başlığı | Profil | Gerçek avatar veya mevcut baş harfler; GearSix 48 px hedef |
| Notlar, Topluluklar, Kütüphane, Kampüs, Kampüs Anlık, Pazar, Eşleş | WorkspaceHeader | Keşfet | ArrowLeft, gerçek birincil eylem ve varsa DotsThree; simgeli eylem 48 px, metinli eylem en fazla 112 px |
| Bildirimler | WorkspaceHeader | Akış | Aynı geri/eylem sözleşmesi; boş ikincil eylem menüsü oluşmaz |
| Kaydedilenler, Güvenlik, Ayarlar | WorkspaceHeader | Profil | Aynı geri/eylem sözleşmesi |
| Öğrenci ayrıntısı | MobileHeader + gerçek profil içeriği | Keşfet (mevcut eşleme) | Geri 48 px; uzun başlık ellipsis; profil metaverisi ayrı satırlar |
| Mesaj listesi | DirectMessages | Mesajlar | ChatCircleDots, görsel `99+` rozeti yanında gerçek sayının erişilebilir adı; kolon altı menü yüksekliğini ayırır |
| Açık mesaj konuşması | DirectMessages konuşma başlığı | Alt gezinme gizli | `data-message-thread="true"`; kolonun alt menü payı sıfırlanır |
| Paylaş / açık tam ekran katman | Kendi gerçek dialog başlığı | Alt gezinme gizli | `data-mobile-overlay="true"`; PlusSquare eylemdir, seçili route değildir |
| Açık metin klavyesi | Mevcut ekran | Alt gezinme gizli | MobileRuntime `data-keyboard-open="true"`; görünür viewport değişkenleri korunur |

## Breakpoint ve taşma matrisi

| CSS genişliği | Bildirilen kabuk sözleşmesi | Otomatik kanıt ve sınırı |
| --- | --- | --- |
| 320 / 390 | Mobil tek kolon; beş eşit menü sütunu; başlık ve menü görünür | Ayrıştırılmış gerçek CSS kuralları, hedef/geometri hesabı ve React etiket testleri. Piksel yerleşimi testi değildir. |
| 767 / 768 / 780 | Aynı mobil kabuk etkin; 767 tarihi eşik yeni kabuğun görünürlüğünü değiştirmez | Her genişlik için etkin medya koşulları ve menü/header `display` sözleşmesi kontrol edildi. |
| 781 | Mobil header/nav gizli; 64 px masaüstü yan ray + esnek içerik | Gerçek medya kuralları kontrol edildi. Masaüstü ekran görüntüsü bu teslimde üretilmedi. |
| Alt/yan güvenli alan 0 / 20 / 34 px | Nav alt payı içerikle aynı değişkenden gelir; 12 px ek akış boşluğu korunur | CSS sabitlerinden hesaplanan beşli sütunlar 320 px'de dahi en az 48 px. Tarayıcı scrollbarı, yazı ölçeği ve cihaz çentiği bu aritmetik kontrolün dışında. |
| Mesaj/katman/klavye açılıp kapanması | Menünün gizlenmesi yalnız gerçek durum seçicileriyle olur | JSDOM gerçek `:has(...)`/attribute seçicilerini uygular; yanlış/eksik durum menüyü gizlemez. Gerçek klavye kanıtı değildir. |
| OS/app hareket azaltma ayrı ve birlikte | Tekrar yok, kök yumuşak kaydırma yok, süreler `.01ms` | Gerçek stil kurallarından alınan motion deklarasyonları DOM computed style ile dört kombinasyonda doğrulandı. |

## Doğrulama

5 Eylül 2026 yerel komut:

```powershell
node --test --test-isolation=none tests/mobile-css-ownership.test.mjs tests/mobile-shell.test.mjs tests/mobile-viewport-runtime.test.mjs tests/screen-motion.test.mjs tests/workspace-header-runtime.test.mjs tests/direct-messages.test.mjs
```

**41 test geçti, 0 hata.** Yeni CSS sözleşme dosyası 6 test içerir. Diğer testler gerçek bileşenlerin etiket/eylem/başlık sahipliği ve mevcut viewport/motion davranışını denetler. Bütün layout stylesheet'leri PostCSS ile ayrıştırıldı. `node node_modules/eslint/bin/eslint.js tests/mobile-css-ownership.test.mjs` başarılı. TypeScript uygulama kodu değiştirilmedi; tam build ve birleşik site suite'i bu teslimin kanıtı değildir, ana görev ayrıca yürütür.

Ana görev ayrıca CUA ile canlı yerel bileşen galerisini 320 px görünümde kontrol etti. Kaydedilen `exports/mobile-quality-implementation-2026-09-05/reduced-motion-browser.json` okundu: açık temada `data-reduce-motion="true"`, kök `scrollBehavior:"auto"`, gerçek `.profile-boot-line i` yükleyicisinde süre `1e-05s` ve tekrar `1`. Kaydırma çubuğu sonrası içerik genişliği ve scroll genişliği eşit: **305 px**. Beş alt gezinme hedefi **59.39–59.41 × 58 px**; önceki boyutlar korunmuş. Bu ek kanıt canlı tarayıcı computed style/ölçümüdür; fiziksel Android veya bütün route/tema matrisi değildir.

Taşıma öncesi yerel dosya kopyaları `exports/f05-css-ownership/before-*.css` altında; final seçici/deklarasyonlar bu kopyalarla karşılaştırıldı. Bunlar ekran görüntüsü veya üretim kanıtı değildir.

## Açık kalan borç ve kabul sınırı

- `globals.css` içindeki `.mobile-header`/`.mobile-nav` kuralları yeni `.app-mobile-*` DOM'uyla eşleşmez. Benzer adlar tek başına etkin çakışma değildir. Eski markup kullanımını bütün bağımsız route ve auth/staff yüzeyleriyle kanıtlamadan topluca silinmedi.
- `.feed-column`, `.feed-tabs` gibi içerik seçicileri hâlâ temel/sosyal/mobil dosyalarda kademeli override alır. Notlar → Topluluklar → Kampüs sahiplik taşımasının tamamı bu dar kabuk teslimine sığdırılmadı; görünmeyen bir tüm-cascade refaktörü yapılmadı.
- Eski `767px` filtre kuralları, yeni `780px` kabuk kurallarıyla birlikte bulunur. Etkin `html[data-theme] .feed-tabs>button` kuralı filtre düğmesini 768–780 aralığında da görünür kılar; bu aralık için doğrulanmamış kayıp düğme iddiası yoktur. Gelecekte filtre sahibiyle birlikte temizlenmelidir.
- 320 px'de uzun Türkçe isim/CTA, yüzde 200 yazı, açık/koyu tema, viewport yüksekliği küçülmesi ve kaydırma sırasında yapışkan başlık için gerçek tarayıcı görsel ölçümü ana görevde kalır. Fiziksel Android Back/IME/çentik/ekran okuyucu kabulü ayrıca gereklidir.
- Bu teslim native uygulama, Google Play, push bildirimi, üretim deploy'u veya performans kazanımı kanıtı sunmaz. Ölçülmemiş bir performans artışı iddia edilmez.
