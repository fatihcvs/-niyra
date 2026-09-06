# F14-02 — Gerçek içerikle ürün açılış planı

5 Eylül 2026 · Uygulanacak operasyon planı; gerçek öğrenci katılımı, içerik yayını veya açılış kabulü değildir.

[Yol haritasındaki F14-02](../MOBILE_APP_QUALITY_ROADMAP.md), eksik içerik, sahipsiz topluluk, ilk paylaşım ve ilk mesaj için plan ister. Bu belge mevcut uygulamanın gerçek yollarını kullanır. Bu çalışma hesap oluşturmadı, paylaşım/mesaj göndermedi, görevli atamadı ve yayın açmadı. F14-01 öğrenci kabulü, F14-03–05 mağaza/kimlik/politika ve F14-07 yayın onayı ayrı kalır.

## 1. Açılış kararı ve gerçek sorumlular

İlk kohortun kampüsü, gönüllü katılımcıları ve destek kapasitesi seçilmeden geniş davet başlatılmaz. Aşağıdaki boş hücreler **atanmamış/bilinmiyor** demektir; uygulamadaki owner/admin rolü bir insanın bu operasyon görevini kabul ettiği anlamına gelmez. İsim ve özel iletişim bilgileri gerekiyorsa erişimi sınırlı operasyon kaydına yazılır; açık repoya özel numara/e-posta eklenmez.

| Görev | Gerçek sorumlu | Yedek | Kabul ve iletişim kaydı | Sorumluluk |
| --- | --- | --- | --- | --- |
| Ürün açılışı ve durdurma kararı | | | | Kohort, tarih, devam/durdurma ve yayın yetkisi |
| Kampüs içerik koordinasyonu | | | | Kaynak doğruluğu, gönüllü katkılar, eksiklerin takibi |
| Her açılacak topluluğun kurucusu/yöneticisi | | | | Kurallar, istekler, içerik ve katılımcı soruları |
| Platform moderasyonu | | | | `/admin?tab=reports`, karar, itiraz ve riskli içerik |
| Öğrenci desteği | | | | Giriş, ilk görev, yanlış alıcı/başarısız gönderim desteği |
| Teknik müdahale | | | | API/medya/oturum sorunu, sürüm ve veri geri kazanımı |
| Veri/silme ve politika incelemesi | | | | Gerçek silme süreci, saklama, destek ve mağaza beyanları |

| Açılış alanı | Onaylı gerçek değer |
| --- | --- |
| İlk kampüs ve bölüm/ders kapsamı | |
| Kohort davetini kabul eden gerçek katılımcılar için korumalı kayıt bağlantısı | |
| Destek kanalı ve fiilen izlenecek saatler | |
| İlk moderasyon vardiyası ve yedek devri | |
| Açılış tarihi / ürün sahibi onayı | |
| Topluluk bazında kurucu, aktif yönetici ve izinli içerik listesi | |

Destek bilgisi doldurulmadan “7/24 destek”, yanıt süresi veya aktif görevli rozeti vaat edilmez. Kayıt/giriş ekranı ve ayarlardaki yönlendirmelerin gerçek kanala gittiği ayrıca denenir. [F12 silme sözleşmesi](F12_ACCOUNT_DELETION_CONTRACT.md) yalnız talep/iptal/inceleme kuyruğu sağlar; hesabın veya bütün verilerin silindiği söylenmez.

## 2. İçerik kaydı ve boş ekran yaklaşımı

Her içerik için en az şu alanlar insan tarafından tutulur: gerçek yazar/kurum, kullanma veya yeniden yayınlama izni/kaynağı, kampüs/ders/kitle, son doğrulama tarihi, güncelleme sorumlusu, gerçek URL/uygulama kimliği ve kaldırma talebinin yolu. Hassas özel içerik bu planın örneğine kopyalanmaz. Resmî ders kataloğunun bulunması öğrenci notu, güncel etkinlik veya aktif topluluk bulunduğunu göstermez.

