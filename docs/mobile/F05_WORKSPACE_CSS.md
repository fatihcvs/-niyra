# F05-06 — Notlar, Topluluklar ve Kampüs CSS sahipliği

5 Eylül 2026 · Üç pilot için tamamlanan dar CSS taşıması. Bu belge bütün global CSS borcunun, görsel kabulün veya fiziksel cihaz testinin tamamlandığını söylemez. TSX sınıf adları, callback, API ve veri davranışları bu CSS tesliminde değiştirilmedi.

## Taşıma ve sınır

| Pilot | Yeni/korunan açık sahip | Yapılan iş |
| --- | --- | --- |
| Notlar | [notes-workspace.css](../../app/notes-workspace.css) | Kaynak sekmeleri, toolbar/filtreler/chip/sayfalama, curated kaynak kartı/detayı ve sınav alanlarının 183 kuralı ortak dosyalardan alındı. Aynı koşul/seçici/özellikte ezilen6 eski deklarasyon kaldırıldı. |
| Topluluklar | [communities-workspace.module.css](../../app/communities-workspace.module.css) | Gerçek bileşen zaten CSS Modules kullanıyordu; başka bir global sahibi icat edilmedi. Aynı media+selector+property+öncelikte sonradan ezilen41 deklarasyon kaldırıldı. 390px istisnası ile son780px kurallarının sırası korundu. |
| Kampüs | [campus-workspace.css](../../app/campus-workspace.css) | `.campus-guide-*`, liste/harita/etkinlik/kaynak/form ve günlük öneri için143 kural alındı; ezilen1 tekrar kaldırıldı. Mobil detay/katman [campus-guide.module.css](../../app/campus-guide.module.css) sahibinde kaldı. |

Kaynak dosyalardan çıkarılan kurallar: `workspace-ui.css` 2 Notlar; `globals.css` 129 Notlar +127 Kampüs; `social-design.css` 19 Notlar +2 Kampüs; `social-workspaces.css` 14 Kampüs; `mobile-workspaces.css` 31 Notlar; `visual-polish.css` 2 Notlar. Yeni final dosyalarda tema uyumunu koruyan birer dar form kuralı da bulunur. Kurallar basitçe her seçicideki son değere indirgenmedi; farklı specificity, media, durum ve mobil form kapsamları korunur.

`workspace-ui.css` ortak Header/Search/State/tab primitives; `social-design.css` ortak token ve yüzeyler; `mobile-workspaces.css` mobil ortak başlık/arama/filtre davranışı sahibidir. Birden çok workspace'i kapsayan `:is(...)`/`:where(...)` kuralları yerinde bırakıldı. Böylece Pazar/Kütüphane/Eşleş gibi taşınmayan yüzeyler aynı kalan kural dizisini kullanır. Eski global `.community-*` vitrinleri canlı `CommunitiesWorkspace` sanılarak silinmedi. Konaklama modülü ve Kampüs mobil detay modülü değiştirilmedi.

Ana çalışma [layout](../../app/layout.tsx) içine aşağıdaki kesin sırayı entegre etti:

```tsx
import "./visual-polish.css";
import "./notes-workspace.css";
import "./campus-workspace.css";
import "./interaction-motion.css";
```

Önceki ortak dosyaların sırası korunur. Yeni dosyalar `.notes-*`/`.curated-*`/`.exam-*` ve ilgili `.campus-*` sınıflarının açık sahibidir; CSS Module hash'leri veya uygulama sınıf adları değiştirilmedi. Taşıma yeni UI kit'i veya yeni tasarım değildir.

## Eşdeğerlik kontrolünün yakaladığı gerçek fark

İlk taşıma denemesinde eski form tabanı yeni yükleme sırası nedeniyle ortak final değerleri geri eziyordu: Kampüs ve Notlar sınav alanlarında masaüstü 15px/44px yerine `.8125rem`/43px; koyu temada `var(--ink)` yerine eski koyu yazı rengi. Önce/sonra testi bu farkı yakaladı. Yeni sahiplerde **eski final** değerler korunarak düzeltildi; mobil formun mevcut16px ve kapsamına göre44/48px kuralları aynı kaldı. Kampüs module'ünün48px/16px hedefi korunur. Sınav alanındaki mevcut44px değeri bu refaktörde48px yapılmış gibi raporlanmaz.

