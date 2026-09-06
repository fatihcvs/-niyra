# Hesap silme motoru

Bu iş, kullanıcının açık hesap silme talebini yönetim incelemesine ve doğrulanabilir bir temizleme işlemine bağlar. Talep göndermek veya incelemeye almak silmeyi başlatmaz. Başlatma yalnız etkin, ilk parola değişimini tamamlamış owner hesabına açıktır; yönetici ekranda tam hesabı ve talep kimliğini görüp ayrı onay verir.

## İşlem ve kesintiler

- Talep kabulü aynı veritabanı işleminde hesabı `deleting` durumuna geçirir, oturumları ve cihaz aboneliklerini iptal eder, temizlenecek kayıtları bağımsız iş manifestlerine alır. Aynı talebin yeniden gönderilmesi yeni iş oluşturmaz.
- Dosyalar, sahipliği belirli kayıtlar üzerinden temizlenir. Her gerçek yüklemeden önce kalıcı bir yükleme kaydı yazılır; devam eden veya sonucu bilinmeyen PUT işlemi, dosya şu anda bulunamasa bile tamamlanmış sayılmaz.
- Dosya silme çağrısından sonra dosyanın bulunmadığı kontrol edilir. Depo erişimi, silme yanıtı veya sahiplik belirsizse işlem tamamlandı gösterilmez. İş sahibi mevcut kimlik üzerinden temizliği sürdürebilir.
- Veritabanındaki ortak kayıtlar ve sahiplik ilişkileri son atomik adımda düzenlenir. Tamamlanan kayıt yalnız işlem/talep kimliklerini, tarihleri ve sayıları tutar; özgün hesap adresi, talep metni ve dosya anahtarları geçici manifestlerden kaldırılır.
- Yönetim yanıtı kesilirse arayüz mevcut durumu GET ile kontrol eder. Oturum değişikliği eski onayı geçersiz kılar; istemci otomatik olarak ikinci bir silme talebi göndermez.

## Diğer kullanıcıların içerikleri

Silinen hesabın profil ve dosyaları temizlenir. Diğer kişilerin kendi yorumları, mesajları ve ortak alanlardaki kayıtları korunur. Bunların üst kayıtları anonim bir hesapla ilişkilendirilir; silinen kişinin yazdığı alanlar boşaltılır veya silinmiş içerik açıklamasına dönüşür.

Paylaşım ve notlarda özgün kampüs kapsamı ayrıca korunur. Silinmiş notun dosyası açılmaz; mevcut yorumları yetkili kampüs kullanıcısı okuyabilir. Silinmiş hesaba ait konuşmada kalan katılımcının mesajları erişilebilir kalır ve yeni mesaj yazılamaz. Anonim hesap giriş yapamaz veya yeniden etkinleştirilemez.

Yapılandırılmış ek ve denetim kopyaları da incelenir. Başka bir kullanıcının serbest metin mesajını veya yorumunu, silinen kişiden söz ediyor diye değiştirmez. Bir dosyanın sahipliğini kayıtlardan doğrulayamamak, onu tahminle silmek için gerekçe değildir.

## Kanıt kapsamı

Faz5 tamamlandı:348 toplu test, ayrı131 derlenmiş uygulama testi, TypeScript, ESLint, build ve paket kontrolü başarılı. Node testlerinde yalnız `cloudflare:workers` ana bilgisayar bağlantısı test ortamıyla sağlanır; uygulamanın kimlik ve istek doğrulaması değiştirilmez. Gerçek depolama ve normal giriş kanıtı ayrıca `http://127.0.0.1:5180` Chrome akışından gelir.

Chrome4/4 geçti: tek açık yürütme onayı; kaybolan202 yanıttan mevcut iş üzerinden devam;5 sürdürme adımıyla tamamlanma; sentetik hesabın oturumuna401, yüklediği PDF'e404; kalan katılımcının kendi mesajına erişim. Onay ekranları320/390px ve48px düğmelerle kontrol edildi; başka yönetim stiliyle çakışan checkbox genişliği düzeltildi. Kanıtlar `exports/mobile-remaining-code-2026-09-06/phase5/verification.json` ve kaynak manifestinde kayıtlıdır. Normal önizlemedeki gerçek hesap silinmedi.

