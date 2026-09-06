# F07 — Profil içerik durumu altyapısı

Tarih: 2026-09-05. Kapsam: F04 durum altyapısının F07 profil ekranına uygulanması. Bu kayıt tüm F07 tasarım/cihaz kabulünün tamamlandığı anlamına gelmez.

## Uygulanan davranış

- Gönderiler, Görseller, Videolar, Notlar, Topluluklar ve Hakkında sekmelerinin seçimi hedef profil için korunur. Hakkında haricindeki beş sekmenin yüklenmiş sayfaları ve sonraki gerçek API cursor'u oturum belleğinde tutulur.
- Profil unmount → geri ziyaretinde yüklenmiş veri tekrar birinci sayfaya indirilmez. İlk okuma hatası ile sonraki sayfa hatası ayrıdır; sonraki sayfayı yeniden denemek önceki kayıtları silmez.
- Her okuma oturum, hedef, sekme, entry kimliği ve AbortController bileşimiyle sınırlandırılır. Abort'u dikkate almayan gecikmiş başarı/hata yanıtları sekme/kişi değişiminden, invalidation'dan veya çıkıştan sonra kabul edilmez.
- Oturumun sahibi yalnız root auth akışı tarafından etkinleştirilir. Component render veya `getSnapshot` cache oluşturmaz, hesap değiştirmez ve istek başlatmaz. Yeni prop ile authoritative owner aktivasyonu hangi sırayla gelirse gelsin yanlış owner adına istek yapılmaz.
- Onaylanmış beğeni/kaydetme/sayaç/metin değişikliği tüm yüklü gönderi ve medya sekmelerine uygulanır. Silme bu görünümlerden kaydı çıkarır. Önceden başlamış okumalar bu değişiklikleri geri alamaz.
- Yerel medya dialog seçimi cache'e alınmaz; hedef veya oturum değişince component anahtarı değişir. Dialog kapanırken odak yalnız hâlâ bağlı olan açma düğmesine döner. Sol/sağ klavye gezinmesi sayfayı ayrıca kaydırmaz. Panel sayfalama sırasında da `aria-busy` bildirir.

## Root entegrasyon sözleşmesi

```tsx
<ProfileContent
  ownerScope={`${viewer.publicId}:${sessionRevision}`}
  userId={target.publicId}
  onSessionExpired={resetAuth}
  // diğer mevcut prop'lar
/>
```

`ownerScope` bir auth-session ad alanıdır; token, cookie veya parola değildir. Aynı oturumda bölüm değişirken sabit; yeni girişte farklı olmalıdır. `userId` görüntülenen hedeftir; oturum sahibi yerine kullanılmaz.

Root `lib/profile-content-state.ts` üzerinden:

| Olay | Çağrı |
| --- | --- |
| Bootstrap/onboarding/giriş ile doğrulanmış oturum | `setProfileContentOwnerScope(ownerScope)` |
| Çıkış veya hesap sıfırlama başlangıcı | Senkron `setProfileContentOwnerScope(null)`; diğer auth state güncellemeleri bundan sonra. |
| API tarafından onaylanmış beğeni/kaydetme/sayaç/metin değişikliği | `updateProfileContentPost(ownerScope, postId, changes)` |
| API tarafından onaylanmış gönderi silme | `removeProfileContentPost(ownerScope, postId)` |
| Yeni gönderi oluşturma | `invalidateProfileContent(ownerScope, ownPublicId, ["posts", "images", "videos"])` |
| Belirli kaynak/üyelik değişikliği | `invalidateProfileContent(ownerScope, affectedPublicId, ["notes"])` veya `["communities"]` |
| Hedef görünürlüğü/kampüs/erişim değişikliği | Etkilenen kişi veya bütün oturum için `invalidateProfileContent(ownerScope, userId?)`. |

İşlem tıklanınca değil, başarılı sunucu sonucu alındıktan sonra çağrılır. Root'taki FeedPost update/delete/create bağlantıları bu dosyaların dışındaki entegrasyondur. Profil içindeki FeedPost callback'leri aynı ortak cache işlemlerini kullanır.

### Diğer workspace bağlantıları — takip listesi

Bu görev bu workspace dosyalarını değiştirmedi. Root/genel işlem katmanı başarılı sonuçlara aşağıdakileri bağlamalı:

- Not oluşturma, silme, yayın/işleme durumu değişikliği → ilgili kişinin `notes` sekmesi.
- Topluluğa katılma/ayrılma, üyelik onayı/red, çıkarılma/yasaklanma, topluluk arşivleme veya görünürlük değişikliği → ilgili kişilerin `communities` sekmesi; erişimi etkileyen durumda gönderi/medya sekmeleri de.
- Kişi engelleme, kampüs değiştirme veya profil görünürlüğü değişikliği → etkilenebilecek profil kayıtları.
- Avatar/ad değişikliği → yazarın cached gönderi kimlik bilgisini yenilemek için ilgili gönderi/medya sekmelerini invalidate etme.

