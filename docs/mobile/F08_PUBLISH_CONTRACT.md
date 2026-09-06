# F08 — Gönderi yayınlama ve güvenli yeniden deneme

Durum: 5 Eylül 2026, yerel sunucu uygulaması ve SQLite testleri tamamlandı. Canlı sisteme migration uygulanmadı, gerçek gönderi yayınlanmadı. İstemci entegrasyonu ve gerçek ağ/cihaz doğrulaması ayrı kabul adımlarıdır.

## HTTP sözleşmesi

`POST /api/posts`, JSON veya mevcut tek dosyalı multipart gövdeyi kabul etmeye devam eder. Oturum, aynı kaynak denetimi, profil/ders yetkisi ve medya doğrulaması korunur. Yeni `Idempotency-Key` başlığı isteğe bağlıdır; biçimi 8–128 karakter `[A-Za-z0-9._:-]` olmalıdır. Önerilen istemci değeri `crypto.randomUUID()` sonucudur. Anahtar, oturumdaki kullanıcı ile birlikte değerlendirilir; başka kullanıcının aynı anahtarı bağımsızdır.

| Durum | HTTP ve sonuç | İstemci davranışı |
|---|---|---|
| İlk başarılı yayın | `201`, mevcut `{ post }`, `Idempotency-Replayed: false` | Taslağı/anahtarı başarıdan sonra temizle; post id ile akışı tekilleştir. |
| Aynı anahtar, aynı içerik; yayın zaten tamamlanmış | `201`, ilk başarılı yayının aynı `{ post }` gövdesi, `Idempotency-Replayed: true` | Yeni gönderi ekleme; mevcut post id ile uzlaştır. |
| Aynı anahtar, farklı içerik | `409`, `code: IDEMPOTENCY_CONFLICT` ve Türkçe açıklama | Önce önceki girişimin sonucunu çöz; değiştirilmiş taslak için yeni anahtar kullan. |
| Başlık biçimi geçersiz | `400`, `code: INVALID_IDEMPOTENCY_KEY` | İstemci anahtar üretimini düzelt. |
| Bu anahtarın tamamlanan gönderisi sonradan kaldırılmış | `410`, `code: POST_REMOVED` | Silinen gönderiyi yeniden oluşturma. |
| Yükleme/DB hatası veya sonucu belirlenemeyen ağ durumu | Mevcut `503` hata cevabı; yanıtın tamamen kaybolması da mümkün | Aynı anahtar ve aynı dosya/içerikle, kullanıcı kontrollü veya sınırlı geri çekilmeli yeniden dene. Yeni anahtar oluşturma. |
| Henüz tamamlanmayan eşzamanlı aynı istek | Aynı sabit post id için ayrı girişim; tek transaction kazanır | İki başarılı cevap aynı gönderiyi temsil eder. Kalıcı kilit/TTL beklemesi yoktur. |
| Anahtarsız eski istemci | Eski bağımsız oluşturma davranışı; her çağrı farklı post id | Anahtarsız istemciler için ağ tekrarında tekilleştirme garantisi yoktur. |

Başarılı cevaplar `Cache-Control: private, no-store` taşır. Tamamlanan yeniden deneme yeni yayın kotası tüketmez. Başarısız veya eşzamanlı yeni iş girişimleri mevcut kotaya tabidir; normal `429`/`Retry-After` davranışı korunur. Gövdenin `time`, sayaçlar ve profil alanları ilk başarılı yanıtın anlık görüntüsüdür; tekrar cevabı güncel akış okumasının yerine geçmez.

## İçerik kimliği ve kalıcılık

Sunucu, normalize edilmiş metin, kitle, ders kimliği ve doğrulanmış dosyanın türü, MIME bilgisi, saklanan dosya adı, uzunluğu ve baytlarının SHA-256 değeri üzerinden sürümlü bir hash üretir. Multipart sınırları ve metnin dış boşlukları kimliği değiştirmez. Dosyanın adı veya baytları değişirse aynı anahtar çakışma verir. İstemciden gelen hash değerine güvenilmez.

`drizzle/0022_post_idempotency.sql` iki tablo ekler:

- `post_publish_requests`: kullanıcı/anahtar benzersizliği, içerik hash'i, sabit post id ve tamamlanan yanıt. Anahtarsız çağrılar `NULL` anahtarla bağımsız kayıt alır.
- `post_publish_attempts`: her çalışma girişiminin farklı dosya yolu ve `pending`, `committed`, `cleanup`, `cleaned` durumu. Dosya yüklenmeden önce bu kayıt yazılır.

