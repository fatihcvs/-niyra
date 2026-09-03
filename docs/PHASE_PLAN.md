# Üniyra ürün ve geliştirme faz planı

Bu belge Üniyra'yı görsel bir prototipten, gerçek öğrencilerin güvenle
kullanabildiği bir sosyal öğrenme ürününe taşımak için izlenecek çalışma
planıdır. Planın ana ilkesi nettir: ilk dönemde ücretli özellik, abonelik,
premium paket, reklam veya ödeme duvarı yoktur. Öncelik kullanıcı kazanımı,
tekrar kullanım alışkanlığı, ders bazlı içerik yoğunluğu ve güvenilirliktir.

## Ürün hedefi

Üniyra; Türkiye ve Kıbrıs'taki 241 yükseköğretim kurumunu kapsayan,
fakülte, bölüm ve ders bağlamını merkeze alan bir öğrenci sosyal ağıdır.
Öğrenciler kendi akademik çevrelerini oluşturur, gönderi ve not
paylaşır, topluluklara katılır ve ihtiyaç duydukları kaynağa hızlıca ulaşır.

Başarıyı ilk aşamada şu göstergelerle ölçeceğiz:

- İlk katılım akışını tamamlayan kullanıcı oranı
- İlk gün en az üç ders seçen kullanıcı oranı
- İlk yedi günde ikinci kez geri dönen kullanıcı oranı
- Ders başına haftalık yeni gönderi ve not sayısı
- Arama yapan kullanıcının yararlı bir sonuca ulaşma oranı
- Şikâyet çözüm süresi ve güvenlik ihlali oranı

## Değişmez ürün ilkeleri

- Ücretli özellik veya ödeme altyapısı eklenmeyecek.
- Akademik profil ve yazma işlemleri sunucu tarafında kimlikle doğrulanacak.
- Kullanıcıya ait kalıcı veriler tarayıcı belleğine emanet edilmeyecek.
- Not dosyaları ile notların aranabilir bilgileri ayrı ve güvenli katmanlarda
  tutulacak.
- Mobil deneyim masaüstünün küçültülmüş hâli değil, birinci sınıf ürün yüzeyi
  olacak.
- Yapay zekâ araması ve “nota sor” özellikleri MVP sonrasına ertelenecek.
- Her faz; erişilebilirlik, mobil kullanım, hata durumları ve üretim doğrulaması
  tamamlanmadan kapanmış sayılmayacak.

## Faz 0 — Ürün yönü ve deneyim temeli

**Durum:** Tamamlandı.

**Kullanıcı sonucu:** Üniyra'nın ne olduğu ilk ekranda anlaşılır; akış, notlar,
topluluklar ve keşif alanları tek bir tutarlı ürün diliyle deneyimlenir.

**Kapsam**

- Ürün adı, görsel kimlik ve Türkçe içerik tonu
- Akış, Keşfet, Notlar, Topluluklar, Bildirimler, Kaydedilenler ve Profil
- Mobil ve masaüstü navigasyon
- Gönderi oluşturma, beğeni, yorum, kaydetme, anket ve topluluk etkileşimleri
- Not yükleme ve standart not arama akışlarının arayüz prototipleri
- Beş adımlı, aranabilir üniversite kataloglu akademik ilk katılım deneyimi

**Kabul ölçütleri**

- Ana ekran 360 px ve geniş masaüstünde taşmadan çalışır.
- Temel kontroller klavye ve dokunma ile kullanılabilir.
- Ücret, premium veya abonelik çağrısı bulunmaz.
- Üretim derlemesi ve temel sayfa testi geçer.

**Çıkış koşulu:** Görsel ürün omurgası canlı adreste incelenebilir durumda olur.

## Faz 1 — Gerçek kimlik ve akademik profil temeli

**Durum:** MVP v1.0 kapsamında tamamlandı. E-posta/parola tabanlı self-servis
kayıt, güvenli oturum, çıkış ve yeniden giriş akışı yerel uçtan uca testte üç
ayrı hesapla doğrulandı; hesap açılışı yönetici onayı gerektirmez.

