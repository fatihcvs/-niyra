"use client";

import { Children, type ReactNode, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAppNavigation } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import filterStyles from "./workspace-filters.module.css";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";

import { workspaceCapabilities, ownsWorkspaceMobileHeader, type WorkspaceScreenId } from "../lib/workspace-capabilities";
import { Badge, Button, EmptyState, IconButton } from "./ui-primitives";
import { UiIcon } from "./ui-icon";
export { ownsWorkspaceMobileHeader } from "../lib/workspace-capabilities";

export type WorkspaceHeaderAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void | Promise<unknown>;
};

type WorkspaceHeaderProps = {
  screenId: WorkspaceScreenId;
  section: string;
  eyebrow?: string;
  title?: string;
  mobileTitle?: string;
  description: string;
  primaryAction?: WorkspaceHeaderAction | null;
  secondaryActions?: readonly WorkspaceHeaderAction[];
};

function HeaderActionButton({ action, primary = false }: { action: WorkspaceHeaderAction; primary?: boolean }) {
  return <Button tone={primary ? "primary" : "default"} className={primary ? "feature-primary" : undefined} type="button" data-action-id={action.id} data-has-icon={Boolean(action.icon)} aria-label={action.label} busy={action.busy} disabled={action.disabled} onClick={() => { void action.onPress(); }}>{action.icon && <span className="workspace-action-icon" aria-hidden="true">{action.icon}</span>}<span className="workspace-action-label">{action.label}</span></Button>;
}

export function WorkspaceHeader({ screenId, section, eyebrow, title, mobileTitle, description, primaryAction, secondaryActions }: WorkspaceHeaderProps) {
  const navigation = useAppNavigation();
  const capability = workspaceCapabilities[screenId];
  const [moreOpen, setMoreOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const primary = primaryAction && <HeaderActionButton action={primaryAction} primary/>;
  const secondary = (secondaryActions ?? []).map((action) => <HeaderActionButton action={action} key={action.id}/>);
  const menuOpen = moreOpen && secondary.length > 0;
  const mobileOwner = ownsWorkspaceMobileHeader(screenId) ? "workspace" : capability.headerOwner === "shell" ? "shell" : "standalone";
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMoreOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMoreOpen(false); moreButtonRef.current?.focus(); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);
  return <header className="workspace-header" data-screen-id={screenId} data-mobile-header={mobileOwner}>
    <div className="workspace-heading-row">
      {mobileOwner === "workspace" && navigation && <IconButton className="workspace-back-button" onClick={navigation.onBack} label="Geri dön"><ArrowLeft size={24} aria-hidden="true"/></IconButton>}
      <span className="workspace-section-icon" aria-hidden="true"><UiIcon name={capability.icon} size={23} weight="duotone"/></span>
      <div className="workspace-heading-copy">{eyebrow && <span className="workspace-eyebrow">{eyebrow}</span>}<h1><span className="workspace-title-desktop">{title ?? section}</span><span className="workspace-title-mobile">{mobileTitle ?? section}</span></h1></div>
      {(primary || secondary.length > 0) && <div className="workspace-header-actions">
        {primary && <div className="workspace-header-primary">{primary}</div>}
        {secondary.length > 0 && <div className="workspace-header-secondary" ref={menuRef}>
          <IconButton className="workspace-more-toggle" ref={moreButtonRef} label={`${mobileTitle ?? section}: diğer işlemler`} aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMoreOpen((value) => !value)}><DotsThree size={24} aria-hidden="true"/></IconButton>
          <div className={`workspace-action-panel${menuOpen ? " is-open" : ""}`} id={menuId} onClick={(event) => {
            if ((event.target as HTMLElement).closest("button:not(:disabled),a[href]")) {
              setMoreOpen(false);
              // Dialog-opening actions keep ownership of their subsequent focus effect.
              moreButtonRef.current?.focus({ preventScroll: true });
            }
          }}>{secondary}</div>
        </div>}
      </div>}
    </div>
    <p>{description}</p>
  </header>;
}

const mobileFilterQuery = "(max-width: 780px)";
const mobileFilterSnapshot = () => window.matchMedia(mobileFilterQuery).matches;
const serverFilterSnapshot = () => false;

