"use strict";
const $ = (id) => document.getElementById(id);
const state = {
  mode: "merge",
  carrier: null,
  payload: null,
  combined: null,
  recipe: null,
  urls: [],
  revision: 0,
  controller: null,
  lastMerge: null,
};
const integer = (n) => n.toLocaleString("en-US");
function size(n) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = 0;
  n /= 1024;
  while (n >= 1024 && i < 3) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(2)} ${units[i]}`;
}
function nameParts(value) {
  const dot = value.lastIndexOf(".");
  return dot > 0 ? [value.slice(0, dot), value.slice(dot)] : [value, ""];
}
function setOutputName(name, split) {
  const [base, ext] = split ? nameParts(name) : [name, ""];
  $("output-name").value = base;
  $("extension").textContent = ext;
  $("extension").hidden = !ext;
}
function clearResult() {
  state.lastMerge = null;
  $("result").hidden = true;
  $("error").hidden = true;
  state.urls.forEach((url) => URL.revokeObjectURL(url));
  state.urls = [];
  $("download-result").removeAttribute("href");
  $("download-recipe").removeAttribute("href");
}
function setBusy(busy, label = "") {
  $("processing").hidden = !busy;
  $("submit").disabled = busy;
  $("operation-form").setAttribute("aria-busy", String(busy));
  if (busy) {
    $("processing-label").textContent = label;
    $("processing-progress").value = 0;
  }
}
function invalidate() {
  state.revision++;
  state.controller?.abort();
  state.controller = null;
  setBusy(false);
  clearResult();
}
function fail(message) {
  $("error").textContent = message;
  $("error").hidden = false;
  $("error").setAttribute("tabindex", "-1");
  $("error").focus();
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3000);
}
function clearRecipe() {
  state.recipe = null;
  $("import-status").textContent =
    "自动填入偏移量与原文件名，或在右侧手动填写。";
}
function renderFile(key) {
  const file = state[key];
  const zone = $(`${key}-zone`);
  const empty = {
    carrier: "点击选择或拖入文件",
    payload: "支持任意文件格式",
    combined: "选择需要提取的原始文件",
  };
  zone.querySelector(".filename").textContent = file ? file.name : empty[key];
  zone.querySelector(".file-size").textContent = file
    ? `${integer(file.size)} B`
    : "—";
  zone.querySelector(".choose-label").textContent = file ? "更换" : "选择";
  zone.title = file ? `${file.name} · ${integer(file.size)} 字节` : "";
}
function updateStructure() {
  const merge = state.mode === "merge";
  let gap,
    total,
    valid = false,
    payload;
  if (merge) {
    gap = state.carrier?.size;
    total =
      state.carrier && state.payload
        ? state.carrier.size + state.payload.size
        : null;
    payload = state.payload?.size;
    $("gap").value = gap == null ? "" : String(gap);
    valid = total != null;
  } else {
    total = state.combined?.size;
    try {
      if (total != null) {
        gap = InlayCore.parseGap($("gap").value, total);
        payload = total - gap;
        valid = true;
      }
    } catch (_) {}
  }
  $("payload-size").textContent = payload == null ? "—" : size(payload);
  $("total-size").textContent = total == null ? "—" : size(total);
  const ratio = valid && total > 0 ? gap / total : 0.25;
  $("carrier-bar").style.width = `${ratio * 100}%`;
  $("gap-tick").style.left = `${Math.min(90, Math.max(10, ratio * 100))}%`;
  $("gap-tick").textContent = gap == null ? "gap" : String(gap);
  $("gap-tick").hidden = valid && total === 0;
  document.querySelector(".byte-bar").classList.toggle("empty", !valid);
  document
    .querySelector(".byte-bar")
    .setAttribute(
      "aria-label",
      valid
        ? `载体 ${integer(gap)} 字节，隐藏内容 ${integer(payload)} 字节`
        : "选择文件并填写参数后显示字节比例",
    );
  $("structure-note").textContent = valid
    ? `提取从偏移量 ${integer(gap)} 开始，直到文件末尾。`
    : merge
      ? "选择两份文件后，即可预览字节结构。"
      : "选择合并文件并填写有效偏移量后，即可预览。";
}
function setFile(key, file) {
  invalidate();
  state[key] = file;
  $(key).value = "";
  renderFile(key);
  if (key === "carrier" && state.mode === "merge") {
    if (file) {
      const [base, ext] = nameParts(file.name);
      setOutputName(`${base}_fold${ext}`, true);
    } else setOutputName("", true);
  }
  updateStructure();
}
for (const key of ["carrier", "payload", "combined"]) {
  $(key).addEventListener("change", () => {
    const file = $(key).files[0];
    if (file) setFile(key, file);
  });
  const zone = $(`${key}-zone`);
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      fail("每个区域请选择一份文件。多个隐藏文件可以先打包成 ZIP。");
      return;
    }
    setFile(key, files[0]);
    $(key).value = "";
  });
}
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
function setMode(mode) {
  if (state.mode === mode) return;
  invalidate();
  state.mode = mode;
  clearRecipe();
  const merge = mode === "merge";
  for (const name of ["merge", "extract"]) {
    $(`${name}-tab`).classList.toggle("active", mode === name);
    $(`${name}-tab`).setAttribute("aria-selected", String(mode === name));
    $(`${name}-tab`).tabIndex = mode === name ? 0 : -1;
  }
  $("workspace").setAttribute("aria-labelledby", `${mode}-tab`);
  $("carrier-zone").hidden = !merge;
  $("payload-zone").hidden = !merge;
  $("combined-zone").hidden = merge;
  $("import-area").hidden = merge;
  $("recipe-option").hidden = !merge;
  $("heading").textContent = merge ? "合并文件" : "提取文件";
  $("description").textContent = merge
    ? "按原始字节顺序拼接，保留完整内容。"
    : "按偏移量取出末尾内容，还原隐藏文件。";
  $("name-label").textContent = merge ? "合并后文件名" : "还原后文件名";
  $("gap").readOnly = merge;
  $("gap-auto").textContent = merge ? "自动计算" : "填入字节数";
  $("gap-help").textContent = merge
    ? "等于载体原始大小，提取时需要使用。"
    : "填入合并前载体的大小，或导入提取说明。";
  $("payload-size-label").textContent = merge ? "隐藏文件大小" : "预计提取大小";
  $("total-size-label").textContent = merge ? "合并后大小" : "输入文件大小";
  $("submit").textContent = merge ? "生成合并文件" : "提取隐藏文件";
  $("output-name").placeholder = merge
    ? "选择载体后自动填写"
    : "原文件名，含扩展名";
  $("gap").value = "";
  if (merge && state.carrier) {
    const [base, ext] = nameParts(state.carrier.name);
    setOutputName(`${base}_fold${ext}`, true);
  } else setOutputName(merge ? "" : "recovered.bin", false);
  updateStructure();
}
for (const name of ["merge", "extract"]) {
  $(`${name}-tab`).addEventListener("click", () => setMode(name));
  $(`${name}-tab`).addEventListener("keydown", (event) => {
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? "merge"
          : event.key === "End"
            ? "extract"
            : name === "merge"
              ? "extract"
              : "merge";
      setMode(next);
      $(`${next}-tab`).focus();
    }
  });
}
$("gap").addEventListener("input", () => {
  invalidate();
  clearRecipe();
  updateStructure();
});
$("output-name").addEventListener("input", invalidate);
$("include-recipe").addEventListener("change", invalidate);
$("reset").addEventListener("click", () => {
  invalidate();
  for (const key of ["carrier", "payload", "combined"]) {
    state[key] = null;
    $(key).value = "";
    renderFile(key);
  }
  clearRecipe();
  $("recipe-input").value = "";
  $("gap").value = "";
  setOutputName(state.mode === "merge" ? "" : "recovered.bin", false);
  updateStructure();
  toast("工作区已清空");
});
$("recipe-input").addEventListener("change", async () => {
  const file = $("recipe-input").files[0];
  if (!file) return;
  invalidate();
  clearRecipe();
  const revision = state.revision;
  try {
    if (file.size > 65536)
      throw new Error("提取说明应是小于 64 KB 的 JSON 文件。");
    const recipe = InlayCore.readRecipe(await file.text());
    if (revision !== state.revision || state.mode !== "extract") return;
    state.recipe = recipe;
    $("gap").value = String(recipe.gap);
    setOutputName(
      InlayCore.filename(recipe.payloadName, "recovered.bin"),
      false,
    );
    $("import-status").textContent =
      `已导入说明 · 预期输入大小 ${integer(recipe.combinedSize)} 字节`;
    updateStructure();
    toast("已填入偏移量与原文件名");
  } catch (error) {
    if (revision === state.revision) fail(error.message);
  } finally {
    if (revision === state.revision) $("recipe-input").value = "";
  }
});
function objectUrl(blob) {
  const url = URL.createObjectURL(blob);
  state.urls.push(url);
  return url;
}
function showResult(blob, name, recipe, verified = false) {
  const merge = state.mode === "merge";
  $("result-title").textContent = merge
    ? "合并完成，文件已就绪"
    : blob.size === 0
      ? "空文件已还原"
      : "提取完成，文件已就绪";
  $("result-meta").textContent = `${name} · ${integer(blob.size)} 字节`;
  $("result").setAttribute(
    "data-verification",
    merge ? "ready" : verified ? "verified" : "unverified",
  );
  $("result-verification").textContent = merge
    ? recipe?.payloadSha256
      ? "已生成 SHA-256 · 提取时自动校验"
      : "未生成校验说明 · 请保存偏移量"
    : verified
      ? "SHA-256 校验通过 · 与说明中的隐藏文件一致"
      : "未校验 · 仅按偏移量提取，请确认文件内容";
  $("download-result").href = objectUrl(blob);
  $("download-result").download = name;
  $("download-result").querySelector("span").textContent = merge
    ? "下载合并文件"
    : "下载还原文件";
  $("download-recipe").hidden = !recipe;
  if (recipe) {
    $("download-recipe").href = objectUrl(
      new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }),
    );
    $("download-recipe").download = `${name}.inlay.json`;
  }
  $("reuse-result").hidden = !merge;
  $("result-note").textContent = merge
    ? recipe
      ? `请分别下载合并文件与提取说明。提取时选择 ${name}（${integer(blob.size)} 字节），gap = ${$("gap").value}。`
      : `请保存 gap = ${$("gap").value}，提取时选择刚下载的合并文件。`
    : verified
      ? "文件内容已通过摘要校验。摘要不证明发送者身份，请妥善保管提取说明。"
      : "未提供有效摘要，无法判断偏移量是否正确。请打开下载文件确认内容与扩展名。";
  $("result").hidden = false;
  $("result-title").focus({ preventScroll: true });
  $("result").scrollIntoView?.({ block: "start", behavior: "auto" });
}

async function hashPayload(blob, revision, label) {
  const controller = new AbortController();
  state.controller = controller;
  setBusy(true, label);
  return InlayIntegrity.sha256Blob(blob, {
    signal: controller.signal,
    onProgress(fraction) {
      if (revision === state.revision) {
        $("processing-progress").value = fraction;
        $("processing-label").textContent =
          `${label} ${Math.round(fraction * 100)}%`;
      }
    },
  });
}

$("operation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  invalidate();
  const revision = state.revision;
  try {
    if (state.mode === "merge") {
      const { blob } = InlayCore.merge(state.carrier, state.payload);
      const [base, ext] = nameParts(state.carrier.name);
      const outputBase = InlayCore.filename(
        $("output-name").value,
        `${base}_fold`,
      );
      const name = outputBase + ext;
      if (name.length > 240)
        throw new Error("输出文件名过长，请缩短到 240 个字符以内。");
      $("output-name").value = outputBase;
      const metadata = InlayCore.recipe(state.carrier, state.payload);
      const includeRecipe = $("include-recipe").checked;
      if (includeRecipe)
        metadata.payloadSha256 = await hashPayload(
          state.payload,
          revision,
          "正在计算隐藏文件 SHA-256…",
        );
      if (revision !== state.revision) return;
      showResult(blob, name, includeRecipe ? metadata : null);
      state.lastMerge = { blob, name, recipe: metadata };
    } else {
      if (!state.combined) throw new Error("请先选择需要提取的合并文件。");
      const recipe = state.recipe;
      if (recipe && recipe.combinedSize !== state.combined.size)
        throw new Error(
          "文件大小与提取说明不一致，请确认是否选错文件或文件被转码。修改偏移量可改为手动处理。",
        );
      const blob = InlayCore.extract(state.combined, $("gap").value);
      if (blob.size === 0 && !(recipe && recipe.payloadSize === 0))
        throw new Error(
          "偏移量等于输入文件大小，没有可提取的内容。请确认选中的是合并后的文件，而非原始载体。合法空文件请导入对应的提取说明。",
        );
      const name = InlayCore.filename($("output-name").value, "recovered.bin");
      let verified = false;
      if (recipe?.payloadSha256) {
        const digest = await hashPayload(
          blob,
          revision,
          "正在校验隐藏文件 SHA-256…",
        );
        if (revision !== state.revision) return;
        if (digest !== recipe.payloadSha256)
          throw new Error(
            "SHA-256 校验不一致：隐藏内容已改变，或文件与提取说明不匹配。未生成下载，请核对来源。",
          );
        verified = true;
      }
      if (revision !== state.revision) return;
      $("output-name").value = name;
      showResult(blob, name, null, verified);
    }
  } catch (error) {
    if (revision === state.revision && error.name !== "AbortError")
      fail(error.message || "处理失败，请重新选择文件后重试。");
  } finally {
    if (revision === state.revision) {
      state.controller = null;
      setBusy(false);
    }
  }
});

$("cancel").addEventListener("click", () => {
  invalidate();
  toast("处理已取消，可修改参数后重试");
});
$("reuse-result").addEventListener("click", () => {
  const result = state.lastMerge;
  if (!result) return;
  setMode("extract");
  state.combined = Object.assign(result.blob.slice(), { name: result.name });
  state.recipe = result.recipe;
  $("combined").value = "";
  renderFile("combined");
  $("gap").value = String(result.recipe.gap);
  setOutputName(
    InlayCore.filename(result.recipe.payloadName, "recovered.bin"),
    false,
  );
  $("import-status").textContent =
    "已载入本次合并结果与提取说明，可直接验证提取。";
  updateStructure();
  $("submit").focus();
  toast("已载入合并结果，点击提取即可验证");
});
$("load-demo").addEventListener("click", () => {
  invalidate();
  if (state.mode !== "merge") setMode("merge");
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  setFile(
    "carrier",
    Object.assign(new Blob([png], { type: "image/png" }), {
      name: "sample.png",
    }),
  );
  setFile(
    "payload",
    Object.assign(
      new Blob(["你好，Inlay！\nThis is synthetic sample content.\n"], {
        type: "text/plain",
      }),
      { name: "hello-inlay.txt" },
    ),
  );
  $("include-recipe").checked = true;
  $("submit").focus();
  toast("已载入合成示例，可合并后验证提取");
});
$("copy-gap").addEventListener("click", async () => {
  const value = $("gap").value;
  if (!value) {
    toast("请先选择载体，或填写偏移量");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast("偏移量已复制");
  } catch (_) {
    $("gap").focus();
    $("gap").select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (_) {}
    toast(copied ? "偏移量已复制" : "请按 Ctrl+C 或 ⌘C 复制偏移量");
  }
});
$("help").addEventListener("click", () => $("help-dialog").showModal());
$("close-help").addEventListener("click", () => $("help-dialog").close());
$("help-dialog").addEventListener("click", (event) => {
  if (event.target === $("help-dialog")) {
    const rect = $("help-dialog").getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      $("help-dialog").close();
  }
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    state.controller?.abort();
    state.urls.forEach((url) => URL.revokeObjectURL(url));
  }
});
updateStructure();
