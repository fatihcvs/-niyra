import { hashPassword } from "../../../lib/app-auth";
import { ADMIN_FEATURE_REGISTRY } from "../../../lib/admin-registry";
import { getOfficialCourseCoverage, officialCourseCatalogMeta } from "../../../lib/official-course-catalog";
import { getPlatformSettings, savePlatformSettings, type PlatformSettings } from "../../../lib/platform-settings";
import { cleanText, enforceRateLimit, getRuntime, rateLimitResponse } from "../../../lib/server-api";
import {
  cleanStaffDisplayName,
  normalizeStaffUsername,
  requireSameOriginStaffRequest,
  requireStaff,
  staffAudit,
  staffPasswordError,
  staffUsernameError,
} from "../../../lib/staff-auth";

export async function GET(request: Request) {
  try {
    const { DB, FILES } = await getRuntime();
    const access = await requireStaff(DB, request, "owner");
    if ("response" in access) return access.response;
    const courseCoverage = getOfficialCourseCoverage();
    const courseCount = courseCoverage.reduce((total, programme) => total + programme.courses.length, 0);
    const [metrics, admins, settings, auditRows, campuses, activity, featureCounts] = await Promise.all([
      DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM users) AS users_total,
          (SELECT COUNT(*) FROM users WHERE status = 'active') AS users_active,
          (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS users_suspended,
          (SELECT COUNT(*) FROM users WHERE datetime(created_at) >= datetime('now', '-7 days')) AS users_week,
          (SELECT COUNT(*) FROM student_profiles WHERE onboarding_completed = 1) AS profiles_complete,
          (SELECT COUNT(*) FROM user_sessions WHERE datetime(expires_at) > CURRENT_TIMESTAMP) AS student_sessions,
          (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS posts_active,
          (SELECT COUNT(*) FROM post_comments WHERE deleted_at IS NULL) AS comments_active,
          (SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND status = 'published') AS notes_published,
          (SELECT COUNT(*) FROM communities WHERE status = 'active') AS communities_active,
          (SELECT COUNT(*) FROM campus_pulse_posts WHERE status = 'active' AND deleted_at IS NULL) AS pulse_active,
          (SELECT COUNT(*) FROM marketplace_listings WHERE status = 'active') AS listings_active,
          (SELECT COUNT(*) FROM content_reports WHERE status IN ('open', 'appealed')) AS reports_pending,
          (SELECT COUNT(*) FROM staff_accounts WHERE role = 'admin' AND status = 'active') AS admins_active,
          (SELECT COUNT(*) FROM staff_sessions WHERE datetime(expires_at) > CURRENT_TIMESTAMP) AS staff_sessions`,
      ).first<Record<string, number>>(),
      DB.prepare(
        `SELECT id, username, display_name, status, must_change_password, last_login_at, created_at
         FROM staff_accounts WHERE role = 'admin' ORDER BY status, created_at DESC`,
      ).all(),
      getPlatformSettings(DB),
      DB.prepare(
        `SELECT l.id, l.action, l.entity_type, l.entity_id, l.detail, l.created_at,
                COALESCE(a.display_name, 'Sistem') AS actor_name, COALESCE(a.username, 'system') AS actor_username
         FROM staff_audit_logs l LEFT JOIN staff_accounts a ON a.id = l.staff_id
         ORDER BY l.created_at DESC LIMIT 80`,
      ).all(),
      DB.prepare(
        `SELECT un.id, un.name, un.short_name,
                COUNT(sp.user_email) AS student_count
         FROM universities un LEFT JOIN student_profiles sp ON sp.university_id = un.id
         GROUP BY un.id ORDER BY student_count DESC, un.name LIMIT 12`,
      ).all(),
      DB.prepare(
        `SELECT day, SUM(accounts) AS accounts, SUM(content) AS content, SUM(reports) AS reports FROM (
           SELECT date(created_at) AS day, COUNT(*) AS accounts, 0 AS content, 0 AS reports FROM users
             WHERE datetime(created_at) >= datetime('now', '-6 days') GROUP BY day
           UNION ALL SELECT date(created_at), 0, COUNT(*), 0 FROM posts
             WHERE datetime(created_at) >= datetime('now', '-6 days') GROUP BY date(created_at)
           UNION ALL SELECT date(created_at), 0, COUNT(*), 0 FROM notes
             WHERE datetime(created_at) >= datetime('now', '-6 days') GROUP BY date(created_at)
           UNION ALL SELECT date(created_at), 0, 0, COUNT(*) FROM content_reports
             WHERE datetime(created_at) >= datetime('now', '-6 days') GROUP BY date(created_at)
         ) GROUP BY day ORDER BY day`,
      ).all(),
      Promise.all(ADMIN_FEATURE_REGISTRY.map(async (feature) => {
        const row = await DB.prepare(`SELECT COUNT(*) AS count FROM ${feature.table}`).first<{ count: number }>();
        return { key: feature.key, label: feature.label, moderation: feature.moderation, count: Number(row?.count ?? 0) };
      })),
    ]);
    return Response.json({
      staff: access.identity,
      metrics: metrics ?? {},
      admins: admins.results,
      settings,
      audit: auditRows.results,
      campuses: campuses.results,
      activity: activity.results,
      features: featureCounts,
      system: {
        version: "1.7.4",
        database: "ok",
        storage: FILES ? "configured" : "unavailable",
        courseCatalogPrograms: courseCoverage.length,
        courseCatalogCourses: courseCount,
        courseCatalogUpdatedAt: officialCourseCatalogMeta.updatedAt,
        generatedAt: new Date().toISOString(),
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Owner paneli verileri şu anda yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = requireSameOriginStaffRequest(request);
  if (originError) return originError;
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Owner işlemi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 40);
  try {
    const { DB } = await getRuntime();
    const access = await requireStaff(DB, request, "owner");
    if ("response" in access) return access.response;
    const limit = await enforceRateLimit(DB, `staff:${access.identity.id}`, "owner-action", 120, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    if (action === "create-admin") {
      const username = normalizeStaffUsername(payload.username);
      const displayName = cleanStaffDisplayName(payload.displayName);
      const usernameError = staffUsernameError(username);
      const passwordError = staffPasswordError(payload.password, username);
      if (usernameError) return Response.json({ error: usernameError }, { status: 400 });
      if (displayName.length < 2) return Response.json({ error: "Admin adı en az 2 karakter olmalı." }, { status: 400 });
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      const password = await hashPassword(payload.password as string);
      const id = crypto.randomUUID();
      try {
        await DB.prepare(
          `INSERT INTO staff_accounts
           (id, username, display_name, role, password_hash, password_salt, password_iterations, status, must_change_password, created_by_staff_id)
           VALUES (?, ?, ?, 'admin', ?, ?, ?, 'active', 1, ?)`,
        ).bind(id, username, displayName, password.hash, password.salt, password.iterations, access.identity.id).run();
      } catch {
        return Response.json({ error: "Bu admin kullanıcı adı zaten kullanılıyor." }, { status: 409 });
      }
      await staffAudit(DB, access.identity.id, "staff.admin_created", "staff", id, { username, displayName });
      return Response.json({ created: true, admin: { id, username, display_name: displayName, status: "active", must_change_password: 1 } }, { status: 201 });
    }

    if (action === "set-admin-status") {
      const id = cleanText(payload.id, 80);
      const status = cleanText(payload.status, 16);
      if (!id || !["active", "disabled"].includes(status)) return Response.json({ error: "Admin durumu geçerli değil." }, { status: 400 });
      const admin = await DB.prepare(`SELECT id, username FROM staff_accounts WHERE id = ? AND role = 'admin' LIMIT 1`).bind(id).first<{ id: string; username: string }>();
      if (!admin) return Response.json({ error: "Admin hesabı bulunamadı." }, { status: 404 });
      await DB.batch([
        DB.prepare(`UPDATE staff_accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = 'admin'`).bind(status, id),
        ...(status === "disabled" ? [DB.prepare(`DELETE FROM staff_sessions WHERE staff_id = ?`).bind(id)] : []),
      ]);
      await staffAudit(DB, access.identity.id, `staff.admin_${status}`, "staff", id, { username: admin.username });
      return Response.json({ updated: true, status });
    }

    if (action === "reset-admin-password") {
      const id = cleanText(payload.id, 80);
      const admin = await DB.prepare(`SELECT id, username FROM staff_accounts WHERE id = ? AND role = 'admin' LIMIT 1`).bind(id).first<{ id: string; username: string }>();
      if (!admin) return Response.json({ error: "Admin hesabı bulunamadı." }, { status: 404 });
      const passwordError = staffPasswordError(payload.password, admin.username);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      const password = await hashPassword(payload.password as string);
      await DB.batch([
        DB.prepare(
          `UPDATE staff_accounts SET password_hash = ?, password_salt = ?, password_iterations = ?,
           must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(password.hash, password.salt, password.iterations, id),
        DB.prepare(`DELETE FROM staff_sessions WHERE staff_id = ?`).bind(id),
      ]);
      await staffAudit(DB, access.identity.id, "staff.admin_password_reset", "staff", id, { username: admin.username });
      return Response.json({ reset: true });
    }

    if (action === "save-settings") {
      const input = payload.settings && typeof payload.settings === "object" ? payload.settings as Partial<PlatformSettings> : {};
      const settings = await savePlatformSettings(DB, access.identity.id, input);
      await staffAudit(DB, access.identity.id, "platform.settings_updated", "platform", "global", { keys: Object.keys(input) });
      return Response.json({ saved: true, settings });
    }

    return Response.json({ error: "Owner işlemi desteklenmiyor." }, { status: 400 });
  } catch {
    return Response.json({ error: "Owner işlemi şu anda tamamlanamadı." }, { status: 503 });
  }
}