Bu uygulama veritabanı ve dosya deposu akışıdır. İşletmenin yedek saklama süresi, dış hizmetlerdeki kayıtlar ve yayımlanacak destek kanalı ayrıca belirlenmelidir. Buradaki yerel test, Railway dağıtımı veya mağaza yayını anlamına gelmez.

## Adım sınırları ve eski dosyalar

Her owner tarafından başlatılan sürdürme adımı en fazla 100 depo girdisi, yapılandırılmış kopyalar için bir tablodan 100 satır ve varsayılan 20 dosya silme/doğrulama çifti işler; dosya sınırı sunucu içinde en fazla 25 olabilir. Tarama konumu bağımsız iş kaydında kalır. Depo taraması anahtarların tamamında sayfalıdır; yalnız bu hesaba ait olduğu kanıtlanan anahtarlar silinir. Yeni tamamlanmış işler, eski bekleyen işlemleri kuyruktan gizlemez: görünür talep sayfasının işleri ayrıca birleştirilir.

Yapılandırılmış kopya taraması mesaj eklerini, rapor kanıtlarını ve üç denetim günlüğünü kapsar. Bu sayfalı tarama bitmeden son veritabanı işlemi başlamaz. Son koruma ve temizleme adımı atomiktir; SQL komut sayısı sabit envantere bağlıdır, etkilenen satır sayısı hesabın verisine bağlı kalır. `removedRowCount` bu son adımda açık kullanıcı ilişkilerinden kaldırılan satırları sayar; veritabanının tüm tetikleyici/kademeli silme etkilerinin toplamı değildir. Büyük hesaplar ve büyük depolar için çok sayıda sürdürme adımı gerekebilir; mevcut sentetik testler üretim yük testi sayılmaz.

Eski profil/not/anlık/pazar dosyalarında tam `customMetadata.owner` eşleşmesi kullanılır. E-posta türetilmiş dizin adı tek başına sahiplik kanıtı değildir; böyle bir adayda sahiplik eksikse iş engellenir. Eski paylaşım dosyaları için anahtarın paylaşım kimliği bölümünün kaydedilmiş `posts` veya `post_publish_requests` kimliğiyle tam eşleşmesi gerekir. Hiçbir hesaba bağlanamayan eski bir yetim nesnenin sahibini sistem sonradan çıkaramaz; bu nesneler tahminle silinmez ve bu motor tüm geçmiş depolama nesnelerinin sahibinin bilindiğini iddia etmez.

Kira süresi 60 saniyedir; sürenin dolması başka bir yürütücünün aynı işi alabilmesini sağlar, devam eden/bilinmeyen yüklemenin bittiğini kanıtlamaz. [R2 tutarlılık belgesi](https://developers.cloudflare.com/r2/reference/consistency/) eşzamanlı yazmalarda en son tamamlanan işlemin etkili olduğunu belirtir. Bu nedenle bilinmeyen PUT, zaman geçmesi veya boş HEAD yanıtıyla temiz sayılmaz.

İki hesabın birlikte silinmesinde birbirlerine ait kanıt veya mesaj eki kopyaları işleri kilitlemez. Kabul edilmiş silme işi bulunan donmuş kayıtlarda tetikleyici istisnası yalnız belirlenen alanları boşaltmaya, kimlik bağlantılarını NULL yapmaya veya sabit silinmiş içerik metnine çevirmeye izin verir; kalan bütün sütunların aynı kalması gerekir. Ortak konuşmanın iki üyesini sıralayarak anonim kimliğe aktarma ve moderatör kaydını koruma ayrıca kiralanmış, sonlandırılan işin tam eşlemesine bağlıdır. Mesaj gövdesi, rapor durumu, profil veya hesap kimliği bu istisnayla değiştirilemez. Sütun kapsamını doğrulayan sentetik test, ileride eklenen bir sütunun bu denetim dışında kalmasını yakalar.

Yeni şikâyet kaydı, kanıtla birlikte aynı SELECT içinde yakalanmış hesap kimliği nesillerini ve kanıtın güncel satırını INSERT anında yeniden doğrular. Bu kontrol iç içe mesaj eki kopyalarının silme sırasında boşaltılmasını da kapsar. Şikâyet ve denetim satırı aynı atomik işlemde yazılır; eski hesap veya içerik kanıtı yeniden eklenirse işlem 409 ile reddedilir.
