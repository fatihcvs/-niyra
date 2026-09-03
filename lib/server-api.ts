import { getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";

export type RuntimeBindings = {
  DB: D1Database;
  FILES?: R2Bucket;
};

export async function getRuntime(): Promise<RuntimeBindings> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return { DB: env.DB, FILES: env.FILES };
}

export async function requireIdentity() {
  const identity = await getChatGPTUser();
  return identity ?? null;
}

export function signInResponse(message = "Bu işlemi yapmak için giriş yapmalısın.") {
  return Response.json(
    { error: message, signInPath: "/signin-with-chatgpt?return_to=%2F" },
    { status: 401 },
  );
}

export function unavailableResponse(error: unknown, fallback: string) {
  const detail = error instanceof Error ? error.message : "";
  const setup = detail.includes("no such table") || detail.includes("no such column") || detail.includes("binding");
  return Response.json(
    { error: setup ? "Bu özellik hazırlanıyor. Lütfen kısa süre sonra yeniden dene." : fallback },
    { status: 503 },
  );
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parseJsonArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function displayName(identity: ChatGPTUser) {
  return identity.fullName ?? identity.displayName;
}

export async function requireProfile(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT sp.user_email, sp.university_id, sp.department_id, u.public_id,
              u.display_name, u.handle
       FROM student_profiles sp
       JOIN users u ON u.email = sp.user_email
       WHERE sp.user_email = ? AND sp.onboarding_completed = 1
       LIMIT 1`,
    )
    .bind(email)
    .first<{
      user_email: string;
      university_id: string;
      department_id: string;
      public_id: string;
      display_name: string;
      handle: string;
    }>();
}

export async function enforceRateLimit(
  db: D1Database,
  email: string,
  action: string,
  limit: number,
  windowSeconds: number,
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  await db
    .prepare(
      `INSERT INTO rate_limit_windows (actor_email, action, window_start, hit_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(actor_email, action, window_start)
       DO UPDATE SET hit_count = hit_count + 1, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(email, action, windowStart)
    .run();
  const row = await db
    .prepare(
      `SELECT hit_count FROM rate_limit_windows
       WHERE actor_email = ? AND action = ? AND window_start = ?`,
    )
    .bind(email, action, windowStart)
    .first<{ hit_count: number }>();
  return {
    allowed: Number(row?.hit_count ?? 0) <= limit,
    retryAfter: Math.max(1, windowStart + windowSeconds - nowSeconds),
  };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json(
    { error: "Çok hızlı işlem yaptın. Kısa bir süre sonra yeniden dene." },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

export async function audit(
  db: D1Database,
  actorEmail: string,
  action: string,
  entityType?: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), actorEmail, action, entityType ?? null, entityId ?? null, JSON.stringify(detail))
    .run();
}

export async function notify(
  db: D1Database,
  input: {
    userEmail: string;
    actorEmail?: string;
    kind: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  if (input.actorEmail && input.actorEmail === input.userEmail) return;
  await db
    .prepare(
      `INSERT INTO notifications
       (id, user_email, actor_email, kind, title, body, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.userEmail,
      input.actorEmail ?? null,
      input.kind,
      input.title,
      input.body ?? "",
      input.entityType ?? null,
      input.entityId ?? null,
    )
    .run();
}

export function relativeTime(createdAt: string) {
  const parsed = Date.parse(createdAt.endsWith("Z") ? createdAt : `${createdAt.replace(" ", "T")}Z`);
  const elapsedMinutes = Number.isFinite(parsed) ? Math.max(0, Math.floor((Date.now() - parsed) / 60_000)) : 0;
  if (elapsedMinutes < 1) return "şimdi";
  if (elapsedMinutes < 60) return `${elapsedMinutes} dk`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
