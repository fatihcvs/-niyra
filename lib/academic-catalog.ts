import rawCatalog from "../data/academic-catalog-2026.json";

export type AcademicDegreeLevel = "associate" | "bachelor" | "integrated-master" | "master" | "doctorate";

export type OfficialAcademicUnit = {
  id: string;
  name: string;
  type: string;
  officialCode?: string | null;
  validThrough?: string | null;
  sourceId?: string;
  reportUrls?: string[];
};

export type OfficialAcademicProgram = {
  id: string;
  unitId: string;
  name: string;
  degreeLevel: AcademicDegreeLevel;
  durationYears?: number | null;
  scoreType?: string | null;
  language?: string | null;
  officialCode?: string | null;
  optionCodes?: string[];
  options?: string[];
  accreditation?: string | null;
  validThrough?: string | null;
  curriculumUrls?: string[];
  curriculumAuthority?: string | null;
  curriculumPeriod?: string | null;
  reportUrls?: string[];
  sourceId: string;
};

type AcademicCatalogSource = {
  id: string;
  authority: string;
  title: string;
  url: string;
  sha256?: string;
};

type UniversityAcademicCatalog = {
  officialName: string;
  region: string;
  coverage: "official-programs" | "catalog-only";
  units: OfficialAcademicUnit[];
  programs: OfficialAcademicProgram[];
};

type AcademicCatalog = {
  meta: {
    version: string;
    updatedAt: string;
    method: string;
    limitations: string;
    stats: {
      universityCount: number;
      coveredUniversityCount: number;
      unitCount: number;
      programCount: number;
      curriculumLinkCount: number;
      catalogOnlyUniversityCount: number;
    };
    sources: AcademicCatalogSource[];
  };
  universities: Record<string, UniversityAcademicCatalog>;
};

export const academicCatalog = rawCatalog as unknown as AcademicCatalog;
export const academicCatalogMeta = academicCatalog.meta;

export function getOfficialAcademicCatalog(universityId: string) {
  return academicCatalog.universities[universityId];
}

export function getOfficialAcademicUnit(universityId: string, unitId: string) {
  return getOfficialAcademicCatalog(universityId)?.units.find((unit) => unit.id === unitId);
}

export function getOfficialAcademicProgram(universityId: string, programId: string) {
  return getOfficialAcademicCatalog(universityId)?.programs.find((program) => program.id === programId);
}

export function getOfficialAcademicSource(sourceId: string) {
  return academicCatalog.meta.sources.find((source) => source.id === sourceId);
}
