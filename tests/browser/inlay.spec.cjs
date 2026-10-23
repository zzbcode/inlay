"use strict";
const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const fixture = require("../../fixtures/synthetic.json");
const carrier = Buffer.from(fixture.carrierBase64, "base64");
const payload = Buffer.from(
  Array.from({ length: fixture.payloadLength }, (_, i) => i % 256),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const upload = (name, bytes, mimeType = "application/octet-stream") => ({
  name,
  mimeType,
  buffer: bytes,
});
const sidecar = (bytes = payload, changes = {}) => ({
  format: "inlay",
  version: 1,
  gap: carrier.length,
  carrierName: fixture.carrierName,
  payloadName: fixture.payloadName,
  payloadSize: bytes.length,
  combinedSize: carrier.length + bytes.length,
  payloadSha256: hash(bytes),
  ...changes,
});

async function downloadBytes(page, selector) {
  const waiting = page.waitForEvent("download");
  await page.locator(selector).click();
  const download = await waiting;
  expect(await download.failure()).toBeNull();
  return {
    name: download.suggestedFilename(),
    bytes: await fs.readFile(await download.path()),
  };
}
async function merge(page, bytes = payload) {
  await page
    .locator("#carrier")
    .setInputFiles(upload(fixture.carrierName, carrier, "image/png"));
  await page
    .locator("#payload")
    .setInputFiles(upload(fixture.payloadName, bytes));
  await page.locator("#submit").click();
  await expect(page.locator("#result")).toBeVisible();
}
async function extract(page, combined, recipe) {
  await page.locator("#extract-tab").click();
  await page
    .locator("#combined")
    .setInputFiles(upload("combined.png", combined, "image/png"));
  if (recipe)
    await page
      .locator("#recipe-input")
      .setInputFiles(
        upload(
          "synthetic.inlay.json",
          Buffer.from(JSON.stringify(recipe)),
          "application/json",
        ),
      );
  if (recipe)
    await expect(page.locator("#gap")).toHaveValue(String(recipe.gap));
  await page.locator("#submit").click();
}

test.beforeEach(async ({ page }) => {
  const external = [],
    errors = [],
    outgoing = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) => outgoing.push(`WebSocket ${socket.url()}`));
  await page.route("**/*", async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      outgoing.push(`${route.request().method()} ${route.request().url()}`);
      await route.abort();
      return;
    }
    const url = new URL(route.request().url());
    if (
      ["file:", "blob:", "data:", "about:"].includes(url.protocol) ||
      url.hostname === "127.0.0.1"
    )
      return route.continue();
    external.push(route.request().url());
    await route.abort();
  });
  page.__inlayEvidence = { external, errors, outgoing };
});
test.afterEach(async ({ page }) => {
  expect(page.__inlayEvidence.external, "no third-party requests").toEqual([]);
  expect(page.__inlayEvidence.errors, "no uncaught browser errors").toEqual([]);
  expect(
    page.__inlayEvidence.outgoing,
    "no upload methods or WebSockets",
  ).toEqual([]);
});

