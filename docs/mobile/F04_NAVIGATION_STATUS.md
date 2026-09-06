# F04 — Gezinme ve tarayıcı kanıtı

5 Eylül 2026. Bu kayıt [deneyim sözleşmesinin](F01_EXPERIENCE_CONTRACT.md) yerel uygulama kanıtlarını sınırlar; F04 veya diğer fazların genel kabulünü kapatmaz. Ana çalışma kullanıcının seçtiği tarayıcıyı CUA ile kontrol etti. Fiziksel Android cihazı kullanılmadı. İlk kayıt mevcut ham kanıt ve ana çalışma gözlemlerinden derlendi. Sonraki ders katmanı tesliminin gerçek test koşusu aşağıda ayrıca kayıtlıdır; [son birleşik yerel sonuçlar](LOCAL_VERIFICATION_2026-09-05.md) ayrı kapanıştır.

## Bölüm geometrisi: 12 sınırlı ölçüm, 3 geçersiz hedef

Ham [mobile-route-geometry.json](../../exports/mobile-quality-implementation-2026-09-05/mobile-route-geometry.json) değiştirilmedi. Dosyanın genel `mode` açıklaması authenticated web der; son üç satırdaki gerçek ekran içeriği bu açıklamanın bütün satırlara uygulanamadığını gösterir. Ana çalışma bu noktada oturumun sona erdiğini bildirdi.

İlk 12 satır 390px viewport içinde ölçüldü. Her birinde `alerts=[]`, beş alt gezinme kontrolü ve `scrollWidth <= width` kaydedildi. Bu, ölçüm anında yatay taşma görülmediği anlamına gelir; bütün düğmelerin, veri/rol durumlarının, dikey scroll'un veya ekran görevlerinin geçtiği anlamına gelmez. `scrollWidth=375` değerinden tek başına bir yerleşim hatası çıkarılmaz.

| Sıra | Bölüm | scrollWidth / viewport | Kaydedilen başlık |
| --- | --- | --- | --- |
| 1 | Mesajlar | 390 / 390 | Mesajlar |
| 2 | Kütüphane | 390 / 390 | Kütüphane |
| 3 | Pazar | 390 / 390 | Pazar |
| 4 | Eşleş | 375 / 390 | Eşleş |
| 5 | Bildirimler | 390 / 390 | Bildirimler |
| 6 | Kaydedilenler | 390 / 390 | Kaydedilenler |
| 7 | Güvenlik | 375 / 390 | Güvenlik |
| 8 | Ayarlar | 375 / 390 | Ayarlar |
| 9 | Akış | 375 / 390 | Liste boş (`headings=[]`) |
| 10 | Keşfet | 390 / 390 | Keşfet |
| 11 | Topluluklar | 390 / 390 | Topluluklar |
| 12 | Kampüs Anlık | 390 / 390 | Kampüs Anlık |

Son üç satır authenticated hedef kabulüne katılmaz:

| Sıra | İstenen hedef | Gerçekte kaydedilen yüzey | Karar |
| --- | --- | --- | --- |
| 13 | Kampüs | “Kampüs rehberini görmek için giriş yapmalısın.” uyarısı | Giriş sonrası Kampüs kapsamı ölçülmedi. |
| 14 | Notlar | “Not kütüphanesini kullanmak için giriş yapmalısın. Yeniden dene” uyarısı | Giriş sonrası Notlar kapsamı ölçülmedi. |
| 15 | Profil | “Kampira hesabını oluştur.” başlığı; sıfır alt gezinme kontrolü | Profil yerine hesap açma yüzeyi ölçüldü. |

**Bu dosya 15/15 başarılı bölüm veya 12/12 tamamlanmış akış kanıtı değildir.** Son üç hedef, yeni geçerli oturumla ayrı yeniden kontrol bekler. Oturum sonlanmasının nedeni veya süresinin doğruluğu bu geometri kaydından teşhis edilemez.

## Önceki bağımsız ekran kontrolleri

Aşağıdaki gözlemler ana çalışmanın daha önce yürüttüğü ayrı oturumlardır. Son üç geometri satırının yerine konup kesintisiz 15/15 matrisi oluşturmazlar.

