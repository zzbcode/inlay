夹层 · Inlay 的首次公开开源发行版。文件仅在浏览器本地处理，合并结果保持原始 `carrier + payload` 字节格式，兼容 Python 偏移量提取。

- 可选载荷 SHA-256、完整性状态、错误结果拦截。
- 进度与取消、生成结果复用、合成示例、手机结果定位。
- 中文/英文文档、参考 Python CLI、互通与跨浏览器测试。

下载 `offline.zip` 解压并打开 `index.html` 即可离线使用；`source.zip` 用于开发。请同时下载 `SHA256SUMS` 校验资产。应用的文件拼接功能不是加密，摘要不提供发送者认证。

First public release. Download the offline archive, extract it and open `index.html`; no installation or network connection is required. Source and checksums are included as separate assets. Files stay local. Concatenation is not encryption; checksums do not authenticate the sender.
