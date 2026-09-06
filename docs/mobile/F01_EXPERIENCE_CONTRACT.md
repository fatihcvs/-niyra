# F01 — Kampira mobil deneyim sözleşmesi

5 Eylül 2026 · Çalışma kopyasından çıkarılan envanter ve uygulanacak davranış sözleşmesi · Sürüm 1

Bu belge [15 faz / 105 görev yol haritasının](../MOBILE_APP_QUALITY_ROADMAP.md) F00-02, F01-01–06 ve F05 tasarım girdisini somutlaştırır. Uygulama kodu bu belge hazırlanırken değiştirilmedi. Kullanıcı fazların uygulanmasını onayladı; bu onay, henüz yapılmamış öğrenci gözlemi, tıklanabilir prototip veya fiziksel cihaz testinin geçtiği anlamına gelmez. F01-07 ve bu belgenin sonundaki kabul kanıtları açık kalır.

**Kanıt dili:** “Mevcut” doğrudan kodda görülen davranıştır. “Hedef” sonraki uygulama fazının sözleşmesidir. “Açık” henüz test edilmemiş veya tasarım kararı gerektiren noktadır. Önceki raporun ekran görüntüleri yeni bir cihaz ölçümü olarak tekrar sayılmaz. Satır referansları bu tarihteki çalışma kopyasına aittir; dosya ve sembol adı kalıcı başlangıç noktasıdır.

## 1. Kapsam ve kaynaklar

15 ana bölüm, `workspaceRoutes` içindeki 15 anahtardır. **Paylaş bir eylemdir**; yeni bölüm sayılmaz. Başka öğrencinin profili, tek gönderi, seçili topluluk, not görüntüleyici ve oluşturma ekranları bu bölümlere bağlı detay/katmanlardır. `/?view=profile` kendi profilini, `/?profile=<publicId>` bir kişiyi açar; bu iki adres aynı kabul edilmez.

| Kod kaynağı | İncelenen sözleşme |
| --- | --- |
| [lib/workspace-navigation.ts](../../lib/workspace-navigation.ts), 1–16 ve 23 sonrası | 15 rota, mevcut URL üretimi, bildirim hedefleri |
| [lib/mobile-navigation.ts](../../lib/mobile-navigation.ts), 1–26 | Dört gezinme kökü + Paylaş, kök eşlemesi, history depth/scroll |
| [app/page.tsx](../../app/page.tsx), `SecondaryView` 1090, `navigateTo` 2528, `goBack` 2569 | Gerçek ekran sahipleri ve shell geçişleri |
| [app/mobile-app.tsx](../../app/mobile-app.tsx), 34–84 | Mobil başlık, beşli bar, yedi kampüs aracı, hesap kısayolları |
| [app/workspace-ui.tsx](../../app/workspace-ui.tsx), 25–54 | Başlık, CSS sınıfından çıkarılan birincil işlem, arama/filtre |
| [app/product-features.tsx](../../app/product-features.tsx), `NotesWorkspace`, `NotificationsWorkspace`, `SafetyWorkspace` | Not, bildirim, güvenlik ve genel arama durumları |
| [app/communities-workspace.tsx](../../app/communities-workspace.tsx), 232–270, 539 sonrası | Güncel topluluk ekranı, yerel detay/oluşturma/etkinlik durumları |
| [app/direct-messages.tsx](../../app/direct-messages.tsx), 66–113 ve 243 sonrası | Aynı URL konuşma geçmişi, taslak ve alıcı seçimi |
| [app/profile-content.tsx](../../app/profile-content.tsx), 18–45, 71–78, 119 sonrası | Profil sekmeleri, sayfalama ve gerçek `<dialog>` medya görüntüleyici |
| [app/mobile-workspaces.css](../../app/mobile-workspaces.css), 8–26; [app/mobile-app.css](../../app/mobile-app.css), 40–58, 87 | 780/781 sınırı, çift başlık satırının mevcut nedeni |

`product-features.tsx` içinde eski bir topluluk uygulaması da vardır. Güncel `SecondaryView`, `app/communities-workspace.tsx` bileşenini kullanır; F05/F10 değişiklikleri aynı isimli eski kod üzerinden yapılmamalıdır. `/admin`, `/owner`, `/legal` ayrı belge rotalarıdır; ana bölüm sayısını değiştirmez.

## 2. Gezinme yapısı

Mevcut alt sıra korunacak başlangıç çizgisidir: **Akış · Keşfet · Paylaş · Mesajlar · Profil**. Paylaş dokunuşu araya bir seçim menüsü veya bölüm geçişi koymadan genel gönderi oluşturmayı açar. Not yüklemek, ilan vermek, eşleşme tercihlerini kaydetmek ve Kampüs Anlık paylaşmak kendi bağlamının eylemidir.

