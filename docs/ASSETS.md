# 素材来源

- `src/vendor/sha256.js`：js-sha256 0.11.1，按官方 npm 包原样随应用提供，用于本地增量 SHA-256。上游为 https://github.com/emn178/js-sha256/tree/v0.11.1 ，MIT 许可保存在 `src/vendor/LICENSE.js-sha256.txt`；来源及包 SHA-256 见同目录 `README.md`。发布包包含该代码与许可，不访问 CDN。
- `src/assets/icons/*.svg`：Phosphor Icons，来自官方 `@phosphor-icons/react` 2.1.10 的常规字重，使用组件原始路径导出；MIT 许可见同目录 `LICENSE.txt`。运行不请求图标 CDN。
- `src/assets/inlay-logo.png`：内置 ImageGen 生成，依据用户选择的 L3 框架与青色嵌入层概念及 U3 工作台参考制作，透明底，不含字标。
- 品牌资产提示词：保留选定符号的几何身份；上下错位框形笔画包围一条斜切端点的青色水平薄片；外框采用适配深蓝底的白色；仅符号、无文字、无额外容器、无背景、无阴影，平面边缘与透明留白。使用内置 ImageGen，没有 CLI 调用。
- 界面字标是可选择文本；系统无衬线与等宽字体，不加载远程字体。
- 尚未制作正式 SVG 品牌母版，列为后续设计任务，不能把 PNG 改扩展名冒充 SVG。

## Third-party notices

Runtime-vendored third-party code consists of js-sha256 (MIT) and Phosphor icon SVG paths (MIT); their license files ship alongside them. The app uses system fonts. Playwright and Prettier are development dependencies pinned by `package-lock.json`, not browser runtime services. Inlay's own MIT license is in the repository root and is also included in the offline release as `LICENSE.txt`.
