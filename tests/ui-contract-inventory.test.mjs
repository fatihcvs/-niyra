import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectIconInventory } from "../scripts/mobile-quality/icon-inventory.mjs";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test("every imported Phosphor glyph has a meaning; dynamic instances remain explicitly unresolved", () => {
  const inventory = collectIconInventory();
  assert.deepEqual(inventory.summary.unregisteredGlyphs, []);
  assert.ok(inventory.summary.importedGlyphs > 70);
  assert.ok(inventory.summary.jsxUsages > 300);
  assert.ok(inventory.usages.some((item) => item.glyph === "dynamic-unresolved" && item.meaning === "dynamic-unresolved"));
  assert.ok(inventory.usages.some((item) => item.semanticName === "bookmark" && item.glyph === "BookmarkSimple"));
  assert.ok(inventory.glyphs.every((item) => item.meaning !== "unregistered"));
});

test("every real route has explicit capabilities and unknown labels cannot silently inherit a screen", async () => {
  const ui = await createMobileDom();
  try {
    const { workspaceRoutes } = ui.load("lib/workspace-navigation.ts");
    const { workspaceCapabilities, workspaceScreenIdFromSection, ownsWorkspaceMobileHeader } = ui.load("lib/workspace-capabilities.ts");
    for (const [name, id] of Object.entries(workspaceRoutes)) {
      assert.equal(workspaceScreenIdFromSection(name), id);
      assert.ok(workspaceCapabilities[id]);
      assert.ok(["none", "inline", "dedicated"].includes(workspaceCapabilities[id].search));
    }
    assert.equal(workspaceScreenIdFromSection("Unknown translated heading"), null);
    assert.equal(workspaceScreenIdFromSection("Öğrenci"), "public-profile");
    assert.equal(ownsWorkspaceMobileHeader("notes"), true);
    assert.equal(ownsWorkspaceMobileHeader("discover"), false);
    const source = readFileSync(new URL("../app/workspace-ui.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /legacyPrimary|primaryIndex|sectionIcons|actionElements/);
    assert.match(source, /workspaceCapabilities\[screenId\]/);
  } finally { await ui.close(); }
});
