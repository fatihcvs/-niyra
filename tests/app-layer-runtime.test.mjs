import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h, Fragment, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test.describe("App layer behavior", () => {
let ui;
test.beforeEach(async () => { ui = await createMobileDom(); });
test.afterEach(async () => { await ui.close(); });
const byId = (id) => ui.host.querySelector(`#${id}`);

function harness({ busy = false, closed = () => {} } = {}) {
  const { useAppLayer } = ui.load("app/use-app-layer.ts");
  function Layers() {
    const [parent, setParent] = useState(false);
    const [child, setChild] = useState(false);
    const parentLayer = useAppLayer({ id: "test.parent", open: parent, onClose: () => { setParent(false); closed("parent"); }, onRestore: () => setParent(true), busy });
    const childLayer = useAppLayer({ id: "test.child", open: child, onClose: () => { setChild(false); closed("child"); }, onRestore: () => setChild(true) });
    return h(Fragment, null,
      h("button", { id: "open-parent", onClick: () => setParent(true) }, "Open parent"),
      h("div", { hidden: !parent }, h("section", { ref: parentLayer.ref, role: "dialog", "aria-label": "Parent" },
        h("button", { id: "parent-first", onClick: () => setChild(true) }, "Open child"),
        h("input", { id: "draft", defaultValue: "" }),
        h("button", { id: "parent-last", onClick: parentLayer.close }, "Close parent"),
        h("div", { hidden: !child }, h("section", { ref: childLayer.ref, role: "dialog", "aria-label": "Child" },
          h("button", { id: "child-first", onClick: childLayer.close }, "Close child"),
          h("button", { id: "child-last" }, "Last child action"))))));
  }
  return h(Layers);
}

test("same-URL Back and Forward unwind nested layers one at a time and retain draft values", async () => {
  const closed = [];
  await ui.render(harness({ closed: (id) => closed.push(id) }));
  const startUrl = ui.window.location.href;
  await ui.click(byId("open-parent"));
  assert.equal(ui.window.location.href, startUrl);
  assert.equal(ui.window.history.state.kampiraLayer.id, "test.parent");
  byId("draft").value = "Retained local draft";
  await ui.click(byId("parent-first"));
  assert.equal(ui.window.history.state.kampiraLayer.id, "test.child");
  assert.equal(ui.window.history.state.kampiraDepth, 2);
  await ui.travel("back");
  assert.deepEqual(closed, ["child"]);
  assert.equal(byId("child-first").closest("div").hidden, true);
  assert.equal(byId("draft").closest("div").hidden, false);
  assert.equal(ui.document.activeElement, byId("parent-first"));
  await ui.travel("back");
  assert.deepEqual(closed, ["child", "parent"]);
  assert.equal(byId("draft").closest("div").hidden, true);
  assert.equal(ui.document.activeElement, byId("open-parent"));
  await ui.travel("forward");
  assert.equal(byId("draft").closest("div").hidden, false);
  assert.equal(byId("draft").value, "Retained local draft");
  await ui.travel("forward");
  assert.equal(byId("child-first").closest("div").hidden, false);
  assert.equal(ui.window.history.state.kampiraDepth, 2, "Forward must not push a duplicate layer");
  assert.equal(JSON.stringify(ui.window.history.state).includes("Retained local draft"), false);
});

test("only the top layer traps Tab and Escape, nested close releases isolation without unlocking the parent", async () => {
  await ui.render(harness());
  await ui.click(byId("open-parent"));
  const parentDialog = byId("draft").parentElement;
  assert.equal(ui.document.activeElement, parentDialog);
  assert.equal(ui.document.getElementById("bottom-nav").inert, true);
  assert.equal(ui.document.body.style.overflow, "hidden");
  byId("parent-last").focus();
  await ui.key("Tab");
  assert.equal(ui.document.activeElement, byId("parent-first"));
  await ui.key("Tab", { shiftKey: true });
  assert.equal(ui.document.activeElement, byId("parent-last"));
  await ui.click(byId("parent-first"));
  assert.equal(byId("draft").inert, true);
  byId("child-last").focus();
  await ui.key("Tab");
  assert.equal(ui.document.activeElement, byId("child-first"));
  await ui.key("Tab", { shiftKey: true });
  assert.equal(ui.document.activeElement, byId("child-last"));
  await ui.key("Escape");
  assert.equal(byId("child-first").closest("div").hidden, true);
  assert.equal(byId("draft").inert, false);
  assert.equal(ui.document.getElementById("bottom-nav").inert, true);
  assert.equal(ui.document.body.style.overflow, "hidden");
  await ui.travel("back");
  assert.equal(ui.document.getElementById("bottom-nav").inert, false);
  assert.equal(ui.document.body.style.overflow, "");
});

test("busy disables explicit close and Escape but system Back closes and preserves the unfinished draft", async () => {
  const closed = [];
  await ui.render(harness({ busy: true, closed: (id) => closed.push(id) }));
  await ui.click(byId("open-parent"));
  byId("draft").value = "Pending request draft";
  await ui.click(byId("parent-last"));
  await ui.key("Escape");
  assert.deepEqual(closed, []);
  assert.equal(ui.window.history.state.kampiraLayer.id, "test.parent");
  await ui.travel("back");
  assert.deepEqual(closed, ["parent"]);
  assert.equal(byId("draft").value, "Pending request draft");
  assert.equal(byId("draft").closest("div").hidden, true);
  await ui.travel("forward");
  assert.equal(byId("draft").value, "Pending request draft");
});

test("a different workspace URL closes the active layer without consuming another history entry", async () => {
  const closed = [];
  await ui.render(harness({ closed: (id) => closed.push(id) }));
  await ui.click(byId("open-parent"));
  ui.window.history.pushState({ kampiraDepth: 2 }, "", "/?view=notes");
  await ui.travel("back");
  assert.equal(ui.window.history.state.kampiraLayer.id, "test.parent");
  await ui.travel("forward");
  assert.equal(ui.window.location.search, "?view=notes");
  assert.deepEqual(closed, ["parent"]);
  assert.equal(ui.window.history.state.kampiraDepth, 2);
});

test("remounting a detail adopts its existing history entry without adding another Back step", async () => {
  const { useAppLayer } = ui.load("app/use-app-layer.ts");
  function Detail() {
    const [open, setOpen] = useState(true);
    const layer = useAppLayer({ id: "test.restored-detail", open, onClose: () => setOpen(false), onRestore: () => setOpen(true) });
    return h("section", { ref: layer.ref, hidden: !open, role: "dialog" }, "Restored detail");
  }
  await ui.render(h(Detail));
  const saved = { ...ui.window.history.state };
  const length = ui.window.history.length;
  await ui.render(null);
  await ui.render(h(Detail));
  assert.equal(ui.window.history.length, length);
  assert.equal(JSON.stringify(ui.window.history.state), JSON.stringify(saved));
  await ui.travel("back");
  assert.equal(ui.host.querySelector("section").hidden, true);
  assert.equal(ui.window.history.state?.kampiraLayer, undefined);
});

});
