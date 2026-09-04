# Kampira Owner ve Admin panelleri

## Erişim modeli

- `/owner`: yalnızca `owner` rolü; platform istatistikleri, admin hesapları, özellik anahtarları ve tüm staff işlem günlüğü.
- `/admin`: `owner` ve `admin` rolleri; şikâyet kuyruğu, içerik moderasyonu, kullanıcı askıya alma ve moderasyon geçmişi.
- Staff hesapları öğrenci hesaplarından ve `uniyra_session` oturumundan tamamen ayrıdır.
- Staff oturumları `HttpOnly`, `SameSite=Strict`, gerektiğinde `Secure` çereziyle en fazla 8 saat sürer.
- Tüm yazma işlemleri aynı-origin kontrolü, hız sınırı, rol kontrolü ve `staff_audit_logs` kaydı üretir.

## İlk owner girişi

Veritabanında hiç owner yoksa ilk başarılı girişte tek owner oluşturulur:

- Kullanıcı adı: `admin`
- Başlangıç parolası: `admin123`

Bu parola yalnızca bootstrap içindir. İlk girişte panel verilerine erişim kapalıdır ve güçlü parola değişimi zorunludur. Değişimden sonra tüm eski staff oturumları silinir ve yeni oturum açılır.

## Owner yetkileri

- Tüm ürün modüllerinin canlı kayıt sayıları
- Öğrenci, profil, aktif oturum, gönderi, not, topluluk, Kampüs Anlık, mağaza ve şikâyet metrikleri
- Yedi günlük hesap/içerik/şikâyet hareketi
- Üniversite bazlı öğrenci dağılımı
- Admin oluşturma, devre dışı bırakma, yeniden etkinleştirme ve geçici parola sıfırlama
- Yeni kayıt, not yükleme ve topluluk oluşturma anahtarları
- Global bakım duyurusu
- Veritabanı, dosya depolama ve sürüm durumu
- Owner/admin işlem günlüğü

Owner tarafından açılan admin hesapları da ilk girişte kendi güçlü parolasını belirlemek zorundadır. Admin devre dışı bırakıldığında veya parolası sıfırlandığında tüm aktif oturumları iptal edilir.

## Admin yetkileri

- Açık ve itiraz edilmiş şikâyetleri öncelikli kuyrukta inceleme
- Şikâyet kanıt anlık görüntüsünü, gerekçeyi ve itiraz metnini birlikte görme
- Karar yazma ve kararla birlikte içeriği gizleme/geri getirme
- Gönderi, yorum, not, topluluk, Kampüs Anlık, ilan, mekân, etkinlik ve fiyat kaydını doğrudan denetleme
- Öğrenci hesabını gerekçeyle askıya alma veya yeniden açma
- Son içerikleri birleşik akışta arama
- Moderasyon karar geçmişini izleme

## Yeni özellik ekleme sözleşmesi

Yeni bir kullanıcı verisi veya moderasyon yüzeyi eklendiğinde aynı değişiklik setinde:

1. `lib/admin-registry.ts` içine modül kaydı eklenir.
2. Owner genel bakış sayacı yeni tabloyu kapsar.
3. Moderasyon gerekiyorsa `MODERATABLE_ENTITY_TYPES`, Admin birleşik içerik sorgusu ve `applyModerationState` güncellenir.
4. `tests/staff-console.test.mjs` kapsam beklentisi güncellenir.
5. Yeni kritik kullanıcı işlemi varsa owner özellik anahtarına bağlanır.

Bu kayıt defteri hem Owner modül envanterini üretir hem de yeni ürün alanlarının yönetim panellerinden unutulmaması için test sözleşmesi sağlar.

## Yönetim deneyimi — 5 Eylül 2026

- Owner ve Admin bölümleri `?tab=` adresiyle açılır. Owner ayarlarındaki kaydedilmemiş değişiklikler, menü/geri gezinmesi ve sayfadan çıkışta korunur veya kullanıcıya sorulur.
- Mobil menü açılıp kapanır; işlem pencereleri klavye odağını içeride tutar ve Escape ile kapatılabilir. İşlem sürerken ikinci gönderim engellenir.
- Owner özeti altı öncelikli gösterge, tüm göstergeleri açma, modül arama, UTC takvim günlerine göre yedi günlük grafik ve günlük veri tablosu sunar. Boş günler sıfırdır. Gizli topluluk/etkinlik sayaçları gerçek durumu sorgular.
- Admin oluşturma, parola sıfırlama ve durum değiştirme; hedef hesap ve etkisi gösterilen ayrı formlarla yapılır.
- Ayarlarda değişen alanlar, bakım mesajı önizlemesi, toplu geri alma ve kaydetme durumu bulunur.
- Şikâyetlerde seçili kayıt, tam kanıt, önceki karar ve itiraz birlikte incelenir. Taslaklar kayıt kimliğiyle ayrılır; başarısız istek taslağı silmez. Desteklenmeyen hedeflerde yalnızca karar kaydetme sunulur.
- İçerik listesinde tam metin/açıklama işlem penceresine taşınır. Mekân, etkinlik ve fiyat kayıtları da denetlenir. Özel mesajlar genel içerik listesine eklenmez; yalnızca şikâyetteki kanıt üzerinden incelenir.
- Hesap işlemleri hedef öğrenci ve gerekçesiyle açılır. Mevcut oturum iptali ve rol kontrolleri korunur.
- Günlüklerde arama, işlem alanı/tarih filtreleri ve filtrelenmiş CSV indirme vardır. CSV, kullanıcı metninin elektronik tabloda formül olarak çalışmasını engeller.
- Güncellemeler her iki panelde ortak ürün notlarından gelir; alan/tür/arama ve sayfalama bulunur.

### Liste kapsamı

Arama, filtreleme, sayfalama ve indirme **yüklenen panel anlık görüntüsü** üzerinde çalışır. Admin: en fazla 100 şikâyet, birleşik en yeni 100 içerik ve 100 öğrenci; karar geçmişi 60 kayıt. Owner işlem günlüğü 80 kayıt, admin ekip listesi tüm admin hesapları. Arayüz bu kapsamı sonuç sayısının yanında belirtir; veritabanının tüm geçmişinde arama iddiasında bulunmaz.

### Doğrulama

`tests/staff-dashboard.test.mjs` gerçek göçlerle oluşturulmuş SQLite üzerinde gösterge sorgularını, ilk UTC gününü, tam içerik/ek içerik türlerini, seçili şikâyete karar uygulanmasını ve gerekçeli hesap/içerik işlemlerini denetler. Aynı dosya bölüm izin listesi, sayfalama sınırları, CSV kaçışları ve boş günleri kapsar.

Yerel tarayıcı doğrulaması için yalnızca sentetik Owner/Admin/öğrenci kayıtları kullanılır. Yerel test ve derleme sonuçları canlı ortam dağıtımının veya canlı kullanıcı verileriyle kabulün kanıtı değildir.
