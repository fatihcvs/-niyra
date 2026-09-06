"use client";

import Image from "next/image";

/** Prebuilt transparent derivatives of the original mark; no runtime resize request. */
export function KampiraMark({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src={size > 42 ? "/brand/kampira-mark-256.png" : "/brand/kampira-mark-128.png"} width={size} height={size} sizes={`${size}px`} alt="" className={className} unoptimized/>;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function Avatar({ initials, className, small = false, imageUrl = null }: { initials: string; className: string; small?: boolean; imageUrl?: string | null }) {
  return <span className={`avatar ${className} ${small ? "avatar-small" : ""}`}>{initials}{imageUrl && <Image src={imageUrl} alt="" fill sizes={small ? "32px" : "72px"} unoptimized onLoad={(event) => { if (event.currentTarget.naturalWidth <= 1 && event.currentTarget.naturalHeight <= 1) event.currentTarget.hidden = true; }} onError={(event) => { event.currentTarget.hidden = true; }}/>}</span>;
}
