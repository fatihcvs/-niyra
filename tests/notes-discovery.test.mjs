import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (file.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
  if (cache.has(file)) return cache.get(file).exports;
  const testModule = { exports: {} };
  cache.set(file, testModule);
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: testModule, exports: testModule.exports, URLSearchParams, console, require: (specifier) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return require(specifier);
    const target = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
    const resolved = [target, `${target}.tsx`, `${target}.ts`].find(existsSync);
    assert.ok(resolved, `Missing module ${specifier}`);
    return load(resolved);
  } });
  return testModule.exports;
}

const { notesHref, notesLocation } = load("lib/notes-navigation.ts");
const { NotesWorkspace } = load("app/product-features.tsx");
const course = { id: "campus/course&101", code: "MAT 101", name: "Matematik I" };

test("course links preserve the selected course and source across a reload", () => {
  const url = new URL(notesHref(course, "editorial"), "https://campus.test");
  const selected = notesLocation(url.search);
  assert.equal(url.searchParams.get("view"), "notes");
  assert.equal(JSON.stringify(selected.course), JSON.stringify(course));
  assert.equal(selected.source, "editorial");
  assert.equal(notesLocation("?view=discover&course=other&source=editorial").course, null);
  assert.equal(notesLocation("?view=notes&source=unknown").source, "students");
  assert.equal(notesHref(), "/?view=notes");
});

test("notes open with student content and no editorial cards ahead of it", () => {
  const html = renderToStaticMarkup(createElement(NotesWorkspace, { courses: [course] }));
  assert.match(html, /aria-pressed="true"[^>]*><strong>Öğrenci notları/);
  assert.match(html, /Notlar getiriliyor/);
  assert.doesNotMatch(html, /campus-notes-heading/, "an empty/loading list should not duplicate the selected source heading");
  assert.doesNotMatch(html, /class="curated-note-card"/);
});

test("editorial view renders eight sources per page without the student list", () => {
  const html = renderToStaticMarkup(createElement(NotesWorkspace, { courses: [], initialSource: "editorial" }));
  assert.equal((html.match(/class="curated-note-card"/g) ?? []).length, 8);
  assert.match(html, /1–8 \/ 123 kaynak/);
  assert.doesNotMatch(html, /campus-notes-heading/);
});

test("search courses outside the student's enrollment stay selectable and filter editorial sources", () => {
  const html = renderToStaticMarkup(createElement(NotesWorkspace, { courses: [], initialCourse: course, initialSource: "editorial" }));
  assert.match(html, /<option value="campus\/course&amp;101" selected="">MAT 101 · Matematik I<\/option>/);
  assert.match(html, /Limit ve süreklilik/);
  assert.doesNotMatch(html, /1–8 \/ 123 kaynak/);
});
