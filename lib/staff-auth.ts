import { hashPassword, sameOriginRequest, sha256, verifyPassword } from "./app-auth";
import { enforceRateLimit, rateLimitResponse } from "./server-api";

export const STAFF_SESSION_COOKIE_NAME = "uniyra_staff_session";
export const INITIAL_OWNER_USERNAME = "admin";
export const INITIAL_OWNER_PASSWORD = "admin123";

const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type HeaderReader = Pick<Headers, "get">;

export type StaffIdentity = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "admin";
  mustChangePassword: boolean;
};

type StaffCredentialRow = StaffIdentity & {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

export function normalizeStaffUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US").slice(0, 32) : "";
}

export function staffUsernameError(value: unknown) {
  const username = normalizeStaffUsername(value);
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username)) {
    return "Kullanıcı adı 3-32 karakter olmalı; harfle başlamalı ve yalnızca harf, rakam, nokta, tire veya alt çizgi içermeli.";
  }
  return "";
}

export function staffPasswordError(value: unknown, username = "") {
  if (typeof value !== "string") return "Geçerli bir parola yazmalısın.";
  if (value.length < 12) return "Yeni parola en az 12 karakter olmalı.";
  if (value.length > 128) return "Parola en fazla 128 karakter olabilir.";
  if (!/[a-zçğıöşü]/u.test(value) || !/[A-ZÇĞİÖŞÜ]/u.test(value) || !/\d/.test(value) || !/[^\p{L}\p{N}]/u.test(value)) {
    return "Parola büyük harf, küçük harf, rakam ve özel karakter içermeli.";
  }
  const normalizedUsername = normalizeStaffUsername(username);
  if (normalizedUsername.length >= 3 && value.toLocaleLowerCase("en-US").includes(normalizedUsername)) {
    return "Parola kullanıcı adını içermemeli.";
  }
  if (value === INITIAL_OWNER_PASSWORD) return "Başlangıç parolası yeniden kullanılamaz.";
  return "";
}

export function cleanStaffDisplayName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

export async function getStaffIdentity(db: D1Database, headers: HeaderReader): Promise<StaffIdentity | null> {
  const token = readStaffSessionToken(headers);
  if (!token) return null;
  const row = await db.prepare(
    `SELECT a.id, a.username, a.display_name, a.role, a.must_change_password
     FROM staff_sessions s
     JOIN staff_accounts a ON a.id = s.staff_id
     WHERE s.token_hash = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP AND a.status = 'active'
     LIMIT 1`,
  ).bind(await sha256(token)).first<{
    id: string;
    username: string;
    display_name: string;
    role: string;
    must_change_password: number;
  }>();
  if (!row || !["owner", "admin"].includes(row.role)) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as "owner" | "admin",
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export async function requireStaff(db: D1Database, request: Request, role?: "owner") {
  const identity = await getStaffIdentity(db, request.headers);
  if (!identity) {
    return { response: Response.json({ error: "Yönetim oturumu gerekli.", authRequired: true }, { status: 401 }) } as const;
  }
  if (identity.mustChangePassword) {
    return { response: Response.json({ error: "Devam etmeden önce başlangıç parolanı değiştirmelisin.", passwordChangeRequired: true }, { status: 428 }) } as const;
  }
  if (role === "owner" && identity.role !== "owner") {
    return { response: Response.json({ error: "Bu işlem yalnızca owner hesabına açıktır." }, { status: 403 }) } as const;
  }
  return { identity } as const;
}

export async function authenticateStaff(db: D1Database, username: string, password: string) {
  await bootstrapInitialOwner(db, username, password);
  const row = await db.prepare(
    `SELECT id, username, display_name, role, must_change_password,
            password_hash, password_salt, password_iterations
     FROM staff_accounts WHERE username = ? AND status = 'active' LIMIT 1`,
  ).bind(username).first<{
    id: string;
    username: string;
    display_name: string;
    role: string;
    must_change_password: number;
    password_hash: string;
    password_salt: string;
    password_iterations: number;
  }>();
  if (!row || !["owner", "admin"].includes(row.role)) return null;
  const valid = await verifyPassword(password, row.password_salt, row.password_iterations, row.password_hash);
  if (!valid) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as "owner" | "admin",
    mustChangePassword: Boolean(row.must_change_password),
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: row.password_iterations,
  } satisfies StaffCredentialRow;
}

async function bootstrapInitialOwner(db: D1Database, username: string, password: string) {
  if (username !== INITIAL_OWNER_USERNAME || password !== INITIAL_OWNER_PASSWORD) return;
  const owner = await db.prepare(`SELECT id FROM staff_accounts WHERE role = 'owner' LIMIT 1`).first();
  if (owner) return;
  const credential = await hashPassword(INITIAL_OWNER_PASSWORD);
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO staff_accounts
       (id, username, display_name, role, password_hash, password_salt, password_iterations, must_change_password)
       VALUES (?, ?, 'Üniyra Owner', 'owner', ?, ?, ?, 1)`,
    ).bind(id, INITIAL_OWNER_USERNAME, credential.hash, credential.salt, credential.iterations).run();
    await staffAudit(db, null, "staff.owner_bootstrapped", "staff", id, { username: INITIAL_OWNER_USERNAME });
  } catch {
    // A concurrent first login may have completed the single-owner bootstrap.
  }
}

export async function createStaffSession(db: D1Database, staffId: string, request: Request) {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  let binary = "";
  for (const byte of tokenBytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + STAFF_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await db.prepare(
    `INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)`,
  ).bind(tokenHash, staffId, expiresAt).run();
  return { tokenHash, expiresAt, cookie: serializeStaffCookie(token, request, STAFF_SESSION_MAX_AGE_SECONDS) };
}

export async function deleteStaffSession(db: D1Database, headers: HeaderReader) {
  const token = readStaffSessionToken(headers);
  if (token) await db.prepare(`DELETE FROM staff_sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
}

export function clearStaffSessionCookie(request: Request) {
  return serializeStaffCookie("", request, 0);
}

export async function enforceStaffLoginRateLimit(db: D1Database, request: Request, username: string) {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const actorKey = `staff:${await sha256(`${forwarded}:${username}`)}`;
  const limit = await enforceRateLimit(db, actorKey, "staff-login", 7, 900);
  return limit.allowed ? null : rateLimitResponse(limit.retryAfter);
}

export function requireSameOriginStaffRequest(request: Request) {
  return sameOriginRequest(request)
    ? null
    : Response.json({ error: "Güvenli olmayan yönetim isteği reddedildi." }, { status: 403 });
}

export async function staffAudit(
  db: D1Database,
  staffId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
) {
  await db.prepare(
    `INSERT INTO staff_audit_logs (id, staff_id, action, entity_type, entity_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), staffId, action, entityType ?? null, entityId ?? null, JSON.stringify(detail)).run();
}

function readStaffSessionToken(headers: HeaderReader) {
  const cookie = headers.get("cookie") ?? "";
  for (const entry of cookie.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (rawName === STAFF_SESSION_COOKIE_NAME) return rawValue.join("=").trim().slice(0, 180);
  }
  return "";
}

function serializeStaffCookie(token: string, request: Request, maxAge: number) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
  return [
    `${STAFF_SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
