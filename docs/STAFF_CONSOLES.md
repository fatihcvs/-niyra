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
