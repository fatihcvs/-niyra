"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { ArrowsOut } from "@phosphor-icons/react/dist/csr/ArrowsOut";
import type { PostMedia } from "../lib/post-media";
import { observeMediaPlayback } from "../lib/media-lifecycle";
import { PostMediaView } from "./post-media-view";
import { useAppLayer } from "./use-app-layer";
import styles from "./post-media-gallery.module.css";

export function PostMediaGallery({ media, description }: { media: PostMedia[]; description: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const last = useRef(0);
  const inline = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  if (selected !== null && selected >= media.length) setSelected(media.length ? media.length - 1 : null);
  const opened = selected === null ? null : media[selected];
  const { ref: layerRef, close: closeLayer } = useAppLayer({ id: `post.media:${media[0]?.id}`, open: Boolean(opened), onClose: () => setSelected(null), onRestore: () => open(Math.min(last.current, media.length - 1)) });
  const contentKey = media.map((item) => `${item.id}:${item.url}`).join("|");
  useEffect(() => { if (inline.current) return observeMediaPlayback(inline.current); }, [contentKey]);
  useEffect(() => { if (opened && layerRef.current) return observeMediaPlayback(layerRef.current); }, [opened, layerRef]);
  function open(index: number) {
    if (!media[index]) return;
    setPortalHost(inline.current?.closest<HTMLDialogElement>("dialog[open]") ?? document.body);
    for (const video of inline.current?.querySelectorAll<HTMLVideoElement>("video") ?? []) if (!video.paused) video.pause();
    last.current = index; setSelected(index);
  }
  function move(delta: number) { if (selected === null) return; const next = Math.max(0, Math.min(media.length - 1, selected + delta)); last.current = next; setSelected(next); }
  return <div ref={inline} className={styles.gallery}>
    {media.map((item, index) => <div key={`${item.id}:${item.url}`} className={styles.item}><PostMediaView media={item} description={description} onOpen={item.kind === "image" ? () => open(index) : undefined}/>{item.kind === "video" && <button type="button" className={styles.expand} aria-label="Videoyu büyük aç" onClick={() => open(index)}><ArrowsOut size={20}/></button>}</div>)}
    {opened && portalHost && createPortal(<div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeLayer(); }}><section ref={layerRef} className={styles.viewer} role="dialog" aria-modal="true" aria-label="Gönderi medyası" onKeyDown={(event) => { if ((event.target as HTMLElement).tagName === "VIDEO") return; if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); move(-1); } if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); move(1); } }}>
      <header><span aria-live="polite">{selected! + 1} / {media.length}</span><button type="button" aria-label="Medyayı kapat" onClick={() => closeLayer()}><X size={26}/></button></header>
      <div className={styles.stage} onTouchStart={(event) => { const touch = event.touches[0]; swipe.current = opened.kind === "image" && event.touches.length === 1 && touch.clientX > 24 && touch.clientX < window.innerWidth - 24 ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchMove={(event) => { if (event.touches.length !== 1) swipe.current = null; }} onTouchEnd={(event) => { const start = swipe.current; swipe.current = null; const end = event.changedTouches[0]; if (!start || !end) return; const dx = end.clientX - start.x, dy = end.clientY - start.y; if (Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * .7) move(dx < 0 ? 1 : -1); }}><PostMediaView key={`${opened.id}:${opened.url}`} media={opened} description={description}/></div>
      {media.length > 1 && <footer><button type="button" aria-label="Önceki medya" disabled={selected === 0} onClick={() => move(-1)}><ArrowLeft size={24}/></button><button type="button" aria-label="Sonraki medya" disabled={selected === media.length - 1} onClick={() => move(1)}><ArrowRight size={24}/></button></footer>}
    </section></div>, portalHost)}
  </div>;
}
