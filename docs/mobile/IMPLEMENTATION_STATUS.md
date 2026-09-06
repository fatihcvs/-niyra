# Mobil kalite programı — uygulama ve kanıt durumu

**Kalan altı kod işi sırayla sürüyor:** kalıcı Pazar taslakları son kaynakla 46 test, gerçek Chrome süreç yeniden açılışı ve temiz ağ kontrolüyle tamamlandı. Fotoğraf yükleme güvenilirliği sıradaki aktif iş. [Güncel altı iş kaydı](REMAINING_CODE_PHASES_2026-09-06.md). Aşağıdaki 679 testli teslim önceki genel kontrolün tarihçesidir.

6 Eylül 2026. Kaynak plan: [15 faz / 105 görev](../MOBILE_APP_QUALITY_ROADMAP.md). Görev kimlikleri ve metinleri değiştirilmedi; ayrıntılı durum [phase-progress.json](phase-progress.json) içindedir.

**Kod geliştirmeleri ve kontroller ilerledi; 15 fazın genel kabulü açık.** Son birleşik test **679/679**, son Pazar handler kontrolü **12/12**, geniş ESLint/TypeScript/Vinext build **exit0**. Gerçek API/Chrome **44/44**, 31 görünüm; son hata görünürlüğü için ayrı **4/4** odaklı tekrar. **Kampira Test v2 debug APK derlendi, doğrulandı ve Galaxy Tab A11 üzerine güncellendi.** Açılış/cihaz yolculuğu ayrıca açık. Son kayıt: [6 Eylül doğrulaması](FINAL_VERIFICATION_2026-09-06.md). Push/deploy/Play yayını yapılmadı. Aşağıdaki önceki ayrıntılar kendi teslim anlarının tarihçesidir.

Başlangıç ve bu kontrol anındaki branch `codex/cyprus-catalog-expansion`, HEAD `408b52b2d9d25b393790346a3f5af70d0ec8f317`. Çalışma kopyası ortak, kirli ve bu HEAD sonrasında değiştirilmiştir; HEAD tek başına test edilen bütün kaynakların immutable kaydı değildir. Ders katalog çalışmasının sahipliği ve mevcut değişiklikler korunur. Bu programın değişiklikleri için yeni yayın/push/mağaza onayı üretilmedi.

## Durumların anlamı

| Durum | Görev | Anlam |
| --- | ---: | --- |
| `verified-local` | 24 | Belirtilen yerel belge veya davranış çıktısı doğrudan kanıtlı. Fiziksel cihaz ya da nihai ürün kabulü değildir. |
| `partial` | 67 | Somut uygulama var; görevdeki en az bir davranış, kapsam veya kabul koşulu açık. |
| `in-progress` | 3 | Ana çalışma uygulama veya CUA düzeltme/yeniden testini sürdürüyor. |
| `pending` | 2 | Görevin ana teslimi henüz doğrulanmadı; ilişkili hazırlık tamamlanma yerine sayılmıyor. |
| `external` | 9 | Fiziksel cihaz, öğrenci, gerçek mağaza hesabı veya insan kararı kanıtı yok. |

Toplam **105 görev**, her fazda **7 görev**. On beş fazın da `acceptance` alanı `open` kalır. Bu sayılar tamamlanma yüzdesi değildir; örneğin bir sözleşme belgesinin kabulü ile iki cihazda bir hafta kullanım kabulünün iş yükü aynı değildir.

## Fazlara göre somut kapsam

