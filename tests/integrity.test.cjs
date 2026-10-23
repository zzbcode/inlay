"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { sha256Blob } = require("../src/integrity.js");
const core = require("../src/core.js");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const named = (bytes, name) => Object.assign(new Blob([bytes]), { name });

test("SHA-256 agrees with published empty, abc and million-a vectors", async () => {
  const cases = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "a".repeat(1000000),
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    ],
  ];
  for (const [input, expected] of cases)
    assert.equal(await sha256Blob(new Blob([input])), expected);
});

test("SHA-256 agrees with independent Node crypto at padding, block and 1 MiB boundaries", async () => {
  for (const length of [
    1,
    55,
    56,
    63,
    64,
    65,
    119,
    120,
    127,
    128,
    129,
    (1 << 20) - 1,
    1 << 20,
    (1 << 20) + 1,
  ]) {
    const bytes = Buffer.from(
      Array.from({ length }, (_, i) => (i * 37 + 19) & 255),
    );
    assert.equal(
      await sha256Blob(new Blob([bytes])),
      digest(bytes),
      `length ${length}`,
    );
  }
  const text = Buffer.from("夹层 Inlay\u0000😀\n原始字节", "utf8");
  assert.equal(
    await sha256Blob(new Blob([text]), { chunkSize: 7 }),
    digest(text),
  );
});

test("SHA-256 reads bounded chunks without loading the source Blob into a single JS buffer", async () => {
  const readSizes = [];
  const bytes = Buffer.alloc((1 << 20) * 2 + 17, 0xa7);
  class InstrumentedBlob extends Blob {
    async arrayBuffer() {
      throw new Error("whole source arrayBuffer must not be used");
    }
    slice(start, end, type) {
      const part = super.slice(start, end, type);
      const original = part.arrayBuffer.bind(part);
      part.arrayBuffer = async () => {
        readSizes.push(part.size);
        return original();
      };
      return part;
    }
  }
  assert.equal(await sha256Blob(new InstrumentedBlob([bytes])), digest(bytes));
  assert.ok(readSizes.length >= 3);
  assert.ok(readSizes.every((n) => n <= 1 << 20));
  assert.equal(
    readSizes.reduce((a, b) => a + b, 0),
    bytes.length,
  );
});

test("hash progress is bounded, monotonic and completes at one", async () => {
  const progress = [];
  await sha256Blob(new Blob([Buffer.alloc(129)]), {
    chunkSize: 17,
    onProgress: (n) => progress.push(n),
  });
  assert.ok(progress.length > 1);
  assert.ok(
    progress.every(
      (n, i) =>
        typeof n === "number" &&
        n >= 0 &&
        n <= 1 &&
        (i === 0 || n >= progress[i - 1]),
    ),
  );
  assert.equal(progress.at(-1), 1);
});

test("hash abort before work and from progress rejects with AbortError", async () => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(
    sha256Blob(new Blob(["abc"]), { signal: before.signal }),
    { name: "AbortError" },
  );
  const during = new AbortController();
  await assert.rejects(
    sha256Blob(new Blob([Buffer.alloc(100)]), {
      chunkSize: 10,
      signal: during.signal,
      onProgress: () => during.abort(),
    }),
    { name: "AbortError" },
  );
});

test("abort during an outstanding chunk read never resolves a digest or reports completion", async () => {
  const controller = new AbortController();
  let finish, started;
  const reading = new Promise((r) => {
    started = r;
  });
  class DelayedBlob extends Blob {
    slice(...args) {
      const part = super.slice(...args),
        original = part.arrayBuffer.bind(part);
      part.arrayBuffer = async () => {
        started();
        await new Promise((r) => {
          finish = r;
        });
        return original();
      };
      return part;
    }
  }
  const progress = [];
  const task = sha256Blob(new DelayedBlob(["abc"]), {
    signal: controller.signal,
    onProgress: (n) => progress.push(n),
  });
  await reading;
  controller.abort();
  finish();
  await assert.rejects(task, { name: "AbortError" });
  assert.ok(!progress.includes(1));
});

test("invalid chunk sizes fail immediately instead of risking an unbounded loop", async () => {
  for (const chunkSize of [
    0,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(sha256Blob(new Blob(["abc"]), { chunkSize }));
  }
});

test("recipe integrity is additive, strict and case normalized; legacy recipes remain unverified", () => {
  const carrier = named("abc", "载体.png"),
    payload = named("xyz", "隐藏.bin");
  const old = core.recipe(carrier, payload);
  assert.equal(core.readRecipe(JSON.stringify(old)).payloadSha256, undefined);
  assert.equal(
    core.readRecipe(JSON.stringify({ ...old, format: "file-fold" }))
      .payloadSha256,
    undefined,
  );
  const hash = digest(Buffer.from("xyz"));
  const recipe = core.recipe(carrier, payload, {
    payloadSha256: hash.toUpperCase(),
  });
  assert.equal(core.readRecipe(JSON.stringify(recipe)).payloadSha256, hash);
  for (const payloadSha256 of [
    null,
    3,
    "",
    "f".repeat(63),
    "f".repeat(65),
    "g".repeat(64),
    { algorithm: "SHA-256" },
  ]) {
    assert.throws(
      () => core.readRecipe(JSON.stringify({ ...old, payloadSha256 })),
      `reject ${JSON.stringify(payloadSha256)}`,
    );
  }
});

test("same-size payload tampering changes digest while raw carrier and gap remain unchanged", async () => {
  const carrier = named(Buffer.from([137, 80, 78, 71]), "carrier.png");
  const payload = named(Buffer.from([0, 1, 255, 128]), "payload.bin");
  const merged = core.merge(carrier, payload),
    bytes = new Uint8Array(await merged.blob.arrayBuffer());
  bytes[bytes.length - 1] ^= 1;
  const changed = new Blob([bytes]);
  assert.equal(changed.size, merged.blob.size);
  assert.equal(
    await sha256Blob(core.extract(merged.blob, merged.gap)),
    digest(Buffer.from([0, 1, 255, 128])),
  );
  assert.notEqual(
    await sha256Blob(core.extract(changed, merged.gap)),
    await sha256Blob(payload),
  );
  assert.deepEqual(
    Buffer.from(await changed.slice(0, merged.gap).arrayBuffer()),
    Buffer.from(await carrier.arrayBuffer()),
  );
});
