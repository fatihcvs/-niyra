import { sha256 } from "./app-auth";
import { BetaError, type BetaReviewer } from "./beta-requests";
import { requireStaff, staffAccountContext } from "./staff-auth";

export async function betaStaff(db: D1Database, request: Request): Promise<{ actor: BetaReviewer; context: string } | { response: Response }> {
  const bearer = request.headers.get("authorization");
  if (bearer) {
    const { env } = await import("cloudflare:workers");
    const secret = (env as unknown as Record<string, unknown>).BETA_REVIEW_SECRET;
    if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(secret) || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(bearer)) throw new BetaError(401, "İnceleme yetkisi gerekli.");
    const actual = await sha256(bearer.slice(7)), expected = await sha256(secret);
    let different = 0; for (let i = 0; i < expected.length; i++) different |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    if (different) throw new BetaError(401, "İnceleme yetkisi gerekli.");
    return { actor: { staffId: null, automated: true, guard: "1=1", values: [] }, context: "beta-automation-v1" };
  }
  const access = await requireStaff(db, request); if (access.response) return { response: access.response };
  const token = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).find(part => part.startsWith("uniyra_staff_session="))?.slice("uniyra_staff_session=".length) ?? "";
  const context = await staffAccountContext(request.headers, access.identity.id);
  if (request.method !== "GET" && request.headers.get("X-Staff-Context") !== context) throw new BetaError(409, "Yönetim oturumu değişti. Kuyruğu yenile.");
  return { context, actor: { staffId: access.identity.id, automated: false,
    guard: `EXISTS(SELECT 1 FROM staff_accounts a JOIN staff_sessions s ON s.staff_id=a.id
      WHERE a.id=? AND s.token_hash=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP AND a.status='active'
        AND a.must_change_password=0 AND a.role IN ('owner','admin'))`, values: [access.identity.id, await sha256(token)] } };
}