| Faz | Uygulanan ve doğrulanan bölüm | Açık kalan önemli bölüm |
| --- | --- | --- |
| F00 — Başlangıç | Branch/çalışma kopyası, 15 bölüm envanteri; deterministik 200 gönderi/100 mesaj ve fresh SQLite profil GET fixture'ları; açıkça başlatılan web ölçüm paneli ve 24 örneklik galeri kaydı. | Hak provenansı kayıtlı gerçekçi fotoğraf/oynatılabilir video; iki cihaz ve kurulu rakip uygulama; native frame/bellek/dokunma ölçüm tabanı. |
| F01 — Deneyim sözleşmesi | Altı öğrenci görevi, tek başlık/gerçek eylem sahibi, boş/hata durumları ve Back/katman haritası. | Kullanım verisi, açıklamasız öğrenci oturumu ve sıralama/akış kabulü. |
| F02 — Görsel sistem | Yön A/B akış görselleri; Yön A tokenları; gerçek FeedPost/Header/Navigation/Composer galerisi ve açık simülasyon kapısı. | A/B'nin aynı profil+mesaj seti; bütün ikon envanteri ve varyantlar; uzun metin/tema/genişlik matrisi; nihai insan görsel kabulü. |
| F03 — Android karar denemesi | SDK36/BuildTools36 kullanıcı lisans onayıyla kuruldu; bağımsız Kampira Test debug APK, Android lint/imza ve LAN indirmesi doğrulandı. Normal yerel API auth/medya hesap ayrımı browserda geçti; TWA/Expo scout kayıtları korunur. | Native mimari/ADR, release karşılaştırması, TWA/DAL ve gerçek cihaz oturum/klavye/performans kabulü açık. |
| F04 — Gezinme ve durum | Not/topluluk/etkinlik/ilan/mesaj/konuşma ve tek yorum hedefleri; yeni yorum bildirimi, ilk20 dışı yorum, silinmiş/yetkisiz/owner ve20turBackForward; seçili gerçek API/browser zincirleri geçti. | Bütün viewport/async/cache matrisi, genel buluşma hedefi ve fiziksel IME önceliği açık. |
| F05 — Ortak bileşenler | Typed route/capability ve descriptor Header geçişi; legacy CSS/başlık çıkarımı kaldırıldı. Button/IconButton/Badge/Tabs/Sheet/Dialog/Toast/InlineError/Empty/Skeleton sözleşmeleri; 8/8 tema/viewport kontrolü, ölçülen48px hedefler. | NavItem/Avatar ve bütün özel kontrollerin ortaklaşması; dinamik ikon etiketi bağlamları, bütün caller matrisi ve fiziksel select/IME kabulü açık. |
| F06 — Akış ve medya | Gerçek FeedPost; istenen beğeni/kayıt durumu, rollback ve onaylı callback; yeni paylaşım işareti ve kontrollü yenileme, iki sayfa/cursor korunması; dosyadan görsel ölçüsü; retry fallback; Back/Forward viewer; görünmez/background video pause ve beş medya regresyonu. | **Viewer ve yeni paylaşım işaretinin gerçek hesap/cihaz kabulü sürüyor.** Tüm oranlar, çoklu medya, gerçek 200 gönderi medya/bellek/frame ölçümü açık. |
| F07 — Profil | Altı gerçek tab, hedef/owner cache, bounded cursor restore, auth temizliği; görsel/video ayrımı, thumbnail hata yüzeyi; gerçek kişi güvenlik menüsü. | Gerçek takipçi/takip edilen listeleri, arama/cursor, görünürlük/engel ve sunucu sayaçları bağlandı. Gerçek sayfa scroll'u; üyelik/not/avatar invalidation bütünü, yorum deep link ve gerçek hesap/cihaz kabulü açık. |
| F08 — Oluşturma | Dört fotoğraf veya tek video; sıralama/kaldırma, schema2 kalıcı taslak ve değişmez retry sırası; çoklu medya transaction/hash/temizlik. Gerçek browserda iki fotoğraf yayımla201/yenileme/sıra/viewer doğrulandı. | Android sağlayıcısı/kamera, zayıf ağ/uçak modu, süreç yeniden oluşumu, çok sekme ve düşük depolama kabulü açık. |
| F09 — Mesajlar | Boş sorgu ayrımı; owner scope; taslak/ek/geçmiş cursor ve retry; DB tekilleştirme; gizli sayfada polling durması; gerçek read_at; kopyalama/şikâyet/engelleme menüleri, 20sn istek sınırı ve Back/Forward taslak dönüşü. | Polling 6/25sn kalır; push/arka plan servisi yok. Gerçek hesapla menü/teslim zinciri, 100+ mesaj gerçek viewport ve iki Android cihaz klavye matrisi açık. |
| F10 — Keşfet/topluluk | Unified search owner/query cache ve stale/retry; gerçek Türkçe/literal API araması; community create/detail/event/report katmanları, 120 dışı üye araması ve gerçek yetkiler. | Kampüsüm sosyal keşif düzeni/öğrenci kabulü; bütün zincir/uzun veri görsel matrisi; community mutation'larına backend idempotency yok. |
| F11 — Kampüs araçları | İlan/fiyat/iletişim için kalıcı Pazar makbuzu, atomik kayıt/audit/bildirim; güvenli aynıkey tekrar, kayıp yanıt,410 ve listeden çıkan ilan mesajının kurtarılması; gerçekbrowser tekilanreplay. | Yedi araç/roller/katalog sözleşmesi ve cihaz matrisi; istemci disk/process kalıcılığı, medya tekilleştirmesi/nesne uzlaştırması açık. |
| F12 — Hesap/güvenlik | Gerçek safety; scoped401/owner temizliği; giriş/akademik form çift submit/geç yanıt/odak; iki Home expiry callback; silme talebi ve staff inceleme kuyruğu. | **Talep kuyruğu gerçek silme değildir.** Silme motoru, retention/R2 ve gerçek destek sorumlusu açık; kullanıcı giriş oturumu ve onboarding cihaz/alan matrisi tamamlanmadı. |
| F13 — Cihaz/performans | V2 imzalı debug APK tablete güncellendi;52 JVM kontrolü, son URL/Activity ve ağ/HTTP/timeout/TLS/renderer kurtarması; 44 browser kontrolü/31 görünüm. | Gerçek tablet açılışı ve yolculuklar, iki cihaz, TalkBack/IME/frame/decode/bellek/push ve tüm web matrisi açık. |
| F14 — Yayın | Gerçek önkoşulları ve dış kanıtı ayıran fail-closed yayın raporu; paket/DAL/artifact kontrolleri; kodla ilişkilendirilmiş açılış içerik ve olay müdahale planları. | `releaseReady=false`, `publicationAuthorized=false`. Gerçek sorumlular, geri alma tatbikatı, imzalı paket, mağaza kanalı, öğrenci kabulü, veri beyanı/silme ve yayın onayı açık. |

