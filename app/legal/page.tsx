/* eslint-disable @next/next/no-img-element */
import styles from "./legal.module.css";
import Link from "next/link";

export const metadata = {
  title: "Gizlilik, Kullanım ve Topluluk İlkeleri · Kampira",
  description: "Kampira üniversite ağının gizlilik, kullanım, topluluk ve içerik kaldırma ilkeleri.",
};

const sections = [
  {
    id: "about",
    title: "Hakkımızda",
    paragraphs: [
      "Kampira, öğrencilerin ders notlarını, kampüs paylaşımlarını ve topluluklarını bir araya getiren bir öğrenci ağıdır. Akademik çevreni oluşturabilir, çalışma arkadaşları bulabilir ve kampüsündeki mekân, etkinlik ve ilanları keşfedebilirsin.",
    ],
  },
  {
    id: "privacy",
    title: "Gizlilik özeti",
    paragraphs: [
      "Kampira'da hesap e-postası, görünen ad, kullanıcı kimliği, akademik profil seçimleri, gönderiler, yorumlar, özel mesajlar, takip ve engelleme ilişkileri, kaydedilen içerikler, fotoğraflar, videolar, yüklenen notlar ve belgeler, topluluk üyelikleri, güvenlik kayıtları ve temel ürün kullanım olayları işlenir. Bu bilgiler hesap yönetimi, seçtiğin özellikleri sunma, içerik önerileri, hizmetin kullanımını değerlendirme ve kötüye kullanımı önleme amaçlarıyla kullanılır.",
      "Dosya baytları nesne depolamada; aranabilir başlık, ders, etiket, sahiplik ve durum bilgileri veritabanında ayrı tutulur. Dosyalar yalnızca izin verilen ürün akışlarından açılır. Gizli anahtarlar ve altyapı kimlikleri kullanıcı arayüzüne gönderilmez.",
      "Parolalar geri döndürülebilir biçimde saklanmaz; tuzlanmış parola özetleri kullanılır ve oturum çerezleri tarayıcı betiklerine kapalıdır. Kampira bu sürümde reklam profili oluşturmaz, kişisel veriyi satmaz ve ödeme verisi işlemez.",
      "Anonim dertleşme paylaşımlarında görünen ad ve profil diğer öğrencilere gönderilmez. Kötüye kullanımın incelenebilmesi için hesap sahipliği, paylaşım zamanı ve moderasyon kanıtı sunucuda korunur; anonimlik Kampira güvenlik ekibine karşı kimlik gizleme anlamına gelmez.",
      "Sosyalleşme özelliğinde seçtiğin ilgi alanları, buluşma niyetleri, kısa tanıtım, müsaitlik ve buluşma istekleri işlenir. Eşleşmeler e-posta veya telefon bilgisi görmez; öneriler yalnız aynı üniversitedeki görünür profiller arasında oluşturulur.",
      "Kampüs rehberine eklenen mekân adı, açıklama, adres, koordinat, erişilebilirlik, çalışma saati, etkinlik ve güncellik onayları aynı üniversitedeki öğrencilere gösterilir. Harita önizlemesi açıldığında OpenStreetMap sunucularına ağ isteği gönderilebilir.",
      "Öğrenci pazarında ilan, fiyat, ürün durumu, teslim noktası, ilan mesajı, tarihli fiyat gözlemleri ve ilan başına yüklenen en fazla 6 ürün fotoğrafı işlenir. Fotoğraflar yalnız aynı kampüsteki oturum açmış öğrencilere gösterilir. Kampira uygulama içi ödeme, kargo, emanet hesap veya satıcı garantisi sunmaz; ödeme kartı verisi işlemez.",
      "Kütüphane Anlık alanında kütüphane, kat, bölge, kapasite, özellik ve süreli öğrenci check-in kayıtları işlenir. Check-in süresi dolduğunda aktif sayıdan düşer. Gösterilen boş yer bilgisi sensör ölçümü veya kesin masa sayısı değil, yalnız yakın zamanlı topluluk sinyaline dayalı tahmindir.",
      "Android uygulaması GPS konumunu veya cihaz rehberini okumaz. Seçtiğin kütüphane/bölge check-in bilgisi fiziksel konumunu belirtebilir; bu işlem isteğe bağlıdır. Diğer kullanıcılara check-in yapan kişilerin listesi yerine alanın toplu doluluk bilgisi gösterilir. Sosyal bağlantılar uygulamada kurduğun takip ve engelleme ilişkileridir.",
      "Arama yaptığında sorgun sonuçların bulunması için sunucuya gönderilir. Kullanım olaylarında arama uzunluğu ve sonuç sayısı tutulur. Ağ istekleri, uygulama/sistem sürümü, hata ve erişim kayıtları hizmetin çalışması, tanılama ve güvenliği için işlenebilir. İnternet bağlantıları HTTPS ile korunur; özel mesajlar uçtan uca şifrelenmiş bir mesajlaşma hizmeti olarak sunulmaz.",
      "Sunucu ve dosya altyapısı Railway üzerinde çalışır. Cihaz bildirimlerini açarsan Google/Firebase Cloud Messaging ve Firebase Installations üzerinden kurulum kimliği, bildirim token’ı ve teknik uygulama/cihaz bilgileri işlenir. Bunlar bildirimlerin doğru kuruluma iletilmesini sağlar. Reklam kimliği, Firebase Analytics veya Crashlytics kullanılmaz. Bildirim iznini cihaz ayarlarından veya Kampira bildirim tercihleri bölümünden değiştirebilirsin.",
      "Profilin ve paylaştığın içerikler ilgili akışın veya kampüs/topluluk alanının kullanıcılarına, özel mesajların konuşmanın diğer katılımcısına gösterilir. Bildirilen içerik ve mesajlar yetkili sorumlu tarafından incelenebilir. Altyapı sağlayıcıları hizmetin sunulması için veri işleyebilir; yasal yükümlülük halinde gerekli kayıtlar yetkili mercilere aktarılabilir. Veriler reklam amaçlı satılmaz.",
      "Android ilk açılışındaki 18 yaş beyanı yalnız cihazda tutulur; doğum tarihi veya kimlik belgesi istenmez. Cihazdaki görünüm tercihleri ve henüz göndermediğin taslaklar, gönderme işlemi yapılmadıkça kendiliğinden paylaşılmaz.",
    ],
  },
  {
    id: "beta",
    title: "Test başvurusu ve destek formları",
    paragraphs: [
      "Test başvurusunda e-posta adresi, web/Android tercihi ve 18 yaş beyanı alınır. Android veya her ikisini seçenlerden Google Play hesabının e-postası, Android cihaz modeli ve 14 günlük katılım beyanı da istenir; yalnız web testi için bunlar gerekmez. Ad, üniversite, Android sürümü ve ek açıklama isteğe bağlıdır. Bu bilgiler başvuruyu değerlendirmek, test hesabını hazırlamak, tek kullanımlık etkinleştirme bağlantısını e-posta ile iletmek ve test erişimini takip etmek için kullanılır. Katılımcı parolasını bağlantı üzerinden kendisi oluşturur. Geri bildirim formunda konu ve mesaj gerekli; iletişim adresi ve cihaz bilgileri isteğe bağlıdır. Kayıtlar yalnız yetkili ekip tarafından işlenir; pazarlama listesine otomatik eklenmez.",
      "Yeni kayıtlar yapay zekâ destekli ön değerlendirmeden geçebilir. Ön değerlendirme yaş veya e-posta sahipliğini doğrulamaz ve Google Play test erişimini kendiliğinden açmaz. Test listesine ekleme ve erişim teyidi ayrıca yapılır. Başvuru metinleri herkese açık değildir.",
      "Gönderim sonunda verilen kişisel takip kodu, talebini ve görüşmeleri açar. Kodu gizli tut. Son kod bu tarayıcıda saklanır. Takip sayfasından yanıtları görebilir, ek bilgi paylaşabilir veya talebi kapatıp form bilgilerini silebilirsin. Bu işlem uygulama hesabının tamamını silmez.",
      "Form kayıtları ve görüşmeler oluşturuldukları tarihten itibaren 90 gün sonunda otomatik temizlenir. Etkinleştirme bağlantısı süreli ve tek kullanımlıktır; başvurudan ayrılma veya başvurunun temizlenmesiyle geçersizleşir. Formun temizlenmesi, etkinleştirilmiş kullanıcı hesabını silmez; hesap ve içerikler ayrı hesap silme sürecine tabidir. Başvurudan ayrılma, o başvuruya ait test hesabının erişimini kapatır ve oturumlarını sonlandırır; hesabın verilerini kendiliğinden silmez. Kötüye kullanımı azaltmak için IP adresinin özetiyle istek sınırı uygulanır; ham IP adresi form kaydında saklanmaz. Reklam bağlantısındaki kampanya etiketleri başvurunun kaynağını anlamak için kaydedilebilir. Veritabanı yedeklerinin saklama döngüsü aşağıda açıklanmıştır. Yardım ve veri talepleri için destek@kampira.net adresine ulaşabilirsin.",
    ],
  },
  {
    id: "retention",
    title: "Saklama ve silme",
    paragraphs: [
      "Hesap ve içerik bilgileri hesabın açık olduğu ve ilgili hizmetin sunulması için gerekli olduğu sürece saklanır. Kendi içeriklerini ürün içindeki kaldırma seçeneklerinden yönetebilir veya destek@kampira.net adresinden belirli verilerinin silinmesini isteyebilirsin. Hesabının tamamını silmek zorunda değilsin.",
      "Doğrulanmış hesap silme taleplerinin canlı sistemdeki işlemlerini en geç 30 gün içinde tamamlamayı hedefleriz. Talep göndermek tek başına silme işleminin tamamlandığı anlamına gelmez. İşlem başladığında oturumlar ve hesaba bağlı cihaz abonelikleri iptal edilir; hesabın, profilin, sana ait içerikler ve dosyalar temizlenir veya ortak kayıtlarda kimliğini göstermeyen bir açıklamaya dönüştürülür.",
      "Diğer kullanıcıların kendi mesaj ve yorumları, ortak alanlardaki kendi içerikleri korunur. Hesabını anan başka bir kullanıcının serbest metni kendiliğinden silinmez; kişisel veri ihlali varsa ayrıca bildirebilirsin. Tamamlanan silme işleminin kaydında özgün hesap adresi ve talep metni yerine işlem kimliği, tarih ve sonuç sayıları tutulur.",
      "İşletim yedekleri 30 günlük saklama döngüsüyle yönetilir ve genel kullanıma açık değildir. Canlı sistemden silinen bilgiler bu döngü dolana kadar yedeklerde kalabilir. Bir yedekten geri dönüldüğünde tamamlanmış silme işlemleri yeniden uygulanmadan ilgili hesap ve içerikler kullanıma açılmaz.",
      "Somut bir hukuki yükümlülük veya güvenlik incelemesi nedeniyle belirli kayıtların daha uzun saklanması gerekirse kapsam, gerekçe ve geçerli süre ayrıca değerlendirilir ve mümkün olduğu ölçüde talep sahibine açıklanır. Bu durum bütün hesabın süresiz tutulması anlamına gelmez.",
      "Bildirimleri kapatmak veya hesapla bağlantısını kesmek, Firebase kurulum kimliğinin sağlayıcıdaki bütün kopyalarını anında silmez. Sağlayıcıların kendi teknik kayıtları ve silme süreçleri ilgili hizmetin saklama kurallarına tabidir. Veri talebinde ilgili sağlayıcı kayıtlarının kapsamını da destek kanalından sorabilirsin.",
    ],
  },
  {
    id: "terms",
    title: "Kullanım koşulları",
    paragraphs: [
      "Kampira, Türkiye ve Kıbrıs'taki üniversite öğrencilerinin öğrenme ve kampüs dayanışması için kullanılan herkese açık bir MVP ürünüdür. Hesaplar yönetici onayı olmadan açılır; bu nedenle profil bilgileri Kampira tarafından öğrenci belgesiyle doğrulanmış sayılmaz. Kullanıcılar paylaştıkları içeriğin doğruluğundan, paylaşma hakkına sahip olmaktan ve kişisel verileri izinsiz yayımlamamaktan sorumludur.",
      "Notlar ve gönderiler akademik danışmanlık ya da resmî ders materyali yerine geçmez. Sınav güvenliğini ihlal eden, başkasına ait çalışmayı izinsiz çoğaltan, taciz içeren veya yasa dışı içerik kaldırılabilir; hesap görünürlüğü geçici ya da kalıcı biçimde kısıtlanabilir.",
      "MVP özellikleri gelişmeye devam eder ve zaman zaman kesintiye uğrayabilir. Önemli ders materyalinin tek kopyasını Kampira'da tutma; kendi yedeğini koru.",
      "Kampira’nın Android uygulaması 18 yaş ve üzerindeki kullanıcılara yöneliktir. İlk açılıştaki yaş beyanı resmî kimlik veya yaş doğrulaması değildir.",
    ],
  },
  {
    id: "community",
    title: "Topluluk ilkeleri",
    paragraphs: [
      "Saygılı ve ders odağında iletişim kur. Kimlik, iletişim bilgisi, sağlık bilgisi ve benzeri hassas verileri açık rıza olmadan paylaşma. Kaynak göster; başkasının emeğini kendininmiş gibi sunma.",
      "Spam, dolandırıcılık, tehdit, ayrımcılık, ısrarlı taciz, yanıltıcı dosya, zararlı yazılım ve sınav bütünlüğünü bozan içerik yasaktır. Topluluk yöneticileri kararlarını rol sınırları içinde uygular; yönetim eylemleri denetim kaydında tutulur.",
      "Pornografik içerik, cinsel amaçlı çıplaklık, çocukların cinsel istismarı veya sömürüsü ve haber ya da eğitim bağlamı dışında vahşeti teşvik eden sansürsüz gerçek şiddet içerikleri yasaktır. Çocuk güvenliği standartları profil, gönderi, yorum, dosya, topluluk ve özel mesajlar dahil bütün kullanıcı içeriklerine uygulanır.",
      "Bir sorun gördüğünde içerik veya kullanıcı menüsünden şikâyet oluştur. Engelleme iki yönlü görünürlüğü kapatır; sessize alma ilgili hesabın paylaşımlarını kendi akışından çıkarır.",
      "İlk kez buluştuğun kişilerle kalabalık ve güvenli bir kampüs alanı seç. Ev adresi, parola, kimlik belgesi veya ödeme bilgisi paylaşma; rahatsız olduğun buluşma isteğini reddet, engelle ya da Güvenlik Merkezi'ne bildir.",
      "İlanlarda ürün kusurlarını ve fiyatı doğru yaz. Ürünü görmeden ödeme gönderme; teslimi kalabalık kampüs alanında yap. Fiyat gözlemini gördüğün tarih ve kısa kaynak notuyla paylaş, eski fiyatı güncel gibi sunma.",
      "Kütüphane kapasitesini yalnız bildiğin zaman gir; boş yer tutmak için check-in yapma ve alandan erken ayrıldığında check-out yap. Doluluk tahminini kesin bilgi gibi paylaşma.",
    ],
  },
  {
    id: "removal",
    title: "Telif ve kişisel veri kaldırma",
    paragraphs: [
      "Sana ait bir çalışma, kişisel veri veya telif hakkını ihlal eden materyal paylaşıldıysa Güvenlik Merkezi üzerinden ilgili içerik için şikâyet oluştur. İçeriğin bağlantısını, ihlal türünü ve hak sahipliğini açıklayan bilgiyi ekle.",
      "Kayıt incelemeye alınır, kanıt anlık kopyası korunur ve karar gerekçesi şikâyet kaydına eklenir. Karara katılmıyorsan sonuçlanan kayıt üzerinden itiraz gönderebilirsin.",
    ],
  },
  {
    id: "help",
    title: "Yardım ve veri talepleri",
    paragraphs: [
      "Hesap ve ilişkili verilerin için silme talebini Hesap ve Veri Silme Talebi sayfasından oluşturabilir, durumunu takip edebilir ve silme başlamadan önce talebini iptal edebilirsin. Yalnız belirli verilerini sildirmek için destek@kampira.net adresine “Veri silme talebi” konusuyla hesap e-postanı, ilgili içerik bağlantısını ve hangi verilerin silinmesini istediğini yaz. Hesap sahipliği doğrulandıktan sonra aynı 30 günlük işlem hedefi uygulanır; kapsam ve varsa saklama istisnaları sana açıklanır.",
      "Giriş yapamıyorsan, hesabın askıya alındıysa veya veri kopyası ve hesap silme konusunda yardım istiyorsan destek@kampira.net adresine yazabilirsin. Hesabının e-posta adresini ve talebini belirt; parolanı, doğrulama kodlarını veya kimlik belgeni e-postaya ekleme. Hesapla ilgili işlemden önce hesap sahipliği ayrıca doğrulanır.",
      "Bir güvenlik olayı şüphesinde hassas ayrıntıları genel gönderide paylaşma. Güvenlik Merkezi'nden kayıt oluştur ve ilgili içerik bağlantısını ekle.",
    ],
  },
];

