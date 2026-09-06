# Galaxy Tab A11 test paketi

5 Eylül 2026, önceki Android ortam kontrolünün devamı.

Kullanıcı Galaxy Tab A11 ile test yapmayı seçti. USB hata ayıklama açıldıktan sonraki `adb devices -l` çıktısında bir yetkili cihaz, model `SM_X130`, görüldü. Seri numarası bu kayda alınmadı. Önceki rapordaki boş cihaz listesi bu daha yeni gözlemden önceye aittir. Cihazın Android/RAM/klavye sürümü veya ikinci cihaz matrisi doğrulanmadı.

Cihaz özelliklerini sorgulama, `adb reverse` ve Chrome açma içeren komut otomatik onay denetimi tarafından iki denemede de yalnız `blocked by policy` açıklamasıyla reddedildi. Komutların başarıyla çalıştığı veya ekranın açıldığı iddia edilmez. Bu reddi başka taşıma/yardımcı süreçle aşma yapılmadı.

Kullanıcının ayrıca uygulama olarak kurma isteği üzerine bağımsız `experiments/android-preview` debug projesi hazırlandı: **Kampira Test**, paket **app.kampira.preview**, seçili kaynak **http://192.168.0.4:5173**. Tabletin aynı yerel ağda, bilgisayardaki sunucunun açık olması gerekir. Son teslimde Vite yerine mevcut derlenmiş Worker aynı portta başlatıldı; `.wrangler/state`, `site-creator-d1` ve `site-creator-r2` korunur. Son yerel LAN kök ve sağlık HTTP200: `outputs/android-preview/local-site/http-checks.json`. Önceki kalıcı Railway origin kararı değişmez. WebView test kabuğu, native mimari kararı veya Google Play paketi değildir.

Kaynakta normal WebView oturumu, Android dosya seçici, sistem çubuğu/IME boşlukları, Geri geçmişi ve bağlantı/renderer hata yüzeyi vardır. Fiziksel cihaz doğrulaması yoktur. Oturum gerektiren dosya indirme, kamera, native paylaşım, push ve arka plan yükleme kabulü açık kalır.

JDK17 ile 24 OriginPolicy davranış kontrolü ve iki Java dosyasının sözdizimi kontrolü geçti. Gradle wrapper resmî checksum ile doğrulandı. Google SDK lisans sorusunun ardından kullanıcının verdiği “devam et” yanıtıyla belirtilen lisans kabulü ve paket kurulumu yetkilendirildi. Resmî sdkmanager yalnız `platforms;android-36` ve `build-tools;36.0.0` paketlerini kurdu.

**Debug APK üretildi ve kullanıcının doğrudan kurulum isteği üzerine Galaxy Tab A11 tabletine ADB ile kuruldu (`Success`, exit0).** Kurulum kanıtı `outputs/android-preview/artifacts/tablet-install-check.json`; uygulama açılışı ve cihaz akışları henüz doğrulanmadı. `assembleDebug`, Android lint (0 hata, 4 uyarı) ve apksigner doğrulaması geçti. Paket 38.724 bayt; minSdk23/targetSdk36 ve yalnız INTERNET izni var. SHA-256: `6c4ef99b4f949debbb29a436b2404ba12354fc402658da29cd125919c18ff078`. `outputs/android-preview/artifact-checks.json` ve `artifacts/build-receipt.json` gerçek Android kanıtlarıdır. Önceki `source-checks.json` yalnız derleme öncesi tarihsel hazırlık kaydıdır.

Tek dosyalık LAN sunucusu başlatıldı: `http://192.168.0.4:5174/kampira-test-debug.apk`. İndirilen baytlar imzası doğrulanmış dosyayla aynı SHA-256 değerini verdi; HTTP200, Android APK MIME ve attachment başlığı doğrulandı. `artifacts/lan-download-check.json` bu kontrolün kanıtıdır; tabletin ağ erişimi veya kurulum kanıtı değildir. Kullanıcıya indirme/kurulum bağlantısı ve sonucu bildirme isteği iletildi.

APK'nın bağlandığı normal yerel D1'e yalnız ekleyici 0026 migration'ı resmî Wrangler `--local` ile uygulandı. Öncesinde tutarlı SQLite yedeği alındı; sonrasında integrity=ok, önceki tablo satır sayıları ve FK ihlal sayısı aynı kaldı. Kanıt/yedek: `outputs/local-preview-backups/0026-1788639830669/`. Üretim veya Railway işlemi yapılmadı.

Kaynak, sürüm, lisans, derleme ve kurulum sınırları [debug proje belgesinde](../../experiments/android-preview/README.md) açıklanır. Build script eksik SDK durumunda durur, lisans kabul etmez ve ADB çağırmaz. Başarılı derleme sonrası imza ve hash kontrolü yapılmadan APK hazır sayılmaz. `releaseReady=false` ve yayın yetkisi değişmedi.
