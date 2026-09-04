# Sayfa deneyimi iyileştirmeleri

5 Eylül 2026

Yan menüdeki 13 alanda ortak başlık, arama, filtre, işlem ve boş durum düzenleri kullanılır. Kampira'nın mevcut görsel kimliği ve gerçek içerik akışları korunur.

| Alan | Kullanıcıya sağlanan değişiklik |
| --- | --- |
| Akış | Fotoğraf/video filtreleri, yenileme, mobil başlık, seçili sekmeye tekrar dokunma düzeltmesi |
| Keşfet | Bölüm, sınıf ve takip filtreleri; bölüm kısayolları; aramada tekrar deneme |
| Kampüs Anlık | Metin ve konu filtreleri, yenileme, daha kısa mobil sekmeler |
| Eşleş | İsim/bölüm/tanıtım araması, buluşma amacı ve müsaitlik filtreleri, bekleyen istekler |
| Kampüs | Mekân, açıklama ve adres araması; kategori filtresi; mobil ayrıntı geçişi |
| Kütüphane | Alan/kat araması, özellik ve tahmini boş yer filtreleri, kompakt durum özeti |
| Pazar | Arama, kategori, fiyat sıralaması ve kişinin kendi kayıtları |
| Notlar | Ortak arama alanı, sonuç sayısı, öğrenci notları için yararlılık/görüntülenme sıralaması |
| Topluluklar | Ortak başlık, yenileme, sonuç/filtre temizleme ve özet kartı düzeni |
| Bildirimler | Arama, okunmamış filtresi, tek tek okundu işaretleme, içerik/bölüm bağlantıları, koyu tema düzeltmesi |
| Kaydedilenler | Bağımsız sayfalama, içerik/kişi/ders araması, medya türü filtresi, başarısız işlemi geri alma |
| Güvenlik | Şikâyet/engel/sessize alma bölümleri, hesap araması ve kısıtlamayı kaldırma |
| Ayarlar | Cihazda saklanan hareket azaltma ve masaüstü kompakt görünüm tercihleri |

Bölümler `?view=` adresleriyle yenileme ve tarayıcı geçmişini destekler. Paylaşılmış profil/gönderi adresleri çalışmaya devam eder. Fotoğraf galerisi ve ayrı video bölümü önceki profil çalışmasının parçasıdır.

## Doğrulama

- TypeScript, değişen kaynakların ESLint kontrolü ve Vinext üretim derlemesi başarılı.
- 287 otomatik test başarılı. Yeni davranış testleri Türkçe aramayı, adresleri ve engel/sessize alma kaldırmanın tekrarlandığında güvenli kalmasını doğrular.
- Yerel çalışma ortamı testi gerçek oturum, veritabanı ve dosya alanıyla mevcut ürün akışlarını doğruladı.
- Tarayıcıda 13 bölüme geçiş; 390 px mobil görünüm, 360 px dar ekran örnekleri ve 1440 px masaüstü görünüm kontrol edildi. Açık/koyu tema ve yatay taşma kontrolü yapıldı.
- Geri tuşu ve yenilemeyle bölümün korunması; profil açtıktan sonra tek geri hareketiyle Keşfet'e dönüş doğrulandı.
- Bildirim okundu durumu ve sessize almayı kaldırma işlemden sonra sunucudan okunarak doğrulandı.
- Kaydedilenler'de 12 kayıttan 15 kayda sayfalama, üç videonun ayrılması, metin araması ve zorlanmış başarısız kayıttan çıkarma işleminde satırın geri gelmesi kontrol edildi.
- Akışta video filtresi ve seçili sekmeye tekrar dokunma kontrol edildi.
- 14 kullanıcı odaklı kayıt `lib/product-updates.json` üzerinden admin güncelleme merkezine eklendi; zorunlu alan ve sıralama testi başarılı.

## Kapsam

Doğrulama yerel geliştirme ortamında, deneme hesaplarıyla yapıldı. Bu kayıt üretim yayını veya canlı hizmet doğrulaması değildir. İstemci filtreleri getirilen kayıtlar üzerinde çalışır; Kaydedilenler ve Akış'ta eski kayıtlar yüklenerek arama/filtre kapsamı genişletilir. Bildirimlerde gönderi ve kullanıcı bağlantıları ilgili içeriği açar; diğer içerik türleri kendi ürün bölümüne yönlendirir.
