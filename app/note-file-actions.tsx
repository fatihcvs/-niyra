"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasNativeFiles, nativeFileAccount, nativeFileRequest } from "../lib/native-files-client";
import { useAppNavigation } from "./app-navigation";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";

const subscribeCapability = () => () => {};

export function NoteFileActions({ fileUrl }: { fileUrl: string }) {
  const navigation = useAppNavigation();
  return <FileActions key={`${navigation?.ownerScope}:${fileUrl}`} fileUrl={fileUrl} accountId={nativeFileAccount(navigation?.ownerScope)}/>;
}

function FileActions({ fileUrl, accountId }: { fileUrl: string; accountId: string }) {
  const transport = useAuthenticatedFetch();
  const native = useSyncExternalStore(subscribeCapability, hasNativeFiles, () => false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const downloadUrl = `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}download=1`;
  if (!native) return <><a href={fileUrl} target="_blank" rel="noreferrer">Yeni sekmede aç</a><a className="feature-primary" href={downloadUrl}>İndir</a></>;

  async function run(action: "save" | "share") {
    if (active.current) return;
    const controller = new AbortController(), check = transport.beginResponseCheck(controller.signal);
    active.current = controller; setBusy(true); setError(""); setStatus("Dosya hazırlanıyor…");
    try {
      const reply = await nativeFileRequest("download", accountId, { url: downloadUrl, action }, controller.signal);
      if (!check.accept(reply.httpStatus ?? 200) || !check.isCurrent()) return;
      if (reply.state === "saved") setStatus("Dosya kaydedildi.");
      else if (reply.state === "shareOpened") setStatus("Paylaşım menüsü açıldı.");
      else if (reply.state === "cancelled") setStatus("Dosya işlemi iptal edildi.");
      else { setStatus(""); setError(reply.message ?? "Dosya hazırlanamadı. Tekrar deneyebilirsin."); }
    } catch (cause) {
      if (check.isCurrent()) { setStatus(""); setError(cause instanceof Error ? cause.message : "Dosya işlemi tamamlanamadı."); }
    } finally {
      if (active.current === controller) { active.current = null; if (check.isCurrent()) setBusy(false); }
    }
  }
  function cancel() { active.current?.abort(); active.current = null; setBusy(false); setStatus("Dosya işlemi iptal edildi."); setError(""); }
  return <>
    <button type="button" disabled={busy} onClick={() => void run("share")}>Dosyayı paylaş</button>
    <button className="feature-primary" type="button" disabled={busy} onClick={() => void run("save")}>İndir</button>
    {busy && <button type="button" onClick={cancel}>İptal</button>}
    {status && <p role="status" className="note-file-status">{status}</p>}
    {error && <p role="alert" className="feature-error note-file-status">{error}</p>}
  </>;
}
