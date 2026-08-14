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

type PostPayload = {
  content?: string;
  courseId?: string | null;
};

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
      error: detail.includes("no such table")
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

async function readLatestPosts(viewerEmail: string, feed: "all" | "following" | "campus") {
  const db = await getDb();
  const feedVisibility = feed === "following"
    ? sql<boolean>`EXISTS (SELECT 1 FROM ${userFollows} WHERE ${userFollows.followerEmail} = ${viewerEmail} AND ${userFollows.followingEmail} = ${posts.authorEmail})`
    : sql<boolean>`1 = 1`;
  const rows = await db
    .select({
      id: posts.id,
      authorId: users.publicId,
      content: posts.content,
      createdAt: posts.createdAt,
      displayName: users.displayName,
      universityName: universities.name,
      departmentName: departments.name,
      courseCode: courses.code,
      likeCount: sql<number>`(SELECT COUNT(*) FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`,
      commentCount: sql<number>`(SELECT COUNT(*) FROM ${postComments} WHERE ${postComments.postId} = ${posts.id} AND ${postComments.deletedAt} IS NULL)`,
      likedByViewer: sql<number>`EXISTS (SELECT 1 FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id} AND ${postLikes.userEmail} = ${viewerEmail})`,
      savedByViewer: sql<number>`EXISTS (SELECT 1 FROM ${postSaves} WHERE ${postSaves.postId} = ${posts.id} AND ${postSaves.userEmail} = ${viewerEmail})`,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorEmail, users.email))
    .innerJoin(studentProfiles, eq(posts.authorEmail, studentProfiles.userEmail))
    .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
    .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
    .leftJoin(courses, eq(posts.courseId, courses.id))
    .where(and(isNull(posts.deletedAt), eq(universities.id, "omu"), feedVisibility))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(30);

  return rows.map((row) => ({
    id: row.id,
    authorId: row.authorId ?? undefined,
    name: row.displayName,
    initials: initials(row.displayName),
    avatarClass: "avatar-violet",
    school: row.universityName,
    department: row.departmentName,
    time: relativeTime(row.createdAt),
    course: row.courseCode ?? "GENEL",
    text: row.content,
    likes: Number(row.likeCount),
    comments: Number(row.commentCount),
    liked: Number(row.likedByViewer) > 0,
    saved: Number(row.savedByViewer) > 0,
  }));
}

export async function GET(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  const requestedFeed = new URL(request.url).searchParams.get("feed");
  const feed = requestedFeed === "following" || requestedFeed === "campus" ? requestedFeed : "all";

  try {
    return Response.json({ posts: await readLatestPosts(identity.email, feed) });
  } catch (error) {
    return postError(error);
  }
}

export async function POST(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: PostPayload;
  try {
    payload = (await request.json()) as PostPayload;
  } catch {
    return Response.json({ error: "Geçerli bir gönderi bilgisi gönderilmedi." }, { status: 400 });
  }

  const content = payload.content?.trim() ?? "";
  if (!content || content.length > 1200) {
    return Response.json(
      { error: "Gönderin 1 ile 1200 karakter arasında olmalı." },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();
    const [profile] = await db
      .select({
        authorId: users.publicId,
        universityName: universities.name,
        departmentName: departments.name,
      })
      .from(studentProfiles)
      .innerJoin(users, eq(studentProfiles.userEmail, users.email))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .where(
        and(
          eq(studentProfiles.userEmail, identity.email),
          eq(universities.id, "omu"),
        ),
      )
      .limit(1);

    if (!profile) {
      return Response.json(
        { error: "Gönderi paylaşmadan önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }

    let selectedCourse: { id: string; code: string } | null = null;
    if (payload.courseId) {
      const [course] = await db
        .select({ id: courses.id, code: courses.code })
        .from(studentCourses)
        .innerJoin(courses, eq(studentCourses.courseId, courses.id))
        .where(
          and(
            eq(studentCourses.userEmail, identity.email),
            eq(studentCourses.courseId, payload.courseId),
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
    const [created] = await db
      .insert(posts)
      .values({
        id,
        authorEmail: identity.email,
        courseId: selectedCourse?.id ?? null,
        content,
      })
      .returning({ id: posts.id, createdAt: posts.createdAt });
    const displayName = identity.fullName ?? identity.displayName;

    return Response.json(
      {
        post: {
          id: created.id,
          authorId: profile.authorId ?? undefined,
          name: displayName,
          initials: initials(displayName),
          avatarClass: "avatar-violet",
          school: profile.universityName,
          department: profile.departmentName,
          time: relativeTime(created.createdAt),
          course: selectedCourse?.code ?? "GENEL",
          text: content,
          likes: 0,
          comments: 0,
          liked: false,
          saved: false,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return postError(error);
  }
}
