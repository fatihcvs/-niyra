# F08-03 — Hesaba bağlı dayanıklı gönderi taslağı

Tarih: 2026-09-05. Store, anahtar yaşam döngüsü, `app/use-publish-draft.ts` ve gerçek Home/mobil composer entegrasyonu uygulandı. ReactDOM, IndexedDB ve API sözleşme testleri geçti. Gerçek tarayıcı/Android süreç yeniden açılışı ayrıca doğrulanmalıdır; Node testleri fiziksel diskin veya telefonun dayanıklılık kanıtı değildir.

## Veri sözleşmesi

IndexedDB `kampira-publish-drafts`, DB sürümü 1. `drafts` store anahtarı, sunucunun onayladığı kalıcı `publicId` değeridir; `sessionRevision` kullanılmaz. `meta` store yalnız monoton logout epoch tutar.

Owner başına tek güncel kayıt:

- `owner`, `schemaVersion:1`, `content`, `audience`, `courseId`.
- Orijinal `File`/Blob ile adı, MIME türü ve `lastModified`. HTTP çerezi, token, parola veya oturum nesnesi saklanmaz. Metin en fazla 1200 karakter, tek görsel en fazla 8 MB veya tek video en fazla 20 MB; mevcut API'nin MIME listesi kullanılır. Sunucu dosya doğrulaması ayrıca devam eder.
- `createdAt`, `updatedAt`, `expiresAt`; son gerçek taslak kaydından 24 saat sonra sona erer. Bozuk/süresi geçmiş kendi kayıtları okunurken silinir. Yeni yazma sırasında expiry indeksinden süresi geçmiş anahtarlar, diğer hesapların dosyasını belleğe yüklemeden temizlenir.
- Opsiyonel `immutableAttempt: {key, draft, uncertain:true}`. Yayın hazırlanırken aynı tek dosya referansı ve aynı metin/kitle/ders kilitlenir; ikinci ayrı medya taslağı saklanmaz. Tekrar/engellenen autosave bu kaydın TTL'sini uzatmaz.

Dosya yeniden sıkıştırılmaz, base64'e çevrilmez ve localStorage'a yazılmaz. File metadata'sı ayrıca tutulur; Node `structuredClone(File)` davranışı Blob baytlarını koruyup File alanlarını düşürebildiği için test ortamında ve geri yüklemede ad/tür/tarih aynı bilgilerle yeniden kurulur. Ürün hiçbir gizli oturum bilgisi almaz. Owner onayı istemci okuma sınırıdır; bu depolama için şifreli kasa iddiası yoktur.

TTL süresi dolmuş, tarayıcı tarafından temizlenmiş veya kullanıcı tarafından açıkça silinmiş anahtar için cihazdan otomatik kurtarma garantisi yoktur. 24 saat sınırı, belirsiz yayının sunucuda kaldırıldığı anlamına gelmez. Sunucu tekilleştirme kaydı ayrı sözleşmeye sahiptir.

## Uygulanan Home/composer akışı

`app/page.tsx`, yalnız `profileState=ready` ve sunucudan gelen `publicId` ile `usePublishDraft` bağlar. Store örneği effect içinde kurulur; StrictMode cleanup dispose ettiği örneği tekrar kullanmaz. Owner değişince eski asenkron sonuçlar generation kontrolünde elenir.

