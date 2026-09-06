import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, Fragment, StrictMode, useState } from "react";
import { createPortal } from "react-dom";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test.describe("App layer dynamic background isolation", () => {
  let ui;
  test.beforeEach(async () => { ui = await createMobileDom({ view: "notes" }); });
  test.afterEach(async () => { await ui.close(); });
  const byId = id => ui.document.getElementById(id);
  const flush = async (mutate) => { await act(async () => { mutate(); await Promise.resolve(); }); };

  test("real filter callbacks isolate newly mounted chips and replaced results while leaving controls usable", async () => {
    const { WorkspaceSearch } = ui.load("app/workspace-ui.tsx");
    const calls = [];
    function Notes() {
      const [course, setCourse] = useState("all");
      const [exam, setExam] = useState(false);
      return h("main", null,
        h(WorkspaceSearch, { value: "", onChange: () => {}, placeholder: "Notlarda ara", resultCount: exam ? 1 : 2 },
          h("label", null, "Ders", h("select", { id: "course", value: course, onChange: event => { calls.push(event.target.value); setCourse(event.target.value); } },
            h("option", { value: "all" }, "Tümü"), h("option", { value: "math" }, "Matematik"))),
          h("button", { id: "exam", onClick: () => setExam(true) }, "Çıkmış Sorular")),
        course !== "all" && h("div", { className: "notes-active-filters", id: "chips" }, h("button", null, course)),
        h("article", { key: `${course}:${exam}`, className: "feature-note-card", id: "result" }, h("button", null, exam ? "Sınav notunu aç" : "Ders notunu aç")));
    }
    await ui.render(h(Notes));
    await ui.click(ui.host.querySelector(".workspace-filter-toggle"));
    const originalResult = byId("result");
    assert.equal(originalResult.inert, true);
    await ui.fill(byId("course"), "math");
    assert.deepEqual(calls, ["math"]);
    assert.equal(byId("chips").inert, true, "new sibling chips must leave the accessibility/focus surface");
    assert.equal(byId("result").inert, true, "a replaced card must acquire its own isolation claim");
    assert.equal(originalResult.isConnected, false);
    assert.equal(originalResult.inert, false, "detached nodes are restored and no longer retained by the layer");
    const firstFilteredResult = byId("result");
    await ui.click(byId("exam"));
    assert.equal(firstFilteredResult.inert, false);
    assert.equal(byId("result").inert, true);
    assert.equal(byId("course").closest("[inert]"), null);
    assert.equal(byId("exam").closest("[inert]"), null);
    assert.ok(ui.host.querySelector('[role="dialog"]').contains(ui.document.activeElement));
    await ui.travel("back");
    assert.equal(byId("chips").inert, false);
    assert.equal(byId("result").inert, false);
    assert.equal(byId("course").value, "math");
    await ui.travel("forward");
    assert.equal(byId("chips").inert, true);
    assert.equal(byId("result").inert, true);
    assert.equal(byId("course").closest("[inert]"), null);
  });

  test("nested dynamic siblings retain separate claims through Back/Forward and restore original inert on unmount", async () => {
    const { useAppLayer } = ui.load("app/use-app-layer.ts");
    ui.document.body.style.overflow = "auto";
    byId("outside").inert = true;
    function Layers() {
      const [parent, setParent] = useState(false);
      const [child, setChild] = useState(false);
      const [revision, setRevision] = useState(0);
      const outer = useAppLayer({ id: "dynamic.parent", open: parent, onClose: () => setParent(false), onRestore: () => setParent(true) });
      const inner = useAppLayer({ id: "dynamic.child", open: child, onClose: () => setChild(false), onRestore: () => setChild(true) });
      return h(Fragment, null,
        h("button", { id: "open", onClick: () => setParent(true) }, "Open"),
        h("section", { ref: outer.ref, hidden: !parent, role: "dialog", id: "parent" },
          h("button", { id: "open-child", onClick: () => setChild(true) }, "Detail"),
          revision > 0 && h("button", { id: "new-parent-action", key: revision }, "New parent action"),
          h("section", { ref: inner.ref, hidden: !child, role: "dialog", id: "child" },
            h("button", { id: "mutate", onClick: () => setRevision(value => value + 1) }, "Load new content"))),
        revision > 0 && h("article", { id: "new-background", key: revision }, "New feed result"));
    }
    await ui.render(h(Layers));
    await ui.click(byId("open"));
    await ui.click(byId("open-child"));
    await ui.click(byId("mutate"));
    assert.equal(byId("new-parent-action").inert, true);
    assert.equal(byId("new-background").inert, true);
    assert.equal(byId("mutate").closest("[inert]"), null);
    const bodySibling = ui.document.createElement("aside");
    await flush(() => ui.document.body.append(bodySibling));
    assert.equal(bodySibling.inert, true);
    await ui.travel("back");
    assert.equal(byId("new-parent-action").inert, false);
    assert.equal(byId("new-background").inert, true);
    assert.equal(bodySibling.inert, true);
    assert.equal(ui.document.body.style.overflow, "hidden");
    assert.equal(ui.document.activeElement, byId("open-child"));
    await ui.travel("forward");
    assert.equal(byId("new-parent-action").inert, true);
    await ui.click(byId("mutate"));
    assert.equal(byId("new-parent-action").inert, true);
    await ui.render(null);
    assert.equal(bodySibling.inert, false);
    assert.equal(byId("bottom-nav").inert, false);
    assert.equal(byId("outside").inert, true, "pre-existing inert belongs to its original owner");
    assert.equal(ui.document.body.style.overflow, "auto");
  });

  for (const placement of ["sibling", "portal"]) test(`new ${placement} detail stays usable above an observed parent and Back restores parent isolation`, async () => {
    const { useAppLayer } = ui.load("app/use-app-layer.ts");
    function Layers() {
      const [parent, setParent] = useState(false);
      const [child, setChild] = useState(false);
      const [revision, setRevision] = useState(0);
      const outer = useAppLayer({ id: `stack.${placement}.parent`, open: parent, onClose: () => setParent(false), onRestore: () => setParent(true) });
      const inner = useAppLayer({ id: `stack.${placement}.child`, open: child, onClose: () => setChild(false), onRestore: () => setChild(true) });
      const detail = child && h("section", { ref: inner.ref, role: "dialog", id: "child" },
        h("button", { id: "first" }, "First action"),
        h("button", { id: "last", onClick: () => setRevision(value => value + 1) }, "New result"));
      return h(Fragment, null,
        h("button", { id: "open", onClick: () => setParent(true) }, "Open"),
        parent && h("section", { ref: outer.ref, role: "dialog", id: "parent" },
          h("button", { id: "open-child", onClick: () => setChild(true) }, "Open detail")),
        placement === "portal" ? createPortal(detail, ui.document.body) : detail,
        revision > 0 && h("article", { id: "new-background", key: revision }, "New feed result"));
    }
    await ui.render(h(Layers));
    await ui.click(byId("open"));
    await ui.click(byId("open-child"));
    assert.equal(byId("child").closest("[inert]"), null);
    assert.equal(byId("parent").closest("[inert]") !== null, true);
    await ui.click(byId("last"));
    assert.equal(byId("new-background").closest("[inert]") !== null, true);
    assert.equal(byId("child").closest("[inert]"), null, "parent's dynamic refresh cannot claim a newer layer");
    await ui.key("Tab");
    assert.ok(ui.document.activeElement === byId("first"), "Tab cycles inside the active detail");
    await ui.travel("back");
    assert.equal(byId("child"), null);
    assert.equal(byId("parent").closest("[inert]"), null);
    assert.ok(ui.document.activeElement === byId("open-child"));
    assert.equal(byId("new-background").closest("[inert]") !== null, true);
    assert.equal(ui.document.body.style.overflow, "hidden");
    await ui.travel("forward");
    assert.equal(byId("child").closest("[inert]"), null);
    assert.equal(byId("parent").closest("[inert]") !== null, true);
    await ui.render(null);
    assert.equal(ui.document.querySelectorAll("[inert]").length, 0);
    assert.equal(ui.document.body.style.overflow, "");
  });

  test("unopened layers allocate no observers; active observers watch only direct path children and disconnect on close", async () => {
    const NativeObserver = ui.window.MutationObserver;
    const active = new Set();
    const registrations = [];
    let constructed = 0;
    let delivered = 0;
    ui.window.MutationObserver = class extends NativeObserver {
      constructor(callback) { super((...args) => { delivered++; callback(...args); }); constructed++; }
      observe(target, options) { active.add(this); registrations.push({ target, options }); super.observe(target, options); }
      disconnect() { active.delete(this); super.disconnect(); }
    };
    const { useAppLayer } = ui.load("app/use-app-layer.ts");
    function Layer({ index }) {
      const [open, setOpen] = useState(false);
      const layer = useAppLayer({ id: `lazy.${index}`, open, onClose: () => setOpen(false), onRestore: () => setOpen(true) });
      return h("div", null, h("button", { id: `open-${index}`, onClick: () => setOpen(true) }, "Open"), h("section", { ref: layer.ref, role: "dialog", hidden: !open }, "Dialog"));
    }
    await ui.render(h(StrictMode, null, Array.from({ length: 200 }, (_, index) => h(Layer, { key: index, index }))));
    assert.equal(constructed, 0);
    assert.equal(active.size, 0);
    await ui.click(byId("open-0"));
    assert.equal(constructed, 1);
    assert.equal(active.size, 1);
    assert.ok(registrations.length > 0);
    for (const { options } of registrations) assert.deepEqual(Object.entries(options), [["childList", true]]);
    const beforeDelivery = delivered;
    await flush(() => byId("bottom-nav").append(ui.document.createElement("button")));
    assert.equal(delivered, beforeDelivery, "already inert descendant changes need no observer work");
    await ui.travel("back");
    assert.equal(active.size, 0);
    await ui.travel("forward");
    assert.equal(active.size, 1);
    await ui.render(null);
    assert.equal(active.size, 0);
    assert.equal(ui.document.querySelectorAll("[inert]").length, 0);
    const stoppedDelivery = delivered;
    await flush(() => ui.document.body.append(ui.document.createElement("aside")));
    assert.equal(delivered, stoppedDelivery);
    await ui.travel("back");
    await ui.travel("forward");
    assert.equal(active.size, 0, "unmounted owners cannot reattach isolation on Forward");
  });
});