**Kullanıcı sonucu:** Öğrenci kimliğiyle giriş yapan kişi; üniversitesini,
fakültesini, bölümünü, sınıfını ve derslerini bir kez seçer. Bu profil sonraki oturumlarda
hatırlanır ve Üniyra deneyimini kişiselleştirir.

**Veri modeli**

- `users`: hesap kimliği, görünen ad ve hesap zamanları
- `user_credentials`: tuzlanmış PBKDF2 parola özetleri
- `user_sessions`: yalnız özeti saklanan, süreli oturum belirteçleri
- `universities`: üniversite kataloğu
- `faculties`: üniversiteye bağlı akademik birimler
- `departments`: fakülteye bağlı bölüm kataloğu
- `courses`: bölümle ilişkili ders kataloğu
- `student_profiles`: üniversite, bölüm, sınıf ve katılım durumu
- `student_courses`: kullanıcı ile seçtiği dersler arasındaki ilişki

**Sunucu ve güvenlik kapsamı**

- D1 tabanlı self-servis hesap ve `HttpOnly`, `SameSite=Lax` oturum çerezi
- Yalnız `.chatgpt.site` alanında platform kimliğini güvenilir ek yol olarak okuma
- Railway alanında istemcinin taklit ettiği platform başlıklarını reddetme
- Profil okuma ve güncelleme uçları
- Gönderilen üniversite, fakülte, bölüm, sınıf ve dersleri izinli katalogla doğrulama
- Kimliği olmayan yazma isteklerini reddetme
- Veritabanı şemasını sürümlü göç dosyalarıyla yönetme
- Kişisel profil verisini kalıcı platform veritabanında saklama

**Arayüz kapsamı**

- 5 adımlı ilk katılım akışı
- 204 Türkiye, 23 Kuzey Kıbrıs ve 14 Kıbrıs Cumhuriyeti kurumu arasında arama
- OMÜ için ayrıntılı hazır fakülte/bölüm/ders kataloğu; diğer kurumlar için doğrulanan serbest akademik birim ve 3–8 ders girişi
- Fakülte seçimi
- Fakülteye bağlı bölüm ve sınıf seçimi
- En az 3 ders seçimi
- Kaydetme, hata, yeniden deneme ve başarı durumları
- Profil bilgilerini akış başlığına, ders çevrelerine ve Profil görünümüne taşıma

**Test kapıları**

- Geçersiz üniversite, bölüm, sınıf ve ders sunucu tarafından reddedilir.
- Başka bir kullanıcının profili istemci girdisiyle okunamaz veya değiştirilemez.
- Profil kaydedildikten sonra sayfa yenilendiğinde aynı bilgiler geri gelir.
- Kimliksiz istek anlaşılır giriş yönlendirmesi döndürür.
- Veritabanı göçü temiz bir ortamda uygulanabilir.
- Lint, üretim derlemesi ve temel API testleri geçer.

**Çıkış koşulu:** En az bir gerçek kullanıcı canlı ortamda profilini oluşturup
yeniden giriş yaptığında kişiselleştirilmiş akışını görebilir.

## Faz 2 — Sosyal grafik ve kalıcı akış

**Durum:** Teknik kapsam tamamlandı. Gerçek gönderi, beğeni,
okunabilir/silinebilir yorum ve kaydetme
altyapısı; aynı üniversiteye açık öğrenci profili, takip sistemi, kampüs öğrenci araması,
profil ve gönderi bağlantısı paylaşımı, gönderi düzenleme/yumuşak silme,
kişiselleştirilmiş sıralama, gerçek kaydedilenler görünümü ve imleç tabanlı
akış sayfalaması tamamlandı.

**Kullanıcı sonucu:** Gönderiler ve etkileşimler artık demo değil; kullanıcıya
ait, kalıcı ve ders bağlamına göre sıralanan gerçek içeriklerdir.

