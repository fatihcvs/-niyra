"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PulseKind = "live" | "confession";
type Reaction = "support" | "confirm" | "outdated";

type PulseItem = {
  id: string;
  kind: PulseKind;
  category: string;
  content: string;
  campusZone: string;
  anonymous: boolean;
  authorName: string;
  authorId: string | null;
  own: boolean;
  expiresAt: string | null;
  time: string;
  supportCount: number;
  confirmCount: number;
  outdatedCount: number;
  viewerReaction: Reaction | null;
};

type PulseResponse = {
  items?: PulseItem[];
  topics?: { topic: string; score: number }[];
  error?: string;
};

const categories = [
  ["general", "Genel"],
  ["transport", "Ulaşım"],
  ["food", "Yemek"],
  ["event", "Etkinlik"],
  ["lost-found", "Kayıp eşya"],
  ["study", "Çalışma"],
  ["safety", "Güvenlik"],
  ["social", "Sosyalleşme"],
] as const;

const categoryNames = Object.fromEntries(categories) as Record<string, string>;

async function readJson(response: Response) {
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "İşlem tamamlanamadı.");
  return data;
}

async function fetchPulse(kind: PulseKind) {
  const response = await fetch(`/api/campus-pulse?kind=${kind}`, { headers: { accept: "application/json" } });
  return await readJson(response) as PulseResponse;
}

