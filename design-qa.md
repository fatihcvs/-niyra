# Kampüs Canlı ana akış tasarım QA

- Referans: `docs/design/campus-live-option-2.png`
- Uygulama: `app/page.tsx` ve `app/globals.css`
- Kontrol görünümü: Codex uygulama içi tarayıcıda 390 × 844 piksel mobil çerçeve ve 1294 × 912 piksel masaüstü
- Tema kapsamı: açık ve koyu

## Görsel karşılaştırma

| Ölçüt | Puan / 10 | Sonuç |
| --- | ---: | --- |
| Görsel hiyerarşi | 9.3 | Üst başlık, kampüs halkaları, öne çıkan kart ve alt menü referans sırasını koruyor. |
| Tipografi | 9.1 | Başlık ve yardımcı metin ölçekleri mobilde okunaklı; küçük durum yazıları 10 pikselin altına düşmüyor. |
| Boşluk ve hizalama | 9.2 | 390 piksel görünümde yatay taşma yok; hızlı alanlar bilinçli yatay kaydırma kullanıyor. |
| Bileşen benzerliği | 9.3 | Dairesel kampüs alanları, görselli kart, canlı durumu ve beşli alt gezinme seçilen yönle eşleşiyor. |
| Duyarlı davranış | 9.4 | Masaüstü içerik korunurken mobilde gereksiz karşılama ve ders şeridi sadeleştiriliyor. |

Genel görsel puan: **9.26 / 10**

## Ürün doğruluğu ve etkileşim

- Kampüs halkaları gerçek Kütüphane, Pazar ve Kampüs görünümlerine yönlendiriyor.
- Kampüs Anlık API verisi varsa öğrenci paylaşımı gösteriliyor; veri yoksa temsili paylaşım üretilmiyor.
- Güncellik oyları mevcut `PATCH /api/campus-pulse` akışına bağlı.
- Mobil Oluştur düğmesi gerçek oluşturma sayfasını açıyor ve gönderi metin alanına odaklanıyor.
- Açık ve koyu temada kontrast, dokunma alanları, güvenli alan ve azaltılmış hareket davranışı korundu.

## Kusur bütçesi

- P0: yok
- P1: yok
- P2: yok

final result: passed
