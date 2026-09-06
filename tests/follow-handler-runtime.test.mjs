import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { act, createElement as h, useEffect, useLayoutEffect, useRef, useState } from "react";
import ts from "typescript";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === "Home");
const declaration = (name) => { const item = home.body.statements.find((statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations.some((value) => value.name.getText(ast) === name)); assert.ok(item, name); return item.getText(ast); };
const fn = (name) => { const item = home.body.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name); assert.ok(item, name); return item.getText(ast); };
const cleanup = home.body.statements.find((item) => ts.isExpressionStatement(item) && item.getText(ast).includes("followLock.current = null"));
assert.ok(cleanup);
const code = ts.transpileModule(`function Harness({ owner, onState, onExpired }) {
 const [people,setPeople] = useState([{publicId:'target-a',isFollowing:false,followerCount:4}]);
 const [publicProfile,setPublicProfile] = useState({publicId:'target-a',isFollowing:false,followerCount:4});
 const [studentProfile,setStudentProfile] = useState({publicId:owner,followingCount:7});
 const profileState = 'ready', sessionRevision = owner;
 function expireSession() { onExpired(); }
 ${["[followPending, setFollowPending]", "followOwner", "followPendingId", "followLock", "[followError, setFollowError]", "followRequests"].map(declaration).join("\n")}
 ${cleanup.getText(ast)}
 ${fn("handleFollowChange")}
 ${fn("toggleFollow")}
 useLayoutEffect(()=>onState({people,publicProfile,studentProfile,followPendingId,followError,toggleFollow}));
 return h('button',{onClick:()=>void toggleFollow('target-a')},'Takip');
} globalThis.Harness=Harness;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function setup() {
  const calls = []; let state, expired = 0;
  const ui = await createMobileDom({ fetch: (url, init) => new Promise((resolve) => calls.push({ url, init, resolve })) });
  const context = { useEffect, useLayoutEffect, useRef, useState, h, Error, useScopedRequests: ui.load("app/use-scoped-requests.ts").useScopedRequests, invalidateProfileRelationships() {} };
  runInNewContext(code, context);
  const render = (owner = "owner-a") => ui.render(h(context.Harness, { owner, onState: (value) => { state = value; }, onExpired: () => expired++ }));
  await render();
  return { ...ui, calls, render, state: () => state, expired: () => expired, reply: (call, body, status = 200) => act(async () => call.resolve({ ok: status < 400, status, json: async () => body })) };
}

test("actual Home follow handler locks same-frame submissions and reconciles all server counts", async () => {
  const ui = await setup();
  try {
    await act(async () => { ui.host.querySelector("button").click(); ui.host.querySelector("button").click(); });
    assert.equal(ui.calls.length, 1); assert.equal(JSON.parse(ui.calls[0].init.body).active, true);
    assert.equal(ui.state().publicProfile.followerCount, 5); assert.equal(ui.state().studentProfile.followingCount, 7, "own aggregate waits for the server");
    await ui.reply(ui.calls[0], { active: true, followerCount: 19, viewerFollowingCount: 12 });
    assert.equal(ui.state().publicProfile.followerCount, 19); assert.equal(ui.state().people[0].followerCount, 19); assert.equal(ui.state().studentProfile.followingCount, 12); assert.equal(ui.state().followPendingId, null);
  } finally { await ui.close(); }
});

test("actual Home follow failure restores its optimistic target without changing the own aggregate", async () => {
  const ui = await setup();
  try {
    await ui.click(ui.host.querySelector("button")); await ui.reply(ui.calls[0], { error: "Takip reddedildi" }, 503);
    assert.equal(ui.state().people[0].isFollowing, false); assert.equal(ui.state().publicProfile.followerCount, 4); assert.equal(ui.state().studentProfile.followingCount, 7); assert.equal(ui.state().followPendingId, null); assert.equal(ui.state().followError, "Takip reddedildi");
  } finally { await ui.close(); }
});

test("Home follow delayed body after session revision change cannot overwrite current aggregates or pending control", async () => {
  const ui = await setup(); let finish;
  try {
    await ui.click(ui.host.querySelector("button"));
    await act(async () => ui.calls[0].resolve({ ok: true, status: 200, json: () => new Promise((resolve) => { finish = resolve; }) }));
    await ui.render("owner-b"); assert.equal(ui.calls[0].init.signal.aborted, true); assert.equal(ui.state().followPendingId, null);
    await ui.click(ui.host.querySelector("button")); assert.equal(ui.calls.length, 2);
    await act(async () => finish({ active: true, followerCount: 99, viewerFollowingCount: 99 }));
    assert.equal(ui.state().followPendingId, "target-a"); assert.notEqual(ui.state().studentProfile.followingCount, 99);
    await ui.reply(ui.calls[1], { active: false, followerCount: 4, viewerFollowingCount: 7 }); assert.equal(ui.state().followPendingId, null);
  } finally { await ui.close(); }
});
