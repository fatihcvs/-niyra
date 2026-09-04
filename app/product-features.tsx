"use client";
/* eslint-disable @next/next/no-img-element -- authenticated R2 note previews use dynamic same-origin URLs */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChatCircle, PaperPlaneTilt, ThumbsDown, ThumbsUp, Trash } from "@phosphor-icons/react";
import { curatedNotes, getCuratedSources, type CuratedNote } from "@/lib/curated-notes";

export type FeatureCourse = { id: string; code: string; name: string };

type Note = {
  id: string;
  ownerId?: string;
  ownerName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  title: string;
  description: string;
  noteType: string;
  examYear: number | null;
  examTerm: string | null;
  examKind: string | null;
  tags: string[];
  originalFileName: string;
  contentType: string;
  byteSize: number;
  pageCount: number | null;
  status: string;
  rejectionReason: string | null;
  time: string;
  saved: boolean;
  saveCount: number;
  viewCount: number;
  feedback: "helpful" | "unhelpful" | null;
  helpfulCount: number;
  unhelpfulCount: number;
  commentCount: number;
  own: boolean;
  fileUrl: string;
};

type NoteComment = {
  id: string;
  authorId?: string;
  authorName: string;
  initials: string;
  avatarUrl: string | null;
  content: string;
  time: string;
  edited: boolean;
  own: boolean;
};

type Community = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  joinPolicy: string;
  rules: string;
  status: string;
  courseId: string | null;
  courseCode: string | null;
  creatorName: string;
  memberCount: number;
  postCount: number;
  joined: boolean;
  pending: boolean;
  role: string | null;
  canManage: boolean;
};

type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  time: string;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "Ü";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}

function withFeedbackVote(note: Note, vote: Note["feedback"]) {
  let helpfulCount = note.helpfulCount;
  let unhelpfulCount = note.unhelpfulCount;
  if (note.feedback === "helpful") helpfulCount = Math.max(0, helpfulCount - 1);
  if (note.feedback === "unhelpful") unhelpfulCount = Math.max(0, unhelpfulCount - 1);
  if (vote === "helpful") helpfulCount += 1;
  if (vote === "unhelpful") unhelpfulCount += 1;
  return { ...note, feedback: vote, helpfulCount, unhelpfulCount };
}

function formatVerifiedDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function FeatureHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="feature-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="feature-empty" role="status"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>;
}

