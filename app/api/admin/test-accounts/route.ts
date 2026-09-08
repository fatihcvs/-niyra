import { betaBody, betaFailure } from "../../../../lib/beta-requests";
import { betaStaff } from "../../../../lib/beta-staff";
import { enforceRateLimit, getRuntime } from "../../../../lib/server-api";
import { issueStaffTestAccount, listTestAccounts, privateTestAccountResponse, TestAccountError, testAccountFailure, testAccountJson } from "../../../../lib/test-accounts";

export async function GET(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) return privateTestAccountResponse(access.response);
    return testAccountJson({ ...await listTestAccounts(DB, new URL(request.url).searchParams.get("cursor")), staffContext: access.context });
  } catch (error) { return error instanceof TestAccountError ? testAccountFailure(error) : betaFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) return privateTestAccountResponse(access.response);
    const body = await betaBody(request);
    const limit = await enforceRateLimit(DB, `test-accounts:${access.actor.staffId ?? "automation"}`, "test-account-create", 20, 3600);
    if (!limit.allowed) throw new TestAccountError(429, "Saatlik test hesabı işlem sınırına ulaşıldı.");
    const result = await issueStaffTestAccount(DB, body, access.actor);
    return testAccountJson(result, result.replayed ? 200 : 201);
  } catch (error) { return error instanceof TestAccountError ? testAccountFailure(error) : betaFailure(error); }
}
