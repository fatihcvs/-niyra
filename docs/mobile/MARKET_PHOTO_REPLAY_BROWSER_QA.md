# Pazar fotoğraf tekrarı — gerçek tarayıcı doğrulaması

6 Eylül 2026. Bu kayıt, kalan kod çalışmalarının ikinci fazındaki fotoğraf yükleme ve silme davranışının yerel tarayıcı kanıtını izler.

## Yöntem

`scripts/mobile-quality/isolated-browser-qa.mjs --final --only="market photo replay"` yalnız `http://127.0.0.1:5180` üzerinde derlenmiş yalıtılmış worker'a bağlanır. Sentetik hesaplar normal kayıt ve akademik profil API'leriyle oluşturulur; Chrome'da gerçek giriş formu kullanılır. Normal kullanıcı verisi veya üretim origin'i bu koşuya dahil değildir.

Fotoğraf denemesi, Git tarafından dışlanan `outputs/isolated-mobile-qa/private-photo-chrome-profile-*` altında bağımsız Chrome profili kullanır. Test aracı oturum çerezlerini veya yerel taslak depolamasını okumaz, dışa aktarmaz ya da enjekte etmez. Yalnız uygulamanın gönderdiği fotoğraf işlem anahtarı, ilan hedefi ve multipart dosya gövdesi incelenir. Multipart sınırının aynı olması beklenmez; sıralı dosya adı, türü, boyutu ve SHA-256 değeri karşılaştırılır.

İlk fotoğraf isteği gerçek sunucuya `route.fetch` ile gider. Gerçek 201 ve görsel kimlikleri alındıktan sonra yalnız tarayıcıya ulaşacak yanıt kasıtlı düşürülür. API yanıtı uydurulmaz. Böylece test, sunucuda tamamlanan ama istemcide doğrulanamayan işlemi tekrarlar. Oluşan kasıtlı ağ hatası genel ağ hatalarından ayrı raporlanır.

## Senaryo

1. Gerçek ilan formunda metin alanları ve farklı baytlara sahip sıralı iki PNG seçilir. İlan ve fotoğraf isteği gerçek D1/R2'ye gider; fotoğraf 201 yanıtı yukarıdaki şekilde kaybettirilir.
2. Anahtarlı fotoğraf kurtarma eyleminin görünmesi, eski anahtarsız akıştaki elle fotoğraf kontrolü kutusunun bulunmaması ve kalıcı taslağın kaydedilmesi beklenir.
3. Bağımsız Chrome süreci tamamen kapatılır, aynı özel profil yeniden açılır. Gerekirse normal giriş formu kullanılır; arada çıkış yapılmaz. Dosya sırası, tekrar düğmesi ve otomatik gönderim yapılmaması doğrulanır.
4. Kurtarma düğmesinin 390 ve 320 px görünümlerde yatay kesilmemesi ve en az 48 px dokunma yüksekliği ölçülür. Ekran görüntüsü için düğme görünür alana kaydırılır; bu ölçüm otomatik odak/kaydırma kabulü olarak sunulmaz.
5. Kullanıcının tekrar düğmesine basmasıyla aynı anahtar, ilan hedefi ve sıralı dosya içeriği gönderilir. Gerçek yanıtın 201, `Idempotency-Replayed: true`, `idempotentReplay: true` ve ilk yanıtla aynı sıralı görsel kimliklerini döndürmesi gerekir.
6. Gerçek listeleme API'sinde tek ilan ve tam iki fotoğraf bulunur. Her iki fotoğrafın gerçek özel medya URL'sinden dönen R2 baytları başlangıç dosyalarıyla karşılaştırılır. Başarılı işlemin yerel taslağı temizlediği UI'dan denetlenir.
7. Fotoğraflardan biri aynı normal oturumla gerçek DELETE API'sinden kaldırılır. Önceki fotoğraf isteğinin aynı multipart gövdesi ve anahtarı yeniden gönderilir; 410 dönmesi gerekir. Listede yalnız ikinci fotoğraf kalır, kaldırılan görselin GET'i 404 olur ve kalan görselin baytları değişmez.

