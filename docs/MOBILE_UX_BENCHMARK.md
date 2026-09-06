# Kampira mobil kullanım karşılaştırması

İnceleme tarihi: **5 Eylül 2026**. Bu belge, mobil değişiklikleri büyük sosyal ürünlerde belgelenmiş kullanım örüntüleriyle karşılaştırmak için tutulur. Kampira'nın kabul edilen gezinmesi ve Android yönü [mobil ürün standardında](MOBILE_PRODUCT_STANDARD.md) tanımlıdır.

## Kanıtın kapsamı

- **Kaynak olgusu:** Meta/Instagram, WhatsApp ve Android'in aşağıdaki beş resmî yayını. Duyuru tarihi, bugünkü bütün hesaplarda aynı arayüzün bulunduğunu kanıtlamaz.
- **Kampira kanıtı:** Mevcut kaynak kodu, yerel bileşen/birim testleri, kayıtlı ekran görüntüleri ve uygulamayı kontrol eden ajanın tarayıcı DOM ölçümü.
- **Tasarım kararı:** Bu kanıtlardan Kampira için çıkarılan kabul ölçütü. Rakiplerde ölçülmüş başarı oranı veya süre olarak sunulmaz.

Bu incelemede Instagram veya WhatsApp'ın oturum açılmış uygulamalarında görev testi yapılmadı. Rakiplerden daha hızlı olunduğu, eşdeğer kullanım kalitesine ulaşıldığı veya gerçek Android cihaz kontrolünün tamamlandığı iddia edilmez.

## Mevcut Kampira başlangıç noktası

