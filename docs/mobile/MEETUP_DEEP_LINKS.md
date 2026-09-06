# Kesin buluşma bağlantıları

Bir buluşma bildiriminin adresi `/?view=match&meetup=<kimlik>` biçimindedir. Bağlantı, genel eşleşme listesinden bağımsız olarak ilgili isteği açar. Bir bildirimin kalmış olması, içeriğe erişim izni vermez: sunucu açılışta katılımcılığı, iki hesabın etkinliğini ve tamamlanmış profillerini, güncel kampüslerini ve karşılıklı engelleri doğrular.

Bağlantıyı açmak buluşmayı kabul etmez veya reddetmez. Karar yalnız ekrandaki açık kullanıcı eylemiyle verilir. Kabul edilmiş, reddedilmiş, iptal edilmiş veya süresi dolmuş buluşmalar, erişimi süren katılımcılar için durumlarıyla okunabilir. Eksik veya erişilemeyen hedefte başka bir buluşma seçilmez.

`GET /api/social-match?id=<kimlik>` tek isteği mevcut listeyle aynı DTO biçiminde döndürür. Tekrarlanan, boş veya biçimi bozuk kimlikler400; eksik ve erişilemeyen istekler aynı404 yanıtını verir. Yanıtlar `private, no-store` kullanır. Süresi dolan bekleyen istek okuma sırasında `expired` olarak gösterilir; GET veriyi değiştirmez.

Karar, denetim kaydı ve bildirim aynı DB işlemi içinde yazılır. Aynı kararın tekrar gönderilmesi ek bildirim üretmeden mevcut durumu döndürür; çelişen karar409 verir. Yanıt kesilirse ekran kararı kendiliğinden yeniden göndermez, son durumu okur. Yazma anında her iki hesabın kimliği, kampüsü ve erişimi yeniden kontrol edilir.

Detay yükleme, yeniden deneme ve erişilememe durumlarıyla çalışır. Seçili liste sekmesi, arama filtresi veya listenin 80 kayıt sınırı doğrudan hedefi değiştirmez. Önceki hedefin geç gelen yanıtı yeni hedefin ekranını dolduramaz. Geri/İleri ve doğrudan açılmış bağlantının kapatılması ayrıca kontrol edilir.

Web bildirim işleyicisi, dokunma anında doğrulanan adresi açar. Android v4'ün mevcut adres politikası `view=match` ve `meetup` anahtarını zaten destekler; bu bağlantı için APK değişikliği gerekmez. Yerel JVM kontrolü bu politikayı test eder; tablette gerçek buluşma bildirimine dokunmanın kanıtı sayılmaz.

## Doğrulama

Son kaynakla 221 toplu test (82 gerçek SQLite API ve 9 yeni DOM testi dahil), ayrı 131 derlenmiş uygulama testi, TypeScript, ESLint, build ve paket kontrolü başarılı. Örtüşen test sayıları toplanmaz. Mevcut Android v4 adres politikasında 51 JVM kontrolü geçti; APK yeniden üretilmedi.

Gerçek Chrome'da 4/4 kontrol geçti. Üç normal sentetik hesapla gerçek bildirim bağlantısı, kesin hedef, açık kabul/ret/iptal, otomatik karar gönderilmemesi, Geri/İleri ve doğrudan kapatma, taslak ve filtrelerin korunması doğrulandı. 320/390px açık/koyu ekranlarda yatay taşma yok; kapatma ve karar düğmeleri48px, ekran açılışında klavye tetiklenmiyor. Engellenmiş, yetkisiz ve eksik hedefler aynı404 sonucunu veriyor. Liste80 sınırının aşılması gerçek SQLite testiyle doğrulandı; tarayıcıda normal API kotası aşılmadı.

Kanıt: `exports/mobile-remaining-code-2026-09-06/phase6/verification.json`; son Chrome raporu `exports/isolated-mobile-qa/browser/final-1788707563222/report.json`. Son görsellerde “Şimdi” zaman etiketi ayrıca kontrol edildi. İlk tarayıcı koşusundaki eksik “Kampüsüm” sekmesi adımı yalnız test akışında düzeltildi ve başarısız rapor korundu.

Gerçek kişilere test bildirimi gönderilmedi. Fiziksel buluşma bildirimine dokunma, üretime dağıtım ve Google Play yayını ayrıca doğrulanacak.