function remainingLabel(expiresAt: string | null) {
  if (!expiresAt) return "Kalıcı";
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes} dk kaldı`;
  return `${Math.ceil(minutes / 60)} sa kaldı`;
}

export function CampusPulseWorkspace({ universityShortName }: { universityShortName: string }) {
  const [kind, setKind] = useState<PulseKind>("live");
  const [items, setItems] = useState<PulseItem[]>([]);
  const [topics, setTopics] = useState<{ topic: string; score: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reporting, setReporting] = useState<PulseItem | null>(null);
  const [reportState, setReportState] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPulse(kind);
      setItems(data.items ?? []);
      setTopics(data.topics ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kampüs akışı getirilemedi.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    let active = true;
    void fetchPulse(kind).then((data) => {
      if (!active) return;
      setItems(data.items ?? []);
      setTopics(data.topics ?? []);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Kampüs akışı getirilemedi.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [kind]);

  const heading = kind === "live" ? "Kampüsünde şimdi ne oluyor?" : "İçinden geçeni güvenle paylaş";
  const description = kind === "live"
    ? "Kısa ömürlü kampüs bilgilerini paylaş, güncelliğini birlikte doğrula."
    : "Adın diğer öğrencilere gösterilmez. Güvenlik için hesap sahipliği yalnız moderasyonda korunur.";

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPublishing(true);
    setError("");
    try {
      await readJson(await fetch("/api/campus-pulse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          category: data.get("category"),
          content: data.get("content"),
          campusZone: data.get("campusZone"),
          durationHours: Number(data.get("durationHours") ?? 6),
        }),
      }));
      form.reset();
      setComposerOpen(false);
      await load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Paylaşım yayınlanamadı.");
    } finally {
      setPublishing(false);
    }
  }

  async function react(item: PulseItem, reaction: Reaction) {
    const previous = items;
    const active = item.viewerReaction !== reaction;
    setItems((current) => current.map((entry) => entry.id === item.id ? {
      ...entry,
      viewerReaction: active ? reaction : null,
      supportCount: entry.supportCount + (reaction === "support" ? (active ? 1 : -1) : 0),
      confirmCount: entry.confirmCount + (reaction === "confirm" ? (active ? 1 : -1) : entry.viewerReaction === "confirm" ? -1 : 0),
      outdatedCount: entry.outdatedCount + (reaction === "outdated" ? (active ? 1 : -1) : entry.viewerReaction === "outdated" ? -1 : 0),
    } : entry));
    try {
      const result = await readJson(await fetch("/api/campus-pulse", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "react", id: item.id, reaction }),
      }));
      setItems((current) => current.map((entry) => entry.id === item.id ? {
        ...entry,
        viewerReaction: result.active ? reaction : null,
        supportCount: Number(result.supportCount ?? 0),
        confirmCount: Number(result.confirmCount ?? 0),
        outdatedCount: Number(result.outdatedCount ?? 0),
      } : entry));
    } catch (reactionError) {
      setItems(previous);
      setError(reactionError instanceof Error ? reactionError.message : "Tepki kaydedilemedi.");
    }
  }

  async function remove(item: PulseItem) {
    if (!window.confirm("Bu paylaşımı kaldırmak istediğine emin misin?")) return;
    try {
      await readJson(await fetch("/api/campus-pulse", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      }));
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Paylaşım kaldırılamadı.");
    }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reporting) return;
    const form = new FormData(event.currentTarget);
    setReportState("Şikâyet gönderiliyor…");
    try {
      await readJson(await fetch("/api/safety", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "report",
          entityType: "pulse",
          entityId: reporting.id,
          reason: form.get("reason"),
          details: form.get("details"),
        }),
      }));
      setReportState("Şikâyet güvenlik kuyruğuna alındı.");
      window.setTimeout(() => { setReporting(null); setReportState(""); }, 900);
    } catch (reportError) {
      setReportState(reportError instanceof Error ? reportError.message : "Şikâyet gönderilemedi.");
    }
  }

  const visibleTopics = topics.filter((topic) => topic.score > 0);

  return (
    <div className="workspace-view pulse-workspace">
      <header className="pulse-header">
        <div><span>{universityShortName} · KAMPÜS ANLIK</span><h1>{heading}</h1><p>{description}</p></div>
        <button className="feature-primary" type="button" onClick={() => setComposerOpen(true)}>＋ Paylaş</button>
      </header>

      <div className="pulse-tabs" role="tablist" aria-label="Kampüs Anlık görünümü">
        <button type="button" role="tab" aria-selected={kind === "live"} className={kind === "live" ? "active" : ""} onClick={() => { setLoading(true); setError(""); setKind("live"); }}><strong>Kampüs Anlık</strong><small>Şu anda olanlar</small></button>
        <button type="button" role="tab" aria-selected={kind === "confession"} className={kind === "confession" ? "active" : ""} onClick={() => { setLoading(true); setError(""); setKind("confession"); }}><strong>Anonim dertleşme</strong><small>İsmin görünmeden</small></button>
      </div>

      {kind === "live" && visibleTopics.length > 0 && <section className="pulse-topics" aria-label="Kampüs gündemi"><span>ŞİMDİ KONUŞULANLAR</span><div>{visibleTopics.map((topic) => <b key={topic.topic}>{topic.topic.startsWith("#") ? topic.topic : categoryNames[topic.topic] ?? topic.topic}<small>{topic.score}</small></b>)}</div></section>}
      {error && <p className="feature-feedback-state" role="alert">{error}</p>}

      {loading ? <div className="pulse-empty"><strong>Kampüs akışı hazırlanıyor…</strong></div> : items.length === 0 ? <div className="pulse-empty"><span>{kind === "live" ? "ŞİMDİ" : "ANONİM"}</span><strong>{kind === "live" ? "Henüz güncel kampüs paylaşımı yok" : "Henüz anonim paylaşım yok"}</strong><p>İlk güvenli paylaşımı sen başlatabilirsin.</p><button type="button" onClick={() => setComposerOpen(true)}>İlk paylaşımı yap</button></div> : <div className="pulse-grid">
        {items.map((item) => <article className={`pulse-card pulse-${item.kind}`} key={item.id}>
          <header><span className="pulse-avatar">{item.anonymous ? "A" : item.authorName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span><div><strong>{item.authorName}</strong><small>{item.time} önce{item.campusZone ? ` · ${item.campusZone}` : ""}</small></div><b>{categoryNames[item.category] ?? item.category}</b></header>
          <p>{item.content}</p>
          <footer>
            <div>{item.kind === "confession" ? <button className={item.viewerReaction === "support" ? "active" : ""} type="button" onClick={() => void react(item, "support")}>Destek ol <span>{item.supportCount}</span></button> : <><button className={item.viewerReaction === "confirm" ? "active" : ""} type="button" onClick={() => void react(item, "confirm")}>Güncel <span>{item.confirmCount}</span></button><button className={item.viewerReaction === "outdated" ? "active warning" : ""} type="button" onClick={() => void react(item, "outdated")}>Güncel değil <span>{item.outdatedCount}</span></button></>}</div>
            <div><span>{remainingLabel(item.expiresAt)}</span>{item.own ? <button type="button" onClick={() => void remove(item)}>Sil</button> : <button type="button" onClick={() => { setReporting(item); setReportState(""); }}>Şikâyet</button>}</div>
          </footer>
        </article>)}
      </div>}

      {composerOpen && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !publishing) setComposerOpen(false); }}><section className="feature-dialog pulse-dialog" role="dialog" aria-modal="true" aria-labelledby="pulse-compose-title"><header><div><span>{kind === "live" ? "KAMPÜS BİLGİSİ" : "ANONİM VE GÜVENLİ"}</span><h2 id="pulse-compose-title">{kind === "live" ? "Kampüste ne oluyor?" : "İçinden geçeni paylaş"}</h2></div><button type="button" onClick={() => setComposerOpen(false)} disabled={publishing} aria-label="Pencereyi kapat">×</button></header><form onSubmit={publish}>
        <div className="pulse-form-row"><label>Kategori<select name="category" defaultValue="general">{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Kampüs bölgesi<input name="campusZone" maxLength={80} placeholder="Örn. Merkez yemekhane"/></label></div>
        <label>Paylaşım<textarea name="content" minLength={12} maxLength={800} rows={5} required placeholder={kind === "live" ? "Ne oldu, nerede ve ne kadar güncel? #etiket ekleyebilirsin" : "İsmin gösterilmeden ne paylaşmak istersin?"}/></label>
        {kind === "live" ? <label>Ne kadar görünür kalsın?<select name="durationHours" defaultValue="6"><option value="1">1 saat</option><option value="3">3 saat</option><option value="6">6 saat</option><option value="12">12 saat</option><option value="24">24 saat</option></select></label> : <p className="pulse-privacy-note"><strong>Kimliğin diğer öğrencilere gösterilmez.</strong> Taciz, tehdit veya yasa dışı içerik durumunda moderasyon hesabı inceleyebilir.</p>}
        <footer><button type="button" onClick={() => setComposerOpen(false)} disabled={publishing}>Vazgeç</button><button className="feature-primary" type="submit" disabled={publishing}>{publishing ? "Yayınlanıyor…" : "Paylaş"}</button></footer>
      </form></section></div>}

      {reporting && <div className="feature-overlay" role="presentation"><section className="feature-dialog pulse-dialog" role="dialog" aria-modal="true" aria-labelledby="pulse-report-title"><header><div><span>GÜVENLİK MERKEZİ</span><h2 id="pulse-report-title">Paylaşımı şikâyet et</h2></div><button type="button" onClick={() => setReporting(null)} aria-label="Pencereyi kapat">×</button></header><form onSubmit={report}>
        <label>Neden<select name="reason" defaultValue="harassment"><option value="harassment">Taciz veya zorbalık</option><option value="spam">Spam</option><option value="privacy">Kişisel veri</option><option value="misinformation">Yanıltıcı kampüs bilgisi</option><option value="other">Diğer</option></select></label>
        <label>Açıklama<textarea name="details" maxLength={800} rows={4} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label>
        {reportState && <p className="feature-feedback-state" role="status">{reportState}</p>}
        <footer><button type="button" onClick={() => setReporting(null)}>Kapat</button><button className="feature-danger" type="submit">Şikâyeti gönder</button></footer>
      </form></section></div>}
    </div>
  );
}
