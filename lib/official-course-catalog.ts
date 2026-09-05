/// <reference types="vite/client" />
import rawCatalog from "../data/official-course-catalog-2026.json";
import expansionIndex from "../data/course-catalog-index-2026.json";
import { getOfficialAcademicProgram } from "./academic-catalog";

export type OfficialCourseCatalogItem = {
  code: string;
  name: string;
  semester: number | null;
  offeredSemesters?: number[];
  year?: number;
  kind: "required" | "elective" | null;
  sourcePage?: number;
};

export type OfficialCourseProgram = {
  universityId: string;
  programId: string;
  programName: string;
  authority: string;
  sourceUrl: string;
  verifiedAt: string;
  curriculumPeriod?: string;
  coverage?: "partial" | "complete";
  sourceHash?: string;
  courses: OfficialCourseCatalogItem[];
};

type OfficialCourseCatalog = {
  meta: {
    version: string;
    updatedAt: string;
    method: string;
    limitations: string;
  };
  programs: Record<string, OfficialCourseProgram>;
};

export const officialCourseCatalog = rawCatalog as OfficialCourseCatalog;
export const officialCourseCatalogMeta = expansionIndex.meta;

type CourseCoverage = Pick<OfficialCourseProgram, "universityId" | "programId" | "programName" | "coverage"> & { courseCount: number };
const additionalPrograms = expansionIndex.programs as Record<string, CourseCoverage>;
const universityFiles = import.meta.glob<string>("../data/course-catalog/*.json", { query: "?raw", import: "default" });
const loadedUniversities = new Map<string, Promise<Record<string, OfficialCourseProgram>>>();

function loadUniversity(universityId: string) {
  const load = universityFiles[`../data/course-catalog/${universityId}.json`];
  if (!load) return undefined;
  let pending = loadedUniversities.get(universityId);
  if (!pending) {
    pending = load().then((text) => JSON.parse(text) as Record<string, OfficialCourseProgram>);
    loadedUniversities.set(universityId, pending);
    pending.catch(() => { if (loadedUniversities.get(universityId) === pending) loadedUniversities.delete(universityId); });
    if (loadedUniversities.size > 4) loadedUniversities.delete(loadedUniversities.keys().next().value!);
  }
  return pending;
}

export async function getOfficialCourseProgram(universityId: string, programId: string) {
  const programme = getOfficialAcademicProgram(universityId, programId);
  if (!programme) return undefined;
  const key = `${universityId}:${programId}`;
  const legacy = officialCourseCatalog.programs[key];
  const courseProgramme = legacy ?? (additionalPrograms[key] ? (await loadUniversity(universityId))?.[key] : undefined);
  if (!courseProgramme || courseProgramme.programName !== programme.name) return undefined;
  return courseProgramme;
}

export function getOfficialCourseCoverage() {
  return [
    ...Object.values(officialCourseCatalog.programs).map(({ courses, ...programme }) => ({ ...programme, courseCount: courses.length })),
    ...Object.values(additionalPrograms),
  ];
}