Bu olaylar otomatik backend event aboneliği ile izlenmiyor. Başka cihazda gerçekleşen değişiklikler beş dakikalık pasif cache süresi veya açık invalidation sonrası yeniden okunur. Mounted ekran için sürekli polling eklenmedi.

## Bellek ve özel veri sınırı

- Cache yalnız JS oturum belleğindedir. `localStorage`, `sessionStorage`, history state, dosya veya URL içine profil içerikleri yazılmaz. Tam sayfa yenileme cache'i kaybeder.
- Varsayılan olarak en fazla **8 pasif hedef profil**, sekme başına en fazla **240 cached kayıt**, pasif durumda **5 dakika** yeniden kullanım süresi vardır. Aktif mount edilmiş okuyucunun açıkça yüklediği sayfalar, okuma ortasında kesilmez.
- Son abone unmount olduğunda yalnız limite sığan **tam ilk sayfalar** tutulur. Son retained sayfanın kendi cursor'u korunur. Örneğin 100 kayıt okunduktan sonra test limiti 24 ise 24 kayıt ve 24'ten sonraki gerçek cursor saklanır; son sayfanın cursor'u ile aradaki kayıtlar atlanmaz. Büyük geçmişin sınırı aşan kısmı geri ziyarette yeniden yüklenebilir; sınırsız restore iddiası yoktur.
- Aktif aboneler pasif LRU bütçesinin dışındadır; normal uygulamada bir profil okuyucusu vardır. Aynı hedefin birden fazla abonesi birbirinin isteğini yanlışlıkla iptal etmez. Abone temizliği idempotenttir.
- Süresi geçen pasif kayıt render'da gösterilmez; tekrar attach/eviction sırasında bırakılır. Çıkış/hesap değişimi bütün kayıtları ve istekleri hemen temizler.

## Hata ve auth davranışı

İlk sayfa hatası açık mesaj/yeniden deneme gösterir. İkinci veya sonraki sayfanın ağ hatası önceki sayfaları ve cursor'u korur. Aynı cursor'u tekrar döndüren bozuk sayfalama yanıtı sonsuz ekleme yapmaz.

403/404 aynı hedefin bütün cached sekmelerini temizler; hata ilgili sekmede kalır. 401 bütün oturum cache'ini temizler ve otomatik tekrar döngüsüne girmeyen “oturum sona erdi” durumu üretir. `onSessionExpired` varsa root auth sıfırlaması çağrılır. Callback verilmemiş eski bir entegrasyonda kullanıcı “Tekrar dene” dediğinde tam sayfa yenileme authoritative oturum bootstrap'ını yeniden çalıştırır; bu fallback normal profil gezinmesi değildir ve eski scope'u kendi kendine yetkilendirmez.

## Altı sekme / medya / erişilebilirlik incelemesi

| Alan | Durum |
| --- | --- |
| Masaüstünde altı gerçek sekme; mobilde üç ana sekme + etiketli ek bölüm seçimi | Korundu. Gerçek panel ve API tab türleri çoğaltılmadı. |
| Klavye okları, Home/End, roving tabIndex, panel etiketi | Korundu; store seçimi aynı davranışa bağlandı. |
| Native media dialog, Escape, görünür kapat/önceki/sonraki | Korundu; seçim auth/target sınırında sıfırlanır. |
| Görsel/video galeri küçük önizlemelerinde decode hatası | Mevcut bağımsız thumbnail fallback eksikliği devam ediyor; F07 medya kabulünde ayrıca ele alınmalı. Ana gönderi medya fallback'inden ayrı bir yüzey. |
| Gallery video metadata istekleri ve çok uzun galeri performansı | Bu görevde optimizasyon veya fiziksel cihaz ölçümü yapılmadı. |
| Boş durum metni | Galeri iç yapısını anlatan “üçlü kare galeri” cümlesi sadeleştirildi. Diğer gerçek boş durum eylemleri korundu. |
| Topluluk kartından belirli topluluğa deep link | Bu panelde hâlen genel Topluluklar geçişi var; yeni hedefli rota bu görevin dışında. |
| Geri dönüşte sayfanın gerçek kaydırma konumu | Root gezinme/scroll katmanının sorumluluğu; bu teslim yalnız içerik/sekme/cursor durumunu korur. |

## Doğrulama

```powershell
node --test --test-isolation=none tests/profile-content-state.test.mjs
npx eslint app/profile-content.tsx lib/profile-content-state.ts tests/profile-content-state.test.mjs
```

Yeni testler: owner/prop sırası, altı sekme restore, A→B ve eski başarı/hata, logout/account ayrımı, sayfalama çakışması ve retry, ilerlemeyen cursor, onaylanmış etkileşim/düzenleme/silme, hedefli invalidation, 401/403/404, LRU/TTL, çoklu abone ve gerçek API cursor restore. Cursor testi F00 verisini yeni SQLite `:memory:` veritabanına alıp mevcut gerçek profil GET işleyicisini çağırır. Canlı API hesabı/post mutasyonu, mevcut `.wrangler` DB erişimi, Railway veya üretim yazımı yapılmaz. Bu testlerin geçmesi browser/Android klavye veya görsel kalite kabulü değildir.