## Test kanıtı kayıtları

Önceki alt teslimler aşağıda tarihsel olarak korunur. Güncel 649 test, 42 browser ve Android APK kanıtları [FINAL_VERIFICATION_2026-09-05.md](FINAL_VERIFICATION_2026-09-05.md) içindedir.

Aşağıdaki gruplar birbiriyle örtüşür; sayıları toplayıp bütün site test sayısı üretmeyin. API testleri gerçek route ve SQL migration'ları kullanabilir; fresh `:memory:` SQLite ve kontrollü transport/R2 ikizleri canlı Railway, fiziksel Android veya gerçek kullanıcının teslim kanıtı değildir.

| Kanıt | Gerçekleşen koşu / kaynak | İlgili görevler ve sınır |
| --- | --- | --- |
| Ortak bileşen/katman/araç/galeri/mark | `node --test --test-isolation=none tests/brand-mark-assets.test.mjs tests/workspace-header-runtime.test.mjs tests/app-layer-runtime.test.mjs tests/campus-guide-layers-runtime.test.mjs tests/campus-tools-layers-runtime.test.mjs tests/design-lab-runtime.test.mjs` — **37/37, 0 skip**; bu alt ajanın önceki gerçek koşusu, [F05](F05_HEADER_STATUS.md), [F11](F11_TOOLS_STATUS.md). | 8 header, 5 layer, 6 Kampüs, 10 araç, 7 galeri, 1 marka. F04/F05/F11 ve galeri güvenliği; browser geometrisi değil. |
| Arama/güvenlik/katman/viewer | `tests/unified-search-runtime.test.mjs`, `tests/profile-safety-runtime.test.mjs`, `tests/app-layer-runtime.test.mjs`, `tests/post-media-gallery-runtime.test.mjs` — **4+3+5+2 = 14/14**; ana çalışma koşu bildirimi. | Eski response/owner, gerçek safety mutasyonu, Back/focus ve viewer davranışı. Bu durum belgesi ayrı log dosyası veya yeni koşu üretmedi. |
| Video lifecycle | `tests/media-lifecycle.test.mjs` — **2/2**, retry replacement dahil; ana çalışma koşu bildirimi. | Ekran dışı/background/unmount pause ve değişen node; gerçek decoder/FPS değil. |
| İç içe profil/medya regresyonu | `node --test --test-isolation=none tests/media-layer-regressions-runtime.test.mjs` — ilk **0/3**, düzeltmeden sonra genişletilmiş **5/5** ve scoped ESLint exit0; sonraki koşu ana çalışma bildirimi. | Arrow yayılımı, görünmez izolasyon, birlikte unmount, ayrı Back/Forward, bütün medyanın kaldırılması. [Kapanış ayrıntısı](F04_NAVIGATION_STATUS.md); gerçek native dialog top-layer/Android kanıtı değildir. |
| Ders dizini/detay | `course-hub-runtime + course-hub + app-layer-runtime + media-layer-regressions-runtime` — **15/15**, yeni course hub + Home + test ESLint exit0; bu alt ajanın gerçek koşusu. | 3 yeni gerçek DOM; ayrı Back/Forward/focus, Home'dan AST ile alınan gerçek Notlar/composer callback'leri, güncel course ID, owner/removed koruması. Diğer 12 test mevcut; gerçek Android/tema geometrisi değil. |
| Mobil filtre sheet | `node --test --test-isolation=none tests/workspace-filters-runtime.test.mjs tests/workspace-header-runtime.test.mjs tests/app-layer-runtime.test.mjs tests/design-lab-runtime.test.mjs tests/mobile-shell.test.mjs` — **36/36**, [F05 filtre teslimi](F05_FILTERS_STATUS.md). | 6 yeni: tek callback, aynı control/selection, Back/Forward/focus, nested detail, resize/SSR/async removal; diğer 30 mevcut test. CUA kısa ekran ve fiziksel select/IME kabulü açık. |
| Son CSS / session / giriş teslimleri | [F05](F05_CSS_OWNERSHIP.md) **41/41**, [F04 scoped401](F04_SCOPED_SESSION_REQUESTS.md) **29/29**, [F12](F12_AUTH_ONBOARDING_CHECK.md) **7/7**; son suite ProfileEditor4 ve publish runtime7 içerir. | Home12fetch ve ProfileEditor entegrasyonu, owner provider key ve replay sonrası server profil yenilemesi son yerel kayıtta; sayılar örtüşür. |
| F03 native scout | [DELIVERY](../../experiments/mobile-native-spike/DELIVERY.md) ve [makine kaydı](../../experiments/mobile-native-spike/evidence/local-checks.json): **13/13**, TypeScript/ESLint exit0, Metro **599 modül**, Hermes **1.499.786 byte**. | Expo57.0.20/RN0.86.3 yerel kaynak ve JavaScript export; Gradle/APK/AAB, native cookie, özel medya, cihaz veya native mimari seçimi değildir. |
| Topluluk/aramanın gerçek API sınırı | `node --test --test-isolation=none tests/community-requests.test.mjs tests/community-search-api.test.mjs tests/communities-flow-runtime.test.mjs tests/communities.test.mjs` — **16/16**; [F10 son teslim belgesi](F10_COMMUNITIES_SEARCH_STATUS.md). | 6 React DOM, 4 request, 4 fresh SQLite API, 2 mevcut yapısal test. 130 ek sentetik üyeyle LIMIT öncesi arama; production veri yazımı yok. |
| Gönderi idempotency | [F08 sözleşmesindeki](F08_PUBLISH_CONTRACT.md) `post-idempotency + post-media-access + post-media + migrations` koşusu **28/28** kayıtlı. | O tarihte 15 yeni + 13 regresyon; sonraki dimension entegrasyonu sonrası bütün güncel suite sonucu olarak genellenmez. Process taslağı ve upload ilerlemesi değildir. |
| Home ve kalıcı gönderi taslağı | [F08 kalıcı taslak teslimi](F08_DURABLE_DRAFTS.md): `publish-draft-runtime + profile-editor-runtime + publish-draft-store + publish-attempt + publish-upload + post-idempotency` **51/51**, hedef ESLint ve repository TypeScript exit0. | 6 composer/gerçek Home handler, 3 profil, 13 store, 4 attempt, 9 XHR, 16 SQLite API. Gerçek browser diski, çok sekme veya Android süreç yeniden açılışı kanıtı değil. |
| Hesap silme talebi | [F12 sözleşmesindeki](F12_ACCOUNT_DELETION_CONTRACT.md) `account-deletion + migrations + staff-dashboard + staff-console` koşusu **28/28** kayıtlı. | 11 yeni + mevcut regresyon; talep/iptal/review, audit rollback, gerçek staff auth. Hesap veya veri silmez. |
| Android yayın kapıları | [F14 belgesindeki](F14_RELEASE_GATES.md) `android-release-readiness + android-environment + android-app` koşusu **24/24** kayıtlı. | 6 yeni + 18 ortam/PWA; sahte boolean/ZIP/seri numarası üzerinden hazır kabul edilmesini engeller. APK/AAB veya Play başarısı değil. |
| Profil/DM/dimension/fixture | [F00](F00_TEST_DATA.md), [F06](F06_IMAGE_DIMENSIONS.md), [F07](F07_PROFILE_STATUS.md), [F09](F09_MESSAGES_STATUS.md) test dosyaları ve senaryoları belgelidir. | Bu kayıt yeni birleşik koşu sayısı tahmin etmez. 250 mesaj ID cursor testi ve profil owner/cache testleri kendi izole sınırında değerlendirilir. |

