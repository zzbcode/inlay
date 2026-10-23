# Public synthetic fixtures

Tests create deterministic files in temporary directories; no user documents or private deployment data are used.

- Carrier: a public-domain 1×1 PNG represented in `synthetic.json` as base64, or deterministic byte patterns where image rendering is irrelevant.
- Payload: bytes `00 01 02 … ff` repeated with explicit lengths, including zero bytes and 1 MiB boundaries.
- SHA-256 vectors: empty input, ASCII `abc`, and one million ASCII `a` characters; expected hashes are literal known vectors in the integrity tests.
- `tests/interop.test.cjs` calls the actual `examples/inlay.py` CLI, compares with independently concatenated Node buffers, and checks both encode/decode directions. Python must be installed to pass the release checks; missing Python is a test failure, not a silent skip.

Runtime-generated artifacts are deleted after tests. Browser artifacts, screenshots, traces and downloads belong in ignored test output directories.