| Kontrol | Eldeki kanıt | Sınır |
| --- | --- | --- |
| Akışta ilk gönderi | Uygulamayı kontrol eden ajanın 390 CSS px genişlikteki DOM okuması: ilk gönderi üstü **105 px**, yatay taşma yok. Önceki durumda bildirilen değer **237 px**. | Değerler ayrı kontrol kayıtlarıdır. Kayıtlı [önce](../exports/mobile-app-2026-09-05/before-feed.jpg) ve [sonra](../exports/mobile-app-2026-09-05/after-feed.jpg) dosyaları **375 × 812 görüntü pikselidir**; bu dosyalar 390 px ekran görüntüsü olarak etiketlenmez. Aynı viewport kaydı eşleştirilmeden yüzde iyileşme çıkarılmaz. |
| Ana gezinme | Akış, Keşfet, Paylaş, Mesajlar, Profil: beş görünür etiket. 390 px DOM kontrolünde beş düğmenin yüksekliği **59 px**. [Kod](../app/mobile-app.tsx), [sonraki akış görüntüsü](../exports/mobile-app-2026-09-05/after-feed.jpg). | Geometri ölçümü bu görünüme aittir; tüm boyutlarda geçtiği anlamına gelmez. |
| Gönderi oluşturma | Paylaş doğrudan yazma eylemini çağırıyor; ara seçim ekranı yok. [390 × 844 görüntü](../exports/mobile-app-2026-09-05/composer.jpg), [bileşen](../app/mobile-app.tsx). Kapatma, yayınlama, medya ve hedef kitle kontrollerinde 48 px alt sınırı [CSS'te](../app/mobile-app.css) tanımlı. | CSS tanımı, her görünümde gerçek dokunma alanı ölçümü veya cihazda dosya seçimi kanıtı değildir. |
| Filtreler | Paylaşılan arama satırında etiketli Filtreler düğmesi; başlangıçta kapalı panel; `aria-expanded` / `aria-controls`; Escape ile kapatma. [Bileşen](../app/workspace-ui.tsx), [mobil kurallar](../app/mobile-workspaces.css), [not filtreleri görüntüsü](../exports/mobile-app-2026-09-05/notes-filters.jpg). | Bu desenin kullanıldığı bölümleri kapsar. Seçili ders bağlamı ayrıca [Notlar kodunda](../app/product-features.tsx) korunur. |
| Gezinme sözleşmesi | [Mobil kabuk](../tests/mobile-shell.test.mjs) ve [gezinme yardımcıları](../tests/mobile-navigation.test.mjs): bu çalışma sırasında **17/17 test geçti**. Beş hedef, doğrudan oluşturma, hesap/kampüs bağlantıları, URL ve geçmiş durumları kontrol edildi. | Bileşen işaretlemesi, olay çağrıları ve taklit geçmiş testleri; tam tarayıcı yolculuğu, gerçek cihaz geri hareketi veya kullanıcı çalışması değildir. |

Testi tekrarlama komutu:

```powershell
node --test --test-isolation=none tests/mobile-shell.test.mjs tests/mobile-navigation.test.mjs
```

## Görev bazında karşılaştırma

Aşağıdaki kabul ölçütleri **Kampira için tasarım kararıdır**; resmî kaynaklarda yayımlanmış rakip performans eşikleri değildir.

| Görev | Resmî üründen alınan ilke | Kampira'da karşılığı ve sonraki kontrol |
| --- | --- | --- |
| **Akış** | Instagram'ın 2025 duyurusu içerik ve mesajlaşmaya erişimi gezinmede öne alıyor; Hindistan'daki sınırlı Reels açılış testi ayrıca belirtiliyor. [Meta duyurusu](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/) | Kampira'nın öğrenci akışında tekrarlanan başlık/açıklama kaldırıldı; içerik daha erken başlıyor. 390 × 844, kaydırma 0, yüklenmiş ve uyarısız aynı test verisinde ilk gerçek gönderi üstünü **140 CSS px altında** tut. İskelet yükleme ekranını gönderi sayma; video ağırlıklı rakip düzenini ürün gereksinimi kabul etme. |
| **Keşfet** | WhatsApp'ın 2024 duyurusunda sohbet listesinin üstündeki All, Unread, Groups filtreleri tek dokunuşla seçiliyor. Bu, ilgili listeye yakın görev odaklı filtreleme örneği. [WhatsApp duyurusu](https://about.fb.com/news/2024/04/whatsapp-chat-filters/) | Bunun Keşfet'e uygulanması bir **çıkarımdır**. Kampira'da Kişiler/Kampüs ayrımı, yedi kampüs hedefi ve gerektiğinde açılan bölüm filtreleri var. Arama görünür kalsın; ileri filtreler tek eylemle açılsın; kapatılınca seçili ders ve değerler kaybolmasın. [Kampüs görünümü](../exports/mobile-app-2026-09-05/campus-hub.jpg). |
| **Paylaş** | Android büyük, kolay dokunulan kontroller ve amacı açıklayan etiketler öneriyor; yerel arayüz ölçüsü en az 48 × 48 **dp**. [Android erişilebilirlik](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) | Doğrudan tam ekran yazma Kampira'nın kendi kararı. Alt çubuktan **bir dokunuşla** açılmalı. Ana kontrollerde **48 × 48 CSS px** alanı tarayıcıda ölç; bu ölçüyü Android dp ile eşitleme. Boş gönderi engeli, medya seçme/çıkarma, görünür hata, vazgeçme ve yeniden açıldığında taslağın durumu kontrol edilsin. |
| **Mesajlar** | Meta mesajlaşmayı ana gezinmede erişilebilir kılmayı; WhatsApp sohbet bulmayı listeye yakın filtrelerle kolaylaştırmayı duyuruyor. [Meta](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/), [WhatsApp](https://about.fb.com/news/2024/04/whatsapp-chat-filters/) | Mesajlar alt çubuktan tek dokunuşla açılıyor; liste araması, okunmamış rozeti ve ayrı konuşma görünümü var. [Liste görüntüsü](../exports/mobile-app-2026-09-05/messages.jpg), [kod](../app/direct-messages.tsx). Konuşma → geri → liste ve doğru alıcıya taslak/gönderim kontrol edilsin. Kampira'da var olmayan WhatsApp filtreleri tamamlanmış özellik diye sayılmasın. |
| **Profil** | Android etkileşimlerin amacını açıklayan erişilebilir adlar istiyor. Bu kaynak Instagram profilinin güncel yerleşimini belgelemiyor. [Android erişilebilirlik](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) | Profilin tek dokunuşla açılması ve hesap araçlarının burada toplanması Kampira'nın bilgi mimarisi kararı. Profil → Ayarlar dişlisi → Kaydedilenler/Güvenlik yolunu, adlandırılmış düzenleme kontrollerini ve bağlamsal geri dönüşü kontrol et. Son profil düzenlemesinden önceki görüntü, güncel kabul kanıtı sayılmamalı. |
| **Geri ve klavye** | Android geri hareketinde hedefin öngörülebilmesini, sistem hareket alanlarının korunmasını ve klavye görünürlüğüne göre yerleşim uyarlanmasını açıklıyor. [Geri tasarımı](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back), [Klavye rehberi](https://developer.android.com/develop/ui/views/layout/sw-keyboard) | Alt bölüm üst başlığı, URL/geçmiş yardımcıları ve klavye açıkken alt gezinmeyi gizleyen kurallar mevcut. Geri dönüş geldiği bağlamı ve kaydırmayı korumalı; kapanmış veya yayımlanmış oluşturucu beklenmedik biçimde açılmamalı. Gerçek Android'de klavye, gönderme düğmesi, güvenli alan ve sistem geri kontrolü **bekliyor**. Web geçmiş testi, yerel predictive-back animasyonu kanıtı değildir. |

## Her ilgili değişiklikten sonra tekrarlanacak kontrol

1. **Aynı koşulları kaydet:** 360 × 800, 390 × 844 ve 430 × 932 CSS px; 320 px dar görünüm ve %200 metin büyütme ek kontrolü. Tema, tarayıcı, test verisi, oturum durumu, yükleme tamamlanması ve başlangıç kaydırması aynı olsun. Görüntü dosyası boyutu ile CSS viewport ayrı yazılsın.
2. **Geometriyi ölç:** İlk gerçek gönderinin `getBoundingClientRect().top` değeri, alt çubuk düğme sayısı/alanları, görünür etiketler ve `scrollWidth > clientWidth` sonucu kaydedilsin. Başlık veya filtre değişirse önce/sonra aynı görünümden alınsın. Taşmayı kırparak gizlemek başarı sayılmasın.
3. **Altı görevi tamamla:** Akışa dön; Keşfet'ten bölüm açıp filtrele; Paylaş'ta yazıp vazgeç/yeniden aç; konuşma açıp listeye dön; Profil'den Ayarlar'a git; tarayıcı geri/ileri ile bağlamı kontrol et. Gerçek gönderim gerekiyorsa yalnız ayrılmış test hesabı ve test alıcısı kullan; başarısız isteği başarı olarak gösterme.
4. **Erişim ve cihazı ayrı doğrula:** Klavye odağı, görünür odak, etiketler, kapalı panelin odak sırası, açık/koyu tema kontrol edilsin. Gerçek Android sistem klavyesi, geri hareketi, dosya seçimi, kurulu PWA/TWA ve ekran okuyucu kontrolleri cihaz/sürüm bilgisiyle ayrıca kaydedilsin.
5. **Kararı kanıtla:** İlgili testleri çalıştır; önceki kayıtla sayı ve görev adımı karşılaştır. Kaynakla desteklenen ilke, Kampira ölçümü, tasarım çıkarımı ve bekleyen kontrol ayrı yazılsın. İlgili rakip akışı değiştiğinde resmî kaynağı yeniden kontrol et; eski duyuruyu güncel uygulama ölçümü gibi kullanma.

Bu, geliştirme sırasında tekrarlanan bir kontrol listesidir; zamanlanmış izleme veya arka plan otomasyonu kurulmuş değildir. İlk uygulama turunun [yerel doğrulama raporu](../exports/mobile-app-2026-09-05/kontrol-raporu.md), [360–780 px ölçümleri](../exports/mobile-app-2026-09-05/responsive-feed.json) ve son [344 px profil görüntüsü](../exports/mobile-app-2026-09-05/profile-344.jpg) kaydedildi.

Kayıt şablonu:

| Tarih / değişiklik | Ortam / viewport / veri | Görev ve ölçüm | Önce / sonra kanıtı | Sonuç / bekleyen |
| --- | --- | --- | --- | --- |
| Doldurulacak | Tarayıcı veya cihaz; CSS viewport; tema; test senaryosu | Görev adımı, ilk içerik üstü, alan ve taşma ölçümü | Dosya ve test çıktısı bağlantıları | Geçti / hata / cihaz kontrolü bekliyor |

## Resmî kaynakların tarihleri

- [Meta — Instagram mobil gezinme duyurusu](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/): 28 Eylül 2025. Bölgesel test ve duyurulan genel gezinme değişikliği birbirinden ayrılır.
- [Meta / WhatsApp — sohbet filtreleri](https://about.fb.com/news/2024/04/whatsapp-chat-filters/): 16 Nisan 2024. Bu tarihli özellik duyurusudur; bugünkü filtrelerin tam envanteri değildir.
- [Android — Make apps more accessible (Views)](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views): son güncelleme 21 Nisan 2026.
- [Android — Predictive back design](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back): son güncelleme 24 Ekim 2024.
- [Android — Control and animate the software keyboard](https://developer.android.com/develop/ui/views/layout/sw-keyboard): son güncelleme 14 Ağustos 2026.

Beş kaynak da 5 Eylül 2026 tarihinde açılarak kontrol edildi. Android kaynakları yerel platform rehberidir; Kampira'nın Railway üzerinde barındırılan web/PWA ve planlanan TWA katmanındaki uygulama kanıtı ayrıca gerekir.
