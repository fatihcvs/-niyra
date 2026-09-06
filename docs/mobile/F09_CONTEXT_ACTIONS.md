# F09-06 — Mesaj ve kişi bağlam işlemleri

Tarih: 2026-09-05. Durum: uygulama, izole ReactDOM davranışı ve taze SQLite API testleri tamamlandı. Gerçek hesapla tarayıcı kabulü ve fiziksel Android klavye/TalkBack doğrulaması ayrı ve açıktır.

## Kullanıcı akışı

- Mesaj balonunda görünür, erişilebilir adı olan 48 px seçenek düğmesi; konuşma başlığında ayrı 48 px kişi düğmesi bulunur. Mobil panel alt kenara yerleşir. Kendi mesajında metin kopyalama; gelen mesajda kopyalama ve şikâyet; kişi menüsünde şikâyet ve gerçek engelleme durumu sunulur. Kaldırılmış mesajın menüsü yoktur. Desteklenmeyen silme/geri alma eylemi eklenmedi.
- `MessageContextActions`, ortak `useAppLayer` ile dialog odağı, arka planın inert olması, Escape, Back/Forward ve açan düğmeye odak dönüşünü kullanır. Şikâyet formu bir alt katmandır. DM history dinleyicisi ortak katman girdisini konuşma listesi sanmaz; alt panelden Back sohbeti kapatmaz.
- Uzun basma eklenmedi. Metin seçimi, doğal kaydırma ve pinch hareketlerine müdahale edilmez. Kendi/gelen mesaj genişliği, menü hedefi için ayrı alan bırakır.
- Panel ve form, MobileRuntime `--app-viewport-height` / `--app-viewport-top` değerlerini kullanır. Form alanları 16 px; eylemler en az 48 px. Bu CSS entegrasyonu gerçek cihaz klavye kanıtı sayılmaz.

## Gerçek işlem sözleşmesi

| İşlem | Gerçek yol | Doğrulanmış sonuç / hata |
| --- | --- | --- |
| Metni kopyala | `navigator.clipboard.writeText`, seçili mesajın tam metni | Promise başarıyla çözülmeden kopyalandı denmez. Eksik API veya izin reddi görünür hata verir. İçerik bu işlemle sunucuya gönderilmez. |
| Mesajı şikâyet et | `POST /api/safety`, `action: report`, `entityType: direct-message`, seçili mesajın gerçek ID'si | Kontrollü neden/açıklama formu; açıklama sınırı 800. Başarı için OK yanıt ve boş olmayan `report.id` gerekir. Doğrulanmış başarı tekrar gönderimi kapatır. Hata ve Back taslağı korur. |
| Kişiyi şikâyet et | Aynı endpoint, `entityType: user`, kişinin public ID'si | Mesaj kimliği kişi raporuna karışmaz. Sahip ve erişim denetimi mevcut backend'de kalır. |
| Kişiyi engelle / engeli kaldır | Önce `GET /api/safety` ile mevcut liste; onaydan sonra `POST`, `action: block`, `targetId`, açık boolean `active` | Bilinmeyen veya alınamayan durumda engelleme düğmesi etkinleşmez; yeniden dene sunulur. Başarı için OK yanıt ve boolean `active` gerekir. Hata sonucu engellenmiş gibi gösterilmez. |

GET/POST ve JSON gövde okuması ortak 20 saniyelik sınır içindedir. Tüm zincir abort reddiyle yarıştırılır; transport veya gövde ayrıştırıcısı sinyali dikkate almasa da bekleme durumu çözülür. Timer ve abort dinleyicisi temizlenir. Unmount devam eden istekleri iptal eder. JSON öncesi ve sonrası owner kontrolü vardır; eski hesabın sonucu yeni hesaba uygulanmaz ve aktif 401 gövdesi okunmadan oturum kurtarma akışına geçilir.

İptal/zaman aşımı sunucunun işlem yapmadığını kanıtlamaz. Şikâyet yeniden gönderilirse mevcut açık rapor için sunucunun 409 cevabı gösterilir. Engelleme açık hedef boolean ile yeniden denenir; sıradaki açılış gerçek durumu okur. Başarılı engelleme yanıtı Back ile kapatılan panelden sonra gelirse, aynı aktif sahibin DM önbelleğine yine uygulanır; panel kendiliğinden açılmaz. Bekleyen engelleme sırasında ikinci engelleme işlemi başlatılmaz.