export function NotesWorkspace({ courses, initialCourseId = "" }: { courses: FeatureCourse[]; initialCourseId?: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [courseId, setCourseId] = useState(initialCourseId);
  const [scope, setScope] = useState<"all" | "exams" | "mine" | "saved">("all");
  const [examYear, setExamYear] = useState("");
  const [examKind, setExamKind] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState("ders-notu");
  const [selected, setSelected] = useState<Note | null>(null);
  const [selectedCurated, setSelectedCurated] = useState<CuratedNote | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Note | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [feedbackBusyId, setFeedbackBusyId] = useState("");
  const [noteComments, setNoteComments] = useState<NoteComment[]>([]);
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [commentsReloadKey, setCommentsReloadKey] = useState(0);
  const [commentsError, setCommentsError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedCourse = useMemo(() => courses.find((course) => course.id === courseId), [courseId, courses]);
  const visibleCuratedNotes = useMemo(() => {
    if (scope !== "all") return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return curatedNotes.filter((item) => {
      if (selectedCourse && !item.courseCodes.includes(selectedCourse.code)) return false;
      if (!normalizedQuery) return true;
      const sources = getCuratedSources(item);
      return [item.title, item.summary, item.category, ...item.courseCodes, ...item.tags, ...sources.flatMap((source) => [source.name, source.publisher])]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
    });
  }, [query, scope, selectedCourse]);

  async function loadNotes() {
    setState("loading");
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (courseId) params.set("courseId", courseId);
      if (scope === "exams") params.set("noteType", "cikmis-soru");
      if (scope === "exams" && examYear) params.set("examYear", examYear);
      if (scope === "exams" && examKind) params.set("examKind", examKind);
      if (scope === "mine") params.set("mine", "1");
      if (scope === "saved") params.set("saved", "1");
      const response = await fetch(`/api/notes?${params}`, { headers: { accept: "application/json" } });
      const data = await response.json() as { notes?: Note[]; error?: string };
      if (!response.ok || !data.notes) throw new Error(data.error ?? "Notlar getirilemedi.");
      setNotes(data.notes);
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Notlar getirilemedi.");
      setState("error");
    }
  }

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadNotes(), query ? 260 : 0);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  // loadNotes is intentionally scoped to the selected filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, courseId, scope, examYear, examKind]);

  const selectedNoteId = selected?.id ?? "";
  const selectedNoteStatus = selected?.status ?? "";
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!selectedNoteId || selectedNoteStatus !== "published") {
        setNoteComments([]);
        setCommentsState("idle");
        setCommentsError("");
        setCommentDraft("");
        return;
      }
      setNoteComments([]);
      setCommentsState("loading");
      setCommentsError("");
      const response = await fetch(`/api/note-comments?noteId=${encodeURIComponent(selectedNoteId)}`, { headers: { accept: "application/json" } });
      const data = await response.json() as { comments?: NoteComment[]; error?: string };
      if (!response.ok || !data.comments) throw new Error(data.error ?? "Yorumlar getirilemedi.");
      if (!cancelled) { setNoteComments(data.comments); setCommentsState("ready"); }
    }).catch((commentError) => {
      if (!cancelled) {
        setCommentsError(commentError instanceof Error ? commentError.message : "Yorumlar getirilemedi.");
        setCommentsState("error");
      }
    });
    return () => { cancelled = true; };
  }, [selectedNoteId, selectedNoteStatus, commentsReloadKey]);

  function updateNote(noteId: string, updater: (note: Note) => Note) {
    setNotes((current) => current.map((item) => item.id === noteId ? updater(item) : item));
    setSelected((current) => current?.id === noteId ? updater(current) : current);
  }

  async function toggleFeedback(note: Note, vote: Exclude<Note["feedback"], null>) {
    if (feedbackBusyId || note.status !== "published") return;
    const previous = note;
    const nextVote = note.feedback === vote ? null : vote;
    setFeedbackBusyId(note.id);
    updateNote(note.id, (current) => withFeedbackVote(current, nextVote));
    setError("");
    try {
      const response = await fetch("/api/note-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: note.id, type: vote }),
      });
      const data = await response.json() as { vote?: Note["feedback"]; helpfulCount?: number; unhelpfulCount?: number; error?: string };
      if (!response.ok || !(data.vote === null || data.vote === "helpful" || data.vote === "unhelpful")) throw new Error(data.error ?? "Geri bildirim kaydedilemedi.");
      updateNote(note.id, (current) => ({
        ...current,
        feedback: data.vote ?? null,
        helpfulCount: Number(data.helpfulCount ?? current.helpfulCount),
        unhelpfulCount: Number(data.unhelpfulCount ?? current.unhelpfulCount),
      }));
    } catch (feedbackError) {
      updateNote(note.id, (current) => ({ ...current, feedback: previous.feedback, helpfulCount: previous.helpfulCount, unhelpfulCount: previous.unhelpfulCount }));
      setError(feedbackError instanceof Error ? feedbackError.message : "Geri bildirim kaydedilemedi.");
    } finally {
      setFeedbackBusyId("");
    }
  }

  async function sendNoteComment() {
    const note = selected;
    const content = commentDraft.trim();
    if (!note || note.status !== "published" || content.length < 2 || commentBusy) return;
    setCommentBusy(true);
    setCommentsError("");
    try {
      const response = await fetch("/api/note-comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noteId: note.id, content }),
      });
      const data = await response.json() as { comment?: NoteComment; count?: number; error?: string };
      if (!response.ok || !data.comment) throw new Error(data.error ?? "Yorum paylaşılamadı.");
      setNoteComments((current) => [...current, data.comment!]);
      updateNote(note.id, (current) => ({ ...current, commentCount: Number(data.count ?? current.commentCount + 1) }));
      setCommentDraft("");
      setCommentsState("ready");
    } catch (commentError) {
      setCommentsError(commentError instanceof Error ? commentError.message : "Yorum paylaşılamadı.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function deleteNoteComment(comment: NoteComment) {
    if (!selected || !comment.own || deletingCommentId) return;
    const noteId = selected.id;
    setDeletingCommentId(comment.id);
    setCommentsError("");
    try {
      const response = await fetch("/api/note-comments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: comment.id }),
      });
      const data = await response.json() as { deleted?: boolean; count?: number; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "Yorum silinemedi.");
      setNoteComments((current) => current.filter((item) => item.id !== comment.id));
      updateNote(noteId, (current) => ({ ...current, commentCount: Number(data.count ?? Math.max(0, current.commentCount - 1)) }));
    } catch (commentError) {
      setCommentsError(commentError instanceof Error ? commentError.message : "Yorum silinemedi.");
    } finally {
      setDeletingCommentId("");
    }
  }

  async function toggleSave(note: Note) {
    const previous = note.saved;
    setNotes((current) => current.map((item) => item.id === note.id ? { ...item, saved: !previous } : item));
    setSelected((current) => current?.id === note.id ? { ...current, saved: !previous } : current);
    try {
      const response = await fetch("/api/note-actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id, type: "save" }) });
      const data = await response.json() as { active?: boolean; count?: number; error?: string };
      if (!response.ok || typeof data.active !== "boolean") throw new Error(data.error ?? "Not kaydı değiştirilemedi.");
      setNotes((current) => current.map((item) => item.id === note.id ? { ...item, saved: data.active!, saveCount: data.count ?? item.saveCount } : item));
      setSelected((current) => current?.id === note.id ? { ...current, saved: data.active!, saveCount: data.count ?? current.saveCount } : current);
    } catch (saveError) {
      setNotes((current) => current.map((item) => item.id === note.id ? { ...item, saved: previous } : item));
      setError(saveError instanceof Error ? saveError.message : "Not kaydı değiştirilemedi.");
    }
  }

  function uploadNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setUploading(true);
    setProgress(0);
    setUploadError("");
    const request = new XMLHttpRequest();
    request.open("POST", "/api/notes");
    request.responseType = "json";
    request.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
    };
    request.onload = () => {
      setUploading(false);
      const body = request.response as { note?: Note; error?: string } | null;
      if (request.status < 200 || request.status >= 300 || !body?.note) {
        setUploadError(body?.error ?? "Not yüklenemedi. Bağlantını kontrol edip yeniden dene.");
        return;
      }
      setNotes((current) => [body.note!, ...current]);
      setShowUpload(false);
      form.reset();
      setUploadType("ders-notu");
      setProgress(0);
      setSelected(body.note);
    };
    request.onerror = () => { setUploading(false); setUploadError("Yükleme yarıda kaldı. Dosyanı yeniden seçip tekrar deneyebilirsin."); };
    request.send(data);
  }

  async function removeNote(note: Note) {
    try {
      const response = await fetch("/api/notes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id }) });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "Not silinemedi.");
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setDeleteConfirm(null);
      setSelected(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Not silinemedi.");
      setDeleteConfirm(null);
    }
  }

  return <div className="workspace-view feature-workspace">
    <FeatureHeader eyebrow={scope === "exams" ? "ÇIKMIŞ SORULAR" : "NOT KÜTÜPHANESİ"} title={scope === "exams" ? "Sınava gerçekten ne çıktığını gör" : "Ders notlarını bul ve paylaş"} description={scope === "exams" ? "Kampüsündeki öğrencilerin yüklediği geçmiş sınavları ders, yıl ve sınav türüne göre filtrele. Her yükleme topluluk moderasyonuna açıktır." : "Kaynakları doğrulanmış Kampira Editoryal notlarını ve kampüsündeki öğrenci paylaşımlarını ders, konu ve başlığa göre ara."} action={<button className="feature-primary" type="button" onClick={() => { if (scope === "exams") setUploadType("cikmis-soru"); setShowUpload(true); }}>＋ {scope === "exams" ? "Soru yükle" : "Not yükle"}</button>}/>
    <section className="feature-search" aria-label="Not ara"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={scope === "exams" ? "Ders kodu, sınav başlığı veya konu ara" : "Ders kodu, konu, başlık veya öğrenci ara"}/><button type="button" onClick={() => setQuery("")} disabled={!query}>Temizle</button></section>
    <div className="feature-toolbar">
      <div role="tablist" aria-label="Not görünümü">{([['all','Tüm notlar'],['exams','Çıkmış Sorular'],['mine','Notlarım'],['saved','Kaydettiklerim']] as const).map(([value,label]) => <button role="tab" aria-selected={scope === value} className={scope === value ? "active" : ""} type="button" onClick={() => setScope(value)} key={value}>{label}</button>)}</div>
      <label>Ders<select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Tümü</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label>
    </div>
    {scope === "exams" && <section className="exam-filter-strip" aria-label="Çıkmış soru filtreleri"><div><span>⌁</span><p><strong>Dersini seç, geçmiş sınavları karşılaştır.</strong><small>Yüklemeler resmî cevap anahtarı olarak kabul edilmez; çözümleri ders kaynağınla doğrula.</small></p></div><label>Yıl<select value={examYear} onChange={(event) => setExamYear(event.target.value)}><option value="">Tümü</option>{Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>Sınav<select value={examKind} onChange={(event) => setExamKind(event.target.value)}><option value="">Tümü</option><option value="vize">Vize</option><option value="final">Final</option><option value="butunleme">Bütünleme</option><option value="quiz">Quiz</option></select></label></section>}
    {error && <p className="feature-error" role="alert">{error} <button type="button" onClick={() => void loadNotes()}>Yeniden dene</button></p>}
    {scope === "all" && <section className="curated-library" aria-labelledby="curated-library-title">
      <header className="curated-library-header"><div><span>KAMPIRA EDİTORYAL · KAYNAKLI</span><h2 id="curated-library-title">Doğrulanmış çalışma notları</h2><p>Resmi kurumlar, üniversite açık dersleri ve açık ders kitaplarından araştırılarak özgün biçimde hazırlandı.</p></div><strong>{visibleCuratedNotes.length}<small>{query || selectedCourse ? "eşleşen not" : "editoryal not"}</small></strong></header>
      {visibleCuratedNotes.length > 0 ? <div className="curated-note-grid">{visibleCuratedNotes.map((item) => {
        const sources = getCuratedSources(item);
        return <article className="curated-note-card" key={item.id}>
          <button className="curated-note-main" type="button" onClick={() => setSelectedCurated(item)}>
            <span className="curated-note-badge">✓ KAYNAKLI</span>
            <small>{item.courseCodes.join(" · ")} · {item.readingMinutes} dk</small>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
          </button>
          <footer><span>{sources[0].publisher}</span><button type="button" onClick={() => setSelectedCurated(item)}>Notu aç →</button></footer>
        </article>;
      })}</div> : <div className="curated-empty"><strong>Bu filtreyle editoryal not bulunamadı.</strong><p>Arama terimini veya ders filtresini değiştirerek yeniden dene.</p></div>}
    </section>}
    <div className="campus-notes-heading"><div><span>{scope === "exams" ? "SINAV ARŞİVİ" : "KAMPÜS KÜTÜPHANESİ"}</span><h2>{scope === "exams" ? "Öğrencilerin yüklediği sorular" : "Öğrenci notları"}</h2></div></div>
    {state === "loading" ? <EmptyState icon="…" title="Notlar getiriliyor" text="Kampüs kütüphanen hazırlanıyor."/> : notes.length === 0 ? <EmptyState icon="▤" title="Bu görünümde not yok" text="Aramayı veya filtreleri değiştir; istersen ilk notu sen yükle."/> : <div className="feature-note-grid">{notes.map((note) => <article className="feature-note-card" key={note.id}>
      <button className="feature-note-cover" type="button" onClick={() => setSelected(note)}><span>{note.courseCode}</span><strong>{note.contentType === "application/pdf" ? "PDF" : note.originalFileName.split('.').at(-1)?.toLocaleUpperCase("tr-TR")}</strong><i>{note.status === "published" ? "YAYINDA" : note.status === "processing" ? "İŞLENİYOR" : "İNCELENDİ"}</i></button>
      <div className="feature-note-body"><div><span>{note.courseCode}</span><button className={note.saved ? "active" : ""} type="button" onClick={() => void toggleSave(note)} aria-label={note.saved ? "Notu kayıtlardan çıkar" : "Notu kaydet"}>⌑</button></div>{note.noteType === "cikmis-soru" && <div className="exam-note-meta"><span>{note.examYear}</span><span>{({ vize: "Vize", final: "Final", butunleme: "Bütünleme", quiz: "Quiz" } as Record<string, string>)[note.examKind ?? ""] ?? note.examKind}</span><span>{note.examTerm === "guz" ? "Güz" : note.examTerm === "bahar" ? "Bahar" : "Yaz"}</span></div>}<button className="feature-note-title" type="button" onClick={() => setSelected(note)}>{note.title}</button><p>{note.ownerName}</p><small>{formatBytes(note.byteSize)} · {note.viewCount.toLocaleString("tr-TR")} görüntülenme</small>
        {note.status === "published" && <div className="note-feedback-row" aria-label={`${note.title} geri bildirimleri`}>
          <button className={note.feedback === "helpful" ? "active helpful" : ""} type="button" onClick={() => void toggleFeedback(note, "helpful")} disabled={feedbackBusyId === note.id} aria-pressed={note.feedback === "helpful"}><ThumbsUp size={15} weight={note.feedback === "helpful" ? "fill" : "regular"}/><span>Yararlı</span><b>{note.helpfulCount}</b></button>
          <button className={note.feedback === "unhelpful" ? "active unhelpful" : ""} type="button" onClick={() => void toggleFeedback(note, "unhelpful")} disabled={feedbackBusyId === note.id} aria-pressed={note.feedback === "unhelpful"}><ThumbsDown size={15} weight={note.feedback === "unhelpful" ? "fill" : "regular"}/><span>Yararlı değil</span><b>{note.unhelpfulCount}</b></button>
          <button type="button" onClick={() => setSelected(note)} aria-label={`${note.commentCount} yorumu aç`}><ChatCircle size={15}/><span>Yorum</span><b>{note.commentCount}</b></button>
        </div>}
      </div>
    </article>)}</div>}

    {showUpload && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading) setShowUpload(false); }}><section className="feature-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title"><header><div><span>GÜVENLİ YÜKLEME</span><h2 id="upload-title">{uploadType === "cikmis-soru" ? "Çıkmış soru ekle" : "Yeni ders notu"}</h2></div><button type="button" onClick={() => setShowUpload(false)} disabled={uploading} aria-label="Pencereyi kapat">×</button></header><form onSubmit={uploadNote}>
      <label>Başlık<input name="title" required minLength={3} maxLength={120} placeholder="Örn. Lineer Cebir Final Özeti"/></label>
      <label>Ders<select name="courseId" required defaultValue=""><option value="" disabled>Dersini seç</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label>
      <div className="feature-field-row"><label>Not türü<select name="noteType" value={uploadType} onChange={(event) => setUploadType(event.target.value)}><option value="ders-notu">Ders notu</option><option value="formul-kagidi">Formül kâğıdı</option><option value="cikmis-soru">Çıkmış soru</option><option value="sunum">Sunum</option></select></label><label>Etiketler<input name="tags" maxLength={240} placeholder="final, integral, özet"/></label></div>
      {uploadType === "cikmis-soru" && <div className="exam-upload-fields"><label>Yıl<input name="examYear" type="number" min="2000" max={new Date().getFullYear() + 1} required defaultValue={new Date().getFullYear()}/></label><label>Dönem<select name="examTerm" required defaultValue=""><option value="" disabled>Seç</option><option value="guz">Güz</option><option value="bahar">Bahar</option><option value="yaz">Yaz</option></select></label><label>Sınav türü<select name="examKind" required defaultValue=""><option value="" disabled>Seç</option><option value="vize">Vize</option><option value="final">Final</option><option value="butunleme">Bütünleme</option><option value="quiz">Quiz</option></select></label></div>}
      <label>Açıklama<textarea name="description" maxLength={600} rows={3} placeholder="Notta hangi konuların bulunduğunu kısaca anlat."/></label>
      <label className="feature-file-field"><span>Dosya seç</span><input name="file" type="file" required accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"/><small>PDF, DOCX, PNG, JPG veya WEBP · en fazla 15 MB</small></label>
      {uploadType === "cikmis-soru" && <p className="exam-upload-warning">Yalnız paylaşma hakkın olan materyali yükle. Kişisel bilgi, izinsiz ticari soru bankası veya “resmî” diye doğrulanmamış cevap anahtarı ekleme.</p>}
      {uploading && <div className="feature-progress" aria-live="polite"><span style={{ width: `${progress}%` }}/><strong>%{progress} yükleniyor</strong></div>}
      {uploadError && <p className="feature-error" role="alert">{uploadError}</p>}
      <footer><button type="button" onClick={() => setShowUpload(false)} disabled={uploading}>Vazgeç</button><button className="feature-primary" type="submit" disabled={uploading}>{uploading ? "Yükleniyor…" : uploadType === "cikmis-soru" ? "Soruyu yükle" : "Notu yükle"}</button></footer>
    </form></section></div>}

    {selected && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="feature-dialog feature-detail" role="dialog" aria-modal="true" aria-labelledby="note-detail-title"><header><div><span>{selected.courseCode} · {selected.noteType.replaceAll('-', ' ')}</span><h2 id="note-detail-title">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Pencereyi kapat">×</button></header>
      <div className="feature-detail-meta"><span className="feature-avatar">{initials(selected.ownerName)}</span><div><strong>{selected.ownerName}</strong><small>{selected.time} önce · {formatBytes(selected.byteSize)}</small></div><span className={`feature-status status-${selected.status}`}>{selected.status === "published" ? "Yayında" : selected.status === "processing" ? "İşleniyor" : "Reddedildi"}</span></div>
      {selected.description && <p className="feature-detail-description">{selected.description}</p>}
      {selected.noteType === "cikmis-soru" && <div className="exam-note-meta detail"><span>{selected.examYear}</span><span>{selected.examTerm === "guz" ? "Güz" : selected.examTerm === "bahar" ? "Bahar" : "Yaz"}</span><span>{({ vize: "Vize", final: "Final", butunleme: "Bütünleme", quiz: "Quiz" } as Record<string, string>)[selected.examKind ?? ""] ?? selected.examKind}</span></div>}
      {selected.tags.length > 0 && <div className="feature-tags">{selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {selected.status === "published" && <section className="note-feedback-summary" aria-labelledby="note-feedback-title">
        <div><span>TOPLULUK GERİ BİLDİRİMİ</span><strong id="note-feedback-title">Bu not işine yaradı mı?</strong></div>
        <div>
          <button className={selected.feedback === "helpful" ? "active helpful" : ""} type="button" onClick={() => void toggleFeedback(selected, "helpful")} disabled={feedbackBusyId === selected.id} aria-pressed={selected.feedback === "helpful"}><ThumbsUp size={18} weight={selected.feedback === "helpful" ? "fill" : "regular"}/><span>Yararlı</span><b>{selected.helpfulCount}</b></button>
          <button className={selected.feedback === "unhelpful" ? "active unhelpful" : ""} type="button" onClick={() => void toggleFeedback(selected, "unhelpful")} disabled={feedbackBusyId === selected.id} aria-pressed={selected.feedback === "unhelpful"}><ThumbsDown size={18} weight={selected.feedback === "unhelpful" ? "fill" : "regular"}/><span>Yararlı değil</span><b>{selected.unhelpfulCount}</b></button>
        </div>
      </section>}
      {selected.status === "published" ? <div className="feature-preview">{selected.contentType.startsWith("image/") ? <img src={selected.fileUrl} alt={`${selected.title} önizlemesi`}/> : selected.contentType === "application/pdf" ? <iframe src={selected.fileUrl} title={`${selected.title} PDF önizlemesi`}/> : <EmptyState icon="DOCX" title="Belge indirilmeye hazır" text="DOCX dosyaları güvenli indirme bağlantısıyla açılır."/>}</div> : <EmptyState icon="!" title={selected.status === "processing" ? "Dosya işleniyor" : "Dosya yayınlanmadı"} text={selected.rejectionReason ?? "İnceleme tamamlandığında burada görünecek."}/>} 
      {selected.status === "published" && <section className="note-comments-panel" aria-labelledby="note-comments-title">
        <header><div><span>ÖĞRENCİ YORUMLARI</span><h3 id="note-comments-title">Not hakkında konuş</h3></div><strong><ChatCircle size={16} weight="fill"/>{selected.commentCount}</strong></header>
        <form onSubmit={(event) => { event.preventDefault(); void sendNoteComment(); }}>
          <label className="sr-only" htmlFor={`note-comment-${selected.id}`}>Yorum yaz</label>
          <textarea id={`note-comment-${selected.id}`} value={commentDraft} onChange={(event) => { setCommentDraft(event.target.value); setCommentsError(""); }} minLength={2} maxLength={500} rows={2} placeholder="Notla ilgili sorunu, düzeltmeni veya teşekkürünü yaz…"/>
          <footer><small>{commentDraft.length}/500</small><button className="feature-primary" type="submit" disabled={commentDraft.trim().length < 2 || commentBusy}><PaperPlaneTilt size={16}/>{commentBusy ? "Gönderiliyor…" : "Yorum yap"}</button></footer>
        </form>
        {commentsError && <p className="note-comments-error" role="alert">{commentsError}{commentsState === "error" && <button type="button" onClick={() => setCommentsReloadKey((value) => value + 1)}>Yeniden dene</button>}</p>}
        {commentsState === "loading" && <p className="note-comments-state" aria-live="polite">Yorumlar getiriliyor…</p>}
        {commentsState === "ready" && noteComments.length === 0 && <p className="note-comments-state">İlk yorumu sen bırak.</p>}
        {noteComments.length > 0 && <div className="note-comment-list">{noteComments.map((comment) => <article key={comment.id}>
          {comment.avatarUrl ? <img src={comment.avatarUrl} alt=""/> : <span>{comment.initials}</span>}
          <div><header><strong>{comment.authorName}</strong><small>{comment.time === "şimdi" ? comment.time : `${comment.time} önce`}</small></header><p>{comment.content}{comment.edited && <small> · düzenlendi</small>}</p></div>
          {comment.own && <button type="button" onClick={() => void deleteNoteComment(comment)} disabled={deletingCommentId === comment.id} aria-label="Yorumu sil"><Trash size={15}/></button>}
        </article>)}</div>}
      </section>}
      <footer><button type="button" onClick={() => void toggleSave(selected)}>{selected.saved ? "Kaydedildi" : "Kaydet"}</button>{selected.own && <button className="feature-danger" type="button" onClick={() => setDeleteConfirm(selected)}>Notu sil</button>}{selected.status === "published" && <><a href={selected.fileUrl} target="_blank" rel="noreferrer">Yeni sekmede aç</a><a className="feature-primary" href={`${selected.fileUrl}&download=1`}>İndir</a></>}</footer>
    </section></div>}

    {selectedCurated && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCurated(null); }}><section className="feature-dialog feature-detail curated-detail" role="dialog" aria-modal="true" aria-labelledby="curated-detail-title"><header><div><span>KAMPIRA EDİTORYAL · {selectedCurated.courseCodes.join(" · ")}</span><h2 id="curated-detail-title">{selectedCurated.title}</h2></div><button type="button" onClick={() => setSelectedCurated(null)} aria-label="Pencereyi kapat">×</button></header>
      <div className="curated-detail-intro"><span>✓ Kaynakları doğrulandı</span><p>{selectedCurated.summary}</p><small>{selectedCurated.level} · {selectedCurated.readingMinutes} dakika · {formatVerifiedDate(selectedCurated.verifiedOn)} tarihinde doğrulandı</small></div>
      <div className="curated-detail-columns"><section><h3>Bilmen gerekenler</h3><ul>{selectedCurated.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul></section><section><h3>Çalışma kontrolü</h3><ol>{selectedCurated.checklist.map((step) => <li key={step}>{step}</li>)}</ol></section></div>
      <div className="feature-tags">{selectedCurated.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      <section className="curated-sources"><h3>Kaynaklar</h3><p>Bu kısa not özgün olarak hazırlandı. Konuyu ayrıntılı çalışmak ve güncel metni doğrulamak için birincil kaynağı aç.</p>{getCuratedSources(selectedCurated).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.key}><span><strong>{source.name}</strong><small>{source.publisher}</small></span><i>↗</i></a>)}</section>
      <footer><button type="button" onClick={() => setSelectedCurated(null)}>Kapat</button><a className="feature-primary" href={getCuratedSources(selectedCurated)[0].url} target="_blank" rel="noreferrer">Ana kaynağı aç ↗</a></footer>
    </section></div>}

    {deleteConfirm && <div className="feature-overlay feature-confirm-layer"><section className="feature-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-note-title"><span>!</span><h2 id="delete-note-title">Not kalıcı olarak silinsin mi?</h2><p>“{deleteConfirm.title}” dosyası ve ilişkili kayıtları geri getirilemeyecek.</p><div><button type="button" onClick={() => setDeleteConfirm(null)}>Vazgeç</button><button className="feature-danger" type="button" onClick={() => void removeNote(deleteConfirm)}>Notu sil</button></div></section></div>}
  </div>;
}

