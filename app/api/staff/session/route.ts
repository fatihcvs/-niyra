import { getRuntime } from "../../../../lib/server-api";
import {
  authenticateStaff,
  clearStaffSessionCookie,
  createStaffSession,
  deleteStaffSession,
  enforceStaffLoginRateLimit,
  getStaffIdentity,
  normalizeStaffUsername,
  requireSameOriginStaffRequest,
  staffAudit,
} from "../../../../lib/staff-auth";

export async function GET(request: Request) {
  try {
    const { DB } = await getRuntime();
    const staff = await getStaffIdentity(DB, request.headers);
    return staff
      ? Response.json({ staff }, { headers: { "cache-control": "no-store" } })
      : Response.json({ error: "Yönetim oturumu bulunamadı.", authRequired: true }, { status: 401, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Yönetim oturumu şu anda doğrulanamıyor." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = requireSameOriginStaffRequest(request);
  if (originError) return originError;
  let payload: { username?: unknown; password?: unknown };
  try { payload = (await request.json()) as typeof payload; }
  catch { return Response.json({ error: "Geçerli giriş bilgileri gönderilmedi." }, { status: 400 }); }
  const username = normalizeStaffUsername(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!username || !password || password.length > 128) {
    return Response.json({ error: "Kullanıcı adı veya parola hatalı." }, { status: 401 });
  }

  try {
    const { DB } = await getRuntime();
    const limited = await enforceStaffLoginRateLimit(DB, request, username);
    if (limited) return limited;
    const staff = await authenticateStaff(DB, username, password);
    if (!staff) return Response.json({ error: "Kullanıcı adı veya parola hatalı." }, { status: 401 });
    await DB.prepare(`DELETE FROM staff_sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP`).run();
    const session = await createStaffSession(DB, staff.id, request);
    await DB.prepare(`UPDATE staff_accounts SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(staff.id).run();
    await staffAudit(DB, staff.id, "staff.login", "staff", staff.id, { username: staff.username });
    return Response.json(
      { staff: { id: staff.id, username: staff.username, displayName: staff.displayName, role: staff.role, mustChangePassword: staff.mustChangePassword } },
      { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Yönetim girişi şu anda tamamlanamadı." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const originError = requireSameOriginStaffRequest(request);
  if (originError) return originError;
  try {
    const { DB } = await getRuntime();
    const staff = await getStaffIdentity(DB, request.headers);
    if (staff) await staffAudit(DB, staff.id, "staff.logout", "staff", staff.id);
    await deleteStaffSession(DB, request.headers);
  } catch {
    // Clearing the local cookie still signs the browser out during a temporary database failure.
  }
  return Response.json(
    { signedOut: true },
    { headers: { "set-cookie": clearStaffSessionCookie(request), "cache-control": "no-store" } },
  );
}
