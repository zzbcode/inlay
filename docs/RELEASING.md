# 发布与校验 / Releasing and verification

## 下载与运行 / Download and run

[GitHub Releases](https://github.com/zzbcode/inlay/releases) 提供：

| 文件 / Artifact | 用途 / Purpose |
| --- | --- |
| `inlay-<version>-offline.zip` | 解压后直接打开 `index.html`，或把内容发布到静态服务器。包含应用、内置依赖与许可。 |
| `inlay-<version>-source.zip` | 经过白名单筛选的源代码、lockfile、测试、合成样例、文档与通用部署示例。 |
| `SHA256SUMS` | 上述两个 ZIP 的 SHA-256。 |

macOS/Linux 校验示例，在下载目录运行：

```sh
# Linux
sha256sum --check SHA256SUMS
# macOS
shasum -a 256 --check SHA256SUMS
```

Windows PowerShell 可运行 `Get-FileHash .\inlay-1.1.0-offline.zip -Algorithm SHA256` 并与 `SHA256SUMS` 对照。校验和可发现下载变化，不等同于发布者签名。

## 本地生成 / Build locally

使用与目标 tag 一致的源码与 lockfile：

```sh
npm ci
npm test
npm run format:check
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm run release
```

产物写入 `artifacts/`。`npm run release -- --version 1.1.0` 可额外断言版本必须与 `package.json` 一致。

打包脚本只读当前构建文件与源码白名单；不读取 Git 历史，不打包 `.git`、`.openai`、`node_modules`、私人部署报告、截图审计目录、服务器密钥或真实用户文件。测试数据来自 `fixtures/` 中的合成样例。源码包包含通用 `deploy/compose.yml` 与 `deploy/nginx.conf`，不包含个人服务器配置。

ZIP 使用 store 编码、稳定文件顺序、固定时间戳且不写入平台特有权限。相同输入字节和版本生成相同 ZIP；运行两次 `npm run release` 后比较 `SHA256SUMS` 即可验证。脚本不会自行运行构建，所以必须先生成与当前源码相符的 `dist/`。这只是 ZIP 的可复现性，不保证不同依赖树或不同源码会得到同一产物。

## 维护者发布 / Maintainer release

1. 确认 changelog、`.github/RELEASE_NOTES.md`、说明、许可与界面截图对应最终行为；审阅源码包清单，确保不含私人数据。
2. 默认分支 CI 通过后，在该提交创建与 `package.json` 一致的 `v<version>` tag 并 push。
3. `release.yml` 重新运行测试、构建和浏览器流程，再打包并向同名 GitHub Release 上传三个产物。
4. 下载发布资产，核对校验和，并从离线包验证合并与还原。

工作流令牌仅在发布 job 中有 `contents: write`。普通检查为只读。若维护者手动创建首次发行版，使用同一打包脚本的产物；后续 tag 工作流会上传一致的资产，不应手动重写已有 tag 指向另一提交。

The archives use sorted entries, fixed timestamps and the ZIP store method. Identical inputs produce identical archive bytes. Source packaging uses an allowlist and excludes local state and Git history. Release checksums detect corruption; they are not cryptographic publisher signatures.