export function WorkspaceSearch({ value, onChange, placeholder, children, resultCount, onReset, filterCount = 0 }: { value: string; onChange: (value: string) => void; placeholder: string; children?: ReactNode; resultCount?: number; onReset?: () => void; filterCount?: number }) {
  const id = useId();
  const panelId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hasFilters = Children.toArray(children).length > 0;
  // An async result may remove all filters; restoring controls must not reopen a stale sheet.
  if (!hasFilters && filtersOpen) setFiltersOpen(false);
  const subscribeViewport = useCallback((changed: () => void) => {
    const media = window.matchMedia(mobileFilterQuery);
    const resize = () => {
      // Resizing never silently carries an open modal into the desktop inline layout.
      setFiltersOpen(false);
      changed();
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const isMobile = useSyncExternalStore(subscribeViewport, mobileFilterSnapshot, serverFilterSnapshot);
  const sheetOpen = isMobile && hasFilters && filtersOpen;
  const { ref: filterDialogRef, close: closeFilters } = useAppLayer({
    id: `workspace.filters:${panelId}`,
    open: sheetOpen,
    onClose: () => setFiltersOpen(false),
    onRestore: () => { if (isMobile && hasFilters) setFiltersOpen(true); },
  });
  return <section className="workspace-tools" aria-label="Arama ve filtreler">
    <div className="workspace-tools-row">
      <div className="workspace-search"><label className="sr-only" htmlFor={id}>{placeholder}</label><MagnifyingGlass size={19} aria-hidden="true"/><input id={id} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/>{value && <IconButton className="workspace-search-clear" onClick={() => onChange("")} label="Aramayı temizle"><X size={17}/></IconButton>}</div>
      {hasFilters && <>
        <button className={`workspace-filter-toggle${filterCount ? " has-filters" : ""}`} type="button" ref={toggleRef} aria-expanded={sheetOpen} aria-controls={panelId} aria-haspopup={isMobile ? "dialog" : undefined} onClick={() => { if (sheetOpen) closeFilters(); else setFiltersOpen(true); }}><SlidersHorizontal size={19} aria-hidden="true"/><span>Filtreler</span>{filterCount > 0 && <Badge tone="accent" label={`${filterCount} etkin filtre`}>{filterCount}</Badge>}</button>
        <section className={filterStyles.overlay} id={panelId} ref={filterDialogRef} hidden={isMobile && !sheetOpen} role={sheetOpen ? "dialog" : undefined} aria-modal={sheetOpen ? "true" : undefined} aria-labelledby={sheetOpen ? `${panelId}-title` : undefined} aria-describedby={sheetOpen ? `${panelId}-hint` : undefined} data-mobile-overlay={sheetOpen ? "true" : undefined} data-filter-layout={isMobile ? "mobile" : "desktop"} onClick={(event) => { if (sheetOpen && event.target === event.currentTarget) closeFilters(); }}>
          <div className={filterStyles.surface}>
            <header className={filterStyles.heading} hidden={!isMobile}><div><h2 id={`${panelId}-title`}>Filtreler</h2><p id={`${panelId}-hint`}>Seçimlerin hemen uygulanır.</p></div><IconButton onClick={closeFilters} label="Filtreleri kapat"><X size={22} aria-hidden="true"/></IconButton></header>
            <div className={`workspace-filter-panel ${filterStyles.panel}${sheetOpen ? " is-open" : ""}`} data-workspace-filter-panel="true">{children}</div>
            <footer className={filterStyles.footer} hidden={!isMobile}><div>{resultCount !== undefined && <span role="status"><strong>{resultCount}</strong> sonuç</span>}{onReset && <button className={filterStyles.reset} type="button" onClick={onReset}>Temizle</button>}</div><button className={filterStyles.done} type="button" onClick={closeFilters}>Tamam</button></footer>
          </div>
        </section>
      </>}
    </div>
    {(resultCount !== undefined || onReset) && <div className="workspace-result-summary" role="status">{resultCount !== undefined && <span><strong>{resultCount}</strong> sonuç<span className="workspace-result-query">{value ? ` · “${value}”` : ""}</span></span>}{onReset && <button type="button" onClick={onReset}>Temizle</button>}</div>}
  </section>;
}

export function WorkspaceEmpty({ title = "Eşleşen sonuç yok", description = "Aramanı veya filtrelerini değiştirerek yeniden deneyebilirsin.", action, error = false }: { title?: string; description?: string; action?: ReactNode; error?: boolean }) {
  return <EmptyState className={`workspace-state${error ? " is-error" : ""}`} title={title} description={description} error={error} action={action} icon={error ? <ArrowClockwise size={26}/> : <MagnifyingGlass size={26}/>}/>;
}

export function RefreshButton({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  return <Button className="workspace-refresh" onClick={onClick} busy={busy} aria-label="İçeriği yenile">{!busy && <ArrowClockwise size={18} aria-hidden="true"/>}<span>Yenile</span></Button>;
}
