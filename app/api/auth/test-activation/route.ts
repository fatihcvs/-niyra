import { createSession } from "../../../../lib/app-auth";
import { betaBody, betaFailure, limitBeta } from "../../../../lib/beta-requests";
import { getRuntime } from "../../../../lib/server-api";
import { activateTestAccount, inspectTestActivation, TestAccountError, testAccountFailure, testAccountJson } from "../../../../lib/test-accounts";

export async function POST(request: Request) {
  try {
    const input = await betaBody(request), { DB } = await getRuntime();
    await limitBeta(DB, request, "test-activation", 30);
    if (input.action === "inspect") {
      const { account } = await inspectTestActivation(DB, input.token);
      return testAccountJson({ valid: true, loginEmail: account.loginEmail, expiresAt: account.expiresAt });
    }
    if (input.action !== "activate") throw new TestAccountError(422, "Etkinleştirme işlemi geçerli değil.");
    const result = await activateTestAccount(DB, input.token, input.password);
    const session = await createSession(DB, result.loginEmail, request), response = testAccountJson(result);
    response.headers.set("set-cookie", session.cookie);
    return response;
  } catch (error) { return error instanceof TestAccountError ? testAccountFailure(error) : betaFailure(error); }
}
