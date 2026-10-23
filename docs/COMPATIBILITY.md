# 兼容性与部署 / Compatibility and deployment

## 浏览器 / Browsers

应用使用 File/Blob、对象 URL、标准文件输入、拖拽和本地脚本，不依赖后端。自动化检查以 Playwright 的 Chromium、Firefox、WebKit 为目标，并覆盖手机尺寸；这是引擎测试，不等于每款实体设备和 Safari 版本都已认证。请以项目 CI 的实际结果为准。

The app is built on standard File/Blob and download APIs. CI targets Chromium, Firefox and WebKit, including a mobile viewport. Engine coverage is not a guarantee for every physical device or browser version.

| 场景 / Scenario | 行为 / Behavior |
| --- | --- |
| HTTP/HTTPS 静态托管 | 支持，无文件上传。`dist/` 目录可直接发布。 |
| `file://` 离线打开 | 支持；全部资源随包提供。剪贴板权限可能不同，可手动复制。 |
| 域名根路径与子路径 | 相对资源路径；可部署于 `/`、`/inlay/` 等目录。 |
| 手机 | 单栏流程；结果生成后定位结果区域。浏览器决定下载与保存交互。 |
| 大文件 | 分块摘要、可取消；输出仍依赖 Blob/下载，不承诺固定 GB 上限。 |

构建和 Node 测试需要 Node.js 20+；Python 互通测试和 CLI 需要 Python 3.9+。使用离线包不需要安装这些工具。

## 静态部署 / Static deployment

```sh
npm ci
npm run build
# Copy the contents of dist/ to your static document root or subdirectory.
```

建议静态服务器返回正确 MIME，并提供 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。不要配置将未知文件请求一律回退成 HTML，缺失资源应返回 404。配置缓存时保持 HTML 与脚本一致，避免旧页面配新脚本。

`deploy/compose.yml` 和 `deploy/nginx.conf` 是通用本地示例，绑定回环地址 `127.0.0.1:8766`。公开发布时由你自己的 HTTPS 反向代理或静态托管服务提供 TLS；无需增加上传路由、数据库或跨域 API。

`npm start -- --base /inlay/` 可预览子路径；`--port` 修改端口，`--host` 修改监听地址，默认只监听回环地址。预览服务不是生产服务器。

### 界面链接 / Application links

品牌链接使用 `./` 返回当前应用目录；GitHub 链接指向本项目。部署你的 fork 时，可在 `src/index.html` 调整或移除源码链接，或按需要增加个人主页入口；相对 CSS/JS 资源不需要改写。修改后重新构建，不要只改 `dist/`。

The brand link uses `./` to return to the application directory. Adjust GitHub links in `src/index.html` for your fork, or add a personal homepage link if needed. Rebuild after source changes.

## 载体与传输 / Carriers and transfer

“合并文件保留扩展名”不代表文件格式被转换，也不保证所有读取器接受尾随数据。图像、PDF、ZIP、音视频及其具体解析器的容忍度不同。即使合并文件能打开，重新保存也可能丢弃附加内容。请用自己的目标软件与合成文件验证。

聊天图片压缩、预览重编码、编辑、裁剪、清理元数据、云服务优化和格式转换都可能改变字节。尽量按普通文件传输，接收后导入配套说明校验。不要从预览图或编辑后另存的文件提取。

## 原 Python 与旧说明 / Legacy interoperability

- 原 Python `encode()` 输出可以在网页中手填 gap 提取，状态为未经校验。
- 网页输出可以由原 Python `decode(gap, ...)` 提取；该函数本身不校验 SHA-256。
- `inlay` / `file-fold` version 1 旧说明继续读取；没有 `payloadSha256` 时不会声称验证通过。
- 新 SHA-256 是 sidecar 的可选扩展，组合文件的字节完全不变。

## 常见错误 / Troubleshooting

| 问题 / Symptom | 排查 / Check |
| --- | --- |
| 没有附加内容 / empty result | 是否选中了原载体，而不是下载的合并文件？gap 是否恰好等于输入大小？ |
| 文件大小不匹配 | 是否配错说明、传输了压缩版本，或下载不完整？ |
| SHA-256 不匹配 | 载荷字节发生变化，或文件与说明不配套。不要强行当作校验成功。 |
| 手填 gap 后结果打不开 | gap 单位是字节；确认原载体大小、原载荷格式与文件是否被改写。 |
| 手机找不到文件 | 查看浏览器下载列表与系统“文件”应用；保存流程由浏览器控制。 |
| 刷新后选择消失 | 用户文件不持久化。重新选择之前下载的文件与说明。 |

如果内置合成示例也失败，请按 issue 模板报告浏览器、大小和步骤，不要上传私人文件。
