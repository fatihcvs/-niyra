import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  courses,
  departments,
  postComments,
  postLikes,
  postSaves,
  posts,
  studentCourses,
  studentProfiles,
  universities,
  userFollows,
  users,
} from "../../../db/schema";
import { audit, enforceRateLimit, getRuntime, rateLimitResponse } from "../../../lib/server-api";
import { profileMediaUrl } from "../../../lib/profile";
import { sameOriginRequest } from "../../../lib/app-auth";
import { hydratePostMedia, POST_VIDEO_MAX_BYTES, PostMediaValidationError, postMediaUrl, validatePostMedia } from "../../../lib/post-media";

type PostPayload = {
  audience?: "campus" | "platform";
  id?: string;
  content?: string;
  courseId?: string | null;
};

type FeedKind = "all" | "following" | "campus" | "saved";
type FeedCursor = { rank: number; createdAt: string; id: string };

type PostRow = {
  audience: "campus" | "platform";
  id: string;
  authorId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  universityName: string;
  departmentName: string;
  courseCode: string | null;
  likeCount: number;
  commentCount: number;
  likedByViewer: number;
  savedByViewer: number;
  rank: number;
  avatarUpdatedAt: string | null;
};

const PAGE_SIZE = 12;

function signInResponse() {
  return Response.json(
    { error: "Gönderileri kullanmak için giriş yapmalısın." },
    { status: 401 },
  );
}

function postError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  return Response.json(
    {
      error: detail.includes("no such table") || detail.includes("no such column")
        ? "Gönderi alanı hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Gönderi işlemi şu anda tamamlanamadı.",
    },
    { status: 503 },
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("") || "Ü";
}

