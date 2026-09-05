# Türkiye programları, ders katalogları ve yakın bölgeler

Bu çalışma `academic-catalog-2026.json` içindeki **Türkiye grubuna ait 204 kurumun** kapsamını izler. Kurum/program envanteri ile ders listesinin kapsamı farklı ölçümlerdir. Her programın resmî müfredatı henüz tamamen aktarılmış değildir. Güncel sayılar ve kurum bazındaki açıklar [kapsam raporundadır](./TURKEY_CATALOG_COVERAGE_2026.md).

## Kullanılabilir işlevler

- Öğrenci bölümünü seçtiğinde yalnız o bölüme ait kaynaklı ders listesini yükler. Kod/ad araması, sınıf filtresi, kaynak bağlantısı ve varsa müfredat dönemi görünür. Kaynakta bulunmayan dersler elle eklenebilir.
- Liste bulunamayan programlarda doğrulanmış üniversite katalog girişleri gösterilir. Bu bağlantılar, o programın derslerinin içeri aktarıldığı anlamına gelmez.
- Owner genel bakışındaki **Türkiye ders katalogları** bölümü 204 kurum için ders kaydı bulunan/eksik program sayılarını, eksik program aramasını, nedenlerini ve kaynak bağlantılarını gösterir. Uzun listeler 20 kayıt halinde açılır.
- Kampüs rehberindeki **Mahalle ve bölgeler** filtresi, kaynaklı kampüs veya referans noktasına en fazla 5 km mesafedeki adlandırılmış bölgeleri içerir. Mesafe, yerleşimin temsil noktasına kuş uçuşudur; yürüyüş süresi değildir.

## Veri ve doğrulama sınırları

1. Program eşleştirmesi kurum, ön lisans/lisans derecesi, bölüm adı ve gerektiğinde fakülte üzerinden yapılır. İngilizce, ikinci öğretim, MTOK ve ortak program ayrımları korunur. Birden çok eşleşme varsa kayıt otomatik yayımlanmaz.
2. Fakülte/üniversite ders havuzu, rastgele başka bölümlere kopyalanmaz. Minör, çift anadal, lisansüstü ve alternatif af müfredatları ana program olarak aktarılmaz.
3. Yeni listeler `partial` olarak yayımlanır. Ders kodu/adı, açıkça belirtilen yarıyıl veya sınıf ve zorunlu/seçmeli türü alınır. Bilinmeyen alanlar `null` kalır. Grup yer tutucuları çıkarılır; aynı kod için çelişen adlar yayımlanmaz. Aynı ders birden fazla dönemde sunuluyorsa dönemleri ayrıca saklanır.
4. Sayılan dersler **programlar içindeki ders kayıtlarıdır**; ülke genelinde tekil ders sayısı değildir. Bir programda kayıt bulunması, tüm müfredatın eksiksiz olduğu anlamına gelmez.
5. Kamuya açık kurum siteleri, HTML tabloları ve anonim katalogların kullandığı JSON uçları okunur. Hesapla giriş veya erişim kısıtlamasını aşma kullanılmaz. WebForms/PHP gibi sistemlerin anonim seçim oturumları yalnız bellekte tutulur.
6. Kayıtlarda kaynak URL'si, kontrol tarihi ve SHA-256 özeti bulunur. Gerekirse veri ucu, istek parametreleri, seçilen müfredat ve kimlik/dil politikasının kaynağı da tutulur. KTÜ'nün ayrı yıl sayfaları birleştirilir; `sourceSelection.sourcePages` her sayfanın URL ve özetini içerir. Bu kayıtlardaki ana özet birleştirilmiş içeriğe aittir.
7. İEÜ ve İYTE gibi kurumlarda adı dil eki içermeyen programlar ancak açık kurumsal dil beyanı ile eşleştirilir. Kontrol tarihi müfredatın yayın dönemi olarak kullanılmaz.
8. Yakın bölgeler OSM'nin **2026-07-24T11:04:51Z** anlık görüntüsünden, 2026-09-05 tarihinde alınmıştır. Kontrol tarihi ile harita verisinin tarihi ayrıdır. Sonuç olmayan kurumlar sıfır kayıtla raporlanır. Türkiye katalog grubunda fiziksel konumu Türkiye dışında olan kurumlar da bulunduğundan, 204 kurum ifadesi coğrafi konum iddiası değildir.
9. Önceki Kıbrıs/OMÜ ders kayıtları ve kampüs rehberindeki mevcut kütüphane/konaklama kayıtları korunur.

## Tekrar üretme