Anahtar için otomatik süre dolumu uygulanmaz. Aynı anahtarın kaydı tutulduğu sürece yeniden yayın tekilleştirilir; basit TTL temizliği bu garantiyi bozacağından eklenmemiştir. Kullanıcı hesabı silindiğinde bu kullanıcıya bağlı kayıtlar FK ile silinir. Hesap silme ve saklama politikası, nesne depolama temizliğiyle birlikte F13/F14 kapsamında ayrıca doğrulanmalıdır; burada otomatik saklama/üretim görevi başlatılmadı.

Bu tablolar çalışma zamanı raw D1 sorgularıyla kullanılır; genel Drizzle şema dosyası değiştirilmedi. Uygulamadan önce migration gerekli. Mevcut Railway başlangıcı SQL migration dosyalarını Wrangler ile uygular; yeni ortamda bu adımın başarısı ayrıca doğrulanmalıdır.

## Yayın ve dosya temizliği garantisi

Dosya her girişimde farklı bir nesne yoluna yüklenir. Gönderi, medya metadata'sı, audit ve tamamlanan yanıt **aynı D1 batch transaction** içinde yazılır. Aynı sabit post id için ikinci transaction birincil anahtar çatışmasıyla bütünüyle geri alınır; ardından kazanan cevap okunur. D1'in batch transaction/rollback davranışı [resmî Worker API belgesinde](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) tanımlanır. R2 yüklemesi DB transaction'ının parçası değildir; [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#bucket-method-definitions) ayrı nesne işlemleri sunar.

Başarısız girişimi temizlemeden önce DB durum geçişi işlem sınırı oluşturur: `pending → cleanup` kazanırsa geç gelen yayın transaction'ı artık bu girişimden gönderi/medya/audit oluşturamaz. Yayın transaction'ı önce kazanmışsa durum `committed` kalır ve dosya silinmez. Bu, yalnızca “batch çağrısı hata verdi, dosyayı sil” davranışındaki veri kaybını önler.

Temizlik yalnızca oturum sahibinin belirtilen yayın kaydındaki, çalışması bitmiş `cleanup` girişimlerini ele alır. Her dosya silmeden önce `post_media` referansı ayrıca kontrol edilir. Referanslı dosya, başka kullanıcının dosyası veya `pending` durumundaki belirsiz yükleme silinmez. Nesne silme veya onayı başarısızsa kayıt korunur; aynı yayına sonraki çağrı, tamamlanmış cevap tekrarı dahil, en fazla 10 temizliği yeniden dener.

**Açık operasyon sınırı:** süreç yüklemeden sonra tamamen kapanırsa girişim `pending` kalabilir. İleride gelen yayın aynı post id ile tamamlanabilir; fakat belirsiz eski yükleme otomatik silinmez. Kaydın ve nesnenin operasyonel uzlaştırılması gerekir. Canlı otomatik orphan temizleme işi bu değişikliğin kapsamında çalıştırılmadı. Yayın tekilleştirmesi tamamlandı; tüm terk edilmiş nesnelerin zaman içinde temizlendiği iddia edilmiyor.

## Yerel kanıt ve kalan kabul

`tests/post-idempotency.test.mjs` gerçek route ve yardımcı modülü transpile ederek, tüm gerçek SQL migration'ları uygulanmış `node:sqlite` bellek veritabanında çalıştırır. D1 adaptörü batch işlemlerini gerçek `BEGIN/COMMIT/ROLLBACK` ile yürütür. Auth/rate-limit sınırı ve nesne depolama kontrollü test ikizleridir; hata ve eşzamanlılık bu sınırda enjekte edilir. Bu, canlı Cloudflare/Railway veya telefon testi değildir.

15 yeni davranış testi: kayıp HTTP yanıtı, normalize içerik, kullanıcıya bağlı anahtar, içerik/kitle/ders ve dosya çakışmaları, eşzamanlı aynı/farklı gövde, kayıp commit onayı, geçici DB kesintisi, cleanup sonrası geç yürüyen transaction, dosya yükleme hatası, transaction rollback, silinemeyen nesnenin yeniden temizlenmesi, yetkisiz/referanslı dosyanın korunması, belirsiz pending kaydının korunması, silinmiş gönderi ve anahtarsız istemci uyumu.

Doğrulanan komutlar:

```text
node --test --test-isolation=none tests/post-idempotency.test.mjs tests/post-media-access.test.mjs tests/post-media.test.mjs tests/migrations.test.mjs
# 28/28 geçti; 15 yeni test + 13 mevcut regression testi.
npx eslint lib/post-idempotency.ts app/api/posts/route.ts tests/post-idempotency.test.mjs tests/post-media-access.test.mjs tests/migrations.test.mjs
# Geçti.
npx tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution bundler --lib esnext,dom,dom.iterable lib/post-idempotency.ts cloudflare-env.d.ts
# Yardımcı modülün odaklı tür kontrolü geçti.
```

