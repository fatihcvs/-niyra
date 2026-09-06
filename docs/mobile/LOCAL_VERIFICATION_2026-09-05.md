# 5 Eylül 2026 — Yerel doğrulama

Bu tarihsel koşumun ardından 649 test, 42 gerçek yerel API/browser kontrolü ve debug Android APK doğrulaması tamamlandı. Güncel kayıt [FINAL_VERIFICATION_2026-09-05.md](FINAL_VERIFICATION_2026-09-05.md); aşağıdaki önceki kanıtlar korunur.

Bu kayıt mevcut ortak çalışma kopyasının yerel kanıtıdır. **15 fazın tamamı `acceptance: open` kalır.** Ayrıntılı kapsam [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) ve değişmeyen 105 görev [phase-progress.json](phase-progress.json) içindedir. Push, deployment veya mağaza yayını yapılmış sayılmaz.

## Derleme ve test

| Kontrol | Son mevcut kanıt | Sınır |
| --- | --- | --- |
| Vinext build | Standart npx vinext build **exit0**; [build.txt](../../exports/mobile-quality-continuation-2026-09-05/build.txt) ve [süreç sonucu](../../exports/mobile-quality-continuation-2026-09-05/build-exit.txt). | Kaynak katman düzeltmesinden sonra alınmış yerel build; deploy değildir. |
| Build artifact | [artifact-validation.json](../../exports/mobile-quality-continuation-2026-09-05/artifact-validation.json): hostingManifestValid=true, workerDefaultFetch=true, deployed=false. | Manifest/worker giriş noktası; production health veya auth değil. |
| Repository TypeScript | **exit0**; [typecheck.txt](../../exports/mobile-quality-continuation-2026-09-05/typecheck.txt) boş, [süreç sonucu](../../exports/mobile-quality-continuation-2026-09-05/typecheck-exit.txt). | Yerel kaynak kontrolü; cihaz kabulü değil. |
| Build sonrası bütün *.test.mjs suite'i | [unit-suite.txt](../../exports/mobile-quality-continuation-2026-09-05/unit-suite.txt): **593/593, 0 fail/cancelled/skip, exit0**,101.733 saniye; [süreç sonucu](../../exports/mobile-quality-continuation-2026-09-05/unit-suite-exit.txt). | Gerçek route/ReactDOM ve kontrollü yerel veri; kullanıcı veya Android kanıtı değil. |
| Geniş ESLint | Bütün app lib db tests **exit0**; [lint.txt](../../exports/mobile-quality-continuation-2026-09-05/lint.txt) boş, [süreç sonucu](../../exports/mobile-quality-continuation-2026-09-05/lint-exit.txt). Son CSS test dosyası yolu düzeltmesi ayrıca scoped lint exit0. | Statik kontrol; browser/cihaz kabulü değil. |


Önceki 484 testlik teslimin build kaydı uygulama kaynaklarından sonra alınmıştı: page18:40:50, product-features18:39:31, helper18:35; build18:43:20. Son test harness uyarlamaları ardından suite, lint ve TypeScript tekrar geçti. Saatler ana çalışmanın yerel dosya kontrolüdür. Ortak çalışma kopyası immutable test commit'i değildir. Normal Git ayarıyla `git diff --check` exit0; CRLF dönüşüm bildirimleri hata değildi. Geçici `core.autocrlf=false` tanısının CRLF'yi trailing whitespace sayması ürün regresyonu değildir.

Önceki kırmızı koşular final başarıya eklenmez: `unit-suite.txt` kesilmiş tanı koşusu; build ile eşzamanlı 465 testlik koşunun 14 hatası `dist` yenilenirken eksik worker/manifest kaynaklıydı. İlk seri 484 testlik koşunun beş hatası eski `fetch` adını arayan AST test harness'leriydi; `authenticatedFetch` entegrasyonuna uyarlandı, ilgili odaklı 15 test geçti. Önceki unit-suite-final.txt 484/484 tekrarının kaydıdır; yukarıdaki followup dosyası yeni 529/529 koşudur. Bu ayrım, ilk üç gerçek nested medya hatasının uygulama düzeltmesini yok saymaz; onların [0/3 → 5/5 kapanışı](F04_NAVIGATION_STATUS.md) ayrıca kayıtlıdır.

