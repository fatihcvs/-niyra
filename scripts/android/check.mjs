import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, projectRoot, generatedDirectory } from "./config.mjs";

const config = await loadConfig();
const manifest = JSON.parse(await readFile(path.join(projectRoot, "public", "manifest.webmanifest"), "utf8"));
assert.equal(manifest.name, "Kampira");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.id, "/");
for (const icon of manifest.icons) {
  const bytes = await readFile(path.join(projectRoot, "public", icon.src));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${icon.src}: PNG signature`);
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes, `${icon.src}: declared dimensions`);
}
console.log("Local install manifest and real PNG icon dimensions passed.");

if (process.argv.includes("--remote")) {
  const checks = [
    ["/api/health", "application/json"],
    ["/manifest.webmanifest", "application/"],
    ["/sw.js", "javascript"],
    ["/offline.html", "text/html"],
    ...manifest.icons.map((icon) => [icon.src, "image/png"]),
  ];
  const results = await Promise.allSettled(checks.map(async ([route, type]) => {
    const response = await fetch(new URL(route, config.origin), { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `${route}: expected HTTP 200`);
    assert.ok((response.headers.get("content-type") || "").includes(type), `${route}: unexpected content type`);
    if (route === "/api/health") assert.equal((await response.json()).status, "ok");
    if (route === "/manifest.webmanifest") assert.equal((await response.json()).id, manifest.id);
    return route;
  }));
  for (const result of results) {
    if (result.status === "fulfilled") console.log(`Ready: ${result.value}`);
    else { console.error(result.reason.message); process.exitCode = 1; }
  }
}

if (process.argv.includes("--generated")) {
  const gradle = await readFile(path.join(generatedDirectory, "app", "build.gradle"), "utf8");
  for (const field of ["compileSdk", "targetSdk"]) {
    const match = gradle.match(new RegExp(`\\b${field}(?:Version)?\\s*(?:=\\s*)?(\\d+)`));
    assert.ok(match && Number(match[1]) >= config.requiredTargetSdkVersion, `Generated ${field} must be at least ${config.requiredTargetSdkVersion}`);
  }
  console.log("Generated Gradle SDK declarations passed. This does not prove a successful Android build or device test.");
}