**Kapsam**

- Kullanıcı profilleri ve herkese açık profil sayfaları
- Üniversiteye ayrılmış öğrenci araması ve paylaşılabilir profil bağlantıları
- Takip etme/bırakma ilişkisi
- Metin gönderisi oluşturma, düzenleme ve silme
- Ders, kampüs ve topluluk bağlamı
- Beğeni, yorum, kaydetme ve paylaşılabilir gönderi bağlantısı
- “Senin için”, “Takip ettiklerin” ve “Kampüsüm” akışları
- Basit akış sıralaması: güncellik, ders yakınlığı ve takip ilişkisi
- Sayfalama, boş durumlar ve iyimser arayüz güncellemeleri

**Kabul ölçütleri**

- Tüm yazma işlemlerinde sahiplik sunucuda kontrol edilir.
- Aynı etkileşim tekrarlanarak çoğaltılamaz.
- Silinen içerik akış ve profilden tutarlı biçimde kalkar.
- Akış ilk yüklemede ve devam sayfalarında kararlı sıralanır.
- Mobilde gönderi oluşturma ve yorumlama kesintisiz tamamlanır.

**Çıkış koşulu:** Kullanıcılar tek oturumda gerçek gönderi, takip ve
yorum döngüsünü tamamlayabilir.

## Faz 3 — Gerçek not kütüphanesi ve dosya yükleme

**Durum:** Teknik kapsam tamamlandı. R2 dosya alanı, D1 not meta verisi,
dosya imzası/MIME/uzantı/boyut doğrulaması, ilerleme-hata-yeniden deneme,
detay/önizleme/indirme, kaydetme, tekil görüntülenme, ders filtreleri ve
sahiplik kontrollü silme bağlıdır. Yerel D1+R2 uçtan uca doğrulaması geçti;
canlı gerçek kullanıcı ölçümü üretim kullanımına bağlıdır.

**Kullanıcı sonucu:** Öğrenciler ders notlarını güvenle yükler; diğer öğrenciler
ders, okul ve konuya göre notu görüntüler veya kaydeder.

**Kapsam**

- Dosya nesnelerini depolama alanında saklama
- Not sahipliği, başlık, ders, tür, açıklama ve etiketleri veritabanında tutma
- PDF ve desteklenen belge/görsel türleri için güvenli yükleme
- Boyut, içerik türü ve dosya adı doğrulaması
- Yükleme ilerlemesi, başarısızlık ve yeniden deneme
- Not detay sayfası, görüntüleme ve kontrollü indirme
- Kaydetme, görüntülenme sayısı ve ders filtreleri
- İnceleme durumu: işleniyor, yayında, reddedildi

**Kabul ölçütleri**

- Dosya baytları veritabanında tutulmaz.
- Yetkisiz kullanıcı başka birinin taslak dosyasına erişemez.
- Hatalı tür ve limit üstü dosya yüklenemez.
- Yarım kalan yüklemeler görünür hata durumuna dönüşür.
- Not silme, dosya ve ilişkili bilgileri tutarlı biçimde kaldırır.

**Çıkış koşulu:** Bir kullanıcı gerçek bir PDF yükleyebilir ve ikinci kullanıcı
bu notu ilgili ders altında bulabilir.

## Faz 4 — Topluluklar ve kampüs alanları

**Durum:** Teknik kapsam tamamlandı. Açık veya istekli katılım, kurucu-yönetici-
moderatör-üye rolleri, üye onayı/rol değişimi, topluluk gönderisi, sabitleme,
geri açılabilir arşivleme ve yönetim denetim kaydı bağlıdır.

**Kullanıcı sonucu:** Öğrenciler ilgi alanı, kampüs veya ders çevresinde kalıcı
topluluklar kurar ve yönetir.

**Kapsam**

