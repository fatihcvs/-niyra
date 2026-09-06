# Kampüs liste/ayrıntı ve form katmanları

5 Eylül 2026 · F11-02 / F11-03 uygulama kaydı; F04-05 ortak katman test katkısı.

Bu kayıt bütün F11 fazının, üretim yayınının veya fiziksel Android kabulünün tamamlandığını söylemez. `app/campus-guide.tsx` ve yeni, dar kapsamlı `app/campus-guide.module.css` değişikliklerini belgeler.

## Uygulanan akış

- 780px ve altında Mekânlar listesi ilk içeriktir. İlk seçili kayıt haritası listeyi aşağı itmez; harita iframe'i Ayrıntılar düğmesine basılana kadar oluşturulmaz. Liste görünürken gizli bir harita isteği başlatılmaz.
- Ayrıntılar; ad, kategori, açıklama, adres, erişilebilirlik özellikleri, varsa harita, kaynak bağlantısı, kontrol tarihi ve kaynak türünün anlamını ayrı katmanda gösterir. Bilinmeyen koordinat için harita üretilmez. Mevcut güncellik/arıza bildirme/arşiv callbacks korunur.
- `campus.place-detail` katmanındaki geri düğmesi ve web history Back listeye döner; seçili kayıt bileşen durumunda kalır ve aynı bileşendeki Forward aynı ayrıntıyı tekrar açar. Kaynak/harita bağlantıları gerçek dış bağlantı olarak kalır. 781px ve üzerinde seçili noktanın mevcut aside düzeni korunur.
- Başlık eylemi Mekânlar → Mekân ekle, Etkinlikler → Etkinlik ekle, Konaklama → Yurt ekle olarak gerçek formu açar. Bugün'de ekleme eylemi yoktur; içerik yenileme ikincil eylem olarak kalır. Günlük öneri ve yakın çevre kartından seçilen mekâna geçerken önce eski mekân filtresi temizlenir.
- Üç oluşturma formu tek `campus.create` history katmanını paylaşır; son açılan form türü Forward için saklanır. Form alanları kontrollüdür. Metin/select alanları ve özellik seçimleri tür bazında ayrı `useWorkspaceState` anahtarlarında tutulur. Aynı kullanıcı bağlamında başka bölüme gidip geri gelme taslakları korur; ortak store kullanıcı değişiminde temizlenir, eski kullanıcının yazımı reddedilir. Bu geçici bellektir; URL, history state, localStorage veya sunucuya taslak içeriği yazılmaz.
- Kapalı formlar ayrıca mounted-hidden kalır. Bu tek başına tarayıcı form-restoration güvencesi değildir; kontrollü state kaynak kabul edilir. Başarılı yanıt yalnız gönderilen form türünün taslağını temizler. Hata form içinde görünür ve yeniden deneme alanları korunur.
- Bekleyen istek sırasında explicit kapatma/Escape ve yeni gönderim devre dışıdır. Sistem Back katmanı kapatır; bekleyen sonucu başarılı varsaymaz ve taslak durumunu silmez. Bu davranış ortak `useAppLayer` sözleşmesidir.

## Tekrar çalıştırılabilir yerel kanıt

Uygulama kök bağımlılıkları kurulu olmalıdır. DOM aracı yalnız `scripts/mobile-quality` altında sabit `jsdom@26.1.0` olarak bulunur; eksikse test import hatası verir, skip etmez.

```powershell
npm ci --prefix scripts/mobile-quality --ignore-scripts
npm run test:layers --prefix scripts/mobile-quality
npx eslint app/campus-guide.tsx
```

Çalıştırılan sonuç: **10 test, 10 geçti, 0 başarısız, 0 skip**. Scoped ESLint hatasız; yeni CSS PostCSS ile 24 kural olarak parse edildi. İlgili diff whitespace kontrolü hatasız.

`tests/app-layer-runtime.test.mjs` ortak hook'u değiştirmeden gerçek ReactDOM ile dört senaryoyu doğrular: iç içe Back/Forward ve taslak, yalnız üst katmanda Tab/Escape ve iç içe inert/body kilidi, busy sırasında sistem Back, farklı workspace URL'sine geçişte fazladan history tüketmeme.

`tests/campus-guide-layers-runtime.test.mjs` gerçek Kampüs bileşeninde altı senaryoyu doğrular: liste → map mount → Back/Forward, koordinatsız kaynak, 781px desktop DOM ayrımı, gerçek sekme/form callback eşlemesi, kontrollü taslakların Back/remount/hesap ayrımı, bekleyen sahte isteğin Back ile kapanması ve hatada yeniden deneme alanları.

Test verisi açıkça sentetiktir; istekler yerel mock üzerinden sonuçlanır. Canlı kullanıcıya veya veritabanına içerik yazılmaz. Yalnız bağımsız HousingDirectory alt bileşeni, bu testin kapsamındaki form/sekme davranışını izole etmek için küçük bir DOM etiketiyle değiştirilir. React, ortak başlık, navigasyon bağlamı, ortak state ve katman hook'u gerçek koddur.

## Açık sınırlar ve kabul

- jsdom layout motoru, native inert, mobil IME veya browser form restoration uygulamaz. Focus testinde görünür elemanların `getClientRects` sonucu ve inert attribute reflection açıkça uyarlanmıştır; buradan piksel geometrisi veya fiziksel cihaz başarısı çıkarılamaz.
- CUA'da gerçek uygulama için liste ilk görünümü, ayrıntı yüksekliği ve kaynak erişimi; Geri/İleri; oluşturma alanını doldur → UI kapat/Back → yeniden aç; farklı bölümden geri gel; 390/780/781px ve iki tema ayrıca doğrulanmalıdır. Özellikle kullanıcının tarayıcısındaki form-restoration davranışı DOM testinden ayrı kapıdır.
- Native klavye açıkken ilk Back'in IME'yi kapatması, Android sistem çubukları ve fiziksel kısa ekran davranışı cihaz kanıtı gerektirir. Aynı bileşen açıkken Forward ile katman geri yükleme test edilmiştir; tam belge yenileme sonrası geçici form/değer ve katman yeniden açma iddiası yoktur.
- Konaklama katalog bileşeninin kendi filtre/ayrıntı tasarımı, deneyim gönderme formu ve diğer F11 araçlarının kabulü bu dar değişikliğin dışında kalır. Yayın/Play paketi oluşturulmadı.
