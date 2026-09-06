import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { workerSecrets, serializeSecrets, startPushPump } from '../../scripts/push/railway-run.mjs';

// Serve the already built application against the existing local preview data.
// No build, migration, data replacement, remote binding, upload, or deployment.
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/android-preview/local-site');
const state = path.join(root, '.wrangler/state');
const entry = path.join(root, 'dist/server/index.js');
const assets = path.join(root, 'dist/client');
const config = path.join(output, 'wrangler.json');
await access(entry);
await access(assets);
await access(path.join(state, 'v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite'));
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', () => reject(new Error('Port 5173 is already in use. Stop only the identified prior preview process first.')));
  probe.listen(5173, '0.0.0.0', () => probe.close(resolve));
});
await mkdir(output, { recursive: true });
await writeFile(config, JSON.stringify({
  name: 'kampira-tablet-local-preview', main: entry,
  compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'],
  rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
  assets: { directory: assets, binding: 'ASSETS', not_found_handling: 'none', run_worker_first: false },
  d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }],
  r2_buckets: [{ binding: 'FILES', bucket_name: 'site-creator-r2' }],
}, null, 2));
await writeFile(path.join(output, '.dev.vars'), '# Local tablet preview; provider credentials are not loaded by this launcher.\n');
await writeFile(path.join(output, 'empty.env'), '');
const pushOption = process.argv.indexOf('--push-env-file');
let pushValues = null;
let environmentFile = path.join(output, 'empty.env');
if (pushOption !== -1) {
  if (!process.argv[pushOption + 1]) throw new Error('Supply an explicit local push environment file.');
  pushValues = workerSecrets(parseEnv(await readFile(path.resolve(process.argv[pushOption + 1]), 'utf8')));
  environmentFile = path.join(output, '.push.env');
  await writeFile(environmentFile, serializeSecrets(pushValues), { mode: 0o600 });
}
const allowed = new Set(['path', 'systemroot', 'windir', 'userprofile', 'temp', 'tmp', 'localappdata', 'appdata', 'comspec', 'homedrive', 'homepath', 'programfiles', 'programfiles(x86)', 'os', 'pathext']);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
Object.assign(env, { WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(output, 'logs'), MINIFLARE_REGISTRY_PATH: path.join(output, 'registry'), NODE_ENV: 'production' });
const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const args = [cli, 'dev', '--config', config, '--env-file', environmentFile, '--local', '--no-bundle', '--persist-to', state, '--ip', '0.0.0.0', '--port', '5173', '--inspector-port', '0', '--show-interactive-dev-session', 'false', '--log-level', 'warn'];
const child = spawn(process.execPath, args, { cwd: output, env, stdio: 'inherit', windowsHide: true });
const receipt = { startedAt: new Date().toISOString(), launcherPid: process.pid, wranglerPid: child.pid, config, state, port: 5173, entrySha256: createHash('sha256').update(await readFile(entry)).digest('hex'), localOnly: true, buildInvoked: false, migrationInvoked: false, remoteOperation: false, providerCredentialsLoaded: Boolean(pushValues) };
await writeFile(path.join(output, 'process.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
const stopPump = pushValues ? startPushPump({ origin: 'http://127.0.0.1:5173', secret: pushValues.PUSH_JOB_SECRET,
  onUnavailable: () => console.error('Local push dispatcher unavailable; queued deliveries will retry.') }) : () => {};
const stop = () => { stopPump(); child.kill(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.once('error', (error) => { console.error(`Local preview launch failed: ${error.code ?? 'UNKNOWN'}`); process.exitCode = 1; });
child.once('exit', (code) => { stopPump(); process.exitCode = code ?? 1; });
