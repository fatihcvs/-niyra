# Kampira — mobil ürün kalitesi araştırması ve faz planı

**5 Eylül 2026 · Karar ve uygulama yol haritası · Sürüm 1**

**Durum:** Araştırma ve plan hazırlandı. Aşağıdaki 15 faz ve 105 iş öneridir; geliştirme tamamlandı anlamına gelmez. Bu çalışma kapsamında uygulama kodu değiştirilmedi. Önceki çalışma kopyasındaki değişiklikler korunuyor. Hedef kitle: ürün sahibi, tasarım, istemci, backend ve Android geliştirme ekibi.

## 1. Önerilen yön

Kampira'nın mobil kalitesini yükseltmek için önce **ekranların neyi öne çıkardığını ve birbirine nasıl bağlandığını** düzeltmeliyiz. Ardından aynı kurallara bağlı görsel bileşenler, medya deneyimi ve hareket sistemi kurmalıyız. Mevcut ekrana yeni renk, gölge ve animasyon katmanları eklemek bu hedef için yeterli değil.

Önerim, mevcut web ürününü ve Railway backend'ini koruyarak Android için ayrı bir mobil deneyim tasarlamak. **Ayrı mobil tasarım kararı ile ayrı native istemci kararı iki farklı karardır.** Mobil ekranlar kendi görevlerine ve başparmak kullanımına göre tasarlanmalı. Native istemci için React Native/Expo güçlü bir aday; kesin seçim, F03'te mevcut web/TWA ile aynı gerçek kullanım akışının cihaz üzerinde karşılaştırılmasından sonra yapılmalı. Şimdiden bütün ürünü yeniden yazmaya başlamak için yeterli cihaz kanıtı yok.

Başarı tanımı: Kullanıcı bir paylaşımı okur, kişiye gider, geri döner, cevap verir veya mesaj yazar; nerede olduğunu, işlemin sonucunu ve nasıl geri döneceğini düşünmek zorunda kalmaz. Kampira'nın ders, topluluk ve kampüs bağlamı bu sosyal döngüyü destekler.

**İlk değerlendirme paketi:** F00 ölçüm tabanı → F01 bilgi mimarisi → F02 seçilebilir görsel tasarım ve F03 mimari deneme. Bu paket değerlendirilmeden bütün ekranların uygulanmasına geçilmemeli.

**Kapsam:** Android öncelikli mobil ürün; mevcut masaüstü web akışlarının korunması; 15 mevcut ana bölüm ve bunların detay/form durumları. Başlangıç servis adresi kullanıcı tercihine göre mevcut Railway adresi. iOS yayını, canlı yayın, Reels kopyası, AR kamera, sesli/görüntülü arama, reklam sistemi ve yeni öneri algoritması bu kalite programının zorunlu teslimleri değil.

## 2. Araştırma neyi doğruladı?

Üç kanıt türü birbirinden ayrı kullanıldı:

- **Güncel yerel gözlem:** Çalışan uygulamada 390 × 844 CSS piksel görünüm, mevcut oturum ve koyu tema ile 10 ekran/durum kaydedildi. Görseller aynı çalışmada açılıp incelendi. Gönderi, mesaj, topluluk veya gerçek kullanıcı ilişkisi oluşturulmadı.
- **Kod incelemesi:** Gezinme, başlıklar, filtreler, modal durumları, oturum ve Android hazırlığı salt okunur incelendi. Koddan çıkarılan riskler, cihazda tekrarlanmış hata gibi sunulmadı.
- **Birinci taraf araştırma:** Instagram, Threads, WhatsApp, TikTok ve YouTube'un resmî açıklama/yardım sayfaları; Android, Chrome, React Native, Expo, Capacitor, W3C ve Google Play belgeleri incelendi. Erişim tarihi 5 Eylül 2026.

Bu çalışma **rakiplerin güncel Türkiye Android sürümlerini fiziksel cihazda denemiş değildir**. Dolayısıyla Instagram'ın bugünkü piksel değerleri, animasyon süreleri veya Kampira'ya göre FPS farkı hakkında ölçülmüş iddia yok. Yerel ortamda sistemin azaltılmış hareket tercihi açıktı; bu tercihe dokunulmadı. Normal hareket, gerçek klavye, dokunma gecikmesi, 60/120 Hz ve Android yaşam döngüsü için cihaz denemesi F00/F03/F13 kapsamındadır.

Mevcut test hesabı çoğunlukla boş içerik ve önceki test paylaşımlarını gösteriyor. Bu, ilk kullanım ve hata durumlarını incelemeye yarıyor; dolu, gerçekçi sosyal akışın görsel kalitesini kanıtlamıyor. Önceki test/build sonuçları da bu raporda yeni cihaz veya görsel kabul kanıtı olarak kullanılmıyor.

### 2.1 Güncel ekran yürüyüşü

| Adım | İncelenen durum | Genel durum ve çıkarım |
| --- | --- | --- |
| 01 | Akış; metin ve başarısız test medyası | İçerik belirgin, alt gezinme anlaşılır. Test isimleri ve bozuk test medyası nedeniyle gerçek fotoğraf/video akışının kalitesi bu örnekle değerlendirilemez. |
| 02 | Keşfet → Kampüsüm | Yedi araç bulunabilir. İlk ekran bir bölüm dizini gibi; gerçek kişi, topluluk ve içerikle bağları ayrıca tasarlanmalı. |
| 03 | Notlar; sıfır sonuç | Başlığın altında ayrı yükleme satırı, ardından kaynak seçimi, arama ve tekrar eden bölüm başlığı var. İçerik hiyerarşisi gereğinden uzun. |
| 04 | Notlar; filtreler açık | Yanlardan taşma bu 390 px durumda görülmedi. Filtre bloğu sonuç alanını aşağı itiyor; arama, filtre uygulama ve sonuca dönüş birlikte yeniden tasarlanmalı. |
| 05 | Topluluklar; Diğer açık | Boş menü görsel olarak ve erişilebilirlik ağacında doğrulandı. Somut işlev/yerleşim hatası. |
| 06 | Kendi profili; sıfır gönderi | Kimlik, düzenleme ve paylaşma bulunabilir. Boş içerikte üç medya sekmesi ve ek bölüm seçicisi fazla kontrol yükü oluşturuyor. |
| 07 | Yeni gönderi; boş taslak | Tam ekran yazma, belirgin kapatma ve devre dışı paylaş düğmesi iyi bir başlangıç. Gerçek medya, yükleme, hata ve taslak geri kazanımı bu incelemede çalıştırılmadı. |
| 08 | Mesajlar; boş konuşma listesi | Tek başlık ve belirgin yeni mesaj eylemi, diğer bölümlere göre daha sade. Dolu konuşma davranışı ayrıca test edilmeli. |
| 09 | Yeni mesaj; boş sorgu | Kullanıcı arama yapmadan “eşleşen öğrenci bulunamadı” gösteriliyor. Başlangıç durumu ile sonuç bulunamama durumu ayrılmalı. |
| 10 | Kampüs; seçilmiş harita noktası | Harita ve kaynak ayrıntıları listeyi aşağı itiyor. Sayfanın tepesinde ilk liste makalesi yaklaşık y=922 px; bu ölçüm seçili nokta durumuna ait. Liste/detay/harita ayrımı gerekli. |

### 2.2 Sorunlar, kanıt ve ilgili faz

“Yüksek” temel görev, bağlam veya veri doğruluğunu etkileyen; “Orta” tekrarlanan sürtünme ve görsel tutarsızlık oluşturan konu demektir. Bunlar güvenlik zafiyeti dereceleri değildir.

| Kimlik | Öncelik | Bulgu ve kanıt sınırı | Plan karşılığı |
| --- | --- | --- | --- |
| Q01 | Yüksek | Notlar'da 56 px üst çubuk + 16 px boşluk + 48 px işlem satırı + 12 px aralık; ilk kaynak kontrolü y=132 px. Ekran 03 ve DOM ölçümü. | F05-02, F11-01 |
| Q02 | Yüksek | Topluluklar'da Diğer açılınca boş kutu oluşuyor; gizlenen yenileme eylemi yine menü hesabına giriyor. Ekran 05 ve bileşen incelemesi. | F05-02, F10-04 |
| Q03 | Orta | Notlar'da kaynak başlığı tekrar ediyor; filtre paneli, sonuç gösteriminden daha baskın. Ekran 03–04. | F01-04, F11-01 |
| Q04 | Orta | Boş profilde gönderi/görsel/video sekmeleri ve ek bölüm seçimi aynı anda var. Ekran 06; sadeleştirme bir tasarım önerisi. | F07-01, F07-02 |
| Q05 | Orta | Kampüsüm aracı listesi, sosyal keşif değerini tek başına anlatmıyor. Ekran 02; içerik ilişkileri için ürün hipotezi. | F10-02, F10-05 |
| Q06 | Yüksek | Seçili kampüs noktasının harita/kaynak paneli listeyi ilk görünümün dışına itiyor. Ekran 10; her giriş durumuna genellenmiyor. | F11-02 |
| Q07 | Yüksek | Gönderi yazarı, bazı bildirimler ve genel arama sonuçları tam belge gezinmesi kullanıyor. Kodda doğrudan anchor/location.assign mevcut; geçiş süresi ölçülmedi. | F04-01 |
| Q08 | Yüksek | openPerson isteğinde hedef/generation koruması yok. Hızlı A→B profil geçişinde geç A cevabının yanlış ekrana yazılması kod kaynaklı risk; cihazda tekrarlanmadı. | F04-02 |
| Q09 | Yüksek | Profil/Notlar yeniden mount olduğunda yerel tab/filtre durumu sıfırlanabilir; scroll geri yükleme bazı asenkron bölümlerin hazır oluşunu beklemiyor. Kod kaynaklı risk. | F04-03, F04-04 |
| Q10 | Yüksek | Not yükleme ve bazı detay/hesap katmanları genel sistem geri yığınına bağlı değil. Taslak kaybı olasılığı; ilgili cihaz senaryosu henüz doğrulanmadı. | F04-05, F08-03 |
| Q11 | Orta | Birincil eylem CSS sınıfından, bazı bölüm kimlikleri görünen başlık metninden çıkarılıyor. Görsel değişiklik davranışı kırabilir. | F05-01, F05-02 |
| Q12 | Orta | Birden çok global mobil/sosyal CSS katmanı var; sonradan eklenen kurallar bileşen sahipliğini belirsizleştiriyor. Bu durum tek başına performans hatası kanıtı değil. | F05-06 |
| Q13 | Orta | İkon ailesi zaten Phosphor'a taşınmış; fakat bağlamsal ikon, optik boyut, seçili durum ve metin/glyph karışımı için tek sözleşme gerekli. “Kütüphane değiştirince kalite gelir” sonucu çıkmıyor. | F02-03, F05-03 |
| Q14 | Orta | Boş sorgulu yeni mesajda sonuç bulunamadı metni gösteriliyor. Ekran 09. | F09-01 |
| Q15 | Yüksek | Web hazırlığı, native paket veya push teslimi değil. Konuşma 6 sn, liste 25 sn polling; bildirim delegasyonu kapalı. Sunucu teslim sistemi ve cihaz kanıtı ayrıca gerekli. | F03-04, F09-04, F13-05 |

