import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));

export function javaMajor(output) {
  const match = String(output).match(/(?:version\s+"?|javac\s+)(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1] === "1" ? match[2] : match[1]) : null;
}

/** Keep transport serials, network addresses and raw command output out of reports. */
export function adbDeviceSummary(output) {
  const devices = [];
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.trim().match(/^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader|no permissions)(?=\s|$)/);
    if (match) devices.push({ kind: match[1].startsWith("emulator-") ? "emulator" : "hardware-or-remote", state: match[2] });
  }
  const queried = /List of devices attached/.test(output);
  return {
    status: queried ? "queried" : "unrecognized-output",
    devices: queried ? devices : [],
    usable: queried ? devices.filter((device) => device.state === "device").length : 0,
    physicalDeviceVerified: false,
  };
}

/** No SDK install, license acceptance, environment mutation, build or device install. */
export function inspectAndroidEnvironment({
  environment = process.env,
  platform = process.platform,
  projectDirectory = repository,
  exists = existsSync,
  directories = (directory) => {
    try { return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); }
    catch { return []; }
  },
  run = (command, args) => spawnSync(command, args, { encoding: "utf8", timeout: 10000, windowsHide: true, env: environment }),
  now = () => new Date().toISOString(),
} = {}) {
  const filePath = platform === "win32" ? path.win32 : path.posix;
  const executable = (name) => platform === "win32" ? `${name}.exe` : name;
  const batch = (name) => platform === "win32" ? `${name}.bat` : name;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const joinIf = (base, ...parts) => base ? filePath.join(base, ...parts) : null;
  const environmentPath = Object.entries(environment).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  const findCommand = (name) => environmentPath.split(platform === "win32" ? ";" : ":")
    .filter(Boolean).map((entry) => filePath.join(entry.replace(/^"|"$/g, ""), executable(name))).find(exists) ?? null;
  const descendants = (directory) => directory ? directories(directory).slice(0, 64).map((name) => filePath.join(directory, name)) : [];
  const toolchain = filePath.join(projectDirectory, "outputs", "android", "toolchain");
  const studio = unique([
    joinIf(environment.ProgramFiles, "Android", "Android Studio"),
    joinIf(environment.LOCALAPPDATA, "Programs", "Android Studio"),
  ]);
  const javaDirectories = unique([
    ...descendants(filePath.join(toolchain, "jdk")),
    environment.JAVA_HOME,
    ...studio.map((directory) => filePath.join(directory, "jbr")),
    ...descendants(joinIf(environment.ProgramFiles, "Java")),
    ...descendants(joinIf(environment.ProgramFiles, "Eclipse Adoptium")),
    ...descendants(joinIf(environment.ProgramFiles, "Microsoft")),
  ]);
  const javaHome = javaDirectories.find((directory) => exists(filePath.join(directory, "bin", executable("java"))) && exists(filePath.join(directory, "bin", executable("javac")))) ?? null;
  const java = javaHome ? filePath.join(javaHome, "bin", executable("java")) : findCommand("java");
  const javac = javaHome ? filePath.join(javaHome, "bin", executable("javac")) : findCommand("javac");
  const sdkCandidates = unique([
    filePath.join(toolchain, "sdk"), environment.ANDROID_HOME, environment.ANDROID_SDK_ROOT,
    joinIf(environment.LOCALAPPDATA, "Android", "Sdk"),
  ]);
  const sdkRoot = sdkCandidates.find(exists) ?? null;
  const commandLineCandidates = sdkRoot ? unique([
    // Pin the classic sdkmanager used by the existing Bubblewrap build workflow.
    filePath.join(sdkRoot, "cmdline-tools", "20.0", "bin", batch("sdkmanager")),
    filePath.join(sdkRoot, "cmdline-tools", "latest", "bin", batch("sdkmanager")),
    ...descendants(filePath.join(sdkRoot, "cmdline-tools")).map((directory) => filePath.join(directory, "bin", batch("sdkmanager"))),
    filePath.join(sdkRoot, "tools", "bin", batch("sdkmanager")),
  ]) : [];
  const sdkmanager = commandLineCandidates.find(exists) ?? null;
  const sdkAdb = sdkRoot ? filePath.join(sdkRoot, "platform-tools", executable("adb")) : null;
  const adb = sdkAdb && exists(sdkAdb) ? sdkAdb : findCommand("adb");
  const inspectVersion = (command, args) => {
    if (!command) return { status: "unavailable", major: null };
    try {
      const result = run(command, args);
      if (result.error || result.status !== 0) return { status: "failed", major: null };
      const major = javaMajor(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
      return { status: major ? "verified" : "unrecognized-output", major };
    } catch { return { status: "failed", major: null }; }
  };
  const javaVersion = inspectVersion(java, ["-version"]);
  const javacVersion = inspectVersion(javac, ["-version"]);
  let devices = { status: "adb-unavailable", devices: [], usable: 0, physicalDeviceVerified: false };
  if (adb) {
    try {
      const result = run(adb, ["devices", "-l"]);
      devices = !result.error && result.status === 0 ? adbDeviceSummary(result.stdout ?? "") : { ...devices, status: "query-failed" };
    } catch { devices.status = "query-failed"; }
  }
  const sdkHas = (...parts) => Boolean(sdkRoot && exists(filePath.join(sdkRoot, ...parts)));
  const components = {
    java17: javaVersion.status === "verified" && javaVersion.major === 17 && javacVersion.status === "verified" && javacVersion.major === 17,
    sdkmanager: Boolean(sdkmanager),
    adb: Boolean(adb),
    android36: sdkHas("platforms", "android-36", "android.jar"),
    buildTools36: sdkHas("build-tools", "36.0.0", executable("aapt2")) && sdkHas("build-tools", "36.0.0", batch("apksigner")),
    sdkLicenseRecord: sdkHas("licenses", "android-sdk-license"),
    generatedGradleWrapper: exists(filePath.join(projectDirectory, "outputs", "android", "generated", batch("gradlew"))),
  };
  return {
    checkedAt: now(), platform,
    paths: { toolchain, javaHome, java, javac, sdkRoot, sdkmanager, adb, androidStudio: studio.find(exists) ?? null },
    javaVersion, javacVersion, components, devices,
    missing: Object.entries(components).filter(([, available]) => !available).map(([name]) => name),
    unsignedBuildPrerequisitesPresent: Object.values(components).every(Boolean),
    // Files and an authorized transport cannot prove licenses, a build, or physical QA.
    evidence: { buildExecuted: false, artifactVerified: false, deviceJourneyVerified: false, nativeArchitectureSelected: false },
  };
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === path.resolve(fileURLToPath(import.meta.url))) {
  const result = inspectAndroidEnvironment();
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Android environment: ${result.checkedAt}`);
    console.log(`Java/Javac: ${result.javaVersion.major ?? result.javaVersion.status}/${result.javacVersion.major ?? result.javacVersion.status}`);
    console.log(`SDK: ${result.paths.sdkRoot ?? "not found"}`);
    console.log(`Missing prerequisites: ${result.missing.join(", ") || "none detected"}`);
    console.log(`ADB: ${result.devices.status}; authorized transports: ${result.devices.usable}`);
    console.log("No build, license acceptance, device journey or native decision is implied.");
  }
  if (process.argv.includes("--require-build-tools") && !result.unsignedBuildPrerequisitesPresent) process.exitCode = 1;
}
