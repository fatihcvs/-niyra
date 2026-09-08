/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import styles from "../legal/legal.module.css";

export const metadata = {
  title: "Çocuk güvenliği standartları · Kampira",
  description: "Kampira’nın çocukların cinsel istismarı ve sömürüsüne karşı kuralları, bildirim yolları ve sorumlu iletişim adresi.",
};

const sections = [
  { title: "Yasaklanan içerik ve davranışlar", paragraphs: [
    "Kampira’nın Android uygulaması 18 yaş ve üzerindeki kullanıcılara yöneliktir. Çocukların cinsel istismarı veya sömürüsü (CSAE), çocuklara yönelik cinsel istismar materyali (CSAM), çocuğu cinsel amaçla yönlendirme, cinsel şantaj ve bunları kolaylaştıran davranışlar Kampira’da yasaktır. Bu yasak profil, gönderi, yorum, dosya, topluluk ve özel mesajlar dahil tüm kullanıcı içerikleri için geçerlidir.",
  ] },
  { title: "Uygulama içinden bildirme", paragraphs: [
    "Şüpheli bir içerik veya hesap gördüğünde Şikâyet et seçeneğini kullan. Çocuk güvenliği endişeni açıklama alanına yaz; uygun bir neden bulamazsan Diğer’i seç. Güvenlik Merkezi üzerinden kendi bildiriminin durumunu takip edebilirsin. İlgili hesabı ayrıca engelleyebilirsin.",
    "İçeriği yeniden paylaşma veya cihazına indirip bize gönderme. İçerik ya da hesap bağlantısı ve endişenin nedenini belirtmen yeterlidir.",
  ] },
  { title: "E-posta ile ulaşma", paragraphs: [
    "Uygulamaya erişemiyorsan destek@kampira.net adresine, konu satırına “Çocuk güvenliği” yazarak ulaşabilirsin. İstismar materyalini e-postaya ekleme. Yakın ve acil bir tehlike varsa uygulama yanıtını beklemeden bulunduğun yerdeki acil yardım birimine başvur.",
  ] },
  { title: "İnceleme ve müdahale", paragraphs: [
    "Kampira sorumlusu çocuk güvenliği bildirimlerini öncelikli olarak inceler. İhlal doğrulandığında içeriğe erişim kaldırılır, ilgili hesap kısıtlanır ve gerekli bildirimler yetkili bölgesel veya ulusal mercilere yapılır. İnceleme ve bildirim için gerekli kayıtların erişimi yetkili kişilerle sınırlandırılır; gereksiz kopyalar oluşturulmaz.",
  ] },
  { title: "Çocuk güvenliği irtibat noktası", paragraphs: [
    "Çocuk güvenliği irtibat adresi destek@kampira.net’tir. Bu adresi takip eden Kampira ürün sorumlusu, Google’ın çocuk güvenliğiyle ilgili taleplerini ve uygulamanın bildirim sürecini yanıtlar.",
  ] },
];

export default function ChildSafetyPage() {
  return <main className={styles.shell}>
    <header className={styles.header}><Link href="/" aria-label="Kampira ana sayfa"><img src="/kampira-mark.png" width="38" height="38" alt=""/><strong>Kampira</strong></Link><Link href="/legal">Gizlilik ve ilkeler</Link></header>
    <section className={styles.hero}><span>KAMPIRA GÜVENLİK</span><h1>Çocuk güvenliği standartları</h1><p>Çocukların cinsel istismarı ve sömürüsüne karşı kurallarımızı ve bir endişeyi bize nasıl bildirebileceğini burada bulabilirsin.</p><small>Son güncelleme: 8 Eylül 2026</small></section>
    <div className={styles.content}>{sections.map((section,index)=><section key={section.title}><span>0{index+1}</span><div><h2>{section.title}</h2>{section.paragraphs.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div></section>)}</div>
    <footer><p>Bildirimlerinde içerik bağlantısını kullan; istismar materyali ekleme.</p><a href="mailto:destek@kampira.net?subject=%C3%87ocuk%20g%C3%BCvenli%C4%9Fi">destek@kampira.net</a></footer>
  </main>;
}
