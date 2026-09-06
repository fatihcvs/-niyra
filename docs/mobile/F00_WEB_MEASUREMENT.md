# F00-06 — Açık geliştirici seçimiyle yerel web ölçümü

2026-09-05. Çalışan ölçüm altyapısıdır; aşağıdaki birim testlerinin sayıları gerçek cihaz veya performans sonucu değildir. Uygulama yalnız development ortamında, açık geliştirici seçimiyle ölçer. Production telemetry, otomatik ağ gönderimi ve kalıcı depolama yoktur.

## Başlatma ve rapor

1. Yerel geliştirme uygulamasına `devMetrics=1` sorgu alanı ekle: örneğin `http://127.0.0.1:5173/?devMetrics=1`. Doğrudan galeri tuvalinde aynı alan kullanılabilir. Bu alan yalnız **Yerel web ölçümü** kontrollerini gösterir; kayıt başlatmaz.
2. Paneli açıp **Ölçümü başlat** seç. Ardından paneli daraltarak gerçek hedef akışı kullan. Kayıt en fazla beş dakika sürer; son 500 örnek tutulur. Normal uygulama URL'si parametreyi kaldırsa da açık kayıt devam eder.
3. **Raporu yenile**, o anki belleği okur. Panel kendiliğinden her frame/olayda React render tetiklemez. Otomatik durma son okumadan sonra olmuşsa paneldeki “Son okuma” durumu yenilenene kadar eskidir.
4. **Durdur** gözlemcileri/dinleyicileri/timer ve rAF'ı temizler, raporu bellekte tutar. **JSON indir** yalnız açık kullanıcı eylemiyle yerel `kampira-local-web-metrics.json` dosyası oluşturur. **Sil**, bellekteki panel raporunu da bırakır. Sayfa/panel unmount olduğunda kayıt durur. Ortak katman paneli veya atasını inert yaptığında panel görünmez; collector kaydı sürer.

Tarayıcının bazı gözlemcileri desteklememesi hata puanı değildir: `capabilities` her API için `observing`, `unsupported` veya `failed` yazar. Desteklenmeyen metrik sıfır sonuçla doldurulmaz. Sayfa reload veya başka iframe ayrı JS bağlamıdır; kayıtlar kendiliğinden birleştirilmez. Geliştirme sırasında Fast Refresh effect'leri yeniden kurarsa önceki kayıt durur, okunabilir raporu korunur ve durum `Durduruldu` olarak yenilenir. Yeniden kayıt için tekrar **Ölçümü başlat** gerekir.

## Metrik sözleşmesi

| `kind` | Başlangıç / bitiş ve alanlar | İfade etmediği şey |
| --- | --- | --- |
| `event` | PerformanceEventTiming `startTime` ve `duration`; `processingStart-startTime` giriş gecikmesi, `processingEnd-processingStart` senkron işleme. Sunum gecikmesi kalan sürenin yaklaşık değeridir. Sadece sabit click/pointer/keyboard/touch/other grubu alınır. | Olay kayıtları tek etkileşim puanı değildir; interactionId toplama/INP algoritması yapılmaz. Eşik altındaki olaylar bu örneklemde olmayabilir. |
| `long-task` | Tarayıcının verdiği task süresi ve başlangıcı. | Native donmuş kare, FPS veya ANR değildir. |
| `long-animation-frame` | Tarayıcının verdiği uzun animation-frame süresi; varsa `blockingDuration`. | Bütün frame'lerin zaman çizelgesi veya Android render metriği değildir. Long task ile örtüşebilir; süreler toplanmaz. |
| `screen-pending` | Gerçek pending/busy sinyali gözlendiği andan ready sinyaline; `outcome=ready`. Unmount/devre dışı kalma kesilmesi ayrı yazılır. | Navigasyon niyetinden başlayan süre veya sonraki paint değildir. İlk gözlemde zaten ready olan cache dönüşüne yapay 0ms üretilmez. |
| `history-scroll` | `popstate` anından history'deki sayısal `kampiraScrollY` hedefi iki rAF kontrolünde ±1px gözlenene kadar. Bilinen pending sinyali varsa bekler. Beş saniye sonunda timeout, pointer/wheel veya yeni traversal'da interrupted. Yalnız hedefe göre sayısal fark tutulur. | Back/Forward ayrımı, bütün ekranın hazır olduğu veya scroll restorasyon callback'inin tamamlandığı iddiası değildir. Katman geçmişi de popstate üretebilir. |
| `scroll` | Scroll-event dispatch serisinin ilk/son olayı arası süre ve ilk/son gözlenen Y farkı. 150ms yeni olay yoksa seri kapanır; bu 150ms ölçülen süreye eklenmez. | Parmak hareketi süresi, scroll FPS'i veya kaçırılan frame sayısı değildir. Programatik scroll da olay üretebilir. |

