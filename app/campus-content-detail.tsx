"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAppNavigation, AppLink } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import { useContentTarget, clearContentTarget } from "./use-content-target";
import { useScopedRequests } from "./use-scoped-requests";
import { Button, IconButton, InlineError, Skeleton } from "./ui-primitives";
import { UiIcon } from "./ui-icon";
import { campusEventTime, listingPrice, type CampusContent, type CampusListing } from "../lib/campus-content";
import styles from "./campus-content-detail.module.css";

export function CampusContentDetail({ kind, onContact }: { kind: "event" | "listing"; onContact?: (listing: CampusListing) => void }) {
  const navigation = useAppNavigation();
  const view = kind === "listing" ? "market" : "campus";
  const id = useContentTarget(kind, view);
  return id ? <ContentDialog key={`${navigation?.ownerScope ?? ""}:${kind}:${id}`} kind={kind} id={id} view={view} onContact={onContact}/> : null;
}

function ContentDialog({ kind, id, view, onContact }: { kind: "event" | "listing"; id: string; view: string; onContact?: (listing: CampusListing) => void }) {
  const requests = useScopedRequests();
  const [content, setContent] = useState<CampusContent | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const { ref, close } = useAppLayer({ id: `campus-content:${kind}:${id}`, open: true, history: "route", onClose: () => clearContentTarget(kind, id, view) });
  useEffect(() => {
    const controller = new AbortController();
    void requests.json<{ content?: CampusContent; error?: string }>(`/api/campus-content?kind=${kind}&id=${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }, "İçerik getirilemedi.")
      .then((data) => { if (!controller.signal.aborted && requests.isActive()) {
        if (data.content?.kind !== kind || data.content.item.id !== id) throw new Error("İçerik getirilemedi.");
        setContent(data.content);
      } }).catch((cause: unknown) => { if (!controller.signal.aborted && requests.isActive()) setError(cause instanceof Error ? cause.message : "İçerik getirilemedi."); });
    return () => controller.abort();
  }, [id, kind, requests, revision]);
  return <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="campus-content-title" data-mobile-overlay="true">
      <header className={styles.header}><h2 id="campus-content-title">{kind === "listing" ? "İlan ayrıntısı" : "Etkinlik ayrıntısı"}</h2><IconButton label="Ayrıntıyı kapat" onClick={close}><UiIcon name="close"/></IconButton></header>
      <div className={styles.body}>{error ? <InlineError message={error} onRetry={() => { setError(""); setContent(null); setRevision((value) => value + 1); }}/> : !content ? <Skeleton label="İçerik yükleniyor" shape="card"/> : <>
        {content.kind === "listing" && content.item.images.length > 0 && <div className={styles.gallery} aria-label="İlan fotoğrafları">{content.item.images.map((image, index) => <figure key={image.id}><Image src={image.url} alt={`${content.item.title}, ${index + 1}. fotoğraf`} width={720} height={540} unoptimized/><figcaption>{index + 1} / {content.item.images.length}</figcaption></figure>)}</div>}
        <h3>{content.item.title}</h3><AppLink href={`/?profile=${encodeURIComponent(content.item.ownerId)}`}>{content.item.ownerName}</AppLink>
        {content.kind === "listing" ? <><strong className={styles.price}>{listingPrice(content.item.priceCents)}</strong><p>{content.item.description}</p><dl><dt>Teslim noktası</dt><dd>{content.item.meetupPlace || "Birlikte kararlaştırılır"}</dd><dt>İlan durumu</dt><dd>{{ active: "Aktif", reserved: "Rezerve", sold: "Satıldı", closed: "Kapalı" }[content.item.status] ?? "Durum belirtilmedi"}</dd></dl>{!content.item.own && onContact && <Button tone="primary" disabled={content.item.status !== "active"} onClick={() => onContact(content.item)}>{content.item.status === "reserved" ? "Rezerve" : "İlan sahibine mesaj gönder"}</Button>}</> : <><p>{content.item.description}</p><dl><dt>Başlangıç</dt><dd><time dateTime={content.item.startsAt}>{campusEventTime(content.item.startsAt)}</time></dd>{content.item.endsAt && <><dt>Bitiş</dt><dd><time dateTime={content.item.endsAt}>{campusEventTime(content.item.endsAt)}</time></dd></>}<dt>Yer</dt><dd>{content.item.placeName || "Mekân belirtilmedi"}</dd></dl><small>Tüm saatler Türkiye saatidir.</small></>}
      </>}</div>
    </section>
  </div>;
}