Test ortamında `jsdom@26.1.0` ayrı `scripts/mobile-quality` paketindedir. Eksik kurulum testleri sessizce skip etmez. Kendi React DOM suite'leri `test.describe` kapsamındadır; ortak helper unmount sonrasında eski global descriptor'ları geri yükler. Böylece `--test-isolation=none` altında başka dosyanın `window`/`FormData` ortamına hook sızıntısı önlenir. Bu altyapı düzeltmesinin yapılmış olması tek başına bütün repository testlerinin tekrar geçtiğini göstermez.

**Önceki tanılar final sonuç değildir:** `unit-suite.txt` kesilmiş koşu; build çakışmasındaki14 eksik dist/manifest ve sonraki5 eski AST harness hatası ayrı teşhis edildi. Son seri [529/529 exit0](LOCAL_VERIFICATION_2026-09-05.md), bu tanıları başarı toplamına eklemez. Yeşil suite gerçek viewport/Android matrisi yerine geçmez.

Son bounded review'da `tests/media-layer-regressions-runtime.test.mjs` ilk **0/3** koşuda üç gerçek React davranış hatasını ortaya çıkardı: iç medya ok tuşunun dış profil paylaşımını da değiştirmesi; seçili attachment kaldırılınca görünmez body/inert kilidi; native profil ve iç katman birlikte unmount olduğunda body overflow kilidinin kalması. Ana çalışma bunları düzeltti; aynı dosyaya ayrı Back/Forward ve bütün medya kaldırılması senaryolarını ekleyerek **5/5** yerel yeniden test ve scoped ESLint exit0 bildirdi. Bu beş senaryo **verified-local** düzeyinde kapanır; F06 fazı tamamlanmaz. Gerçek ProfileContent/Gallery/common hook kullanılır; jsdom'da native `showModal/close` yalnız open attribute ile uyarlanır, Android/native top-layer kabulü üretilmez. İlk kırmızı sonuç tarihçe olarak korunur; sonraki tam suite/build kapanışı [yerel kayıtta](LOCAL_VERIFICATION_2026-09-05.md) ayrıca belgelenir.