Kalan kabul: istemci anahtar yaşam döngüsü; tarayıcıda yanıt kaybı/çevrimdışı/yeniden açılma; deployed migration ve gerçek R2/D1 hata sınırları; fiziksel Android cihazında dosya seçimi, klavye ve geri davranışı. Bu adımlar tamamlanmadan yayın/cihaz kalitesi kapısı kapanmış sayılmaz.

## F08-04 — İlerleme, iptal ve zaman aşımı taşıması

`lib/publish-upload.ts` tek bir yayın girişimini XHR ile gönderir. `app/page.tsx` ve mobil composer bu helper'ı ilerleme/iptal ve yayın öncesi kalıcı taslak hazırlığıyla kullanır; bu bölüm taşıma sözleşmesidir. Home/ReactDOM doğrulaması [F08_DURABLE_DRAFTS.md](./F08_DURABLE_DRAFTS.md) içindedir.

```ts
sendPublishUpload<Post>(
  attempt: { key: string; draft: PublishDraft },
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: PublishUploadProgress) => void;
    createXHR?: () => PublishUploadXHR; // Enjekte edilebilir test sınırı.
  },
): Promise<{
  status: number;
  ok: boolean;
  data: { post?: Post; error?: string; code?: string } | null;
  replayed: boolean;
}>
```

Yardımcı anahtar üretmez ve otomatik tekrar yapmaz. `createPublishAttempt().begin(...)` sonucundaki mevcut anahtar ve taslak verilir. Sabit hedef `POST /api/posts`; medyasız gövde JSON, dosyalı gövde FormData'dır. Dosya adı/türü/baytları değiştirilmez, multipart boundary tarayıcıya bırakılır. JSON için 20 saniye, medya için 30 saniye **tüm isteğin** zaman aşımı uygulanır; upload bitince bu süre sıfırlanmaz. Bunlar ürünün istek sınırlarıdır; yavaş ağda 20 MB yüklemenin 30 saniyede tamamlanacağı iddiası değildir.