export function CommunitiesWorkspace({ courses }: { courses: FeatureCourse[] }) {
  const [items, setItems] = useState<Community[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Community | null>(null);
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [posts, setPosts] = useState<Array<{ id: string; authorName?: string; content: string; time: string; pinned: boolean; own: boolean }>>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setState("loading"); setError("");
    try {
      const params = new URLSearchParams(); if (query) params.set("q", query); if (mine) params.set("mine", "1");
      const response = await fetch(`/api/communities?${params}`);
      const data = await response.json() as { communities?: Community[]; error?: string };
      if (!response.ok || !data.communities) throw new Error(data.error ?? "Topluluklar getirilemedi.");
      setItems(data.communities); setState("ready");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Topluluklar getirilemedi."); setState("error"); }
  }
  useEffect(() => { const timer = setTimeout(() => void load(), query ? 250 : 0); return () => clearTimeout(timer); }, [query, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openCommunity(community: Community) {
    setSelected(community); setError("");
    try {
      const [detailResponse, postsResponse] = await Promise.all([fetch(`/api/communities?id=${community.id}`), fetch(`/api/community-posts?communityId=${community.id}`)]);
      const detail = await detailResponse.json() as { community?: Community; members?: Array<Record<string, unknown>>; error?: string };
      const postData = await postsResponse.json() as { posts?: typeof posts; error?: string };
      if (!detailResponse.ok || !detail.community) throw new Error(detail.error ?? "Topluluk açılamadı.");
      setSelected(detail.community); setMembers(detail.members ?? []); setPosts(postData.posts ?? []);
    } catch (openError) { setError(openError instanceof Error ? openError.message : "Topluluk açılamadı."); }
  }

  async function membership(community: Community) {
    const action = community.joined || community.pending ? "leave" : "join";
    const optimistic = { ...community, joined: action === "join" && community.joinPolicy === "open", pending: action === "join" && community.joinPolicy === "request" };
    setItems((current) => current.map((item) => item.id === community.id ? optimistic : item));
    try {
      const response = await fetch("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: community.id, action }) });
      const data = await response.json() as { joined?: boolean; pending?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Üyelik değiştirilemedi.");
      setItems((current) => current.map((item) => item.id === community.id ? { ...item, joined: Boolean(data.joined), pending: Boolean(data.pending), memberCount: Math.max(0, item.memberCount + (data.joined && !community.joined ? 1 : !data.joined && community.joined ? -1 : 0)) } : item));
    } catch (membershipError) { setItems((current) => current.map((item) => item.id === community.id ? community : item)); setError(membershipError instanceof Error ? membershipError.message : "Üyelik değiştirilemedi."); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/communities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const data = await response.json() as { community?: Community; error?: string };
      if (!response.ok || !data.community) throw new Error(data.error ?? "Topluluk kurulamadı.");
      setItems((current) => [data.community!, ...current]); setCreateOpen(false); void openCommunity(data.community);
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Topluluk kurulamadı."); }
    finally { setBusy(false); }
  }

  async function createPost() {
    if (!selected || !draft.trim()) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/community-posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, content: draft.trim() }) });
      const data = await response.json() as { post?: { id: string; content: string; time: string; pinned: boolean; own: boolean }; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderi paylaşılamadı.");
      setPosts((current) => [{ ...data.post!, authorName: "Sen" }, ...current]); setDraft("");
    } catch (postError) { setError(postError instanceof Error ? postError.message : "Gönderi paylaşılamadı."); }
    finally { setBusy(false); }
  }

  async function togglePin(postId: string) {
    if (!selected) return;
    const response = await fetch("/api/community-posts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId: selected.id, postId }) });
    const data = await response.json() as { active?: boolean; error?: string };
    if (!response.ok || typeof data.active !== "boolean") { setError(data.error ?? "Gönderi sabitlenemedi."); return; }
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, pinned: data.active! } : post));
  }

  async function manageMember(targetId: string, action: "approve" | "role", role?: string) {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action, targetId, role }) });
      const data = await response.json() as { updated?: boolean; error?: string };
      if (!response.ok || !data.updated) throw new Error(data.error ?? "Üye rolü güncellenemedi.");
      await openCommunity(selected);
    } catch (memberError) { setError(memberError instanceof Error ? memberError.message : "Üye rolü güncellenemedi."); }
    finally { setBusy(false); }
  }

  async function archiveCommunity() {
    if (!selected) return;
    const action = selected.status === "archived" ? "restore" : "archive";
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/communities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action }) });
      const data = await response.json() as { status?: string; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error ?? "Topluluk durumu değiştirilemedi.");
      setSelected((current) => current ? { ...current, status: data.status! } : current);
      if (data.status === "archived") setItems((current) => current.filter((item) => item.id !== selected.id));
    } catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : "Topluluk durumu değiştirilemedi."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-view feature-workspace">
    <FeatureHeader eyebrow="TOPLULUKLAR" title="Kampüs çevreni birlikte kur" description="Ders, kampüs ve ilgi alanlarında kalıcı topluluklara katıl veya kendi çevreni oluştur." action={<button className="feature-primary" type="button" onClick={() => setCreateOpen(true)}>＋ Topluluk kur</button>}/>
    <section className="feature-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topluluk adı, ders veya kategori ara"/><button type="button" onClick={() => setMine((value) => !value)} className={mine ? "active" : ""}>{mine ? "Tümünü göster" : "Üyeliklerim"}</button></section>
    {error && <p className="feature-error" role="alert">{error}</p>}
    {state === "loading" ? <EmptyState icon="…" title="Topluluklar hazırlanıyor" text="Kampüsteki çevreler getiriliyor."/> : items.length === 0 ? <EmptyState icon="◎" title="Henüz eşleşen topluluk yok" text="Aramayı değiştir veya ilk topluluğu sen kur."/> : <div className="feature-community-grid">{items.map((community) => <article className="feature-community-card" key={community.id}><button className="feature-community-main" type="button" onClick={() => void openCommunity(community)}><span className={`feature-community-mark tone-${community.category}`}>{community.courseCode ?? initials(community.name)}</span><div><small>{community.category} {community.courseCode && `· ${community.courseCode}`}</small><h2>{community.name}</h2><p>{community.description}</p><footer><span>{community.memberCount} üye</span><span>{community.postCount} gönderi</span>{community.joinPolicy === "request" && <span>Onaylı katılım</span>}</footer></div></button><button className={community.joined ? "joined" : community.pending ? "pending" : ""} type="button" onClick={() => void membership(community)}>{community.joined ? "Katıldın" : community.pending ? "İstek gönderildi" : "Katıl"}</button></article>)}</div>}
    {createOpen && <div className="feature-overlay"><section className="feature-dialog" role="dialog" aria-modal="true" aria-labelledby="community-create-title"><header><div><span>YENİ ÇEVRE</span><h2 id="community-create-title">Topluluk kur</h2></div><button type="button" onClick={() => setCreateOpen(false)}>×</button></header><form onSubmit={create}>
      <label>Topluluk adı<input name="name" required minLength={3} maxLength={80}/></label><label>Amaç ve kapsam<textarea name="description" required minLength={12} maxLength={500} rows={3}/></label>
      <div className="feature-field-row"><label>Kategori<select name="category" defaultValue="akademik"><option value="akademik">Akademik</option><option value="teknoloji">Teknoloji</option><option value="kampus">Kampüs</option><option value="kariyer">Kariyer</option><option value="ilgi">İlgi alanı</option></select></label><label>Katılım<select name="joinPolicy" defaultValue="open"><option value="open">Herkese açık</option><option value="request">İstekle katılım</option></select></label></div>
      <label>Ders bağlamı<select name="courseId" defaultValue=""><option value="">Genel topluluk</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.code} · {course.name}</option>)}</select></label><label>Topluluk kuralları<textarea name="rules" maxLength={800} rows={3} placeholder="Saygılı ol, kaynak belirt, kişisel veri paylaşma…"/></label>
      <footer><button type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kuruluyor…" : "Topluluğu kur"}</button></footer>
    </form></section></div>}
    {selected && <div className="feature-overlay"><section className="feature-dialog feature-community-detail" role="dialog" aria-modal="true" aria-labelledby="community-detail-title"><header><div><span>{selected.category} {selected.courseCode && `· ${selected.courseCode}`}</span><h2 id="community-detail-title">{selected.name}</h2></div><button type="button" onClick={() => setSelected(null)}>×</button></header><p className="feature-detail-description">{selected.description}</p>{selected.rules && <aside className="feature-rules"><strong>Topluluk kuralları</strong><p>{selected.rules}</p></aside>}
      {selected.joined && <div className="feature-community-composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} placeholder="Topluluğunla bir şey paylaş…"/><button className="feature-primary" type="button" onClick={() => void createPost()} disabled={!draft.trim() || busy}>Paylaş</button></div>}
      <div className="feature-community-posts">{posts.length === 0 ? <EmptyState icon="✦" title="Henüz gönderi yok" text="İlk paylaşım topluluğun ritmini başlatır."/> : posts.map((post) => <article className={post.pinned ? "pinned" : ""} key={post.id}><div><strong>{post.authorName ?? "Kampira öğrencisi"}</strong><small>{post.time} önce</small>{post.pinned && <span>Sabitlendi</span>}</div><p>{post.content}</p>{selected.canManage && <button type="button" onClick={() => void togglePin(post.id)}>{post.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}</button>}</article>)}</div>
      {members.length > 0 && <details><summary>Üyeler ve roller ({members.length})</summary><div className="feature-member-list">{members.map((member) => <span key={String(member.public_id)}><b>{String(member.display_name)}</b><small>@{String(member.handle)} · {String(member.role)} · {String(member.status)}</small>{String(member.role) !== "founder" && selected.canManage && <div>{String(member.status) === "pending" && <button type="button" onClick={() => void manageMember(String(member.public_id), "approve")}>Onayla</button>}<select aria-label={`${String(member.display_name)} rolü`} value={String(member.role)} onChange={(event) => void manageMember(String(member.public_id), "role", event.target.value)} disabled={busy || String(member.status) !== "active"}><option value="member">Üye</option><option value="moderator">Moderatör</option><option value="admin">Yönetici</option></select></div>}</span>)}</div></details>}
      <footer>{selected.role !== "founder" && <button type="button" onClick={() => void membership(selected)}>{selected.joined ? "Topluluktan ayrıl" : selected.pending ? "İsteği geri çek" : "Topluluğa katıl"}</button>}{['founder','admin'].includes(selected.role ?? '') && <button className="feature-danger" type="button" onClick={() => void archiveCommunity()} disabled={busy}>{selected.status === "archived" ? "Topluluğu geri aç" : "Topluluğu arşivle"}</button>}</footer>
    </section></div>}
  </div>;
}