| Ana bölüm / kararlı rota kimliği | Mevcut giriş ve adres | Mobil kök | Mevcut üst işlem sahibi ve gerçek işlem |
| --- | --- | --- | --- |
| 01 Akış / `feed` | Alt bar, logo, sidebar; `/` (`view=feed` de çözülür) | Akış | Shell: Bildirimler; oluşturma `openFeedComposer`; kart işlemleri `FeedPost` içinde |
| 02 Keşfet / `discover` | Alt bar/sidebar; `/?view=discover`; `explore=campus` Kampüsüm sekmesi | Keşfet | `DiscoverView`; arama ve kapsam değişimi. Yeni içerik oluşturan bir üst CTA yok |
| 03 Mesajlar / `messages` | Alt bar/sidebar; kişide Mesaj; `/?view=messages` | Mesajlar | `DirectMessagesWorkspace`: `openNewChat`; konuşmada kendi geri/kişi/menü kontrolleri |
| 04 Kampüs Anlık / `pulse` | Keşfet → Kampüsüm, sidebar; `/?view=pulse` | Keşfet | `CampusPulseWorkspace`: `openComposer`, `load` |
| 05 Eşleş / `match` | Keşfet → Kampüsüm, sidebar; `/?view=match` | Keşfet | `SocialMatchWorkspace`: `setTab("settings")` — Tercihlerim; `load` |
| 06 Kampüs / `campus` | Keşfet → Kampüsüm/bağlamsal bağlantı, sidebar; `/?view=campus` | Keşfet | `CampusGuideWorkspace`: sekmeye göre `setDialog("place"/"event"/"housing")`; Bugün'de ekleme yok; `load` |
| 07 Kütüphane / `library` | Keşfet → Kampüsüm, sidebar; `/?view=library` | Keşfet | `LibraryOccupancyWorkspace`: `setCreateOpen(true)` — Alan ekle; `load` |
| 08 Pazar / `market` | Keşfet → Kampüsüm, sidebar; `/?view=market`; `market=prices/messages` desteklenir | Keşfet | `CampusMarketWorkspace`: `setDialog("listing")` — İlan ver; ikincil `setDialog("price")`, `load` |
| 09 Notlar / `notes` | Kampüsüm, ders kartı, genel arama, sidebar; `/?view=notes`; `notesHref` ders/kaynak parametreleri | Keşfet | `NotesWorkspace`: gerçek yükleme tipi seçildikten sonra `setShowUpload(true)` |
| 10 Topluluklar / `communities` | Kampüsüm, Keşfet bağlantısı, arama, sidebar; `/?view=communities&community=<id>` detay | Keşfet | Güncel `CommunitiesWorkspace`: `setCreateStep(1); setCreateOpen(true)`; `refreshDirectory` |
| 11 Bildirimler / `notifications` | Akış başlığındaki zil, sidebar; `/?view=notifications` | Akış | `NotificationsWorkspace`: `update("read-all")`; okunmamış yokken/busy iken disabled; yenileme |
| 12 Kaydedilenler / `saved` | Mobil Ayarlar hesap kısayolu, sidebar; `/?view=saved` | Profil | `SavedWorkspace`: revision ile yenileme; yeni kayıt oluşturan üst CTA yok |
| 13 Güvenlik / `safety` | Mobil Ayarlar hesap kısayolu, sidebar; `/?view=safety` | Profil | `SafetyWorkspace`: revision ile yenileme; kısıtlama kaldırma ilgili satırda |
| 14 Ayarlar / `settings` | Profil başlığındaki dişli, sidebar; `/?view=settings` | Profil | `ThemeSettings`: tema/okuma tercihi anında; profil düzenleme ve çıkış içerikte; üst kaydet CTA'sı yok |
| 15 Profil / `profile` | Alt bar/hesap kimliği; `/?view=profile` | Profil | Shell: Ayarlar; `ProfileView`: profili düzenle, profil bağlantısı paylaş, çıkış; içerikten oluşturma |

Mevcut kök eşlemesi `mobileRootFor` ile korunur: Bildirimler → Akış; Ayarlar/Güvenlik/Kaydedilenler → Profil; kampüs araçları ve kişi detayı → Keşfet. Geçmiş varsa geri, kullanıcının gerçek geldiği yere döner; kök eşlemesi yalnız doğrudan girişte geri için fallback'tir. Alt barın seçili kökü bir geçmiş kaydı değildir.

**Hedef giriş kuralları:** Normal uygulama içi dokunuş ortak hedef çözücüden geçer. Web'de gerçek `href`, yeni sekme, Ctrl/Meta ve orta tıklama korunur. Dış kaynak, OpenStreetMap ve not dosyası açma işlemleri açık dış/dosya hedefi olarak kalır. API indirme linki sırf SPA sürekliliği için sayfa rotasına çevrilmez. Silinmiş/yetkisiz hedef anlaşılır durum ve geçerli geri yolu verir; başka bir içerik sessizce onun yerine gösterilmez.

## 3. Gerçek ekran durumu ve katman envanteri

Bu tablo veri alanı değil, kullanıcı görevi envanteridir. Her satırdaki görünüm/filtre/kimlik F04'te ekran anahtarıyla korunmalıdır. Taslak metni ve mesaj geçmişi URL/history içine yazılmaz.