- İlk kayıt kontrolü bitmeden alanlar/yayın kapalıdır. Bulunan kayıt için yalnız genel **Geri yükle / Taslağı sil** bildirimi gösterilir; gövde ve dosya adı açık seçimden önce editöre eklenmez. Bu seçim çözülmeden boş editör kaydı ezmez.
- Geri yükleme metin/kitle/ders/File alanlarını taşır. Immutable girişim varsa aynı anahtar yüklenir, alanlar kilitlenir ve **Tekrar dene** aynı içeriği gönderir. Otomatik ağ gönderimi yoktur.
- Düzenleme 400 ms debounce ile kaydedilir. Yalnız tamamlanan kayıt için saklama bilgisi gösterilir; daha yeni metin henüz kaydedilmediyse önceki başarılı durum güncel taslak için kullanılmaz. Kota/izin hatası görünür ve tekrar denenebilir.
- Yayın `prepare` transaction sonucunu bekler. Hata durumunda XHR başlamaz. Ekran gönderilecek normalleştirilmiş metin ve kalıcı File ile eşitlenir; belirsiz sonuçta girişim korunur.
- Başarılı `post.id` sonrası anahtara bağlı clear beklenir, sonra akış ve görünür taslak güncellenir. Yerel clear başarısızsa yayın başarısı korunur; bildirim ve depolama tekrar düğmesi çözülene kadar yeni yayın kapalı kalır.
- Bilinen ilk ret kalıcı girişim kilidini çözer; artık profile ait olmayan ders bağı kaldırılır. Önceden belirsiz girişimde sonraki genel 4xx bu kilidi çözmez. `410 POST_REMOVED` açık kaldırıldı bilgisiyle girişimi sonlandırır ve düzenlemeyi açar.
- 401 görünür taslağı/medya URL'sini, transport ve bellek girişimini temizler; disk korunur. Aynı owner yeniden sunucuda doğrulanınca tekrar açık recovery sunulur. Başarılı açık logout bütün owner kayıtlarını ve bekleyen yazmaları geçersizleştirir.
- `PublishDraftNotice` hem masaüstü hem mobil composer içinde aynı genel recovery ve depolama durumunu gösterir; yayın ilerleme/iptal için mevcut `PublishStatus` kullanılır.

## Store entegrasyon yüzeyi

```ts
const store = createPublishDraftStore({
  onInvalidate: () => { /* Görünür recovery adayını ve eski owner UI bağlamını temizle. */ },
});
store.setOwner({ publicId: serverConfirmedPublicId, confirmed: true });
const loaded = await store.load();
// loaded.status === "loaded" => record: DurablePublishDraft | null
// loaded.discarded? => "expired" | "invalid"
```

`setOwner(null)` veya onaysız owner ile DB açılmaz, load/save/publish hazırlığı `inactive` döner. Owner ancak güncel sunucu yanıtından sonra atanır; önbellek veya URL owner kimliği için yeterli değildir. Store, giriş akışını doğrulayan sunucu rolü üstlenmez.

`load()` kendiliğinden editöre yazmaz ve ağ yayını başlatmaz. Root `loaded` sonucu ve hâlâ aynı owner/generation koşulundan sonra kullanıcıya **Taslağı geri yükle / Sil** seçimini sunar. Restore/discard kararı tamamlanmadan boş Home state'inin autosave edilmesi eski düzenlenebilir taslağı ezebilir; başlangıç autosave bu kararla kapılanmalıdır. Immutable attempt varsa `publishAttempt.resume(record.immutableAttempt)` kullanılır; bu girişim yeniden açıldığında belirsiz/kilitli kabul edilir. Kullanıcı geri yüklemeden metin/File UI'ye otomatik eklenmez.

`createPublishAttempt.snapshot()` alanları kopyalar ve orijinal File'ı korur; `resume(snapshot)` yalnız boş girişim durumuna geçerli anahtarı yükler. Mevcut bir girişimi sessizce değiştirmez.

| Çağrı | Başarılı sonuç | Başka sonuç |
| --- | --- | --- |
| `scheduleSave(draft)` | 400 ms debounce sonrası `saved`, `record` | Eski timer/yazma `stale`; immutable girişim `recovery-required` |
| `saveNow(draft)` | Transaction tamamlandıktan sonra `saved`, `record` | Kota/izin/unsupported/invalid: `unavailable` ve `reason` |
| `preparePublish(attempt)` | `prepared`, kayıtlı `record` ve gönderilecek `attempt` | Farklı kayıtlı anahtar: `recovery-required`; diğer hata durumunda yayın hazır değil |
| `clearCurrent(expectedKey?)` | `cleared` | Beklenen anahtar değişmişse `stale`; başka taslağı silmez |
| `clearOnExplicitLogout()` | Tüm sahipler temizlendiğinde `cleared` | Başarısız temizlik `unavailable`; başarılı temizleme iddiası yok |
| `dispose()` | Timer/transaction/connection/channel iptali | Kalıcı taslakları silmez |

Başka sonuçlar `inactive` veya `stale` olabilir. `unavailable.reason`: `unsupported`, `denied`, `quota`, `blocked`, `invalid`, `storage`. Yalnız `saved`/`prepared` sonucundan sonra “cihaza kaydedildi” bilgisi gösterilir. `recovery-required`, sonradan değiştirilen taslağın kaydedildiği anlamına gelmez; orijinal kilitli kayıt döner.

