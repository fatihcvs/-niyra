"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startWebPerformanceSession, type WebPerformanceSession, type WebPerformanceSnapshot } from "../lib/web-performance";
import styles from "./web-performance-panel.module.css";

const subscribeGate = (notify: () => void) => { window.addEventListener("popstate", notify); return () => window.removeEventListener("popstate", notify); };
const optInGate = () => process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("devMetrics") === "1";

/** A development URL exposes controls, but an explicit Start click is still required to collect. */
export function WebPerformancePanel() {
  const gate = useSyncExternalStore(subscribeGate, optInGate, () => false);
  const session = useRef<WebPerformanceSession | null>(null);
  const [report, setReport] = useState<WebPerformanceSnapshot | null>(null);
  const allowed = process.env.NODE_ENV === "development" && (gate || report !== null);
  useEffect(() => {
    // Fast Refresh replays effects while retaining refs/state. Keep the stopped
    // session readable and replace its stale running snapshot on that replay.
    if (session.current) setReport(session.current.snapshot());
    return () => { session.current?.stop(); };
  }, [allowed]);
  if (!allowed) return null;
  function refresh() { if (session.current) setReport(session.current.snapshot()); }
  function download() {
    if (!session.current) return;
    const snapshot = session.current.snapshot();
    setReport(snapshot);
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "kampira-local-web-metrics.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <aside className={styles.panel} data-web-performance-panel="true" aria-label="Yerel geliştirici ölçümü">
    <details><summary>Yerel web ölçümü</summary><div className={styles.content}>
      <p>Yalnız geliştirme. Başlatınca en fazla 5 dakika / son 500 örnek. İçerik, kimlik ve URL kaydedilmez; sunucuya gönderilmez.</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => { session.current?.stop(); session.current = startWebPerformanceSession(); refresh(); }}>Ölçümü başlat</button>
        <button type="button" disabled={!report} onClick={() => { session.current?.stop(); refresh(); }}>Durdur</button>
        <button type="button" disabled={!report} onClick={refresh}>Raporu yenile</button>
        <button type="button" disabled={!report} onClick={download}>JSON indir</button>
        <button type="button" disabled={!report} onClick={() => { session.current?.stop(); session.current = null; setReport(null); }}>Sil</button>
      </div>
      {report && <><p role="status">Son okuma: {report.running ? "Kayıt açık" : "Durduruldu"} · {report.samples.length} örnek · {report.dropped} eski örnek çıkarıldı</p><dl>{Object.entries(report.capabilities).map(([name, status]) => <div key={name}><dt>{name}</dt><dd>{status}</dd></div>)}</dl><p>Event Timing ≥16ms örnekleri INP puanı değildir. Hazır oluş busy commit → ready commit; history ölçümü scroll hedefinin gözlenmesidir. Araç beklemesi veya Android FPS/ANR ölçülmez.</p><pre tabIndex={0} aria-label="Yerel ölçüm JSON raporu">{JSON.stringify(report, null, 2)}</pre></>}
    </div></details>
  </aside>;
}
