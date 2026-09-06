import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, chmod, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const providerNames = ["PUSH_VAPID_SUBJECT", "PUSH_VAPID_PUBLIC_KEY", "PUSH_VAPID_PRIVATE_KEY", "FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"];

export function workerSecrets(environment) {
  const values = {};
  for (const name of providerNames) {
    const value = environment[name];
    if (typeof value === "string" && value) {
      if (value.includes("\0") || value.length > 16384) throw new Error("Invalid push configuration");
      // Railway values may contain either real PEM newlines or literal "\\n".
      // Normalize before dotenv serialization; double-escaped newlines corrupt the key.
      values[name] = name === "FCM_PRIVATE_KEY" ? value.replace(/\\n/g, "\n") : value;
    }
  }
  const secret = environment.PUSH_JOB_SECRET || randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) throw new Error("Invalid push job configuration");
  values.PUSH_JOB_SECRET = secret;
  return values;
}

export function serializeSecrets(values) {
  return Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n";
}

/** One in-flight request, including during shutdown; no browser heartbeat needed. */
export function startPushPump({ origin, secret, fetchImpl = fetch, intervalMs = 15000, timeoutMs = 45000, onUnavailable = () => {} }) {
  const url = new URL("/__internal/push-dispatch", origin);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Push pump requires loopback");
  let timer, active, stopped = false, lastFailure = 0;
  async function tick() {
    if (stopped) return;
    const controller = new AbortController();
    active = controller;
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "POST", redirect: "error", signal: active.signal,
        headers: { Authorization: `Bearer ${secret}` } });
      // Drain without logging an internal response or exposing provider details.
      await response.body?.cancel();
      if (!response.ok) throw new Error("Push dispatch unavailable");
    } catch {
      if (!stopped && Date.now() - lastFailure > 60000) {
        lastFailure = Date.now();
        try { onUnavailable(); } catch { /* A diagnostic callback cannot stop delivery retries. */ }
      }
    } finally {
      clearTimeout(deadline); active = null;
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }
  timer = setTimeout(tick, intervalMs);
  return () => { stopped = true; clearTimeout(timer); active?.abort(); };
}

export async function runRailway(environment = process.env, { spawnImpl = spawn, processObject = process, pumpFactory = startPushPump } = {}) {
  const projectRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const dataRoot = path.resolve(environment.UNIYRA_DATA_DIR || "/data");
  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid application port");
  const values = workerSecrets(environment);
  await mkdir(dataRoot, { recursive: true });
  const privateDirectory = await mkdtemp(path.join(dataRoot, ".push-runtime-"));
  const environmentFile = path.join(privateDirectory, ".env");
  let child, stopPump = () => {}, killTimer;
  const shutdown = () => {
    stopPump();
    child?.kill("SIGTERM");
    killTimer ??= setTimeout(() => child?.kill("SIGKILL"), 10000);
    killTimer.unref();
  };
  try {
    await chmod(privateDirectory, 0o700);
    await writeFile(environmentFile, serializeSecrets(values), { mode: 0o600 });
    processObject.once("SIGTERM", shutdown); processObject.once("SIGINT", shutdown);
    child = spawnImpl(process.execPath, [path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"), "dev",
      "--config", "wrangler.railway.jsonc", "--local", "--no-bundle", "--persist-to", dataRoot,
      "--ip", "0.0.0.0", "--port", String(port), "--log-level", "error", "--show-interactive-dev-session", "false", "--env-file", environmentFile],
    { cwd: projectRoot, env: { ...environment, CLOUDFLARE_INCLUDE_PROCESS_ENV: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true" }, stdio: "inherit", windowsHide: true });
    if (values.PUSH_VAPID_PRIVATE_KEY || values.FCM_PRIVATE_KEY) {
      stopPump = pumpFactory({ origin: `http://127.0.0.1:${port}`, secret: values.PUSH_JOB_SECRET,
        onUnavailable: () => console.error("Push dispatch unavailable; queued deliveries will retry.") });
    }
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1)));
    });
  } finally {
    stopPump(); clearTimeout(killTimer);
    processObject.removeListener("SIGTERM", shutdown); processObject.removeListener("SIGINT", shutdown);
    // This exact private directory was created by this invocation under dataRoot.
    await rm(privateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRailway().then((code) => { process.exitCode = code; }).catch(() => {
    console.error("Application startup failed; check server configuration."); process.exitCode = 1;
  });
}
