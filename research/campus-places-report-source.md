# Kampira kampüs çevresi kataloğu — araştırma kaydı

Araştırma ve veri kontrol tarihi: 4 Eylül 2026
Kapsam: Kampira üniversite kataloğundaki 241 kurum; Türkiye, Kuzey Kıbrıs ve Kıbrıs Cumhuriyeti.
Çıktı: Kaynak türü kullanıcıya açıkça gösterilen 2.856 kampüs ve kampüs çevresi kaydı.

## Sonuç

- 241 üniversitenin tamamında en az bir kaynaklı kayıt bulunuyor.
- 215 üniversite, OpenStreetMap'te yüksek güvenle eşleştirilen 495 kampüs/üniversite çapası üzerinden 1,5 km çevre taramasına sahip.
- Bu taramadan kampüs binaları, kütüphaneler, yeme-içme noktaları, sosyal alanlar, spor, sağlık ve ulaşım başlıklarında 2.808 adlandırılmış nokta seçildi.
- Harita çapası güvenle eşleşmeyen 26 kurum için üniversitenin veya yetkili yükseköğretim kurumunun yayımladığı 48 adres kaydı eklendi.
- Toplam 2.814 kayıtta doğrulanabilir koordinat var. Resmî adres kayıtlarının 42'sinde kesin koordinat bulunamadığı için koordinat tahmin edilmedi; kullanıcıya adres ve kaynak bağlantısı gösteriliyor.

## Doğrulama sınıfları

| Ürün etiketi | Ölçüt | Kullanıcıya verilen anlam |
|---|---|---|
| Resmî kaynak | Üniversitenin kendi alan adı veya yetkili kamu/yükseköğretim sayfasında yayımlanan adres | Adres resmî sayfada bulundu; sayfada yazmayan saat ve erişilebilirlik özellikleri eklenmedi |
| Açık harita kaydı | OpenStreetMap'te adı bulunan güncel bir nesne ve yüksek güvenli kampüs eşleşmesine en çok 1,5 km mesafe | Harita topluluğunun kaydıdır; üniversite tarafından resmen işletildiği veya onaylandığı anlamına gelmez |
| Topluluk kaydı | Kampira öğrencisinin uygulamadan eklediği kayıt | Ayrı kullanıcı onay sayacıyla gösterilir; araştırma kataloğuyla karıştırılmaz |

## Araştırma ve seçim yöntemi

1. Kurum kapsamı YÖK, YÖDAK ve Kıbrıs Cumhuriyeti yükseköğretim listeleriyle oluşturulan mevcut Kampira kataloğundan alındı.
2. OpenStreetMap üniversite/kampüs nesneleri tek bir önbellekli araştırma çalıştırmasıyla alındı. Eşleştirme; resmî alan adı, Wikidata kimliği, tam ad veya yüksek güvenli ad benzerliğiyle sınırlandı.
3. Her kabul edilen kampüs çapası çevresinde 1,5 km içindeki yalnız adlandırılmış ve ürün kategorisine çevrilebilen noktalar tarandı.
4. İlk sonuçların yalnız en yakın kafe veya duraklarla dolmasını önlemek için kategori dengeli seçim uygulandı; üniversite başına en fazla 14 açık harita kaydı tutuldu.
5. Eşleşmeyen kurumlar tek tek resmî iletişim/yerleşke sayfalarından araştırıldı. Bir kurum birden fazla güncel yerleşke yayımlıyorsa ayrı kayıtlar oluşturuldu.
6. Nominatim yalnız tek seferlik, önbellekli ve saniyede en çok bir istek hızında kullanıldı. Yol veya mahalle düzeyindeki belirsiz sonuçlar koordinat olarak kabul edilmedi.
7. Açılış saati ve erişilebilirlik yalnız OpenStreetMap nesnesinde ilgili etiket varsa aktarıldı. Resmî adres sayfasından çıkarım veya tahmin yapılmadı.

## Kapsam ve boşluk matrisi

