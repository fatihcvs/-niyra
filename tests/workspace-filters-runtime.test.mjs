import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test.describe("Workspace filter sheet", () => {
  let ui;
  let WorkspaceSearch;
  let calls;
  let mounts;
  let unmounts;
  const opened = () => ui.host.querySelector('[role="dialog"][data-filter-layout="mobile"]');
  const toggle = () => ui.host.querySelector(".workspace-filter-toggle");
  const select = () => ui.host.querySelector('[name="category"]');
  const saved = () => ui.host.querySelector('[name="saved"]');
  const control = (text, scope = ui.host) => [...scope.querySelectorAll("button")].find(item => item.textContent.trim() === text || item.getAttribute("aria-label") === text);
  const settleHistory = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });

  function Filters({ category, onlySaved, onCategory, onSaved }) {
    useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    return h("div", { className: "filter-fixture-controls" },
      h("label", null, "Kategori", h("select", { name: "category", value: category, onChange: event => onCategory(event.target.value) }, h("option", { value: "all" }, "Tümü"), h("option", { value: "books" }, "Kitaplar"))),
      h("label", null, h("input", { name: "saved", type: "checkbox", checked: onlySaved, onChange: event => onSaved(event.target.checked) }), "Kaydettiklerim"));
  }

  function Harness({ withFilters = true }) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [onlySaved, setOnlySaved] = useState(false);
    return h(WorkspaceSearch, { value: query, onChange: setQuery, placeholder: "Kaynaklarda ara", resultCount: category === "all" ? 12 : 3, filterCount: Number(category !== "all") + Number(onlySaved), onReset: () => { calls.push("reset"); setQuery(""); setCategory("all"); setOnlySaved(false); } }, withFilters && h(Filters, { category, onlySaved, onCategory: value => { calls.push(["category", value]); setCategory(value); }, onSaved: value => { calls.push(["saved", value]); setOnlySaved(value); } }));
  }

  test.beforeEach(async () => {
    ui = await createMobileDom({ view: "notes" });
    WorkspaceSearch = ui.load("app/workspace-ui.tsx").WorkspaceSearch;
    calls = [];
    mounts = 0;
    unmounts = 0;
  });
  test.afterEach(async () => { await ui.close(); });

  test("mobile selections apply once immediately; Back and Forward retain the same controls and focus", async () => {
    await ui.render(h(Harness));
    const field = select();
    const initialUrl = ui.window.location.href;
    assert.equal(opened(), null);
    await ui.click(toggle());
    const dialog = opened();
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(ui.document.getElementById(dialog.getAttribute("aria-labelledby")).textContent, "Filtreler");
    assert.match(ui.document.getElementById(dialog.getAttribute("aria-describedby")).textContent, /hemen uygulanır/);
    assert.equal(ui.document.activeElement, dialog);
    assert.equal(ui.document.body.style.overflow, "hidden");
    assert.equal(ui.document.getElementById("bottom-nav").inert, true);
    assert.equal(ui.window.location.href, initialUrl);
    await ui.fill(select(), "books");
    assert.deepEqual(calls, [["category", "books"]]);
    assert.match(dialog.querySelector('[role="status"]').textContent, /3 sonuç/);
    assert.equal(control("Uygula", dialog), undefined);
    assert.equal(control("Vazgeç", dialog), undefined);
    await ui.travel("back");
    assert.equal(opened(), null);
    assert.equal(select(), field);
    assert.equal(select().value, "books");
    assert.equal(ui.document.activeElement, toggle());
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
    await ui.travel("forward");
    assert.ok(opened());
    assert.equal(select(), field);
    assert.equal(select().value, "books");
    await ui.click(control("Tamam", opened()));
    await settleHistory();
    assert.equal(opened(), null);
    assert.deepEqual(calls, [["category", "books"]]);
    assert.equal(mounts, 1);
    assert.equal(unmounts, 0);
  });

  test("the active sheet traps focus, resets through the real callback and Escape only dismisses the sheet", async () => {
    await ui.render(h(Harness));
    await ui.click(toggle());
    await ui.fill(select(), "books");
    await ui.click(saved());
    assert.deepEqual(calls, [["category", "books"], ["saved", true]]);
    const done = control("Tamam", opened());
    done.focus();
    await ui.key("Tab");
    assert.equal(ui.document.activeElement, control("Filtreleri kapat", opened()));
    await ui.key("Tab", { shiftKey: true });
    assert.equal(ui.document.activeElement, done);
    await ui.click(control("Temizle", opened()));
    assert.equal(select().value, "all");
    assert.equal(saved().checked, false);
    assert.equal(calls.filter(call => call === "reset").length, 1);
    assert.ok(opened(), "Reset applies immediately without an implicit close");
    await ui.key("Escape");
    assert.equal(opened(), null);
    assert.equal(ui.document.activeElement, toggle());
  });

  test("desktop remains inline and resize releases history/body isolation without remounting filter children", async () => {
    await ui.resize(820);
    await ui.render(h(Harness));
    const field = select();
    const historyLength = ui.window.history.length;
    assert.equal(opened(), null);
    assert.equal(ui.host.querySelector('[data-filter-layout="desktop"]').hidden, false);
    assert.equal(ui.host.querySelector('[data-filter-layout="desktop"]').getAttribute("role"), null);
    await ui.fill(field, "books");
    assert.equal(ui.window.history.length, historyLength);
    await ui.resize(390);
    assert.equal(opened(), null);
    await ui.click(toggle());
    assert.ok(opened());
    await ui.resize(820);
    await settleHistory();
    assert.equal(opened(), null);
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
    assert.equal(ui.window.history.state?.kampiraLayer, undefined);
    assert.equal(select(), field);
    assert.equal(select().value, "books");
    await ui.travel("forward");
    assert.equal(opened(), null, "Desktop Forward cannot restore a mobile modal");
    await ui.resize(390);
    assert.equal(opened(), null, "Returning to mobile does not reopen stale modal state");
    await ui.click(toggle());
    assert.ok(opened());
    assert.equal(select(), field);
    assert.deepEqual(calls, [["category", "books"]]);
    assert.equal(mounts, 1);
    assert.equal(unmounts, 0);
  });

  test("a filter sheet inside an existing detail closes first and keeps the parent layer isolated", async () => {
    const { useAppLayer } = ui.load("app/use-app-layer.ts");
    function Detail() {
      const [open, setOpen] = useState(false);
      const { ref, close } = useAppLayer({ id: "fixture.detail", open, onClose: () => setOpen(false), onRestore: () => setOpen(true) });
      return h("div", null, h("button", { onClick: () => setOpen(true) }, "Detay aç"), h("div", { hidden: !open }, h("section", { ref, role: "dialog", "aria-label": "Sentetik detay" }, h("button", { onClick: close }, "Detay kapat"), h(Harness))));
    }
    await ui.render(h(Detail));
    await ui.click(control("Detay aç"));
    await ui.click(toggle());
    assert.match(ui.window.history.state.kampiraLayer.id, /^workspace\.filters:/);
    await ui.travel("back");
    assert.equal(opened(), null);
    assert.equal(ui.window.history.state.kampiraLayer.id, "fixture.detail");
    assert.equal(ui.document.body.style.overflow, "hidden");
    assert.equal(ui.document.activeElement, toggle());
    assert.equal(ui.document.getElementById("bottom-nav").inert, true);
    await ui.travel("back");
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
  });

  test("removing async filters closes the sheet and later controls do not restore stale open state", async () => {
    await ui.render(h(Harness));
    await ui.click(toggle());
    await ui.render(h(Harness, { withFilters: false }));
    await settleHistory();
    assert.equal(opened(), null);
    assert.equal(toggle(), null);
    assert.equal(ui.document.body.style.overflow, "");
    await ui.render(h(Harness));
    assert.equal(opened(), null);
    assert.ok(toggle());
    assert.deepEqual(calls, []);
  });

  test("server markup keeps one inline filter tree and never creates a modal history entry", () => {
    const length = ui.window.history.length;
    const markup = renderToString(h(WorkspaceSearch, { value: "", onChange() {}, placeholder: "Ara" }, h("label", null, "Kategori", h("select", { name: "server-filter", defaultValue: "all" }, h("option", { value: "all" }, "Tümü")))));
    assert.equal((markup.match(/name="server-filter"/g) ?? []).length, 1);
    assert.match(markup, /data-filter-layout="desktop"/);
    assert.doesNotMatch(markup, /role="dialog"/);
    assert.equal(ui.window.history.length, length);
  });
});
