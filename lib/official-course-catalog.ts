import rawCatalog from "../data/official-course-catalog-2026.json";
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
export const officialCourseCatalogMeta = officialCourseCatalog.meta;

export function getOfficialCourseProgram(universityId: string, programId: string) {
  const programme = getOfficialAcademicProgram(universityId, programId);
  if (!programme) return undefined;
  const courseProgramme = officialCourseCatalog.programs[`${universityId}:${programId}`];
  if (!courseProgramme || courseProgramme.programName !== programme.name) return undefined;
  return courseProgramme;
}

export function getOfficialCourseCoverage() {
  return Object.values(officialCourseCatalog.programs);
}
