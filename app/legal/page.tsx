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
      "Kampira'da hesap e-postası, görünen ad, akademik profil seçimleri, gönderiler, yorumlar, takip ilişkileri, kaydedilen içerikler, yüklenen notların bilgileri, topluluk üyelikleri, güvenlik kayıtları ve temel ürün kullanım olayları işlenir.",
      "Dosya baytları nesne depolamada; aranabilir başlık, ders, etiket, sahiplik ve durum bilgileri veritabanında ayrı tutulur. Dosyalar yalnızca izin verilen ürün akışlarından açılır. Gizli anahtarlar ve altyapı kimlikleri kullanıcı arayüzüne gönderilmez.",
      "Parolalar geri döndürülebilir biçimde saklanmaz; tuzlanmış parola özetleri kullanılır ve oturum çerezleri tarayıcı betiklerine kapalıdır. Kampira bu sürümde reklam profili oluşturmaz, kişisel veriyi satmaz ve ödeme verisi işlemez.",
      "Anonim dertleşme paylaşımlarında görünen ad ve profil diğer öğrencilere gönderilmez. Kötüye kullanımın incelenebilmesi için hesap sahipliği, paylaşım zamanı ve moderasyon kanıtı sunucuda korunur; anonimlik Kampira güvenlik ekibine karşı kimlik gizleme anlamına gelmez.",
      "Sosyalleşme özelliğinde seçtiğin ilgi alanları, buluşma niyetleri, kısa tanıtım, müsaitlik ve buluşma istekleri işlenir. Eşleşmeler e-posta veya telefon bilgisi görmez; öneriler yalnız aynı üniversitedeki görünür profiller arasında oluşturulur.",
      "Kampüs rehberine eklenen mekân adı, açıklama, adres, koordinat, erişilebilirlik, çalışma saati, etkinlik ve güncellik onayları aynı üniversitedeki öğrencilere gösterilir. Harita önizlemesi açıldığında OpenStreetMap sunucularına ağ isteği gönderilebilir.",
      "Öğrenci pazarında ilan, fiyat, ürün durumu, teslim noktası, ilan mesajı, tarihli fiyat gözlemleri ve ilan başına yüklenen en fazla 6 ürün fotoğrafı işlenir. Fotoğraflar yalnız aynı kampüsteki oturum açmış öğrencilere gösterilir. Kampira uygulama içi ödeme, kargo, emanet hesap veya satıcı garantisi sunmaz; ödeme kartı verisi işlemez.",
      "Kütüphane Anlık alanında kütüphane, kat, bölge, kapasite, özellik ve süreli öğrenci check-in kayıtları işlenir. Check-in süresi dolduğunda aktif sayıdan düşer. Gösterilen boş yer bilgisi sensör ölçümü veya kesin masa sayısı değil, yalnız yakın zamanlı topluluk sinyaline dayalı tahmindir.",
    ],
  },
  {
    id: "terms",
    title: "Kullanım koşulları",
    paragraphs: [
      "Kampira, Türkiye ve Kıbrıs'taki üniversite öğrencilerinin öğrenme ve kampüs dayanışması için kullanılan herkese açık bir MVP ürünüdür. Hesaplar yönetici onayı olmadan açılır; bu nedenle profil bilgileri Kampira tarafından öğrenci belgesiyle doğrulanmış sayılmaz. Kullanıcılar paylaştıkları içeriğin doğruluğundan, paylaşma hakkına sahip olmaktan ve kişisel verileri izinsiz yayımlamamaktan sorumludur.",
      "Notlar ve gönderiler akademik danışmanlık ya da resmî ders materyali yerine geçmez. Sınav güvenliğini ihlal eden, başkasına ait çalışmayı izinsiz çoğaltan, taciz içeren veya yasa dışı içerik kaldırılabilir; hesap görünürlüğü geçici ya da kalıcı biçimde kısıtlanabilir.",
      "MVP özellikleri gelişmeye devam eder ve zaman zaman kesintiye uğrayabilir. Önemli ders materyalinin tek kopyasını Kampira'da tutma; kendi yedeğini koru.",
    ],
  },
  {
    id: "community",
    title: "Topluluk ilkeleri",
    paragraphs: [
      "Saygılı ve ders odağında iletişim kur. Kimlik, iletişim bilgisi, sağlık bilgisi ve benzeri hassas verileri açık rıza olmadan paylaşma. Kaynak göster; başkasının emeğini kendininmiş gibi sunma.",
      "Spam, dolandırıcılık, tehdit, ayrımcılık, ısrarlı taciz, yanıltıcı dosya, zararlı yazılım ve sınav bütünlüğünü bozan içerik yasaktır. Topluluk yöneticileri kararlarını rol sınırları içinde uygular; yönetim eylemleri denetim kaydında tutulur.",
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
      "Hesap ve ilişkili verilerin için silme talebini Hesap ve Veri Silme Talebi sayfasından oluşturabilir, durumunu takip edebilir ve talebini iptal edebilirsin. Talep kaydı açılması hesabın veya verilerinin silindiği anlamına gelmez; tamamlanma süresi ve veri saklama koşulları henüz yayımlanmadı.",
      "Giriş yapılamayan veya askıya alınmış hesaplar için ayrı kimlik doğrulama ve destek yolu ile veri kopyası talep akışı henüz kullanıma açılmadı.",
      "Bir güvenlik olayı şüphesinde hassas ayrıntıları genel gönderide paylaşma. Güvenlik Merkezi'nden kayıt oluştur ve ilgili içerik bağlantısını ekle.",
    ],
  },
];

export default function LegalPage() {
  return <main className={styles.shell}>
    <header className={styles.header}><Link href="/" aria-label="Kampira ana sayfa"><img src="/kampira-mark.png" width="38" height="38" alt=""/><strong>Kampira</strong></Link><Link href="/">Ürüne dön</Link></header>
    <section className={styles.hero}><span>KAMPIRA MVP v1.8</span><h1>Gizlilik, kullanım ve topluluk ilkeleri</h1><p>Kampira’da hangi verilerin neden işlendiğini, güvenli kullanım kurallarını ve bir sorun olduğunda hangi yolu izleyeceğini burada bulabilirsin.</p><small>Son güncelleme: 5 Eylül 2026 · MVP v1.8</small></section>
    <nav className={styles.nav} aria-label="Belge bölümleri">{sections.map((section, index) => <a href={`#${section.id}`} key={section.id}><span>0{index + 1}</span>{section.title}</a>)}</nav>
    <div className={styles.content}>{sections.map((section, index) => <section id={section.id} key={section.id}><span>0{index + 1}</span><div><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.id === "help" && <Link href="/account-deletion">Hesap ve veri silme talebi oluştur veya takip et</Link>}</div></section>)}</div>
    <footer><p>Bu metin Kampira MVP v1.8 çalışma kurallarını açıklar ve ürün geliştikçe güncellenir.</p><Link href="/">Kampira&apos;ya dön</Link></footer>
  </main>;
}
