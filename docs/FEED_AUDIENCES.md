# Akış ve paylaşım kapsamları

- **Genel Akış** (`feed=all`, varsayılan): tüm üniversitelerden, `platform` kitlesi açıkça seçilmiş bağımsız gönderiler. Sıralama en yeni gönderiden başlar.
- **Takip** (`feed=following`): takip edilen öğrencilerin ziyaretçiye açık gönderileri. Farklı üniversitedeki birini takip etmek, onun kampüse özel içeriğini açmaz.
- **Kampüsüm** (`feed=campus`): öğrencinin üniversitesindeki gönderiler; topluluk üyeliği, yasak ve moderasyon kuralları korunur.
- **Kaydedilenler**: kayıtlı gönderiye güncel erişim izni uygulanır. Bağlantıyla açılan gönderi seçili akış dışında kalıyorsa ayrı gösterilir.

Yeni paylaşım kutusu Genel Akış ve Takip içinde “Tüm öğrenciler”, Kampüsüm içinde “Yalnızca kampüsüm” seçeneğiyle başlar. Kullanıcı hazırladığı bir taslakla sekme değiştirirse seçtiği kitle korunur. Ders seçimi varsa paylaşım kampüs içinde kalır. Sunucu, ders ve genel kitleyi birlikte isteyen isteği reddeder.

`0021_platform_feed.sql`, mevcut gönderilere `campus` değerini verir. Kitle göndermeyen eski istemcilerin yeni gönderileri de kampüs içinde kalır. Bir gönderinin üniversiteler arasında açılması için `audience=platform`, `course_id IS NULL`, `community_id IS NULL` koşulları birlikte gerekir. Railway başlangıç betiği mevcut D1 geçişlerini uygularken bu dosyayı da uygular.

Gönderi, medya, yorum, beğeni, kaydetme, profil galerisi, arama ve şikâyet yolları aynı kitle sınırını uygular. Engeller iki yönlüdür. Sessize alma akış ve arama sonuçlarını süzer. Medya bağlantıları her istekte erişim denetiminden geçer.

Keşfet, aynı kampüsteki öğrencilerin yanında en az bir genel paylaşımı bulunan başka üniversitelerin öğrencilerini gösterir. Başka üniversitedeki ziyaretçi temel kimliği, üniversite ve bölüm bilgisini, avatarı ve genel paylaşımları görür. Biyografi, bağlantılar, kapak görseli, seçili dersler, kampüse özel gönderiler ve notlar açılmaz. Özel mesajlar, ders kaynakları ve topluluklar mevcut kampüs kapsamını korur.

Yerel doğrulama:

- `node --test tests/post-media-access.test.mjs tests/profile-content.test.mjs tests/safety-preferences.test.mjs`: gerçek SQL ile kitle ayrımı, sıralama, sayfalama, medya ve erişim iptali.
- `npm run test:global-feed`: çalışan yerel uygulamada iki üniversiteyle paylaşım, takip, etkileşim, medya, profil, arama, şikâyet, engel ve sessize alma.
- `npm run test:runtime`: mevcut kampüs, yönetim, ders, topluluk ve mesajlaşma akışları.

Tarayıcı kontrolü için yalnızca localhost üzerinde `KAMPIRA_KEEP_BROWSER_FIXTURE=1` kullanılabilir. Bu seçenek sentetik hesapları ve yerel oturumları yok sayılan `.wrangler/global-feed-fixtures.json` dosyasında tutar. Normal çalıştırma test gönderilerini siler. Bu doğrulamalar üretim dağıtımı kanıtı değildir.
