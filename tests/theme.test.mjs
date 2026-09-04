import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageSource, layoutSource, cssSource] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("appearance settings offer light, dark and system preferences", () => {
  assert.match(pageSource, /type ThemePreference = "light" \| "dark" \| "system"/);
  assert.match(pageSource, /role="radiogroup" aria-label="Tema seçimi"/);
  assert.match(pageSource, /window\.localStorage\.setItem\("uniyra-theme", themePreference\)/);
});

test("saved theme is restored before the application body renders", () => {
  assert.match(layoutSource, /localStorage\.getItem\("uniyra-theme"\)/);
  assert.match(layoutSource, /prefers-color-scheme: dark/);
  assert.match(layoutSource, /suppressHydrationWarning/);
});

test("dark appearance has an explicit accessible color palette", () => {
  assert.match(cssSource, /html\[data-theme="dark"\]/);
  assert.match(cssSource, /--canvas:#0d1018/);
  assert.match(cssSource, /color-scheme:dark/);
});
