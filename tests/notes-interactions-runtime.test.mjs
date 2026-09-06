import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };
const note = (id) => ({ id, ownerName: "Örnek öğrenci", courseId: "course-a", courseCode: "MAT 101", courseName: "Matematik", title: `Not ${id}`, description: "Örnek açıklama", noteType: "ders-notu", examYear: null, examTerm: null, examKind: null, tags: [], originalFileName: "note.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteSize: 2048, pageCount: null, status: "published", rejectionReason: null, time: "şimdi", saved: false, saveCount: 0, viewCount: 2, feedback: null, helpfulCount: 0, unhelpfulCount: 0, commentCount: 0, own: true, fileUrl: "/api/note-file?id=example" });
async function setup({ courses = [] } = {}) {
  const calls = [], expired = [];
  const ui = await createMobileDom({ view: "notes", packages: { "@/lib/curated-notes": { curatedNotes: [], getCuratedSources: () => [] } }, fetch: (url, init) => { const call = { url, init, ...deferred() }; calls.push(call); return call.promise; } });
  const Component = ui.load("app/product-features.tsx").NotesWorkspace;
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const state = ui.load("lib/workspace-state.ts");
  const until = async (predicate) => { for (let i = 0; i < 160 && !predicate(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); assert.ok(predicate(), ui.host.textContent); };
  const render = async (owner = "owner-a") => { state.setWorkspaceStateOwnerScope(owner); await ui.render(h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired: () => expired.push(owner) }, h(Component, { courses }))); };
  const reply = (call, data, status = 200) => act(async () => call.resolve({ ok: status < 400, status, json: async () => data }));
  const button = (text, within = ui.host) => [...within.querySelectorAll("button")].find((item) => item.textContent.trim() === text || item.getAttribute("aria-label") === text);
  const open = async (id) => { await ui.click(button(`Not ${id}`)); await until(() => calls.some((call) => call.url.includes(`/api/note-comments?noteId=${id}`) && !call.handled)); const read = calls.findLast((call) => call.url.includes(`/api/note-comments?noteId=${id}`)); read.handled = true; await reply(read, { comments: [] }); };
  await render(); await until(() => calls.length === 1); await reply(calls[0], { notes: [note("a"), note("b")] });
  return { ...ui, calls, expired, until, render, reply, button, open };
}

test("note comment drafts survive Back/Forward and remain isolated by target and account", async () => {
  const ui = await setup();
  try {
    await ui.open("a"); await ui.fill(ui.host.querySelector(".note-comments-panel textarea"), "A için taslak");
    await ui.travel("back"); await ui.until(() => !ui.host.querySelector(".feature-detail"));
    await ui.travel("forward"); await ui.until(() => ui.host.querySelector(".note-comments-panel textarea"));
    assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "A için taslak");
    await ui.reply(ui.calls.at(-1), { comments: [] }); ui.calls.at(-1).handled = true;
    await ui.travel("back"); await ui.until(() => !ui.host.querySelector(".feature-detail"));
    await ui.open("b"); assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "");
    await ui.fill(ui.host.querySelector(".note-comments-panel textarea"), "B için taslak");
    await ui.render("owner-b"); await ui.until(() => ui.calls.at(-1).url.startsWith("/api/notes?")); await ui.reply(ui.calls.at(-1), { notes: [note("a")] });
    await ui.open("a"); assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "");
  } finally { await ui.close(); }
});

test("same-frame save is single-flight and failure rolls back the visible detail and card", async () => {
  const ui = await setup();
  try {
    await ui.open("a"); const save = ui.button("Kaydet", ui.host.querySelector(".feature-detail"));
    await act(async () => { save.click(); save.click(); });
    const actions = ui.calls.filter((call) => call.url === "/api/note-actions"); assert.equal(actions.length, 1); assert.equal(JSON.parse(actions[0].init.body).active, true);
    assert.equal(save.getAttribute("aria-pressed"), "true");
    await ui.reply(actions[0], { error: "Kaydedilemedi" }, 503);
    assert.equal(save.getAttribute("aria-pressed"), "false"); assert.equal(save.disabled, false);
    await ui.click(save); await ui.reply(ui.calls.at(-1), { active: true, count: 1 });
    assert.equal(save.getAttribute("aria-pressed"), "true");
  } finally { await ui.close(); }
});

test("pending A comment cannot appear in B or erase B's draft; reopening A reads its confirmed state", async () => {
  const ui = await setup();
  try {
    await ui.open("a"); await ui.fill(ui.host.querySelector(".note-comments-panel textarea"), "A yorumu");
    const send = ui.button("Yorum yap"); await act(async () => { send.click(); send.click(); });
    const mutations = ui.calls.filter((call) => call.init.method === "POST"); assert.equal(mutations.length, 1);
    await ui.travel("back"); await ui.until(() => !ui.host.querySelector(".feature-detail")); await ui.open("b");
    await ui.fill(ui.host.querySelector(".note-comments-panel textarea"), "B taslağı");
    await ui.reply(mutations[0], { comment: { id: "comment-a", content: "A yorumu", authorName: "Örnek", initials: "Ö", own: true, time: "şimdi" }, count: 1 });
    assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "B taslağı"); assert.doesNotMatch(ui.host.querySelector(".feature-detail").textContent, /A yorumu/);
    await ui.travel("back"); await ui.until(() => !ui.host.querySelector(".feature-detail")); await ui.open("a"); assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "");
  } finally { await ui.close(); }
});

