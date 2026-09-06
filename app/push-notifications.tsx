"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { useAppNavigation } from "./app-navigation";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { disableBrowserPush, enableBrowserPush, invalidatePushEnrollment, isRegisteredBrowserPush, pushBrowserSupport, pushDeviceId, readPushConfiguration, type PushConfiguration } from "../lib/push-client";
import { hasNativePush, nativePushRequest } from "../lib/native-push-client";
import styles from "./push-notifications.module.css";

type State = "loading" | "unavailable" | "unsupported" | "insecure" | "denied" | "off" | "on" | "error" | "busy";
const messages: Record<State, [string, string]> = {
  loading: ["Cihaz bildirimleri", "Bu cihazın bildirim ayarı kontrol ediliyor."],
  unavailable: ["Bildirimler hazırlanıyor", "Uygulama kapalıyken bildirim gönderimi henüz açılmadı. Gelişmeleri burada takip edebilirsin."],
  unsupported: ["Bu sürüm cihaz bildirimlerini desteklemiyor", "Bildirimlerini Kampira içinden takip edebilirsin."],
  insecure: ["Güvenli bağlantı gerekiyor", "Cihaz bildirimlerini açmak için Kampira’nın güvenli site adresini kullan."],
  denied: ["Bildirim izni kapalı", "Tarayıcının site ayarlarından bildirim iznini açıp buradaki durumu yenileyebilirsin."],
  off: ["Cihaz bildirimleri kapalı", "Kampira kapalıyken yeni gelişmelerden haberdar ol. Bildirim önizlemesinde mesajların gösterilmez."],
  on: ["Bu cihazda bildirimler açık", "Kampira kapalıyken yeni gelişmeler için bildirim alabilirsin. Mesaj içeriğin önizlemede görünmez."],
  error: ["Bildirim ayarı tamamlanamadı", "Durumu kontrol edip tekrar deneyebilirsin."],
  busy: ["Bildirim ayarı güncelleniyor", "İşlem tamamlanana kadar bekle."],
};

export function PushNotifications() {
  const navigation = useAppNavigation();
  const accountId = /^([A-Za-z0-9_-]{1,160}):\d+$/.exec(navigation?.ownerScope ?? "")?.[1] ?? "";
  return accountId ? <PushNotificationSettings key={navigation?.ownerScope} accountId={accountId}/> : null;
}

