import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/post-media.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { readPostImageDimensions, validatePostMedia, hydratePostMedia } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const fixtureDirectory = new URL("./fixtures/post-media/", import.meta.url);
const cases = [
  ["7x5.png", "image/png", 7, 5],
  ["7x5.jpg", "image/jpeg", 7, 5],
  ["7x5-progressive.jpg", "image/jpeg", 7, 5],
  ["7x5-orientation6.jpg", "image/jpeg", 5, 7],
  ["7x5-orientation6.png", "image/png", 5, 7],
  ["7x5-lossy.webp", "image/webp", 7, 5],
  ["7x5-lossless.webp", "image/webp", 7, 5],
  ["7x5-alpha.webp", "image/webp", 7, 5],
  ["7x5-orientation6.webp", "image/webp", 5, 7],
  ["7x5-animated.webp", "image/webp", 7, 5],
];
const fixtures = new Map(await Promise.all(cases.map(async ([name]) => [name, await readFile(new URL(name, fixtureDirectory))])));

test("real PNG, baseline/progressive JPEG and WebP files expose display dimensions without modifying bytes", async () => {
  for (const [name, type, width, height] of cases) {
    const bytes = fixtures.get(name);
    const before = Buffer.from(bytes);
    const uploaded = await validatePostMedia(new File([bytes], name, { type }));
    assert.deepEqual({ width: uploaded.width, height: uploaded.height }, { width, height }, name);
    assert.deepEqual(Buffer.from(uploaded.bytes), before, name);
    const padded = Buffer.concat([Buffer.alloc(17, 0xfe), bytes, Buffer.alloc(11, 0xff)]);
    assert.deepEqual(readPostImageDimensions(padded.subarray(17, 17 + bytes.length), type), { width, height }, `${name}: buffer offset`);
  }
});

function tiff(orientation, { little = true, ifdOffset = 8 } = {}) {
  const bytes = Buffer.alloc(ifdOffset + 2 + 12 + 4);
  bytes.write(little ? "II" : "MM");
  const short = (value, at) => little ? bytes.writeUInt16LE(value, at) : bytes.writeUInt16BE(value, at);
  const long = (value, at) => little ? bytes.writeUInt32LE(value, at) : bytes.writeUInt32BE(value, at);
  short(42, 2); long(ifdOffset, 4); short(1, ifdOffset);
  short(0x112, ifdOffset + 2); short(3, ifdOffset + 4); long(1, ifdOffset + 6); short(orientation, ifdOffset + 10);
  return bytes;
}

function jpegWithExif(metadata) {
  const payload = Buffer.concat([Buffer.from("Exif\0\0"), metadata]);
  const segment = Buffer.alloc(4);
  segment[0] = 0xff; segment[1] = 0xe1; segment.writeUInt16BE(payload.length + 2, 2);
  const jpeg = fixtures.get("7x5.jpg");
  return Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
}

test("IFD0 byte order, non-default directory offsets and all eight EXIF orientations preserve displayed aspect ratio", () => {
  for (const little of [true, false]) {
    for (const ifdOffset of [8, 16]) {
      for (let orientation = 1; orientation <= 8; orientation++) {
        assert.deepEqual(readPostImageDimensions(jpegWithExif(tiff(orientation, { little, ifdOffset })), "image/jpeg"),
          orientation >= 5 ? { width: 5, height: 7 } : { width: 7, height: 5 });
      }
    }
  }
});

test("invalid, conflicting and out-of-bounds EXIF metadata falls back without throwing or following pointers", () => {
  const wrongOffset = tiff(6); wrongOffset.writeUInt32LE(0xfffffff0, 4);
  const longDirectory = tiff(6); longDirectory.writeUInt16LE(65535, 8);
  const wrongType = tiff(6); wrongType.writeUInt16LE(4, 12);
  const wrongCount = tiff(6); wrongCount.writeUInt32LE(2, 14);
  for (const metadata of [Buffer.alloc(0), tiff(0), tiff(9), tiff(6).subarray(0, 15), wrongOffset, longDirectory, wrongType, wrongCount]) {
    assert.equal(readPostImageDimensions(jpegWithExif(metadata), "image/jpeg"), undefined);
  }
  const one = jpegWithExif(tiff(6));
  const two = jpegWithExif(tiff(1));
  assert.equal(readPostImageDimensions(Buffer.concat([one.subarray(0, one.length - fixtures.get("7x5.jpg").length + 2), two.subarray(2)]), "image/jpeg"), undefined);
});

