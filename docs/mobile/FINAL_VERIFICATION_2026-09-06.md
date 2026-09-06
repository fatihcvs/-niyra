# 6 Eylül 2026 — Kod devamı ve tablet güncellemesi

Branch `codex/cyprus-catalog-expansion`, başlangıç HEAD `408b52b2d9d25b393790346a3f5af70d0ec8f317`. Ortak çalışma kopyasındaki katalog ve önceki mobil değişiklikler korundu. Commit, push, Railway veya Play yayını yapılmadı; 15 fazın genel kabulü açık.

## Uygulanan davranışlar

- **Pazar:** İlan, fiyat ve iletişim oluşturma anahtarları kalıcı sunucu makbuzuna bağlı. Kayıt, denetim ve bildirim tek transaction içinde; kayıp yanıt veya eşzamanlı tekrarda ikinci kayıt oluşmaz. Sonraki kota hatası ilk belirsiz işlemi unutturmaz. Silinmiş hedefin taslağı yalnız açık kullanıcı eylemiyle yeni işleme çevrilir. İlan rezerve edildiğinde veya listeden çıktığında da bekleyen mesaj taslağı açılabilir.
- **Yorumlar:** Yeni bildirimler kesin yorum kimliğine gider. İlk 20 yorumun dışındaki hedef bulunur, odaklanır; Geri/İleri ve silinmiş/yetkisiz hedefler gerçek erişim kurallarıyla çalışır. Yorum bağlantısı kopyalanabilir. Eski bildirimlerde olmayan yorum kimliği tahmin edilmez.
- **Yerel tablet bağlantısı:** Gönderi ve mesaj oluşturmadaki `randomUUID` bağımlılığı, yerel HTTP'de çalışan kriptografik UUID v4 üretimiyle değiştirildi.
- **Android test kabuğu:** Son SPA adresi/Activity geçmişi geri yüklenir; 20 saniyelik yükleme sınırı, tek retry ve HTTP/ağ/TLS/renderer hataları için anlaşılır yerel ekran var. Sistem teması ve büyük yazıya uygun kaydırma eklendi. V2 aynı test uygulamasının üzerine tablete kuruldu.

## Son doğrulamalar

| Kontrol | Sonuç / kanıt |
| --- | --- |
| Birleşik otomatik test | **679/679**, 0 fail/cancel/skip; `exports/mobile-code-continuation-2026-09-06/unit-suite.txt`. |
| Son Pazar kontrolü | **12/12** gerçek ReactDOM; `exports/mobile-code-continuation-2026-09-06/market-client.txt`. |
| TypeScript, geniş ESLint, Vinext | **exit0**; `exports/mobile-code-continuation-2026-09-06` altındaki ilgili log/exit dosyaları. |
| Worker ve hosting JSON | Doğrulandı; `exports/mobile-code-continuation-2026-09-06/artifact-validation.json`. |
| Gerçek Chrome / yerel API | **44/44**, **31** görünüm, **0** JS hatası; `exports/isolated-mobile-qa/browser/final-1788643452436/report.json`. |
| Android kaynak | **24 origin + 28 kurtarma JVM kontrolü**; `outputs/android-preview/recovery-v2-tests/verification.json`. |
| Android paket | Build/lint/imza başarılı; lint 0 hata/4 mevcut uyarı. `outputs/android-preview/artifacts/f03-recovery-v2/build-receipt.json`. |
| Tablet kurulumu | `adb install -r`, **Success/exit0**, versionCode2; aynı dizinde `tablet-install-check.json`. |
| APK indirme | Yeni v2 dosyası HTTP200 ve eşleşen SHA-256; aynı dizinde `lan-download-check.json`. |

