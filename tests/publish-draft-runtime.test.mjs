import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { act, createElement as h, StrictMode, useEffect, useRef, useState } from "react";
import ts from "typescript";
import { IDBFactory, IDBObjectStore } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";
import { createMobileDom } from "./helpers/mobile-dom.mjs";
import { secureRandomKeyDependency } from "./helpers/secure-random-key.mjs";

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const media = {}, attemptApi = {};
runInNewContext(compile("../lib/post-media.ts"), { exports: media, Uint8Array, DataView, TextDecoder });
runInNewContext(compile("../lib/publish-attempt.ts"), { exports: attemptApi, require: secureRandomKeyDependency });
const storeSource = compile("../lib/publish-draft-store.ts");
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Home");
const publish = home.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "publishPost");
assert.ok(publish, "Execute the actual Home publication handler, not a rewritten test implementation");
const publishCode = ts.transpileModule(`${publish.getText(ast)}\nglobalThis.publishPost = publishPost;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const empty = () => ({ content: "", audience: "platform", courseId: null, media: null });
const owner = (publicId) => ({ publicId, confirmed: true });
const noop = () => {};

async function setup({ seed, profileFetch = async () => { throw new Error("Unexpected profile refresh"); }, transport = async () => ({ ok: true, status: 201, data: { post: { id: 51 } } }) } = {}) {
  const indexedDB = new IDBFactory(), api = {}, instances = [];
  runInNewContext(storeSource, { exports: api, File, Blob, DOMException, setTimeout, clearTimeout, require: (name) => name === "./publish-attempt" ? attemptApi : media });
  const create = (options = {}) => { const store = api.createPublishDraftStore({ ...options, indexedDB, debounceMs: 0 }); instances.push(store); return store; };
  const inspect = async (id = "owner-a") => { const store = create(); store.setOwner(owner(id)); try { return await store.load(); } finally { store.dispose(); } };
  if (seed) { const store = create(); store.setOwner(owner("owner-a")); await seed(store); store.dispose(); }
  const ui = await createMobileDom({ modules: { "lib/publish-draft-store.ts": { createPublishDraftStore: create } } });
  const { usePublishDraft } = ui.load("app/use-publish-draft.ts");
  const { PublishDraftNotice } = ui.load("app/publish-draft-notice.tsx");
  const { MobilePostComposer } = ui.load("app/mobile-app.tsx");
  let current, nextKey = 0;
  const calls = [];
  function Harness({ id }) {
    const [studentProfile, setStudentProfile] = useState({ publicId: id, postCount: 1, courses: [] });
    const [draftState, setDraftState] = useState(empty), [publishing, setPublishing] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(""), [posts, setPosts] = useState([]), [confirmedOwner, setOwner] = useState(id);
    const publishAttempt = useRef(attemptApi.createPublishAttempt(() => `runtime-key-${++nextKey}`));
    const publishBusy = useRef(false), publishGeneration = useRef(0), publishController = useRef(null);
    const update = (field) => (value) => setDraftState((draft) => ({ ...draft, [field]: value }));
    const suspend = () => { durableDraft.suspend(); publishGeneration.current++; publishController.current?.abort(); publishAttempt.current.reset(); publishBusy.current = false; setPublishing(false); setUncertain(false); setDraftState(empty()); setOwner(null); };
    const durableDraft = usePublishDraft({ ownerId: confirmedOwner, draft: draftState, paused: publishing || uncertain, onRestore(record) { publishAttempt.current.reset(); if (record.immutableAttempt) publishAttempt.current.resume(record.immutableAttempt); setUncertain(Boolean(record.immutableAttempt)); setDraftState({ content: record.content, audience: record.audience, courseId: record.courseId, media: record.media, ...(record.mediaFiles ? { mediaFiles: record.mediaFiles } : {}) }); }, onInvalidate: suspend });
    const composerMedia = { files: attemptApi.publishDraftMedia(draftState), setFiles(files) { setDraftState((draft) => ({ ...draft, media: files[0] ?? null, mediaFiles: [...files] })); } };
    useEffect(() => () => { publishGeneration.current++; publishController.current?.abort(); }, []);
    const context = { composerMedia, publishDraftMedia: attemptApi.publishDraftMedia, draft: draftState.content, draftAudience: draftState.audience, draftMedia: draftState.media, composerCourseId: draftState.courseId, durableDraft, publishAttempt, publishBusy, publishGeneration, publishController, setPublishing, setPublishUncertain: setUncertain, setPublishProgress: noop, setComposerError: setError, setDraft: update("content"), setDraftAudience: update("audience"), URL, setComposerCourseId: update("courseId"), setComposerExpanded: noop, setPosts, setStudentProfile, invalidateProfileContent: noop, activeProfile: { publicId: confirmedOwner }, studentProfile, sessionRevision: 0, feedTab: "all", changeFeed: noop, mobileComposerOpen: false, expireSession: suspend, AbortController, AbortSignal, authenticatedFetch: profileFetch, Error, PublishUploadError: class extends Error {}, sendPublishUpload: async (attempt, options) => { calls.push(attempt); return transport(attempt, options, inspect); } };
    runInNewContext(publishCode, context);
    current = { durableDraft, draftState, publishing, uncertain, posts, studentProfile, confirm(id) { setDraftState(empty()); setOwner(id); }, logout: async () => { const result = await durableDraft.logout(); suspend(); return result; } };
    return confirmedOwner ? h(MobilePostComposer, { draft: draftState.content, audience: draftState.audience, name: "Örnek Öğrenci", initials: "ÖÖ", media: draftState.media, mediaUrl: "", mediaFiles: composerMedia.files, mediaUrls: [], onDraftChange: update("content"), onAudienceChange: update("audience"), onMediaChange: noop, onRemoveMedia: () => composerMedia.setFiles([]), onClose: noop, onNavigate: noop, onPublish: context.publishPost, publishing, retry: uncertain, locked: publishing || uncertain || durableDraft.blocked, publishBlocked: durableDraft.blocked, error, draftNotice: h(PublishDraftNotice, { view: durableDraft.view, hasDraft: Boolean(draftState.content || draftState.media), onRestore: durableDraft.restore, onDiscard: durableDraft.discard, onRetry: durableDraft.retry }) }) : h("p", null, "Oturum gerekli");
  }
  const render = (id = "owner-a") => ui.render(h(StrictMode, null, h(Harness, { id })));
  const until = async (predicate) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); } assert.ok(predicate(), `Condition did not settle: ${ui.host.textContent}`); };
  const button = (label) => [...ui.host.querySelectorAll("button")].find((element) => element.textContent === label);
  return { ...ui, render, until, button, inspect, calls, read: async (...args) => { let value; await act(async () => { value = await inspect(...args); }); return value; }, current: () => current, hide: () => ui.render(null), close: async () => { await ui.close(); instances.forEach((store) => store.dispose()); } };
}

test("StrictMode recovery hides draft body and File until explicit restore; actual Home waits for durable key and clears on success", async () => {
  const bytes = [137, 80, 78, 71, 10, 20];
  const file = new File([new Uint8Array(bytes)], "private-photo.png", { type: "image/png", lastModified: 123 });
  const snapshot = { key: "reload-stable-key", draft: { ...empty(), content: "Özel taslak", media: file }, uncertain: true };
  const ui = await setup({ seed: (store) => store.preparePublish(snapshot), transport: async (attempt, _options, inspect) => {
    const stored = (await inspect()).record;
    assert.equal(stored.immutableAttempt.key, attempt.key, "Durable transaction precedes network send");
    assert.deepEqual([...new Uint8Array(await attempt.draft.media.arrayBuffer())], bytes);
    return { ok: true, status: 200, data: { post: { id: 51 } } };
  } });
  try {
    await ui.render(); await ui.until(() => ui.button("Geri yükle"));
    assert.equal(ui.host.querySelector("textarea").value, "");
    assert.doesNotMatch(ui.host.textContent, /Özel taslak|private-photo/);
    assert.equal((await ui.read()).record.content, "Özel taslak", "Initial empty composer cannot overwrite the candidate");
    await ui.click(ui.button("Geri yükle"));
    assert.equal(ui.host.querySelector("textarea").value, "Özel taslak");
    assert.match(ui.host.textContent, /private-photo/);
    await ui.click(ui.button("Tekrar dene")); await ui.until(() => ui.current().posts.length === 1);
    assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].key, snapshot.key);
    assert.equal((await ui.read()).record, null);
    assert.equal(ui.host.querySelector("textarea").value, "");
  } finally { await ui.close(); }
});

test("actual Home restores ordered photos, persists the same immutable key before retry and clears all media only after confirmed publication", async () => {
  const files = [3, 1, 2].map((index) => new File([new Uint8Array([index])], `${index}.png`, { type: "image/png" }));
  const snapshot = { key: "reload-multi-order", draft: { ...empty(), content: "Sıralı fotoğraflar", media: files[0], mediaFiles: files }, uncertain: true };
  const ui = await setup({ seed: (store) => store.preparePublish(snapshot), transport: async (attempt, _options, inspect) => {
    const stored = (await inspect()).record;
    assert.equal(stored.immutableAttempt.key, snapshot.key);
    assert.equal(attempt.key, snapshot.key);
    assert.deepEqual(Array.from(attempt.draft.mediaFiles, (file) => file.name), ["3.png", "1.png", "2.png"]);
    assert.deepEqual(Array.from(stored.mediaFiles, (file) => file.name), ["3.png", "1.png", "2.png"]);
    return { ok: true, status: 201, data: { post: { id: 88 } } };
  } });
  try {
    await ui.render(); await ui.until(() => ui.button("Geri yükle"));
    assert.equal(ui.host.querySelectorAll("ol li").length, 0);
    await ui.click(ui.button("Geri yükle"));
    assert.equal(ui.host.querySelectorAll("ol li").length, 3);
    await ui.click(ui.button("Tekrar dene"));
    await ui.until(() => ui.current().posts.length === 1);
    assert.equal(ui.current().draftState.mediaFiles.length, 0);
    assert.equal((await ui.read()).record, null);
  } finally { await ui.close(); }
});

test("quota failure never starts upload or claims saved; storage retry preserves editable content", async () => {
  const ui = await setup(), originalPut = IDBObjectStore.prototype.put;
  try {
    await ui.render(); await ui.until(() => !ui.current().durableDraft.blocked);
    IDBObjectStore.prototype.put = function (...args) { if (this.name === "drafts") throw new DOMException("Full", "QuotaExceededError"); return originalPut.apply(this, args); };
    await ui.fill(ui.host.querySelector("textarea"), "Kaybolmayan metin");
    await ui.until(() => ui.button("Depolamayı yeniden dene"));
    await ui.click(ui.button("Paylaş")); await ui.until(() => !ui.current().publishing);
    assert.equal(ui.calls.length, 0); assert.equal(ui.host.querySelector("textarea").value, "Kaybolmayan metin");
    assert.doesNotMatch(ui.host.textContent, /Taslağın 24 saat/);
    IDBObjectStore.prototype.put = originalPut;
    await ui.click(ui.button("Depolamayı yeniden dene")); await ui.until(() => ui.current().durableDraft.view.phase === "saved");
    await ui.click(ui.button("Paylaş")); await ui.until(() => ui.current().posts.length === 1);
    assert.equal(ui.calls.length, 1);
  } finally { IDBObjectStore.prototype.put = originalPut; await ui.close(); }
});

test("401 hides private memory, other owner sees no candidate, same-owner reauth requires restore, explicit logout clears disk", async () => {
  const ui = await setup({ transport: async () => ({ ok: false, status: 401, data: null }) });
  try {
    await ui.render(); await ui.until(() => !ui.current().durableDraft.blocked);
    await ui.fill(ui.host.querySelector("textarea"), "Hesaba özel"); await ui.click(ui.button("Paylaş"));
    await ui.until(() => !ui.host.querySelector("textarea"));
    const persisted = (await ui.read()).record; assert.equal(persisted.content, "Hesaba özel");
    await act(async () => ui.current().confirm("owner-b")); await ui.until(() => !ui.current().durableDraft.blocked);
    assert.equal(ui.host.querySelector("textarea").value, ""); assert.equal(ui.button("Geri yükle"), undefined);
    await act(async () => ui.current().confirm("owner-a")); await ui.until(() => ui.button("Geri yükle"));
    assert.equal(ui.host.querySelector("textarea").value, "");
    await ui.click(ui.button("Geri yükle")); assert.equal(ui.host.querySelector("textarea").value, "Hesaba özel");
    await act(async () => { assert.equal((await ui.current().logout()).status, "cleared"); });
    assert.equal((await ui.read()).record, null); assert.equal((await ui.read("owner-b")).record, null);
  } finally { await ui.close(); }
});

test("terminal removed-post response releases immutable attempt for editing without automatic resend", async () => {
  const ui = await setup({ seed: (store) => store.preparePublish({ key: "removed-post-key", draft: { ...empty(), content: "Önceki içerik", courseId: "removed-course" }, uncertain: true }), transport: async () => ({ ok: false, status: 410, data: { code: "POST_REMOVED" } }) });
  try {
    await ui.render(); await ui.until(() => ui.button("Geri yükle")); await ui.click(ui.button("Geri yükle"));
    await ui.click(ui.button("Tekrar dene")); await ui.until(() => !ui.current().publishing && !ui.current().uncertain);
    assert.equal(ui.calls.length, 1); assert.equal(ui.host.querySelector("textarea").disabled, false);
    assert.match(ui.host.textContent, /Önceki gönderi kaldırılmış/);
    await ui.until(() => ui.current().durableDraft.view.phase === "saved");
    assert.equal((await ui.read()).record.immutableAttempt, null);
  } finally { await ui.close(); }
});

test("unmount aborts pending transport and late success cannot clear the persisted attempt", async () => {
  let finish, signal;
  const ui = await setup({ transport: (_attempt, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); } });
  try {
    await ui.render(); await ui.until(() => !ui.current().durableDraft.blocked);
    await ui.fill(ui.host.querySelector("textarea"), "Yanıtı bekleyen taslak"); await ui.click(ui.button("Paylaş")); await ui.until(() => finish);
    await ui.hide(); assert.equal(signal.aborted, true);
    await act(async () => finish({ ok: true, status: 201, data: { post: { id: 99 } } }));
    assert.ok((await ui.read()).record.immutableAttempt);
    await ui.render(); await ui.until(() => ui.button("Geri yükle"));
    assert.equal(ui.host.querySelector("textarea").value, "");
  } finally { await ui.close(); }
});

test("ambiguous upload keeps the persisted normalized payload saved and retries the same key", async () => {
  let succeeds = false;
  const ui = await setup({ transport: async () => {
    if (!succeeds) throw new Error("Response lost");
    return { ok: true, status: 200, data: { post: { id: 71 } } };
  } });
  try {
    await ui.render(); await ui.until(() => !ui.current().durableDraft.blocked);
    await ui.fill(ui.host.querySelector("textarea"), "  Özgün içerik  "); await ui.click(ui.button("Paylaş"));
    await ui.until(() => ui.current().uncertain && !ui.current().publishing);
    assert.equal(ui.host.querySelector("textarea").value, "Özgün içerik");
    assert.equal(ui.host.querySelector("textarea").disabled, true);
    assert.equal(ui.current().durableDraft.view.phase, "saved");
    assert.equal((await ui.read()).record.immutableAttempt.key, ui.calls[0].key);
    succeeds = true; await ui.click(ui.button("Tekrar dene")); await ui.until(() => ui.current().posts.length === 1);
    assert.equal(ui.calls[0].key, ui.calls[1].key);
    assert.equal(ui.calls[0].draft.content, ui.calls[1].draft.content);
  } finally { await ui.close(); }
});

test("replayed publication reconciles the server count instead of counting the recovered post twice", async () => {
  let finishProfile;
  const ui = await setup({
    seed: store => store.preparePublish({ key: "already-committed-key", draft: { ...empty(), content: "Önceden yayınlandı" }, uncertain: true }),
    transport: async () => ({ ok: true, status: 200, replayed: true, data: { post: { id: 51 } } }),
    profileFetch: async () => new Promise(resolve => { finishProfile = resolve; }),
  });
  try {
    await ui.render(); await ui.until(() => ui.button("Geri yükle")); await ui.click(ui.button("Geri yükle"));
    await ui.click(ui.button("Tekrar dene")); await ui.until(() => ui.current().posts.length === 1 && finishProfile);
    assert.equal(ui.current().studentProfile.postCount, 1, "Reloaded profile already includes the published post");
    await act(async () => finishProfile({ ok: true, status: 200, json: async () => ({ profile: { publicId: "owner-a", postCount: 3 } }) }));
    assert.equal(ui.current().studentProfile.postCount, 3, "Server count can include other confirmed posts");
    assert.equal(ui.calls.length, 1);
  } finally { await ui.close(); }
});
