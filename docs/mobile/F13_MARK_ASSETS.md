# Başlık markı için mekanik asset türevleri

Kaynak `public/kampira-mark.png`: 1254×1254, 528.222 byte. Kaynak dosya değiştirilmedi. Yeni şekil/renk/logo üretilmedi; kırpma, dolgu, kompozit veya flatten uygulanmadı.

`node scripts/brand-assets/build-mark.mjs`, mevcut kurulu sharp 0.34.5 / libvips 8.17.3 ile aynı PNG'yi Lanczos3 kullanarak 128px ve 256px'e indirir. `keepMetadata()` ile metadata tutulur; alpha ve sRGB doğrulanır. Kaynakta ICC profili yoktur ve çıktıya eklenmez. Her çalışmada kaynak hash'inin değişmediği, en-boy oranı, boyut, transparan piksel ve ICC eşitliği kontrol edilir. Kök lock dosyasındaki sharp kurulumu gerekir; yeni runtime kütüphanesi eklenmedi.

| Dosya | Boyut | Byte | Kaynağa göre azalma |
| --- | --- | --- | --- |
| `public/brand/kampira-mark-128.png` | 128×128 | 11.379 | %97,85 |
| `public/brand/kampira-mark-256.png` | 256×256 | 31.190 | %94,10 |

Tam source/output SHA256 ve araç sürümleri `F13_MARK_ASSETS.json` içinde kayıtlıdır. `tests/brand-mark-assets.test.mjs` bu kayıtları dosyalara ve decoded metadata'ya karşı doğrular.

Ortak `KampiraMark` primitive'i 42px'e kadar çizimde 128px, daha büyük çizimde 256px türevi seçer. MobileHeader ve galeri aynı primitive'i kullanır. Root Logo da `<KampiraMark size={36} className="brand-mark"/>` ile entegre edilir; `img.brand-mark` üzerinde eski büyük CSS background yüklemesi kapatılır. Kaynak dosya marka/üretim kaydı olarak saklanır.

Bu belge dosya boyutu ve metadata kanıtıdır; cihaz decode süresi, INP, FPS, enerji veya tüm site performansının ölçüldüğü iddiası değildir. Favicon/manifest ve diğer kaynak mark kullanımları kendi boyut ihtiyaçlarına göre ayrı kontrol edilmelidir.
