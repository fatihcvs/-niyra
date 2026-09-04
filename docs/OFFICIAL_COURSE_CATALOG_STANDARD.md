# Kampira Resmî Ders Kataloğu Standardı

Üniversite ve program kaydı tek başına ders seçicisini etkinleştirmez. Bir programın dersleri ancak kurumun kendi yayımladığı müfredat veya ders kataloğu doğrulandıktan sonra `data/official-course-catalog-2026.json` içine eklenir.

## Zorunlu kayıt alanları

- Kampira üniversite kimliği ve resmî program kimliği
- Program adıyla birebir eşleşen kurum kaynağı
- Kaynak kurum, doğrudan kaynak URL'si ve son kontrol tarihi
- Her ders için resmî ders kodu, ders adı, dönem ve zorunlu/seçmeli türü
- Aynı program içinde benzersiz ders kodu

## Ürün davranışı

- Yapılandırılmış veri varsa öğrencinin sınıfına karşılık gelen iki dönem varsayılan olarak gösterilir.
- Öğrenci tüm dönemleri açabilir ve kod veya adla arama yapabilir.
- En az 3, en fazla 8 ders seçilebilir.
- Ders listesi eksikse veya seçmeli ders dönemsel olarak değişmişse manuel ekleme her zaman kullanılabilir.
- Yalnızca bir müfredat bağlantısının bulunması, ders satırlarının doğrulandığı anlamına gelmez.

## Yeni üniversite ekleme kontrol listesi

1. Üniversite, akademik birim ve program kimliklerini resmî kaynaktan doğrula.
2. Her programın güncel müfredat sayfasını bul ve program adıyla eşleştir.
3. Ders kodu, adı, dönemi ve türünü yapılandırılmış kataloğa aktar.
4. Kaynak URL'sini ve kontrol tarihini kaydet.
5. Katalog bütünlük testlerini ve API testlerini çalıştır.
6. Ders seçicisini hem sınıf filtresi hem arama hem manuel ekleme ile tarayıcıda doğrula.

Bir kaynak program dönemini veya seçmeli dersleri açıkça yayımlamıyorsa bu alanlar tahmin edilmez; eksik kapsam kullanıcıya açıkça gösterilir.
