import { getUniversityById } from "../../../lib/academic-data";
import { getOfficialAcademicProgram } from "../../../lib/academic-catalog";
import { getOfficialCourseProgram, officialCourseCatalogMeta } from "../../../lib/official-course-catalog";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const universityId = url.searchParams.get("universityId")?.trim() ?? "";
  const programId = url.searchParams.get("programId")?.trim() ?? "";
  const university = getUniversityById(universityId);
  const programme = getOfficialAcademicProgram(universityId, programId);

  if (!university || !programme) {
    return Response.json({ error: "Geçerli bir üniversite ve program seçilmedi." }, { status: 400 });
  }

  const courseProgramme = getOfficialCourseProgram(universityId, programId);
  if (!courseProgramme) {
    return Response.json(
      {
        available: false,
        university: { id: university.id, name: university.name, shortName: university.shortName },
        program: { id: programme.id, name: programme.name },
        courses: [],
        limitations: officialCourseCatalogMeta.limitations,
      },
      { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
    );
  }

  return Response.json(
    {
      available: true,
      university: { id: university.id, name: university.name, shortName: university.shortName },
      program: { id: programme.id, name: programme.name },
      authority: courseProgramme.authority,
      sourceUrl: courseProgramme.sourceUrl,
      verifiedAt: courseProgramme.verifiedAt,
      coverage: courseProgramme.coverage ?? "complete",
      catalogVersion: officialCourseCatalogMeta.version,
      courses: courseProgramme.courses,
      limitations: officialCourseCatalogMeta.limitations,
    },
    { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