Bu, bütün renk/ölçü değerlerinin yeniden tasarlandığı bir çalışma değildir. Yeni iki sahibin bazı eski hardcoded renkleri, ortak tema kuralları ve farklı specificity'leri hâlâ vardır; onları tasarım değişikliği olarak sadeleştirmek ayrı kanıt gerektirir.

## Otomatik kanıt

[Yeni test](../../tests/workspace-css-ownership.test.mjs), PostCSS ile gerçek kaynakları ayrıştırır; CSS Modules yerel sınıflarını fixture'da ayrı ad alanına taşır. [Önceki kural fixture'ı](../../tests/fixtures/workspace-css-baseline.json), taşıma öncesi kaynak hash'lerini ve açık test düğümlerine uyan kuralları içerir. [HTML fixture](../../tests/fixtures/workspace-css.html) uzun Türkçe başlıklar, kaynak/filtre/sınav alanları, boş/dolu kartlar, Kampüs form/detay ve topluluk form/detay kontrollerini tanımlar.

`320/390/767/768/780/781/1440 × açık/koyu` için normal ve `::after` deklarasyon kazananları eşit. [Cascade probe](../../tests/helpers/workspace-css-cascade.mjs) kaynak sırası, important, specificity ve `:is/:not/:has/:where` ağırlığını hesaplar; spacing/border için dar shorthand kontrolü yapar. Seçici eşleşmesi gerçek jsdom DOM'u üzerinde çalışır. **Tam CSS hesaplama/render motoru değildir:** font yüklenmesi, inherited/computed değerlerin bütünü, piksel taşması, yazı büyütme, yerleşim, paint ve gerçek mobil klavye kanıtı üretmez. Bilinmeyen tarayıcı desteğini başarıya dönüştürmez; bu sınırlar CUA/cihaz kabulünde ayrıca ele alınır.

Ortak dosyalarda taşınmayan bütün rule/declaration dizileri, taşıma öncesi PostCSS kayıtlarından hedef sahip kuralları çıkarılarak ayrıca karşılaştırıldı: altı dosyada diziler aynı. [Kayıt](../../exports/f05-workspace-css/unmoved-cascade-verification.json). [Taşıma envanteri](../../exports/f05-workspace-css/migration.json), [PostCSS ayrıştırma sonucu](../../exports/f05-workspace-css/postcss-validation.json) ve `exports/f05-workspace-css/before-*.css` kaynak kopyaları ayrıca durur. Kaynak kopyaları ekran görüntüsü veya production kanıtı değildir.

Gerçek çalıştırma:

```powershell
node --test --test-isolation=none tests/workspace-css-ownership.test.mjs tests/mobile-css-ownership.test.mjs tests/workspace-header-runtime.test.mjs tests/workspace-filters-runtime.test.mjs tests/campus-guide-layers-runtime.test.mjs tests/communities-flow-runtime.test.mjs tests/notes-discovery.test.mjs tests/curated-notes.test.mjs
# 56/56; 0 hata, 0 iptal, 0 skip. Yaklaşık20.020 saniye.
npx eslint tests/workspace-css-ownership.test.mjs tests/helpers/workspace-css-cascade.mjs
# exit0, boş çıktı.
git diff --check -- app/globals.css app/workspace-ui.css app/social-design.css app/social-workspaces.css app/mobile-workspaces.css app/visual-polish.css app/communities-workspace.module.css
# exit0; yalnız olağan LF/CRLF dönüşüm bildirimleri.
```

17 yeni testin yanında gerçek ReactDOM Header8, Filters6, Campus6, Communities6; CSS shell6, Notes discovery4 ve curated kaynak3 testi bu56'nın içindedir. Testleri tekrar çalıştırmak için mevcut izole araçlar `npm ci --prefix scripts/mobile-quality` ile kurulmalıdır; bağımlılık yoksa test sessiz skip yapmaz. Tam build, repository TypeScript ve bütün site suite'i bu teslimde çalıştırılmadı; ana çalışma bunları sıralar.

