import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { act, createElement as h } from "react";
import ts from "typescript";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const subjects = [{ id: "course-a", code: "DERS101", label: "Sentetik ders", tone: "violet", imageUrl: "/synthetic-course.png", noteCount: 2, postCount: 3 }];

function realHomeCallbacks(context) {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let element;
  function visit(node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "CourseHubLayers") element = node; ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(element, "Execute the callbacks actually passed by Home");
  const callbacks = ["onNotes", "onCompose"].map(name => {
    const attribute = element.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(ast) === name);
    assert.ok(attribute && ts.isJsxExpression(attribute.initializer));
    return `globalThis.${name} = ${attribute.initializer.expression.getText(ast)};`;
  }).join("\n");
  const js = ts.transpileModule(callbacks, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, { ...context, globalThis: context, require: createRequire(import.meta.url) });
  return context;
}

async function setup() {
  const ui = await createMobileDom({ view: "feed&feed=campus" });
  const { CourseHubLayers, useCourseHubLayers } = ui.load("app/course-hub.tsx");
  const { pushAppLocation } = ui.load("lib/mobile-navigation.ts");
  const calls = [];
  const callbacks = realHomeCallbacks({
    navigateTo(...args) { calls.push(["notes", ...args]); pushAppLocation("/?view=notes&course=course-a"); },
    setDraftAudience(value) { calls.push(["audience", value]); },
    changeFeed(value) { calls.push(["feed", value]); },
    setComposerCourseId(value) { calls.push(["course", value]); },
    openFeedComposer() { calls.push(["compose"]); pushAppLocation("/?feed=campus&compose=1"); },
  });
  function Harness({ owner = "student-a:0", courses = subjects }) {
    const hub = useCourseHubLayers({ ownerScope: owner, subjects: courses });
    return h("main", null,
      h("button", { id: "directory-trigger", onClick: hub.openDirectory }, "Tümünü gör"),
      h("button", { id: "subject-trigger", onClick: () => hub.openSubject(courses[0]) }, "Dersi aç"),
      h(CourseHubLayers, { hub, subjects: courses, onNotes: callbacks.onNotes, onCompose: callbacks.onCompose }),
    );
  }
  return { ...ui, calls, render: (props = {}) => ui.render(h(Harness, props)) };
}

test("directory and detail use separate Back entries, retain focus and Forward without a phantom layer", async () => {
  const ui = await setup();
  try {
    await ui.render();
    const trigger = ui.host.querySelector("#directory-trigger");
    await ui.click(trigger);
    const directory = ui.host.querySelector(".course-directory-dialog");
    const courseButton = directory.querySelector(".course-directory-grid button");
    const directoryDepth = ui.window.history.state.kampiraDepth;
    await ui.click(courseButton);
    assert.equal(ui.window.history.state.kampiraDepth, directoryDepth + 1);
    assert.ok(directory.closest("[inert]"), "The still-mounted directory is isolated beneath detail");
    const detail = ui.host.querySelector(".course-detail-dialog");
    assert.equal(detail.closest("[inert]"), null, "The older directory cannot isolate its newer sibling detail");
    const last = detail.querySelector(".course-detail-actions button:last-child");
    last.focus(); await ui.key("Tab");
    assert.ok(ui.document.activeElement === detail.querySelector("button"), "Tab wraps to the usable detail close button");
    await ui.travel("back");
    assert.equal(ui.host.querySelector(".course-detail-dialog"), null);
    assert.equal(ui.host.querySelector(".course-directory-dialog"), directory);
    assert.equal(ui.document.activeElement, courseButton);
    assert.equal(ui.document.body.style.overflow, "hidden");
    await ui.travel("back");
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
    assert.equal(ui.document.activeElement, trigger);
    assert.equal(ui.document.body.style.overflow, "");
    await ui.travel("forward"); await ui.travel("forward");
    assert.equal(ui.window.history.state.kampiraDepth, directoryDepth + 1);
    assert.match(ui.host.querySelector(".course-detail-dialog h2").textContent, /DERS101/);
    await ui.key("Escape");
    assert.ok(ui.host.querySelector(".course-directory-dialog"));
    assert.equal(ui.host.querySelector(".course-detail-dialog"), null);
    assert.deepEqual(ui.calls, [], "Back, Forward, Tab and Escape never submit or navigate a course action");
  } finally { await ui.close(); }
});

test("real Home Notes and composer callbacks receive the chosen course once and Back resolves current course data", async () => {
  const ui = await setup();
  try {
    await ui.render(); await ui.click(ui.host.querySelector("#subject-trigger"));
    await ui.click(ui.host.querySelector(".course-detail-actions button"));
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.window.location.search, "?view=notes&course=course-a");
    assert.equal(JSON.stringify(ui.calls[0]), JSON.stringify(["notes", "Notlar", undefined, { id: "course-a", code: "DERS101", name: "Sentetik ders" }]));
    await ui.render({ courses: [{ ...subjects[0], label: "Güncel ders adı" }] });
    await ui.travel("back");
    assert.match(ui.host.querySelector(".course-detail-dialog h2").textContent, /Güncel ders adı/);
    assert.doesNotMatch(JSON.stringify(ui.window.history.state), /Güncel ders adı|Sentetik ders/);
    await ui.click(ui.host.querySelector(".course-detail-actions button:last-child"));
    assert.deepEqual(ui.calls.slice(1), [["audience", "campus"], ["feed", "campus"], ["course", "course-a"], ["compose"]]);
    assert.equal(ui.window.location.search, "?feed=campus&compose=1");
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
  } finally { await ui.close(); }
});

test("removed course and changed or expired owner cannot restore private detail or leave isolation", async () => {
  const ui = await setup();
  try {
    await ui.render(); await ui.click(ui.host.querySelector("#subject-trigger"));
    await ui.render({ courses: [] });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
    assert.equal(ui.document.body.style.overflow, "");
    await ui.travel("forward");
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
    await ui.render(); await ui.click(ui.host.querySelector("#directory-trigger"));
    await ui.click(ui.host.querySelector(".course-directory-grid button"));
    await ui.render({ owner: null });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
    await ui.render({ owner: "student-b:0" });
    await ui.travel("forward");
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
    assert.deepEqual(ui.calls, []);
  } finally { await ui.close(); }
});
