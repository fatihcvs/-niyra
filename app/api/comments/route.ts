import { and, asc, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { postComments, posts, users } from "../../../db/schema";
import { initialsOf, relativeTime } from "../../../lib/user-identity";

/**
 * Read side of post comments. Comments are created through
 * `POST /api/post-actions` with `type: "comment"`.
 */

const PAGE_SIZE = 50;

function signInResponse() {
  return Response.json(
    { error: "Yorumları görmek için giriş yapmalısın." },
    { status: 401 },
  );
}

function commentError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  return Response.json(
    {
      error: detail.includes("no such table") || detail.includes("no such column")
        ? "Yorum alanı hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Yorumlar şu anda getirilemedi.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  const postId = new URL(request.url).searchParams.get("postId")?.trim() ?? "";
  if (!postId || postId.length > 80) {
    return Response.json({ error: "Gönderi zorunludur." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
      .limit(1);

    if (!post) return Response.json({ error: "Gönderi bulunamadı." }, { status: 404 });

    const rows = await db
      .select({
        id: postComments.id,
        content: postComments.content,
        createdAt: postComments.createdAt,
        authorEmail: postComments.authorEmail,
        authorId: users.publicId,
        displayName: users.displayName,
        campusVerified: users.campusVerified,
      })
      .from(postComments)
      .innerJoin(users, eq(postComments.authorEmail, users.email))
      .where(and(eq(postComments.postId, postId), isNull(postComments.deletedAt)))
      .orderBy(asc(postComments.createdAt), asc(postComments.id))
      .limit(PAGE_SIZE);

    return Response.json({
      comments: rows.map((row) => ({
        id: row.id,
        authorId: row.authorId ?? undefined,
        name: row.displayName,
        initials: initialsOf(row.displayName),
        verified: row.campusVerified,
        own: row.authorEmail === identity.email,
        time: relativeTime(row.createdAt),
        text: row.content,
      })),
    });
  } catch (error) {
    return commentError(error);
  }
}