test("comment list loading disables submission; a failed send retains the editable draft", async () => {
  const ui = await setup();
  try {
    await ui.click(ui.button("Not a")); await ui.until(() => ui.calls.length === 2);
    assert.equal(ui.host.querySelector(".note-comments-panel textarea").disabled, true); assert.equal(ui.button("Yorum yap").disabled, true);
    await ui.reply(ui.calls[1], { comments: [] }); await ui.fill(ui.host.querySelector(".note-comments-panel textarea"), "Silinmesin"); await ui.click(ui.button("Yorum yap"));
    await ui.reply(ui.calls.at(-1), { error: "Bağlantı hatası" }, 503);
    assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "Silinmesin"); assert.equal(ui.host.querySelector(".note-comments-panel textarea").disabled, false);
    assert.match(ui.host.querySelector(".feature-detail").textContent, /Bağlantı hatası/);
  } finally { await ui.close(); }
});

test("failed note deletion stays in its confirmation and double submit sends once", async () => {
  const ui = await setup();
  try {
    await ui.open("a"); await ui.click(ui.button("Notu sil"));
    const dialog = ui.host.querySelector('[role="alertdialog"]'); const confirm = ui.button("Notu sil", dialog);
    await act(async () => { confirm.click(); confirm.click(); });
    const deletes = ui.calls.filter((call) => call.init.method === "DELETE"); assert.equal(deletes.length, 1);
    await ui.reply(deletes[0], { error: "Silme reddedildi" }, 503);
    assert.match(dialog.textContent, /Silme reddedildi/); assert.equal(confirm.disabled, false); assert.ok(ui.button("Not a"));
    await ui.click(confirm); await ui.reply(ui.calls.at(-1), { deleted: true });
    assert.equal(ui.host.querySelector('[role="alertdialog"]'), null); assert.equal(ui.button("Not a"), undefined);
    await ui.travel("back"); await ui.travel("forward"); assert.equal(ui.host.querySelector('[role="alertdialog"]'), null, "a deleted note cannot be resurrected by history");
  } finally { await ui.close(); }
});

test("active 401 never parses a body and old-owner delayed JSON cannot affect the new note list", async () => {
  const ui = await setup(); let reads = 0;
  try {
    await ui.open("a"); await ui.click(ui.button("Kaydet", ui.host.querySelector(".feature-detail")));
    await act(async () => ui.calls.at(-1).resolve({ status: 401, ok: false, json() { reads++; return {}; } }));
    assert.deepEqual(ui.expired, ["owner-a"]); assert.equal(reads, 0);
    await ui.render("owner-b"); await ui.until(() => ui.calls.at(-1).url.startsWith("/api/notes?"));
    const old = ui.calls.at(-1); const body = deferred();
    await act(async () => old.resolve({ ok: true, status: 200, json: () => body.promise }));
    await ui.render("owner-c"); await ui.until(() => ui.calls.at(-1) !== old); await ui.reply(ui.calls.at(-1), { notes: [note("b")] });
    await act(async () => body.resolve({ notes: [note("a")] }));
    assert.equal(old.init.signal.aborted, true); assert.ok(ui.button("Not b")); assert.equal(ui.button("Not a"), undefined);
  } finally { await ui.close(); }
});

test("Forward restores the rolled-back save and the server-confirmed feedback after a closed-detail response", async () => {
  const ui = await setup();
  const detail = () => ui.host.querySelector(".feature-detail");
  try {
    await ui.open("a"); await ui.click(ui.button("Kaydet", detail())); const save = ui.calls.at(-1);
    await ui.travel("back"); await ui.until(() => !detail());
    await ui.reply(save, { error: "Kayıt reddedildi" }, 503);
    await ui.travel("forward"); await ui.until(() => detail()); await ui.reply(ui.calls.at(-1), { comments: [] });
    assert.equal(ui.button("Kaydet", detail()).getAttribute("aria-pressed"), "false");
    assert.match(detail().querySelector('[role="alert"]').textContent, /Kayıt reddedildi/);
    await ui.click(ui.button("Kaydet", detail())); assert.equal(JSON.parse(ui.calls.at(-1).init.body).active, true);
    await ui.reply(ui.calls.at(-1), { active: true, count: 1 });
    await ui.click(detail().querySelector(".note-feedback-summary button")); const vote = ui.calls.at(-1);
    await ui.travel("back"); await ui.until(() => !detail());
    await ui.reply(vote, { vote: "helpful", helpfulCount: 7, unhelpfulCount: 2 });
    await ui.travel("forward"); await ui.until(() => detail()); await ui.reply(ui.calls.at(-1), { comments: [] });
    assert.equal(ui.button("Kaydedildi", detail()).getAttribute("aria-pressed"), "true");
    assert.equal(detail().querySelector(".note-feedback-summary button").getAttribute("aria-pressed"), "true");
    assert.equal(detail().querySelector(".note-feedback-summary button b").textContent, "7");
  } finally { await ui.close(); }
});

