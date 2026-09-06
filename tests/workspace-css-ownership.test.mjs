import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import postcss from "postcss";
import { moduleSheet, probe, specificity } from "./helpers/workspace-css-cascade.mjs";

const tooling = createRequire(new URL("../scripts/mobile-quality/package.json", import.meta.url));
const { JSDOM } = tooling("jsdom");
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const baseline = JSON.parse(read("tests/fixtures/workspace-css-baseline.json"));
const layout = read("app/layout.tsx");
const files = ["workspace-ui.css", ...[...layout.matchAll(/import "\.\/(.+\.css)"/g)].map(match => match[1])];
const current = files.map(file => postcss.parse(read(`app/${file}`)));
current.push(moduleSheet(read("app/campus-guide.module.css"), "camp"), moduleSheet(read("app/communities-workspace.module.css"), "comm"));
const before = baseline.sheets.map(sheet => postcss.parse(sheet.css));
const dom = new JSDOM(read("tests/fixtures/workspace-css.html"));
test.after(() => dom.window.close());

test("cascade probe applies functional pseudo specificity instead of counting every :is branch", () => {
  assert.deepEqual(specificity("html[data-theme] .workspace-view :is(.a,#strong) button"), [1, 2, 2]);
  assert.deepEqual(specificity(".root :where(#ignored,.another) button:not(:disabled)"), [0, 2, 1]);
  assert.deepEqual(specificity('.root:has(> [aria-pressed="true"])'), [0, 2, 0]);
  const target = dom.window.document.querySelector('[data-probe="notes-active-tab"]');
  const result = probe([postcss.parse('.notes-toolbar button {padding:8px 12px}.active{padding-left:0}.notes-toolbar button{padding-right:14px}')], target, 390);
  assert.equal(result["padding-left"], "12px");
  assert.equal(result["padding-right"], "14px");
});

for (const width of [320, 390, 767, 768, 780, 781, 1440]) for (const theme of ["light", "dark"]) {
  test(`workspace CSS migration preserves observed declaration winners at ${width}px / ${theme}`, () => {
    dom.window.document.documentElement.dataset.theme = theme;
    for (const element of dom.window.document.querySelectorAll("[data-probe]")) {
      for (const pseudo of ["", "after"]) {
        assert.deepEqual(probe(current, element, width, false, pseudo), probe(before, element, width, false, pseudo), `${element.dataset.probe}${pseudo ? "::" + pseudo : ""}`);
      }
    }
  });
}

test("pilot styles have explicit owners while shared controls and module isolation remain intact", () => {
  assert.ok(files.indexOf("notes-workspace.css") > files.indexOf("visual-polish.css"));
  assert.ok(files.indexOf("campus-workspace.css") < files.indexOf("interaction-motion.css"));
  const notes = postcss.parse(read("app/notes-workspace.css")), campus = postcss.parse(read("app/campus-workspace.css"));
  let notesCount = 0, campusCount = 0;
  notes.walkRules(() => notesCount++); campus.walkRules(() => campusCount++);
  assert.ok(notesCount > 100); assert.ok(campusCount > 100);
  for (const file of ["globals.css", "social-design.css", "mobile-workspaces.css", "visual-polish.css"]) {
    postcss.parse(read(`app/${file}`)).walkRules(rule => {
      assert.ok(!rule.selectors.some(selector => /^\.notes-(?:source-switch|toolbar|filter-controls|active-filters)(?:[ >:[.]|$)/.test(selector)), `${file}: dedicated Notes control rule left behind`);
      assert.ok(!rule.selectors.some(selector => /^\.campus-(?:guide-layout|place-list|map-panel|event-list)(?:[ >:[.]|$)/.test(selector)), `${file}: dedicated Campus rule left behind`);
    });
  }
  assert.match(read("app/communities-workspace.tsx"), /import styles from "\.\/communities-workspace\.module\.css"/);
  assert.match(read("app/campus-guide.tsx"), /import styles from "\.\/campus-guide\.module\.css"/);
});

test("mobile targets, long text, 390px exception and 781px desktop contracts survive the move", () => {
  dom.window.document.documentElement.dataset.theme = "dark";
  const value = (id, prop, width = 320) => probe(current, dom.window.document.querySelector(`[data-probe="${id}"]`), width)[prop];
  assert.equal(value("notes-active-source", "min-height"), "48px");
  assert.equal(value("notes-active-tab", "min-height"), "48px");
  assert.equal(value("notes-select", "font-size"), "16px");
  assert.equal(value("notes-filters", "grid-template-columns"), "minmax(0,1fr)");
  assert.equal(value("notes-filters", "grid-template-columns", 781), "repeat(2,minmax(0,1fr))");
  assert.equal(value("campus-detail-title", "overflow-wrap"), "anywhere");
  assert.equal(value("campus-input", "min-height"), "48px");
  assert.equal(value("community-back", "height"), "48px");
  assert.equal(value("community-detail-title", "overflow-wrap"), "anywhere");
  assert.equal(value("community-grid", "grid-template-columns", 781), "repeat(2,minmax(0,1fr))");
  for (const width of [320, 390, 780, 781]) {
    const element = dom.window.document.querySelector('[data-probe="community-create-body"]');
    assert.deepEqual(probe(current, element, width, true), probe(before, element, width, true));
  }
});
