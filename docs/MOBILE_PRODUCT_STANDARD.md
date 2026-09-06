# Kampira mobil ürün standardı

Bu belge, 5 Eylül 2026 tarihinde kabul edilen mobil bilgi mimarisini ve kabul koşullarını tanımlar. Amaç, günlük sosyal kullanımda az sayıda anlaşılır hedef sunmak ve ayrıntılı kampüs araçlarını ihtiyaç duyulduğunda açmaktır.

**Doğrulama durumu:** Aşağıdaki maddeler kabul ölçütüdür; bu belge güncellemesi bunların uygulamada geçtiğini göstermez. Tarayıcı, gerçek cihaz, Android paketi ve yayın kontrolleri ayrı kanıtlarla tamamlanmalıdır.

## Ana gezinme

Mobil alt çubuk, sırası ve görünür etiketleri korunarak beş hedef taşır:

| Hedef | Açılan deneyim |
| --- | --- |
| **Akış** | Genel Akış, Takip ve Kampüsüm paylaşımları. |
| **Keşfet** | Öğrenci, ders, not ve topluluk araması; kampüs araçlarına giriş. |
| **Paylaş** | Ara seçim menüsü açmadan doğrudan tam ekran gönderi yazma. |
| **Mesajlar** | Konuşma listesi ve seçilen özel konuşma. |
| **Profil** | Kendi profilin, profil düzenleme ve hesap araçları. |

Paylaş bir eylemdir; diğer dört öğe kalıcı gezinme hedefidir. Gönderi yazmaya başlamak için bir kez dokunmak yeterlidir. Tam ekran yazma akışı kendi kapatma/geri ve yayınlama kontrollerini taşır. Not yükleme, ilan verme ve Kampüs Anlık paylaşımı ilgili bölümün birincil eylemi olarak kalır.

Alt çubuğa yeni modül eklenmez. Eski **Anlık** ve **Menü** hedefleri bu mimaride alt çubukta yer almaz.

## İkincil alanlara erişim

| Giriş noktası | Alanlar |
| --- | --- |
| **Keşfet** | Kampüs, Kampüs Anlık, Kütüphane, Eşleş, Pazar, Notlar ve Topluluklar. |
| **Profil** | Kaydedilenler, Güvenlik ve Ayarlar. |

İkincil bir alan açıldığında üstte **geri düğmesi ve kısa bölüm adı** bulunur. Aynı başlık sayfanın içinde ikinci kez gösterilmez. Geri işlemi kullanıcıyı geldiği bağlama döndürür; örneğin Keşfet aramasından açılan Notlar sayfası geri dönüldüğünde aramayı kaybettirmez. URL ile doğrudan girişte kullanılabilir bir üst hedef bulunmalıdır.

Mesajlarda konuşma listesi ve konuşma ayrıntısı mobilde ayrı görünümlerdir. Konuşmadaki geri düğmesi listeye döner. Profil ana hedef olarak kalır; profil içinden açılan hesap araçları kendi geri başlığını kullanır.

## Mobil içerik ve kontroller

- Bölüm açılışında kısa başlık, arama veya gerekli tek ana eylem ve gerçek içerik öne çıkar. Tekrarlanan slogan, açıklama, istatistik ve kartlar içeriği gereksiz yere aşağı itmez.
- Bölüm başlığında en fazla bir ana eylem görünür. Diğer işlemler etiketli bir **Diğer** açılır alanında erişilebilir kalır; işlevler yalnız görünümü sadeleştirmek için kaldırılmaz.
- Arama gereken bölümlerde tek arama satırı bulunur. İleri seçimler **Filtreler** düğmesiyle açılır; masaüstünde doğrudan görünür kalabilir.
- Filtre düğmesi `aria-expanded` ve `aria-controls` taşır. Kapalı filtre alanına klavye odağı gitmez. Filtreleri açıp kapatmak seçili değerleri silmez.
- Notlar başlangıçta iki kısa kaynak sekmesi gösterir: **Öğrenci notları** ve **Editoryal kaynaklar**. Not görünümü, ders, sıralama ve sınav ayrıntıları filtre alanındadır. Seçili dersin bağlamı filtreler kapalıyken de görünür; ders bağlantısı ve yeniden yükleme bu seçimi korur.
- Arama ve filtre sonucu boşsa gerçek boş durum ve uygulanabilir bir sonraki eylem gösterilir. Örnek öğrenci, sahte paylaşım veya uydurma dolulukla ekran doldurulmaz.

## Etkileşim ve erişilebilirlik

- Birincil mobil düğmeler ve filtre kontrolleri en az **48 × 48 CSS piksel** dokunma alanı sunar. Metinli kontroller gerektiğinde genişler; etiket kırpılmaz.
- Mobil form alanları en az **16 px** yazı kullanır. Odak, hata açıklaması ve seçili durum görülebilir olmalıdır.
- Alt çubuk, tam ekran yazma alanı ve diyaloglar cihazın güvenli alan boşluklarını (`safe-area-inset-*`) korur.
- Klavye açıldığında yazılan alan ve gerekli gönderme/kaydetme eylemi erişilebilir kalır. Sabit başlık veya alt çubuk içeriğin üstünü örtmez.
- Alt çubuk etiketleri görünür kalır; ana görevler yalnız ikon anlamı tahmin edilerek bulunmaz. Etkin gezinme hedefi uygun `aria-current` durumuyla belirtilir.
- Gerçek modal diyaloglar erişilebilir bir ad, `role="dialog"` ve `aria-modal="true"` kullanır; odak içlerine taşınır ve kapanınca açan kontrole döner. Sayfa içi filtre açılımı modal gibi işaretlenmez.
- Diyaloglar kapatma düğmesi ve Escape ile kapanır; dış alana dokunma yalnız beklenmeyen veri kaybı yaratmadığı durumlarda kapatır. Sistem/tarayıcı geri işlemi de açık katmanı veya alt görünümü tutarlı biçimde kapatır.
- Hareket azaltma tercihinde gereksiz açılış animasyonları kaldırılır. Metin büyütme ve ekran okuyucu kullanımı temel akışları engellemez.
- Ana görevler yatay sayfa taşmasına veya alt çubuğu yana kaydırmaya bağlı değildir.

