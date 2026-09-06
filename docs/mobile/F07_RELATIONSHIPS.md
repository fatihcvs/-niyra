# F07-04 — Profil takip listeleri ve sunucu tutarlılığı

Tarih: 2026-09-05. Bu teslim çalışan web uygulamasının gerçek API ve bileşen akışıdır. Üretim verisi yazılmadı; mağaza, native cihaz veya gerçek hesaplarla tarayıcı kabulü bu testlerin sonucu değildir.

## Uygulanan davranış

- `app/profile-relationships.tsx` içindeki `ProfileRelationshipStats`, mevcut profil kahramanının dört istatistiğini korur. Takipçi ve takip edilen sayıları gerçek listeyi açar. Altı içerik sekmesi ve `ProfileContent` değişmedi.
- Mobil pencere güvenli ekran kenarlarını ve `--app-viewport-height` değerini kullanır; masaüstünde sınırlı genişlikte bir diyalogdur. Liste satırları gerçek `AppLink` profil bağlantıları, kendini tanıyan satır ve sunucuya bağlı takip düğmeleri içerir. Dokunma hedefleri en az 48 px yüksekliğindedir.
- `useAppLayer` tek bir history girişi, Back/Forward, Escape, odak sınırı ve arka plan izolasyonu sağlar. Sekmeler ok tuşları/Home/End ile değişir. Takibi bırakınca odaktaki satır kaldırılırsa odak liste içinde kalır.
- Sekme, arama, yüklenen satırlar, cursor ve liste kaydırması mevcut `useWorkspaceState` oturum belleğinde tutulur. Profil gezintisi sonrası remount, aynı history katmanını yeni bir Back adımı eklemeden sahiplenir. History içinde özel liste içeriği veya arama yoktur; localStorage/sessionStorage kullanılmaz.
- Bellek, mevcut ortak mağazanın 64 kayıt/15 dakika sınırına ve root owner kapsamına tabidir. Her ilişki sekmesinde en fazla 200 yüklenmiş satır yeniden ziyaret için saklanır. Daha uzun açık listeler kullanılabilir; yeniden ziyarette satırları atlayacak bir cursor saklanmaz, ilk sayfa yeniden alınır. Hesap değişiminde ortak owner temizliği gerekir ve root bunu zaten uygular.
- Sorgu, hedef, owner, kapatma ve sayfalama geçişleri eski yanıtları iptal eder. Ortak `useScopedRequests`, fetch ve yanıt gövdesi için 20 saniye sınırı ve oturum süresi dolması davranışını sağlar. Ağ hatası mevcut satır/cursor'u korur; hedefe erişim kapandığında iki sekmenin satırları temizlenir.
- `invalidateProfileRelationships()` yalnız ilişki snapshot'larının sürümünü değiştirir. Root bunu sunucunun doğruladığı takip/güvenlik callback'lerinde çağırır. Dış değişiklik açık ve saklanmış listeleri geçersizleştirir. Liste içindeki kendi başarılı takip işlemi zaten uyguladığı satır sonucunu korur; aynı karede gelen root invalidation'ı katmanı veya sayfalamasını sıfırlamaz.
- Dışarıdaki profil takip düğmesinin değiştirdiği authoritative sayı, ilgili ilişki listesini yeniletir. Liste içi işlemler same-frame ref kilidiyle çift gönderimi engeller. Başarılı response öncesinde takip durumu veya sayı uydurulmaz.

## Home entegrasyonu

Root, `app/page.tsx` içindeki kendi profil ve herkese açık profil kahramanlarına `ProfileRelationshipStats` ekledi. `AppNavigationProvider.onFollowChanged`, gerçek `handleFollowChange` işleyicisine bağlıdır. İşleyici hedefin `people` ve açık `publicProfile` durumlarını sunucunun `active`/`followerCount` değerleriyle; kendi profilinin toplamını `viewerFollowingCount` ile eşitler. Başarılı takip ve engelleme işleyicileri ilişki snapshot'larını geçersizleştirir.

Home takip düğmesi de `useScopedRequests` kullanır: owner kapsamı profil kimliği ve session revision'dır; session expiry root akışına bağlıdır. Hedef düğmesi kısa süreli iyimser durum gösterebilir; kendi takip toplamı sunucu yanıtını bekler. Same-frame kilidi yinelenen gönderimi önler; hata hedefin önceki durumunu geri getirir. Önceki oturumun gecikmiş gövdesi yeni hesabın sayacını veya bekleyen düğmesini değiştiremez.

## API sözleşmesi

Yeni `GET /api/profile-relationships?id=<publicId>&kind=followers|following&q=<query>&cursor=<cursor>` oturum gerektirir. Başarılı sonuç:

```ts
{
  targetId, kind, query, viewerId,
  people: [{ publicId, displayName, handle, avatarUrl,
             universityShortName, isFollowing, isSelf }],
  nextCursor: string | null
}
```