### Yayın sırası: key commit olmadan network yok

```ts
const attempt = publishAttempt.begin(currentDraft);
const prepared = await store.preparePublish(attempt);
if (prepared.status !== "prepared") {
  // Taslağı koru; ilgili storage/recovery durumunu göster. XHR çağırma.
  return;
}
const response = await sendPublishUpload<Post>(prepared.attempt, { signal, onProgress });
```

Root varsayılanı: kayıt başarısızsa gönderimi blokla. Bu seçim, publish isteği gönderilmeden önce key/File/payload'ın IndexedDB transaction'ında tamamlanmış olmasını sağlar. `put` request success tek başına yeterli değildir; store yalnız transaction `complete` sonrasında `prepared` döner. Katman kendi içinde XHR/fetch veya otomatik retry çağırmaz.

Taze aynı ekran girişiminde `preparePublish` sonrası tekrar `resume` yapmak gerekmez; bellek attempt durumu mevcut `begin/failed/complete` akışını korur. Diske yazılan kayıt, süreç kesilirse önceki gönderim sonucu bilinmeyeceği için `uncertain:true` tutar. Aynı anahtar zaten varsa `prepared.attempt` eski kayıtlı payload'dır; transport bu dönen nesneyi kullanmalıdır.

Gerçek başarılı `post.id` yanıtından sonra `clearCurrent(attempt.key)` beklenir; ardından görünür taslak ve bellek girişimi temizlenir. Önce UI'yi boşaltıp autosave tetiklemek, devam eden clear işlemini supersede edebilir. Temizleme hatası, sunucunun doğrulanmış yayın başarısını geri almaz: post id ile akışı uzlaştır, yerel kayıt uyarısını ayrı göster; otomatik ikinci yayın üretme.

İlk girişimin bilinen 4xx reddinde `publishAttempt.failed(status)` false dönerse, root aynı anahtara ait kalıcı kilidi `clearCurrent(key)` ile kaldırıp düzenlenebilir taslağı yeniden kaydedebilir. Daha önce belirsiz olmuş girişimde sonraki auth/kota reddi kilidi kaldırmaz. Doğrulanmış `POST_REMOVED` terminal cevabı sonsuz retry yerine açık kaldırıldı durumu gerektirir.

## Oturum ve yarış sınırları

- **401 / süre sonu:** görünür özel state ve transport generation temizlenir; store owner NULL yapılır. Disk silinmez. Aynı publicId sunucuda tekrar onaylanınca root açık kullanıcı eylemiyle recovery sunabilir. Başka owner'ın kaydı döndürülmez.
- **Açık çıkış yapma:** `clearOnExplicitLogout()` çağrılır; modüldeki tüm store owner bağlamları hemen geçersiz olur, debounce'lar iptal edilir, açık işlemler abort edilir. Disk clear ve epoch artışı aynı transaction'dadır. Açılmayı bekleyen yazmalar generation kontrolünde kalır; clear sürerken yeni doğrulanmış oturumun yazması clear sonucunu bekler.
- **Çapraz sekme:** BroadcastChannel logout mesajı visible-owner invalidation callback'ini tetikler. Daha önce epoch gözlemlemiş ayrı bir context, mesaj gelmese bile eski epoch ile yazamaz. Eski sunucu kimliğini yeni bir onaymış gibi tekrar `setOwner` ile kurmak güvenilir değildir; root oturum doğrulamasını korumalıdır.
- **Temizlik reddi:** owner belleği yine temizlenir, `cleared` dönmez. Aynı çalışma bağlamında sonraki DB erişimi başarılı clear tekrarına kadar bloklanır. Tarayıcı kalıcı depolamayı reddederken diskteki eski verinin silindiği iddia edilemez; bu sonuç UI'de dürüstçe gösterilmelidir.
- **Unmount / hızlı değişim:** store generation ve revision kontrolleri eski load sonucunu `stale` yapar; yeni autosave önceki timer ve bekleyen yazmayı iptal eder. `dispose` disk kaydını korur. Root render/update için kendi owner/generation kontrolünü de sürdürür.
- **React StrictMode:** store oluşturma ve dispose eşleşmesini effect yaşam döngüsünde kur. Dispose edilmiş örneği sonraki effect kurulumu için tekrar kullanma; yeni örnek yarat. Kalıcı `publicId` kayıt anahtarı değişmez.

## Test ve kanıt sınırı

