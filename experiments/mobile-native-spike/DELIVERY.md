# F03 native scout teslim kaydı

**5 Eylül 2026 — yerel uygulama tamamlandı; native mimari kararı açık.** Bütün yeni çalışma bu klasördedir. Ana Kampira UI/API/package dosyaları bu alt görevde değiştirilmedi.

- Expo57.0.20 / RN0.86.3 ile typed gerçek API istemcisi ve runnable native kaynak hazır. Akış → gerçek yazar profili → Back, bellekte composer taslağı ve gerçek DM özet listesi vardır. UI mock veri modu içermez.
- Gerçek cookie giriş POST'u ardından aynı hesabın GET profile yanıtı doğrulanmadan özel ekranlar açılmaz. Cookie/token kopyalama, platform kimliği taklidi veya sahte native login yok. Giriş/çerez/media taşıması cihazda denenmedi; çalışma sırasında production giriş veya yazma yapılmadı.
- Yayın ve native özel-medya probe'u varsayılan kapalıdır. README kontrollü cihaz/staging denemesinin bayraklarını açıklar. Sahiplik, taslak, Back, cursor, timeout, abort ve server-confirmed retry sözleşmeleri test edildi.

## Son yerel sonuç

| Komut | Sonuç |
| --- | --- |
| `npm test` | **13/13 geçti**; ilk12 teste ek olarak abort-aware timeout testi de geçti |
| `npm run typecheck` | Exit0 |
| Root üzerinden yalnız scout kaynaklarına scoped ESLint | Exit0 |
| `npm run export:android` | Exit0; Metro599 modül; yaklaşık1.5MB Hermes bundle |

Makine kaydı: [`evidence/local-checks.json`](evidence/local-checks.json). Paket: `dist/android/_expo/static/js/android/index-933ebf40f8affbb3dc9efaadb785c535.hbc`; metadata: `dist/android/metadata.json`. Hash ve byte boyutu makine kaydındadır. `dist` Git dışında kalır. Unit testlerin fake transport'u yalnız açıkça `[SYNTHETIC]` test yanıtı üretir; cihaz/live API kanıtı olarak sayılmadı.

## Açık kapılar

Gerçek native POST→GET cookie jar, Image cookie/cache, fiziksel Android Back/keyboard/TalkBack, process kill, ağ değişimi ve TWA karşılaştırmalı frame/memory ölçümü yapılmadı. Android SDK lisansı kabul edilmedi; Gradle/APK/AAB, imzalama, dağıtım veya mağaza yayını yapılmadı. Mevcut dependency audit10 moderate/0high/0critical bildiriyor; uyumsuz Expo46 downgrade önerisi uygulanmadı. Bu sonuç Play hazır veya native seçildi anlamına gelmez.

Çalıştırma ve kapsam: [`README.md`](README.md). Gerçek endpoint ve resmî Expo/RN kaynaklarına dayanan auth/medya sınırı: [`AUTH_AND_MEDIA_CONTRACT.md`](AUTH_AND_MEDIA_CONTRACT.md).