Sayfa boyutu 40'tır. Gerçek `created_at DESC, public_id DESC` sırası için devam bilgisi hedef, sekme ve sorguya bağlıdır. Aynı zaman damgalı ilişkiler atlanmaz. Yanıt `private, no-store` başlığı kullanır; e-posta, özel biyografi veya gizli profil sayısı içermez.

Hem hedef hem satırlar `/api/people` görünürlüğüyle aynı temel koşullardan geçer: aktif/tamamlanmış profil, iki yönlü engel yok, aynı kampüs veya görünür platform gönderisi. Kapalı, engellenmiş, pasif ve bulunamayan hedef 404 ile yalnız genel hata döndürür. Her satır ayrıca ayrı süzülür. Bu nedenle görünür satır sayısı, mevcut profil kahramanındaki tüm takip grafiği sayısından az olabilir; listede bu sınır açıklanır.

`POST /api/follows` isteğine isteğe bağlı `active: boolean` eklendi. Atlanırsa mevcut ardışık toggle davranışı korunur. Aynı `active` ile tekrar gönderme ilişkiyi tersine çevirmez. `INSERT ... ON CONFLICT DO NOTHING` ve `RETURNING`, yalnız gerçek ekleme/silme için audit/bildirim üretir. Yanıt artık:

```ts
{ targetId, active, followerCount, viewerFollowingCount }
```

Malformed/null/array/nonboolean payload mutasyondan önce reddedilir; origin, aktif/tamamlanmış actor, engel ve mevcut rate limit kontrolleri korunur. Önceden açıkça test edilmiş doğrudan kampüsler arası takip izni daraltılmadı. Bu eski yazma izni, görünür olmayan hedefin ilişki listesini açma izni vermez. Migration veya backend veri dönüşümü gerekmedi.

## Galeri sınırı

`preview={{ mode: "gallery", state: "full" | "empty" }}` yalnız açık galeri entegrasyonu içindir. Aynı liste ve kontroller, açıkça **Galeri simülasyonu** olarak etiketlenen üç sentetik satırla (kendisi dahil) veya boş durumla çalışır. Bu kip fetch, gerçek follow callback'i, profil navigasyonu ve clipboard işlemi yapmaz. Gerçek veri/oturum kabulü sayılmaz. Root tasarım galerisinin mevcut erişim kapısı bu explicit prop'u sağlar.

## Doğrulama

Son hedefli komut:

```powershell
node --test tests/profile-relationships-runtime.test.mjs tests/profile-relationships-api.test.mjs tests/app-layer-runtime.test.mjs tests/profile-content-state.test.mjs
```

Sonuç **36/36 geçti**: yeni teslimde 5 gerçek SQLite API testi ve 12 gerçek ReactDOM davranış testi; mevcut katman/profil regresyonları da geçti. Yeni dosyalar dosya düzeyinde `beforeEach/afterEach` eklemez.

API testleri her testte `:memory:` SQLite açıp mevcut SQL migration'larını uygular. Gerçek route kodu, Drizzle, rate-limit/audit/bildirim yazımı çalışır; yalnız runtime/auth bağımlılığı sentetik `@example.invalid` aktörüne yönlendirilir. 85 aynı tarihli ilişkiyle 40/40/5 sayfalama, Türkçe/literal wildcard arama, gizlilik/engel/aktiflik, desired retry/concurrent insert, authoritative sayaçlar, eski toggle ve payload/origin sınırları doğrulandı. Var olan yerel veya uzak veritabanına dokunulmadı.

DOM testleri iki sayfa Back/Forward, mevcut history girişiyle remount, sorgu/scroll, sekme sırasında pagination abort, cache sınırında ilk sayfaya güvenli dönüş, dış sayaç/güvenlik invalidation, geç query/owner/body yanıtı, 401 gövdesini okumadan expiry, yanıtsız gövde timeout/retry, same-frame çift tıklama, own-following satır kaldırma/odak ve galeri sıfır ağ/sıfır gerçek callback senaryolarını kapsar.

Scoped ESLint (iki API, bileşen, helper, iki test) çıkış 0. Dört yeni/değişen TypeScript entrypoint, gerçek bağımlılıkları, projenin ambient declaration'ları ve Vite CSS türleriyle TypeScript `noEmit` kontrolü çıkış 0. CSS PostCSS parse ve ilgili dosyalarda `git diff --check` temiz.

