# F06 — Gönderi görsel boyutu sözleşmesi

Tarih: 2026-09-05. Durum: yerel sunucu uygulaması ve otomatik testler tamamlandı; üretim migration/deploy ve gerçek Android görsel davranışı bu kanıtın kapsamında değil.

## API ve veri

`POST /api/posts` yanıtındaki `post.media[]` ve `hydratePostMedia` kullanan gönderi listeleri, okunabilen görseller için opsiyonel `width` / `height` sayı çiftini döndürür. Bunlar dosya başlığındaki piksel boyutlarıdır; EXIF IFD0 yönü 5–8 ise görüntülenen en/boy sırası çevrilir. İstemcinin gönderdiği boyut alanları kabul edilmez. Ek alanlar eski istemcileri etkilemez.

`drizzle/0025_post_media_dimensions.sql`, `post_media` tablosuna nullable ve 1–65535 aralığında tamsayı iki alan ekler. Mevcut kayıtlar NULL kalır; R2 dosyaları okunarak toplu doldurma yapılmaz. Eski INSERT sorguları sütunları belirtmeden çalışır. Eksik/tek taraflı çift, aralık dışı değer ve video için JSON'da boyut alanları bulunmaz. Uygulama sürümünden önce migration uygulanmalıdır; eski şemasız çalışma desteklenmez.

`lib/post-idempotency.ts`, dosya referansı ve boyutları aynı gönderi transaction'ında kaydeder. F08 hash sürümü değişmez: boyut zaten hashlenen gerçek dosya baytlarından türetilir. Yanıt kaybında aynı anahtar aynı kayıtlı cevabı verir. Eski tamamlanmış cevap boyut içermiyorsa tekrarında yapay backfill veya yeni medya oluşturulmaz.

## Sınırlı başlık okuma

Runtime kodu ek paket, native görüntü kütüphanesi veya dosya yolu erişimi kullanmaz; mevcut en fazla 8 MB görsel baytları üzerinde sınır kontrollü `DataView` okur. Piksel decode, kırpma, sıkıştırma, EXIF silme veya yeniden encode yapılmaz. Mevcut yükleme doğrulaması tam decoder doğrulaması değildir; bu değişiklik de CRC/entropy/piksel doğrulaması iddia etmez.

| Biçim | Okunan bilgi | Bilinmeyen durumda |
| --- | --- | --- |
| PNG/APNG | IHDR canvas, chunk sınırları; eXIf IFD0 yönü; IDAT ve IEND varlığı | Alanlar yok; animasyonda tek karenin boyutu kullanılmaz |
| JPEG | SOF boyutu, ilk SOS öncesi APP1 EXIF yönü | DNL ile sonradan yükseklik, hierarchical/çelişkili SOF, bozuk EXIF: alanlar yok |
| WebP | VP8 / VP8L boyutu veya VP8X canvas; EXIF yönü | Eksik/taşan chunk, çelişkili boyut: alanlar yok; animasyonda VP8X canvas kullanılır |
| MP4 / WebM | Boyut okunmaz | Mevcut video metadata/load fallback |

En fazla 4096 chunk/segment ve 1024 IFD0 girdisi incelenir. TIFF thumbnail/sub-IFD adresleri izlenmez. Birden fazla EXIF bloğu, geçersiz yön/offset veya destek sınırını aşan başlık için boyut eklenmez. Bu sayılar ürünün güvenli metadata kapsamıdır, dosya formatlarının evrensel üst sınırı değildir.

## Doğrulama

`tests/post-media-dimensions.test.mjs`: on gerçek küçük binary fixture (PNG, baseline/progressive JPEG, yönlü JPEG/PNG/WebP, lossy/lossless/alpha/animated WebP); sekiz EXIF yönü, iki byte sırası, farklı IFD offseti, bozuk/kesilmiş başlıklar, buffer subarray offseti, migration öncesi gerçek SQLite kayıt yükseltmesi, eski writer ve NULL fallback. Fixture üretimi ve bağımsız decoder ölçümü `tests/fixtures/post-media/README.md` içinde kayıtlıdır; test çalıştırırken Sharp gerekmez.

`tests/post-idempotency.test.mjs`: sahte istemci boyutunu yok sayma, gerçek EXIF boyutunu DB ve API'de saklama, commit cevabı kaybı, tekrar, eski cache cevabı ve çift medya oluşturmama. Mevcut eşzamanlı istek, bucket hatası, yetkilendirme ve referans kontrollü cleanup testleri korunur.

İstemci kabul kontrolü ayrıca yapılmalıdır: görsel yüklenmeden doğru alan ayırma, küçük görselin doğal boyutunun gereksiz aşılmaması, yönlü fotoğrafın ilk yüklemesinde oran değişmemesi, NULL metadata fallback ve tam ekran/geri/video duraklatma. Bu dosya tarayıcı veya fiziksel cihaz sonucunu varsaymaz.

## Birincil teknik kaynaklar

- [W3C PNG üçüncü sürüm](https://www.w3.org/TR/png-3/): IHDR, eXIf ve APNG canvas yapısı; 24 Haziran 2025 Recommendation.
- [ITU-T T.81 JPEG standardı, W3C kopyası](https://www.w3.org/Graphics/JPEG/itu-t81.pdf): SOF boyut alanları ve DNL istisnası.
- [Google WebP container specification](https://developers.google.com/speed/webp/docs/riff_container): RIFF/chunk sınırları, VP8X canvas ve EXIF yerleşimi.
- [Google WebP lossless bitstream](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification), [IETF RFC 6386 VP8](https://datatracker.ietf.org/doc/html/rfc6386): VP8L ve VP8 başlık boyut alanları.

Kaynak kontrol tarihi 2026-09-05. Uygulama bu formatların tam decoder'ı veya genel amaçlı EXIF kütüphanesi değildir.
