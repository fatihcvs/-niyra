import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard course cards open real course interactions", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const hub = await readFile(new URL("../app/course-hub.tsx", import.meta.url), "utf8");

  assert.match(source, /<CourseHubLayers /);
  assert.match(hub, /DERS MERKEZİ/);
  assert.match(hub, /Notları gör/);
  assert.match(hub, /Akışta paylaş/);
  assert.match(source, /publishAttempt\.current\.begin\(\{ content: clean, audience: composerCourseId \? "campus" : draftAudience, courseId: composerCourseId, media: draftMedia, mediaFiles: composerMedia\.files \}\)/);
});

test("course cards use representative covers and disclose them as representative", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const hub = await readFile(new URL("../app/course-hub.tsx", import.meta.url), "utf8");
  const covers = ["programming.jpg", "mathematics.jpg", "physics.jpg", "study.jpg"];

  assert.match(source, /<Image src=\{subject\.imageUrl\} alt="" fill/);
  assert.match(hub, /Temsili ders kapağı/);
  assert.doesNotMatch(source, /index < 3 && <i>\{index \+ 2\}<\/i>/);

  await Promise.all(covers.map((file) => access(new URL(`../public/course-covers/${file}`, import.meta.url))));
});

// Actual Home callbacks, layer/history behavior and owner isolation run in
// course-hub-runtime.test.mjs. Notes rendering/reload also runs in notes-discovery.test.mjs.