| Bölüm | Mevcut alt durumlar ve gerçek işlemler | Mevcut katmanlar | Loading / boş / hata ayrımı ve açık iş |
| --- | --- | --- | --- |
| Akış | Genel/kampüs kapsamı, sayfalama, beğen/kaydet/yorum, yazar profili, paylaş bağlantısı, sahibinde düzenle/sil | Genel composer; kart menüsü ve bildirme penceresi; yorum/düzenleme kart içinde | `postsLoading`, yükleme hatası, boş akış ve sayfalama; kart etkileşim/medya hatası ayrı tutulmalı. Eski kartlar yenileme uğruna kaldırılmamalı |
| Keşfet | Öğrenciler/Kampüsüm, platform/kampüs, çevre seçimi, sorgu; kişi aç/takip; kişi/ders/not/gönderi/topluluk sonuçları | Filtre paneli; kişi ayrı detay hedefi | `peopleStatus` loading/ready/empty/error; genel aramada kısa sorgu, loading/error/no-result. Sorgu boşken ağdaki öğrenci yokluğu arama başarısızlığı değildir |
| Mesajlar | Liste sorgusu, seçili konuşma/alıcı, geçmiş sayfalama, yeni mesaj işareti, kişi başına taslak, gönderme; ek olarak paylaşılabilir içerik seçimi | `newChatOpen`, `pickerOpen`, `reportTarget`, mesaj menüsü; mobil konuşma ayrı katman | Liste/thread/people/history loading ayrı; `sending`, error ve rapor sonucu ayrı. Boş sorgulu alıcı başlangıcı bugün sonuç yok metniyle karışıyor; F09 ayıracak |
| Kampüs Anlık | `live/confession`, sorgu/kategori, süre/görünürlük, reaksiyon, sahibinde kaldırma | `composerOpen`, `reporting`; seçilen fotoğraf/önizleme | Liste loading/error, hiç içerik/filtre boş; `composerError`, publishing ve rapor durumu ayrı. Anonimlik/son kullanım bilgisi doğrulanmış veriden gelir |
| Eşleş | `matches/requests/settings`; niyet, müsaitlik, bekleyenler, ilgi/biyografi/keşfedilme tercihleri; istek gönder/kabul/ret/iptal | `requesting`, `reporting`; tercihler ekran içi form | Yapılandırılmamış profil, eşleşme yok, istek yok ve filtre boş ayrımları var; loading/error/notice/busy. Eşleşme isteği DM gönderimiyle aynı iş değildir |
| Kampüs | `places/events/housing/daily`; seçili nokta, kategori/arama, harita/kaynak, doğrulama/düzeltme; konaklama deneyimi yaz/sil, sahibinde arşivle | `dialog: place/event/housing`; seçili nokta bugün sayfa içi detay, native katman değil | Ana loading/error/notice; konaklama deneyimleri için ayrı loading; boş yer/etkinlik/konaklama/öneri. Bilinmeyen koordinat ve kaynak bilgisi boş sonuçtan farklı |
| Kütüphane | Sorgu/özellik/boş yer filtresi; süreli check-in/check-out; aktif alan; sahibinde arşivle, dış harita | `createOpen`, `checkinArea`; süre seçimi | Loading/error/notice; alan yok ve filtre boş. Kapasite/sinyal yoksa doluluk bilinmiyor; sıfır doluluk diye gösterilemez |
| Pazar | `store/prices/messages`; kategori/sıra/sadece benim; satılık/aranıyor/ücretsiz; fotoğraf kaldır, ilan durumu; fiyat kaldır; ilan isteği kabul/ret/iptal | `dialog: listing/price`, `contacting` ilan mesajı; dosya seçici | Loading/error/notice; ilan/fiyat/ilan mesajı yok ve filtre boş ayrı. İlan mesajları mevcut ayrı iş akışıdır, DM listesine otomatik taşınmaz |
| Notlar | `students/editorial`; all/exams/mine/saved; ders/sıra/yıl/sınav türü; editoryal sayfa; yararlı/kaydet, yorum yaz/sil, dosya aç | `showUpload`, `selected`, `selectedCurated`, `deleteConfirm`; yükleme tipi/dosya/ilerleme | Liste loading/ready/error, filtre boş ve gerçekten ilk not yok; yorum loading/error ayrı; uploadError/progress/uploading. Ders/sınav/kaynak kimlikleri korunur |
| Topluluklar | Keşfet/benim, sorgu/kategori/sıra; detay feed/üyeler/etkinlik/yönetim; katıl/istek/ayrıl; gönderi/yorum/üyelik/moderasyon/bildirim tercihleri | `createOpen` üç adımlı oluşturma; `selected` detay; `eventOpen`; kart yorum/menü/raporu | `directoryState`, `detailState` ayrı; filtre/üyelik boş, hata/retry. Bugünkü boş Diğer, gizlenen RefreshButton'ın yine menü sayılmasından doğar |
| Bildirimler | Tür, okunmamış, sorgu; tek/tümü okundu; içerik hedefi; etkileşim/ders/topluluk tercihleri | `showPreferences` açılan tercih alanı | Loading/ready/error; bildirim yok/filtre boş; busy ve başarısız güncelleme. `notificationHref` bazı türleri yalnız bölüm listesine taşır; tam detay hedefleri F04/F12 işi |
| Kaydedilenler | Metin/tür filtresi, yüklenmiş sayfalar/cursor; kayıt kaldır, kart işlemleri, Akışa dön | Kendi özel modalı yok; yeniden kullanılan kartın katmanları var | Loading/loadingMore/error; ilk kayıt yok; yüklenen sayfalarda filtre boş, cursor varsa tüm arşiv boş denmez |
| Güvenlik | `reports/blocked/muted`; sorgu, şikâyet durum/karar; engel/sessizliği kaldır, görevli geçişi | Ana ekranda özel modal yok; başka ekranların rapor/kişi güvenliği katmanlarıyla bağlantılı | İlk veri yokken yükleme, error/notice/busyId; her listede ayrı boşluk. Sunucu onayı olmadan kısıtlama kalkmış gösterilmez |
| Ayarlar | Light/dark/system, azaltılmış hareket, masaüstü yoğunluğu; profil düzenle; destek/yasal; kayıt/güvenlik; çıkış | Shell profil editörü üzerinden açılan form; tema seçimi modal değil | Yerel tercih seçimi için sahte ağ yüklemesi yok. Depolama/oturum hataları ayrı değerlendirilir; kaydet düğmesi icat edilmez |
| Profil | posts/images/videos/notes/communities/about; kullanıcı/cursor/tab; kendi profilde düzenle/paylaş/çıkış; başkasında takip/mesaj/güvenlik | Profil medyası gerçek `<dialog>`; shell details/academic editörü; karttan rapor vb. | Profil bootstrap ve içerik loading/error/loadingMore ayrı; kullanıcı bulunamadı ≠ gönderi yok. Aynı kimliğin tabı korunur, başka kimliğin verisi gösterilmez |

