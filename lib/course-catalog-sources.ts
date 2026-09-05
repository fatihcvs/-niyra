import sources from "../data/turkey-catalog-sources-2026.json";

export type CourseCatalogSource = { url: string; checkedAt: string };

export function getCourseCatalogSources(universityId: string): CourseCatalogSource[] {
  const universities = sources as Record<string, { catalogs: CourseCatalogSource[] }>;
  return (universities[universityId]?.catalogs ?? []).map(({ url, checkedAt }) => ({ url, checkedAt }));
}