## Tarayıcı/cihaz kabulü ve yeni ayrı bulgu

Ana çalışma CSS sonrası gerçek uygulamayı CUA ile kontrol ediyor. 320/390 ve780/781 sınırı; açık/koyu, uzun metin, yüzde200 yazı, form/filtre paneli açıkken bounded scroll, header/alt gezinme ve masaüstü kolonlarının piksel kabulü bu dosyada **tamamlandı sayılmaz**. CSS karşılaştırmasının14 kombinasyonu,14 gerçek tarayıcı screenshot'ı demek değildir.

CUA'da galeri üzerinde çalışan gerçek `NotesWorkspace` filtre panelinde, filtre değişince sonradan mount edilen aktif chip ve kartların modal dışından erişilebilirlik ağacına girdiği ayrıca görüldü. Bu, CSS sahipliği taşımasının kapanışıyla karıştırılmayan **ortak katman dinamik sibling izolasyonu** bulgusudur. `useAppLayer` düzeltmesi ve üç yeni gerçek ReactDOM testiyle birlikte ilgili27 davranış testi geçti; mekanizma ve sınırlar [F04 kaydında](F04_NAVIGATION_STATUS.md#dinamik-filtre-sonuçlarının-katman-izolasyonu).

CUA galeri tekrarında320×568 koyu temada ders + Çıkmış Sorular seçimi sonrasında dar izolasyon kabulü geçti: [DOM JSON](../../exports/mobile-quality-continuation-2026-09-05/notes-filter-dynamic-isolation.json) yeni `notes-active-filters` ve `feature-note-card` düğümlerinde `inert:true`, dialog'da `inert:false` ve `(0,0,320,568)`, `scrollWidth:320` kaydeder. [Görüntü](../../exports/mobile-quality-continuation-2026-09-05/notes-filter-320-dark.png) **GALERİ SİMÜLASYONU** etiketlidir. Gerçek production bileşeni açık development-only preview yanıtlarıyla çalışır; gerçek hesap oturumu kapalıdır. Bu kayıt oturumlu/API/cihaz kabulü veya eksiksiz görsel kalite kanıtı değildir. Fiziksel Android IME/Back/TalkBack ve mağaza kapıları açıktır.

## Taşıma sonrasındaki kasıtlı Notlar düzeltmeleri

Ana çalışma CUA galerisindeki aynı production Notlar detay bileşeninin dış ve iç yüzeylerinin aynı anda kaydığını ve uzun başlığın kapat düğmesini26px'e sıkıştırdığını buldu. `notes-workspace.css` içine Notlar ile sınırlı dış overlay `overflow:clip`, iç dialog `min-height:0`, mobil görünür viewport ve48px küçülmeyen kapat düğmesi eklendi. DOCX örneğini gösteren gerçek kart bileşeninin büyük dosya kapağı, koyu temada açık feedback düğmeleri ve yazı kontrastı ayrıca64px dosya kimliği, tam genişlikte eylemler ve ortak tema renkleriyle düzeltildi. Bunlar **taşıma eşdeğerliği** değildir; sonraki ürün değişiklikleridir. Galeri veri sınırı bu görsel düzeltmeler için de geçerlidir.

17 CSS testi sonrasında yeniden geçti; eski baseline'ın kapsadığı curated kaynak, filtre/form ve Kampüs/Topluluklar düğümleri aynı kaldı. Baseline `.feature-note-card` ve `.feature-overlay` geometrisini kapsamıyordu; yeni kart/overlay için piksel, kontrast veya tek scrollbar başarısı bu17 testten çıkarılamaz. Kaynak baseline'ı yeni tasarımı eskiymiş gibi göstermek için yeniden üretilmedi. Bu yüzeylerin gerçek CUA görsel/geometri kabulü ana çalışmanın ayrı kaydıdır.
