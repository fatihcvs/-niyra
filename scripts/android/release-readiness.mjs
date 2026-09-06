import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, realpath, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAssetLinks, loadConfig, normalizeOrigin, outputDirectory, projectRoot } from "./config.mjs";
import { inspectAndroidEnvironment } from "./environment.mjs";

export function matchDigitalAssetLinks(document, packageId, fingerprints) {
  const expected = createAssetLinks(packageId, fingerprints)[0].target.sha256_cert_fingerprints;
  if (!Array.isArray(document)) return { matched: false, reason: "Digital Asset Links must be a JSON array." };
  const associated = document.filter((entry) => Array.isArray(entry?.relation)
    && entry.relation.includes("delegate_permission/common.handle_all_urls")
    && entry.target?.namespace === "android_app" && entry.target.package_name === packageId)
    .flatMap((entry) => Array.isArray(entry.target.sha256_cert_fingerprints) ? entry.target.sha256_cert_fingerprints : []);
  const actual = new Set(associated.filter((value) => typeof value === "string").map((value) => value.toUpperCase()));
  const matched = expected.every((fingerprint) => actual.has(fingerprint));
  return { matched, reason: matched ? "Live association matches the supplied package and fingerprints; Play certificate provenance remains unverified." : "Required relation, package or certificate fingerprint does not match." };
}

