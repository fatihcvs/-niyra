import { and, count, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  studentProfiles,
  universities,
  userFollows,
  users,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type FollowPayload = {
  targetId?: string;
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

  let payload: FollowPayload;
  try {
    payload = (await request.json()) as FollowPayload;
  } catch {
    return Response.json({ error: "Geçerli bir öğrenci bilgisi gönderilmedi." }, { status: 400 });
  }

  const targetId = payload.targetId?.trim() ?? "";
  if (!targetId) {
    return Response.json({ error: "Takip edilecek öğrenci zorunludur." }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [[actor], [target]] = await Promise.all([
      db
        .select({ email: users.email })
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
        .where(and(eq(users.email, identity.email), eq(universities.id, "omu")))
        .limit(1),
      db
        .select({ email: users.email })
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
        .where(and(eq(users.publicId, targetId), eq(universities.id, "omu")))
        .limit(1),
    ]);

    if (!actor) {
      return Response.json(
        { error: "Takipten önce OMÜ akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }
    if (!target) return Response.json({ error: "Öğrenci profili bulunamadı." }, { status: 404 });
    if (actor.email === target.email) {
      return Response.json({ error: "Kendi profilini takip edemezsin." }, { status: 400 });
    }

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

    if (existing) {
      await db
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerEmail, actor.email),
            eq(userFollows.followingEmail, target.email),
          ),
        );
    } else {
      await db.insert(userFollows).values({
        followerEmail: actor.email,
        followingEmail: target.email,
      });
    }

    const [total] = await db
      .select({ value: count() })
      .from(userFollows)
      .where(eq(userFollows.followingEmail, target.email));

    return Response.json({
      active: !existing,
      followerCount: Number(total.value),
    });
  } catch (error) {
    return followError(error);
  }
}
