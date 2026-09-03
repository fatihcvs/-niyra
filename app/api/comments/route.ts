import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  postComments,
  posts,
  studentProfiles,
  universities,
  users,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type CommentPayload = {
  id?: string;
};

const COMMENT_PAGE_SIZE = 20;

function signInResponse() {
  return Response.json(
    { error: "Yorumları kullanmak için giriş yapmalısın." },
    { status: 401 },
  );
}

function commentsError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  return Response.json(
    {
      error: detail.includes("no such table") || detail.includes("no such column")
        ? "Yorum alanı hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Yorumlara şu anda ulaşılamıyor.",
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

async function canUseComments(viewerEmail: string, postId: string) {
  const db = await getDb();
  const [[viewer], [post]] = await Promise.all([
    db
      .select({ email: users.email })
      .from(users)
      .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .where(and(eq(users.email, viewerEmail), eq(universities.id, "omu")))
      .limit(1),
    db
      .select({ id: posts.id })
      .from(posts)
      .innerJoin(studentProfiles, eq(posts.authorEmail, studentProfiles.userEmail))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt), eq(universities.id, "omu")))
      .limit(1),
  ]);

  return { db, viewer: Boolean(viewer), post: Boolean(post) };
}

export async function GET(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  const postId = new URL(request.url).searchParams.get("postId")?.trim() ?? "";
  if (!postId || postId.length > 80) {
    return Response.json({ error: "Gönderi zorunludur." }, { status: 400 });
  }

  try {
    const access = await canUseComments(identity.email, postId);
    if (!access.viewer) {
      return Response.json(
        { error: "Yorumları görmeden önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }
    if (!access.post) return Response.json({ error: "Gönderi bulunamadı." }, { status: 404 });

    const rows = await access.db
      .select({
        id: postComments.id,
        authorId: users.publicId,
        authorEmail: postComments.authorEmail,
        authorName: users.displayName,
        content: postComments.content,
        createdAt: postComments.createdAt,
        updatedAt: postComments.updatedAt,
      })
      .from(postComments)
      .innerJoin(users, eq(postComments.authorEmail, users.email))
      .where(and(eq(postComments.postId, postId), isNull(postComments.deletedAt)))
      .orderBy(desc(postComments.createdAt), desc(postComments.id))
      .limit(COMMENT_PAGE_SIZE + 1);

    const hasMore = rows.length > COMMENT_PAGE_SIZE;
    const comments = rows
      .slice(0, COMMENT_PAGE_SIZE)
      .reverse()
      .map((row) => ({
        id: row.id,
        authorId: row.authorId ?? undefined,
        authorName: row.authorName,
        initials: initials(row.authorName),
        content: row.content,
        time: relativeTime(row.createdAt),
        edited: row.updatedAt !== row.createdAt,
        own: row.authorEmail === identity.email,
      }));

    return Response.json({ comments, hasMore });
  } catch (error) {
    return commentsError(error);
  }
}

export async function DELETE(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: CommentPayload;
  try {
    payload = (await request.json()) as CommentPayload;
  } catch {
    return Response.json({ error: "Geçerli bir yorum bilgisi gönderilmedi." }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id || id.length > 80) {
    return Response.json({ error: "Yorum zorunludur." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [deleted] = await db
      .update(postComments)
      .set({
        deletedAt: sql`STRFTIME('%Y-%m-%d %H:%M:%f', 'now')`,
        updatedAt: sql`STRFTIME('%Y-%m-%d %H:%M:%f', 'now')`,
      })
      .where(
        and(
          eq(postComments.id, id),
          eq(postComments.authorEmail, identity.email),
          isNull(postComments.deletedAt),
        ),
      )
      .returning({ id: postComments.id, postId: postComments.postId });

    if (!deleted) {
      return Response.json(
        { error: "Yorum bulunamadı veya bu işlem için yetkin yok." },
        { status: 404 },
      );
    }

    const [total] = await db
      .select({ value: count() })
      .from(postComments)
      .where(and(eq(postComments.postId, deleted.postId), isNull(postComments.deletedAt)));

    return Response.json({ deleted: true, id: deleted.id, count: total.value });
  } catch (error) {
    return commentsError(error);
  }
}
