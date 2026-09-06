# F11 — Pazar taslaklarının cihazda korunması

Tarih: 2026-09-06. Bu çalışma, kalan işlerin yalnız **1. fazını** kapsar: ilan, fiyat gözlemi ve ilan mesajı taslaklarının cihazda korunması. Pazar fotoğraf API'sine idempotency eklenmesi veya sonraki fazlar bu değişikliğe dahil değildir.

## Kullanıcıya görünen davranış

İlan türü ve tüm form alanları, seçilmiş ürün fotoğraflarının sırası ve dosya bilgileri, fiyat gözlemi alanları ve ilana göre ayrı mesaj taslakları IndexedDB'de saklanır. Sayfa veya workspace yeniden açıldığında yalnız sunucunun doğruladığı mevcut hesabın kaydı yüklenir. Kaydı yüklemek ağ üzerinden otomatik ilan veya mesaj göndermez.

Pazar taslak durumu açıkça gösterilir: yükleme, kaydetme, kaydedildi, depolama hatası veya başka sekmeyle çakışma. “Taslak bu cihazda kaydedildi.” metni yalnız ilgili transaction tamamlandığında gösterilir. Yeni karakter veya fotoğraf seçilince önceki kaydın başarı etiketi hemen kalkar. Workspace'ten normal gezinmeyle ayrılışta son değişiklik kaydetme kuyruğunda tamamlanır; `pagehide`/görünürlük değişiminde kaydetme başlatılır. İşletim sisteminin ani kapanışında henüz “kaydedildi” olarak doğrulanmamış değişiklikler için garanti verilmez.

Yeni ilan, fiyat veya iletişim mesajının değişmez anahtarı ve içeriği, POST başlamadan önce aynı cihaz kaydına yazılır. Bu hazırlık başarısızsa **POST gönderilmez**; form düzenlenebilir ve depolama yeniden denenebilir. Depolama hatasını düzeltmek kendi başına gönderim başlatmaz. Ağ isteğinin sonucu belirsiz kaldıysa aynı anahtar ve ilk içerik korunur; sonraki kota/erişim hatası bunları yeni bir işleme çeviremez.

İlan sonucu alındıktan sonra fotoğraf aşaması için doğrulanmış ilan kimliği saklanır. Eski bir taslak kaydı bu kimliği silemez veya oluşturma aşamasına geri döndüremez. Sonuç alındığında taslağın diskten temizlenmesi başarısızsa kullanıcıya başarıdan sonra yeni kayıt oluşturmaya izin verilmez; mevcut kaydın kurtarması devam eder. Kaldırılmış kayıt için 410 sonrası kullanıcı açıkça taslağı düzenlemeyi seçebilir.

Mesaj taslakları, ilan rezerve edilse veya ilan listesinden çıksa da Pazar ekranındaki “Mesaj taslağını aç” eyleminden erişilebilir. Başarıyla tamamlanan mesajın boş form kovası kaldırılır; çok sayıda farklı ilana mesaj göndermek taslak sayısı sınırını tüketmez.

## Depolama ve hesap sınırları

