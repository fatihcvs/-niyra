import { lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

const day = 86400_000;
// Prune after 29 days, with hourly checks, leaving headroom inside the public
// 30-day retention window. Only dated operational snapshots belong here.
export async function pruneOperationalBackups(directory, now = Date.now()) {
  const root = path.resolve(directory);
  if (path.basename(root) !== "backups" || path.dirname(root) === path.parse(root).root || !Number.isFinite(now)) throw new Error("Invalid backup root");
  let info;
  try { info = await lstat(root); } catch (error) { if (error.code === "ENOENT") return { removed: 0, retained: 0, skipped: 0 }; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== root) throw new Error("Unsafe backup root");
  const result = { removed: 0, retained: 0, skipped: 0 };
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const match = /^(?:mobile-publication|operational)-(\d{4})(\d{2})(\d{2})(?:T\d{6}Z)?$/.exec(entry.name);
    if (!match || !entry.isDirectory() || entry.isSymbolicLink()) { result.skipped++; continue; }
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    const created = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(created) || new Date(created).toISOString().slice(0,10) !== date || created > now) { result.skipped++; continue; }
    if (now - created < 29 * day) { result.retained++; continue; }
    const target = path.resolve(root, entry.name);
    const targetInfo = await lstat(target);
    // Verify the final absolute path immediately before recursive removal.
    if (path.dirname(target) !== root || targetInfo.isSymbolicLink() || !targetInfo.isDirectory() || await realpath(target) !== target) { result.skipped++; continue; }
    await rm(target, { recursive: true, force: false });
    result.removed++;
  }
  return result;
}

export function startBackupRetention(directory) {
  let timer, stopped = false;
  async function tick() {
    try {
      const result = await pruneOperationalBackups(directory);
      if (result.removed || result.skipped) console.log(JSON.stringify({ event: "backup-retention", ...result }));
    } catch { console.error("Operational backup retention needs attention."); }
    if (!stopped) { timer = setTimeout(tick, 3600_000); timer.unref(); }
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
