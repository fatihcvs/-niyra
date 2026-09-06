# F06-03 — Akış yenileme ve yeni paylaşım işareti

Tarih: 5 Eylül 2026. Durum: yerel uygulama ve odak runtime doğrulaması tamamlandı; üretim, canlı kullanıcı ve fiziksel Android kabulü bu teslimde yok.

## Kullanıcı davranışı

- Görünür Akış, ilk yükleme/sayfalama/gönderme boşta iken **45 saniye** aralıkla gerçek `/api/posts?feed=...` ilk sayfasını kontrol eder. Arka planda, farklı workspace'te veya açık modal üzerinde yeni kontrol başlatılmaz. Her okuma en fazla 20 saniye bekler; iptal sinyalini gecikmeli işleyen bir taşıma bile arayüzü sonsuz bekletmez.
- Geçerli başarılı yanıtta sunucunun en üst gönderi kimliği yüklü sayfalarda yoksa **Yeni paylaşımlar** düğmesi görünür. Kontrol edilen ilk sayfa **listeye uygulanmaz**; mevcut gönderi nesneleri, ikinci/sonraki sayfalar, devam cursor'u ve scroll korunur. Düğme sıfır yüksekliğe sahip yapışkan katmanda yer alır; içerik akışına satır eklemez.
- Bu bildirim **toplam yeni gönderi sayısı değildir**. API bir toplam veya “son ziyaretten bu yana” sayacı vermiyor. İlk sayfanın tepesinde görülen, henüz yüklenmemiş kayıt için var/yok işaretidir. Silinen kayıtların altına eklenen eski sayfa dolgusu ve aynı kimliğin metin değişikliği yeni paylaşım sayılmaz. Bütün eski kimlikler görünürlükten kalkmışsa işaret yeni görünen ilk kaydı ifade eder; oluşturulma zamanı iddiası üretmez.
- Düğmeye dokunmak sayfa başına bilinçli geçiş yapar ve **yeni GET** başlatır. Eskimiş yoklama sonucu doğrudan uygulanmaz. Başarılı sonuç ilk sayfayı ve onun gerçek cursor'unu birlikte değiştirir; odağı `feed-posts` paneline taşır. Ekran okuyucu durum mesajları ve düğmenin tam erişilebilir adı bulunur; dokunma hedefi en az 48 px'dir.
- Yenileme hatası veya zaman aşımı yüklü sayfaları ve cursor'u silmez. Tekrar deneme ve sayfalama devam eder. Başarılı yenilemeden sonra eski ikinci sayfanın bırakılması bilinçlidir: yeni bir sayfalama zinciri başlar, önceki isteğin cursor'u karıştırılmaz.
- Sayfalama ref kilidi aynı turdaki çift tıklamayı önler. Bilinçli yenileme bekleyen sayfalama isteğini iptal eder. Sonraki sayfa yanıtı aynı istek nesnesine ve nesle ait değilse eklenmez.
- Aynı scope ile profil/mesaj ekranından Back dönüşünde Home'un mevcut bellek listesi, ikinci sayfası, cursor'u ve yeni paylaşım işareti korunur. Oturum veya scope değişiminde bildirim kimliği ve istek sahipliği değişir; geç gelen önceki yanıt uygulanmaz. Oturumun ortak 401 davranışı `useAuthenticatedFetch` üzerinden korunur.
- Mevcut `profileRevision` kaynaklı görünmez arama/profil/güvenlik yeniden doğrulaması da hazır feed'i artık ilk sayfaya indirmez. Yeni scope/owner veya açıkça başlangıç yüklemesine alınmış içerik dışında bu yanıt yalnız işareti günceller. Güvenlik eyleminin kaldırdığı gönderilerin mevcut anlık kaldırma yolu değiştirilmedi.

## Sahiplik ve sınırlar

`app/page.tsx`: yalnız Home feed state/okuma/sayfalama ve render entegrasyonu. Auth formları, kalıcı gönderi taslağı ve ders modalları korunur. `app/use-feed-refresh.ts`: görünürlük, yoklama, bilinçli yenileme, owner/scope/nesil koruması. `lib/feed-refresh.ts`: ortak GET ve şekil doğrulaması. `app/feed-refresh-notice.tsx` + module CSS: erişilebilir işaret. Backend endpoint veya migration değiştirilmedi.

