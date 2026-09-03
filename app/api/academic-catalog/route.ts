import { academicCatalogMeta, getOfficialAcademicCatalog } from "../../../lib/academic-catalog";
import { getUniversityById } from "../../../lib/academic-data";

export async function GET(request: Request) {
  const universityId = new URL(request.url).searchParams.get("universityId")?.trim() ?? "";
  const university = getUniversityById(universityId);
  if (!university) {
    return Response.json({ error: "Geçerli bir üniversite seçilmedi." }, { status: 400 });
  }

  const catalog = getOfficialAcademicCatalog(university.id);
  if (!catalog) {
    return Response.json({ error: "Akademik katalog bulunamadı." }, { status: 404 });
  }

  const programCountByUnit = new Map<string, number>();
  for (const program of catalog.programs) {
    programCountByUnit.set(program.unitId, (programCountByUnit.get(program.unitId) ?? 0) + 1);
  }
  const selectableUnits = catalog.units
    .map((unit) => ({ ...unit, programCount: programCountByUnit.get(unit.id) ?? 0 }))
    .filter((unit) => unit.programCount > 0);
  const sourceIds = new Set(catalog.programs.map((program) => program.sourceId));

  return Response.json(
    {
      university: {
        id: university.id,
        name: university.name,
        shortName: university.shortName,
        region: university.region,
      },
      coverage: catalog.coverage,
      updatedAt: academicCatalogMeta.updatedAt,
      units: selectableUnits,
      referenceUnitCount: catalog.units.length - selectableUnits.length,
      programs: catalog.programs,
      sources: academicCatalogMeta.sources.filter((source) => sourceIds.has(source.id)),
      limitations: academicCatalogMeta.limitations,
    },
    { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
