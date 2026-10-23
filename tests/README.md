# Testing Inlay

Use Node.js 20 or newer and Python 3.9 or newer. Python interoperability checks require `python3` on PATH; set `PYTHON` to another Python executable when needed. A missing Python runtime fails the checks rather than silently skipping them.

## Logic and Python interoperability

```sh
npm ci
npm test
npm run build
```

`npm test` uses the built-in Node test runner and includes:

- Binary merge/extract round trips, the original Python raw format, empty inputs, malformed and out-of-range gaps, Unicode filenames and long original names.
- SHA-256 known vectors and independent Node crypto comparisons, padding/block/chunk boundaries, bounded reads, progress and cancellation.
- Optional digest validation, legacy sidecars, uppercase digest normalization, and rejection of malformed supplied digests.
- Application event/state checks for verified, unverified, tampered and empty results; result reuse; stale async imports/hashes; cancellation; output naming and object URL invalidation.
- The actual `examples/inlay.py` CLI in both interoperability directions, including invalid gaps, size/hash mismatches, overwrite protection, symlinks, output/recipe collisions and explicit empty extraction.

Fixtures are public synthetic data described in [`fixtures/README.md`](../fixtures/README.md). Python tests create files in temporary directories and remove them after each test. Do not add private documents or production credentials as fixtures.

## Real browser regression tests

Install the supported browser engines, then run the suite against a fresh build:

```sh
npx playwright install --with-deps chromium firefox webkit
npm run build
npm run test:browser
```

The configuration in `tests/playwright.config.cjs` runs Chromium desktop, Chromium mobile at 390×844, Firefox desktop and WebKit desktop. Its test server starts automatically and serves the same static build at `/` and `/inlay/` with the example nginx CSP, including `connect-src 'none'`. The offline test separately opens `dist/index.html` with a file URL.

Coverage includes actual file inputs and downloaded bytes, hashed sidecars, successful and failed verification, legacy and malformed sidecars, empty extraction, cancellation and delayed imports, result reuse, demo data, download invalidation, mobile focus/visibility, and the absence of third-party requests, upload methods and WebSockets.

Useful targeted commands:

```sh
npm run test:browser -- --project=chromium-mobile
npm run test:browser -- --list
```

`--list` checks test discovery without launching browsers. It does not execute or validate browser behavior. Failure screenshots and traces are written to ignored test output directories; CI can retain them for diagnosis. Inspect them before sharing because future tests may introduce additional input data.

## Limits of these checks

VM event tests exercise application scripts with a small DOM substitute; they do not replace the real browser tests. The browser suite does not establish full screen-reader compliance, every operating system's download behavior, or multi-GB memory and storage limits.

SHA-256 verifies payload bytes against a sidecar. It does not encrypt content, authenticate a sender, or detect replacement of both payload and sidecar. Carrier-only changes do not affect a payload-only hash. Sidecars without digests remain usable with a visible unverified status.