Kod başlangıç noktaları: [ana sayfa ve gezinme](D:/-niyra-main/app/page.tsx), [ikincil bölümler](D:/-niyra-main/app/product-features.tsx), [ortak başlık](D:/-niyra-main/app/workspace-ui.tsx), [profil içeriği](D:/-niyra-main/app/profile-content.tsx), [mesajlar](D:/-niyra-main/app/direct-messages.tsx), [mobil CSS](D:/-niyra-main/app/mobile-workspaces.css), [Android hazırlığı](D:/-niyra-main/docs/ANDROID_APP.md). Bu yollar mevcut çalışma kopyasına aittir; satır numaraları sonraki geliştirmede değişebilir.

## 3. Büyük sosyal ürünlerden çıkarılabilecek kararlar

Buradaki “Kampira kararı” sütunu bizim önerimizdir. Kaynaklardaki tasarımın aynen kopyası veya rakibin mevcut bütün davranışının tarifi değildir. Rakiplerin logosu, renkleri, görselleri ve ayırt edici görünümü alınmayacak; görev akışı ve etkileşim açıklığı kıyaslanacak.

| Referans | Resmî kaynak ne söylüyor? | Kampira için öneri | Kanıt sınırı |
| --- | --- | --- | --- |
| Instagram gezinme | 28.09.2025 duyurusu Hindistan'da sınırlı Reels-first testini ve ayrıca küresel DM/Reels gezinme değişikliği planını anlatıyor. [Meta](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/) | Beşli sırayı eski ekran görüntüsünden ezberlemeyelim. Kullanıcının paylaşım–kişi–mesaj işlerini ve mevcut Kampira alışkanlığını esas alalım. | Duyuru, her kullanıcının güncel sürümünün kanıtı değil. |
| Instagram mesaj eylemleri | Mesaj üzerinde uzun basma ve sohbet başlığı gelişmiş işlemlere giriş sağlıyor. [Instagram DM özellikleri, 19.02.2025](https://about.fb.com/news/2025/02/new-instagram-dm-features-stay-connected/amp/) | Basit yazma/cevaplama önde; kopyalama, bildirme ve yönetim bağlam içinde. Keşfedilebilir erişilebilir menü alternatifi bulunsun. | Zamanlama/çeviri gibi bütün özellikleri eklemek gerekmiyor. |
| WhatsApp görsel yaklaşım | Tasarım lideri alışılmış cihaz davranışlarını, nötr yüzeyleri ve Android'de başparmağa yakın alt gezinmeyi açıklıyor. [Meta, 09.05.2024](https://about.fb.com/br/news/2024/05/mantendo-o-whatsapp-moderno-simples-e-acessivel/) | Koyu yüzeyler içeriğin önüne geçmesin. Ana hedefler sabit ve erişilebilir olsun; araç tepsileri bağlama göre açılsın. | 2024 gerekçesi; 2026 piksel veya animasyon ölçümü değil. |
| WhatsApp konuşma bulma | Sohbet filtreleri konuşmaları bulma işini hızlandırmak için sunuluyor. [Chat Filters, 16.04.2024](https://about.fb.com/news/2024/04/whatsapp-chat-filters/) | Okunmamış gibi seçimler gerçek konuşma hacmi oluştuğunda yardımcı olsun; boş listede araç kalabalığı yaratmasın. | Duyurudaki filtre seti güncel setin tamamı sayılmıyor. |
| Threads profil ve topluluk | Profil konuları konuşmalara; arama/etiketler topluluklara bağlanıyor. [Profil ve medya, 30.10.2025 güncellemesi](https://about.fb.com/news/2025/03/new-threads-features-more-personalized-experience-you-control/), [Communities, 15.12.2025 güncellemesi](https://about.fb.com/news/2025/10/introducing-threads-communities-find-your-people/) | Ders → not/çalışma grubu → gerçek kişi → ilgili akış bağlantısı kuralım. Kampüs alanı yalnızca menü dizini kalmasın. | Duyuru/test kapsamı; Kampira'da ilişki verisi varsa uygulanabilir. |
| YouTube kişisel koleksiyon | Android You sekmesinde sıralama/filtreler beşten fazla öğe olduğunda gösteriliyor. [You tab yardım](https://support.google.com/youtube/answer/9209643?co=GENIE.Platform%3DAndroid&hl=en) | Kontrolleri içerik durumuna göre gösterelim. Sıfır gönderide boş medya sekmelerini varsayılan zorunluluk saymayalım. | Beş sayısı Kampira için otomatik eşik değil. |
| TikTok oluşturma | Metin/fotoğraf/video seçimi, düzenleme ve taslak oluşturma bağlamında açıklanıyor. [TikTok Newsroom, 24.07.2023](https://newsroom.tiktok.com/text-posts?lang=en) | Paylaş → yaz/seç → önizle → yayınla/taslak akışını tek bütün olarak tasarlayalım. | Tarihsel resmî açıklama; güncel Android yerleşimi incelenmedi. |
| YouTube medya | Oluşturma adımları ve oynatma/bağlantı/kullanılamayan içerik hataları ayrıştırılıyor. [Shorts oluşturma](https://support.google.com/youtube/answer/10059070?hl=en), [Video hataları](https://support.google.com/youtube/answer/3037019?hl=en) | Medya yükleniyor, desteklenmiyor, erişilemiyor ve ağ hatası farklı durumlar olsun; anlamlı tekrar deneme sunulsun. | Yeni bir kısa video ürünü açma gerekçesi değil. |

### 3.1 Görsel kalite için somut tasarım ilkeleri

1. **Bir ekran, anlaşılır bir ana iş.** Keşfet aramak/bulmak, Mesajlar konuşmak, Paylaş üretmek içindir. Servis ayrıntıları günlük sosyal kullanımın önüne geçmez.
2. **Tek üst çubuk.** Geri, kısa başlık, bağlama ait birincil işlem ve gerçekten gerekli ek menü aynı sözleşmeye bağlıdır. Başlığın altına ikinci bir işlem bandı eklenmez.
3. **Az yüzey türü.** Her öğe ayrı büyük kart olmaz. Akış, konuşmalar ve kaynak listeleri kendi içeriklerine uygun satır/kart kullanır; renk, ayırıcı ve boşluk kuralları ortak kalır.
4. **İkonun boyutu ile dokunma alanı ayrıdır.** İnce bir simge de geniş ve güvenli basma alanında yer alabilir. Aynı anlam bütün ekranlarda aynı simgeyi kullanır; bütün işlemler “+” yapılmaz.
5. **İçerik durumuna göre hiyerarşi.** İlk kullanım, dolu liste, arama sonucu boş, bağlantı hatası ve kısmi hata için ayrı düzen ve metin vardır.
6. **Hareket, gerçekleşen işi anlatır.** Basıldı, açıldı, eklendi, geri dönüldü, başarısız oldu gibi durumlar görünür olur. Yeni verinin gelişi kullanıcıyı okuduğu yerden oynatmaz.
7. **Kampira kimliği korunur.** Mor vurgu eylem ve seçime hizmet eder. Nihai tonlar, yazı ölçeği ve köşe değerleri görsel seçenekler incelendikten sonra sabitlenir.

Phosphor zaten boyut ve ağırlık seçimi sunuyor; mevcut bileşen bunu kısmen kullanıyor. Öncelik ikinci bir ikon paketi eklemek değil, ortak kullanım standardı. [Phosphor React resmî deposu](https://github.com/phosphor-icons/react)

### 3.2 Başlangıç tasarım bütçesi — öneri, ölçülmüş sonuç değil

| Alan | Denenecek başlangıç kuralı | Nasıl kabul edilecek? |
| --- | --- | --- |
| Üst çubuk | Normal yazıda 56–60 CSS px; safe-area ayrıca. En fazla bir görünür ana işlem. | 320–430 px, uzun Türkçe başlık ve büyük yazıda kırpılmadan çalışması. Büyük yazıda sabit yükseklik zorlanmaz. |
| Alt gezinme | Dört kalıcı hedef + Paylaş eylemi; görünür kısa etiket; normal yazıda yaklaşık 60–68 CSS px + güvenli alan. | Seçili hedef yalnız renkle anlatılmaz. Klavye ve tam ekran görevlerde içerik örtülmez. |
| İkonlar | Bağlama göre 20/24/26 px; aynı ağırlık ailesi, seçili durum için tutarlı fill/işaret; optik hizalama. | 1×/2×/3× yoğunluk, açık/koyu zemin, dar ekran; piksel kutusu kadar optik merkez de incelenir. |
| Dokunma | Web'de ürün hedefi en az 48 × 48 CSS px; native Android'de en az 48 dp. | Komşu kontroller üst üste binmez; ikon görünür boyutu küçülse de hedef korunur. |
| Yazı | Gövde/form başlangıcı 16 px; ikincil bilgi yaklaşık 13–14 px; alt etiketler okunurlukla seçilir. | %200 web metin büyütme ve Android büyük yazıda ana görevler tamamlanır; yalnız küçülterek sığdırma yapılmaz. |
| İçerik başlangıcı | Akışta normal yazıda ilk gönderi kimliği yaklaşık ilk 120 px içinde; kaynak listelerinde gerekli kontrollerden sonra yaklaşık ilk 240 px içinde. | Bunlar ön tasarım hedefidir; büyük yazı/aktif filtre istisnası belgelenir. Kontrolleri gizleyerek metrik tutturulmaz. |
| Basma tepkisi | Görsel tepki hemen; mikro geçiş için 80–120 ms başlangıç aralığı. | Gönderme tamamlandı izlenimi yaratmadan basıldığı anlaşılır; tekrar basma yanlış çift işlem üretmez. |
| Yerel durum geçişi | Sekme/menü için 140–200 ms; katman açılışı için yaklaşık 220–300 ms prototip denemesi. | İşlem animasyon bitene kadar kilitlenmez; hızlı ters işlem akıcı ve kesilebilir olur. |
| Haptik | Başarı/önemli seçim gibi sınırlı anlarda cihaz denemesi. | Her gezinmede titreşim yok; sistem tercihleri ve erişilebilirlik dikkate alınır. |

Bu sayıların hiçbiri “Instagram'ın değeri” değildir. Android'in 48 dp yaklaşımı ile WCAG 2.2'nin 24 CSS px ve istisnalara sahip asgari hedef ölçütü aynı standart değildir; Kampira web için daha geniş ürün hedefi seçiyor. [Android çekirdek kalite](https://developer.android.com/docs/quality-guidelines/core-app-quality), [WCAG hedef boyutu](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Web hareketinde transform/opacity gibi bileşime uygun özellikler başlangıç tercihidir; layout/paint maliyeti ve gereksiz katmanlar ölçülmelidir. Native spring kullanılması da tek başına akıcılık kanıtı değildir; kesilme ve yön değiştirme davranışı önemlidir. [web.dev animasyon rehberi](https://web.dev/articles/animations-guide), [Compose animasyon özelleştirme](https://developer.android.com/develop/ui/compose/animation/customize)

## 4. Android mimarisi: seçenek ve karar kapısı

Mevcut ürün React 19/Vinext, sunucu API'leri ve aynı origin oturum çerezleri kullanıyor. İncelenen bağımlılıklarda Expo, React Native veya Capacitor istemcisi yok. TWA/PWA hazırlığı var; imzalı uygulama ve mağaza yayını kanıtı yok. [Paket tanımı](D:/-niyra-main/package.json), [oturum uygulaması](D:/-niyra-main/lib/app-auth.ts), [Android hazırlığı](D:/-niyra-main/docs/ANDROID_APP.md)

| Seçenek | Korunan yatırım | Faydası | Asıl maliyet ve risk | Önerilen kullanım |
| --- | --- | --- | --- | --- |
| Web + PWA/TWA | Mevcut web UI, API ve aynı origin oturum | En az çatallanma; mevcut web dağıtımı sürer. | Web arayüzündeki yeniden yükleme, DOM ve durum sorunları devam eder. TWA içeriği tarayıcıda gösterir. | Karşılaştırmanın başlangıç çizgisi; cihaz kapıları geçerse geçerli bir teslim seçeneği. |
| Capacitor | Web UI'nin taşınabilir kısmı ve backend | Kamera/klavye/uygulama yetenekleri için köprüler. | Dağıtılabilir istemci bundle'ı ve API/origin sınırı gerekir. Resmî server.url live-reload ayarıyla Railway adresini sarmak bu ürün için doğrulanmış üretim çözümü sayılmaz. | Web deneyimi yeterli olup sınırlı cihaz köprüsü gerekiyorsa ayrı değerlendirme. |
| React Native + Expo | Backend, API sözleşmeleri, uygun saf TS kuralları ve React bilgisi | Native ekran ve native-stack deneyimi; mobil yetenek ekosistemi. | DOM/CSS ekranları taşınmaz. Native UI, veri yaşam döngüsü, oturum ve iki istemcinin bakımı gerekir. | Ayrı mobil istemci için birinci deneme adayı. |
| Kotlin + Compose | Backend ve veri sözleşmeleri | Android yaşam döngüsü, medya, erişilebilirlik ve sistem davranışlarına doğrudan kontrol. | Ayrı dil/istemci, Android uzmanlığı ve web ile daha az UI paylaşımı. | Ölçülmüş Android'e özel engel veya ekip yetkinliği bunu gerekçelendirirse yeniden açılacak seçenek. |

Teknik dayanaklar: [Chrome TWA](https://developer.chrome.com/docs/android/trusted-web-activity), [Capacitor dağıtım akışı](https://capacitorjs.com/docs/basics/workflow), [Capacitor server.url sınırı](https://capacitorjs.com/docs/config), [React Native performans](https://reactnative.dev/docs/performance), [Compose predictive back](https://developer.android.com/develop/ui/compose/system/predictive-back), [CameraX](https://developer.android.com/media/camera/camerax). RN belgesindeki native-stack avantajı geçiş animasyonuna aittir; bütün uygulamanın otomatik hızlı olacağı anlamına gelmez.

### 4.1 Denemenin kapsamı

F03'te dört tam prototip yapılmaz. Aynı test verisiyle **web/TWA başlangıç çizgisi ve Expo native örneği** karşılaştırılır: giriş → akış → kişi → geri → fotoğraflı taslak → klavye/geri → konuşma → deep link. Yalnız bu deneme için gerekli küçük web düzeltmeleri yapılır; tüm web ekranları native kararından önce yeniden yazılmaz.

Karşılaştırmada backend, veri, işlev kapsamı, ağ, soğuk/sıcak önbellek ve release'e yakın derleme koşulları eşleştirilir. TWA ölçülecekse test paketi, test imzası ve Digital Asset Links doğrulaması bu fazda yapılır; nihai mağaza imzası F14'te kalır. Ölçülen ortam **tarayıcı/PWA, doğrulanmamış Custom Tab veya doğrulanmış TWA** olarak açıkça etiketlenir. Tarayıcı üst çubuğu farkı veya geliştirme derlemesinin yükü framework performansı diye yorumlanmaz.

Kritik ölçümler: oturum yeniden açılışı, özel medya erişimi, arama/scroll/taslak koruma, cihaz geri hareketi, dokunma tepkisi, kaydırma takılması ve yükleme iptal/hata davranışı. Veriler izole test ortamında olmalı; gerçek kullanıcılara deneme içeriği gönderilmez.

### 4.2 Her seçenekte çözülmesi gereken konular

- **Oturum:** Mevcut HttpOnly/SameSite modelini gevşetmek bir geçiş çözümü değil. Native ağ belgeleri cookie auth için sorun olasılıklarını belirtiyor; Kampira'da giriş, 401, logout, özel medya ve yeniden açılış denenmeli. Gerekirse ayrı native oturum sözleşmesi ve iptal mekanizması tasarlanmalı. SecureStore yalnız güvenli saklama aracıdır. [RN networking](https://reactnative.dev/docs/network), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- **Kamera ve medya:** Galeri/çekimden sonra uygulama yeniden oluşturulabilir. İptal, ret, arka plan ve geri kazanım akışları test edilir. [Capacitor Camera](https://capacitorjs.com/docs/apis/camera), [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- **Klavye ve geri:** Klavye → üst katman → ekran sırası açık tanımlanır. Sistem geri davranışını dinlemek varsayılan davranışı değiştirebilir; güvenli alan ve IME yönetimi gerekir. [Capacitor App](https://capacitorjs.com/docs/apis/app), [Keyboard](https://capacitorjs.com/docs/apis/keyboard), [Compose insets](https://developer.android.com/develop/ui/compose/system/insets-ui)
- **Push ve bağlantı:** Push izin/abonelik/sunucu teslimi/tıklama hedefinden oluşur. Android Expo Go tek başına remote push denemesi için yeterli değildir; development build gerekir. Deep link doğrulaması ayrı yapılır. [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [Android App Links](https://developer.android.com/training/app-links)
- **Çevrimdışı:** Mevcut service worker özel içerik önbelleklemiyor. Gerçek offline okuma veya gönderim kuyruğu eklenecekse kullanıcı izolasyonu, saklama, tekrar deneme ve çift yazma politikası ayrıca tasarlanır. [Android offline yaklaşımı](https://developer.android.com/topic/architecture/data-layer/offline-first)

**Karar kuralı:** Web/TWA görev ve cihaz kapılarını karşılıyorsa yalnız “native daha profesyonel” düşüncesiyle yeniden yazılmaz. Expo aynı kapılarda belirgin kullanım avantajı sağlıyor, gerçek oturum/medya çalışıyor ve bakım maliyeti kabul ediliyorsa native yol seçilir. İki seçenek de başarısızsa tam geliştirme başlamaz; başarısız kapının nedeni çözülür. Bu karar F03-07'de kanıtlı bir mimari karar kaydıyla değerlendirilir.

## 5. Fazların sırası ve kapsamı

**Bütün işler planlandı durumundadır.** Sorumlular kişi ataması değil rol ihtiyacıdır. Büyüklükler takvim tahmini değildir: M sınırlı alan, L birden fazla ekran/entegrasyon, XL çok sistemli teslim. Ekip kapasitesi, cihaz erişimi ve F03 sonucu olmadan kesin bitiş tarihi vermek yanıltıcı olur.

| Faz | Amaç | Önkoşul | Ana rol | Büyüklük |
| --- | --- | --- | --- | --- |
| F00 | Ölçüm ve gerçekçi test tabanı | Planın değerlendirilmesi | Ürün + QA | M |
| F01 | Bilgi mimarisi ve kullanıcı görevleri | F00 | Ürün + Tasarım | M |
| F02 | Görsel yön, ikon ve hareket tasarımı | F01 | Tasarım | L |
| F03 | Android mimari denemesi ve karar | F00 + F01 | Android + Backend | L |
| F04 | Gezinme, veri ve durum sürekliliği | F03 | İstemci + Backend | L |
| F05 | Ortak bileşen ve ekran kabuğu | F02 + F03 | Tasarım + İstemci | L |
| F06 | Akış ve medya tüketimi | F04 + F05 | İstemci + Backend | L |
| F07 | Profil, yorum ve sosyal ilişkiler | F06 | İstemci + Backend | L |
| F08 | Paylaşım ve medya üretimi | F04 + F05 | İstemci + Backend | L |
| F09 | Mesaj deneyimi ve teslim | F04 + F05 | İstemci + Backend | XL |
| F10 | Keşif, arama ve topluluklar | F07 | Ürün + İstemci | L |
| F11 | Ders ve kampüs araçları | F05 + F10 | İstemci + Veri | L |
| F12 | İlk kullanım, hesap ve güvenlik | F04 + F05 | Ürün + Backend | L |
| F13 | Android, performans ve erişilebilirlik kapanışı | F04–F12; erken ölçümler F00/F03'te | Android + QA | XL |
| F14 | Kullanıcı beta testi ve Play hazırlığı | F13 ve önceki kabul kapıları | Ürün + QA + Yayın | L |

F02 ile F03 paralel ilerleyebilir. F04 ile F05, sözleşmeler sabitlendikten sonra paralel yürür. F08/F09/F12 ayrı dosya ve API sahipliğiyle paralelleşebilir. Erişilebilirlik ve performans her fazda kontrol edilir; F13 bunların ilk ele alındığı faz değildir. F14'teki mağaza inceleme ve gerekiyorsa kapalı test süresi geliştirme süresinden ayrı tutulur.

### F00 — Ölçüm ve test tabanı

**Amaç:** “Daha iyi görünüyor” değerlendirmesini tekrar edilebilir ürün ve cihaz kanıtıyla tamamlamak.

| İş | Yapılacak iş |
| --- | --- |
| F00-01 | Mevcut branch, commit, çalışma kopyası ve eşzamanlı ders katalog çalışmasını kaydet; uygulama dosyalarının sahipliğini ayır; mevcut işlerin üzerine yazılmasını önle. |
| F00-02 | 15 bölümün ana/detay/form/boş/yükleniyor/hata durumlarını envanterle. Girişsiz, yeni öğrenci, aktif öğrenci ve görevli rollerini ayrı listele. |
| F00-03 | İzole test verisi hazırla: boş hesap, dolu profil, uzun Türkçe isim, 200 gönderilik liste, farklı oranlarda fotoğraf/video, 100 mesaj, kaynak eksikliği ve ağ hatası. Medya hakları belli olsun. |
| F00-04 | İki gerçek Android cihaz seç: daha sınırlı 60 Hz cihaz ve orta sınıf 90/120 Hz cihaz. OS, RAM, ekran, gezinme modu ve klavye sürümünü kaydet. |
| F00-05 | Aynı görevleri Kampira ve kurulmuş rakip Android sürümlerinde incele; sürüm/tarih/ülke/hesap durumunu kaydet. Rakipte görünmeyen akışı “erişilemedi” olarak işaretle. |
| F00-06 | Dokunma, ekran hazır oluşu, scroll/geri, frame takılması ve web metriklerini ayrı ölç. Debug araçlarının gecikmesini uygulama gecikmesi sayma. |
| F00-07 | Her soruna kayıt aç: adımlar, beklenen/gerçek sonuç, ekran/cihaz, kanıt, önem, ilgili faz ve yeniden test. Bu araştırmadaki kod risklerini doğrulanmış hatalardan ayır. |

**Çıktılar:** Ekran envanteri, test veri paketi, cihaz matrisi, başlangıç ölçüm tablosu ve sorun listesi. **Çıkış kapısı:** Ana altı görevin başlangıç kanıtı mevcut; bilinmeyenler açık; test hesabı gerçek kullanıcı verisinden ayrılmış. Araştırmadaki 10 görüntü bu fazın yalnız başlangıç girdisidir.

### F01 — Bilgi mimarisi ve görev akışları

**Amaç:** Kullanıcıya her ekranda bir sonraki adımı ve geri dönüşünü açık göstermek.

| İş | Yapılacak iş |
| --- | --- |
| F01-01 | Mevcut Akış–Keşfet–Paylaş–Mesajlar–Profil düzenini başlangıç olarak al; Paylaş'ın hedef değil eylem olduğunu sözleşmeye yaz. Öğrenci görevleriyle sıralamayı doğrula. |
| F01-02 | Akış → gönderi → yorum → kişi → mesaj; arama → ders → not; topluluk → ilgili içerik zincirlerini çiz. Her zincirde dönüş konumunu tanımla. |
| F01-03 | Her ekrana tek başlık ve en fazla bir ana işlem ata. Bildirim, eşleşme tercihleri, not yükleme ve mekân önerisinin farklı anlamlarını koru. |
| F01-04 | Boş, dolu, arama boş, filtre boş, bağlantı hatası ve kısmi hata için gerekli kontrolleri tek tek seç. İçerik yokken kullanışsız filtre/sekme yoğunluğunu azalt. |
| F01-05 | Keşfet'teki kampüs araçlarını sıklık ve bağlama göre grupla; Ders/Topluluk/Kişi ilişkilerini modelle. Kullanım verisi olmadan yeni sıralamayı kesin kabul etme. |
| F01-06 | Modal, alt ekran, dış bağlantı, deep link ve oturum süresi dolması için geri davranış haritası oluştur. Taslak varken çıkış kuralları bütün formlarda aynı olsun. |
| F01-07 | Ana görevler için açıklama yapmadan kullanılabilen düşük ayrıntılı tıklanabilir akış hazırla; öğrenci gözlemiyle yanlış yol ve geri dönüş sorunlarını kaydet. |

**Çıktılar:** Gezinme haritası, ekran/eylem matrisi, durum sözleşmeleri ve test senaryoları. **Çıkış kapısı:** Ana görevlerde çıkmaz ekran yok; temel eylemler bulunuyor; 15 bölümün erişimi ve geri yolu tanımlı. Yeni bilgi mimarisi ürün sahibi tarafından değerlendirilmiş.

### F02 — Görsel yön, ikonlar ve hareket tasarımı

**Amaç:** Uygulamaya yeni CSS eklemeden, istenen kaliteyi görülebilir ve karşılaştırılabilir hâle getirmek.

| İş | Yapılacak iş |
| --- | --- |
| F02-01 | Aynı gerçekçi test içeriğiyle en fazla iki özgün görsel yön hazırla. Akış, profil ve mesajdan oluşan aynı ekran setini kullan; yalnız güzel bir açılış ekranıyla karar verme. |
| F02-02 | Seçilen yönde açık/koyu nötr yüzeyler, mor vurgu, metin hiyerarşisi, boşluk, ayırıcı, köşe, avatar ve medya oranı tokenlarını tanımla. |
| F02-03 | Bütün ikon anlamlarını envanterle; Phosphor karşılıkları, ağırlık, optik boyut, seçili/kapalı/devre dışı durum ve erişilebilir etiketleri belirle. Logo kullanımını ayrı tut. |
| F02-04 | Üst/alt bar, arama, sekme, filtre, gönderi, konuşma, kaynak satırı, menü, sheet ve tam ekran form için durumları gösteren bileşen sayfaları hazırla. |
| F02-05 | Basma, beğeni/kaydetme, sekme, geri, sheet, klavye ve yükleme için hareket akışları hazırla. Hızlı tekrar, iptal, ters yön ve azaltılmış hareket alternatifini göster. |
| F02-06 | Seçilen tasarımı 320/360/390/430 px, uzun metin, boş/dolu/hata ve iki temada kontrol et. Masaüstü karşılığını en az 820 ve 1440 px'de göster. |
| F02-07 | Referans ile Kampira'yı aynı görev/durumda birlikte değerlendir; okunurluk, içerik önceliği, görsel tutarlılık ve kullanım açıklığına göre seçimi kaydet. |

**Çıktılar:** Seçilen görsel yön, bileşen durumları, ikon kullanım tablosu ve hareket prototipi. **Çıkış kapısı:** Ürün sahibi yalnız renkleri değil ana ekran setini ve hareket örneklerini değerlendirmiş; seçim kaydedilmiş. Bu kabulden önce toplu ekran uygulaması yapılmaz.

### F03 — Android mimari denemesi

**Amaç:** Web/TWA veya native kararını ürün davranışı, gerçek API ve cihaz ölçümüyle vermek.

| İş | Yapılacak iş |
| --- | --- |
| F03-01 | Mevcut API/oturum/özel medya sözleşmelerini ve Android araç gereksinimlerini çıkar. Tipleri sunucuya bağımlı koddan ayır; test origin'i, SDK/JDK/ADB ve sürüm kaydını hazırla. |
| F03-02 | F04'ün yalnız kritik gezinme düzeltmesini içeren küçük web/TWA ve Expo örneği hazırla. TWA testinde test imzası/DAL doğrulaması yap; aynı API/veri/işlev ve release'e yakın koşulları kullan. |
| F03-03 | Giriş, oturum yeniden açılışı, 401, logout, özel medya ve hesap değişimi denemelerini gerçek test API'sinde çalıştır. Başarısız auth için güvenlik kontrollerini gevşetme. |
| F03-04 | Akış–profil–geri–taslak–mesaj zincirini iki cihazda ölç; ekran konumu, klavye, sistem geri ve soğuk/sıcak deep link'i karşılaştır. |
| F03-05 | Fotoğraf seç/çek, önizle, iptal et, yüklemeyi kes, uygulamayı arka plana al ve geri aç senaryolarını dene; taslağın kontrollü korunmasını değerlendir. |
| F03-06 | Bakım maliyeti, paylaşılabilir kod, yayın araçları, offline/push sınırları ve ekip yetkinliğini kaydet. API geriye uyumluluğu, desteklenen en eski istemci ve Capacitor/Compose'u gerektirecek koşulları yaz. |
| F03-07 | Mimari karar kaydı çıkar: ölçüm tabloları, seçilen yol, reddedilen seçeneklerin gerekçesi, açık riskler, rollback ve web/native kapsamı. Ürün sahibiyle karar kapısını tamamla. |

**Çıktılar:** İki sınırlı çalışan deneme, cihaz kayıtları ve mimari karar belgesi. **Çıkış kapısı:** Gerçek oturum/medya çalışıyor; geri/klavye veri kaybettirmiyor; seçimin ölçülmüş faydası ve maliyeti açık. Başarısız deneme “framework seçildi” diye tamamlanmaz.

### F04 — Gezinme, veri ve durum sürekliliği

**Amaç:** Uygulamanın her bölümünü aynı kesintisiz kullanım sözleşmesine bağlamak.

| İş | Yapılacak iş |
| --- | --- |
| F04-01 | Gönderi yazarı, bildirim ve arama bağlantılarını ortak iç hedef çözücüye geçir. Web'de gerçek href, yeni sekme, Ctrl/Meta ve orta tıklama korunurken normal dokunmada belge yenilenmesin. |
| F04-02 | Profil ve arama isteklerinde iptal/son istek/kimlik koruması kur; eski yanıt yeni hedefin ekranına yazılmasın. |
| F04-03 | Oturum bootstrap'ını ekran verisinden ayır. Ekran ve sorgu anahtarlı cache kullan; kullanıcı değişiminde özel veriyi temizle; geri dönüşte mevcut içeriği gereksiz boşaltma. |
| F04-04 | Akış, profil, not ve arama için sekme/filtre/yüklenmiş sayfa/scroll konumunu koru. Asenkron içerik hazır olmadan konumu kısa placeholder'a sıkıştırma. |
| F04-05 | Ortak katman yığını kur: klavye, modal/form, detay ve ana hedef. Not yükleme, profil düzenleme, bildirme ve kampüs formlarının sistem geri davranışını bağla. |
| F04-06 | Silinmiş/yetkisiz/hedefi bulunamayan deep link ve dış kaynak için açıklama ve geri yolu tanımla. Kampüs/ders bağlamını URL ve gezinme durumunda koru. |
| F04-07 | Hızlı A→B→geri, istek sırası tersliği, 20 tur ileri/geri, yenileme ve hesap değişimi regresyonlarını gerçek davranış testleriyle doğrula. |

**Çıktılar:** Seçilen istemciye uygun router/veri/katman sözleşmesi ve entegrasyon kanıtları. **Çıkış kapısı:** Yanlış profil, kaybolan arama/taslak ve istenmeyen tam belge geçişi yok. Native seçilirse bu davranış native router'da kurulur; web'de kalan somut hatalar dar düzeltmelerle giderilir.

### F05 — Ortak ekran kabuğu ve bileşenler

**Amaç:** Aynı ürünün farklı bölümlerinde farklı başlık ve kontrol kuralları oluşmasını önlemek.

| İş | Yapılacak iş |
| --- | --- |
| F05-01 | Tasarım tokenları ve açık route yetenekleri tanımla. Ekran kimliğini görünen metinden, eylem önceliğini CSS sınıfından çıkarmayı bırak. |
| F05-02 | TopBar için leading/title/primaryAction/secondaryActions sözleşmesi kur. Gerçek child callback'leri koru; shell sabit sahte eylem haritası kullanmasın; boş menü oluşturulmasın. |
| F05-03 | IconButton, NavItem, Badge, Avatar ve temel düğmelerin anlam, durum, odak ve hedef boyutlarını birleştir. Uzun CTA'ları küçük ekranda erişilebilir kısa/ikonlu biçime geçir. |
| F05-04 | SearchField, Tabs, FilterSheet, sonuç özeti ve filtre temizlemeyi birleştir. Uygula/iptal ve kapalı filtrede aktif seçimin görünmesi açık olsun. |
| F05-05 | Sheet, Dialog, Toast, InlineError, EmptyState ve Skeleton sözleşmelerini kur. Focus, kapanış, tekrar deneme ve azaltılmış hareket durumlarını dahil et. |
| F05-06 | Web sürdürülüyorsa Notlar → Topluluklar → Kampüs ile kademeli CSS sahipliği taşıması yap; yalnız taşınan kuralları kaldır. Native seçilirse aynı tasarım anlamlarını native bileşenlerle uygula. |
| F05-07 | Bileşen galerisi ve üç pilot ekranı dar/geniş, açık/koyu, büyük yazı ve klavye durumlarında kontrol et; sticky başlığın atası hareket ettirilmesin. |

**Çıktılar:** Sahibi belli bileşen sistemi ve üç pilot ekran. **Çıkış kapısı:** Tek görünür üst çubuk, çalışan gerçek eylemler, boş menü olmaması ve seçilen görsel referansa uygunluk. Yeni bir genel override CSS dosyasıyla faz kapatılmaz.

### F06 — Akış ve medya tüketimi

**Amaç:** Kampira'nın en sık kullanılan ekranında içerik, kişi ve etkileşimi güçlü göstermek.

| İş | Yapılacak iş |
| --- | --- |
| F06-01 | Gönderi kimliği, zaman/kampüs bağlamı, metin ve eylem sırasını tasarıma taşı; uzun isimlerin düğmeleri sıkıştırmasını önle. |
| F06-02 | Metin, tek/çok fotoğraf ve video düzenlerini gerçek oranlarla tanımla. Medya yerini yüklenmeden ayır; küçük görseli zorla büyüterek kalite algısı yaratma. |
| F06-03 | Sonraki sayfa, yenileme, yeni gönderi işareti ve cache dönüşünü kur; yeni içerik gelirken okunan gönderi ve konum değişmesin. |
| F06-04 | Beğeni/kaydetme için hemen geri bildirim ve sunucu hatasında anlaşılır geri alma yap; çift dokunma ve çoklu istekte sayı tutarlılığını koru. |
| F06-05 | Medya görüntüleyicisi, kaydırma, geri, video oynat/duraklat ve ekran dışına çıkış davranışını tamamla. Ses ve otomatik oynatma kararı ürün tercihine bağlı olsun. |
| F06-06 | Yükleniyor, desteklenmeyen medya, erişim kaldırılmış içerik ve ağ hatasını ayır. Tek medyanın hatası bütün gönderi metnini kapatmasın. |
| F06-07 | 200 gönderi ve karışık medya ile uzun kaydırma, bellek, hızlı geri ve tekrar açma ölç; gerekliyse liste sanallaştırma ve medya yaşam döngüsünü optimize et. |

**Çıktılar:** Dolu/boş/hatalı akış ve medya durumları. **Çıkış kapısı:** Görsel içerik kaymıyor, kullanıcı konumu korunuyor, eylem sonucu açık, bozuk medya kurtarma yolu var. Gerçekçi medya ile görsel kabul ve cihaz ölçümü birlikte sunulur.

### F07 — Profil, yorum ve sosyal ilişkiler

**Amaç:** Kişinin kimliğinden içeriğine ve iletişime doğal geçiş sağlamak.

| İş | Yapılacak iş |
| --- | --- |
| F07-01 | Kendi profilinde kimlik/düzenleme, başkasında takip/mesaj önceliğini ayır. Akademik ayrıntıyı okunabilir özet ve detay olarak düzenle. |
| F07-02 | Boş ve dolu profil için farklı içerik hiyerarşisi kur; sıfır öğeli medya kontrollerinin gerekli olup olmadığını belirle; ek bölümleri anlaşılır adla aç. |
| F07-03 | Gönderi/medya/not/topluluk sekmesi, pagination ve geri dönüş konumunu koru; doğru kullanıcı ve içerik anahtarıyla yükle. |
| F07-04 | Takip/takipten çık, takipçi listesi, engellenmiş ve erişimi sınırlı profil durumlarını tamamla; sayılar ve eylemler sunucuyla tutarlı olsun. |
| F07-05 | Gönderi ayrıntısı ve yorum yazma/yanıtlama akışını düzenle; klavye açılınca bağlam ile gönderme kontrolü görünür kalsın. |
| F07-06 | Yorum/gönderi paylaşımı, bildirme ve sahip menülerini bağlama taşı; kopyalanan bağlantı doğru içeriğe ulaşsın. |
| F07-07 | Uzun biyografi, sıfır/dolu medya, silinmiş gönderi, 401 ve hızlı profil değişimini test et; profile dönüşte akış konumunu doğrula. |

**Çıktılar:** Kendi/başkası profili, yorum ve ilişki durumları. **Çıkış kapısı:** Akış → kişi → mesaj/yorum → geri zinciri kesintisiz; yanlış kişi verisi ve anlamsız boş kontrol yoğunluğu yok.

### F08 — Paylaşım ve medya üretimi

**Amaç:** Paylaşmayı tek açık ve güvenilir işlem hâline getirmek.

| İş | Yapılacak iş |
| --- | --- |
| F08-01 | Alt çubuktan tek dokunmayla oluşturmayı aç; kimlik, hedef kitle, metin ve medya seçeneklerini sade hiyerarşide göster. |
| F08-02 | Fotoğraf/video seçme, kaldırma, sıra değiştirme, oran ve önizleme durumlarını tasarla; desteklenmeyen boyut/tür için düzeltilebilir açıklama göster. |
| F08-03 | Metin ve medya taslağını hesap bazlı koru; çıkış, sistem geri, uygulama arka planı ve süreç yeniden açılışında neyin geri kazanılacağını tanımla. |
| F08-04 | Yükleme ilerlemesi, iptal, başarısız parça, tekrar deneme ve tekilleştirilmiş gönderim kur. Aynı gönderi bağlantı geri geldiğinde iki kez oluşmasın. |
| F08-05 | Başarıdan sonra gönderiyi doğru akışta görünür kıl; hedef kitle ve sunucu durumunu koru. Sadece animasyon oynadığı için başarılı gösterme. |
| F08-06 | Galeri/kamera iznini ihtiyaç anında iste; ret ve seçimden vazgeçme kullanılabilir kalsın. Metin yazma için medya iznini zorunlu tutma. |
| F08-07 | Büyük medya, yavaş ağ, uçak modu, 401, düşük depolama ve geri dönüşü izole gerçek API'de test et; taslağın kaybolmadığını kanıtla. |

**Çıktılar:** Baştan sona gerçek paylaşım, medya ve taslak akışı. **Çıkış kapısı:** Başarılı paylaşım akışta bulunur; hatalı paylaşım kurtarılabilir; iptal ve tekrar deneme veri kaybettirmez veya çift kayıt oluşturmaz.

### F09 — Mesaj deneyimi ve teslim

**Amaç:** Kullanıcının konuşma bulma, yazma ve cevaplama işini rahat ve güvenilir yapmak.

| İş | Yapılacak iş |
| --- | --- |
| F09-01 | Boş liste, yeni mesaj başlangıcı, boş sorgu ve sonuç bulunamama metinlerini ayır; mevcut sade başlık ve tek ana eylemi koru. |
| F09-02 | Konuşma satırında kimlik, son mesaj, zaman ve okunmamış durumunu netleştir; uzun metin/isim ve silinmiş kullanıcı durumunu tasarla. |
| F09-03 | Konuşma detayında klavye, son mesaja inme, geçmiş yükleme ve yeni mesaj geldiğinde konumu koruma davranışlarını tamamla. |
| F09-04 | Mevcut polling yerine/yanında gerekli teslim yaklaşımını ölçerek seç; gönderiliyor/gönderildi/başarısız durumlarını gerçek backend kanıtıyla üret. Okundu bilgisi desteklenmiyorsa uydurma. |
| F09-05 | Mesaj taslağı, yeniden gönderme, bağlantı kopması ve tekilleştirme kur; oturum değişiminde özel taslağı veya konuşmayı başka hesaba taşıma. |
| F09-06 | Mesaj ve kişi menülerinde kopyala/bildir/engelle gibi mevcut işlevleri bağlamsal göster; uzun basmanın erişilebilir alternatifini sun. |
| F09-07 | İki izole hesap ve gerçek cihazlarla alım/gönderim/geri/klavye/arka plan testleri yap; 100 mesaj geçmişinde zıplama ve yinelenme olmamasını doğrula. |

**Çıktılar:** Liste, kişi seçimi, konuşma ve gerçek teslim durumları. **Çıkış kapısı:** Klavye gönder alanını örtmüyor; mesaj durumu doğru; retry taslağı kaybettirmiyor; geçmiş okunurken yeni mesaj kullanıcıyı zorla aşağı çekmiyor. Push ayrı F13 kanıtı ister.

### F10 — Keşif, arama ve topluluklar

**Amaç:** Bölüm dizininden gerçek öğrenci, içerik ve ilgi ilişkilerine geçiş sağlamak.

| İş | Yapılacak iş |
| --- | --- |
| F10-01 | Kişi/ders/not/topluluk aramasında tek sorgu, anlaşılır kapsam ve sonuç grupları kullan; sorgu ve scroll geri dönüşte korunsun. |
| F10-02 | Kampüsüm alanında mevcut araç erişimini korurken gerçek ders/topluluk/etkinlik bağlantılarını öne çıkar; veri yoksa sahte popülerlik üretme. |
| F10-03 | Arama isteklerini sıralı kabul et; yavaş ağ, eski yanıt, boş sonuç ve seçili filtreyi temizleme durumlarını tamamla. |
| F10-04 | Topluluk keşfi/üyelik/oluşturma başlıklarını ortak sistemle kur; boş Diğer menüsünü kaldır; oluşturma callback ve çok adımlı durumunu koru. |
| F10-05 | Topluluk → ilgili içerik → üye/profil → mesaj zincirini bağla; erişim ve üyelik durumları backend'le tutarlı olsun. |
| F10-06 | Üye/yönetici işlemleri, katılma isteği, etkinlik ve bildirme ekranlarının mobil düzenini tamamla; yetkisiz eylem yalnız gizlenmekle yetinmesin. |
| F10-07 | Sıfır topluluk, uzun ad, çok üyelik, özel topluluk, silinmiş sonuç ve kampüs değişimi durumlarını test et; ana araçlar hâlâ bulunabilir olsun. |

**Çıktılar:** Sosyal keşif ve topluluk kullanım zinciri. **Çıkış kapısı:** Kullanıcı aradığı kişi/kaynağa açıklama almadan ulaşır; geri dönüş sorguyu korur; topluluğun içerikle ilişkisi gerçek veriyle çalışır.

### F11 — Dersler ve kampüs araçları

**Amaç:** Kampira'nın özgün değerini mobil sosyal ürün kalitesine taşımak.

| İş | Yapılacak iş |
| --- | --- |
| F11-01 | Notlar'da tek başlık, kaynak sekmesi, arama ve kompakt sonuç akışı kur; öğrenci/editoryal/sınav kaynağı ayrımını ve not/soru yükleme davranışını koru. |
| F11-02 | Kampüs'ü liste, harita ve seçili nokta detayı olarak açık böl; harita/kaynak açıklaması bütün listeyi aşağı itmesin. Kaynak güvenilirliği ve kontrol tarihi detayda erişilebilir kalsın. |
| F11-03 | Etkinlik, konaklama ve Bugün alanlarını aynı geri/filtre/ekleme sözleşmesine taşı; sekme değişince gerçek birincil eylem de değişsin. |
| F11-04 | Kampüs Anlık için içerik ömrü, anonimlik/görünürlük, oluşturma ve bildirme durumlarını sadeleştir; canlılık ve güncellik ifadeleri gerçek veriyle desteklensin. |
| F11-05 | Kütüphane'de yer bulma ve güncel bilgi; Pazar'da ilan/filtre/detay/iletişim akışını düzenle. Doluluk, fiyat ve bulunabilirlik bilinmiyorsa açıkça belirt. |
| F11-06 | Eşleş'te tercih, sonuç ve iletişime geçişi anlaşılır kur; yaş/gizlilik/engelleme sınırlarını koru. Genel Paylaş düğmesiyle eşleşme eylemlerini karıştırma. |
| F11-07 | Ders katalog ekibiyle kimlik, uzun ders adı, 5–6. sınıf/yaz dönemi, eksik dönem ve kaynak alanlarını sözleşmede doğrula; tüm yedi aracın mobil ve masaüstü dönüş akışını test et. |

**Çıktılar:** Yedi kampüs aracı ve ilgili detay/formların yeni bileşenlerle uyumu. **Çıkış kapısı:** Hiçbir bölüm başlık/işlem tekrarına dönmüyor; kaynak/eksik veri bilgisi korunuyor; katalog verisini tahmin ederek doldurma yapılmıyor. Tüm üniversitelerin müfredat verisini üretmek bu tasarım fazının işi değil; paralel veri çalışmasıyla entegrasyon sınırı açık.

### F12 — İlk kullanım, hesap ve güvenlik

**Amaç:** Yeni öğrencinin ürüne girmesini ve hesabını yönetmesini açık, tamamlanabilir akışlara dönüştürmek.

| İş | Yapılacak iş |
| --- | --- |
| F12-01 | Kayıt/giriş/oturum süresi dolması akışlarını küçük ekranda düzenle; zorunlu hesap alanlarıyla sonradan tamamlanabilir kampüs/profil alanlarını ayır. |
| F12-02 | Üniversite/bölüm/ders seçimini arama ve ilerleme bağlamında tasarla; uzun katalog listesi, eksik program ve sonradan değiştirme akışlarını koru. |
| F12-03 | İlk kullanımda tek anlamlı sonraki adım göster; izinleri toplu isteme; boş akış, boş ders ve boş topluluk için dürüst başlangıç yolu sun. |
| F12-04 | Profil düzenleme, tema, azaltılmış hareket, bildirim tercihleri, Kaydedilenler ve Ayarlar'ı anlaşılır grupla; hesabı kapatmaya kadar geri yolunu tanımla. |
| F12-05 | Bildirimden doğru içerik/yorum/kişi/konuşmaya git; okundu işaretleme başarısızlığı gezinmeyi belirsiz bırakmasın. Kaldırılmış içeriğe açıklama sun. |
| F12-06 | Bildir/engelle/sessize al ve destek akışlarını gerçek sunucu işlemleriyle tamamla; kullanıcıya sonucu göster; görevli inceleme ekranının küçük ekran kullanımını kontrol et. |
| F12-07 | Hesap ve ilişkili veri silme talebinin uygulama içi ve dış web akışını tasarla/uygula; gerçek destek ve sorumlu bilgilerini ürün sahibinden al; saklama ve silme davranışını doğrula. |

**Çıktılar:** İlk kullanım, hesap araçları, bildirim ve güvenlik akışları. **Çıkış kapısı:** Kullanıcı girişten ilk anlamlı işe ve hesap yönetimine ulaşır; veri/izin hatası anlaşılır; silme talebi uçtan uca işler. Politika metni yazılması, işlemin çalıştığı anlamına gelmez.

### F13 — Android, performans ve erişilebilirlik kapanışı

**Amaç:** Tasarımın gerçek cihazda güvenilir ve akıcı çalıştığını kanıtlamak.

| İş | Yapılacak iş |
| --- | --- |
| F13-01 | Seçilen mimarinin release'e yakın Android derlemesini üret; açılış, launcher/maskable/adaptive simge, splash, tema, sistem çubukları ve offline ekranını seçilen marka tokenlarıyla eşleştir. |
| F13-02 | Gesture/üç düğme geri, klavye, safe-area, rotation, arka plan, süreç yeniden oluşumu ve yeniden açılışta bütün kritik akışları test et. |
| F13-03 | Dokunma, cache dönüşü, uzun liste, medya decode, bellek ve frame zamanlarını iki cihazda ölç; yavaş kalan işi iz ile teşhis et, yalnız animasyon süresini kısaltma. |
| F13-04 | TalkBack, odak sırası, anlamlı etiket/durum, kontrast, büyük yazı, büyütme, azaltılmış hareket ve tek elle erişimi bütün ana görevlerde doğrula. |
| F13-05 | Bildirim izni/abonelik, token yenileme, gerçek sunucu teslimi, ön/arka plan ve tıklama hedefini tamamla; soğuk deep link doğru kullanıcı ve ekrana ulaşsın. |
| F13-06 | Offline/retry, ağ değişimi, kamera dönüşü, dosya açma/paylaşma ve hesap değişiminde özel veri izolasyonunu test et; web metriklerini native frame verisinden ayrı raporla. |
| F13-07 | Web'de 320–430/780/781/820/1440 px ve iki tema regresyonlarını, Android'de cihaz matrisini kapat; ölçülemeyen koşulları geçti sayma. |

**Çıktılar:** Kurulabilir test derlemesi, cihaz kayıtları, performans izleri, erişilebilirlik ve web regresyon raporu. **Çıkış kapısı:** Aşağıdaki kabul bütçeleri ve ana görevler sağlanmış; açık yüksek öncelikli kayıp/yanlış veri/çıkmaz ekran yok. Bu kapı mağaza onayı değildir.

### F14 — Öğrenci beta testi ve Google Play hazırlığı

**Amaç:** Teknik doğrulamayı gerçek kullanım, içerik hazırlığı ve dağıtım kanıtıyla tamamlamak.

| İş | Yapılacak iş |
| --- | --- |
| F14-01 | Öğrencilerle yönlendirmesiz görev oturumları yap; görev başarısı, yanlış dönüş, yardım ihtiyacı ve algılanan rahatlığı kaydet. F00 örnekleriyle farkı göster. |
| F14-02 | Eksik gerçek içerik, sahipsiz topluluk, ilk paylaşım ve ilk mesaj senaryoları için ürün açılış planı oluştur; sahte kullanıcı/etkileşim kullanma. |
| F14-03 | Nihai paket kimliği, servis origin'i, imzalama sahipliği, App Links/TWA doğrulaması ve destek kanallarını kesinleştir; anahtarları kaynak kod dışında yönet. |
| F14-04 | Hedef API, Data safety, hesap silme, UGC/çocuk güvenliği, hedef yaş, içerik derecelendirme ve kullanılan SDK/izin beyanlarını gerçek davranışla karşılaştır. |
| F14-05 | Hesap türüne göre gerekli Play test kanalını işlet; imzalı AAB'yi kanala yükle, Play'in ürettiği sürümü cihazlarda kur; kurulum/güncelleme/oturum/geri/medya/push akışını doğrula. |
| F14-06 | Crash/ANR ve kritik API/üretim/mesaj hataları için müdahale planı kur. Eski native/web istemcisiyle API uyumu, oturum/medya davranışı, geri çekme/rollback ve destek sorumluluğunu doğrula. |
| F14-07 | Görsel kabul, cihaz kabulü, öğrenci geri bildirimi, politikalar ve yayın durumunu ayrı imzala; mağaza ekran görüntüleri gerçek sürümden olsun; açık yayın onayıyla dağıtım yap. |

**Çıktılar:** Beta bulguları, giderilmiş öncelikli sorunlar, mağaza paketi, beyanlar ve yayın kararı. **Çıkış kapısı:** Kullanıcı değerlendirmesi tamamlanmış, imzalı paket test edilmiş, gerçek yayın onayı alınmış. “AAB oluştu”, “incelemeye gönderildi” ve “Play'de yayınlandı” ayrı durumlar olarak raporlanır.

## 6. Ölçülebilir kabul ölçütleri

### 6.1 Kampira için önerilen ürün ve laboratuvar hedefleri

Bu tablo sonuç değil, uygulanacak kabul sözleşmesi taslağıdır. F00/F03'te cihaz ve ölçüm yöntemiyle sabitlenir; başarısız sonuçları gizlemek için sonradan gevşetilmez.

| Alan | Önerilen geçiş ölçütü | Kanıt |
| --- | --- | --- |
| Görev başarısı | İlk iterasyonda 5–8 öğrenciyle nitel test; beta değerlendirmesinde en az 10 öğrenci × 6 görev. Ana görevlerde en az %90 yardımsız tamamlama hedefi; her kritik veri kaybı ayrıca başarısızlık. | Ham görev sonuçları, örneklem ve yardım tanımı. Bu sayı araştırma standardı veya istatistiksel temsil iddiası değil, Kampira test önerisi. |
| Dokunma tepkisi | İlk görsel geri bildirim p95 ≤100 ms; ağ sonucundan ayrı. | Aynı cihaz/sürümde en az 30 tekrar; timestamp yöntemi ve kayıt. |
| Cache dönüşü | Veri zaten yüklüyken önceki kullanılabilir ekranın dönüşü p95 ≤300 ms. | API yenileme ve tam içerik hazır olma ayrı ölçülür; görsel placeholder “hazır” sayılmaz. |
| Durum koruma | 20 ileri/geri turunda yanlış profil, kaybolan filtre/taslak ve kaybolan içerik ankora dönüşü sıfır. | Senaryo kaydı + anlamlı entegrasyon testleri. İçerik silindiyse en yakın geçerli konum ayrı tanımlanır. |
| Akıcılık | Seçilen cihazın yenileme aralığında çizim; standart kaydırma/geçiş senaryosunda uygulamaya atfedilen kaçırılmış frame oranı için başlangıç hedefi ≤%5 ve 700 ms üzeri donmuş frame sıfır. | Release izleri; araç kapsamı, cihaz/Hz ve iş yükü kaydı. Bu oran Google'ın yayın eşiği değil, önerilen iç bütçe. |
| Başlık/yerleşim | Tek görünür mobil üst bar; boş menü sıfır; içerik ve CTA sabit çubukların altında kalmaz. | Normal/büyük yazı, 320–430 px, klavye, açık/koyu screenshot ve görev denemesi. |
| Dokunma/erişilebilirlik | Web ürün hedefi 48 CSS px; native 48 dp; anlamlı etiket ve seçili durum. Kontrast küçük metinde 4.5:1, büyük metin/ilgili grafiklerde 3:1 hedefi. | Otomatik ölçüm + TalkBack/klavye/gerçek dokunma. Ekran görüntüsü tek başına erişilebilirlik onayı değil. |
| Üretim/mesaj | Retry sonrası çift kayıt sıfır; hatada taslak korunur; sunucu başarısı olmadan tamamlandı görünmez. | İzole iki hesap, ağ kesilmesi ve yeniden bağlanma testi. |
| Veri/bellek | Hesap değişiminde önceki özel içerik görünmez; uzun kullanımda sürekli artan ve geri salınmayan bellek şüphesi araştırılır. | Aynı iş yüküyle tekrarlı release ölçümü; sabit evrensel RAM sayısı uydurulmaz. |

Android 60 Hz'de yaklaşık 16 ms, 90 Hz'de 11 ms, 120 Hz'de 8 ms kare penceresini ve 700 ms üzeri donmuş kare ayrımını açıklar. Android Vitals/gfxinfo kapsamı render yoluna bağlıdır; TWA içeriğinin tamamı native View ölçümüyle temsil edilmiş sayılmaz. Cihaz ve uygun iz aracı seçilmelidir. [Android slow rendering](https://developer.android.com/topic/performance/vitals/render), [Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview)

### 6.2 Web metrikleri ayrı izlenecek

Web/TWA için iyi Core Web Vitals eşikleri **LCP ≤2.5 sn, INP ≤200 ms, CLS ≤0.1** ve mobil/masaüstü ayrı p75 değerlendirmesidir. Bunlar native ekran geçişinin, kamera/klavye deneyiminin veya tüm uygulamanın kalitesinin yerine geçmez. Laboratuvar örneklemi gerçek saha verisi diye sunulmaz. [web.dev — Web Vitals](https://web.dev/articles/vitals)

### 6.3 Cihaz ve durum matrisi

| Boyut | Zorunlu örnekler |
| --- | --- |
| Web görünümü | 320, 360, 390, 430 px; gerçek CSS geçişinde 780 ve 781 px; 820 ve 1440 px masaüstü. |
| Android donanım | Sınırlı 60 Hz cihaz + orta sınıf 90/120 Hz cihaz; gerçek model ve OS F00'da kaydedilir. |
| Sistem | Gesture/üç düğme gezinme, çentik/alt güvenli alan, açık/koyu tema, büyük yazı, TalkBack, azaltılmış hareket. |
| Klavye | Türkçe yazı, uzun mesaj, çok satır, gönder alanı, klavyeyi geri ile kapatma ve form geri dönüşü. |
| Ağ/yaşam döngüsü | Normal/yavaş ağ, offline→online, 401, arka plan, ekran kilidi, süreç yeniden açılışı, soğuk/sıcak deep link. |
| İçerik | Yeni hesap, dolu profil, uzun Türkçe ad/metin, farklı medya oranları, silinmiş/yetkisiz içerik, çok sayfalı liste. |

### 6.4 “Faz tamamlandı” kaydı

Her faz için durumlar ayrı tutulur: **planlandı → tasarım değerlendirildi → uygulandı → yerel doğrulandı → cihaz doğrulandı → ürün sahibi kabul etti**. Yayın aşamasında bunlara **test kanalına yüklendi → mağaza incelemesinde → yayınlandı** eklenir. Aynı test sayısını bütün aşamalara kanıt olarak taşımayız.

Kayıt alanları: faz/iş kimliği, commit, ortam, cihaz/viewport, senaryo, beklenen/gerçek sonuç, ekran/video/iz bağlantısı, otomatik test sonucu, açık kusurlar, ürün sahibinin değerlendirmesi. Görsel kabulde seçilen referans ile çalışan ekran aynı içerik ve boyutta birlikte incelenir.

## 7. Düzenli rakip kıyaslaması nasıl yapılacak?

Bu, uygulama fazlarının parçasıdır; bu araştırmada ayrıca zamanlanmış otomasyon oluşturulmadı.

1. **F00 başlangıcında:** Kurulu rakip sürümü ve ana görevler kayıt altına alınır. İnternetteki eski görsellerle güncel sürüm karıştırılmaz.
2. **F02 tasarım seçiminde:** Aynı işi yapan ekranlar yan yana incelenir: bilgi sırası, bir sonraki eylem, başparmak erişimi, boş/dolu durum ve marka özgünlüğü.
3. **Her ana akış fazının sonunda:** Çalışan build'de aynı görev tekrar edilir. Geri, klavye, yükleme, hata ve yeniden deneme dahil edilir; yalnız başlangıç screenshot'ı değerlendirilmez.
4. **Haftalık geliştirme değerlendirmesinde:** Çözülmüş ve açık farklar güncellenir. Yeni rakip özelliği otomatik kapsam genişletmez; Kampira öğrencisinin işine etkisi değerlendirilir.
5. **Beta öncesinde:** Cihazdaki güncel sürümler yeniden kontrol edilir. Kalite puanı ölçülmeyen alanı saklamaz; “erişilemedi/ölçülmedi” ayrı işaretlenir.

Karşılaştırma soruları: Bir sonraki iş açık mı? Kaç gereksiz seçim var? İçerik ne kadar erken görünüyor? Geri dönüşte bağlam korunuyor mu? İşlem sonucu hissediliyor mu? Klavyeyle rahat mı? Başarısızlık düzeltilebilir mi? Görsel dil ekranlar arasında tutarlı mı?

## 8. Google Play için araştırmada doğrulanan güncel sınırlar

- **Hedef API:** 31 Ağustos 2026'dan itibaren yeni telefon uygulamaları ve güncellemeler Android 16/API 36 veya üstünü hedeflemeli. Mevcut yerel Android hazırlığı da 36 alt sınırını belirtiyor; bunu eski bir eksik olarak raporlamıyoruz. Yayından hemen önce şart yeniden kontrol edilir. [Google Play hedef API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- **Hesap silme:** Uygulama içi hesap oluşturulan ürünlerde uygulama içi ve dış web üzerinden silme talebi yolu gerekir; ilgili veriler ve saklama istisnaları gerçek davranışa göre ele alınır. [Google hesap silme açıklaması](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- **UGC ve sosyal uygulama güvenliği:** Bildir/engelle, gerçek moderasyon süreci ve sosyal uygulamalar için ilgili çocuk güvenliği standartları yayın kapsamına girer. Hedef yaş ve Eşleş/anonim içerik tasarımı ayrıca değerlendirilir; metin eklemek tek başına yeterli değildir. [UGC beklentileri](https://support.google.com/googleplay/android-developer/answer/12923286?hl=en), [Child Safety Standards](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)
- **Hesap türüne bağlı test:** 13 Kasım 2023 sonrası açılmış kişisel geliştirici hesaplarında üretim erişimi için en az 12 testçinin 14 gün kesintisiz katıldığı kapalı test şartı uygulanıyor. Hesabın türü/tarihi henüz doğrulanmadı; süreyi bütün hesaplara koşulsuz atamıyoruz. [Play kişisel hesap testleri](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)

Bu araştırmada Play Console hesabına, imzalama anahtarına veya gerçek Android paketine erişilmedi. Yayın yapılmadı. Son sürüm, gerçek destek bilgileri, veri beyanları ve mağaza işlemleri F14'te kendi kanıtlarıyla kapanacak.

## 9. Tüm site kapsamı ve koordinasyon

| Mevcut alan | Ana faz | Ortak doğrulama |
| --- | --- | --- |
| Akış | F06 | F04 gezinme, F05 bileşen, F13 cihaz |
| Keşfet/genel arama | F10 | F04 durum/URL, F13 |
| Paylaş ve gönderi detayı | F08 / F07 | F04 katman, F06 medya, F13 |
| Mesajlar | F09 | F04 durum, F13 push/klavye |
| Kendi/başkası profili | F07 | F04 kimlik/istek, F12 hesap |
| Topluluklar | F10 | F05 başlık, F12 bildirme |
| Notlar/ders/sınav kaynakları | F11 | Katalog ekibi sözleşmesi; veri üretimi ayrı |
| Kampüs/etkinlik/konaklama/Bugün | F11 | Kaynak ve harita ayrımı, F13 |
| Kampüs Anlık/Kütüphane/Pazar/Eşleş | F11 | F12 güvenlik, F13 |
| Bildirimler/Kaydedilenler | F12 | F04 doğru hedef, F13 |
| Güvenlik/Ayarlar/profil düzenleme | F12 | F04 katman, F13 erişilebilirlik |
| Kayıt/giriş/ilk kullanım/yasal/destek | F12 / F14 | Gerçek hesap, silme ve yayın bilgileri |
| Görevli/yönetim ekranları | F12-06; masaüstü regresyon | Mevcut işlevler korunur; tam yönetim ürünü yeniden tasarımı ayrı kapsam |

**Çalışma düzeni:** Ortak gezinme ve bileşen sözleşmesini tek sahip koordine eder. Akış/paylaşım, mesaj ve kampüs/veri işleri bu sınırdan sonra paralelleştirilir. Ders katalog geliştirmesi tasarım dosyalarını değiştirmeden veri kimliği/şeması üzerinden bağlanır. Aynı global CSS veya ana sayfa dosyasına bağımsız ekiplerin eşzamanlı yeni katman eklemesi önlenir.

**Takvim:** F00–F03'ten sonra ekran sayısı, seçilen mimari ve gerçek entegrasyon engelleri üzerinden iş tahmini yapılır. Native seçiminde bütün DOM/CSS ekranlarını ücretsiz taşınabilir saymayız. Web seçiminde de kamera/push/geri/cihaz işlerini sıfır maliyetli saymayız. Kapalı test ve mağaza incelemesi ayrıca planlanır.

## 10. Açık kararlar ve araştırmanın sınırı

| Açık konu | Şu an bilinen | Nasıl kapanacak? |
| --- | --- | --- |
| Nihai mobil mimari | TWA hazırlığı mevcut; Expo güçlü deneme adayı. | F03 gerçek API + cihaz karşılaştırması ve karar kaydı. |
| Görsel tercih | Kampira markası ve sadelik hedefi belli; mevcut mobil kalite kabul edilmiyor. | F02 aynı ekran setiyle sınırlı seçenek ve kullanıcı değerlendirmesi. |
| Gerçek cihaz kapasitesi | Bu araştırmada fiziksel Android ölçümü yok. | F00 cihaz seçimi, F03 deneme, F13 tamamlayıcı test. |
| Rakip canlı hareket/boş durum | Resmî belgeler var; güncel yerel Android oturumları denenmedi. | F00 cihaz incelemesi; erişilemeyen durumlar açık kalır. |
| Dolu sosyal içerik | Mevcut test hesabı çoğunlukla boş veya test içerikli. | İzole, gerçekçi ve hakları belli F00 veri seti. |
| Destek, moderasyon ve Play hesabı | Gerçek kişi/kurum ve hesap ayrıntıları doğrulanmadı. | F12/F14'te ürün sahibinin sağladığı bilgiler ve işleyen süreç. |
| Yayın kimliği ve origin | Kullanıcı mevcut Railway adresini seçti; paket kimliği geçici. | F14'te ilk mağaza yüklemesinden önce kesinleştirme. |

Araştırma; yerel ekran/kod incelemesi, resmî ürün davranışları ve mimari/platform belgeleri olmak üzere üç hatta yürütüldü. Kritik Capacitor üretim sınırı, RN oturum uyarısı, Instagram duyurusunun test/küresel plan ayrımı, Web Vitals eşikleri ve Play hedef API şartı ayrıca kontrol edildi. Resmî yardımın erişilemeyen veya boş dönen sürümlerinden kesin ekran iddiası üretilmedi.

Bu aşamada yeni genel web aramalarının kalan ana bilinmeyenleri kapatma olasılığı düşük: açık konular artık gerçek cihaz, uygulama sürümü, kullanıcı testi ve API denemesi gerektiriyor. Bu nedenle masa başı araştırma burada tamamlandı; cihaz araştırması uygulama planının ilk kapısı olarak açık tutuldu.

## 11. Güncel ekran kanıtları

Aşağıdaki görseller mevcut uygulamaya aittir; yeni tasarım önerisi değildir. Hepsi aynı araştırma çalışmasında 390 × 844 görünümde kaydedildi. Kaydırma çubuğu olan ekranlar tarayıcının görünür alanıyla birlikte yakalandı. Ekran 10, seçili kampüs noktası açıkken scroll=0 durumudur.

| 01 — Akış | 02 — Keşfet / Kampüsüm |
| --- | --- |
| ![01 Akış](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/01-feed.png) | ![02 Keşfet](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/02-discover.png) |

| 03 — Notlar | 04 — Notlar filtreler açık |
| --- | --- |
| ![03 Notlar](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/03-notes.png) | ![04 Filtreler](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/04-notes-filters.png) |

| 05 — Topluluklar / boş Diğer | 06 — Kendi profili |
| --- | --- |
| ![05 Topluluk menüsü](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/05-communities-overflow.png) | ![06 Profil](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/06-profile.png) |

| 07 — Paylaşım başlangıcı | 08 — Mesaj listesi |
| --- | --- |
| ![07 Paylaşım](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/07-composer.png) | ![08 Mesajlar](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/08-messages.png) |

| 09 — Yeni mesaj / boş sorgu | 10 — Kampüs / seçili nokta |
| --- | --- |
| ![09 Alıcı seçimi](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/09-new-message.png) | ![10 Kampüs](D:/-niyra-main/exports/mobile-quality-research-2026-09-05/10-campus.png) |

**Bu belgenin teslim sınırı:** Araştırma, önerilen kararlar, fazlar ve kabul koşulları hazırdır. Uygulama, gerçek cihaz kalite onayı ve Google Play yayını bu belgenin tamamlanmasıyla gerçekleşmiş sayılmaz.

Belge denetiminde 15 faz, 105 benzersiz iş, faz bağımlılıkları, 39 kaynak bağlantısının kaydı, yerel dosya hedefleri ve tablo yapısı kontrol edildi. On ekran kanıtı ayrı ayrı görüntülendi. Markdown belgesinin tamamı için render edilmiş sayfa geometrisi incelemesi yapılmadı; belge kontrolü yapısaldır.
