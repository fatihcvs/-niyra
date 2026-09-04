import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageSource, cssSource] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("authentication screen keeps the campus image free of promotional overlays", () => {
  assert.match(pageSource, /<aside className="auth-aside" aria-hidden="true" \/>/);
  for (const removedCopy of ["MVP v1.7", "TÜRKİYE + KIBRIS", "Derslerini, notlarını ve kampüs çevreni tek yerde bul.", "Gerçek hesabınla başlayan, sana ait akademik alan."]) {
    assert.doesNotMatch(pageSource, new RegExp(removedCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(cssSource, /Temsili kampüs illüstrasyonu/);
});
