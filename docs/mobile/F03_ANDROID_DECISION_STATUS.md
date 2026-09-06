# F03 Android ortamı ve karar durumu

Kontrol tarihi: **5 Eylül 2026, 09:39 Türkiye saati**. Çalışma kopyası: `D:\-niyra-main`.

Bu ilk ortam kaydıdır. Aynı gün daha sonra yetkili Galaxy Tab A11 tespit edildi ve bağımsız debug APK hazırlığı başladı; daha yeni durum [F03_TABLET_PREVIEW_STATUS.md](F03_TABLET_PREVIEW_STATUS.md) içindedir.

**Ortam tespiti ve yerel araç hazırlığı yapıldı. F03 mimari kararı tamamlanmadı.** Mevcut TWA yaklaşımı korunuyor; Expo/React Native veya başka bir native istemci seçilmiş sayılmıyor. Android SDK lisans incelemesi, yayımlanmamış PWA varlıkları ve bağlı fiziksel cihaz eksikliği açık kapılardır. APK/AAB derlenmedi, imzalanmadı veya yayımlanmadı.

## Gerçek başlangıç kontrolü

Node `v26.7.0` kullanılabilir. İlk kontrolde `java`, `javac`, `adb`, `sdkmanager` ve `gradle` PATH üzerinde yoktu. `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` tanımlı değildi. `%LOCALAPPDATA%\Android\Sdk`, Program Files altındaki Android Studio, Java, Eclipse Adoptium ve Microsoft JDK kökleri bulunmadı. Bu, bilgisayarın her klasörünün tarandığı anlamına gelmez; kontrol PATH ve bilinen standart kurulum kökleriyle sınırlıdır.

Başlangıç boş alanı: C: yaklaşık **45.0 GiB**, D: **205.4 GiB**. Araçlar `outputs/android/toolchain` altında hazırlandı. Global PATH, kullanıcı/makine ortam değişkenleri ve uygulama bağımlılıkları değiştirilmedi. Android Studio veya emulator kurulmadı.

## Hazırlanan araçlar ve doğrulama

| Araç | Sabitlenen paket | Gerçek kanıt |
| --- | --- | --- |
| Temurin JDK | `17.0.20.1+1`, Windows x64 | `java -version` ve `javac -version` çalıştı; major sürüm 17 |
| Android command-line tools | `20.0`, arşiv `14742923` | Klasik `sdkmanager --version` sonucu `20.0`; mevcut Bubblewrap akışı için tercih edilir |
| Android platform-tools | `37.0.1` | Tam dosya yolu üzerinden `adb devices -l` gerçekten çalıştırıldı |
| Google güncel CLI | command-line tools `23.0`, arşiv `16111833` | İlk indirilen `latest`; Android CLI `1.0.16261425` içeriyor. Yan yana tutuldu; ortam denetimi klasik 20.0 yolunu tercih eder |

