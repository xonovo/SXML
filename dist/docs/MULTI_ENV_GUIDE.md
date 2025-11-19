# 多环境配置指南

## 概述

本系统支持多环境配置，可以在编译时选择不同的环境配置（开发、测试、生产），实现一套代码多环境部署。

---

## 环境类型

### 1. 开发环境 (Development)

**配置文件**: `config/app.config.dev.js`

**特点**:
- API 地址: `http://localhost:8080`
- WebSocket: `ws://localhost:8080/ws`
- 应用标题带 "DEV" 后缀
- CSP 策略宽松（允许 localhost）
- 适合本地开发调试

**使用场景**: 开发人员本地开发、调试

---

### 2. 测试环境 (Test)

**配置文件**: `config/app.config.test.js`

**特点**:
- API 地址: `https://test-api.example.com`
- WebSocket: `wss://test-api.example.com/ws`
- 应用标题带 "TEST" 后缀
- CSP 策略适中
- 适合测试人员测试验证

**使用场景**: QA 测试、功能验证、集成测试

---

### 3. 生产环境 (Production)

**配置文件**: `config/app.config.prod.js`（生产）或 `config/app.config.js`（默认）

**特点**:
- API 地址: `https://api.example.com`
- WebSocket: `wss://api.example.com/ws`
- 应用标题正式版本
- CSP 策略严格
- 性能优化

**使用场景**: 正式线上环境

---

## 配置文件结构

所有环境配置文件具有相同的结构：

```jsonc
{
  "env": "development|test|production",
  "app": {
    "name": "应用名称",
    "title": "应用标题",
    "subtitle": "副标题",
    "description": "应用描述"
  },
  "api": {
    "baseUrl": "API 服务器地址",
    "cspReportUrl": "CSP 违规报告端点",
    "wsUrl": "WebSocket 服务器地址",
    "uploadUrl": "文件上传地址",
    "downloadUrl": "文件下载地址"
  },
  "upload": {
    "maxFileSize": 10485760,
    "allowedTypes": ["..."],
    "chunkSize": 1048576
  },
  "external": {
    "ipGeoProvider": "IP 地理位置服务",
    "ipApiProvider": "IP 查询服务"
  },
  "security": {
    "connectSrc": ["CSP connect-src 白名单"],
    "preconnectHosts": ["DNS 预连接主机"]
  },
  "i18n": {
    "defaultLocale": "zh-CN",
    "fallbackLocale": "en-US"
  },
  "branding": {
    "faviconPath": "图标路径",
    "logoPath": "Logo 路径",
    "logoAlt": "Logo 替代文本"
  }
}
```
说明：实际以 JS UMD 形式分发（同时适配浏览器与 Node）：`(function(root,factory){...})(this,function(){ return { ... } })`。

---

## 编译命令

### 使用命令行参数

```bash
# 开发环境编译
node build.js dev
npm run build:dev

# 测试环境编译
node build.js test
npm run build:test

# 生产环境编译（默认）
node build.js prod
node build.js
npm run build
npm run build:prod

# 完整构建（包含资源复制）
npm run build:dist:dev    # 开发环境
npm run build:dist:test   # 测试环境
npm run build:dist:prod   # 生产环境
npm run build:dist        # 默认生产环境
```

## 开发服务器（实时编译）

```powershell
# 开发环境（默认）
node dev-server-sxml.js
node dev-server-sxml.js dev
npm run dev
npm run dev:dev

# 测试环境
node dev-server-sxml.js test
npm run dev:test

# 生产环境（用于本地模拟线上配置）
node dev-server-sxml.js prod
npm run dev:prod

# 访问
http://localhost:3000/
```

## 开发服务器代理

统一的开发服务器 `dev-server-sxml.js` 已内置 API 代理能力：

```
代理路径: /supper-interface, /scanlogin
代理目标: 读取 `config/app.config.{env}.js` 的 `api.baseUrl`（缺省回退到 `config/app.config.js` 或 `API_TARGET` 环境变量）
```

因此无需使用旧版 `dev-server.js`，所有开发场景均可用同一命令：

```powershell
# 开发环境（默认）
node dev-server-sxml.js
node dev-server-sxml.js dev
npm run dev

# 测试环境
node dev-server-sxml.js test
npm run dev:test

# 生产环境（本地模拟线上配置）
node dev-server-sxml.js prod
npm run dev:prod

# 访问
http://localhost:3000/
```

### 使用环境变量

```bash
# Windows (PowerShell)
$env:NODE_ENV="test"; node build.js

# Windows (CMD)
set NODE_ENV=test && node build.js

# Linux / macOS
NODE_ENV=test node build.js
export NODE_ENV=test
npm run build
```

---

## 编译输出示例

### 开发环境

```bash
$ node build.js dev
═══════════════════════════════════════
  SXML 页面预编译工具
  环境: DEV
═══════════════════════════════════════

✅ 已加载 DEV 环境配置(JS): /config/app.config.dev.js
```

### 测试环境

```bash
$ node build.js test
═══════════════════════════════════════
  SXML 页面预编译工具
  环境: TEST
═══════════════════════════════════════

✅ 已加载 TEST 环境配置(JS): /config/app.config.test.js
```