Root'un ayrı Home entegrasyon kontrolü: `node --test tests/follow-handler-runtime.test.mjs` **3/3 geçti**. Test harness'i `app/page.tsx` içinden gerçek follow state, cleanup ve işleyici gövdelerini okuyup gerçek ReactDOM ve `useScopedRequests` ile çalıştırır. Same-frame kilit + üç yerde authoritative sayaç eşitleme, başarısız iyimser işlemin geri alınması ve session revision değişiminden sonraki gecikmiş gövdeyi reddetme doğrulandı. Bu ayrı sonuç, yukarıdaki 36 testin yerine veya genel site suite'inin nihai toplamı olarak kullanılmaz. Bu belge güncellemesinde genel suite için yeni sonuç bildirilmedi; root, course-hub runtime sırasında duran koşuyu ayrıca inceliyor.

## Seçilmiş tarayıcı kanıtı — 320 px açık tema

Root'un 2026-09-05 tarihli CUA oturumu, geliştirme galerisinde aynı `ProfileRelationshipStats` bileşenini **320 × 568** görünümde açtı. [Ölçüm kaydı](../../exports/mobile-quality-continuation-2026-09-05/profile-relationships-320-light.json) ve [ekran görüntüsü](../../exports/mobile-quality-continuation-2026-09-05/profile-relationships-320-light.png) incelendi.

- Diyalog sınırları `(0, 0)–(320, 568)`; `scrollWidth: 320`, tema `light` ve diyalog `inert: false`. Bu seçilmiş durumda yatay taşma görünmedi.
- Kapatma düğmesi **48 × 48**, iki sekme **144 × 48**, Ece'nin takip düğmesi **88 × 48** olarak ölçüldü.
- Root, gerçek tarayıcı Back ile kapatma ve Forward ile geri açma akışında **Ece** aramasının korunduğunu doğruladı. Kaydedilen son durum JSON'da `query: "Ece"` değerini ve ekran görüntüsünde filtrelenmiş tek Ece satırını gösterir; JSON tek başına ara history adımlarının kaydı değildir.
- Görüntüde hem başlıkta hem satırda **Galeri simülasyonu** etiketi vardır. Bu seçilmiş kanıt bileşenin tarayıcı yerleşimi ve history davranışı içindir; gerçek hesap, canlı ilişki API'si, Android klavye/inset veya fiziksel cihaz kabulü değildir. Koyu tema/geniş ekran sonucu bu tek kayıttan çıkarılmaz.

## Açık kabul sınırları

- İki profil kahramanı ve AppNavigation callback entegrasyonu kodda tamamlandı; root'un seçilmiş 320 px açık tema galeri kanıtı yukarıda kaydedildi. Diğer görünüm ve gerçek oturum/cihaz kabulü ayrı kalır.
- Uzak başka hesabın sonradan yaptığı takip/engel değişikliği için push aboneliği yoktur. Erişim her yeni GET ve mutasyonda yeniden doğrulanır; root'un yerel doğrulanmış güvenlik işlemleri cache'i anında geçersizleştirir.
- Liste görünürlüğü mevcut `/api/people` sözleşmesini izler; ürünün ayrı bir özel hesap/istek-onay sistemi bu teslimde eklenmedi.
- Profil avatarının yükleme hatası için yeni bir medya sistemi eklenmedi. Mevcut korumalı avatar URL'si gerçek Image/native loader üzerinden kullanılır.
- Tam build, birleşik site suite'i, staging/production mutation, deploy, Android veya native cihaz çalıştırması bu alt görevde yapılmadı.

## Home entegrasyonu ve seçili galeri kontrolü

Ana çalışma iki gerçek profil kahramanını `ProfileRelationshipStats` ile bağladı. `AppNavigationProvider.onFollowChanged` sunucunun `followerCount` ve `viewerFollowingCount` değerlerini hedef profil, kişi listesi ve kendi profil sayacına uygular. Onaylı takip ve engel değişiklikleri saklanan ilişki listelerini geçersizleştirir. Home takip düğmesi ortak `useScopedRequests`, owner kapsamlı bekleme ve aynı karede ikinci isteği engelleyen ref kilidi kullanır.

`tests/follow-handler-runtime.test.mjs` içindeki **3/3** kontrol gerçek Home callback'ini kaynak AST'sinden çalıştırır: tek gönderim + sunucu sayaçları, başarısız optimistic durumun geri alınması ve yeni oturumun eski JSON cevabından korunması. Bu kontrollü testler gerçek hesap mutasyonu değildir.

CUA'da aynı bileşenin açık **galeri simülasyonu**, 320×568 açık temada kontrol edildi. [DOM kaydı](../../exports/mobile-quality-continuation-2026-09-05/profile-relationships-320-light.json) tam ekran dialog, yatay taşma olmaması ve 48 px eylemleri gösterir. [Görüntü](../../exports/mobile-quality-continuation-2026-09-05/profile-relationships-320-light.png) sentetik Ece satırıdır. Gerçek browser Back paneli kapattı ve açan kontrole odak döndürdü; Forward “Ece” aramasını geri getirdi. Gerçek hesap oturumu bu kontrolde açık değildi; API, cihaz veya eksiksiz tema/genişlik kabulü çıkarılmaz.
