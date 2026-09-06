"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { useAppLayer } from "./use-app-layer";
import { useAppNavigation } from "./app-navigation";
import { useWorkspaceState } from "./use-workspace-state";
import { useHousingRequests } from "./use-housing-requests";
import styles from "./housing-community.module.css";

export type StudentHousingPlace = { id: string; name: string; description: string; address: string; latitude: number | null; longitude: number | null; coordinatesKnown: boolean; own: boolean; updatedTime: string };
type HousingMessage = { id: string; content: string; anonymous: boolean; authorName: string; authorHandle?: string | null; own: boolean; time: string };
type Draft = { content: string; anonymous: boolean };
type Props = { places: StudentHousingPlace[]; requestedPlaceId?: string; onAdd: () => void; onArchived: (id: string) => void; nearbyPlaces?: Array<{ id: string; name: string; address: string; campusName: string }>; onOpenNearby?: (id: string) => void };

export function HousingCommunity(props: Props) {
  const owner = useAppNavigation()?.ownerScope ?? "";
  return <HousingCommunityContent key={owner} {...props}/>;
}

function HousingCommunityContent({ places, requestedPlaceId = "", onAdd, onArchived, nearbyPlaces = [], onOpenNearby }: Props) {
  const { json, capture } = useHousingRequests();
  const [selectedId, setSelectedId] = useState(requestedPlaceId);
  const [seenRequest, setSeenRequest] = useState(requestedPlaceId);
  const [detailOpen, setDetailOpen] = useState(Boolean(requestedPlaceId));
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const lastDelete = useRef("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedId, setArchivedId] = useState("");
  const archiveVisible = useRef(false);
  const [drafts, setDrafts] = useWorkspaceState<Record<string, Draft>>("housing:experience-drafts", {});
  const [result, setResult] = useState<{ key: string; messages: HousingMessage[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(null);
  const [formError, setFormError] = useState<{ id: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ id: string; controller: AbortController } | null>(null);
  const [retry, setRetry] = useState(0);
  if (seenRequest !== requestedPlaceId) { setSeenRequest(requestedPlaceId); if (requestedPlaceId) { setSelectedId(requestedPlaceId); setDetailOpen(true); } }
  const selected = places.find((place) => place.id === selectedId) ?? null;
  const key = `${selectedId}:${retry}`;
  const messages = result?.key === key ? result.messages : null;
  const error = failure?.key === key ? failure.message : "";
  const draft = drafts[selectedId] ?? { content: "", anonymous: false };
  const feedback = formError?.id === selectedId ? formError.message : "";
  const success = notice?.id === selectedId ? notice.message : "";
  const { ref: detailRef, close: closeDetail } = useAppLayer({ id: "housing.student-detail", open: Boolean(detailOpen && selected), onClose: () => { setDetailOpen(false); setFormOpen(false); setDeleteId(""); setArchiveOpen(false); }, onRestore: () => setDetailOpen(true) });
  const { ref: formRef, close: closeForm } = useAppLayer({ id: "housing.experience-create", open: Boolean(detailOpen && selected && formOpen), busy, onClose: () => setFormOpen(false), onRestore: () => setFormOpen(true) });
  const { ref: deleteRef, close: closeDelete } = useAppLayer({ id: "housing.experience-delete", open: Boolean(detailOpen && selected && deleteId), busy, onClose: () => setDeleteId(""), onRestore: () => setDeleteId(lastDelete.current) });
  const { ref: archiveRef, close: closeArchive } = useAppLayer({ id: "housing.student-archive", open: Boolean(detailOpen && selected?.own && archiveOpen), busy, onClose: () => { setArchiveOpen(false); if (archivedId) { setDetailOpen(false); onArchived(archivedId); setArchivedId(""); } }, onRestore: () => setArchiveOpen(true) });
  useEffect(() => { archiveVisible.current = archiveOpen; }, [archiveOpen]);

  useEffect(() => {
    if (!selectedId || !detailOpen || !selected) return;
    const controller = new AbortController(), check = capture();
    request.current = { id: selectedId, controller };
    void json<{ place: { id: string }; messages: HousingMessage[] }>(`/api/housing?placeId=${encodeURIComponent(selectedId)}`, { signal: controller.signal, cache: "no-store" }, "Deneyimler getirilemedi.").then((data) => {
      if (data.place?.id !== selectedId || !Array.isArray(data.messages)) throw new Error("Deneyim yanıtı seçilen konaklamayla eşleşmedi.");
      if (!controller.signal.aborted && check.isCurrent()) { setResult({ key, messages: data.messages }); setFailure(null); }
    }).catch((cause) => { if (!controller.signal.aborted && check.isCurrent()) setFailure({ key, message: cause instanceof Error ? cause.message : "Deneyimler getirilemedi." }); });
    return () => controller.abort();
  }, [selectedId, selected, detailOpen, key, json, capture]);

  function choose(id: string) { setSelectedId(id); setDetailOpen(true); setFormOpen(false); setDeleteId(""); setArchiveOpen(false); }
  function editDraft(values: Partial<Draft>) { setDrafts((current) => ({ ...current, [selectedId]: { ...(current[selectedId] ?? { content: "", anonymous: false }), ...values } })); setFormError(null); }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending.current) return;
    if (draft.content.trim().length < 3) { setFormError({ id: selectedId, message: "En az 3 karakterlik bir deneyim yaz." }); event.currentTarget.querySelector("textarea")?.focus(); return; }
    const id = selectedId, submitted = { ...draft }, targetKey = key, check = capture();
    pending.current = true; setBusy(true); setFormError(null); setNotice(null);
    try {
      const data = await json<{ message: HousingMessage }>("/api/housing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ placeId: id, content: submitted.content, anonymous: submitted.anonymous }) }, "Deneyim paylaşılamadı.");
      if (!check.isCurrent()) return;
      if (!data.message?.id || data.message.own !== true || typeof data.message.content !== "string") throw new Error("Paylaşım kaydı doğrulanamadı. Güncel deneyimleri kontrol et.");
      if (request.current?.id === id) request.current.controller.abort();
      setResult((current) => current?.key === targetKey ? { key: targetKey, messages: [data.message, ...current.messages.filter((message) => message.id !== data.message.id)] } : current);
      setDrafts((current) => { if (current[id]?.content !== submitted.content || current[id]?.anonymous !== submitted.anonymous) return current; const next = { ...current }; delete next[id]; return next; });
      setNotice({ id, message: "Deneyimin paylaşıldı." });
    } catch (cause) { if (check.isCurrent()) setFormError({ id, message: cause instanceof Error ? cause.message : "Deneyim paylaşılamadı." }); }
    finally { if (check.isCurrent()) { pending.current = false; setBusy(false); } }
  }
  async function remove() {
    if (!selected || !deleteId || !messages?.some((message) => message.id === deleteId && message.own) || pending.current) return;
    const id = deleteId, placeId = selectedId, targetKey = key, check = capture();
    pending.current = true; setBusy(true); setFormError(null); setNotice(null);
    try {
      const data = await json<{ deleted: boolean; id: string }>("/api/housing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }, "Deneyim silinemedi.");
      if (!check.isCurrent()) return;
      if (data.deleted !== true || data.id !== id) throw new Error("Silme sonucu doğrulanamadı. Güncel deneyimleri kontrol et.");
      if (request.current?.id === placeId) request.current.controller.abort();
      setResult((current) => current?.key === targetKey ? { ...current, messages: current.messages.filter((message) => message.id !== id) } : current);
      setNotice({ id: placeId, message: "Deneyimin silindi." });
    } catch (cause) { if (check.isCurrent()) setFormError({ id: placeId, message: cause instanceof Error ? cause.message : "Deneyim silinemedi." }); }
    finally { if (check.isCurrent()) { pending.current = false; setBusy(false); } }
  }
  async function archive() {
    if (!selected?.own || pending.current) return;
    const id = selected.id, check = capture();
    pending.current = true; setBusy(true); setFormError(null);
    try {
      const data = await json<{ archived: boolean }>("/api/campus-guide", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive-place", id }) }, "Konaklama arşivlenemedi.");
      if (!check.isCurrent()) return;
      if (data.archived !== true) throw new Error("Arşivleme sonucu doğrulanamadı.");
      setNotice({ id, message: "Konaklama kaydı arşivlendi." });
      if (archiveVisible.current) setArchivedId(id);
      else { setDetailOpen(false); onArchived(id); }
    } catch (cause) { if (check.isCurrent()) setFormError({ id, message: cause instanceof Error ? cause.message : "Konaklama arşivlenemedi." }); }
    finally { if (check.isCurrent()) { pending.current = false; setBusy(false); } }
  }
  const status = <>{feedback && <p className={styles.error} role="alert">{feedback}</p>}{success && <p className={styles.success} role="status">{success}</p>}</>;
  const sourceNotice = <p className={styles.context}>Öğrencilerin eklediği kampüs kayıtlarıdır. Yukarıdaki kaynak kataloğundan ayrı deneyim alanlarıdır; kurum onayı veya boş oda bilgisi değildir.</p>;
  return <section className={`housing-community-section ${styles.community}`}>
    <header className={styles.heading}><div><h2>Öğrenci kayıtları ve deneyimler</h2><p>{places.length} konaklama kaydı</p></div><button type="button" onClick={onAdd}><Plus size={20}/> Konaklama ekle</button></header>{sourceNotice}
    {places.length ? <div className={`housing-place-list ${styles.list}`}>{places.map((place) => <button type="button" key={place.id} aria-haspopup="dialog" onClick={() => choose(place.id)}><House size={24}/><span><strong>{place.name}</strong><small>{place.address || "Adres bilgisi eklenmedi"}</small></span><span aria-hidden="true">›</span></button>)}</div> : <div className="campus-guide-empty housing-empty"><strong>Henüz öğrenci konaklama kaydı yok</strong><p>Bildiğin gerçek bir konaklamayı ekleyebilirsin.</p><button type="button" onClick={onAdd}>İlk konaklamayı ekle</button></div>}
    {nearbyPlaces.length > 0 && <section className="housing-nearby"><header><h3>Kampüs çevresindeki noktalar</h3><small>Yurda kesin mesafe iddiası değildir</small></header><div>{nearbyPlaces.map((place) => <button key={place.id} type="button" onClick={() => onOpenNearby?.(place.id)}><strong>{place.name}</strong><small>{place.address || place.campusName || "Kampüs kaydı"}</small></button>)}</div></section>}
    {selected && detailOpen && <div className={styles.overlay}><section ref={detailRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="housing-student-title"><header><button type="button" onClick={closeDetail} aria-label="Öğrenci konaklama listesine dön"><ArrowLeft size={24}/></button><div><small>ÖĞRENCİ KONAKLAMA KAYDI</small><h2 id="housing-student-title">{selected.name}</h2></div></header><div className={`housing-detail ${styles.body}`}><section className="housing-hero"><p>{selected.description}</p><p>{selected.address || "Adres bilgisi eklenmedi"}</p>{selected.coordinatesKnown && selected.latitude !== null && selected.longitude !== null && <a href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=18/${selected.latitude}/${selected.longitude}`} target="_blank" rel="noreferrer">Haritada aç ↗</a>}</section><section className="housing-safety"><strong>Güvenli karar ver</strong><p>Telefon, kişisel adres veya ödeme bağlantısı paylaşma. Kapora göndermeden önce yeri ve yetkili kişiyi yüz yüze doğrula.</p></section><section className={`housing-discussion ${styles.discussion}`}><header><div><h3>Öğrenci deneyimleri</h3><small>{messages ? `${messages.length} paylaşım gösteriliyor` : ""}</small></div><button type="button" disabled={busy || !messages || Boolean(error)} onClick={() => { setFormOpen(true); setFormError(null); setNotice(null); }}>Deneyimini paylaş</button></header>{!formOpen && !deleteId && !archiveOpen && status}{error ? <div role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)}>Deneyimleri yeniden dene</button></div> : !messages ? <p role="status">Deneyimler yükleniyor…</p> : messages.length === 0 ? <p>Henüz deneyim paylaşılmadı.</p> : <div className="housing-message-list">{messages.map((message) => <article key={message.id}><div><header><strong>{message.authorName}</strong><small>{message.time === "şimdi" ? "şimdi" : `${message.time} önce`}</small></header><p>{message.content}</p>{message.own && <button type="button" disabled={busy} onClick={() => { lastDelete.current = message.id; setDeleteId(message.id); setFormError(null); setNotice(null); }}>Deneyimimi sil</button>}</div></article>)}</div>}</section>{selected.own && <button type="button" disabled={busy} onClick={() => { setArchiveOpen(true); setFormError(null); setNotice(null); }}>Kaydı arşivle</button>}</div></section></div>}
    {selected && detailOpen && formOpen && <div className={styles.overlay}><section ref={formRef} className={`${styles.panel} ${styles.formPanel}`} role="dialog" aria-modal="true" aria-labelledby="housing-experience-title"><header><button type="button" disabled={busy} onClick={closeForm} aria-label="Deneyim formunu kapat"><ArrowLeft size={24}/></button><div><h2 id="housing-experience-title">Deneyimini paylaş</h2><small>{selected.name}</small></div></header><form className={styles.body} onSubmit={publish}><label>Deneyimin<textarea name="content" value={draft.content} onChange={(event) => editDraft({ content: event.target.value })} disabled={busy} minLength={3} maxLength={600} rows={5} required placeholder="Ulaşım, çalışma ortamı ve günlük yaşam hakkında bildiğini paylaş…"/></label><label className={styles.checkbox}><input name="anonymous" type="checkbox" checked={draft.anonymous} disabled={busy} onChange={(event) => editDraft({ anonymous: event.target.checked })}/> Anonim paylaş</label><p className={styles.context}>Paylaşımda görünen adın gizlenir. Moderasyon için hesabın sunucuda kayıtla ilişkilidir.</p>{status}<button className={styles.primary} type="submit" disabled={busy || Boolean(success)}>{busy ? "Paylaşılıyor…" : "Deneyimi paylaş"}</button></form></section></div>}
    {selected && detailOpen && deleteId && <div className={styles.overlay}><section ref={deleteRef} className={`${styles.panel} ${styles.formPanel}`} role="dialog" aria-modal="true" aria-labelledby="housing-delete-title"><header><button type="button" disabled={busy} onClick={closeDelete} aria-label="Silme penceresini kapat"><ArrowLeft size={24}/></button><h2 id="housing-delete-title">Deneyimini sil</h2></header><div className={styles.body}><p>Yalnızca kendi deneyimin görünür listeden kaldırılacak.</p>{status}<button className={styles.primary} type="button" disabled={busy || Boolean(success)} onClick={() => void remove()}>{busy ? "Siliniyor…" : "Deneyimimi sil"}</button></div></section></div>}
    {selected?.own && detailOpen && archiveOpen && <div className={styles.overlay}><section ref={archiveRef} className={`${styles.panel} ${styles.formPanel}`} role="dialog" aria-modal="true" aria-labelledby="housing-archive-title"><header><button type="button" disabled={busy} onClick={closeArchive} aria-label="Arşivleme penceresini kapat"><ArrowLeft size={24}/></button><h2 id="housing-archive-title">Konaklama kaydını arşivle</h2></header><div className={styles.body}><p>{selected.name} öğrenci kayıtları listesinden kaldırılacak.</p>{status}<button className={styles.primary} type="button" disabled={busy || Boolean(success)} onClick={() => void archive()}>{busy ? "Arşivleniyor…" : "Kaydı arşivle"}</button></div></section></div>}
  </section>;
}
