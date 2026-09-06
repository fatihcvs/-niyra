# F06 / F07 gönderi etkileşimleri — 2026-09-05

Bu teslim web uygulamasının gerçek FeedPost bileşenini değiştirir. Fiziksel Android, Google Play veya bütün F06/F07 kabulü değildir.

- Gönderi seçenekleri ve şikâyet/silme onayı ortak history, focus ve inert katmanını kullanır. Telefonda alttan açılır; masaüstünde ortalanır. Eylemler ve yorum giriş/gönder düğmeleri en az 48px; düzenleme alanı 16px. Hareket, işletim sistemi ve uygulamanın azaltılmış hareket tercihini izler.
- Back paneli kapatır ve açan düğmeye döner; Forward aynı hedefteki şikâyet taslağını geri getirir. Rapor başarılı sayılmadan `report` kaydı aranır. Başarı sonrası tekrar gönder düğmesi kaldırılır. Silme tarayıcı confirm yerine uygulama içinde açık onay ister; hata panelde kalır.
- Aynı frame'de çift dokunma tek mutation üretir. İstek ve JSON gövdesi owner/target ömrüne bağlıdır; unmount taşıma abort eder; eski yanıt yeni hesabı veya kartı değiştiremez. Aktif 401 ana oturum akışına gider; gövdesi okunmaz. İsteklerde 20 saniye sınırı vardır.
- Kaydedilenlerde kart ancak sunucu `active` sonucunu verdikten sonra kaldırılabilir. Optimistic kaldırma yüzünden istek bitmeden component'in unmount olması engellendi. Hata eski yerel durumu korur.
- Aynı kimlikte kalan akış kartı, boşta gelen sunucu metni/sayı/beğeni/kayıt değişikliklerini uygular. Mutasyon sürerken alınmış ara snapshot mutasyonun sonucunu geri çeviremez. İlk yorum listesi yüklenirken gönderme kapalıdır; hata taslağı korur. IME composition içindeki Enter yorum göndermez.
- Like/save istemcisi istenen `active` değerini gönderir; API'nin uyumlu açık-durum desteği ayrı `post-actions-state-api` testleriyle doğrulandı. Comment için süreçler arası idempotency bu teslimde yoktur; timeout/yenileme sonrası manuel tekrar aynı yorumun sunucuda oluşmadığını varsayamaz.
- Galeri `preview` sınırı korunur: gerçek fetch, clipboard, native share, rapor ve silme yapılmaz. Gerçek clipboard hatası başarı diye gösterilmez ve blocking prompt açılmaz.

## Yerel kanıt

`node --test --test-isolation=none tests/feed-post-runtime.test.mjs tests/design-lab-runtime.test.mjs` — 19/19. Çift tık/gecikmiş JSON/owner değişimi/401/yorum yükleme-kayıt/Back-Forward/rapor yanıt doğrulama/silme hata-tekrar/clipboard hata ve galeri ayrımı gerçek ReactDOM ile doğrulandı. Test ortamı modülleri tek uygulama realm'ine uygun ortak Error constructor kullanır; üretim hata mantığı test için değiştirilmedi.

CUA: gerçek galeri bileşeninde 390×844 seçenek paneli (x0,y643,w390,h201), 320×568 şikâyet paneli (x0,y163,w320,h405), bütün ölçülen eylemler 48px; document scrollWidth viewport ile eşit. Back açıcıya odak döndürdü, Forward yazılmış taslak metnini korudu. İstek gönderilmedi. Ekranlar `exports/mobile-quality-implementation-2026-09-05/post-options-390-light.png` ve `post-report-320-light.png`. Bunlar authenticated rapor/silme kabulü veya klavye/IME cihaz ölçümü değildir.


Son ekler: aynı anda gelen bağımsız text/comments güncellemeleri like mutasyonu tarafından yutulmaz; busy fence yalnız etkilenen alanı korur. Gerçek parent kartı sildiğinde odak sonraki/önceki karta veya bağlı panele döner; yeni kullanıcı odağı ve kaldırılmış owner bölgesi korunur. Fetch veya JSON abort sinyalini yutsa bile 20 saniyede UI kilidi çözülür; gecikmiş başarı uygulanmaz. Bu dört ek senaryoyla 12 FeedPost + 7 galeri testi 19/19; ayrı 5 gerçek SQLite API testi son 529 testlik suite'te geçer.
