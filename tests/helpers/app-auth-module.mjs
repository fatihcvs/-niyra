import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Shared VM import for the real account gate; SQLite fixtures execute its SQL.
const source = readFileSync(new URL("../../lib/app-auth.ts", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, crypto: webcrypto, Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob });
export const appAuthModule = exports;
