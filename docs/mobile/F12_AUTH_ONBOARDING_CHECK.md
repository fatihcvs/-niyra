# F12 — Giriş ve akademik kurulumun sınırlı istemci kontrolü

2026-09-05. Kapsam: `app/page.tsx` içindeki `AuthGate` ve `AcademicOnboarding`. Hesap oluşturma, gerçek credential kullanımı, hukuk metni veya sunucu kayıt davranışı değiştirilmedi. Testler kontrollü yanıtlarla gerçek bileşenleri ReactDOM üzerinde çalıştırır.

## Düzeltilen davranışlar

- Giriş/kayıt ve akademik kayıtta aynı render içinde iki submit artık tek ağ isteği üretir. Ref koruması React state güncellemesini beklemez; pending form alanları ve mod düğmeleri kilitlenir.
- Unmount, isteği abort eder ve generation değerini değiştirir. Abort sonrasında çözülen JSON veya başarı yanıtı eski `onAuthenticated`/`onComplete` callback'ini çağıramaz. Bu istemci iptalidir; başlamış sunucu işleminin geri alındığı iddiası yoktur.
- Sunucu reddi görünür hata gösterir ve hâlâ açık formun alanlarını korur. Bozuk JSON anlaşılır genel hataya dönüşür. Parola yalnız bağlı formun React belleğindedir; yeni bir form mount edildiğinde boş başlar, diske veya paylaşılan draft cache'e yazılmaz.
- Üniversite/program değişiminde iptal edilen eski katalog yanıtı yeni seçimleri değiştiremez. Başarı yolunda, JSON okumasından sonra da abort kontrolü yapılır.
- Aynı render içinde çift Devam/Geri eylemi birden çok adım atlayamaz. Adım değişince ilgili başlık odaklanır; eksik ders bilgisinde ilk boş kod/ad alanı seçilir. Form içi Geri/Devam mevcut seçimleri korur; tam uygulama yeniden açılışında akademik form kurtarma uygulanmış sayılmaz.
- Akademik kayıt 401 yanıtında tam sayfa reload yapmaz; optional `onSessionExpired` callback'i ile ana oturum akışına döner. Callback verilmezse yerinde açık giriş gereksinimi gösterir. Home çağrı noktaları bu callback'i kendi `expireSession` davranışına bağlamalıdır; parola veya sunucu oturumu istemcide saklanmaz.

## Doğrulama

`tests/auth-onboarding-runtime.test.mjs` dört senaryo yürütür: geçersiz alan odağı ve parola görünürlüğü; giriş hatası/çift submit/geç yanıt/başarı; eski üniversite yanıtı ve Geri/Devam form odağı; akademik çift kayıt/400/401/geç başarı. Mevcut metin/rehber testleri de korunur.

```text
node --test --test-isolation=none tests/auth-onboarding-runtime.test.mjs tests/auth-screen.test.mjs tests/onboarding-guidance.test.mjs
# 7 test: 4 ReactDOM davranışı + 3 mevcut kontrol.
npx eslint app/page.tsx tests/auth-onboarding-runtime.test.mjs
```

Bu çalışma gerçek mobil klavye, cihaz geri hareketi, ekran okuyucu, tarayıcı geometrisi, hosted auth veya Android kabulü değildir. Görsel taşma ölçülmedi ve CSS değişmedi. Gerçek giriş/kayıt doğrulaması ayrıca kullanıcı kontrollü oturum ve test ortamı gerektirir.
