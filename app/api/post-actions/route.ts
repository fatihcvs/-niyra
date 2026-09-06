import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { sameOriginRequest } from "../../../lib/app-auth";
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
  active?: boolean;
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
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan etkileşim isteği reddedildi." }, { status: 403 });
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
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ error: "Geçerli bir etkileşim gönderilmedi." }, { status: 400 });
  }

  const postId = typeof payload.postId === "string" ? payload.postId.trim() : "";
  if (!postId || postId.length > 80 || !["like", "save", "comment"].includes(payload.type ?? "")) {
    return Response.json({ error: "Gönderi ve etkileşim türü zorunludur." }, { status: 400 });
  }
  if (payload.active !== undefined && (typeof payload.active !== "boolean" || payload.type === "comment")) {
    return Response.json({ error: "Beğenme veya kaydetme durumu doğru ya da yanlış olmalı." }, { status: 400 });
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
        .select({ id: posts.id, authorEmail: posts.authorEmail, content: posts.content, communityId: posts.communityId, audience: posts.audience, courseId: posts.courseId, universityId: studentProfiles.universityId })
        .from(posts)
        .innerJoin(users, and(eq(users.email, posts.authorEmail), eq(users.status, "active")))
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
    if (post.universityId !== actor.universityId && !(post.audience === "platform" && !post.communityId && !post.courseId)) {
      return Response.json({ error: "Bu gönderi yalnızca kendi kampüsüne açık." }, { status: 403 });
    }
    const blocked = await DB.prepare(
      `SELECT 1 AS blocked FROM user_blocks
       WHERE (blocker_email = ? AND blocked_email = ?) OR (blocker_email = ? AND blocked_email = ?) LIMIT 1`,
    ).bind(identity.email, post.authorEmail, post.authorEmail, identity.email).first();
    if (blocked) return Response.json({ error: "Bu gönderiyle etkileşim kullanılamıyor." }, { status: 403 });
    if (post.communityId) {
      const communityAccess = await DB.prepare(
        `SELECT c.id FROM communities c
         WHERE c.id = ? AND c.status = 'active' AND c.moderation_status = 'active' AND c.university_id = ? AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ?) AND (c.join_policy = 'open' OR EXISTS (
           SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_email = ? AND cm.status = 'active'
         )) LIMIT 1`,
      ).bind(post.communityId, actor.universityId, identity.email, identity.email).first();
      if (!communityAccess) return Response.json({ error: "Bu topluluk gönderisine erişim iznin yok." }, { status: 403 });
    }

    if (payload.type === "like") {
      const [existing] = await db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(and(eq(postLikes.postId, postId), eq(postLikes.userEmail, identity.email)))
        .limit(1);

      // Desired state makes a lost-response retry safe; older callers keep toggle behavior.
      const active = payload.active ?? !existing;
      const changed = active
        ? await db.insert(postLikes).values({ postId, userEmail: identity.email }).onConflictDoNothing().returning({ postId: postLikes.postId })
        : await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userEmail, identity.email))).returning({ postId: postLikes.postId });

      const [total] = await db
        .select({ value: count() })
        .from(postLikes)
        .where(eq(postLikes.postId, postId));
      if (changed.length) {
        await audit(DB, identity.email, active ? "post.liked" : "post.unliked", "post", postId);
        if (active) await notify(DB, { userEmail: post.authorEmail, actorEmail: identity.email, kind: "interaction", title: `${actor.displayName} gönderini beğendi`, body: post.content.slice(0, 120), entityType: "post", entityId: postId });
      }
      return Response.json({ type: "like", active, count: total.value });
    }

    if (payload.type === "save") {
      const [existing] = await db
        .select({ postId: postSaves.postId })
        .from(postSaves)
        .where(and(eq(postSaves.postId, postId), eq(postSaves.userEmail, identity.email)))
        .limit(1);

      const active = payload.active ?? !existing;
      const changed = active
        ? await db.insert(postSaves).values({ postId, userEmail: identity.email }).onConflictDoNothing().returning({ postId: postSaves.postId })
        : await db.delete(postSaves).where(and(eq(postSaves.postId, postId), eq(postSaves.userEmail, identity.email))).returning({ postId: postSaves.postId });

      if (changed.length) await audit(DB, identity.email, active ? "post.saved" : "post.unsaved", "post", postId);
      return Response.json({ type: "save", active });
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
    await notify(DB, { userEmail: post.authorEmail, actorEmail: identity.email, kind: "interaction", title: `${actor.displayName} gönderine yorum yaptı`, body: commentContent.slice(0, 120), entityType: "comment", entityId: id });

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
