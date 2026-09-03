# Güvenlik gözden geçirmesi

## Uygulanan kontroller

- Kimlik sunucu tarafında platform başlıklarından okunur; yazma uçları istemci
  tarafından gönderilen kullanıcı kimliğine güvenmez.
- Gönderi, yorum ve not düzenleme/silme sahiplik denetimiyle sınırlıdır.
- Not türü uzantı, MIME ve dosya imzasıyla doğrulanır; boyut 15 MB ile
  sınırlıdır; indirme `nosniff` ve özel önbellek başlıklarıyla sunulur.
- Topluluk yönetimi kurucu, yönetici ve moderatör rollerine göre sunucuda
  denetlenir; yönetim eylemleri denetim kaydına yazılır.
- Engelleme iki yönlü profil, arama, akış ve etkileşim görünürlüğünü kapatır;
  sessize alma akış sonuçlarını sınırlar.
- Kritik yazma uçlarında saatlik hız sınırı ve denetim kaydı vardır.
- Şikâyetler olay anındaki sınırlı içerik kanıtını, durum değişikliğini, kararı
  ve itirazı korur.

## Açık beta öncesi manuel kontroller

- İki gerçek hesapla sahiplik, engelleme, topluluk rolü ve taslak not erişimi
  kötüye kullanım senaryoları çalıştırılmalı.
- Yüklenen PDF, DOCX ve görseller zararlı içerik taramasından geçirilmelidir.
  Mevcut pilot sürümü dosya imzasını doğrular ancak antivirüs taraması yapmaz.
- Moderatör rolü üretim veritabanında yetkili hesaplara kontrollü biçimde
  atanmalı; rol değişiklikleri ayrı yönetici denetimine bağlanmalıdır.
- Veri dışa aktarma ve hesap silme işleri otomatik bakım akışına bağlanmalıdır.
