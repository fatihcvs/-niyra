# F10 — Topluluk katmanları ve arama

Tarih: 2026-09-05. Bu belge F10 topluluk istemcisi ve arama API'si teslimini kaydeder. Yerel kod, gerçek React DOM ve izole SQLite API kanıtıdır; fiziksel cihaz, gerçek öğrenci gözlemi veya production kabulü değildir. Ana Keşfet arama bileşeni `app/unified-search.tsx` ve kampüs araçları root tarafından ayrıca yönetilir.

## Tamamlanan davranış

| Görev | Uygulanan kapsam | Kanıt / sınır |
| --- | --- | --- |
| F10-01 | Aynı `query` ve `scope`, kişi/ders/gönderi/not/topluluk grupları korunur. Türkçe büyük/küçük harf eşleştirme beş grubun SQL'inde uygulanır. `%`, `_` ve ters eğik çizgi joker değil gerçek sorgu karakteridir. | Gerçek arama API testi; sorgu/scroll UI önbelleği root'un ayrı bileşenindedir. |
| F10-02 | Gerçek ders bağlantısı, gerçek topluluk sayaçları, içerik ve etkinlik kimlikleri korunur. | Yeni öneri puanı, sahte popülerlik veya örnek kullanıcı içeriği üretilmedi; Kampüsüm yerleşimi bu alt görevde değiştirilmedi. |
| F10-03 | Directory/member araması gecikmeli başlar; önceki istek iptal edilir. JSON sonradan gelse bile eski hedef/oturum sonucu kabul edilmez. Zaman aşımı, hata/tekrar dene, filtre temizleme ayrı durumlardır. | Request ve DOM yarış/timeout/retry testleri. İlk 120 dışında kalan üyeler server `memberQ` aramasıyla bulunur. |
| F10-04 | Ortak WorkspaceHeader ve gerçek üç adımlı oluşturma callback'i korunur. Create/detail/event/report ortak `useAppLayer` kullanır. Başarılı oluşturma sonrasında Back boş oluşturma formunu tekrar açmaz. | DOM create failure/double-click/success/history testleri. Sistem Back oluşturma katmanını kapatır ve mevcut adımı saklar; formdaki Geri bir önceki adıma gider. |
| F10-05 | Gönderi yazarı, üye ve kurucu gerçek `/?profile=<id>` AppLink bağlantılarıdır. Detail ve tab konumu profile gidip dönüşte saklanır. | Gerçek anchor kimliği ve history remount testi. Profil→mesaj root'un mevcut akışını kullanır; bu alt görevde fiziksel uçtan uca kullanıcı yürüyüşü yapılmadı. |
| F10-06 | Üyelik/katılım isteği, üye rolü, etkinlik ve rapor formları gerçek API'lerini kullanır. Synchronous submit kilidi çift tıklamayı önler; gönderim hatası taslağı silmez. Report/event Back önce üst katmanı kapatır, açan elemana focus döner. | DOM katman/focus/form testleri ve gerçek private-membership/approve/post/event/RSVP/ban API testi. |
| F10-07 | Özel topluluk boş içeriği gerçek erişim kısıtından ayrılır. Banned/deleted/eski kampüs sonuçları arama/directory/detail'de tutarlı biçimde dışlanır. Engellenen, pasif veya kampüs değiştiren üyeler dizinde görünmez. | Fresh SQLite erişim testleri; uzun ad/320px/geçerli büyük gerçek veri görsel kabulü root browser ve fiziksel cihaz kontrolünde ayrıca kalır. |

## Oturum ve istek sınırı

- `useWorkspaceState` sorgu, üyelik/kategori/sıralama filtreleri, create adımı ve alanları, seçili gerçek topluluk, tab, içerik/üye filtresi, post/event/settings taslağı ve detail iç scroll konumunu yalnız bellekte tutar. Detail taslak haritası son 8 toplulukla sınırlıdır; ortak store'un 15 dakika / 64 anahtar sınırı geçerlidir. Comment/report taslakları gerçek post ID'siyle ayrılır. History/localStorage/sessionStorage içine özel taslak veya gönderi yazılmaz.
- Root authoritative `ownerScope` ile workspace'i anahtarlar ve çıkış/hesap değişiminde store'u temizler. Akademik kampüs değişiminde aynı owner kimliği korunacağı için root null→scope reset'ini ayrıca bağladı. Profile community/post invalidation yalnız server-confirmed create/membership/post sonuçları sonrası çağrılır.
- `createCommunityRequests` owner yaşam döngüsü, hedef revizyonu, harici AbortSignal, JSON sonrası kontrol ve 20 saniye timeout uygular. Eski oturumdan gelen 401 yeni oturumu kapatamaz; aktif 401 bir kez root `onSessionExpired` çağırır. Yeni mutation önceki hedef okumalarını geçersiz kılar. Başka community'den gelen mutation sonucu aktif detayı değiştiremez.
- `useAppLayer` mevcut aynı ID'li history girişini remount'ta sahiplenir. İkinci özel Back yığını oluşturulmadı. Create, detail, event ve report ID'leri katmanın gerçek hedef kimliğini taşır; içerik taşımaz.
- Backend arama ve community GET değişiklikleri mevcut yetki kontrollerini korur. Fakultesi olmayan geçerli öğrenci arama sonucundan düşmez (`faculty_short_name` null olabilir). Arama sonuçlarında `Cache-Control: no-store` bulunur. Analytics yazma hatası başarılı arama sonucunu bozmaz.

## Doğrulama

2026-09-05 son odaklı komut:

```powershell
node --test --test-isolation=none tests/community-requests.test.mjs tests/community-search-api.test.mjs tests/communities-flow-runtime.test.mjs tests/communities.test.mjs
```

**16/16 geçti:** 6 gerçek React DOM testi, 4 request lifecycle testi, 4 gerçek route/SQLite testi, 2 mevcut yapısal regresyon. DOM testlerinin `beforeEach`/`afterEach` hook'ları `describe` kapsamındadır; başka dosyalara sızmaz.

API testleri yeni `DatabaseSync(':memory:')`, gerçek migration dosyaları, gerçek route modülleri ve açıkça `[SYNTHETIC]`/`example.invalid` fixture'ları kullanır. Bu alt görev mevcut yerel DB'ye veya production'a yazmadı. API testinde 130 ek sentetik üyeyle sorgunun SQL `LIMIT 120` öncesinde uygulandığı doğrulandı. React DOM mock transport testleri ise veritabanı kanıtı olarak sayılmadı.

Scoped ESLint, `npx tsc --noEmit`, PostCSS parse ve kapsamlı `git diff --check` geçti. Tam build, headless browser ve production deploy bu alt görevde çalıştırılmadı.

## Açık sınırlar

- Liste mevcut en fazla 60 topluluk, üye sonucu en fazla 120, genel arama her grupta en fazla 6 kayıt döndürür. Üye araması tüm yetkili üyelere ulaşır; genel sonsuz sayfalama bu teslimde eklenmedi.
- Community create/post/event mutation'larına backend idempotency eklenmedi. Çift tıklama istemcide engellenir; sunucuda kaydolup yanıtı kaybolan bir yazma için tam bir kez garanti verilmez. Otomatik kör mutation retry yapılmaz.
- Android gerçek klavye/inset, TalkBack, bağlantı değişimi, process kill, 320px uzun metin görsel kabulü ve açıklamasız öğrenci görev tamamlaması ayrı test gerektirir. İzole DOM testinde focus/Back kanıtı bunların yerine geçmez.
