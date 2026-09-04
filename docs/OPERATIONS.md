# Kampira üretim operasyonları

Bu belge kapalı pilot ve açık beta için hizmet sağlığı, olay müdahalesi ve geri
alma akışını tanımlar.

## Günlük sağlık kontrolü

1. `/api/health` yanıtının `200`, `status: ok`, `database: ok` ve
   `storage: configured` döndürdüğünü doğrula.
2. Ana akış, not listesi, topluluk listesi ve bildirim listesinde hata oranını
   kontrol et.
3. Son dağıtımdan sonra Workers hata günlüklerini ve D1 yavaş sorgularını
   incele. Kullanıcı e-postalarını ve dosya adlarını olay notlarına kopyalama.
4. Açık moderasyon kayıtlarının yaşını ve yeni ürün geri bildirimlerini gözden
   geçir.

## Olay seviyeleri

- **SEV-1:** Kimlik/sahiplik atlama, veri sızıntısı veya kalıcı veri kaybı.
  Yazmaları durdur, erişimi daralt, kanıtı koru ve son güvenli sürüme dön.
- **SEV-2:** Not indirme, gönderi veya topluluk yazma akışının geniş kesintisi.
  Etkilenen özelliği sınırla, kullanıcıya açık hata durumu göster ve aynı gün
  düzelt.
- **SEV-3:** Görsel bozulma, tekil hata veya performans gerilemesi. İzlenebilir
  işe dönüştür ve planlı düzeltmeye al.

## Geri alma

Dağıtım hatasında aynı arşivi yeniden yayımlama. Son doğrulanmış Sites sürümünü
geri yükle veya hatayı yeni kaynak sürümünde düzelt. D1 göçleri ileri yönlü ve
değişmezdir; uygulanmış göç dosyasını değiştirme. Gerekirse yeni, geriye uyumlu
bir düzeltme göçü ekle. R2 nesnelerini toplu silme; önce ilişkili D1 kayıtlarını
ve sahipliği doğrula.

## Performans bütçesi

- Sağlık yanıtı: p95 500 ms altında.
- İlk HTML: 200 KB altında (sıkıştırılmamış).
- Ana ekran kullanılabilirliği: orta seviye mobil ve 4G bağlantıda 3 saniye
  içinde.
- Liste uçları: en fazla 40 kayıt; sorgular sınırlı ve indeksli.
- Yükleme: tek dosya en fazla 15 MB; Worker belleğinde eşzamanlı büyük dosya
  işleme yapılmaz.

## Dağıtım kontrol listesi

- Tür kontrolü, lint, üretim derlemesi ve otomatik testler geçer.
- Yeni SQL göçü tek tek incelenir; uygulanmış göçlere dokunulmaz.
- Kaynak commit'i ile paketlenen commit aynıdır.
- Site erişim politikası dağıtım öncesi yeniden okunur; kullanıcı istemeden
  özel siteden herkese açık erişime geçilmez.
- Dağıtım terminal `succeeded` durumuna ulaşır; canlı `/api/health` ve ana rota
  cevap verir.
