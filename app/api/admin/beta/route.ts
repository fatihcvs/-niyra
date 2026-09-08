import { betaBody, BetaError, betaFailure, betaJson, betaText, listBetaRequests, reviewBetaRequest } from "../../../../lib/beta-requests";
import { betaStaff } from "../../../../lib/beta-staff";
import { getRuntime } from "../../../../lib/server-api";

export async function GET(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) { access.response.headers.set("cache-control", "private, no-store"); return access.response; }
    const params = new URL(request.url).searchParams;
    const queue = await listBetaRequests(DB, params);
    const id = params.get("id");
    let detail = null;
    if (id) {
      const row = await DB.prepare("SELECT * FROM beta_requests WHERE id=? AND expires_at>CURRENT_TIMESTAMP").bind(betaText(id, 80, 1)).first();
      if (!row) throw new BetaError(404, "Kayıt bulunamadı.");
      // Access hashes and replay hashes never leave the server, even in the staff view.
      const fields = Object.fromEntries(Object.entries(row).filter(([key]) => !["access_hash", "submission_hash"].includes(key)));
      const messages = await DB.prepare("SELECT id,author_kind AS authorKind,content,created_at AS createdAt FROM beta_request_messages WHERE request_id=? ORDER BY created_at,id LIMIT 100").bind(id).all();
      detail = { fields, messages: messages.results };
    }
    return betaJson({ ...queue, detail, staffContext: access.context, automated: access.actor.automated });
  } catch (error) { return betaFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) { access.response.headers.set("cache-control", "private, no-store"); return access.response; }
    const body = await betaBody(request);
    return betaJson(await reviewBetaRequest(DB, body, access.actor));
  } catch (error) { return betaFailure(error); }
}