## CUA, galeri ve cihaz sınırı

Son [yerel kayıt](LOCAL_VERIFICATION_2026-09-05.md), verified-campus/notlar/filter320-açık, feed390-koyu, profil editor ve medya Back/inert gözlemlerini ayrı bağlar. Gerçek320px reduced-motion kaydında scroll auto, yükleyici tek tekrar, client/scroll305/305; bu fiziksel Android veya tam tema matrisi değildir.

- [Notlar 390px](../../exports/mobile-quality-implementation-2026-09-05/notes-390-header.png), [galeri feed](../../exports/mobile-quality-implementation-2026-09-05/gallery-feed-390-dark.png), [galeri mesaj](../../exports/mobile-quality-implementation-2026-09-05/gallery-messages-390-dark.png) ve [galeri medya viewer](../../exports/mobile-quality-implementation-2026-09-05/gallery-media-viewer-390.png) kaydedilmiş seçili görüntülerdir. Dosya varlığı bütün genişlik/tema/scroll/IME kabulü değildir.
- [Geometri ham kaydının](../../exports/mobile-quality-implementation-2026-09-05/mobile-route-geometry.json) **ilk 12 satırı** 390px viewport'ta yatay taşma göstermiyor; bu sınırlı snapshot bir akış kabulü değildir. **Son 3 satır** Kampüs/Notlar giriş uyarısı ve Profil yerine hesap açma yüzeyidir; oturum sona erdiği için authenticated hedef olarak geçerli değildir. **15/15 geçti denemez.** Önceki bağımsız Notlar/Kampüs/Profil kontrolleri [F04 kanıt belgesinde](F04_NAVIGATION_STATUS.md) ayrı tutulur.
- [Sentetik galeri matrisi](../../exports/mobile-quality-implementation-2026-09-05/gallery-geometry-matrix.json) 16 seçili ölçümde yatay taşma göstermiyor: 13 mobil satırda beş alt kontrol, 781/820/1440px satırlarında mobil alt kontrol yok. Altı galeri yüzü ve seçili genişlikler tam ekran×tema matrisi değildir. `theme` istenen temadır; hızlı ilk snapshot effect/medya yüklemesinden önce alınabildiği için bu kayıt tamamlanmış görsel tema kabulü değildir.
- Galeri gerçek FeedPost/Header/Navigation/Composer kullanır; açık `preview` hiçbir fetch, clipboard, native share, confirm veya gerçek delete/report başlatmaz. Production/test/tanımsız ortam `notFound` kapısına girer. Bu gate yerel testlidir; dağıtılmış production route kontrolü değildir.
- Galeri mesaj ve profil kahramanı açıkça sunum adaptörüdür; Notes ve profil takip listeleri aynı gerçek bileşenleri development-only simülasyon yanıtlarıyla kullanır. Mesaj detail yüksekliği/alt menü düzeltmesi, authenticated DM polling/teslim veya gerçek profil API kabulü sayılamaz. Root galeri ve gerçek uygulama kontrollerini ayrı yürütür.
- Ana çalışmanın CUA scroll tanısında tıklama öncesi **2107px**, aracın görünür alana kaydırmasından sonra gerçek history push/kayıt anı **1984px**, Back sonrası **1984px** ölçüldü. **Kaydedilen = geri yüklenen**; önceki 123px fark ürünün scroll kaybını doğrulamaz. Bu tek örnek 20 döngü, fiziksel dokunma veya performans ölçümü değildir; bütün dönüş kabulü açık kalır.
- Fiziksel Android cihaz bulunmadığından IME ilk Back önceliği, gesture/üç düğme, TalkBack, native kamera/galeri izinleri, process kill ve 60/120Hz ölçümleri açık. Öğrencilerle gerçek görev oturumu veya Play test kanalı kanıtı yok.

