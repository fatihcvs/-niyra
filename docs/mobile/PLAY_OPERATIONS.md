# Play yayını: veri ve güvenlik işlemleri

Yürürlük: 8 Eylül 2026. Kamuya açık adresler `/legal`, `/account-deletion` ve `/child-safety`; sorumlu iletişim adresi `destek@kampira.net`.

## Talepler ve çocuk güvenliği

- Ürün sorumlusu destek adresini ve uygulama içi bildirim kuyruğunu takip eder. Çocuk güvenliği bildirimleri önceliklidir. İçerik bağlantısı üzerinden inceleme yapılır; kullanıcıdan istismar materyalini indirip göndermesi istenmez.
- Doğrulanan ihlalde içerik kaldırılır, ilgili hesap kısıtlanır ve gerekli bildirim yetkili bölgesel veya ulusal mercilere yapılır. İnceleme kayıtlarına erişim yalnız yetkili sorumludadır.
- Hesap veya belirli veri silme taleplerinde hesap sahipliği doğrulanır. Parola, OTP veya gereksiz kimlik belgesi istenmez. Doğrulanmış talebin canlı sistemde tamamlanması için 30 günlük işlem hedefi takip edilir.
- Mevcut hesap silme kuyruğu ve erasure işlemi kullanılır; yalnız talep kaydı açılması tamamlanmış silme sayılmaz. İçerik/dosya işlemlerinin başarılı sonucu doğrulanır. Kısmi veri talepleri içerik ve sahiplik kapsamına göre sorumlu tarafından yürütülür.
- Somut hukuki veya güvenlik istisnaları kapsam, gerekçe, erişim ve bitiş süresi ile kaydedilir; bütün hesap için süresiz saklama istisnası oluşturulmaz.

## İşletim yedeklerinin saklanması

Üretimde SQLite/D1 ve nesne dosyaları Railway kalıcı diskindedir. Bu değişiklik yeni bir yedekleme hizmeti veya otomatik yedek oluşturma işi kurmaz.

`scripts/backup-retention.mjs`, uygulama başlarken ve saatte bir yalnız `<UNIYRA_DATA_DIR>/backups` altındaki tarihli işletim klasörlerini kontrol eder. Kabul edilen adlar `operational-YYYYMMDD`, `operational-YYYYMMDDTHHMMSSZ` ve geçmiş `mobile-publication-YYYYMMDD` biçimleridir. Yeni kopya oluştururken gerçek UTC oluşturma tarihi kullanılır; eski kopyaya yeni tarih verilmez.

29 günü dolduran bu klasörler kaldırılır; saatlik kontrol 30 günlük kamuya açık döngü içinde pay bırakır. Geçersiz adlar, gelecek tarihler, sembolik bağlantılar ve doğrudan dosyalar otomatik silinmez, dikkat gerektiren kayıt sayısına eklenir. Operatör bu uyarıları ve hizmetin uzun süre kapalı kalması halinde biriken yedekleri kontrol eder. Yedekleri farklı konumlara kopyalamak aynı saklama sorumluluğunu ortadan kaldırmaz.

8 Eylül envanterinde `/data/backups/mobile-publication-20260906` altında tek iki günlük kopya vardı; bu yayın sırasında süresi dolmuş üretim yedeği bulunmadı. Yerel geliştirme kopyaları ve Railway sağlayıcısının kendi teknik kayıtları bu dizin temizleyicisi tarafından yönetilmez.

## Geri yükleme kapısı

1. Geri yüklemeden önce mevcut silme işi sonuçlarını, son durumunu ve yedek tarihinden sonraki doğrulanmış talepleri yetkili erişim altında uzlaştır. Gereksiz kişisel veri veya parola kopyalama.
2. Yedeği erişime kapalı bir ortamda aç. Eski yedeği doğrudan herkese açık hizmete bağlama.
3. Yedekten sonraki tamamlanmış hesap ve içerik silmelerini yeniden uygula; ilgili dosyaların ve oturumların da temizlendiğini doğrula.
4. Güncel silme durumu kaybolmuşsa veya hangi kayıtların geri getirilemeyeceği doğrulanamıyorsa ilgili eski hesap ve içerikleri erişime açma. Sorumlu uzlaştırmayı tamamlamadan geri dönüş yapılmaz.
5. Doğrulama sonucunu ve kullanılan yedeğin tarihini kaydet; geçici geri yükleme kopyalarını da aynı saklama kapsamına al.

Bu bir operasyon prosedürüdür; yedekten otomatik silme uzlaştırma sistemi kurulmuş olduğu anlamına gelmez. Firebase bildirim tokenının kapatılması, sağlayıcının tüm kurulum/teknik kayıtlarının aynı anda silindiği şeklinde açıklanmaz.
