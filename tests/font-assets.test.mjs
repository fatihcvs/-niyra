import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("self-hosted font faces resolve from every checkout and preserve Turkish glyph ranges", async () => {
  const cssUrl = new URL("../app/fonts.css", import.meta.url);
  const css = await readFile(cssUrl, "utf8");
  const sources = [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.equal(sources.length, 11);
  for (const source of sources) {
    assert.ok(source.startsWith("../.vinext/fonts/"), source);
    const bytes = await readFile(new URL(source, cssUrl));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
  }
  for (const family of ["Geist", "Geist Mono"]) {
    const faces = css.match(/@font-face\s*\{[^}]+\}/g).filter((face) => face.includes(`font-family: '${family}';`));
    assert.ok(faces.some((face) => face.includes("U+0100-02BA")), `${family} Latin extended covers Turkish characters`);
    assert.ok(faces.every((face) => face.includes("font-weight: 100 900")));
  }
  assert.doesNotMatch(css, /\/workspace\/|[A-Z]:[\\/]|https?:\/\//);
});
