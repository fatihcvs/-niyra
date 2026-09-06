# F12-07 — Hesap ve veri silme talebi

Denetim ve uygulama tarihi: **5 Eylül 2026**. Mevcut teslim bir **talep, durum/geçmiş, iptal ve yetkili inceleme akışıdır**. Hesap silme motoru uygulanmadı. Gerçek veri silme, saklama politikası, erişimini kaybetmiş kullanıcıların destek yolu ve Google Play kabulü açık kalır. Bu belge hukuk veya mağaza onayı değildir.

## Denetimde bulunan başlangıç durumu

| Mevcut parça | Gerçek davranış | Eksik olan |
|---|---|---|
| `DELETE /api/auth/session` | İlgili oturumu kapatır, çerezi temizler. | Hesap/veri silmez. |
| `/api/admin`, `set-user-status` | `active`/`suspended` değiştirir; askıya almada kullanıcı oturumlarını siler. | Veri silme, kullanıcı talebi veya retention kararı değildir. |
| `/api/safety`, Güvenlik Merkezi | İçerik şikâyeti, engelleme ve sessize alma. POST ayrıca akademik profil ister. | Ayrı hesap/veri talebi kabul etmez. |
| Önceki `/legal#help` metni | Hesap/veri silme için Güvenlik Merkezi'ne yönlendiriyordu. | Bu yönlendirme gerçek bir hesap talebi formuna karşılık gelmiyordu. |
| Staff kimliği | Ayrı `owner`/`admin` oturumu, aktif hesap, başlangıç parolasını değiştirme kapısı, aynı kaynak kontrolü ve audit altyapısı vardır. | Silme kuyruğu bu altyapıya bağlı değildi. |

Yeni yasal yardım metni gerçek `/account-deletion` akışına bağlandı. Ayrı veri kopyası ve giriş yapılamayan hesap desteği varmış gibi anlatılmıyor.

## Uygulanan kullanıcı akışı

`/account-deletion` herkese açık bir web sayfasıdır. Kampira kimliği, talebin kapsamı, talep ile silme arasındaki fark, **Talebini takip et** bağlantısı ve geri dönüş bulunur. Uygulamayı yeniden kurma zorunluluğu getirmez.

Oturumu olmayan kullanıcı aynı sayfada mevcut `/api/auth/session` uç noktasından giriş yapar. Yeni kayıt açması istenmez. Girişten sonra yalnız kendi taleplerini görür; açıklama isteğe bağlıdır ve 800 karakterle sınırlıdır. Açık onay, yalnız talep kaydı oluşturduğunu açıklar. Talebin alınması hesabı askıya almaz, oturumu kapatmaz veya içerik/dosya silmez.

Açık talep varken ikinci form yerine mevcut durum/geçmiş ve iptal eylemi gösterilir. Talep incelemeye alınmış olsa da kullanıcı iptal edebilir; bu sürümde silme işlemi zaten başlamaz. İptal öncesi kısa bir teyit vardır. Son 20 talep gösterilir. Kaybolan yanıtta kullanıcı durumu yenileyebilir; sunucu tek açık talep garantisi verir. Önceden başlayan GET, başarılı mutasyonun daha yeni durumunu arayüzde geri alamaz.

Sayfa ve formlar mevcut açık/koyu tema değişkenlerini kullanır. Kontroller en az 48px, mobil metin girişleri 16px; görünür etiketler, odak göstergeleri, hata `alert` ve işlem durumu `status` alanları vardır. Tarayıcı/telefon kabulü yerel birim testinden ayrı tutulur.

## API ve yetki sözleşmesi

| Uç nokta | Davranış |
|---|---|
| `GET /api/account-deletion` | Kendi hesap kimliği, son 20 talep ve her talebin durum geçmişi. |
| `POST /api/account-deletion`, `{ confirm: true, note?: string }` | Yeni talepte `202`; zaten açık talep varsa aynı kaydı değiştirmeden `200`. Gövde `{ request, created, deletionExecuted: false }`. |
| `PATCH /api/account-deletion`, `{ action: "cancel", id }` | Yalnız kendi talebini iptal eder; yinelenen iptal aynı sonucu verir. Başkasının kaydı `404`. |
| `GET /api/admin/account-deletion?status=open&before=...` | Staff kuyruğu. Filtreler `open`, `requested`, `in_review`, `cancelled`; en fazla 50 kayıt ve sunucunun ürettiği sonraki cursor. |
| `PATCH /api/admin/account-deletion`, `{ action: "review", id }` | Talebi incelemeye alır. İptal edilen talebi yeniden açmaz (`409`). |

