import campusPlaceCatalog from "../data/campus-places-2026.json";

export type CuratedPlaceSource = {
  type: "official-university" | "openstreetmap";
  label: string;
  url: string;
  checkedAt: string;
  osmElement?: string;
  coordinateSource?: {
    type: "openstreetmap" | "wikidata";
    label: string;
    url: string;
  } | null;
};

type CatalogPlace = {
  id: string;
  universityId: string;
  name: string;
  category: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  accessibility: string[];
  openingHours: string;
  distanceMeters: number;
  campusName: string;
  source: CuratedPlaceSource;
};

const places = campusPlaceCatalog.places as CatalogPlace[];
const placesByUniversity = new Map<string, CatalogPlace[]>();

for (const place of places) {
  const universityPlaces = placesByUniversity.get(place.universityId) ?? [];
  universityPlaces.push(place);
  placesByUniversity.set(place.universityId, universityPlaces);
}

function fold(value: string) {
  return value.toLocaleLowerCase("tr-TR");
}

export function getCuratedCampusPlaces(universityId: string, filters: { category?: string; query?: string } = {}) {
  const query = fold(filters.query?.trim() ?? "");
  return (placesByUniversity.get(universityId) ?? [])
    .filter((place) => !filters.category || place.category === filters.category)
    .filter((place) => !query || fold(`${place.name} ${place.description} ${place.address} ${place.campusName}`).includes(query))
    .map((place) => ({
      id: place.id,
      name: place.name,
      category: place.category,
      description: place.description,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      coordinatesKnown: place.latitude !== null && place.longitude !== null,
      accessibility: place.accessibility,
      openingHours: place.openingHours,
      currentCount: 0,
      needsUpdateCount: 0,
      viewerState: null,
      verification: {
        label: place.source.type === "official-university" ? "Resmî kaynak" : "Açık harita kaydı",
        time: place.source.checkedAt,
      },
      own: false,
      updatedTime: "",
      curated: true,
      campusName: place.campusName,
      distanceMeters: place.distanceMeters,
      source: place.source,
    }));
}

export const campusPlaceCatalogMeta = campusPlaceCatalog.meta;