## Son dar teslimler

- [F05 CSS sahipliği](F05_CSS_OWNERSHIP.md): **41/41**. Header/nav son kuralları `mobile-app.css` sahibine taşındı; yalnız taşınan override'lar kaldırıldı. Hareket dosyası geometriyi yeniden tanımlamıyor. Notlar→Topluluklar→Kampüs bütün cascade temizliği tamamlanmadı.
- [F12 giriş/akademik kurulum](F12_AUTH_ONBOARDING_CHECK.md): **7/7**. Çift submit, eski yanıt, hata/taslak ve adım odağı; iki Home çağrısında gerçek `onSessionExpired` bağlı. Gerçek hesap giriş/kayıt oturumu bu testlerin yerine geçmez.
- [F04 scoped session](F04_SCOPED_SESSION_REQUESTS.md): **29/29** alt sayfa/helper grubu. Aktif 401 ana oturum akışına döner; eski owner/abort yanıtı yeni hesabı kapatamaz. Ana çalışma Home'un 12 fetch çağrısını ve ProfileEditor'u da bağladı; ana provider owner/session key ile özel component state'ini yeniden kuruyor.
- ProfileEditor **4** ve publish runtime **7** senaryoya genişledi: gerçek profil/medya 401 ve gecikmiş yanıt koruması; replay başarısında gönderi sayısını kör artırmak yerine sunucudan profil yenileme. Bu sayılar son birleşik suite'in alt kümeleridir, ayrıca toplanmaz.
- Ders dizini/detay Back/focus ve gerçek Home callback'leri **15/15** grupla doğrulandı. F08 Home/IndexedDB/ilerleme entegrasyonunun önceki **51/51** teslimi [kalıcı taslak belgesindedir](F08_DURABLE_DRAFTS.md); gerçek disk/process kabulü ayrıdır.

## Seçili CUA kanıtı

[Kampüs 320 açık](../../exports/mobile-quality-implementation-2026-09-05/verified-campus-320-light.png), [Notlar 320 açık](../../exports/mobile-quality-implementation-2026-09-05/verified-notes-320-light.png), [Notlar filtresi](../../exports/mobile-quality-implementation-2026-09-05/verified-notes-filter-320-light.png), [Akış 390 koyu](../../exports/mobile-quality-implementation-2026-09-05/verified-feed-390-dark.png) ve [profil editörü önce](../../exports/mobile-quality-implementation-2026-09-05/profile-editor-390-before.png)/[sonra](../../exports/mobile-quality-implementation-2026-09-05/profile-editor-390-after.png) ayrı kayıtlardır. Ana çalışma galeri gönderi medyasında Back sonrası inert kalmadığını bildirdi; gerçek hesapla ProfileEditor Back/taslak kontrolü ayrı gözlemdir. Ekran dosyaları, bütün rol/tema/genişlik veya giriş oturumu kabulü değildir.

[320px canlı reduced-motion kaydı](../../exports/mobile-quality-implementation-2026-09-05/reduced-motion-browser.json): açık tema, uygulama tercihi true, kök scroll `auto`, yükleyici `1e-05s` ve tek tekrar, client/scroll **305/305**; beş alt hedef yaklaşık **59.4×58px**. Fiziksel Android veya frame/decode performansı ölçülmedi.