### 生产环境

```bash
$ node build.js
═══════════════════════════════════════
  SXML 页面预编译工具
  环境: PRODUCTION
═══════════════════════════════════════

✅ 已加载 PROD 环境配置(JS): /config/app.config.prod.js
```

---

## 配置差异对比

| 配置项 | 开发环境 | 测试环境 | 生产环境 |
|--------|---------|---------|---------|
| **API 地址** | `http://localhost:8080` | `https://test-api.example.com` | `https://api.example.com` |
| **WebSocket** | `ws://localhost:8080/ws` | `wss://test-api.example.com/ws` | `wss://api.example.com/ws` |
| **应用标题** | "Your App (Dev)" | "Your App (Test)" | "Your App" |
| **CSP 策略** | 宽松（允许 localhost） | 适中 | 严格 |
| **调试信息** | 详细 | 适中 | 最少 |

---

## 环境切换工作流

### 场景 1: 本地开发

```bash
# 1. 编辑开发配置
vim config/app.config.dev.json

# 2. 编译开发版本
npm run build:dev

# 3. 启动开发服务器
npm run dev

# 4. 访问 http://localhost:3000
```

### 场景 2: 部署测试环境

```bash
# 1. 编辑测试配置（修改测试服务器地址）
vim config/app.config.test.json

# 2. 完整构建测试版本
npm run build:dist:test

# 3. 上传 dist/ 目录到测试服务器
scp -r dist/* user@test-server:/var/www/html/

# 4. 访问测试环境验证
```

### 场景 3: 部署生产环境

```bash
# 1. 编辑生产配置（确认生产域名）
vim config/app.config.prod.json

# 2. 完整构建生产版本
npm run build:dist:prod

# 3. 上传 dist/ 目录到生产服务器
scp -r dist/* user@prod-server:/var/www/html/

# 4. 访问生产环境验证
```

---

## 配置管理最佳实践

### 1. 版本控制

```bash
# ✅ 提交配置模板
git add config/app.config.*.json

# ❌ 不要提交敏感信息
# 如果配置包含密钥，使用 .gitignore 排除：
echo "config/app.config.local.json" >> .gitignore
```

### 2. 配置验证

编译前检查配置文件是否存在：

```bash
# 检查配置文件
ls config/app.config.*.json

# 输出：
# app.config.dev.json
# app.config.test.json
# app.config.prod.json
# app.config.json
```

### 3. 环境隔离

不同环境使用不同的：
- API 服务器地址
- 数据库连接
- 第三方服务密钥
- CDN 域名
- 日志级别

### 4. 安全建议

⚠️ **生产环境配置检查清单**：

- [ ] API 地址使用 HTTPS
- [ ] WebSocket 使用 WSS
- [ ] CSP 策略严格配置
- [ ] 禁用调试信息
- [ ] 移除测试账号
- [ ] 启用错误监控
- [ ] 配置速率限制

---

## 常见问题

### Q: 如何添加新环境（如预发布环境）？

**A**: 创建新的配置文件 `config/app.config.staging.json`，然后：

```bash
# 使用新环境编译
node build.js staging

# 或添加到 package.json
"build:staging": "node build.js staging"
```

### Q: 环境参数优先级？

**A**: 优先级从高到低：

1. 命令行参数: `node build.js test`
2. 环境变量: `NODE_ENV=test`
3. 默认值: `production`

### Q: 如何在运行时获取当前环境？

**A**: 编译后的页面会注入配置到 `window.CONFIG`：

```javascript
// 在浏览器中
console.log(window.CONFIG.env);  // "test"
console.log(window.CONFIG.api.baseUrl);  // "https://test-api.example.com"
```

### Q: 配置文件缺失会怎样？

**A**: 编译器会自动回退到默认配置并显示警告：

```
⚠️  配置文件不存在: config/app.config.xyz.json
✅ 已加载默认配置: config/app.config.json
```

---

## 高级用法

### 动态配置注入

编译时会将配置注入到 HTML 和 JavaScript 中：

```html
<!-- HTML 中的占位符会被替换 -->
<title>{{APP_TITLE}}</title>
<!-- 编译后 -->
<title>Your App Management Entrance - TEST</title>

<!-- CSP 策略自动生成 -->
<meta http-equiv="Content-Security-Policy" 
      content="connect-src 'self' https://test-api.example.com ...">
```

### 配置继承

创建基础配置 `app.config.base.json`，其他环境继承：

```javascript
// 构建脚本中
const baseConfig = require('./config/app.config.base.json');
const envConfig = require(`./config/app.config.${env}.json`);
const finalConfig = { ...baseConfig, ...envConfig };
```

---

## 总结

多环境配置系统提供了：

✅ **灵活性** - 一套代码，多环境部署  
✅ **安全性** - 环境隔离，配置独立  
✅ **便捷性** - 简单命令切换环境  
✅ **可维护性** - 集中管理，易于更新  
✅ **可扩展性** - 轻松添加新环境  

**开发者**: King, Rainbow Haruko
