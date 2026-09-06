import type { HousingDirectoryResponse, HousingResult } from "./housing-types";

export function housingCheckedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Kontrol tarihi belirtilmemiş";
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Kontrol tarihi belirtilmemiş";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function housingMapLink(place: HousingResult, campus: HousingDirectoryResponse["selectedCampus"]) {
  const located = (item: { latitude: number | null; longitude: number | null } | null): item is { latitude: number; longitude: number } => Boolean(item && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Math.abs(item.latitude!) <= 90 && Math.abs(item.longitude!) <= 180);
  if (!located(place)) return { directions: false, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address} ${place.city}`)}` };
  return { directions: true, url: `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}${located(campus) ? `&origin=${campus.latitude},${campus.longitude}` : ""}` };
}