## F11'in yedi aracı

[F11 araç belgesi](F11_TOOLS_STATUS.md) kapsamı dar tutar: Notlar root; Topluluklar F10; Kampüs liste/detay; Kampüs Anlık; Kütüphane; Pazar; Eşleş. Kaydedilenler ek kapsamdır, sekizinci kampüs aracı gibi sayılmaz.

Kampüs altı ve diğer araçlar on gerçek DOM testine sahiptir. Back kendi başına post, ilan, check-in, rapor veya mesaj göndermez. String alanları form türü/gerçek hedef ve owner scope'a bağlı kontrollü taslaktır; File/File[] native picker kapanınca bellekten korunur. Busy UI/Escape kapanışı engellenebilir; sistem Back işlemi kapatır ve sonucu başarılı varsaymaz.

Konaklama katalog/deneyim yüzünün uygulaması ve 27 odaklı yerel testi [tamamlandı](F11_HOUSING_FLOW.md). Gerçek oturum kabulü, tüm yedi aracın desktop dönüşleri, içerik ömrü/anonimlik/yaş ve rol kapsamı, katalog ekibinin uzun ders adı/5–6. sınıf/yaz/eksik dönem-kaynak sözleşmesi ayrıca doğrulanmalıdır. Pazar fotoğraf tekrarları daha sonra [6 Eylül tesliminde](F11_MARKET_PHOTO_RELIABILITY.md) kalıcı yükleme anahtarı ve güvenli uzlaştırmayla tamamlandı.

## Kalıcılık, migration ve yayın sınırı

Profil/workspace/DM cache ve form taslakları varsayılan olarak uygulamanın JS oturum belleğindedir. Owner değişince özel durum temizlenir; history yalnız rota/katman ve gerekli hedef metadata'sını taşır. F08 gönderi taslağı için ayrı [IndexedDB/Home entegrasyonu](F08_DURABLE_DRAFTS.md) tamamlandı: sunucuda doğrulanmış publicId, metin/File/key, 24 saat TTL, açık geri yükleme/silme ve storage hata durumu bulunur. 401 görünür özel durumu temizleyip disk kaydını korur; başarılı açık logout tüm taslakları ve eski yazmaları geçersizleştirir. Node fake-indexeddb testleri disk kalıcılığı sağlamaz; gerçek browser kapat/aç, çok sekme ve Android süreç kabulü açıktır. Bu özel gönderi entegrasyonu diğer tüm formları kalıcı yapmaz.

Yerel migration kayıtları: [0022–0024](../../exports/mobile-quality-implementation-2026-09-05/local-migrations.json) ve [0025](../../exports/mobile-quality-implementation-2026-09-05/local-migration-0025.json). Mevcut satır sayıları korunmuş ve yerel yedekler alınmıştır; bu kayıtlar production migration uygulanmış anlamına gelmez. Uygulama yayını öncesi gerçek ortam migration sırası ayrıca doğrulanmalıdır.