Alt özellik kaynakları: [Kampüs Anlık](../../app/campus-pulse.tsx) 72–85, 273 sonrası; [Eşleş](../../app/social-match.tsx) 81–99, 225 sonrası; [Kampüs](../../app/campus-guide.tsx) 59–73, 165 sonrası; [Kütüphane](../../app/library-occupancy.tsx) 43–56, 117 sonrası; [Pazar](../../app/campus-market.tsx) 30–54; [Kaydedilenler](../../app/saved-workspace.tsx) 8–45. Notlar 139–165/413 sonrası, Bildirimler 640–649/674 sonrası, Güvenlik 733–760 `product-features.tsx` içindedir.

### Ortak erişim ve rol durumları

- **Girişsiz:** `AuthGate` kayıt/giriş, parola görünürlüğü, geçersiz form/busy/error. Giriş işlemi başarıyla tamamlanmadan özel bölüm kullanılabilir sayılmaz.
- **Akademik bilgisi eksik öğrenci:** `Onboarding` üniversite/fakülte/bölüm/sınıf/ders, katalog yükleme ve hata/yeniden dene; eksik katalog için mevcut elle giriş yolu. 5–6. sınıf/yaz dönemi ve uzun gerçek ders adları kısaltma uğruna veri kaybetmez.
- **Oturumlu öğrenci:** Yukarıdaki 15 bölüm ve ilgili izinli içerik. Oturum süresi dolması, normal boş listeye dönüştürülmez; güvenli girişe dönüş hedefi korunur.
- **Görevli/sahip:** `/admin` ve `/owner` yetkili belge rotaları. Görünür bağlantı yetkilendirme kanıtı değildir. F12-06 mobil görevli kullanımı ve masaüstü kontrollerin korunmasını doğrular; bu belge tam yönetim ekranı yeniden tasarımı tanımlamaz.
- **Yasal/destek:** `/legal` ve bölüm içi anchor'lar korunur. Mevcut olmayan hesap silme/destek süreçleri çalışıyor diye yazılmaz; F12/F14 teslimidir.

## 4. Altı ana öğrenci görevi

Bu altı görev sonraki karşılaştırmalarda aynı kimlikle kullanılacak önerilen test sözleşmesidir. Henüz öğrenci katılımcıya uygulanmadı. Başlangıç hesabı, veri ve görev metni sabitlenir; “yanlış dönüş”, “yardım” ve “tamamlama” önceden tanımlanır. Her görevi tek başına başarı oranına katmak için alt adımları ayrı görev gibi saymayız.

