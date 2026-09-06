import { and, asc, eq, sql } from "drizzle-orm";
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
  type AcademicCourse,
  type Department,
  type Faculty,
} from "../../../lib/academic-data";
import { getOfficialAcademicProgram, getOfficialAcademicUnit } from "../../../lib/academic-catalog";
import { cleanDisplayName, sameOriginRequest } from "../../../lib/app-auth";
import { makeAcademicShortName } from "../../../lib/university-catalog";
import { parseProfileLinks, profileMediaUrl, type ProfileLink } from "../../../lib/profile";

type ProfilePayload = {
  action?: unknown;
  displayName?: unknown;
  handle?: unknown;
  bio?: unknown;
  links?: unknown;
  universityId?: string;
  facultyId?: string;
  departmentId?: string;
  facultyName?: string;
  departmentName?: string;
  classYear?: number;
  courseIds?: string[];
  customCourses?: Array<{ code?: string; name?: string }>;
};

const reservedHandles = new Set(["admin", "api", "owner", "support", "kampira", "kampiraapp", "uniyra", "uniyraapp", "moderator"]);

function signInResponse() {
  return Response.json(
    {
      error: "Profilini kullanmak için giriş yapmalısın.",
      authRequired: true,
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

function cleanAcademicText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanProfileHandle(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function cleanProfileBio(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function cleanProfileLinks(value: unknown): { links?: ProfileLink[]; error?: string } {
  if (!Array.isArray(value)) return { links: [] };
  if (value.length > 5) return { error: "Profiline en fazla 5 bağlantı ekleyebilirsin." };

  const links: ProfileLink[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "Profil bağlantılarından biri geçerli değil." };
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim() : "";
    const urlValue = typeof item.url === "string" ? item.url.trim() : "";
    if (!title && !urlValue) continue;
    if (title.length < 2 || title.length > 40) return { error: "Her bağlantı başlığı 2 ile 40 karakter arasında olmalı." };
    if (urlValue.length > 500) return { error: "Bağlantı adresi çok uzun." };
    let parsed: URL;
    try {
      parsed = new URL(urlValue);
    } catch {
      return { error: "Bağlantılar http:// veya https:// ile başlayan geçerli adresler olmalı." };
    }
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname) {
      return { error: "Yalnızca güvenli web bağlantıları ekleyebilirsin." };
    }
    const normalizedUrl = parsed.toString();
    if (seen.has(normalizedUrl)) return { error: "Aynı bağlantıyı birden fazla kez ekleyemezsin." };
    seen.add(normalizedUrl);
    links.push({ title, url: normalizedUrl });
  }
  return { links };
}

async function stableCatalogId(kind: "fac" | "dep" | "crs", seed: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const suffix = Array.from(digest.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${kind}-${suffix}`;
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
        bio: studentProfiles.bio,
        linksJson: studentProfiles.linksJson,
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
        avatarUpdatedAt: sql<string | null>`(SELECT updated_at FROM profile_media WHERE user_email = ${users.email} AND kind = 'avatar' LIMIT 1)`,
      })
      .from(studentProfiles)
      .innerJoin(users, eq(studentProfiles.userEmail, users.email))
      .innerJoin(universities, eq(studentProfiles.universityId, universities.id))
      .innerJoin(departments, eq(studentProfiles.departmentId, departments.id))
      .innerJoin(faculties, eq(departments.facultyId, faculties.id))
      .where(and(eq(studentProfiles.userEmail, identity.email), eq(users.status, "active")))
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
        links: parseProfileLinks(profile.linksJson),
        avatarUrl: profileMediaUrl(profile.publicId, "avatar", profile.avatarUpdatedAt),
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
  if (!sameOriginRequest(request)) {
    return Response.json({ error: "Güvenli olmayan profil isteği reddedildi." }, { status: 403 });
  }

  const identity = await getChatGPTUser();
  if (!identity) return signInResponse();

  let payload: ProfilePayload;
  try {
    payload = (await request.json()) as ProfilePayload;
  } catch {
    return Response.json({ error: "Geçerli bir profil bilgisi gönderilmedi." }, { status: 400 });
  }

  if (payload.action === "update-details") {
    const displayName = cleanDisplayName(payload.displayName ?? identity.fullName ?? identity.displayName);
    const handle = cleanProfileHandle(payload.handle);
    const bio = cleanProfileBio(payload.bio);
    const cleanedLinks = cleanProfileLinks(payload.links);

    if (displayName.length < 2 || displayName.length > 50) {
      return Response.json({ error: "Görünen adın 2 ile 50 karakter arasında olmalı." }, { status: 400 });
    }
    if (handle.length < 3 || handle.length > 30 || !/^[a-z0-9_](?:[a-z0-9._]{1,28}[a-z0-9_])$/.test(handle) || handle.includes("..")) {
      return Response.json({ error: "Kullanıcı adı 3-30 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanabilirsin." }, { status: 400 });
    }
    if (reservedHandles.has(handle)) {
      return Response.json({ error: "Bu kullanıcı adı Kampira tarafından ayrılmış." }, { status: 400 });
    }
    if (bio.length > 150) {
      return Response.json({ error: "Biyografin en fazla 150 karakter olabilir." }, { status: 400 });
    }
    if (cleanedLinks.error || !cleanedLinks.links) {
      return Response.json({ error: cleanedLinks.error ?? "Profil bağlantıları geçerli değil." }, { status: 400 });
    }

    try {
      const { env } = await import("cloudflare:workers");
      const d1 = env.DB;
      const profile = await d1.prepare("SELECT 1 AS found FROM student_profiles sp JOIN users u ON u.email = sp.user_email WHERE sp.user_email = ? AND sp.onboarding_completed = 1 AND u.status = 'active' LIMIT 1").bind(identity.email).first();
      if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
      const conflict = await d1.prepare("SELECT 1 AS found FROM users WHERE handle = ? COLLATE NOCASE AND email <> ? LIMIT 1").bind(handle, identity.email).first();
      if (conflict) return Response.json({ error: "Bu kullanıcı adı başka bir öğrenci tarafından kullanılıyor." }, { status: 409 });

      await d1.batch([
        d1.prepare("UPDATE users SET display_name = ?, handle = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ? AND status = 'active'").bind(displayName, handle, identity.email),
        d1.prepare("UPDATE student_profiles SET bio = ?, links_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?").bind(bio, JSON.stringify(cleanedLinks.links), identity.email),
        d1.prepare("INSERT INTO product_events (id, user_email, name, properties_json) VALUES (?, ?, 'profile.details_updated', ?)").bind(crypto.randomUUID(), identity.email, JSON.stringify({ linkCount: cleanedLinks.links.length, hasBio: Boolean(bio) })),
      ]);
      return GET();
    } catch (error) {
      return databaseError(error);
    }
  }

  const displayName = cleanDisplayName(payload.displayName ?? identity.fullName ?? identity.displayName);
  const university = getUniversityById(payload.universityId ?? "");
  const classYear = Number(payload.classYear);

  if (displayName.length < 2) {
    return Response.json({ error: "Görünen adın en az 2 karakter olmalı." }, { status: 400 });
  }
  if (!university) {
    return Response.json({ error: "Lütfen Türkiye veya Kıbrıs kataloğundan geçerli bir üniversite seç." }, { status: 400 });
  }
  if (!Number.isInteger(classYear) || classYear < 1 || classYear > 6) {
    return Response.json({ error: "Sınıf bilgisi 1 ile 6 arasında olmalı." }, { status: 400 });
  }

  let faculty: Faculty | undefined;
  let department: Department | undefined;
  let selectedCourses: AcademicCourse[] = [];

  const legacyFaculty = getFacultyById(payload.facultyId ?? "");
  const legacyDepartment = getDepartmentById(payload.departmentId ?? "");

  if (university.id === "omu" && legacyFaculty && legacyDepartment && (payload.courseIds?.length ?? 0) > 0) {
    faculty = legacyFaculty;
    department = legacyDepartment;
    const uniqueCourseIds = [...new Set(payload.courseIds ?? [])];
    selectedCourses = uniqueCourseIds
      .map((courseId) => getCourseById(courseId))
      .filter((course): course is AcademicCourse => course !== undefined);

    if (!faculty || faculty.universityId !== university.id) {
      return Response.json({ error: "Lütfen seçtiğin üniversiteye bağlı geçerli bir fakülte seç." }, { status: 400 });
    }
    if (!department || department.facultyId !== faculty.id) {
      return Response.json({ error: "Lütfen seçtiğin fakülteye bağlı geçerli bir bölüm seç." }, { status: 400 });
    }
    if (selectedCourses.length !== uniqueCourseIds.length || selectedCourses.some((course) => course.departmentId !== department?.id)) {
      return Response.json({ error: "Seçilen derslerden biri bu bölüme ait değil." }, { status: 400 });
    }
  } else {
    const officialUnit = getOfficialAcademicUnit(university.id, payload.facultyId ?? "");
    const officialProgram = getOfficialAcademicProgram(university.id, payload.departmentId ?? "");
    const facultyName = cleanAcademicText(payload.facultyName, 100);
    const departmentName = cleanAcademicText(payload.departmentName, 100);
    const rawCourses = Array.isArray(payload.customCourses) ? payload.customCourses : [];
    const cleanedCourses = rawCourses.map((course) => ({
      code: cleanAcademicText(course?.code, 20).toLocaleUpperCase("tr-TR"),
      name: cleanAcademicText(course?.name, 200),
    }));

    if (officialUnit && officialProgram && officialProgram.unitId === officialUnit.id) {
      faculty = {
        id: officialUnit.id,
        universityId: university.id,
        name: officialUnit.name,
        shortName: makeAcademicShortName(officialUnit.name),
      };
      department = { id: officialProgram.id, facultyId: officialUnit.id, name: officialProgram.name };
    } else if (payload.facultyId || payload.departmentId) {
      return Response.json({ error: "Seçilen resmî akademik birim veya program bu üniversiteye bağlı değil." }, { status: 400 });
    } else if (facultyName.length < 2 || departmentName.length < 2) {
      return Response.json({ error: "Akademik birim ve program adları en az 2 karakter olmalı." }, { status: 400 });
    } else {
      const facultyId = await stableCatalogId("fac", `${university.id}:${facultyName.toLocaleLowerCase("tr-TR")}`);
      const departmentId = await stableCatalogId("dep", `${facultyId}:${departmentName.toLocaleLowerCase("tr-TR")}`);
      faculty = { id: facultyId, universityId: university.id, name: facultyName, shortName: makeAcademicShortName(facultyName) };
      department = { id: departmentId, facultyId, name: departmentName };
    }
    if (cleanedCourses.some((course) => course.code.length < 2 || course.name.length < 2)) {
      return Response.json({ error: "Her ders için geçerli bir kod ve ders adı yazmalısın." }, { status: 400 });
    }
    if (new Set(cleanedCourses.map((course) => course.code)).size !== cleanedCourses.length) {
      return Response.json({ error: "Aynı ders kodunu birden fazla kez ekleyemezsin." }, { status: 400 });
    }

    if (!department) {
      return Response.json({ error: "Akademik program doğrulanamadı." }, { status: 400 });
    }
    const courseDepartmentId = department.id;
    selectedCourses = await Promise.all(cleanedCourses.map(async (course) => ({
      id: await stableCatalogId("crs", `${courseDepartmentId}:${course.code}:${course.name.toLocaleLowerCase("tr-TR")}`),
      departmentId: courseDepartmentId,
      code: course.code,
      name: course.name,
    })));
  }

  if (!faculty || !department) {
    return Response.json({ error: "Akademik birim bilgileri doğrulanamadı." }, { status: 400 });
  }
  if (selectedCourses.length < 3 || selectedCourses.length > 8) {
    return Response.json({ error: "En az 3, en fazla 8 ders seçmelisin." }, { status: 400 });
  }

  try {
    const { env } = await import("cloudflare:workers");
    const d1 = env.DB;
    const handle = createHandle(identity.email);
    const publicIdCandidate = crypto.randomUUID();
    const existingProfile = await d1
      .prepare("SELECT 1 AS found FROM student_profiles WHERE user_email = ? LIMIT 1")
      .bind(identity.email)
      .first<{ found: number }>();
    const eventName = existingProfile ? "profile.updated" : "onboarding.completed";
    const statements = [
      d1
        .prepare(
          `UPDATE users SET public_id = COALESCE(public_id, ?), display_name = ?,
             handle = COALESCE(NULLIF(handle, ''), ?), updated_at = CURRENT_TIMESTAMP
           WHERE email = ? AND status = 'active'`,
        )
        .bind(publicIdCandidate, displayName, handle, identity.email),
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
      d1
        .prepare(
          `INSERT INTO product_events (id, user_email, name, properties_json)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), identity.email, eventName, JSON.stringify({ universityId: university.id, courseCount: selectedCourses.length, classYear })),
    ];

    await d1.batch(statements);
    return GET();
  } catch (error) {
    return databaseError(error);
  }
}
