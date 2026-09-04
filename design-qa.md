# Design QA — Keşfet hero etiketi

## Karşılaştırma bağlamı

- Kaynak görsel: `C:\Users\fatih\AppData\Local\Temp\codex-clipboard-7283ace5-cadb-4f05-ab3f-7f4be02d8a17.png`
- Odak kaynak görseli: `C:\Users\fatih\AppData\Local\Temp\codex-clipboard-a518b035-f6de-4c24-a973-c152c02016af.png`
- Uygulama ekran görüntüsü: `D:\-niyra-main\docs\design-qa\discover-page-after.png`
- Uygulama bileşen görüntüsü: `D:\-niyra-main\docs\design-qa\discover-hero-after.png`
- Tam bileşen karşılaştırması: `D:\-niyra-main\docs\design-qa\discover-label-removal-comparison.png`
- Odak karşılaştırması: `D:\-niyra-main\docs\design-qa\discover-label-focused-comparison.png`
- Tarayıcı görünümü: 1280 × 720 CSS px, DPR 1
- Kaynak görsel: 730 × 270 px; uygulama hero bileşeni: 579 × 252 px
- Durum: Oturum açık, masaüstü Keşfet görünümü, Ondokuz Mayıs Üniversitesi profili

## Tam karşılaştırma

Kaynak ve uygulama hero kartları tek karşılaştırma görselinde incelendi. Kampüs görseli, koyu degrade, akademik çevre metni, başlık, açıklama, çağrı butonu ve OMÜ yörünge öğesi korunuyor. Bileşen genişliği mevcut uygulama düzenindeki sağ panel nedeniyle kaynak kırpımdan daha dar; içerik aynı duyarlı düzen içinde kalıyor. İstenen tek fark, sağ alttaki “Temsili kampüs illüstrasyonu” rozetinin kaldırılması.

## Odak karşılaştırması

Kaynak rozet kırpımı ile uygulamanın aynı sağ-alt yüzeyi yan yana incelendi. Rozet, metin, kenarlık ve bulanık arka plan tamamen kaldırılmış; alttaki kampüs görseli kesintisiz görünüyor.

## Yüzey kontrolleri

- Tipografi: İlgisiz başlık, açıklama ve buton stilleri değişmedi.
- Boşluk ve hizalama: Hero yüksekliği, iç boşlukları ve iki sütunlu yerleşim değişmedi.
- Renk ve görsel: Degrade, kampüs görseli ve yörünge renkleri değişmedi.
- Etkileşim: “Toplulukları keşfet” butonu Topluluklar görünümüne geçti; Keşfet görünümüne geri dönüş çalıştı.
- Hata durumu: Boş sayfa, Vite/Next hata katmanı veya yakalanmış tarayıcı konsol hatası yok.

## Bulgular ve düzeltme geçmişi

1. İlk uygulama: İşaretlenen rozet JSX'ten kaldırıldı; yalnızca ona ait artık kullanılmayan CSS seçicileri temizlendi.
2. Yeniden kontrol: Tam ve odak karşılaştırmalarında yeni P0, P1 veya P2 görsel uyumsuzluk bulunmadı.

## Sonuç

passed
