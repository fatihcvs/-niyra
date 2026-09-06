# F14-06 — Web/API, mesaj ve Android olay müdahale planı

5 Eylül 2026 · Kodla ilişkilendirilmiş prosedür; çalışan nöbet/alert sistemi, yapılmış rollback veya fiziksel cihaz kabulü değildir.

Bu plan [F14-06](../MOBILE_APP_QUALITY_ROADMAP.md) için tespit, etkiyi sınırlama, sürüm/veri uyumu ve geri kazanım adımlarını tanımlar. Bu çalışma production telemetry, deployment, mağaza işlemi veya veritabanı değişikliği yapmadı. Gerçek sorumlular ve iletişim kanalı [açılış planındaki](F14_LAUNCH_CONTENT_PLAN.md) boş atama tablosundan alınacaktır; atanmamış sorumluluk çalışır hizmet sayılmaz.

## 1. Bugünkü sistem ve müdahale sınırı

| Mevcut dayanak | Operasyonel anlamı |
| --- | --- |
| [Dockerfile](../../Dockerfile), [Railway config](../../railway.json), [Wrangler Railway config](../../wrangler.railway.jsonc) | Vinext Worker ve client build'i, Docker üzerinde Wrangler `--local`; `DB` D1 ve `FILES` R2 binding'leri. Bu topoloji yönetilen uzak Cloudflare D1/R2 varsayımıyla işletilmez. |
| [railway-start.sh](../../scripts/railway-start.sh) | Önce SQL migration'larını uygular, sonra sunucuyu aynı `--persist-to` diziniyle başlatır. Varsayılan `UNIYRA_DATA_DIR=/data`; gerçek Railway volume mount'u ve yedekleri ayrıca kontrol edilmelidir. |
| [GET /api/health](../../app/api/health/route.ts) | DB üzerinde `SELECT 1`; FILES için yalnız binding varlığı. HTTP200, dosyaların okunabildiğini, mesaj yazımını veya migration sürümünü kanıtlamaz. `version:1.8.0` sabit metni commit kimliği değildir. |
| [railway.json](../../railway.json) | Yeni deployment health yolu `/api/health`, timeout300sn; `ON_FAILURE`, en fazla5 restart. Sürekli kullanıcı akışı izleyicisi değildir. |
| [public/sw.js](../../public/sw.js) | Sadece kurulum varlıkları ve offline fallback cache'i; API/özel medya/mesaj cache veya offline yazma kuyruğu yok. Yeni worker mevcut sekmeler kapanana kadar bekler; açık eski web JS istemcileri yaşamaya devam edebilir. |
| [F00 yerel ölçüm](F00_WEB_MEASUREMENT.md) | Yalnız development + açık Start; otomatik gönderim yok. Event/LoAF/longtask/scroll verisi, native crash/ANR veya üretim alarmı değildir. |
| [Native scout teslimi](../../experiments/mobile-native-spike/DELIVERY.md) | Yerel JS/Metro/Hermes kanıtı; imzalı kurulu Android istemcisi, gerçek cookie/özel medya veya Android vitals kanıtı yok. Native/TWA nihai ADR ve cihaz kapısı açık. |

### Gerçekten kullanılabilen kontrol ve olmayan kontrol

Owner `/owner?tab=settings` üzerinden `registrationOpen`, `noteUploadsOpen`, `communityCreationOpen`, `housingContributionsOpen` alanlarını değiştirebilir; kapsamları ilgili kayıt/not/yeni topluluk/konaklama route'larıyla sınırlıdır. [Owner API](../../app/api/owner/route.ts) `save-settings`, [ayar sözleşmesi](../../lib/platform-settings.ts).

**`maintenanceMode` genel yazma kilidi değildir.** [PlatformBanner](../../app/platform-banner.tsx) ayarı mount sırasında okuyup duyuru gösterir; canlı push/poll duyurusu yoktur. `/api/posts` ve `/api/messages` bu ayarla durmaz. Kullanıcıdan sayfayı yenilemesini istemek yerel taslak/süreç riskinden bağımsız değildir. Genel acil yazma kapısı bu planda uygulanmadı. Veri bütünlüğü için tüm trafiği durdurmak gerekirse teknik sorumlu/ürün sahibi açık etki ve kesinti kararıyla altyapı seviyesinde seçeneği değerlendirir; bakım düğmesinin bunu yaptığını varsaymaz.