| Ekran | Mevcut kanıt | Desteklediği dar sonuç |
| --- | --- | --- |
| Notlar | [Başlık](../../exports/mobile-quality-implementation-2026-09-05/notes-390-header.png), [son ekran](../../exports/mobile-quality-implementation-2026-09-05/notes-390-current.png) | Ana çalışmanın ölçümünde ilk kaynak kontrolünün üst konumu 132px'den 69px'e indi; scrollWidth/clientWidth 390/390. Form taslağı CUA history dönüşünde kaybolduğu için controlled state'e taşındı; genel Notlar hata/rol matrisi değildir. |
| Kampüs | [Seçili mekân detayı](../../exports/mobile-quality-implementation-2026-09-05/campus-detail-390.png), [katman teslimi](F11_CAMPUS_STATUS.md) | Seçilmiş detay yüzeyi ayrı kaydedildi; tüm kaynak, öneri/konaklama, masaüstü ve oturum dönüşleri tamamlandı sayılmaz. |
| Profil düzenleme | [Önce](../../exports/mobile-quality-implementation-2026-09-05/profile-editor-390-before.png), [sonra](../../exports/mobile-quality-implementation-2026-09-05/profile-editor-390-after.png) | Ana çalışma CUA'da Back ile taslağın korunduğunu, açık “Vazgeç” eylemiyle temizlendiğini bildirdi; ayrıca üç React DOM testi geçti. Tüm profil sekmeleri ve bütün medya zincirlerinin kabulü değildir. |

[320×568 Notlar filtresi](../../exports/mobile-quality-implementation-2026-09-05/notes-filter-320x568.png) ve galeri görüntüleri de ayrı görsel kayıtlardır. Görüntü dosyasının varlığı, ölçülmemiş bir kontrolü veya fiziksel select/IME davranışını passed yapmaz. Galeri mesaj detayı bir sunum adaptörüdür; gerçek DM teslim/polling kanıtıyla karıştırılmaz.

## Galeri geometrisi: 16 ayrı örnek

[gallery-geometry-matrix.json](../../exports/mobile-quality-implementation-2026-09-05/gallery-geometry-matrix.json), development-only sentetik galeriden 16 CUA DOM ölçümü içerir. Feed, profil, mesaj listesi, Notlar, Kampüs ve durum örnekleri; seçili 320/360/390/430/780/781/820/1440px genişliklerde kontrol edildi. Bu, her ekran × genişlik × tema kombinasyonunun tam matrisi değildir.

- On altı satırda da `scroll <= client`; ölçüm anında yatay taşma yok.
- 780px ve altındaki 13 satırda beş alt gezinme kontrolü; 781/820/1440px satırlarında mobil gezinme kontrolü yok. Bunlar galeri kabuğunun geometri sonuçlarıdır.
- `theme` alanı istenen temadır. Hızlı navigasyon ardından ilk snapshot tema effect'i ve medya yüklenmesinden önce alınabildi; her satırın gerçekten o temada boyandığı doğrulanmadı. Bu kayıt veya ilk screenshot'lar tamamlanmış görsel tema/medya yükleme kabulü sayılmaz.
- Durum örneğindeki “İçerik getirilemedi” uyarısı açıkça etiketli yerel hata fixture'ıdır. Authenticated ürün/API arızası diye kaydedilmez.

Gerçek hesapla bölüm geometrisi, bu sentetik galeri matrisi ve daha sonra hydration tamamlanınca alınan seçili ekran görüntüleri ayrı kanıt türleridir.

## Scroll: kaydedilen konum ile dönüş aynı

Ana çalışmanın CUA tanısı aşağıdaki üç anı ayırdı. Sayılar bu çalışma mesajındaki ölçüm bildiriminden alınmıştır; geometri JSON'u scroll alanı taşımaz ve burada yeni performans log'u üretilmedi.

| Ölçüm anı | Dikey konum |
| --- | ---: |
| CUA tıklamasından önce | 2107px |
| CUA öğeyi görünür alana kaydırdıktan sonra, uygulama history `push` anında kaydedilen | 1984px |
| Back sonrasında geri yüklenen | 1984px |