export function NotificationsWorkspace() {
  const [items, setItems] = useState<Notice[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState("all");
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState({ interactions: true, courses: true, communities: true });
  async function load() {
    setState("loading");
    try {
      const response = await fetch(`/api/notifications${tab === "all" ? "" : `?kind=${tab}`}`);
      const data = await response.json() as { notifications?: Notice[]; preferences?: typeof preferences; error?: string };
      if (!response.ok || !data.notifications) throw new Error(data.error ?? "Bildirimler getirilemedi.");
      setItems(data.notifications); if (data.preferences) setPreferences(data.preferences); setState("ready");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Bildirimler getirilemedi."); setState("error"); }
  }
  useEffect(() => {
    let active = true;
    void fetch(`/api/notifications${tab === "all" ? "" : `?kind=${tab}`}`)
      .then(async (response) => {
        const data = await response.json() as { notifications?: Notice[]; preferences?: typeof preferences; error?: string };
        if (!response.ok || !data.notifications) throw new Error(data.error ?? "Bildirimler getirilemedi.");
        if (active) {
          setItems(data.notifications);
          if (data.preferences) setPreferences(data.preferences);
          setState("ready");
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Bildirimler getirilemedi.");
          setState("error");
        }
      });
    return () => { active = false; };
  }, [tab]);
  async function markAllRead() { setItems((current) => current.map((item) => ({ ...item, read: true }))); await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read-all" }) }); }
  async function savePreferences(next: typeof preferences) { setPreferences(next); const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preferences", ...next }) }); if (!response.ok) { setError("Bildirim tercihleri kaydedilemedi."); void load(); } }
  return <div className="workspace-view feature-workspace"><FeatureHeader eyebrow="BİLDİRİMLER" title="Gelişmeler" description="Gönderilerin, notların ve topluluklarındaki önemli hareketler." action={<button className="feature-text-action" type="button" onClick={() => void markAllRead()} disabled={!items.some((item) => !item.read)}>✓ Tümünü okundu işaretle</button>}/>
    <div className="feature-toolbar"><div role="tablist">{([['all','Tümü'],['interaction','Etkileşimler'],['course','Dersler'],['community','Topluluklar']] as const).map(([value,label]) => <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{label}</button>)}</div></div>
    {error && <p className="feature-error" role="alert">{error}</p>}
    {state === "loading" ? <EmptyState icon="…" title="Bildirimler getiriliyor" text="Son gelişmeler hazırlanıyor."/> : items.length === 0 ? <EmptyState icon="○" title="Yeni bildirimin yok" text="Etkileşimler, dersler ve topluluk hareketleri burada görünecek."/> : <div className="feature-notice-list">{items.map((item) => <article className={item.read ? "" : "unread"} key={item.id}><span className="feature-avatar">{item.kind === "community" ? "◎" : item.kind === "course" ? "D" : "♥"}</span><div><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}<small>{item.time} önce</small></div>{!item.read && <i/>}</article>)}</div>}
    <section className="feature-preferences"><h2>Bildirim tercihleri</h2><p>Hangi gelişmelerin bildirim listene düşeceğini seç.</p>{([['interactions','Etkileşimler'],['courses','Ders çevreleri'],['communities','Topluluklar']] as const).map(([key,label]) => <label key={key}><span><strong>{label}</strong><small>{key === 'interactions' ? 'Beğeni, yorum ve takipler' : key === 'courses' ? 'Seçtiğin derslerdeki hareketler' : 'Üye olduğun topluluklar'}</small></span><input type="checkbox" checked={preferences[key]} onChange={(event) => void savePreferences({ ...preferences, [key]: event.target.checked })}/></label>)}</section>
  </div>;
}

type SearchData = {
  people: Array<{ public_id: string; display_name: string; handle: string; department_name: string }>;
  courses: Array<{ id: string; code: string; name: string; department_name: string }>;
  posts: Array<{ id: string; content: string; author_name: string; course_code: string; time: string }>;
  notes: Array<{ id: string; title: string; owner_name: string; course_code: string; view_count: number }>;
  communities: Array<{ id: string; name: string; description: string; member_count: number }>;
};

export function UnifiedSearchResults({ query, onNavigate }: { query: string; onNavigate?: (name: string) => void }) {
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try { const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }); const body = await response.json() as SearchData & { error?: string }; if (!response.ok) throw new Error(body.error ?? "Arama tamamlanamadı."); setData(body); }
      catch (searchError) { if (!(searchError instanceof DOMException && searchError.name === "AbortError")) setError(searchError instanceof Error ? searchError.message : "Arama tamamlanamadı."); }
      finally { setLoading(false); }
    }, 260);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  if (query.trim().length < 2) return null;
  if (loading) return <div className="unified-results"><EmptyState icon="…" title="Kampira’da aranıyor" text="Öğrenciler, dersler, gönderiler, notlar ve topluluklar taranıyor."/></div>;
  if (error) return <p className="feature-error" role="alert">{error}</p>;
  if (!data) return null;
  const total = data.people.length + data.courses.length + data.posts.length + data.notes.length + data.communities.length;
  if (!total) return <div className="unified-results"><EmptyState icon="⌕" title="Sonuç bulunamadı" text="Ders kodunu, konu adını veya öğrenci adını farklı yazmayı dene."/></div>;
  return <section className="unified-results" aria-label="Tüm arama sonuçları">
    {data.people.length > 0 && <SearchGroup title="Öğrenciler">{data.people.map((person) => <a href={`/?profile=${encodeURIComponent(person.public_id)}`} key={person.public_id}><span className="feature-avatar">{initials(person.display_name)}</span><div><strong>{person.display_name}</strong><small>@{person.handle} · {person.department_name}</small></div><i>→</i></a>)}</SearchGroup>}
    {data.courses.length > 0 && <SearchGroup title="Dersler">{data.courses.map((course) => <button type="button" onClick={() => onNavigate?.("Notlar")} key={course.id}><span className="feature-avatar">{course.code.slice(0, 2)}</span><div><strong>{course.code} · {course.name}</strong><small>{course.department_name}</small></div><i>→</i></button>)}</SearchGroup>}
    {data.notes.length > 0 && <SearchGroup title="Notlar">{data.notes.map((note) => <a href={`/api/notes/file?id=${encodeURIComponent(note.id)}`} target="_blank" rel="noreferrer" key={note.id}><span className="feature-avatar">PDF</span><div><strong>{note.title}</strong><small>{note.course_code} · {note.owner_name} · {note.view_count} görüntülenme</small></div><i>↗</i></a>)}</SearchGroup>}
    {data.posts.length > 0 && <SearchGroup title="Gönderiler">{data.posts.map((post) => <a href={`/?post=${encodeURIComponent(post.id)}`} key={post.id}><span className="feature-avatar">{initials(post.author_name)}</span><div><strong>{post.author_name} · {post.course_code}</strong><small>{post.content.slice(0, 110)} · {post.time} önce</small></div><i>→</i></a>)}</SearchGroup>}
    {data.communities.length > 0 && <SearchGroup title="Topluluklar">{data.communities.map((community) => <button type="button" onClick={() => onNavigate?.("Topluluklar")} key={community.id}><span className="feature-avatar">◎</span><div><strong>{community.name}</strong><small>{community.member_count} üye · {community.description.slice(0, 90)}</small></div><i>→</i></button>)}</SearchGroup>}
  </section>;
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="search-group"><h2>{title}</h2><div>{children}</div></div>;
}