test("save and feedback errors are accessible inside their own detail and retry clears only that note's error", async () => {
  const ui = await setup();
  const detail = () => ui.host.querySelector(".feature-detail");
  try {
    await ui.open("a"); await ui.click(ui.button("Kaydet", detail()));
    await ui.reply(ui.calls.at(-1), { error: "A kaydı reddedildi" }, 503);
    const alert = detail().querySelector('[role="alert"]');
    assert.match(alert.textContent, /A kaydı reddedildi/); assert.equal(alert.closest("[inert]"), null);
    assert.equal(ui.button("Kaydet", detail()).disabled, false);
    await ui.travel("back"); await ui.until(() => !detail()); await ui.open("b");
    assert.doesNotMatch(detail().textContent, /A kaydı reddedildi/);
    await ui.click(detail().querySelector(".note-feedback-summary button")); await ui.reply(ui.calls.at(-1), { error: "B oyu reddedildi" }, 503);
    assert.match(detail().querySelector('[role="alert"]').textContent, /B oyu reddedildi/);
    assert.equal(detail().querySelector(".note-feedback-summary button").disabled, false);
    await ui.travel("back"); await ui.until(() => !detail()); await ui.open("a");
    assert.match(detail().textContent, /A kaydı reddedildi/); assert.doesNotMatch(detail().textContent, /B oyu reddedildi/);
    await ui.click(ui.button("Kaydet", detail())); assert.doesNotMatch(detail().textContent, /A kaydı reddedildi/);
    await ui.reply(ui.calls.at(-1), { active: true, count: 1 });
  } finally { await ui.close(); }
});

test("note upload timeout and abort release controls without losing the file; owner change detaches late XHR callbacks", async () => {
  const ui = await setup({ courses: [{ id: "course-a", code: "MAT 101", name: "Matematik" }] });
  const uploads = [];
  class Upload {
    upload = {};
    open(method, url) { this.method = method; this.url = url; }
    send(data) { this.data = data; uploads.push(this); }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  ui.window.XMLHttpRequest = Upload;
  const submit = (form) => act(async () => form.dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
  try {
    await ui.click(ui.button("Not yükle"));
    const title = ui.host.querySelector('input[name="title"]'); const form = title.form;
    await ui.fill(title, "Korunan not taslağı"); await ui.fill(form.querySelector('select[name="courseId"]'), "course-a");
    const file = new ui.window.File(["synthetic document"], "korunan.pdf", { type: "application/pdf" });
    const fileInput = form.querySelector('input[type="file"]'); Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => fileInput.dispatchEvent(new ui.window.Event("change", { bubbles: true })));
    await act(async () => { form.dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(uploads.length, 1); assert.equal(uploads[0].timeout, 120_000); assert.equal(uploads[0].data.get("file").name, "korunan.pdf");
    assert.equal(form.querySelector('button[type="submit"]').disabled, true);
    await act(async () => uploads[0].ontimeout());
    assert.equal(form.querySelector('button[type="submit"]').disabled, false); assert.equal(title.value, "Korunan not taslağı");
    assert.match(form.textContent, /korunan.pdf/); assert.match(form.querySelector('[role="alert"]').textContent, /sonucu doğrulanamadı/);
    assert.ok(ui.button("Not a"));
    await submit(form); assert.equal(uploads[1].data.get("file").name, "korunan.pdf");
    await act(async () => uploads[1].abort()); assert.equal(form.querySelector('button[type="submit"]').disabled, false);
    await submit(form); const pending = uploads[2], lateLoad = pending.onload;
    await ui.render("owner-b"); await ui.until(() => ui.calls.at(-1).url.startsWith("/api/notes?")); await ui.reply(ui.calls.at(-1), { notes: [note("b")] });
    assert.equal(pending.aborted, true);
    for (const field of ["onload", "onerror", "ontimeout", "onabort"]) assert.equal(pending[field], null);
    assert.equal(pending.upload.onprogress, null);
    pending.status = 201; pending.response = { note: note("late-owner-a") }; await act(async () => lateLoad());
    assert.equal(ui.button("Not late-owner-a"), undefined); await ui.click(ui.button("Not yükle"));
    assert.equal(ui.host.querySelector('input[name="title"]').value, "");
    assert.doesNotMatch(ui.host.querySelector('input[name="title"]').form.textContent, /korunan.pdf|sonucu doğrulanamadı/);
  } finally { await ui.close(); }
});
