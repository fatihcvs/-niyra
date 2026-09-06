# Cihaz bildirimleri

Bu çalışma kalan kod işlerinin üçüncü sırasıdır. Web Push ve Android FCM aynı oturuma bağlı abonelik API'sini ve teslim kuyruğunu kullanır. Sağlayıcı hesabının hazırlanması, yerel testler, fiziksel cihaza teslim ve Railway dağıtımı ayrı kabul kayıtlarıdır.

## Kullanıcı davranışı

Bildirim ayarları, Bildirimler bölümündeki tercihler içinde yer alır. İzin yalnız kullanıcının açma düğmesine basmasıyla istenir. Desteklenmeyen cihaz, güvensiz bağlantı, kapalı sağlayıcı yapılandırması, reddedilmiş izin ve başarısız kayıt açıkça gösterilir. Sunucudan kayıt onayı gelmeden bildirimler açık gösterilmez.

Bildirim önizlemesi mesaj metni, gönderen adı veya e-posta içermez. Bildirim alınırken ve dokunularak açılırken oturum, hesap, cihaz kaydı, okunma durumu, engellemeler ve içerik erişimi yeniden doğrulanır. Oturum sona ermişse veya içerik artık erişilemiyorsa bildirim ilgili içeriği açmaz.

Çıkış işlemi önce sunucudaki oturumu iptal eder. Veritabanı hatasında çıkış başarısız bildirilir ve yeniden denemek için çerez korunur. Başarılı çıkış abonelikleri ve bekleyen teslimleri de siler; istemci görünür bildirimleri kapatıp cihaz kaydını temizler. Hesap değiştirerek giriş, önceki oturumun iptali ve yeni oturumun oluşturulmasını tek işlemde gerçekleştirir. Bildirim listesinde okunmuş bir bildirim yeniden gösterilmez; mevcut cihaz bildirimine dokunulduğunda ise erişimi hâlâ geçerliyse içerik açılır.

## Sunucu akışı

`0029_push_notifications.sql`, `push_subscriptions` ve `push_deliveries` tablolarını oluşturur. Bildirim INSERT tetikleyicisi, mevcut API'lerin atomik yazımlarını da kapsar. Yeni cihazlara geçmiş bildirimler topluca gönderilmez.

`0030_push_device_revocations.sql`, kapatılan Android kayıtlarının kimliklerini oturum ömrü boyunca saklar. Her izin ve token neslinin değişmez kimliği vardır; silmeden sonra gecikerek gelen eski POST kaydı yeniden açamaz veya yeni kaydı değiştiremez. Android, gönderimden önce kurtarma kaydını diske yazar. Sonucu belirsiz kayıtların iptali yeniden denenebilir. Tarayıcıdaki açık durumu da yalnız cihaz adına bakmaz: gerçek abonelik ve güncel VAPID anahtarı sunucu kaydıyla eşleşmelidir.

Gönderici işi önce veritabanında süreli olarak sahiplenir; birden fazla sunucu aynı kuyruğu güvenli biçimde işler. Geçici hata ve bilinmeyen teslim sonucu artan aralıkla yeniden denenir. Sınır sekiz deneme veya 24 saattir. Sağlayıcının süresi dolmuş abonelik cevabı yalnız ilgili cihaz kaydını iptal eder. Bitmiş kuyruk satırları yedi gün sonra temizlenir. Bilinmeyen sağlayıcı onayı tekrar teslim doğurabileceğinden cihazdaki bildirim etiketi aynı bildirim için sabittir.

Worker, başarılı API değişikliklerinden sonra yanıtı bekletmeden sınırlı bir gönderim çalıştırır. Cloudflare zamanlayıcı handler'ı da vardır; gerçek bir Cloudflare dağıtımında cron bağının ayrıca tanımlanması gerekir. Mevcut Railway modeli yerel Wrangler/D1 çalıştırdığı için `scripts/push/railway-run.mjs` bağımsız olarak 15 saniyede bir kuyruğu kontrol eder. Kullanıcının açık sekmesine bağlı değildir. Döngü aynı anda yalnız bir isteği tutar ve kapanışta iptal edilir.