Gerekenler: Python 3 + `beautifulsoup4`, Node.js, proje npm bağımlılıkları. Komutlar depo kökünden çalıştırılır. Ham yanıtlar ve işaret dosyaları `.sites-runtime/turkey-courses/` altında tutulur ve Git'e eklenmez. Toplayıcılar mevcut başarılı yanıtları yeniden kullanır; yeni bir tarihli tarama için eski önbelleği ayrı bir arşiv olarak saklayıp boş çalışma önbelleği kullanın.

Başlangıç envanteri ve genel tarama:

```text
python scripts/academic-catalog/turkey_research.py homepages
python scripts/academic-catalog/turkey_research.py known
python scripts/academic-catalog/discover_turkey_courses.py
python scripts/academic-catalog/hydrate_turkey_courses.py
python scripts/academic-catalog/probe_turkey_catalogs.py
python scripts/academic-catalog/probe_turkey_remaining.py
python scripts/academic-catalog/discover_turkey_remaining_catalogs.py
python scripts/academic-catalog/refine_turkey_directories.py
```

Kurumlara özgü dizin/yanıt toplayıcıları:

```text
python scripts/academic-catalog/collect_turkey_ubys.py
python scripts/academic-catalog/collect_turkey_ecatalogs.py
python scripts/academic-catalog/collect_turkey_previous_plans.py
python scripts/academic-catalog/collect_turkey_institution_catalogs.py
python scripts/academic-catalog/collect_turkey_kocaeli.py
python scripts/academic-catalog/collect_turkey_istanbul.py
python scripts/academic-catalog/collect_turkey_language_catalogs.py
python scripts/academic-catalog/collect_turkey_erciyes.py
python scripts/academic-catalog/collect_turkey_subu.py
python scripts/academic-catalog/collect_turkey_ktu_ikcu.py
python scripts/academic-catalog/collect_turkey_web_curricula.py
python scripts/academic-catalog/collect_turkey_more_catalogs.py
```

`collect_turkey_more_catalogs.py` en son çalıştırılır: Erciyes, SUBÜ, KTÜ/İKÇÜ ve web müfredat sonuçlarını aynı manifestte birleştirir. Önceki plan toplayıcısı, depodaki önceki taramaların yerel önbelleğini mevcutsa kullanır; bulunmayan yanıtları tamamlanmış saymaz.

```text
python scripts/academic-catalog/build_turkey_catalog_sources.py
python scripts/academic-catalog/parse_turkey_courses.py
python scripts/academic-catalog/build_turkey_course_catalog.py
python scripts/campus-catalog/sync-turkey-nearby-areas.py
node scripts/campus-catalog/apply-turkey-campus-areas.mjs
python scripts/academic-catalog/report_turkey_coverage.py
```

Ayrıştırıcı tüm girdi özetlerini ve ayrıştırıcı sürümünü `parse-receipt.json` dosyasına yazar. Yayın üreticisi tamamlanmamış taramayı, değişmiş girdileri, geçersiz program kimliklerini ve yayımlanmış ders kayıtlarını sessizce azaltan sonucu reddeder. Tam kampüs katalog üreticisi de Türkiye bölgelerini dahil eder; yalnız bölge eklemek için artımlı `apply` komutu diğer kayıtları korur.

## Uygulama ve doğrulama

`data/course-catalog-index-2026.json` yalnız program özetlerini tutar. Dersler `data/course-catalog/<universityId>.json` dosyalarına ayrılır ve sunucuda seçilen üniversite için yüklenir. Bellek önbelleği dört üniversiteyle sınırlıdır. Bütün ders verisi istemci JavaScript'ine gönderilmez. Bölüm seçimi, önceki boş katalog yanıtının tarayıcı önbelleğinde kalmaması için yeniden doğrulama ister.

```text
python tests/turkey_course_parsers_test.py
npx tsc --noEmit
npx vinext build
node --test --test-concurrency=2 tests/*.test.mjs
```

PowerShell'de glob genişlemiyorsa test yollarını `Get-ChildItem tests -Filter '*.test.mjs'` ile listeleyip Node'a dizi olarak verin. API testleri derlenmiş worker'ı kullandığı için önce build çalışmalıdır. Otomatik kontroller program/kurum ayrımını, kaynakları, eksik kapsam hesabını, ders ayrıştırmasını ve gerçek kampüs mesafelerini denetler. Tarayıcı kontrolü ayrıca kayıt ekranındaki ders seçimini ve owner kapsam panelini kapsar. Yerel testler üretim doğrulamasının yerine geçmez.
