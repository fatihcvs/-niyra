# F03 devamı — Android test kabuğunda hata ve geri yükleme

Tarih: 6 Eylül 2026. Kapsam yalnız `experiments/android-preview`; mevcut Java/WebView test kabuğu korunur. Bu belge genel faz tamamlanması, Google Play veya fiziksel cihaz kabulü sayılmaz.

## Bulgu ve değişiklik

| Somut önceki durum | Uygulanan davranış |
| --- | --- |
| Son güvenli adres yalnız `onPageStarted` içinde güncelleniyordu. SPA içinde Notlar/Mesajlar gibi sekmeler değişince renderer kurtarması eski adrese dönebiliyordu. | `doUpdateVisitedHistory`, pause ve state kaydı güvenli güncel adresi hatırlar; bu adres ağ isteğinin zaman aşımı sayacından ayrıdır. |
| `WebView.saveState` sonucu başarısızsa veya renderer yoksa ayrı bir adres kaydı bulunmuyordu. | Güvenli URL ve WebView geçmişi ayrı Bundle alanlarına yazılır. Restore sonrası geçmişteki tüm adresler origin sınırından geçirilir; geçersiz/başarısız geçmiş için güvenli kayıtlı URL yüklenir. |
| Retry başında hata katmanı saklanıyor, sonrasında boş veya WebView'in teknik hata ekranı görünebiliyordu. | Yükleme boyunca açıklayıcı yerel katman korunur. Ana belge commit/finish bildirimi yalnız aktif ve başarısız olmamış gezinmeyi açar. Gecikmiş eski callback hata katmanını kaldıramaz. |
| Ana sayfa yüklemesi yanıt vermediğinde kullanıcı süresiz bekleyebiliyordu. | 20 saniyelik, deneme kimliğine bağlı yükleme süresi vardır. Süre dolarsa yükleme durur ve tek açık retry sunulur; otomatik yeniden deneme döngüsü yoktur. |
| HTTP hata sayfaları ve TLS hataları için yeterli yerel açıklama yoktu. | Ağ, zaman aşımı, HTTP sunucu, 404/410, 401/403, TLS ve renderer sorunlarının ayrı anlaşılır metinleri vardır. TLS her zaman iptal edilir. İframe/görsel gibi alt kaynak hataları tüm uygulamayı hata durumuna geçirmez. |
| Retry aynı hedefi tekrar `loadUrl` ile ekliyordu. | Aynı belge için `reload`, değişen hedef için `loadUrl` kullanılır. Devam eden deneme sırasında ikinci retry kabul edilmez. |
| Hata görünümü sabit beyaz ve piksel boşluklarına sahipti. | Açık/koyu sistem görünümü, dp boşlukları, en az 48dp eylemler ve büyük yazı/az yükseklikte kaydırılabilir içerik vardır. Durum değişiklikleri polite live region üzerinden erişilebilirdir. |

`RecoveryState` saf Java durum modeli; Android callback'leri bu modelin sonucunu uygular. Yeni JS köprüsü, izin, çerez aktarımı, hesap oluşturma veya yerel kimlik atlatma eklenmedi. Çerezler normal `CookieManager` yaşam döngüsünde flush edilir; clear/remove veya session injection yoktur. APK'nın tek izni hâlâ INTERNET.

## Doğrulama

- `OriginPolicyTest`: **24 kontrol geçti**.
- `RecoveryStateTest`: **28 kontrol geçti**. Güvensiz restore, SPA URL korunması, eski timeout/route callback'i, tekrar tıklama, hata sonrası geç gelen finish, TLS, renderer ve desteklenmeyen sürüm durumları dahildir.
- Gerçek Android `:app:assembleDebug :app:lintDebug`: **başarılı, 49 saniye**.
- Lint: **0 hata / 4 uyarı**; iki eski-API manifest bildirimi, sabitlenen Gradle sürümü tavsiyesi, mevcut kare launcher PNG'si. API23–32 geri uyumluluğu için daha önce belgelenen tek `GestureBackNavigation` istisnası korunur.
- `apksigner verify`: **v1/v2 imza doğrulaması geçti**.
- AAPT: `app.kampira.preview`, versionCode **2**, `0.2-debug-preview`, min23/target36, debug, yalnız INTERNET.
- Eski APK SHA-256 değişmedi. İlk APK ve kurulum kanıtları üzerinde yazılmadı.
- Kanıt dizini: `outputs/android-preview/recovery-v2-tests/`; esas sonuç `verification.json`.

Yeni APK: `outputs/android-preview/artifacts/f03-recovery-v2/kampira-test-debug.apk` (**44.908 bayt**).

SHA-256: `32c1d146f53e97eb1b3001406eae83b15f5bb98b056828bb46089f44ee0844f6`.

Yeni build makbuzu aynı dizindeki `build-receipt.json`. Ayrı çıktıyı tekrar üretmek için yeni, kullanılmamış bir kimlik seçilir:

```powershell
powershell -File experiments/android-preview/build-preview.ps1 -Origin http://192.168.0.4:5173 -ArtifactId f03-recovery-v2-repeat
```

## Açık kalan gerçek cihaz kontrolleri

Bu v2 APK bu çalışmada tablete kurulmadı; tablet/app açılmadı ve çalışan sunucular yeniden başlatılmadı. İlk kurulan v1 APK'nın cihaz kanıtı v2 için taşınmaz. V2 ile normal girişten sonra Notlar/Mesajlar adresi, dönme/Activity yeniden yaratılması, ağ kesilip geri gelmesi, retry, uzun yanıt, 404/503, büyük yazı ve açık/koyu görünüm cihazda ayrıca denenmelidir. Renderer kaybı sonrasında geçici DOM alanları ve web geçmişinin tamamı için korunma sözü verilmez; güvenli son URL korunur, web uygulamasının kalıcı taslakları kendi veri sözleşmesine tabidir.

Bu katman ana belge gezinmelerini kapsar. Açık sayfanın `fetch`/API istekleri, yükleme kuyrukları ve form hataları web uygulamasına aittir; tam offline veri erişimi veya çevrimdışı içerik önbelleği eklenmedi. Normal kullanıcı oturumunun fiziksel süreç öldürme sonrasında devamı yalnız kaynak/build kontrolüyle kanıtlanamaz.

## Resmî dayanaklar

- [WebView saveState / restoreState](https://developer.android.com/reference/android/webkit/WebView#saveState(android.os.Bundle)): geçmiş state'i ile ekranda görünen içerik farklıdır; bu API display verisini saklamaz.
- [WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient): main-frame commit/finish, HTTP/ağ hata callback'leri ve history güncellemeleri; alt kaynak hataları tüm sayfa hatası sayılmaz.
- [SSL hata sözleşmesi](https://developer.android.com/reference/android/webkit/WebViewClient#onReceivedSslError(android.webkit.WebView,%20android.webkit.SslErrorHandler,%20android.net.http.SslError)): geçersiz sertifika için ilerleme yapılmaz.


## Sonraki kurulum — üst görev doğrulaması

6 Eylül 2026: v2 APK, aynı `app.kampira.preview` uygulamasının üzerine `adb install -r` ile kuruldu; sonuç `Success`, exit0. Yeni paket hash’i yukarıdaki v2 hash’iyle aynıdır. Kanıt: `outputs/android-preview/artifacts/f03-recovery-v2/tablet-install-check.json`. Bu sonraki işlem, yukarıdaki kaynak/derleme teslim anındaki kurulmadı kaydını günceller; uygulama açılışı ve gerçek cihaz yolculukları hâlâ doğrulanmadı.
