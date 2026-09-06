import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const button = (ui, label) => [...ui.host.querySelectorAll("button")].find((element) => element.textContent === label);

async function setup(handler = () => null, native = true) {
  const ui = await createMobileDom(); const commands = []; let expired = 0;
  const respond = (request, fields) => ui.window.KampiraFiles.onmessage({ data: JSON.stringify({ protocolVersion: 1, id: request.id, accountId: request.accountId ?? "", ...fields }) });
  if (native) ui.window.KampiraFiles = { postMessage(value) { const request = JSON.parse(value); commands.push(request); const response = handler(request); if (response) respond(request, response); } };
  const api = ui.load("lib/native-files-client.ts"), Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider, Component = ui.load("app/note-file-actions.tsx").NoteFileActions;
  const until = async (check) => { for (let index = 0; index < 150 && !check(); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2)); }); assert.ok(check(), ui.host.textContent); };
  return { ...ui, api, commands, respond, until, expired: () => expired,
    renderNote: (ownerScope = "owner-a:1", fileUrl = "/api/notes/file?id=note-one") => ui.render(h(Provider, { ownerScope, onBack() {}, onSessionExpired() { expired++; } }, h(Component, { fileUrl }))) };
}

test("note file actions retain browser anchors and never invoke the native bridge on mount", async () => {
  const browser = await setup(undefined, false);
  try { await browser.renderNote(); assert.deepEqual([...browser.host.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")]), [["Yeni sekmede aç", "/api/notes/file?id=note-one"], ["İndir", "/api/notes/file?id=note-one&download=1"]]); assert.equal(browser.host.querySelectorAll("button").length, 0); } finally { await browser.close(); }
  const ui = await setup();
  try {
    await ui.renderNote(); assert.equal(ui.commands.length, 0); assert.equal(ui.host.querySelectorAll("a").length, 0);
    await ui.click(button(ui, "İndir")); assert.equal(ui.commands.length, 1); assert.equal(ui.commands[0].command, "download"); assert.equal(ui.commands[0].action, "save"); assert.equal(ui.commands[0].accountId, "owner-a");
    assert.equal(ui.commands[0].url, "/api/notes/file?id=note-one&download=1"); assert.match(ui.host.textContent, /Dosya hazırlanıyor/); assert.ok(button(ui, "İndir").disabled);
    await act(async () => ui.respond(ui.commands[0], { state: "saved" })); assert.match(ui.host.textContent, /Dosya kaydedildi\./);
    await ui.click(button(ui, "Dosyayı paylaş")); await act(async () => ui.respond(ui.commands.at(-1), { state: "shareOpened" }));
    assert.match(ui.host.textContent, /Paylaşım menüsü açıldı\./); assert.ok(!ui.host.textContent.includes("Dosya paylaşıldı"));
  } finally { await ui.close(); }
});

test("cancel and owner replacement fence late native save results and allow a fresh operation", async () => {
  const ui = await setup();
  try {
    await ui.renderNote(); await ui.click(button(ui, "İndir")); const first = ui.commands.at(-1);
    await ui.click(button(ui, "İptal")); assert.equal(ui.commands.at(-1).command, "cancel"); assert.equal(ui.commands.at(-1).requestId, first.id);
    await act(async () => ui.respond(first, { state: "saved" })); assert.match(ui.host.textContent, /iptal edildi/); assert.ok(!button(ui, "İndir").disabled);
    await ui.click(button(ui, "İndir")); const second = ui.commands.at(-1);
    await ui.renderNote("owner-b:2"); await act(async () => ui.respond(second, { state: "saved" })); assert.ok(!ui.host.textContent.includes("Dosya kaydedildi"));
    await ui.click(button(ui, "İndir")); const third = ui.commands.at(-1); assert.equal(third.accountId, "owner-b"); assert.notEqual(third.id, first.id);
    await act(async () => ui.respond(third, { state: "error", httpStatus: 404, message: "Not artık kullanılamıyor." })); assert.equal(ui.host.querySelector('[role="alert"]').textContent, "Not artık kullanılamıyor.");
  } finally { await ui.close(); }
});

test("native replies require exact request/account correlation and a valid dynamic schema", async () => {
  const ui = await setup();
  try {
    let resolved = false; const result = ui.api.nativeFileRequest("download", "owner-a", { action: "save", url: "/api/notes/file?id=n" }).then((value) => { resolved = true; return value; }); const request = ui.commands.at(-1);
    ui.respond({ ...request, id: "unrelated" }, { state: "saved" }); ui.respond({ ...request, accountId: "owner-b" }, { state: "saved" }); await Promise.resolve(); assert.equal(resolved, false);
    ui.respond(request, { state: "saved" }); assert.equal((await result).state, "saved");
    for (const invalid of [{ protocolVersion: 2, state: "ready", transferId: "t", maxChunkBytes: 49152 }, { state: "ready", transferId: "../unsafe", maxChunkBytes: 49152 }, { state: "ready", transferId: "t", maxChunkBytes: 49153 }, { state: "ready", transferId: "t", maxChunkBytes: 0 }, { state: "error", httpStatus: "401" }, { state: "error", message: "x".repeat(241) }]) {
      const pending = ui.api.nativeFileRequest("blobStart", "owner-a", { size: 1, mime: "text/plain", name: "file.txt", action: "save" }); ui.respond(ui.commands.at(-1), invalid); await assert.rejects(pending, /doğrulanamadı/);
    }
  } finally { await ui.close(); }
});

test("a saved reply to blobStart cannot falsely claim an export before any bytes are transferred", async () => {
  const ui = await setup(() => ({ state: "saved" }));
  try { await assert.rejects(ui.api.nativeBlobAction(new Blob(["private fixture"], { type: "text/plain" }), "file.txt", "owner-a"), /doğrulanamadı/); assert.equal(ui.commands.length, 1); } finally { await ui.close(); }
});

test("success replies must match the requested action and cannot carry a failed HTTP status", async () => {
  const ui = await setup();
  try {
    for (const [action, reply] of [["save", { state: "shareOpened" }], ["share", { state: "saved" }], ["save", { state: "saved", httpStatus: 401 }], ["share", { state: "shareOpened", httpStatus: 404 }], ["save", { state: "saved", httpStatus: 503 }]]) {
      const pending = ui.api.nativeFileRequest("download", "owner-a", { url: "/api/notes/file?id=n", action });
      ui.respond(ui.commands.at(-1), reply); await assert.rejects(pending, /doğrulanamadı/);
    }
  } finally { await ui.close(); }
});

test("replacing the native bridge cancels its pending request and ignores the old reply", async () => {
  const ui = await setup();
  try {
    const oldBridge = ui.window.KampiraFiles;
    const previous = ui.api.nativeFileRequest("download", "owner-a", { action: "save", url: "/api/notes/file?id=old" }).then((reply) => ({ reply }), (error) => ({ error }));
    const oldRequest = ui.commands.at(-1);
    ui.window.KampiraFiles = { postMessage(value) { const request = JSON.parse(value); ui.commands.push(request); ui.respond(request, { state: "saved" }); } };
    const current = await ui.api.nativeFileRequest("download", "owner-b", { action: "save", url: "/api/notes/file?id=current" });
    assert.equal((await previous).error.name, "AbortError"); assert.equal(current.accountId, "owner-b");
    oldBridge.onmessage({ data: JSON.stringify({ protocolVersion: 1, ...oldRequest, state: "saved" }) }); assert.equal(current.state, "saved");
  } finally { await ui.close(); }
});

test("blob export sends exact bytes in bounded acknowledged chunks before finish", async () => {
  const source = Uint8Array.from({ length: 100001 }, (_, index) => index % 251); let firstHeld = true;
  const ui = await setup((request) => {
    if (request.command === "blobStart") return { state: "ready", transferId: "transfer-one", maxChunkBytes: 49152 };
    if (request.command === "blobChunk") { if (firstHeld) { firstHeld = false; return null; } return { state: "received", nextSequence: request.sequence + 1 }; }
    if (request.command === "blobFinish") return { state: "saved" };
    if (request.command === "cancel") return { state: "cancelled" };
    return null;
  });
  try {
    const exported = ui.api.nativeBlobAction(new Blob([source], { type: "application/octet-stream" }), "fixture.bin", "owner-a");
    await ui.until(() => ui.commands.some((request) => request.command === "blobChunk"));
    assert.equal(ui.commands.filter((request) => request.command === "blobChunk").length, 1); assert.equal(ui.commands.some((request) => request.command === "blobFinish"), false);
    ui.respond(ui.commands.at(-1), { state: "received", nextSequence: 1 }); assert.equal((await exported).state, "saved");
    const chunks = ui.commands.filter((request) => request.command === "blobChunk"); assert.deepEqual(chunks.map((request) => request.sequence), [0, 1, 2]);
    const buffers = chunks.map((request) => Buffer.from(request.base64, "base64")); assert.ok(buffers.every((buffer) => buffer.length <= 49152)); assert.deepEqual(Buffer.concat(buffers), Buffer.from(source));
    assert.equal(ui.commands.at(-1).command, "blobFinish"); assert.ok(ui.commands.every((request) => request.accountId === "owner-a"));
  } finally { await ui.close(); }
});

test("bad chunk acknowledgement cancels the exact original transfer and never finishes", async () => {
  const ui = await setup((request) => request.command === "blobStart" ? { state: "ready", transferId: "transfer-bad", maxChunkBytes: 49152 } : request.command === "blobChunk" ? { state: "received", nextSequence: 4 } : { state: "cancelled" });
  try {
    await assert.rejects(ui.api.nativeBlobAction(new Blob(["synthetic"], { type: "text/plain" }), "file.txt", "owner-a"), /sırası/);
    const cancel = ui.commands.find((request) => request.command === "cancel"); assert.ok(cancel); assert.equal(cancel.transferId, "transfer-bad"); assert.equal(cancel.requestId, ui.commands[0].id);
    assert.equal(ui.commands.some((request) => request.command === "blobFinish"), false);
  } finally { await ui.close(); }
});

test("logout while reading a blob fences later chunks even when no bridge request is pending", async () => {
  const gate = deferred(); let reading = false;
  const blob = new Blob(["sensitive fixture"], { type: "text/plain" });
  const slice = blob.slice.bind(blob); blob.slice = (...args) => { const part = slice(...args), read = part.arrayBuffer.bind(part); part.arrayBuffer = async () => { reading = true; await gate.promise; return read(); }; return part; };
  const ui = await setup((request) => request.command === "blobStart" ? { state: "ready", transferId: "old-transfer", maxChunkBytes: 49152 } : request.command === "blobChunk" ? { state: "received", nextSequence: request.sequence + 1 } : request.command === "blobFinish" ? { state: "saved" } : { state: "cancelled" });
  try {
    const result = ui.api.nativeBlobAction(blob, "file.txt", "owner-a").then((reply) => ({ reply }), (error) => ({ error }));
    await ui.until(() => reading); await ui.api.clearNativeFiles(); gate.resolve(); const ended = await result;
    assert.equal(ui.commands.some((request) => request.command === "blobChunk" || request.command === "blobFinish"), false, "Old bytes cannot enter a cleared/new-account native operation");
    assert.ok(ended.error?.name === "AbortError" || ended.reply?.state === "cancelled");
  } finally { gate.resolve(); await ui.close(); }
});

test("invalid sizes and a pre-aborted transfer never call the bridge", async () => {
  const ui = await setup();
  try {
    await assert.rejects(ui.api.nativeBlobAction(new Blob([]), "empty.txt", "owner-a"), /boyutu/);
    await assert.rejects(ui.api.nativeBlobAction(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]), "large.bin", "owner-a"), /boyutu/);
    const controller = new AbortController(); controller.abort(); await assert.rejects(ui.api.nativeBlobAction(new Blob(["ok"]), "file.txt", "owner-a", "save", controller.signal), (error) => error.name === "AbortError"); assert.equal(ui.commands.length, 0);
  } finally { await ui.close(); }
});

test("native link sharing reports sheet opening and propagates cancellation without copying", async () => {
  const ui = await setup();
  try {
    let copies = 0; Object.defineProperty(ui.window.navigator, "clipboard", { value: { writeText: async () => { copies++; } }, configurable: true });
    const data = { title: "Kampira", url: "http://localhost/?post=post-one" };
    const opening = ui.api.shareAppLink("owner-a", data); const request = ui.commands.at(-1); assert.equal(request.command, "shareLink"); ui.respond(request, { state: "shareOpened" }); assert.equal(await opening, "opened");
    const cancelled = ui.api.shareAppLink("owner-a", data); ui.respond(ui.commands.at(-1), { state: "cancelled" }); await assert.rejects(cancelled, (error) => error.name === "AbortError"); assert.equal(copies, 0);
  } finally { await ui.close(); }
});

test("aborting native link sharing cancels only that request and never falls back to the clipboard", async () => {
  const ui = await setup();
  try {
    let copies = 0; Object.defineProperty(ui.window.navigator, "clipboard", { value: { writeText: async () => { copies++; } }, configurable: true });
    const controller = new AbortController();
    const result = ui.api.shareAppLink("owner-a", { title: "Kampira", url: "http://localhost/?post=one" }, controller.signal);
    const request = ui.commands.at(-1); controller.abort(); await assert.rejects(result, (error) => error.name === "AbortError");
    assert.equal(ui.commands.at(-1).command, "cancel"); assert.equal(ui.commands.at(-1).requestId, request.id); assert.equal(ui.commands.at(-1).accountId, "owner-a");
    ui.respond(request, { state: "shareOpened" }); assert.equal(copies, 0);
  } finally { await ui.close(); }
});
