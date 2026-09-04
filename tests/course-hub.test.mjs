import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard course cards open real course interactions", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /onClick=\{\(\) => setShowAllSubjects\(true\)\}>Tümünü gör/);
  assert.match(source, /onClick=\{\(\) => setSelectedSubject\(subject\)\}/);
  assert.match(source, /DERS MERKEZİ/);
  assert.match(source, /Notları gör/);
  assert.match(source, /Akışta paylaş/);
  assert.match(source, /setNotesCourseId\(selectedSubject\.id\)/);
  assert.match(source, /setComposerCourseId\(selectedSubject\.id\)/);
  assert.match(source, /courseId: composerCourseId, audience/);
  assert.match(source, /const audience = composerCourseId \? "campus" : draftAudience/);
});

test("course cards use representative covers and disclose them as representative", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const covers = ["programming.jpg", "mathematics.jpg", "physics.jpg", "study.jpg"];

  assert.match(source, /<Image src=\{subject\.imageUrl\} alt="" fill/);
  assert.match(source, /Temsili ders kapağı/);
  assert.doesNotMatch(source, /index < 3 && <i>\{index \+ 2\}<\/i>/);

  await Promise.all(covers.map((file) => access(new URL(`../public/course-covers/${file}`, import.meta.url))));
});

test("notes workspace accepts a course selected from the dashboard", async () => {
  const source = await readFile(new URL("../app/product-features.tsx", import.meta.url), "utf8");
  assert.match(source, /initialCourseId = ""/);
  assert.match(source, /useState\(initialCourseId\)/);
});
