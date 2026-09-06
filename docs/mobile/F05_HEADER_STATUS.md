# F05 — Ortak mobil başlık uygulama kaydı

5 Eylül 2026 · Yapısal başlık teslimi · Görsel tercih ve cihaz kabulü ayrı

**Tarihsel geçiş kaydı:** Aşağıdaki `actions`/CSS fallback ve ilk test sayıları ilk teslimi anlatır. Aynı gün sonraki geçişte fallback kaldırıldı, bütün Header çağrılarına zorunlu typed `screenId` eklendi. Güncel sözleşme ve 8 durumluk tarayıcı kanıtı [F05_SHARED_COMPONENTS.md](F05_SHARED_COMPONENTS.md) içindedir.

Bu kayıt [F01 deneyim sözleşmesindeki](F01_EXPERIENCE_CONTRACT.md) tek başlık ve gerçek child callback sınırının uygulanan kısmını açıklar. F05'in tüm bileşen sistemi, görsel A/B seçimi veya Android cihaz kabulü tamamlandı demek değildir.

## Uygulanan davranış

- `WorkspaceHeader` açık `primaryAction` ve `secondaryActions` tanımlarını kullanır. Tanım `id`, tam erişilebilir `label`, isteğe bağlı `icon`, `disabled`, `busy` ve gerçek `onPress` callback'ini taşır. `mobileTitle` masaüstündeki uzun başlığı değiştirmeden kısa mobil başlık verebilir.
- 11 ikincil bölüm, mobil başlıklarının sahibidir: Notlar, Kütüphane, Topluluklar, Eşleş, Bildirimler, Kaydedilenler, Güvenlik, Ayarlar, Pazar, Kampüs, Kampüs Anlık. `MobileHeader` aynı `ownsWorkspaceMobileHeader` kararını kullanarak bu bölümlerde ikinci başlık üretmez. Karar ilk render'da verilir; parent'a effect ile başlık kaydı yapılmaz.
- Akış/Keşfet/Profil ve kişi detayının shell düzeni, Mesajlar'ın bağımsız başlığı korunur. Keşfet'in WorkspaceHeader'ı `data-mobile-header="shell"` ile mobilde gizlenir, masaüstünde kalır.
- Geri düğmesi `AppNavigationProvider` içindeki mevcut `onBack` handler'ını çağırır. Bu teslim yeni history katmanı, yeni API veya yeni gönderim yolu eklemez.
- Mobilde geri, başlık, ana işlem ve varsa overflow tek satırdadır. İkonlu uzun CTA 48px hedef ve tam `aria-label` kullanır. İkonsuz eski çağrıda metin sınırlanır, tam erişilebilir adı korunur. Masaüstünde tam işlem metinleri ve ikincil eylemler görünürdür.
- Arama/sekme/filtreler kendi `WorkspaceSearch` alanında kalır; header menüsüne taşınmaz. Menünün boş hali üretilmez; busy/disabled işlemler çalıştırılamaz. Escape ve işlem seçimi sonrası odak menü tetikleyicisine döner; dış tıklama menüyü kapatır.
- Eski `actions` prop'u geçiş uyumluluğu için korunur. Açık props verilince eski actions kullanılmaz. Eski buton clone'unda callback, disabled ve form semantics korunur. Bu fallback hâlâ CSS sınıfından eski önceliği okur; yeni çağrılar buna dayanmaz.
- Notlar/Topluluklar/Kampüs başlangıcındaki ikinci işlem satırı ve 16px fazladan üst padding kaldırıldı. Eski blanket `has-mobile-page-header` gizleme kuralları kaldırıldı. Legacy RefreshButton menüde kalırsa mobilde görünürlüğü sağlanır; güncel topluluk çağrısı explicit eyleme taşındığından modüldeki eski `.workspace-refresh` gizleme kuralına bağlı değildir.

## Değişiklik sahipliği

Ortak bileşen ve stiller: `app/workspace-ui.tsx`, `app/workspace-ui.css`, `app/mobile-app.tsx`, `app/mobile-app.css`, `app/mobile-workspaces.css`.

Yalnız header prop/import geçişi yapılan çağrılar: `app/campus-guide.tsx`, `app/campus-market.tsx`, `app/campus-pulse.tsx`, `app/library-occupancy.tsx`, `app/social-match.tsx`, `app/saved-workspace.tsx`, `app/communities-workspace.tsx`. Yerel dialog, liste, form, polling ve mutation işleyişleri bu geçiş için yeniden yazılmadı.