Birleşik 679 test sonrasında Pazar geri açma düğmesi adlandırılmış olay işleyicisine ayrıldı; son görsel incelemede uzun form hatasının görünür olması için kurtarma bölgesine kontrollü odak/kaydırma eklendi. Bu son biçimde 12 Pazar testi, geniş lint, TypeScript ve yeniden build doğrulandı. 44 kontrol kaydı odak düzeltmesi öncesindeki genel kapanıştır; son odaklı tarayıcı kaydı ayrıca aşağıya bağlanır. İlk 678 testlik koşu, son bekleyen mesaj regresyonu öncesine aittir. Kırmızı regresyon ve lint çıktıları ayrı saklandı; başarılı toplamına eklenmedi.

Tarayıcı sentetik hesapları normal kayıt/profil API'leriyle oluşturur ve gerçek giriş formunu kullanır. Yeni Pazar testinde gerçek sunucu 201 yanıtı kasıtlı düşürülür; sahte API yanıtı üretilmez. Aynı anahtar/gövdeyle tekrar 201 ve tek kalıcı ilan doğrulanır. Yorum testinde başka bir sentetik hesap 25 yorum üretir; gerçek bildirimden ilk sayfa dışındaki yorum açılır ve silindikten sonra İleri ile yeniden erişim reddedilir. Kasıtlı ağ hatası raporda beklenen arıza olarak ayrı tutulur. Önceki derleme kesintisi ve test aracı yarışına ait koşular kabul kanıtı değildir.

## Yerel veri ve paket

Normal önizleme veritabanının tutarlı SQLite yedeği alındı; yalnız ekleyici 0027 migration'ı uygulandı. Integrity=ok, önceki tablo satır sayıları ve FK ihlal sayısı aynı. `outputs/local-preview-backups/0027-20260905T210548Z/postflight.json`. İzole QA ayrı DB/R2 kullanır ve 28 migration uygulanmıştır. Üretim verisi değiştirilmedi.

Yeni APK `app.kampira.preview`, versionCode2, **44.908 bayt**; SHA-256 `32c1d146f53e97eb1b3001406eae83b15f5bb98b056828bb46089f44ee0844f6`. İlk APK ve kurulum kayıtları korundu. Tablet adresi `http://192.168.0.4:5173`; bilgisayar ve aynı Wi-Fi gerekir. Site/sağlık HTTP200; LAN indirme sunucusu artık v2 sunar. Kurulum kanıtı uygulama açılışı veya gerçek cihaz yolculuğu kanıtı değildir.

## Kalan sınırlar

Pazar taslak/anahtarları istemcide hesap kapsamlı JS belleğindedir; sayfa yenileme, süreç sonlandırma ve TTL sonrası kalıcılık bu teslimde tamamlanmadı. Görsel yükleme tekilleştirmesi/nesne uzlaştırması, genel buluşma hedefi, gerçek hesap silme motoru ve destek bilgileri ayrıca açık. Native mimari, push, kamera/arka plan, fiziksel IME/TalkBack/frame/bellek, ikinci cihaz, öğrenci oturumları ve Google Play kabulü tamamlanmadı. `releaseReady=false`, `publicationAuthorized=false`.

Ayrıntılar: [Pazar](F11_MARKET_IDEMPOTENCY.md), [yorum hedefleri](F04_CONTENT_TARGETS.md), [yerel anahtarlar](F03_LAN_RANDOM_KEYS.md), [Android kurtarma](F03_ANDROID_RECOVERY_CONTINUATION.md).


## Son hata görünürlüğü kontrolü

Son Pazar düzeltmesi, sabit başlığın gerçek yüksekliğini ölçüp kurtarma alanına 12 px ek boşlukla kaydırır. `exports/isolated-mobile-qa/browser/final-1788644133103/report.json`: **4/4**, elle kaydırmadan kurtarma alanı ve düğmesi görünür ve odaklı; başlık altı91,5px, bölge üstü103,5px. Aynı anahtar/gövdeyle gerçek201 tekrar ve tek ilan yeniden doğrulandı. JS, beklenmeyen ağ ve statik dosya hatası yok. Bu odaklı tekrar önceki44kontrolle örtüşür; toplam48bağımsızsenaryo olarak sayılmaz.
