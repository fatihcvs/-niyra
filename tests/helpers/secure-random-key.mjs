import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../../lib/secure-random-key.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

export function loadSecureRandomKey(globals = { crypto }) {
  const exports = {};
  runInNewContext(source, { ...globals, exports, Uint8Array });
  return exports;
}
const helper = loadSecureRandomKey();
export function secureRandomKeyDependency(name) {
  assert.equal(name, "./secure-random-key");
  return helper;
}
