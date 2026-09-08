import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifactId = process.argv[2];
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(artifactId ?? '')) throw new Error('Supply a new artifact identifier.');
const output = path.join(root, 'outputs/android/play', artifactId);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const preview = path.join(root, 'experiments/android-preview');
const android = path.join(output, 'android');
await mkdir(android);
for (const file of ['gradlew', 'gradlew.bat', 'gradle', 'gradle.properties', 'settings.gradle']) {
  await cp(path.join(preview, file), path.join(android, file), { recursive: true });
}
await cp(path.join(preview, 'app/src/main'), path.join(android, 'app/src/main'), { recursive: true });
await cp(path.join(preview, 'app/src/test'), path.join(android, 'app/src/test'), { recursive: true });
await cp(path.join(root, 'scripts/android/PlayEntryActivity.java'), path.join(android, 'app/src/main/java/app/kampira/preview/PlayEntryActivity.java'));

async function replaceOnce(relative, before, after) {
  const filename = path.join(android, relative);
  const text = (await readFile(filename, 'utf8')).replaceAll('\r\n', '\n');
  if (text.split(before).length !== 2) throw new Error(`Expected exactly one known marker in ${relative}`);
  await writeFile(filename, text.replace(before, after));
}
// The preview remains debug-only. Only this isolated package can produce a Play build.
await replaceOnce('app/src/main/java/app/kampira/preview/MainActivity.java',
  'if (!BuildConfig.DEBUG || BuildConfig.RELEASE_READY) { finish(); return; }',
  'if (BuildConfig.DEBUG || !"https://kampira.net".equals(BuildConfig.PREVIEW_ORIGIN)) { finish(); return; }');
await replaceOnce('app/src/main/AndroidManifest.xml', 'android:label="Kampira Test"', 'android:label="Kampira"');
await replaceOnce('app/src/main/AndroidManifest.xml', 'android:name=".MainActivity" android:exported="true"', 'android:name=".MainActivity" android:exported="false"');
await replaceOnce('app/src/main/AndroidManifest.xml', '<intent-filter>\n                <action android:name="android.intent.action.MAIN" />', '</activity>\n        <activity android:name=".PlayEntryActivity" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />');
await replaceOnce('app/src/main/res/values/strings.xml',
  'Tabletin ve bilgisayarın aynı Wi-Fi ağında, bilgisayardaki önizlemenin açık olduğundan emin ol. Hazır olduğunda tekrar deneyebilirsin.',
  'İnternet bağlantını kontrol et. Bağlantı düzeldiğinde yeniden deneyebilirsin.');
await writeFile(path.join(android, 'build.gradle'), "plugins { id 'com.android.application' version '8.13.2' apply false }\n");
await cp(path.join(root, 'scripts/android/play-app.gradle'), path.join(android, 'app/build.gradle'));
await mkdir(path.join(android, 'app/src/main/res/mipmap-anydpi-v26'), { recursive: true });
await writeFile(path.join(android, 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), '<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@android:color/white"/><foreground android:drawable="@drawable/kampira_icon"/></adaptive-icon>\n');
await mkdir(path.join(android, 'app/src/main/res/mipmap-nodpi'), { recursive: true });
await cp(path.join(root, 'public/app-icons/kampira-512.png'), path.join(android, 'app/src/main/res/mipmap-nodpi/ic_launcher.png'));
await replaceOnce('app/src/main/AndroidManifest.xml', 'android:icon="@drawable/kampira_icon"', 'android:icon="@mipmap/ic_launcher"');
const sources = [];
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.isFile()) sources.push({ file: path.relative(android, file).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
    else throw new Error('Unexpected non-regular source entry');
  }
}
await inventory(android);
sources.sort((a, b) => a.file.localeCompare(b.file));
await writeFile(path.join(output, 'source-receipt.json'), JSON.stringify({
  preparedAt: new Date().toISOString(), artifactId, packageId: 'app.kampira.mobile', origin: 'https://kampira.net',
  versionName: '1.8.1', versionCode: 3, compileSdk: 36, targetSdk: 36, minSdk: 23,
  sourceFingerprint: createHash('sha256').update(JSON.stringify(sources)).digest('hex'), sources,
  built: false, signed: false, uploaded: false, published: false,
}, null, 2) + '\n');
console.log(JSON.stringify({ output, android, packageId: 'app.kampira.mobile', origin: 'https://kampira.net' }));
