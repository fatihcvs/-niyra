# F08 — Sıralı fotoğraf seçimi ve güvenli yayın tekrarı

2026-09-05. Bu kayıt yerel kod, gerçek ReactDOM davranışı ve bellek içi SQLite/R2 simülasyonu kanıtıdır. Gerçek hesapla gönderi yüklenmedi; fiziksel Android, ağ/IME, performans ve mağaza kabulü tamamlandı sayılmaz.

## Çalışan kullanıcı akışı

- Mobil ve masaüstündeki gerçek gönderi oluşturucu en fazla **4 PNG/JPG/WEBP fotoğraf** veya **tek MP4/WEBM video** kabul eder. Fotoğraf başına 8 MB, video başına ve toplamda 20 MB sınırı korunur. Fotoğraf/video karışımı, beşinci fotoğraf veya uygunsuz dosya seçimi önceki taslağı silmez; açıklayıcı hata gösterir.
- Fotoğraflar numaralı önizlemelerle gösterilir. Önceye/sonraya taşıma ve tek tek kaldırma kontrolleri 48 × 48 CSS piksel hedef kullanır. İlk/son fotoğrafın geçersiz taşıma yönü devre dışıdır. Yeniden sıralama mevcut object URL'leri korur; kaldırma ve oluşturucunun sahibi sayfanın unmount olması artık kullanılmayan URL'leri bırakır.
- Yayın sürerken veya önceki sonucun belirsiz olduğu durumda içerik, medya sırası, kaldırma, seçim ve hedef kitle kilitlidir. Yayın onayı alınana kadar bütün dosyalar ve ilk denemenin anahtarı korunur. Yükleme göstergesi gerçek XHR ilerlemesini kullanır; byte aktarımının tamamlanması yayın başarısı olarak gösterilmez.

## Gerçek veri akışı

`useComposerMedia` → `Home` → `usePublishDraft` / IndexedDB → `createPublishAttempt` → `sendPublishUpload` → `POST /api/posts` → `publishPost` → `post_media` → mevcut akış/profil medya galerisi.

`PublishDraft.mediaFiles` sıralı ve mevcutsa asıl dosya listesidir. Eski tek dosyalı çağrılardaki `media` korunur; yeni çağrılarda bu alan ilk dosyanın takma referansıdır. `publishDraftMedia` eski ve yeni biçimleri aynı tüketiciye bağlar. İlk yayın denemesi dosya dizisini kopyalar ve dondurur; dışarıdaki seçim dizisi veya döndürülen snapshot ile belirsiz bir denemenin sırası değiştirilemez.

Kalıcı taslaklar aynı IndexedDB veritabanı içinde eklemeli schema 2 kullanır. Schema 1 kayıtları ve eski belirsiz tek dosya denemeleri okunmaya devam eder. Sıra, File byte'ları, isim, MIME türü, lastModified ve ilk anahtar yeniden açılışta geri yüklenir. Hesap sahipliği, TTL, kota hatası, açık geri yükleme kararı, logout epoch ve geç gelen işlem korumaları korunur. Tutarsız medya takma referansı veya değiştirilmiş kalıcı sıra geçersiz kayıt olarak reddedilir.

Sunucu dosya sayısı, karışık tür ve toplam boyutu dosya byte'larını doğrulamadan önce denetler; her dosya ayrıca mevcut MIME/uzantı/header kontrolünden geçer. Multipart alanlarının geliş sırası kanonik sıradır; istemcinin sıra veya boyut beyanına güvenilmez. Dosyalar tek tek işlenir ve tek bir D1 transaction içinde sıra numarasıyla gönderiye eklenir. Akış/profil yeniden okuması `ordinal, created_at, id` sıralamasını kullanır.

İki veya daha fazla dosyanın hash'i sıra duyarlı v2 kanonik içerik kullanır. Sıfır/tek dosyanın kanonik hash'i önceki v1 ile aynıdır; eski tamamlanmış yanıt byte alanları değiştirilmeden tekrar döndürülür. Aynı anahtar farklı sıra, eksik/farklı fotoğraf veya değiştirilmiş içerikle gönderildiğinde 409 döner.

Her denemenin planlanan bütün R2 nesneleri yükleme başlamadan önce kalıcı bir nesne listesine yazılır. Mevcut deneme durumu transaction ve temizlik için ortak kilittir. Eşzamanlı aynı anahtarın yalnız bir gönderi/medya seti/audit kaydı kazanır; kaybeden denemenin bütün yüklemeleri temizlenir. Kısmi yükleme ve temizlik hatası kaydı korunur; sonraki yetkili tekrar temizliği yeniden dener. Yayınlanmış nesne referansı olan dosya silinmez. Veritabanı sonucu belirsiz veya yüklemesi hâlâ pending olan denemeler tahminle temizlenmez.

## Migration ve doğrulama

- Yeni `drizzle/0026_post_media_order.sql`: `post_media.ordinal` (0–3, varsayılan 0), sıralama indeksi ve `post_publish_attempt_media` nesne listesi. Var olan dosyalar taşınmaz; geçmiş sıralama tahmin edilmez. Eski yazarların tek medya eklemesi varsayılan 0 ile uyumludur. Eski attempt `object_key` alanından temizlik sürer.
- Migration testlerin taze bellek içi SQLite veritabanlarına ve yalnız sentetik hesaplar kullanan `exports/isolated-mobile-qa/state` yerel D1 veritabanına uygulandı. Tablet APK hazırlığında normal yerel önizlemenin de bu yeni şemaya ihtiyaç duyduğu doğrulandı; `outputs/local-preview-backups/0026-1788639830669/` altında tutarlı yedek alınıp yalnız 0026 resmî Wrangler `--local` ile uygulandı. Bütün önceki tablo satır sayıları/FK ihlal sayısı korundu; integrity=ok. Railway veya üretime uygulanmadı; bu ortamlarda devreye almadan önce migration gereklidir.
- `exports/multi-media-target-tests.txt`: **73/73** hedefli test. Bunların **15'i bu devamda eklenen davranış senaryolarıdır**: 6 SQLite/R2, 3 kalıcı taslak, 1 değişmez deneme, 1 multipart tekrar, 3 gerçek oluşturucu DOM, 1 gerçek `Home` yayın handler'ı ile sıralı geri yükleme.
- `exports/multi-media-lint.txt`: ilgili kaynak ve testlerde ESLint başarılı. `exports/multi-media-typecheck.txt`: TypeScript başarılı. Kök görevin kaynak dondurma sonrası tam test/derleme kaydı ayrıca tutulur.
- ReactDOM kanıtı geometri ölçümü değildir. CSS hedef boyutları kodda tanımlıdır; gerçek tarayıcı/cihaz ölçümü ayrı kabul kalır. Preview galerisi hiçbir gönderinin gerçekten yüklendiği iddiası değildir.

## Açık kabul sınırları

Android fotoğraf sağlayıcısı/izinleri, büyük gerçek dosyayla zayıf bağlantı, arka plana geçiş, native işlem sonlandırma ve gerçek hesapla yayımla/sil kontrolü henüz kanıtlanmadı. İstemci dosyaları otomatik dönüştürmez/sıkıştırmaz; kırpma ve video düzenleyici bu değişiklikte yoktur. Header incelemesi tam medya decode veya zararlı içerik taraması değildir. F08'in genel cihaz kabulü bu belgeyle kapatılmaz.
