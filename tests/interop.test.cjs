"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const core = require("../src/core.js");
const fixture = require("../fixtures/synthetic.json");
const cli = path.resolve(__dirname, "../examples/inlay.py");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function setup(
  t,
  payload = Buffer.from(
    Array.from({ length: fixture.payloadLength }, (_, i) => i % 256),
  ),
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "inlay-synthetic-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const carrier = Buffer.from(fixture.carrierBase64, "base64");
  const file = (name) => path.join(directory, name);
  fs.writeFileSync(file(fixture.carrierName), carrier);
  fs.writeFileSync(file(fixture.payloadName), payload);
  const run = (...args) =>
    spawnSync(process.env.PYTHON || "python3", [cli, ...args], {
      encoding: "utf8",
    });
  const success = (...args) => {
    const result = run(...args);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result;
  };
  const reject = (...args) => {
    const result = run(...args);
    assert.ifError(result.error);
    assert.notEqual(
      result.status,
      0,
      "CLI unexpectedly accepted invalid input",
    );
    return result;
  };
  return {
    directory,
    carrier,
    payload,
    file,
    run,
    success,
    reject,
    carrierPath: file(fixture.carrierName),
    payloadPath: file(fixture.payloadName),
  };
}

test("Python encode emits raw bytes, a Node-readable recipe and payload-only SHA-256", async (t) => {
  const h = setup(t),
    output = h.file("python-output.png"),
    recipePath = h.file("python.inlay.json");
  h.success(
    "encode",
    h.carrierPath,
    h.payloadPath,
    output,
    "--recipe",
    recipePath,
  );
  const combined = fs.readFileSync(output),
    recipe = core.readRecipe(fs.readFileSync(recipePath, "utf8"));
  assert.deepEqual(combined, Buffer.concat([h.carrier, h.payload]));
  assert.equal(recipe.gap, h.carrier.length);
  assert.equal(recipe.payloadSha256, hash(h.payload));
  assert.equal(recipe.payloadName, fixture.payloadName);
  assert.deepEqual(
    Buffer.from(
      await core.extract(new Blob([combined]), recipe.gap).arrayBuffer(),
    ),
    h.payload,
  );
});

test("Node merge and sidecar decode byte-for-byte through the real Python CLI", async (t) => {
  const h = setup(t),
    carrier = Object.assign(new Blob([h.carrier]), {
      name: fixture.carrierName,
    }),
    payload = Object.assign(new Blob([h.payload]), {
      name: fixture.payloadName,
    });
  const merged = core.merge(carrier, payload),
    recipe = core.recipe(carrier, payload, { payloadSha256: hash(h.payload) });
  assert.equal(recipe.payloadSha256, hash(h.payload));
  fs.writeFileSync(
    h.file("node-output.png"),
    Buffer.from(await merged.blob.arrayBuffer()),
  );
  fs.writeFileSync(h.file("node.json"), JSON.stringify(recipe));
  h.success(
    "decode",
    h.file("node-output.png"),
    h.file("restored.bin"),
    "--recipe",
    h.file("node.json"),
  );
  assert.deepEqual(fs.readFileSync(h.file("restored.bin")), h.payload);
  h.success(
    "decode",
    h.file("node-output.png"),
    h.file("manual.bin"),
    "--gap",
    String(merged.gap),
  );
  assert.deepEqual(fs.readFileSync(h.file("manual.bin")), h.payload);
});

test("Python accepts legacy unverified recipes and normalizes uppercase integrity values", (t) => {
  const h = setup(t, Buffer.from([0, 255, 128, 3])),
    combined = h.file("combined.bin");
  fs.writeFileSync(combined, Buffer.concat([h.carrier, h.payload]));
  const base = {
    format: "file-fold",
    version: 1,
    gap: h.carrier.length,
    payloadName: "restored.bin",
    payloadSize: h.payload.length,
    combinedSize: h.carrier.length + h.payload.length,
  };
  fs.writeFileSync(h.file("legacy.json"), JSON.stringify(base));
  h.success(
    "decode",
    combined,
    h.file("legacy.bin"),
    "--recipe",
    h.file("legacy.json"),
  );
  assert.deepEqual(fs.readFileSync(h.file("legacy.bin")), h.payload);
  fs.writeFileSync(
    h.file("uppercase.json"),
    JSON.stringify({
      ...base,
      format: "inlay",
      payloadSha256: hash(h.payload).toUpperCase(),
    }),
  );
  h.success(
    "decode",
    combined,
    h.file("uppercase.bin"),
    "--recipe",
    h.file("uppercase.json"),
  );
  assert.deepEqual(fs.readFileSync(h.file("uppercase.bin")), h.payload);
});