- Topluluk oluşturma, katılma ve ayrılma
- Kurucu, yönetici, moderatör ve üye rolleri
- Topluluk gönderileri ve sabitlenmiş içerik
- Üyelik isteği gerektiren veya açık topluluk seçeneği
- Kampüs ve ders topluluklarının kataloglanması
- Topluluk kuralları ve yönetim eylem kaydı

**Kabul ölçütleri**

- Rol dışı yönetim işlemleri sunucuda reddedilir.
- Üye sayıları ve üyelik durumu tutarlıdır.
- Topluluk silme veya arşivleme geri alınabilir güvenli akışla yapılır.

**Çıkış koşulu:** Ürün ekibi en az üç aktif topluluğu gerçek üyelerle yönetir.

## Faz 5 — Arama ve kaynaklı Üniyra AI

**Durum:** MVP için standart birleşik arama tamamlandı; öğrenci, ders, gönderi,
not ve topluluk aynı arama yüzeyinde kaynak bağlantılarıyla bulunur. Yapay zekâ
yanıt katmanı, değişmez ürün kararı gereği MVP sonrasına ertelidir ve bu sürümün
çıkış kapsamına dahil değildir.

**Kullanıcı sonucu:** Öğrenci doğal dille ne aradığını anlatır; sistem ilgili
notları gerekçesi ve kaynağıyla sıralar.

**Kapsam**

- Kullanıcı, ders, gönderi, not ve topluluk araması
- Yazım hatası toleransı ve ders kodu eşleştirmesi
- Filtreler: üniversite, bölüm, ders, içerik türü ve tarih
- Not metni çıkarma ve aranabilir dizin
- Doğal dil sorgusunu güvenli arama niyetine dönüştürme
- Her AI sonucunda kaynak not, eşleşme nedeni ve güven uyarısı
- Uygunsuz veya hassas belge içeriği için koruma katmanı

**Kabul ölçütleri**

- AI cevabı kaynak not bağlantısı olmadan akademik iddia üretmez.
- Yetkisiz içerik arama veya AI sonucu üzerinden sızmaz.
- Sonuç kalitesi gerçek kullanıcı sorgularıyla ölçülür.
- Hızlı klasik arama, AI katmanı çalışmadığında kullanılabilir kalır.

**Çıkış koşulu:** Gerçek sorguların çoğunda kullanıcı iki etkileşim içinde yararlı
bir kaynağa ulaşır.

## Faz 6 — Bildirim, moderasyon ve güven

**Durum:** Teknik kapsam tamamlandı. Etkileşim, ders ve topluluk bildirimleri;
okundu bilgisi/tercihler; şikâyet, kanıt, karar ve itiraz kaydı; iki yönlü
engelleme, sessize alma; rol korumalı moderasyon kuyruğu; hız sınırı ve denetim
kayıtları hazırdır. Üretim moderatör rolü ataması ve gerçek örnek olay tatbikatı
üretim operasyonuna bağlıdır.

**Kullanıcı sonucu:** Öğrenci önemli gelişmeleri kaçırmaz; taciz, spam ve telif
ihlalleri için anlaşılır güvenlik araçlarına sahiptir.

**Kapsam**

- Beğeni, yorum, takip, ders ve topluluk bildirimleri
- Okundu bilgisi ve bildirim tercihleri
- İçerik ve kullanıcı şikâyeti
- Engelleme, sessize alma ve görünürlük kontrolleri
- Moderasyon kuyruğu, karar ve itiraz kaydı
- Spam hız limitleri ve kötüye kullanım sinyalleri
- Telif ve kişisel veri kaldırma akışı

**Kabul ölçütleri**

- Engellenen kullanıcılar iki yönlü koruma kurallarına uyar.
- Şikâyet kaydı kanıt, durum ve karar geçmişini korur.
- Kritik yazma uçları hız sınırı ve denetim kaydı içerir.

**Çıkış koşulu:** Moderatör ekibi örnek olayları baştan sona çözebilir.

## Faz 7 — Self-servis MVP geçişi

