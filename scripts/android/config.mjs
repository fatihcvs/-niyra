import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const outputDirectory = path.join(projectRoot, "outputs", "android");
export const generatedDirectory = path.join(outputDirectory, "generated");

export function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.port) {
    throw new Error("Android origin must be an HTTPS hostname without credentials, port, path or query.");
  }
  if (url.hostname === "localhost" || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) {
    throw new Error("Android origin must be a public production hostname.");
  }
  return url.origin;
}

export function validatePackageId(value) {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(value)) {
    throw new Error("Android packageId must be a lower-case reverse-domain identifier.");
  }
  return value;
}

export async function loadConfig(environment = process.env) {
  const config = JSON.parse(await readFile(new URL("./app-config.json", import.meta.url), "utf8"));
  return {
    ...config,
    origin: normalizeOrigin(environment.KAMPIRA_APP_ORIGIN || config.origin),
    packageId: validatePackageId(environment.KAMPIRA_ANDROID_PACKAGE_ID || config.packageId),
  };
}

export function createTwaManifest(config, webManifest) {
  const origin = normalizeOrigin(config.origin);
  const absolute = (url) => {
    const resolved = new URL(url, `${origin}/`);
    if (resolved.origin !== origin) throw new Error("App manifest assets and shortcuts must use the configured origin.");
    return resolved.href;
  };
  const launch = new URL(webManifest.start_url, origin);
  if (launch.origin !== origin) throw new Error("The app launch URL must use the configured origin.");
  return {
    packageId: validatePackageId(config.packageId),
    host: new URL(origin).host,
    name: webManifest.name,
    launcherName: webManifest.short_name,
    display: "standalone",
    themeColor: "#ffffff",
    themeColorDark: "#141720",
    navigationColor: "#ffffff",
    navigationColorDark: "#141720",
    navigationDividerColor: "#e4e7ed",
    navigationDividerColorDark: "#2a2f3c",
    backgroundColor: "#f5f6f8",
    enableNotifications: false,
    enableSiteSettingsShortcut: true,
    startUrl: `${launch.pathname}${launch.search}`,
    iconUrl: absolute("/app-icons/kampira-512.png"),
    maskableIconUrl: absolute("/app-icons/kampira-maskable-512.png"),
    splashScreenFadeOutDuration: 200,
    signingKey: { path: "../private-upload-key.jks", alias: "kampira-upload" },
    appVersion: config.appVersionName,
    appVersionCode: config.appVersionCode,
    minSdkVersion: config.minSdkVersion,
    shortcuts: webManifest.shortcuts.map((shortcut) => ({
      name: shortcut.name,
      shortName: shortcut.name,
      url: absolute(shortcut.url),
      chosenIconUrl: absolute("/app-icons/kampira-192.png"),
    })),
    generatorApp: `bubblewrap-cli@${config.bubblewrapVersion}`,
    webManifestUrl: absolute("/manifest.webmanifest"),
    fullScopeUrl: absolute("/"),
    fallbackType: "customtabs",
    orientation: "default",
    features: {},
    alphaDependencies: { enabled: false },
    additionalTrustedOrigins: [],
    fingerprints: [],
  };
}

export function createAssetLinks(packageId, fingerprints) {
  if (!fingerprints.length) throw new Error("Provide a real Play app-signing SHA-256 certificate fingerprint; none will be invented.");
  const normalized = [...new Set(fingerprints.map((fingerprint) => {
    const compact = fingerprint.replace(/:/g, "").toUpperCase();
    if (!/^[A-F0-9]{64}$/.test(compact) || new Set(compact.match(/../g)).size < 2) {
      throw new Error("Invalid SHA-256 certificate fingerprint.");
    }
    return compact.match(/../g).join(":");
  }))];
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: validatePackageId(packageId), sha256_cert_fingerprints: normalized },
  }];
}

export function raiseTargetSdk(gradle, minimum) {
  let next = gradle;
  for (const field of ["compileSdk", "targetSdk"]) {
    const expression = new RegExp(`\\b(${field}(?:Version)?\\s*(?:=\\s*)?)(\\d+)`, "g");
    const matches = [...next.matchAll(expression)];
    if (matches.length !== 1) throw new Error(`Cannot safely locate one literal ${field} value in generated app/build.gradle.`);
    next = next.replace(expression, (_, prefix, value) => `${prefix}${Math.max(Number(value), minimum)}`);
  }
  return next;
}
