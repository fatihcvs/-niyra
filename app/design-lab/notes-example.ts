import type { Note, NotesPreview } from "../product-features";

export const galleryCourses = [{ id: "lab-design", code: "TAS 101", name: "Tasarım İlkeleri ve Görsel İletişime Giriş" }];

/** Development gallery only. No request is delegated to fetch, XHR, storage or the clipboard. */
export function createNotesGalleryPreview(onUpload: () => void): NotesPreview {
  let notes: Note[] = [
    { id: "lab-note-a", title: "Görsel hiyerarşi ve tasarım ilkeleri", own: false, noteType: "ders-notu", description: "Galeri simülasyonu · Başlık, boşluk ve hizalama üzerine örnek çalışma notu." },
    { id: "lab-note-b", title: "Tasarım ilkeleri — dönem sonu çalışma soruları", own: true, noteType: "cikmis-soru", description: "Galeri simülasyonu · Gerçek sınav belgesi veya öğrenci verisi içermez." },
  ].map((item) => ({ ...item, ownerName: "Deniz · Galeri simülasyonu", courseId: "lab-design", courseCode: "TAS 101", courseName: galleryCourses[0].name, examYear: item.noteType === "cikmis-soru" ? 2026 : null, examTerm: "bahar", examKind: "final", tags: ["galeri"], originalFileName: "ornek.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteSize: 4096, pageCount: null, status: "published", rejectionReason: null, time: "Galeri örneği", saved: false, saveCount: 0, viewCount: 0, feedback: null, helpfulCount: 0, unhelpfulCount: 0, commentCount: 0, fileUrl: "" }));
  const comments = new Map<string, { id: string; content: string; authorName: string; initials: string; own: boolean; time: string }[]>();
  let sequence = 0;
  return { mode: "gallery", onUpload, async request(url, init) {
    const path = new URL(url, "http://gallery.invalid");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    if (path.pathname === "/api/notes" && !init.method) {
      return { notes: notes.filter((note) => (!path.searchParams.get("q") || `${note.title} ${note.courseName}`.toLocaleLowerCase("tr-TR").includes(path.searchParams.get("q")!.toLocaleLowerCase("tr-TR"))) && (!path.searchParams.has("courseId") || note.courseId === path.searchParams.get("courseId")) && (!path.searchParams.has("saved") || note.saved) && (!path.searchParams.has("mine") || note.own) && (!path.searchParams.has("noteType") || note.noteType === path.searchParams.get("noteType")) && (!path.searchParams.has("examYear") || String(note.examYear) === path.searchParams.get("examYear")) && (!path.searchParams.has("examKind") || note.examKind === path.searchParams.get("examKind"))) };
    }
    if (path.pathname === "/api/notes" && init.method === "DELETE") { notes = notes.filter((note) => note.id !== body.id); return { deleted: true }; }
    if (path.pathname === "/api/note-actions") {
      const note = notes.find((item) => item.id === body.id);
      if (!note) throw new Error("Galeri örneği bulunamadı.");
      if (body.type === "save") { note.saved = Boolean(body.active); note.saveCount = note.saved ? 1 : 0; return { active: note.saved, count: note.saveCount }; }
      note.feedback = body.active ? body.type : null; note.helpfulCount = note.feedback === "helpful" ? 1 : 0; note.unhelpfulCount = note.feedback === "unhelpful" ? 1 : 0;
      return { vote: note.feedback, helpfulCount: note.helpfulCount, unhelpfulCount: note.unhelpfulCount };
    }
    if (path.pathname === "/api/note-comments") {
      const id = body.noteId ?? path.searchParams.get("noteId");
      if (!init.method) return { comments: comments.get(id) ?? [] };
      if (init.method === "POST") { const comment = { id: `lab-comment-${++sequence}`, content: body.content, authorName: "Sen · Galeri simülasyonu", initials: "G", own: true, time: "şimdi" }; const items = [...(comments.get(id) ?? []), comment]; comments.set(id, items); return { comment, count: items.length }; }
      if (init.method === "DELETE") { for (const [target, items] of comments) { if (items.some((item) => item.id === body.id)) { const remaining = items.filter((item) => item.id !== body.id); comments.set(target, remaining); return { deleted: true, count: remaining.length }; } } }
    }
    throw new Error("Bu işlem galeri simülasyonunda desteklenmiyor.");
  } };
}
