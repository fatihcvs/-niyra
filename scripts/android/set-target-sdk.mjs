import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, generatedDirectory, raiseTargetSdk } from "./config.mjs";

const config = await loadConfig();
await readFile(path.join(generatedDirectory, ".kampira-generated-project"), "utf8");
const file = path.join(generatedDirectory, "app", "build.gradle");
const before = await readFile(file, "utf8");
const after = raiseTargetSdk(before, config.requiredTargetSdkVersion);
if (after !== before) await writeFile(file, after);
console.log(`Generated Android compile and target SDK are at least ${config.requiredTargetSdkVersion}.`);
