import { readFile, mkdir, writeFile } from "node:fs/promises";
import { sign } from "node:crypto";
import { parseEnv } from "node:util";
import path from "node:path";

async function main() {
  const environmentFile = process.argv[2];
  if (!environmentFile) throw new Error("A local environment file is required");
  const env = parseEnv(await readFile(path.resolve(environmentFile), "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded({ iss: env.FCM_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n")).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const body = await response.json();
  const authorized = response.ok && typeof body.access_token === "string" && body.access_token.length > 0 && body.token_type === "Bearer";
  const receipt = { checkedAt: new Date().toISOString(), projectId: env.FCM_PROJECT_ID, httpStatus: response.status,
    credentialAuthorizationVerified: authorized, tokenStored: false, messageSent: false, deviceDeliveryVerified: false };
  const directory = "exports/mobile-remaining-code-2026-09-06/phase3/provider";
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "fcm-authorization.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
  if (!authorized) process.exitCode = 1;
}
main().catch(() => { console.error("FCM authorization check could not finish; no credentials were logged."); process.exitCode = 1; });
