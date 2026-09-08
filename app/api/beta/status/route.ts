import { betaBody, betaFailure, betaFollowup, betaJson, limitBeta, readBetaStatus } from "../../../../lib/beta-requests";
import { getRuntime } from "../../../../lib/server-api";

export async function POST(request: Request) {
  try {
    const body = await betaBody(request), { DB } = await getRuntime();
    await limitBeta(DB, request, body.action === "read" ? "status" : "followup", body.action === "read" ? 120 : 20);
    return betaJson(body.action === "read" ? await readBetaStatus(DB, body.token) : await betaFollowup(DB, body));
  } catch (error) { return betaFailure(error); }
}
