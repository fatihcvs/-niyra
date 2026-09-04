import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const [packageJson, layoutSource, pageSource, legalSource, staffSource, cssSource] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/legal/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/staff-console.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("project identity is Kampira", () => {
  assert.equal(packageJson.name, "kampira");
  assert.equal(packageJson.displayName, "Kampira");
  assert.match(layoutSource, /Kampira · Kampüsün tek yerde/);
  assert.match(pageSource, /className="brand-name">Kampira</);
});

test("all visible brand surfaces use the selected Kampira mark", async () => {
  await access(new URL("../public/kampira-mark.png", import.meta.url));
  await access(new URL("../public/kampira-logo-final.png", import.meta.url));
  assert.match(layoutSource, /\/kampira-mark\.png/);
  assert.match(cssSource, /background: url\('\/kampira-mark\.png'\)/);
  assert.match(legalSource, /src="\/kampira-mark\.png"/);
  assert.match(staffSource, /src="\/kampira-mark\.png"/);
  assert.doesNotMatch(`${layoutSource}\n${pageSource}\n${legalSource}\n${staffSource}\n${cssSource}`, /\/uniyra-mark\.png/);
});
