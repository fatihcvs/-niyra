/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import styles from "./beta.module.css";
import { BetaApplyLink } from "./apply-link";

export const metadata = {
  title: "Kampira Android kapalı test · İlk deneyenlerden ol",
  description: "Ders notları, topluluklar ve etkinlikler. Kampira’nın 18 yaş ve üzeri Android kullanıcıları için kapalı testine başvur.",
  alternates: { canonical: "https://kampira.net/beta" },
};

export default function BetaPage() {
  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Kampira ana sayfa"><img src="/kampira-mark.png" width="36" height="36" alt=""/><strong>Kampira</strong></Link>
      <span className={styles.age}>18+</span>
    </header>
    <section className={styles.hero} aria-labelledby="beta-title">
      <div className={styles.copy}>
        <span className={styles.eyebrow}>ANDROID KAPALI TEST</span>
        <h1 id="beta-title">Kampüsün tek yerde.<br/><em>İlk deneyenlerden ol.</em></h1>
        <p>Ders notlarını paylaş, topluluklarını bul, kampüsündeki etkinlikleri keşfet. Kampira’nın Android deneyimini birlikte geliştirelim.</p>
        <BetaApplyLink/>
        <p className={styles.hint}>Kısa formu doldur; başvurunu ve yanıtları kişisel takip sayfandan izle. <Link href="/beta/takip">Başvurumu takip et</Link></p>
      </div>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.orbit}/><img src="/kampira-mark.png" width="320" height="320" alt=""/>
        <span className={styles.note}>Ders notları</span><span className={styles.community}>Topluluklar</span><span className={styles.event}>Etkinlikler</span>
      </div>
    </section>
    <section className={styles.steps} aria-labelledby="steps-title">
      <div className={styles.sectionHead}><span className={styles.eyebrow}>BİRLİKTE GELİŞTİRELİM</span><h2 id="steps-title">Üç adımda teste katıl</h2></div>
      <div className={styles.grid}>
        <article><span>01</span><h3>Başvurunu gönder</h3><p>Google Play’de kullandığın Google hesabının e-posta adresini yaz. Android telefon veya tabletin olsun; 18 yaş ve üzerinde olmalısın.</p></article>
        <article><span>02</span><h3>Davetini bekle</h3><p>Test erişimin açıldığında katılım bağlantısını paylaşacağız. Listeye eklenmenin ardından bağlantıdan teste ayrıca katılman gerekir.</p></article>
        <article><span>03</span><h3>Dene, bize anlat</h3><p>14 gün boyunca testte kalıp uygulamayı doğal biçimde kullanmanı bekliyoruz. Hataları, eksikleri ve beğendiğin şeyleri paylaş; her görüş değerli.</p></article>
      </div>
    </section>
    <section className={styles.faq} aria-labelledby="questions-title">
      <h2 id="questions-title">Katılmadan önce</h2>
      <details><summary>Uygulama şu anda herkese açık mı?</summary><p>Bu bir Android kapalı test başvurusudur. Herkese açık Google Play yayını değildir. İndirme, test erişimi açılıp Google hesabın listeye eklendiğinde mümkün olur.</p></details>
      <details><summary>Hangi bilgileri paylaşmalıyım?</summary><p>Google Play hesabının e-postasını, Android cihaz modelini ve katılım koşullarına uygunluğunu belirt. Adın, üniversiten ve Android sürümü isteğe bağlıdır. Şifreni, kimlik belgeni veya ödeme bilgini gönderme.</p></details>
      <details><summary>E-posta adresim nasıl kullanılacak?</summary><p>Başvurunu yanıtlamak ve Play Console’da test erişimini tanımlamak için kullanılır. Reklam listesine otomatik olarak eklenmezsin. Ayrılmak veya başvuru bilgilerini sildirmek için destek@kampira.net adresine yazabilirsin. <Link href="/legal#privacy">Gizlilik açıklamasını oku.</Link></p></details>
      <details><summary>Hata ve önerilerimi nereye göndereceğim?</summary><p><Link href="/geri-bildirim">Geri bildirim ve destek formunu</Link> kullanabilirsin. Gönderimden sonra kişisel takip kodunla ekibin yanıtını görür, ek bilgi paylaşabilirsin. E-posta tercih edersen destek@kampira.net adresine yazabilirsin.</p></details>
    </section>
    <footer className={styles.footer}><p>Kampira · Kampüsün tek yerde.</p><div><Link href="/legal">Gizlilik ve ilkeler</Link><a href="mailto:destek@kampira.net">destek@kampira.net</a></div></footer>
  </main>;
}