| Yüzey | Açılışta doğrulanacak gerçek içerik | İçerik yoksa uygulanacak yaklaşım |
| --- | --- | --- |
| Akış | Gönüllü kişinin kendi paylaşımı; doğru kampüs/platform/ders kitlesi | Boş durum ve gerçek Paylaş eylemi; otomatik hoş geldin gönderisi, sahte beğeni/yorum yok |
| Keşfet ve kişi profili | Arama sonucunun gerçek kişiye/kaynağa gidişi; kişinin görünürlük izni | Sonuç yok açıklaması ve sorguyu/kapsamı değiştirme; uydurma popüler kişi yok |
| Notlar ve ders merkezi | Doğru ders kimliği; izinli dosya veya doğrulanmış kaynak; dosyanın gerçekten açılması | “Bu kaynak yok” durumunu koru; müfredatı sınav/not varmış gibi göstermeme; ilgili öğrenci gönüllüyse kendi dosyasını yükler |
| Topluluklar | Gerçek kurucu, amaç, katılım tipi, kurallar, aktif yönetici | Sahipsiz grubu açılış önerisine alma; aşağıdaki arşiv/inceleme akışını kullan |
| Kampüs / konaklama / etkinlik | Kaynak, yerin güncelliği, varsa konum, etkinliğin gerçek sahibi | Bilinmeyen konumu/saat/fiyatı tahmin etme; gerçek ekleme/öneri yolu; doğrulanmamış ilanı tavsiye gibi sunma |
| Kampüs Anlık | İzinli gerçek güncel paylaşım veya buluşma | Süresi geçmiş içeriği canlı gösterme; aktif paylaşım yok durumu |
| Kütüphane | Gerçek alan ve varsa gerçek, güncel check-in | Operatörün sahte check-in'iyle doluluk yaratma; veri yok ile boş kütüphaneyi ayır |
| Pazar | İlan sahibinin gerçek ürünü/fiyat gözlemi; kullanılabilir iletişim | Hayalî ürün, fiyat, satıcı veya tamamlanmış satış oluşturma |
| Eşleş | Gerçek gönüllünün seçtiği tercihler ve görünürlük | Eşleşme/ilgi talebi sayısı üretme; yeterli aday yok durumunu göster |
| Mesajlar | Birbirine yazmayı kabul eden iki gerçek katılımcı | Boş konuşma listesi ve Yeni mesaj; bot mesajı, “çevrimiçi” veya okunma taklidi yok |
| Bildirimler / Kaydedilenler | Gerçek olay ve kişinin kendi kaydı | Gerçek boş durum; dolu ekran göstermek için notification/save üretme |
| Güvenlik / Ayarlar / Profil | Gerçek destek, hesap ve tercih yolları; kişinin kendi bilgisi | Güvenlik geçmişi yok ile hata durumunu ayır; galeri fixture'larını kişiye taşımama |

`/design-lab` ve `assets/social-live` örnekleri görsel test içindir; gerçek açılış içeriği, öğrenci kabulü veya organik etkileşim kanıtı sayılmaz. [F02 galeri sözleşmesi](F02_DESIGN_SYSTEM.md), preview eylemlerini üretim API'sinden ayırır.

**Önerilen küçük başlangıç kapsamı:** bir kampüs, iki ders bağlamı, yönetimi üstlenilmiş iki topluluk; her topluluk için bir gerçek tanıtım/kurallar kaydı ve bir gerçek güncel konu; seçili derslerde izinli kaynak varsa en az bir kullanılabilir dosya/bağlantı. Bu sayılar Kampira plan önerisidir; mevcut içerik sayısı veya kabul edilmiş kota değildir. Gerçek katkı bulunamazsa kapsam küçültülür veya ilgili alan açıkça boş kalır; sayı tutturmak için taklit içerik eklenmez.

## 3. Sahipsiz veya yanıtsız topluluk

