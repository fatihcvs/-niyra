"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { validatePostMediaSelection } from "../lib/post-media";

/** Files, order and preview lifetimes are owned together; only confirmed File objects enter the draft. */
export function useComposerMedia({ locked, onError }: { locked: boolean; onError: (message: string) => void }) {
  const [{ files, previews }, setSelection] = useState<{ files: readonly File[]; previews: readonly string[] }>({ files: [], previews: [] });
  const current = useRef(files);
  const urls = useRef(new Map<File, string>());
  const setFiles = (next: readonly File[]) => {
    const copy = [...next];
    const nextUrls = new Map<File, string>();
    for (const file of copy) {
      const previous = urls.current.get(file);
      if (previous) nextUrls.set(file, previous);
      else {
        try { nextUrls.set(file, URL.createObjectURL(file)); } catch { /* The file remains available to save; missing preview is explicit in the composer. */ }
      }
    }
    for (const [file, url] of urls.current) if (!nextUrls.has(file)) URL.revokeObjectURL(url);
    urls.current = nextUrls;
    current.current = copy;
    setSelection({ files: copy, previews: copy.map((file) => nextUrls.get(file) ?? "") });
  };
  useEffect(() => () => {
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  function choose(event: ChangeEvent<HTMLInputElement>, kind: "image" | "video") {
    const selected = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (locked || !selected.length) return;
    if (selected.some((file) => !file.type.startsWith(`${kind}/`))) { onError(kind === "image" ? "Bir fotoğraf dosyası seçmelisin." : "Bir video dosyası seçmelisin."); return; }
    const next = [...current.current, ...selected];
    const error = validatePostMediaSelection(next);
    if (error) { onError(error); return; }
    onError("");
    setFiles(next);
  }
  function remove(index: number) {
    if (locked) return;
    setFiles(current.current.filter((_, position) => position !== index));
    onError("");
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (locked || index < 0 || index >= current.current.length || target < 0 || target >= current.current.length) return;
    const next = [...current.current];
    [next[index], next[target]] = [next[target], next[index]];
    setFiles(next);
  }
  return { files, setFiles, urls: previews, choose, remove, move };
}
