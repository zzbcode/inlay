"use strict";
// Test-only HTTP fixture. It serves the exact static build at / and /inlay/.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "../../dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const port = Number(process.env.INLAY_TEST_PORT || 4178);
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
const server = http.createServer(async (request, response) => {
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  try {
    let pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname,
    );
    if (pathname === "/inlay") {
      response.writeHead(308, { Location: "/inlay/" });
      response.end();
      return;
    }
    if (pathname.startsWith("/inlay/"))
      pathname = pathname.slice("/inlay".length);
    if (pathname.endsWith("/")) pathname += "index.html";
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const bytes = await fs.readFile(target);
    response.writeHead(200, {
      "Content-Type": types[path.extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(bytes);
  } catch (_) {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Inlay browser test server: http://127.0.0.1:${port}\n`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
