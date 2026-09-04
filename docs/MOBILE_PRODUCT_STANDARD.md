# Üniyra mobil ürün standardı

Bu belge, mobil web ile gelecekteki Android ve iOS uygulamalarının aynı bilgi mimarisini ve etkileşim dilini kullanması için ürün sözleşmesidir.

## Ana gezinme

Telefonda her zaman görünen alt çubuk yalnızca beş hedef taşır:

1. **Akış** — kişiselleştirilmiş öğrenci akışı.
2. **Keşfet** — öğrenci, ders, not ve topluluk araması.
3. **Oluştur** — gönderi, Kampüs Anlık, not ve pazar ilanı için ortak başlangıç.
4. **Anlık** — kampüste şu an olanlar.
5. **Menü** — profil ve ikincil ürün alanları.

Kütüphane, Kampüs, Eşleş, Pazar, Notlar, Topluluklar, Bildirimler, Kaydedilenler ve Güvenlik “Tüm alanlar” panelinde bulunur. Yeni bir özellik mobil alt çubuğa doğrudan eklenmez; önce bu panelde yer alır. Böylece gezinme yatay kaydırmaya veya kırpılmış etiketlere dönüşmez.

## Etkileşim ilkeleri

- Birincil dokunma hedefleri en az 44 × 44 CSS piksel olmalıdır.
- Form alanları telefonda en az 16 px yazı kullanır; iOS odak yakınlaştırması tetiklenmez.
- Alt çubuk ve açılan paneller cihazın güvenli alan boşluklarını (`safe-area-inset-*`) korur.
- Bir oluşturma eylemi en fazla iki dokunuşta başlamalıdır.
- Sık kullanılan hedeflerin etiketi görünür kalır; yalnız ikonla anlam tahmin ettirilmez.
- Panel ve diyaloglar Escape, kapatma düğmesi ve dış alana dokunma ile kapanır.
- Hareket azaltma tercihi olan kullanıcılar için açılış animasyonları kaldırılır.
- Mobilde hiçbir ana işlev yatay sayfa taşmasına veya yatay alt menü kaydırmasına bağlı değildir.

## Yerel uygulama yönü

Android ve iOS istemcileri hazırlanırken bu bilgi mimarisi korunmalıdır. İlk yerel sürüm için Expo/React Native tabanlı, aynı API sözleşmelerini kullanan bir istemci uygundur; kimlik doğrulama ve veri katmanı web uygulamasındaki sunucu uçlarını paylaşır. Kamera, galeri, bildirim ve güvenli oturum bilgileri yerel yeteneklerle uygulanır. Web görünümünü paketlemek yerine gerçek yerel gezinme, klavye ve erişilebilirlik davranışları hedeflenir.

## Kabul kontrolü

- 390 × 844 ve 360 × 800 görünümde alt çubuk beş öğeyi kırpmadan gösterir.
- Menü panelinden profil ve tüm ikincil modüllere erişilir.
- Oluştur panelindeki dört hedef gerçek bir akışa yönlendirir.
- Sayfa genişliği görünüm genişliğini aşmaz.
- 200% metin büyütmede ana görevler tamamlanabilir.
- Ekran okuyucu için etkin sekme `aria-current`, paneller `role="dialog"` ve `aria-modal="true"` taşır.

