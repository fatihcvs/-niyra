import { betaBody, betaFailure, betaJson, submitBetaRequest } from "../../../../lib/beta-requests";
import { getRuntime } from "../../../../lib/server-api";

export async function POST(request: Request) {
  try { const body = await betaBody(request), { DB } = await getRuntime(); return betaJson(await submitBetaRequest(DB, request, body), 201); }
  catch (error) { return betaFailure(error); }
}
