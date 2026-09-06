# F11 — Pazar fotoğraf yüklemesinin güvenilirliği

6 Eylül 2026; kalan altı kod işinin 2. aşaması. Kod ve yerel kabul tamamlandı. Son kanıt: `exports/mobile-remaining-code-2026-09-06/phase2/verification.json`.

## İstemci sözleşmesi

İlan oluşturma anahtarından bağımsız `photoKey`, doğrulanmış `listingId` ve sıralı `File[]` ile birlikte IndexedDB transaction tamamlanmadan fotoğraf POST isteği başlamaz. Yanıt kaybından sonra aynı anahtar, dosyalar ve hedef tekrar gönderilir. Eski bir autosave anahtarı değiştiremez veya silemez. 400/413/415 dosya doğrulama hatası veya 410 sonrasında `photos-ended` yeniden yüklemeyi durdurur; kullanıcı fotoğraf taslağını açıkça kapatabilir. Yeni dosya seçiminde ad uzunluğu, klasör/NUL işaretleri, MIME/uzantı uyumu ve boyut sınırları kontrol edilir; geçersiz seçim önceki geçerli dosyaları değiştirmez. API yanıtı, beklenen dosya sayısı ve her görselin kimlik/bağlantısı açısından doğrulanır.

Yeni anahtarlı yüklemenin sonucu belirsizse kullanıcı tek eylemle tekrar deneyebilir. Önceden anahtarsız gönderilmiş `photos-unknown` taslakları kendiliğinden güvenli yeniden denemeye dönüştürülmez; önceki ilanı elle inceleme adımı korunur. Bu eski kayıtlar yalnız açık kullanıcı eyleminde yeni fotoğraf anahtarı kazanır.

## Sunucu sözleşmesi

`POST /api/campus-market/images`: multipart `listingId` ve sıralı `images`; `Idempotency-Key` başlığı. Başarılı ilk işlem ve tekrar 201 `{images, idempotentReplay}` döndürür. Anahtar aynı hesap içinde değişmez ilan ve sıralı dosya içeriğine bağlanır; ad, MIME, boyut ve sunucuda hesaplanan SHA-256 parmak izine dahildir. Yanlış içerik 409; kaldırılmış/kapalı ilan veya kazanan yüklemeden silinmiş görsel 410. Güncel hesap, kampüs ve ilan yetkisi tekrarda da kontrol edilir. Sona erdiği doğrulanan sunucu işlemi kalıcı `ended_at` ile işaretlenir; ilanın tekrar açılması eski anahtarı canlandırmaz.

Bir işlemde tek kazanan; görsel sayısı sınırı, sırası, ilan erişimi, cevap kaydı ve audit aynı D1 batch içinde değerlendirilir. R2 nesne anahtarları her denemeye özeldir ve PUT öncesinde kaydedilir. Yalnız bütün PUT işlemleri sonuçlanmış ve artık veritabanına yayın yapamayacak şekilde dışlanmış denemeler temizlenir. Sırf görsel satırı görünmüyor diye dosya silinmez. R2 silme başarısızlıkları sonraki uzlaştırma için kayıtlı kalır.

İşlem sırasında çalışan sunucu tamamen kapanırsa tamamlanması bilinmeyen PUT işlemlerinin nesneleri karantinada tutulur. Yalnız geçen süre, dosyanın daha sonra yazılamayacağının kanıtı değildir. Bu sınır gerçek dosyanın yanlışlıkla silinmesini önler; sonsuz kesinti için otomatik depolama temizliği iddiası değildir.

Teknik dayanaklar: [D1 batch transaction davranışı](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [R2 tutarlılık modeli](https://developers.cloudflare.com/r2/reference/consistency/). D1 ile R2 arasında ortak transaction bulunmadığı için işlem kaydı ve deneme başına nesne anahtarı gerekir.

## Doğrulama

Son kaynakta **77/77** otomatik test, TypeScript ve scoped ESLint geçti. Bunlar kalıcı taslak, UI, JSON oluşturma ve fotoğraf API yarış/hata testleriyle migration kabulünü birlikte kapsar. Vinext tam derleme tamamlandı; derlenen Worker5173/5180 üzerinde çalıştı. İlk paralel test çalışmasındaki zamanlama ve ortam bellek hataları kabul sayılmadı; son çalışma `--test-concurrency=1` ile geçti.

**4/4** gerçek Chrome kontrolü geçti: `exports/isolated-mobile-qa/browser/final-1788651454498/report.json`. Gerçek R2/D1 yüklemesinin201 yanıtı düşürüldü; bağımsız Chrome süreci kapatılıp yeniden açıldı. Aynı anahtar ve sıralı dosya baytları aynı iki görsel kimliğini döndürdü; ilan sayısı1 ve fotoğraf sayısı2 kaldı. Fotoğraf silindikten sonra eski POST410 ve silinmiş görselGET404 döndü; kalan fotoğrafın baytları doğrulandı. Beklenmeyen ağ, JavaScript ve statik dosya hatası yok.320/390px görüntüler kontrol edildi; düğme yüksekliği48px, taşma yok. Hareket azaltma açık olduğundan bu çalışma animasyon performansı ölçümü değildir.

Normal yerel veritabanına0028 migration öncesi SQLite backup alındı; son bütünlük `ok`, eski tablolardaki kayıt sayıları değişmedi. Kanıt: `outputs/local-preview-backups/0028-20260905T232203Z/postflight.json`. Üretim dağıtımı, fiziksel Android kabulü veya mağaza yayını yapılmadı.