Paketler [Adoptium](https://adoptium.net/installation/) ve [Google SDK deposundan](https://dl.google.com/android/repository/repository2-3.xml) alındı. JDK SHA-256, Google arşivleri resmî repository metadata SHA-1 ve byte boyutuyla doğrulandı; ayrıca her arşivin SHA-256 özeti kaydedildi. Arşiv açılmadan bütün hedef yolların ayrılmış klasör içinde kaldığı kontrol edildi. İndirme kaynakları, sabit arşiv adları, boyutlar ve özetler yerel `outputs/android/toolchain/download-receipt.json` dosyasındadır; gizli bilgi içermez ve Git dışında kalır.

Ölçülen disk kullanımı: arşivler **481.0 MiB**, JDK **302.8 MiB**, SDK/iki CLI ve platform-tools **352.3 MiB**; toplam yaklaşık **1.11 GiB**. API 36, build-tools, Gradle dağıtımı ve bağımlılıkları bu toplama dahil değildir. API 36 platform arşivi 65,878,410 byte, build-tools 36.0.0 Windows arşivi 58,699,878 byte olarak resmî metadatada doğrulandı; bu iki paket henüz indirilmedi/kurulmadı.

JDK 17 seçimi [depodaki Bubblewrap 1.25.0 sürümünün kendi belgesine](https://github.com/GoogleChromeLabs/bubblewrap/blob/v1.25.0/packages/cli/README.md) dayanır. Bu belge gelecekteki bütün Android/Expo sürümlerinin JDK gereksinimini sabitlemez; native denemede seçilecek Gradle/AGP sürümü ayrıca eşleştirilmelidir.

## Lisans kapısında gözlenen durum

Google'ın `latest` 23.0 paketindeki uyumluluk wrapper'ı `sdkmanager --licenses` için “no longer needed” uyarısı veriyor. Bu çıktı lisans kabulü sayılmadı. Klasik 20.0 ile yapılan gerçek sorgu şu ilk ekranı gösterdi:

```text
7 of 7 SDK package licenses not accepted.
Review licenses that have not been accepted (y/N)?
```

Lisans metinlerini açma veya kabul etme yanıtı verilmedi; işlem kesildi. Sonraki Windows “Terminate batch job” sorusu yalnız çalışan komutu sonlandırmak için yanıtlandı. `sdk/licenses/android-sdk-license` dosyası bulunmuyor. Otomatik `yes`, lisans hash'i yazma veya SDK paketlerini elle açarak bu kapıyı aşma yapılmadı. Lisans metninin kullanıcı tarafından değerlendirilip kabul edilmesi gereken ayrı adım açık. [Resmî sdkmanager lisans akışı](https://developer.android.com/tools/sdkmanager#accept_licenses), [yeni Android CLI](https://developer.android.com/tools/agents/android-cli).

## Cihaz ve canlı kaynak sonucu

`adb devices -l` sorgusu başarılı ve liste **boş**: bu kontrol anında bağlı/yetkilendirilmiş ADB hedefi yok. USB bağlantısı, hata ayıklama izni veya kablosuz eşleştirme olmadan cihaz bulunamaz; bu sonuç kullanıcının bir Android telefona sahip olmadığı anlamına gelmez. Fiziksel cihaz görevleri, kamera/klavye/geri davranışı ve frame performansı ölçülmedi. Emulator sonucu da üretilmedi.

`node scripts/android/check.mjs --remote` gerçek Railway origin'inde çalıştırıldı. `/api/health` geçti; `/manifest.webmanifest`, `/sw.js`, `/offline.html` ve üç Android kurulum simgesi **HTTP 404** döndü. Yerel manifest/PNG boyut kontrolü geçti. Dolayısıyla mevcut `build.ps1 -Action Generate` içindeki canlı kaynak kapısı henüz geçmiyor; bu görev web yayını yapmadı. Yerel dosyanın varlığı canlı dağıtım kanıtı değildir.

## Tekrar çalıştırılabilir kontrol

```powershell
node scripts/android/environment.mjs
node scripts/android/environment.mjs --json
node scripts/android/environment.mjs --require-build-tools
node scripts/android/check.mjs --remote
node --test --test-isolation=none tests/android-app.test.mjs tests/android-environment.test.mjs
```

`environment.mjs` standart kökleri ve bu depodaki ayrılmış toolchain'i bulur; Java/Javac sürümünü ve ADB listesini sorgular. Ham cihaz seri numarası, ağ adresi, cookie, başka ortam değişkenleri veya ham hata çıktısı raporlanmaz. ADB yokluğu, başarısız sorgu, yetkisiz/offline hedef ve başarılı boş liste ayrıdır. Sorgu gerekirse yerel ADB daemon'unu başlatabilir; dosya kurmaz, lisans kabul etmez, build veya cihaza kurulum yapmaz.

`--require-build-tools` eksik önkoşul varsa çıkış kodu 1 üretir. Şu an eksikler: **android36, buildTools36, sdkLicenseRecord, generatedGradleWrapper**. Dosyaların bulunmasıyla lisansın hukuken kabul edildiği, gerçek derleme başarısı veya cihaz doğrulaması iddia edilmez. Son yerel JSON kanıtı `outputs/android/toolchain/environment-report.json` içindedir.

## Kalan uygulanabilir derleme yolu

1. Ayrı lisans inceleme/kabul adımını tamamla. Kullanılacak SDK manager yolu `outputs/android/toolchain/sdk/cmdline-tools/20.0/bin/sdkmanager.bat`; JDK yolu yerel JSON raporunda mevcut. JAVA_HOME/ANDROID_HOME/ANDROID_USER_HOME ve gerekiyorsa PATH yalnız çağrılan süreç kapsamında verilir.
2. Kabul sonrasında resmî sdkmanager ile `platforms;android-36` ve `build-tools;36.0.0` paketlerini ayrılmış SDK köküne kur; yerel ortam kontrolünü tekrarla. Paket kurulumunu lisans hash'i yazarak taklit etme.
3. PWA varlıklarını kullanıcı tarafından yetkilendirilmiş web dağıtımında yayımla; `check.mjs --remote` geçsin. Bubblewrap JDK/SDK bağlamasını ve kullandığı klasik CLI yolunu doğrula; yalnız PATH ayarının Bubblewrap'ın kendi yapılandırması yerine geçtiğini varsayma.
4. Mevcut `scripts/android/build.ps1 -Action Generate` ile ayrılmış Android projesini üret; `check.mjs --generated` ile hedef/derleme SDK'sının en az 36 olduğunu doğrula. Sonra `-Action BuildUnsigned` ve gerçek Gradle bağımlılık çözümünü çalıştır. Bunlar henüz çalıştırılmadı.
5. İmzalı kurulabilir test APK'sı, gerçek sertifikayla alan doğrulaması ve fiziksel cihaz olmadan TWA kullanım kalitesi kapısını kapatma. AAB doğrudan kurulum paketi değildir; Play test kanalından dağıtılan sürüm ayrıca doğrulanır.
6. Aynı API/veri/görev ve release'e yakın koşullarda web/TWA ile sınırlı Expo denemesini karşılaştır. Native auth, özel medya, süreç yeniden oluşumu ve eski istemci/API uyumu başarılı olmadan native kararı verme.

## Yerel doğrulama

Yeni ortam testleri araç bulunamaması, eksik SDK, değiştirilmemiş environment, JDK uyuşmazlığı, başarısız sürüm sorgusu, klasik CLI önceliği, ADB durumları ve seri numarası gizlemeyi doğrular. Mevcut Android manifest/service-worker testleriyle birlikte **18/18** test geçti; iki yeni JavaScript dosyası ESLint kontrolünden geçti. Bu testler SDK lisansı, cihaz bulunması, native performans, APK/AAB veya mağaza kabulü kanıtı değildir.
