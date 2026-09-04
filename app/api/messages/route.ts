import { sameOriginRequest } from "../../../lib/app-auth";
import { profileMediaUrl } from "../../../lib/profile";
import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  notify,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

type AttachmentType = "note" | "library" | "event" | "place" | "listing";
type AttachmentSnapshot = {
  title: string;
  subtitle: string;
  detail: string;
  section: "Notlar" | "Kütüphane" | "Kampüs" | "Pazar";
};
type ConversationMember = {
  id: string;
  university_id: string;
  member_one_email: string;
  member_two_email: string;
};

const ATTACHMENT_TYPES: AttachmentType[] = ["note", "library", "event", "place", "listing"];

function jsonNoStore(payload: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(payload, { ...init, headers });
}

function safeSnapshot(value: string | null | undefined): AttachmentSnapshot | null {
  try {
    const parsed = JSON.parse(value ?? "{}") as Partial<AttachmentSnapshot>;
    if (!parsed.title || !parsed.section) return null;
    return {
      title: String(parsed.title),
      subtitle: String(parsed.subtitle ?? ""),
      detail: String(parsed.detail ?? ""),
      section: parsed.section,
    };
  } catch {
    return null;
  }
}

async function conversationForMember(db: D1Database, id: string, email: string, universityId: string) {
  return db.prepare(
    `SELECT id, university_id, member_one_email, member_two_email
     FROM direct_conversations
     WHERE id = ? AND university_id = ? AND (member_one_email = ? OR member_two_email = ?)
     LIMIT 1`,
  ).bind(id, universityId, email, email).first<ConversationMember>();
}

async function isBlocked(db: D1Database, leftEmail: string, rightEmail: string) {
  return Boolean(await db.prepare(
    `SELECT 1 AS found FROM user_blocks
     WHERE (blocker_email = ? AND blocked_email = ?)
        OR (blocker_email = ? AND blocked_email = ?)
     LIMIT 1`,
  ).bind(leftEmail, rightEmail, rightEmail, leftEmail).first());
}

async function getAttachmentSnapshot(
  db: D1Database,
  type: AttachmentType,
  id: string,
  ownerEmail: string,
  universityId: string,
): Promise<AttachmentSnapshot | null> {
  if (type === "note") {
    const row = await db.prepare(
      `SELECT n.title, n.description, n.original_file_name, c.code
       FROM notes n JOIN courses c ON c.id = n.course_id
       JOIN departments d ON d.id = c.department_id
       JOIN faculties f ON f.id = d.faculty_id
       WHERE n.id = ? AND n.owner_email = ? AND f.university_id = ?
         AND n.status = 'published' AND n.deleted_at IS NULL
       LIMIT 1`,
    ).bind(id, ownerEmail, universityId).first<{ title: string; description: string; original_file_name: string; code: string }>();
    return row ? { title: row.title, subtitle: `${row.code} · Çalışma notu`, detail: row.description || row.original_file_name, section: "Notlar" } : null;
  }
  if (type === "library") {
    const row = await db.prepare(
      `SELECT name, floor_label, zone_label, description FROM library_areas
       WHERE id = ? AND creator_email = ? AND university_id = ? AND status = 'active' LIMIT 1`,
    ).bind(id, ownerEmail, universityId).first<{ name: string; floor_label: string; zone_label: string; description: string }>();
    return row ? { title: row.name, subtitle: ["Kütüphane", row.floor_label, row.zone_label].filter(Boolean).join(" · "), detail: row.description, section: "Kütüphane" } : null;
  }
  if (type === "event") {
    const row = await db.prepare(
      `SELECT title, description, category, starts_at FROM campus_events
       WHERE id = ? AND creator_email = ? AND university_id = ? AND status = 'active' LIMIT 1`,
    ).bind(id, ownerEmail, universityId).first<{ title: string; description: string; category: string; starts_at: string }>();
    return row ? { title: row.title, subtitle: `${row.category} · ${row.starts_at}`, detail: row.description, section: "Kampüs" } : null;
  }
  if (type === "place") {
    const row = await db.prepare(
      `SELECT name, category, description, address FROM campus_places
       WHERE id = ? AND creator_email = ? AND university_id = ? AND status = 'active' LIMIT 1`,
    ).bind(id, ownerEmail, universityId).first<{ name: string; category: string; description: string; address: string }>();
    return row ? { title: row.name, subtitle: [row.category, row.address].filter(Boolean).join(" · "), detail: row.description, section: "Kampüs" } : null;
  }
  const row = await db.prepare(
    `SELECT title, description, price_cents FROM marketplace_listings
     WHERE id = ? AND owner_email = ? AND university_id = ? AND status = 'active' LIMIT 1`,
  ).bind(id, ownerEmail, universityId).first<{ title: string; description: string; price_cents: number | null }>();
  const price = row?.price_cents == null ? "Fiyat belirtilmedi" : `${new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(row.price_cents / 100)}`;
  return row ? { title: row.title, subtitle: `Öğrenci mağazası · ${price}`, detail: row.description, section: "Pazar" } : null;
}

