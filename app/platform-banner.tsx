"use client";

import { useEffect, useState } from "react";
import styles from "./platform-banner.module.css";

export default function PlatformBanner() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (["/owner", "/admin"].some((path) => window.location.pathname.startsWith(path))) return;
    let cancelled = false;
    fetch("/api/platform-config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { maintenanceMode?: boolean; maintenanceMessage?: string }) => {
        if (!cancelled && payload.maintenanceMode && payload.maintenanceMessage) setMessage(payload.maintenanceMessage);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return message ? <aside className={styles.banner} role="status"><strong>Kampira duyurusu</strong><span>{message}</span></aside> : null;
}