Staff `/admin?tab=reports` üzerinde karar/hide/restore ve hesap askıya alma işlemlerini kullanabilir. `set-user-status:suspended` kullanıcının mevcut oturumlarını siler; bu hesap silme değildir. Kullanıcı veya mesaj hedefli bir müdahale ancak yetkili, gerekçeli vaka üzerinden yapılır. [Admin API](../../app/api/admin/route.ts), [staff erişim sınırı](../../lib/staff-auth.ts).

## 2. Sorumluluk ve önerilen tetikleyiciler

| Sorumluluk | Atanmış kişi | Yedek | Gerçek kanal / kapsanan saat |
| --- | --- | --- | --- |
| Olay yöneticisi, durum ve kapanış kararı | | | |
| Web/API ve Railway müdahalesi | | | |
| Veri/medya uzlaştırma ve geri yükleme onayı | | | |
| Moderasyon, mahremiyet ve hesap talepleri | | | |
| Öğrenci destek iletişimi | | | |
| Android/Play yayılım durdurma ve düzeltme | | | |

Aşağıdaki değerler **Kampira işletim önerisidir; ölçülmüş taban, kurulmuş alarm, kabul edilmiş SLO/SLA veya Google eşiği değildir**. Sorumlular, örneklem ve görevli saatleri onaylanmadan dışarıya süre taahhüdü verilmez.

| Seviye | Açılma önerisi | İlk işlem ve önerilen süre |
| --- | --- | --- |
| SEV0 — veri/kimlik | Tek doğrulanmış başka hesaba ait özel veri, yanlış alıcıya yazım, yetkisiz özel medya veya kalıcı veri kaybı | Sayı/oran beklemeden yayılımı durdurma kararı; kanıtı sınırlı erişimle koru. Atanmış aktif nöbet varsa ilk15dk olay sahipliği hedefi. |
| SEV1 — ana görev kesintisi | Yetkili ana görev isteklerinde 10dk pencerede en az20 örnekte ≥%5 beklenmeyen 5xx/ağ timeout; küçük kohortta art arda3 bağımsız doğrulanmış ana görev başarısızlığı alternatif tetikleyici | Yeni deploy/davet artışını beklet; son değişiklik ve kapsamı ayır; ilk30dk müdahale yönü hedefi, garantili çözüm süresi değil. |
| SEV1 — kurulu Android başlangıcı | Gerçek aday/dağıtılmış sürümde tekrar üretilebilen açılış crash'i veya ana görevi kapatan ANR; küçük örneklemde vitals yüzdesi beklenmez | Play/Android sorumlusu sürüm-cihaz kümelerini inceler; mümkünse yayılımı durdurur. Mevcut checkout'ta bu veri henüz yok. |
| SEV2 — sınırlı bozulma | Tek route, medya türü veya tarayıcıda güvenli geri dönüşü olan hata | Etkilenen görev, sürüm ve workaround kaydı; destek saatlerinde bir iş günü triage önerisi. |

Beklenen 401, erişimi olmayan hedefin403/404'ü, geçerli429 ve doğrulama400'ü doğrudan sunucu hata oranına katma. Yanlış oturum/owner yüzünden beklenmedik401'i ayrıca incele. Gecikmeyi tüm HTTP cevabı, upload, ekran hazır oluşu ve history-scroll şeklinde ayrı tut; tek “performans” sayısına çevirme. Minimum örneklem yoksa “veri yetersiz” yaz; %0 üretme.

## 3. İlk inceleme ve kişisel veriyi sınırlama

1. Olay kaydı aç: başlangıç zamanı/zaman dilimi, gerçek ortam, deployment/commit, görev adı, gözlenen HTTP status/hata kodu, etki ve bilinen son başarılı adım. Aynı belirtinin uygulama, bağımlı servis, bağlantı veya tek cihaz kaynaklı olup olmadığını henüz bilinmiyorsa açık bırak.
2. Yeni dağıtım ve kapsam artışını durdurma kararını yetkili sorumluya bağla. Çalışan isteklerin sonucunu kaydetmeden toplu yeniden gönderim, cookie/storage temizleme, DB silme veya istemci anahtar sıfırlama yapma.
3. `/api/health` ve deployment süreç durumunu salt okunur kontrol et. Genel sağlık yeşilse ilgili gerçek route/medya erişimi ayrıca incelenir. Production logunu genişçe kopyalamak yerine gerekli hata zamanı/deployment ve dar olay kapsamını kullan.
4. Kullanıcıdan parola, cookie, token, bütün konuşma, tam URL query veya dosya içeriği isteme. Kullanıcının isteğiyle alınan ekran kaydını özel içerik görünmeyecek şekilde sınırla. Gerekli özel vaka kimlikleri yalnız yetkili olay kaydında; açık repo/günlük/yerel web ölçüm JSON'una taşınmaz.
5. Veri erişimi ya da kaybı şüphesinde kapsamın doğrulanmış kısmını ve belirsizliği ayrı yaz. Bildirim/yasal karar gerçek yetkiliye aittir; “etkilenmediniz” veya “veriniz silindi” sonucu teyitsiz verilmez.