test("Python rejects same-size tampering and malformed digest without publishing output", (t) => {
  const h = setup(t, Buffer.from("PAYLOAD")),
    combined = h.file("combined.bin");
  h.success(
    "encode",
    h.carrierPath,
    h.payloadPath,
    combined,
    "--recipe",
    h.file("recipe.json"),
  );
  const modified = fs.readFileSync(combined);
  modified[modified.length - 1] ^= 1;
  fs.writeFileSync(combined, modified);
  h.reject(
    "decode",
    combined,
    h.file("tampered.bin"),
    "--recipe",
    h.file("recipe.json"),
  );
  assert.equal(fs.existsSync(h.file("tampered.bin")), false);
  const recipe = JSON.parse(fs.readFileSync(h.file("recipe.json"), "utf8"));
  for (const payloadSha256 of [null, "", "z".repeat(64), "a".repeat(63)]) {
    fs.writeFileSync(
      h.file("bad.json"),
      JSON.stringify({ ...recipe, payloadSha256 }),
    );
    h.reject(
      "decode",
      combined,
      h.file("bad.bin"),
      "--recipe",
      h.file("bad.json"),
    );
    assert.equal(fs.existsSync(h.file("bad.bin")), false);
  }
});

test("Python rejects malformed or out-of-range gaps without touching existing files", (t) => {
  const h = setup(t, Buffer.from("PAYLOAD")),
    combined = h.file("combined.bin"),
    output = h.file("keep.bin");
  fs.writeFileSync(combined, Buffer.concat([h.carrier, h.payload]));
  fs.writeFileSync(output, "KEEP");
  for (const gap of ["-1", "1.5", "1e2", "0x10", "9007199254740992"]) {
    h.reject("decode", combined, output, "--gap", gap, "--force");
    assert.equal(fs.readFileSync(output, "utf8"), "KEEP");
  }
  fs.writeFileSync(
    h.file("wrong-size.json"),
    JSON.stringify({
      format: "inlay",
      version: 1,
      gap: 1,
      payloadName: "x",
      payloadSize: 1,
      combinedSize: 2,
    }),
  );
  h.reject(
    "decode",
    combined,
    output,
    "--recipe",
    h.file("wrong-size.json"),
    "--force",
  );
  assert.equal(fs.readFileSync(output, "utf8"), "KEEP");
});

test("Python prevents input/output collisions and default overwrites; force only replaces safe destinations", (t) => {
  const h = setup(t, Buffer.from("PAYLOAD")),
    combined = h.file("combined.bin"),
    output = h.file("keep.bin");
  h.success("encode", h.carrierPath, h.payloadPath, combined);
  const original = fs.readFileSync(combined);
  fs.writeFileSync(output, "KEEP");
  h.reject(
    "decode",
    combined,
    combined,
    "--gap",
    String(h.carrier.length),
    "--force",
  );
  assert.deepEqual(fs.readFileSync(combined), original);
  const alias = h.file("combined-symlink.bin");
  fs.symlinkSync(combined, alias);
  h.reject(
    "decode",
    combined,
    alias,
    "--gap",
    String(h.carrier.length),
    "--force",
  );
  assert.equal(fs.lstatSync(alias).isSymbolicLink(), true);
  assert.deepEqual(fs.readFileSync(combined), original);
  const collision = h.file("output-and-recipe.bin");
  h.reject(
    "encode",
    h.carrierPath,
    h.payloadPath,
    collision,
    "--recipe",
    collision,
    "--force",
  );
  assert.equal(fs.existsSync(collision), false);
  h.reject("encode", h.carrierPath, h.payloadPath, h.carrierPath, "--force");
  assert.deepEqual(fs.readFileSync(h.carrierPath), h.carrier);
  h.reject("decode", combined, output, "--gap", String(h.carrier.length));
  assert.equal(fs.readFileSync(output, "utf8"), "KEEP");
  h.success(
    "decode",
    combined,
    output,
    "--gap",
    String(h.carrier.length),
    "--force",
  );
  assert.deepEqual(fs.readFileSync(output), h.payload);
});

test("Python distinguishes manual EOF mistakes from an explicitly declared empty payload", (t) => {
  const h = setup(t, Buffer.alloc(0)),
    combined = h.file("empty-combined.png");
  h.success(
    "encode",
    h.carrierPath,
    h.payloadPath,
    combined,
    "--recipe",
    h.file("empty.json"),
  );
  assert.deepEqual(fs.readFileSync(combined), h.carrier);
  h.reject(
    "decode",
    combined,
    h.file("manual-empty.bin"),
    "--gap",
    String(h.carrier.length),
  );
  assert.equal(fs.existsSync(h.file("manual-empty.bin")), false);
  h.success(
    "decode",
    combined,
    h.file("explicit-empty.bin"),
    "--gap",
    String(h.carrier.length),
    "--allow-empty",
  );
  assert.equal(fs.statSync(h.file("explicit-empty.bin")).size, 0);
  h.success(
    "decode",
    combined,
    h.file("recipe-empty.bin"),
    "--recipe",
    h.file("empty.json"),
  );
  assert.equal(fs.statSync(h.file("recipe-empty.bin")).size, 0);
});