[Topluluk API'si](../../app/api/communities/route.ts), oluşturan kişiyi `founder` ve aktif üye yapar. Gerçek yönetici rolleri `founder/admin/moderator`; katılım `open` veya `request` olabilir. Kurucu veya admin arşivleyebilir. Kurucu topluluktan ayrılamaz (`409`); mevcut `role` işlemi kuruculuğu devretmez, yalnız `member/moderator/admin` destekler. Platformdaki staff admin hesabı topluluğun kurucusu gibi davranmaz.

1. Davetten önce kurucu ve fiilen takip edecek yönetici, kapsam/kuralları ve destek devrini kabul eder. Kurucu isterse mevcut gerçek üyeye uygulamadaki izinli yönetici rolünü verir; bu kurucu devri diye kaydedilmez.
2. Kurucu ulaşılamıyorsa erişilebilen yetkili topluluk admin'i arşivleme kararı alabilir. Yetkili kimse yoksa grup açılışın önerilen kapsamından çıkarılır ve platform moderasyonuna taşınır. Staff'ın mevcut `moderate-content` işlemi topluluğu gizleyebilir; bu sahiplik devri veya silme değildir.
3. Sahipsiz gruba yeni üye/ilk mesaj yönlendirilmez. Sahipsizlik tek başına bütün özel içeriği dışa aktarma veya başka kişiye verme yetkisi yaratmaz. Gerçek devir isteniyorsa kimlik/izin ve veri erişimi değerlendirilmiş ayrı ürün/sunucu çalışması gerekir; doğrudan DB kurucu değişikliği bu planın çözümü değildir.
4. Yeniden açmadan önce gerçek sorumlu, üyelik istekleri, görünür içerik ve itirazlar kontrol edilir. Gizleme/arşivleme ile geri açma sonuçları ilgili liste/detayda yeniden okunur.

Dayanak: [communities PATCH](../../app/api/communities/route.ts) `archive/restore/role/leave`; [staff moderasyonu](../../app/api/admin/route.ts) `moderate-content` ve `community.moderation_status`.

## 4. İlk paylaşım ve ilk mesaj

### İlk paylaşım

Gönüllü öğrenci kendi hesabında Paylaş'ı açar, doğru kitleyi seçer ve kendisine ait/izinli içerikle taslak hazırlar. Önce Back ile çıkar, geri açıp taslağın ve medya seçiminin korunmasını kontrol eder. Sonra **kendi açık eylemiyle** yayınlar. Başarı yalnız gerçek `{post.id}` cevabı ve doğru kitlede yeniden okunan kayıtla kabul edilir; ilerleme yüzdesinin 100 olması yeterli değildir. Hata olursa aynı girişim anahtarı ve içerikle kullanıcı kontrollü retry kullanılır. Belirsiz sonuçta farklı anahtarla ikinci gönderi oluşturmaya yönlendirilmez. Eski anahtarsız istemcinin duplicate koruması yoktur.

İlk paylaşım sıfır beğeni veya yorumla kalabilir. Gerçek ekip üyesi cevaplayacaksa kendi kimliği/rolüyle ve gerçek cevabıyla katılır; popülerlik, çalışan kullanıcı veya otomatik öğrenci cevabı taklit edilmez. [F08 yayın sözleşmesi](F08_PUBLISH_CONTRACT.md) ve [taslak sözleşmesi](F08_DURABLE_DRAFTS.md) uygulanır; süreç/cihaz kabulü ayrıca açık kalır.

### İlk mesaj

Önceden bu denemeye katılmayı kabul etmiş iki gerçek öğrenci kullanılır. Mesaj API'si aynı kampüs, aktif hesap ve engelleme kontrollerini uygular; kampüs dışı veya engellenmiş birine yazdırmak için profil/yetki değiştirilmez. A, B'nin gerçek profilinden veya Yeni mesaj aramasından konuşmayı açar. Yazar, Back→liste→aynı kişi dönüşünde taslağı kontrol eder; gönderim yalnız A'nın açık eylemidir. B kendi hesabında konuşmayı açar ve isterse gerçek cevap verir.

“Gönderildi” sunucu kaydıdır; “Okundu” yalnız backend `read_at` sonucudur. İstemci görünür konuşmada 6 saniye, listede 25 saniye okuma kullanır; sekme gizliyken polling durur. Bu nedenle B'nin uygulaması kapalıyken push veya anında cihaz teslimi vaat edilmez. Cevap gelmemesi teknik hata diye telafi mesajı üretme gerekçesi değildir. [F09 mesaj sözleşmesi](F09_MESSAGES_STATUS.md), [gerçek API](../../app/api/messages/route.ts).

## 5. Moderasyon ve destek işleyişi

Öğrencinin gerçek Bildir/Engelle/Sessize al işlemleri [safety API'sini](../../app/api/safety/route.ts) kullanır. Platform görevli kuyruğu `/admin?tab=reports`, görevli hesabı ve ilk parola değişimi denetimiyle açılır; [staff auth](../../lib/staff-auth.ts) ve [admin API](../../app/api/admin/route.ts) bu erişimi doğrular. Öğrenci moderasyon rolü ile ayrı staff hesabı birbirine karıştırılmaz.

Atanan moderatör açık/itiraz edilmiş şikâyeti inceler; karar ve gerekiyorsa hide/restore sonucunu ayrı doğrular. Kuyrukta “resolved” görünmesi bütün dosyaların silindiği veya yazarın bilgilendirildiği anlamına gelmez. Özel mesaj şikâyeti, tüm konuşmanın genel destek belgesine dökülmesine izin vermez. Destek kaydı yalnız gerekli sınırlı olay bilgisini taşır; özel kanıt erişimi yetkili kuyrukta tutulur.

**İşletim önerisi, henüz SLA değil:** fiilen duyurulan destek saatlerinde ilk temas için bir iş günü; açık üyelik ve olağan şikâyetleri aynı çalışma gününde gözden geçirme; acil özel veri/yanlış alıcı/veri kaybı şüphesini sayı beklemeden teknik ve moderasyon sorumlusuna aktarma. Nöbet, iletişim ve kapsama onayı yoksa bu süreler öğrenciye taahhüt edilmez. Tekrarlayan yanıtsızlıkta yeni davet artışı durdurulur. Teknik ve gizlilik olayları [müdahale planına](F14_INCIDENT_RESPONSE_PLAN.md) geçer.

## 6. Aşamalı uygulama ve karar kaydı

| Aşama | Yapılacak gerçek iş | Devam kanıtı / durdurma nedeni |
| --- | --- | --- |
| Davet öncesi | Yukarıdaki isim/kanal/saatleri doldur; gerçek içerik ve izinleri doğrula; ana akışların boş/hata durumlarını dene | Sahipsiz grup, eksik destek veya yanlış kaynak varsa kapsamı açma |
| Küçük gönüllü oturum | G01–G06'yı açıklama yapmadan uygula; ekran, yardım, yanlış dönüş ve gerçek sonuçları kaydet | Kritik yanlış veri, yanlış alıcı veya taslak kaybı varsa yayılımı durdur |
| Sınırlı kampüs açılışı | Gerçek katılımcılar kendi içeriklerini üretir; her gün içerik güncelliği, istekler ve destek kapasitesi gözden geçirilir | “Dolu görünüm” yerine gerçek bulunabilir kaynak/yanıt ve güvenli işlem kanıtı |
| Kapsam artışı | Ürün sahibi somut oturumları ve açık riskleri değerlendirir | Cihaz/öğrenci/mağaza kapılarını belge teslimiyle kapatma |

G01 okuma/kaydet/yorum, G02 kişi→geri, G03 taslak→fotoğraflı yayın, G04 mesaj taslağı→geri, G05 ders kaynağı, G06 topluluğa katılma; metinler [F01 altı görev sözleşmesindedir](F01_EXPERIENCE_CONTRACT.md). Her biri tek görev sayılır; alt adımları sayarak başarı şişirilmez. Yardım aldıysa yardımsız başarıya yazılmaz. Yol haritasının 5–8 nitel katılımcı ve 10 öğrenci×6 görevde %90 yardımsız hedefi **öneridir**, yapılmış araştırma veya temsil iddiası değildir.

İlk Play yayını için “%5 staged rollout” bir başlangıç yolu olarak yazılmaz: Google bu yöntemi mevcut uygulama güncellemeleri için tanımlar. İlk yayından önce uygun test track'i ve [F14 mağaza kapıları](F14_RELEASE_GATES.md) ayrı tamamlanır. [Google Play staged rollout belgesi](https://support.google.com/googleplay/android-developer/answer/6346149?rd=1), 5 Eylül 2026 kaynak kontrolü.

## 7. Bu belgenin kapanış sınırı

Planın kod dayanakları incelendi. Gerçek sorumlular, kampüs/kohort, içerik izinleri, öğrenci görev sonuçları, destek vardiyası, cihaz/Play testi ve yayın kararı yukarıda doldurulmadı. Bu dosya F14-02'nin **plan çıktısıdır**; planın uygulanmış veya F14 fazının kabul edilmiş olduğu anlamına gelmez. F14-07 ancak ayrı gerçek kanıt ve açık yayın yetkisiyle değerlendirilebilir.
