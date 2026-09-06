/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getChatGPTUser } from "../chatgpt-auth";
import { AccountDeletionPanel } from "./request-panel";
import styles from "./account-deletion.module.css";

export const metadata = {
  title: "Hesap ve veri silme talebi",
  description: "Kampira hesap ve veri silme talebini oluştur, durumunu takip et veya talebini iptal et.",
};

export default async function AccountDeletionPage() {
  const identity = await getChatGPTUser();
  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link href="/" aria-label="Kampira ana sayfa"><img src="/kampira-mark.png" width="32" height="32" alt=""/><strong>Kampira</strong></Link>
      <Link href={identity ? "/?view=settings" : "/"}>{identity ? "Ayarlara dön" : "Ana sayfaya dön"}</Link>
    </header>
    <section className={styles.intro} aria-labelledby="deletion-title">
      <span>HESABIN ÜZERİNDE KONTROL</span>
      <h1 id="deletion-title">Hesap ve veri silme talebi</h1>
      <p>Kampira hesabın ve hesabınla ilişkili veriler için silme talebi oluşturabilirsin. Uygulamayı yeniden yüklemeden bu sayfadan talebini takip edebilirsin.</p>
      <a href="#request-status" className={styles.shortcut}>Talebini takip et <span aria-hidden="true">↓</span></a>
    </section>
    <section className={styles.notice} aria-labelledby="deletion-scope">
      <h2 id="deletion-scope">Talep ve silme ayrı adımlardır</h2>
      <p>Bu form talebini kayda alır; hesabın ve verilerin hemen silinmez. Yetkili kişi silmeyi başlatana kadar talebini iptal edebilirsin. Silme başladığında tüm oturumların kapanır ve işlem geri alınamaz.</p>
      <p>Talebin; hesap ve profil bilgilerini, paylaşımlarını, mesajlarını ve yüklediğin dosyaları kapsar. Bu alanlardaki işlemler tamamlanmadan hesabının silindiği bildirilmez.</p>
      <p>Diğer kullanıcıların mesajları ve ortak alanlardaki içerikleri korunur; silinen hesabın yerine genel bir hesap adı görünür. İşlem başladıktan sonra bu hesaba giriş yapıp durum takibi yapamazsın. Yedekler, dış hizmetler ve saklama sürelerine ilişkin operasyon koşulları henüz yayımlanmadı.</p>
      <Link href="/legal#privacy">Mevcut gizlilik açıklaması</Link>
    </section>
    <AccountDeletionPanel initialAccount={identity ? { email: identity.email, displayName: identity.displayName } : null}/>
    <footer className={styles.footer}><Link href="/legal#help">Yardım ve veri talepleri</Link><p>Giriş yapamadığın veya askıya alınmış hesaplar için ayrı kimlik doğrulama ve destek yolu henüz kullanıma açılmadı.</p></footer>
  </main>;
}
