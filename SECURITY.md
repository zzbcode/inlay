# 安全政策 · Security policy

## 私密报告 / Private reporting

请通过 [GitHub 私密漏洞报告](https://github.com/zzbcode/inlay/security/advisories/new)报告影响文件正确性、隐私、下载内容或页面执行的安全问题。请勿先创建包含漏洞细节的公开 issue。

Use [GitHub private vulnerability reporting](https://github.com/zzbcode/inlay/security/advisories/new) for security issues. If that option is temporarily unavailable, open an issue that only asks for a private contact channel; do not disclose exploit details or attach private files.

报告应尽量包括影响、最小复现、合成测试文件、浏览器/系统、受影响的提交或发行版，以及建议修复。请勿上传真实私人文件、密钥或访问令牌。维护者为个人项目贡献者，不承诺固定响应时间。

## 支持范围 / Scope

维护主要针对默认分支和最新发行版。确认的问题会修复在默认分支，并根据影响发布修复。旧版是否回补由实际风险与维护能力决定。

Maintenance focuses on the default branch and latest release. Fixes land on the default branch; release timing and backports depend on impact and maintainer capacity.

## 产品的安全边界 / Security boundaries

- Inlay 在本地拼接与切片文件，不提供加密、密码保护、发送者认证、恶意软件扫描或隐写不可检测保证。
- SHA-256 核对载荷是否与提供的说明一致；不覆盖载体。可同时修改文件与说明的人也可以替换摘要，因此它不是身份认证。
- 文件名、大小、gap 和摘要存在明文 sidecar 中；说明本身可能透露文件信息。
- 原始文件可以包含任意内容。Inlay 不执行载荷，但用户下载后打开文件仍由其系统和应用处理。
- 应用不上传或持久化用户文件。静态托管服务可能有普通访问日志；这与上传文件内容不同。浏览器扩展、受损设备、恶意托管页面或被篡改的应用代码不在本地处理承诺能消除的范围内。
- 取消会停止应用继续处理并废弃结果；不宣称对浏览器内存、临时存储或操作系统缓存执行安全擦除。

Inlay is a local concatenation tool, not an encryption or malware protection system. Checksums detect differences against a supplied recipe, not sender identity. Recipes contain plaintext metadata. The app does not execute payloads; opening a downloaded file remains the user's system's responsibility. Cancellation does not promise secure erasure of browser or OS memory and temporary storage.
