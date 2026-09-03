# Veri saklama, yedekleme ve silme politikası

- Aktif hesap ve akademik profil verileri kullanıcı hesabı sürdüğü sürece
  tutulur. Silme talebi kimlik doğrulanarak işlenir.
- Yumuşak silinen gönderi, yorum ve not meta verisi operasyonel geri alma için
  30 gün sonra kalıcı temizleme kuyruğuna alınır.
- Not dosyası silme işleminde kayıt önce `deleting` durumuna alınır, R2 nesnesi
  kaldırılır, sonra D1 kaydı görünmez yapılır. Başarısız ara durumlar günlük
  bakımda yeniden işlenir.
- Şikâyet kanıtı ve karar geçmişi, itiraz ve güvenlik yükümlülükleri için pilot
  bitiminden sonra 180 güne kadar tutulur; erişim yalnızca moderatör rolündedir.
- Hız sınırı pencereleri 48 saatten, ayrıntısız ürün olayları 13 aydan eskiyse
  temizlenebilir.
- D1 yedeği ve R2 nesne envanteri haftalık alınır. Geri yükleme örneği en az
  ayda bir ayrı ortamda doğrulanır; doğrulanmamış yedek tamamlanmış sayılmaz.
- Dışa aktarılan yedekler şifreli, erişimi sınırlı ve üretimden ayrı tutulur.