## DM verisi ve gönderimle uyum

Doğrulanmış engelleme, ilgili kişinin bellek önbelleğini, gönderilmemiş metin/ek taslağını, bekleyen tekrar-deneme kaydını ve konuşma listesi girişini temizler. Okuma/list/history istekleri geçersizleşir. Gönderim ve ek seçimi kapanır; kişi menüsündeki engeli kaldır eylemi erişilebilir kalır. Engel kaldırılınca gerçek konuşma listesi yeniden alınır.

Engellenen kişi için gecikmiş cache yazıları kabul edilmez. Engelleme ardından hemen engeli kaldırma yapılsa bile, önceki gönderim yanıtı ancak hâlâ aynı anahtarlı `sending` denemesi varsa uygulanabilir. Böylece eski yanıt temizlenmiş mesajı veya taslağı geri getiremez. Sunucuda önceden kaydedilmiş bir mesajı bu istemci temizliği silmez; gerçek geçmiş sonraki yetkili okumada sunucudan gelir.

Mesaj taslakları ve rapor formu yalnız owner kapsamlı sekme belleğindedir. Browser history'ye mesaj veya rapor metni yazılmaz. Çıkış/hesap değişimi mevcut owner temizliğiyle ayrılır. Yeni migration veya API yetki genişletmesi yapılmadı.

## Galeri görsel kabulü

Geliştirmeye özel `/design-lab?canvas=1&screen=messages&theme=dark` sayfasındaki **Örnek konuşmayı aç** akışı aynı menü bileşenini `preview: { mode: "gallery" }` ile kullanır. Her panel/sonuç “Galeri simülasyonu” etiketlidir. GET, POST, gerçek pano ve canlı güvenlik callback'leri çalıştırılmaz; örnek engelleme yalnız bileşen durumunu değiştirir. Bu mod gerçek auth/API/teslim kanıtı değildir. Production, test ve belirsiz ortamlar için galerinin mevcut route engeli korunur.

Root tarayıcı kontrolü için hedefler: 320/390 px açık/koyu görünüm; kişi ve gelen/giden balon düğmeleri; şikâyet formu; Back/Forward/odak; uzun ad/metin taşması. Gerçek hesap oturumunda aynı akışın kabulü ayrıca yapılmalıdır; bu belge görsel kabulün geçtiğini iddia etmez.

## Doğrulama

`tests/message-context-actions-runtime.test.mjs` gerçek ReactDOM, ortak layer ve scoped fetch ile sekiz senaryo çalıştırır: clipboard başarı/ret; kontrollü rapor/Back/tekrar gönderim; gerçek block/unblock payload; Back sırasında blok sonucu; owner ve 401 gövde sınırı; sinyali yutan transport/json timeout ve unmount; gerçek galeri canvas'ında ağ/pano olmaması; tam DM workspace'te cache/taslak temizliği ve gecikmiş gönderim.

`tests/safety-preferences.test.mjs` yeni `DatabaseSync(':memory:')`, gerçek migration'lar ve açıkça sentetik kullanıcılarla mevcut safety API'sini çalıştırır. Alınan mesaj raporunda yalnız seçili kanıt kaydı tutulur. Kendi mesajı, aynı kampüsten konuşma dışı kişi ve farklı kampüs reddedilir; reporter sunucu oturumundan gelir; tekrar rapor 409, çıkış 401 olur. Mevcut DM API testleri blok sonrası okuma/gönderim reddini de doğrular.

Son odaklı doğrulama komutu:

```text
node --test tests/message-context-actions-runtime.test.mjs tests/messages-session-state.test.mjs tests/message-mobile-history.test.mjs tests/direct-messages.test.mjs tests/safety-preferences.test.mjs tests/design-lab-runtime.test.mjs
```

Son koşu: **43/43 geçti**. Sekiz yeni DM runtime senaryosu bu toplamın içindedir.

Değişen TS/TSX dosyalarında scoped ESLint uygulanır. Testler gerçek hesaba, mevcut yerel veritabanına veya production'a yazmaz. Tam build/test ve tarayıcı sonuçları root'un ayrı son doğrulamasına aittir.