export async function probeDigitalAssetLinks(config, fingerprints, fetcher = fetch) {
  if (!fingerprints.length) return { status: "unverified", reason: "No verified expected signing fingerprint was supplied." };
  try {
    // Validate configuration before network access; never infer a certificate from the web file itself.
    createAssetLinks(config.packageId, fingerprints);
    const url = new URL("/.well-known/assetlinks.json", normalizeOrigin(config.origin));
    const response = await fetcher(url, { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (response.status !== 200 || response.redirected || !(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return { status: "failed", reason: "Digital Asset Links must return direct HTTP 200 application/json." };
    }
    const bytes = await response.text();
    if (bytes.length > 256 * 1024) return { status: "failed", reason: "Digital Asset Links response is unexpectedly large." };
    const result = matchDigitalAssetLinks(JSON.parse(bytes), config.packageId, fingerprints);
    return { status: result.matched ? "passed" : "failed", reason: result.reason };
  } catch { return { status: "failed", reason: "Digital Asset Links could not be fetched or validated." }; }
}

export async function fingerprintAndroidArtifact(file, allowedDirectory = outputDirectory) {
  if (!file) return { status: "unverified", reason: "No Android artifact was supplied." };
  try {
    const root = await realpath(allowedDirectory);
    const resolved = await realpath(path.resolve(file));
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
      return { status: "failed", reason: "Artifact must resolve inside the owned Android output directory." };
    }
    if (!/\.(?:apk|aab)$/i.test(resolved)) return { status: "failed", reason: "Artifact extension must be .apk or .aab." };
    const details = await stat(resolved);
    if (!details.isFile() || details.size < 4) return { status: "failed", reason: "Android artifact is missing or empty." };
    const handle = await open(resolved, "r");
    let header;
    try { header = Buffer.alloc(4); await handle.read(header, 0, 4, 0); } finally { await handle.close(); }
    if (header.toString("hex") !== "504b0304") return { status: "failed", reason: "Artifact does not have a ZIP file header." };
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(resolved)) digest.update(chunk);
    return {
      status: "recorded", file: relative, bytes: details.size, sha256: digest.digest("hex"),
      reason: "Bytes recorded only. ZIP integrity, Android manifest, signing certificate and build provenance are not verified.",
    };
  } catch { return { status: "failed", reason: "Android artifact could not be safely read." }; }
}

function checkedCommand(command, args) {
  try {
    const result = spawnSync(command, args, { cwd: projectRoot, encoding: "utf8", timeout: 30000, windowsHide: true });
    return { passed: !result.error && result.status === 0, exitCode: result.status };
  } catch { return { passed: false, exitCode: null }; }
}

export function assembleReleaseReadiness({ config, environment, localCheck, remoteCheck, association, artifact, sourceRevision, sourceWorkingTreeDirty = null, now = new Date().toISOString() }) {
  const gate = (id, status, detail) => ({ id, status, detail });
  const gates = [
    gate("local-install-assets", localCheck.passed ? "passed" : "failed", "Existing manifest/PNG checks; no Android runtime claim."),
    gate("live-install-assets", remoteCheck === null ? "unverified" : remoteCheck.passed ? "passed" : "failed", "Live PWA assets/health only; no release or authentication journey claim."),
    gate("live-dal-association", association.status, association.reason),
    gate("toolchain-prerequisites", environment.unsignedBuildPrerequisitesPresent ? "observed" : "blocked", "Observed SDK/JDK files and tools; not a completed build or accepted license."),
    gate("artifact-bytes", artifact.status, artifact.reason),
    gate("verified-signed-build", "unverified", `Requires real build provenance and artifact manifest/signature inspection, including target API >= ${config.requiredTargetSdkVersion}.`),
    gate("sdk-license-consent", "unverified", "A license file, CLI success or tool installation cannot establish the user's acceptance of legal terms."),
    gate("physical-android-journeys", "unverified", "ADB transport presence or a browser viewport cannot prove physical device journeys, accessibility or performance."),
    gate("final-app-and-play-signing-identity", "unverified", config.packageIdProvisional ? "Package identity is explicitly provisional; Play app signing certificate is not verified." : "Configuration is not evidence of the final Play package and signing identity."),
    gate("account-deletion-and-policy", "unverified", "Request queue is not a deletion engine. Retention, recovery/support and actual DB/storage/provider deletion remain separate evidence."),
    gate("play-console-access-and-review", "unverified", "Developer identity, Data safety, policy declarations, applicable testing and production access require actual Play evidence."),
    gate("publication-authorization", "unverified", "No user publication authorization is inferred from files, declarations or passing checks."),
  ];
  return {
    schemaVersion: 1, checkedAt: now,
    subject: { origin: config.origin, packageId: config.packageId, versionCode: config.appVersionCode, sourceRevision, sourceWorkingTreeDirty },
    observations: {
      toolchainMissing: environment.missing,
      adbStatus: environment.devices.status,
      authorizedTransports: environment.devices.usable,
      sdkLicenseFilePresent: environment.components.sdkLicenseRecord,
      artifact,
    },
    gates,
    blockingGates: gates.filter((entry) => entry.status !== "passed").map((entry) => entry.id),
    // This collector has no trusted physical/legal/Play attestation verifier. Keeping those
    // gates open is deliberate; arbitrary booleans or uploaded receipts cannot promote them.
    releaseReady: false,
    publicationAuthorized: false,
  };
}

export async function inspectReleaseReadiness({ remote = false, artifactFile, fingerprints = [] } = {}) {
  const config = await loadConfig();
  const localCheck = checkedCommand(process.execPath, [path.join(projectRoot, "scripts/android/check.mjs")]);
  const remoteCheck = remote ? checkedCommand(process.execPath, [path.join(projectRoot, "scripts/android/check.mjs"), "--remote"]) : null;
  const association = remote ? await probeDigitalAssetLinks(config, fingerprints) : { status: "unverified", reason: "Live association was not checked." };
  const artifact = await fingerprintAndroidArtifact(artifactFile);
  const environment = inspectAndroidEnvironment();
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8", timeout: 10000, windowsHide: true });
  const sourceRevision = revision.status === 0 && /^[a-f0-9]{40}\s*$/.test(revision.stdout) ? revision.stdout.trim() : null;
  const workingTree = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: projectRoot, encoding: "utf8", timeout: 10000, windowsHide: true });
  const sourceWorkingTreeDirty = workingTree.status === 0 ? Boolean(workingTree.stdout.trim()) : null;
  return assembleReleaseReadiness({ config, environment, localCheck, remoteCheck, association, artifact, sourceRevision, sourceWorkingTreeDirty });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const allowed = new Set(["--remote", "--artifact", "--fingerprint"]);
  let artifactFile;
  const fingerprints = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!allowed.has(argument)) throw new Error(`Unsupported readiness option: ${argument}`);
    if (argument !== "--remote") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`A value is required for ${argument}`);
      if (argument === "--artifact") artifactFile = value;
      else fingerprints.push(value);
    }
  }
  const report = await inspectReleaseReadiness({ remote: args.includes("--remote"), artifactFile, fingerprints });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "release-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  // This is a release gate, not the install-assets smoke test. Unknown evidence fails closed.
  process.exitCode = report.releaseReady ? 0 : 1;
}
