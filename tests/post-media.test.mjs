import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/post-media.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { parseMediaRange, validatePostMedia, hydratePostMedia, POST_IMAGE_MAX_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("media upload checks image signatures, file types and size before reading bytes", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=", "base64");
  const media = await validatePostMedia(new File([png], "fotoğraf.PNG", { type: "image/png" }));
  assert.equal(media.kind, "image");
  assert.equal(media.contentType, "image/png");
  assert.deepEqual(Buffer.from(media.bytes), png);
  await assert.rejects(validatePostMedia(new File(["<svg/>"], "photo.png", { type: "image/png" })), { status: 415 });
  await assert.rejects(validatePostMedia(new File([png], "photo.jpg", { type: "image/png" })), { status: 415 });
  await assert.rejects(validatePostMedia(new File([], "empty.png", { type: "image/png" })), { status: 400 });
  await assert.rejects(validatePostMedia({ type: "image/png", name: "large.png", size: POST_IMAGE_MAX_BYTES + 1, arrayBuffer() { throw new Error("Should not read oversize file"); } }), { status: 413 });
});

test("video upload distinguishes accepted MP4/WebM containers from renamed images", async () => {
  const mp4 = Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 0, 0, ...Buffer.from("isommp42")]);
  assert.equal((await validatePostMedia(new File([mp4], "clip.mp4", { type: "video/mp4" }))).kind, "video");
  const imageContainer = Buffer.from(mp4);
  imageContainer.write("avif", 8); imageContainer.write("avif", 16); imageContainer.write("mif1", 20);
  await assert.rejects(validatePostMedia(new File([imageContainer], "image.mp4", { type: "video/mp4" })), { status: 415 });
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("0000webm0000")]);
  assert.equal((await validatePostMedia(new File([webm], "clip.webm", { type: "video/webm" }))).kind, "video");
  await assert.rejects(validatePostMedia(new File(["a renamed video"], "clip.mp4", { type: "video/mp4" })), { status: 415 });
});

test("byte ranges support seeking and reject malformed or unsatisfiable ranges", () => {
  assert.equal(parseMediaRange(null, 100), null);
  assert.deepEqual(parseMediaRange("bytes=10-19", 100), { offset: 10, length: 10 });
  assert.deepEqual(parseMediaRange("bytes=90-", 100), { offset: 90, length: 10 });
  assert.deepEqual(parseMediaRange("bytes=-20", 100), { offset: 80, length: 20 });
  assert.deepEqual(parseMediaRange("bytes=90-150", 100), { offset: 90, length: 10 });
  assert.deepEqual(parseMediaRange("bytes=-150", 100), { offset: 0, length: 100 });
  for (const header of ["bytes=100-", "bytes=20-10", "bytes=-0", "bytes=-", "bytes=0-1,3-4", "items=0-1", "bytes=0-9999999999999999999999"]) {
    assert.equal(parseMediaRange(header, 100), "invalid", header);
  }
});

test("metadata hydration maps attachments to posts without exposing object storage keys", async () => {
  let queried = false;
  const db = { prepare() { queried = true; return { bind(...ids) { assert.deepEqual(ids, ["post-a", "post-b"]); return { async all() { return { results: [{ id: "media-1", post_id: "post-a", kind: "image", content_type: "image/png", original_file_name: "photo.png", object_key: "secret-storage-key" }] }; } }; } }; } };
  assert.equal((await hydratePostMedia(db, [])).size, 0);
  assert.equal(queried, false);
  const result = await hydratePostMedia(db, ["post-a", "post-a", "post-b"]);
  assert.deepEqual(result.get("post-a"), [{ id: "media-1", kind: "image", url: "/api/posts/media?id=media-1", contentType: "image/png", fileName: "photo.png" }]);
  assert.equal(result.has("post-b"), false);
});
