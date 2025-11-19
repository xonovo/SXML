# 安全配置指南

本文档详细说明了本后台系统的安全机制、加密流程、CSP 配置和安全最佳实践。

## 目录
- [配置管理](#配置管理)
- [加密通信](#加密通信)
- [CSP 内容安全策略](#csp-内容安全策略)
- [反爬虫策略](#反爬虫策略)
- [会话管理](#会话管理)
- [安全配置](#安全配置)
- [最佳实践](#最佳实践)

---

## 配置管理

### 1. 安全配置文件

系统通过 `config/app.config.js`（或 `config/app.config.{env}.js`）集中管理安全相关配置。

#### 配置位置
```
config/app.config.js
```

#### 安全相关配置项

```json
{
  "api": {
    "baseUrl": "https://api.example.com",  // ⭐ 生产 API 地址
    "cspReportUrl": "/api/csp-report"      // CSP 违规报告端点
  },
  "external": {
    "ipGeoProvider": "https://ipapi.co",
    "ipApiProvider": "https://api.ipify.org"
  },
  "security": {
    "connectSrc": [                        // ⭐ CSP connect-src 白名单
      "https://api.example.com",
      "https://ipapi.co",
      "https://api.ipify.org"
    ],
    "preconnectHosts": [                   // DNS 预连接优化
      "https://api.example.com"
    ]
  }
}
```

#### 配置注入流程

1. **编译时注入**：`utils/sxml.compiler.js` 在构建时读取配置并注入到 HTML
   - CSP `connect-src` 白名单
   - DNS 预连接 `<link rel="preconnect">`
   - 页面标题和 meta 标签

2. **运行时加载**：`utils/config.js` 会优先使用预注入的 `window.APP_CONFIG`（由 `config/app.config.{env}.js` 提供），无需再发起 JSON 请求
   - 设置 `window.APP_CONFIG`
   - 配置 API 基础 URL
   - i18n 占位符替换

⚠️ **安全提示**：
- 配置文件会打包到前端，**不要存储敏感信息**（API 密钥、密码等）
- CSP 白名单必须包含所有需要连接的外部域名
- 生产环境建议通过环境变量或后端接口管理敏感配置

---

## 加密通信

### 1. AES-GCM 加密流程

系统采用 AES-GCM 模式进行端到端加密通信，确保数据在传输过程中的机密性和完整性。

#### 1.1 密钥体系

```
基础密钥（Base API Key）
├── 存储位置：sessionStorage['k']
├── 长度要求：32 字节（256 位）
├── 生命周期：浏览器会话级（关闭即清除）
└── 来源：服务端下发或设备生成
```

#### 1.2 动态密钥生成

**请求加密**：
```javascript
// 1. 生成时间戳
timestamp = Date.now().toString() // 13位

// 2. 动态密钥派生
dynamicKey = MD5(baseApiKey + timestamp).toUpperCase()

// 3. IV 生成（基于 GMT+0 星期几）
weekday = new Date().getUTCDay() // 0-6
iv = baseApiKey.substring(weekday, weekday + 12)
// 若长度不足，循环拼接 baseApiKey 直到够 12 字节

// 4. 加密请求数据
encryptedData = AES_GCM_Encrypt(data, dynamicKey, iv)
```

**响应解密**：
```javascript
// 1. 获取服务端时间戳
serverTimestamp = response.headers['x-timestamp'] || response.body.timestamp

// 2. 服务端动态密钥
serverDynamic = MD5(baseApiKey + serverTimestamp).toUpperCase()

// 3. 解密密钥（反转）
decryptKey = serverDynamic.split('').reverse().join('')

// 4. IV 生成（使用解密密钥）
weekday = new Date(serverTimestamp).getUTCDay()
iv = decryptKey.substring(weekday, weekday + 12)

// 5. 解密响应
decryptedData = AES_GCM_Decrypt(response.data, decryptKey, iv)
```

#### 1.3 HTTP 请求头

所有 API 请求自动携带以下安全头：

```http
x-user-account: [用户账号]
x-crypto-mode: aes-gcm
x-timestamp: [13位时间戳]
x-request-id: REQ_[timestamp]_[counter]
Content-Type: application/json
```

### 2. 密码安全

#### 2.1 客户端处理
```javascript
// 密码 MD5 哈希（拼接用户名防止彩虹表）
hashedPassword = MD5(username + password).toUpperCase()

// 存储到会话
sessionStorage['p'] = hashedPassword
```

⚠️ **注意**：MD5 仅用于客户端传输，服务端应使用 bcrypt/PBKDF2 等安全算法进行二次哈希存储。

#### 2.2 API Key 加密存储
```javascript
// 记住密码功能：加密 API Key 后存储到 localStorage
encryptedKey = AES_GCM_Encrypt(
  apiKey, 
  hashedPassword, 
  hashedPassword.substring(0, 12)
)
localStorage['apiKey'] = encryptedKey
```

---

## 反爬虫策略

### 1. 客户端检测（已实现）

系统在页面加载时自动执行多层 bot 检测，阻止自动化工具访问。

#### 1.1 Headless 浏览器检测
```javascript
// 检测 WebDriver 标志（Selenium）
if (navigator.webdriver === true) → 阻止访问

// 检测无插件环境（Puppeteer/Playwright）
if (navigator.plugins.length === 0) → 阻止访问
```

#### 1.2 爬虫 User-Agent 识别
```javascript
const botPatterns = [
  'bot', 'crawl', 'spider', 'scrape', 
  'python', 'requests', 'urllib', 'scrapy', 
  'selenium', 'phantomjs'
]
if (userAgent.includes(任意关键词)) → 阻止访问
```

#### 1.3 环境异常检测
```javascript
// 屏幕尺寸异常
if (screen.width === 0 || screen.height === 0) → 阻止访问

// 缺少浏览器对象
if (!window.chrome && !window.safari && ...) → 阻止访问
```

#### 1.4 设备指纹生成
```javascript
// Canvas 指纹（用于后端验证）
canvas = document.createElement('canvas')
ctx.fillText('browser fingerprint', 2, 2)
fingerprint = canvas.toDataURL().slice(-50)
sessionStorage['_dfp'] = fingerprint
```

**检测到 bot 后的响应**：
```html
<h1>Access Denied</h1>
<p>Automated access is not allowed.</p>
```

### 2. SEO 屏蔽

```html
<!-- robots meta 标签 -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
```

- `noindex`：不索引此页面
- `nofollow`：不跟踪链接
- `noarchive`：不缓存页面
- `nosnippet`：不显示摘要

### 3. 服务端防护建议

⚠️ **重要**：客户端检测可被绕过，必须配合服务端措施：

#### 3.1 速率限制
```nginx
# Nginx 配置示例
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /supper-interface {
    limit_req zone=api_limit burst=20 nodelay;
}
```

#### 3.2 设备指纹验证
```javascript
// 后端验证客户端上报的指纹
if (!request.headers['x-device-fingerprint']) {
  return 403
}
// 校验指纹是否在白名单或匹配历史记录
```

#### 3.3 CAPTCHA（关键操作）
- 登录超过 3 次失败
- 修改密码
- 敏感数据导出

---

## 会话管理

### 1. 存储策略

| 类型 | 存储位置 | 数据 | 生命周期 |
|------|---------|------|---------|
| **敏感** | `sessionStorage` | API Key (`k`)、密码哈希 (`p`)、用户账号 (`u`)、用户信息 (`USERINFO`)、设备指纹 (`_dfp`) | 会话级（关闭浏览器清除） |
| **非敏感** | `localStorage` | 加密后的 API Key (`apiKey`)、用户账号 (`userAccount`)、语言偏好 (`lang`) | 持久化 |

### 2. 会话超时建议

⚠️ **待实现**：添加自动超时机制

```javascript
// 建议配置
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30分钟

let lastActivity = Date.now()

// 监听用户活动
['click', 'keydown', 'mousemove'].forEach(event => {
  document.addEventListener(event, () => {
    lastActivity = Date.now()
  })
})

// 定时检查
setInterval(() => {
  if (Date.now() - lastActivity > SESSION_TIMEOUT) {
    sessionStorage.clear()
    location.href = '/pages/login/login.html'
  }
}, 60000) // 每分钟检查
```

### 3. 安全登出

```javascript
function secureLogout() {
  // 清除所有会话数据
  sessionStorage.clear()
  
  // 清除记住的密码（可选）
  if (confirm('是否同时清除记住的密码？')) {
    localStorage.removeItem('apiKey')
    localStorage.removeItem('userAccount')
  }
  
  // 重定向到登录页
  location.replace('/pages/login/login.html')
}
```

---

## CSP 内容安全策略

### 1. CSP 配置管理

系统通过 `config/app.config.js` 管理 CSP 白名单，并在编译时自动注入到 HTML。

#### 配置 CSP 白名单

编辑 `config/app.config.js`：

```json
{
  "security": {
    "connectSrc": [
      "https://api.example.com",      // ⭐ 您的 API 服务器
      "https://ipapi.co",             // IP 地理位置服务
      "https://api.ipify.org"         // IP 查询服务
    ]
  }
}
```

#### CSP 注入流程

1. **编译时**：`utils/sxml.compiler.js` 读取配置并生成 CSP meta 标签
2. **运行时**：浏览器根据 CSP 策略阻止未授权的资源加载

### 2. CSP 策略详解

编译后的 HTML 包含以下 CSP meta 标签：

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'nonce-[随机base64值]';
  style-src 'self' 'nonce-[随机base64值]';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.example.com https://ipapi.co https://api.ipify.org;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```

**CSP 策略说明**：
- `default-src 'self'`：默认只允许同源资源
- `script-src 'self' 'nonce-xxx'`：脚本需要 nonce 验证（已移除 unsafe-inline/unsafe-eval）
- `style-src 'self' 'nonce-xxx'`：样式需要 nonce 验证
- `connect-src`：⭐ 从 `config.security.connectSrc` 读取，限制 API 请求域名
- `frame-ancestors 'none'`：禁止被嵌入到 iframe（防止点击劫持）
- `form-action 'self'`：表单只能提交到同源

**Nonce 机制**：
- 每次编译生成唯一的随机 nonce（16字节 base64）
- 所有内联 `<script>` 和 `<style>` 标签自动添加 `nonce` 属性
- CSP 策略中包含相同的 nonce 值，只允许匹配的内联代码执行

**示例**：
```html
<!-- CSP 声明 -->
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'nonce-jWXI77fIdXiXxA7lq+pylw==';">

<!-- 内联脚本（带 nonce） -->
<script nonce="jWXI77fIdXiXxA7lq+pylw==">
  console.log('This script is allowed');
</script>

<!-- 未授权的内联脚本（会被阻止） -->
<script>
  console.log('This script is blocked');
</script>
```

✅ **优势**：
- ❌ 不再依赖 `'unsafe-inline'` 和 `'unsafe-eval'`
- ✅ 完全防止 XSS 攻击注入的内联脚本
- ✅ 符合现代 Web 安全最佳实践
- ⭐ 通过配置文件集中管理可信域名

⚠️ **重要提示**：
- 添加新的外部服务时，必须更新 `config/app.config.js` 的 `security.connectSrc`
- 修改配置后需要重新构建：`npm run build`
- 生产环境建议通过 Nginx HTTP 头部设置 CSP（优先级高于 meta）

### 3. Nginx CSP 配置

⚠️ **推荐**：生产环境使用 Nginx HTTP 头设置 CSP（优先级高于 HTML meta 标签）

编辑 `nginx.conf` 并替换 `{{YOUR_DOMAIN}}` 和 `{{YOUR_API_DOMAIN}}`：

```nginx
server {
    listen 443 ssl http2;
    server_name {{YOUR_DOMAIN}};  # ⭐ 替换为您的域名
    
    # SSL 证书配置
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # 根目录
    root /var/www/app/dist;
    index index.html;
    
    # ==================== 安全头配置 ====================
    
    # 防止 MIME 类型嗅探
    add_header X-Content-Type-Options "nosniff" always;
    
    # 防止点击劫持（iframe 嵌入）
    add_header X-Frame-Options "DENY" always;
    
    # XSS 保护（传统浏览器）
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Referrer 策略
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # 权限策略（禁用敏感 API）
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()" always;
    
    # HSTS（强制 HTTPS，1年有效期）
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # ==================== CSP 配置（重点） ====================
    # ⚠️ 注意：connect-src 需要根据您的配置修改
    # 将 {{YOUR_API_DOMAIN}} 替换为实际 API 域名
    
    # CSP 策略（严格模式 - 使用 nonce）
    add_header Content-Security-Policy "
        default-src 'self';
        script-src 'self' 'nonce-$csp_nonce';
        style-src 'self' 'nonce-$csp_nonce';
        img-src 'self' data: https:;
        font-src 'self' data:;
        connect-src 'self' https://{{YOUR_API_DOMAIN}} https://ipapi.co https://api.ipify.org;
        frame-ancestors 'none';
        base-uri 'self';
        form-action 'self';
        upgrade-insecure-requests;
        block-all-mixed-content;
        report-uri /api/csp-report;
        report-to csp-endpoint;
    " always;
    
    # CSP 报告端点配置（Report-To 头）
    add_header Report-To '{
        "group": "csp-endpoint",
        "max_age": 86400,
        "endpoints": [
            {"url": "https://{{YOUR_DOMAIN}}/api/csp-report"}  # ⭐ 替换为您的域名
        ]
    }' always;
    
    # ==================== 静态文件缓存 ====================
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|woff|woff2|ttf|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # ==================== CSP 违规报告接收端点 ====================
    location /api/csp-report {
        # 仅接受 POST 请求
        limit_except POST {
            deny all;
        }
        
        # 转发到后端日志服务（或直接记录到文件）
        access_log /var/log/nginx/csp-violations.log;
        
        # 示例：转发到 Node.js 日志服务
        # proxy_pass http://localhost:3001/csp-report;
        # proxy_set_header Content-Type application/json;
        
        # 返回 204 No Content
        return 204;
    }
    
    # ==================== SPA 路由支持 ====================
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # ==================== API 代理（如果需要） ====================
    location /supper-interface {
        proxy_pass https://{{YOUR_API_DOMAIN}};  # ⭐ 替换为您的 API 域名
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS（如果需要）
        add_header Access-Control-Allow-Origin "https://{{YOUR_DOMAIN}}" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, x-user-account, x-crypto-mode, x-timestamp" always;
    }
}

# HTTP 到 HTTPS 重定向
server {
    listen 80;
    server_name {{YOUR_DOMAIN}};  # ⭐ 替换为您的域名
    return 301 https://$server_name$request_uri;
}
```

### 4. CSP 配置最佳实践

#### 添加新的外部服务

1. **编辑配置文件**：
```bash
vi config/app.config.js
```

2. **添加域名到白名单**：
```json
{
  "security": {
    "connectSrc": [
      "https://api.example.com",
      "https://new-service.com"  // 新增
    ]
  }
}
```

3. **重新构建**：
```bash
npm run build
```

4. **验证**：
```bash
# 检查编译后的 HTML 是否包含新域名
grep "new-service.com" dist/pages/login/login.html
```

#### CSP 违规调试

浏览器控制台会显示 CSP 违规：
```
Refused to connect to 'https://unauthorized-domain.com' because it violates the following Content Security Policy directive: "connect-src 'self' https://api.example.com"
```

**解决方法**：
1. 确认该域名是否为可信来源
2. 添加到 `config/app.config.js` 的 `security.connectSrc`
3. 重新构建并部署

---

## 反爬虫策略// Node.js 示例
app.get('*', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  const html = fs.readFileSync('template.html', 'utf-8')
    .replace(/\$CSP_NONCE/g, nonce);
  
  res.setHeader('Content-Security-Policy', 
    `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}';`
  );
  res.send(html);
});
```

### 3. CORS 配置

```javascript
// config.js 中的域名读取
const ALLOWED_ORIGINS = [
  'https://www.ice-markets-app.com',
  'https://ice-markets-app.com'
]

// 服务端需验证 Origin 头
if (ALLOWED_ORIGINS.includes(request.headers.origin)) {
  response.headers['Access-Control-Allow-Origin'] = request.headers.origin
}
```

---

## 最佳实践

### 1. 密钥管理

✅ **正确做法**：
- API Key 由服务端生成，永不硬编码
- 使用环境变量存储配置（BASE_URL、SIGN_MAP）
- 定期轮换接口签名

❌ **错误做法**：
- 在前端代码中硬编码密钥
- 使用弱密码（少于 8 位、无特殊字符）
- 跨域共享 sessionStorage

### 2. 代码安全

✅ **推荐**：
- 最小化 `eval()` 和 `new Function()` 使用
- 用户输入必须验证和转义
- 定期更新依赖库（jQuery、qrcode-generator）

❌ **禁止**：
- 直接拼接 SQL（本项目为纯前端，无此问题）
- 信任未验证的 URL 参数
- 在 localStorage 存储明文密码

### 3. 部署检查清单

部署前请确认：

- [ ] 所有 API 请求使用 HTTPS
- [ ] CSP 头已配置（HTTP 头或 meta）
- [ ] robots.txt 已正确配置
- [ ] 源代码中无硬编码密钥
- [ ] sessionStorage 无明文敏感数据
- [ ] 服务端已实施速率限制
- [ ] 登录失败次数限制已启用
- [ ] 设备指纹验证已对接
- [ ] 日志记录敏感操作（登录、修改密码）

### 4. 应急响应

**发现安全漏洞时**：
1. 立即通知安全团队
2. 评估影响范围
3. 临时下线受影响功能
4. 修复并测试
5. 通知受影响用户（如有数据泄露）

**常见攻击应对**：
- **暴力破解**：启用 CAPTCHA，锁定账号
- **中间人攻击**：强制 HTTPS，启用 HSTS
- **XSS**：检查所有 innerHTML 使用，添加 CSP
- **CSRF**：使用 token 验证（POST 请求）

---

## CSP 违规监控

### 1. 日志记录方式

系统已配置 CSP 违规报告功能，所有违规行为会自动上报到 `/api/csp-report` 端点。

#### 方式 1：Nginx 直接记录（推荐）

已在 `nginx.conf` 中配置：

```nginx
location /api/csp-report {
    limit_except POST {
        deny all;
    }
    
    # 记录到专用日志文件
    access_log /var/log/nginx/csp-violations.log;
    
    # 返回 204 No Content
    return 204;
}
```

**查看日志**：
```bash
# 实时监控
tail -f /var/log/nginx/csp-violations.log

# 统计违规类型
grep -o 'violated-directive":"[^"]*' /var/log/nginx/csp-violations.log | sort | uniq -c

# 查找外部脚本注入尝试
grep 'script-src' /var/log/nginx/csp-violations.log | grep -v 'self'
```

#### 方式 2：Node.js 日志服务（可选）

提供了 `utils/csp-report-handler.js` 用于高级分析：

```bash
# 启动服务
node utils/csp-report-handler.js

# 或使用 PM2
pm2 start utils/csp-report-handler.js --name csp-monitor
```

**功能**：
- ✅ 实时控制台输出
- ✅ 结构化 JSON 日志
- ✅ 自动告警（严重违规）
- ✅ 支持钉钉/邮件通知

### 2. 违规分析

#### 常见违规类型

| 违规指令 | 原因 | 处理方式 |
|---------|------|---------|
| `script-src` | 尝试加载外部脚本或内联脚本无 nonce | 检查是否为攻击，确保 nonce 正确 |
| `style-src` | 内联样式无 nonce | 确保所有 `<style>` 包含 nonce 属性 |
| `frame-ancestors` | 页面被嵌入 iframe | 合法嵌入：调整策略；恶意：保持阻止 |
| `connect-src` | 连接到未授权域名 | 检查 API 调用，更新白名单 |

#### 攻击检测

```bash
# 检测 XSS 注入
grep '"blocked-uri":"inline"' csp-violations.log | grep 'script-src'

# 检测点击劫持
grep 'frame-ancestors' csp-violations.log

# 按 IP 统计（查找攻击者）
awk '{print $1}' csp-violations.log | sort | uniq -c | sort -rn
```

### 3. 告警配置

编辑 `utils/csp-report-handler.js` 中的 `sendAlert()` 函数：

```javascript
function sendAlert(summary) {
  // 钉钉机器人
  const webhook = 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN';
  fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: `CSP 告警\n${summary.violatedDirective}\n${summary.blockedUri}` }
    })
  });
}
```

---

## 审计日志

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2025-11-02 | 1.0.0 | 初始版本：AES-GCM 加密、反爬虫检测、CSP 配置 |
| 2025-11-02 | 1.1.0 | **安全重构**：移除 unsafe-eval/unsafe-inline，使用 nonce 机制，重构表达式求值器 |

**v1.1.0 重大改进**：
- ✅ 移除 `eval()` 和 `new Function()`：实现安全的表达式求值器
- ✅ 支持链式属性访问（`user.profile.name`）
- ✅ 支持方法调用（`str.substring(0, 5)`）
- ✅ 支持三元运算符、逻辑运算符、比较运算符
- ✅ 使用 Nonce 替代 unsafe-inline/unsafe-eval
- ✅ 每次编译生成唯一 nonce（crypto.randomBytes）
- ✅ 所有内联脚本/样式自动添加 nonce 属性

---

## 联系方式

安全问题请联系：security@ice-markets.com

**漏洞报告**：请提供详细复现步骤和影响范围评估。
