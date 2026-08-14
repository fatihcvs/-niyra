import { asc, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  courses,
  departments,
  faculties,
  posts,
  studentCourses,
  studentProfiles,
  userFollows,
  universities,
  users,
} from "../../../db/schema";
import {
  getCourseById,
  getDepartmentById,
  getFacultyById,
  getUniversityById,
} from "../../../lib/academic-data";

type ProfilePayload = {
  universityId?: string;
  facultyId?: string;
  departmentId?: string;
  classYear?: number;
  courseIds?: string[];
};

function signInResponse() {
  return Response.json(
    {
      error: "Profilini kullanmak için giriş yapmalısın.",
      signInPath: "/signin-with-chatgpt?return_to=%2F",
    },
    { status: 401 },
  );
}

function databaseError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  const isMissingSchema = detail.includes("no such table") || detail.includes("no such column");

  return Response.json(
    {
      error: isMissingSchema
        ? "Profil altyapısı hazırlanıyor. Lütfen kısa süre sonra yeniden dene."
        : "Profil bilgilerine şu anda ulaşılamıyor.",
    },
    { status: 503 },
  );
}

function createHandle(email: string) {
  const prefix = email.split("@")[0] ?? "ogrenci";
  const handle = prefix.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9._]/g, "");
  return handle || "ogrenci";
}