XHR `withCredentials=false` kullanır: aynı origin çerezleri gönderilir, çapraz origin credential açılmaz. Standart bu durumu `same-origin` credentials mode olarak tanımlar. `timeout`, belirtilen süre içinde tamamlanmamış isteği sonlandırır; upload olayları ile HTTP yanıtı farklı aşamalardır. [WHATWG XMLHttpRequest Standard](https://xhr.spec.whatwg.org/), kaynak kontrolü 2026-09-05.

İlerleme verisi `{ phase: "uploading" | "processing", loaded, total, percent }` biçimindedir. `loaded` gerçek request-body byte sayısıdır; FormData sınırları ve metin alanları da dahil olabilir, yalnız dosya büyüklüğü değildir. Tarayıcı toplamı bildirmezse `total` ve `percent` NULL kalır; tahmini yüzde üretilmez. Upload `load` olayı `processing` aşamasına geçer. `%100` veya `processing` gönderinin DB'ye kaydedildiğini kanıtlamaz; yalnız başarılı HTTP ve doğrulanmış `data.post` taslağı temizlemeye izin verir.

HTTP 401/409/410/429/503 dahil gerçek cevaplar `status` korunarak resolve edilir; JSON çözülemezse `data=null` olur. Çağıran kod önce status'u saklamalı, sonra JSON ve post varlığını doğrulamalıdır. Bozuk 2xx cevap bir başarıya dönüştürülmez. Ağ/abort/timeout/setup hataları `PublishUploadError` ile reject edilir; `kind` sırasıyla `network`, `aborted`, `timeout` veya `setup`, `uncertain=true` olur. Sonuç belirsizken yeniden deneme aynı girişimi kullanır.

### Pending yaşam döngüsü

- Her taşıma için yeni bir `AbortController`; aynı anda ikinci taşımanın başlamasını mevcut busy koruması engeller. Aynı girişimin tekrarında yeni controller, aynı key ve orijinal dosya/metin kullanılır.
- Kullanıcı **yüklemeyi durdurduğunda** controller abort edilir; catch yine çalışıp sonucu belirsiz olarak kaydeder. Burada generation artırıp catch'i atlamak, taslağı temizlemek veya anahtarı sıfırlamak doğru değildir. İptal sunucu rollback/deletion komutu değildir.
- Bileşen unmount veya hesap değişiminde önce generation/kimlik bağlamı geçersizleştirilir, ardından controller abort edilir. Eski catch/finally/progress/success yeni hesabın ekranını güncelleyemez. Yardımcı kendi XHR/upload/signal listener'larını her sonuçta kaldırır; React generation ve hesap kontrolü çağıranın sorumluluğudur.
- Aynı hesabın geri döneceği ekran unmount'unda belirsiz girişim, bu kısa ömürlü bileşenin dışında hesapla ilişkili tutulmalıdır. Başka hesap altında eski key/dosya otomatik gönderilmez. Yardımcı depolama/oturum saklama yapmaz; uygulama süreci kapanırsa File ve key'nin geri kazanıldığı bu testlerle kanıtlanmaz. Bu F08-03 kabulüdür.
- Arka plana geçişte başarı varsayılmaz. İstek tamamlanmazsa timeout/abort sonucu aynı key ile uzlaştırılır; uygulama görünür olunca otomatik yayın yapılmaz. Eski object URL yalnız kullanımdan kalktığında temizlenir; durdurma düğmesi tek başına dosyayı/taslağı kaldırmaz.
- Önceki isteğin sonucu belirsizse, sonraki denemenin auth veya kota reddi önceki commit'i çürütmez. Anahtar belirsizlik çözülmeden değiştirilmemelidir. Başarılı ve gerçek `post.id` cevabı ile akış aynı id üzerinden tekilleştirilir.
- `createPublishAttempt.failed(status)` önceki belirsizliği sonraki 4xx cevaplarda da korur; ilk girişimin bilinen 4xx reddi ise düzeltilebilir yeni taslağa izin verir. `complete()` veya açık hesap bağlamı `reset()` dışında önceki belirsiz anahtar düşürülmez. Yalnız status'a bakan helper, terminal `POST_REMOVED` gibi sunucu kodlarını yorumlamaz; çağıran bu cevabı doğrularsa kaldırılmış gönderiyi yeniden oluşturmak yerine açık terminal durum göstermelidir.
- **F08-03 ayrı depolama katmanı:** taşıma helper'ı key/File saklamaz. Yeni `lib/publish-draft-store.ts`, 24 saatlik owner temelli IndexedDB taslağı ve yayın öncesi immutable key/payload transaction'ı sağlar; ayrıntı [F08_DURABLE_DRAFTS.md](./F08_DURABLE_DRAFTS.md). `expireSession` görünür belleği/owner bağlamını temizler; açık logout diski ayrıca temizler. Home entegrasyonu ReactDOM üzerinden doğrulandı; gerçek süreç yeniden açılışı kabulü ayrıca gereklidir; çerez/token güvenliği gevşetilmez.

### Taşıma test kanıtı

`tests/publish-upload.test.mjs` dokuz davranış testi gerçek helper'ı enjekte edilen XHR olay yüzeyiyle çalıştırır; `fetch` kullanılmaz ve ağ isteği gönderilmez. JSON/FormData ve File kimliği, stable header, same-origin ayarı, 20/30 saniye sınırı, bilinmeyen toplam, yüzde 100 sonrası onay bekleme, HTTP hata/bozuk JSON, native timeout, dış abort, gecikmiş callback, listener cleanup, iptalden sonra aynı payload/key ile replay ve setup hataları doğrulanır. Test sahte bir zamanlayıcıyla 30 saniye bekleyerek gerçek tarayıcı timeout davranışı ölçmüş sayılmaz; browser property/event sözleşmesini doğrular.

```text
node --test --test-isolation=none tests/publish-upload.test.mjs tests/publish-attempt.test.mjs tests/post-idempotency.test.mjs
# Güncel 29 test: 9 taşıma + 4 anahtar yaşam döngüsü + 16 sunucu testi.
# Genişletilmiş 51/51 çalıştırma F08_DURABLE_DRAFTS.md içinde.
npx eslint lib/publish-upload.ts lib/publish-attempt.ts tests/publish-upload.test.mjs tests/publish-attempt.test.mjs
npx tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution bundler --lib esnext,dom,dom.iterable lib/publish-upload.ts lib/publish-attempt.ts
# Hedef lint ve TypeScript geçti.
```

Kalan kabul: entegre composer üzerinden gerçek tarayıcıda yavaş ağ/iptal/401/timeout ve arka plan-geri dönüş; hesap değişimi ve unmount sırasında eski cevabın UI'ye yazılmaması; süreç yeniden açılışı; gerçek Android cihazı. XHR test ikizi tarayıcı veya fiziksel cihaz kanıtı değildir.
