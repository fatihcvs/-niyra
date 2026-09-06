# F11-03 — Konaklama kataloğu ve öğrenci deneyimi akışı

Tarih: 2026-09-05. Uygulama ve odaklı yerel testler tamamlandı. Gerçek hesapla mobil tarayıcı kabulü, fiziksel Android klavye/TalkBack ve production doğrulaması bu kaydın kapsamı dışındadır.

## Düzeltilen somut sorunlar

- Katalog kartının kaynak bilgisi yalnız yerel bir `details` öğesindeydi; liste→ayrıntı→Back/Forward akışı yoktu. Kaynak ayrıntısı şimdi ortak `useAppLayer` kullanır. Liste arka planda kalır, kapatınca açan düğmeye odak döner; telefon/harita/kaynak bağlantıları ayrıntıda erişilebilir kalır.
- Üniversite, yerleşke, kabul ve tür seçenekleri mobilde ortak **Filtreler** panelindedir; arama ve seçili üniversite/yerleşke bağlamı listede görünür. Filtreler owner kapsamındaki bellekte korunur. Her yanıt filtre anahtarına bağlıdır: yeni sorgunun debounce aralığında önceki sorgunun sonuçları gösterilmez; gecikmiş eski yanıt yeni sonuçların üzerine yazamaz.
- Kaynak tarihi boş/geçersiz olduğunda `Intl` render hatası yerine “Kontrol tarihi belirtilmemiş” görünür. Telefon metninden hatalı arama bağlantısı üretilmez. Yol tarifine origin eklemek için yerleşkenin iki koordinatının da geçerli olması gerekir. Eksik konum, kapasite, olanak ve kabul bilgisi tahminle doldurulmaz.
- Öğrenci deneyimlerinde A kaydının geç yanıtı B kaydının altında görünebiliyordu. Yeni `HousingCommunity` seçili kayıt ve istek kapsamını ayırır; eski okumalar iptal edilir. GET yanıtındaki `place.id` seçilen kayıtla eşleşmelidir.
- Deneyim metni ve anonimlik seçimi kontrolsüz form alanlarıydı. Şimdi kayıt ID'sine bağlı kontrollü taslaklardır: detay→form→Back/Forward sırasında korunur, başka konaklamaya taşınmaz, başka owner'a görünmez. Form içeriği history veya kalıcı browser storage'a yazılmaz.
- Aynı submit olayının yinelenmesi birden fazla POST başlatabiliyordu. Ref kilidiyle tek bekleyen mutation vardır. Başarı gerçek kayıt kimliği / `own` alanı veya DELETE'nin eşleşen `deleted:true,id` cevabı ile doğrulanır. Başarı sonrasında yalnız gönderilen kaydın değişmemiş taslağı temizlenir; başarısızlık taslağı korur. Başarılı paylaşımın ardından liste yenilemesinin başarısız olması, paylaşımı başarısızmış gibi göstermez.
- Kullanıcının kendi deneyiminde silme onayı; kendi konaklama kaydında arşivleme onayı vardır. Başkasının deneyimine silme eylemi sunulmaz. Mevcut backend yetkileri korunur.

## Katalog ile deneyim verisinin sınırı

`/api/housing/catalog` kaynaklı katalog ID'leri döndürür. Farklı üniversitenin kaynaklarını okumak profil üniversitesini değiştirmez. Bu ID'ler `campus_places` öğrenci kaydı ID'si değildir.

Öğrenci listesi yalnız `category === housing && !curated` kayıtlarını kullanır. Deneyim GET/POST hedefi bu gerçek öğrenci kaydının ID'sidir. Katalog kartına deneyim yazdıran bir eşleştirme veya yapay kayıt oluşturulmadı. Yeni konaklama ekle formu mevcut `/api/campus-guide` POST'undan gerçek `place.id` alınca öğrenci listesini yeniler ve bu kaydın ayrıntısını açar. Kaynak kataloğundaki üniversite seçimi başka kampüsün özel deneyimlerine erişim sağlamaz.

Kapasite boş yatak sayısı değildir; fiyat, uygun oda ve başvuru koşulları doğrulanmış gibi gösterilmez. Açık harita kaydı kurum onayı olarak sunulmaz. Kaynak sayfası, ayrı koordinat kaynağı ve varsa kurum sitesi korunur. Yakındaki kampüs noktaları konaklamaya ölçülmüş yol/mesafe iddiası taşımaz.

## İstek ve oturum davranışı

