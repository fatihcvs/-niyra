import {
  authRateLimitKey,
  cleanDisplayName,
  createHandle,
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordValidationError,
  sameOriginRequest,
} from "../../../../lib/app-auth";
import { audit, enforceRateLimit, getRuntime, rateLimitResponse, unavailableResponse } from "../../../../lib/server-api";

type RegisterPayload = {
  displayName?: unknown;
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan kayıt isteği reddedildi." }, { status: 403 });

  let payload: RegisterPayload;
  try {
    payload = (await request.json()) as RegisterPayload;
  } catch {
    return Response.json({ error: "Geçerli kayıt bilgileri gönderilmedi." }, { status: 400 });
  }

  const displayName = cleanDisplayName(payload.displayName);
  const email = normalizeEmail(payload.email);
  const passwordError = passwordValidationError(payload.password, email);
  if (displayName.length < 2) return Response.json({ error: "Adın en az 2 karakter olmalı." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ error: "Geçerli bir e-posta adresi yazmalısın." }, { status: 400 });
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, await authRateLimitKey(request, email), "auth-register", 5, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    const existing = await DB.prepare(
      `SELECT u.email, CASE WHEN c.user_email IS NULL THEN 0 ELSE 1 END AS has_credentials
       FROM users u
       LEFT JOIN user_credentials c ON c.user_email = u.email
       WHERE u.email = ? LIMIT 1`,
    ).bind(email).first<{ email: string; has_credentials: number }>();
    if (existing) {
      return Response.json(
        { error: existing.has_credentials ? "Bu e-posta ile zaten bir hesap var. Giriş yapabilirsin." : "Bu e-posta mevcut bir platform profiline bağlı." },
        { status: 409 },
      );
    }

    const password = await hashPassword(payload.password as string);
    const publicId = crypto.randomUUID();
    const handle = createHandle(email);
    await DB.batch([
      DB.prepare(
        `INSERT INTO users (email, public_id, display_name, handle)
         VALUES (?, ?, ?, ?)`,
      ).bind(email, publicId, displayName, handle),
      DB.prepare(
        `INSERT INTO user_credentials (user_email, password_hash, password_salt, password_iterations)
         VALUES (?, ?, ?, ?)`,
      ).bind(email, password.hash, password.salt, password.iterations),
    ]);
    const session = await createSession(DB, email, request);
    await audit(DB, email, "account.registered", "user", publicId, { source: "self-service" });

    return Response.json(
      { user: { email, displayName }, next: "academic-profile", approvalRequired: false },
      { status: 201, headers: { "set-cookie": session.cookie, "cache-control": "no-store" } },
    );
  } catch (error) {
    return unavailableResponse(error, "Hesabın şu anda oluşturulamadı.");
  }
}
