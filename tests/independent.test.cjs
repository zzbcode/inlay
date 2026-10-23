const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { File } = require("node:buffer");
const core = require("../src/core.js");

function ui(hash) {
  const elements = new Map();
  class Element {
    constructor() {
      this.value = "";
      this.textContent = "";
      this.files = [];
      this.children = new Map();
      this.events = new Map();
      this.style = {};
      this.dataset = {};
      this.checked = true;
      this.hidden = true;
      this.disabled = false;
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    addEventListener(type, cb) {
      this.events.set(type, cb);
    }
    querySelector(selector) {
      if (!this.children.has(selector))
        this.children.set(selector, new Element());
      return this.children.get(selector);
    }
    setAttribute(name, value) {
      this[name] = value;
    }
    removeAttribute(name) {
      delete this[name];
    }
    focus() {
      document.activeElement = this;
    }
    select() {}
    scrollIntoView() {
      this.scrolled = true;
    }
    fire(type) {
      return this.events.get(type)?.({ preventDefault() {}, key: "" });
    }
  }
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const made = [],
    revoked = [];
  const document = {
    getElementById: get,
    querySelector: get,
    activeElement: null,
  };
  const hasher =
    hash ||
    (async (blob, options = {}) => {
      if (options.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
      options.onProgress?.(1);
      return createHash("sha256")
        .update(Buffer.from(await blob.arrayBuffer()))
        .digest("hex");
    });
  const context = vm.createContext({
    document,
    window: new Element(),
    InlayCore: core,
    InlayIntegrity: { sha256Blob: hasher },
    Blob,
    File,
    AbortController,
    DOMException,
    requestAnimationFrame(cb) {
      cb();
    },
    URL: {
      createObjectURL(blob) {
        made.push(blob);
        return `blob:test-${made.length}`;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    navigator: {},
  });
  vm.runInContext(
    fs.readFileSync(require.resolve("../src/app.js"), "utf8"),
    context,
  );
  const choose = (key, blob) => {
    get(key).files = [blob];
    return get(key).fire("change");
  };
  const submit = () => get("operation-form").fire("submit");
  const named = (data, name) => Object.assign(new Blob([data]), { name });
  return { get, choose, submit, named, made, revoked, document };
}

test("independent: exhaustive byte values and empty files preserve raw concatenation", async () => {
  for (const [a, b] of [
    [
      Buffer.from([0, 255, 128]),
      Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    ],
    [Buffer.alloc(0), Buffer.from([1])],
    [Buffer.from([1]), Buffer.alloc(0)],
    [Buffer.alloc(0), Buffer.alloc(0)],
  ]) {
    const { blob, gap } = core.merge(new Blob([a]), new Blob([b]));
    assert.deepEqual(
      Buffer.from(await blob.arrayBuffer()),
      Buffer.concat([a, b]),
    );
    assert.equal(gap, a.length);
    assert.deepEqual(
      Buffer.from(await core.extract(blob, gap).arrayBuffer()),
      b,
    );
  }
});

test("independent: rejects malformed offsets without truncation or Number coercion surprises", () => {
  for (const input of [
    null,
    undefined,
    true,
    NaN,
    Infinity,
    -1,
    1.5,
    "-0",
    "+1",
    "1e0",
    "0x01",
    "1\n2",
    "９",
    "9007199254740992",
    4,
  ])
    assert.throws(() => core.extract(new Blob(["abc"]), input));
  assert.equal(core.extract(new Blob(["abc"]), "0000").size, 3);
  assert.equal(core.extract(new Blob(["abc"]), 3).size, 0);
});

test("independent: legacy file-fold recipe roundtrip preserves Unicode name and payload", async () => {
  const c = Object.assign(new Blob(["png"]), { name: "载体.png" }),
    p = Object.assign(new Blob([Buffer.from([0, 255, 9])]), {
      name: "隐藏数据.bin",
    });
  const old = { ...core.recipe(c, p), format: "file-fold" };
  const parsed = core.readRecipe(JSON.stringify(old));
  assert.equal(parsed.payloadName, p.name);
  assert.deepEqual(
    Buffer.from(
      await core.extract(core.merge(c, p).blob, parsed.gap).arrayBuffer(),
    ),
    Buffer.from([0, 255, 9]),
  );
});

test("independent: generated recipes remain importable for valid long original filenames", () => {
  const carrier = Object.assign(new Blob(["a"]), { name: "a.png" });
  for (const length of [240, 241, 255]) {
    const payload = Object.assign(new Blob(["b"]), {
      name: "x".repeat(length),
    });
    assert.equal(
      core.readRecipe(JSON.stringify(core.recipe(carrier, payload)))
        .payloadName,
      payload.name,
    );
  }
});

test("independent UI: merge naming preserves carrier extension; downloads contain exact bytes", async () => {
  const h = ui();
  h.choose("carrier", h.named("IMG", "图片.png"));
  h.choose("payload", h.named("PAYLOAD", "原文.txt"));
  h.get("output-name").value = "../自定义";
  await h.submit();
  assert.equal(h.get("download-result").download, ".._自定义.png");
  assert.deepEqual(
    Buffer.from(await h.made[0].arrayBuffer()),
    Buffer.from("IMGPAYLOAD"),
  );
  const recipe = JSON.parse(await h.made[1].text());
  assert.equal(recipe.gap, 3);
  assert.equal(recipe.payloadName, "原文.txt");
});

test("independent UI: output changes and reset revoke both result URLs and clear links", async () => {
  const h = ui();
  h.choose("carrier", h.named("A", "a.png"));
  h.choose("payload", h.named("B", "b.txt"));
  await h.submit();
  assert.equal(h.made.length, 2);
  h.get("output-name").fire("input");
  assert.equal(h.revoked.length, 2);
  assert.equal(h.get("download-result").href, undefined);
  assert.equal(h.get("result").hidden, true);
  await h.submit();
  h.get("reset").fire("click");
  assert.equal(h.revoked.length, 4);
  assert.equal(h.get("gap").value, "");
  assert.equal(h.get("carrier").value, "");
});

test("independent UI: stale async import cannot restore state after reset or mode switch", async () => {
  for (const action of ["reset", "merge-tab"]) {
    const h = ui();
    h.get("extract-tab").fire("click");
    let finish;
    const pending = h.choose("recipe-input", {
      size: 20,
      text: () =>
        new Promise((r) => {
          finish = r;
        }),
    });
    h.get(action).fire("click");
    finish(
      JSON.stringify({
        format: "inlay",
        version: 1,
        gap: 3,
        payloadName: "late.bin",
        payloadSize: 2,
        combinedSize: 5,
      }),
    );
    await pending;
    assert.notEqual(h.get("output-name").value, "late.bin");
    assert.equal(h.get("gap").value, "");
  }
});

test("independent UI: submitting while import is pending keeps displayed parameters aligned with download", async () => {
  const h = ui();
  h.get("extract-tab").fire("click");
  h.choose("combined", h.named("ABCDE", "combined.png"));
  h.get("gap").value = "1";
  h.get("gap").fire("input");
  h.get("output-name").value = "manual.bin";
  let finish;
  const pending = h.choose("recipe-input", {
    size: 20,
    text: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  await h.submit();
  finish(
    JSON.stringify({
      format: "inlay",
      version: 1,
      gap: 3,
      payloadName: "late.bin",
      payloadSize: 2,
      combinedSize: 5,
    }),
  );
  await pending;
  assert.equal(h.get("gap").value, "1");
  assert.equal(h.get("output-name").value, "manual.bin");
  assert.equal(h.get("download-result").download, "manual.bin");
  assert.equal(await h.made[0].text(), "BCDE");
});

test("independent UI: recipe size mismatch blocks extraction; manually editing gap explicitly clears recipe", async () => {
  const h = ui();
  h.get("extract-tab").fire("click");
  h.choose("combined", h.named("ABCDE", "combined.png"));
  await h.choose("recipe-input", {
    size: 100,
    text: async () =>
      JSON.stringify({
        format: "file-fold",
        version: 1,
        gap: 2,
        payloadName: "legacy.bin",
        payloadSize: 2,
        combinedSize: 4,
      }),
  });
  await h.submit();
  assert.equal(h.made.length, 0);
  assert.match(h.get("error").textContent, /大小.*不一致/);
  h.get("gap").fire("input");
  await h.submit();
  assert.equal(await h.made[0].text(), "CDE");
});

test("independent UI: verified extraction succeeds; same-size tampering blocks every download", async () => {
  const h = ui();
  h.get("extract-tab").fire("click");
  const original = "PAYLOAD",
    hash = createHash("sha256").update(original).digest("hex");
  const recipe = {
    format: "inlay",
    version: 1,
    gap: 3,
    payloadName: "original.bin",
    payloadSize: 7,
    combinedSize: 10,
    payloadSha256: hash,
  };
  h.choose("combined", h.named("IMGPAYLOAD", "combined.png"));
  await h.choose("recipe-input", {
    size: 100,
    text: async () => JSON.stringify(recipe),
  });
  await h.submit();
  assert.match(h.get("result-verification").textContent, /SHA-256.*校验通过/);
  assert.equal(await h.made[0].text(), original);
  h.choose("combined", h.named("IMGPAYLOAE", "tampered.png"));
  await h.submit();
  assert.match(h.get("error").textContent, /SHA-256.*不一致/);
  assert.equal(h.get("download-result").href, undefined);
  assert.equal(h.get("result").hidden, true);
});

test("independent UI: legacy and manual extraction clearly report unverified content", async () => {
  for (const format of [null, "inlay", "file-fold"]) {
    const h = ui();
    h.get("extract-tab").fire("click");
    h.choose("combined", h.named("ABCD", "combined.png"));
    if (format)
      await h.choose("recipe-input", {
        size: 100,
        text: async () =>
          JSON.stringify({
            format,
            version: 1,
            gap: 2,
            payloadName: "old.bin",
            payloadSize: 2,
            combinedSize: 4,
          }),
      });
    else {
      h.get("gap").value = "2";
      h.get("gap").fire("input");
    }
    await h.submit();
    assert.equal(await h.made[0].text(), "CD");
    assert.match(h.get("result-verification").textContent, /未校验/);
  }
});

test("independent UI: manual EOF extraction warns without a result; declared empty recipe is allowed", async () => {
  const h = ui();
  h.get("extract-tab").fire("click");
  h.choose("combined", h.named("ABC", "original.png"));
  h.get("gap").value = "3";
  h.get("gap").fire("input");
  await h.submit();
  assert.equal(h.made.length, 0);
  assert.equal(h.get("result").hidden, true);
  assert.match(h.get("error").textContent, /未发现|没有|空/);
  await h.choose("recipe-input", {
    size: 100,
    text: async () =>
      JSON.stringify({
        format: "inlay",
        version: 1,
        gap: 3,
        payloadName: "empty.bin",
        payloadSize: 0,
        combinedSize: 3,
        payloadSha256: createHash("sha256").update("").digest("hex"),
      }),
  });
  await h.submit();
  assert.equal(h.made[0].size, 0);
  assert.match(h.get("result-verification").textContent, /SHA-256.*校验通过/);
});

test("independent UI: merge without sidecar skips hashing and shows a clearly unverified result", async () => {
  const h = ui(async () => {
    throw new Error("hash must not run when unchecked");
  });
  h.choose("carrier", h.named("IMG", "carrier.png"));
  h.choose("payload", h.named("PAYLOAD", "payload.bin"));
  h.get("include-recipe").checked = false;
  await h.submit();
  assert.equal(h.made.length, 1);
  assert.equal(await h.made[0].text(), "IMGPAYLOAD");
  assert.equal(h.get("download-recipe").hidden, true);
});

test("independent UI: merge result can be reused for a verified local extraction with original filename", async () => {
  const h = ui();
  h.choose("carrier", h.named("IMG", "carrier.png"));
  h.choose("payload", h.named("PAYLOAD", "原始.bin"));
  await h.submit();
  assert.equal(h.get("reuse-result").hidden, false);
  h.get("reuse-result").fire("click");
  assert.equal(h.get("gap").value, "3");
  assert.equal(h.get("output-name").value, "原始.bin");
  await h.submit();
  assert.equal(await h.made.at(-1).text(), "PAYLOAD");
  assert.equal(h.get("download-result").download, "原始.bin");
  assert.match(h.get("result-verification").textContent, /SHA-256.*校验通过/);
});

test("independent UI: imported and reused recipes preserve valid 241-255 character original names on extraction", async () => {
  for (const length of [241, 255]) {
    const name = "x".repeat(length - 4) + ".bin";
    const h = ui();
    h.choose("carrier", h.named("IMG", "carrier.png"));
    h.choose("payload", h.named("PAYLOAD", name));
    await h.submit();
    const recipe = JSON.parse(await h.made[1].text());
    h.get("reuse-result").fire("click");
    await h.submit();
    assert.equal(h.get("download-result").download, name);
    assert.equal(await h.made.at(-1).text(), "PAYLOAD");
    await h.choose("recipe-input", {
      size: JSON.stringify(recipe).length,
      text: async () => JSON.stringify(recipe),
    });
    await h.submit();
    assert.equal(h.get("download-result").download, name);
    assert.equal(await h.made.at(-1).text(), "PAYLOAD");
    assert.match(h.get("result-verification").textContent, /SHA-256.*校验通过/);
  }
});

test("independent UI: generated results receive keyboard focus and scroll discovery", async () => {
  const h = ui();
  h.choose("carrier", h.named("IMG", "carrier.png"));
  h.choose("payload", h.named("PAYLOAD", "payload.bin"));
  await h.submit();
  assert.equal(h.document.activeElement, h.get("result-title"));
  assert.ok(h.get("result").scrolled || h.get("result-title").scrolled);
});

test("independent UI: hashing cancellation and state changes suppress stale completion and release busy state", async () => {
  for (const action of [
    "cancel",
    "reset",
    "extract-tab",
    "output-name",
    "payload",
  ]) {
    let finish, progress, signal;
    const h = ui((_blob, options) => {
      progress = options.onProgress;
      signal = options.signal;
      return new Promise((r) => {
        finish = r;
      });
    });
    h.choose("carrier", h.named("IMG", "carrier.png"));
    h.choose("payload", h.named("PAYLOAD", "payload.bin"));
    const pending = h.submit();
    assert.equal(h.get("processing").hidden, false);
    if (action === "payload") h.choose("payload", h.named("NEW", "new.bin"));
    else h.get(action).fire(action === "output-name" ? "input" : "click");
    assert.equal(signal.aborted, true, action);
    progress?.(0.75);
    finish("a".repeat(64));
    await pending;
    assert.equal(h.made.length, 0, action);
    assert.equal(h.get("result").hidden, true, action);
    assert.equal(h.get("processing").hidden, true, action);
  }
});

test("independent UI: a newer recipe import wins even when the old import finishes last", async () => {
  const h = ui();
  h.get("extract-tab").fire("click");
  let finish;
  const old = h.choose("recipe-input", {
    size: 100,
    text: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  const rec = (gap, name) =>
    JSON.stringify({
      format: "inlay",
      version: 1,
      gap,
      payloadName: name,
      payloadSize: 2,
      combinedSize: gap + 2,
    });
  await h.choose("recipe-input", {
    size: 100,
    text: async () => rec(4, "new.bin"),
  });
  finish(rec(3, "old.bin"));
  await old;
  assert.equal(h.get("gap").value, "4");
  assert.equal(h.get("output-name").value, "new.bin");
});

test("independent UI: a newer operation wins when an older hash completes after cancellation", async () => {
  const calls = [];
  const h = ui(
    (_blob, options) =>
      new Promise((resolve) => calls.push({ resolve, options })),
  );
  h.choose("carrier", h.named("IMG", "carrier.png"));
  h.choose("payload", h.named("OLD", "old.bin"));
  const first = h.submit();
  h.get("cancel").fire("click");
  h.choose("payload", h.named("NEW", "new.bin"));
  const second = h.submit();
  assert.equal(calls.length, 2);
  calls[1].resolve("b".repeat(64));
  await second;
  const href = h.get("download-result").href;
  calls[0].options.onProgress?.(0.9);
  calls[0].resolve("a".repeat(64));
  await first;
  assert.equal(h.get("download-result").href, href);
  assert.equal(await h.made[0].text(), "IMGNEW");
  assert.equal(JSON.parse(await h.made[1].text()).payloadName, "new.bin");
});

test("independent UI: import error does not expose download or apply untrusted metadata", async () => {
  const h = ui();
  h.get("extract-tab").fire("click");
  await h.choose("recipe-input", {
    size: 65537,
    text: async () => {
      throw new Error("should not read");
    },
  });
  assert.match(h.get("error").textContent, /64 KB/);
  assert.equal(h.made.length, 0);
  await h.choose("recipe-input", { size: 3, text: async () => "{x}" });
  assert.match(h.get("error").textContent, /JSON/);
  assert.equal(h.get("gap").value, "");
});