| Kimlik | Öğrenciye verilecek iş | Zincir ve başarı kanıtı |
| --- | --- | --- |
| G01 — Okuma ve etkileşim | İlgini çeken paylaşımı bul, daha sonra dönmek için kaydet ve bir yorum yaz. | Akış → kart/yorum → kayıt; doğru içerik kimliği, sunucu sonucu ve hata halinde taslak; aynı konuma dönüş. Gerçek mutasyon sadece izinli izole hesaplarda |
| G02 — Kişiyi tanıma | Bir paylaşımın sahibine bak; geri dönüp kaldığın paylaşımı bul. | Akış → kişi → içerik sekmesi → geri; kişi kimliği, seçili sekme, yüklenmiş sayfalar ve akış ankora dönüş. Hızlı A→B→geri ayrıca regresyon |
| G03 — Üretme | Bir fotoğraflı kampüs paylaşımı hazırla; önce çıkıp geri dön, sonra yayınla. | Paylaş → metin/hedef kitle/medya → kontrollü çıkış → taslak → yayınla; önizleme, hata/retry ve tek kayıt. Sistem dosya seçimi iptali de kullanılabilir |
| G04 — Mesajlaşma | Bir öğrenciye konuşma başlat; yazarken geri dönüp aynı kişide devam et. | Kişi veya yeni mesaj → konuşma → taslak → liste → aynı kişi; alıcı, yazı/ek ve klavye kontrolü korunur. Gönderim doğrulaması iki izole hesapla |
| G05 — Ders kaynağı bulma | Bir dersin çalışma notunu veya geçmiş sınav kaynağını bul ve aç. | Keşfet arama → gerçek ders → Notlar → öğrenci/editoryal/sınav bağlamı → detay/dosya → geri; ders/source/scope/sorgu/sayfa korunur; dış kaynak dönüşü ayrı kaydedilir |
| G06 — Topluluğa katılma | İlgi alanına uygun topluluğu bul; katılma durumunu öğren ve ilgili içerikten bir üyeye ulaş. | Keşfet/Kampüsüm → Topluluklar → detay → katıl/istek → içerik/üye → kişi → geri; açık/istekli/özel erişim ve sunucu kararı doğru gösterilir |

Kayıt/ilk ders seçimi, kampüste yer bulma, check-in, ilan iletişimi, bildirimden silinmiş içerik, engelleme ve hesap silme **ek kapsam senaryolarıdır**; bu altı görevin sayısına gizlice eklenmez. F00 ekran matrisi ve F11/F12/F13 bunları ayrıca kapatır. Her test için rol, sürüm, ortam, cihaz/viewport, veri durumu, adım, beklenen/gerçek sonuç ve kanıt bağlantısı tutulur.

## 5. Geri, klavye ve katman sözleşmesi

### Mevcut uygulama sınırları

| Sahip | Kodda mevcut davranış | Hedefe taşınırken korunacak / açık kalan |
| --- | --- | --- |
| Shell `pushAppLocation` | Eski scroll'u history state'e yazar; depth artırır | Tek gerçek sayfa/katman açılışına tek giriş; tekrar basma/kapanış iki kez pop etmemeli |
| Shell `restoreLocation` | Aynı URL'yi composer parametresi hariç karşılaştırıp erken döner | DM ve editör gibi aynı URL katmanları kapanırken alttaki veriyi yeniden yüklememeli |
| Genel mobil composer | `compose=1` ile push; kapatma back veya parametre temizleme; yayınlama sırasında kapatma engeli | Taslak parent state'inde; süreç kapandıktan sonra kalıcılık kanıtı yok. Sistem geri ve başarılı gönderim geçmişi ayrıca test edilir |
| Profil editörü | Mobilde `kampiraEditor: details/academic`; kapanış history back | Mevcut marker korunur. Kirli form/süreç sonrası taslak davranışı ortak F04/F08 sözleşmesine bağlanacak |
| Mesajlar | Aynı URL `kampiraMessage` list/thread/new-chat; alıcı seçimi geçici new-chat girişini tüketir | Konuşma geri → liste; yeniden aynı kişi → taslak. History'de mesaj metni yok. Ek seçici/rapor/menü aynı ortak geçmişe bağlı sayılmaz |
| Topluluk detayları | Aç/kapat `community` parametresini replace eder; üç modalda focus/Escape yardımcı işlevi var | Escape desteği Android history desteği değildir. Oluşturma adımı ve üstteki etkinlik/rapor önce kapanmalı |
| Profil medyası | `<dialog>.showModal()`, body scroll kilidi, tetikleyiciye focus dönüşü | DOM dialog cancel ile sistem history birlikteliği test edilmeli; çift kapatma olmamalı |
| Diğer workspace formları | `showUpload/dialog/requesting/reporting/checkinArea` gibi yerel state | Genel katman yığınına taşınma gerekli; bu belge bugün hepsinde Android Back çalıştığını iddia etmez |

### Hedef sırası

