import { and, count, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  postComments,
  postLikes,
  postSaves,
  posts,
  studentProfiles,
  universities,
  users,
} from "../../../db/schema";

type ActionPayload = {
  postId?: string;
  type?: "like" | "save" | "comment";
  content?: string;
};

function actionError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  return Response.json(
    {
      error: detail.includes("no such table")
        ? "Etkileşim alanı hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Etkileşim şu anda kaydedilemedi.",
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

export async function POST(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) {
    return Response.json(
      { error: "Etkileşimde bulunmak için giriş yapmalısın." },
      { status: 401 },
    );
  }

  let payload: ActionPayload;
  try {
    payload = (await request.json()) as ActionPayload;
  } catch {
    return Response.json({ error: "Geçerli bir etkileşim gönderilmedi." }, { status: 400 });
  }

  const postId = typeof payload.postId === "string" ? payload.postId.trim() : "";
  if (!postId || postId.length > 80 || !["like", "save", "comment"].includes(payload.type ?? "")) {
    return Response.json({ error: "Gönderi ve etkileşim türü zorunludur." }, { status: 400 });
  }
  const commentContent = payload.type === "comment" && typeof payload.content === "string"
    ? payload.content.trim()
    : "";
  if (payload.type === "comment" && (!commentContent || commentContent.length > 500)) {
    return Response.json(
      { error: "Yorumun 1 ile 500 karakter arasında olmalı." },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();
    const [[post], [actor]] = await Promise.all([
      db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
        .limit(1),
      db
        .select({ email: users.email, publicId: users.publicId, displayName: users.displayName })
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
        .where(and(eq(users.email, identity.email), eq(universities.id, "omu")))
        .limit(1),
    ]);

    if (!post) return Response.json({ error: "Gönderi bulunamadı." }, { status: 404 });
    if (!actor) {
      return Response.json(
        { error: "Etkileşimden önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }

    if (payload.type === "like") {
      const [existing] = await db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(and(eq(postLikes.postId, postId), eq(postLikes.userEmail, identity.email)))
        .limit(1);

      if (existing) {
        await db
          .delete(postLikes)
          .where(and(eq(postLikes.postId, postId), eq(postLikes.userEmail, identity.email)));
      } else {
        await db.insert(postLikes).values({ postId, userEmail: identity.email });
      }

      const [total] = await db
        .select({ value: count() })
        .from(postLikes)
        .where(eq(postLikes.postId, postId));
      return Response.json({ type: "like", active: !existing, count: total.value });
    }

    if (payload.type === "save") {
      const [existing] = await db
        .select({ postId: postSaves.postId })
        .from(postSaves)
        .where(and(eq(postSaves.postId, postId), eq(postSaves.userEmail, identity.email)))
        .limit(1);

      if (existing) {
        await db
          .delete(postSaves)
          .where(and(eq(postSaves.postId, postId), eq(postSaves.userEmail, identity.email)));
      } else {
        await db.insert(postSaves).values({ postId, userEmail: identity.email });
      }

      return Response.json({ type: "save", active: !existing });
    }

    const id = crypto.randomUUID();
    const [comment] = await db
      .insert(postComments)
      .values({ id, postId, authorEmail: identity.email, content: commentContent })
      .returning({ id: postComments.id, createdAt: postComments.createdAt });
    const [total] = await db
      .select({ value: count() })
      .from(postComments)
      .where(and(eq(postComments.postId, postId), isNull(postComments.deletedAt)));

    return Response.json(
      {
        type: "comment",
        count: total.value,
        comment: {
          id: comment.id,
          authorId: actor.publicId ?? undefined,
          authorName: actor.displayName,
          initials: initials(actor.displayName),
          content: commentContent,
          time: "şimdi",
          edited: false,
          own: true,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return actionError(error);
  }
}
