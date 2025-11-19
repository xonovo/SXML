# 邮件告警配置指南

## 📋 概述

系统支持通过邮件、钉钉、Slack 多种渠道发送安全告警,包括:
- **CSP 违规告警** - 内容安全策略违规
- **日志系统告警** - 暴力破解、未授权访问等 (通过钉钉)

本文档主要介绍邮件告警的配置方法。

---

## 📧 邮件告警配置

### 1. 安装依赖

```bash
npm install nodemailer
```

### 2. 配置 SMTP 服务器

编辑 `config/app.config.js`（或生产环境的 `config/app.config.prod.js`），添加邮件配置:

```json
{
  "alert": {
    "email": {
      "enabled": true,
      "smtp": {
        "host": "smtp.example.com",
        "port": 465,
        "secure": true,
        "auth": {
          "user": "alerts@example.com",
          "pass": "your-password-here"
        }
      },
      "from": "Security Alerts <alerts@example.com>",
      "to": ["admin@example.com", "security@example.com"],
      "subject": "[Security Alert] {{event_type}}",
      "rateLimit": {
        "maxPerHour": 10,
        "cooldownMinutes": 5
      }
    }
  }
}
```

### 3. 配置说明

| 配置项 | 说明 | 示例值 |
|--------|------|--------|
| `smtp.host` | SMTP 服务器地址 | `smtp.gmail.com`, `smtp.qq.com` |
| `smtp.port` | SMTP 端口 | `465` (SSL), `587` (TLS) |
| `smtp.secure` | 是否使用 SSL | `true` / `false` |
| `smtp.auth.user` | SMTP 用户名 | `alerts@example.com` |
| `smtp.auth.pass` | SMTP 密码/授权码 | 应用专用密码 |
| `from` | 发件人 | `Security <alerts@example.com>` |
| `to` | 收件人列表 | `["admin@example.com"]` |
| `subject` | 邮件主题模板 | `[Alert] {{event_type}}` |
| `rateLimit.maxPerHour` | 每小时最大告警数 | `10` |
| `rateLimit.cooldownMinutes` | 同类告警冷却时间(分钟) | `5` |

---

## 🔧 常用 SMTP 服务器配置

### Gmail

```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 465,
    "secure": true,
    "auth": {
      "user": "your-email@gmail.com",
      "pass": "your-app-password"
    }
  }
}
```

**注意**: 
- 需要启用"两步验证"
- 使用"应用专用密码"而非账户密码
- 生成地址: https://myaccount.google.com/apppasswords

### QQ 邮箱

```json
{
  "smtp": {
    "host": "smtp.qq.com",
    "port": 465,
    "secure": true,
    "auth": {
      "user": "123456789@qq.com",
      "pass": "your-authorization-code"
    }
  }
}
```

**注意**:
- 需要在 QQ 邮箱设置中开启 SMTP 服务
- 使用生成的"授权码"而非 QQ 密码

### 163 邮箱

```json
{
  "smtp": {
    "host": "smtp.163.com",
    "port": 465,
    "secure": true,
    "auth": {
      "user": "yourname@163.com",
      "pass": "your-authorization-code"
    }
  }
}
```

### 企业邮箱 (腾讯企业邮)

```json
{
  "smtp": {
    "host": "smtp.exmail.qq.com",
    "port": 465,
    "secure": true,
    "auth": {
      "user": "alerts@yourcompany.com",
      "pass": "your-password"
    }
  }
}
```

### 阿里云企业邮箱

```json
{
  "smtp": {
    "host": "smtp.mxhichina.com",
    "port": 465,
    "secure": true,
    "auth": {
      "user": "alerts@yourcompany.com",
      "pass": "your-password"
    }
  }
}
```

---

## 🔐 使用环境变量 (推荐生产环境)

为避免敏感信息泄露,生产环境建议使用环境变量:

### Windows (PowerShell)

```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="465"
$env:SMTP_USER="alerts@example.com"
$env:SMTP_PASS="your-app-password"
$env:ALERT_EMAILS="admin@example.com,security@example.com"
```

### Linux/Mac (Bash)

```bash
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="465"
export SMTP_USER="alerts@example.com"
export SMTP_PASS="your-app-password"
export ALERT_EMAILS="admin@example.com,security@example.com"
```

### .env 文件 (使用 dotenv)

创建 `.env` 文件:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alerts@example.com
SMTP_PASS=your-app-password
ALERT_EMAILS=admin@example.com,security@example.com
```

**重要**: 将 `.env` 添加到 `.gitignore`

---

## 🚀 启动告警服务

### CSP 违规监控

```bash
# 启动 CSP 违规监控服务
npm run csp:monitor

# 或直接运行
node utils/csp-report-handler.js
```

服务启动后会监听 `http://localhost:3001/csp-report`

### 日志服务器 (钉钉告警)

```bash
# 启动日志服务器
npm run log:server

# 配置钉钉 Webhook
export DINGTALK_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN"
```

---

## 📨 邮件告警示例

### CSP 违规告警邮件

**主题**: `[Security Alert] CSP Violation`

**内容**:

```
🚨 CSP 安全违规告警

严重程度: HIGH
告警时间: 2025-11-02 14:30:25
违规页面: https://example.com/admin

违规详情:
- 违反策略: script-src 'self'
- 被阻止资源: https://evil.com/malicious.js
- 源文件: https://example.com/admin/index.html:45:12

可能的原因:
1. XSS 攻击尝试 - 恶意脚本注入
2. 第三方资源加载 - 未授权的外部资源
3. 代码注入 - 内联脚本或样式违规

建议措施:
1. 检查违规页面的源代码
2. 验证被阻止的资源是否合法
3. 检查输入验证逻辑
4. 查看完整日志: logs/csp-violations.log
```

