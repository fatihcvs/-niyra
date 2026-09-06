# Kampira Android uygulama hazırlığı

Bu depoda Kampira'nın kurulum manifesti, gerçek marka işaretinden üretilen simgeler, bağlantı kesilince gösterilen sayfa ve Android TWA yapılandırmasını hazırlayan araçlar bulunur. **Henüz APK/AAB derlenmedi, imzalama anahtarı oluşturulmadı ve Google Play'e gönderim yapılmadı.**

## Neden TWA?

Kampira, Vinext sunucu yönlendirmesi ve aynı kaynaktaki `/api/*` uçlarıyla çalışan bir uygulama. Oturumlar `HttpOnly`, `SameSite=Lax` çerezleriyle korunuyor; kayıt/giriş istekleri aynı kaynak kontrolünden geçiyor. TWA mevcut HTTPS kaynağını tarayıcı motorunda çalıştırır ve bu modeli korur. PWA tek başına Play paketi değildir; TWA Android kabuğu ayrıca derlenir. [Android TWA açıklaması](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)

Capacitor'da üretime uygun alternatif, yerel derlenmiş web varlıkları ve ayrı bir API istemcisi kurmayı gerektirir; mevcut SSR çıktısı yalnızca bir `webDir` içine kopyalanarak çalışmaz. Capacitor'ın `server.url` ayarı canlı geliştirme sunucuları içindir ve belgede üretim için önerilmez. Bu nedenle bu hazırlık o kısayolu kullanmaz. [Capacitor yapılandırması](https://capacitorjs.com/docs/config)

## Hazırlanan dosyalar

| Dosya | Davranış |
| --- | --- |
| `public/manifest.webmanifest` | Kampira adı, bağımsız pencere, kalıcı uygulama kimliği `/`, dört gerçek bölüm kısayolu |
| `public/app-icons/` | 180, 192, 512 piksel simgeler ve güvenli boşluklu maskelenebilir 512 piksel simge |
| `public/sw.js` | Yalnız manifest, dört kurulum simgesi ve genel bağlantı sayfası önbelleğe alınır |
| `public/offline.html` | Mesaj/gönderi varmış gibi göstermeyen, yeniden deneme ve ana sayfa bağlantısı içeren sayfa |
| `scripts/android/app-config.json` | Kaynak adresi, geçici paket kimliği, sürüm, minimum Android ve gerekli hedef SDK |
| `scripts/android/prepare.mjs` | Gerçek Bubblewrap şemasında `outputs/android/generated/twa-manifest.json` üretir |
| `scripts/android/build.ps1` | Ayrılmış çıktı dizininde kontrollü üretim ve imzasız derleme komutları |
| `scripts/android/asset-links.mjs` | Yalnız verilen gerçek sertifika parmak izleriyle inceleme dosyası üretir |

Servis çalışanı oturum açılmış sayfaları, API yanıtlarını, profil resimlerini, dosyaları veya mesajları kaydetmez. Gönderme istekleri çevrimdışı sıraya alınmaz. Yeni çalışan mevcut sekmeler kapanınca devralır; düzenleme sırasında zorunlu yenileme yapılmaz. PWA önbelleği kullanıcı oturumu verisi içermez. Simge üretimi mevcut `kampira-mark.png` işaretini yeniden tasarlamadan yeniden boyutlandırır.

## Mevcut uygulama kimliği

- Kullanıcının seçtiği başlangıç adresi: `https://web-production-da44f.up.railway.app`.
- 5 Eylül 2026 salt okunur kontrolü: ana sayfa HTTP 200; `/api/health` HTTP 200, `service=kampira`, `version=1.8.0`, `database=ok`.
- Paket kimliği: `app.kampira.mobile`; **ilk Play yüklemesinden önce kesinleştirilecek geçici tercih**. Sonraki yayımlarda aynı kimlik korunmalı.
- Android minimum SDK: 23. Gerekli hedef/derleme SDK alt sınırı: 36.
- Bubblewrap CLI: `1.25.0`; komut paketi açık sürümle çağrılır. Dolaylı paketler ve Android araçları bu depoda henüz kilitlenmedi.
- Bildirim delegasyonu kapalıdır; web push aboneliği ve sunucu teslim altyapısı henüz uygulanmamıştır.

31 Ağustos 2026'dan itibaren yeni telefon uygulamaları ve güncellemeler Android 16/API 36 veya üstünü hedeflemeli. Üretim komutu, oluşturulan Gradle dosyasında `compileSdk` ve `targetSdk` değerlerini en az 36 yapar; bilinmeyen şablonu tahmin ederek değiştirmez. [Güncel Play hedef API şartı](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

## Şimdi çalıştırılabilen yerel kontroller

Depo kökünden, PowerShell veya Node ile:

```powershell
node scripts/android/check.mjs
node --test --test-isolation=none tests/android-app.test.mjs
node scripts/android/prepare.mjs
```

Bu komutlar SDK veya Bubblewrap yüklemez, anahtar oluşturmaz, yayın yapmaz. Çıktı dizini mevcut depo kuralıyla Git dışında kalan `outputs/android/` altındadır. `prepare.mjs` tekrar çalıştırılırsa oluşturulan yapılandırmayı yeniden yazar; kalıcı ayarlar `app-config.json` üzerinden değiştirilir. Simge değişirse mevcut Next kurulumuyla gelen `sharp` kullanılarak `node scripts/android/export-icons.mjs` çalıştırılabilir.

## Web sürümü yayımlandıktan sonraki Android adımları

Kurulum varlıkları şu an yalnız bu çalışma kopyasında hazırlanmıştır. Gerçek kaynakta bulunmaları ayrı bir web yayını gerektirir. Canlı hazır olma kontrolü eksik dosya, yönlendirme veya yanlış içerik türünde başarısız olur:

```powershell
node scripts/android/check.mjs --remote
```

Windows ortam kontrolünde `java`, `javac`, `adb`, `sdkmanager`, `gradle` ve `bubblewrap` PATH üzerinde bulunamadı; `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` ayarlı değil; standart JDK/Android Studio/SDK dizinleri de bulunamadı. Node 26.7.0 kullanılabilir. Android araçları kurulduktan ve kurulum varlıkları yayımlandıktan sonra:

```powershell
# Bu adım ağdan belirtilen Bubblewrap sürümünü ve gerekirse araçlarını indirir.
powershell -File scripts/android/build.ps1 -Action Generate

# Derleme çıktısı imzasızdır; Google Play'e yüklenebilir sürüm sayılmaz.
powershell -File scripts/android/build.ps1 -Action BuildUnsigned
```

Üretici yalnız işaretlenmiş `outputs/android/generated` dizininde çalışır. Bubblewrap kendi ürettiği dosyaları yeniden yazabilir; o dizine elle yapılan kalıcı değişiklikler konmamalı. SDK düzeltmesi her üretimden sonra yeniden uygulanır. Yükleme anahtarı veya parolası bu komutlarda oluşturulmaz ve kaynak kodda tutulmaz. Resmî akış için [Bubblewrap hızlı başlangıç](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start) ve [CLI komutları](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md).

## İmzalama ve alan doğrulaması

TWA doğrulaması, web kaynağındaki `/.well-known/assetlinks.json` ile Android paket kimliğini ve **Play uygulama imzalama sertifikasını** eşleştirir. Yükleme sertifikasıyla Play'in dağıttığı uygulama sertifikası aynı olmak zorunda değildir. Doğrulama yapılmazsa tarayıcı çubuğu bulunan Custom Tab açılır. [İmzalama anahtarları ve TWA](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs)

Bu depoda sahte sertifika veya otomatik yayımlanan `assetlinks.json` yoktur. Gerçek SHA-256 parmak izi Play Console'dan alındığında aşağıdaki komuta değer olarak verilir:

```powershell
node scripts/android/asset-links.mjs $env:KAMPIRA_PLAY_SIGNING_SHA256
```

Komut boş/geçersiz değeri reddeder ve yalnız `outputs/android/assetlinks.json` inceleme dosyasını oluşturur. Birden çok gerçek sertifika ayrı argüman olarak verilebilir. Dosya paket kimliğiyle beraber gözden geçirildikten sonra kaynak sunucuda `/.well-known/assetlinks.json` adresinde yayımlanır. İmzalı AAB üretimi ve Play'e yükleme ayrıca yapılır; hazırlık komutlarında gizli bir yükleme adımı yoktur.

## Bu üründe Play öncesi kalan somut işler

1. **Hesap silme:** ayarlarda gerçek hesap/veri silme isteği akışı ve uygulamayı yeniden kurmadan erişilen dış talep bağlantısı. Mevcut `/legal#help` yalnız oturum açıp Güvenlik Merkezi'ne gitmeyi söylüyor; uygulama API'lerinde ayrı hesap silme işlemi yok. [Google hesap silme şartı](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
2. **Sosyal uygulama güvenlik beyanı:** açık CSAE yasağı, işleyen şikâyet/engelleme ve inceleme süreci, gerçek sorumlu iletişim noktası. Mevcut genel topluluk kuralları açık CSAE standardı ve iletişim bilgisi içermiyor. Sorumlu kişi/kuruluş ve destek iletişimi geliştirici tarafından verilmelidir; uydurulmaz. [Sosyal uygulamalar için çocuk güvenliği](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)
3. **Play bilgileri:** geliştirici hesap türü, gerçek destek/gizlilik bağlantıları, hedef yaş ve içerik derecelendirmesi, uygulamanın gerçekten işlediği profil/mesaj/dosya/veri kategorileriyle uyumlu Data safety formu. Mevcut Eşleş ve anonim paylaşım alanlarının hedef yaş kurgusu ayrıca incelenmeli.
4. **Android kanıtı:** giriş/çıkış ve yeniden açma, sistem geri hareketi, klavye açık mesaj yazma, çentik/alt hareket alanı, kamera/galeri dosya seçimi, indirme/paylaşma, dış bağlantılar, bağlantı kesilmesi ve geri gelmesi gerçek Android'de doğrulanmalı. Tarayıcıdaki masaüstü testleri bu kanıtı sağlamaz.
5. **Dağıtım:** nihai paket kimliği, güvenli yükleme anahtarı, Play App Signing SHA-256 bilgisi ve imzalı AAB. Yeni kişisel Play hesabı 13 Kasım 2023 sonrası açıldıysa üretim erişimi öncesi en az 12 testçinin 14 gün kesintisiz katıldığı kapalı test şartı da uygulanır. [Kişisel hesap test şartı](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

Bu liste yerel hazırlığın sınırıdır: mevcut web sunucusu sağlıklı olsa bile yeni PWA varlıklarının yayını, doğrulanmış TWA, Android cihaz testi ve mağaza kabulü ayrı sonuçlardır.
