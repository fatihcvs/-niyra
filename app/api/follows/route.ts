import { and, count, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  studentProfiles,
  userFollows,
  users,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { audit, enforceRateLimit, getRuntime, notify, rateLimitResponse } from "../../../lib/server-api";
import { sameOriginRequest } from "../../../lib/app-auth";

type FollowPayload = {
  targetId?: string;
  active?: boolean;
};

function followError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  const isMissingSchema = detail.includes("no such table") || detail.includes("no such column");

  return Response.json(
    {
      error: isMissingSchema
        ? "Takip sistemi hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Takip işlemi şu anda tamamlanamadı.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) {
    return Response.json(
      { error: "Bir öğrenciyi takip etmek için giriş yapmalısın." },
      { status: 401 },
    );
  }
  if (!sameOriginRequest(request)) return Response.json({ error: "Bu kaynaktan takip isteği kabul edilmiyor." }, { status: 403 });

  let payload: FollowPayload;
  try {
    payload = (await request.json()) as FollowPayload;
  } catch {
    return Response.json({ error: "Geçerli bir öğrenci bilgisi gönderilmedi." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.targetId !== "string" || ("active" in payload && typeof payload.active !== "boolean")) {
    return Response.json({ error: "Geçerli bir öğrenci ve takip durumu gönderilmedi." }, { status: 400 });
  }
  const targetId = payload.targetId.trim();
  if (!targetId || targetId.length > 80) {
    return Response.json({ error: "Takip edilecek öğrenci zorunludur." }, { status: 400 });
  }

  try {
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, identity.email, "follow", 120, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const db = await getDb();
    const [[actor], [target]] = await Promise.all([
      db
        .select({ email: users.email, displayName: users.displayName, universityId: studentProfiles.universityId })
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .where(and(eq(users.email, identity.email), eq(users.status, "active"), eq(studentProfiles.onboardingCompleted, true)))
        .limit(1),
      db
        .select({ email: users.email, universityId: studentProfiles.universityId })
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .where(and(eq(users.publicId, targetId), eq(users.status, "active"), eq(studentProfiles.onboardingCompleted, true)))
        .limit(1),
    ]);

    if (!actor) {
      return Response.json(
        { error: "Takipten önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }
    if (!target) return Response.json({ error: "Öğrenci profili bulunamadı." }, { status: 404 });
    if (actor.email === target.email) {
      return Response.json({ error: "Kendi profilini takip edemezsin." }, { status: 400 });
    }
    const blocked = await DB.prepare(
      `SELECT 1 AS blocked FROM user_blocks WHERE (blocker_email = ? AND blocked_email = ?) OR (blocker_email = ? AND blocked_email = ?) LIMIT 1`,
    ).bind(actor.email, target.email, target.email, actor.email).first();
    if (blocked) return Response.json({ error: "Bu öğrenciyle takip etkileşimi kullanılamıyor." }, { status: 403 });

    const [existing] = await db
      .select({ followerEmail: userFollows.followerEmail })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerEmail, actor.email),
          eq(userFollows.followingEmail, target.email),
        ),
      )
      .limit(1);

    const active = payload.active ?? !existing;
    let changed = false;
    if (!active) {
      const removed = await db
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerEmail, actor.email),
            eq(userFollows.followingEmail, target.email),
          ),
        ).returning({ email: userFollows.followerEmail });
      changed = removed.length > 0;
    } else {
      const inserted = await db.insert(userFollows).values({
        followerEmail: actor.email,
        followingEmail: target.email,
      }).onConflictDoNothing().returning({ email: userFollows.followerEmail });
      changed = inserted.length > 0;
    }

    const [total] = await db
      .select({ value: count() })
      .from(userFollows)
      .where(eq(userFollows.followingEmail, target.email));

    const [viewerTotal] = await db.select({ value: count() }).from(userFollows).where(eq(userFollows.followerEmail, actor.email));
    if (changed) await audit(DB, identity.email, active ? "user.followed" : "user.unfollowed", "user", targetId);
    if (changed && active) await notify(DB, { userEmail: target.email, actorEmail: identity.email, kind: "interaction", title: `${actor.displayName} seni takip etmeye başladı`, entityType: "user", entityId: targetId });

    return Response.json({
      targetId,
      active,
      followerCount: Number(total.value),
      viewerFollowingCount: Number(viewerTotal.value),
    });
  } catch (error) {
    return followError(error);
  }
}