Bu örnekte **kaydedilen 1984px = geri yüklenen 1984px**. 2107−1984 = 123px fark, tıklama aracının navigasyon öncesi görünür alana kaydırmasıdır; bu ölçüm ürünün 123px scroll kaybettiğini doğrulamaz. Tek dönüş; async içerik, bütün profil/not/arama zincirleri veya 20 ardışık dönüş kabulünün yerine geçmez. Süre/FPS/frame/bellek veya fiziksel parmak dokunması ölçülmedi.

## İç içe medya katmanları: kırmızı koşu ve yerel kapanış

`node --test --test-isolation=none tests/media-layer-regressions-runtime.test.mjs` ilk koşuda **0/3** ile gerçek React davranış hatalarını doğruladı. Ana çalışma düzeltmelerinden sonra aynı dosya iki ek senaryoyla **5/5** geçti; scoped ESLint exit 0 bildirildi. İlk kırmızı kayıt silinmez; sonraki koşu aşağıdaki belirli hataların **verified-local** kapanışıdır.

| Senaryo | Düzeltme / yeniden test |
| --- | --- |
| İç medya ArrowRight dış profil gönderisini de ilerletiyordu. | İç katman yayılımı durduruyor; dış katman işlenmiş/iç dialog olayını atlıyor. Dış sayaç aynı, iç görsel ilerliyor. |
| Seçili attachment kaldırıldığında görünür viewer yokken body/inert kilidi kalıyordu. | Seçim kalan medyaya sınırlandı veya kapandı; kilit yalnız gerçek açık medyaya bağlı. |
| Profil ve iç medya birlikte unmount olduğunda body `overflow:hidden` kalıyordu. | Profil görüntüleyici ortak `useAppLayer` kilit/geçmiş/focus yönetimine bağlandı; unmount kilit ve inert'i bırakıyor. |
| İç ve dış viewer'ın ayrı Back/Forward döngüsü | İç katman ilk Back'te kapanıyor; dış katman ikinci Back'te kapanıyor; Forward fazladan history girdisi oluşturmadan geri açıyor. |
| Bütün medya kaldırıldıktan sonra Forward | Olmayan görsel yeniden açılmıyor; görünmez izolasyon oluşmuyor. |

[Test](../../tests/media-layer-regressions-runtime.test.mjs) gerçek ProfileContent, PostMediaGallery ve ortak hook'u çalıştırır; fetch kontrollüdür, gerçek paylaşım veya mesaj oluşturmaz. jsdom'un native `showModal/close` uyarlaması yalnız `open` attribute'ünü değiştirir. Bu nedenle gerçek tarayıcı top-layer, fiziksel Android Back/IME/focus veya ekran geometrisi kanıtı değildir. Sonraki484/484 suite ve build/lint/TypeScript exit0 [yerel doğrulamada](LOCAL_VERIFICATION_2026-09-05.md) kayıtlıdır; gerçek Android kabulü açık kalır.

## Ders dizini ve detayı: ortak katmana geçiş

Home'daki ders dizini/detay state'i, doğrudan `body.style.overflow` ve pencere Escape dinleyicisi yerine [useCourseHubLayers / CourseHubLayers](../../app/course-hub.tsx) ile ortak `useAppLayer` sistemine bağlandı. Değişiklik ders şeridi tetikleyicileri, iki overlay, bunların state/effect'i ve import alanıyla sınırlıdır; gerçek ders listesi ve mevcut CSS korunur.

- Dizin açıkken ders detayı ikinci history adımı olarak açılır; arkadaki dizin mount edilmiş ama inert kalır. Back/Escape önce detayı kapatır ve odağı seçilen ders düğmesine döndürür; sonraki Back dizini kapatıp şerit tetikleyicisine döner. Forward aynı adımları fazladan kayıt olmadan açar.
- Hook Home'da yaşar: Notlar'a geçişten dönünce hedef ID güncel `profileSubjects` üzerinden çözülür. Ders adı/kapak/sayaç geçmişte kopyalanmaz. Ders kaldırılmışsa veya owner/session scope değişmişse eski detay açılmaz; body/inert izolasyonu kalmaz.
- `Notları gör`, mevcut `navigateTo("Notlar", undefined, { id, code, name })` callback'ini kullanır. `Akışta paylaş`, mevcut campus audience/feed, gerçek course ID ve composer açma sırasını korur. Kendiliğinden yayın veya API isteği başlatılmaz.

