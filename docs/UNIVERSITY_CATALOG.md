# Üniyra üniversite ve akademik program kataloğu

Katalog 4 Eylül 2026 itibarıyla Türkiye ve Kıbrıs'ta 241 benzersiz kurum içerir:

- Türkiye: 204
- Kuzey Kıbrıs: 23
- Kıbrıs Cumhuriyeti: 14

Akademik veri katmanı 233 kurumda 3.167 akademik birim, 16.323 benzersiz program
ve 943 resmî ders dağılımı/müfredat bağlantısı sunar. Sekiz kurumda güncel ve
merkezî bir resmî program kaydı bulunamadığı için kullanıcıya açıkça etiketlenmiş
manuel giriş yedeği gösterilir.

## Resmî kaynaklar

- Kurum listesi: [e-Devlet Üniversite Hizmetleri](https://www.turkiye.gov.tr/universite-hizmet-listesi?theme=default), [YÖDAK Üniversiteler](https://www.yodak.gov.ct.tr/universiteler), [Cyprus Department of Higher Education](https://highereducation.ac.cy/index.php/en/citizens-info-serv-he-institutions-en) ve [CYQAA Accredited Institutions](https://www.dipae.ac.cy/en/?Itemid=643)
- Türkiye ve YKS ile öğrenci alan KKTC programları: [ÖSYM 2026-YKS program ve kontenjan kılavuzu](https://osym.gov.tr/2026-yuksekogretim-kurumlari-sinavi-yks-yuksekogretim-programlari-ve-kontenjanlari-kilavuzu), Tablo 3 ve Tablo 4
- Kıbrıs Cumhuriyeti: CYQAA'nın [önlisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-short-cycle-en), [lisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-bachelor-en), [yüksek lisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-master-en), [doktora](https://www.dipae.ac.cy/index.php/en/accreditation-en/accredited-programmes-doctorate-en), [bütünleşik yüksek lisans](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-integrated-master-en), [tıp](https://www.dipae.ac.cy/en/accreditation-en/accredited-programmes-med-en), [uzaktan eğitim](https://www.dipae.ac.cy/en/accreditation-en/distance-learning-programmes-en) ve [akredite bölüm](https://www.dipae.ac.cy/en/accreditation-en/accredited-departments-en) tabloları

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
- CYQAA'nın yayımladığı `Course Distribution` belgeleri ilgili programda doğrudan
  “onaylı ders dağılımı” bağlantısı olarak gösterilir.

## Bilinen sınır

YÖK, bütün üniversitelerin dönem-ders listelerini tek bir ulusal veri kümesinde
yayımlamaz; ders bilgi paketleri üniversitelerin kendi Bologna/AKTS sistemlerinde
tutulur. Bu yüzden resmî belge bulunmadan ders adı veya kodu üretilmez. Program ve
birim kapsamı resmî merkezî kaynaklardan gelir, dönem dersleri öğrenci tarafından
doğrulanarak eklenir. Bu ayrım arayüzde ve API yanıtındaki `limitations` alanında
açıkça belirtilir.

## Bakım

Katalog her ana sürüm öncesinde yeniden karşılaştırılır. Kimlikler yayınlandıktan
sonra değiştirilmez; ad değişiklikleri aynı kimlik üzerinde yapılır. Kurum kapanırsa
mevcut profil ilişkileri korunmadan kayıt silinmez; yeni seçimden kaldırma ayrı bir
veri göçüyle yapılır. Referans bütünlüğü ve kapsam sayıları otomatik testlerle
doğrulanır.
