# F00 — İzole sentetik ölçüm verisi

Tarih: 2026-09-05. Kapsam: F00-03 için saf veri jeneratörü ve bellek içi gerçek route testi. Bu teslim cihaz, görsel fotoğraf kalitesi, video oynatma veya üretim hazırlığı kanıtı değildir.

## Çalıştırma

Proje kökünde, mevcut Node test düzeniyle:

```powershell
node --test --test-isolation=none tests/mobile-quality-fixtures.test.mjs
```

Jeneratör yalnız import edilip çağrılır; CLI, sunucu veya seed komutu yoktur:

```js
import { createMobileQualityFixtures } from "./scripts/mobile-quality/fixtures.mjs";

const fixtures = createMobileQualityFixtures(); // 200 gönderi, 100 mesaj
const smaller = createMobileQualityFixtures({ seed: "layout-320", postCount: 12, messageCount: 8 });
```

Aynı girdiler aynı JSON verisini üretir. Seed rastgelelik değil kimlik ad alanıdır; tarih `2026-09-05T09:00:00.000Z` olarak sabittir. Her çağrı bağımsız nesneler döndürür. Sayılar 0–5000 arası tam sayıdır. Jeneratör ağ, disk, veritabanı, ortam değişkeni, uygulama API'si veya kimlik bilgisi kullanmaz.

## İçerik sözleşmesi

| Veri | Kapsam ve beklenen kullanım |
| --- | --- |
| `profiles.empty` | Gönderisiz, avatarsız, biyografisiz ilk kullanım hesabı. |
| `profiles.populated` / `profiles.longName` | Varsayılan sette kişi başına 100 gönderi; uzun Türkçe kimlik ve akademik bilgiler. Takip ilişkileri yalnız bu iki sentetik kişi arasında. |
| `posts` | 200 kayıt; azalan tarih/kimlik sırası, eşit tarih sınırları; kısa, uzun, çok satırlı, boşluksuz ve HTML gibi görünen literal metinler. Sayaçlar sıfırdır. |
| `messages` / `conversations` | 100 mesaj; iki sentetik kişi arasında artan tarih/kimlik sırası, eşit tarihler, iki yön, okunmamış kuyruk. Konuşma önizlemesi ve okunmamış sayısı mesajlardan türetilir. |
| `media.images` | 1:1, 4:5, 9:16, 16:9, 4:1 oranları; 40×40 küçük örnek dahil. Yalnız **SYNTHETIC** yazılı ölçüm deseni. |
| `media.videos` | 9:16 ve 16:9 metadata/afiş tanımları. `url: null`, `availability: metadata-only`. Oynatılabilir video dosyası yoktur. |
| `media.existingProductAssets` | Depodaki 7 mevcut ürün görseline isteğe bağlı yerel referans. Sentetik kullanıcı içeriği etiketiyle kullanılabilir; varsayılan ölçüm akışına eklenmez. |
| `scenarios` | İlk kullanım, arama sonucu boş, yükleniyor, ağ hatası, kaynak eksikliği ve bilerek bozuk medya birbirinden ayrıdır. Ağ hatası için uydurma HTTP kodu kullanılmaz. |

İsim, gönderi ve mesajlar `[SYNTHETIC]` etiketi taşır. E-posta adresleri `example.invalid` alanındadır; gerçek üniversite e-postası, parola, oturum çerezi veya API anahtarı içermez. Kişiler ve üniversite kurgusaldır. Veri bir uygulama DTO sürümünün tamamını uygulamaz; ihtiyaç olan alanlar test adaptöründe açıkça eşlenir. Şema değiştiğinde adaptör ve beklentiler birlikte incelenmelidir.

## Medya sınırı ve hakları

Görseller kodla üretilmiş, haricî fotoğraf içermeyen oran/kenar ölçüm desenleridir. Üzerindeki SYNTHETIC yazısı ve ölçü metni çıkarılmaz. Bunlar ürün illüstrasyonu, profil fotoğrafı seçeneği, tasarım alternatifi veya gerçek fotoğraf kalitesi örneği değildir. Haricî lisanslı görsel kullanılmamıştır.

SVG data URL'leri yalnız izole render/yerleşim testleri içindir. Mevcut gönderi yükleme API'si PNG/JPEG/WebP kabul ettiği için bu SVG'ler gerçek upload isteğine veya `post_media` satırına çevrilmez. Video tanımlarında dosya bulunmadığından decode, ses, oynatma, seek, buffer, byte-range veya yükleme başarısı iddia edilemez. Bu kapılar ayrıca hakları kaydedilmiş oynatılabilir test dosyaları gerektirir. Bilerek bozuk görsel yalnız hata senaryosunda seçilir; normal akışa rastgele eklenmez.

