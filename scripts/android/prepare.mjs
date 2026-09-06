import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { loadConfig, createTwaManifest, generatedDirectory, outputDirectory } from "./config.mjs";

const config = await loadConfig();
const webManifest = JSON.parse(await readFile(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
await mkdir(generatedDirectory, { recursive: true });
const marker = path.join(generatedDirectory, ".kampira-generated-project");
const files = await readdir(generatedDirectory);
if (files.length) {
  try { await access(marker); } catch { throw new Error("Refusing to replace an unrecognized outputs/android/generated directory."); }
}
await writeFile(marker, "Kampira generated TWA project. Regenerate only with scripts/android/build.ps1.\n");
await writeFile(path.join(generatedDirectory, "twa-manifest.json"), `${JSON.stringify(createTwaManifest(config, webManifest), null, 2)}\n`);
await writeFile(path.join(outputDirectory, "preparation.json"), `${JSON.stringify({
  origin: config.origin,
  packageId: config.packageId,
  packageIdProvisional: config.packageIdProvisional,
  requiredTargetSdkVersion: config.requiredTargetSdkVersion,
  bubblewrapVersion: config.bubblewrapVersion,
  generatedAndroidProject: false,
  signedArtifact: false,
  published: false,
}, null, 2)}\n`);
console.log(`TWA configuration prepared in outputs/android/generated for ${config.origin}.`);
console.log(`Package: ${config.packageId}${config.packageIdProvisional ? " (provisional; finalize before the first Play upload)" : ""}. No SDK, signing key, APK, AAB or deployment was created.`);
