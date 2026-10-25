# 分享夹层 Inlay / Sharing kit

## 一句话介绍

**夹层 Inlay · 所有文件皆可隐藏**：把任意类型文件追加到载体末尾，在浏览器本地隐藏与无损提取。无需上传，支持离线、SHA-256 校验和 Python CLI。

“所有文件”指载荷类型不限；载体可读性和处理大小取决于文件格式、读取器与浏览器。追加式隐藏不提供密码加密或发送者认证。

**English:** Inlay is a local-first file hider: append any payload type to a carrier, then recover the exact bytes. No uploads, offline use, SHA-256 sidecars and a Python CLI. Carrier readability and file-size limits depend on the format, reader and browser. Hiding is not encryption.

- 源码 / Source: https://github.com/zzbcode/inlay
- 在线试用 / Demo: https://82.156.103.223/inlay/
- 离线包 / Offline: https://github.com/zzbcode/inlay/releases/latest
- 功能示意 / Overview: [overview.svg](overview.svg)
- 界面截图 / Screenshot: [screenshot.png](screenshot.png)

## 中文发布帖草稿

**标题：我做了一个“所有文件皆可隐藏”的本地小工具：夹层 Inlay，开源且无需上传**

最初只有一段 Python：把另一份文件追加到载体末尾，记住原载体的字节大小，需要时再从这个位置取回。现在我把它做成了一个能直接在浏览器使用的小工具。

载荷类型不限：ZIP、PDF、文档或任意二进制文件都可以追加。选择载体与隐藏文件，保存合并结果和 JSON 提取说明；提取时导入说明，即可核对 SHA-256 并还原。文件留在浏览器本地，也提供可直接打开的离线包和 Python CLI。

实现原理是 `[载体字节][隐藏文件字节]`，没有在字节流里悄悄插入新格式。它不是密码加密；部分载体的读取器不接受尾随数据，重新编辑、压缩或转码也可能丢失附加内容。

可以先点“载入示例”，走一遍合并和验证提取流程，不需要准备文件或注册。

试用：https://82.156.103.223/inlay/
源码：https://github.com/zzbcode/inlay

想请大家试试实际的文件与浏览器兼容性，也欢迎反馈流程哪里容易误操作。如果这个工具对你有用，欢迎 Star 收藏。

## 技术文章草稿提纲

**标题：从一段 Python 到开源网页：如何把 ZIP 追加到图片后面，再原样取回**

1. 先演示结果：选择文件、下载合并结果、导入说明、校验还原。
2. 画清楚字节结构，解释 `gap` 是载体的字节数；不把“尾部追加”描述成修改图片像素。
3. 对照 `Blob([carrier, payload])` 与 Python `seek(gap)`。
4. 展示“选错原载体得到空文件”和“大小一样但内容已变”两个真实问题，说明空结果保护与 SHA-256 的作用。
5. 解释为什么不用上传接口，以及为什么离线页面仍受浏览器内存、临时存储与下载限制。
6. 附原始格式、Python CLI、可运行演示、源码和离线包链接，邀请反馈具体场景。

## 15–20 秒演示分镜

| 时间 | 操作 | 画面说明 |
| --- | --- | --- |
| 0–3 秒 | 打开在线页，点“载入示例” | 标题：所有文件皆可隐藏；小字：本地处理，非加密 |
| 3–7 秒 | 点“生成合并文件” | 显示载体、隐藏文件和精确偏移量 |
| 7–11 秒 | 展示结果与说明两个下载入口 | 提醒：两份都要保存 |
| 11–16 秒 | 点“用此结果验证提取”，再点提取 | 显示 SHA-256 校验通过 |
| 16–20 秒 | 展示 GitHub 地址 | 有用欢迎 Star；欢迎兼容性反馈 |

使用合成示例录制，不展示个人文件名、桌面资料或私密目录。视频标题可强调演示结果，避免“绝对安全”“无法检测”“无限大小”等不成立的描述。

## English launch draft

**Title: Show HN: Inlay — append and recover files locally, with SHA-256 sidecars**

I built Inlay from a small Python file-concatenation script. It appends arbitrary payload bytes to a carrier and restores them using the original carrier size as an offset. The web UI runs locally in the browser, with no upload API, accounts or analytics. There is also an offline download and a standard-library Python CLI.

I focused on recovery mistakes: selecting the original carrier can produce an empty result, while same-size corruption needs more than a size check. Inlay makes empty extraction explicit and verifies the payload against a SHA-256 sidecar when supplied.

This is append-based hiding, not encryption or sender authentication. Carrier compatibility varies, and editing or transcoding a file may discard appended bytes. The app currently has a Chinese UI, with an English README and an English Python CLI. The built-in demo can be tried without preparing files.

Demo: https://82.156.103.223/inlay/
Source: https://github.com/zzbcode/inlay

I would appreciate feedback on recovery UX and real carrier/browser compatibility.

## 分享与复盘

先选择自己能持续回复问题的渠道，按受众调整正文：技术社区看原理和边界，工具用户看演示与使用步骤。发布前查看平台和具体版块的规则，并说明自己是作者。上面的文字是草稿，不代表已经发布。

建议先用已有博客写一篇可复现文章，再选择一个相关社区做首发，几天后根据反馈补一篇兼容性或原理说明。英文社区发布前，最好完善英文界面。

[GitHub 默认仓库搜索](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)主要匹配名称、简介和 Topics；README 可用 `in:readme` 搜索。关键词应准确描述现有功能，不把未实现的 AES、LSB 或自动偏移识别列为能力。

[GitHub Traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)提供最近 14 天的访问、独立访客、克隆和来源信息。按周记录 Star 净增、独立访客和来源；CI、维护者操作及自动化也可能影响数据，不能把每次克隆都当成真实新用户。首次发帖后再观察数据，不预设 Star 数量保证。

若选择 [Show HN](https://news.ycombinator.com/showhn.html)，直接提供可试用项目，准备说明为何制作并回答问题，遵守其不组织拉票的要求。