export default function LegalPage() {
  return <main className={styles.shell}>
    <header className={styles.header}><Link href="/" aria-label="Kampira ana sayfa"><img src="/kampira-mark.png" width="38" height="38" alt=""/><strong>Kampira</strong></Link><Link href="/">Ürüne dön</Link></header>
    <section className={styles.hero}><span>KAMPIRA v1.8</span><h1>Gizlilik, kullanım ve topluluk ilkeleri</h1><p>Kampira’da hangi verilerin neden işlendiğini, güvenli kullanım kurallarını ve bir sorun olduğunda hangi yolu izleyeceğini burada bulabilirsin.</p><small>Son güncelleme: 8 Eylül 2026 · v1.8</small></section>
    <nav className={styles.nav} aria-label="Belge bölümleri">{sections.map((section, index) => <a href={`#${section.id}`} key={section.id}><span>0{index + 1}</span>{section.title}</a>)}</nav>
    <div className={styles.content}>{sections.map((section, index) => <section id={section.id} key={section.id}><span>0{index + 1}</span><div><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.id === "help" && <><p><a href="mailto:destek@kampira.net">E-posta ile destek al: destek@kampira.net</a></p><p><Link href="/geri-bildirim">Geri bildirim veya destek talebi gönder</Link></p><p><Link href="/beta/takip">Başvuru ve destek yanıtlarını takip et</Link></p><Link href="/account-deletion">Hesap ve veri silme talebi oluştur veya takip et</Link></>}</div></section>)}</div>
    <footer><p>Kampira destek ve veri talepleri: <a href="mailto:destek@kampira.net">destek@kampira.net</a>. Sağlayıcı açıklamaları: <a href="https://firebase.google.com/support/privacy">Firebase gizlilik</a> ve <a href="https://railway.com/legal/privacy">Railway gizlilik</a>.</p><Link href="/child-safety">Çocuk güvenliği standartları</Link></footer>
  </main>;
}
