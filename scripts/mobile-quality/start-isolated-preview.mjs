import { mkdir, writeFile, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Built application, normal auth and actual local D1/R2; never connects to Railway or the user's preview DB.
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "exports", "isolated-mobile-qa");
const state = path.join(output, "state");
const config = path.join(output, "wrangler.json");
await mkdir(output, { recursive: true });
await writeFile(config, JSON.stringify({
  name: "kampira-isolated-mobile-qa", main: path.join(root, "dist/server/index.js"),
  compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
  rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
  assets: { directory: path.join(root, "dist/client"), binding: "ASSETS", not_found_handling: "none", run_worker_first: false },
  d1_databases: [{ binding: "DB", database_name: "kampira-isolated-mobile-qa", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: path.join(root, "drizzle") }],
  r2_buckets: [{ binding: "FILES", bucket_name: "kampira-isolated-mobile-qa-files" }],
}, null, 2));
await writeFile(path.join(output, ".dev.vars"), "# Isolated QA intentionally uses no provider credentials.\n");
const allowed = new Set(["path", "systemroot", "windir", "userprofile", "temp", "tmp", "localappdata", "appdata", "comspec", "homedrive", "homepath", "programfiles", "programfiles(x86)", "os", "pathext"]);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
Object.assign(env, { WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: path.join(output, "logs"), MINIFLARE_REGISTRY_PATH: path.join(output, "registry"), NODE_ENV: "production" });
const cli = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
async function run(args, logName) {
  const log = logName ? await open(path.join(output, logName), "w") : null;
  const child = spawn(process.execPath, [cli, ...args], { cwd: output, env, stdio: log ? ["ignore", log.fd, log.fd] : "inherit", windowsHide: true });
  const stop = () => child.kill(); process.once("SIGINT", stop); process.once("SIGTERM", stop);
  return new Promise((resolve, reject) => {
    child.once("error", (error) => { void log?.close(); reject(error); });
    child.once("exit", (code) => {
      void log?.close(); process.off("SIGINT", stop); process.off("SIGTERM", stop);
      if (code === 0) resolve();
      else reject(new Error(`Local QA process exited with ${code}${logName ? `; see ${path.join(output, logName)}` : ""}`));
    });
  });
}
await run(["d1", "migrations", "apply", "DB", "--config", config, "--local", "--persist-to", state], "migrations.txt");
console.log("Isolated QA: http://127.0.0.1:5180 (synthetic accounts only; local D1/R2; no deployment)");
await run(["dev", "--config", config, "--local", "--no-bundle", "--persist-to", state, "--ip", "127.0.0.1", "--port", "5180", "--inspector-port", "0", "--show-interactive-dev-session", "false", "--log-level", "warn"]);
