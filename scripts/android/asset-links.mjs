import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, createAssetLinks, outputDirectory } from "./config.mjs";

const config = await loadConfig();
const fingerprints = process.argv.slice(2);
const links = createAssetLinks(config.packageId, fingerprints);
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "assetlinks.json"), `${JSON.stringify(links, null, 2)}\n`);
console.log("Digital Asset Links prepared at outputs/android/assetlinks.json. Review and publish it at /.well-known/assetlinks.json only after the app identity and Play signing certificate are final.");