**Durum:** Tamamlandı. Ürün sahibi kararıyla kapalı üniversite pilotu atlandı;
davet kodu, pilot görev paneli, demo profil ve sahte sosyal içerik kullanıcı
yüzeyinden kaldırıldı. Her öğrenci gerekli hesap ve akademik profil bilgilerini
girerek onaysız biçimde ürüne katılabilir.

**Kullanıcı sonucu:** Ziyaretçi kendi hesabını anında açar, üniversite ve ders
profilini tamamlar ve gerçek ürün verisiyle çalışmaya başlar.

**Kapsam**

- Self-servis e-posta/parola kaydı ve yeniden giriş
- Yönetici onayı olmadan anında aktif hesap
- Türkiye ve Kıbrıs kataloğuyla beş adımlı akademik profil
- Demo ve pilot/davet yüzeylerinin kaldırılması
- Gerçek boş durumlar ve kaynaklı editoryal başlangıç notları
- Masaüstü ve dar ekran kayıt görünümü doğrulaması

**Kabul ölçütleri**

- Kayıt yanıtı hesabın onay gerektirmediğini açıkça bildirir.
- Parola ve ham oturum belirteci veritabanında düz metin tutulmaz.
- Taklit edilmiş platform kimlik başlıkları Railway isteklerinde reddedilir.
- Kayıt, çıkış, yeniden giriş ve profil oluşturma otomatik testte tamamlanır.

**Çıkış koşulu:** Yeni öğrenci davetsiz kayıt olup kalıcı akademik profilini
oluşturabilir ve yeniden girişte aynı profile ulaşabilir.

## Faz 8 — MVP v1.0 üretim sürümü

**Durum:** MVP v1.0 teknik kapsamı tamamlandı. Sağlık ucu sürüm numarası verir;
şema, API, üretim derlemesi ve kritik kullanıcı yolculuğu otomatik olarak
doğrulanır. Railway herkese açık ana ürün yüzeyidir.

**Kullanıcı sonucu:** Üniyra daha geniş öğrenci kitlesine güvenilir, hızlı ve
izlenebilir biçimde açılır.

**Kapsam**

- Performans bütçeleri ve yavaş sorgu takibi
- Hata izleme, sağlık kontrolleri ve olay müdahale planı
- Yedekleme, veri saklama ve silme politikaları
- Gizlilik metni, kullanım koşulları ve topluluk ilkeleri
- Güvenlik gözden geçirmesi ve kritik uç testleri
- Herkese açık Railway dağıtımı ve geri alma planı

**Kabul ölçütleri**

- Kritik kullanıcı yolculukları otomatik uçtan uca test edilir.
- Veri kaybı, güvenlik olayı ve hizmet kesintisi için yazılı prosedür vardır.
- Ana mobil ekranlar performans bütçesini karşılar.

**Çıkış koşulu:** `v1.0.0` Railway üzerinde sağlıklı çalışır, kayıt ekranı ve
kritik API uçları canlı adreste doğrulanır.

## Kalan gerçek dünya çıkış kapıları

Kodla tamamlanamayan aşağıdaki maddeler ürünün içinde izlenebilir hâle
getirilmiştir; bunlar gerçek kullanıcı, süre veya erişim kararı gerektirir:

1. Gerçek öğrencilerle profil → takip → yorum → kaydetme ve not yükleme
   döngüsünü farklı mobil cihazlarda izlemek.
2. Üretim moderatörlerini kontrollü olarak atayıp örnek şikâyet ve itirazı
   baştan sona çözmek.
3. Kritik derslere izinli başlangıç içeriklerini ders elçileriyle eklemek ve iki
   ardışık hafta geri dönüş/katkı ölçümü toplamak.
4. Açık beta öncesi hukuki metinleri kurumsal incelemeden geçirmek, dosya zararlı
   içerik taramasını bağlamak ve veri geri yükleme tatbikatını yapmak.
5. ChatGPT Sites dağıtımını da Railway ile aynı açık erişim politikasına almak
   istenirse Sites erişim politikasını ayrıca güncellemek.
