import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pruneOperationalBackups } from "../scripts/backup-retention.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kampira-retention-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "backups"); await mkdir(root);
  return { directory, root };
}
test("expired operational snapshots are removed; fresh and unrelated data remain", async t => {
  const { root } = await fixture(t);
  for (const name of ["mobile-publication-20260801", "operational-20260908T010000Z", "manual-20260101", "operational-20260230", "operational-20270908"]) {
    await mkdir(path.join(root,name)); await writeFile(path.join(root,name,"snapshot.sqlite"),"synthetic backup");
  }
  await writeFile(path.join(root,"operational-20260101"),"not a directory");
  assert.deepEqual(await pruneOperationalBackups(root,Date.parse("2026-09-08T12:00:00Z")),{removed:1,retained:1,skipped:4});
  await assert.rejects(access(path.join(root,"mobile-publication-20260801")));
  await access(path.join(root,"manual-20260101","snapshot.sqlite"));
  await access(path.join(root,"operational-20260908T010000Z","snapshot.sqlite"));
});
test("a dated symlink cannot delete files outside the backup directory",async t=>{
  const { directory,root }=await fixture(t);
  const outside=path.join(directory,"outside"); await mkdir(outside); await writeFile(path.join(outside,"keep.txt"),"preserve");
  await symlink(outside,path.join(root,"operational-20260101"),process.platform==="win32"?"junction":"dir");
  assert.deepEqual(await pruneOperationalBackups(root,Date.parse("2026-09-08T12:00:00Z")),{removed:0,retained:0,skipped:1});
  await access(path.join(outside,"keep.txt"));
});
test("unexpected roots are rejected and missing managed roots are harmless",async t=>{
  const { directory }=await fixture(t);
  await assert.rejects(pruneOperationalBackups(directory),/Invalid backup root/);
  const missing=path.join(directory,"isolated","backups");
  assert.deepEqual(await pruneOperationalBackups(missing),{removed:0,retained:0,skipped:0});
});