HTML 版本包含:
- ✅ 彩色标题和警告框
- ✅ 格式化的违规详情
- ✅ 可能原因分析
- ✅ 操作建议

---

## 🔔 告警频率限制

为防止邮件轰炸,系统实现了智能频率限制:

### 限制规则

1. **冷却时间**: 同类告警间隔至少 5 分钟 (可配置)
2. **每小时上限**: 最多 10 封告警邮件 (可配置)
3. **相同告警去重**: 同一违规在冷却期内只发送一次

### 配置频率限制

```json
{
  "alert": {
    "email": {
      "rateLimit": {
        "maxPerHour": 10,          // 每小时最多 10 封
        "cooldownMinutes": 5       // 同类告警间隔 5 分钟
      }
    }
  }
}
```

### 查看限流日志

```
⏰ Alert rate limited, skipping
```

---

## 🧪 测试邮件告警

### 方法 1: 触发 CSP 违规

在浏览器控制台执行:

```javascript
// 加载外部脚本 (会被 CSP 阻止)
const script = document.createElement('script');
script.src = 'https://evil.com/test.js';
document.head.appendChild(script);
```

### 方法 2: 手动发送测试邮件

创建测试脚本 `test-email.js`:

```javascript
const { sendAlert } = require('./utils/csp-report-handler.js');

const testViolation = {
  timestamp: new Date().toISOString(),
  documentUri: 'https://example.com/test',
  violatedDirective: 'script-src',
  effectiveDirective: 'script-src',
  blockedUri: 'https://evil.com/test.js',
  sourceFile: 'https://example.com/test.html',
  lineNumber: 42,
  columnNumber: 10,
  statusCode: 200,
  userAgent: 'Mozilla/5.0 (Test)'
};

sendAlert(testViolation)
  .then(() => console.log('✅ Test email sent'))
  .catch(err => console.error('❌ Failed:', err));
```

运行:

```bash
node test-email.js
```

---

## 🔍 故障排查

### 问题 1: 邮件发送失败

**检查清单**:
- [ ] SMTP 服务器地址和端口正确
- [ ] 用户名和密码正确 (使用授权码而非账户密码)
- [ ] 防火墙允许 SMTP 端口 (465/587)
- [ ] 邮箱服务商是否启用了 SMTP 服务

**查看错误日志**:

```
❌ Failed to send email: Authentication failed
❌ Failed to send email: Connection timeout
```

### 问题 2: 收不到邮件

**检查清单**:
- [ ] 邮件是否进入垃圾箱/垃圾邮件
- [ ] 收件人地址拼写正确
- [ ] SMTP 服务器是否有发送限额
- [ ] 检查邮件服务器日志

### 问题 3: 频繁触发告警

**解决方案**:
1. 调整频率限制:

```json
{
  "rateLimit": {
    "maxPerHour": 5,           // 降低为 5 封/小时
    "cooldownMinutes": 10      // 增加冷却时间
  }
}
```

2. 优化 CSP 策略,减少误报

### 问题 4: 环境变量未生效

**检查**:
```bash
# Windows (PowerShell)
echo $env:SMTP_USER

# Linux/Mac
echo $SMTP_USER
```

**解决**: 确保在启动服务前设置环境变量

---

## 🎨 自定义邮件模板

### 修改邮件样式

编辑 `utils/csp-report-handler.js` 中的 `generateEmailHTML()` 函数:

```javascript
function generateEmailHTML(summary) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    /* 自定义 CSS 样式 */
    .header { background: #your-color; }
  </style>
</head>
<body>
  <!-- 自定义 HTML 内容 -->
</body>
</html>
  `;
}
```

### 添加公司 Logo

```html
<div class="header">
  <img src="https://yourcompany.com/logo.png" alt="Logo" style="height: 40px;">
  <h1>🚨 安全告警</h1>
</div>
```

---

## 📊 告警统计

### 查看告警发送记录

```bash
# 查看 CSP 违规日志
cat logs/csp-violations.log | grep timestamp

# 统计今天的告警次数
grep $(date +%Y-%m-%d) logs/csp-violations.log | wc -l
```

### 分析高频告警

```bash
# 提取被阻止的 URI
cat logs/csp-violations.log | jq -r '.blockedUri' | sort | uniq -c | sort -rn
```

---

## 🔗 相关文档

- [CSP 违规处理器源码](../utils/csp-report-handler.js)
- [日志系统配置](./LOGGER_README.md)
- [WebSocket 安全配置](./WSAPI_SECURITY_GUIDE.md)
- [安全审计报告](./SECURITY_AUDIT_REPORT.md)

---

## ❓ 常见问题

**Q: 支持哪些邮件服务商?**

A: 支持所有标准 SMTP 服务器,包括 Gmail、QQ、163、企业邮箱等。

**Q: 邮件密码会泄露吗?**

A: 建议使用环境变量存储密码,不要将密码提交到 Git 仓库。

**Q: 可以发送到多个收件人吗?**

A: 可以,在 `to` 数组中添加多个邮箱地址。

**Q: 如何禁用邮件告警?**

A: 设置 `alert.email.enabled: false` 或删除 SMTP 配置。

**Q: 告警邮件太多怎么办?**

A: 调整 `rateLimit` 配置,增加冷却时间,减少每小时上限。

---

**配置完成后,享受实时安全告警!** 🎉
