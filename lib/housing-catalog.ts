import catalogue from "../data/housing-catalog-2026.json" with { type: "json" };
import { universities } from "./university-catalog";
import type { HousingCampus, HousingDirectoryResponse, HousingFilters, HousingPlace, HousingResult } from "./housing-types";

const campuses = catalogue.campuses as HousingCampus[];
const places = catalogue.places as HousingPlace[];
const campusesByUniversity = new Map<string, HousingCampus[]>();
for (const campus of campuses) {
  const group = campusesByUniversity.get(campus.universityId) ?? [];
  group.push(campus);
  campusesByUniversity.set(campus.universityId, group);
}

export function housingDistance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function located<T extends { latitude: number | null; longitude: number | null }>(item: T): item is T & { latitude: number; longitude: number } {
  return item.latitude !== null && item.longitude !== null;
}

function fold(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i");
}

export const housingKinds = new Set(["public", "private", "university", "other"]);
export const housingScopes = new Set(["nearby", "city"]);
export const housingGenders = new Set(["female", "male", "mixed", "unknown"]);

export function getHousingDirectory(filters: HousingFilters): HousingDirectoryResponse | null {
  const university = universities.find((item) => item.id === filters.universityId);
  if (!university) return null;
  const universityCampuses = campusesByUniversity.get(university.id) ?? [];
  const campus = filters.campusId ? universityCampuses.find((item) => item.id === filters.campusId) : universityCampuses[0];
  if (filters.campusId && !campus) return null;
  const scope = filters.scope === "city" ? "city" : "nearby";
  const query = fold(filters.query?.trim() ?? "");
  const results: HousingResult[] = [];
  for (const place of places) {
    const belongs = place.universityIds.includes(university.id) && (!place.campusIds?.length || !!campus && place.campusIds.includes(campus.id));
    if (!belongs && (!campus || campus.region !== place.region)) continue;
    const rawDistance = campus && located(campus) && located(place) ? housingDistance(campus, place) : null;
    const nearby = rawDistance !== null && rawDistance <= catalogue.meta.maxNearbyMeters;
    const sameCity = campus?.city && fold(campus.city) === fold(place.city) && campus.region === place.region;
    if (!nearby && !belongs && !(sameCity && place.source.type !== "openstreetmap")) continue;
    results.push({ ...place, distanceMeters: rawDistance === null ? null : Math.round(rawDistance), campusName: campus?.name ?? "",
      relation: nearby ? "nearby" : belongs ? "university" : "city" });
  }
  const scoped = results.filter((p) => scope === "city" || p.relation !== "city");
  const counts = {
    nearby: results.filter((p) => p.relation === "nearby").length,
    university: results.filter((p) => p.relation === "university").length,
    city: results.filter((p) => p.relation === "city").length,
    public: scoped.filter((p) => p.kind === "public_dorm").length,
    private: scoped.filter((p) => p.kind === "private_dorm").length,
    other: scoped.filter((p) => !["public_dorm", "private_dorm", "university_dorm"].includes(p.kind)).length,
  };
  const filtered = scoped.filter((p) => !query || fold(`${p.name} ${p.address} ${p.city}`).includes(query))
    .filter((p) => !filters.gender || p.gender === filters.gender)
    .filter((p) => !filters.kind || (filters.kind === "public" ? p.kind === "public_dorm" : filters.kind === "private" ? p.kind === "private_dorm"
      : filters.kind === "university" ? p.kind === "university_dorm" : !["public_dorm", "private_dorm", "university_dorm"].includes(p.kind)))
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) || a.name.localeCompare(b.name, "tr"));
  const pageSize = 24;
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), Math.max(1, Math.ceil(filtered.length / pageSize)));
  return { universities: universities.map(({ id, name }) => ({ id, name })), university: { id: university.id, name: university.name },
    campuses: universityCampuses, selectedCampus: campus ?? null, places: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length, page, pageSize, counts, checkedAt: catalogue.meta.checkedAt, scope };
}
