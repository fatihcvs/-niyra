# Pazar kalıcı taslakları — gerçek tarayıcı doğrulaması

6 Eylül 2026. Bu kayıt yalnız kalıcı Pazar taslakları fazının yerel tarayıcı kapsamını izler. Diğer fazları veya üretim/Android cihaz kabulünü kapatmaz.

Harness daha sonra ikinci fazın fotoğraf tekrar senaryosuyla genişletilmiştir. Bu dosyadaki 11/11 ve 4/4 sayıları aşağıda adı verilen ilk faz raporlarına aittir. Yeni fotoğraf senaryosunun yöntemi ve kanıtı `MARKET_PHOTO_REPLAY_BROWSER_QA.md` içinde ayrı izlenir.

## Sınır ve yöntem

`scripts/mobile-quality/isolated-browser-qa.mjs --final --only=market`, yalnız `http://127.0.0.1:5180` üzerinde derlenmiş yalıtılmış worker'a bağlanır. Veritabanı ve dosyalar `exports/isolated-mobile-qa/state` içinde kalır. Sentetik hesaplar normal kayıt/profil API'leriyle oluşturulur ve gerçek Chrome giriş formuyla oturum açar. Çerez, oturum veya taslak depolaması okunmaz ya da enjekte edilmez; sahte API yanıtı üretilmez.

Kaydetme tamamlanması görünür `Pazar taslak durumu` bölgesinin `data-state=saved` durumuyla beklenir. Kayıt davranışı için keyfi gecikme veya yerel depolama içeriğini denetleyen test kısayolu kullanılmaz. Listeleme dosyalarında yalnız dosya adlarının yeniden görünmesi yeterli sayılmaz: tekrar açılan taslak gerçek API'ye yayımlanır, iki dosyanın sunucudan dönen PNG baytları ve sırası başlangıçtaki dosyalarla karşılaştırılır; galerideki görüntülerin sırası ve çözülmesi de ölçülür.

## Senaryolar

- Mevcut aynı sayfa kurtarması: ilk gerçek ilan yanıtı 201 olduktan sonra ağ yanıtı kasıtlı düşürülür. Uygulama kurtarma bölgesini kendisi görünür hale getirir ve odaklar. Tekrar düğmesi aynı anahtar/gövde ile tek ilanı doğrular.
- Belirsiz kayıt ve tam yenileme: aynı kontrollü yanıt kaybından sonra taslak kaydedilir, doküman tamamen yeniden yüklenir. Otomatik gönderim yapılmaz. Açılan taslaktaki tekrar işlemi önceki anahtar/gövdeyle aynı ilanı getirir.
- İlan ve iki dosya: altı alan, ilan türü ve sıralı iki File seçilir. Kaydedildikten sonra bu sekme kapanır; farklı dokümanda alanlar ve dosyalar geri gelir. Gerçek yayın ve dosya bayt/sıra kontrolleri geçtikten sonra tamamlanan taslağın temizliği doğrulanır.
- Gerçek Chrome süreç yeniden başlatma: ana test tarayıcısından bağımsız Chrome, `outputs/isolated-mobile-qa` altında yeni ve Git tarafından dışlanan özel profil ile açılır. Normal girişten sonra altı alan ve iki File kaydedilir. Bu persistent context kapatılarak ilgili Chrome süreci sonlandırılır; aynı profil tekrar açılır. Gerekirse normal giriş formu kullanılır, arada çıkış yapılmaz. UI alan/dosya geri yüklemesi ve ardından gerçek yayın/dosya bayt sırası doğrulanır. Oturum veya depolama içeriği okunmaz ya da dışa aktarılmaz.
- Fiyat: mekân, ürün, kategori, miktar, tarih ve kaynak notu tam doküman yenilemesinden sonra korunur. Açık kullanıcı gönderiminden sonra gerçek API'de tek fiyat grubu bulunur.
- İlan mesajı: ikinci sentetik kullanıcı normal giriş yapar. Yazılan iletişim taslağı tam yenilemeden sonra geri gelir ve kendiliğinden gönderilmez. Kullanıcının gönderme eylemiyle tek gerçek mesaj oluşur.
- Çıkış ve sahip ayrımı: yayımlanmamış metin ve dosya taslağı kaydedilir. Ayarlar ekranındaki gerçek “Çıkış yap” düğmesi kullanılır. Başka hesapta ve asıl hesaba tekrar girişte özel alan/dosya görünmez; taslak sunucuya yayımlanmamıştır.

## Güncel kanıt

Son küçük tarih düzeltmesi için `exports/isolated-mobile-qa/browser/final-1788647770744/report.json` üzerinde odaklı **4/4** geçmiştir. Normal giriş, tek/same-origin manifest ve gerçek GET 200, fiyat taslağı ve beklenmeyen ağ/statik dosya kapıları başarılıdır; JavaScript hatası yoktur. Fiyat formu açıldığında UI'daki `2026-09-06` başlangıç tarihi okunmuş, bu alana hiç dokunulmadan diğer beş alan kaydedilmiştir. Tam yeniden yüklemeden sonra tarih dahil altı alan aynı kalmış ve gerçek yayın 201 ile tek fiyat kaydı oluşmuştur. Tek konsol kaydı beklenen giriş öncesi profil 401'dir. `market-durable-price-restored.png` görseli incelenmiştir. Bu tarayıcı vakası saati ertesi güne ilerletmez; bunu kanıtladığı iddia edilmez.