test("truncated files, hostile lengths, zero/oversized dimensions and unsupported formats retain a safe fallback", async () => {
  for (const [name, type] of cases) {
    const bytes = fixtures.get(name);
    for (let length = 0; length < bytes.length; length++) {
      assert.doesNotThrow(() => readPostImageDimensions(bytes.subarray(0, length), type), `${name} prefix ${length}`);
    }
    assert.equal(readPostImageDimensions(bytes.subarray(0, 20), type), undefined);
  }
  const png = fixtures.get("7x5.png");
  for (const width of [0, 65536, 0xffffffff]) {
    const invalid = Buffer.from(png); invalid.writeUInt32BE(width, 16);
    assert.equal(readPostImageDimensions(invalid, "image/png"), undefined);
  }
  const pngLength = Buffer.from(png); pngLength.writeUInt32BE(0xfffffff0, 8);
  assert.equal(readPostImageDimensions(pngLength, "image/png"), undefined);
  const webp = Buffer.from(fixtures.get("7x5-lossy.webp")); webp.writeUInt32LE(0xfffffff0, 16);
  assert.equal(readPostImageDimensions(webp, "image/webp"), undefined);
  const jpeg = Buffer.from(fixtures.get("7x5.jpg")); jpeg.writeUInt16BE(65535, 4);
  assert.equal(readPostImageDimensions(jpeg, "image/jpeg"), undefined);
  assert.equal(readPostImageDimensions(png, "video/mp4"), undefined);
  // Optional metadata does not silently change the existing signature-only upload contract.
  const legacyAcceptedHeader = await validatePostMedia(new File([png.subarray(0, 24)], "header.png", { type: "image/png" }));
  assert.equal(legacyAcceptedHeader.width, undefined);
  assert.equal(legacyAcceptedHeader.height, undefined);
});

test("0025 upgrades existing media without a backfill; old writers, NULL fallback and verified pairs coexist", async (t) => {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name) && name < "0025").sort()) {
    database.exec(await readFile(new URL(name, directory), "utf8"));
  }
  database.exec(`
    INSERT INTO users (email, display_name, handle) VALUES ('image@test.local', 'Image', 'image');
    INSERT INTO posts (id, author_email, content) VALUES ('old-post', 'image@test.local', 'Existing image');
    INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size)
      VALUES ('old-image', 'old-post', 'image', 'old-key', 'existing.png', 'image/png', 100);
  `);
  database.exec(await readFile(new URL("0025_post_media_dimensions.sql", directory), "utf8"));
  const legacy = database.prepare("SELECT width, height FROM post_media WHERE id = 'old-image'").get();
  assert.equal(legacy.width, null); assert.equal(legacy.height, null);
  database.exec(`
    INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size)
      VALUES ('old-writer', 'old-post', 'image', 'second-key', 'legacy.png', 'image/png', 100);
    INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size, width, height)
      VALUES ('new-image', 'old-post', 'image', 'new-key', 'phone.jpg', 'image/jpeg', 200, 5, 7),
             ('video', 'old-post', 'video', 'video-key', 'video.mp4', 'video/mp4', 200, NULL, NULL);
  `);
  for (const invalid of [0, -1, 65536, 1.5]) {
    assert.throws(() => database.prepare("UPDATE post_media SET width = ? WHERE id = 'new-image'").run(invalid), /CHECK constraint/);
  }
  // The current reader also depends on the later additive ordering migration.
  database.exec(await readFile(new URL("0026_post_media_order.sql", directory), "utf8"));
  const db = { prepare(sql) { return { bind(...params) { return { async all() { return { results: database.prepare(sql).all(...params) }; } }; } }; } };
  const hydrated = (await hydratePostMedia(db, ["old-post"])).get("old-post");
  for (const id of ["old-image", "old-writer", "video"]) {
    assert.equal("width" in hydrated.find((item) => item.id === id), false);
    assert.equal("height" in hydrated.find((item) => item.id === id), false);
  }
  const verified = hydrated.find((item) => item.id === "new-image");
  assert.equal(verified.width, 5); assert.equal(verified.height, 7);
  assert.equal("object_key" in verified, false);
  database.exec("UPDATE post_media SET height = NULL WHERE id = 'new-image'");
  assert.equal("width" in (await hydratePostMedia(db, ["old-post"])).get("old-post").find((item) => item.id === "new-image"), false);
});
