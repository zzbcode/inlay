import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const options = { host: '127.0.0.1', port: '8765', base: '/' };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, '');
  if (!Object.hasOwn(options, key) || !args[i + 1]) {
    console.error('Usage: node scripts/preview.mjs [--host 127.0.0.1] [--port 8765] [--base /inlay/]');
    process.exit(1);
  }
  options[key] = args[i + 1];
}
const port = Number(options.port);
if (!Number.isInteger(port) || port < 0 || port > 65535 || !/^\/(?:[\w-]+\/)*$/.test(options.base)) {
  console.error('Use a port between 0 and 65535 and a base such as / or /inlay/.');
  process.exit(1);
}
const root = await realpath(fileURLToPath(new URL('../dist', import.meta.url))).catch(() => {
  console.error('dist/ does not exist. Run npm run build first.');
  process.exit(1);
});
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const end = (status, text) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); end(405, 'Method not allowed'); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://preview.invalid').pathname);
    if (options.base !== '/' && pathname === options.base.slice(0, -1)) {
      res.writeHead(301, { Location: options.base }); res.end(); return;
    }
    if (!pathname.startsWith(options.base) || pathname.includes('\0')) { end(404, 'Not found'); return; }
    const relative = pathname.slice(options.base.length);
    let candidate = resolve(root, relative || 'index.html');
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) { end(404, 'Not found'); return; }
    if ((await stat(candidate)).isDirectory()) candidate = resolve(candidate, 'index.html');
    const actual = await realpath(candidate);
    if (!actual.startsWith(`${root}${sep}`) || !(await stat(actual)).isFile()) { end(404, 'Not found'); return; }
    const metadata = await stat(actual);
    res.writeHead(200, { 'Content-Type': mime[extname(actual)] || 'application/octet-stream', 'Content-Length': metadata.size });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(actual).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    end(error instanceof URIError ? 400 : 404, error instanceof URIError ? 'Invalid URL' : 'Not found');
  }
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, options.host, () => {
  console.log(`Inlay preview: http://${options.host}:${server.address().port}${options.base}`);
  console.log('Static files only. Files selected in the browser remain local.');
});
