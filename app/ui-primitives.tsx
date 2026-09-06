"use client";

import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "./ui-icon";
import { useAppLayer } from "./use-app-layer";
import styles from "./ui-primitives.module.css";

type ButtonTone = "default" | "primary" | "quiet" | "danger";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; tone?: ButtonTone };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ busy = false, tone = "default", disabled, className = "", children, type = "button", ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={`${styles.button} ${className}`} data-tone={tone} disabled={disabled || busy} aria-busy={busy || undefined}>{busy && <span className={styles.busyIcon} aria-hidden="true"><UiIcon name="refresh" size={18}/></span>}{children}</button>;
});

export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "aria-label"> & { label: string }>(function IconButton({ label, busy = false, tone = "quiet", disabled, className = "", children, type = "button", ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={`${styles.iconButton} ${className}`} data-tone={tone} aria-label={label} aria-busy={busy || undefined} disabled={disabled || busy}>{busy ? <span className={styles.busyIcon} data-icon-button-content="true" aria-hidden="true"><UiIcon name="refresh" size={22}/></span> : <span data-icon-button-content="true" aria-hidden="true">{children}</span>}</button>;
});

export function Badge({ children, label, tone = "neutral", className = "" }: { children: ReactNode; label?: string; tone?: "neutral" | "accent" | "danger"; className?: string }) {
  return <span className={`${styles.badge} ${className}`} data-tone={tone} aria-label={label}>{children}</span>;
}

export type TabItem<Value extends string> = { value: Value; label: ReactNode; disabled?: boolean; panelId?: string; count?: number };
export function Tabs<Value extends string>({ label, items, value, onChange, orientation = "horizontal", activation = "automatic", direction = "ltr", className = "" }: { label: string; items: readonly TabItem<Value>[]; value: Value; onChange: (value: Value) => void; orientation?: "horizontal" | "vertical"; activation?: "automatic" | "manual"; direction?: "ltr" | "rtl"; className?: string }) {
  const id = useId();
  const refs = useRef(new Map<Value, HTMLButtonElement>());
  const [focusState, setFocusState] = useState({ selection: value, focus: value });
  const enabled = items.filter((item) => !item.disabled);
  const selected = enabled.some((item) => item.value === value) ? value : undefined;
  const focusValue = focusState.selection === value ? focusState.focus : value;
  const focusTarget = enabled.some((item) => item.value === focusValue) ? focusValue : selected ?? enabled[0]?.value;
  return <div className={`${styles.tabs} ${className}`} role="tablist" aria-label={label} aria-orientation={orientation} dir={direction}>{items.map((item, index) => <button className={styles.tab} key={item.value} id={`${id}-tab-${index}`} ref={(element) => { if (element) refs.current.set(item.value, element); else refs.current.delete(item.value); }} type="button" role="tab" aria-selected={selected === item.value} aria-controls={item.panelId} disabled={item.disabled} tabIndex={focusTarget === item.value ? 0 : -1} onFocus={() => setFocusState({ selection: value, focus: item.value })} onClick={() => onChange(item.value)} onKeyDown={(event) => {
    if (activation === "manual" && ["Enter", " "].includes(event.key)) { event.preventDefault(); onChange(item.value); return; }
    const nextKey = orientation === "vertical" ? "ArrowDown" : direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const previousKey = orientation === "vertical" ? "ArrowUp" : direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (![nextKey, previousKey, "Home", "End"].includes(event.key) || !enabled.length) return;
    event.preventDefault();
    const current = enabled.findIndex((candidate) => candidate.value === item.value);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (current + (event.key === nextKey ? 1 : -1) + enabled.length) % enabled.length;
    const next = enabled[nextIndex].value;
    refs.current.get(next)?.focus();
    if (activation === "automatic") onChange(next);
  }}>{item.label}{item.count !== undefined && <Badge>{item.count}</Badge>}</button>)}</div>;
}

export function InlineError({ message, onRetry, retrying = false, retryLabel = "Tekrar dene", className = "", id }: { message: string; onRetry?: () => void; retrying?: boolean; retryLabel?: string; className?: string; id?: string }) {
  return <div id={id} className={`${styles.error} ${className}`} role="alert"><UiIcon name="warning" size={22}/><p>{message}</p>{onRetry && <Button busy={retrying} onClick={onRetry}>{retryLabel}</Button>}</div>;
}

export function EmptyState({ title, description, icon, action, error = false, className = "" }: { title: string; description: string; icon?: ReactNode; action?: ReactNode; error?: boolean; className?: string }) {
  return <div className={`${styles.empty} ${className}`} role={error ? "alert" : "status"}>{icon && <span className={`${styles.emptyIcon} workspace-state-icon`} aria-hidden="true">{icon}</span>}<h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function Skeleton({ label = "İçerik yükleniyor", rows = 3, shape = "lines", className = "" }: { label?: string; rows?: number; shape?: "lines" | "card"; className?: string }) {
  const lineCount = Math.max(1, Math.min(8, Math.floor(rows) || 3));
  return <div className={`${styles.skeleton} ${className}`} data-shape={shape} role="status" aria-busy="true"><span className={styles.srOnly}>{label}</span>{Array.from({ length: lineCount }, (_, index) => <span key={index} className={styles.skeletonLine} aria-hidden="true"/>)}</div>;
}

/** Errors and actionable messages stay until dismissal; passive messages pause on focus/hover. */
export function Toast({ id, message, onDismiss, duration = 6000, tone = "status", action }: { id: string; message: string; onDismiss: (reason: "manual" | "timeout") => void; duration?: number; tone?: "status" | "error"; action?: { label: string; onPress: () => void; busy?: boolean } }) {
  const identity = `${id}:${message}`;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const state = useRef({ identity, remaining: duration, dismissed: false });
  const callback = useRef(onDismiss);
  useEffect(() => { callback.current = onDismiss; }, [onDismiss]);
  const dismiss = useCallback((reason: "manual" | "timeout") => {
    if (state.current.identity !== identity || state.current.dismissed) return;
    state.current.dismissed = true;
    setDismissed(identity);
    callback.current(reason);
  }, [identity]);
  useEffect(() => {
    if (state.current.identity !== identity) state.current = { identity, remaining: duration, dismissed: false };
    if (tone === "error" || action || duration <= 0 || hovered || focused || hidden || state.current.dismissed) return;
    const began = Date.now();
    const timer = setTimeout(() => dismiss("timeout"), Math.max(0, state.current.remaining));
    return () => { clearTimeout(timer); state.current.remaining = Math.max(0, state.current.remaining - (Date.now() - began)); };
  }, [identity, duration, tone, action, hovered, focused, hidden, dismiss]);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  if (dismissed === identity) return null;
  return <div className={styles.toast} data-tone={tone} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}><p className={styles.toastText} role={tone === "error" ? "alert" : "status"}>{message}</p>{action && <Button onClick={action.onPress} busy={action.busy}>{action.label}</Button>}<IconButton label="Bildirimi kapat" onClick={() => dismiss("manual")}><UiIcon name="close"/></IconButton></div>;
}

type ModalProps = { id: string; open: boolean; title: string; description?: string; children: ReactNode; footer?: ReactNode | ((close: () => void) => ReactNode); onClose: () => void; onRestore?: () => void; busy?: boolean };
function ModalSurface({ id, open, title, description, children, footer, onClose, onRestore, busy = false, presentation }: ModalProps & { presentation: "dialog" | "sheet" }) {
  const headingId = useId();
  const { ref, close } = useAppLayer({ id, open, onClose, onRestore, busy });
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className={styles.layer} data-presentation={presentation} onClick={(event) => { if (event.target === event.currentTarget) close(); }}><section className={styles.dialog} ref={ref} role="dialog" aria-modal="true" aria-busy={busy || undefined} aria-labelledby={headingId} aria-describedby={description ? `${headingId}-description` : undefined}><header className={styles.dialogHeader}><div><h2 id={headingId}>{title}</h2>{description && <p id={`${headingId}-description`}>{description}</p>}</div><IconButton label={`${title}: kapat`} onClick={close} disabled={busy}><UiIcon name="close"/></IconButton></header><div className={styles.dialogBody}>{children}</div>{footer && <footer className={styles.dialogFooter}>{typeof footer === "function" ? footer(close) : footer}</footer>}</section></div>, document.body);
}
export function Dialog(props: ModalProps) { return <ModalSurface {...props} presentation="dialog"/>; }
export function Sheet(props: ModalProps) { return <ModalSurface {...props} presentation="sheet"/>; }
