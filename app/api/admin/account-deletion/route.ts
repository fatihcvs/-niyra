import { AccountDeletionError, deletionRequestId, readAccountDeletionQueue, reviewAccountDeletionRequest } from "../../../../lib/account-deletion";
import { getRuntime, enforceRateLimit, rateLimitResponse } from "../../../../lib/server-api";
import { requireSameOriginStaffRequest, requireStaff, staffAccountContext } from "../../../../lib/staff-auth";
import { acceptAccountErasure, readAccountErasureJobs, resumeAccountErasure } from "../../../../lib/account-erasure";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const privateResponse = (response: Response) => { response.headers.set("Cache-Control", "private, no-store"); return response; };
const failure = (error: unknown) => error instanceof AccountDeletionError
  ? json({ error: error.message, code: error.code }, error.status) : json({ error: "Hesap talepleri şu anda getirilemedi." }, 503);

export async function GET(request: Request) {
  try {
    const { DB } = await getRuntime();
    const access = await requireStaff(DB, request);
    if (access.response) return privateResponse(access.response);
    const search = new URL(request.url).searchParams;
    const queue = await readAccountDeletionQueue(DB, search.get("status") ?? "open", search.get("before"));
    const jobs = await readAccountErasureJobs(DB);
    const visibleJobs = await readAccountErasureJobs(DB, queue.requests.map(item => item.id));
    const reachableJobs = [...jobs, ...visibleJobs.filter(job => !jobs.some(existing => existing.id === job.id))];
    return json({ ...queue, requests: queue.requests.map(item => ({ ...item, erasureJob: visibleJobs.find(job => job.requestId === item.id) })),
      jobs: reachableJobs, staffContext: await staffAccountContext(request.headers, access.identity.id), capabilities: { canExecute: access.identity.role === "owner" }, deletionExecuted: false });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const originError = requireSameOriginStaffRequest(request);
  if (originError) return privateResponse(originError);
  try {
    const { DB, FILES } = await getRuntime();
    const access = await requireStaff(DB, request);
    if (access.response) return privateResponse(access.response);
    const payload = await request.json().catch(() => { throw new AccountDeletionError("Talep bilgisi geçerli değil.", 400); });
    if (!payload || !["review", "execute", "resume"].includes(payload.action)) throw new AccountDeletionError("Bu talep işlemi desteklenmiyor.", 400);
    const execution = payload.action !== "review";
    if (execution && access.identity.role !== "owner") throw new AccountDeletionError("Bu işlem yalnızca owner hesabına açıktır.", 403);
    const context = request.headers.get("X-Staff-Context");
    if ((execution || context !== null) && context !== await staffAccountContext(request.headers, access.identity.id)) throw new AccountDeletionError("Yönetim oturumu değişti. Talep durumunu yenile.", 409, "ACCOUNT_CHANGED");
    if (payload.action === "execute" && payload.confirm !== true) throw new AccountDeletionError("Bu talebin kalıcı silme işlemini açıkça onaylamalısın.", 400);
    const id = deletionRequestId(payload.action === "resume" ? payload.jobId : payload.id);
    const limit = await enforceRateLimit(DB, `staff:${access.identity.id}`, execution ? "account-erasure-execute" : "account-deletion-review", 120, 3600);
    if (!limit.allowed) return privateResponse(rateLimitResponse(limit.retryAfter));
    if (execution) {
      const accepted = payload.action === "execute" ? await acceptAccountErasure(DB, access.identity.id, id) : null;
      const job = await resumeAccountErasure(DB, FILES, access.identity.id, accepted?.id ?? id);
      return json({ job, deletionExecuted: job.state === "completed" }, job.state === "completed" ? 200 : 202);
    }
    return json({ request: await reviewAccountDeletionRequest(DB, access.identity.id, id), deletionExecuted: false });
  } catch (error) { return failure(error); }
}
