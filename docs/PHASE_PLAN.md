# Üniyra ürün ve geliştirme faz planı

Bu belge Üniyra'yı görsel bir prototipten, gerçek öğrencilerin güvenle
kullanabildiği bir sosyal öğrenme ürününe taşımak için izlenecek çalışma
planıdır. Planın ana ilkesi nettir: ilk dönemde ücretli özellik, abonelik,
premium paket, reklam veya ödeme duvarı yoktur. Öncelik kullanıcı kazanımı,
tekrar kullanım alışkanlığı, ders bazlı içerik yoğunluğu ve güvenilirliktir.

## Ürün hedefi

Üniyra; ilk sürümde yalnızca Ondokuz Mayıs Üniversitesi'ne (OMÜ) açık,
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

**Durum:** Büyük ölçüde tamamlandı.

**Kullanıcı sonucu:** Üniyra'nın ne olduğu ilk ekranda anlaşılır; akış, notlar,
topluluklar ve keşif alanları tek bir tutarlı ürün diliyle deneyimlenir.

**Kapsam**

- Ürün adı, görsel kimlik ve Türkçe içerik tonu
- Akış, Keşfet, Notlar, Topluluklar, Bildirimler, Kaydedilenler ve Profil
- Mobil ve masaüstü navigasyon
- Gönderi oluşturma, beğeni, yorum, kaydetme, anket ve topluluk etkileşimleri
- Not yükleme ve standart not arama akışlarının arayüz prototipleri
- Beş adımlı OMÜ akademik ilk katılım deneyimi

**Kabul ölçütleri**

- Ana ekran 360 px ve geniş masaüstünde taşmadan çalışır.
- Temel kontroller klavye ve dokunma ile kullanılabilir.
- Ücret, premium veya abonelik çağrısı bulunmaz.
- Üretim derlemesi ve temel sayfa testi geçer.

**Çıkış koşulu:** Görsel ürün omurgası canlı adreste incelenebilir durumda olur.

## Faz 1 — Gerçek kimlik ve akademik profil temeli

**Durum:** Tamamlandı; üretim doğrulaması sürüyor.

**Kullanıcı sonucu:** Öğrenci kimliğiyle giriş yapan kişi; OMÜ fakültesini,
bölümünü, sınıfını ve derslerini bir kez seçer. Bu profil sonraki oturumlarda
hatırlanır ve Üniyra deneyimini kişiselleştirir.

**Veri modeli**

- `users`: doğrulanmış kimlik, görünen ad ve hesap zamanları
- `universities`: üniversite kataloğu
- `faculties`: OMÜ fakülte kataloğu
- `departments`: fakülteye bağlı bölüm kataloğu
- `courses`: bölümle ilişkili ders kataloğu
- `student_profiles`: üniversite, bölüm, sınıf ve katılım durumu
- `student_courses`: kullanıcı ile seçtiği dersler arasındaki ilişki

**Sunucu ve güvenlik kapsamı**

- Platform tarafından doğrulanmış kullanıcı kimliğini sunucuda okuma
- Profil okuma ve güncelleme uçları
- Gönderilen üniversite, fakülte, bölüm, sınıf ve dersleri izinli katalogla doğrulama
- Kimliği olmayan yazma isteklerini reddetme
- Veritabanı şemasını sürümlü göç dosyalarıyla yönetme
- Kişisel profil verisini kalıcı platform veritabanında saklama

**Arayüz kapsamı**

- 5 adımlı ilk katılım akışı
- Sabit OMÜ pilot kampüsü
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

**Durum:** Aktif geliştirme. Gerçek gönderi, beğeni, yorum ve kaydetme
altyapısı tamamlandı; herkese açık öğrenci profili ve takip sistemi eklendi.

**Kullanıcı sonucu:** Gönderiler ve etkileşimler artık demo değil; kullanıcıya
ait, kalıcı ve ders bağlamına göre sıralanan gerçek içeriklerdir.

**Kapsam**

- Kullanıcı profilleri ve herkese açık profil sayfaları
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