## 4. Yayın öncesi ve sonrası istemci/API uyum matrisi

“N” yayımlanacak aday, “N−1” gerçekten desteklenecek önceki sürümdür; mevcut bir Play sürümü varmış gibi versionCode doldurulmaz. Matrisin her hücresi izole ortamda gerçek binary/web artifact ile denenene kadar **açık** kalır.

| İstemci / backend | Denenecek sözleşme | Bugünkü dayanak ve sınır |
| --- | --- | --- |
| Eski açık web sekmesi / yeni backend | Giriş,401/logout, JSON/multipart, anahtarsız post/mesaj, bilinmeyen ek alanlara dayanım | [F08](F08_PUBLISH_CONTRACT.md) ve [F09](F09_MESSAGES_STATUS.md) eski anahtarsız çağrıları kabul eder; retry tekilleştirme eski istemcide yok. Bu iki route testi bütün API uyumu değildir. |
| Yeni web / yeni backend | Aynı Idempotency-Key ve clientMessageKey ile tek kayıt; gerçek post/message kimliği; owner değişiminde eski yanıtın etkisizliği | [authenticated fetch sözleşmesi](F04_SCOPED_SESSION_REQUESTS.md), [yayın](F08_PUBLISH_CONTRACT.md), [mesaj](F09_MESSAGES_STATUS.md). Gerçek ağ/çok sekme cihaz kanıtı ayrı. |
| Yeni web / geri alınmış backend | Yeni anahtarların anlaşılması, hata/cevap şekli, mevcut şema ve medya erişimi | En riskli rollback hücresi: eski server anahtarı yok sayıyorsa yeni istemci retry'si duplicate doğurabilir. Böyle sürüm güvenli rollback adayı sayılmaz; uyumlu fix-forward veya kontrollü kesinti değerlendirilir. |
| Desteklenen native/TWA N−1 ve N / aday ve rollback backend | Gerçek oturum saklama/iptali, SameSite/origin, özel image/file/Range, arka plan dönüşü ve deep link | Henüz gerçek imzalı kurulu binary doğrulaması yok. Scout export'u bu hücreleri geçirmez. |
| Oturum yok, engelli, kampüsü değişmiş kullanıcı / her backend | Özel dosya ve konuşma yetkisi korunur, yanlış owner cache'i görünmez | [post media](../../app/api/posts/media/route.ts), [profile media](../../app/api/profile/media/route.ts), [note file](../../app/api/notes/file/route.ts), [messages](../../app/api/messages/route.ts). |

Geçişte mevcut HttpOnly oturum, same-origin ve özel medya yetkisi gevşetilmez. Çerezleri JS'ye açmak veya özel dosyaları public cache'e almak uyumluluk çözümü değildir. `/api/posts/media` için geçerli Range206, geçersiz Range416, yetkisiz/silinmiş404, eksik nesne409 ayrı kontrol edilir. Health içindeki `storage:configured` bunları doğrulamaz.

Her adayda önce uygulama hash'i/deployment, schema migration listesi, varlık seti, PWA/DAL ve rollback adayını kaydet. Sonra izole ortamda matrisi çalıştır. Yetkilendirilmiş pilotta gerçek okuma ve sınırlı gönüllü yazma kontrolü yapılır; aynı kaydı/mesajı farklı anahtarla tekrar gönderme kabul yöntemi değildir. Son kontrol sonuçlarını önceki sürümle aynı görev/cihaz bağlamında karşılaştır.

## 5. Belirtiye göre müdahale

