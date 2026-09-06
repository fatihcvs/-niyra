import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = fileURLToPath(new URL("../../public/kampira-mark.png", import.meta.url));
const output = fileURLToPath(new URL("../../public/app-icons/", import.meta.url));
await mkdir(output, { recursive: true });
for (const [filename, size, scale] of [
  ["kampira-180.png", 180, 0.88],
  ["kampira-192.png", 192, 0.88],
  ["kampira-512.png", 512, 0.88],
  ["kampira-maskable-512.png", 512, 0.66],
]) {
  const mark = await sharp(source).resize(Math.round(size * scale), Math.round(size * scale), { fit: "contain" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: mark, gravity: "centre" }]).flatten({ background: "#ffffff" }).png()
    .toFile(`${output}/${filename}`);
}
console.log("Kampira installation icons exported from the existing brand mark.");
