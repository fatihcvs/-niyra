# F09 — Mesaj oturumu ve güvenli yeniden deneme

Tarih: 2026-09-05. Durum: yerel uygulama ve izole testler tamamlandı; cihaz / arka plan bildirimi / production kanıtı değildir.

## Uygulanan davranış

- Boş yeni-mesaj sorgusu bir başlangıç yönergesi gösterir ve `/api/people` çağırmaz. Yazı değiştiğinde önceki sonuçlar hemen kalkar; arama ile boş sonuç ayrı durumlardır.
- `lib/message-drafts.ts` yalnız sekme belleğinde oturum kapsamlı durum tutar. Seçili kişi ve konuşma kimliği, taslak metin/ek, 100 mesajlık API sayfaları, gerçek `olderCursor`, önceki sayfaların yüklenme durumu ve okuma konumu geri dönüşte korunur.
- Varsayılan sınır 8 konuşma, konuşma başına son 300 mesaj, 100 konuşmalık liste ve 200 paylaşılabilir içeriktir. Devam eden gönderimler tamamlanana kadar korunur; aktif görünümde okunan daha uzun tarihçe belleğe kaydedilirken son 300'e indirilir. Kesim sonrası cursor ilk tutulan mesajın gerçek ID'sidir; eski mesajlar yeniden yüklenebilir. Sayfa yenileme/sekme kapatma bu özel veriyi kalıcılaştırmaz.
- Root `setMessageOwnerScope(publicId + ':' + sessionRevision)` çağırır. Bootstrap ve yeni giriş kapsamı yetkili root tarafından açılır; çıkış, oturum sonlanması ve hesap değişiminde `null` tüm belleği temizler. Okuma/render işlemleri kendi başına kapsam açamaz. Props önce gelirse wrapper yetkili kapsamı bekler. Eski async yanıtlar kapsam + nesil + seçim/istek denetimiyle reddedilir.
- Mevcut mobil history mekanizması korunur; ikinci bir modal/Back yığını kurulmaz. History yalnız açıkça seçilmiş alıcı metadata'sı ve konuşma kimliği taşır; mesaj, taslak ve ek içeriği yazılmaz. History owner etiketi eski hesaba ait alıcıyı yeni hesapta geri açmayı engeller.
- Konuşma okuması 6 saniye, kapalı liste yenilemesi 25 saniye aralığındadır. `visibilitychange` görünmeyen sayfada bu poll'ları durdurur, bekleyen okuma/history isteklerini iptal eder; görünür dönüş ilk okumayı yeniler. Bu bir push bildirimi, işletim sistemi arka plan servisi veya teslim garantisi değildir.
- Gönderme 20 saniyede doğrulanamazsa başarısız/tekrar dene durumu gösterir. Aynı değiştirilmemiş taslak yeniden denenirken aynı anahtar kullanılır; düzenlenmiş taslak yeni anahtar alır. Giden istek sayfadan ayrılınca sonucu ilgili alıcının belleğine yazabilir; başka kişinin taslağını temizleyemez.
- `Gönderiliyor` yalnız bekleyen gerçek POST içindir. `Gönderildi` yalnız sunucunun kaydettiği mesaj için gösterilir. `Okundu` yalnız mevcut backend `read_at` alanı doğruysa gösterilir; cihaz teslimi/online durumu uydurulmaz.
- 401 bütün DM oturumunu siler ve root `onSessionExpired` çağrısını yapar. Açık konuşmada 403/404 eski mesaj ve taslağı temizler. Başka workspace'den yapılan güvenlik değişikliklerinde görünüm bir sonraki gerçek okumasıyla güncellenir; ek bir anlık çapraz-workspace invalidation hattı kurulmadı.

## Backend ve migration

`drizzle/0023_message_idempotency.sql`, `direct_messages.client_message_key` ve sender + key için kısmi unique index ekler. POST aynı yetkili kişi/konuşma/içerik anahtarını tekrar alınca özgün mesajı döndürür; içerik veya konuşma değişirse 409 verir. Eşzamanlı duplicate insert'i veritabanı sınırı engeller; yalnız kazanan yeni kayıt bildirim/audit üretir. Anahtarsız eski istemciler çalışmaya devam eder. Var olan konuşmaya retry, yeni-konuşma kotasını tekrar tüketmez.

Bu alt görev production veya mevcut DB'yi değiştirmedi. Root kontrollü yerel migration uygulamasını ayrı yürüttü; root raporundaki `local-migrations.json` bu adımın kanıtıdır. Deployment öncesi migration uygulama sırası ayrıca korunmalıdır.

## Doğrulama

- Yeni `tests/messages-session-state.test.mjs`: bellek geri dönüşü, A/B taslak ayrımı, logout/relogin ve gecikmiş yanıt, aynı anahtarlı retry, çift tık, başka konuşmaya geçince gönderimin tamamlanması, sınır/cursor, gerçek component'in boş araması.
- Aynı dosyada **yeni `DatabaseSync(':memory:')`**, tüm gerçek migration'lar ve F00 açıkça sentetik kullanıcılar ile gerçek POST/GET/PATCH çalıştırılır. Kayıp-yanıt ve eşzamanlı retry tek kayıt/bildirim verir; başka sender aynı anahtarı bağımsız kullanabilir. Read durumu gerçek recipient PATCH sonrası değişir. Block/401/404 denetlenir. 250 aynı-zamanlı mesaj, API'nin ID cursor'uyla kesintisiz ve kopyasız devam eder.
- Mevcut history testi gerçek `changeConversation` fonksiyonunu yeni session store ile çalıştıracak şekilde uyarlandı. Back/Forward, hızlı çift Back, masaüstü ayrımı, alıcı seçici ve hesap değişimi regresyonları korunur.
- Scoped ESLint, TypeScript ve ilgili testler çalıştırıldı. Mevcut DB'ye yazan `*runtime*.mjs` scriptleri çalıştırılmadı; testler ağ/fetch üzerinden gerçek hesap/post üretmez.
- Fiziksel Android klavye/inset, TalkBack, uygulama öldürülmesi ve gerçek bağlantı değişimleri bu izole testlerin kanıt kapsamı dışında; root'un canlı tarayıcı kabulü ayrıca raporlanır.

## F07 tamamlayıcı düzeltme

`ProfileMediaPreview` bozuk veya 1×1 boş image önizlemesinde ve video önizleme hatasında anlamlı erişilebilir durum gösterir. Geçerli medya ve mevcut tam görüntüleyici/yeniden dene aksiyonu korunur. Galeri butonu çalışmaya devam eder. Bu davranış profile state test dosyasındaki gerçek preview component harness'iyle doğrulanır; `data-scroll-pending` root entegrasyonu korunmuştur.
