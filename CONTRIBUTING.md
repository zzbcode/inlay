# 贡献指南 · Contributing

问题与 PR 可使用中文或英文。先搜索现有 issue；较大的功能或格式改变请先描述使用场景与兼容方案。

## 开发

Node.js 20+；Python 3.9+ 用于参考 CLI 和互通测试。开发依赖由 lockfile 固定。

```sh
npm ci
npm test
npm run build
npm start
npx playwright install --with-deps
npm run test:browser
```

`src/` 是应用源码，`dist/` 是构建产物；请修改源码。应用必须保持静态、离线可用，运行时不能新增外部请求、账号、上传或文件持久化。开发依赖不应打包为无关的运行时代码。

## 必须保持的行为

- 原始输出精确为 `[carrier bytes][payload bytes]`；`gap` 等于载体字节数，不插入隐式头、尾标、JSON 或分隔符。
- 既有 `inlay` / `file-fold` version 1 说明继续可读。无摘要说明应标记未经校验，不能冒充校验成功。
- 非法偏移量、说明大小不一致或摘要不匹配应给出可操作错误。不要提供错误文件的下载。
- 输入变化或取消后，旧异步任务不能发布结果；废弃的对象 URL 应释放。
- UI 修改检查桌面、手机、键盘与焦点，不以颜色作为唯一状态提示。

算法修改应增加有行为价值的测试：二进制往返、SHA-256 测试向量、边界长度、空文件、Python 互通或实际失败场景。交互修改检查真实浏览器工作流和结果失效。不要仅复制实现写测试。

## 报告问题

请提供系统、浏览器版本、操作步骤、文件**大小**、使用手填 gap 还是说明，以及预期/实际行为。优先使用内置示例或自己生成的公开测试数据。不要提交私密 PDF、身份证件、原始聊天附件、密钥、令牌、带个人信息的说明 JSON 或下载文件。

安全问题使用 [SECURITY.md](SECURITY.md) 的私密渠道。不要先公开可利用的漏洞细节或私人文件。

## Pull request

说明具体问题、最终行为与验证结果；保持修改范围集中。若界面有变化，请附不含私人数据的桌面/手机截图。新增第三方代码需保留许可证，并更新 `docs/ASSETS.md` 或相应通知。

密码加密、自动识别封装、多文件归档等需要单独设计格式和威胁模型。不能通过添加一个密码输入框，就把拼接隐藏描述成加密。

提交贡献即表示你有权按项目的 MIT 许可提交相应代码。贡献者应尊重彼此，围绕事实与使用场景讨论。

## English quick guide

Issues and PRs are welcome in English or Chinese. Use the commands above, modify `src/`, and keep raw byte compatibility and offline operation. Add meaningful regression coverage, use synthetic files, and never commit credentials or personal content. Explain the user-visible change and its validation. Discuss new formats or encryption designs first. Report security issues privately using the security policy.