Test aracı yalnız `scripts/mobile-quality` içinde pinned dev dependency: `fake-indexeddb@6.2.5`; uygulama package/runtime bağımlılığı değişmedi. Sürüm ve integrity npm registry üzerinden doğrulandı; kurulum `--ignore-scripts`, araç paketi audit sonucu 0 açık. Paket resmi açıklamasına göre Node için IndexedDB API'sinin bellek uygulamasıdır ve diske kalıcılık sağlamaz. [Resmi fake-indexeddb deposu](https://github.com/dumbmatter/fakeIndexedDB), kontrol tarihi 2026-09-05.

`tests/publish-draft-store.test.mjs`, gerçek `IDBFactory`/objectStore/index/transaction davranışını kullanır. Basit Map mock'u değildir. İnce hata enjeksiyonu yalnız kota/izin ve put-success/commit arasındaki logout yarışını tetikler; rollback, transaction sırası ve structured clone fake-indexeddb tarafından yürütülür. `oncomplete`/abort sınırı [Indexed Database API 3.0](https://w3c.github.io/IndexedDB/) transaction modeline dayanır.

Kapsam: owner onayından önce sıfır DB açma; yeni store örneğinde File bayt/ad/tür/tarih ve key kurtarma; owner izolasyonu ve eski load; 401 sonrası aynı owner; debounce; immutable girişim kilidi; commit bekleme; bütün owner'larda logout clear; put-success sonrası abort; bağımsız modülde epoch; bozuk/expired kayıt; boyut sınırı; quota/denied/unsupported; DB açılırken logout; clear sürerken yeni oturum; başarısız clear'ın doğru raporu.

```text
node --test --test-isolation=none tests/publish-draft-store.test.mjs tests/publish-attempt.test.mjs tests/publish-upload.test.mjs tests/post-idempotency.test.mjs
# 42/42: 13 IndexedDB + 4 attempt + 9 XHR + 16 sunucu testi.
npx eslint lib/publish-draft-store.ts lib/publish-attempt.ts tests/publish-draft-store.test.mjs tests/publish-attempt.test.mjs
npx tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution bundler --lib esnext,dom,dom.iterable lib/publish-draft-store.ts lib/publish-attempt.ts lib/publish-upload.ts cloudflare-env.d.ts
# Hedef lint ve strict TypeScript geçti.
```

Bekleyen gerçek ortam kabulü: tarayıcıda kullanıcı kontrollü geri yükleme ve depolama izin/kota hatası, sayfa/uygulama kapatıp File ile açılış, çok sekmeli gerçek oturum değişimi, Android uygulama süreci ve düşük depolama. Tarayıcı depolamayı silebilir; bu helper yedekleme veya sınırsız saklama garantisi değildir.

## ReactDOM entegrasyon kanıtı

`tests/publish-draft-runtime.test.mjs`, gerçek `usePublishDraft`, `MobilePostComposer`, `PublishDraftNotice` ve AST ile alınan gerçek Home `publishPost` handler'ını çalıştırır. API yanıtları kontrollüdür; IndexedDB işlemleri gerçek fake-indexeddb transaction ve structured clone uygulamasında yürür. Altı senaryo: StrictMode/File/explicit restore ve ağdan önce key commit; kota durumunda sıfır upload; 401/owner izolasyonu/same-owner recovery/logout; terminal 410; unmount/geç yanıt; belirsiz sonuçta normalleştirilmiş payload ve aynı key retry.

```text
node --test --test-isolation=none tests/publish-draft-runtime.test.mjs tests/profile-editor-runtime.test.mjs tests/publish-draft-store.test.mjs tests/publish-attempt.test.mjs tests/publish-upload.test.mjs tests/post-idempotency.test.mjs
# 51/51: 6 gerçek composer/handler + 3 mevcut profil + 13 store + 4 attempt + 9 XHR + 16 SQLite API.
npx eslint app/use-publish-draft.ts app/publish-draft-notice.tsx app/mobile-app.tsx app/page.tsx tests/publish-draft-runtime.test.mjs
# Geçti; React act uyarısı yok.
npx tsc --noEmit --incremental false
# Repo TypeScript kontrolü geçti.
```

ReactDOM/Node kanıtı gerçek browser disk, çok sekmeli oturum veya Android süreç öldürme ölçümü değildir. Bu kabul kapıları açık kalır.
