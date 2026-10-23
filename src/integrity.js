(function (root) {
  "use strict";
  const sha256 =
    typeof module !== "undefined" && module.exports
      ? require("./vendor/sha256.js")
      : root.sha256;

  function checkAbort(signal) {
    if (signal?.aborted) {
      const error = new Error("操作已取消。");
      error.name = "AbortError";
      throw error;
    }
  }

  /** Read at most one chunk into memory. Yield between chunks for UI/cancellation. */
  async function sha256Blob(
    blob,
    { signal, onProgress, chunkSize = 1 << 20 } = {},
  ) {
    if (!(blob instanceof Blob)) throw new TypeError("请选择有效文件。");
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0)
      throw new TypeError("chunkSize must be a positive safe integer.");
    checkAbort(signal);
    const hash = sha256.create();
    onProgress?.(0);
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      checkAbort(signal);
      const bytes = await blob
        .slice(offset, Math.min(offset + chunkSize, blob.size))
        .arrayBuffer();
      checkAbort(signal);
      hash.update(new Uint8Array(bytes));
      if (offset + chunkSize < blob.size) {
        onProgress?.(Math.min((offset + chunkSize) / blob.size, 1));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    checkAbort(signal);
    const digest = hash.hex();
    onProgress?.(1);
    checkAbort(signal);
    return digest;
  }

  const api = { sha256Blob };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.InlayIntegrity = api;
})(globalThis);
