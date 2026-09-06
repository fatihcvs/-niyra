import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const fileName = 'kampira-test-debug.apk';
const downloadPath = `/${fileName}`;
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const artifactDirectory = path.resolve(projectRoot, '../../outputs/android-preview/artifacts');

/** Read and pin one verified artifact in memory; no directory or repository is served. */
export async function verifyArtifact(directory = artifactDirectory) {
  const apkPath = path.resolve(directory, fileName);
  let receipt;
  let bytes;
  try {
    receipt = JSON.parse((await readFile(path.join(directory, 'build-receipt.json'), 'utf8')).replace(/^\uFEFF/, ''));
    bytes = await readFile(apkPath);
  } catch {
    throw new Error('APK or valid build receipt is absent. Build and verify the debug APK first.');
  }
  if (receipt.package !== 'app.kampira.preview' || receipt.variant !== 'debug'
      || receipt.buildExecuted !== true || receipt.artifactVerified !== true
      || receipt.releaseReady !== false || typeof receipt.apk !== 'string'
      || path.resolve(receipt.apk) !== apkPath) {
    throw new Error('Receipt does not identify this verified debug preview artifact.');
  }
  if (bytes.length < 4 || !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error('Artifact is not an APK/ZIP archive.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '') || receipt.sha256 !== sha256) {
    throw new Error('APK SHA-256 differs from the signature-verified build receipt.');
  }
  return Object.freeze({ bytes, sha256, receipt });
}

export function downloadHandler(artifact) {
  return (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.url !== downloadPath) {
      response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }
    response.writeHead(200, {
      ...headers,
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': artifact.bytes.length,
      'Content-Security-Policy': "default-src 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : artifact.bytes);
  };
}

export function validateHost(host) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error('Select an exact local private IPv4 interface.');
  const parts = host.split('.').map(Number);
  const privateHost = parts.every((part) => part <= 255) && (parts[0] === 10 || parts[0] === 127
    || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
  if (!privateHost) throw new Error('Only a private or loopback IPv4 interface may serve this preview.');
  const local = Object.values(networkInterfaces()).flat().some((item) => item?.family === 'IPv4' && item.address === host);
  if (!local) throw new Error('The selected IPv4 address is not a current interface on this computer.');
  return host;
}

async function main() {
  const { values } = parseArgs({ options: { host: { type: 'string' }, port: { type: 'string', default: '5174' } }, strict: true });
  if (!values.host) throw new Error('Supply --host with the exact LAN IPv4 address.');
  const host = validateHost(values.host);
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be an integer between 1024 and 65535.');
  const artifact = await verifyArtifact();
  const server = createServer(downloadHandler(artifact));
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on('error', (error) => { console.error(`Download server failed: ${error.code ?? 'UNKNOWN'}`); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`Verified debug APK: http://${host}:${port}${downloadPath}`);
    console.log(`SHA-256: ${artifact.sha256}`);
    console.log('Only this APK is served. Stop with Ctrl+C. Device installation is performed manually by the user.');
  });
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
