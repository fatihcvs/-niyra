import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./beta.module.css";

export function BetaShell({ children }: { children: ReactNode }) {
  return <main className={styles.shell}>
    <header className={styles.header}><Link className={styles.brand} href="/beta"><Image src="/kampira-mark.png" width={36} height={36} alt="" unoptimized/><strong>Kampira</strong></Link><Link className={styles.textLink} href="/beta/takip">Başvurumu takip et</Link></header>
    <section className={styles.formPage}>{children}</section>
    <footer className={styles.footer}><p>Kampira · Birlikte geliştirelim.</p><div><Link href="/geri-bildirim">Geri bildirim gönder</Link><Link href="/legal#privacy">Gizlilik</Link><a href="mailto:destek@kampira.net">destek@kampira.net</a></div></footer>
  </main>;
}
