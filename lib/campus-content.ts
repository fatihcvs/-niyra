export type CampusListing = {
  id: string; kind: string; category: string; title: string; description: string;
  priceCents: number | null; condition: string; meetupPlace: string; status: string;
  ownerId: string; ownerName: string; own: boolean; images: { id: string; url: string }[];
  inquiryCount: number; time: string; updatedTime: string;
};
export type CampusContent = { kind: "listing"; item: CampusListing } | {
  kind: "event"; item: { id: string; title: string; description: string; startsAt: string;
    endsAt: string | null; placeName: string | null; ownerId: string; ownerName: string; own: boolean };
};
export function campusEventTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(timestamp) : "Tarih belirtilmedi";
}
export function listingPrice(cents: number | null) {
  return cents === null ? "Fiyat konuşulur" : cents === 0 ? "Ücretsiz" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