| Katman | Üniversite | Kayıt | Koordinat | Bilinen sınır |
|---|---:|---:|---:|---|
| OpenStreetMap çevre kataloğu | 215 | 2.808 | 2.808 | Harita topluluğunun güncelliğine ve etiket kapsamına bağlı |
| Resmî adres yedeği | 26 | 48 | 6 | 42 adres kesin koordinat bulunana kadar haritada işaretlenmiyor |
| Toplam | 241 | 2.856 | 2.814 | Her fiziksel şube/bina haritada kayıtlı olmayabilir |

## Kaynak defteri ve kanıt zinciri

| İddia/veri grubu | Birincil kaynak | Kullanım |
|---|---|---|
| Türkiye üniversite kapsamı | [YÖK Üniversitelerimiz](https://www.yok.gov.tr/universiteler/universitelerimiz) ve [Üniversitelerimiz–UETS](https://www.yok.gov.tr/universiteler/uets) | Kurum kapsamının denetimi |
| Kuzey Kıbrıs kapsamı | [YÖDAK üniversiteler listesi](https://yodak.gov.ct.tr/universiteler) | Kurum kapsamının denetimi |
| Kıbrıs Cumhuriyeti kapsamı | [Department of Higher Education](https://www.highereducation.ac.cy/index.php/en/dae/ekpaideftiko-systima) | Kurum kapsamının denetimi |
| Harita nesneleri ve konumlar | [OpenStreetMap](https://www.openstreetmap.org/) | Kampüs çapaları ve çevredeki adlandırılmış noktalar |
| Lisans/atıf | [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright) | Uygulamadaki `© OpenStreetMap katkıcıları · ODbL` bildirimi |
| Toplu sorgu yöntemi | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) ve [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL) | Tekrarlanabilir, önbellekli veri toplama |
| Adres eşleştirme sınırı | [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) | Seri istek, 1 istek/saniye ve önbellek yaklaşımı |
| Çok yerleşkeli Türkiye örneği | [İstanbul Topkapı Üniversitesi yerleşkeleri](https://www.topkapi.edu.tr/tr-tr/yerleskeler/66340), [Ankara Medipol kampüsleri](https://www.ankaramedipol.edu.tr/kampus-hakkinda), [Kırıkkale Üniversitesi yerleşim alanları](https://kku.edu.tr/Anasayfa/Sayfa/Index?Sayfa=YerlesimAlanlari) | Birden fazla resmî yerleşkenin ayrı kaydı |
| Kuzey Kıbrıs adres örnekleri | [Ada Kent iletişim](https://adakent.edu.tr/iletisim-5/), [Rauf Denktaş iletişim](https://rdu.edu.tr/contact), [Kıbrıs Aydın iletişim](https://cau.edu.tr/universitemiz/iletisim/) | Harita eşleşmesi olmayan kurumlarda resmî adres |
| Kıbrıs Cumhuriyeti adres örnekleri | [University of Limassol iletişim](https://www.uol.ac.cy/en/contact-us/), [Philips University binaları](https://philipsuni.ac.cy/philipsuni-buildings-and-location/), [NKUA Cyprus](https://uoa.ac.cy/about-uoa/?lang=en) | Resmî kampüs/rektörlük adresleri |

48 resmî adresin tamamına ait satır düzeyi bağlantı `data/campus-place-official-sources-2026.json` dosyasında; 2.808 OpenStreetMap kaydının doğrudan nesne bağlantıları `data/campus-places-2026.json` dosyasında tutulur.

## Yenileme ve sınırlamalar

- Katalog bir keşif başlangıç noktasıdır; işletme durumu, saatler ve erişilebilirlik zaman içinde değişebilir.
- OpenStreetMap kayıtları bağımsız topluluk verisidir. “Açık harita kaydı” etiketi özellikle “resmî onay” iddiasını önler.
- Araştırma, adlandırılmış ve kategoriye çevrilebilir noktalarla sınırlıdır; adsız bina ve yollar ürün listesine alınmaz.
- Kampüs başına sınır, mobil ve masaüstü arayüzün kullanılabilir kalması içindir. Kaynak verinin tamamı yeniden üretim önbelleğinde tutulur.
- Sonraki bakım turunda 42 adres için yalnız resmî gömülü harita veya kesin OSM/Wikidata nesnesi bulunduğunda koordinat eklenmelidir.