- Veritabanı: `kampira-market-drafts`; sürüm 1. Kalıcı anahtar doğrulanmış `publicId`; geçici `sessionRevision` saklanmaz.
- Şekil: `{owner, schemaVersion, revision, createdAt, updatedAt, expiresAt, kind, forms, images, recovery, contacts}`. Kimlik doğrulama çerezi, parola veya token saklanmaz.
- Fotoğraflar açık `Blob` + ad/tür/lastModified bilgisiyle saklanır; en fazla 6 dosya, dosya başına 5 MB ve toplam 20 MB. Desteklenen türler PNG/JPEG/WEBP. Geçersiz yeni seçim önceki geçerli seçimi bozmaz. Depolama alanı yetmezse seçili fotoğraflar temizlenebilir.
- Her yazma saklanan revizyonu transaction içinde karşılaştırır. Başka sekmenin güncel taslağı eski autosave veya geç tamamlanan işlemle ezilmez. Çakışmada kullanıcı “Kayıtlı taslağı aç” ile güncel kaydı alır.
- Sıradan düzenlenebilir taslak 24 saat sonra sona erer; yalnızca okumak süreyi yenilemez. Çözülmemiş işlem ve iletişim anahtarları bu süreyle sessizce silinmez.
- Açık çıkış tüm sahiplerin pazar taslaklarını temizler; aynı transaction'da kalıcı çıkış epoch'u güncellenir. Yerel store koordinatörü, BroadcastChannel ve kalıcı epoch eski sekme/işlemlerin özel taslağı yeniden yazmasını engeller. İlk okumasını çıkıştan sonra başlatan eski oturum da engellenir.
- Depolama kapalı, kota dolu veya transaction hatalıysa “kaydedildi” denmez. Çıkış temizliği başarısızsa oturum kapansa bile yerel temizleme hatası açıklanır.

Strict IndexedDB durability seçeneği desteklendiğinde kullanılır; bu seçenek bir tarayıcı dayanıklılık isteğidir, fiziksel güç kaybı garantisi değildir. Eski WebView uyumluluğu için seçenek `TypeError` verirse standart transaction kullanılır.

Gözlem tarihi, fiyat formu ilk açılırken yerel takvim tarihiyle alanın kendisine yazılır. Kullanıcı tarihi değiştirmese de saklanır; ertesi gün açılışta yeniden hesaplanmaz. Taslak depolaması yüklenmeden form başlatılmaz.

Kayıt durumu normal kullanımda 48 px yüksekliğinde kompakt satırdır. Fotoğraf seçme/silme kontrolleri 48 px dokunma alanını korur. Dosya seçici kendi görünür etiketiyle çalışır; geri yüklenen fotoğraflar seçili sayı ve sıralı dosya adlarıyla gösterilir. Yerel ve alternatif adreslerde manifest aynı origin üzerinden yüklenir.

## Kaynaklar ve doğrulama

Uygulama: `lib/market-draft-store.ts`, `app/use-market-draft.ts`, `app/campus-market.tsx`, `app/market-recovery.module.css`. `app/page.tsx` doğrulanmış sahip kimliğini aktarır ve açık çıkışta pazar deposunu da temizler.

Yerel odaklı kontrol: **45/45 test, 0 başarısız**. Gerçek fake-indexeddb transaction'ları ve gerçek ReactDOM ile dosya baytları/sırası, soğuk store açılması, silinmiş workspace belleğinden geri yükleme, değişmez anahtar, kota öncesi sıfır POST, iki sekme CAS, çıkış yarışları, geç autosave, hatalı fotoğraf seçiminden dönüş, 40 tamamlanan iletişim ve mevcut katman kontrolleri doğrulandı. Değişen dosyaların ESLint kontrolü geçti.

Kanıt: `exports/mobile-code-continuation-2026-09-06/market-phase1-final-focused.txt` ve `market-phase1-final-focused-exit.txt`; `market-phase1-owned-lint-exit.txt`. Gerçek Chrome/normal hesap, derleme ve fiziksel cihaz sonuçları üst görevin güncel raporunda ayrı tutulur. Bu belge tarayıcı/cihaz ya da Railway/Play dağıtımı tamamlandı anlamına gelmez.

## Son kapanış

Son kaynakla **46/46** odaklı otomatik test, TypeScript, ESLint ve Vinext build geçti. Gerçek Chrome **11/11** genel kontrolü ve son tarih değişikliğinden sonra ayrı **4/4** odaklı kontrol geçti; örtüşen kontroller toplanmadı. Bağımsız Chrome süreci kapatılıp açıldı; iki fotoğraf gerçek R2 yüklemesinde baytları ve sırası ile doğrulandı. JS/statik dosya/beklenmeyen ağ hatası yok. `exports/mobile-remaining-code-2026-09-06/phase1/final/verification.json` son kaynak SHA-256 listesini içerir.
