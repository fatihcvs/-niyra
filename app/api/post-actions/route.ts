import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  postComments,
  postLikes,
  postSaves,
  posts,
  studentProfiles,
  users,
} from "../../../db/schema";
import { audit, enforceRateLimit, getRuntime, notify, rateLimitResponse } from "../../../lib/server-api";
import { profileMediaUrl } from "../../../lib/profile";

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
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, identity.email, `post-${payload.type}`, payload.type === "comment" ? 40 : 160, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const db = await getDb();
    const [[post], [actor]] = await Promise.all([
      db
        .select({ id: posts.id, authorEmail: posts.authorEmail, content: posts.content, communityId: posts.communityId, universityId: studentProfiles.universityId })
        .from(posts)
        .innerJoin(studentProfiles, eq(posts.authorEmail, studentProfiles.userEmail))
        .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
        .limit(1),
      db
        .select({
          email: users.email,
          publicId: users.publicId,
          displayName: users.displayName,
          universityId: studentProfiles.universityId,
          avatarUpdatedAt: sql<string | null>`(SELECT updated_at FROM profile_media WHERE user_email = ${users.email} AND kind = 'avatar' LIMIT 1)`,
        })
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .where(eq(users.email, identity.email))
        .limit(1),
    ]);

    if (!post) return Response.json({ error: "Gönderi bulunamadı." }, { status: 404 });
    if (!actor) {
      return Response.json(
        { error: "Etkileşimden önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }
    if (post.universityId !== actor.universityId) {
      return Response.json({ error: "Bu gönderi senin üniversite çevrende değil." }, { status: 403 });
    }
    const blocked = await DB.prepare(
      `SELECT 1 AS blocked FROM user_blocks
       WHERE (blocker_email = ? AND blocked_email = ?) OR (blocker_email = ? AND blocked_email = ?) LIMIT 1`,
    ).bind(identity.email, post.authorEmail, post.authorEmail, identity.email).first();
    if (blocked) return Response.json({ error: "Bu gönderiyle etkileşim kullanılamıyor." }, { status: 403 });
    if (post.communityId) {
      const communityAccess = await DB.prepare(
        `SELECT c.id FROM communities c
         WHERE c.id = ? AND c.status = 'active' AND (c.join_policy = 'open' OR EXISTS (
           SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_email = ? AND cm.status = 'active'
         )) LIMIT 1`,
      ).bind(post.communityId, identity.email).first();
      if (!communityAccess) return Response.json({ error: "Bu topluluk gönderisine erişim iznin yok." }, { status: 403 });
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
      await audit(DB, identity.email, existing ? "post.unliked" : "post.liked", "post", postId);
      if (!existing) await notify(DB, { userEmail: post.authorEmail, actorEmail: identity.email, kind: "interaction", title: `${actor.displayName} gönderini beğendi`, body: post.content.slice(0, 120), entityType: "post", entityId: postId });
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

      await audit(DB, identity.email, existing ? "post.unsaved" : "post.saved", "post", postId);
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
    await audit(DB, identity.email, "comment.created", "comment", id, { postId });
    await notify(DB, { userEmail: post.authorEmail, actorEmail: identity.email, kind: "interaction", title: `${actor.displayName} gönderine yorum yaptı`, body: commentContent.slice(0, 120), entityType: "post", entityId: postId });

    return Response.json(
      {
        type: "comment",
        count: total.value,
        comment: {
          id: comment.id,
          authorId: actor.publicId ?? undefined,
          authorName: actor.displayName,
          initials: initials(actor.displayName),
          avatarUrl: profileMediaUrl(actor.publicId, "avatar", actor.avatarUpdatedAt),
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
