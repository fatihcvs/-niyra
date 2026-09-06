# F05 — Ortak mobil filtre katmanı

5 Eylül 2026. `WorkspaceSearch` mevcut prop API'sini koruyarak 780px ve altında ortak `useAppLayer` alt penceresini kullanır. Bu dar teslim bütün F05 bileşen/CSS temizliğinin, cihaz veya görsel kabulünün tamamlandığı anlamına gelmez.

## Gerçek davranış

- Mobil Filtreler düğmesi, adını `h2` başlığından alan modal katmanı açar. “Seçimlerin hemen uygulanır.” açıklaması gerçek kontrollü `children` sözleşmesini anlatır. Seçim doğrudan mevcut callback'i çağırır; ara kopya, sahte Uygula veya geri alan Vazgeç yoktur.
- Tamam, kapat simgesi, backdrop ve Escape ortak kapanışı kullanır. Sistem Back önce filtre katmanını kapatır; Forward aynı paneli açar. Filtre değeri ve son sonuç sayısı parent'ın gerçek state'idir, kapatırken sıfırlanmaz. `onReset` varsa sheet içinde aynı gerçek Temizle callback'i de erişilebilir kalır.
- Başlık ve footer kaydırılan kontrollerin dışındadır; panelin bounded iç scroll'u, visual viewport yüksekliği/top konumu ve safe-area dolgusu vardır. Ana kontroller 48px, mobil input/select 16px kuralları kullanır. Bunlar CSS sözleşmesidir, jsdom piksel ölçümü değildir.
- Ortak hook body scroll kilidi, sibling inert, Tab odağı ve açan düğmeye dönüşü sağlar. Bir detail katmanının içinde açılırsa Back önce filtreyi kapatır; üst detayın kilidi kalır. Ayrı history sistemi yazılmadı.
- `useSyncExternalStore` yalnız `(max-width: 780px)` boolean'ını okur. Server snapshot masaüstü/inline markup üretir; hydration'da gerçek media query benimsenir. Media query değişimi açık paneli kapatır; desktop'a geçiş body/focus kilidini bırakır. Desktop Forward mobil modalı açmaz; tekrar mobile dönmek eski paneli kendiliğinden açmaz.
- Tek `children` ağacı her iki düzenin aynı `.workspace-filter-panel` elemanında kalır. Resize/Back/Forward sırasında control subtree remount edilmez. Native input'a programatik dosya yazılmaz. Parent filtreleri async olarak tümüyle kaldırırsa katman kapanır; tekrar gelmesi eski open state'i canlandırmaz.
- 781px ve üzerinde wrapper'lar `display:contents`, filtre paneli mevcut inline düzenindedir. Mevcut doğrudan `.workspace-filter-panel > label` seçicileri korunur. Yeni `workspace-filters.module.css`, eski mobil panel kart/grid yüzeyini yalnız açık sheet içinde dar seçiciyle değiştirir; diğer global CSS katmanları silinmiş sayılmaz.
- Entry animasyonu yalnız iç surface opacity/translate ile 180ms; fixed overlay veya sticky ekran atası taşınmaz. İşletim sistemi ve uygulama reduced-motion seçimi hareketi kapatır. Herhangi bir FPS/INP iddiası yoktur.

## Tekrar çalıştırma

```powershell
npm ci --prefix scripts/mobile-quality --ignore-scripts
npm run test:filters --prefix scripts/mobile-quality
node --test --test-isolation=none tests/workspace-filters-runtime.test.mjs tests/workspace-header-runtime.test.mjs tests/app-layer-runtime.test.mjs tests/design-lab-runtime.test.mjs tests/mobile-shell.test.mjs
npx eslint app/workspace-ui.tsx tests/workspace-filters-runtime.test.mjs
```

Son odaklı birleşik koşu **36/36, 0 skip**: 6 yeni filtre testi, 8 başlık, 5 ortak katman, 7 galeri ve 10 mevcut mobil kabuk regresyonu. Gerçek ReactDOM/common hook kullanılır; yeni filtre senaryolarında API çağrısı yoktur.

Altı test: anında tek callback + Back/Forward aynı input/selection; Tab/Escape/reset; 820→390→820→390 ve desktop Forward; nested detail body/inert/focus; async bütün filtrelerin kaldırılması; tek control ağacı ve modal oluşturmayan server markup. Test hook'ları `test.describe` kapsamındadır; ortak helper kapanışta global descriptor'ları geri yükler.

## Açık kabul

Root CUA ile Notlar/Topluluklar ve başka gerçek `WorkspaceSearch` caller'larında 320/390/780/781/820px, iki tema, uzun seçenek, çok filtre ve kısa viewport'u ölçmelidir. Özellikle footer'ın görünmesi, panelin içeriden kayması, alt menünün/inert alanın kapanması, dışarı taşma olmaması ve desktop kontrol düzeni kaydedilmelidir. jsdom CSS layout motoru değildir.

Native select popup, Android klavye/ilk Back önceliği, TalkBack ve process yeniden açılışında parent filtre kalıcılığı ayrıca doğrulanmalıdır. Bu bileşen filtreleri kendi adına storage'a yazmaz; parent'ın owner scope/state politikasını değiştirmez.
