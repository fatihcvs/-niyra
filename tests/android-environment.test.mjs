import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { adbDeviceSummary, inspectAndroidEnvironment, javaMajor } from "../scripts/android/environment.mjs";

const project = "D:\\workspace";
const toolchain = path.win32.join(project, "outputs", "android", "toolchain");
const jdk = path.win32.join(toolchain, "jdk", "jdk-17");
const sdk = path.win32.join(toolchain, "sdk");

function fixture({ complete = false, javaOutput = 'openjdk version "17.0.20.1"', adbOutput = "List of devices attached\n", failJava = false } = {}) {
  const files = new Set();
  const calls = [];
  const environment = { Path: "C:\\unrelated", ProgramFiles: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local", SECRET_EXAMPLE: "not-for-output" };
  if (complete) {
    [sdk, path.win32.join(jdk, "bin", "java.exe"), path.win32.join(jdk, "bin", "javac.exe"),
      path.win32.join(sdk, "cmdline-tools", "latest", "bin", "sdkmanager.bat"),
      path.win32.join(sdk, "platform-tools", "adb.exe"),
      path.win32.join(sdk, "platforms", "android-36", "android.jar"),
      path.win32.join(sdk, "build-tools", "36.0.0", "aapt2.exe"),
      path.win32.join(sdk, "build-tools", "36.0.0", "apksigner.bat"),
      path.win32.join(sdk, "licenses", "android-sdk-license"),
      path.win32.join(project, "outputs", "android", "generated", "gradlew.bat"),
    ].forEach((file) => files.add(file));
  }
  const inspect = () => inspectAndroidEnvironment({
    environment, platform: "win32", projectDirectory: project,
    exists: (file) => files.has(file),
    directories: (directory) => directory === path.win32.join(toolchain, "jdk") && complete ? ["jdk-17"] : [],
    now: () => "2026-09-05T00:00:00.000Z",
    run: (command, args) => {
      calls.push({ command, args });
      if (command.endsWith("adb.exe")) return { status: 0, stdout: adbOutput };
      if (failJava) return { status: 1, stderr: "sensitive raw diagnostic not-for-output" };
      return { status: 0, stderr: command.endsWith("javac.exe") ? "javac 17.0.20.1" : javaOutput };
    },
  });
  return { inspect, files, calls, environment };
}

test("absent ADB means not queried, not an empty physical-device inventory", () => {
  const state = fixture();
  const report = state.inspect();
  assert.equal(report.devices.status, "adb-unavailable");
  assert.equal(report.devices.physicalDeviceVerified, false);
  assert.equal(report.unsignedBuildPrerequisitesPresent, false);
  assert.equal(report.javaVersion.status, "unavailable");
  assert.equal(state.calls.length, 0);
});

test("workspace toolchain is found without changing PATH or exposing unrelated environment", () => {
  const state = fixture({ complete: true });
  const before = { ...state.environment };
  const report = state.inspect();
  assert.equal(report.paths.javaHome, jdk);
  assert.equal(report.paths.sdkRoot, sdk);
  assert.equal(report.unsignedBuildPrerequisitesPresent, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(state.environment, before);
  assert.equal(JSON.stringify(report).includes("not-for-output"), false);
  assert.deepEqual(state.calls.map((call) => call.args), [["-version"], ["-version"], ["devices", "-l"]]);
  assert.deepEqual(report.evidence, { buildExecuted: false, artifactVerified: false, deviceJourneyVerified: false, nativeArchitectureSelected: false });
});

test("JDK and command-line presence do not make an incomplete SDK build-ready", () => {
  const state = fixture({ complete: true });
  state.files.delete(path.win32.join(sdk, "platforms", "android-36", "android.jar"));
  state.files.delete(path.win32.join(sdk, "licenses", "android-sdk-license"));
  state.files.delete(path.win32.join(project, "outputs", "android", "generated", "gradlew.bat"));
  const report = state.inspect();
  assert.equal(report.components.java17, true);
  assert.equal(report.components.sdkmanager, true);
  assert.equal(report.unsignedBuildPrerequisitesPresent, false);
  assert.deepEqual(report.missing, ["android36", "sdkLicenseRecord", "generatedGradleWrapper"]);
});

test("classic pinned sdkmanager takes precedence over the changing latest wrapper", () => {
  const state = fixture({ complete: true });
  const pinned = path.win32.join(sdk, "cmdline-tools", "20.0", "bin", "sdkmanager.bat");
  state.files.add(pinned);
  assert.equal(state.inspect().paths.sdkmanager, pinned);
});

test("pinned Bubblewrap JDK17 requirement rejects a different detected JDK", () => {
  const report = fixture({ complete: true, javaOutput: 'openjdk version "21.0.9"' }).inspect();
  assert.equal(report.javaVersion.major, 21);
  assert.equal(report.components.java17, false);
  assert.equal(report.unsignedBuildPrerequisitesPresent, false);
});

test("an executable that fails its version probe is not marked verified", () => {
  const report = fixture({ complete: true, failJava: true }).inspect();
  assert.equal(report.javaVersion.status, "failed");
  assert.equal(report.components.java17, false);
  assert.equal(JSON.stringify(report).includes("sensitive raw diagnostic"), false);
});

test("ADB distinguishes unavailable, unauthorized, offline and authorized transports without serials", () => {
  const input = "List of devices attached\nPRIVATE_SERIAL unauthorized usb:1\nemulator-5554 device product:sdk\n192.0.2.1:5555 offline\nPHONE_SERIAL device usb:2 model:Phone\n";
  const report = adbDeviceSummary(input);
  assert.equal(report.status, "queried");
  assert.equal(report.usable, 2);
  assert.deepEqual(report.devices.map((device) => device.state), ["unauthorized", "device", "offline", "device"]);
  assert.equal(report.devices[1].kind, "emulator");
  assert.equal(report.physicalDeviceVerified, false);
  for (const privateValue of ["PRIVATE_SERIAL", "192.0.2.1", "PHONE_SERIAL", "model:Phone"]) assert.equal(JSON.stringify(report).includes(privateValue), false);
});

test("unexpected ADB output cannot silently pass as a successful empty inventory", () => {
  assert.equal(adbDeviceSummary("adb: server unavailable").status, "unrecognized-output");
  const empty = adbDeviceSummary("List of devices attached\n\n");
  assert.equal(empty.status, "queried");
  assert.equal(empty.usable, 0);
});

test("Java parser handles legacy and current tool output without mistaking date numbers", () => {
  assert.equal(javaMajor('openjdk version "17.0.20.1" 2026-08-18'), 17);
  assert.equal(javaMajor("javac 17.0.20.1"), 17);
  assert.equal(javaMajor('java version "1.8.0_401"'), 8);
  assert.equal(javaMajor("Error code 17 in 2026"), null);
});
