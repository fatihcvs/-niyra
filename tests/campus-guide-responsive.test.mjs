import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/campus-workspace.css", import.meta.url), "utf8");

test("campus guide verification badges stay inside narrow cards", () => {
  assert.match(css, /\.campus-place-list \{ min-width:0;/);
  assert.match(css, /\.campus-place-list article \{ min-width:0; overflow:hidden;/);
  assert.match(css, /\.campus-place-list header>div \{ min-width:0; flex:1 1 auto;/);
  assert.match(css, /\.campus-place-list header>b \{ width:max-content; min-width:max-content; flex:0 0 auto;/);
  assert.match(css, /display:inline-flex; align-items:center; justify-content:center;/);
  assert.match(css, /text-align:center; white-space:nowrap;/);
});
