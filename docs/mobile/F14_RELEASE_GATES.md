# F14 — Android yayın kanıtı kapıları

5 Eylül 2026. `scripts/android/release-readiness.mjs` mevcut kurulum, ortam ve ilişkilendirme kontrollerini **yayın kanıtından ayrı** raporlar. Gerçek lisans kabulü, fiziksel cihaz, imzalama, Play ve yayın yetkisi doğrulayıcısı bu araçta bulunmadığından `releaseReady` ve `publicationAuthorized` bu sürümde daima `false` kalır. Bu bilinçli bir açık kapıdır; kontrolü geçmek için elle boolean doldurulmaz.

```powershell
node scripts/android/release-readiness.mjs
node scripts/android/release-readiness.mjs --remote
# Gerçek dosya varsa; yalnız outputs/android içinde okunur:
node scripts/android/release-readiness.mjs --remote --artifact outputs/android/generated/app-release.aab --fingerprint $env:KAMPIRA_PLAY_SIGNING_SHA256
```

Rapor `outputs/android/release-readiness.json` içine yazılır; eksik/belirsiz yayın kanıtında süreç **exit 1** döner. JSON raporunun başarıyla üretilmesi yayın başarısı sayılmaz. Araç SDK kurmaz, lisans kabul etmez, cihazda kurulum yapmaz, anahtar oluşturmaz ve yayınlamaz. `--ready`, `--force`, `--accept-licenses` veya `--approve-play` gibi bayraklar kabul edilmez.

## Ölçülen ve açık kalan bilgiler

| Kontrol | Gerçek kanıt | Çıkarmadığı sonuç |
|---|---|---|
| Yerel kurulum varlıkları | Mevcut `check.mjs` manifest/PNG kontrolünün exit sonucu. | Android derlemesi veya cihaz deneyimi. |
| `--remote` kurulum varlıkları | Kimliksiz, yönlendirmesiz HTTPS health/PWA varlığı kontrolü. | Üretim işlevlerinin veya mağaza kabulünün tamamlandığı. |
| Digital Asset Links | Doğrudan HTTP 200 JSON içinde doğru relation, paket ve verilen bütün parmak izleri. | Verilen sertifikanın gerçekten Play App Signing kaynağından geldiği. |
| Araç ortamı | JDK/SDK dosyaları, sürüm sorgusu, seri numarası içermeyen ADB transport sayısı. | Dosya varlığından lisans kabulü, transporttan fiziksel cihaz QA. |
| APK/AAB dosyası | Ayrılmış çıktı dizini sınırı, uzantı, ZIP başlığı, gerçek byte sayısı ve SHA-256. | ZIP bütünlüğü, gerçek Android manifesti, imza veya build provenance. Rastgele ZIP de yalnız `recorded` olur. |
| Kaynak bağlamı | Git HEAD ve çalışma ağacının kirli olup olmadığı. | Kirli çalışma ağacının HEAD ile aynı kaynak olduğu veya dosyanın bu kaynaktan derlendiği. |
| Dış/human kanıtlar | Ayrı `unverified` gate kayıtları. | Kullanıcı onayı, lisans, fiziksel test veya Play delilinin dosya/boolean üzerinden kabulü. |

`blockingGates` listesine `passed` dışındaki tüm durumlar girer: `observed`, `recorded`, `unverified`, `blocked`, `failed`. Bu nedenle “APK bulundu”, “lisans dosyası var” veya “adb cihaz gördü” tek başına hazır olma durumu oluşturmaz.

## Denetimde bulunan önceki sınırlar

`scripts/android/check.mjs` bir varlık/kurulum smoke testidir. `--remote` yalnız HTTP/content-type, health.status ve manifest.id kontrol eder. `Ready: /route` satırı o varlığın kontrolünü ifade eder; DAL, gerçek sertifika, lisans, APK/AAB, telefon veya Play kanıtı değildir.

`--generated` yalnız Gradle metnindeki SDK sayılarını düzenli ifadeyle okur; yorum/string/şablon bağlamını tam Gradle parser gibi doğrulamaz. Yeni yayın aracı bu sonucu “imzalı paket hedef API doğrulandı” diye kullanmaz. Gerçek build manifesti ve imza incelemesi ayrı açık kapıdır. Genel smoke testin mevcut davranışı değiştirilmedi.

`docs/ANDROID_APP.md` içindeki ilk ortam tespiti PATH/standart dizinleri anlatır. Sonradan ayrılmış `outputs/android/toolchain` altında kurulan araçların ve açık lisans/SDK durumunun güncel kaydı [F03 durum belgesidir](F03_ANDROID_DECISION_STATUS.md). Yeni kontrol bu ortam helper'ını gerçekten çalıştırır; eski metinden “hazır” sonucu üretmez.

## Gerçek koşu

5 Eylül 2026, `node scripts/android/release-readiness.mjs --remote`: **exit 1**, `releaseReady=false`, `publicationAuthorized=false`.

- Yerel kurulum kontrolü geçti; canlı kurulum varlıkları kontrolü başarısız.
- API 36 platformu, build-tools 36, SDK lisans kaydı ve oluşturulmuş Gradle wrapper eksik.
- ADB sorgulandı; yetkili transport 0.
- APK/AAB ve beklenen gerçek imzalama parmak izi verilmedi.
- Çalışma ağacı kirli; raporda kaynak HEAD ayrıca kaydedildi.

Bu rapor güncel koşuya aittir; sonraki kurulum veya yayın sonucunu temsil etmez. Canlı varlık kontrolünün ayrıntıları için `node scripts/android/check.mjs --remote` kullanılır.

## Resmî kaynak ve kalan karar

5 Eylül 2026'da kontrol edilen [Google Play hedef API şartı](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en), yeni telefon uygulaması/güncellemeleri için 31 Ağustos 2026 itibarıyla API 36 hedefini belirtir. Yapılandırmadaki 36 değeri derlenmiş manifest kanıtı değildir.

[Chrome TWA entegrasyon belgesi](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide), web alanı ile uygulama ilişkisinin Digital Asset Links üzerinden doğrulanmasını açıklar. Web JSON eşleşmesi, gerçek Play sertifikası ve telefondaki doğrulanmış TWA davranışının yerine geçmez.

[Google Play kişisel hesap test şartı](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), 13 Kasım 2023 sonrası açılan kişisel hesaplarda üretim erişimi için 12 testçinin en az 14 gün kesintisiz katıldığı kapalı test şartını belirtir. Hesap türü/tarihi bilinmeden test muafiyeti veya üretim erişimi varsayılmaz. F12 talep kuyruğu gerçek veri silme motoru olmadığı için [hesap silme sözleşmesindeki](F12_ACCOUNT_DELETION_CONTRACT.md) açık işler de yayın kapısında kalır.

## Test kanıtı

```text
node --test --test-isolation=none tests/android-release-readiness.test.mjs tests/android-environment.test.mjs tests/android-app.test.mjs
# 24/24 geçti: 6 yeni yayın-kapısı testi, 18 mevcut ortam/PWA testi.
npx eslint scripts/android/release-readiness.mjs tests/android-release-readiness.test.mjs
# Geçti.
```

Yeni testler yanlış paket/relation/parmak izi, yönlendirme/MIME/JSON hatası, gerçek dosya hash'i/dizin sınırı, rastgele ZIP'in imzalı build sayılmaması, sahte `true` alanlarının fiziksel/lisans/Play/yayın kapılarını açamaması ve zorlayıcı CLI bayraklarının reddini kapsar.
