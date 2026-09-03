import {
  authRateLimitKey,
  clearSessionCookie,
  createSession,
  deleteSession,
  isValidEmail,
  normalizeEmail,
  sameOriginRequest,
  verifyPassword,
} from "../../../../lib/app-auth";
import { enforceRateLimit, getRuntime, rateLimitResponse, unavailableResponse } from "../../../../lib/server-api";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan giriş isteği reddedildi." }, { status: 403 });

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return Response.json({ error: "Geçerli giriş bilgileri gönderilmedi." }, { status: 400 });
  }
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!isValidEmail(email) || !password || password.length > 128) {
    return Response.json({ error: "E-posta veya parola hatalı." }, { status: 401 });
  }

  try {
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, await authRateLimitKey(request, email), "auth-login", 10, 900);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const credential = await DB.prepare(
      `SELECT u.email, u.display_name, c.password_hash, c.password_salt, c.password_iterations
       FROM user_credentials c
       JOIN users u ON u.email = c.user_email
       WHERE c.user_email = ? LIMIT 1`,
    ).bind(email).first<{
      email: string;
      display_name: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
    }>();
    const valid = credential
      ? await verifyPassword(password, credential.password_salt, credential.password_iterations, credential.password_hash)
      : false;
    if (!credential || !valid) return Response.json({ error: "E-posta veya parola hatalı." }, { status: 401 });

    await DB.prepare("DELETE FROM user_sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP").run();
    const session = await createSession(DB, credential.email, request);
    return Response.json(
      { user: { email: credential.email, displayName: credential.display_name } },
      { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } },
    );
  } catch (error) {
    return unavailableResponse(error, "Giriş şu anda tamamlanamadı.");
  }
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan çıkış isteği reddedildi." }, { status: 403 });
  try {
    const { DB } = await getRuntime();
    await deleteSession(DB, request.headers);
  } catch {
    // The local cookie is still cleared if the session store is temporarily unavailable.
  }
  return Response.json(
    { signedOut: true },
    { headers: { "set-cookie": clearSessionCookie(request), "cache-control": "no-store" } },
  );
}