| Belirti | Tanı ve güvenli iyileştirme yolu |
| --- | --- |
| 503 veya açılış çökmesi | Worker boot, uygulanmış migration, `/data` mount ve kapasite, DB sorgusu ve deployment hata logunu ayır. Tekrarlı restart'ın veri/migration sorununu çözdüğünü varsayma; yapılandırma bu repo için en fazla5 deneme ister. |
| Gönderi sonucu belirsiz | `[post.id]` ve mevcut yayın girişimini uzlaştır. 2xx bozuk JSON başarı değildir; retry aynı owner/anahtar/payload. 409 conflict veya410 POST_REMOVED'da kör retry yok. Upload iptali sunucuda rollback değildir. |
| Mesaj görünmüyor/iki kez görünüyor | İstemci listesinde ID tekilleştirmesi ile DB'deki iki ayrı kaydı ayır; aynı sender+clientMessageKey replay'ini kontrol et. `read_at` yalnız gerçek recipient okuması; polling/background sınırını ağ arızasıyla karıştırma. 403/404 erişim kararını bypass etme. |
| Dosya/medya açılmıyor | Önce yetki ve metadata, sonra FILES nesne varlığı/Range. DB ile nesne yükleme aynı transaction değildir. `pending` eski yüklemeyi “orphan” sayıp topluca silme; [F08 cleanup sınırını](F08_PUBLISH_CONTRACT.md) kullan. |
| Yanlış hesap/oturum sızıntısı | Eski owner isteği, aktif session revision ve cache kapsamını incele; olayı SEV0 olarak sınırla. Sırf UI yenilendi diye özel veri temizliği tamamlandı deme. |
| Moderasyon veya silme beklentisi | Hide/restore/askıya alma ile gerçek silmeyi ayır. Karar, içerik görünürlüğü ve audit sonucunu yeniden oku. [F12](F12_ACCOUNT_DELETION_CONTRACT.md) request/review kuyruğuna “tamamlandı” durumu uydurma. |
| Web donması / Android ANR bildirimi | Web JS/LoAF ve gerçek Android trace/vitals kaynaklarını ayrı tut. Tekrarlanabilir görev, gerçek release/build türü, cihaz ve platform sürümünü kaydet; CUA komut beklemesini veya development frame'ini ANR sayma. |

Mesaj/post/medya uzlaştırması kullanıcı adına tekrar gönderme izni değildir. Topluluk yazımlarında bütün API'leri kapsayan idempotency yoktur; sunucu sonucu belirsizse mevcut kaydı oku ve yetkiliyle çöz, otomatik kör retry döngüsü kurma.

## 6. Railway kod rollback'i ve veri geri kazanımı