## Android ve kurulabilir web yönü

Kabul edilen ilk Android yönü, **Railway üzerinde barındırılan HTTPS web ürününü temel alan PWA ve TWA** yaklaşımıdır. Mobil bilgi mimarisi, gerçek oturum ve mevcut sunucu API'leri bu ortak web ürününde korunur. Android için ayrı bir Expo/React Native istemcisi bu aşamanın kapsamı değildir; iOS istemcisi için burada bir uygulama kararı verilmemiştir.

Öngörülen Android uygulama kimliği **`app.kampira.mobile`** değeridir. Bu değer geçicidir; dağıtım kimliği ve sahiplik doğrulamaları kesinleştirilmeden yayınlanmış paket kimliği olarak sunulamaz.

PWA kurulabilirliği, çevrimdışı geri bildirim, TWA alan adı doğrulaması, Android imzalama ve mağaza yayını ayrı teslimlerdir. Yerel bir önizlemenin açılması veya web derlemesinin geçmesi, imzalı Android uygulamasının hazır olduğu anlamına gelmez. Bu belge **APK/AAB üretildiğini, gerçek cihazda doğrulandığını veya mağazada yayınlandığını iddia etmez**.

## Kabul kontrolü

5 Eylül 2026 yerel uygulama ve tarayıcı sonuçları [mobil kontrol raporunda](../exports/mobile-app-2026-09-05/kontrol-raporu.md) kayıtlıdır. Aşağıdaki geniş kabul maddeleri, bütün koşulları sağlanmadan işaretlenmez. Karşılaştırma yöntemi [mobil kullanım kıyaslamasında](MOBILE_UX_BENCHMARK.md) tanımlıdır.

Her madde tamamlandığında tarih, ortam, kullanılan görünüm/cihaz ve kanıt bağlantısı ilgili kontrol raporuna eklenmelidir. Web kontrolleri ile Android/yayın kontrolleri birbirinin yerine kullanılamaz.

### Mobil web ve PWA

- [ ] 360 × 800, 390 × 844 ve 430 × 932 görünümlerinde alt çubuk yalnız Akış, Keşfet, Paylaş, Mesajlar ve Profil içerir; etiketler ve dokunma alanları sığar.
- [ ] 320 px dar görünümde ve %200 metin büyütmede ana görevler yatay sayfa taşması olmadan tamamlanır.
- [ ] Paylaş tek dokunuşla tam ekran gerçek gönderi yazma akışını açar; kapatma, hata ve başarılı paylaşım davranışları doğrulanır.
- [x] Keşfet'ten yedi kampüs alanına, Profil'den Ayarlar üzerinden Kaydedilenler/Güvenlik'e gidilir ve bağlamsal geri dönüş çalışır. Yerel tarayıcı, 344 px; 5 Eylül 2026.
- [ ] İkincil alanlarda tek başlık bulunur; ilk içerik sabit başlığın veya alt çubuğun altında kalmaz.
- [ ] Filtreler başlangıçta kapalıdır; açma, temizleme ve kapatma klavye ve dokunmayla çalışır. Kapalı kontroller odak sırasına girmez.
- [ ] Ders bağlantısıyla açılan Notlar, seçili dersi görünür tutar; yeniden yükleme ve aramaya geri dönüş doğru bağlamı korur.
- [ ] Mesaj listesi, konuşmaya giriş, geri dönüş, yazma ve klavye açıkken gönderme gerçek yerel test kayıtlarıyla doğrulanır.
- [ ] Açık/koyu tema, güvenli alanlar, ekran okuyucu etiketleri, modal odak yönetimi ve azaltılmış hareket davranışı kontrol edilir.
- [ ] Kurulu PWA'da açılış, oturum, yenileme ve bağlantı kesintisi davranışı doğrulanır. Çevrimdışı başarısız gönderim başarılı gösterilmez; özel içerik başka bir hesaba önbellekten açılmaz.

### Android ve yayın

- [ ] Hedef Railway HTTPS adresinde temel web akışları ve PWA dosyaları dışarıdan doğrulanır.
- [ ] Kesin alan adı, uygulama kimliği ve imzalama bilgileriyle TWA sahiplik doğrulaması tamamlanır.
- [ ] Dağıtılacak Android paketinin derlenmesi ve imzalanması ayrı kanıtla kaydedilir.
- [ ] Gerçek Android cihazında kurulum, açılış, oturum, sistem geri, klavye, dosya seçimi ve bağlantı kaybı test edilir.
- [ ] Mağaza için gerekli içerik, beyanlar, test ve inceleme adımları ayrıca tamamlanır. Yükleme veya inceleme beklenmesi, yayın tamamlandı olarak raporlanmaz.