function PushNotificationSettings({ accountId }: { accountId: string }) {
  const transport = useAuthenticatedFetch();
  const [state, setState] = useState<State>("loading");
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [native, setNative] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const actionVersion = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const changed = (event: MessageEvent) => {
      if (event.data?.type === "KAMPIRA_PUSH_REVOKED") {
        invalidatePushEnrollment(); actionVersion.current++; busy.current = false;
        setState("loading"); setRevision((value) => value + 1);
      } else if (event.data?.type === "KAMPIRA_PUSH_REFRESH_REQUIRED" && !busy.current) { setState("loading"); setRevision((value) => value + 1); }
    };
    navigator.serviceWorker.addEventListener("message", changed);
    return () => navigator.serviceWorker.removeEventListener("message", changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController(), check = transport.beginResponseCheck(controller.signal);
    void (async () => {
      if (!accountId) return;
      if (hasNativePush()) {
        const result = await nativePushRequest("status", accountId);
        if (check.isCurrent()) { setNative(true); setState(result.state === "busy" ? "error" : result.state); setError(result.state === "busy" ? "Başka bir bildirim işlemi sürüyor. Durumu yenileyebilirsin." : result.state === "error" ? result.message ?? "Uygulamanın bildirim ayarı kontrol edilemedi." : ""); }
        return;
      }
      const config = await readPushConfiguration(transport, accountId, controller.signal);
      const support = pushBrowserSupport();
      let next: State = "off";
      if (!config.webPush.available || !config.webPush.publicKey) next = "unavailable";
      else if (support !== "supported") next = support;
      else if (window.Notification.permission === "denied") next = "denied";
      else {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        const deviceId = pushDeviceId();
        if (subscription && window.Notification.permission === "granted" && await isRegisteredBrowserPush(config, subscription, deviceId)) next = "on";
      }
      if (check.isCurrent()) { setConfiguration(config); setState(next); setError(""); }
    })().catch((cause: unknown) => { if (check.isCurrent()) { setState("error"); setError(cause instanceof Error ? cause.message : "Bildirim ayarı kontrol edilemedi."); } });
    return () => controller.abort();
  }, [transport, accountId, revision]);

  function refresh() { if (busy.current) return; setError(""); setState("loading"); setRevision((value) => value + 1); }
  async function nativeChange(command: "enable" | "disable") {
    if (busy.current) return;
    busy.current = true; setState("busy"); setError("");
    const version = ++actionVersion.current, check = transport.beginResponseCheck(), current = () => mounted.current && version === actionVersion.current && check.isCurrent();
    try {
      // The native command starts directly from this button activation. Only native
      // code reads CookieManager or requests Android notification permission.
      const result = await nativePushRequest(command, accountId);
      if (current()) { setState(result.state === "busy" ? "error" : result.state); setError(result.state === "busy" ? "Başka bir bildirim işlemi sürüyor. Durumu yenileyebilirsin." : result.state === "error" ? result.message ?? "Uygulamanın bildirim ayarı tamamlanamadı." : ""); }
    } catch (cause) { if (current()) { setState("error"); setError(cause instanceof Error ? cause.message : "Uygulamanın bildirim ayarı tamamlanamadı."); } }
    finally { if (current()) busy.current = false; }
  }
  async function enable() {
    if (busy.current || !configuration?.webPush.available || !configuration.webPush.publicKey || pushBrowserSupport() !== "supported") return;
    busy.current = true;
    const version = ++actionVersion.current, check = transport.beginResponseCheck(), current = () => mounted.current && version === actionVersion.current && check.isCurrent();
    // Must run directly in this click handler, before any registration or network await.
    setState("busy"); setError("");
    try {
      const permission = window.Notification.permission === "default" ? window.Notification.requestPermission() : Promise.resolve(window.Notification.permission);
      const result = await enableBrowserPush({ transport, accountId, publicKey: configuration.webPush.publicKey, permission, isCurrent: current });
      if (current()) setState(result.enabled ? "on" : result.permission === "denied" ? "denied" : "off");
    } catch (cause) { if (current()) { setState("error"); setError(cause instanceof Error ? cause.message : "Bildirimler açılamadı."); } }
    finally { if (current()) busy.current = false; }
  }
  async function disable() {
    if (busy.current) return;
    busy.current = true; setState("busy"); setError("");
    const version = ++actionVersion.current, check = transport.beginResponseCheck(), current = () => mounted.current && version === actionVersion.current && check.isCurrent();
    try { await disableBrowserPush(transport, accountId, current); if (current()) setState("off"); }
    catch (cause) { if (current()) { setState("error"); setError(cause instanceof Error ? cause.message : "Bildirimler kapatılamadı."); } }
    finally { if (current()) busy.current = false; }
  }
  const [title, description] = messages[state];
  return <section className={styles.panel} aria-label="Cihaz bildirimleri" data-state={state} aria-busy={state === "loading" || state === "busy"}>
    <div className={styles.heading}><Bell size={22} aria-hidden="true"/><div><h3>{title}</h3><p role="status">{native && state === "denied" ? "Android ayarlarında Kampira için bildirim iznini açıp buradaki durumu yenileyebilirsin." : description}</p></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      {state === "off" && <button className={styles.enable} type="button" onClick={() => void (native ? nativeChange("enable") : enable())}>Bu cihazda bildirimleri aç</button>}
      {state === "on" && <button type="button" onClick={() => void (native ? nativeChange("disable") : disable())}>Bu cihazda bildirimleri kapat</button>}
      {["error", "denied", "unavailable"].includes(state) && <button type="button" onClick={refresh}>Durumu yenile</button>}
    </div>
  </section>;
}