İlk [bölüm geometri kaydı](../../exports/mobile-quality-implementation-2026-09-05/mobile-route-geometry.json) **12 sınırlı ölçüm + oturum sonlandıktan sonraki 3 geçersiz hedef** olarak kalır; 15/15 akış kabulü değildir. [Galeri 16 geometri örneği](../../exports/mobile-quality-implementation-2026-09-05/gallery-geometry-matrix.json) sentetiktir; `theme` istenen tema olduğundan ilk snapshot'lara görsel tema kabulü atanmaz. Scroll örneğinde tıklama öncesi2107, gerçek push1984, Back1984: **kaydedilen = geri yüklenen**; 20 döngü veya performans kanıtı değildir.

## Açık kapılar

Kullanıcının geçerli giriş oturumu ile kalan authenticated akışlar; gerçek tarayıcı disk/çok sekme/process; Android SDK lisansı ve gerekli paketler; iki fiziksel cihaz, IME/TalkBack, gerçek cookie/özel medya ve ölçümlü ADR; öğrenci kabulü; gerçek silme motoru, retention ve sorumlu destek bilgisi; imzalı paket/DAL, Play hesabı/kanalı/veri beyanı ve yayın onayı. `deletionExecuted=false`, `releaseReady=false`, `publicationAuthorized=false` sınırları korunur.


## Devam tesliminin kapanışı

Son `build-followup.txt` kaynak düzenlemeleri dondurulduktan sonra üretildi; ardından TypeScript, geniş ESLint ve 529 test doğrulandı. İlk 529 koşuda yalnız galeri fixture'ı asenkron history kapanışı bitmeden yeni owner mount ettiği için bir kontrol bulunamadı. `unit-suite-followup-before-history-wait.txt` bu başarısız tanıdır. Test önce dialog'un gerçekten kapanmasını gözleyerek yeni fixture'a geçecek şekilde düzeltildi; 19 odak test ve sonraki **529/529** suite geçti. Üretim kodu bu hata için değiştirilmedi. Build ile test çakıştırılmadı.

[F06 gönderi](F06_POST_INTERACTIONS.md): 12 runtime + 7 galeri + 5 API testi son suite'in alt kümeleridir. [F09](F09_CONTEXT_ACTIONS.md) 43 odaklı, [F00](F00_WEB_MEASUREMENT.md) 11 odaklı, [ortak katman](F13_LAYER_LISTENERS.md) 72 odaklı sonuçlar da aynı suite içinde örtüşür; ayrıca toplanmaz.

CUA gönderi rapor paneli 320×568'de x0/y163/w320/h405; eylemler48px ve taşma yok. Mesaj menüsü390×844'te x0/y545.03/w390/h298.97, eylemler48–52px; rapor320×568'de x0/y53.44/w320/h514.56. Back rapor→menü→konuşma olarak çalıştı; Forward taslağı geri getirdi. İlk HMR sırasında alınan kesintili zincir kabul sayılmadı, sabit kaynakla tekrar doğrulandı. Mesaj galeri overlay'ini yanlışlıkla flex yapan geniş CSS seçicisi daraltıldı. Kanıt: `dm-context-browser.json`, `dm-context-390-dark.png`, `dm-report-320-dark.png`, `post-report-320-light.png`, `post-report-320-dark.png` aynı exports dizininde. Bütün bu veriler açık simülasyon; gerçek rapor, block veya mesaj gönderilmedi.

`web-metrics-gallery-session.json` manuel başlatılıp durdurulmuş 24 örnek taşır: iki click64/24ms, iki history-scroll matched ve delta0. Oturum ömrü70.5195sn CUA beklemesi de içerir ve uygulama gecikmesi değildir. INP, fiziksel Android FPS/ANR veya üretim kabulü çıkarılmaz. Ölçüm panelinin HMR sonrası eski 'kayıt açık' görüntüsü düzeltildi; veri kontrolü yeni temiz oturumla yapıldı.

## Son devam teslimi — Notlar, takip listeleri, konaklama ve katman sırası

