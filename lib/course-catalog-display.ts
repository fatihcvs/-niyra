export type CourseSchedule = {
  semester: number | null;
  offeredSemesters?: number[];
  year?: number;
  kind: "required" | "elective" | null;
};

export function courseMatchesYear(course: CourseSchedule, year: number) {
  if (course.year !== undefined) return course.year === year;
  const semesters = course.offeredSemesters ?? (course.semester === null ? [] : [course.semester]);
  return semesters.some((semester) => Math.ceil(semester / 2) === year);
}

export function courseScheduleLabel(course: CourseSchedule) {
  const semesters = course.offeredSemesters ?? (course.semester === null ? [] : [course.semester]);
  const period = semesters.length ? `${semesters.join(", ")}. dönem` : "Dönemi belirtilmemiş";
  const kind = course.kind === "required" ? "Zorunlu" : course.kind === "elective" ? "Seçmeli" : "Türü belirtilmemiş";
  return `${period} · ${kind}`;
}