`useHousingRequests` katalog, deneyim ve konaklama ekleme/yenileme yollarında ortak bounded JSON isteği sağlar. 20 saniyelik timeout, fetch ve gövde ayrıştırma zincirini abort reddiyle yarıştırır. Transport veya `json()` sinyali yutsa da arayüz sonsuz bekleme durumunda kalmaz. Seçim değişimi, unmount ve owner değişimi ilgili istekleri iptal eder; timer ve dinleyiciler temizlenir. JSON öncesi/sonrası owner kontrolü yapılır; aktif 401 gövdesi okunmadan session-expiry akışına gider.

Katalog ve öğrenci deneyimi bileşenleri owner değişiminde yeniden kurulur. Deneyim formu mutation beklerken devre dışıdır; sistem Back formu kapatabilir. Sonradan gelen başarılı cevap yalnız aynı aktif owner'ın gönderilen kaydını etkiler; başka kaydın taslağını veya görünür mesajlarını değiştirmez.

**Bilinmeyen gönderim sonucu:** Mevcut housing POST'ta kalıcı idempotency anahtarı yoktur; bu görev yeni migration veya idempotency sözleşmesi eklemedi. Timeout/bağlantı kaybı sunucunun hiç kayıt oluşturmadığını kanıtlamaz. Arayüz sonucu doğrulayamadığını söyler ve güncel deneyimleri kontrol etmeyi önerir. Tek bekleyen isteğin engellenmesi, kayıp cevap sonrasında elle yinelenen farklı isteğin sunucuda kesin tekilleştirilmesi iddiası değildir.

Anonim seçim, listede adı/handle'ı gizler. Moderasyon için backend'deki hesap ilişkisi korunur ve formda bu sınır açıklanır. Gerçek silme mevcut soft-delete sözleşmesini kullanır; hesap/veri retention politikası değiştirilmedi.

## Dosyalar ve entegrasyon

- `app/housing-directory.tsx` / `.module.css`: kaynaklı liste, ortak mobil filtreler ve ayrıntı katmanı.
- `app/housing-community.tsx` / `.module.css`: öğrenci listesi, ayrıntı, deneyim taslağı, paylaşım/silme ve arşivleme onayları.
- `app/use-housing-requests.ts`: scoped, iptal edilebilir, timeout ile sınırlı JSON istekleri.
- `lib/housing-display.ts`: bilinmeyen kaynak tarihi ve koordinat bağlantısı kuralları.
- `app/campus-guide.tsx`: eski konaklama state/handler/JSX bölümü yeni bileşene bağlandı; mevcut kontrollü ekleme formu ve kampüs sınıf adları korundu. Konaklama ekleme ve ardından yenileme bounded helper kullanır. Home, global CSS, migration ve üretim verisi değiştirilmedi.

## Doğrulama ve açık kabul

`tests/housing-flow-runtime.test.mjs`: **6/6** gerçek ReactDOM senaryosu geçti. Kaynak/filtre/detail Back; geç yanıt ve A/B taslak ayrımı; POST/DELETE hedef ve başarı denetimi; timeout sırasında askıda JSON; owner/401; gerçek Campus ekleme akışı; arşivleme sonrası Back kapsanır. Native geometri veya fiziksel klavye ölçülmez.

`tests/housing-experiences-api.test.mjs`: **2/2** yeni taze SQLite senaryosu geçti. Gerçek migration'lar ve gerçek housing route'u, yalnız açıkça sentetik kayıtlarla çalıştırılır. Kampüs/kategori/katalog-ID ayrımı, anonim çıktı ve moderasyon owner ilişkisi, block/mute filtreleri, katkı kapatma ayarı, başkasının kaydını silememe, own soft-delete ve 401 doğrulanır. Mevcut yerel/prod veritabanına yazılmaz.

Mevcut katalog, housing/exam sözleşmesi, Campus katman ve scoped session regresyonlarıyla birlikte **21/21** ilgili test geçti; yeni runtime dosyasının **6/6** sonucu ile toplam odaklı kanıt **27 testtir**. Değişen TS/TSX dosyalarında scoped ESLint, iki housing stylesheet'inde PostCSS sözdizimi kontrolü geçti. Tam build veya tüm proje suite'i bu alt görevde çalıştırılmadı.

Açık: 320/390 px açık/koyu tema görüntüsü, gerçek oturumda kaynak→öğrenci kayıtları→deneyim akışı, visualViewport klavye yüksekliği/odak ve TalkBack kabulü. `--app-viewport-height` / `--app-viewport-top` kullanımı uygulandı; bu, fiziksel cihaz doğrulamasının yerini tutmaz. Üretim deploy/release yapılmadı.