1. **Sistem dosya seçici/kamera/izin ekranı:** Önce sistem katmanı kapanır veya uygulamaya sonuç döner. Tek geri aynı anda formu kapatmaz.
2. **IME/klavye:** Sistem geri önce klavyeyi kapatır; odak ve taslak kalır. Web'de klavye durumunu yalnız bir yükseklik farkından kesin bilmiş saymayız; tarayıcı/TWA/native yolunda cihaz testi gerekir. Klavye her açılışında history push yapılmaz.
3. **En üst uygulama katmanı:** Açık menü, filtre, ek seçici, bildirme, onay veya form; yalnız en üst katman kapanır. Form kendi üst onayı/ek seçicisi varsa önce o kapanır. Kapanış tetikleyiciye veya geçerli yakın denetime focus döndürür.
4. **Detay/konuşma:** Kişi, içerik, topluluk veya konuşmadan gerçek önceki listeye; sorgu, filtre, sayfa ve içerik ankora dönüş.
5. **İkincil bölüm:** Uygulama geçmişi varsa onu kullanır; doğrudan girişte tanımlı köke döner. Sahte uzun geri dizisi üretilmez.
6. **Kök ve daha eski uygulama girişi yok:** Platformun normal geri/çıkış davranışı. Kullanıcı sonsuz geri döngüsüne hapsedilmez.

Ekrandaki geri/kapat düğmesi aynı **uygulama katmanını** kapatma isteğini kullanır; klavye açıkken kullanıcı özellikle bu düğmeye basmışsa hedef belirsiz bırakılmaz. Sistem IME sırası ile bilinçli form kapatma farklı girişlerdir. Native `BackHandler` veya web `popstate` bağlamak tek başına kabul kanıtı değildir.

**Kirli form:** Metin/medya seçiminden sonra kullanıcı kontrollü çıkışta taslak saklama veya vazgeçme davranışını görebilir. Ağ işlemi sürerken kapatma sunucuda iptal garantisi anlamına gelmez; iptal desteği yoksa devam eden işlem ve geri kazanım tanımlanır. Retry çift kayıt oluşturmamalı. Taslak ve cache hesap kimliğiyle ayrılır, logout/hesap değişimi eski özel veriyi sonraki kullanıcıya göstermez.

## 6. Typed route ve başlık sözleşmesi — F04/F05 girdisi

Aşağıdaki TypeScript **uygulanacak arayüz taslağıdır**, depoya eklenmiş çalışma kodu değildir. Mevcut slug'lar veri sözleşmesidir; görünen Türkçe etiketler değişse de kimlik sabit kalır. Callback ve `ReactNode` history/URL/cache içine serialize edilmez.

```ts
import type { ReactNode } from "react";
import { workspaceRoutes } from "../../lib/workspace-navigation";
import type { NotesCourse, NotesSource } from "../../lib/notes-navigation";

type WorkspaceId = (typeof workspaceRoutes)[keyof typeof workspaceRoutes];
type RootId = "feed" | "discover" | "messages" | "profile";
type HeaderOwner = "shell" | "workspace" | "messages";
type RouteCapability = Readonly<{
  root: RootId;
  headerOwner: HeaderOwner;
  fallback: RootId;
  label: string; // Sunum; route anahtarı değil.
}>;

type AppTarget =
  | { kind: "workspace"; id: WorkspaceId }
  | { kind: "discover"; query: string; scope: "platform" | "campus";
      section: "people" | "campus" }
  | { kind: "person"; publicId: string }
  | { kind: "post"; postId: string }
  | { kind: "notes"; source: NotesSource; course: NotesCourse | null }
  | { kind: "community"; communityId: string }
  | { kind: "market"; tab: "store" | "prices" | "messages" };

type HeaderAction = Readonly<{
  id: string;                 // Örn. notes.upload, campus.add-event.
  label: string;              // Tam, erişilebilir eylem adı.
  shortLabel?: string;        // Sığarsa görünen kısa metin.
  icon?: ReactNode;           // Kimlik/işlev değil, sunum.
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void | Promise<void>; // Gerçek child handler.
}>;

type TopBarProps = Readonly<{
  title: string;
  leading: { kind: "none" } |
    { kind: "back" | "close"; label: string; onPress: () => void };
  primaryAction?: HeaderAction;
  secondaryActions?: readonly HeaderAction[];
}>;

type SerializableReturnPoint = Readonly<{
  routeKey: string; // Normalleştirilmiş hedef + sorgu/kapsam/kimlik.
  scrollY: number;
  anchorId?: string;
  tab?: string;
  filters?: Readonly<Record<string, string | boolean | number>>;
}>; // Taslak, çerez/token, e-posta, mesaj içeriği içermez.
```

`Record<WorkspaceId, RouteCapability>` ile 15 ana rota eksiksiz kapsanır; `satisfies`/exhaustive switch eksik kimliği geliştirmede yakalar. `AppTarget` mevcut URL'ye tek parser/serializer ile bağlanır; geçerli boş değerlerle bilinmeyen hedef ayrılır. Konuşma gibi mevcut same-URL katmanları bu tipin workspace hedefi diye yeniden push edilmez. Gelecekte entity deep link eklenecekse ayrı tip ve erişim testi gerekir; mevcut `notificationHref` yalnız liste açarken detay açıyor denmez.

### Başlığın tek sahibi

