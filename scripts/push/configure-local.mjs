import { createECDH, createPrivateKey, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serializeSecrets } from "./railway-run.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const options = process.argv.slice(2);
const argument = (name) => options[options.indexOf(name) + 1];
if (!options.includes("--service-account") || !options.includes("--project")) throw new Error("Supply --service-account <local JSON path> --project <project ID>.");
const project = argument("--project");
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) throw new Error("Invalid project ID");
const account = JSON.parse(await readFile(path.resolve(argument("--service-account")), "utf8"));
if (account.type !== "service_account" || account.project_id !== project || !account.client_email?.endsWith(`@${project}.iam.gserviceaccount.com`)) throw new Error("Service account project mismatch");
const key = createPrivateKey(account.private_key);
if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error("Invalid service account key");
const directory = path.join(root, "outputs/firebase", project, "server");
await mkdir(directory, { recursive: true, mode: 0o700 });
const output = path.join(directory, "push.env");
let previous = {};
try { previous = parseEnv(await readFile(output, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const curve = createECDH("prime256v1");
if (previous.PUSH_VAPID_PRIVATE_KEY) curve.setPrivateKey(Buffer.from(previous.PUSH_VAPID_PRIVATE_KEY, "base64url"));
else curve.generateKeys();
const values = {
  PUSH_VAPID_SUBJECT: "https://web-production-da44f.up.railway.app",
  PUSH_VAPID_PUBLIC_KEY: curve.getPublicKey().toString("base64url"),
  PUSH_VAPID_PRIVATE_KEY: curve.getPrivateKey().toString("base64url"),
  PUSH_JOB_SECRET: previous.PUSH_JOB_SECRET || randomBytes(32).toString("base64url"),
  FCM_PROJECT_ID: project, FCM_CLIENT_EMAIL: account.client_email, FCM_PRIVATE_KEY: account.private_key,
};
const temporary = output + ".tmp";
await writeFile(temporary, serializeSecrets(values), { mode: 0o600 });
await rename(temporary, output);
console.log(JSON.stringify({ projectId: project, path: output, configured: ["web-push", "fcm"], providerDeliveryVerified: false }));
