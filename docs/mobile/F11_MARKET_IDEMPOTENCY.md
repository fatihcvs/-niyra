# F11 — Kalıcı pazar işlem tekrarları

Tarih: 2026-09-06. Kapsam: `POST /api/campus-market` ilan, fiyat gözlemi ve ilana iletişim mesajı oluşturma işlemleri.

## Davranış

İstemci `Idempotency-Key` gönderdiğinde anahtar, kullanıcı e-postasıyla birlikte kalıcı işlem kimliği olur. Aynı kullanıcının aynı anahtarla gönderdiği normalize edilmiş aynı işlem tek sonuç üretir. Kampüs kimliği ve yalnız işlemde kullanılan anlamsal alanlar SHA-256 özeti içine alınır; JSON alan sırası, başlık çevresindeki boşluklar ve `25,50` / `25.5` fiyat gösterimi aynı sonucu değiştirmez.

Yeni kayıt ile işlem makbuzu, denetim kaydı ve iletişim bildirimi tek D1 `batch` transaction'ında yazılır. Anahtarın benzersizlik yarışını kaybeden transaction geri alınır ve kazanmış sonucun makbuzu okunur. Commit tamamlandıktan sonra yanıt kaybolursa aynı anahtar asıl kaydı döndürür. Sunucu geçici olarak okunamıyorsa 503 kalır; daha sonraki aynı anahtarlı tekrar yine kalıcı makbuzu okuyabilir. Sonucu henüz belli olmayan eski bir transaction, sonraki tekrar kazanırsa aynı anahtarın benzersizlik kısıtına takılır.

- Anahtarlı başarı: HTTP 201; ilk işlemde `idempotentReplay: false`, tekrarında `true`; ayrıca `Idempotency-Replayed` ve `Cache-Control: private, no-store` başlıkları.
- Anahtar `[A-Za-z0-9._:-]` karakterlerinden 8–128 uzunlukta olmalı. Ham geçersiz değerler 400 `INVALID_IDEMPOTENCY_KEY` döndürür.
- Aynı anahtarın farklı işlem/içerikle kullanılması 409 `IDEMPOTENCY_CONFLICT` döndürür.
- Silinmiş, kapatılmış veya arşivlenmiş hedef 410 `MARKET_TARGET_REMOVED` döndürür. Makbuz hedef silinince kaybolmaz; aynı anahtar hedefi yeniden oluşturamaz.
- Yeniden okuma güncel oturum, tamamlanmış profil, kampüs, sahiplik ve iletişim engellerini kontrol eder. Değişmiş kampüs/erişim 404 `MARKET_TARGET_UNAVAILABLE` döndürür.
- Mevcut makbuz günlük hız sınırından önce okunur; tekrar çağrısı yeni oluşturma hakkı tüketmez.
- Header göndermeyen eski istemcilerin JSON yanıt yapısı korunur; onların kayıtları da denetim/bildirimle birlikte atomik yazılır.

İletişim mesajı INSERT'i transaction içinde ilan erişimini ve açık mesaj bulunmamasını yeniden kontrol eder. İki farklı anahtar bile aynı kullanıcı/ilan için yarışırsa ikinci açık mesaj ve ikinci bildirim oluşmaz. Araya engelleme girerse transaction geri alınır ve yeni erişim durumu okunur.

## Kaynaklar ve migration

- `lib/market-idempotency.ts`: anahtar doğrulama, anlamsal hash, erişimi koruyan tekrar okuma, atomik yazma.
- `app/api/campus-market/route.ts`: üç işlemin entegrasyonu; geçersiz JSON nesnesi ve aranan ilanlardaki geçersiz fiyat doğrulaması.
- `drizzle/0027_market_write_requests.sql`, `db/schema.ts`: sahip/anahtar bileşik primary key; hedefe cascade FK içermez. Kullanıcı silinmesi makbuzu da siler.

Bu alt görev yalnız migration dosyasını ve bellek içi SQLite uygulamasını doğruladı. Çalışan yerel/üretim veritabanına migration uygulanması bu kaydın kanıtı değildir; üst görev ayrı yedek ve uygulama sonucu tutar.

## Doğrulama ve sınırlar

`tests/market-idempotency.test.mjs` gerçek route/helper/server yardımcılarını transpile ederek tüm SQL migration'larının uygulandığı SQLite üzerinde çalıştırır. SQL transaction'ları gerçek `BEGIN / COMMIT / ROLLBACK` kullanır. Üç işlem için aynı anahtar tekrarı, eşzamanlı yarış, farklı içerik yarışı, geç/kayıp commit yanıtı, denetim/bildirim hatası geri alımı, silinen hedef, kullanıcı/kampüs/engel sınırı, kota ve eski istemci davranışı sınanır. 11 API testi ve migration testi: **12/12 geçti**. Değişen API/helper/schema/test dosyalarının ESLint kontrolü geçti. Genel build, tarayıcı ve cihaz sonuçları üst görev raporundadır.

Kalıcı sunucu makbuzu istemcinin kaybolmuş anahtarını bulmaz. Bu API değişikliği sırasında istemci taslağı ve anahtar yalnız workspace belleğinde korunuyordu. Ardından eklenen ayrı cihaz depolaması ve sayfa yeniden açma kurtarması `F11_PERSISTENT_MARKET_DRAFTS.md` belgesinde açıklanır; önceki bellekte kalıcılık sınırı bu yeni fazla güncellenmiştir. Pazar görsel yükleme/temizleme/idempotency akışı ayrı kalır. Gerçek Android, Railway veya Play dağıtımı yapılmadı.


## İstemci ve yerel veritabanı entegrasyonu — üst görev

İlan, fiyat ve iletişim gönderiminde değişmez anahtar/gövde kullanılır. Belirsiz yanıttan sonraki kota veya doğrulama reddi önceki anahtarı silmez. 410 sonucunda kullanıcı taslağı açıkça düzenleyebilir; bu düğme kendiliğinden gönderim yapmaz. İlan rezerve edildiğinde veya ilk liste sayfasından çıktığında da bekleyen mesaj kartından aynı taslağa ve anahtara ulaşılabilir. `tests/market-recovery-runtime.test.mjs`: **12/12**, bu tur 6 yeni gerçek ReactDOM senaryosu; `exports/mobile-code-continuation-2026-09-06/market-client.txt`. Son erişim hatası önce başarısız regresyonla kaydedildi, ardından düzeltildi.

Normal yerel önizleme veritabanında tutarlı SQLite yedeğinin ardından yalnız 0027 migration’ı uygulandı. Önceki tablo satır sayıları ve yabancı anahtar ihlal sayısı korundu; integrity=ok. Kanıt: `outputs/local-preview-backups/0027-20260905T210548Z/postflight.json`. Üretim/Railway veritabanına işlem yapılmadı.