async function listShareables(db: D1Database, email: string, universityId: string) {
  const [notes, libraries, events, places, listings] = await Promise.all([
    db.prepare(
      `SELECT n.id, n.title, c.code AS meta, COALESCE(NULLIF(n.description, ''), n.original_file_name) AS detail
       FROM notes n JOIN courses c ON c.id = n.course_id
       JOIN departments d ON d.id = c.department_id
       JOIN faculties f ON f.id = d.faculty_id
       WHERE n.owner_email = ? AND f.university_id = ? AND n.status = 'published' AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC LIMIT 30`,
    ).bind(email, universityId).all(),
    db.prepare(
      `SELECT id, name AS title, TRIM(floor_label || ' ' || zone_label) AS meta, description AS detail
       FROM library_areas WHERE creator_email = ? AND university_id = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 30`,
    ).bind(email, universityId).all(),
    db.prepare(
      `SELECT id, title, category AS meta, description AS detail FROM campus_events
       WHERE creator_email = ? AND university_id = ? AND status = 'active'
       ORDER BY starts_at DESC LIMIT 30`,
    ).bind(email, universityId).all(),
    db.prepare(
      `SELECT id, name AS title, category AS meta, COALESCE(NULLIF(description, ''), address) AS detail
       FROM campus_places WHERE creator_email = ? AND university_id = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 30`,
    ).bind(email, universityId).all(),
    db.prepare(
      `SELECT id, title, category AS meta, description AS detail FROM marketplace_listings
       WHERE owner_email = ? AND university_id = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 30`,
    ).bind(email, universityId).all(),
  ]);
  return [
    ...notes.results.map((item) => ({ ...item, type: "note", section: "Notlar" })),
    ...libraries.results.map((item) => ({ ...item, type: "library", section: "Kütüphane" })),
    ...events.results.map((item) => ({ ...item, type: "event", section: "Kampüs" })),
    ...places.results.map((item) => ({ ...item, type: "place", section: "Kampüs" })),
    ...listings.results.map((item) => ({ ...item, type: "listing", section: "Pazar" })),
  ];
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Mesajlarını görmek için giriş yapmalısın.");
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return jsonNoStore({ error: "Mesajlaşmadan önce akademik profilini tamamlamalısın." }, { status: 409 });
    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      const row = await DB.prepare(
        `SELECT COUNT(*) AS count FROM direct_messages m
         JOIN direct_conversations c ON c.id = m.conversation_id
         WHERE (c.member_one_email = ? OR c.member_two_email = ?)
           AND m.sender_email <> ? AND m.read_at IS NULL AND m.deleted_at IS NULL
           AND c.university_id = ?
           AND EXISTS (SELECT 1 FROM student_profiles current_one WHERE current_one.user_email = c.member_one_email AND current_one.university_id = c.university_id)
           AND EXISTS (SELECT 1 FROM student_profiles current_two WHERE current_two.user_email = c.member_two_email AND current_two.university_id = c.university_id)
           AND NOT EXISTS (
             SELECT 1 FROM user_blocks b
             WHERE (b.blocker_email = c.member_one_email AND b.blocked_email = c.member_two_email)
                OR (b.blocker_email = c.member_two_email AND b.blocked_email = c.member_one_email)
           )`,
      ).bind(identity.email, identity.email, identity.email, profile.university_id).first<{ count: number }>();
      return jsonNoStore({ unreadCount: Number(row?.count ?? 0) });
    }

    const rows = await DB.prepare(
      `SELECT c.id, c.updated_at, c.last_message_at,
              u.public_id, u.display_name, u.handle, un.short_name AS university_short_name,
              d.name AS department_name, pm.updated_at AS avatar_updated_at,
              lm.body AS last_body, lm.attachment_snapshot AS last_attachment_snapshot,
              lm.sender_email AS last_sender_email, lm.created_at AS last_created_at,
              (SELECT COUNT(*) FROM direct_messages unread
               WHERE unread.conversation_id = c.id AND unread.sender_email <> ?
                 AND unread.read_at IS NULL AND unread.deleted_at IS NULL) AS unread_count
       FROM direct_conversations c
       JOIN users u ON u.email = CASE WHEN c.member_one_email = ? THEN c.member_two_email ELSE c.member_one_email END
       JOIN student_profiles sp ON sp.user_email = u.email
       JOIN universities un ON un.id = sp.university_id
       JOIN departments d ON d.id = sp.department_id
       LEFT JOIN profile_media pm ON pm.user_email = u.email AND pm.kind = 'avatar'
       LEFT JOIN direct_messages lm ON lm.id = (
         SELECT newest.id FROM direct_messages newest
         WHERE newest.conversation_id = c.id AND newest.deleted_at IS NULL
         ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1
       )
       WHERE (c.member_one_email = ? OR c.member_two_email = ?)
         AND c.university_id = ? AND sp.university_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = c.member_one_email AND b.blocked_email = c.member_two_email)
              OR (b.blocker_email = c.member_two_email AND b.blocked_email = c.member_one_email)
         )
       ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC LIMIT 100`,
    ).bind(identity.email, identity.email, identity.email, identity.email, profile.university_id, profile.university_id).all<{
      id: string; updated_at: string; last_message_at: string | null; public_id: string; display_name: string; handle: string;
      university_short_name: string; department_name: string; avatar_updated_at: string | null; last_body: string | null;
      last_attachment_snapshot: string | null; last_sender_email: string | null; last_created_at: string | null; unread_count: number;
    }>();
    const conversations = rows.results.map((row) => {
      const attachment = safeSnapshot(row.last_attachment_snapshot);
      return {
        id: row.id,
        person: {
          publicId: row.public_id,
          displayName: row.display_name,
          handle: row.handle,
          universityShortName: row.university_short_name,
          departmentName: row.department_name,
          avatarUrl: profileMediaUrl(row.public_id, "avatar", row.avatar_updated_at),
        },
        preview: row.last_body || attachment?.title || "Yeni konuşma",
        lastMessageOwn: row.last_sender_email === identity.email,
        unreadCount: Number(row.unread_count),
        time: relativeTime(row.last_created_at ?? row.last_message_at ?? row.updated_at),
      };
    });

    const conversationId = cleanText(url.searchParams.get("conversationId"), 80);
    let messages: Array<Record<string, unknown>> = [];
    if (conversationId) {
      const conversation = await conversationForMember(DB, conversationId, identity.email, profile.university_id);
      if (!conversation) return jsonNoStore({ error: "Konuşma bulunamadı." }, { status: 404 });
      const otherEmail = conversation.member_one_email === identity.email ? conversation.member_two_email : conversation.member_one_email;
      const currentPeer = await DB.prepare(`SELECT 1 AS found FROM student_profiles WHERE user_email = ? AND university_id = ? LIMIT 1`).bind(otherEmail, profile.university_id).first();
      if (!currentPeer) return jsonNoStore({ error: "Bu konuşma artık aynı kampüste değil." }, { status: 403 });
      if (await isBlocked(DB, identity.email, otherEmail)) return jsonNoStore({ error: "Bu konuşma kullanılamıyor." }, { status: 403 });
      const messageRows = await DB.prepare(
        `SELECT id, sender_email, body, attachment_type, attachment_id, attachment_snapshot,
                read_at, deleted_at, created_at
         FROM (SELECT * FROM direct_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 100)
         ORDER BY created_at ASC, id ASC`,
      ).bind(conversationId).all<{
        id: string; sender_email: string; body: string; attachment_type: string | null; attachment_id: string | null;
        attachment_snapshot: string; read_at: string | null; deleted_at: string | null; created_at: string;
      }>();
      messages = messageRows.results.map((row) => ({
        id: row.id,
        own: row.sender_email === identity.email,
        body: row.deleted_at ? "Bu mesaj moderasyon tarafından kaldırıldı." : row.body,
        attachmentType: row.deleted_at ? null : row.attachment_type,
        attachmentId: row.deleted_at ? null : row.attachment_id,
        attachment: row.deleted_at ? null : safeSnapshot(row.attachment_snapshot),
        read: Boolean(row.read_at),
        removed: Boolean(row.deleted_at),
        time: relativeTime(row.created_at),
      }));
    }

    const shareables = url.searchParams.get("includeShareables") === "1"
      ? await listShareables(DB, identity.email, profile.university_id)
      : undefined;
    return jsonNoStore({ conversations, messages, shareables, viewerId: profile.public_id });
  } catch (error) {
    return unavailableResponse(error, "Mesajlarına şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonNoStore({ error: "Güvenli olmayan mesaj isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Mesaj göndermek için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return jsonNoStore({ error: "Mesaj bilgisi geçerli değil." }, { status: 400 }); }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return jsonNoStore({ error: "Mesajlaşmadan önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "direct-message-send", 120, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    const body = cleanText(payload.body, 2000);
    const attachmentType = cleanText((payload.attachment as Record<string, unknown> | undefined)?.type, 20) as AttachmentType;
    const attachmentId = cleanText((payload.attachment as Record<string, unknown> | undefined)?.id, 80);
    if (!body && !attachmentId) return jsonNoStore({ error: "Bir mesaj yaz veya eklediğin içeriklerden birini seç." }, { status: 400 });
    if (attachmentId && !ATTACHMENT_TYPES.includes(attachmentType)) return jsonNoStore({ error: "Paylaşılan içerik türü desteklenmiyor." }, { status: 400 });
    const snapshot = attachmentId
      ? await getAttachmentSnapshot(DB, attachmentType, attachmentId, identity.email, profile.university_id)
      : null;
    if (attachmentId && !snapshot) return jsonNoStore({ error: "Yalnızca daha önce eklediğin ve yayında olan içerikleri paylaşabilirsin." }, { status: 403 });

    let conversationId = cleanText(payload.conversationId, 80);
    let conversation = conversationId ? await conversationForMember(DB, conversationId, identity.email, profile.university_id) : null;
    if (conversationId && !conversation) return jsonNoStore({ error: "Konuşma bulunamadı." }, { status: 404 });

    let otherEmail = conversation
      ? (conversation.member_one_email === identity.email ? conversation.member_two_email : conversation.member_one_email)
      : "";
    if (!conversation) {
      const recipientId = cleanText(payload.recipientId, 80);
      const recipient = await DB.prepare(
        `SELECT u.email FROM users u JOIN student_profiles sp ON sp.user_email = u.email
         WHERE u.public_id = ? AND u.email <> ? AND u.status = 'active'
           AND sp.university_id = ? AND sp.onboarding_completed = 1 LIMIT 1`,
      ).bind(recipientId, identity.email, profile.university_id).first<{ email: string }>();
      if (!recipient) return jsonNoStore({ error: "Mesaj gönderilecek öğrenci bulunamadı." }, { status: 404 });
      otherEmail = recipient.email;
      if (await isBlocked(DB, identity.email, otherEmail)) return jsonNoStore({ error: "Bu öğrenciyle mesajlaşamazsın." }, { status: 403 });
      const newConversationLimit = await enforceRateLimit(DB, identity.email, "direct-conversation-create", 20, 86400);
      if (!newConversationLimit.allowed) return rateLimitResponse(newConversationLimit.retryAfter);
      const [memberOne, memberTwo] = identity.email < otherEmail ? [identity.email, otherEmail] : [otherEmail, identity.email];
      conversationId = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO direct_conversations
         (id, university_id, member_one_email, member_two_email) VALUES (?, ?, ?, ?)
         ON CONFLICT(member_one_email, member_two_email)
         DO UPDATE SET university_id = excluded.university_id, updated_at = CURRENT_TIMESTAMP`,
      ).bind(conversationId, profile.university_id, memberOne, memberTwo).run();
      conversation = await DB.prepare(
        `SELECT id, university_id, member_one_email, member_two_email FROM direct_conversations
         WHERE member_one_email = ? AND member_two_email = ? AND university_id = ? LIMIT 1`,
      ).bind(memberOne, memberTwo, profile.university_id).first<ConversationMember>();
      if (!conversation) return jsonNoStore({ error: "Konuşma başlatılamadı." }, { status: 503 });
      conversationId = conversation.id;
    }
    const currentPeer = await DB.prepare(`SELECT 1 AS found FROM student_profiles WHERE user_email = ? AND university_id = ? LIMIT 1`).bind(otherEmail, profile.university_id).first();
    if (!currentPeer) return jsonNoStore({ error: "Bu öğrenci artık aynı kampüste değil." }, { status: 403 });
    if (await isBlocked(DB, identity.email, otherEmail)) return jsonNoStore({ error: "Bu öğrenciyle mesajlaşamazsın." }, { status: 403 });

    const messageId = crypto.randomUUID();
    const sentAt = new Date().toISOString();
    await DB.batch([
      DB.prepare(
        `INSERT INTO direct_messages
         (id, conversation_id, sender_email, body, attachment_type, attachment_id, attachment_snapshot, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(messageId, conversationId, identity.email, body, snapshot ? attachmentType : null, snapshot ? attachmentId : null, JSON.stringify(snapshot ?? {}), sentAt, sentAt),
      DB.prepare(
        `UPDATE direct_conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(sentAt, sentAt, conversationId),
    ]);
    await Promise.all([
      audit(DB, identity.email, "direct-message.sent", "direct-message", messageId, { conversationId, attachmentType: snapshot ? attachmentType : null }),
      notify(DB, {
        userEmail: otherEmail,
        actorEmail: identity.email,
        kind: "direct-message",
        title: `${profile.display_name} sana mesaj gönderdi`,
        body: body || snapshot?.title || "Paylaşılan içerik",
        entityType: "direct-message",
        entityId: messageId,
      }),
    ]);
    return jsonNoStore({
      conversationId,
      message: { id: messageId, own: true, body, attachmentType: snapshot ? attachmentType : null, attachmentId: snapshot ? attachmentId : null, attachment: snapshot, read: false, removed: false, time: "şimdi" },
    }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Mesaj şu anda gönderilemedi.");
  }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonNoStore({ error: "Güvenli olmayan mesaj isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return jsonNoStore({ error: "Okundu bilgisi geçerli değil." }, { status: 400 }); }
  const conversationId = cleanText(payload.conversationId, 80);
  if (cleanText(payload.action, 16) !== "read" || !conversationId) return jsonNoStore({ error: "Mesaj işlemi desteklenmiyor." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return jsonNoStore({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const conversation = await conversationForMember(DB, conversationId, identity.email, profile.university_id);
    if (!conversation) return jsonNoStore({ error: "Konuşma bulunamadı." }, { status: 404 });
    await DB.prepare(
      `UPDATE direct_messages SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE conversation_id = ? AND sender_email <> ? AND read_at IS NULL AND deleted_at IS NULL`,
    ).bind(conversationId, identity.email).run();
    return jsonNoStore({ read: true });
  } catch (error) {
    return unavailableResponse(error, "Okundu bilgisi şu anda kaydedilemedi.");
  }
}
