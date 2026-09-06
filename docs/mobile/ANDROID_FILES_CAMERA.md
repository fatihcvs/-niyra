# Android kamera, dosya kaydetme ve paylaşma

6 Eylül 2026; kalan kod işlerinin dördüncü fazı. Yerel uygulama ve Android test paketi içindir. Üretime dağıtım veya fiziksel cihaz kabulü anlamına gelmez.

## Kullanıcı akışları

- Not detayındaki **İndir**, Android'in konum seçicisini açar. Dosya mevcut Kampira oturumuyla alınır; başka tarayıcıda tekrar giriş gerekmez. Kaydetme tamamlanmadan başarı yazılmaz.
- **Dosyayı paylaş**, dosyayı özel geçici alana indirip Android paylaşım menüsünü açar. Bu sonuç dosyanın karşı tarafa teslim edildiği anlamına gelmez.
- Gönderi ve topluluk paylaşımı Android paylaşım menüsünü kullanır. Normal tarayıcıda Web Share veya bağlantı kopyalama korunur.
- Fotoğraf yükleme alanı Android'de **Fotoğraf çek / Dosya seç** seçimi sunar. Fotoğraf mevcut yükleme, boyut kontrolü ve taslak akışına döner. Kamera veya dosya seçimini iptal etmek mevcut taslağı değiştirmez.
- Bildirim tercihleri, bulunabilirliği artırmak için Bildirimler ekranında listenin üstüne taşındı.

## Sınırlar

`KampiraFiles` yalnız yapılandırılmış origin'in ana çerçevesine açıktır. Web tarafına cookie, FCM anahtarı, yerel dosya yolu veya URI yetkisi verilmez. Not indirme sadece `/api/notes/file?id=...&download=1`, izinli MIME ve en fazla15MiB içindir. Yönlendirmeler reddedilir; boyut gerçek okunan baytlarla da denetlenir.

İşlem kimliği, hesap, oturum ve sayfa nesli her aşamada kontrol edilir. Eski ekranın iptali yeni işleme uygulanmaz. Logout bekleyen işlemleri durdurur. Kaydetme/paylaşma yanıtı yalnız komuta uygun ve hatasız cevapta başarı sayılır. Kullanıcı seçicisi en fazla beş dakika bekler.

Blob yardımcı sözleşmesi20MiB sınırını ve en fazla49152 baytlık sıralı, ayrı onaylanan parçaları uygular. Bu düşük seviye yardımcı mevcut personel CSV veya geliştirme metriği dışa aktarımına bağlanmış değildir; bu iki yönetim aracı normal tarayıcı indirmesini korur. Ürün içindeki oturumlu Notlar akışı Android'e bağlanmıştır.

Android kamera kendi uygulamasını kullanır. FileProvider yalnız iki özel geçici dizini sunar; genel depolama izni veya geniş dizin paylaşımı yoktur. Kamera geçici verileri ve yarım kalan indirmeler sınırlı süre/kapasite ile temizlenir. Android'in seçtiği kayıt konumu dışında dosya yazılmaz.

Dosya adlarında Türkçe ve emoji içeren kayıtların503 vermesi, ASCII yedek adı ve RFC8187 UTF-8 kodlamasıyla düzeltildi. Not dosyasında native hesap bağlamı sunucuda da doğrulanır. Pazar ve Kampüs Anlık görselleri artık oturum değişimi sonrasında eski özel önbellekten sunulmaz.

## Doğrulama

Güncel sonuçlar `exports/mobile-remaining-code-2026-09-06/phase4/verification.json` altında birleştirilir. Köprü testleri gerçek yardımcı kodunu ve ReactDOM'u çalıştırır. Sunucu testleri gerçek SQLite sorguları ve sentetik R2 ile dosya baytlarını, Unicode adları ve yetkileri doğrular. Chrome kontrolleri gerçek oturumlu yerel API, dosya indirme ve320/390px düzenini inceler.

Android birim/politika testleri ve APK build/lint/imza kontrolleri, fiziksel kameradan çekim, Android konum seçicisi, hedef uygulamada dosyanın açılması veya süreç ölümü kabulünün yerine geçmez. Bu cihaz sonuçları ayrı kaydedilir.

Başvuru: [Android belge seçicisi](https://developer.android.com/training/data-storage/shared/documents-files), [FileProvider ile geçici paylaşım](https://developer.android.com/training/secure-file-sharing/share-file), [Web Share davranışı](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share). Ayrıntılı sunucu sözleşmesi: `exports/mobile-remaining-code-2026-09-06/phase4/backend/download-contract.md`.