Ana çalışma tarafından yapılan entegrasyon: `app/page.tsx` provider bağlantısı ve `app/product-features.tsx` Notlar/Bildirimler/Güvenlik çağrıları. Bu dosyalar başlık alt görevi tarafından değiştirilmedi. AppNavigationProvider'ın diğer navigation/session sorumlulukları ana çalışma kapsamındadır.

## Tekrar çalıştırılabilir test

Uygulamanın kök bağımlılıkları kurulu olmalıdır. Ek DOM test aracı kök package.json'a eklenmedi; `scripts/mobile-quality/package.json` ve lock dosyası içinde `jsdom@26.1.0` sabittir. Bu klasörün node_modules'u ayrı `.gitignore` ile dışlanır.

```powershell
npm ci --prefix scripts/mobile-quality --ignore-scripts
npm run test:headers --prefix scripts/mobile-quality
```

Doğrudan eşdeğer: `node --test --test-isolation=none tests/workspace-header-runtime.test.mjs`.

Eksik jsdom kurulumu testleri skip etmez; import hatasıyla başarısız olur. Test gerçek React, ReactDOM ve jsdom düğmeleri/olayları kullanır; hook taklidi veya regex ekran snapshot'ı değildir. `next/image` yalnız framework bağımsız başlık testinde img adaptörüyle değiştirilir. Sunucuya mesaj/gönderi/topluluk gönderilmez; gerçek kullanıcı tarayıcısı açılmaz veya kontrol edilmez.

| Kontrol | Sonuç |
| --- | --- |
| 11 bölümde ortak sahiplik; shell root'ları ve Keşfet ayrımı | Geçti |
| Ana action ve context geri handler'ı tam birer kez | Geçti |
| Gerçek secondary action, aç/kapat/Escape/dış tıklama ve focus | Geçti |
| Disabled/busy işlemlerin mutation yapmaması; boş action listesi | Geçti |
| Yeniden render'da Kampüs sekmesinin label/callback değişimi, Bugün'de ana action olmaması | Geçti |
| Eski fragment/button/RefreshButton callback uyumluluğu | Geçti |
| Arama/filtrenin header'dan bağımsız DOM ve toggle durumu | Geçti |

Çalıştırılan sonuç: **7 test, 7 geçti, 0 başarısız, 0 skip**. Dokuz değişen TSX dosyasında scoped ESLint hatasız. PostCSS parser: workspace-ui.css 125, mobile-app.css 118, mobile-workspaces.css 72 kural; parse hatası yok. İlgili diff whitespace kontrolünde hata yok.

Sonraki dar hiyerarşi düzeltmesi: `MobileHeader` opsiyonel `titleAs="h1" | "p"` alır; mevcut çağrılar `h1` kalır. Profilin kendi hero başlığının yanında kullanılan bar, `p` olarak aynı class/tipografi ile çizilebilir. Ek compositional React DOM testi, handle barı + hero birleşiminde tek `h1`, gerçek geri callback'i ve Keşfet'in varsayılan `h1` davranışını doğrular; gerçek profil sayfasının görsel kontrolü sayılmaz. Başlık testi artık **8/8**; katman, araç, galeri ve marka testleriyle birleşik koşum **37/37, 0 skip**. Test fixture'ları suite kapsamına taşındı ve ortak helper her kapanışta global descriptor'ları geri yükler.

## Açık kabul kanıtı

jsdom fiziksel yerleşim, CSS media query geometrisi veya gerçek IME ölçmez. Yukarıdaki testler 48px ölçüldü, 780/781px'de kesin taşma yok veya Android Back cihazda geçti iddiası değildir.

Ana çalışma CUA ile gerçek uygulamada Notlar, Topluluklar, Kampüs, Bildirimler, Ayarlar ve Keşfet'i; 320/390/780/781/1440px, iki tema ve açık/kapalı menü durumlarında doğrulamalıdır. Özellikle başlık sayısı, ilk içerik y konumu, uzun etiket hedefleri, yenilemenin gerçekten görünmesi, Kampüs sekmesiyle doğru formun açılması ve masaüstündeki tüm eylemler kaydedilmelidir.

F02 görsel A/B seçimi, F05'in diğer ortak bileşenleri, F04 genel modal history kapsamı, gerçek Android klavye/geri, azaltılmış hareket ve öğrenci kabulü kendi kanıtlarıyla açık kalır. Bu kayıt için deploy, Play paketi veya yayın işlemi yapılmadı.
