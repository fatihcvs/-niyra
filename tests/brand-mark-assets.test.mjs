import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const receipt = JSON.parse(await readFile(new URL("../docs/mobile/F13_MARK_ASSETS.json", import.meta.url), "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("prebuilt header marks remain traceable transparent derivatives of the untouched source", async () => {
  const source = await readFile(new URL(`../public${receipt.source.path}`, import.meta.url));
  assert.equal(digest(source), receipt.source.sha256);
  const original = await sharp(source).metadata();
  for (const output of receipt.outputs) {
    const bytes = await readFile(new URL(`../public${output.path}`, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    assert.equal(digest(bytes), output.sha256);
    assert.equal(bytes.length, output.bytes);
    assert.ok(bytes.length < source.length / 10);
    assert.equal(metadata.width, output.width);
    assert.equal(metadata.height, output.height);
    assert.equal(metadata.width / metadata.height, original.width / original.height);
    assert.equal(metadata.hasAlpha, true);
    assert.equal(metadata.space, original.space);
    assert.equal(metadata.icc ? digest(metadata.icc) : null, original.icc ? digest(original.icc) : null);
    assert.equal((await sharp(bytes).stats()).channels.at(-1).min, 0);
  }
});
