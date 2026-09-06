# F11 — Pazar kaydı ve fotoğraf yükleme kurtarması

2026-09-05. Bu kayıt yerel ReactDOM, taze bellek içi SQLite ve R2 test çifti kanıtıdır. Gerçek öğrenciye ilan mesajı gönderilmedi, gerçek ilan oluşturulmadı, üretim veritabanı veya depolaması değiştirilmedi.

## Düzeltilen davranış

- İlan/fiyat oluşturma, mesaj gönderme, durum güncelleme ve fotoğraf kaldırma işlemleri React state güncellemesini bekleyen bir `busy` kontrolüne bağlı değil: aynı olay karesindeki ikinci çağrı ortak ref kilidiyle engellenir.
- Bütün Pazar istekleri 20 saniyelik fetch **ve yanıt gövdesi** sınırına sahiptir. Hesap değişimi/unmount abort'u yutan taşımalarda bile geç gelen yanıt eski hesabın taslağını yeni hesaba taşıyamaz. HTTP reddi ile kayıp/belirsiz yanıt ayrı değerlendirilir.
- İlanın oluşturulduğu sunucu yanıtıyla doğrulandıktan sonra fotoğraf yüklemesi başarısız olursa ilan ID'si, özgün File nesneleri ve form değerleri korunur. Tekrar yükleme yalnız `/api/campus-market/images` adresine aynı ilan ID'siyle gider; yeni ilan POST'u oluşturmaz.
- İlk ilan/fiyat POST'unun sonucu belirsizse tekrar gönderilmez. Kullanıcı güncel kayıtlarını okuyup kendisine ait uygun mevcut kaydı inceleyerek seçebilir. Farklı kaydın otomatik olarak aynı yayın olduğu varsayılmaz. Fotoğraf POST'unun sonucu belirsizse açık ilan incelemesi ve kullanıcının fotoğrafları kontrol ettiğini belirtmesi gerekir; otomatik yükleme tekrarı yapılmaz.
- Belirsiz ilan mesajı hedef ilan ve özgün mesaj metniyle korunur. Kullanıcı tekrar gönderim yerine giden mesajları okur; aynı hedef/metin mevcut kayıtta bulunursa onaylanır. Başka ilana ait geç hata yeni mesaj formunda gösterilmez.
- Fotoğraf silme tarayıcının `window.confirm` penceresinden ortak `Sheet` bileşenine taşındı. Silme onayı gerçek yanıt gelene kadar kaybolmaz; başarısızlıkta fotoğraf ve tekrar kontrolü kalır. Escape ve UI kapatma işlemleri busy iken engellenir. Tarayıcı Back hareketi görünümü kapatabilir; bu, sunucudaki işlemi geri almaz. Yanıt yine yalnız yakalanmış hedefe uygulanır.
- Başarılı yazma sonucu ile arkasından yapılan liste yenilemesi ayrı değerlendirilir; liste okunamazsa doğrulanmış kayıt başarısız gönderim olarak sunulmaz.

## Medya API'sindeki veri kaybı düzeltmesi

Önceki hata yolunda `DB.batch` tamamlanıp yalnız audit veya ağ onayı başarısız olduğunda yayımlanmış fotoğraf nesneleri silinebiliyordu. Ayrıca erken reddedilen `Promise.all`, yavaş diğer yükleme tamamlanmadan temizlik başlatabiliyordu.

Şimdi bütün R2 yüklemeleri `Promise.allSettled` ile bitmeden yükleme hatası temizliğine geçilmez. Meta veri yazımı hiç başlamadıysa yalnız referansı olmayan nesneler temizlenir. D1 batch gönderildiyse sonucu kayıp olsa bile daha sonra commit ihtimali bulunduğundan nesneler korunur. Gerçekten tamamlanmış meta veri veya audit hatası yüzünden erişilen fotoğraf silinmez. Böylece belirsiz veritabanı sonucunu tahminle temizlik yaparak kırık dosya referansına dönüştürme engellendi.

Fotoğraf kaldırmada da meta veri silinmeden R2 nesnesi silinmez. Başarısız D1 silmesi görünür fotoğrafı korur; tamamlanmış D1 silmesinden sonraki temizlik veya audit sorunu doğrulanmış kaldırmayı başarısız gibi göstermez.

Bu dar düzeltme Pazar için kalıcı sunucu idempotency kaydı veya tam nesne uzlaştırma kuyruğu eklemez. Belirsiz batch veya silme sonrası temizlik hatasında referanssız nesneler ve eksik audit kaydı operasyonel uzlaştırma gerektirebilir; bu açık sınırdır.

## Ortak Sheet sözleşmesi

`ui-primitives.tsx` içindeki Sheet/Dialog footer'ı artık `ReactNode | ((close) => ReactNode)` kabul eder. Pazarın Vazgeç düğmesi ve tasarım galerisinin Tamam düğmesi aynı `useAppLayer.close` yolunu kullanır. Doğrudan `open=false` yapan footer iptalinin hemen yeniden açılan paneli gecikmiş history hareketiyle kapatması, gerçek Pazar iptal → yeniden aç → silme regresyonunda yakalandı ve düzeltildi. Var olan ReactNode footer çağrıları uyumludur.

## Kanıt ve açık sınırlar

- `tests/market-recovery-runtime.test.mjs`: 6 yeni gerçek ReactDOM akışı — aynı karede çift gönderim, fotoğraf reddinden yalnız fotoğrafla kurtarma, belirsiz ilan sonucunu mevcut kayıtla sürdürme, belirsiz mesajı okuma ile doğrulama, ortak Sheet iptal/silme hatası, hesap değişiminde geç gövde ve asılı gövde zaman aşımı. Bazı testler birden fazla ilişkili davranışı kapsar.
- `tests/market-images-recovery-api.test.mjs`: 4 yeni gerçek SQLite/R2 senaryosu — audit/commit onayı kaybı, daha sonra commit eden batch geç kalan kardeş yükleme ve meta veri silme hatası.
- `exports/market-recovery-tests.txt`: Pazarın 10 yeni testiyle tasarım galerisi/ortak UI regresyonları birlikte **35/35** geçti. Kök görev son tam test/derleme sonucunu ayrıca kaydeder.
- `exports/market-recovery-lint.txt` ve `exports/market-recovery-typecheck.txt`: yerel lint ve TypeScript kayıtları.

Pazar kurtarma kaydı mevcut hesap kapsamlı, süreli çalışma alanı belleğini kullanır; tarayıcı tümüyle kapatılıp yeniden açıldığında kalıcı kurtarma garantisi değildir. Pazar API'sinin kendisinde kalıcı yayın idempotency'si henüz yoktur. Gerçek hesap, fotoğraf sağlayıcısı, Android Back/IME, fiziksel cihaz ve üretim depolaması kabulü bu belgeyle kapanmaz.