**Çıkış koşulu:** Pilot kullanıcıları tek oturumda gerçek gönderi, takip ve
yorum döngüsünü tamamlayabilir.

## Faz 3 — Gerçek not kütüphanesi ve dosya yükleme

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

**Çıkış koşulu:** Pilot kullanıcı gerçek bir PDF yükleyebilir ve ikinci kullanıcı
bu notu ilgili ders altında bulabilir.

## Faz 4 — Topluluklar ve kampüs alanları

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

**Çıkış koşulu:** Pilot ekip en az üç aktif topluluğu gerçek üyelerle yönetir.

## Faz 5 — Arama ve kaynaklı Üniyra AI

**Durum:** MVP sonrasına ertelendi. İlk sürümde yalnızca standart arama olacak.

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
- Sonuç kalitesi gerçek pilot sorgularıyla ölçülür.
- Hızlı klasik arama, AI katmanı çalışmadığında kullanılabilir kalır.

**Çıkış koşulu:** Pilot sorguların çoğunda kullanıcı iki etkileşim içinde yararlı
bir kaynağa ulaşır.

## Faz 6 — Bildirim, moderasyon ve güven

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

**Çıkış koşulu:** Pilot moderatör ekibi örnek olayları baştan sona çözebilir.

## Faz 7 — Kapalı üniversite pilotu ve büyüme döngüsü

**Kullanıcı sonucu:** Sınırlı kampüslerde içerik yoğunluğu yüksek, faydası
ölçülebilir bir Üniyra deneyimi oluşur.

**Kapsam**

- Yalnızca OMÜ'de fakülte, bölüm ve ders bazlı pilot
- Davet bağlantıları ve kontrollü kullanıcı kabulü
- İlk hafta görevleri: 3 ders seç, 1 kişiyi takip et, 1 not kaydet
- İçerik boşluğunu önleyen ders elçileri ve başlangıç içerikleri
- Ürün analitiği, geri bildirim formu ve haftalık görüşmeler
- Erişilebilirlik ve düşük bağlantı kalitesi testleri

**Kabul ölçütleri**

- Kritik derslerde başlangıç içeriği boş değildir.
- Pilot kullanıcı hataları ve geri bildirimleri izlenebilir işlere dönüşür.
- Geri dönüş, ilk değer ve katkı oranları tanımlanan hedefe yaklaşır.

**Çıkış koşulu:** İki ardışık hafta boyunca geri dönüş ve içerik üretimi
istikrarlı artar.

## Faz 8 — Açık beta ve üretim sağlamlaştırma

**Kullanıcı sonucu:** Üniyra daha geniş öğrenci kitlesine güvenilir, hızlı ve
izlenebilir biçimde açılır.

**Kapsam**

- Performans bütçeleri ve yavaş sorgu takibi
- Hata izleme, sağlık kontrolleri ve olay müdahale planı
- Yedekleme, veri saklama ve silme politikaları
- Gizlilik metni, kullanım koşulları ve topluluk ilkeleri
- Güvenlik gözden geçirmesi ve kritik uç testleri
- Kademeli erişim açma ve geri alma planı

**Kabul ölçütleri**

- Kritik kullanıcı yolculukları otomatik uçtan uca test edilir.
- Veri kaybı, güvenlik olayı ve hizmet kesintisi için yazılı prosedür vardır.
- Ana mobil ekranlar performans bütçesini karşılar.

**Çıkış koşulu:** Açık beta kontrollü biçimde başlatılır ve ürün sağlığı günlük
olarak izlenebilir.

## Yakın dönem çalışma sırası

1. Faz 1 veritabanı şeması ve sürümlü göç dosyası
2. Kimliği doğrulanmış profil okuma/yazma servisi
3. Dört adımlı ilk katılım arayüzünün servise bağlanması
4. Profil verisinin akış, ders çevreleri ve Profil ekranına yansıması
5. Canlı ortamda kalıcılık kontrolü
6. Faz 2 için gönderi ve sosyal grafik şemasının ayrıntılandırılması

Bu sıra, görünür ürün ilerlemesini korurken veri sahipliği ve güvenlik temelini
erken kurar.