Event Timing için eşik **16ms**, tarayıcının duration çözünürlüğü **8ms** olarak raporda açıklanır; bizim ondalık gösterimimiz daha hassas cihaz ölçümü yaratmaz. `buffered:false` kullanılır, opt-in öncesi ve son görünürlük başlangıcından eski kayıtlar elenir. Gizli sekmede gelen örnekler rapora alınmaz; arka plan pending işlemlerine ready sonucu verilmez. [W3C Event Timing taslağı](https://w3c.github.io/event-timing/) süre, işleme ve eşik anlamlarını tanımlar.

LoAF uzun render güncellemelerini, Long Tasks uzun main-thread işlerini farklı kapsamlarla bildirir. Script URL, attribution ve çağrı yığını bu ölçüme alınmaz. Bu API'lerin mevcut taslakları bir cihaz kabul sonucu değildir. [W3C Long Animation Frames taslağı](https://w3c.github.io/long-animation-frames/), [W3C Long Tasks taslağı](https://w3c.github.io/longtasks/). Kaynak kontrolü: 2026-09-05.

## Ekran hazır oluşunu bağlama

Mevcut `.notes-workspace[data-scroll-pending]` ve `.profile-content-panel[data-scroll-pending]` boolean'ları gözlenir. Genel DOM sessizliği, skeleton kaybolması, metin veya başlık adına bakılarak “hazır” tahmini yapılmaz. Gözlem başladığında pending zaten varsa ölçüm başlangıcı opt-in gözlem anıdır; önceki yüklenme süresi bilinmez. Rapordaki `startBoundary` alanı `opt-in-pending`, `dom-pending` veya `busy-commit` olarak başlangıç sınırını ayırır. `capabilities.dom-readiness` DOM gözlemcisinin gerçekten kurulup kurulmadığını gösterir.

Diğer gerçek veri sahipleri [useWebScreenTiming](../../app/use-web-screen-timing.ts) kullanabilir:

```tsx
useWebScreenTiming("feed", !postsLoading, {
  enabled: activeNav === "Akış" && profileState === "ready",
});
```

`enabled:false` veya unmount bekleyen kaydı keser; gizli akışın süresini saymaz. İzin verilen ekranlar sabittir: feed/profile/notes/search/messages/communities/campus. Hook çalışsa bile collector açık değilken gözlemci, rapor veya ağ işlemi oluşmaz. Gerçek ready boolean'ının doğruluğu çağıran bileşenin veri sözleşmesidir; açılış/önbellek/navigasyon niyeti ölçümünü kendiliğinden eklemez.

## Gizlilik ve sınırlar

[Collector](../../lib/web-performance.ts), PerformanceEntry'yi `toJSON`/spread ile saklamaz. Yalnız sabit türler ve açık sayısal alanlar kopyalanır. Target DOM kimliği, metin/başlık, URL/path/query, kullanıcı/publicId, ders/topluluk kimliği, cookie/token, dosya adı, script URL/stack veya resource timing alınmaz. URL sorgusu yalnız panel opt-in kapısı için boolean olarak okunur; rapora konmaz. history'den yalnız sayısal scroll hedefi okunur. Panelin, parola ve tek kullanımlık kod alanlarının Event Timing hedefleri filtrelenir; panelin tarayıcı iş yüküne etkisi bütünüyle yok edilemez.

`observed` kabul edilen toplam örnek, `dropped` 500 sınırından çıkarılan eski örnek sayısıdır. `samples` son 500'ün kopyasıdır; tüm oturumun dağılımı gibi değerlendirilmez. Raporun `elapsedMs` alanı kayıt oturumunun toplam ömrüdür; aradaki operatör/CUA beklemesini de içerdiği için ürün gecikmesi sayılmaz. Metrik süreleri `performance.now()` bağlamına göredir; duvar saati, CUA komutunun bekleme süresi veya araçlar arası gecikme kullanılmaz. CUA tetiklediğinde tarayıcının gözlediği olay süreleri ölçülebilir; bunlar fiziksel parmak/Android veya aynı cihazda release performansı kanıtı değildir. JavaScript bloke olmuşken beş dakikalık durdurma callback'i gecikebilir; süre sınırı sonrasında yeni örnek kabul edilmez.

Karşılaştırma yaparken test yöneticisi build türünü, viewport'u, içerik/hesap fixture kapsamını, cache durumunu ve gözlemci desteğini ayrı kayıt altına almalıdır. Collector bu kişisel/çevresel bağlamı otomatik toplamaz. F00-06 iki cihaz tabanı veya F13 performans kabulü kapatılmadı.

### Sınırlı CUA çalışma zamanı kaydı

Ana çalışmanın [temiz galeri kaydı](../../exports/mobile-quality-implementation-2026-09-05/web-metrics-gallery-session.json), development galeride sentetik içerik, 320×568 koyu tema, seçenekler→Back ve medya→Back etkileşimleri sırasında alındı. Dört capability `observing`; `running:false`, `observed:24`, `dropped:0`. İki click kaydının duration değerleri 64ms ve 24ms. İki `history-scroll` örneği `matched`, fark 0px; gözlem süreleri 4.4ms ve 3.3ms. Bunlar ayrı tanımlanmış metriklerdir; aynı etkileşimin pointer/click kayıtları birleştirilerek yeni puan üretilmez.

Bu örneklemde LoAF/long-task kaydı yoktur; bu, tüm iş yükünde uzun kare/iş bulunmadığını kanıtlamaz. `elapsedMs:70519.5` oturum ömrüdür; CUA ve operatör beklemelerini içerir. Fiziksel cihaz, native FPS/ANR, INP, üretim verisi, p95 veya performans kabulü değildir. HMR'den sonra stale `running:true` kalan önceki geçersiz snapshot bu dosyada temiz kayıtla değiştirilmiştir; eski snapshot ölçüm sonucu olarak kullanılmaz. Effect replay düzeltmesi aşağıdaki DOM testinde doğrulanır, gerçek Vite HMR taşımasının ayrıca CUA kontrolü gerekir.

## Doğrulama

```text
node --test --test-isolation=none tests/web-performance-runtime.test.mjs tests/mobile-viewport-runtime.test.mjs
# 11/11: 7 ölçüm + 4 mevcut viewport davranışı.
npx eslint lib/web-performance.ts app/use-web-screen-timing.ts app/web-performance-panel.tsx app/mobile-runtime.tsx tests/web-performance-runtime.test.mjs tests/mobile-viewport-runtime.test.mjs
# exit0. Son panel CSS'i PostCSS ile ayrıştırıldı:12 kural.
npx tsc --noEmit --incremental false
# Son repository TypeScript kontrolü exit0.
```

Gerçek ReactDOM panel/hook, dev/production opt-in kapısı, tarayıcı arayüzünü temsil eden kontrollü observer kayıtları, numeric whitelist, 500 sınırı, unsupported/failed durumları, gizli/pre-opt-in eleme, history/ready/scroll sınırları ve cleanup test edilir. Kontrollü saat/observer örnekleri ürünün ölçülmüş hız sonucu değildir. Eski viewport harness'i, artık JSX döndüren MobileRuntime'u TSX olarak derleyecek şekilde güncellendi; uygulama viewport davranışı değiştirilmedi.
