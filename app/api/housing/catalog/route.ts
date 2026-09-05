import { getHousingDirectory, housingGenders, housingKinds, housingScopes } from "../../../../lib/housing-catalog";
import { cleanText, getRuntime, requireIdentity, requireProfile, signInResponse, unavailableResponse } from "../../../../lib/server-api";

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Konaklama rehberini görmek için giriş yapmalısın.");
  const params = new URL(request.url).searchParams;
  const kind = cleanText(params.get("kind"), 20);
  const scope = cleanText(params.get("scope"), 20);
  const gender = cleanText(params.get("gender"), 20);
  const page = Number(params.get("page") ?? "1");
  if ((kind && !housingKinds.has(kind)) || (scope && !housingScopes.has(scope)) || (gender && !housingGenders.has(gender)) || !Number.isSafeInteger(page) || page < 1) {
    return Response.json({ error: "Konaklama filtresi geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    // This is public source material: browsing another university does not change the profile
    // or grant access to that university's private housing discussions.
    const data = getHousingDirectory({ universityId: cleanText(params.get("universityId"), 140) || profile.university_id,
      campusId: cleanText(params.get("campusId"), 220), query: cleanText(params.get("q"), 100), kind, scope, gender, page });
    if (!data) return Response.json({ error: "Üniversite veya yerleşke bulunamadı." }, { status: 404 });
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return unavailableResponse(error, "Konaklama rehberi şu anda getirilemiyor.");
  }
}
