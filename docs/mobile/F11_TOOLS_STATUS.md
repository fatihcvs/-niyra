# Kampüs araçlarının katman ve taslak geçişi

5 Eylül 2026 · Yerel uygulama/test kaydı; bütün F11 fazı tamamlandı anlamına gelmez.

## Yedi kampüs aracı kapsamı

| Araç | Bu alt görevin uygulaması | Doğrulama sınırı |
| --- | --- | --- |
| Notlar | Root'un product-features entegrasyonu; burada değiştirilmedi | Root test/CUA kaydı gerekir |
| Topluluklar | Önceki F05 gerçek başlık callback'i; F10 akışı ayrı sahiplikte | Bu teslimde katman testi yapılmadı |
| Kampüs | Mobil liste → ayrıntı, kaynak/harita ayrımı; create taslakları | `F11_CAMPUS_STATUS.md`, 6 gerçek bileşen testi |
| Kampüs Anlık | `pulse.create` ve `pulse.report`; live/confession ayrı kontrollü taslak; File cache | 2 gerçek component testi; fiziksel dosya seçici/IME ayrı |
| Kütüphane | `library.create`, `library.checkin`; kontrollü alan, özellik, süre ve filtre | 2 gerçek component testi; doluluk verisi uydurulmaz |
| Pazar | `market.create`, `market.contact`; ilan/fiyat ve ilan kimliğine göre metin; File[] cache | 3 gerçek component testi; görsellerin yeniden açılan input boşken cache'ten gönderimi mock ile doğrulandı |
| Eşleş | `match.request`, `match.report`; hedef kimliğine göre taslak; düzenlenmiş tercihlerin refresh/remount koruması | 2 gerçek component testi; report katmanı ortak hook'a bağlı, uçtan uca moderasyon sonucu kanıtı yok |

Kaydedilenler kampüsün yedi aracına ek kapsamdır: query ve medya filtresi hesap bağlamında korunur; mevcut renderPost/mutation callbacks ve sayfalama iptal koruması değiştirilmedi. Bunun için bir remount/hesap ayrımı testi bulunur.

## Ortak sözleşme

Yeni `app/use-workspace-drafts.ts` yalnız kontrollü string alanlarını tür/kimlik kovasında tutar. `useWorkspaceState` üzerinden kısa süreli, hesap kapsamlı uygulama belleğini kullanır. URL/history/localStorage veya sunucuya taslak yazmaz. Tüm yeni katmanlar mevcut `useAppLayer` ile aynı-URL history, Back, Escape, odak dönüşü, Tab ve inert davranışına bağlanır.

Form API'si, doğrulama sınırları ve gerçek gönderim callback'leri korunur. Hata mesajları katman içinde görünür; form taslağı yalnız doğrulanmış başarıda temizlenir. Bekleyen işlemlerde açık UI/Escape kapatma devre dışı olabilir; sistem Back kapanışı engellenmez. Back kendi başına ilan, mesaj, rapor, check-in veya paylaşım göndermez.

Pazar birincil eylemi İlanlar'da İlan ver, Fiyatlar'da Fiyat ekle olur; Mesajlar sekmesinde yoktur. Diğer oluşturma türü secondary action olarak erişilebilir kalır. Mevcut ilan sahibine ve Eşleş kişi profiline bağlantılar `AppLink` kullanır; normal uygulama içi gezinme ve gerçek href birlikte korunur.

Pulse görseli kapatırken atılmaz; live formu yeniden açıldığında önizlemesi korunur/yeniden hazırlanır. Gönderim, yeniden açılmış native input'a güvenmek yerine saklanan File'ı FormData'ya koyar. Confession gönderimi image alanı taşımaz. Pazar da saklanan File[] listesini kullanır. Native dosya input'ları programatik olarak doldurulmaz. Fotoğraf upload'ı başarısız olan, sunucuda zaten oluşmuş Pazar ilanı için mevcut kısmi başarı açıklaması korunur; yeni bir idempotent medya tekrar-deneme akışı bu teslimde eklenmedi.

Yeni `workspace-layer.module.css` yalnız form kontrollerinin minimum genişliği, mobil 16px input ve 48px hedeflerini düzenler. Masaüstü kart/grid stilleri değiştirilmedi. Hangi elemanın gerçekten kaç piksel olduğu ayrı CUA ölçümüdür.

## Tekrar çalıştırma ve kanıt

```powershell
npm ci --prefix scripts/mobile-quality --ignore-scripts
npm run test:campus-tools --prefix scripts/mobile-quality
npx eslint app/campus-market.tsx app/campus-pulse.tsx app/social-match.tsx app/library-occupancy.tsx app/saved-workspace.tsx app/use-workspace-drafts.ts
```

Çalıştırılan test: **10/10 geçti, 0 skip**. Gerçek ReactDOM/jsdom, gerçek modül ve ortak hook/state çalışır; tüm API yanıtları açık sentetik mock'tur. Gerçek kullanıcı, mesaj veya veritabanı mutasyonu yoktur. İç içe katman/busy/focus davranışının ortak testleri ayrıca `tests/app-layer-runtime.test.mjs` içindedir.

Tek process birleşik koşumda test hook'ları `test.describe` kapsamındadır; her fixture kapandığında ortak helper önceki global descriptor'ları geri yükler. Böylece `--test-isolation=none` altında başka dosyanın FormData veya window ortamını değiştirmez. Header, ortak katman, Kampüs, bu beş araç, galeri ve marka asset testleri birlikte **37/37, 0 skip** geçti; tek dosyanın izole başarısına dayanılmaz.

Kalan kabul: CUA ile her formda doldur → Back/UI kapat → yeniden aç; 780/781px, iki tema, scrollbar/alt menü ve kısa ekran; fiziksel Android klavye/Back/dosya seçici; bekleyen istekte başka bölüme geçiş/hesap değişimi; diğer araçların veri ve kaynak sözleşmesi. Yedi araç için bu kanıtlar kapanmadan F11 veya F13 tamamlandı denmez.
