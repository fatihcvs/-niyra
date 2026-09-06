# F04/F11 — Alt sayfalarda hesaba bağlı 401 kontrolü

2026-09-05. `lib/authenticated-fetch.ts` ve `app/use-authenticated-fetch.ts`, alt sayfaların yalnız yerel hata göstermek yerine geçerli oturumun sona erdiğini ana uygulamaya bildirmesini sağlar. Global `fetch` veya tarayıcı prototipleri değiştirilmez.

## Sözleşme

`useAuthenticatedFetch()` varsayılan olarak `useAppNavigation` içindeki `ownerScope` ve `onSessionExpired` callback'ini kullanır. Provider üstündeki çağıranlar `useAuthenticatedFetch({ownerScope,onSessionExpired})` verebilir. Owner, sunucuda doğrulanmış mevcut hesap/revizyon bağlamından gelmelidir; URL veya kullanıcı girişi yeterli değildir.

- Her owner için ayrı istek kapsamı kurulur. Layout-effect cleanup unmount veya owner değişiminde eski kapsamı geçersizleştirir; yeni owner'a ait çağrı başka bir kapsam kullanır. Aynı owner'da callback kimliği değiştiğinde devam eden istekler gereksiz iptal edilmez.
- Aktif kapsam ve iptal edilmemiş çağrı 401 alırsa önce kendi paralel yanıtlarını geçersizleştirir, sonra `onSessionExpired` çağırır. Bu kapsam birden fazla expiry callback'i üretmez. Ana oturum akışı özel belleği temizler ve giriş ekranına döner.
- Eski owner, kapalı kapsam veya abort edilmiş isteğin yanıtı `AbortError` olur; 401 callback'i çalışmaz. Geçersiz kapsamdan yeni bir network çağrısı başlatılmaz.
- `Response` nesnesi aynen döner. Helper JSON okumaz, clone etmez, header/credential/body değiştirmez. Mevcut `readJson` ve `response.json()` yolları gövdeyi bir kere okumaya devam eder.
- Provider bulunmayan bağımsız kullanımlarda owner veya session callback'i uydurulmaz; 401 mevcut yerel hata yoluna döner. Bu, sunucu doğrulamasını devre dışı bırakmaz.
- `fetch.beginResponseCheck(signal?)`, fetch dışındaki taşıma başlamadan owner/generation yakalar. `isCurrent()` ilerleme/geç callback kontrolü, `accept(status)` gövdeyi okumadan aynı 401 kontrolü içindir.

Kapsamın kapanması kendi başına sunucu işlemini geri almaz. Fetch çağıranları mevcut AbortSignal temizliğini korur. Yanıtın gövdesi helper'dan döndükten sonra okunuyorsa, o gövdeye bağlı component state güncellemelerinde mevcut request/active kontrolleri yine gereklidir. Yeni hesaba geçerken özel component state'inin yeniden kurulması da ana provider'ın owner key sınırına bağlıdır.

## Bağlanan kaynaklar

`CampusGuideWorkspace` (yurt deneyimleri dahil), `CampusPulseWorkspace`, `LibraryOccupancyWorkspace`, `CampusMarketWorkspace` (ilan görselleri dahil), `SocialMatchWorkspace`, `HousingDirectory`, `SavedWorkspace`; `product-features.tsx` içindeki `NotesWorkspace`, `NotificationsWorkspace`, `SafetyWorkspace` ve bu dosyadaki eski community bileşeni.

Pulse filtre isteği ve seçili notun yorum isteği cleanup sırasında AbortSignal taşır. Not yüklemesinin mevcut XHR ilerleme yolu aynı scope kontrolüne bağlandı: tek pending request ref'i, owner/unmount değişiminde handler temizliği ve abort, gecikmiş 401/başarı callback'lerinin elenmesi. Not metadata/form semantiği ve upload gövdesi değişmedi; gerçek dosya yüklenmedi.

Home ve profil editörünün aynı helper'a bağlanması ana görev tarafından ayrı entegrasyondur. Bu belge alt sayfa değişikliklerinin kanıtını kaydeder.

## Doğrulama ve sınır

```text
node --test --test-isolation=none tests/authenticated-fetch.test.mjs tests/workspace-session-runtime.test.mjs tests/campus-tools-layers-runtime.test.mjs tests/campus-guide-layers-runtime.test.mjs tests/notes-discovery.test.mjs tests/app-layer-runtime.test.mjs
# 29/29 geçti; React act uyarısı yok.
```

İki temel test gerçek Response nesnesinin/gövdesinin korunmasını, paralel yanıtları, owner değişimini, AbortSignal ve kapalı kapsamı doğrular. İki ReactDOM senaryosu gerçek Notes GET/not-upload XHR ile Campus/Housing bileşenlerinde aktif 401 ve eski owner yanıtlarını çalıştırır. Diğer 25 test mevcut filtre/katman/draft/notes discovery davranışlarının regresyon kontrolüdür. Hedef lint ve helper strict TypeScript kontrolü geçti.

Kontrollü yanıtlar test ortamındadır; gerçek kullanıcı API verisi okunmadı/değiştirilmedi. Hosted cookie süresi, farklı tarayıcı sekmeleri, gerçek ağ zamanlaması ve Android cihaz oturumu ayrıca doğrulanmalıdır. Yerel test geçişi bu kabul kapılarını kapatmaz.
