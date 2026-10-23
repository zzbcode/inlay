const { test } = require("node:test");
const assert = require("node:assert/strict");
const fold = require("../src/core.js");
test("binary payload round trip preserves carrier, null bytes and bytes across the original 1 MB chunk boundary", async () => {
  const carrierBytes = Uint8Array.from([137, 80, 78, 71, 0, 255, 10]);
  const payloadBytes = new Uint8Array((1 << 20) + 17);
  for (let i = 0; i < payloadBytes.length; i++) payloadBytes[i] = i % 256;
  const carrier = new Blob([carrierBytes], { type: "image/png" });
  const payload = new Blob([payloadBytes]);
  const merged = fold.merge(carrier, payload);
  assert.equal(merged.gap, carrierBytes.length);
  assert.equal(merged.blob.size, carrier.size + payload.size);
  assert.deepEqual(
    new Uint8Array(await merged.blob.slice(0, merged.gap).arrayBuffer()),
    carrierBytes,
  );
  assert.deepEqual(
    new Uint8Array(
      await fold.extract(merged.blob, String(merged.gap)).arrayBuffer(),
    ),
    payloadBytes,
  );
});
test("Python style raw concatenation and supplied gap are compatible", async () => {
  const original = new Uint8Array(435833).fill(42);
  const combined = new Blob([original, Uint8Array.from([0, 10, 255, 128, 1])]);
  assert.deepEqual(
    new Uint8Array(await fold.extract(combined, "435833").arrayBuffer()),
    Uint8Array.from([0, 10, 255, 128, 1]),
  );
});
test("rejects malformed and out of range offsets; accepts zero and end offsets", () => {
  for (const invalid of [
    "",
    " ",
    "-1",
    "1.2",
    "1e2",
    "0x10",
    "1,000",
    "9007199254740992",
    "11",
    "Infinity",
  ])
    assert.throws(() => fold.parseGap(invalid, 10));
  assert.equal(fold.parseGap(" 0005 ", 10), 5);
  assert.equal(fold.extract(new Blob(["hello"]), 0).size, 5);
  assert.equal(fold.extract(new Blob(["hello"]), 5).size, 0);
  assert.throws(() => fold.merge(null, new Blob()));
  assert.throws(() => fold.extract(null, 0));
});
test("empty files work without silently adding metadata bytes", () => {
  assert.equal(fold.merge(new Blob(), new Blob()).blob.size, 0);
  assert.equal(fold.merge(new Blob(["a"]), new Blob()).blob.size, 1);
});
test("recipe stores original Unicode name and validates imported fields", () => {
  const carrier = Object.assign(new Blob(["abc"]), { name: "图片.png" });
  const payload = Object.assign(new Blob(["秘密"]), { name: "报告.zip" });
  const recipe = fold.recipe(carrier, payload);
  assert.deepEqual(fold.readRecipe(JSON.stringify(recipe)), recipe);
  for (const input of [
    "null",
    "[]",
    "{}",
    "not json",
    JSON.stringify({ ...recipe, gap: -1 }),
    JSON.stringify({ ...recipe, combinedSize: 1 }),
    JSON.stringify({ ...recipe, payloadSize: 0.5 }),
  ])
    assert.throws(() => fold.readRecipe(input));
  assert.equal(fold.filename("../报告.zip", "x"), ".._报告.zip");
  assert.equal(fold.filename(" ", "还原文件.bin"), "还原文件.bin");
});
