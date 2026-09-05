# Kampüs rehberinde eksik kütüphaneler

Kontrol: 5 Eylül 2026.

OMÜ'nün mevcut açık harita anlık görüntüsünde kütüphane kaydı bulunmadığından, “Kütüphane” filtresi gerçek kullanıcılarda boş dönüyordu. Ayrı bir sınıflandırma hatası da `amenity=library` ve `building=university` etiketlerini birlikte taşıyan yapıları kütüphane yerine bina olarak seçiyordu.

OMÜ Merkez Kütüphanesi ve resmî listedeki 13 birim kütüphanesi, `data/campus-library-official-sources-2026.json` üzerinden katalog üretimine eklendi. Kütüphane türü, genel bina türünden önce değerlendirilir; kütüphane adı geçen bir otobüs durağı isim eşleşmesiyle kütüphaneye çevrilmez. Sonraki açık harita taramalarına `building=library` de dahildir.

Birincil kaynaklar:

- [OMÜ Kütüphane ve Dokümantasyon Daire Başkanlığı](https://kutuphane.omu.edu.tr/)
- [OMÜ birim kütüphaneleri listesi](https://kutuphane.omu.edu.tr/birim-kutuphaneleri-ofisi/)
- [OMÜ kütüphane iletişim sayfası](https://kutuphane.omu.edu.tr/iletisim/)

Birim adları ve kurumun yayımladığı adres/yer tarifleri kullanıldı. İletişim sayfasındaki harita bütün üniversiteyi işaret ettiği için kütüphane koordinatı olarak alınmadı. 14 yeni kayıtta koordinat, mesafe ve doğrulanmamış çalışma saatleri boş bırakılır; üniversite merkezinin koordinatı bir kütüphanenin konumu yerine kullanılmaz. Eski kayıtların kaynak kontrol tarihi korunur.

Yeniden üretilen katalog 7.203 kampüs noktası, bunların içinde 146 üniversite için 304 kütüphane kaydı içerir. Bu sayı bütün üniversite kütüphanelerinin eksiksiz envanteri değildir. Açık haritadaki aynı fiziksel yer birden fazla üniversitenin çevresine dahil olabilir.

`tests/campus-place-catalog.test.mjs`, çakışan yapı etiketlerini ve gerçek katalog üzerinden OMÜ'nün 14 kaydını, kategori/arama sonuçlarını ve bilinmeyen konumların korunmasını denetler. `tests/campus-libraries-runtime.mjs`, yerel sunucuda sentetik öğrenci hesabıyla gerçek filtre yanıtını ve oturum/profil zorunluluğunu doğrular. Öğrencilerin eklediği çalışma alanları ve doluluk kayıtları değiştirilmez.

Yerel doğrulama: TypeScript, değişen dosyalarda ESLint ve Vinext üretim derlemesi başarılı; derleme sonrası 313/313 test, mevcut çalışma zamanı testi ve yeni kütüphane çalışma zamanı testi başarılı. Tarayıcıda kategori seçimi, 14 resmî kaydın görünmesi, Merkez Kütüphane araması ve admin güncelleme notu doğrulandı. 390 px mobil görünümde yatay taşma ve temiz oturumda sayfa hatası görülmedi. Canlı yayın sonucu, bu yerel kontrollerden ayrı değerlendirilir.
