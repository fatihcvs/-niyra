import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createAssetLinks } from "../scripts/android/config.mjs";
import { assembleReleaseReadiness, fingerprintAndroidArtifact, matchDigitalAssetLinks, probeDigitalAssetLinks } from "../scripts/android/release-readiness.mjs";

const fingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":");
const secondFingerprint = Array.from({ length: 32 }, (_, index) => (index + 32).toString(16).padStart(2, "0")).join(":");
const config = { origin: "https://kampira.example", packageId: "app.kampira.mobile", packageIdProvisional: true, appVersionCode: 1, requiredTargetSdkVersion: 36 };

test("Digital Asset Links association requires the expected relation, package and every supplied certificate", () => {
  const good = createAssetLinks(config.packageId, [fingerprint]);
  assert.equal(matchDigitalAssetLinks(good, config.packageId, [fingerprint]).matched, true);
  assert.equal(matchDigitalAssetLinks(good, "app.other.mobile", [fingerprint]).matched, false);
  assert.equal(matchDigitalAssetLinks(good, config.packageId, [secondFingerprint]).matched, false);
  assert.equal(matchDigitalAssetLinks(good, config.packageId, [fingerprint, secondFingerprint]).matched, false);
  for (const document of [{}, [], [{ ...good[0], relation: ["other"] }], [{ ...good[0], target: { ...good[0].target, namespace: "web" } }]]) {
    assert.equal(matchDigitalAssetLinks(document, config.packageId, [fingerprint]).matched, false);
  }
  assert.throws(() => matchDigitalAssetLinks(good, config.packageId, []));
});

test("DAL probe rejects redirects, wrong MIME, malformed content and missing expected identity", async () => {
  let calls = 0;
  const good = createAssetLinks(config.packageId, [fingerprint]);
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://kampira.example/.well-known/assetlinks.json");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    return Response.json(good);
  };
  assert.equal((await probeDigitalAssetLinks(config, [], fetcher)).status, "unverified");
  assert.equal(calls, 0);
  assert.equal((await probeDigitalAssetLinks(config, [fingerprint], fetcher)).status, "passed");
  const redirected = Response.json(good);
  Object.defineProperty(redirected, "redirected", { value: true });
  for (const response of [redirected, new Response("{}", { status: 404 }), new Response(JSON.stringify(good), { headers: { "content-type": "text/html" } }), new Response("not-json", { headers: { "content-type": "application/json" } }), Response.json({})]) {
    assert.equal((await probeDigitalAssetLinks(config, [fingerprint], async () => response)).status, "failed");
  }
  assert.equal((await probeDigitalAssetLinks(config, [fingerprint], async () => { throw new TypeError("Network failure"); })).status, "failed");
});

test("artifact collection records actual bytes without pretending an arbitrary ZIP is a signed Android build", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "kampira-release-test-"));
  // Cleanup stays within this exact directory created by the test.
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const owned = path.join(temporary, "owned");
  await mkdir(owned);
  const fakeArchive = Buffer.from("504b030466697874757265", "hex");
  const file = path.join(owned, "fixture.aab");
  await writeFile(file, fakeArchive);
  const result = await fingerprintAndroidArtifact(file, owned);
  assert.equal(result.status, "recorded");
  assert.equal(result.bytes, fakeArchive.length);
  assert.equal(result.sha256, createHash("sha256").update(fakeArchive).digest("hex"));
  assert.match(result.reason, /not verified/);
  assert.equal(result.verified, undefined);
  const outside = path.join(temporary, "outside.aab");
  await writeFile(outside, fakeArchive);
  assert.equal((await fingerprintAndroidArtifact(outside, owned)).status, "failed");
  const invalid = path.join(owned, "invalid.apk");
  await writeFile(invalid, "Not Android bytes");
  assert.equal((await fingerprintAndroidArtifact(invalid, owned)).status, "failed");
  const textFile = path.join(owned, "note.txt");
  await writeFile(textFile, fakeArchive);
  assert.equal((await fingerprintAndroidArtifact(textFile, owned)).status, "failed");
  assert.equal((await fingerprintAndroidArtifact(null, owned)).status, "unverified");
});

test("passing asset checks, claimed device flags and a license file cannot promote release, Play or physical evidence", () => {
  const report = assembleReleaseReadiness({
    config: { ...config, packageIdProvisional: false },
    environment: {
      unsignedBuildPrerequisitesPresent: true, missing: [], components: { sdkLicenseRecord: true },
      devices: { status: "queried", usable: 1, physicalDeviceVerified: true },
      evidence: { buildExecuted: true, artifactVerified: true, deviceJourneyVerified: true },
    },
    localCheck: { passed: true }, remoteCheck: { passed: true },
    association: { status: "passed", reason: "Fixture association matched." },
    artifact: { status: "recorded", reason: "Fixture ZIP", verified: true },
    sourceRevision: "a".repeat(40),
    licenseAccepted: true, playApproved: true, publicationAuthorized: true,
  });
  assert.equal(report.releaseReady, false);
  assert.equal(report.publicationAuthorized, false);
  for (const id of ["verified-signed-build", "sdk-license-consent", "physical-android-journeys", "final-app-and-play-signing-identity", "account-deletion-and-policy", "play-console-access-and-review", "publication-authorization"]) {
    assert.ok(report.blockingGates.includes(id), id);
    assert.equal(report.gates.find((gate) => gate.id === id).status, "unverified");
  }
  assert.equal(report.gates.find((gate) => gate.id === "toolchain-prerequisites").status, "observed");
  assert.equal(report.observations.sdkLicenseFilePresent, true);
});

test("skipped remote checks and missing tools remain separate blockers, not zero or success", () => {
  const report = assembleReleaseReadiness({ config,
    environment: { unsignedBuildPrerequisitesPresent: false, missing: ["android36"], components: { sdkLicenseRecord: false }, devices: { status: "adb-unavailable", usable: 0 } },
    localCheck: { passed: true }, remoteCheck: null,
    association: { status: "unverified", reason: "Not checked" }, artifact: { status: "unverified", reason: "No artifact" }, sourceRevision: null,
  });
  assert.equal(report.gates.find((gate) => gate.id === "live-install-assets").status, "unverified");
  assert.equal(report.gates.find((gate) => gate.id === "toolchain-prerequisites").status, "blocked");
  assert.ok(report.blockingGates.includes("artifact-bytes"));
  assert.equal(report.subject.sourceRevision, null);
});

test("CLI accepts no flag that can assert consent or force readiness", () => {
  const script = fileURLToPath(new URL("../scripts/android/release-readiness.mjs", import.meta.url));
  for (const flag of ["--ready", "--accept-licenses", "--approve-play", "--force"]) {
    const result = spawnSync(process.execPath, [script, flag], { encoding: "utf8", windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported readiness option/);
  }
});