Tüm cevaplar `Cache-Control: private, no-store` taşır. Kullanıcı talepleri normal aktif oturumla çalışır; akademik onboarding gerektirmez. API hedef kullanıcıyı gövdedeki e-posta veya kimlikten seçmez. Her sahiplik koşulu sunucudaki oturum e-postasına bağlıdır. Public arayüzün `X-Account-Context` başlığı, başka sekmede hesap değişmişse `409 / ACCOUNT_CHANGED` üretir; eski hesap görünümünden yeni hesap adına yanlışlıkla talep gönderilmesi engellenir.

Mutasyonlar aynı kaynak ve mevcut rate-limit denetiminden geçer: talep 6/saat, iptal 30/saat, staff inceleme 120/saat. `429` cevabı `Retry-After` taşır. Açıklama SQL parametresi olarak tutulur; arayüzde düz metin olarak çizilir. Açıklama audit ayrıntısına kopyalanmaz.

Staff endpoint'i gerçek `requireStaff` kontrolünü kullanır: yalnız aktif `owner` veya `admin`, geçerli staff oturumu ve değiştirilmiş başlangıç parolası. Öğrenci oturumu veya eski `platform_roles.moderator` rolü bu kuyruğu açamaz. Kullanıcı geçmişinde reviewer'ın özel staff kimliği gösterilmez.

## Gerçek yönetim yüzü

Owner ve admin menülerinde **Hesap silme talepleri** bölümü eklendi: `/owner?tab=account-deletion` ve `/admin?tab=account-deletion`. Mevcut bölüm whitelist'i ve geri/ileri bağlantı okuması bu bölümü tanır.

`app/account-deletion-review.tsx` gerçek queue endpoint'inden durum filtreli/cursor sayfalı kayıtları getirir; hesap adı/e-postası, talep kimliği, açıklaması, tarihi ve geçmişini gösterir. **İncelemeye al** düğmesi gerçek PATCH çağrısı yapar; başarılı değişiklik kullanıcı ekranında görünür. Oturum veya yetki kapısı değişirse özel liste temizlenir ve ana yönetim oturumu yeniden kontrol edilir. `completed` veya yapay bir “silindi” kutusu yoktur.

## Veritabanı ve işlem sınırları

`drizzle/0024_account_deletion_requests.sql`, talep ve olay tablolarını ekler. Kullanıcı başına `requested`/`in_review` durumlarında yalnız bir açık talebe izin veren kısmi benzersiz index vardır. SQL migration sıralamasında 0022 gönderi tekrarları, 0023 mesaj tekrarları için ayrılan dosyalar korunur. Genel Drizzle şema dosyasına değişiklik yapılmadı.

Durumlar yalnız `requested → in_review → cancelled` veya `requested → cancelled` olabilir. İptal sonrası kullanıcı yeni bir talep oluşturabilir. Aynı durum olayı benzersizdir; yinelenen çağrı fazladan olay veya audit üretmez. Durum, olay ve audit aynı D1 transaction içinde yazılır. Audit hatasında durum değişikliği de geri alınır. Kayıp yanıt sonrası açık kayıt yeniden okunabilir.

`deletionExecuted` daima `false` döner. `complete`, `completed`, `delete` gibi eylemler reddedilir; SQL durum constraint'i de tamamlanmış durum kabul etmez. Kullanıcı, oturum, gönderi, mesaj veya R2 dosyasını silen API/komut eklenmedi.

## Silme motorundan önce gerekli veri kararı

Basit bir `DELETE FROM users` uygulanmamalıdır. Mevcut FK ilişkileri örneğin bir katılımcının hesabı silindiğinde tüm `direct_conversations` kaydını ve dolayısıyla karşı tarafın mesajlarını da cascade ile silebilir. Topluluk sahibi gibi paylaşılan sahiplikler ayrıca değerlendirilmelidir. DB metadata'sının silinmesi R2 nesnesini silmez; önce temizlik için gerekli nesne envanterinin kalıcı biçimde tutulması gerekir.

İşlem envanteri en az şunları ele almalı:

