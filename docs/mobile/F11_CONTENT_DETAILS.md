# Kampüs ilanı ve etkinlik bağlantıları

5 Eylül 2026. Yerel uygulama ve test kaydı; fiziksel cihaz veya üretim yayını değildir.

Pazar ilan başlıkları ve talep listesindeki ilanlar `/?view=market&listing=<id>` adresine gider. Kampüs etkinlik başlıkları `/?view=campus&event=<id>` hedefini açar. Ayrıntılar filtrelenmiş listenin ilk sayfasına bağlı değildir; yetkili `/api/campus-content` isteği kaydı doğrudan yükler. Geçmiş etkinlikler bağlantı üzerinden açılabilir.

API oturumu, kampüsü, etkin kayıt/hesap ve iki yönlü engel kurallarını uygular. İlan sahibinin kapalı veya satılmış kaydı kendi hesabında görüntülenebilir. Yanıtta özel e-posta bilgisi yoktur; önbellek `private, no-store` olur. İlan görselleri kayıtlı sırayla gösterilir. Etkinlik zamanı Europe/Istanbul diliminde biçimlenir.

Tek Geri hareketi çağıran listeye döner; İleri ayrıntıyı yeniden doğrular. Doğrudan açılmış bağlantıda Kapat aynı bölümün listesine döner. Yeni hedef veya hesap geldiğinde eski isteğin sonucu yeni ekranı değiştiremez. Hata durumunda yeniden deneme vardır; yanıt gövdesi dahil istek beklemesi sınırlıdır. İletişim eylemi mevcut ilan mesaj formunu açar.

`tests/campus-content-api.test.mjs` gerçek route kodunu mevcut migration'larla geçici SQLite üzerinde çalıştırır. `tests/campus-content-runtime.test.mjs` gerçek ReactDOM'da Geri/İleri, hedef değişimi, geç yanıt ve yeniden denemeyi sınar. Toplam **5/5** yerel kontrol geçti. Bunlar R2 sağlayıcısı, Android klavyesi veya gerçek öğrenci kabulü değildir.

İlan oluşturma, fotoğraf ekleme ve belirsiz yanıt kurtarma akışı ayrı Pazar doğrulamasına tabidir. Genel buluşma ve tek yorum hedefleri bu değişiklikte eklenmedi.
