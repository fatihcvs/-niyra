import { and, asc, desc, eq, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  courses,
  departments,
  faculties,
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
import { getChatGPTUser } from "../../chatgpt-auth";

function signInResponse() {
  return Response.json(
    { error: "Öğrenci ağını görmek için giriş yapmalısın." },
    { status: 401 },
  );
}

function peopleError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  const isMissingSchema = detail.includes("no such table") || detail.includes("no such column");

  return Response.json(
    {
      error: isMissingSchema
        ? "Öğrenci ağı hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Öğrenci ağına şu anda ulaşılamıyor.",
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

function publicPerson(row: {
  publicId: string | null;
  displayName: string;
  handle: string;
  universityName: string;
  universityShortName: string;
  facultyName: string;
  facultyShortName: string;
  departmentName: string;
  classYear: number;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: number;
}) {
  return {
    publicId: row.publicId ?? "",
    displayName: row.displayName,
    handle: row.handle,
    initials: initials(row.displayName),
    avatarClass: "avatar-blue",
    universityName: row.universityName,
    universityShortName: row.universityShortName,
    facultyName: row.facultyName,
    facultyShortName: row.facultyShortName,
    departmentName: row.departmentName,
    classYear: row.classYear,
    postCount: Number(row.postCount),
    followerCount: Number(row.followerCount),
    followingCount: Number(row.followingCount),
    isFollowing: Number(row.isFollowing) > 0,
  };
}

export async function GET(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  const requestUrl = new URL(request.url);
  const publicId = requestUrl.searchParams.get("id")?.trim() ?? "";
  const rawQuery = requestUrl.searchParams.get("q")?.trim() ?? "";
  const searchQuery = rawQuery.replace(/[%_]/g, "").slice(0, 60);

  try {
    const db = await getDb();
    const [viewer] = await db
      .select({ email: users.email, universityId: studentProfiles.universityId })
      .from(users)
      .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .where(
        and(eq(users.email, identity.email), eq(studentProfiles.onboardingCompleted, true)),
      )
      .limit(1);

    if (!viewer) {
      return Response.json(
        { error: "Öğrenci ağını görmeden önce akademik profilini tamamlamalısın." },
        { status: 409 },
      );
    }

    const followerCount = sql<number>`(SELECT COUNT(*) FROM ${userFollows} WHERE ${userFollows.followingEmail} = ${users.email})`;
    const followingCount = sql<number>`(SELECT COUNT(*) FROM ${userFollows} WHERE ${userFollows.followerEmail} = ${users.email})`;
    const postCount = sql<number>`(SELECT COUNT(*) FROM ${posts} WHERE ${posts.authorEmail} = ${users.email} AND ${posts.deletedAt} IS NULL)`;
    const isFollowing = sql<number>`EXISTS (SELECT 1 FROM ${userFollows} WHERE ${userFollows.followerEmail} = ${identity.email} AND ${userFollows.followingEmail} = ${users.email})`;
    const sameDepartment = sql<number>`CASE WHEN ${studentProfiles.departmentId} = (SELECT department_id FROM student_profiles WHERE user_email = ${identity.email}) THEN 1 ELSE 0 END`;
    const selection = {
      email: users.email,
      publicId: users.publicId,
      displayName: users.displayName,
      handle: users.handle,
      universityName: universities.name,
      universityShortName: universities.shortName,
      facultyName: faculties.name,
      facultyShortName: faculties.shortName,
      departmentName: departments.name,
      classYear: studentProfiles.classYear,
      postCount,
      followerCount,
      followingCount,
      isFollowing,
    };

    if (!publicId) {
      const directoryFilters = [
        ne(users.email, identity.email),
        isNotNull(users.publicId),
        eq(universities.id, viewer.universityId),
        eq(studentProfiles.onboardingCompleted, true),
        sql<boolean>`NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_email = ${identity.email} AND b.blocked_email = ${users.email})
             OR (b.blocker_email = ${users.email} AND b.blocked_email = ${identity.email})
        )`,
      ];
      if (searchQuery) {
        const pattern = `%${searchQuery}%`;
        directoryFilters.push(
          or(
            like(users.displayName, pattern),
            like(users.handle, pattern),
            like(faculties.name, pattern),
            like(departments.name, pattern),
          )!,
        );
      }

      const rows = await db
        .select(selection)
        .from(users)
        .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
        .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
        .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
        .innerJoin(faculties, eq(departments.facultyId, faculties.id))
        .where(and(...directoryFilters))
        .orderBy(desc(sameDepartment), desc(followerCount), asc(users.displayName))
        .limit(12);

      return Response.json({ people: rows.map(publicPerson), query: searchQuery });
    }

    const [row] = await db
      .select(selection)
      .from(users)
      .innerJoin(studentProfiles, eq(users.email, studentProfiles.userEmail))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .innerJoin(faculties, eq(departments.facultyId, faculties.id))
      .where(and(
        eq(users.publicId, publicId),
        eq(universities.id, viewer.universityId),
        sql<boolean>`NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_email = ${identity.email} AND b.blocked_email = ${users.email})
             OR (b.blocker_email = ${users.email} AND b.blocked_email = ${identity.email})
        )`,
      ))
      .limit(1);

    if (!row) return Response.json({ error: "Öğrenci profili bulunamadı." }, { status: 404 });

    const [selectedCourses, recentPosts] = await Promise.all([
      db
        .select({
          id: courses.id,
          code: courses.code,
          name: courses.name,
          departmentId: courses.departmentId,
        })
        .from(studentCourses)
        .innerJoin(courses, eq(studentCourses.courseId, courses.id))
        .where(eq(studentCourses.userEmail, row.email))
        .orderBy(asc(studentCourses.sortOrder)),
      db
        .select({
          id: posts.id,
          content: posts.content,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
          courseCode: courses.code,
          likeCount: sql<number>`(SELECT COUNT(*) FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`,
          commentCount: sql<number>`(SELECT COUNT(*) FROM ${postComments} WHERE ${postComments.postId} = ${posts.id} AND ${postComments.deletedAt} IS NULL)`,
          likedByViewer: sql<number>`EXISTS (SELECT 1 FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id} AND ${postLikes.userEmail} = ${identity.email})`,
          savedByViewer: sql<number>`EXISTS (SELECT 1 FROM ${postSaves} WHERE ${postSaves.postId} = ${posts.id} AND ${postSaves.userEmail} = ${identity.email})`,
        })
        .from(posts)
        .leftJoin(courses, eq(posts.courseId, courses.id))
        .where(and(eq(posts.authorEmail, row.email), isNull(posts.deletedAt)))
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(20),
    ]);

    const person = publicPerson(row);
    return Response.json({
      person: {
        ...person,
        courses: selectedCourses,
        posts: recentPosts.map((post) => ({
          id: post.id,
          authorId: person.publicId,
          name: person.displayName,
          initials: person.initials,
          avatarClass: person.avatarClass,
          school: person.universityName,
          department: person.departmentName,
          time: relativeTime(post.createdAt),
          course: post.courseCode ?? "GENEL",
          text: post.content,
          edited: post.updatedAt !== post.createdAt,
          likes: Number(post.likeCount),
          comments: Number(post.commentCount),
          liked: Number(post.likedByViewer) > 0,
          saved: Number(post.savedByViewer) > 0,
        })),
      },
    });
  } catch (error) {
    return peopleError(error);
  }
}
