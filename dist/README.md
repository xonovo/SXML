# SXML框架开发文档

> SXML开源框架项目
>
> **全新的适应 Web 3.0 开发框架** - 基于 SXML 模板引擎 + 响应式数据系统

**开发者**: Rainbow Haruko

**📖 [在线文档](pages/docs/docs.html)** | **🚀 [快速开始](#快速开始)** | **💡 [GitHub](https://github.com/XujueKing/SXML)**

---

## 📚 目录

1. [项目简介](#项目简介)
2. [配置指南](#配置指南)
3. [快速开始](#快速开始)
4. [核心功能](#核心功能)
5. [开发指南](#开发指南)
6. [安全配置](#安全配置)
7. [构建部署](#构建部署)
8. [观测与日志](#观测与日志)
9. [相关文档](#相关文档)
10. [API 参考](#api-参考)
11. [最佳实践](#最佳实践)
12. [更新日志](#更新日志)

---

## 项目简介

本系统采用全新的 Web 3.0 开发模式，提供：

- **SXML 模板引擎** - 声明式模板语法
- **响应式数据系统** - 基于 ES6 Proxy 的自动 UI 更新
- **自动资源加载** - 同名 CSS/JS/JSON 自动加载
- **预编译构建** - 零运行时延迟，SEO 友好
- **加密通信** - AES-GCM 加密的 API 调用

### 技术栈

- **模板引擎**: SXML (声明式模板语言)
- **响应式**: Proxy-based Reactive System
- **加密**: AES-GCM + MD5 动态密钥
- **构建工具**: Node.js 预编译脚本
- **开发服务器**: Express.js 实时编译

---

## 配置指南

### 多环境配置 ⭐

系统支持多环境配置（开发、测试、生产），可在编译时选择不同的环境配置：

```bash
# 开发环境编译
npm run build:dev

# 测试环境编译
npm run build:test

# 生产环境编译（默认）
npm run build:prod
npm run build
```

**环境配置文件（JS UMD）**：
- `config/app.config.dev.js` - 开发环境（localhost）
- `config/app.config.test.js` - 测试环境（test-api.example.com）
- `config/app.config.prod.js` - 生产环境（api.example.com）
- `config/app.config.js` - 默认配置（fallback）

**环境差异**：
| 配置项 | 开发 | 测试 | 生产 |
|--------|-----|-----|-----|
| API 地址 | `localhost:8080` | `test-api.example.com` | `api.example.com` |
| 应用标题 | "Your App (Dev)" | "Your App (Test)" | "Your App" |
| CSP 策略 | 宽松 | 适中 | 严格 |

> 详见 **[多环境配置指南](docs/MULTI_ENV_GUIDE.md)**

### 应用配置文件

在使用本系统前，**必须先编辑配置文件** `config/app.config.js`（或 `config/app.config.{env}.js`）以设置您的应用品牌、域名和 API 地址。

#### 配置文件位置
```
config/app.config.js
```

#### 配置项说明

```jsonc
{
  "app": {
    "name": "Your App Name",              // 应用名称
    "title": "Your App Management",       // 应用标题
    "subtitle": "Management System",      // 副标题
    "description": "Your app description" // 应用描述
  },
  "api": {
    "baseUrl": "https://api.example.com", // 生产环境 API 地址
    "cspReportUrl": "/api/csp-report"     // CSP 违规报告端点
  },
  "external": {
    "ipGeoProvider": "https://ipapi.co",  // IP 地理位置服务
    "ipApiProvider": "https://api.ipify.org" // IP 查询服务
  },
  "security": {
    "connectSrc": [                       // CSP connect-src 白名单
      "https://api.example.com",
      "https://ipapi.co",
      "https://api.ipify.org"
    ],
    "preconnectHosts": [                  // DNS 预连接主机
      "https://api.example.com"
    ]
  },
  "i18n": {
    "defaultLocale": "zh-CN",             // 默认语言
    "supportedLocales": ["zh-CN", "en-US"]
  }
}
```

说明：配置以 JS UMD 形式提供（同时支持浏览器与 Node）。浏览器端由编译器预注入 `window.APP_CONFIG`，`utils/config.js` 会直接使用该对象，无需再发起 JSON 请求。

#### 模板占位符

配置文件中的值会自动替换以下占位符：

- `{{APP_NAME}}` - 应用名称（如 "Your App"）
- `{{APP_TITLE}}` - 应用标题（如 "Your App Management"）
- `{{APP_SUBTITLE}}` - 副标题（如 "Management System"）

这些占位符用于：
- 国际化文件（`locales/*.json`）
- 页面配置（`pages/*/**.json`）
- 页面模板（`pages/*/*.sxml`）
- HTML meta 标签（编译时注入）

#### 配置示例

```bash
# 1. 复制配置模板（如需要）
cp config/app.config.js config/app.config.prod.js

# 2. 编辑配置文件
# 将 api.baseUrl 改为您的 API 服务器地址
# 将 app.name 改为您的应用名称
# 更新 security.connectSrc 添加您信任的域名

# 3. 编译构建（生产环境将注入 app.config.prod.js）
npm run build

# 配置会在编译时自动注入到 HTML 和 JavaScript 中
```

⚠️ **重要提示**：
- 配置文件包含在构建产物中，不要在其中存储敏感信息（如密钥、密码）
- 生产环境建议通过环境变量或服务端配置管理敏感配置
- CSP 配置必须与实际使用的外部服务匹配，否则会被浏览器拦截

### API 签名映射配置

**为什么需要独立配置？** 不同项目可能使用不同的 API 接口密钥映射，因此将其分离到独立的配置文件中，方便定制。

#### 配置文件位置
```
config/api-sign-map.js
```

#### 配置格式

```javascript
// API 接口签名密钥映射
const API_SIGN_MAP = {
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',  // 登录接口
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',  // 用户信息
  // 添加更多接口映射...
};

// 导出到全局
window.API_SIGN_MAP = API_SIGN_MAP;
```

#### 使用说明

1. **接口编号**：每个接口都有唯一的编号（如 `I00002`）
2. **MD5 密钥**：对应该接口的 32 位 MD5 签名密钥
3. **自动加载**：系统会在 `config.js` 加载时自动读取此映射

#### 配置步骤

```bash
# 1. 编辑 API 签名映射
# 根据您的后端 API 接口文档，配置每个接口的签名密钥
vim config/api-sign-map.js

# 2. 不需要修改其他文件
# 系统会自动在构建时包含此文件

# 3. 重新构建
npm run build
```

📖 **详细文档**：参见 [API 签名映射配置指南](docs/API_SIGN_MAP_GUIDE.md)

---

## 快速开始

### 环境要求

- Node.js >= 14.0
- 现代浏览器（支持 ES6 Proxy）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 启动开发服务器（实时编译 SXML）
npm run dev

# 访问：http://localhost:3000
```

### 生产构建

```bash
# 编辑配置文件（必须先完成此步骤）
# 编辑 config/app.config.json 设置您的品牌和域名

# 一键构建（预编译 + 资源收集）
npm run build

# 构建输出：dist/ 目录
```

### 项目结构

```
后台系统/
├── config/                   # 配置文件 ⭐
│   ├── app.config.json      # 应用配置（品牌/域名/API）
│   └── api-sign-map.js      # API 接口签名映射 ⭐
├── pages/                    # 页面源码
│   ├── index/               # 首页（SXML 模板 + 自动成为站点根入口）
│   │   ├── index.sxml       # SXML 模板
│   │   ├── index.js         # 页面逻辑
│   │   ├── index.css        # 页面样式
│   │   └── index.json       # 页面配置
│   ├── login/               # 登录页面
│   │   ├── login.sxml       # SXML 模板
│   │   ├── login.js         # 页面逻辑
│   │   ├── login.css        # 页面样式
│   │   └── login.json       # 页面配置
│   ├── myInfo/              # 个人信息页
│   └── demoNav/             # 导航演示页（开发参考）
├── utils/                    # 工具库
│   ├── config.js            # 配置加载器 ⭐
│   ├── sxml.parser.js       # SXML 解析器
│   ├── sxml.compiler.js     # SXML 编译器（支持配置注入）⭐
│   ├── reactive.js          # 响应式系统
│   ├── page.loader.js       # 页面加载器
│   ├── sapi.js              # 加密 API 调用
│   ├── wsapi.js             # WebSocket API 管理器 ⭐
│   ├── fileapi.js           # 文件上传下载 API ⭐
│   ├── aes.js               # AES 加密
│   ├── md5.js               # MD5 哈希
│   └── i18n.js              # 国际化（支持占位符替换）⭐
├── css/                      # 全局样式
├── images/                   # 图片资源
├── locales/                  # 多语言文件（使用占位符）⭐
├── dist/                     # 构建输出目录
│   ├── pages/               # 编译后的页面
│   ├── utils/               # 运行时依赖 JS
│   ├── css/                 # 样式资源
│   ├── images/              # 图片资源
│   ├── locales/             # 多语言资源
│   ├── config/              # 配置文件 ⭐
│   └── index.html           # 首页（由 pages/index/index.html 复制而来）
├── build.js                  # SXML 预编译脚本
├── build.dist.js             # 生产构建脚本
├── dev-server-sxml.js        # 开发服务器（SXML 实时编译 + API 代理）
└── package.json
```

---

## 核心功能

### 1. 智能依赖系统 ⭐

编译器内置智能依赖分析，**自动检测页面实际使用的工具库**，只引入必要的依赖，显著提高加载速度。

#### 工作原理

编译时自动扫描代码特征：

```javascript
// 检测到 $( → 自动引入 jQuery
$("#btn").click(() => {});

// 检测到 sapi → 自动引入 sapi.js + aes.js + md5.js
sapi.post('I00002', { username, password });

// 检测到 i18n → 自动引入 i18n.js
const title = i18n.t('app.title');
```

#### 性能提升

| 页面类型 | 引入脚本数 | 对比旧系统 |
|---------|----------|-----------|
| 简单页面 | 4 个 | 减少 **71%** ⬇️ |
| 登录页面 | 7 个 | 减少 **50%** ⬇️ |
| 复杂页面 | 11 个 | 减少 **21%** ⬇️ |

**预估节省加载时间**：简单页面约 **5 秒** ⏱️（3G 网络）

> 详见 **[智能依赖系统文档](docs/SMART_DEPENDENCY.md)**

---

### 2. SXML 模板引擎

#### 2.1 数据绑定

使用 Mustache 语法 `{{}}` 绑定数据：

```xml
<view class="user">
  <text>用户名：{{userName}}</text>
  <text>积分：{{user.score}}</text>
</view>
```

```javascript
Page({
  data: {
    userName: '张三',
    user: { score: 100 }
  }
});
```

#### 2.2 条件渲染

**s:if / s:else-if / s:else** - 控制 DOM 元素的添加/移除：

```xml
<view s:if="{{score >= 90}}">优秀</view>
<view s:else-if="{{score >= 60}}">及格</view>
<view s:else>不及格</view>
```

**s:show** - 控制元素的显示/隐藏（使用 `display: none`）：

```xml
<view s:show="{{isLogin}}">欢迎回来</view>
<view s:show="{{!isLogin}}">请先登录</view>
```

> **重要区别**：
> - `s:if`：编译时移除 DOM，不支持运行时动态切换（预编译页面）
> - `s:show`：保留 DOM，支持响应式切换，推荐用于动态显示/隐藏

#### 2.3 列表渲染

```xml
<view s:for="{{userList}}" s:for-item="user" s:for-index="idx" s:key="id">
  <text>{{idx + 1}}. {{user.name}} - {{user.age}}岁</text>
</view>
```

```javascript
Page({
  data: {
    userList: [
      { id: 1, name: '张三', age: 25 },
      { id: 2, name: '李四', age: 30 }
    ]
  }
});
```

#### 2.4 属性绑定

```xml
<input type="text" :placeholder="hint" :value="username" />
<image :src="avatarUrl" :alt="userName" />
<button :disabled="!canSubmit">提交</button>
```

#### 2.5 事件绑定

```xml
<button bind:tap="handleLogin">登录</button>
<input bind:input="onInput" bind:focus="onFocus" />
<form bind:submit="onSubmit">
  <button form-type="submit">提交</button>
</form>
```

```javascript
Page({
  handleLogin(e) {
    console.log('点击登录', e);
  },
  
  onInput(e) {
    this.setData({
      inputValue: e.target.value
    });
  }
});
```

### 3. 响应式数据系统

#### 3.1 Page() 函数

```javascript
Page({
  // 页面数据（自动转为响应式）
  data: {
    keyStatus: false,
    userName: '张三'
  },
  
  // 生命周期
  onLoad() {
    console.log('页面加载');
  },
  
  onReady() {
    console.log('页面渲染完成');
    this.loadData();
  },
  
  onShow() {
    console.log('页面显示');
  },
  
  onHide() {
    console.log('页面隐藏');
  },
  
  onUnload() {
    console.log('页面卸载');
  },
  
  // 自定义方法
  loadData() {
    // 使用 setData 更新数据，触发 UI 自动更新
    this.setData({
      keyStatus: true,
      userName: '李四'
    });
  }
});
```

#### 3.2 setData 响应式更新

```javascript
// ✅ 正确：使用 setData
this.setData({ keyStatus: true });

// ❌ 错误：直接赋值（不会触发 UI 更新）
this.data.keyStatus = true;
```

**setData 会自动：**
1. 更新 `this.data` 中的数据
2. 触发响应式系统的依赖更新
3. 自动刷新绑定了该数据的 DOM 元素

```

### 4. 自动资源加载

只需在 HTML 中引入 `page.loader.js`，同名资源自动加载：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>登录</title>
  <!-- 只需这一行，CSS/JS/JSON 自动加载 -->
  <script src="../../utils/page.loader.js"></script>
</head>
<body>
  <!-- 页面内容 -->
</body>
</html>
```

**自动加载规则：**
- `login.html` → 自动加载 `login.css`、`login.js`、`login.json`
- `myInfo.html` → 自动加载 `myInfo.css`、`myInfo.js`、`myInfo.json`

---

### 5. 国际化支持

```javascript
// utils/i18n.js
const i18n = {
  t(key) {
    const lang = localStorage.getItem('lang') || 'zh-CN';
    const translations = {
      'zh-CN': {
        'login.title': '登录',
        'login.submit': '提交'
      },
      'en-US': {
        'login.title': 'Login',
        'login.submit': 'Submit'
      }
    };
    return translations[lang][key] || key;
  }
};
```

在页面中使用：

```javascript
Page({
  data: {
    title: i18n.t('login.title')
  }
});
```

---

## 开发指南

### 使用 VS Code 扩展（SXML Scaffolder）

为更高效地创建页面/项目，推荐安装本仓库自带的 VS Code 扩展：`SXML Scaffolder`。

- 命令面板：
  - SXML: 新建页面（自动生成 .sxml/.js/.css/.json 四件套）
  - SXML: 新建空白项目（调用脚本生成最小骨架）
- 一键打包/安装扩展（在仓库根目录）：
  - npm 脚本：`npm run ext:package`，`npm run ext:install`
  - 或在 VS Code 任务面板运行："SXML Extension: Package & Install"
- 说明：扩展 VSIX 的打包发生在 `vscode-extension/sxml-scaffolder/` 目录，且该扩展的 `package.json` 使用 `files` 白名单（仅包含 `extension.js`、`package.json`、`README.md`），不会把仓库根目录的 `images/` 等无关内容打入 VSIX。

### 创建新页面

1. **在 `pages/` 下创建页面目录**

```bash
pages/
  newPage/
    ├── newPage.sxml      # 模板
    ├── newPage.js        # 逻辑
    ├── newPage.css       # 样式
    └── newPage.json      # 配置（可选）
```

2. **编写 SXML 模板** (`newPage.sxml`)

```xml
<view class="container">
  <text class="title">{{pageTitle}}</text>
  
  <view s:for="{{items}}" s:for-item="item" s:key="id">
    <text>{{item.name}}</text>
  </view>
  
  <button bind:tap="handleClick">点击</button>
</view>
```

3. **编写页面逻辑** (`newPage.js`)

```javascript
Page({
  data: {
    pageTitle: '新页面',
    items: [
      { id: 1, name: '项目1' },
      { id: 2, name: '项目2' }
    ]
  },
  
  onLoad() {
    console.log('页面加载');
  },
  
  handleClick() {
    this.setData({
      pageTitle: '已点击'
    });
  }
});
```

4. **编写样式** (`newPage.css`)

```css
.container {
  padding: 20px;
}

.title {
  font-size: 24px;
  font-weight: bold;
}
```

5. **开发模式预览**

```bash
npm run dev
# 访问：http://localhost:3000/pages/newPage/newPage.html
```

### SXML 语法规范

#### ✅ 推荐写法

```xml
<!-- 条件渲染 -->
<view s:if="{{isLogin}}">已登录</view>
<view s:show="{{visible}}">显示</view>

<!-- 列表渲染 -->
<view s:for="{{list}}" s:for-item="item">{{item.name}}</view>

<!-- 属性绑定 -->
<input :value="{{inputValue}}" :placeholder="{{hint}}" />

<!-- 事件绑定 -->
<button bind:tap="handleClick">点击</button>
```

#### ⚠️ 注意事项

1. **指令表达式必须用 `{{}}` 包裹**
   ```xml
   <!-- ✅ 正确 -->
   <view s:if="{{isLogin}}">...</view>
   
   <!-- ❌ 错误 -->
   <view s:if="isLogin">...</view>
   ```

2. **s:if vs s:show 的选择**
   - 需要运行时动态切换 → 使用 `s:show`
   - 仅在构建时决定是否显示 → 使用 `s:if`

3. **事件处理函数命名**
   ```javascript
   // ✅ 推荐：驼峰命名
   handleLogin() { }
   onInputChange() { }
   
   // ❌ 避免：下划线命名
   handle_login() { }
   ```

### 响应式开发最佳实践

#### ✅ 使用 setData 更新数据

```javascript
Page({
  data: {
    count: 0
  },
  
  increment() {
    // ✅ 正确：触发响应式更新
    this.setData({
      count: this.data.count + 1
    });
  }
});
```

#### ❌ 避免直接修改 data

```javascript
Page({
  data: {
    user: { name: '张三' }
  },
  
  updateUser() {
    // ❌ 错误：不会触发 UI 更新
    this.data.user.name = '李四';
    
    // ✅ 正确
    this.setData({
      user: { ...this.data.user, name: '李四' }
    });
  }
});
```

#### 批量更新优化

```javascript
// ✅ 推荐：批量更新
this.setData({
  name: '新名称',
  age: 25,
  isVip: true
});

// ❌ 避免：多次调用 setData
this.setData({ name: '新名称' });
this.setData({ age: 25 });
this.setData({ isVip: true });
```

---

## 安全配置

### 加密通信

系统使用 **AES-GCM** 加密保护 API 通信：

```javascript
// 自动加密请求和解密响应
const data = await window.superAPI.request('I00002', {
  userEmail: 'user@example.com',
  userPassword: 'hashed_password'
});
```

**加密流程**：
1. 动态密钥：`MD5(baseKey + timestamp)`
2. IV 生成：基于 GMT+0 星期几偏移
3. AES-GCM 加密请求体
4. 服务端响应解密

详见：**[SuperAPI 文档](docs/SAPI_README.md)**

### 4. WebSocket API

支持实时双向通信，提供完整的 WebSocket 连接管理功能。

#### 特性

- ✅ 自动重连机制
- ✅ 心跳检测（防止连接超时）
- ✅ 消息队列（离线缓存）
- ✅ 事件系统（open/close/message/error）
- ✅ 加密通信支持（可选）
- ✅ 连接状态管理

#### 快速使用

```javascript
// 连接到 WebSocket 服务器（URL 从配置文件读取）
wsapi.connect();

// 监听连接成功
wsapi.on('open', () => {
  console.log('WebSocket connected');
  
  // 发送消息
  wsapi.send({
    type: 'subscribe',
    channel: 'notifications'
  });
});

// 监听消息
wsapi.on('message', (data) => {
  console.log('Received:', data);
  // 处理实时数据
});

// 监听断开
wsapi.on('close', () => {
  console.log('Disconnected, auto-reconnecting...');
});
```

#### 配置 WebSocket URL

编辑 `config/app.config.json`：

```json
{
  "api": {
    "baseUrl": "https://api.example.com",
    "wsUrl": "wss://api.example.com/ws"
  },
  "security": {
    "connectSrc": [
      "https://api.example.com",
      "wss://api.example.com"
    ]
  }
}
```

详见：**[WebSocket API 文档](docs/WSAPI_README.md)**

#### 安全增强（已内置）

- 强制 WSS：在 HTTPS 场景自动升级为 `wss://`，可通过配置显式强制
- 认证握手：连接建立时发送令牌进行鉴权，未认证前禁止发送业务消息
- 消息签名校验：可开启服务端签名与前端验签，丢弃未签名/验签失败的消息
- 更丰富的事件：`authenticated`、`authFailed`、`signatureError` 等
- 参考实践与配置示例：见 **[WSAPI 安全指南](docs/WSAPI_SECURITY_GUIDE.md)** 与 `examples/websocket-security-config.js`

### 5. 文件上传下载

支持文件上传、下载、预览，提供文件验证、图片压缩、分片上传等功能。

#### 特性

- ✅ 文件类型和大小验证
- ✅ 图片自动压缩（可配置）
- ✅ 分片上传（大文件）
- ✅ 批量上传
- ✅ 上传进度监控
- ✅ 文件下载和预览
- ✅ 支持拖拽上传

#### 快速使用

```javascript
// 上传文件
const result = await fileapi.upload(file, {
  onProgress: (percent, loaded, total) => {
    console.log(`上传进度: ${percent}%`);
  },
  data: {
    category: 'avatar',
    userId: '123'
  }
});

// 下载文件
await fileapi.download(fileId, {
  filename: 'document.pdf'
});

// 预览文件
fileapi.preview(fileId);

// 获取文件 URL（用于 img src）
const url = fileapi.getFileUrl(fileId);
document.getElementById('avatar').src = url;
```

#### 配置上传限制

编辑 `config/app.config.json`：

```json
{
  "api": {
    "uploadUrl": "https://api.example.com/upload",
    "downloadUrl": "https://api.example.com/download"
  },
  "upload": {
    "maxFileSize": 10485760,
    "allowedTypes": ["image/jpeg", "image/png", "application/pdf"],
    "allowedExtensions": [".jpg", ".png", ".pdf"],
    "imageMaxWidth": 4096,
    "imageMaxHeight": 4096,
    "chunkSize": 1048576,
    "enableChunkUpload": true
  }
}
```

详见：**[文件 API 文档](docs/FILEAPI_README.md)**

### 6. Content Security Policy (CSP)

系统已配置严格的 CSP 策略，使用 **Nonce** 机制防止 XSS 攻击：

```html
<!-- 自动生成的 nonce -->
<meta http-equiv="Content-Security-Policy" content="
  script-src 'self' 'nonce-jWXI77fIdXiXxA7lq+pylw==';
  style-src 'self' 'nonce-jWXI77fIdXiXxA7lq+pylw==';
">

<script nonce="jWXI77fIdXiXxA7lq+pylw==">
  // 只有带正确 nonce 的脚本才能执行
</script>
```

**安全特性**：
- ✅ 移除 `unsafe-inline` 和 `unsafe-eval`
- ✅ 自动为内联脚本/样式添加 nonce
- ✅ CSP 违规自动报告
- ✅ 反爬虫检测（Headless 浏览器、User-Agent 过滤）

详见：**[安全配置指南](docs/SECURITY.md)**

#### 实时告警（Email / 钉钉 / Slack）

内置的 `CSP` 监控支持实时告警：

- 服务脚本：`utils/csp-report-handler.js`
- 配置路径：`config/app.config.json` 下的 `alert.email` 等配置段（可用环境变量注入敏感字段）
- 指南：详见 **[EMAIL_ALERT_GUIDE.md](docs/EMAIL_ALERT_GUIDE.md)**，敏感信息处理参见 **[EMAIL_PASSWORD_SECURITY.md](docs/EMAIL_PASSWORD_SECURITY.md)**

### 反爬虫策略

客户端自动检测并阻止自动化工具：

```javascript
// 自动检测 (已内置)
- navigator.webdriver (Selenium)
- plugins.length === 0 (Puppeteer/Playwright)
- 爬虫 User-Agent 关键词
- 异常屏幕尺寸
- Canvas 设备指纹
```

检测到机器人时自动显示：
```
Access Denied
Automated access is not allowed.
```

### CSP 违规监控

**启动监控服务**：
```bash
npm run csp:monitor
```

**查看违规日志**：
```bash
# Nginx 日志
sudo tail -f /var/log/nginx/csp-violations.log

# Node.js 服务
pm2 logs csp-monitor
```

详见：**[部署指南](docs/DEPLOYMENT.md)**

---

## 构建部署

### 开发模式

开发模式下，访问 `.html` 文件时服务器会自动：
1. 查找同名 `.sxml` 文件
2. 实时编译为 HTML
3. 返回编译结果

```bash
npm run dev
```

访问：`http://localhost:3000/`  
实际编译：`pages/login/login.sxml` → HTML

### 生产构建

#### 一键构建脚本

```bash
npm run build
# 或
node build.dist.js
```

**构建流程：**

1. **清空 `dist/` 目录**
2. **预编译所有 SXML 页面** → `dist/pages/`
3. **复制静态资源** → `dist/css/`、`dist/images/`、`dist/locales/`
4. **扫描并复制 utils 依赖** → `dist/utils/`
5. **复制首页** → `dist/index.html`

**输出结构：**

```
dist/
├── index.html                  # 首页
├── pages/                      # 所有编译后的页面
│   ├── login/
│   │   ├── login.html
│   │   ├── login.js
│   │   ├── login.css
│   │   └── login.json
│   └── myInfo/
│       ├── myInfo.html
│       ├── myInfo.js
│       ├── myInfo.css
│       └── myInfo.json
├── utils/                      # 运行时依赖
│   ├── reactive.js
│   ├── sxml.parser.js
│   ├── page.loader.js
│   ├── aes.js
│   ├── md5.js
│   └── ...
├── css/                        # 全局样式
├── images/                     # 图片资源
└── locales/                    # 多语言文件
```

### 部署到生产服务器

#### 方式 1: 静态文件服务器

**Nginx 配置示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /var/www/ice/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 缓存静态资源
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Apache 配置示例：**

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/ice/dist
    
    <Directory /var/www/ice/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # SPA 路由支持
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # 缓存静态资源
    <FilesMatch "\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf)$">
        Header set Cache-Control "max-age=31536000, public"
    </FilesMatch>
</VirtualHost>
```

#### 方式 2: Node.js 服务器

```javascript
// server.js
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

#### 部署步骤

1. **构建生产版本**
   ```bash
   npm run build
   ```

2. **上传 `dist` 目录到服务器**
   ```bash
   scp -r dist/ user@server:/var/www/ice/
   ```

3. **配置 Web 服务器**（Nginx/Apache）

4. **访问应用**
   ```
   https://your-domain.com
   ```

---

## API 文档

### SuperAPI 加密通信

#### 配置 API 基础信息

```javascript
// utils/config.js
window.API_CONFIG = {
  BASE_URL: 'https://api.example.com',
  SIGN_MAP: {
    'API_001': 'static_signature_here',
    'API_002': 'another_signature'
  }
};
```

#### 调用加密 API

```javascript
// 在页面中调用
Page({
  async loadData() {
    try {
      const result = await sapi({
        apiId: 'API_001',
        data: {
          username: 'test',
          page: 1
        }
      });
      
      this.setData({
        list: result.data.list
      });
    } catch (error) {
      console.error('API 调用失败', error);
    }
  }
});
```

#### 加密流程

**请求加密：**
1. 生成动态密钥：`MD5(baseApiKey + timestamp)`
2. 派生 IV：基于 GMT+0 星期几从 baseApiKey 截取 12 字节
3. AES-GCM 加密请求数据

**响应解密：**
1. 获取服务端时间戳
2. 生成解密密钥：`reverse(MD5(baseApiKey + serverTimestamp))`
3. 派生 IV：基于 GMT+0 星期几从解密密钥截取 12 字节
4. AES-GCM 解密响应数据

#### 请求头

```
x-user-account: [用户账号]
x-crypto-mode: aes-gcm
x-timestamp: [13位时间戳]
x-request-id: REQ_[timestamp]_[counter]
Content-Type: application/json
```

---

## 最佳实践

### 1. 页面组织

```
pages/
  moduleName/           # 按模块划分
    ├── list/           # 列表页
    ├── detail/         # 详情页
    └── edit/           # 编辑页
```

### 2. 代码复用

**抽取公共方法到 utils：**

```javascript
// utils/helpers.js
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
}

export function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

**在页面中使用：**

```javascript
Page({
  onLoad() {
    const formatted = formatDate(Date.now());
    this.setData({ dateStr: formatted });
  }
});
```

### 3. 性能优化

**懒加载列表数据：**

```javascript
Page({
  data: {
    list: [],
    page: 1,
    hasMore: true
  },
  
  onReachBottom() {
    if (!this.data.hasMore) return;
    this.loadMore();
  },
  
  async loadMore() {
    const newData = await api.getList({ page: this.data.page });
    this.setData({
      list: [...this.data.list, ...newData.list],
      page: this.data.page + 1,
      hasMore: newData.hasMore
    });
  }
});
```

**防抖搜索：**

```javascript
Page({
  data: {
    keyword: '',
    searchResults: []
  },
  
  onInput(e) {
    const keyword = e.target.value;
    this.setData({ keyword });
    this.debouncedSearch(keyword);
  },
  
  debouncedSearch: debounce(async function(keyword) {
    const results = await api.search({ keyword });
    this.setData({ searchResults: results });
  }, 300)
});
```

### 4. 错误处理

```javascript
Page({
  async loadData() {
    try {
      const data = await api.getData();
      this.setData({ data });
    } catch (error) {
      console.error('加载失败', error);
      this.setData({
        errorMsg: '数据加载失败，请重试'
      });
    }
  }
});
```

### 5. 安全实践

- **不要在前端硬编码敏感信息**（API 密钥、密码等）
- **使用 HTTPS** 传输数据
- **验证用户输入**，防止 XSS 攻击
- **定期更新依赖**，修复安全漏洞

---

## 附录

### 完整的指令列表

| 指令 | 说明 | 示例 |
|------|------|------|
| `s:if` | 条件渲染（编译时） | `<view s:if="{{isLogin}}">` |
| `s:else-if` | 条件分支 | `<view s:else-if="{{score >= 60}}">` |
| `s:else` | 条件否则 | `<view s:else>` |
| `s:show` | 显示/隐藏（运行时） | `<view s:show="{{visible}}">` |
| `s:for` | 列表渲染 | `<view s:for="{{list}}">` |
| `s:for-item` | 列表项变量名 | `s:for-item="item"` |
| `s:for-index` | 列表索引变量名 | `s:for-index="idx"` |
| `s:key` | 列表项唯一标识 | `s:key="id"` |
| `:attr` | 属性绑定 | `:placeholder="hint"` |
| `bind:event` | 事件绑定 | `bind:tap="handleClick"` |

### 生命周期执行顺序

```
onLoad
  ↓
onReady
  ↓
onShow
  ↓
(页面交互)
  ↓
onHide
  ↓
onUnload
```

### 常见问题 FAQ

**Q: s:if 和 s:show 有什么区别？**  
A: `s:if` 在编译时移除 DOM，不支持运行时切换；`s:show` 使用 `display:none` 控制显示，支持响应式切换。

**Q: 为什么 setData 不生效？**  
A: 检查是否在 Page() 定义的方法中调用，确保 `this` 指向正确。

**Q: 如何调试 SXML 编译错误？**  
A: 开发模式下打开浏览器控制台，查看编译错误信息。

**Q: 生产环境需要上传哪些文件？**  
A: 只需上传 `dist/` 目录，不要上传 `pages/`、`utils/` 等源码目录。

---

## 观测与日志

系统内置安全事件、审计、性能三类日志采集与聚合：

- 启动日志服务器（本地开发演示）：

```bash
npm run log:server
```

- 查看分类日志（需 tail 可用；Windows 可用 PowerShell `Get-Content -Wait` 替代）：

```bash
npm run log:view:security
npm run log:view:audit
npm run log:view:performance
```

更多用法与最佳实践：参见 **docs/LOGGER_README.md** 与快速上手 **docs/LOGGER_QUICKSTART.md**。

---

## 📚 相关文档

> 💡 **推荐**: 使用 [在线文档系统](pages/docs/docs.html) 获得更好的阅读体验，支持搜索、主题切换、目录导航等功能。

### 核心功能文档
- **[SXML 模板语法](docs/SXML_README.md)** - 详细的模板语法和指令说明
- **[SXML 编译指南](docs/SXML_COMPILE_GUIDE.md)** - 预编译方案和构建流程
- **[智能依赖系统](docs/SMART_DEPENDENCY.md)** - 自动按需加载，性能优化 ⭐
- **[SXML 文件指南](docs/SXML_FILE_GUIDE.md)** - SXML 文件结构和组织
- **[页面开发指南](docs/PAGE_DEV_GUIDE.md)** - Page() 函数和生命周期详解
- **[响应式系统](docs/REACTIVE_README.md)** - 数据绑定和响应式原理
- **[日志中心使用说明](docs/LOGGER_README.md)** - 安全/审计/性能日志采集与聚合
- **[日志中心 5 分钟上手](docs/LOGGER_QUICKSTART.md)** - 快速运行与验证

### API 与工具
- **[SuperAPI 使用说明](docs/SAPI_README.md)** - 加密 API 调用和安全通信
- **[WebSocket API 文档](docs/WSAPI_README.md)** - 实时双向通信和连接管理
- **[WebSocket 安全指南](docs/WSAPI_SECURITY_GUIDE.md)** - WSS、认证握手与消息签名
- **[文件 API 文档](docs/FILEAPI_README.md)** - 文件上传下载和预览功能
- **[API 签名映射配置](docs/API_SIGN_MAP_GUIDE.md)** - 接口密钥映射管理指南
- **[国际化 (i18n)](utils/i18n.js)** - 多语言支持和切换

### 部署与安全
- **[多环境配置指南](docs/MULTI_ENV_GUIDE.md)** - 开发/测试/生产环境配置 ⭐
- **[生产部署指南](docs/DEPLOYMENT.md)** - 完整的部署步骤和配置
- **[安全配置指南](docs/SECURITY.md)** - 加密、CSP、反爬虫策略
- **[CORS 跨域解决方案](docs/CORS_SOLUTION.md)** - 跨域问题和 Nginx 代理
- **[CSP 邮件/群机器人告警配置](docs/EMAIL_ALERT_GUIDE.md)** - Email / 钉钉 / Slack 告警
- **[敏感信息与邮箱密码处理](docs/EMAIL_PASSWORD_SECURITY.md)** - 避免在源码中存放密钥
- **[安全审计报告](docs/SECURITY_AUDIT_REPORT.md)** - 当前整体安全评分与改进日志

### 开发参考
- **[代码风格指南](docs/SXML_STYLE_GUIDE.md)** - 代码风格和命名规范
- **[SXML 功能测试](docs/TEST_SXML_FEATURES.md)** - 功能测试用例
- **[SXML 解决方案](docs/SXML_SOLUTION.md)** - 常见问题解决方案
- **[文档系统使用指南](docs/DOCS_SYSTEM_GUIDE.md)** - 在线文档系统的使用和定制 ⭐

---

## 更新日志

### v2.0.2 (2025-11-02)

- 新增 **在线文档系统**：类 VS Code Docs 风格，支持全文搜索、主题切换、目录导航
- 完整整合 24 篇文档，提供友好的阅读体验
- 新增文档系统使用指南 (docs/DOCS_SYSTEM_GUIDE.md)

### v2.0.1 (2025-11-02)

- 新增 日志中心（安全/审计/性能），支持本地聚合与查看脚本（见 docs/LOGGER_README.md）
- WebSocket 安全增强：强制 WSS、认证握手、消息签名校验（见 docs/WSAPI_SECURITY_GUIDE.md）
- CSP 实时告警：支持 Email、钉钉、Slack，多通道与限流（见 docs/EMAIL_ALERT_GUIDE.md）
- 新增 VS Code 扩展 SXML Scaffolder，支持一键新建页面/项目与 VSIX 打包安装

### v2.0.0 (2025-11-01)

- ✅ SXML 指令支持 Mustache 语法 `{{}}`
- ✅ s:show 支持响应式动态切换
- ✅ 自动化构建脚本 `build.dist.js`
- ✅ 优化 watch 依赖收集机制
- ✅ 完善国际化支持

### v1.0.0 (2024-01-15)

- 🎉 初始版本发布
- ✅ SXML 模板引擎
- ✅ 响应式数据系统
- ✅ SuperAPI 加密通信

---

## 开发者

**King, Rainbow Haruko**

---

## 许可证

MIT License

---

**开发团队** | **技术支持** | **问题反馈**
