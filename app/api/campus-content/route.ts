import { getRuntime, requireIdentity, requireProfile, signInResponse, unavailableResponse, relativeTime } from "../../../lib/server-api";
import type { CampusContent } from "../../../lib/campus-content";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Resolves one shared target independently of paginated lists and current UI filters. */
export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  const params = new URL(request.url).searchParams;
  const id = params.get("id")?.trim() ?? "", kind = params.get("kind");
  if (!id || id.length > 80 || /[\u0000-\u001f\u007f]/.test(id) || !["event", "listing"].includes(kind ?? "")) return json({ error: "İçerik bağlantısı geçerli değil." }, 400);
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return json({ error: "Önce akademik profilini tamamlamalısın." }, 409);
    if (kind === "listing") {
      const row = await DB.prepare(`SELECT ml.*, u.public_id AS owner_id, u.display_name AS owner_name,
          (SELECT COUNT(*) FROM marketplace_inquiries mi WHERE mi.listing_id = ml.id AND mi.status = 'open') AS inquiry_count
        FROM marketplace_listings ml JOIN users u ON u.email = ml.owner_email
        WHERE ml.id = ? AND ml.university_id = ? AND u.status = 'active'
          AND (ml.status IN ('active', 'reserved') OR ml.owner_email = ?)
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
            (b.blocker_email = ? AND b.blocked_email = ml.owner_email) OR (b.blocker_email = ml.owner_email AND b.blocked_email = ?)) LIMIT 1`)
        .bind(id, profile.university_id, identity.email, identity.email, identity.email).first<{
          id: string; kind: string; category: string; title: string; description: string; price_cents: number | null;
          condition: string; meetup_place: string; status: string; owner_email: string; owner_id: string; owner_name: string;
          created_at: string; updated_at: string; inquiry_count: number;
        }>();
      if (!row) return json({ error: "İlan kaldırılmış veya erişimine kapalı." }, 404);
      const images = await DB.prepare("SELECT id FROM marketplace_listing_images WHERE listing_id = ? ORDER BY sort_order, created_at, id LIMIT 6").bind(id).all<{ id: string }>();
      const content: CampusContent = { kind: "listing", item: {
        id: row.id, kind: row.kind, category: row.category, title: row.title, description: row.description,
        priceCents: row.price_cents, condition: row.condition, meetupPlace: row.meetup_place, status: row.status,
        ownerId: row.owner_id, ownerName: row.owner_name, own: row.owner_email === identity.email,
        images: images.results.map((image) => ({ id: image.id, url: `/api/campus-market/images?id=${encodeURIComponent(image.id)}` })),
        inquiryCount: Number(row.inquiry_count), time: relativeTime(row.created_at), updatedTime: relativeTime(row.updated_at),
      } };
      return json({ content });
    }
    const row = await DB.prepare(`SELECT ce.id, ce.title, ce.description, ce.starts_at, ce.ends_at, cp.name AS place_name,
        ce.creator_email, u.public_id AS owner_id, u.display_name AS owner_name
      FROM campus_events ce JOIN users u ON u.email = ce.creator_email
      LEFT JOIN campus_places cp ON cp.id = ce.place_id AND cp.university_id = ce.university_id AND cp.status = 'active'
      WHERE ce.id = ? AND ce.university_id = ? AND ce.status = 'active' AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
          (b.blocker_email = ? AND b.blocked_email = ce.creator_email) OR (b.blocker_email = ce.creator_email AND b.blocked_email = ?)) LIMIT 1`)
      .bind(id, profile.university_id, identity.email, identity.email).first<{
        id: string; title: string; description: string; starts_at: string; ends_at: string | null; place_name: string | null;
        creator_email: string; owner_id: string; owner_name: string;
      }>();
    if (!row) return json({ error: "Etkinlik kaldırılmış veya erişimine kapalı." }, 404);
    const content: CampusContent = { kind: "event", item: { id: row.id, title: row.title, description: row.description,
      startsAt: row.starts_at, endsAt: row.ends_at, placeName: row.place_name, ownerId: row.owner_id,
      ownerName: row.owner_name, own: row.creator_email === identity.email } };
    return json({ content });
  } catch (error) { return unavailableResponse(error, "İçerik şu anda getirilemiyor."); }
}
