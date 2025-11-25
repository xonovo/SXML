# SXML 项目 Copilot 指令

## 项目架构与核心知识
- 本项目基于 SXML 模板引擎，结合响应式数据系统（ES6 Proxy），实现 Web 3.0 风格的前后端分离管理系统。
- 主要目录结构：
  - `pages/`：每个页面包含 `.sxml`（模板）、`.js`（逻辑）、`.css`（样式）、`.json`（配置），同名自动加载。
  - `config/`：多环境配置（dev/test/prod），API 签名映射独立于主配置。
  - `utils/`：工具库，含 SXML 编译器、加密、API、WebSocket、文件上传、国际化等。
  - `dist/`：构建输出，仅部署此目录。

## 关键开发流程
- **开发模式**：`npm run dev` 启动 Express 实时编译服务器，访问 `http://localhost:3000`。
- **生产构建**：`npm run build` 或 `node build.dist.js`，输出到 `dist/`。
- **多环境切换**：通过不同 `config/app.config.{env}.js` 文件，编译时自动选择。
- **页面/项目脚手架**：推荐用 VS Code 扩展 SXML Scaffolder（或任务面板），自动生成页面四件套或最小骨架。
- **API 加密通信**：所有敏感 API 调用通过 `utils/sapi.js`，自动 AES-GCM 加密，密钥映射见 `config/api-sign-map.js`。
- **WebSocket/文件上传**：统一通过 `utils/wsapi.js`、`utils/fileapi.js`，配置项在 `config/app.config.js`。

## 项目约定与模式
- 页面数据必须通过 `setData` 更新，直接赋值不会触发 UI 响应。
- SXML 指令（如 `s:if`, `s:show`, `s:for`）表达式必须用 `{{}}` 包裹。
- 事件处理函数推荐驼峰命名（如 `handleLogin`），避免下划线。
- 所有页面/模块按目录分组，便于扩展和维护。
- 国际化支持占位符，配置在 `locales/`，自动注入到模板和 JS。
- 智能依赖分析：编译时自动检测实际用到的工具库，只引入必要依赖。

## 常用命令与任务
- `npm run dev`：开发服务器（实时编译）
- `npm run build`：生产构建
- `npm run ext:package` / `npm run ext:install`：VS Code 扩展打包/安装
- VS Code 任务面板：`SXML Extension: Package & Install`、`SXML: New Page`、`SXML: New Project`
- `npm run log:server` / `npm run log:view:*`：日志中心（安全/审计/性能）
- `npm run csp:monitor`：CSP 违规监控

## 重要安全与部署
- 配置文件不存储敏感信息，生产环境建议用环境变量注入。
- CSP、加密通信、反爬虫策略已内置，详见 `docs/SECURITY.md`、`docs/EMAIL_ALERT_GUIDE.md`。
- 部署仅需上传 `dist/`，Nginx/Apache/Express 均有示例配置。

## 参考文档
- 详细开发、配置、API、安全、部署等文档见 `docs/` 目录和 `README.md`。
- 推荐优先查阅：`docs/SXML_README.md`、`docs/SXML_COMPILE_GUIDE.md`、`docs/SMART_DEPENDENCY.md`、`docs/PAGE_DEV_GUIDE.md`、`docs/SECURITY.md`。

---
如有不清楚或遗漏的部分，请反馈以便补充完善。
