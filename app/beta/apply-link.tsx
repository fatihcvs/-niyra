"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import styles from "./beta.module.css";
const subscribe = (callback: () => void) => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); };
export function BetaApplyLink() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const source = new URLSearchParams(search), retained = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) { const value = source.get(key); if (value && /^[\w.-]{1,100}$/.test(value)) retained.set(key, value); }
  return <Link className={styles.primary} href={`/beta/basvur${retained.size ? `?${retained}` : ""}`}>Test için başvur <span aria-hidden="true">↗</span></Link>;
}
