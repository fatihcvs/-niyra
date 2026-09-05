export type HousingKind = "public_dorm" | "private_dorm" | "university_dorm" | "dorm" | "hotel" | "hostel" | "guest_house" | "apartment";
export type HousingSource = { type: "government" | "university" | "operator" | "openstreetmap"; url: string; checkedAt: string };
export type HousingCampus = {
  id: string; universityId: string; name: string; city: string; region: string;
  latitude: number | null; longitude: number | null; address: string; sourceUrl: string;
};
export type HousingPlace = {
  id: string; name: string; kind: HousingKind; city: string; region: string; address: string;
  latitude: number | null; longitude: number | null; gender: "female" | "male" | "mixed" | "unknown";
  phone: string; website: string; capacity: number | null; features: string[]; description: string;
  universityIds: string[]; campusIds?: string[]; source: HousingSource; coordinateSourceUrl: string;
};
export type HousingResult = HousingPlace & { distanceMeters: number | null; campusName: string; relation: "nearby" | "university" | "city" };
export type HousingFilters = { universityId: string; campusId?: string; query?: string; kind?: string; gender?: string; scope?: string; page?: number };
export type HousingDirectoryResponse = {
  universities: { id: string; name: string }[];
  university: { id: string; name: string };
  campuses: HousingCampus[];
  selectedCampus: HousingCampus | null;
  places: HousingResult[];
  total: number; page: number; pageSize: number;
  counts: { nearby: number; university: number; city: number; public: number; private: number; other: number };
  checkedAt: string; scope: string;
  error?: string;
};
