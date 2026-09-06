import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test.describe("Shared accessible UI contracts", () => {
  let ui;
  let primitives;
  const pause = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  const key = (target, value) => act(async () => target.dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
  test.beforeEach(async () => { ui = await createMobileDom(); primitives = ui.load("app/ui-primitives.tsx"); });
  test.afterEach(async () => ui.close());

  test("icon buttons have an accessible name and busy/disabled states block mutations", async () => {
    let calls = 0;
    const { IconButton } = primitives;
    await ui.render(h(IconButton, { label: "Notu kaydet", busy: true, onClick: () => calls++ }, h("svg")));
    const button = ui.host.querySelector("button");
    assert.equal(button.getAttribute("aria-label"), "Notu kaydet");
    assert.equal(button.getAttribute("aria-busy"), "true");
    await ui.click(button);
    assert.equal(calls, 0);
    await ui.render(h(IconButton, { label: "Notu kaydet", onClick: () => calls++ }, h("svg")));
    await ui.click(button);
    assert.equal(calls, 1);
    assert.equal(button.getAttribute("type"), "button");
    assert.equal(button.querySelector("span").getAttribute("aria-hidden"), "true");
  });

  test("tabs use a single tab stop, skip disabled choices, wrap and support Home/End", async () => {
    const { Tabs } = primitives;
    function Harness() {
      const [value, setValue] = useState("notes");
      return h(Tabs, { label: "Kaynak türü", value, onChange: setValue, items: [{ value: "notes", label: "Notlar", panelId: "notes-panel" }, { value: "hidden", label: "Kapalı", disabled: true }, { value: "exams", label: "Sorular", panelId: "exams-panel" }] });
    }
    await ui.render(h(Harness));
    const tabs = [...ui.host.querySelectorAll("[role=tab]")];
    await act(async () => tabs[0].focus());
    await key(tabs[0], "ArrowRight");
    assert.equal(document.activeElement, tabs[2]);
    assert.equal(tabs[2].getAttribute("aria-selected"), "true");
    assert.equal(tabs[2].getAttribute("aria-controls"), "exams-panel");
    assert.equal(ui.host.querySelectorAll("[role=tab][tabindex='0']").length, 1);
    await key(tabs[2], "ArrowRight");
    assert.equal(document.activeElement, tabs[0]);
    await key(tabs[0], "End");
    assert.equal(document.activeElement, tabs[2]);
    await key(tabs[2], "Home");
    assert.equal(document.activeElement, tabs[0]);
  });

  test("manual RTL tabs move focus without selecting until explicit activation", async () => {
    const { Tabs } = primitives;
    const changed = [];
    await ui.render(h(Tabs, { label: "Görünüm", value: "a", onChange: (value) => changed.push(value), activation: "manual", direction: "rtl", items: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }));
    const tabs = [...ui.host.querySelectorAll("[role=tab]")];
    await key(tabs[0], "ArrowLeft");
    assert.equal(document.activeElement, tabs[1]);
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
    assert.deepEqual(changed, []);
    await key(tabs[1], "Enter");
    assert.deepEqual(changed, ["b"]);
  });

  test("external tab selection moves the tab stop without stealing focus or inventing a disabled selection", async () => {
    const { Tabs } = primitives;
    const items = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
    await ui.render(h(Tabs, { label: "Görünüm", value: "a", onChange() {}, items }));
    ui.document.querySelector("#outside").focus();
    await ui.render(h(Tabs, { label: "Görünüm", value: "b", onChange() {}, items }));
    assert.equal(ui.host.querySelector("[tabindex='0']").textContent, "B");
    assert.equal(document.activeElement.id, "outside");
    await ui.render(h(Tabs, { label: "Görünüm", value: "b", onChange() {}, items: [items[0], { ...items[1], disabled: true }] }));
    assert.equal(ui.host.querySelector("[aria-selected='true']"), null);
    assert.equal(ui.host.querySelector("[tabindex='0']").textContent, "A");
  });

  test("inline errors keep retry feedback visible and cannot retry while busy", async () => {
    const { InlineError } = primitives;
    let retries = 0;
    await ui.render(h(InlineError, { message: "Bağlantı kesildi; taslağın korunuyor.", onRetry: () => retries++, retrying: true }));
    assert.match(ui.host.querySelector("[role=alert]").textContent, /taslağın korunuyor/);
    await ui.click(ui.host.querySelector("button"));
    assert.equal(retries, 0);
    await ui.render(h(InlineError, { message: "Bağlantı kesildi; taslağın korunuyor.", onRetry: () => retries++ }));
    await ui.click(ui.host.querySelector("button"));
    assert.equal(retries, 1);
  });

  test("toast timeout pauses for keyboard focus, dismisses once, and cleans up on unmount", async () => {
    const { Toast } = primitives;
    const dismissed = [];
    await ui.render(h(Toast, { id: "saved", message: "Kaydedildi", duration: 100, onDismiss: (reason) => dismissed.push(reason) }));
    const close = ui.host.querySelector("button");
    await act(async () => close.focus());
    await pause(150);
    assert.deepEqual(dismissed, []);
    assert.match(ui.host.querySelector("[role=status]").textContent, /Kaydedildi/);
    await act(async () => ui.document.querySelector("#outside").focus());
    await pause(150);
    assert.deepEqual(dismissed, ["timeout"]);
    assert.equal(ui.host.querySelector("button"), null);
    await ui.render(h(Toast, { id: "next", message: "Yeni bildirim", duration: 100, onDismiss: (reason) => dismissed.push(reason) }));
    await ui.render(null);
    await pause(130);
    assert.deepEqual(dismissed, ["timeout"]);
  });

  test("error and actionable toasts stay visible until dismissed and never steal focus", async () => {
    const { Toast } = primitives;
    let dismissed = 0;
    ui.document.querySelector("#outside").focus();
    await ui.render(h(Toast, { id: "error", message: "Yükleme tamamlanmadı", tone: "error", duration: 30, onDismiss: () => dismissed++ }));
    assert.equal(document.activeElement.id, "outside");
    await pause(70);
    assert.equal(dismissed, 0);
    assert.ok(ui.host.querySelector("[role=alert]"));
    await ui.click(ui.host.querySelector("button"));
    assert.equal(dismissed, 1);
  });

  test("skeleton exposes one loading announcement and decorative placeholders only", async () => {
    await ui.render(h(primitives.Skeleton, { rows: 99, label: "Notların yükleniyor" }));
    assert.equal(ui.host.querySelectorAll("[role=status]").length, 1);
    assert.equal(ui.host.querySelector("[role=status]").getAttribute("aria-busy"), "true");
    assert.equal(ui.host.querySelectorAll("[aria-hidden=true]").length, 8);
    assert.equal(ui.host.textContent, "Notların yükleniyor");
  });

  test("shared Sheet follows Back/Forward, isolates background, and restores trigger focus", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return h("div", null, h("button", { onClick: () => setOpen(true) }, "Aç"), h(primitives.Sheet, { id: "test.sheet", open, title: "Filtreler", onClose: () => setOpen(false), onRestore: () => setOpen(true) }, h("input", { "aria-label": "Ders" })));
    }
    await ui.render(h(Harness));
    const trigger = ui.host.querySelector("button");
    await ui.click(trigger);
    assert.ok(ui.document.querySelector("[role=dialog]"));
    assert.equal(ui.host.inert, true);
    await ui.travel("back");
    assert.equal(ui.document.querySelector("[role=dialog]"), null);
    assert.equal(document.activeElement, trigger);
    await ui.travel("forward");
    assert.ok(ui.document.querySelector("[role=dialog]"));
    await ui.key("Escape");
    assert.equal(ui.document.querySelector("[role=dialog]"), null);
  });
});