Yeni hook özel içeriği `localStorage`, URL, history veya kalıcı bir cache'e yazmaz. Mevcut Home listesi bu sayfa ömründe bellekte kalır. Tam tarayıcı reload'u veya Home unmount/remount'u sonrasında bütün sayfaları geri getirdiği iddia edilmez. Scope değişimi mevcut davranışla yeni liste açar; üç ayrı scope listesini kalıcı saklayan yeni bir cache eklenmedi.

`useWebScreenTiming('feed', !postsLoading, { enabled: activeNav === 'Akış' && profileState === 'ready' })` mevcut ölçüm hook'una bağlandı. Bu, yükleniyor commit'inden hazır commit'ine kadar gözlenen süredir; gezinme niyeti, paint veya cihaz performansı ölçümü değildir. Hazır cache dönüşü sahte 0 ms örnek üretmez.

## Yerel kanıt

```powershell
node --test --test-isolation=none tests/feed-refresh-runtime.test.mjs tests/feed-history-restoration.test.mjs tests/authenticated-fetch.test.mjs
node node_modules/eslint/bin/eslint.js app/page.tsx app/use-feed-refresh.ts app/feed-refresh-notice.tsx lib/feed-refresh.ts tests/feed-refresh-runtime.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

**18/18 test geçti.** Yeni dosyada 9 test; mevcut history ve authenticated-fetch testlerinde 9 test. Yeni runtime fixture, gerçek Home feed deklarasyonlarını/efektlerini/fonksiyonlarını kaynak AST'den alır; gerçek ReactDOM, gerçek hook, bildirim ve ortak authenticated-fetch kullanır. API yanıtları açıkça sentetik test verisidir; ağ/üretim mutasyonu yapılmaz. Testler iki sayfalı dönüş, yeni GET, 503, 20 saniye timeout, abort'u geç işleyen yanıt, görünürlük, scope/account değişimi, 401, yinelenen tıklama, bozuk cursor/yanıt, görünmez revalidation ve boş akış davranışını denetler. CSS deklarasyon testi sıfır satır yüksekliği/48 px hedefi doğrular; piksel yerleşimi değildir. Scoped ESLint başarılı.

`tsc --noEmit` de exit 0 ile tamamlandı. Gerçek tarayıcıda işaretin kaydırma sırasında üst çubukla ilişkisi, yüzde 200 yazı, açık/koyu tema ve fiziksel Android klavye/Back/push davranışı ayrıca ölçülmelidir. Bu yoklama push veya gerçek zamanlı teslim olarak etiketlenmez. F06-03'ün otomatik yerel alt kapsamı ilerledi; F06-07 uzun liste cihaz/bellek kabulü ve F13 gerçek cihaz kapısı bu sonuçla kapanmaz.

## F06-04 ek teslim: beğenme/kaydetme tekrarının güvenli olması

Yenilemeden ayrı küçük endpoint düzeltmesi: `app/api/post-actions/route.ts` like/save için opsiyonel **`active:boolean`** kabul eder. `active:true` aynı istekte tekrar gönderilirse var olan beğeni/kayıt silinmez; `active:false` tekrarlandığında tekrar eklenmez. Alan verilmezse önceki istemcilerin sıralı toggle davranışı korunur. Geçersiz alan tipi ve comment üzerinde active alanı 400 döner.

Ekleme `onConflictDoNothing().returning(...)`, silme `returning(...)` kullanır. Audit ve beğeni bildirimi yalnız veritabanında gerçekten değişen satır için yazılır. Aynı desired-state isteğinin eşzamanlı kopyaları ikinci notification üretmez. Mevcut origin/oturum/kampüs/engelleme/topluluk/rate-limit yolları değiştirilmez; tekrarlar aynı kotaya sayılır. Yeni migration yoktur. Bu, yorum idempotency'si, farklı cihazlardaki zıt komutların sıralaması veya notification outbox teslim garantisi değildir.

`tests/post-actions-state-api.test.mjs` **5/5** geçti: tekrar true/false, eşzamanlı kopyalar, eski callers, bozuk alanlar ve erişim/kota sınırları. Test her defasında yeni `:memory:` SQLite'a mevcut bütün migrations'ı uygular; gerçek Drizzle D1 sorguları, route, audit, notify ve rate-limit fonksiyonlarını çalıştırır. Yerel mevcut DB ve üretim verisi kullanılmaz. Bu dosya dahil önceki üç dosyayla birleşik odak koşusu **23/23** geçti. API/test scoped ESLint ve son `tsc --noEmit` exit 0.