Marka kaynağı değiştirilmeden 128px **11.379 byte** ve 256px **31.190 byte** transparent PNG üretildi. [Hash/metadata kaydı](F13_MARK_ASSETS.json) ve test kaynak alpha, oran, sRGB/ICC durumunu doğrular. Byte azalması cihazda decode süresi/FPS/enerji ölçümü diye sunulmaz.

F12'nin `deletionExecuted` değeri daima `false`: kullanıcı/staff talep kaydı gerçek, silme motoru yok. Ortak mesajların cascade etkisi, R2 envanteri, yedekler, meşru saklama süreleri ve gerçek destek/sorumlu bilgisi çözülmeden “hesap silme tamamlandı” gösterilemez.

F14 önkoşul aracı en son belgelenen gerçek koşuda exit 1 döndürdü; `releaseReady` ve `publicationAuthorized` false. API36, lisans, Gradle wrapper, imzalı artifact/DAL, fiziksel cihaz ve mağaza kabulü dosya/boolean ile varsayılmaz. Mevcut Railway origin kullanıcı seçimidir; geçici paket kimliği ve nihai signing/support kararları hâlâ açıktır.

F03 scout'un [çalıştırma/kapsam belgesi](../../experiments/mobile-native-spike/README.md) ve [auth/medya sözleşmesi](../../experiments/mobile-native-spike/AUTH_AND_MEDIA_CONTRACT.md) gerçek backend'e bağlanan bağımsız istemciyi açıklar. UI mock veri modu içermez; yayın ve özel Image probe varsayılan kapalıdır. Gerçek POST login ardından aynı hesabın GET profile doğrulaması olmadan özel ekranlara geçilmez. Yerel 13 testin fake transport'u gerçek native cookie jar taşıması değildir. Bu teslimde gerçek kullanıcı girişi, production mutasyonu, SDK lisansı, APK/AAB veya deployment yoktur. İlk F03 ortam belgesinin deneme henüz yok açıklaması bu sonraki yerel teslimle güncellenir; cihaz ve ADR kapıları kapanmaz.

## Belgelerin zaman sınırı ve sıradaki kapılar

Belgeler teslim anının kayıtlarıdır. Örneğin F07 belgesindeki eski thumbnail fallback eksikliği, F09'un son tamamlayıcı düzeltmesinde giderildi. F11 Kampüs belgesindeki eski 4 common-layer + 6 Kampüs sayısı, son common-layer remount testiyle 5+6 oldu; güncel birleşik 37 testi F05/F11 araç belgesi kaydeder. F10'un ara 12 test sonucu son 16 testlik teslimle güncellendi. Eski kayıtların sayılarını toplayarak yeni toplam üretilmez.

Sıradaki kapanışlar:

1. Yerel 529/529, build/lint/TypeScript kapanışı alındı; F06/F04 bütün gerçek viewport, async geri dönüş ve 20 döngü matrisi ayrı tamamlanmalı.
2. F08'in tamamlanan hesap kapsamlı IndexedDB/Home, ilerleme/iptal ve aynı girişimle retry entegrasyonunu gerçek browser geri yükleme/disk/ağ ve çok sekmeli oturum senaryosuyla doğrulamalı; ardından Android process ve düşük depolama kabulünü almalı.
3. F11 yedi araç/katalog/masaüstü matrisi ve F05 bütün piksel/tema kabulü ayrıca kapanmalı. Notlar→Topluluklar→Kampüs CSS sahipliği teslimi [ayrı belgede](F05_WORKSPACE_CSS.md) tamamlandı; cascade testleri tarayıcı matrisinin yerine geçmez.
4. F03 mevcut sınırlı native scout üzerinde gerçek cookie/medya ve TWA cihaz karşılaştırması yapılıp ölçümlü ADR yazılmalı; ardından F13 gerçek cihaz/TalkBack/IME/performance ve F14 öğrenci/operasyon/mağaza kapıları uygulanmalı.

Bu liste uygulama ilerlemesini durdurmaz; hangi yerel sonucun hangi dış kabulü henüz sağlamadığını görünür kılar.


## Son devam teslimi — akış, mesaj menüleri ve ölçüm