for (const route of ["/", "/inlay/"]) {
  test(`${route} selects real files and downloads exact concatenation plus hashed sidecar`, async ({
    page,
  }) => {
    const response = await page.goto(route);
    expect(response.headers()["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
    await merge(page);
    await expect(page.locator("#gap")).toHaveValue(String(carrier.length));
    await expect(page.locator("#result-title")).toBeFocused();
    await expect(page.locator("#result-title")).toBeInViewport();
    await expect(page.locator("#download-result")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await downloadBytes(page, "#download-result");
    expect(result.bytes.equals(Buffer.concat([carrier, payload]))).toBe(true);
    expect(result.name).toMatch(/\.png$/);
    const recipe = JSON.parse(
      (await downloadBytes(page, "#download-recipe")).bytes.toString(),
    );
    expect(recipe).toMatchObject(sidecar());
    await extract(page, result.bytes, recipe);
    await expect(page.locator("#result-verification")).toContainText(
      "SHA-256 校验通过",
    );
    const restored = await downloadBytes(page, "#download-result");
    expect(restored.bytes.equals(payload)).toBe(true);
    expect(restored.name).toBe(fixture.payloadName);
  });
}

test("offline file:// page preserves merge, verified local reuse and downloads", async ({
  page,
}) => {
  await page.goto(
    pathToFileURL(path.resolve(__dirname, "../../dist/index.html")).href,
  );
  await merge(page, Buffer.from([0, 255, 128, 1]));
  await page.locator("#reuse-result").click();
  await expect(page.locator("#output-name")).toHaveValue(fixture.payloadName);
  await expect(page.locator("#gap")).toHaveValue(String(carrier.length));
  await page.locator("#submit").click();
  await expect(page.locator("#result-verification")).toContainText(
    "SHA-256 校验通过",
  );
  const restored = await downloadBytes(page, "#download-result");
  expect(restored.bytes).toEqual(Buffer.from([0, 255, 128, 1]));
});

test("same-size payload tampering blocks download and manual editing explicitly becomes unverified", async ({
  page,
}) => {
  await page.goto("/inlay/");
  const changed = Buffer.from(payload);
  changed[changed.length - 1] ^= 1;
  await extract(page, Buffer.concat([carrier, changed]), sidecar());
  await expect(page.locator("#error")).toContainText("SHA-256");
  await expect(page.locator("#error")).toContainText("不一致");
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#download-result")).not.toHaveAttribute(
    "href",
    /.+/,
  );
  await page.locator("#gap").fill("0");
  await page.locator("#gap").fill(String(carrier.length));
  await page.locator("#submit").click();
  await expect(page.locator("#result-verification")).toContainText("未校验");
  const restored = await downloadBytes(page, "#download-result");
  expect(restored.bytes.equals(changed)).toBe(true);
});

test("legacy sidecar remains usable and visibly unverified", async ({
  page,
}) => {
  await page.goto("/");
  const old = sidecar(Buffer.from("legacy"), { format: "file-fold" });
  delete old.payloadSha256;
  await extract(page, Buffer.concat([carrier, Buffer.from("legacy")]), old);
  await expect(page.locator("#result-verification")).toContainText("未校验");
  expect((await downloadBytes(page, "#download-result")).bytes.toString()).toBe(
    "legacy",
  );
});

test("manual EOF rejects original carrier while an empty payload declared in sidecar is allowed", async ({
  page,
}) => {
  await page.goto("/");
  await extract(page, carrier);
  await page.locator("#gap").fill(String(carrier.length));
  await page.locator("#submit").click();
  await expect(page.locator("#error")).toContainText(/未发现|没有|空/);
  await expect(page.locator("#result")).toBeHidden();
  const empty = sidecar(Buffer.alloc(0));
  await page
    .locator("#recipe-input")
    .setInputFiles(
      upload(
        "empty.json",
        Buffer.from(JSON.stringify(empty)),
        "application/json",
      ),
    );
  await expect(page.locator("#gap")).toHaveValue(String(carrier.length));
  await page.locator("#submit").click();
  await expect(page.locator("#result-verification")).toContainText(
    "SHA-256 校验通过",
  );
  expect((await downloadBytes(page, "#download-result")).bytes.length).toBe(0);
});

test("cancel during hashing and a late hash completion cannot recreate stale result", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const original = InlayIntegrity.sha256Blob;
    window.__finishInlayHash = null;
    InlayIntegrity.sha256Blob = (blob, options) =>
      new Promise((resolve, reject) => {
        window.__finishInlayHash = async () => {
          try {
            resolve(await original(blob, { ...options, signal: undefined }));
          } catch (error) {
            reject(error);
          }
        };
      });
  });
  await page
    .locator("#carrier")
    .setInputFiles(upload(fixture.carrierName, carrier, "image/png"));
  await page
    .locator("#payload")
    .setInputFiles(upload(fixture.payloadName, Buffer.from("cancel")));
  await page.locator("#submit").click();
  await expect(page.locator("#processing")).toBeVisible();
  await page.locator("#cancel").click();
  await page.evaluate(() => window.__finishInlayHash());
  await expect(page.locator("#processing")).toBeHidden();
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#download-result")).not.toHaveAttribute(
    "href",
    /.+/,
  );
});

