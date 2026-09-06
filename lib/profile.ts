export type ProfileLink = {
  title: string;
  url: string;
};

export function parseProfileLinks(value: string | null | undefined): ProfileLink[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        title: typeof item.title === "string" ? item.title.trim().slice(0, 40) : "",
        url: typeof item.url === "string" ? item.url.trim().slice(0, 500) : "",
      }))
      .filter((item) => item.title && item.url)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function profileMediaUrl(
  publicId: string | null | undefined,
  kind: "avatar",
  updatedAt: string | null | undefined,
) {
  if (!publicId || !updatedAt || kind !== "avatar") return null;
  const query = new URLSearchParams({ user: publicId, kind, v: updatedAt });
  return `/api/profile/media?${query.toString()}`;
}
