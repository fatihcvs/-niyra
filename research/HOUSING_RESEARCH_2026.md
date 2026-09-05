# Kampira yurt ve konaklama araştırması

Kaynak kontrol tarihi: **5 Eylül 2026**. Kapsam, platformdaki 241 üniversitedir. Katalog 528 yerleşke / referans noktası ve 7.672 konaklama kaydı içerir. Bu çalışma bütün fiziksel yerleşkelerin veya faal işletmelerin eksiksiz envanteri değildir; kaynaklı başlangıç kataloğudur.

## Kapsam ve kaynaklar

| Katman | Kayıt | Kaynak / yöntem |
| --- | ---: | --- |
| Devlet yurdu | 867 | [GSB Yurt Müdürlükleri](https://kygm.gsb.gov.tr/YurtMudurlukleri), 81 il ve Kıbrıs dizini |
| GSB özel yükseköğrenim barınma kaydı | 1.463 | [GSB Özel Barınma Hizmetleri](https://ozelbarinmahizmetleri.gsb.gov.tr/ozelyurtlar), aynı 82 dizin |
| Üniversite / işletme / diğer resmî kaynaklardan incelenen ek kayıtlar | 58 | Aşağıdaki kaynaklar; üniversitenin listelemesi işletmeyi yönettiği veya anlaşmalı olduğu anlamına gelmez |
| Açık harita konaklama kayıtları | 5.284 | [OpenStreetMap](https://www.openstreetmap.org/copyright); adlandırılmış, bilinen yerleşke noktasına en fazla 5 km uzaklıktaki yurt, otel, hostel, apart ve konukevleri |

Son tür dağılımı: 867 devlet yurdu, 1.476 özel öğrenci konaklaması, 12 üniversite yurdu, işletmeci türü ayrıca doğrulanmamış 439 öğrenci konaklaması, 3.938 otel, 398 pansiyon / konukevi, 197 hostel ve 345 apart. Aynı kayıt farklı üniversitelerin yakın çevresinde görünebilir; yukarıdaki sayılar katalog kimliği bazındadır.

164 GSB il/tür dizini ve 2.330 tesis detay sayfası alındı. Detay sayfalarında harita bağlantısı bulunması, koordinatın doğru olduğu anlamına gelmez. İli veya bölgesiyle uyuşmayan **28 koordinat kullanılmadı**. Kaynakta `0` olarak verilen adres boş bırakıldı. İsimleri bina ve kurum adlarıyla karşılaştırılan açık harita tekrarları ayıklandı; yakın fakat farklı isimli kayıtlar otomatik olarak birleştirilmedi.

Ek birincil kaynaklar:

- [OMÜ barınma](https://aday.omu.edu.tr/yurtlar.php) ve [yerleşkeler](https://www.omu.edu.tr/tr/universitemiz/yerleskeler): üniversite yurtları, konukevleri, Kurupelit, Güzel Sanatlar, Çarşamba ve Bafra noktaları. Personel konukevlerinde kabul koşulları ayrıca belirtilir.
- [ASBÜ KKTC barınma olanakları](https://kktc.asbu.edu.tr/index.php/tr/barinma-olanaklari): yayımlanmış yurt listesi, adresler, iletişim ve açıkça verilen kabul koşulları.
- [DAÜ yurtları](https://dormitories.emu.edu.tr/tr/yurtlar): üniversite ve yap-işlet-devret yurtları ayrı türlerde tutulur; GSB'deki aynı yurt yeniden eklenmez.
- [Ahmet Yesevi Üniversitesi yurtları](https://ayu.edu.kz/birimler/tr/0-ahmet-yesevi-universitesi/yurtlar): Türkistan ve Kentav. Ankara temsilciliği yerleşke kabul edilmez.
- [AUB Mediterraneo konaklama](https://www.aubmed.ac.cy/Student-Life/Pages/Housing.aspx): Anavargos yurdu.
- [Rauf Denktaş Üniversitesi Gönyeli yurdu](https://rdu.edu.tr/wp-content/uploads/2022/05/Gonyeli-Dormitory.pdf): üniversitenin erişilebilir broşürü; güncel kabul şartlarını kuruma sorma notuyla.
- [Kıbrıs Aydın Üniversitesi barınma](https://aday.cau.edu.tr/yurt-ve-konaklama/): Uluslararası Aydın Öğrenci Yurdu.
- [Kıbrıs Turizm Müsteşarlığı Haziran 2026 otel listesi](https://www.gov.cy/media/sites/26/2026/06/HOTELS_PANCYPRIAN_JUNE2026.pdf): beş Lefkoşa oteli. Kaynakta başvuru ve ruhsat statüleri farklı olduğundan genel bir “ruhsatlı” rozeti eklenmez.
- [Classic Hotel iletişim](https://classic.com.cy/contact-us/): doğrudan işletme adresi ve telefonu.

## Yerleşke ve yakınlık sınırları

528 noktanın 496'sında konum var, **32'sinde kesin koordinat yok**. Yerleşke noktaları bir kampüs alanının merkezini veya yayımlanmış referans noktasını gösterebilir; bina girişini gösterme iddiası yoktur. Mesafe Haversine ile hesaplanan kuş uçuşu uzaklığıdır; yürüyüş, yol uzunluğu veya ulaşım süresi değildir. Konumu bilinmeyen yerleşkeler için mesafe hesaplanmaz.

Üniversite kaynaklı konaklama listeleri konum bilinmese veya 5 km dışında olsa da gösterilebilir. Kuruma ait kaydın hangi yerleşkeye ilişkin olduğu biliniyorsa `campusIds` ile sınırlandırılır. “Şehirdeki seçenekler” görünümü resmî şehir kayıtlarını da ekler. Açık harita katmanı yalnızca seçilen noktaya 5 km içindeki kayıtları gösterir.

241 üniversitenin tümünde en az bir yerleşke için yakın, üniversitenin listelediği veya şehirdeki kaynaklı alternatif bulunuyor. `housing-coverage-2026.json` üniversite bazında birleşik kapsamı verir; her alt yerleşke için aynı sayıyı veya yakınlık garantisini vermez. 11 üniversitede yakın / kurumsal kayıt yerine şehirdeki seçenekler kullanılabiliyor. İdari bölge kontrolü Kıbrıs'ta sınırın diğer tarafındaki bir kaydın yalnızca kuş uçuşu mesafe nedeniyle “yakın” gösterilmesini önler.

Fiyat, güncel boş oda, değerlendirme puanı ve doğrulanmamış hizmetler üretilmedi. Kapasite, boş yatak sayısı değildir. Açık harita kaydı işletme onayı değildir. Yurt başvuru koşulları doğrudan kurumdan teyit edilir.

## Veri ve uygulama

- `data/housing-catalog-2026.json`: sunucuda kullanılan kayıtlar, tekil kaynak URL'leri ve kontrol tarihleri.
- `data/housing-editorial-2026.json`: incelenmiş kurum kayıtları, yerleşke düzeltmeleri, doğrulanmış tekrar eşleştirmeleri.
- `research/housing-campus-inputs-2026.json`: önceki kampüs araştırmasından seçilmiş, kaynak kimliği belli konum girdileri.
- `research/housing-source-manifest-2026.json`: dizin sayıları, URL'ler, içerik özetleri, OSM sorgusu ve araştırma notları.
- `research/housing-coverage-2026.json`: kapsam, elenen idari ofisler ve kullanılmayan koordinatlar.

Yeni `/api/housing/catalog` uç noktası oturum ve tamamlanmış profil gerektirir. Üniversite / yerleşke / tür / kabul / arama / sayfa parametreleri doğrulanır. Başka üniversitenin açık kaynak kataloğunu incelemek öğrencinin profilini değiştirmez ve o üniversitenin özel öğrenci tartışmalarına erişim sağlamaz. Öğrenci kayıtları mevcut `/api/housing` akışında kalır; katalog kimlikleri tartışma kaydı yerine geçmez. Veri tabanı şeması değişmez.

## Yeniden üretme

Python 3 standart kitaplığı ve projenin Node sürümü yeterlidir. Depo kökünde:

```powershell
python -X utf8 scripts/campus-catalog/sync-housing-sources.py gsb
python -X utf8 scripts/campus-catalog/sync-housing-sources.py details
python -X utf8 scripts/campus-catalog/sync-housing-sources.py osm
python -X utf8 scripts/campus-catalog/sync-housing-sources.py geography
npm run catalog:housing:build
npm run test:housing
```

Yanıtlar `.sites-runtime/housing` altında önbelleklenir; ham HTML depoya alınmaz. GSB istekleri iki işçiyle sınırlanır. Mevcut yanıtlar yeniden kullanılır; gerçek bir kaynak yenilemesinde ilgili önbellek dosyaları bilinçli olarak yenilenmeli, farklar incelenmeli ve araştırma manifesti / beklenen sayılar güncellenmelidir. Derleme eski kaynağın kontrol tarihini bugüne taşımaz. Üretilen dosyalar atomik değiştirilir.

GSB, üniversite ve işletme sayfaları birer veri anlık görüntüsüdür; uygulama canlı müsaitlik servisi değildir. OSM için © OpenStreetMap katkıcıları, ODbL 1.0; il sınırları için geoBoundaries / William & Mary, OSM, CC BY-SA 2.0 atıfları katalogda ve arayüzde bulunur. [İl sınırı kaynağı](https://www.geoboundaries.org/api/current/gbOpen/TUR/ADM1/) manifestte sürümlü geometri bağlantısıyla kayıtlıdır.

## Doğrulama

`tests/housing-catalog.test.mjs`: bütün üniversitelerin kapsamı, GSB kart ayrıştırma sonuçları, kaynak / koordinat tutarlılığı, bağımsız mesafe hesabı, yerleşke ve bölge sınırları, filtreler, sayfalama ve API yetkilendirme sözleşmesi.

`tests/housing-catalog-runtime.mjs`: yalnızca yerel sunucuda sentetik hesapla gerçek oturum / profil akışı, OMÜ Kurupelit ve Bafra sonuçları, özel kız yurtları, başka üniversite, hatalı parametreler, değişmeyen profil ve öğrenci tartışması sınırı.

Yayın için ayrıca TypeScript, ESLint, Vinext üretim derlemesi, mevcut test paketi ve masaüstü / mobil tarayıcı kontrolleri kullanılır. Git push sonucu canlı dağıtım kanıtı yerine geçmez.

5 Eylül 2026 yerel doğrulama sonucu: `npx tsc --noEmit`, değişen dosyalarda ESLint ve `npx vinext build` başarılı. Derleme sonrasında 309/309 test, mevcut `test:runtime` ve yeni `test:housing:runtime` başarılı. Konaklama çalışma zamanı kontrolünde OMÜ Kurupelit için 28 seçenek, Bafra için bir devlet yurdu, Samsun şehir kapsamındaki özel kız öğrenci konaklamalarında 10 kayıt ve Boğaziçi için 96 seçenek doğrulandı.

Tarayıcıda masaüstü açık/koyu tema, 390 px mobil görünüm, üniversite/yerleşke değişimi, kız/özel yurt filtreleri, boş arama ve temizleme, sayfalama, yol tarifinin başlangıç noktası, bilinmeyen konumda şehir alternatifleri ve admin güncelleme notu kontrol edildi. Yatay taşma görülmedi. Son temiz tarayıcı oturumunda sayfa hatası yoktu. Philips için şehir kapsamındaki altı kayıtta bilinmeyen yerleşke mesafesi sayıya dönüştürülmedi. Bu kontroller yerel sunucuya aittir.