test("reset and a newer import prevent late JSON read from overwriting current parameters", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#extract-tab").click();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name === "slow.json")
        return new Promise((resolve) => {
          window.__finishInlayRecipe = async () =>
            resolve(await original.call(this));
        });
      return original.call(this);
    };
  });
  const old = sidecar(Buffer.from("old"), {
    gap: 1,
    combinedSize: 4,
    payloadName: "old.bin",
  });
  await page
    .locator("#recipe-input")
    .setInputFiles(
      upload("slow.json", Buffer.from(JSON.stringify(old)), "application/json"),
    );
  await expect
    .poll(() => page.evaluate(() => typeof window.__finishInlayRecipe))
    .toBe("function");
  await page.locator("#reset").click();
  const current = sidecar(Buffer.from("new"), {
    gap: 2,
    combinedSize: 5,
    payloadName: "new.bin",
  });
  await page
    .locator("#recipe-input")
    .setInputFiles(
      upload(
        "new.json",
        Buffer.from(JSON.stringify(current)),
        "application/json",
      ),
    );
  await expect(page.locator("#output-name")).toHaveValue("new.bin");
  await page.evaluate(() => window.__finishInlayRecipe());
  await expect(page.locator("#output-name")).toHaveValue("new.bin");
  await expect(page.locator("#gap")).toHaveValue("2");
});

test("invalid gap is an accessible error and demo provides a reusable synthetic example", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#extract-tab").click();
  await page
    .locator("#combined")
    .setInputFiles(upload("carrier.png", carrier, "image/png"));
  for (const gap of ["-1", "1.5", String(carrier.length + 1)]) {
    await page.locator("#gap").fill(gap);
    await page.locator("#submit").click();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error")).toHaveAttribute("role", "alert");
    await expect(page.locator("#result")).toBeHidden();
  }
  await page.locator("#load-demo").click();
  await page.locator("#submit").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#reuse-result")).toBeVisible();
  await page.locator("#reuse-result").click();
  await page.locator("#submit").click();
  await expect(page.locator("#result-verification")).toContainText(
    "SHA-256 校验通过",
  );
});

test("a malformed supplied digest is rejected instead of silently treating the sidecar as legacy", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#extract-tab").click();
  await page
    .locator("#combined")
    .setInputFiles(
      upload(
        "combined.png",
        Buffer.concat([carrier, Buffer.from("payload")]),
        "image/png",
      ),
    );
  const malformed = sidecar(Buffer.from("payload"), { payloadSha256: null });
  await page
    .locator("#recipe-input")
    .setInputFiles(
      upload(
        "bad.json",
        Buffer.from(JSON.stringify(malformed)),
        "application/json",
      ),
    );
  await expect(page.locator("#error")).toContainText("SHA-256");
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#gap")).toHaveValue("");
});

test("changing output revokes previous URLs and unchecked sidecar skips hash work", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const original = URL.revokeObjectURL;
    window.__inlayRevoked = [];
    URL.revokeObjectURL = function (url) {
      window.__inlayRevoked.push(url);
      return original.call(URL, url);
    };
  });
  await merge(page, Buffer.from("small-payload"));
  await page.locator("#output-name").fill("renamed");
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#download-result")).not.toHaveAttribute(
    "href",
    /.+/,
  );
  expect(await page.evaluate(() => window.__inlayRevoked.length)).toBe(2);
  await page.locator("#include-recipe").uncheck();
  await page.evaluate(() => {
    InlayIntegrity.sha256Blob = async () => {
      throw new Error("unexpected hash work");
    };
  });
  await page.locator("#submit").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#download-recipe")).toBeHidden();
  const result = await downloadBytes(page, "#download-result");
  expect(result.name).toBe("renamed.png");
  expect(
    result.bytes.equals(Buffer.concat([carrier, Buffer.from("small-payload")])),
  ).toBe(true);
});