Gerçek koşu:

```text
node --test --test-isolation=none tests/course-hub-runtime.test.mjs tests/course-hub.test.mjs tests/app-layer-runtime.test.mjs tests/media-layer-regressions-runtime.test.mjs
# 15/15: 3 yeni gerçek ReactDOM + 2 mevcut ders varlık/sözleşme + 5 ortak katman + 5 medya.
npx eslint app/course-hub.tsx app/page.tsx tests/course-hub-runtime.test.mjs tests/course-hub.test.mjs
# exit 0.
```

Yeni [üç test](../../tests/course-hub-runtime.test.mjs), dizin→detay Back/Forward/Tab/focus; Home JSX'inden AST ile alınan gerçek Notlar/composer callback'leri ve güncel hedef çözümü; kaldırılan ders, owner değişimi ve oturum sonlanmasını çalıştırır. Ağ çağrısı beklenmez ve gerçek içerik üretilmez. Son birleşik484/484 ve build/lint/TypeScript kapanışı alındı; bu ders zincirinin CUA, fiziksel Android ve process restore kabulü ayrıdır.

## Dinamik filtre sonuçlarının katman izolasyonu

CUA'da galeri üzerinde çalışan gerçek `NotesWorkspace` bileşeninde Filtreler açıldıktan sonra ders/tür değişince sonradan eklenen `.notes-active-filters` ve yeni `.feature-note-card` düğümlerinin modal dışından erişilebilirlik ağacına girdiği doğrulandı. Veri yanıtları açık development-only preview yanıtlarıdır; gerçek hesap oturumu kapalıydı. İlk izolasyon yalnız açılış anında mevcut kardeşleri işaretliyordu.

[useAppLayer](../../app/use-app-layer.ts) artık her açık katman için tek `MutationObserver` ile dialog→body yolu üzerindeki ebeveynlerin **yalnız doğrudan `childList`** değişimini izler. Sonradan eklenen kardeşler mevcut inert refcount sistemine katılır; çıkarılan düğümler eski inert değerine döner ve katmanın tutulan kümesinden çıkarılır. Zaten inert olan bir alt ağacın iç değişimleri miras aldığı izolasyonla korunur; tüm sayfayı `subtree` veya attribute gözlemiyle izleme yoktur. Kapanış/unmount observer'ı kapatır ve yalnız o katmanın sahipliğini bırakır. Önceden inert olan düğümler ve başka açık katmanın body kilidi korunur. History/Back/Forward/`busy` sözleşmesi değiştirilmedi.

[Yeni üç gerçek ReactDOM testi](../../tests/app-layer-dynamic-isolation.test.mjs) gerçek `WorkspaceSearch` ders/tür callback'leriyle yeni chip, değişen kart ve kontrollü seçimi; iç içe katmanda yeni ebeveyn eylemi ve body kardeşini; Back/Forward, özgün inert değeri, unmount ve200 hiç açılmamış katmanda sıfır observer'ı çalıştırır. Gözlemci gerçek jsdom `MutationObserver`'ıdır; açıkken1, kapanınca0 ve unmount sonrası0 aktif observer doğrulanır. Mevcut inert alt ağaç içi değişimin callback üretmediği de kontrol edilir.

```powershell
node --test --test-isolation=none tests/app-layer-dynamic-isolation.test.mjs tests/app-layer-runtime.test.mjs tests/app-layer-listener-load.test.mjs tests/workspace-filters-runtime.test.mjs tests/media-layer-regressions-runtime.test.mjs tests/campus-guide-layers-runtime.test.mjs
# 27/27; 0 hata, 0 iptal, 0 skip; yaklaşık5.750 saniye.
npx eslint app/use-app-layer.ts tests/app-layer-dynamic-isolation.test.mjs
# exit0, boş çıktı.
```

Bu otomatik kanıt DOM sahipliği/observer yaşam döngüsüdür. jsdom'un inert uyarlaması gerçek tarayıcı erişilebilirlik ağacını veya TalkBack'i uygulamaz. Otomatik testlerde ağ isteği veya gerçek içerik üretimi yapılmadı.

