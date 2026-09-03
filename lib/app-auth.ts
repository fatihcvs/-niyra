export const SESSION_COOKIE_NAME = "uniyra_session";

const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_KEY_BYTES = 32;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type HeaderReader = Pick<Headers, "get">;

export type AppIdentity = {
  displayName: string;
  email: string;
  fullName: string | null;
};

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US").slice(0, 254) : "";
}

export function isValidEmail(email: string) {
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  return parts[0].length <= 64 && parts[1].includes(".") && !parts[1].startsWith(".") && !parts[1].endsWith(".");
}

export function cleanDisplayName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

export function passwordValidationError(value: unknown, email = "") {
  if (typeof value !== "string") return "Geçerli bir parola yazmalısın.";
  if (value.length < 10) return "Parolan en az 10 karakter olmalı.";
  if (value.length > 128) return "Parolan en fazla 128 karakter olabilir.";
  if (!/\p{L}/u.test(value) || !/\p{N}/u.test(value)) return "Parolan en az bir harf ve bir rakam içermeli.";
  const emailPrefix = email.split("@")[0]?.toLocaleLowerCase("en-US") ?? "";
  if (emailPrefix.length >= 4 && value.toLocaleLowerCase("en-US").includes(emailPrefix)) {
    return "Parolan e-posta adresinin kullanıcı adını içermemeli.";
  }
  return "";
}

export function createHandle(email: string) {
  const prefix = email.split("@")[0] ?? "ogrenci";
  const handle = prefix.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9._]/g, "").slice(0, 30);
  return handle || `ogrenci${crypto.randomUUID().slice(0, 6)}`;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return {
    hash: await derivePasswordHash(password, salt, PASSWORD_ITERATIONS),
    salt: bytesToBase64Url(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password: string, salt: string, iterations: number, expectedHash: string) {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  let decodedSalt: Uint8Array;
  try {
    decodedSalt = base64UrlToBytes(salt);
  } catch {
    return false;
  }
  const actualHash = await derivePasswordHash(password, decodedSalt, iterations);
  return constantTimeEqual(actualHash, expectedHash);
}

export async function createSession(db: D1Database, email: string, request: Request) {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO user_sessions (token_hash, user_email, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(tokenHash, email, expiresAt)
    .run();
  return {
    cookie: serializeSessionCookie(token, request, SESSION_MAX_AGE_SECONDS),
    expiresAt,
  };
}

export async function deleteSession(db: D1Database, headers: HeaderReader) {
  const token = readSessionToken(headers);
  if (!token) return;
  await db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export function clearSessionCookie(request: Request) {
  return serializeSessionCookie("", request, 0);
}

export async function getSessionIdentity(db: D1Database, headers: HeaderReader): Promise<AppIdentity | null> {
  const token = readSessionToken(headers);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.email, u.display_name
       FROM user_sessions s
       JOIN users u ON u.email = s.user_email
       WHERE s.token_hash = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(await sha256(token))
    .first<{ email: string; display_name: string }>();
  if (!row) return null;
  return { email: row.email, displayName: row.display_name, fullName: row.display_name };
}

export async function authRateLimitKey(request: Request, email: string) {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `auth:${await sha256(`${forwarded}:${email}`)}`;
}

export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const browserOrigin = new URL(origin);
    const requestUrl = new URL(request.url);
    if (browserOrigin.origin === requestUrl.origin) return true;

    // Railway terminates TLS before forwarding the request to the Worker, so
    // request.url can be http even though the browser is correctly using
    // https. Host is controlled by the browser/proxy rather than JavaScript;
    // combine it with the proxy protocol instead of trusting Origin alone.
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().replace(/:$/, "");
    if (!forwardedProtocol || !/^(?:http|https)$/.test(forwardedProtocol)) return false;
    const forwardedHost = (request.headers.get("host") ?? requestUrl.host).split(",")[0]?.trim();
    if (!forwardedHost) return false;
    return browserOrigin.origin === new URL(`${forwardedProtocol}://${forwardedHost}`).origin;
  } catch {
    return false;
  }
}

export function isTrustedPlatformHost(headers: HeaderReader) {
  const host = (headers.get("host") ?? "").split(":")[0].toLocaleLowerCase("en-US");
  return host === "chatgpt.site" || host.endsWith(".chatgpt.site");
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    PASSWORD_KEY_BYTES * 8,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function randomBytes(length: number) {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function readSessionToken(headers: HeaderReader) {
  const cookie = headers.get("cookie") ?? "";
  for (const entry of cookie.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) return rawValue.join("=").trim().slice(0, 180);
  }
  return "";
}

function serializeSessionCookie(token: string, request: Request, maxAge: number) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
