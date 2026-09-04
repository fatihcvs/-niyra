# Üniyra üniversite ve akademik program kataloğu

Katalog 4 Eylül 2026 itibarıyla Türkiye ve Kıbrıs'ta 241 benzersiz kurum içerir:

- Türkiye: 204
- Kuzey Kıbrıs: 23
- Kıbrıs Cumhuriyeti: 14

Akademik veri katmanı 239 kurumda 3.212 akademik birim, 16.454 benzersiz program
ve 1.321 resmî ders dağılımı/müfredat bağlantısı sunar. İki kurumda güncel ve
doğrulanabilir bir resmî program kaydı bulunamadığı için kullanıcıya açıkça
etiketlenmiş manuel giriş yedeği gösterilir.

## Resmî kaynaklar

- Kurum listesi: [e-Devlet Üniversite Hizmetleri](https://www.turkiye.gov.tr/universite-hizmet-listesi?theme=default), [YÖDAK Üniversiteler](https://www.yodak.gov.ct.tr/universiteler), [Cyprus Department of Higher Education](https://highereducation.ac.cy/index.php/en/citizens-info-serv-he-institutions-en) ve [CYQAA Accredited Institutions](https://www.dipae.ac.cy/en/?Itemid=643)
- Türkiye ve YKS ile öğrenci alan KKTC programları: [ÖSYM 2026-YKS program ve kontenjan kılavuzu](https://osym.gov.tr/2026-yuksekogretim-kurumlari-sinavi-yks-yuksekogretim-programlari-ve-kontenjanlari-kilavuzu), Tablo 3 ve Tablo 4
- Kıbrıs Cumhuriyeti: CYQAA'nın [önlisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-short-cycle-en), [lisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-bachelor-en), [yüksek lisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-master-en), [doktora](https://www.dipae.ac.cy/index.php/en/accreditation-en/accredited-programmes-doctorate-en), [bütünleşik yüksek lisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-integrated-master-en), [tıp](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-med-en), [uzaktan eğitim](https://www.dipae.ac.cy/en/accreditation-en/distance-learning-programmes-en) ve [akredite bölüm](https://www.dipae.ac.cy/en/accreditation-en/accredited-departments-en) tabloları
- Merkezî tabloda olmayan güncel yapılar: [MSÜ](https://www.msu.edu.tr/), [Altınbaş Kıbrıs](https://wpu.edu.tr/tr/fakulteler/), [ASBÜ Kuzey Kıbrıs](https://kktc.asbu.edu.tr/tr/2026-yeni-kayit-rehberi), [Avrupa Liderlik Üniversitesi](https://elu.edu.tr/programmes.php), [Onbeş Kasım Kıbrıs Üniversitesi](https://onbeskku.edu.tr/) ve [Atina Üniversitesi Kıbrıs Şubesi](https://cy-en.uoa.gr/news_and_events/view_announcement/inauguration_of_the_national_and_kapodistrian_university_of_athens_cyprus_branch_a_landmark_event_for_higher_education_in_greece_and_cyprus) resmî akademik sayfaları

ÖSYM dosyalarının SHA-256 özetleri ve bütün kaynak adresleri üretilen
`data/academic-catalog-2026.json` dosyasının `meta.sources` alanında tutulur.

## Veri sözleşmesi

- Burslu, ücretli, indirimli ve KKTC uyruklu kontenjanlar aynı akademik programın
  yerleştirme seçenekleri olarak birleştirilir; eğitim dili ve öğretim biçimi gibi
  akademik farklar korunur.
- Öğrenci yalnızca seçtiği üniversiteye bağlı birim ve programı kaydedebilir;
  sunucu istemci kimliklerini resmî katalogla tekrar doğrular.
- Kayıt ekranı tüm kataloğu tarayıcı paketine gömmez. Yalnızca seçilen
  üniversitenin birim/programları `/api/academic-catalog` üzerinden yüklenir.
- Her öğrencinin o dönem aldığı 3–8 ders kullanıcı tarafından girilir. Ders kodları
  tekilleştirilir ve sunucuda uzunluk/ilişki doğrulamasından geçer.
- CYQAA'nın yayımladığı `Course Distribution` belgeleri ve üniversitelerin kendi
  resmî ders/müfredat sayfaları ilgili programda doğrudan bağlantı olarak gösterilir.
  Tarihli kaynaklarda yayın dönemi bağlantının yanında açıkça yazılır.

## Ders planı genişletmesi — üçüncü parça

- Kara Harp Okulunun sekiz lisans programına dönem bazlı resmî ders planı bağlandı.
- Deniz Harp Okulunun altı lisans programına resmî akademik program/ders listesi bağlandı.
- Kara, Deniz ve Hava Astsubay Meslek Yüksekokullarındaki 27 programa ders kodu,
  kredi ve AKTS içeren resmî 2021-2022 belgeleri bağlandı. Eski dönem bilgisi
  arayüzde görünür tutuldu; belgeler güncel plan gibi etiketlenmedi.

## Kıbrıs müfredat genişletmesi — dördüncü parça

- Altınbaş Kıbrıs Üniversitesinde ders kodu, kredi ve AKTS tablosu gerçekten
  yayımlanan 7 programa doğrudan resmî müfredat bağlantısı eklendi.
- Avrupa Liderlik Üniversitesinde sekiz dönemlik Data Science planı ile ayrıntılı
  Computer Engineering ders/ECTS kataloğu programa bağlandı.
- Atina Üniversitesi Kıbrıs Şubesindeki BAAG programına sekiz yarıyıllık resmî
  müfredat bağlandı.
- Onbeş Kasım'ın arama indeksinde bulunan eski ders planı PDF adresleri canlıda
  404 döndürdüğü için yayına alınmadı; ölü bağlantılar katalog sayısına katılmadı.

## OMÜ müfredat genişletmesi — beşinci parça

- OMÜ'nün resmî [Bilgi Paketi / Ders Kataloğu](https://ubs.omu.edu.tr/ogrenci/ebp/organizasyon.aspx?Mod=1&kultur=tr-TR)
  üzerindeki 103 lisans programı program ve akademik birim adıyla katalogla
  karşılaştırıldı.
- ÖSYM kataloğuyla kesin eşleşen 82 lisans programına ders kodu, teori/uygulama,
  kredi ve AKTS tablolarını içeren tekil resmî program sayfası bağlandı.
- Bilgi Paketinde karşılığı henüz yayımlanmayan 5 yeni lisans programına tahmini
  ders planı atanmadı. Önlisans ağacındaki bağlantılar da yalnızca `javascript:`
  hedefi verdiği için doğrulanabilir URL varmış gibi gösterilmedi.

## İTÜ müfredat genişletmesi — altıncı parça

- İTÜ'nün resmî [ÖBS Ders Planları](https://obs.itu.edu.tr/public/DersPlan/)
  kataloğundaki 106 lisans program kodu, ÖSYM kataloğundaki programlarla eğitim
  dili ve program türü korunarak karşılaştırıldı.
- Kesin eşleşen 49 standart lisans programına, güncel ve geçmiş plan dönemlerini
  birlikte sunan resmî program ders planı sayfası bağlandı; sayfaların her birinde
  ders planı detay hedefi bulunduğu otomatik olarak doğrulandı.
- ÖBS'de ayrı ders planı kodu yayımlanmayan 16 UOLP/çift diploma programı temel
  İTÜ programına yanlış bağlanmadı ve resmî ortak plan bulunana kadar bağlantısız
  bırakıldı.

## ODTÜ müfredat genişletmesi — yedinci parça

- ODTÜ'nün resmî [Academic Catalog](https://catalog.metu.edu.tr/) fakülte ve
  program dizinlerinden 78 lisans program kodu çıkarıldı.
- Ankara kampüsündeki güncel 42 programın tamamı ile ODTÜ Kuzey Kıbrıs
  Kampüsündeki güncel 16 programın tamamı tekil resmî lisans müfredatına bağlandı.
- Bağlantıya alınan 58 sayfanın her birinde lisans müfredatı başlığı ve AKTS
  ders tablosu bulunduğu otomatik olarak doğrulandı; ODTÜ-SUNY ortak programları
  da yalnızca kendi resmî ortak program sayfalarıyla eşleştirildi.

## Bilkent müfredat genişletmesi — sekizinci parça

- Bilkent'in resmî [Online Academic Catalog](https://catalog.bilkent.edu.tr/dep/index.html)
  dizinindeki 35 akademik bölüm güncel katalogla karşılaştırıldı.
- ÖSYM kataloğundaki 27 güncel lisans programının tamamı resmî bölüm müfredatına
  bağlandı; her hedef sayfada müfredat ve AKTS tablosu bulunduğu doğrulandı.
- Bilkent kataloğu sayfaları otomatik ürettiği için bağlantılar bölüm kimlikleriyle
  tutuldu; burs/ücret seçenekleri ayrı programmış gibi çoğaltılmadı.

## Boğaziçi müfredat genişletmesi — dokuzuncu parça

- Boğaziçi'nin resmî [Lisans Programları](https://bogazici.edu.tr/tr/pages/lisans-programlari/301)
  dizinindeki 30 akademik bölüm/program sayfası canlı olarak tarandı.
- ÖSYM kataloğundaki 34 güncel lisans programının tamamı ders kodu, kredi ve AKTS
  tablolarını içeren resmî sayfalara bağlandı; bütün hedeflerde en az 10 farklı ders
  kodu ve AKTS alanı bulunduğu otomatik olarak doğrulandı.
- Matematik ve Fen Bilimleri Eğitimi Bölümündeki beş öğretmenlik programı, kurumun
  bunları aynı resmî bölüm sayfasında ayrı ders planları halinde yayımlaması nedeniyle
  aynı doğrulanmış kaynağı paylaşır; program adları katalogda ayrı kalır.

## Hacettepe müfredat genişletmesi — onuncu parça

- Hacettepe'nin resmî [Bologna Bilgi Sistemi](https://bilsis.hacettepe.edu.tr/oibs/bologna/unitSelection.aspx?type=lis&lang=tr)
  içindeki 119 lisans kaydı, ÖSYM kataloğundaki güncel program adları ve eğitim dili
  korunarak karşılaştırıldı.
- Katalogdaki 79 lisans programının 77'si dönem, ders kodu, yerel kredi ve AKTS
  sütunları bulunan tekil resmî ders planına bağlandı; her hedefte dolu ders tablosu
  ve en az beş farklı ders kodu bulunduğu otomatik olarak doğrulandı.
- Yeni “Yapay Zeka ve Veri Mühendisliği” ile “Paramedik” programlarının Bologna
  kayıtları mevcut olsa da ders planı satırları henüz yayımlanmadığı için bağlantı
  eklenmedi. Eski/yenilenen aynı adlı program kimlikleri güncel programa karıştırılmadı.

## Ankara Üniversitesi müfredat genişletmesi — on birinci parça

- Ankara Üniversitesi'nin resmî [Bologna Bilgi Sistemi](https://bologna.ankara.edu.tr/)
  API'sindeki 171 aktif lisans kaydı, ÖSYM kataloğundaki 139 güncel lisans
  programıyla ad, eğitim dili ve program kimliği korunarak karşılaştırıldı.
- Katalogdaki 137 lisans programı ders kodu, yarıyıl, kredi ve AKTS satırları
  bulunan tekil resmî müfredat ekranına bağlandı. Her plan son üç akademik yıl
  içinde en az sekiz ders kodu, dört yarıyıl ve sekiz dolu AKTS satırıyla canlı
  olarak doğrulandı; bağlantı altında doğrulanan son yayın dönemi gösterilir.
- 106 plan 2026-2027, 30 plan 2025-2026, İngilizce Diş Hekimliği planı ise
  2024-2025 dönemiyle yayımlanıyor. Aynı adlı iki Hemşirelik kaydından kısa adında
  2018-2023 yazan arşiv kayıt dışlandı ve güncel program kimliği kullanıldı.
- Resmî sistemde ayrı müfredat kaydı bulunmayan Biyomedikal Mühendisliği
  UOLP-SUNY Buffalo ile Gayrimenkul Geliştirme ve Yönetimi UOLP-Azerbaycan
  programları benzer adlı temel programa yanlış bağlanmadı.

## Bilinen sınır

YÖK, bütün üniversitelerin dönem-ders listelerini tek bir ulusal veri kümesinde
yayımlamaz; ders bilgi paketleri üniversitelerin kendi Bologna/AKTS sistemlerinde
tutulur. Bu yüzden resmî belge bulunmadan ders adı veya kodu üretilmez. Program ve
birim kapsamı resmî merkezî kaynaklardan gelir, dönem dersleri öğrenci tarafından
doğrulanarak eklenir. Bu ayrım arayüzde ve API yanıtındaki `limitations` alanında
açıkça belirtilir.

Uluslararası Alasya Üniversitesi için YÖDAK kurum kaydı bulunmasına rağmen
erişilebilir resmî program kataloğu doğrulanamadı. Cosmos Open University kurum
olarak CYQAA tarafından akredite olsa da tespit edilen Medical Physics and
Diagnostic Imaging programı [CYQAA reddedilen programlar](https://www.dipae.ac.cy/en/accreditation-en/rejected-programmes-en)
tablosunda yer alıyor. Bu iki kurumda güvenilir olmayan veya reddedilmiş programlar
yayına alınmadı; manuel giriş yedeği korunuyor.

## Bakım

Katalog her ana sürüm öncesinde yeniden karşılaştırılır. Kimlikler yayınlandıktan
sonra değiştirilmez; ad değişiklikleri aynı kimlik üzerinde yapılır. Kurum kapanırsa
mevcut profil ilişkileri korunmadan kayıt silinmez; yeni seçimden kaldırma ayrı bir
veri göçüyle yapılır. Referans bütünlüğü ve kapsam sayıları otomatik testlerle
doğrulanır.