İsteğe bağlı mevcut ürün varlıkları: `public/social-live/{library-study,campus-event,cafeteria}.webp` ve `public/course-covers/{study,programming,physics,mathematics}.jpg`. Dosyaların varlığı ve JPEG/WebP başlıkları test edilir; üretici/fotoğrafçı ve lisans provenansı bu çalışma kapsamında doğrulanmadı. Bunlar yeniden üretilmedi veya değiştirilmedi. Ayrı dolu ekran kabulünde kullanılırsa kullanıcı adı, gönderi metni ve fixture ekran etiketi sentetik kalmalı; alt metin tek başına gören kullanıcıya sentetik niteliği anlatmaz. Salt dosya imzası kontrolü, gerçek decode veya fotoğraf kalitesi kanıtı değildir.

## Gerçek API testleriyle güvenli kullanım sınırı

Yeni test, mevcut `tests/profile-content.test.mjs` düzenini kullanır: gerçek migration'lar yeni SQLite `:memory:` veritabanına uygulanır; gerçek `app/api/profile/content/route.ts` GET işleyicisi VM ile yüklenir ve bellek içi D1 adaptörüne bağlanır. Sentetik satırlar yalnız bu yeni veritabanına eklenir. Kayıt/gönderi API'sine POST/PUT/DELETE yapılmaz; HTTP sunucusu çağrılmaz. Her test sonunda yalnız kendi bellek içi bağlantısı kapanır.

Bu doğrulama üretilen 200 kaydın iki yazarın profil geçmişinden sayfalanarak eksiksiz okunmasını, boş profil sonucunu ve metinlerin korunmasını sınar. Oturum açmanın gerçek sağlayıcısını, canlı API'yi, medya depolamasını veya browser render'ını doğrulamaz.

Gelecek testler bu veriyi ancak kendilerine ait yeni `:memory:` veritabanına veya ayrıca hazırlanıp doğrulanmış izole test ortamına açık adaptörle aktarabilir. Üretim seed/import akışı, uygulamada otomatik demo fallback veya gerçek kullanıcı akışına ekleme yapılmaz. HTTP/cihaz entegrasyonu bu jeneratörün dışındadır; `.invalid` kimlikler gerçek kayıt API'sine gönderilmez.

## Mevcut runtime yöntemlerinin inceleme kaydı

Bu çalışma aşağıdaki dosyaları **çalıştırmadı ve değiştirmedi**:

| Dosya / yöntem | 2026-09-05 kod incelemesi |
| --- | --- |
| `tests/profile-content.test.mjs` | Yeni `DatabaseSync(":memory:")`, gerçek migration ve VM route kullanıyor. F00 için kullanılan izole örüntü. |
| `tests/profile-media-runtime.mjs` | Loopback kontrolü var; canlı geliştirme sunucusunda hesap oluşturuyor ve `.wrangler/state/v3/d1/` altındaki mevcut DB'yi arıyor. Medya baytları transport amaçlı; oynatma kanıtı değil. |
| `tests/audit-regressions-runtime.mjs` | Loopback kontrolü var; API ile hesap/konuşma oluşturup mevcut `.wrangler` DB'sine mesaj yazıyor. F00 saf fixture testine bağlanmadı. |
| `tests/campus-libraries-runtime.mjs`, `tests/housing-catalog-runtime.mjs` | Loopback kontrolü ardından çalışan sunucuda hesap oluşturuyor. |
| `tests/global-feed-runtime.mjs` | Base URL ortamdan geliyor. İlk mutasyon öncesinde loopback engeli yok; sonda fixture dosyası kaydı için yapılan kontrol önceki istekleri korumuyor. |
| `tests/local-runtime-smoke.mjs` | Base URL ortamdan geliyor; ilk kayıt mutasyonu öncesinde loopback engeli yok. |

Loopback URL tek başına veritabanı izolasyonu kanıtı değildir: yerel sunucu ortak veya uzak bir depolamaya bağlanabilir. Mevcut runtime mutasyon testleri ayrıca ele alınmalıdır; bu F00 teslimi onların guard açıklarını kapattığını iddia etmez. Mevcut DB silinmez, başka oturumların test verisi temizlenmez, Railway/production verisi yazılmaz.

## Tamamlanan ve açık kalan ölçüm kapıları

- Tamamlanan: deterministik veri üretimi, görünür sentetik etiketler, uzun Türkçe ve uç metinler, medya oranı tanımları, boş/hata/yükleme durum ayrımı, bellek içi gerçek profil GET sayfalama testi.
- Açık: hakları kaydedilmiş gerçekçi fotoğraf ve oynatılabilir video örnekleri; fiziksel cihaz ölçümü; gerçek klavye/geri/medya davranışı; izole çalışan API ve gerçek oturum testleri. 200/100 kayıt üretilmesi tek başına kaydırma performansı kanıtı değildir.
