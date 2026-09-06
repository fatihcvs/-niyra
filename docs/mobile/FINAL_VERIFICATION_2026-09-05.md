# 5 Eylül 2026 — Tablet APK ve son yerel doğrulama

Bu kayıt önceki aynı tarihli doğrulama kayıtlarının sonrasındadır. Branch `codex/cyprus-catalog-expansion`, başlangıç HEAD `408b52b2d9d25b393790346a3f5af70d0ec8f317`; ortak çalışma kopyası hâlâ yayımlanmamış değişiklikler içerir. Push/deploy/Play yayını yapılmadı. 15 fazın genel kabulü açıktır.

## Son kapılar

| Kontrol | Sonuç / kanıt |
| --- | --- |
| Bütün `tests/*.test.mjs` | **649/649**, 0 fail/cancel/skip; 215,559 saniye. `exports/mobile-quality-final-2026-09-05/unit-suite.txt` ve `unit-suite-exit.txt`. |
| TypeScript | `tsc --noEmit --incremental false`, exit0; aynı dizinde `typecheck.txt` ve `typecheck-exit.txt`. |
| ESLint | `app lib db tests scripts/mobile-quality`, exit0; `lint.txt` ve `lint-exit.txt`. |
| Vinext build | Bundled Node **24.19.0**, Vinext CLI build exit0; `build.txt` ve `build-exit.txt`. Önceki yavaş/kesilmiş denemeler başarı kanıtı değildir. |
| Derleme varlığı | Son build'in hosting JSON'u ve Worker `default.fetch` dışa aktarımı doğrulandı; `artifact-validation.json`, deployed=false. |
| Whitespace | Normal `git diff --check`, exit0; `diff-check.txt` ve `diff-check-exit.txt`. Windows LF/CRLF bildirimleri hata değildir. |
| Gerçek yerel API / Chrome | **42/42**, **31** bölüm/boyut/tema kontrolü. `exports/isolated-mobile-qa/browser/final-1788640435788/report.json`. |
| Ortak kontroller galerisi | **8/8**, 320/390/800/1280 × açık/koyu; `exports/mobile-quality-continuation-2026-09-05/shared-ui-browser/matrix.json`. Yeni font düzeni sonrasında tekrar geçti. |
| Android debug | `assembleDebug`, lint ve apksigner başarılı. `outputs/android-preview/artifact-checks.json` ve `artifacts/build-receipt.json`. |
| APK indirme | HTTP200, APK MIME/attachment, indirilen dosyanın SHA-256 eşleşmesi; `outputs/android-preview/artifacts/lan-download-check.json`. Tablet kurulumu değildir. |

649 testlik kapı 26 numaralı medya migration'ı, yeni içerik hedefleri, Pazar kurtarma, çoklu medya, ortak kontroller ve font varlıkları testlerini içerir. İlk koşumdaki altı başarısızlık saklandı: dört eski test sözleşmesi, yeni bağımlılıkları eksik mesaj fixture'ı ve teknik iptal mesajı gösteren arama hata yolu. Fixture'lar gerçek yeni sözleşmeye taşındı; arama oturum sonlanmasını anlaşılır metinle gösterir. Üretim izin kontrolleri gevşetilmedi. Aradaki kullanıcı devam mesajıyla kesilen koşum tamamlanmış sayılmadı.

## Gerçek tarayıcı kanıtı

İzole Worker/D1/R2 yalnız `exports/isolated-mobile-qa/state` kullanır. Sentetik hesaplar normal kayıt/profil API'leriyle oluşturulur, gerçek giriş formundan oturum açılır; çerez enjekte edilmez, ağ yanıtı taklit edilmez. Kimlik bilgileri rapora yazılmaz.

15 ana bölüm ve seçili 320/390/800/1440 görünüm/tema durumları ölçüldü. Yatay taşma, başarısız ağ isteği, eksik statik dosya veya JavaScript çalışma hatası yok. 11 Geist font yüzü HTTP200 ve loaded durumunda. Dört konsol HTTP kaydı özellikle sınanan üç oturum401 ve farklı kampüsteki gizli gönderi404 sonucudur.

İki gerçek fotoğraf seçilip sırası değiştirilerek arayüzden yayımlandı; API201, yeniden yüklenen sıra, görüntü decode ve viewer Sonraki kontrolü geçti. Profil not bağlantısı tek Geri/İleri ile döndü. Gerçek ilan, kampüs etkinliği, topluluk etkinliği ve mesaj kimliği hedefleri açıldı. Geçerli PDF yanıtının MIME/byte başlığı ve ayrıntısı doğrulandı; son not ekranında belge metni de gözle görüldü. Logout401, formdan yeniden giriş, hesap/kampüs değişimi ve özel R2 medya reddi geçti.

Ortak kontrol galerisi API mutasyonu yapmaz. Klavye sekmeleri, 48px ölçülen hedefler, görünür Diğer ikonu/callback, Toast kapatma/busy/reduced-motion, Sheet taslağı ve Back/Forward ayrı kontrol edildi. Gerçek API tarayıcı kanıtıyla galeri simülasyonu birbirinin yerine geçmez.

## Yerel veri ve Android paketi

Tablet için kullanılan normal yerel önizleme D1'inde yeni medya sütunu eksikti. Tutarlı SQLite yedeğinin ardından yalnız ekleyici 0026, resmî Wrangler `--local` ile uygulandı. `outputs/local-preview-backups/0026-1788639830669/postflight.json`: integrity=ok, önceki tablo satır sayıları ve FK ihlal sayısı aynı, tam bir migration eklendi. Önceki 0022–0025 ledger'ına dokunulmadı; daha eski baseline migration'ları tekrar oynatılmadı. Railway/üretim verisine işlem yapılmadı.

Google SDK lisans sorusuna verilen “devam et” onayından sonra yalnız API36 ve Build Tools36 paketleri kuruldu. **Kampira Test** APK'sı `app.kampira.preview`, min23/target36, yalnız INTERNET izinli debug pakettir; 38.724 bayt. SHA-256 `6c4ef99b4f949debbb29a436b2404ba12354fc402658da29cd125919c18ff078`. Android lint 0 hata/4 uyarı: eski API manifest uyumluluğu, yeni Gradle sürümü önerisi ve mevcut kare PNG simge.

APK aynı ağdaki `http://192.168.0.4:5173` kaynağına bağlanır; tek dosyalık indirme sunucusu 5174 portundadır. Kaynak/derleme/çerez/indirme sınırları [Android proje belgesinde](../../experiments/android-preview/README.md), cihaz ve politika gözlemleri [tablet kaydında](F03_TABLET_PREVIEW_STATUS.md) açıklanır. Sonraki açık kullanıcı isteğiyle ADB kurulumu `Success`, exit0 döndü; `outputs/android-preview/artifacts/tablet-install-check.json` kanıtıyla tablet kurulumu doğrulandı. Uygulama açılışı ve cihaz akışları henüz doğrulanmadı.

## Açık kalan kabul

Bu sonuçlar native mimari seçimi, gerçek cihaz IME/TalkBack/frame/bellek/push, kamera/arka plan/süreç dönüşü, ikinci cihaz, öğrenci kullanılabilirlik oturumu veya Google Play kabulü değildir. Debug WebView kabuğunda oturum gerektiren dosyayı dış tarayıcıda indirme ve blob dışa aktarma sınırları açıkça gösterilir. Gerçek hesap silme motoru, retention ve destek e-postası da hâlâ dış karar/uygulama gerektirir. `releaseReady=false`, `publicationAuthorized=false` korunur.
