# Kampira Test — yalnız debug tablet önizlemesi

6 Eylül devamı: ana belge hata/yeniden dene ve güvenli son URL geri yüklemesi **v2** pakette geliştirildi. Ayrı çıktı `outputs/android-preview/artifacts/f03-recovery-v2/`; önceki v1 APK/kurulum kayıtları korundu. [F03 değişiklik ve doğrulama kaydı](../../docs/mobile/F03_ANDROID_RECOVERY_CONTINUATION.md) v2'nin build kanıtını ve henüz yapılmamış cihaz kontrollerini ayırır. Aşağıdaki 5 Eylül APK kanıtı ilk pakete aittir.

Bu küçük Java/WebView projesi, henüz yayımlanmamış mevcut Kampira arayüzünü tablette **uygulama paketi içinde denemek** içindir. Kalıcı Android mimarisi kararı, TWA/Expo geçişi veya Google Play paketi değildir. Paket kimliği `app.kampira.preview`, görünen adı **Kampira Test**. Üretim Kampira paketine veya hesabın çerezlerine dokunmaz.

## Derleme için hazır kaynak

- Android Gradle Plugin **8.13.2**, Gradle **8.13**, JDK **17**; `minSdk=23`, `compileSdk=36`, `targetSdk=36`, Build Tools **36.0.0**. AGP 8.13, API 36.1'e kadar destekler ve Gradle 8.13/JDK17 ister. [Resmî uyumluluk tablosu](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- Gradle wrapper resmî `v8.13.0` kaynağından alındı. JAR SHA-256 `81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f`; dağıtım ZIP SHA-256 `20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`. Wrapper ve dağıtım doğrulaması sabitlenmiştir. [Gradle dağıtımları ve checksum dosyaları](https://services.gradle.org/distributions/)
- Release variant'ları kapalıdır; release adlı task çalıştırma ayrıca reddedilir. `RELEASE_READY=false`, Activity `BuildConfig.DEBUG` kontrolü yapar.
- `android.builder.sdkDownload=false` ve JVM otomatik indirme kapalıdır. Build script lisans kabul etmez, SDK paketi yüklemez, ADB çağırmaz. [SDK otomatik indirmesini kapatma](https://developer.android.com/studio/intro/update)

## Seçili kaynak

Derleme **zorunlu** origin parametresi alır. Güncel yerel arayüz için `http://192.168.0.4:5173`; bilgisayardaki sunucu açık ve tablet aynı ağda olmalıdır. Önceki Railway kararı değiştirilmez; yayımlanmamış yeni arayüzün yerine eski canlı siteyi yüklemekten kaçınmak için bu test paketi yerel kaynağa açıkça bağlanır.

Tablet önizlemesinde aynı 5173 adresi, hazır `dist/server` + `dist/client` derlemesini yerel Worker olarak sunar:

```powershell
node experiments/android-preview/start-site.mjs
```

5173 doluysa bu komut başka süreci sonlandırmadan durur. Derleme veya migration çalıştırmaz; mevcut `.wrangler/state`, `site-creator-d1`/aynı placeholder D1 kimliği ve `site-creator-r2` bağlarını korur. Üstteki site için yalnız yerel Wrangler `--local --no-bundle` çalışır; normal uygulama giriş akışı devam eder. Harici sağlayıcı kimlik bilgilerini yüklemez. Kaynak değişirse önce ayrı web derlemesi gerekir. Başlatma/PID kaydı ve son HTTP kanıtı `outputs/android-preview/local-site/` altındadır. 5 Eylül geçişinden sonra LAN ana sayfa ve `/api/health` 200 döndü; bu bilgisayar kontrolü fiziksel tablet testi değildir.

HTTP sadece açıkça seçilen private/loopback IPv4 için kabul edilir. Debug Network Security Config yalnız seçili host'a cleartext izni verir; temel politika kapalıdır. WebView ayrıca scheme + host + port'u karşılaştırır. Android 6/API23 domain Network Security Config kullanamadığından HTTP preview kapalı kalır; API23 için HTTPS kaynak gerekir. [Network Security Config](https://developer.android.com/privacy-and-security/security-config)

```powershell
# Yalnız mevcut bileşenleri raporlar; lisans, indirme, derleme veya cihaz işlemi yok.
powershell -File experiments/android-preview/build-preview.ps1 -Origin http://192.168.0.4:5173 -CheckOnly

# Eksik SDK paketleri kullanıcı onayıyla kurulduktan sonra debug APK + lint + imza kontrolü.
powershell -File experiments/android-preview/build-preview.ps1 -Origin http://192.168.0.4:5173
```

Sonraki test derlemelerinde mevcut APK ve kurulum geçmişini korumak için `-ArtifactId yeni-bir-kimlik` kullanılır. Aynı kimlik altında mevcut build makbuzu varsa script üzerine yazmaz.

Başarılı derlemenin hedefi `outputs/android-preview/artifacts/kampira-test-debug.apk`; yanında SHA-256 içeren `build-receipt.json` oluşur. Android'in standart debug imzası kullanılır, üretim/upload anahtarı kullanılmaz. Gradle ve Android kullanıcı çalışma dizinleri yalnız bu çağrıda `outputs/android-preview/` altında tutulur; işlem sonrasında environment eski hâline gelir.

APK gerçekten üretildikten sonra aynı Wi-Fi ağındaki tabletten elle indirmek için:

```powershell
node experiments/android-preview/serve-apk.mjs --host 192.168.0.4 --port 5174
# Tablette açılacak tek indirme adresi: http://192.168.0.4:5174/kampira-test-debug.apk
```

Bu komut APK yoksa başlamaz; debug makbuzu, başarılı imza kontrolü kaydı ve dosyanın SHA-256 eşleşmesini kontrol eder. Doğrulanan baytları bellekte sabitler; yalnız bu tek dosyayı Android APK MIME türü ve attachment başlığıyla sunar. Dizin listesi, kaynak deposu, build makbuzu veya farklı dosyalar sunulmaz. Bilgisayara ait açıkça seçilen private IPv4 arayüzüne bağlanır; firewall ayarı değiştirmez. Kullanıcı tablette indirdiği dosyayı Android paket yükleyiciyle kendisi açar; sunucu Ctrl+C ile kapatılır. Kaynak hazırlığı sırasında bu sunucu başlatılmamıştır.

## Çalışan kodun sınırları

- WebView yalnız seçili origin'in üst seviye sayfalarını yükler. Dış HTTP(S), mailto/tel bağlantıları Android `ACTION_VIEW` ile dış uygulamaya gider; JavaScript bridge, intent URL, yerel dosya gezinmesi, kamera/mikrofon/konum izni yoktur. HTTPS hata sertifikaları kabul edilmez.
- Çerezler normal WebView `CookieManager` tarafından saklanır; HttpOnly çerezler JavaScript'e aktarılmaz, oturum enjekte edilmez. Uygulamada kullanıcı normal giriş yapmalıdır. Tarayıcı ve WebView oturumları ayrıdır. [WebView gezinme ve veri ayrımı](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- Dosya seçimi Android `ACTION_OPEN_DOCUMENT` üzerinden, kullanıcı seçimiyle tekli/çoklu görsel/video ve desteklenen ders belgelerini açar. Dönen URI'nin `content` şeması, okuma izni ve MIME türü kontrol edilir; iptal/eski callback/Activity kapanışı null ile sonlandırılır. Geniş depolama izni veya kalıcı URI izni alınmaz. Seçim/gerçek yükleme cihazda henüz doğrulanmamıştır. [WebChromeClient dosya seçici sözleşmesi](https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,android.webkit.ValueCallback%3Candroid.net.Uri[]%3E,android.webkit.WebChromeClient.FileChooserParams))
- Sistem çubuğu/çentik/IME insets native view'a uygulanır; WebView yüksekliği klavye ile değişir. Android Back önce IME'yi, ardından gerçek WebView geçmişini kullanır. Rotasyonda WebView korunur; Activity state'inde geçmiş saklanır. Fiziksel cihaz davranışı ayrıca ölçülmelidir. [Android edge-to-edge/insets](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- Android 13/API33+ geri hareketi platform `OnBackInvokedCallback` ile ele alınır; WebView geçmişi yokken callback kaldırılarak sistemin ana ekrana geri animasyonuna izin verilir. `onBackPressed` yalnız API23–32 uyumluluğu için tutulur; `GestureBackNavigation` lint istisnası bu tek metoda ve bu gerekçeye bağlıdır. [Platform geri hareketi API'si](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- Android 12+ bulut yedeği ve cihazdan cihaza veri aktarımı için tüm uygulama depolama alanları açıkça hariç tutulur; daha eski sürümlerde backup kapalıdır. [Android yedekleme kuralları](https://developer.android.com/identity/data/autobackup)
- Dosya indirme açıklayıcı bildirimle dış tarayıcıya yönlenir. **WebView hesabının HttpOnly oturumu dış tarayıcıya taşınmaz; giriş gerektiren not indirme akışı bu kabukta tamamlanmış değildir.** `blob:` dışa aktarımlar sessizce kaybolmaz; desteklenmediği ve tarayıcı kullanılabileceği gösterilir. Kamera çekimi, native paylaşım, push, arka plan yükleme ve Google Play doğrulaması bu test kabuğunun dışında kalır.
- Android 8/API26+ renderer kapanışında bozuk WebView kaldırılıp yok edilir; kullanıcıya yeniden açma durumu gösterilir. Geri/saklama/lifecycle kodu bu sırada boş WebView referansını kabul eder. Bu toparlanma kodu gerçek bellek baskısı testinden geçmemiştir. [Renderer kaybı callback'i](https://developer.android.com/reference/android/webkit/WebViewClient#onRenderProcessGone(android.webkit.WebView,%20android.webkit.RenderProcessGoneDetail))
- Kodda yalnız mevcut Kampira PNG simgesi kopyalanır; web kaynağındaki veri/kimlik doğrulama/API davranışı değiştirilmez.

## 5 Eylül 2026 derleme kanıtı

Kullanıcının açık onayından sonra resmî `sdkmanager --install` ile yalnız **`platforms;android-36` ve `build-tools;36.0.0`** kuruldu; bu iki paketin gerektirdiği [Google Android SDK lisansı](https://developer.android.com/studio/terms) kabul edildi. Genel `--licenses` komutu çalıştırılmadı. `build-preview.ps1` lisans kabul etmez; yalnız mevcut bileşenleri kullanır.

Gerçek `:app:assembleDebug :app:lintDebug` derlemesi başarılıdır; ikinci geçiş **42 saniye**, lint **0 hata / 4 uyarı**. Uyarılar minSdk'dan yeni iki manifest özelliği, bilinçli sabitlenen Gradle sürümü ve mevcut kare PNG launcher simgesidir. APK `apksigner verify` ile **v1/v2 imza doğrulamasından geçti**. Paket metadata kontrolünde `app.kampira.preview`, min23/target36, debug ve yalnız INTERNET izni doğrulandı.

- APK: `outputs/android-preview/artifacts/kampira-test-debug.apk` — **38.724 bayt**.
- SHA-256: `6c4ef99b4f949debbb29a436b2404ba12354fc402658da29cd125919c18ff078`.
- Build/imza makbuzu: `outputs/android-preview/artifacts/build-receipt.json`.
- Build log: `outputs/android-preview/build-debug.log`; lint: `outputs/android-preview/lint-results-debug.txt`.
- `outputs/android-preview/source-checks.json` önceki, SDK kurulmadan alınmış kaynak kontrolüdür; tarihsel olarak korunur ve güncel APK durumunun yerine kullanılmaz.

Gerçek APK ile indirme sunucusunun dosya/makbuz/SHA doğrulaması geçti; sunucu bu doğrulamada başlatılmadı. **Tablete kurulum ve gerçek WebView davranışı henüz doğrulanmadı.** Kullanıcı APK'yı yerel bağlantıdan indirip Android paket yükleyiciyle kendisi kurabilir. Bu görevde ADB/USB/uzak cihaz kontrolü çalıştırılmaz. `releaseReady=false`; bu paket Google Play yayını değildir.
