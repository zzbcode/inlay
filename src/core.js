(function (root) {
  "use strict";
  function parseGap(value, size) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text))
      throw new Error("请输入非负整数偏移量，单位为字节。");
    const gap = Number(text);
    if (!Number.isSafeInteger(gap)) throw new Error("偏移量超出了可处理范围。");
    if (gap > size) throw new Error("偏移量不能大于合并文件的大小。");
    return gap;
  }
  function merge(carrier, payload) {
    if (!(carrier instanceof Blob) || !(payload instanceof Blob))
      throw new Error("请先选择载体文件和待隐藏文件。");
    return {
      blob: new Blob([carrier, payload], {
        type: carrier.type || "application/octet-stream",
      }),
      gap: carrier.size,
    };
  }
  function extract(combined, value) {
    if (!(combined instanceof Blob))
      throw new Error("请先选择需要提取的合并文件。");
    return combined.slice(
      parseGap(value, combined.size),
      combined.size,
      "application/octet-stream",
    );
  }
  function filename(value, fallback) {
    const clean = String(value || "")
      .trim()
      .replace(/[\\/\u0000-\u001f\u007f]/g, "_");
    if (!clean || clean === "." || clean === "..") return fallback;
    return clean;
  }
  function recipe(carrier, payload, { payloadSha256 } = {}) {
    const value = {
      format: "inlay",
      version: 1,
      gap: carrier.size,
      carrierName: carrier.name,
      payloadName: payload.name,
      payloadSize: payload.size,
      combinedSize: carrier.size + payload.size,
    };
    if (payloadSha256 !== undefined) value.payloadSha256 = payloadSha256;
    return readRecipe(JSON.stringify(value));
  }
  function readRecipe(text) {
    let value;
    try {
      value = JSON.parse(text);
    } catch (_) {
      throw new Error("提取说明不是有效的 JSON 文件。");
    }
    if (
      !value ||
      !["inlay", "file-fold"].includes(value.format) ||
      value.version !== 1 ||
      !Number.isSafeInteger(value.gap) ||
      value.gap < 0 ||
      !Number.isSafeInteger(value.payloadSize) ||
      value.payloadSize < 0 ||
      !Number.isSafeInteger(value.combinedSize) ||
      value.combinedSize !== value.gap + value.payloadSize ||
      typeof value.payloadName !== "string" ||
      !value.payloadName.trim() ||
      value.payloadName.length > 4096
    )
      throw new Error("提取说明格式不正确，请选择本工具生成的 JSON 文件。");
    if (Object.prototype.hasOwnProperty.call(value, "payloadSha256")) {
      if (
        typeof value.payloadSha256 !== "string" ||
        !/^[a-fA-F0-9]{64}$/.test(value.payloadSha256)
      )
        throw new Error("提取说明中的 SHA-256 格式不正确。");
      value.payloadSha256 = value.payloadSha256.toLowerCase();
    }
    return value;
  }
  const api = { parseGap, merge, extract, filename, recipe, readRecipe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.InlayCore = api;
})(globalThis);