[F06 yenileme](F06_FEED_REFRESH.md), [gönderi etkileşimleri](F06_POST_INTERACTIONS.md), [F09 bağlam menüleri](F09_CONTEXT_ACTIONS.md), [F00 web ölçümü](F00_WEB_MEASUREMENT.md) ve [200 kapalı katmanın dinleyici yükü](F13_LAYER_LISTENERS.md) tamamlanan yerel alt çıktılardır. Akışta iki sayfa/cursor arka plan yenilemesiyle silinmez; beğen/kaydet tekrarında istenen durum korunur. Rapor ve silme paneli Back/odak ile çalışır; geç gelen eski owner veya timeout yanıtı uygulanmaz. Mesaj menüleri gerçek kopyalama/rapor/engelleme sınırlarına bağlıdır.

[Açılış içerik planı](F14_LAUNCH_CONTENT_PLAN.md) ve [olay müdahale planı](F14_INCIDENT_RESPONSE_PLAN.md) kodla ilişkilendirildi. Gerçek sorumlular, destek kanalı ve kohort alanları boş; plan işletilmiş veya mağaza yayımlanmış sayılmaz. `maintenanceMode` genel API yazma kilidi değildir, yalnız duyuru gösterir.

Son birleşik koşu **529/529**, build, TypeScript, geniş ESLint ve worker/manifest kontrolü geçer. Tarayıcı galerisinde açık/koyu 320/390 panel ölçümleri, Back/Forward ve taslak dönüşü doğrulandı. Gerçek hesap sekmesi son kontrolde hâlâ giriş/kayıt ekranındaydı; kullanıcı “tamam” yanıtı girişin tamamlandığı kanıtı sayılmadı. Gerçek hesap disk/mesaj zinciri, Android SDK lisansı, iki cihaz ve bütün faz kabulü açık.


## Son devam — Notlar, ilişkiler, konaklama ve CSS

[Notlar](F11_NOTES_FLOW.md) kompakt belge kartı, koyu tema eylemleri, hedef taslağı ve API tutarlılığıyla genişledi. [Takipçi listeleri](F07_RELATIONSHIPS.md) gerçek arama/sayfalama/görünürlük ve sunucu sayaçlarına bağlı. [Konaklama](F11_HOUSING_FLOW.md) kaynak kataloğunu öğrenci deneyiminden ayırır ve ortak geri/ekleme sözleşmesini kullanır. [CSS sahipliği](F05_WORKSPACE_CSS.md) Notlar→Topluluklar→Kampüs için taşındı; yeni kart/overlay tasarımı eşdeğerlik refaktöründen ayrı tutuldu.

Yeni dinamik izolasyonun kardeş/portal katmanı yanlış pasifleştirmesi gerçek testte yakalanıp düzeltildi;20 odaklı kontrol geçti. Son standart build, TypeScript, geniş lint ve artifact kontrolü exit0; **593/593** bütün suite geçer. Galeri CUA sınırları ve başarısız ara koşular [yerel kayıtta](LOCAL_VERIFICATION_2026-09-05.md) korunur. Gerçek hesap, bütün mobil/desktop matrisi, fiziksel Android, ADR ve Play kabulü açık;15 fazın tamamlandığı iddia edilmez.

## 6 Eylül — kalan altı kod işi

Güncel sıra ve kabul kayıtları [ayrı planda](REMAINING_CODE_PHASES_2026-09-06.md) tutulur. Kalıcı Pazar taslakları ve fotoğraf yükleme güvenilirliği tamamlandı: ikinci fazın son kaynak koşusunda77 otomatik test ve4 gerçek Chrome kontrolü geçti. TypeScript ve lint exit0; Vinext build tamamlandı ve oluşan uygulama gerçek tarayıcıda kullanıldı. Bu koşuda build çıkış kodu ayrıca kaydedilemedi; başarı tamamlanma çıktısı ve çalışan build üzerinden doğrulandı.

[Cihaz bildirimlerinin](PUSH_NOTIFICATIONS.md) kod fazı tamamlandı:76 web/sunucu testi, TypeScript, lint, build ve4 Chrome kontrolü geçti. Android'de9 store birim testi ve100 ayrı JVM kontrolü geçti; v3 debug APK derleme, lint ve imza kontrolünden geçti. Firebase Android kaydı hazır ve gerçek Google OAuth yetkilendirmesi200 döndü. Fiziksel cihaza bildirim teslimi ve Railway dağıtımı henüz doğrulanmadı. Kamera/dosya/paylaşma işi sıradadır. Yukarıdaki eski593 test sonucu sonraki bütün kaynak değişikliklerinin geçtiği anlamına gelmez.
