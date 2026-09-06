# F13 — Kapalı katmanların global dinleyici yükü

Tarih: 5 Eylül 2026. Dar kapsam: `useAppLayer` global EventTarget kayıtları. Ortak katman mimarisi, history girişi sahiplenme, focus/inert ve taslak sözleşmesi değiştirilmedi.

Önceki listener effect'i her mount'ta kapalı gönderi menüsü ve medya görüntüleyicisi için de `window.popstate` ve `document.keydown` bağlıyordu. Effect artık hiç açılmamış kapalı katmanda kayıt yapmaz. `keydown` yalnız açık katmana bağlıdır. Önceden açılmış, `onRestore` sağlayan kapalı katman yalnız Forward için `popstate` tutar; `onRestore` yoksa kapandığında iki kayıt da kaldırılır.

`tests/app-layer-listener-load.test.mjs`, gerçek ReactDOM + StrictMode ile **200 kapalı hook** oluşturur; gerçek `addEventListener`/`removeEventListener` çağrıları ve callback/capture kimlikleri sayılır:

| Durum | document keydown | window popstate |
| --- | ---: | ---: |
| 200 hiç açılmamış katman | 0 | 0 |
| Yalnız 137. katman açıldı | 1 | 1 |
| Draft değiştirme/rerender | 1 | 1 |
| Back ile kapandı | 0 | 1 |
| Forward ile aynı giriş açıldı | 1 | 1 |
| Escape ile kapandı | 0 | 1 |
| Unmount | 0 | 0 |

Test aynı zamanda draft'ın Forward dönüşünde korunmasını, yeni history adımı eklenmemesini, odağın açan düğmeye dönmesini ve body kilidinin bırakılmasını doğrular. İkinci test Forward callback'i olmayan katmanın kapanınca iki dinleyiciyi de bıraktığını doğrular. Önceden ziyaret edilmiş katmanların restore dinleyicileri yaşamları boyunca kalabilir; merkezi tek-listener registry eklenmedi.

Yerel doğrulama:

```powershell
node --test --test-isolation=none tests/app-layer-listener-load.test.mjs tests/app-layer-runtime.test.mjs tests/course-hub-runtime.test.mjs tests/post-media-gallery-runtime.test.mjs tests/media-layer-regressions-runtime.test.mjs tests/profile-content-state.test.mjs tests/profile-safety-runtime.test.mjs tests/profile-editor-runtime.test.mjs tests/feed-post-runtime.test.mjs tests/communities-flow-runtime.test.mjs tests/campus-guide-layers-runtime.test.mjs tests/campus-tools-layers-runtime.test.mjs
node node_modules/eslint/bin/eslint.js app/use-app-layer.ts tests/app-layer-listener-load.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

**72/72 test geçti**, scoped ESLint ve TypeScript exit 0. Bütün testler yerel/sentetik; mevcut kullanıcı veya üretim verisine yazılmadı. Bu sonuç dinleyici sayısı ve davranış kanıtıdır; cihaz FPS, heap/bellek miktarı, pil tüketimi veya render süresi kazanımı ölçümü değildir. Fiziksel cihaz ve birleşik build kabulünü kapatmaz. Uygulama kaynak dosyası bu teslimin sonunda donduruldu; ana görev son tarayıcı/build kontrolünü ayrıca yapar.
