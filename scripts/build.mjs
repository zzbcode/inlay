import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}src`, `${root}dist`, { recursive: true });
await cp(`${root}LICENSE`, `${root}dist/LICENSE.txt`);
console.log("Built Inlay static site in dist/ (no runtime dependencies).");
