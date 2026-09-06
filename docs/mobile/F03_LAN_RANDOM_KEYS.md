# F03 — Yerel HTTP üzerinde gönderi ve mesaj anahtarları

2026-09-06: `crypto.randomUUID()` güvenli bağlamla sınırlı olduğundan `http://192.168.x.x` önizlemesinde bulunmayabilir. Gönderi yayınlama ve mesaj gönderme varsayılan anahtar üreticileri artık ortak `createSecureRandomKey()` yardımcısını kullanır. Yardımcı, tarayıcıdaki `window.crypto.getRandomValues()` ile kriptografik rastgele 16 bayt üretir, UUID v4 sürüm/varyant bitlerini ayarlar ve önceki UUID biçimini korur. Sunucuda `globalThis.crypto` kullanılır; zayıf rastgelelik alternatifi yoktur.

Yeni anahtar üretimi taslak, sahiplik veya belirsiz sonuçta tekrar kullanma kurallarını değiştirmez. `randomUUID` bulunmayan tarayıcı benzeri bağlamda gerçek gönderi ve mesaj varsayılanları çalıştırıldı; iki akışta da ilk anahtar ve aynı içerikle belirsiz sonucun tekrarı sınandı. İlgili 7 dosyada **60/60 test geçti**, bunların 2'si yeni anahtar/HTTP sınır testidir. Kanıt: `exports/mobile-code-continuation-2026-09-06/secure-random-key.txt`.

Bu sonuç JavaScript ve SQL/browser test kanıtlarından ayrıdır; fiziksel tabletin mesaj/gönderi yolculuğunun tamamlandığı anlamına gelmez.
