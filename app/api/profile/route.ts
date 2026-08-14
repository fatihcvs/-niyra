import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  courses,
  departments,
  studentCourses,
  studentProfiles,
  universities,
} from "../../../db/schema";
import {
  getCourseById,
  getDepartmentById,
  getUniversityById,
} from "../../../lib/academic-data";

type ProfilePayload = {
  universityId?: string;
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
  const isMissingSchema = detail.includes("no such table");

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
        classYear: studentProfiles.classYear,
        onboardingCompleted: studentProfiles.onboardingCompleted,
        universityId: universities.id,
        universityName: universities.name,
        universityShortName: universities.shortName,
        universityCity: universities.city,
        departmentId: departments.id,
        departmentName: departments.name,
      })
      .from(studentProfiles)
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
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
        displayName: identity.displayName,
        handle: createHandle(identity.email),
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
  const department = getDepartmentById(payload.departmentId ?? "");
  const classYear = Number(payload.classYear);
  const uniqueCourseIds = [...new Set(payload.courseIds ?? [])];
  const selectedCourses = uniqueCourseIds
    .map((courseId) => getCourseById(courseId))
    .filter((course) => course !== undefined);

  if (!university) {
    return Response.json({ error: "Lütfen listeden geçerli bir üniversite seç." }, { status: 400 });
  }
  if (!department) {
    return Response.json({ error: "Lütfen listeden geçerli bir bölüm seç." }, { status: 400 });
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
    const statements = [
      d1
        .prepare(
          `INSERT INTO users (email, display_name, handle)
           VALUES (?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             display_name = excluded.display_name,
             handle = excluded.handle,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(identity.email, displayName, handle),
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
          `INSERT INTO departments (id, name)
           VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        )
        .bind(department.id, department.name),
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

    return Response.json({
      profile: {
        displayName,
        handle,
        universityId: university.id,
        universityName: university.name,
        universityShortName: university.shortName,
        universityCity: university.city,
        departmentId: department.id,
        departmentName: department.name,
        classYear,
        onboardingCompleted: true,
        courses: selectedCourses,
      },
    });
  } catch (error) {
    return databaseError(error);
  }
}
