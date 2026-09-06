import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { downloadHandler, validateHost, verifyArtifact } from '../serve-apk.mjs';

test('APK handoff refuses absent, unverified, or altered artifacts before serving', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kampira-apk-source-test-'));
  try {
    await assert.rejects(verifyArtifact(directory), /absent/);
    const apk = path.join(directory, 'kampira-test-debug.apk');
    // Deliberately synthetic ZIP header fixture, never an installable or claimed APK.
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]);
    await writeFile(apk, bytes);
    const receipt = { package: 'app.kampira.preview', variant: 'debug', buildExecuted: true, artifactVerified: false, releaseReady: false, apk, sha256: createHash('sha256').update(bytes).digest('hex') };
    const save = () => writeFile(path.join(directory, 'build-receipt.json'), JSON.stringify(receipt));
    await save();
    await assert.rejects(verifyArtifact(directory), /verified debug/);
    receipt.artifactVerified = true;
    receipt.releaseReady = true;
    await save();
    await assert.rejects(verifyArtifact(directory), /verified debug/);
    receipt.releaseReady = false;
    await save();
    const verified = await verifyArtifact(directory);
    assert.deepEqual(verified.bytes, bytes);
    await writeFile(apk, Buffer.concat([bytes, Buffer.from('altered')]));
    await assert.rejects(verifyArtifact(directory), /SHA-256/);
    assert.deepEqual(verified.bytes, bytes, 'already verified bytes remain fixed in memory');
  } finally {
    const resolved = path.resolve(directory);
    const expectedParent = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), expectedParent);
    assert.ok(path.basename(resolved).startsWith('kampira-apk-source-test-'));
    await rm(resolved, { recursive: true, force: true });
  }
});

test('exact APK route has attachment MIME and HEAD; traversal, listing, and writes fail', () => {
  const bytes = Buffer.from('synthetic fixture');
  const handler = downloadHandler({ bytes });
  function request(url, method = 'GET') {
    const response = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    handler({ url, method }, response);
    return response;
  }
  const download = request('/kampira-test-debug.apk');
  assert.equal(download.status, 200);
  assert.equal(download.headers['Content-Type'], 'application/vnd.android.package-archive');
  assert.equal(download.headers['Content-Disposition'], 'attachment; filename="kampira-test-debug.apk"');
  assert.deepEqual(download.body, bytes);
  assert.equal(request('/kampira-test-debug.apk', 'HEAD').body, undefined);
  for (const url of ['/', '/build-receipt.json', '/../.env', '/%2e%2e/.env', '/kampira-test-debug.apk?file=.env']) assert.equal(request(url).status, 404);
  assert.equal(request('/kampira-test-debug.apk', 'POST').status, 405);
});

test('download host must be an explicit private local interface', () => {
  for (const host of ['0.0.0.0', '8.8.8.8', '192.168.0.999', 'localhost', 'https://192.168.0.4', '192.168.0.4/path']) assert.throws(() => validateHost(host));
  assert.equal(validateHost('127.0.0.1'), '127.0.0.1');
});
