"use client";

import { type ReactNode, useId } from "react";
import { Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { Storefront } from "@phosphor-icons/react/dist/csr/Storefront";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Lightning } from "@phosphor-icons/react/dist/csr/Lightning";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { X } from "@phosphor-icons/react/dist/csr/X";

const sectionIcons = { Keşfet: Compass, Notlar: BookOpen, Kütüphane: BookOpen, Topluluklar: UsersThree, Eşleş: UsersThree, Bildirimler: Bell, Kaydedilenler: BookmarkSimple, Güvenlik: ShieldCheck, Ayarlar: SlidersHorizontal, Pazar: Storefront, Kampüs: MapPin, "Kampüs Anlık": Lightning };

export function WorkspaceHeader({ section, eyebrow, title, description, actions }: { section: string; eyebrow?: string; title?: string; description: string; actions?: ReactNode }) {
  const SectionIcon = sectionIcons[section as keyof typeof sectionIcons] ?? Compass;
  return <header className="workspace-header"><div className="workspace-heading-row"><span className="workspace-section-icon"><SectionIcon size={25} weight="duotone"/></span><div>{eyebrow && <span className="workspace-eyebrow">{eyebrow}</span>}<h1>{title ?? section}</h1></div>{actions && <div className="workspace-header-actions">{actions}</div>}</div><p>{description}</p></header>;
}

export function WorkspaceSearch({ value, onChange, placeholder, children, resultCount, onReset }: { value: string; onChange: (value: string) => void; placeholder: string; children?: ReactNode; resultCount?: number; onReset?: () => void }) {
  const id = useId();
  return <section className="workspace-tools" aria-label="Arama ve filtreler"><div className="workspace-tools-row"><div className="workspace-search"><label className="sr-only" htmlFor={id}>{placeholder}</label><MagnifyingGlass size={19}/><input id={id} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/>{value && <button type="button" onClick={() => onChange("")} aria-label="Aramayı temizle"><X size={17}/></button>}</div>{children}</div>{resultCount !== undefined && <div className="workspace-result-summary" role="status"><span><strong>{resultCount}</strong> sonuç{value ? ` · “${value}”` : ""}</span>{onReset && <button type="button" onClick={onReset}>Filtreleri temizle</button>}</div>}</section>;
}

export function WorkspaceEmpty({ title = "Eşleşen sonuç yok", description = "Aramanı veya filtrelerini değiştirerek yeniden deneyebilirsin.", action, error = false }: { title?: string; description?: string; action?: ReactNode; error?: boolean }) {
  return <div className={`workspace-state${error ? " is-error" : ""}`} role={error ? "alert" : "status"}><span>{error ? <ArrowClockwise size={28}/> : <MagnifyingGlass size={28}/>}</span><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function RefreshButton({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  return <button className="workspace-refresh" type="button" onClick={onClick} disabled={busy} aria-label="İçeriği yenile"><ArrowClockwise size={18}/><span>Yenile</span></button>;
}
