import {
  cleanText,
  getRuntime,
  relativeTime,
  requireIdentity,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Bildirimlerini görmek için giriş yapmalısın.");
  const kind = cleanText(new URL(request.url).searchParams.get("kind"), 30);
  try {
    const { DB } = await getRuntime();
    const [items, preferences] = await Promise.all([
      DB.prepare(
        `SELECT n.id, n.kind, n.title, n.body, n.entity_type, n.entity_id, n.read_at, n.created_at,
                u.public_id AS actor_id, u.display_name AS actor_name
         FROM notifications n LEFT JOIN users u ON u.email = n.actor_email
         WHERE n.user_email = ? AND (? = '' OR n.kind = ?)
         ORDER BY n.created_at DESC LIMIT 80`,
      ).bind(identity.email, kind, kind).all<{
        id: string; kind: string; title: string; body: string; entity_type: string | null; entity_id: string | null;
        read_at: string | null; created_at: string; actor_id: string | null; actor_name: string | null;
      }>(),
      DB.prepare(
        `SELECT interactions, courses, communities FROM notification_preferences WHERE user_email = ? LIMIT 1`,
      ).bind(identity.email).first<{ interactions: number; courses: number; communities: number }>(),
    ]);
    const notifications = items.results.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      body: item.body,
      entityType: item.entity_type,
      entityId: item.entity_id,
      read: Boolean(item.read_at),
      time: relativeTime(item.created_at),
      actorId: item.actor_id,
      actorName: item.actor_name,
    }));
    return Response.json({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      preferences: preferences
        ? { interactions: Boolean(preferences.interactions), courses: Boolean(preferences.courses), communities: Boolean(preferences.communities) }
        : { interactions: true, courses: true, communities: true },
    });
  } catch (error) {
    return unavailableResponse(error, "Bildirimlerine şu anda ulaşılamıyor.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Bildirimlerini değiştirmek için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Bildirim işlemi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 30);
  try {
    const { DB } = await getRuntime();
    if (action === "read-all") {
      await DB.prepare(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_email = ? AND read_at IS NULL`).bind(identity.email).run();
      return Response.json({ updated: true, unreadCount: 0 });
    }
    if (action === "read") {
      const id = cleanText(payload.id, 80);
      if (!id) return Response.json({ error: "Bildirim zorunludur." }, { status: 400 });
      await DB.prepare(`UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_email = ?`).bind(id, identity.email).run();
      return Response.json({ updated: true });
    }
    if (action === "preferences") {
      const interactions = payload.interactions === false ? 0 : 1;
      const courses = payload.courses === false ? 0 : 1;
      const communities = payload.communities === false ? 0 : 1;
      await DB.prepare(
        `INSERT INTO notification_preferences (user_email, interactions, courses, communities)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_email) DO UPDATE SET interactions = excluded.interactions,
           courses = excluded.courses, communities = excluded.communities, updated_at = CURRENT_TIMESTAMP`,
      ).bind(identity.email, interactions, courses, communities).run();
      return Response.json({ updated: true, preferences: { interactions: Boolean(interactions), courses: Boolean(courses), communities: Boolean(communities) } });
    }
    return Response.json({ error: "Bildirim işlemi desteklenmiyor." }, { status: 400 });
  } catch (error) {
    return unavailableResponse(error, "Bildirim işlemi şu anda tamamlanamadı.");
  }
}
