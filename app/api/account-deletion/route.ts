import { getChatGPTUser } from "../../chatgpt-auth";
import { sameOriginRequest } from "../../../lib/app-auth";
import { enforceRateLimit, getRuntime, rateLimitResponse } from "../../../lib/server-api";
import { AccountDeletionError, cancelAccountDeletionRequest, createAccountDeletionRequest, deletionNote, deletionRequestId, readAccountDeletionRequests, requireDeletionAccount, requireDeletionContext } from "../../../lib/account-deletion";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
const failure = (error: unknown) => error instanceof AccountDeletionError
  ? json({ error: error.message, code: error.code }, error.status) : json({ error: "Talep işlemi şu anda tamamlanamadı. Durumunu yenileyip tekrar deneyebilirsin." }, 503);

export async function GET() {
  const identity = await getChatGPTUser();
  if (!identity) return json({ error: "Taleplerin için hesabına giriş yapmalısın.", authRequired: true }, 401);
  try {
    const { DB } = await getRuntime();
    const account = await requireDeletionAccount(DB, identity.email);
    return json({ account, requests: await readAccountDeletionRequests(DB, identity.email), deletionExecuted: false });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return json({ error: "Güvenli olmayan talep reddedildi." }, 403);
  const identity = await getChatGPTUser();
  if (!identity) return json({ error: "Talep oluşturmak için hesabına giriş yapmalısın.", authRequired: true }, 401);
  try {
    requireDeletionContext(request, identity.email);
    const payload = await request.json().catch(() => { throw new AccountDeletionError("Talep bilgisi geçerli değil.", 400); });
    if (!payload || typeof payload !== "object" || payload.confirm !== true) throw new AccountDeletionError("Hesap ve veri silme talebini onaylamalısın.", 400);
    const note = deletionNote(payload.note);
    const { DB } = await getRuntime();
    await requireDeletionAccount(DB, identity.email);
    const limit = await enforceRateLimit(DB, identity.email, "account-deletion-request", 6, 3600);
    if (!limit.allowed) return privateResponse(rateLimitResponse(limit.retryAfter));
    const result = await createAccountDeletionRequest(DB, identity.email, note);
    return json({ ...result, deletionExecuted: false }, result.created ? 202 : 200);
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return json({ error: "Güvenli olmayan talep reddedildi." }, 403);
  const identity = await getChatGPTUser();
  if (!identity) return json({ error: "Talebi iptal etmek için hesabına giriş yapmalısın.", authRequired: true }, 401);
  try {
    requireDeletionContext(request, identity.email);
    const payload = await request.json().catch(() => { throw new AccountDeletionError("Talep bilgisi geçerli değil.", 400); });
    if (!payload || payload.action !== "cancel") throw new AccountDeletionError("Bu talep işlemi desteklenmiyor.", 400);
    const id = deletionRequestId(payload.id);
    const { DB } = await getRuntime();
    await requireDeletionAccount(DB, identity.email);
    const limit = await enforceRateLimit(DB, identity.email, "account-deletion-cancel", 30, 3600);
    if (!limit.allowed) return privateResponse(rateLimitResponse(limit.retryAfter));
    return json({ request: await cancelAccountDeletionRequest(DB, identity.email, id), deletionExecuted: false });
  } catch (error) { return failure(error); }
}
