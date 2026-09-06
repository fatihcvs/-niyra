import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { secureRandomKeyDependency } from "./helpers/secure-random-key.mjs";

const source = readFileSync(new URL("../app/direct-messages.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("direct-messages.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = (nodes, names) => nodes.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(syntax)).join("\n");
const transpile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const navigation = transpile(readFileSync(new URL("../lib/mobile-navigation.ts", import.meta.url), "utf8"));
const controller = transpile(functions(syntax.statements, ["readMessageHistory", "createMessageMobileHistory"]));
const recipient = (id) => ({ publicId: id, displayName: `Student ${id}`, handle: id, avatarUrl: null, universityShortName: "Campus", departmentName: "Department" });

function browser({ mobile = true, location = "/?view=messages", state = { kampiraDepth: 2 }, delayedBack = false } = {}) {
  const entries = [{ location, state }];
  let index = 0;
  let pendingBack = 0;
  const listeners = new Set();
  const restored = [];
  const media = { matches: mobile };
  const window = {
    scrollY: 420,
    get location() { return new URL(entries[index].location, "https://kampira.example"); },
    matchMedia: () => media,
    addEventListener: (type, callback) => { if (type === "popstate") listeners.add(callback); },
    removeEventListener: (type, callback) => { if (type === "popstate") listeners.delete(callback); },
    history: {
      get state() { return entries[index].state; },
      replaceState(next, _title, url) { entries[index] = { state: structuredClone(next), location: url ?? entries[index].location }; },
      pushState(next, _title, url) { entries.splice(index + 1); entries.push({ state: structuredClone(next), location: url }); index++; },
      back() { if (delayedBack) pendingBack++; else move(-1); },
      forward() { move(1); },
    },
  };
  function move(delta) {
    if (index + delta < 0 || index + delta >= entries.length) return;
    index += delta;
    for (const callback of listeners) callback({ state: window.history.state });
  }
  const exports = {};
  runInNewContext(navigation, { exports, window, URL });
  runInNewContext(controller, { exports, window, URLSearchParams, pushAppLocation: exports.pushAppLocation });
  const create = (restore = (entry) => restored.push(structuredClone(entry)), ownerScope) => exports.createMessageMobileHistory(restore, ownerScope);
  return {
    window, entries, restored, media, create, push: exports.pushAppLocation,
    current: () => entries[index],
    flushBack: () => { while (pendingBack > 0) { pendingBack--; move(-1); } },
  };
}

test("mobile Back closes a same-URL thread before leaving Messages and Forward restores it", () => {
  const app = browser({ location: "/?view=discover" });
  app.push("/?view=messages");
  const history = app.create();
  history.initialize(null);
  history.openThread("conversation-a", recipient("a"));
  assert.equal(app.entries.length, 3);
  assert.equal(app.entries[1].location, app.entries[2].location);
  assert.equal(app.entries[1].state.kampiraScrollY, 420);
  assert.equal(app.current().state.kampiraDepth, 4);
  app.window.history.back();
  assert.equal(app.restored.at(-1).layer, "list");
  app.window.history.forward();
  assert.equal(app.restored.at(-1).conversationId, "conversation-a");
  assert.equal(app.restored.at(-1).recipient.publicId, "a");
  app.window.history.back();
  const restores = app.restored.length;
  app.window.history.back();
  assert.equal(app.current().location, "/?view=discover");
  assert.equal(app.restored.length, restores, "another workspace is owned by the root router");
  history.dispose();
});

test("recipient selection replaces a transient picker; closing it restores the underlying thread", () => {
  const app = browser();
  const history = app.create();
  history.initialize(null);
  history.openNewChat(null, null);
  assert.equal(app.current().state.kampiraMessage.layer, "new-chat");
  history.openThread(null, recipient("a"));
  assert.equal(app.entries.length, 2);
  assert.equal(app.current().state.kampiraMessage.layer, "thread");
  history.resolveThread("created-a", "a");
  history.openNewChat("created-a", recipient("a"));
  assert.equal(history.close("new-chat"), true);
  assert.equal(app.restored.at(-1).conversationId, "created-a");
  app.window.history.back();
  assert.equal(app.restored.at(-1).layer, "list");
  app.window.history.forward();
  assert.equal(app.restored.at(-1).conversationId, "created-a");
});

test("profile handoff adds a list step once, including remounts and Back during initial loading", () => {
  const app = browser();
  let history = app.create();
  history.initialize(recipient("profile-a"));
  assert.equal(app.entries.length, 2);
  assert.equal(app.restored.at(-1).recipient.publicId, "profile-a");
  history.dispose();
  history = app.create();
  history.initialize(recipient("profile-a"));
  assert.equal(app.entries.length, 2, "Strict Mode or remount must not push duplicate thread entries");
  app.window.history.back();
  history.resolveThread("late-conversation", "profile-a");
  assert.equal(app.current().state.kampiraMessage.layer, "list");
  history.dispose();
  history = app.create();
  history.initialize(recipient("profile-a"));
  assert.equal(app.restored.at(-1).layer, "list", "a stale recipient prop must not reopen a dismissed thread");
  assert.equal(app.entries.length, 2);
});

test("history contains only explicit recipient metadata and ignores another thread's late response", () => {
  const app = browser();
  const history = app.create();
  history.initialize(null);
  history.openThread(null, { ...recipient("a"), text: "private draft", messages: ["private message"], attachment: { title: "Private file" } });
  const entry = app.current().state.kampiraMessage;
  assert.deepEqual(Object.keys(entry).sort(), ["conversationId", "layer", "recipient"]);
  assert.deepEqual(Object.keys(entry.recipient).sort(), ["avatarUrl", "departmentName", "displayName", "handle", "publicId", "universityShortName"]);
  assert.doesNotMatch(JSON.stringify(app.entries), /private|attachment|messages\":/);
  history.resolveThread("other-conversation", "b");
  assert.equal(app.current().state.kampiraMessage.conversationId, null);
});

test("desktop and a root composer keep ownership of their navigation", () => {
  for (const options of [{ mobile: false }, { location: "/?view=messages&compose=1" }]) {
    const app = browser(options);
    const initial = structuredClone(app.entries);
    const history = app.create();
    history.initialize(recipient("a"));
    history.openThread("a", recipient("a"));
    history.openNewChat("a", recipient("a"));
    assert.equal(history.close("thread"), false);
    assert.deepEqual(app.entries, initial);
    assert.equal(app.restored.length, 0);
  }
});

test("rapid close clicks consume only one asynchronous browser Back entry", () => {
  const app = browser({ delayedBack: true });
  const history = app.create();
  history.initialize(null);
  history.openThread("a", recipient("a"));
  history.openNewChat("a", recipient("a"));
  assert.equal(history.close("new-chat"), true);
  assert.equal(history.close("new-chat"), true);
  app.flushBack();
  assert.equal(app.current().state.kampiraMessage.layer, "thread");
});

test("history from an older authenticated owner cannot restore its recipient after account switch", () => {
  const app = browser();
  const old = app.create(undefined, "viewer:1"); old.initialize(null); old.openThread("private-thread", recipient("private-person")); old.dispose();
  const fresh = app.create(undefined, "other:1"); fresh.initialize(null);
  assert.equal(app.current().state.kampiraMessage.layer, "list");
  assert.equal(app.current().state.kampiraMessage.recipient, null);
  app.window.history.back();
  assert.equal(app.restored.at(-1).layer, "list"); assert.equal(app.restored.at(-1).recipient, null);
  fresh.dispose();
});

test("the real conversation transition preserves per-recipient drafts and invalidates outgoing requests", () => {
  const workspace = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "MessageWorkspace");
  const transition = transpile(functions(workspace.body.statements, ["changeConversation"]));
  let invalidations = 0;
  const sessionExports = {};
  runInNewContext(transpile(readFileSync(new URL("../lib/message-drafts.ts", import.meta.url), "utf8")), { exports: sessionExports, require: secureRandomKeyDependency });
  const messageSessionState = sessionExports.createMessageSessionState();
  messageSessionState.setOwnerScope("viewer:1");
  const context = {
    conversations: [],
    selectedId: "conversation-a", activePerson: recipient("a"), text: "Unsent A", selectedAttachment: { id: "note-a", title: "Private note A" },
    messageSessionState, ownerScope: "viewer:1", savedThread: { current: null }, messagesRef: { current: { scrollTop: 100 } }, restoreScrollTop: { current: null }, selectionVersion: { current: 0 }, activeRecipientId: { current: "a" },
    threadRequest: { current: { cancel: () => invalidations++ } }, historyRequest: { current: { cancel: () => invalidations++ } },
    historyLoaded: { current: true }, prependOffset: { current: { top: 100 } }, nearBottom: { current: false },
    mobileHistory: { current: null },
  };
  for (const name of ["OlderCursor", "HistoryLoading", "Messages", "ThreadLoading", "PickerOpen", "ActionTarget", "Error", "HasNewMessages"]) context[`set${name}`] = () => {};
  context.setText = (value) => { context.text = value; };
  context.setSelectedAttachment = (value) => { context.selectedAttachment = value; };
  context.setSelectedId = (value) => { context.selectedId = value; };
  context.setDraftRecipient = (value) => { context.activePerson = value; };
  runInNewContext(`${transition}\nthis.change = changeConversation;`, context);
  const change = (...args) => {
    context.savedThread.current = context.activePerson ? { conversationId: context.selectedId, person: context.activePerson, text: context.text, attachment: context.selectedAttachment, messages: [], olderCursor: null, historyLoaded: false, scrollTop: 100, nearBottom: false } : null;
    context.change(...args);
  };
  change(null, null, false);
  assert.equal(context.activeRecipientId.current, null);
  assert.equal(context.text, "");
  change("conversation-b", recipient("b"), false);
  context.text = "Unsent B";
  change(null, null, false);
  change("conversation-a", recipient("a"), false);
  assert.equal(context.text, "Unsent A");
  assert.equal(context.selectedAttachment.id, "note-a");
  assert.equal(messageSessionState.readThread("viewer:1", "b").text, "Unsent B");
  assert.equal(invalidations, 8);
  assert.equal(context.selectionVersion.current, 4);
});
