import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h, Fragment, StrictMode, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

// Count actual EventTarget registrations, including capture identity and cleanup.
// This is a listener-load assertion, not a device performance or heap measurement.
function countListeners(target, type) {
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  const active = new Map();
  const capture = (options) => typeof options === "boolean" ? options : Boolean(options?.capture);
  target.addEventListener = function (event, listener, options) {
    if (event === type) {
      const modes = active.get(listener) ?? new Set(); modes.add(capture(options)); active.set(listener, modes);
    }
    return add.call(this, event, listener, options);
  };
  target.removeEventListener = function (event, listener, options) {
    if (event === type) {
      const modes = active.get(listener); modes?.delete(capture(options)); if (!modes?.size) active.delete(listener);
    }
    return remove.call(this, event, listener, options);
  };
  return { count: () => [...active.values()].reduce((sum, modes) => sum + modes.size, 0), restore() { target.addEventListener = add; target.removeEventListener = remove; } };
}

test("200 unopened layers register no global listeners; first open, Back, Forward and unmount retain exact ownership", async () => {
  const ui = await createMobileDom();
  const keys = countListeners(ui.document, "keydown");
  const history = countListeners(ui.window, "popstate");
  try {
    const { useAppLayer } = ui.load("app/use-app-layer.ts");
    function Layer({ number }) {
      const [open, setOpen] = useState(false);
      const [draft, setDraft] = useState("");
      const { ref, close } = useAppLayer({ id: `synthetic.layer.${number}`, open, onClose: () => setOpen(false), onRestore: () => setOpen(true) });
      return h(Fragment, null,
        h("button", { id: `open-${number}`, onClick: () => setOpen(true) }, `SYNTHETIC open ${number}`),
        open && h("section", { ref, role: "dialog", "aria-label": `SYNTHETIC layer ${number}` },
          h("input", { "aria-label": "SYNTHETIC draft", value: draft, onChange: (event) => setDraft(event.target.value) }),
          h("button", { id: "close-layer", onClick: close }, "Close")));
    }
    await ui.render(h(StrictMode, null, Array.from({ length: 200 }, (_, number) => h(Layer, { key: number, number }))));
    assert.equal(ui.host.querySelectorAll("button").length, 200);
    assert.equal(keys.count(), 0); assert.equal(history.count(), 0);
    const opener = ui.host.querySelector("#open-137");
    await ui.click(opener);
    assert.equal(keys.count(), 1); assert.equal(history.count(), 1);
    assert.equal(ui.document.body.style.overflow, "hidden");
    assert.equal(ui.window.history.state.kampiraLayer.id, "synthetic.layer.137");
    const length = ui.window.history.length;
    await ui.fill(ui.host.querySelector("input"), "SYNTHETIC retained draft");
    assert.equal(keys.count(), 1); assert.equal(history.count(), 1, "rerenders must not duplicate registrations");
    await ui.travel("back");
    assert.equal(keys.count(), 0); assert.equal(history.count(), 1, "only the visited entry needs Forward restoration");
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
    assert.equal(ui.document.activeElement, opener); assert.equal(ui.document.body.style.overflow, "");
    await ui.travel("forward");
    assert.equal(keys.count(), 1); assert.equal(history.count(), 1);
    assert.equal(ui.host.querySelector("input").value, "SYNTHETIC retained draft");
    assert.equal(ui.window.history.length, length);
    assert.equal(ui.window.history.state.kampiraDepth, 1);
    await ui.key("Escape");
    assert.equal(keys.count(), 0); assert.equal(history.count(), 1);
    await ui.render(null);
    assert.equal(keys.count(), 0); assert.equal(history.count(), 0);
    assert.equal(ui.document.body.style.overflow, "");
    await ui.travel("forward");
    assert.equal(ui.host.querySelector('[role="dialog"]'), null, "unmounted owners cannot restore a dialog");
  } finally { await ui.close(); keys.restore(); history.restore(); }
});

test("a closed layer without Forward restoration releases both global listeners", async () => {
  const ui = await createMobileDom();
  const keys = countListeners(ui.document, "keydown");
  const history = countListeners(ui.window, "popstate");
  try {
    const { useAppLayer } = ui.load("app/use-app-layer.ts");
    function Layer() {
      const [open, setOpen] = useState(true);
      const { ref } = useAppLayer({ id: "synthetic.no-restore", open, onClose: () => setOpen(false) });
      return open ? h("section", { ref, role: "dialog" }, "SYNTHETIC content") : null;
    }
    await ui.render(h(Layer));
    assert.equal(keys.count(), 1); assert.equal(history.count(), 1);
    await ui.travel("back");
    assert.equal(keys.count(), 0); assert.equal(history.count(), 0);
    await ui.travel("forward");
    assert.equal(ui.host.querySelector('[role="dialog"]'), null);
  } finally { await ui.close(); keys.restore(); history.restore(); }
});
