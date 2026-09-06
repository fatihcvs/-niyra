import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const sourcePath = path.join(root, "public/kampira-mark.png");
const outputDirectory = path.join(root, "public/brand");
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const source = await readFile(sourcePath);
const originalHash = digest(source);
const metadata = await sharp(source).metadata();
assert.equal(metadata.format, "png");
assert.equal(metadata.width, metadata.height, "No crop or aspect-ratio change is permitted");
assert.equal(metadata.hasAlpha, true, "The source transparency must remain available");
await mkdir(outputDirectory, { recursive: true });
const outputs = [];
for (const size of [128, 256]) {
  // Pure build derivative: no extract/crop, flatten, tint, drawing or replacement artwork.
  const buffer = await sharp(source).keepMetadata().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true, kernel: sharp.kernel.lanczos3 }).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
  const result = await sharp(buffer).metadata();
  assert.equal(result.width, size);
  assert.equal(result.height, size);
  assert.equal(result.hasAlpha, metadata.hasAlpha);
  assert.equal(result.space, metadata.space);
  assert.equal(result.icc ? digest(result.icc) : null, metadata.icc ? digest(metadata.icc) : null, "ICC profile must be preserved, including its absence");
  const stats = await sharp(buffer).stats();
  assert.equal(stats.channels.at(-1).min, 0, "Transparent pixels must remain transparent");
  const file = `kampira-mark-${size}.png`;
  await writeFile(path.join(outputDirectory, file), buffer);
  outputs.push({ path: `/brand/${file}`, width: result.width, height: result.height, bytes: buffer.length, sha256: digest(buffer), alpha: result.hasAlpha, colourSpace: result.space, iccBytes: result.icc?.length ?? 0 });
}
assert.equal(digest(await readFile(sourcePath)), originalHash, "The original mark must not be modified");
const receipt = { tool: { sharp: sharp.versions.sharp, vips: sharp.versions.vips }, source: { path: "/kampira-mark.png", width: metadata.width, height: metadata.height, bytes: source.length, sha256: originalHash, alpha: metadata.hasAlpha, colourSpace: metadata.space, iccBytes: metadata.icc?.length ?? 0 }, operation: "aspect-preserving Lanczos3 downscale; metadata and transparency retained", outputs };
await writeFile(path.join(root, "docs/mobile/F13_MARK_ASSETS.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