- Hesap, kimlik doğrulama, oturum, profil, akademik ve sosyal tercihler.
- Gönderi/yorum, anonim paylaşım, not, pazar ve profil dosyaları; paylaşılan içerik ve moderasyon kanıtları.
- Mesaj gövdeleri, paylaşım anlık kopyaları, iki taraflı konuşmalar ve diğer kullanıcı üzerindeki etki.
- Şikâyetler, denetim kayıtları, ürün olayları, yedekler ve gerçek hizmet sağlayıcıları.
- F08 `post_publish_requests.response_json` içerik kopyası ve `post_publish_attempts` nesne kayıtları; başarısız/belirsiz yüklemeler.

Kullanıcı/ürün sahibi kararı gereken açık alanlar: sorumlu gerçek kişi/kuruluş ve destek yöntemi; giriş yapamayan/askıdaki hesap için güvenli kimlik doğrulama; silme hedef süresi; veri türü bazında varsa meşru saklama nedeni ve süresi; paylaşılan içerik/mesaj/yedek/sağlayıcı işlemleri. Bu bilgiler tahmin edilmedi. Silme tamamlandı sonucu ancak DB, nesne depolama, gerekli sağlayıcı işlemleri ve açıklanmış istisnalar gerçek kanıtlarla uzlaştırıldıktan sonra eklenebilir.

## Google Play kapısı — güncel resmî kaynaklar

5 Eylül 2026'da kontrol edilen [Google Play hesap silme şartı](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), uygulama içinden ve dış web kaynağından erişilebilir talep yolunu ister; uygulamayı kaldırmış kullanıcı yeniden kurmaya zorlanmamalıdır. Web kaynağı çalışmalı, uygulamayla ilişkisini açıkça göstermeli ve gerçekten talep kabul etmelidir. Bu teslim bu yolun teknik başlangıcını sağlar; operasyonun tamamlandığını ispatlamaz.

[User Data politikasının tam metni](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en), hesap kapatma/askıya alma ile silmeyi ayırır; ilişkili veriler ve açıklanan meşru saklama istisnaları değerlendirilmelidir. Gizlilik açıklamasında işleme, paylaşım, saklama/silme ve iletişim mekanizması bulunmalıdır. Bu depoda gerçek saklama/silme operasyonu ve erişim kaybı destek yolu tamamlanmadan **F12-07/Play hesap silme kabulü kapatılmaz**.

## Doğrulama

`tests/account-deletion.test.mjs` tüm gerçek SQL migration'larını yeni bellek SQLite DB'ye uygular. Kullanıcı/staff çerezleri gerçek mevcut session helper'larıyla oluşturulur; gerçek `requireStaff`, sahiplik, rate-limit ve transaction sorguları çalışır. Gerçek endpoint veya üretim kaydı çağrılmaz.

11 yeni test: onboarding olmadan kendi talebi; hesap/veri değişmemesi; eşzamanlı tekrar/kayıp commit yanıtı; kullanıcı kapsamı/origin/hesap değişimi; iptal ve geçmiş; yanlış girdi/askıdaki hesap/tamamlanma reddi; gerçek staff rolü/parola kapısı; review audit ve iptal; audit rollback; cursor sayfalama; rate limit ve public sayfa SSR erişilebilirliği.

```text
node --test --test-isolation=none tests/account-deletion.test.mjs tests/migrations.test.mjs tests/staff-dashboard.test.mjs tests/staff-console.test.mjs
# 28/28 geçti: 11 yeni test + migration ve mevcut yönetim regression testleri.
npx eslint lib/account-deletion.ts lib/staff-console-view.ts app/api/account-deletion/route.ts app/api/admin/account-deletion/route.ts app/account-deletion/page.tsx app/account-deletion/request-panel.tsx app/account-deletion-review.tsx app/staff-console.tsx app/legal/page.tsx tests/account-deletion.test.mjs tests/migrations.test.mjs tests/staff-dashboard.test.mjs
# Geçti.
npx tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution bundler --lib esnext,dom,dom.iterable lib/account-deletion.ts cloudflare-env.d.ts
# Yardımcı modül odaklı tür kontrolü geçti.
```

Yeni public sayfa, iki istemci paneli ve iki API route'u, Next CSS module ortam bildirimleriyle birlikte ayrıca odaklı TypeScript kontrolünden geçti.

Kalan kanıt: gerçek tarayıcıda public giriş → talep → staff inceleme → kullanıcı geçmişi → iptal akışı; dar ekran/klavye/geri davranışı; deployed migration ve kullanıcıya açık URL. Canlı veri silme veya Google Play kabulü bu kontrollerin yerine geçirilmez.