Öncesindeki geniş kabul: `exports/isolated-mobile-qa/browser/final-1788647302539/report.json`, **11/11 başarılı**. Son tarih düzeltmesinden önceki bu geniş koşu ile son odaklı dört kontrol ayrı kabul kanıtlarıdır; tekrar edilen kapılar toplanarak 15 farklı test iddiası yapılmaz. Beklenmeyen başarısız ağ isteği, eksik statik dosya ve JavaScript çalışma hatası sıfırdır. Yedi HTTP konsol kaydı, beş açıkça denenen giriş öncesi profil 401 ve iki kasıtlı Pazar yanıt kaybıdır. Dokümanda tam bir manifest bağlantısı bulunmuş, aynı origin'e çözüldüğü ve gerçek GET isteğinin 200 döndüğü doğrulanmıştır. Önceki dış manifest/CORS hatası tekrarlanmamıştır.

Sekme kapanışı, belirsiz işlemden sonra tam yeniden yükleme, fiyat/iletişim alanları, açık kullanıcı çıkışı ve hesap ayrımı yeniden geçmiştir. Ana tarayıcıdan bağımsız Chrome süreci kapatılıp aynı özel profil tekrar açılmış; altı alan ve iki dosya 320 px görünümde geri gelmiştir. Cookie enjekte edilmemiş, oturum Chrome tarafından korunmuştur. Gerçek API'ye yayından sonra iki PNG'nin baytları ve sırası tekrar doğrulanmıştır. Hem ilk gerçek yanıt kaybında hem yeniden yükleme sonrasında tekrar aynı anahtar/gövdeyle aynı kaydı getirmiş; ikinci ilan oluşmamıştır.

`market-durable-files-restored.png` (390 px), `market-durable-process-restored.png` (320 px), `market-durable-price-restored.png`, `market-durable-inquiry-restored.png` ve `market-durable-replay-restored.png` görsel olarak incelenmiştir. “Dosya seçilmedi” çelişkisi kaldırılmış; seçilen iki dosya, sırası ve değiştirme eylemi açıkça görünür. Formlarda yatay kesilme görülmemiştir. Son ölçümler rapordaki `restoredLayout` alanından alınır:

| Ölçüm | Önceki ekran, yaklaşık | Son 390 px | Son 320 px |
| --- | --- | --- | --- |
| Normal kayıt durumu yüksekliği | 114 px | 48 px | 48 px |
| İki dosya seçim bölgesi yüksekliği | 263 px | 187,5 px | 202 px |
| Başlık metin alanının üst konumu | 640 px | 462 px | 476,5 px |

Önceki değerler `final-1788646723627` ekran görüntülerinden görsel tahmindir; son değerler gerçek DOM dikdörtgen ölçümüdür. Böylece normal taslak durumunun kapladığı alan azalırken 48 px dokunma alanları korunmuştur. Son harness syntax, ESLint ve kapsam içi `git diff --check` başarılıdır.

## İlk koşuda bulunan ve giderilen eksikler

İlk gerçek koşu: `exports/isolated-mobile-qa/browser/final-1788646723627/report.json`. On bir assertion geçmiş; belirsiz kaydın yeniden yüklemesi, iki File'ın sekme ve gerçek Chrome süreç kapanışı sonrası korunması, fiyat/iletişim taslağı ve UI çıkış/hesap ayrımı gerçekleşmiştir. Chrome süreç kontrolünde altı alan ve iki PNG dosyası 320 px görünümde geri gelmiş; yayımlanan dosyaların gerçek baytları ve sırası doğrulanmıştır. Oturum tarayıcı tarafından korunmuştur, tekrar giriş gerekmemiştir.

Bu ilk koşu temiz genel kabul sonucu değildir: ayrı persistent Chrome, uygulamanın mutlak Railway manifest bağlantısı nedeniyle altı başarısız dış manifest isteği/CORS kaydı üretmiştir. Raporda `postRunReview.accepted=false` ile açıklanır. İlk statik dosya kapısı manifest bağlantı hatalarını kapsamadığı için görünürdeki 11/11 sayı bu kusuru kapatmaz; güncel harness son kapısına tüm kasıtlı olmayan başarısız ağ istekleri de dahil edilmiştir. JavaScript çalışma hatası yoktur; ayrıca beş beklenen profil 401 ve iki kasıtlı Pazar yanıt kaybı kaydı vardır.

İlk görsel incelemede 320/390 px formlar yatay taşmamış; geri yüklenen dosyaların gerçek listesi ve 2/6 sayacı görünmüştür. Bununla birlikte native dosya alanı “Dosya seçilmedi” metnini göstererek geri yüklenen iki dosyayla çelişmiş; sıradan kaydedildi bölgesi temizleme düğmesiyle yaklaşık 114 px yer kaplamıştır. Bu bulgular kaynak sahibine iletilmiş ve yukarıdaki son koşuda düzeltilmiş hali doğrulanmıştır.

## Kanıtın sınırları

Sekme kapanışı ve tam doküman yenilemesi aynı tarayıcı bağlamındaki kalıcılığı, ayrı persistent Chrome senaryosu masaüstü Chrome sürecinin yeniden başlamasını ölçer. Bunlar Android süreç ölümü, cihaz depolama temizliği veya Google Play kabulü kanıtı değildir. Üretilen giriş bilgileri yalnız test işleminin belleğinde tutulur; Chrome kendi normal oturumunu Git dışındaki özel profiline kendisi kaydeder. Test aracı bu profili okumaz veya dışa aktarmaz. Yerel test dosyaları ve ağ arızası, gerçek kullanıcı veya üretim verisine uygulanmaz.