## Güncel kanıt

Koordinatörün derleme ve migration 0028 sonrasındaki açık READY işaretinden sonra çalışan `exports/isolated-mobile-qa/browser/final-1788651454498/report.json` **4/4 başarılıdır**. Koşu 5 Eylül 2026 23:37:34–23:38:11 UTC, Türkiye saatiyle 6 Eylül 02:37:34–02:38:11 aralığındadır. Dört kontrol, yalıtılmış worker sağlığı, normal kayıt/profil/giriş ve manifest, fotoğraf senaryosu, son statik dosya/ağ kapısıdır; dört ayrı fotoğraf senaryosu olarak sayılmaz.

Gerçek fotoğraf 201 yanıtı sunucu kaydından sonra düşürülmüş; bağımsız Chrome tamamen kapanıp aynı özel profil ile tekrar açılmıştır. Chrome normal oturumunu koruduğundan tekrar giriş gerekmemiştir. Geri yükleme kendiliğinden istek göndermemiş; kullanıcı tekrar düğmesine bastığında aynı fotoğraf anahtarı, aynı ilan ve aynı sıralı dosya adı/tür/boyut/SHA-256 değerleri gönderilmiştir. Gerçek 201 yanıtında hem `Idempotency-Replayed: true` hem `idempotentReplay: true` doğrulanmış ve ilk yanıtla aynı iki görsel kimliği dönmüştür. Gerçek API'de tek ilan ve tam iki fotoğraf bulunmuş; her iki R2 GET'inin baytları kaynak PNG'lerle aynı çıkmıştır. Tamamlanan taslak UI'dan temizlenmiştir.

Sonrasında ilk fotoğraf gerçek API'den kaldırılmıştır. Eski multipart yüklemesi ve anahtarıyla yapılan istek **410**, kaldırılan görselin GET'i **404** dönmüştür. Listede yalnız ikinci görsel kalmış, baytları değişmemiştir. Bu kontrol gerçek silinen sentetik kaydı kullanır; sahte HTTP yanıtı yoktur.

Beklenmeyen başarısız ağ isteği **0**, statik dosya hatası **0**, JavaScript çalışma hatası **0**. Üç konsol kaydı iki beklenen giriş öncesi profil 401'i ve bir kasıtlı fotoğraf yanıt kaybıdır. Son kapı bunları ayrı izler; beklenmeyen ağ hatası başarı olarak kabul edilmez. Başlangıç dokümanında tam bir aynı-origin manifest ve gerçek GET 200 de doğrulanmıştır.

Aynı rapor klasöründeki dört PNG çıktısı bulunmaktadır. `market-photo-restored-retry-390.png`, `market-photo-restored-retry-320.png` ve `market-photo-deleted-not-resurrected-320.png` görsel olarak incelenmiştir. 390 ve 320 px ekranlarda kurtarma metni ve düğmeleri kesilmez; iki dosyanın sırası görünürdür. Tekrar düğmesi iki görünümde de **48 px** yüksekliğindedir; sol 34 px, sağ yaklaşık 215,8 px ölçülmüştür. Hem diyalog hem doküman yatay taşma ölçümü false'dur. Son 320 px ilan ayrıntısında galeri **1/1** gösterir. Raporun genel `screens` dizisi yalnız tüm sayfa taramalarına ayrıldığından bu odaklı koşuda sıfırdır; fotoğraf senaryosunun dört gerçek PNG'si ve `recoveryLayouts` ölçümleri ayrıca bulunur.

## Sınırlar

Bu yöntem masaüstü Chrome sürecinin yeniden açılmasını doğrular; Android süreç ölümü, fiziksel cihaz yolculuğu, üretim altyapısı veya Google Play kabulünü doğrulamaz. Silinen medya URL'sinin 404 olması erişilebilir kaydın kaldırıldığını kanıtlar; R2'nin fiziksel nesne temizliği ve gecikmiş veritabanı işlemleri için ayrı API/uzlaşım testleri gerekir.
