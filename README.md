# 夹层 Inlay · 所有文件皆可隐藏

**本地文件隐藏与无损提取工具 · Hide any file locally.**

[在线体验](https://82.156.103.223/inlay/) · [下载离线包](https://github.com/zzbcode/inlay/releases/latest) · [English](README.en.md) · [使用与格式说明](docs/FORMAT.md) · [报告问题](https://github.com/zzbcode/inlay/issues)

[![自动化测试](https://github.com/zzbcode/inlay/actions/workflows/check.yml/badge.svg)](https://github.com/zzbcode/inlay/actions/workflows/check.yml)

把 ZIP、PDF、文档或任意二进制文件追加到另一份文件末尾，再按偏移量原样取回。**无需上传 · 离线可用 · SHA-256 校验 · Python CLI**，在浏览器里完成文件拼接、隐藏与提取。

“所有文件”指**待隐藏文件的类型不限**；载体能否继续正常打开、可处理的大小，仍取决于文件格式、读取器与浏览器。**文件隐藏不是加密。**

![文件隐藏与还原的字节流程](docs/overview.svg)

**30 秒试用：** 打开在线体验 →「载入示例」→「生成合并文件」→「用此结果验证提取」→ 查看 SHA-256 校验结果。无需准备文件或注册账号。

如果这个小工具对你有用，欢迎 [Star 收藏](https://github.com/zzbcode/inlay)，或把使用场景和兼容性反馈留在 [Issues](https://github.com/zzbcode/inlay/issues)。

<details>
<summary>查看完整工作台截图</summary>

![Inlay 深色工作台](docs/screenshot.png)

</details>

输出是精确的 `carrier + payload` 原始字节拼接，兼容 Python 的追加写入与 `seek(gap)` 提取。它采用 append-based data hiding（文件追加式隐藏 / steganography），不改变载荷字节。

## 能做什么

- 拖拽或选择文件，合并后保留载体扩展名，显示精确字节偏移量 `gap`。
- 分别下载合并文件与 JSON 提取说明；说明可保存原文件名、大小和载荷 SHA-256。
- 导入说明校验并提取，或手填 `gap` 提取。明确区分“校验通过”和“未经校验”；摘要不匹配时拒绝提供结果。
- 分块计算摘要，显示进度并可取消；直接复用刚生成的结果，快速验证还原流程。
- 内置合成示例；支持空载荷、二进制内容、中文名和旧版 `file-fold` 说明。
- 纯静态、离线可用、无账号、无上传接口、无统计、无文件持久化。运行时不请求第三方脚本、字体或 CDN。

## 使用流程

1. 在“合并”中选择载体与待隐藏文件，生成结果。
2. **分别保存合并文件与提取说明。** 传递时请发送原文件，避免聊天软件压缩、转码或重新保存。
3. 在“提取”中选中**刚下载的合并文件**，导入配套说明，再提取并保存。

`gap` 是原载体的**字节数**。选到原载体、误填偏移量或传错说明都可能导致无法恢复。手填参数及旧版无摘要说明只能提取，不能证明内容正确。手填 `gap` 恰好等于文件大小时，界面会提示没有附加内容；说明明确记录的空载荷可以还原。

SHA-256 用于发现内容变化：大小一样也可能损坏。它只核对载荷，不核对载体，也不能证明发送者身份；能同时修改文件和说明的人可以重算摘要。

## 本地运行

构建和开发使用 Node.js 20+。应用没有运行时 npm 依赖；Playwright、Prettier 仅用于开发。

```sh
git clone https://github.com/zzbcode/inlay.git
cd inlay
npm ci
npm test
npm run build
npm start
```

打开 `http://127.0.0.1:8765/`。也可双击 `dist/index.html` 离线使用；复制功能在不同浏览器的本地文件模式下可能受限，仍可手动复制参数。

```sh
# 自定义本地预览端口，验证子路径部署
npm start -- --port 8766 --base /inlay/
# 如需局域网预览，由你明确选择绑定其他网卡
npm start -- --host 0.0.0.0
```

下载发行版的 `inlay-*-offline.zip`，解压后打开其中的 `index.html`，不需要 Node.js、Python 或联网。发行版同时提供源码包与 `SHA256SUMS`，详见[发布说明](docs/RELEASING.md)。

## Python 互通

附带标准库参考 CLI，需要 Python 3.9+：

```sh
python3 examples/inlay.py encode cover.png notes.zip combined.png --recipe combined.inlay.json
python3 examples/inlay.py decode combined.png notes-restored.zip --recipe combined.inlay.json
# 兼容原始 Python 输出：直接提供原载体的字节数
python3 examples/inlay.py decode combined.png notes-restored.zip --gap 435833
```

默认拒绝覆盖已有文件；有意替换时加 `--force`，仍不允许输入输出同路径。手动提取空文件需显式 `--allow-empty`。CLI 用临时文件处理，校验失败不会发布待提取的输出。

格式和说明字段见[格式规范](docs/FORMAT.md)；浏览器、载体与传输限制见[兼容性说明](docs/COMPATIBILITY.md)。

## 测试与部署

```sh
npm test
npm run build
npx playwright install --with-deps
npm run test:browser
npm run release
```

Node 测试覆盖二进制往返、边界值、JSON 校验、导入竞态与 URL 回收；Python CLI 与 JavaScript 使用合成数据交叉验证。浏览器测试覆盖实际上传、下载、篡改拒绝、离线文件和手机结果定位。CI 执行自动测试并保留失败报告。

将 `dist/` 发布到任意静态服务器即可，支持域名根路径和 `/inlay/` 等子路径。示例：

```sh
npm run build
docker compose -f deploy/compose.yml up -d
# http://127.0.0.1:8766/
```

通用配置仅提供静态服务，不接收用户文件。应用内主页/源码链接的配置方式见[兼容性说明](docs/COMPATIBILITY.md)。

## 项目边界

- 拼接不提供密码保护、认证或加密，也不保证隐藏附加数据的存在。
- 载体能否继续正常打开由其格式和读取器决定，不能保证任意文件追加后仍有效。
- 浏览器仍受内存、临时存储、Blob 与下载限制；分块摘要不等于分块写出，不承诺任意 GB 级文件都可处理。
- 文件只在当前页面会话中保留引用；刷新后需要重新选择。请下载并妥善保存文件与说明。

## 贡献与许可

欢迎使用合成样例提交问题，先阅读[贡献指南](CONTRIBUTING.md)。漏洞请通过[安全政策](SECURITY.md)中的私密渠道报告，勿在公开 issue 上传私人文件。

代码采用 [MIT](LICENSE) 许可；本地依赖与品牌素材来源见[素材说明](docs/ASSETS.md)。后续计划见[路线图](docs/ROADMAP.md)。

## 分享项目

欢迎把它介绍给需要本地文件隐藏、图片藏文件、文件拼接或离线文件工具的朋友。[分享素材与可复制介绍](docs/SHARING.md)包含中文介绍、英文介绍和短演示脚本。介绍时请保留“追加式隐藏，非加密；载体兼容性需验证”的边界。
