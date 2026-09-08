import { betaBody, betaFailure } from "../../../../../lib/beta-requests";
import { betaStaff } from "../../../../../lib/beta-staff";
import { getRuntime } from "../../../../../lib/server-api";
import { acknowledgeTestAccountMail, claimTestAccountMail, listTestAccountMail, privateTestAccountResponse, resolveTestAccountMail, TestAccountError, testAccountFailure, testAccountJson } from "../../../../../lib/test-accounts";

export async function GET(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) return privateTestAccountResponse(access.response);
    return testAccountJson({ ...await listTestAccountMail(DB, new URL(request.url).searchParams), staffContext: access.context });
  } catch (error) { return error instanceof TestAccountError ? testAccountFailure(error) : betaFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) return privateTestAccountResponse(access.response);
    const body = await betaBody(request);
    if (body.action === "resolve") return testAccountJson(await resolveTestAccountMail(DB, body, access.actor));
    if (body.action !== "claim") throw new TestAccountError(422, "Teslimat işlemi geçerli değil.");
    return testAccountJson(await claimTestAccountMail(DB, body, access.actor));
  } catch (error) { return error instanceof TestAccountError ? testAccountFailure(error) : betaFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { DB } = await getRuntime(), access = await betaStaff(DB, request);
    if ("response" in access) return privateTestAccountResponse(access.response);
    return testAccountJson(await acknowledgeTestAccountMail(DB, await betaBody(request), access.actor));
  } catch (error) { return error instanceof TestAccountError ? testAccountFailure(error) : betaFailure(error); }
}