[Notlar](F11_NOTES_FLOW.md), [ilişki listeleri](F07_RELATIONSHIPS.md), [konaklama](F11_HOUSING_FLOW.md) ve [CSS sahipliği](F05_WORKSPACE_CSS.md) yerel kapsamları tamamlandı. F05-06/F07-04/F11-03 görevleri verified-local oldu:22 yerel doğrulanmış,68 kısmi,3 sürüyor,3 bekleyen,9 dış kanıt bekleyen görev. Toplam105 ve bütün15 fazın kabulü open kalır. Sayılar tamamlanma yüzdesi değildir.

Son tam suite önce ders detayında takıldı. Gerçek hata, alt pencerenin yeni kardeş/portal pencereyi inert yapmasıydı. Hatalı DOM eşitlik kontrolünün büyük nesneyi biçimlendirmesi de raporlamayı CPU ile bekletiyordu. Katman sırası düzeltildi, iki regresyon eklendi; [20/20 odaklı kanıt](../../exports/mobile-quality-continuation-2026-09-05/layer-stack-focused.txt). Önceki galeri izolasyon JSON kayıtları bu ek düzeltmeden öncedir; değişiklik sonrası yeni CUA ayrıca belirtilir.

Sonraki593 testlik koşunun tek hatası, taşınmış Kampüs kurallarını hâlâ globals.css içinde arayan eski source testiydi. Assertion kaldırılmadı; gerçek campus-workspace.css sahibine bağlandı.18 CSS testi geçti. [592/593 tanı kaydı](../../exports/mobile-quality-continuation-2026-09-05/unit-suite-before-css-test-owner-fix.txt) başarı sayılmaz. Kaynak dondurulduktan sonra standart build exit0, ardından yeni **593/593** suite geçti. Build ile suite çakıştırılmadı.

Bir dev/derleme açılışı bekledi; eşzamanlı süreçler kapatıldıktan sonraki sınırlı hook tanısı36.952 saniyede tamamlandı ve standart build de geçti. Kök neden kesinleşmedi; plugin/ürün kaynakları bu tanı için değiştirilmedi. Önceki build beklemesi son başarıya eklenmez. Normal git diff --check exit0; Notes satırındaki gerçek trailing whitespace temizlendi.

CUA bu turda açık geliştirme galerisidir: gerçek NotesWorkspace ve ProfileRelationshipStats, açıkça sentetik veriler.390 koyu Notes önce/sonra aynı ölçüde birlikte karşılaştırıldı;320 açık detayda tek iç scroll,48px kapatma ve yorum taslağı dönüşü;320 koyu filtrede sonradan eklenen arka plan izolasyonu;320 açık takipçi aramasında Back/Forward ile Ece sorgusunun korunması kaydedildi. Gerçek upload, mesaj, rapor veya takip mutasyonu yapılmadı. Konaklama gerçek hesapla CUA kabulü açık;27 odaklı testi bunun yerine geçmez.

## Son kontrol durumu

Son standart üretim derlemesi exit0 ve derlemeden sonraki tam test koşusu **593/593** olarak doğrulandı. Önizleme sunucusu yeniden başlatıldı; [preview-health.json](../../exports/mobile-quality-continuation-2026-09-05/preview-health.json) HTTP200 ve beklenen sayfa başlığını doğrular. Bu HTTP kontrolü kullanıcı arayüzü veya akış testi değildir.

Son CUA kernel başlatması ve bir sıfırlama sonrası tekrar, kernel dosyaları yazılırken sistem yolunun bulunamaması hatasıyla durdu. Bu nedenle ek kardeş/portal katman düzeltmesinden sonra yeni tarayıcı testi yapılmadı; 390 koyu ve 781 genişlikte profil görüntüsü de alınmadı. Önceki 320/390 galeri kayıtları bu son düzeltmeden öncedir. Codex içinde önizlemeyi açma isteği queued döndü; görünür açılış doğrulanmış sayılmaz.
