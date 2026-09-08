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
      <p>Diğer kullanıcıların kendi mesajları ve ortak alanlardaki kendi içerikleri korunur; silinen hesabın yerine genel bir hesap adı görünür. İşlem başladıktan sonra bu hesaba giriş yapıp durum takibi yapamazsın.</p>
      <p>Doğrulanmış taleplerin canlı sistemdeki işlemlerini en geç 30 gün içinde tamamlamayı hedefleriz. İşletim yedekleri 30 günlük döngüyle yönetilir; silinen bilgiler bu süre dolana kadar yedeklerde kalabilir. Somut hukuki veya güvenlik gerekçesiyle daha uzun saklanması gereken sınırlı kayıtlar ve sağlayıcıların teknik kayıtları ayrıca değerlendirilir.</p>
      <p>Hesabının tamamı yerine belirli verilerinin silinmesini istemek için destek@kampira.net adresine hesap e-postanı, ilgili içerik bağlantısını ve talebini yazabilirsin. Hesap sahipliği doğrulandıktan sonra aynı işlem hedefi uygulanır.</p>
      <Link href="/legal#retention">Saklama, silme ve sağlayıcı açıklamaları</Link>
    </section>
    <AccountDeletionPanel initialAccount={identity ? { email: identity.email, displayName: identity.displayName } : null}/>
    <footer className={styles.footer}><Link href="/legal#help">Yardım ve veri talepleri</Link><p>Giriş yapamıyorsan veya hesabın askıya alındıysa <a href="mailto:destek@kampira.net?subject=Kampira%20hesap%20ve%20veri%20silme%20talebi">destek@kampira.net</a> adresine hesap e-postan ve talebinle yazabilirsin. Parolanı veya doğrulama kodlarını paylaşma. Hesapla ilgili işlemden önce hesap sahipliği ayrıca doğrulanır.</p></footer>
  </main>;
}
