"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ImageBroken } from "@phosphor-icons/react/dist/csr/ImageBroken";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import type { PostMedia } from "../lib/post-media";

// Authenticated media must reach the native image element without a remote-image adapter.
const directMediaSource = ({ src }: { src:string }) => src;

export function PostMediaView({ media, description, onOpen }: { media:PostMedia; description:string; onOpen?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const dimensions = media;
  const ratio = dimensions.width && dimensions.height ? dimensions.width / dimensions.height : media.kind === "video" ? 16 / 9 : 4 / 3;
  const reservedRatio = Math.max(.8, Math.min(16 / 9, ratio));
  const imageMaxWidth = dimensions.width || naturalWidth;
  // A cached failure can complete before React attaches its error listener.
  const inspectImage = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0 && image.getAttribute("src")) setFailed(true);
    if (image?.complete && image.naturalWidth === 1 && image.naturalHeight === 1) { setEmpty(true); setFailed(true); }
    if (image?.complete && image.naturalWidth > 1) setNaturalWidth(image.naturalWidth);
  }, []);
  return <div style={{ aspectRatio: reservedRatio }} className={`post-media post-media-${media.kind}${failed ? " post-media-unavailable" : ""}`}>
    {failed ? <div className="post-media-fallback" role="status"><ImageBroken size={28} aria-hidden="true"/><div><strong>{empty ? "Görsel görüntülenemiyor" : media.kind === "image" ? "Görsel yüklenemedi" : "Video yüklenemedi"}</strong><span>{empty ? "Bu dosyada görüntülenebilir bir fotoğraf bulunmuyor." : "Bağlantını kontrol edip yeniden deneyebilirsin."}</span></div><button type="button" onClick={() => { setAttempt((value) => value + 1); setFailed(false); setEmpty(false); }} aria-label="Medyayı yeniden yükle"><ArrowClockwise size={20}/></button></div> : media.kind === "image" ? (onOpen ? <button type="button" className="post-media-open" aria-label="Fotoğrafı büyük aç" onClick={onOpen}><Image key={attempt} ref={inspectImage} onLoad={(event) => inspectImage(event.currentTarget)} loader={directMediaSource} src={media.url} style={imageMaxWidth ? { maxWidth: `min(100%, ${imageMaxWidth}px)` } : undefined} alt={description} width={900} height={900} sizes="(max-width: 780px) 100vw, 650px" unoptimized onError={() => setFailed(true)}/></button> : <Image key={attempt} ref={inspectImage} onLoad={(event) => inspectImage(event.currentTarget)} loader={directMediaSource} src={media.url} style={imageMaxWidth ? { maxWidth: `min(100%, ${imageMaxWidth}px)` } : undefined} alt={description} width={900} height={900} sizes="(max-width: 780px) 100vw, 650px" unoptimized onError={() => setFailed(true)}/>) : <video key={attempt} src={media.url} controls playsInline preload="metadata" aria-label={description} onError={() => setFailed(true)}/>}
  </div>;
}
