export type NotesCourse = { id: string; code: string; name: string };
export type NotesSource = "students" | "editorial";

export function notesLocation(search: string) {
  const params = new URLSearchParams(search);
  const id = (params.get("course") ?? "").trim().slice(0, 80);
  const code = (params.get("courseCode") ?? "").trim().slice(0, 40);
  const name = (params.get("courseName") ?? "").trim().slice(0, 240);
  return {
    course: params.get("view") === "notes" && id ? { id, code: code || "Seçilen ders", name } : null,
    source: (params.get("view") === "notes" && params.get("source") === "editorial" ? "editorial" : "students") as NotesSource,
  };
}

export function notesHref(course?: NotesCourse | null, source: NotesSource = "students") {
  const params = new URLSearchParams({ view: "notes" });
  if (course) {
    params.set("course", course.id);
    params.set("courseCode", course.code);
    if (course.name) params.set("courseName", course.name);
  }
  if (source === "editorial") params.set("source", source);
  return `/?${params}`;
}
