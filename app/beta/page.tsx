/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import styles from "./beta.module.css";
import { BetaApplyLink } from "./apply-link";

export const metadata = {
  title: "Kampira web ve Android beta · İlk deneyenlerden ol",
  description: "Kampira’yı web veya Android’de dene. 18 yaş ve üzeri katılımcılar için beta başvurusu ve test hesabı erişimi.",
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
        <span className={styles.eyebrow}>WEB VE ANDROID BETA</span>
        <h1 id="beta-title">Kampüsün tek yerde.<br/><em>İlk deneyenlerden ol.</em></h1>
        <p>Ders notlarını paylaş, topluluklarını bul, kampüsündeki etkinlikleri keşfet. Kampira’yı tarayıcıda veya Android’de birlikte geliştirelim.</p>
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
        <article><span>01</span><h3>Başvurunu gönder</h3><p>Web, Android veya her ikisini seç ve e-postanı yaz. 18 yaş ve üzerinde olmalısın. Android için Google Play’de kullandığın hesabın adresini belirt.</p></article>
        <article><span>02</span><h3>Hesabını etkinleştir</h3><p>E-posta ile iletilecek güvenli bağlantıyı aç ve kendi parolanı oluştur. Android seçtiysen Google Play test listesine eklenme ve katılım bağlantısı ayrı olarak takip edilir.</p></article>
        <article><span>03</span><h3>Dene, bize anlat</h3><p>Uygulamayı doğal biçimde kullan; hataları, eksikleri ve önerilerini paylaş. Android kapalı testinde 14 günlük katılım beklenir; yalnız web testinde bu koşul yoktur.</p></article>
      </div>
    </section>
    <section className={styles.faq} aria-labelledby="questions-title">
      <h2 id="questions-title">Katılmadan önce</h2>
      <details><summary>Uygulama şu anda herkese açık mı?</summary><p>Yeni katılımcılar test hesabıyla erişir; mevcut Kampira hesapları kullanılmaya devam eder. Web testi tarayıcıda çalışır. Android sürümü Google Play kapalı testindedir; indirme için Google hesabının test listesine eklenmesi ve katılım bağlantısından teste katılman gerekir.</p></details>
      <details><summary>Hangi bilgileri paylaşmalıyım?</summary><p>E-posta adresini, denemek istediğin platformu ve 18 yaş üzerinde olduğunu belirt. Android seçersen cihaz modeli ve 14 günlük katılım beyanı da gerekir. Adın, üniversiten ve Android sürümü isteğe bağlıdır. Şifreni, kimlik belgeni veya ödeme bilgini gönderme.</p></details>
      <details><summary>E-posta adresim nasıl kullanılacak?</summary><p>Test hesabını hazırlamak, kendi parolanı oluşturacağın etkinleştirme bağlantısını iletmek ve başvurunu yanıtlamak için kullanılır. Android seçersen Play Console test erişiminde de kullanılır. Reklam listesine otomatik olarak eklenmezsin. Ayrılmak veya başvuru bilgilerini sildirmek için destek@kampira.net adresine yazabilirsin. <Link href="/legal#beta">Gizlilik açıklamasını oku.</Link></p></details>
      <details><summary>Hata ve önerilerimi nereye göndereceğim?</summary><p><Link href="/geri-bildirim">Geri bildirim ve destek formunu</Link> kullanabilirsin. Gönderimden sonra kişisel takip kodunla ekibin yanıtını görür, ek bilgi paylaşabilirsin. E-posta tercih edersen destek@kampira.net adresine yazabilirsin.</p></details>
    </section>
    <footer className={styles.footer}><p>Kampira · Kampüsün tek yerde.</p><div><Link href="/legal">Gizlilik ve ilkeler</Link><a href="mailto:destek@kampira.net">destek@kampira.net</a></div></footer>
  </main>;
}