`/__internal/push-dispatch` yalnız sunucuya ait güçlü Bearer anahtarı ile POST kabul eder. Anahtar URL'ye yazılmaz. Gönderim hata günlükleri sağlayıcı cevabı, alıcı, cihaz belirteci veya özel anahtar içermez.

## Yapılandırma

| Ortam alanları | Amaç |
| --- | --- |
| `PUSH_VAPID_SUBJECT`, `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` | Tarayıcı Web Push imzası ve şifrelemesi |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Sunucunun Firebase HTTP v1 yetkilendirmesi |
| `PUSH_JOB_SECRET` | Sunucudaki kuyruk döngüsünün iç uç noktaya erişimi |

Firebase projesi `kampira-ac5a2`; kayıtlı test Android paketi `app.kampira.preview`dır. Uygulama yapılandırma dosyası `outputs/firebase/kampira-ac5a2/android-preview/google-services.json` altında Git dışında tutulur. Sunucu hesabının hedef yetkisi yalnız `cloudmessaging.messages.create`dır.

Onaylanmış yerel hizmet hesabı dosyasından yapılandırma hazırlamak için `node scripts/push/configure-local.mjs --service-account <yerel-json-yolu> --project kampira-ac5a2` kullanılır. Çıktı `outputs/firebase/kampira-ac5a2/server/push.env` olur. Mevcut Web Push anahtarları korunur. Dosya içeriği terminale yazdırılmaz ve istemci paketine eklenmez.

Yerel tablet önizlemesi sağlayıcıları varsayılan olarak yüklemez. Açıkça bağlamak için `node experiments/android-preview/start-site.mjs --push-env-file outputs/firebase/kampira-ac5a2/server/push.env` kullanılır. Önizlemenin güncel build ve yerel0029 migration gerektirdiğine dikkat edilir. İzole tarayıcı test sunucusu sağlayıcısız kalır.

Railway başlangıcı yalnız ilgili ortam alanlarını izinleri sınırlı geçici dosyaya aktarır; anahtarlar komut satırı argümanlarına eklenmez. Başlatıcı kapanışta kendi geçici dosyasını kaldırır. Railway'e ortam değişkenleri yüklemek ve yeni sürümü dağıtmak ayrıca yapılmalıdır; yerel kurulum canlı dağıtım kanıtı değildir.

## Kabul kanıtları

Kod fazının son kaydı `exports/mobile-remaining-code-2026-09-06/phase3/verification.json` altındadır.76 otomatik web/sunucu testi, TypeScript, lint ve Vinext build exit0;4 gerçek Chrome kontrolü geçti. Android'de9 gerçek store birim testi,48 push,24 origin ve28 recovery JVM kontrolü geçti; son debug APK derleme, Android lint ve imza kontrolünden geçti. [Native sözleşme](ANDROID_NATIVE_PUSH.md) bu kanıtların sınırlarını ayrıntılandırır.

Firebase'de yalnız `cloudmessaging.messages.create` yetkili sunucu hesabı kullanıcı onayıyla oluşturuldu. Gerçek Google OAuth doğrulaması200 döndü; yerel çalışan Worker sağlayıcı yapılandırmasını doğruladı. Bunlar fiziksel cihaza teslim veya Railway'e dağıtım değildir. Yerel0029 ve0030 migration'ları yedeklenerek uygulandı; mevcut kayıt sayıları, foreign key ve bütünlük kontrolleri korundu.

Yerel protokol testleri gerçek SQLite migration'larını, oturum iptalini, gönderim yarışlarını, yeniden denemeyi, gerçek Web Push şifreli gövdesinin bağımsız çözümünü ve FCM OAuth imzasını denetler. Sahte taşıma katmanındaki başarı, gerçek Google/Apple/Mozilla teslimi veya kapalı fiziksel uygulama kanıtı değildir.

Kaynaklar: [Firebase HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [FCM hata cevapları](https://firebase.google.com/docs/cloud-messaging/error-codes), [Web Push kitaplığı](https://github.com/web-push-libs/web-push), [RFC8291](https://www.rfc-editor.org/rfc/rfc8291), [Worker waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/), [zamanlanmış Worker](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).
