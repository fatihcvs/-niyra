// The service offered by a place takes precedence over the type of its building.
export function categoryFor(element, campusAnchor = false) {
  const tags = element.tags ?? {};
  if (["suburb", "neighbourhood", "quarter", "town", "village"].includes(tags.place)) return "area";
  if (tags.amenity === "library" || tags.building === "library") return "library";
  if (campusAnchor) return "building";
  if (["college", "research_institute"].includes(tags.amenity)
    || ["university", "college"].includes(tags.building)
    || ["educational_institution", "research"].includes(tags.office)) return "building";
  if (["coworking_space", "internet_cafe"].includes(tags.amenity)
    || ["books", "copyshop", "stationery"].includes(tags.shop)) return "study";
  if (["cafe", "restaurant", "fast_food", "food_court", "ice_cream"].includes(tags.amenity)) return "food";
  if (["sports_centre", "fitness_centre", "stadium", "sports_hall", "pitch", "swimming_pool", "fitness_station", "track", "ice_rink"].includes(tags.leisure)) return "sports";
  if (["park", "garden"].includes(tags.leisure)
    || ["community_centre", "cinema", "theatre", "arts_centre", "events_venue", "music_venue", "bar", "pub", "nightclub"].includes(tags.amenity)
    || ["museum", "gallery", "attraction"].includes(tags.tourism)) return "social";
  if (tags.public_transport || tags.highway === "bus_stop" || tags.railway
    || ["bus_station", "ferry_terminal", "taxi", "bicycle_rental"].includes(tags.amenity)) return "transport";
  if (["hospital", "clinic", "pharmacy", "doctors", "dentist"].includes(tags.amenity)) return "health";
  if (["supermarket", "convenience", "mall", "department_store", "laundry", "computer"].includes(tags.shop)
    || ["bank", "atm", "post_office", "parcel_locker", "police", "toilets"].includes(tags.amenity)) return "other";
  return null;
}
