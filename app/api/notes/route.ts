import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  parseJsonArray,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedFiles: Record<string, { extensions: string[]; magic: (bytes: Uint8Array) => boolean }> = {
  "application/pdf": {
    extensions: ["pdf"],
    magic: (bytes) => String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-",
  },
  "image/png": {
    extensions: ["png"],
    magic: (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  },
  "image/jpeg": {
    extensions: ["jpg", "jpeg"],
    magic: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/webp": {
    extensions: ["webp"],
    magic: (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: ["docx"],
    magic: (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
  },
};

type NoteRow = {
  id: string;
  owner_id: string | null;
  owner_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  title: string;
  description: string;
  note_type: string;
  tags_json: string;
  original_file_name: string;
  content_type: string;
  byte_size: number;
  page_count: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  saved: number;
  save_count: number;
  view_count: number;
  own: number;
};

function serializeNote(row: NoteRow) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    title: row.title,
    description: row.description,
    noteType: row.note_type,
    tags: parseJsonArray(row.tags_json),
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    pageCount: row.page_count === null ? null : Number(row.page_count),
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    time: relativeTime(row.created_at),
    saved: Boolean(row.saved),
    saveCount: Number(row.save_count),
    viewCount: Number(row.view_count),
    own: Boolean(row.own),
    fileUrl: `/api/notes/file?id=${encodeURIComponent(row.id)}`,
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Not kütüphanesini kullanmak için giriş yapmalısın.");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"), 80);
  const query = cleanText(url.searchParams.get("q"), 80).toLocaleLowerCase("tr-TR");
  const courseId = cleanText(url.searchParams.get("courseId"), 80);
  const mine = url.searchParams.get("mine") === "1" ? 1 : 0;
  const saved = url.searchParams.get("saved") === "1" ? 1 : 0;

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });

    const baseSql = `
      SELECT n.id, u.public_id AS owner_id, u.display_name AS owner_name,
             n.course_id, c.code AS course_code, c.name AS course_name,
             n.title, n.description, n.note_type, n.tags_json,
             n.original_file_name, n.content_type, n.byte_size, n.page_count,
             n.status, n.rejection_reason, n.created_at,
             CASE WHEN ns.user_email IS NULL THEN 0 ELSE 1 END AS saved,
             (SELECT COUNT(*) FROM note_saves x WHERE x.note_id = n.id) AS save_count,
             (SELECT COUNT(*) FROM note_views x WHERE x.note_id = n.id) AS view_count,
             CASE WHEN n.owner_email = ? THEN 1 ELSE 0 END AS own
      FROM notes n
      JOIN users u ON u.email = n.owner_email
      JOIN student_profiles owner_profile ON owner_profile.user_email = n.owner_email
      JOIN courses c ON c.id = n.course_id
      LEFT JOIN note_saves ns ON ns.note_id = n.id AND ns.user_email = ?`;

    if (id) {
      const row = await DB
        .prepare(`${baseSql}
          WHERE n.id = ? AND n.deleted_at IS NULL
            AND (n.status = 'published' OR n.owner_email = ?)
            AND owner_profile.university_id = ?
            AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = n.owner_email) OR (b.blocker_email = n.owner_email AND b.blocked_email = ?))
          LIMIT 1`)
        .bind(identity.email, identity.email, id, identity.email, profile.university_id, identity.email, identity.email)
        .first<NoteRow>();
      return row
        ? Response.json({ note: serializeNote(row) })
        : Response.json({ error: "Not bulunamadı veya bu nota erişim iznin yok." }, { status: 404 });
    }

    const likeQuery = query ? `%${query}%` : "";
    const result = await DB
      .prepare(`${baseSql}
        WHERE n.deleted_at IS NULL
          AND (n.status = 'published' OR n.owner_email = ?)
          AND owner_profile.university_id = ?
          AND (? = '' OR n.course_id = ?)
          AND (? = 0 OR n.owner_email = ?)
          AND (? = 0 OR ns.user_email IS NOT NULL)
          AND (? = '' OR LOWER(n.title || ' ' || n.description || ' ' || n.tags_json || ' ' || c.code || ' ' || c.name || ' ' || u.display_name) LIKE ?)
          AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = n.owner_email) OR (b.blocker_email = n.owner_email AND b.blocked_email = ?))
        ORDER BY CASE WHEN n.status = 'published' THEN 0 ELSE 1 END, n.created_at DESC, n.id DESC
        LIMIT 40`)
      .bind(
        identity.email,
        identity.email,
        identity.email,
        profile.university_id,
        courseId,
        courseId,
        mine,
        identity.email,
        saved,
        likeQuery,
        likeQuery,
        identity.email,
        identity.email,
      )
      .all<NoteRow>();

    return Response.json({ notes: result.results.map(serializeNote) });
  } catch (error) {
    return unavailableResponse(error, "Not kütüphanesine şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Not yüklemek için giriş yapmalısın.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Yükleme bilgileri okunamadı." }, { status: 400 });
  }

  const file = form.get("file");
  const title = cleanText(form.get("title"), 120);
  const description = cleanText(form.get("description"), 600);
  const courseId = cleanText(form.get("courseId"), 80);
  const noteType = cleanText(form.get("noteType"), 40) || "ders-notu";
  const tags = cleanText(form.get("tags"), 240)
    .split(",")
    .map((tag) => tag.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean)
    .slice(0, 8);

  if (!(file instanceof File)) return Response.json({ error: "Yüklenecek dosyayı seçmelisin." }, { status: 400 });
  if (!title || title.length < 3) return Response.json({ error: "Not başlığı en az 3 karakter olmalı." }, { status: 400 });
  if (!courseId) return Response.json({ error: "Notun dersini seçmelisin." }, { status: 400 });
  if (!file.size || file.size > MAX_FILE_SIZE) return Response.json({ error: "Dosya 15 MB sınırını aşmamalı." }, { status: 413 });
  if (file.name.length > 140 || /[\\/\0]/.test(file.name)) return Response.json({ error: "Dosya adı geçerli değil." }, { status: 400 });

  const allowed = allowedFiles[file.type];
  const extension = file.name.split(".").at(-1)?.toLocaleLowerCase("tr-TR") ?? "";
  if (!allowed || !allowed.extensions.includes(extension)) {
    return Response.json({ error: "Yalnızca PDF, DOCX, PNG, JPG veya WEBP yükleyebilirsin." }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!allowed.magic(bytes)) return Response.json({ error: "Dosya içeriği bildirilen türle eşleşmiyor." }, { status: 415 });

  const id = crypto.randomUUID();
  const safeExtension = allowed.extensions[0];
  const objectKey = `notes/${identity.email.toLocaleLowerCase("en-US").replace(/[^a-z0-9@._-]/g, "_")}/${id}.${safeExtension}`;
  let metadataCreated = false;

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Not yüklemeden önce akademik profilini tamamlamalısın." }, { status: 409 });

    const course = await DB
      .prepare(
        `SELECT c.id FROM student_courses sc
         JOIN courses c ON c.id = sc.course_id
         WHERE sc.user_email = ? AND c.id = ? LIMIT 1`,
      )
      .bind(identity.email, courseId)
      .first<{ id: string }>();
    if (!course) return Response.json({ error: "Yalnızca kendi derslerinden birine not yükleyebilirsin." }, { status: 400 });

    const limit = await enforceRateLimit(DB, identity.email, "note-upload", 8, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    await DB
      .prepare(
        `INSERT INTO notes
         (id, owner_email, course_id, title, description, note_type, tags_json,
          object_key, original_file_name, content_type, byte_size, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')`,
      )
      .bind(
        id,
        identity.email,
        courseId,
        title,
        description,
        noteType,
        JSON.stringify(tags),
        objectKey,
        file.name,
        file.type,
        file.size,
      )
      .run();
    metadataCreated = true;

    await FILES.put(objectKey, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { noteId: id, owner: identity.email },
    });
    await DB
      .prepare(
        `UPDATE notes SET status = 'published', published_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_email = ?`,
      )
      .bind(id, identity.email)
      .run();
    await DB.prepare(
      `INSERT INTO notifications (id, user_email, actor_email, kind, title, body, entity_type, entity_id)
       SELECT LOWER(HEX(RANDOMBLOB(16))), sc.user_email, ?, 'course', ?, ?, 'note', ?
       FROM student_courses sc
       LEFT JOIN notification_preferences np ON np.user_email = sc.user_email
       WHERE sc.course_id = ? AND sc.user_email <> ? AND COALESCE(np.courses, 1) = 1`,
    ).bind(identity.email, `${title} notu yayınlandı`, `Takip ettiğin ders çevresine yeni bir kaynak eklendi.`, id, courseId, identity.email).run();
    await audit(DB, identity.email, "note.created", "note", id, { courseId, contentType: file.type, byteSize: file.size });
    const response = await GET(new Request(`${new URL(request.url).origin}/api/notes?id=${encodeURIComponent(id)}`, { headers: request.headers }));
    const payload = await response.json();
    return Response.json(payload, { status: 201 });
  } catch (error) {
    if (metadataCreated) {
      try {
        const { DB } = await getRuntime();
        await DB
          .prepare(
            `UPDATE notes SET status = 'rejected', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND owner_email = ?`,
          )
          .bind("Dosya aktarımı tamamlanamadı. Yeniden yüklemeyi dene.", id, identity.email)
          .run();
      } catch {
        // The primary error is returned below; a later cleanup can remove an incomplete metadata row.
      }
    }
    return unavailableResponse(error, "Not yüklenemedi. Dosyanı koruduk; yeniden deneyebilirsin.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Notunu silmek için giriş yapmalısın.");

  let payload: { id?: unknown };
  try {
    payload = (await request.json()) as { id?: unknown };
  } catch {
    return Response.json({ error: "Silinecek not bilgisi geçerli değil." }, { status: 400 });
  }
  const id = cleanText(payload.id, 80);
  if (!id) return Response.json({ error: "Silinecek not zorunludur." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const note = await DB
      .prepare(`SELECT object_key FROM notes WHERE id = ? AND owner_email = ? AND deleted_at IS NULL LIMIT 1`)
      .bind(id, identity.email)
      .first<{ object_key: string }>();
    if (!note) return Response.json({ error: "Not bulunamadı veya bu işlem için yetkin yok." }, { status: 404 });

    await DB.prepare(`UPDATE notes SET status = 'deleting', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
    await FILES.delete(note.object_key);
    await DB
      .prepare(`UPDATE notes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_email = ?`)
      .bind(id, identity.email)
      .run();
    await audit(DB, identity.email, "note.deleted", "note", id);
    return Response.json({ deleted: true, id });
  } catch (error) {
    return unavailableResponse(error, "Not şu anda silinemedi.");
  }
}
