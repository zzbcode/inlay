import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ZIP method 0 (store), sorted names, fixed UTC DOS timestamp and no platform attributes.
// A release is byte-reproducible for the same input files on supported Node platforms.
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--version' || args[1] !== pkg.version)) {
  throw new Error('Usage: node scripts/release.mjs [--version <package.json version>]');
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error('Invalid release version');
const sourceFiles = [
  '.gitignore', '.editorconfig', '.gitattributes', '.prettierignore', '.prettierrc', '.prettierrc.json',
  'package.json', 'package-lock.json', 'README.md', 'README.en.md',
  'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md',
];
const sourceDirectories = ['src', 'scripts', 'tests', 'fixtures', 'examples', '.github'];
const excluded = /(?:^|\/)(?:node_modules|\.git|\.openai|__pycache__|test-results|playwright-report|artifacts)(?:\/|$)|(?:\.DS_Store|\.pyc)$/;
async function list(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (excluded.test(relative)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in release: ${relative}`);
    if (entry.isDirectory()) files.push(...await list(resolve(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}
const exists = async (path) => stat(path).then(() => true, () => false);
for (const required of ['package.json', 'package-lock.json', 'README.md', 'README.en.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md']) {
  if (!await exists(resolve(root, required))) throw new Error(`Missing required source file: ${required}`);
}
const source = [];
for (const path of sourceFiles) if (await exists(resolve(root, path))) source.push(path);
for (const directory of sourceDirectories) {
  if (await exists(resolve(root, directory))) source.push(...(await list(resolve(root, directory), directory)));
}
for (const path of await list(resolve(root, 'docs'), 'docs')) {
  if (/^docs\/[^/]+\.(?:md|png|svg)$/.test(path)) source.push(path);
}
for (const path of ['deploy/compose.yml', 'deploy/nginx.conf']) {
  if (await exists(resolve(root, path))) source.push(path);
}
if (await exists(resolve(root, 'playwright.config.cjs'))) source.push('playwright.config.cjs');
const offline = await list(resolve(root, 'dist'));
for (const required of ['index.html', 'app.js', 'core.js', 'integrity.js', 'vendor/sha256.js', 'vendor/LICENSE.js-sha256.txt', 'LICENSE.txt']) {
  if (!offline.includes(required)) throw new Error(`Missing built file ${required}; run npm run build before packaging`);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
async function zip(paths, base, prefix) {
  const chunks = [], directory = [];
  let offset = 0;
  const entries = [...new Set(paths)].sort();
  for (const relative of entries) {
    const name = Buffer.from(`${prefix}/${relative}`, 'utf8');
    const data = await readFile(resolve(base, relative));
    if (data.length >= 0xffffffff || offset + data.length >= 0xffffffff || name.length > 65535) throw new Error('ZIP32 limit exceeded');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(0x0021, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    chunks.push(header, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); directory.push(central, name);
    offset += header.length + name.length + data.length;
  }
  if (entries.length > 65535) throw new Error('Too many ZIP entries');
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}
const artifacts = resolve(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const checksums = [];
for (const [kind, paths, base] of [['offline', offline, resolve(root, 'dist')], ['source', source, root]]) {
  const name = `inlay-${pkg.version}-${kind}.zip`;
  const bytes = await zip(paths, base, `inlay-${pkg.version}-${kind}`);
  await writeFile(resolve(artifacts, name), bytes);
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  console.log(`${name}: ${paths.length} files, ${bytes.length} bytes`);
}
await writeFile(resolve(artifacts, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
console.log('Release archives and SHA256SUMS written to artifacts/.');
