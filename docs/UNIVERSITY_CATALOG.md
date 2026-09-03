# Üniyra üniversite kataloğu

Üniyra ilk katılım kataloğu 3 Eylül 2026 itibarıyla 241 benzersiz kurum içerir:

- Türkiye: 204
- Kuzey Kıbrıs: 23
- Kıbrıs Cumhuriyeti: 14

Kaynaklar:

- Türkiye: [e-Devlet Üniversite Hizmetleri](https://www.turkiye.gov.tr/universite-hizmet-listesi?theme=default)
- Kuzey Kıbrıs: [YÖDAK Üniversiteler](https://www.yodak.gov.ct.tr/universiteler)
- Kıbrıs Cumhuriyeti: [Department of Higher Education](https://highereducation.ac.cy/index.php/en/citizens-info-serv-he-institutions-en) ve [CYQAA](https://www.dipae.ac.cy/en/?Itemid=643)

## Ürün sözleşmesi

- Her kurum ilk katılım ekranında ad, kısaltma veya bölgeyle aranabilir ve seçilebilir.
- OMÜ mevcut ayrıntılı fakülte, bölüm ve ders kataloğunu kullanır.
- Diğer kurumlarda kullanıcı fakülte/bölümünü ve 3–8 dersini girer. Sunucu metni sınırlar, yinelenen ders kodlarını reddeder ve kararlı katalog kimlikleri üretir.
- Akış, öğrenci araması, takip, gönderi etkileşimleri, notlar, topluluklar ve birleşik arama yalnızca kullanıcının seçtiği üniversite içinde çalışır.
- Katalog kimlikleri yayınlandıktan sonra değiştirilmez; ad değişiklikleri aynı kimlik üzerinde yapılır.

## Bakım

Resmî kaynaklar her açık beta yayını öncesinde yeniden karşılaştırılır. Kurum ekleme,
kaldırma veya ad değişikliği `lib/university-catalog.ts` içinde yapılır; katalog testi
toplamı, bölgesel sayıları ve benzersiz kimlikleri doğrular. Kurum kapanırsa mevcut
profil ilişkileri korunmadan kaydı silinmez; yeni seçimden kaldırma ayrı bir veri göçüyle
yapılır.
