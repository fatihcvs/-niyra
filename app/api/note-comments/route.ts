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

const COMMENT_LIMIT = 30;

type NoteAccess = {
  id: string;
  owner_email: string;
  title: string;
  owner_status: string;
};

type NoteCommentRow = {
  id: string;
  author_id: string | null;
  author_email: string;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
  avatar_updated_at: string | null;
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "K";
}

function serializeComment(row: NoteCommentRow, viewerEmail: string) {
  return {
    id: row.id,
    authorId: row.author_id ?? undefined,
    authorName: row.author_name,
    initials: initials(row.author_name),
    avatarUrl: profileMediaUrl(row.author_id, "avatar", row.avatar_updated_at),
    content: row.content,
    time: relativeTime(row.created_at),
    edited: row.updated_at !== row.created_at,
    own: row.author_email === viewerEmail,
  };
}

async function findAccessibleNote(db: D1Database, viewerEmail: string, universityId: string, noteId: string) {
  return db.prepare(
    `SELECT n.id, n.owner_email, n.title, owner.status AS owner_status
     FROM notes n
     JOIN users owner ON owner.email = n.owner_email
     LEFT JOIN student_profiles owner_profile ON owner_profile.user_email = n.owner_email
     WHERE n.id = ? AND n.deleted_at IS NULL
       AND ((owner.status = 'active' AND n.status = 'published') OR (owner.status = 'deleted' AND n.status = 'rejected'))
       AND CASE WHEN owner.status = 'deleted' THEN n.erased_university_id ELSE owner_profile.university_id END = ?
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_email = ? AND b.blocked_email = n.owner_email)
            OR (b.blocker_email = n.owner_email AND b.blocked_email = ?)
       )
     LIMIT 1`,
  ).bind(noteId, universityId, viewerEmail, viewerEmail).first<NoteAccess>();
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Not yorumlarını görmek için giriş yapmalısın.");
  const noteId = cleanText(new URL(request.url).searchParams.get("noteId"), 80);
  if (!noteId) return Response.json({ error: "Not zorunludur." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Yorumları görmeden önce akademik profilini tamamlamalısın." }, { status: 409 });
    const note = await findAccessibleNote(DB, identity.email, profile.university_id, noteId);
    if (!note) return Response.json({ error: "Not bulunamadı." }, { status: 404 });

    const rows = await DB.prepare(
      `SELECT nc.id, u.public_id AS author_id, nc.author_email, u.display_name AS author_name,
              nc.content, nc.created_at, nc.updated_at,
              (SELECT updated_at FROM profile_media pm WHERE pm.user_email = nc.author_email AND pm.kind = 'avatar' LIMIT 1) AS avatar_updated_at
       FROM note_comments nc
       JOIN users u ON u.email = nc.author_email
       WHERE nc.note_id = ? AND nc.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = nc.author_email)
              OR (b.blocker_email = nc.author_email AND b.blocked_email = ?)
         )
       ORDER BY nc.created_at DESC, nc.id DESC
       LIMIT ?`,
    ).bind(noteId, identity.email, identity.email, COMMENT_LIMIT + 1).all<NoteCommentRow>();
    const hasMore = rows.results.length > COMMENT_LIMIT;
    const comments = rows.results.slice(0, COMMENT_LIMIT).reverse().map((row) => serializeComment(row, identity.email));
    return Response.json({ comments, hasMore });
  } catch (error) {
    return unavailableResponse(error, "Not yorumlarına şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Yorum yapmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Yorum bilgisi geçerli değil." }, { status: 400 }); }
  const noteId = cleanText(payload.noteId, 80);
  const rawContent = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!noteId) return Response.json({ error: "Not zorunludur." }, { status: 400 });
  if (rawContent.length < 2 || rawContent.length > 500) return Response.json({ error: "Yorum 2–500 karakter arasında olmalı." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Yorum yapmadan önce akademik profilini tamamlamalısın." }, { status: 409 });
    const note = await findAccessibleNote(DB, identity.email, profile.university_id, noteId);
    if (!note) return Response.json({ error: "Not bulunamadı." }, { status: 404 });
    if (note.owner_status === "deleted") return Response.json({ error: "Silinen notun mevcut yorumları yalnızca okunabilir." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "note-comment", 20, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    const id = crypto.randomUUID();
    const created = await DB.prepare(
      `INSERT INTO note_comments (id, note_id, author_email, content)
       SELECT ?, n.id, ?, ? FROM notes n JOIN users owner ON owner.email = n.owner_email
       WHERE n.id = ? AND n.status = 'published' AND n.deleted_at IS NULL AND owner.status = 'active'
         AND EXISTS (SELECT 1 FROM users actor WHERE actor.email = ? AND actor.status = 'active')`,
    ).bind(id, identity.email, rawContent, noteId, identity.email).run();
    if (!created.meta.changes) return Response.json({ error: "Not veya hesabın durumu değişti. Yorum gönderilmedi." }, { status: 409 });
    const row = await DB.prepare(
      `SELECT nc.id, u.public_id AS author_id, nc.author_email, u.display_name AS author_name,
              nc.content, nc.created_at, nc.updated_at,
              (SELECT updated_at FROM profile_media pm WHERE pm.user_email = nc.author_email AND pm.kind = 'avatar' LIMIT 1) AS avatar_updated_at
       FROM note_comments nc JOIN users u ON u.email = nc.author_email WHERE nc.id = ? LIMIT 1`,
    ).bind(id).first<NoteCommentRow>();
    if (!row) throw new Error("Oluşturulan not yorumu okunamadı.");
    const count = await DB.prepare(
      `SELECT COUNT(*) AS total FROM note_comments WHERE note_id = ? AND deleted_at IS NULL`,
    ).bind(noteId).first<{ total: number }>();
    await audit(DB, identity.email, "note-comment.created", "note-comment", id, { noteId });
    await notify(DB, {
      userEmail: note.owner_email,
      actorEmail: identity.email,
      kind: "interaction",
      title: `${profile.display_name} notuna yorum yaptı`,
      body: rawContent.slice(0, 120),
      entityType: "note",
      entityId: noteId,
    });
    return Response.json({ comment: serializeComment(row, identity.email), count: Number(count?.total ?? 0) }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Yorum şu anda paylaşılamadı.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Yorumu silmek için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Yorum bilgisi geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  if (!id) return Response.json({ error: "Yorum zorunludur." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const deleted = await DB.prepare(
      `UPDATE note_comments SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND author_email = ? AND deleted_at IS NULL RETURNING note_id`,
    ).bind(id, identity.email).first<{ note_id: string }>();
    if (!deleted) return Response.json({ error: "Yorum bulunamadı veya bu işlem için yetkin yok." }, { status: 404 });
    const count = await DB.prepare(
      `SELECT COUNT(*) AS total FROM note_comments WHERE note_id = ? AND deleted_at IS NULL`,
    ).bind(deleted.note_id).first<{ total: number }>();
    await audit(DB, identity.email, "note-comment.deleted", "note-comment", id, { noteId: deleted.note_id });
    return Response.json({ deleted: true, id, count: Number(count?.total ?? 0) });
  } catch (error) {
    return unavailableResponse(error, "Yorum şu anda silinemedi.");
  }
}
