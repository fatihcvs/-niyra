import { hashPassword, verifyPassword } from "../../../../lib/app-auth";
import { getRuntime } from "../../../../lib/server-api";
import {
  createStaffSession,
  getStaffIdentity,
  requireSameOriginStaffRequest,
  staffAudit,
  staffPasswordError,
} from "../../../../lib/staff-auth";

export async function POST(request: Request) {
  const originError = requireSameOriginStaffRequest(request);
  if (originError) return originError;
  let payload: { currentPassword?: unknown; newPassword?: unknown };
  try { payload = (await request.json()) as typeof payload; }
  catch { return Response.json({ error: "Parola bilgileri geçerli değil." }, { status: 400 }); }
  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";

  try {
    const { DB } = await getRuntime();
    const staff = await getStaffIdentity(DB, request.headers);
    if (!staff) return Response.json({ error: "Yönetim oturumu gerekli.", authRequired: true }, { status: 401 });
    const passwordError = staffPasswordError(newPassword, staff.username);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    const credential = await DB.prepare(
      `SELECT password_hash, password_salt, password_iterations FROM staff_accounts WHERE id = ? AND status = 'active' LIMIT 1`,
    ).bind(staff.id).first<{ password_hash: string; password_salt: string; password_iterations: number }>();
    const currentValid = credential
      ? await verifyPassword(currentPassword, credential.password_salt, credential.password_iterations, credential.password_hash)
      : false;
    if (!currentValid) return Response.json({ error: "Mevcut parola hatalı." }, { status: 401 });
    const next = await hashPassword(newPassword);
    await DB.batch([
      DB.prepare(
        `UPDATE staff_accounts SET password_hash = ?, password_salt = ?, password_iterations = ?,
         must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(next.hash, next.salt, next.iterations, staff.id),
      DB.prepare(`DELETE FROM staff_sessions WHERE staff_id = ?`).bind(staff.id),
    ]);
    const session = await createStaffSession(DB, staff.id, request);
    await staffAudit(DB, staff.id, "staff.password_changed", "staff", staff.id, { forced: staff.mustChangePassword });
    return Response.json(
      { changed: true, staff: { ...staff, mustChangePassword: false } },
      { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Parola şu anda değiştirilemedi." }, { status: 503 });
  }
}