5 Eylül CUA yeniden kontrolünde, aynı galeri bileşeninde **320×568 / koyu tema / ders + Çıkmış Sorular seçimi** sonrasında dar izolasyon kabulü geçti. [DOM kaydı](../../exports/mobile-quality-continuation-2026-09-05/notes-filter-dynamic-isolation.json), sonradan mount edilen `notes-active-filters` ve `feature-note-card` için `inert:true`; dialog için `inert:false`, `x:0`, `y:0`, `width:320`, `height:568`; sayfa `scrollWidth:320` gösterir. [Görüntü](../../exports/mobile-quality-continuation-2026-09-05/notes-filter-320-dark.png) açıkça **GALERİ SİMÜLASYONU** etiketlidir. Bu, aynı production bileşeninin simüle verilerle gerçek tarayıcıda DOM izolasyon kanıtıdır; oturumlu hesap, gerçek API yanıtları, bütün görsel kalite matrisi veya fiziksel Android/TalkBack kabulü değildir. Bu alt teslimde tam suite çalıştırılmadı; ana çalışmanın birleşik koşusu ayrıca raporlanır.

### Sonraki kardeş veya portal katmanın erişilebilir kalması

Birleşik suite, gerçek ders dizini → detay senaryosunda yeni bir gerileme yakaladı: alttaki dizinin dinamik gözlemcisi, sonradan açılan kardeş detay overlay'ini de `inert` yapıyordu. Böylece üst katmandaki Tab döngüsü kullanılamıyordu. Testin iki büyük DOM düğümünü doğrudan eşitlik hatasında biçimlendirmesi de raporlamayı CPU üzerinde bekletiyordu; bu kontrol artık açık mesajlı kimlik boolean'ı kullanır.

`useAppLayer`, açık izolasyonları açılma sırasıyla tutar. Alt katman, kendisinden sonra açılan dialog'u içeren kardeşlere izolasyon sahipliği eklemez; üst katman arka planı kendi yolu boyunca korur. Açma/kapama, mevcut katmanların sahipliklerini yeniden değerlendirir. Böylece hem aynı DOM kökündeki kardeş hem `document.body` portalı kullanılabilir; Back üst katmanı kaldırınca alt katmanın odağı ve arka plan izolasyonu devam eder. Son unmount bütün sahiplikleri ve body kilidini bırakır.

[İki ek dinamik izolasyon regresyonu](../../tests/app-layer-dynamic-isolation.test.mjs) gerçek ReactDOM ve MutationObserver ile kardeş/portal açılması, üst dialog açıkken yeni arka plan kartı, Tab, Back/Forward ve unmount'u kapsar. [Gerçek ders testi](../../tests/course-hub-runtime.test.mjs) ayrıca detayın bir `inert` ata içinde olmadığını doğrudan doğrular. Odaklanmış [son koşu](../../exports/mobile-quality-continuation-2026-09-05/layer-stack-focused.txt), dinamik izolasyon, dinleyici yaşam döngüsü, ortak katman, ders ve medya testlerinde **20/20** geçti. Bu, jsdom davranış kanıtıdır; değişiklik sonrası gerçek tarayıcı/Android kabulünün yerine geçmez. Son birleşik suite ve yeni derleme ana doğrulama kaydında ayrıca raporlanır.

## Açık kabul kapıları

- Geçerli oturumda son üç bölümün ve tüm form/detay/hata/rol yollarının yeniden kontrolü.
- Bütün kaynak invalidation'ları, async hazır oluş, yenileme ve 20 dönüş döngüsü.
- 320–430px, 780/781 sınırı, 820/1440px ve iki tema için eksiksiz matris.
- Fiziksel Android IME ilk Back önceliği, gesture/üç düğme, TalkBack ve process yeniden açılışı.
- Gerçek cihazda dokunma, frame/decode/bellek ölçümü; öğrencilerle açıklamasız görev kabulü.

Yerel düzeltmeler bu kapıları otomatik kapatmaz. Toplu durum [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) ve değişmeyen 105 görev [phase-progress.json](phase-progress.json) ile izlenir.