**Web yolu için önerilen somut entegrasyon:** Akış/Keşfet/Profil shell başlığını, Mesajlar kendi başlığını korur. Diğer 11 workspace route'unda `WorkspaceHeader` ortak `TopBar` üzerinden mobil başlığın sahibi olur. `page.tsx` yalnız açık route capability'ye bakarak shell başlığını bastırır. Geri handler'ı dar bir navigation context veya açık prop ile iletilir; bütün çocuk dialog state'leri parent'a taşınmaz. Başlık kayıt etkisiyle parent'a sürekli yeni ReactNode gönderilmez; mount sonrası ikinci başlık parlaması kabul edilmez.

WorkspaceHeader'ın masaüstü h1/eyebrow/description ve tüm gerçek eylemleri kendi masaüstü düzeninde kalır. Mobil başlıkta bir geri, kısa başlık, en fazla bir ana eylem ve varsa dolu overflow bulunur. 320px'de tüm metni sıkıştırmak yerine tam erişilebilir etiketi olan 48px ikon hedefi kullanılabilir. Eylemin yanlış anlaşılacağı yerde kısa metin veya bağlamsal açıklama korunur; her şey “+” olmaz.

Taşınan route'ta `has-mobile-page-header` başlık gizleme kuralları ve ikinci action-only satır kaldırılır. Bu, bütün `workspace-header` veya `workspace-refresh` öğelerini CSS ile gizlemek anlamına gelmez. Boş secondary listede overflow hiç üretilmez. Yenileme diğer menüdeyse görünür ve çalışır; sadece onu gizleyip boş kabuğu bırakmak yasaktır.

`useScreenMotion` bugün yalnız feed-column'ın doğrudan `.app-mobile-header` çocuğunu dışlıyor. Başlık workspace içine taşınırken gerçek içerik için ayrı hareket hedefi seçilir; sticky barın atası transform edilmez, sabit katman geometrisi animasyonla değişmez. Bu değişiklik F05/F13'te scrollbar, safe-area ve açık modal durumlarında doğrulanır.

Native seçilirse aynı action/route anlamları native navigator/header seçeneklerine uyarlanır; DOM/CSS ortaklaştırıldığı varsayılmaz. Web'de bırakılan boş menü gibi doğrulanmış işlev kusurları ayrı dar düzeltmelerle kapanır.

### F05 pilotlarının gerçek callback kabulü

| Pilot | Birincil callback aynen hangi işi yapmalı? | Yenileme ve ek durum |
| --- | --- | --- |
| Notlar | Öğrenci+sınav kapsamı: `setUploadType("cikmis-soru")`; diğerleri: `setUploadType("ders-notu")`; ardından `setShowUpload(true)` | Ders/source/scope değişmez. Başlığın değişmesi dosyayı göndermemeli; submit yalnız form handler'ında |
| Topluluklar | `setCreateStep(1); setCreateOpen(true)` | `refreshDirectory` gerçek callback'i korunur; createData, joinPolicy, courseId ve üç adım bozulmaz. Detay/event modal state parent shell'e kopyalanmaz |
| Kampüs | Places → `setDialog("place")`; Events → `setDialog("event")`; Housing → `setDialog("housing")`; Daily/Bugün → ana ekleme eylemi yok | `load` korunur; tab değişince label/handler/disabled birlikte güncellenir. Eski sekmenin callback'i yeni başlıkta kalamaz |

Her callback bir dokunuşta bir kez çalışır. Async action'ın disabled/busy anlamı korunur; üst çubuk yeni bir API isteği katmanı eklemez. Bildirimlerde `read-all` ve Eşleş'te `settings` eylemleri ayrı simge/anlam kullanır. Profile CTA'lar içerik bağlamına aitse sırf tek üst bar kuralı uğruna oraya taşınmaz.

## 7. Kontrol yoğunluğu ve durum dili

Ortak veri durumu: `idle` (iş henüz istenmedi), `loading`, `ready`, `empty-first-use`, `empty-query`, `empty-filter`, `error`, `refreshing`, `loading-more`. Bunlar mevcut bütün ekranların aynı state union'ını kullandığı iddiası değil, bileşenlerin ayırt edeceği sunum anlamlarıdır. Alan özel durumları (yetkisiz/silinmiş/bilinmiyor/süresi dolmuş) ayrıca kalır.

