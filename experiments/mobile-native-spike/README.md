# Kampira native scout — F03 denemesi

5 Eylül 2026. Ana Kampira web uygulamasından bağımsız Expo/RN istemci denemesi. Web uygulaması taşınmadı; native mimari seçilmiş veya Play paketi hazır sayılmaz.

Gerçek `/api/*` sözleşmesine bağlanan kod vardır; UI'da mock hesap, örnek akış, sahte mesaj veya token modu yoktur. İlk ekran **Bağlanmadı** durumudur. POST girişinden sonra aynı native çerez taşımasıyla GET profil ve hesap kimliği doğrulanmadan özel ekranlar açılmaz. Bu çalışma sırasında gerçek hesaba giriş yapılmadı veya production yazması gönderilmedi.

## Çalıştırma

Node 22.18+ ve bu klasöre ait bağımlılıklar kullanılır. Yerel doğrulama Node 26.7.0 ile yapıldı. Ana klasörün package dosyalarını değiştirmez.

```powershell
cd D:\-niyra-main\experiments\mobile-native-spike
npm ci
npm test
npm run typecheck
npm run export:android
npm start
```

`npm start` Metro geliştirici sunucusudur; bağlı cihaz veya uyumlu geliştirme istemcisi gerektirir. `export:android` JavaScript/Hermes + asset üretir, Android Gradle çalıştırmaz, SDK lisansı kabul etmez ve APK/AAB üretmez. `dist/android` Git dışında kalır. EAS login, mağaza yükleme, imzalama ve otomatik dağıtım yapılandırması yoktur.

Resmî `blank-typescript` şablonundan alınan sürümler `package-lock.json` ile sabitlidir: Expo **57.0.20**, React Native **0.86.3**, React **19.2.3**, TypeScript **6.0.3**. Kampira işareti ve uygulama simgesi mevcut `public` varlıklarının kopyasıdır; stok Expo ikonları kaldırıldı. Şablonun Expo telif bildirimi `EXPO_TEMPLATE_LICENSE` içinde korunur; bu dosya Kampira marka varlıkları için yeni bir lisans verilmesi değildir.

## Yapılandırma

Varsayılan origin mevcut projede kayıtlı `https://web-production-da44f.up.railway.app` adresidir. Origin public yapılandırmadır; API anahtarı değildir. Değiştirmek gerekirse Metro başlamadan süreç kapsamında:

```powershell
$env:EXPO_PUBLIC_API_ORIGIN = 'https://YOUR-APPROVED-STAGING-HOST'
npm start
```

Yalnız HTTPS origin kabul edilir; kullanıcı bilgisi, yol, query veya hash içeren origin reddedilir. HTTP LAN/emulator adresine sessizce düşülmez. Bu deney native hedeflidir; başka origin'deki Expo web tarayıcısı için CORS/SameSite uyumu iddia etmez.

İki deney bayrağı varsayılan **kapalıdır**:

- `EXPO_PUBLIC_ENABLE_PUBLISH=1`: doğrulanmış oturumda gerçek text-only `/api/posts` POST düğmesini açar. Kullanıcı düğmeye basarsa seçilen gerçek origin'e yazılır. Bu bayrak yalnız hedef sunucuda mevcut idempotency endpoint/migration uyumu doğrulanan yetkili test ortamında açılmalı; checkout kodu canlı Railway sürümünün aynı olduğunu kanıtlamaz. Varsayılan kapalı hâlde composer yalnız bellekte taslak ve Back davranışını sınar. 1200 karakter ve gerçek `Idempotency-Key` sözleşmesi korunur; otomatik retry yoktur.
- `EXPO_PUBLIC_ENABLE_MEDIA_PROBE=1`: aynı origin `/api/posts/media` görsellerini RN Image ile denemeye açar. Çerez/media-loader eşleşmesi cihazda doğrulanmış sayılmaz. İstek hatası veya 1×1 boş görsel açık fallback gösterir. Video playback, upload ve özel medyayı kalıcı cache'e alma eklenmedi.

Bu bayraklar sır değildir; EAS secret, cookie, parola veya bearer token bunlara yazılmaz. Giriş ekranındaki parola form gönderildiğinde alan belleğinden temizlenir; cookie başlığı okunmaz, kopyalanmaz ve manuel hazırlanmaz. Native şifre kasası/persistent token uydurulmadı.

## Mevcut küçük akış

- Gerçek platform akışı 12 kayıtlık API sayfalarıyla FlatList'te gösterilir. Opaque cursor değiştirilmez. 200 eşiğinde yeni sayfa istemek durur; son gerçek sayfa tam korunduğundan mevcut sayfa boyutuyla en fazla 204 okunan kayıt oluşabilir. Profil açılıp Back ile dönüşte mevcut veri/cursor/scroll saklanır.
- Yazar → gerçek `/api/people?id=...` profili → Back; yanlış kimlikli veya yetkisiz yanıt gösterilmez. Bu endpoint'in mevcut en fazla 20 post yanıtı kullanılır; altı profil tabının tam native kopyası değildir.
- Composer metni/kitle/deneme anahtarı aynı hesap belleğinde kalır. Process kill/yeniden açılışta özel taslak kalıcılaştırılmaz. Logout/hesap değişimi, eski async yanıtları ve gönderim anahtarlarını geçersiz kılar.
- Gerçek DM listesi `/api/messages` üzerinden gelir; okunmamış sayısı server değeridir. Satır alıcının profilini açar ve erişilebilir etiketi bunu açıklar. Tam chat, gönderim/read mutation, push veya background delivery burada uygulanmadı.
- Arka plana geçiş istekleri iptal eder ve özel ekranları kapatır. Ön plana dönüş GET profile ile oturumu yeniden doğrular; profil/DM yenilenir, aynı hesabın feed/draft belleği korunur. Polling, OS servisi veya process restorasyonu yoktur.
- Native `BackHandler`, SafeAreaView, KeyboardAvoidingView, 48px kontroller ve 16px input kullanılır. Bunların gerçek cihazda klavye/inset/TalkBack kabulü henüz yapılmadı.

## Kanıt

**13/13** saf typed API/lifecycle testi, TypeScript ve Android Metro export geçti. Test transport yanıtları açıkça `[SYNTHETIC]` veridir ve sadece test dosyalarındadır; bunlar native çerez veya production API kanıtı olarak sayılmaz. Ayrıntılı makine kaydı `evidence/local-checks.json` içindedir. `AUTH_AND_MEDIA_CONTRACT.md` kalan oturum ve medya kapılarını içerir.

Dependency audit bu sabitlemede **10 moderate, 0 high, 0 critical** bildirdi; zincir Expo CLI/config → xcode → uuid advisory'sidir. Audit'in otomatik önerisi Expo 46'ya major sürüm değişikliği olduğundan uygulanmadı. Bu deney dependency-release kabulü veya güvenlik temizliği iddia etmez; native ürün seçilirse uyumlu upstream düzeltme ayrıca doğrulanmalı. Yerel tam audit `dependency-audit.local.json` Git dışında tutulur.

## F03 karar sınırı

Bu teslim çalışabilir native kaynak ve export üretti. Native cookie login, image-loader cookie, Android Back/keyboard/TalkBack, gerçek frame/memory ölçümü, offline→online, process kill, imzalı APK/AAB ve aynı öğrenci görevleriyle TWA karşılaştırması **açık**. Mimari ADR için bu ölçümler gerekir; yalnız React testinin veya Metro export'un geçmesi native tercihini kanıtlamaz.