export function SafetyWorkspace() {
  const [data, setData] = useState<{ reports: Array<{ id: string; entityType: string; reason: string; status: string; decision?: string; time: string }>; blocked: Array<{ public_id: string; display_name: string; handle: string }>; muted: Array<{ public_id: string; display_name: string; handle: string }>; moderator: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const response = await fetch("/api/safety"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Güvenlik merkezi getirilemedi."); } })(); }, []);
  return <div className="workspace-view feature-workspace"><FeatureHeader eyebrow="GÜVENLİK MERKEZİ" title="Kontrol sende" description="Şikâyetlerinin durumunu izle; engellediğin ve sessize aldığın hesapları yönet."/>
    <section className="safety-principles"><article><span>01</span><h2>Şikâyet ve kanıt</h2><p>Gönderi, yorum, not, topluluk veya kullanıcı için olay anındaki içerik güvenli kayda alınır.</p></article><article><span>02</span><h2>İki yönlü engelleme</h2><p>Engellenen hesaplar birbirinin profilini, akışını ve etkileşim alanlarını göremez.</p></article><article><span>03</span><h2>Karar ve itiraz</h2><p>Moderasyon kararı geçmişi korunur; sonuçlanan kayıtlarda itiraz yolu açıktır.</p></article></section>
    {error && <p className="feature-error" role="alert">{error}</p>}
    {!data ? <EmptyState icon="…" title="Güvenlik merkezi hazırlanıyor" text="Hesabına ait kayıtlar getiriliyor."/> : <div className="safety-columns"><section><h2>Şikâyetlerin</h2>{data.reports.length ? data.reports.map((report) => <article key={report.id}><span className={`feature-status status-${report.status}`}>{report.status === 'open' ? 'İncelemede' : report.status === 'appealed' ? 'İtirazda' : 'Sonuçlandı'}</span><strong>{report.entityType} · {report.reason}</strong><small>{report.time} önce</small>{report.decision && <p>{report.decision}</p>}</article>) : <p className="feature-muted">Açık şikâyetin yok.</p>}</section><section><h2>Engellenenler</h2>{data.blocked.length ? data.blocked.map((user) => <article key={user.public_id}><strong>{user.display_name}</strong><small>@{user.handle}</small></article>) : <p className="feature-muted">Engellediğin hesap yok.</p>}<h2 className="safety-second-title">Sessize alınanlar</h2>{data.muted.length ? data.muted.map((user) => <article key={user.public_id}><strong>{user.display_name}</strong><small>@{user.handle}</small></article>) : <p className="feature-muted">Sessize aldığın hesap yok.</p>}</section></div>}
  </div>;
}

export function ProfileSafetyMenu({ targetId, targetName }: { targetId: string; targetName: string }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [state, setState] = useState("");

  async function toggle(action: "block" | "mute") {
    setState("İşlem uygulanıyor…");
    try {
      const response = await fetch("/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetId }) });
      const body = await response.json() as { active?: boolean; error?: string };
      if (!response.ok || typeof body.active !== "boolean") throw new Error(body.error ?? "İşlem tamamlanamadı.");
      if (action === "block") setBlocked(body.active);
      else setMuted(body.active);
      setState(body.active ? (action === "block" ? "Hesap engellendi. Artık birbirinizi göremezsiniz." : "Hesap sessize alındı. Paylaşımları akışında görünmeyecek.") : "Kısıtlama kaldırıldı.");
    } catch (actionError) { setState(actionError instanceof Error ? actionError.message : "İşlem tamamlanamadı."); }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("Şikâyet kaydediliyor…");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report", entityType: "user", entityId: targetId, reason: form.get("reason"), details: form.get("details") }) });
      const body = await response.json() as { report?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Şikâyet kaydedilemedi.");
      setState("Şikâyetin güvenli biçimde kaydedildi ve inceleme kuyruğuna alındı.");
      event.currentTarget.reset();
    } catch (reportError) { setState(reportError instanceof Error ? reportError.message : "Şikâyet kaydedilemedi."); }
  }

  return <><button className="profile-safety-trigger" type="button" onClick={() => setOpen(true)}>Güvenlik</button>{open && <div className="feature-overlay"><section className="feature-dialog profile-safety-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-safety-title"><header><div><span>GÖRÜNÜRLÜK VE ŞİKÂYET</span><h2 id="profile-safety-title">{targetName}</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header><div className="profile-safety-actions"><button type="button" className={muted ? "active" : ""} onClick={() => void toggle("mute")}><strong>{muted ? "Sessizi kaldır" : "Sessize al"}</strong><small>Gönderileri akışından çıkar.</small></button><button type="button" className={blocked ? "active danger" : "danger"} onClick={() => void toggle("block")}><strong>{blocked ? "Engeli kaldır" : "Engelle"}</strong><small>İki yönlü görünürlük ve etkileşimi kapat.</small></button></div><form onSubmit={report}><h3>Hesabı şikâyet et</h3><label>Neden<select name="reason" defaultValue="harassment"><option value="harassment">Taciz veya zorbalık</option><option value="spam">Spam</option><option value="privacy">Kişisel veri ihlali</option><option value="copyright">Telif ihlali</option><option value="misinformation">Yanıltıcı akademik içerik</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea name="details" maxLength={800} rows={4} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label><button className="feature-danger" type="submit">Şikâyeti gönder</button></form>{state && <p className="feature-feedback-state" role="status">{state}</p>}</section></div>}</>;
}