**Kod rollback'i ayrı, veri geri yükleme ayrı karardır.** Railway'in deployment rollback'i önceki Docker image ve custom variables'ı geri getirir; gerçek hesabın image saklama süresi seçeneği kısıtlayabilir. Yetkili kişi doğru proje/ortam/service/deployment üzerinde işlem yapmalı, geri gelen değişkenlerin mount/origin/oturum davranışını karşılaştırmalıdır. [Resmî deployment actions](https://docs.railway.com/deployments/deployment-actions), 5 Eylül 2026 kontrolü.

1. Önce gerçek son iyi deployment ve build kaynağını seç; dirty çalışma kopyası veya sabit health sürümü yeterli değildir. Değişiklik sadece yeni backend'de değil, açık eski/yeni web sekmelerinde de olabilir.
2. Canlı volume mount'unun `/data` karşılığı, backup kapsamı/tarihi, recovery yetkisi ve korunacak son yazımlar saptanır. Bu inceleme mevcut Railway hesabının bağlı volume veya yedeğini doğrulamadı.
3. Startup'ın migration uyguladığını hesaba kat. Önceki uygulama mevcut ileri schema'yı okuyup yazabiliyor mu, replay anahtarlarını koruyor mu? İzole ve uygun erişimle hazırlanmış veri kopyasında doğrula. Kolon/tablo silen ters SQL otomatik çalıştırılmaz. Uyum yoksa eski backend'e kör dönüş yerine fix-forward veya onaylı kesinti seçilir.
4. Yalnız kod dönüşü yeterliyse yetkili rollback'i yürütür; ortaya çıkan deployment hazır görünse de aşağıdaki kabul matrisi tamamlanır. Backup restore bunun otomatik parçası değildir.
5. Veri geri yükleme zorunluysa izinli kesinti ve kayıp pencereyi ayrıca onayla. DB metadata ile FILES nesneleri tutarlı noktadan kurtarılmalı; salt DB snapshot'ı eksik/fazla nesneleri çözmez. Önce geri yüklenebilirlik izole ortamda doğrulanır; canlı dosyalara ad hoc kopyalama veya volume silme bu runbook'ta yer almaz.
6. Sağlayıcının restore akışını gerçek hesabın yetkili panelinde incele. Railway backup restore yeni volume'u aynı mount'a hazırlar ve deploy gerektirir; daha yeni backup'ların kaldırılması etkisi vardır. İşlem öncesi mevcut durumun korunma planı teyit edilmelidir. [Resmî volume backups](https://docs.railway.com/volumes/backups), 5 Eylül 2026 kontrolü. Bu özellik burada yapılandırılmadı veya denenmedi.

**Önerilen geri kazanım hedefleri:** ölçülebilir backup/restore tatbikatı yapılana kadar RPO ve RTO alanları boş kalır. “Sıfır kayıp” veya “30 dakikada düzelir” taahhüdü bu belgede verilmez.

| Geri kazanım kaydı | Gerçek değer |
| --- | --- |
| Aktif deployment / son iyi deployment / artifact hash | |
| Volume mount / backup kimliği ve kapsadığı zaman | |
| Schema uyum testi ve rollback matrisi sonucu | |
| Kabul edilen RPO / RTO ve onaylayan | |
| Son restore tatbikatı, veri/nesne bütünlüğü sonucu | |

## 7. Android/Play dalı — kurulu sürüm oluşunca uygulanır

Android vitals, onay veren kullanıcıların uygun Play kurulumlarından toplanan crash/ANR gibi cihaz verilerini Play Console ve Reporting API üzerinden sunar. Eksik örneklem “crash yok” değildir; oranlar başka araçların session tabanıyla aynı olmayabilir. Atanacak Play sorumlusu sürüm/cihaz kümelerini ve güncel resmî eşikleri inceler. Mevcut development collector bu kaynağın yerine geçmez; hiçbir Crashlytics veya üretim crash SDK'sı bu planla kurulmadı. [Android vitals](https://developer.android.com/topic/performance/vitals/), 5 Eylül 2026 kontrolü.

Dağıtılmış adayda kritik sorun doğrulanırsa ilgili yetkili track/release'i seçer. Staged rollout'u durdurmak yeni dağıtımı sınırlar; sürümü zaten alan kullanıcıları otomatik eski binary'ye döndürmez. Google staged rollout'u ilk yayın için değil güncellemeler için tanımlar. [Play staged rollout](https://support.google.com/googleplay/android-developer/answer/6346149?rd=1).

Tamamı dağıtılmış sürüm için de uygun track'lerde halt seçeneği bulunabilir; internal test istisnası ve önceki uygun sürüm koşulları gerçek Console'da kontrol edilir. Bu işlem hatalı sürümü kullanan herkesin cihazını otomatik onarmaz. [Play fully rolled-out release halt](https://support.google.com/googleplay/android-developer/answer/16285429?hl=en). Bu iki kaynak 5 Eylül 2026'da kontrol edildi; uygulama için store kaydı veya uygulanmış halt işlemi yoktur.

İlgili binary'yi kullananlar kalabileceği için backend uyumu korunur. TWA seçilirse web düzelmesi ile Android shell sürümü farklı kanallardır; Expo seçilirse gerçek native güncelleme dağıtımı ayrıca gerekir. Düzeltme adayı doğru imza/versionCode, cihaz kurulumu, gerçek login/401/logout/özel medya ve ana görev testi sonrası yetkili yayın kararına gider. Mağaza incelemesinin veya kullanıcı güncellemesinin hemen tamamlanacağı söylenmez.

## 8. Kullanılabilir doğrulamalar ve neyi kanıtlamadıkları

Komutlar örnek inceleme/doğrulama girdileridir; bu dokümantasyon turunda tekrar çalıştırılmadı. Çalıştırılacak ortam ayrı seçilir. Build ve `dist` kullanan testler aynı anda koşturulmaz; önce build tamamlanır. Mevcut son birleşik kanıt [yerel doğrulama belgesinde](LOCAL_VERIFICATION_2026-09-05.md) tarih/kapsamıyla durur; sonraki değişikliklere otomatik taşınmaz.

| Araç / test | Kanıtladığı dar alan | Kanıtlamadığı / kullanım sınırı |
| --- | --- | --- |
| `GET /api/health` | Erişim + DB basit sorgusu, FILES binding varlığı | Yazma, özel medya nesnesi, oturum, güncel migration veya native sağlık |
| `npx vinext build`, `npx tsc --noEmit --incremental false` | Yerel artifact üretimi ve tipler | Deployment, veri geçişi, cihaz/mağaza kabulü |
| [validate-artifact.sh](../../scripts/validate-artifact.sh) | ESM default.fetch ve parse edilen hosting JSON | İş mantığı, imza, production sağlık; mevcut Sites/Bash ortam helper'ı gerekir |
| `node scripts/android/release-readiness.mjs` / `--remote` | [F14 kapı sözleşmesindeki](F14_RELEASE_GATES.md) yerel varlık/araç ve açık unauthenticated HTTPS kontrolleri | İmza kökeni, gerçek cihaz, SDK lisans onayı veya release izni; `releaseReady:false`, `publicationAuthorized:false` |
| [post-idempotency](../../tests/post-idempotency.test.mjs), [messages-session-state](../../tests/messages-session-state.test.mjs), [post-media-access](../../tests/post-media-access.test.mjs) | İzole SQLite/route/istemci regresyonları; repeat ve erişim sınırları | Canlı volume/backup, gerçek cookie/binary/network koşulları |
| [account-deletion](../../tests/account-deletion.test.mjs), [staff-dashboard](../../tests/staff-dashboard.test.mjs) | Talep/iptal/review ve staff yetki davranışları | Gerçek hesap silme veya fiilen nöbet tutan insan |
| [local-runtime-smoke.mjs](../../tests/local-runtime-smoke.mjs) | Seçilen base URL'ye gerçek API istekleriyle akış doğrulaması | **Salt okunur değildir:** hesap/profil/gönderi/mesaj/dosya yaratabilir. `KAMPIRA_BASE_URL`/`UNIYRA_BASE_URL` ile uzak ortama yönlenebilir; production health aracı olarak çalıştırılmaz. Yalnız izinli izole ortam ve cleanup planıyla. |

## 9. İyileşme, iletişim ve kapanış

İyileşme kararı yalnız health200 veya deploy `Active` değildir. Aynı etkilenmiş sürümde tekrar: doğru owner'ın login/401/logout akışı; doğru kampüs/kitle feed; yetkili ve yetkisiz özel medya; aynı anahtarlı yayın/mesaj sonucunun tek kayıt olması; gerçek recipient `read_at`; Back/taslak/filtre; moderasyon görünürlüğü ve audit kontrol edilir. Bu kontroller izole kanıtla başlar; canlı yazma ancak ilgili kişilerin açık izinli pilot işlemleriyle yapılır. Veri geri yüklenmişse kesinti aralığındaki yazımlar ayrıca uzlaştırılır.

**Önerilen gözlem:** belirtiyi tekrar üretmeden en az30dk aynı görev/erişim kontrolleri ve destek geri bildirimi; düşük trafikte bu süre tek başına yeterli örneklem sayılmaz. Android iyileşmesi için gerçek binary/cihaz tekrar testi ve mevcutsa vitals trendi ayrı beklenir. Operatör kontrolü bitmeden duyuru “çözüldü”ye çevrilmez.

Destek mesajı şablonu: “`[doğrulanmış görev]` işlemlerinde `[doğrulanmış etki]` inceleniyor. `[bilinen kapsam]`. `[güvenli geçici adım varsa]`. Sonraki bilgi `[atanmış sorumlunun karşılayabileceği zaman]`.” Bilinmeyen kapsam açık kalır; gönderimi tekrar deneyin, hesabı silin veya tüm depolamayı temizleyin gibi veri kaybettirebilecek genel öneri verilmez. Onaylanmış gerçek destek kanalı henüz boş olduğundan bu şablon gönderilmedi.

Kapanış kaydı; neden, etkilenen sürüm/görev, veri etkisi, alınan karar ve yetki, önce/sonra kanıtı, kalan risk, regression testi ve takip sorumlusunu içerir. Kanıt erişimi ve saklama/silme süresini gerçek veri sorumlusu belirler. F14-06 için çalışma prosedürü hazırdır; atanmış nöbet, alarm, rollback/restore tatbikatı, eski native binary uyumu ve gerçek mağaza müdahalesi **açıktır**. Bu belge 15 fazın kabulünü veya üretime çıkış iznini kapatmaz.