- Başlangıç araması: kullanıcı daha sorgu girmediyse “Sonuç bulunamadı” yok. Arama için minimum uzunluk varsa kısa açıklama, sorgu girildiyse doğru loading/sonuç durumu.
- Gerçek ilk kullanım: tek yararlı sonraki iş; örneğin ilk notu paylaş veya aramayı dene. Filtre boşsa önce temizle/değiştir; kullanıcıya veri yüklemeyi çözüm diye dayatma.
- Yükleme: sadece ilgili alan. Detay veya yorum yüklenirken hazır profil/akış boşaltılmaz; tekrar yükleme eski kullanılabilir içeriği tutar.
- Hata: hata mesajı + güvenli retry/geri. Başarısız API cevabı boş sonuç göstermez. Buton üzerindeki bekleme, sunucu başarısı değildir.
- Kontroller: kaynak/ana sekme ve arama görünür; uzun filtreler ihtiyaçla açılır. Aktif seçim kapalı filtrede özetlenir ve temizlenir. F05 FilterSheet uygulanırsa uygulanmamış geçici seçim ile uygulanmış filtre ayrılır; mevcut anlık filtre davranışı yanlışlıkla iki kez tetiklenmez.
- Notlar'ın kaynak switch'i içerik bağlamıdır; üstteki tekrar başlık/eyebrow değildir. Öğrenci/editoryal güvenilirlik farkı sadeleştirme sırasında kaybolmaz.
- Boş profilde kullanılmayan medya sekmeleri için azaltma kararı F02/F07 görsel/öğrenci değerlendirmesine bağlıdır. Bütün sekmeler erişilemez hâle getirilmez.
- Kampüs'ün kaynak adresi/tarihi, kütüphanenin tahmin niteliği, piyasa fiyatının öğrenci gözlemi olması ve eşleşme erişim sınırları karar vermeye yarayan bilgidir; “az metin” hedefiyle silinmez.

## 8. Masaüstü ve erişilebilirlik korunumu

Gerçek responsive geçiş 780/781px'dir. 320, 360, 390, 430, **780, 781**, 820 ve 1440px; iki tema ve uzun Türkçe metin test edilir. Normal yazıda mobil üst bar 56–60px + safe-area tasarım başlangıcıdır; büyük yazıda sabit yüksekliğe sığdırma zorlanmaz. Ana denetimler en az 48×48 CSS px ürün hedefini korur; native Android için ayrı dp ölçümü gerekir.

Masaüstünde sidebar, tam başlık/açıklama, bütün header aksiyonları, arama/filtre, tablo/grid ve bağımsız dosya/dış link işlemleri kalır. Paylaş'ın masaüstündeki inline composer/focus yolu korunur. Mobilde menüye giren bir eylem masaüstünde yok edilmez. Görünmeyen mobil/desktop kopyalar aynı anda odaklanabilir olmamalı; ID ve aria-controls çakışması yaratılmamalı.

Her aktif ekran için bir görünür/erişilebilir ana başlık; bölüm alt h2'leri kendi anlamlarını taşır. Geçiş sonrası focus planlı başlık/denetime gider; geri dönüşte önceki içerik tetikleyicisi mümkünse geri kazanılır. Menülerde Escape, sekmelerde uygun klavye hareketi, dialoglarda focus sınırı ve görünür odak doğrulanır. Renk tek seçili durum işareti olmaz. Klavye açılınca gönder/kaydet alanı görünür kalır; fixed alt bar formun üstüne binmez.

## 9. Kabul ve açık kanıt kaydı

| Kimlik | Kabul ölçütü | Gerekli kanıt / bu belgedeki durum |
| --- | --- | --- |
| C01 | 15 rota, erişim noktası, root ve gerçek action sahibi eksiksiz | Kod envanteri bu belgede var; çalışma koduna typed sözleşme henüz uygulanmadı |
| C02 | Tek başlık; sıfır boş menu; Notlar/Topluluklar/Kampüs callback'leri doğru ve bir kez | F05 bileşen davranış testi + 320/390/781/1440 görüntü/DOM ölçümü — açık |
| C03 | 20 ileri/geri turunda yanlış kişi, kayıp sorgu/sekme/cursor/taslak yok | F04/F09 gerçek davranış testleri; same-URL DM/editör ayrı — açık |
| C04 | Klavye → katman → detay → bölüm sırası; çift kapatma yok | Gerçek Android gesture/üç düğme, web Escape/Back, TWA/native seçimine göre — açık |
| C05 | Boş/arama boş/filtre boş/loading/refresh/error ayrımı, kullanılabilir retry | 15 bölüm × ilgili durum matrisi, izole veri/ağ koşulları — açık |
| C06 | Masaüstünde hiçbir gerçek eylem kaybolmadı; büyük yazı/odak/etiketler kullanılabilir | İki tema, 780/781/820/1440; klavye ve TalkBack ayrıca — açık |
| C07 | Altı ana görev açıklamasız tamamlanıyor; geri/durum dili anlaşılır | F01-07 tıklanabilir akış + öğrenci gözlemi; bu belgede görev metinleri var, sonuç yok |
| C08 | Özel veri ve taslak hesaplar arasında karışmıyor; retry çift kayıt yapmıyor | İki izole hesap, 401/logout/ağ kesintisi ve sunucu sonucu — açık |

F01 doküman girdisi hazır olduğunda faz takip kaydına belge bağlantısı yazılabilir. F00 cihaz seçimi/başlangıç ölçümü, F01 prototip/öğrenci gözlemi, F02 görsel tercih, F03 mimari ve F05 uygulama kapıları sırf bu envanter oluştu diye tamamlandı işaretlenmez.
