# F03 native oturum ve medya sözleşmesi

İnceleme tarihi: 2026-09-05. Bu kayıt aynı checkout'taki gerçek server kodu ve aşağıdaki resmî belgelerden çıkarılmıştır. Native cihaz veya canlı kullanıcı giriş gözlemi değildir.

## Backend'in mevcut davranışı

| Uç / kod | Gerçek sözleşme | Scout davranışı |
| --- | --- | --- |
| `app/api/auth/session/route.ts` POST | Email/parola doğrulaması, rate-limit; JSON `{user}` ve Set-Cookie. JSON access-token dönmez. | Aynı mevcut uç çağrılır. Giriş JSON'u tek başına başarı sayılmaz; takip eden `/api/profile` aynı email ve geçerli `publicId` sağlamalı. |
| `lib/app-auth.ts` | `uniyra_session`: HttpOnly, SameSite=Lax, Path=/, HTTPS üzerinde Secure, 30 gün; DB'de token hash'i. `sameOriginRequest` Origin varsa eşleşme denetler, olmayan native Origin'i kabul eder. | `credentials:include`, HTTPS, no-store; Cookie/Authorization header'ı veya platform oai identity header'ı imal edilmez. Origin kontrolünü devre dışı bırakan backend değişikliği yok. |
| `app/chatgpt-auth.ts` | ChatGPT platform kimliği yalnız güvenilir platform host/header sözleşmesiyle veya gerçek session cookie ile çözülür. | Native istemci platform kimliği taklit etmez. Native OAuth/callback/token exchange endpoint'i mevcut değil. |
| `/api/profile` GET | Yetkisiz401; identity + profile; akademik profil yoksa profile:null. |401 ve profile:null özel ekranlara geçemez. Gerçek email+publicId doğrulanır. Native login sonrası önceki hesabın çerezi gelirse eşleşme hatası olur. |
| `/api/posts?feed=all&cursor=...` | 12'lik sayfa; `nextCursor` server tarafından üretilir. | Opaque cursor aynen taşınır, ilk200 eşiğinde son bütün sayfa korunur. |
| `/api/people?id=...` | Kampüs/platform ve block kontrolü; person + içindeki gerçek post listesi. | Dönen publicId istenen kimliğe eşit olmalı; hata boş profil sayılmaz. |
| `/api/messages` GET | Üyelik/aynı kampüs/block doğrulaması; gerçek conversations, preview ve unreadCount. | Yalnız liste okunur. Read/delivery/push durumu uydurulmaz. |
| `/api/posts` POST | JSON text/kitle/course, gerçek Idempotency-Key; auth/rate-limit/API doğrulamaları. | Varsayılan yayın kapalı. Cihaz/staging denemesinde açıkça etkinleştirilirse aynı taslak aynı key ile manuel retry yapar. |
| `/api/posts/media?id=...`, `/api/profile/media?...` | Identity, içerik erişimi, blocks/campus/community denetimi. Dosya yetki sonrası gelir; private,no-store. | Public CDN'e çevrilmez. Native image transport ayrı kapıdır; varsayılan kapalı. Açılan probe yalnız aynı origin özel route URL'sini kabul eder, Cookie dışarı çıkarmaz. |

## Native bağlantıyı henüz ne kanıtlamıyor?

React Native networking belgesi cookie tabanlı authentication için mevcut sınırlamalar ve iOS 302 Set-Cookie sorununu açıkça listeler. Scout giriş ucu redirect yerine JSON dönse de **native cookie jar'ın tutulması ve sonraki fetch/Image istekleriyle taşınması cihaz ölçümü gerektirir**. Unit testte mock fetch'in verdiği Set-Cookie, cihaz cookie jar kanıtı değildir. [React Native Networking](https://reactnative.dev/docs/network) (belge güncellemesi: 12 Ağustos 2026; erişim: 5 Eylül 2026).

WebBrowser/Custom Tab açmak cookie'yi RN fetch'e aktarmak anlamına gelmez. Expo belgesi platforma göre browser/auth session ayrımını ve iOS Safari cookie paylaşım sınırını açıklar. Bu yüzden web giriş düğmesi native oturumu başarılı saymaz. [Expo WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/) (erişim: 5 Eylül 2026).

Expo'nun authentication rehberi gerçek provider OAuth/OIDC akışı, session doğrulaması ve native hassas depolama seçeneklerini anlatır. Kampira backend'i şu anda native bearer/refresh veya authorization-code exchange sunmadığı için AuthSession/SecureStore eklemek tek başına çalışan bir backend sözleşmesi yaratmaz. Bu deneme hayalî token eklemez. [Expo authentication](https://docs.expo.dev/develop/authentication/), [Expo authentication guide](https://docs.expo.dev/guides/authentication/) (erişim: 5 Eylül 2026).

Seçilen bağımlılık eşleşmesi resmî SDK tablosundaki Expo57/RN0.86/React19.2.3 ile uyumludur; resmî blank-typescript şablonu kullanıldı. [Expo SDK reference](https://docs.expo.dev/versions/latest/), [create-expo-app](https://docs.expo.dev/more/create-expo/) (şablon belgesi güncellemesi: 3 Eylül 2026; erişim: 5 Eylül 2026).

## Cihaz kabulü için somut akış

1. Yetkili test/staging origin ve mevcut test hesabıyla native POST login → GET profile: aynı email/publicId; ardından gerçek feed ve DM listesi. Tarayıcı hesabını kopyalama, cookie/log okuma veya app API key talebi yok.
2. Yanlış parola, 401, profile:null, ağ timeout, önceki başka hesabın cookie'si: Bağlanmadı; eski private state görünmemeli. Logout ardından aynı cihaz yeniden oturum kontrolü: eski veri gösterilmemeli.
3. Background→foreground doğrulaması, A→B hesap değişimi, geç yanıt, Android Back, keyboard inset ve process kill. Bellek taslakları process yeniden başladığında kaybolur; ürünün kalıcı taslak gereksinimi varsa ayrı güvenli depolama kararı gerekir.
4. Ayrı medya probe: yetkili görsel,401,403,404, private video Range gereksinimi, başka host URL'si, logout sonrası native image cache davranışı. Varsayılan probe kapalı olduğundan bu kayıt gerçek özel medya güvenliği kabulü sağlamaz.
5. Aynı gerçek içerik, cihaz ve görevlerde TWA ile frame time/memory/scroll/Back/keyboard karşılaştırması. Metro export, uygulama açılışı veya mock veri bunların yerine geçmez.

Cookie yolu cihazda güvenilir değilse, server-side kısa ömürlü native authorization-code exchange ve açık token yaşam döngüsü ayrı tasarlanmalı; mevcut web cookie güvenliği bozularak veya token URL'ye yazılarak geçici çözüm üretilmemeli. Bu bir sonraki mimari seçenek notudur, bu teslimde uygulanmış endpoint değildir.
