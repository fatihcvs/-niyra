"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import styles from "./staff-console.module.css";

export function StaffFilters({
  query,
  onQuery,
  placeholder,
  children,
  count,
  total,
  onReset,
  disabled = false,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
  count: number;
  total: number;
  onReset?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <section
      className={styles.filterPanel}
      aria-label="Liste arama ve filtreleri"
    >
      <div className={styles.filterRow}>
        <div className={styles.searchField}>
          <MagnifyingGlass size={19} />
          <label className={styles.srOnly} htmlFor={id}>
            {placeholder}
          </label>
          <input
            disabled={disabled}
            type="search"
            id={id}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={placeholder}
          />
          {query && (
            <button
              disabled={disabled}
              type="button"
              aria-label="Aramayı temizle"
              onClick={() => onQuery("")}
            >
              <X size={17} />
            </button>
          )}
        </div>
        {children}
      </div>
      <div className={styles.resultLine}>
        <span role="status">
          <strong>{count}</strong> sonuç · {total} yüklenen kayıt içinde
        </span>
        {onReset && (
          <button disabled={disabled} type="button" onClick={onReset}>
            Filtreleri temizle
          </button>
        )}
      </div>
    </section>
  );
}

export function StaffPagination({
  page,
  pages,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (!total) return null;
  return (
    <nav className={styles.pagination} aria-label="Liste sayfaları">
      <span>
        {from}–{to} / {total}
      </span>
      <div>
        <button
          type="button"
          disabled={page <= 1}
          aria-label="Önceki sayfa"
          onClick={() => onPage(page - 1)}
        >
          <ArrowLeft size={17} />
        </button>
        <strong>
          {page} / {pages}
        </strong>
        <button
          type="button"
          disabled={page >= pages}
          aria-label="Sonraki sayfa"
          onClick={() => onPage(page + 1)}
        >
          <ArrowRight size={17} />
        </button>
      </div>
    </nav>
  );
}

export function StaffDialog({
  title,
  description,
  children,
  submitLabel,
  onSubmit,
  onClose,
  danger = false,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  submitLabel: string;
  onSubmit: () => Promise<void>;
  onClose: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.actionDialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span>YÖNETİM İŞLEMİ</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Pencereyi kapat"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <p>{description}</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (running.current) return;
          running.current = true;
          setBusy(true);
          setError("");
          try {
            await onSubmit();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "İşlem tamamlanamadı.",
            );
          } finally {
            running.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className={styles.dialogFields}>
          {children}
        </fieldset>
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={busy}
            className={danger ? styles.dangerSolid : styles.primaryAction}
          >
            {busy ? "İşlem uygulanıyor…" : submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function StaffEmpty({
  title = "Eşleşen kayıt yok",
  detail = "Aramanı veya filtrelerini değiştirerek yeniden deneyebilirsin.",
  action,
}: {
  title?: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.emptyState} role="status">
      <MagnifyingGlass size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