function relativeTime(createdAt: string) {
  const created = new Date(createdAt.replace(" ", "T") + (createdAt.includes("Z") ? "" : "Z"));
  const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60_000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

function feedRank() {
  return sql<number>`CAST(STRFTIME('%s', ${posts.createdAt}) AS INTEGER)`;
}

function postFields(viewerEmail: string, rank: ReturnType<typeof feedRank>) {
  return {
    id: posts.id,
    audience: posts.audience,
    authorId: users.publicId,
    content: posts.content,
    createdAt: posts.createdAt,
    updatedAt: posts.updatedAt,
    displayName: users.displayName,
    universityName: universities.name,
    departmentName: departments.name,
    courseCode: courses.code,
    likeCount: sql<number>`(SELECT COUNT(*) FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`,
    commentCount: sql<number>`(SELECT COUNT(*) FROM ${postComments} WHERE ${postComments.postId} = ${posts.id} AND ${postComments.deletedAt} IS NULL)`,
    likedByViewer: sql<number>`EXISTS (SELECT 1 FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id} AND ${postLikes.userEmail} = ${viewerEmail})`,
    savedByViewer: sql<number>`EXISTS (SELECT 1 FROM ${postSaves} WHERE ${postSaves.postId} = ${posts.id} AND ${postSaves.userEmail} = ${viewerEmail})`,
    avatarUpdatedAt: sql<string | null>`(SELECT updated_at FROM profile_media WHERE user_email = ${users.email} AND kind = 'avatar' LIMIT 1)`,
    rank,
  };
}

function serializePost(row: PostRow) {
  return {
    id: row.id,
    audience: row.audience,
    authorId: row.authorId ?? undefined,
    name: row.displayName,
    initials: initials(row.displayName),
    avatarClass: "avatar-violet",
    avatarUrl: profileMediaUrl(row.authorId, "avatar", row.avatarUpdatedAt),
    school: row.universityName,
    department: row.departmentName,
    time: relativeTime(row.createdAt),
    course: row.courseCode ?? (row.audience === "platform" ? "GENEL" : "KAMPÜS"),
    text: row.content,
    edited: row.updatedAt !== row.createdAt,
    likes: Number(row.likeCount),
    comments: Number(row.commentCount),
    liked: Number(row.likedByViewer) > 0,
    saved: Number(row.savedByViewer) > 0,
  };
}

async function readLatestPosts(
  viewerEmail: string,
  viewerUniversityId: string,
  feed: FeedKind,
  cursor: FeedCursor | null,
) {
  const db = await getDb();
  const audienceVisibility = sql<boolean>`(${universities.id} = ${viewerUniversityId} OR (${posts.audience} = 'platform' AND ${posts.communityId} IS NULL AND ${posts.courseId} IS NULL))`;
  const scopeVisibility = feed === "all" ? sql<boolean>`${posts.audience} = 'platform' AND ${posts.communityId} IS NULL AND ${posts.courseId} IS NULL`
    : feed === "campus" ? eq(universities.id, viewerUniversityId) : sql<boolean>`1 = 1`;
  const feedVisibility = feed === "following"
    ? sql<boolean>`EXISTS (SELECT 1 FROM ${userFollows} WHERE ${userFollows.followerEmail} = ${viewerEmail} AND ${userFollows.followingEmail} = ${posts.authorEmail})`
    : feed === "saved"
      ? sql<boolean>`EXISTS (SELECT 1 FROM ${postSaves} WHERE ${postSaves.userEmail} = ${viewerEmail} AND ${postSaves.postId} = ${posts.id})`
    : sql<boolean>`1 = 1`;
  const safetyVisibility = sql<boolean>`
    NOT EXISTS (
      SELECT 1 FROM user_blocks b
      WHERE (b.blocker_email = ${viewerEmail} AND b.blocked_email = ${posts.authorEmail})
         OR (b.blocker_email = ${posts.authorEmail} AND b.blocked_email = ${viewerEmail})
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_mutes m
      WHERE m.muter_email = ${viewerEmail} AND m.muted_email = ${posts.authorEmail}
    )`;
  const communityVisibility = sql<boolean>`
    (${posts.communityId} IS NULL
    OR EXISTS (
      SELECT 1 FROM communities c
      WHERE c.id = ${posts.communityId} AND c.status = 'active' AND c.moderation_status = 'active'
        AND (c.university_id IS NULL OR c.university_id = ${viewerUniversityId})
        AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ${viewerEmail})
        AND (
          c.join_policy = 'open'
          OR EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.community_id = c.id AND cm.user_email = ${viewerEmail} AND cm.status = 'active'
          )
        )
    ))`;
  const rank = feedRank();
  const cursorVisibility = cursor
    ? sql<boolean>`(
        ${rank} < ${cursor.rank}
        OR (${rank} = ${cursor.rank} AND ${posts.createdAt} < ${cursor.createdAt})
        OR (${rank} = ${cursor.rank} AND ${posts.createdAt} = ${cursor.createdAt} AND ${posts.id} < ${cursor.id})
      )`
    : sql<boolean>`1 = 1`;
  const rows = await db
    .select(postFields(viewerEmail, rank))
    .from(posts)
    .innerJoin(users, eq(posts.authorEmail, users.email))
    .innerJoin(studentProfiles, eq(posts.authorEmail, studentProfiles.userEmail))
    .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
    .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
    .leftJoin(courses, eq(posts.courseId, courses.id))
    .where(and(isNull(posts.deletedAt), eq(users.status, "active"), audienceVisibility, scopeVisibility, feedVisibility, safetyVisibility, communityVisibility, cursorVisibility))
    .orderBy(desc(rank), desc(posts.createdAt), desc(posts.id))
    .limit(PAGE_SIZE + 1);

  const pageRows = rows.slice(0, PAGE_SIZE);
  const { DB } = await getRuntime();
  const mediaByPost = await hydratePostMedia(DB, pageRows.map((row) => row.id));
  const pagePosts = pageRows.map((row) => ({ ...serializePost(row), media: mediaByPost.get(row.id) ?? [] }));
  const lastRow = pageRows.at(-1);

  return {
    posts: pagePosts,
    nextCursor: rows.length > PAGE_SIZE && lastRow
      ? `${Number(lastRow.rank)}::${lastRow.createdAt}::${lastRow.id}`
      : null,
  };
}

async function readSharedPost(viewerEmail: string, viewerUniversityId: string, postId: string) {
  const db = await getDb();
  const rank = sql<number>`0`;
  const [row] = await db
    .select(postFields(viewerEmail, rank))
    .from(posts)
    .innerJoin(users, eq(posts.authorEmail, users.email))
    .innerJoin(studentProfiles, eq(posts.authorEmail, studentProfiles.userEmail))
    .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
    .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
    .leftJoin(courses, eq(posts.courseId, courses.id))
    .where(and(
      eq(posts.id, postId),
      isNull(posts.deletedAt),
      eq(users.status, "active"),
      sql<boolean>`(${universities.id} = ${viewerUniversityId} OR (${posts.audience} = 'platform' AND ${posts.communityId} IS NULL AND ${posts.courseId} IS NULL))`,
      sql<boolean>`NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_email = ${viewerEmail} AND b.blocked_email = ${posts.authorEmail})
           OR (b.blocker_email = ${posts.authorEmail} AND b.blocked_email = ${viewerEmail})
      )`,
      sql<boolean>`
        (${posts.communityId} IS NULL
        OR EXISTS (
          SELECT 1 FROM communities c
          WHERE c.id = ${posts.communityId} AND c.status = 'active' AND c.moderation_status = 'active'
            AND (c.university_id IS NULL OR c.university_id = ${viewerUniversityId})
            AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ${viewerEmail})
            AND (c.join_policy = 'open' OR EXISTS (
              SELECT 1 FROM community_members cm
              WHERE cm.community_id = c.id AND cm.user_email = ${viewerEmail} AND cm.status = 'active'
            ))
        ))`,
    ))
    .limit(1);

  if (!row) return null;
  const { DB } = await getRuntime();
  const mediaByPost = await hydratePostMedia(DB, [row.id]);
  return { ...serializePost(row), media: mediaByPost.get(row.id) ?? [] };
}

export async function GET(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  const requestUrl = new URL(request.url);
  const requestedFeed = requestUrl.searchParams.get("feed");
  const feed: FeedKind = requestedFeed === "following" || requestedFeed === "campus" || requestedFeed === "saved"
    ? requestedFeed
    : "all";
  const sharedPostId = requestUrl.searchParams.get("id")?.trim() ?? "";
  if (sharedPostId) {
    if (sharedPostId.length > 80) {
      return Response.json({ error: "Gönderi bağlantısı geçerli değil." }, { status: 400 });
    }
    try {
      const db = await getDb();
      const [viewer] = await db.select({ universityId: studentProfiles.universityId }).from(studentProfiles).where(eq(studentProfiles.userEmail, identity.email)).limit(1);
      if (!viewer) return Response.json({ error: "Akışı görmeden önce akademik profilini tamamlamalısın." }, { status: 409 });
      const post = await readSharedPost(identity.email, viewer.universityId, sharedPostId);
      return post
        ? Response.json({ post })
        : Response.json({ error: "Paylaşılan gönderi bulunamadı." }, { status: 404 });
    } catch (error) {
      return postError(error);
    }
  }
  const rawCursor = requestUrl.searchParams.get("cursor");
  let cursor: FeedCursor | null = null;
  if (rawCursor) {
    const parts = rawCursor.split("::");
    const rank = Number(parts[0]);
    const createdAt = parts[1] ?? "";
    const id = parts[2] ?? "";
    if (parts.length !== 3 || !Number.isSafeInteger(rank) || rank < 0 || rank > 10_000_000_000 || !createdAt || !id || createdAt.length > 40 || id.length > 80) {
      return Response.json({ error: "Akış imleci geçerli değil." }, { status: 400 });
    }
    cursor = { rank, createdAt, id };
  }

  try {
    const db = await getDb();
    const [viewer] = await db.select({ universityId: studentProfiles.universityId }).from(studentProfiles).where(eq(studentProfiles.userEmail, identity.email)).limit(1);
    if (!viewer) return Response.json({ error: "Akışı görmeden önce akademik profilini tamamlamalısın." }, { status: 409 });
    return Response.json(await readLatestPosts(identity.email, viewer.universityId, feed, cursor));
  } catch (error) {
    return postError(error);
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan gönderi isteği reddedildi." }, { status: 403 });
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: PostPayload;
  let mediaFile: File | null = null;
  try {
    if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      const bodySize = Number(request.headers.get("content-length"));
      if (bodySize > POST_VIDEO_MAX_BYTES + 64 * 1024) {
        return Response.json({ error: "Paylaşım dosyası en fazla 20 MB olabilir." }, { status: 413 });
      }
      const formData = await request.formData();
      const files = formData.getAll("media");
      if (files.length > 1 || (files.length === 1 && !(files[0] instanceof File))) {
        return Response.json({ error: "Her gönderiye bir görsel veya video ekleyebilirsin." }, { status: 400 });
      }
      mediaFile = files[0] instanceof File ? files[0] : null;
      payload = { audience: (formData.get("audience") ?? undefined) as PostPayload["audience"], content: formData.get("content") as string | undefined, courseId: formData.get("courseId") as string | null };
    } else {
      payload = (await request.json()) as PostPayload;
    }
    if (!payload || typeof payload !== "object") throw new Error("Invalid post payload");
  } catch {
    return Response.json({ error: "Geçerli bir gönderi bilgisi gönderilmedi." }, { status: 400 });
  }

  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if ((!content && !mediaFile) || content.length > 1200) {
    return Response.json(
      { error: "Bir yazı, görsel veya video eklemelisin. Yazı en fazla 1200 karakter olabilir." },
      { status: 400 },
    );
  }
  if (payload.courseId !== null && payload.courseId !== undefined && typeof payload.courseId !== "string") {
    return Response.json({ error: "Ders çevresi bilgisi geçerli değil." }, { status: 400 });
  }

  if (payload.audience !== undefined && payload.audience !== "campus" && payload.audience !== "platform") {
    return Response.json({ error: "Paylaşım kitlesi geçerli değil." }, { status: 400 });
  }
  const audience = payload.audience ?? "campus";
  if (audience === "platform" && payload.courseId?.trim()) {
    return Response.json({ error: "Ders çevresi paylaşımları kampüs içinde kalır. Genel Akış için ders seçimini kaldır." }, { status: 400 });
  }

  let uploadedKey = "";
  let committed = false;
  try {
    const { DB, FILES } = await getRuntime();
    const limit = await enforceRateLimit(DB, identity.email, "post-create", 30, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const db = await getDb();
    const [profile] = await db
      .select({
        authorId: users.publicId,
        universityName: universities.name,
        departmentName: departments.name,
        avatarUpdatedAt: sql<string | null>`(SELECT updated_at FROM profile_media WHERE user_email = ${users.email} AND kind = 'avatar' LIMIT 1)`,
      })
      .from(studentProfiles)
      .innerJoin(users, eq(studentProfiles.userEmail, users.email))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .where(
        and(eq(studentProfiles.userEmail, identity.email), eq(studentProfiles.onboardingCompleted, true)),
      )
      .limit(1);

    if (!profile) {
      return Response.json(
        { error: "Gönderi paylaşmadan önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }

    const attachment = mediaFile ? await validatePostMedia(mediaFile) : null;
    if (attachment && !FILES) throw new Error("R2 binding FILES is unavailable");

    let selectedCourse: { id: string; code: string } | null = null;
    const requestedCourseId = typeof payload.courseId === "string" ? payload.courseId.trim() : "";
    if (requestedCourseId) {
      const [course] = await db
        .select({ id: courses.id, code: courses.code })
        .from(studentCourses)
        .innerJoin(courses, eq(studentCourses.courseId, courses.id))
        .where(
          and(
            eq(studentCourses.userEmail, identity.email),
            eq(studentCourses.courseId, requestedCourseId),
          ),
        )
        .limit(1);

      if (!course) {
        return Response.json(
          { error: "Yalnızca kendi ders çevrelerinden birine paylaşım yapabilirsin." },
          { status: 400 },
        );
      }
      selectedCourse = course;
    }

    const id = crypto.randomUUID();
    const mediaId = attachment ? crypto.randomUUID() : "";
    const createdAt = new Date().toISOString().replace("T", " ").replace("Z", "");
    const statements = [DB.prepare(
      "INSERT INTO posts (id, author_email, course_id, audience, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, identity.email, selectedCourse?.id ?? null, audience, content, createdAt, createdAt)];
    if (attachment && FILES) {
      uploadedKey = `posts/${id}/${mediaId}.${attachment.storedExtension}`;
      await FILES.put(uploadedKey, attachment.bytes, { httpMetadata: { contentType: attachment.contentType } });
      statements.push(DB.prepare(
        `INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(mediaId, id, attachment.kind, uploadedKey, attachment.fileName, attachment.contentType, attachment.bytes.byteLength));
    }
    statements.push(DB.prepare(
      "INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), identity.email, "post.created", "post", id, JSON.stringify({ audience, courseId: selectedCourse?.id ?? null, mediaKind: attachment?.kind ?? null })));
    // D1 batch is transactional: publish post, attachment and audit together.
    await DB.batch(statements);
    committed = true;
    const displayName = identity.fullName ?? identity.displayName;

    return Response.json(
      {
        post: {
          id,
          audience,
          authorId: profile.authorId ?? undefined,
          name: displayName,
          initials: initials(displayName),
          avatarClass: "avatar-violet",
          avatarUrl: profileMediaUrl(profile.authorId, "avatar", profile.avatarUpdatedAt),
          school: profile.universityName,
          department: profile.departmentName,
          time: relativeTime(createdAt),
          course: selectedCourse?.code ?? "GENEL",
          text: content,
          media: attachment ? [{ id: mediaId, kind: attachment.kind, url: postMediaUrl(mediaId), contentType: attachment.contentType, fileName: attachment.fileName }] : [],
          likes: 0,
          comments: 0,
          liked: false,
          saved: false,
          edited: false,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey && !committed) {
      try {
        const { FILES } = await getRuntime();
        await FILES?.delete(uploadedKey);
      } catch { /* Preserve the original failure; no post was published. */ }
    }
    if (error instanceof PostMediaValidationError) return Response.json({ error: error.message }, { status: error.status });
    return postError(error);
  }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan gönderi isteği reddedildi." }, { status: 403 });
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: PostPayload;
  try {
    payload = (await request.json()) as PostPayload;
  } catch {
    return Response.json({ error: "Geçerli bir gönderi bilgisi gönderilmedi." }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!id || id.length > 80) return Response.json({ error: "Gönderi zorunludur." }, { status: 400 });
  if (content.length > 1200) {
    return Response.json({ error: "Gönderi yazısı en fazla 1200 karakter olabilir." }, { status: 400 });
  }

  try {
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, identity.email, "post-edit", 60, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (!content) {
      const attachment = await DB.prepare(
        `SELECT pm.id FROM post_media pm JOIN posts p ON p.id = pm.post_id
         WHERE p.id = ? AND p.author_email = ? AND p.deleted_at IS NULL LIMIT 1`,
      ).bind(id, identity.email).first();
      if (!attachment) return Response.json({ error: "Gönderine yazı eklemelisin." }, { status: 400 });
    }
    const db = await getDb();
    const [updated] = await db
      .update(posts)
      .set({ content, updatedAt: sql`STRFTIME('%Y-%m-%d %H:%M:%f', 'now')` })
      .where(
        and(
          eq(posts.id, id),
          eq(posts.authorEmail, identity.email),
          isNull(posts.deletedAt),
        ),
      )
      .returning({ id: posts.id });

    if (!updated) return Response.json({ error: "Gönderi bulunamadı veya bu işlem için yetkin yok." }, { status: 404 });
    await audit(DB, identity.email, "post.edited", "post", updated.id);
    return Response.json({ post: { id: updated.id, text: content, edited: true } });
  } catch (error) {
    return postError(error);
  }
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan gönderi isteği reddedildi." }, { status: 403 });
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: PostPayload;
  try {
    payload = (await request.json()) as PostPayload;
  } catch {
    return Response.json({ error: "Geçerli bir gönderi bilgisi gönderilmedi." }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id || id.length > 80) return Response.json({ error: "Gönderi zorunludur." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    const db = await getDb();
    const [deleted] = await db
      .update(posts)
      .set({
        deletedAt: sql`STRFTIME('%Y-%m-%d %H:%M:%f', 'now')`,
        updatedAt: sql`STRFTIME('%Y-%m-%d %H:%M:%f', 'now')`,
      })
      .where(
        and(
          eq(posts.id, id),
          eq(posts.authorEmail, identity.email),
          isNull(posts.deletedAt),
        ),
      )
      .returning({ id: posts.id });

    if (!deleted) return Response.json({ error: "Gönderi bulunamadı veya bu işlem için yetkin yok." }, { status: 404 });
    const media = await DB.prepare("SELECT id, object_key FROM post_media WHERE post_id = ?").bind(id).all<{ id: string; object_key: string }>();
    if (FILES) {
      for (const item of media.results) {
        try {
          await FILES.delete(item.object_key);
          await DB.prepare("DELETE FROM post_media WHERE id = ?").bind(item.id).run();
        } catch { /* Deleted posts are immediately inaccessible; keep metadata for later storage cleanup. */ }
      }
    }
    await audit(DB, identity.email, "post.deleted", "post", deleted.id);
    return Response.json({ deleted: true, id: deleted.id });
  } catch (error) {
    return postError(error);
  }
}