export async function GET() {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  try {
    const db = await getDb();
    const [profile] = await db
      .select({
        publicId: users.publicId,
        displayName: users.displayName,
        handle: users.handle,
        classYear: studentProfiles.classYear,
        onboardingCompleted: studentProfiles.onboardingCompleted,
        universityId: universities.id,
        universityName: universities.name,
        universityShortName: universities.shortName,
        universityCity: universities.city,
        facultyId: faculties.id,
        facultyName: faculties.name,
        facultyShortName: faculties.shortName,
        departmentId: departments.id,
        departmentName: departments.name,
        postCount: sql<number>`(SELECT COUNT(*) FROM ${posts} WHERE ${posts.authorEmail} = ${users.email} AND ${posts.deletedAt} IS NULL)`,
        followerCount: sql<number>`(SELECT COUNT(*) FROM ${userFollows} WHERE ${userFollows.followingEmail} = ${users.email})`,
        followingCount: sql<number>`(SELECT COUNT(*) FROM ${userFollows} WHERE ${userFollows.followerEmail} = ${users.email})`,
      })
      .from(studentProfiles)
      .innerJoin(users, eq(studentProfiles.userEmail, users.email))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .innerJoin(faculties, eq(departments.facultyId, faculties.id))
      .where(eq(studentProfiles.userEmail, identity.email))
      .limit(1);

    if (!profile) {
      return Response.json({
        identity: {
          displayName: identity.displayName,
          email: identity.email,
        },
        profile: null,
      });
    }

    const selectedCourses = await db
      .select({
        id: courses.id,
        code: courses.code,
        name: courses.name,
        departmentId: courses.departmentId,
      })
      .from(studentCourses)
      .innerJoin(courses, eq(studentCourses.courseId, courses.id))
      .where(eq(studentCourses.userEmail, identity.email))
      .orderBy(asc(studentCourses.sortOrder));

    return Response.json({
      identity: {
        displayName: identity.displayName,
        email: identity.email,
      },
      profile: {
        ...profile,
        postCount: Number(profile.postCount),
        followerCount: Number(profile.followerCount),
        followingCount: Number(profile.followingCount),
        courses: selectedCourses,
      },
    });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PUT(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: ProfilePayload;
  try {
    payload = (await request.json()) as ProfilePayload;
  } catch {
    return Response.json({ error: "Geçerli bir profil bilgisi gönderilmedi." }, { status: 400 });
  }

  const university = getUniversityById(payload.universityId ?? "");
  const faculty = getFacultyById(payload.facultyId ?? "");
  const department = getDepartmentById(payload.departmentId ?? "");
  const classYear = Number(payload.classYear);
  const uniqueCourseIds = [...new Set(payload.courseIds ?? [])];
  const selectedCourses = uniqueCourseIds
    .map((courseId) => getCourseById(courseId))
    .filter((course) => course !== undefined);

  if (!university) {
    return Response.json({ error: "İlk sürümde yalnızca Ondokuz Mayıs Üniversitesi kullanılabilir." }, { status: 400 });
  }
  if (!faculty || faculty.universityId !== university.id) {
    return Response.json({ error: "Lütfen OMÜ fakültelerinden birini seç." }, { status: 400 });
  }
  if (!department || department.facultyId !== faculty.id) {
    return Response.json({ error: "Lütfen seçtiğin fakülteye bağlı geçerli bir bölüm seç." }, { status: 400 });
  }
  if (!Number.isInteger(classYear) || classYear < 1 || classYear > 6) {
    return Response.json({ error: "Sınıf bilgisi 1 ile 6 arasında olmalı." }, { status: 400 });
  }
  if (
    selectedCourses.length !== uniqueCourseIds.length ||
    selectedCourses.some((course) => course.departmentId !== department.id)
  ) {
    return Response.json({ error: "Seçilen derslerden biri bu bölüme ait değil." }, { status: 400 });
  }
  if (selectedCourses.length < 3 || selectedCourses.length > 8) {
    return Response.json({ error: "En az 3, en fazla 8 ders seçmelisin." }, { status: 400 });
  }

  try {
    const { env } = await import("cloudflare:workers");
    const d1 = env.DB;
    const displayName = identity.fullName ?? identity.displayName;
    const handle = createHandle(identity.email);
    const publicIdCandidate = crypto.randomUUID();
    const statements = [
      d1
        .prepare(
          `INSERT INTO users (email, public_id, display_name, handle)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             public_id = COALESCE(users.public_id, excluded.public_id),
             display_name = excluded.display_name,
             handle = excluded.handle,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(identity.email, publicIdCandidate, displayName, handle),
      d1
        .prepare(
          `INSERT INTO universities (id, name, short_name, city)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             short_name = excluded.short_name,
             city = excluded.city`,
        )
        .bind(university.id, university.name, university.shortName, university.city),
      d1
        .prepare(
          `INSERT INTO faculties (id, university_id, name, short_name)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             university_id = excluded.university_id,
             name = excluded.name,
             short_name = excluded.short_name`,
        )
        .bind(faculty.id, university.id, faculty.name, faculty.shortName),
      d1
        .prepare(
          `INSERT INTO departments (id, faculty_id, name)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             faculty_id = excluded.faculty_id,
             name = excluded.name`,
        )
        .bind(department.id, faculty.id, department.name),
      ...selectedCourses.map((course) =>
        d1
          .prepare(
            `INSERT INTO courses (id, department_id, code, name)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               department_id = excluded.department_id,
               code = excluded.code,
               name = excluded.name`,
          )
          .bind(course.id, course.departmentId, course.code, course.name),
      ),
      d1
        .prepare(
          `INSERT INTO student_profiles
             (user_email, university_id, department_id, class_year, onboarding_completed)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(user_email) DO UPDATE SET
             university_id = excluded.university_id,
             department_id = excluded.department_id,
             class_year = excluded.class_year,
             onboarding_completed = 1,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(identity.email, university.id, department.id, classYear),
      d1.prepare("DELETE FROM student_courses WHERE user_email = ?").bind(identity.email),
      ...selectedCourses.map((course, index) =>
        d1
          .prepare(
            `INSERT INTO student_courses (user_email, course_id, sort_order)
             VALUES (?, ?, ?)`,
          )
          .bind(identity.email, course.id, index),
      ),
    ];

    await d1.batch(statements);
    const storedUser = await d1
      .prepare(
        `SELECT public_id,
          (SELECT COUNT(*) FROM posts WHERE author_email = users.email AND deleted_at IS NULL) AS post_count,
          (SELECT COUNT(*) FROM user_follows WHERE following_email = users.email) AS follower_count,
          (SELECT COUNT(*) FROM user_follows WHERE follower_email = users.email) AS following_count
         FROM users WHERE email = ?`,
      )
      .bind(identity.email)
      .first<{
        public_id: string;
        post_count: number;
        follower_count: number;
        following_count: number;
      }>();

    return Response.json({
      profile: {
        publicId: storedUser?.public_id ?? publicIdCandidate,
        displayName,
        handle,
        universityId: university.id,
        universityName: university.name,
        universityShortName: university.shortName,
        universityCity: university.city,
        facultyId: faculty.id,
        facultyName: faculty.name,
        facultyShortName: faculty.shortName,
        departmentId: department.id,
        departmentName: department.name,
        classYear,
        onboardingCompleted: true,
        postCount: Number(storedUser?.post_count ?? 0),
        followerCount: Number(storedUser?.follower_count ?? 0),
        followingCount: Number(storedUser?.following_count ?? 0),
        courses: selectedCourses,
      },
    });
  } catch (error) {
    return databaseError(error);
  }
}
