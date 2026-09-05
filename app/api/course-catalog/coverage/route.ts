import coverage from "../../../../data/turkey-catalog-coverage-2026.json";
import { getOfficialAcademicCatalog } from "../../../../lib/academic-catalog";
import { getCourseCatalogSources } from "../../../../lib/course-catalog-sources";

export function GET(request: Request) {
  const universityId = new URL(request.url).searchParams.get("universityId")?.trim();
  const headers = { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" };
  if (!universityId) {
    return Response.json({ checkedAt: coverage.checkedAt, universities: coverage.universities.map((u) => ({
      universityId: u.universityId, name: u.name, programCount: u.programCount,
      structuredProgramCount: u.structuredProgramCount, courseCount: u.courseCount,
      missingProgramCount: u.missingProgramIds.length,
    })) }, { headers });
  }
  const university = coverage.universities.find((u) => u.universityId === universityId);
  const academic = getOfficialAcademicCatalog(universityId);
  if (!university || !academic) return Response.json({ error: "Üniversite bulunamadı." }, { status: 404 });
  const missing = new Set(university.missingProgramIds);
  const units = new Map(academic.units.map((u) => [u.id, u.name]));
  return Response.json({ checkedAt: coverage.checkedAt, universityId,
    catalogs: getCourseCatalogSources(universityId),
    missingPrograms: academic.programs.filter((p) => missing.has(p.id)).map((p) => ({
      id: p.id, name: p.name, unit: units.get(p.unitId) ?? "", degreeLevel: p.degreeLevel,
      reason: (university.missingReasons as Record<string, string>)[p.id],
      curriculumUrls: p.curriculumUrls ?? [],
    })),
  }, { headers });
}
