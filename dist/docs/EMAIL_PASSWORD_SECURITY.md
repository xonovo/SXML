# 邮件告警密码安全配置指南

## ⚠️ 重要安全警告

**配置文件中的明文密码存在严重泄露风险!**

如果直接在 `config/app.config.js` 中写入密码:
```json
{
  "smtp": {
    "auth": {
      "pass": "my-password-123"  // ❌ 危险!
    }
  }
}
```

### 泄露风险

| 风险类型 | 说明 | 影响 |
|---------|------|------|
| **Git 仓库泄露** | 配置文件被提交,密码永久保存在历史记录 | 🔴 极高 |
| **代码分享** | 分享代码时忘记删除密码 | 🔴 高 |
| **服务器入侵** | 攻击者获取文件系统访问权限 | 🔴 高 |
| **日志泄露** | 配置内容被记录到日志文件 | 🟡 中 |
| **内部人员** | 团队成员都能看到密码 | 🟡 中 |
| **版本控制** | 历史版本中的密码无法删除 | 🔴 高 |

---

## ✅ 推荐的安全方案

### 方案一: 环境变量 (最推荐,已支持)

系统**已经支持**从环境变量读取密码,优先级高于配置文件。

#### 步骤 1: 配置文件留空

`config/app.config.js`:
```json
{
  "alert": {
    "email": {
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 465,
        "secure": true,
        "auth": {
          "user": "alerts@example.com",
          "pass": ""  // ✅ 留空或删除,从环境变量读取
        }
      }
    }
  }
}
```

#### 步骤 2: 设置环境变量

**Windows PowerShell**:

```powershell
# 临时设置 (当前会话有效)
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="465"
$env:SMTP_USER="alerts@example.com"
$env:SMTP_PASS="your-app-password"
$env:ALERT_EMAILS="admin@example.com,security@example.com"

# 启动服务
npm run csp:monitor
```

**永久设置 (用户级)**:
```powershell
# 设置用户级环境变量 (推荐)
[System.Environment]::SetEnvironmentVariable('SMTP_HOST', 'smtp.gmail.com', 'User')
[System.Environment]::SetEnvironmentVariable('SMTP_PORT', '465', 'User')
[System.Environment]::SetEnvironmentVariable('SMTP_USER', 'alerts@example.com', 'User')
[System.Environment]::SetEnvironmentVariable('SMTP_PASS', 'your-app-password', 'User')
[System.Environment]::SetEnvironmentVariable('ALERT_EMAILS', 'admin@example.com', 'User')

# 重启 PowerShell 使环境变量生效
```

**永久设置 (系统级,需管理员权限)**:
```powershell
# 以管理员身份运行 PowerShell
[System.Environment]::SetEnvironmentVariable('SMTP_PASS', 'your-app-password', 'Machine')
```

**Linux/Mac**:

```bash
# 临时设置
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="465"
export SMTP_USER="alerts@example.com"
export SMTP_PASS="your-app-password"
export ALERT_EMAILS="admin@example.com,security@example.com"

# 启动服务
npm run csp:monitor
```

**永久设置**:
```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
echo 'export SMTP_HOST="smtp.gmail.com"' >> ~/.bashrc
echo 'export SMTP_PORT="465"' >> ~/.bashrc
echo 'export SMTP_USER="alerts@example.com"' >> ~/.bashrc
echo 'export SMTP_PASS="your-app-password"' >> ~/.bashrc
echo 'export ALERT_EMAILS="admin@example.com"' >> ~/.bashrc

# 重新加载配置
source ~/.bashrc
```

#### 步骤 3: 验证环境变量

```powershell
# Windows
echo $env:SMTP_USER
echo $env:SMTP_PASS

# Linux/Mac
echo $SMTP_USER
echo $SMTP_PASS
```

#### 代码如何读取

`utils/csp-report-handler.js` 已实现优先读取环境变量:

```javascript
const smtpConfig = {
  host: process.env.SMTP_HOST || emailConfig?.smtp?.host || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || emailConfig?.smtp?.port || '465'),
  secure: process.env.SMTP_SECURE !== 'false' && (emailConfig?.smtp?.secure !== false),
  auth: {
    user: process.env.SMTP_USER || emailConfig?.smtp?.auth?.user || '',
    pass: process.env.SMTP_PASS || emailConfig?.smtp?.auth?.pass || ''  // ✅ 优先环境变量
  }
};
```

**优先级**: 环境变量 > 配置文件 > 默认值

---

### 方案二: .env 文件 (推荐开发环境)

#### 步骤 1: 安装 dotenv

```bash
npm install dotenv
```

#### 步骤 2: 创建 .env 文件

项目根目录创建 `.env`:
```env
# SMTP 配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alerts@example.com
SMTP_PASS=your-app-password

# 收件人
ALERT_EMAILS=admin@example.com,security@example.com

# 钉钉 (可选)
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN
```

#### 步骤 3: 添加到 .gitignore

**重要**: 防止提交到 Git!

`.gitignore`:
```gitignore
# 环境变量文件
.env
.env.local
.env.*.local

# 配置文件 (如果包含敏感信息)
config/app.config.js
```

#### 步骤 4: 创建示例文件

`.env.example`:
```env
# SMTP 配置示例
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alerts@example.com
SMTP_PASS=your-password-here

# 收件人 (多个用逗号分隔)
ALERT_EMAILS=admin@example.com,security@example.com

# 钉钉 Webhook (可选)
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN
```

**说明**: `.env.example` 可以提交到 Git,作为配置模板。

#### 步骤 5: 在代码中加载

修改 `utils/csp-report-handler.js` 开头:

```javascript
// 加载 .env 文件
require('dotenv').config();

const http = require('http');
const fs = require('fs');
// ... 其他代码
```

#### 团队协作

每个开发者:
1. 复制 `.env.example` 为 `.env`
2. 填写自己的 SMTP 配置
3. 不提交 `.env` 文件

---

### 方案三: 使用应用专用密码 (必须)

**关键**: 不要使用邮箱账户密码,而是生成应用专用密码!

#### Gmail 应用专用密码

1. **启用两步验证**
   - 访问 https://myaccount.google.com/security
   - 启用"两步验证"

2. **生成应用专用密码**
   - 访问 https://myaccount.google.com/apppasswords
   - 选择应用: "邮件"
   - 选择设备: "Windows 电脑" 或 "其他"
   - 点击"生成"
   - 复制 16 位密码 (如: `abcd efgh ijkl mnop`)

3. **使用应用密码**
   ```powershell
   $env:SMTP_PASS="abcdefghijklmnop"  # 去掉空格
   ```

**优势**:
- ✅ 独立于账户密码
- ✅ 可随时撤销
- ✅ 泄露后只影响该应用
- ✅ 更安全

#### QQ 邮箱授权码

1. 登录 QQ 邮箱 → 设置 → 账户
2. 找到 "POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务"
3. 开启 "POP3/SMTP服务" 或 "IMAP/SMTP服务"
4. 点击"生成授权码"
5. 通过短信验证
6. 获得授权码 (如: `pqrstuabcdefghij`)

使用授权码:
```powershell
$env:SMTP_PASS="pqrstuabcdefghij"
```

#### 163 邮箱授权码

1. 登录 163 邮箱 → 设置 → POP3/SMTP/IMAP
2. 开启 "POP3/SMTP服务" 或 "IMAP/SMTP服务"
3. 点击"客户端授权码" → "新增授权密码"
4. 输入手机验证码
5. 获得授权码

---

### 方案四: 配置文件分离

#### 创建独立的密钥文件

`config/secrets.json` (不提交到 Git):
```json
{
  "smtp": {
    "user": "alerts@example.com",
    "pass": "your-app-password"
  },
  "dingtalk": {
    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN"
  }
}
```

`.gitignore`:
```gitignore
config/secrets.json
```

`config/secrets.example.json` (提交到 Git):
```json
{
  "smtp": {
    "user": "alerts@example.com",
    "pass": "your-password-here"
  },
  "dingtalk": {
    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN"
  }
}
```

在代码中读取:
```javascript
let secrets = {};
try {
  secrets = JSON.parse(fs.readFileSync('./config/secrets.json', 'utf-8'));
} catch (err) {
  console.warn('secrets.json not found, using environment variables');
}

const smtpConfig = {
  auth: {
    user: process.env.SMTP_USER || secrets.smtp?.user || '',
    pass: process.env.SMTP_PASS || secrets.smtp?.pass || ''
  }
};
```

---

### 方案五: 密钥管理服务 (企业级)

#### AWS Secrets Manager

```bash
npm install aws-sdk
```

```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager({
  region: 'us-east-1'
});

async function getSmtpPassword() {
  try {
    const data = await secretsManager.getSecretValue({
      SecretId: 'prod/smtp/password'
    }).promise();
    
    const secret = JSON.parse(data.SecretString);
    return secret.password;
  } catch (err) {
    console.error('Failed to get secret:', err);
    throw err;
  }
}

// 使用
const smtpPassword = await getSmtpPassword();
```

#### Azure Key Vault

```bash
npm install @azure/keyvault-secrets @azure/identity
```

```javascript
const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

const vaultUrl = "https://your-vault.vault.azure.net/";
const credential = new DefaultAzureCredential();
const client = new SecretClient(vaultUrl, credential);

async function getSmtpPassword() {
  const secret = await client.getSecret("smtp-password");
  return secret.value;
}
```

#### HashiCorp Vault

```bash
npm install node-vault
```

```javascript
const vault = require('node-vault')({
  endpoint: 'http://127.0.0.1:8200',
  token: process.env.VAULT_TOKEN
});

async function getSmtpPassword() {
  const result = await vault.read('secret/data/smtp');
  return result.data.data.password;
}
```

---

## 🔍 检查密码是否泄露

### 检查 Git 历史

```bash
# 搜索配置文件历史
git log -p config/app.config.js

# 搜索密码关键词
git log -p --all -S "password" -- config/

# 查找所有包含敏感信息的提交
git log --all --pretty=format: --name-only --diff-filter=A | sort -u | grep -E '\.(json|env)$'
```

### 如果已经泄露

1. **立即修改密码**
   ```bash
   # 撤销应用专用密码
   # Gmail: https://myaccount.google.com/apppasswords
   # QQ: 重新生成授权码
   ```

2. **清理 Git 历史**
   ```bash
   # 使用 BFG Repo-Cleaner
  java -jar bfg.jar --delete-files app.config.js
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   
   # 或使用 git-filter-branch
   git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch config/app.config.js' \
     --prune-empty --tag-name-filter cat -- --all
   ```

3. **强制推送**
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

4. **通知团队成员**
   - 所有成员重新克隆仓库
   - 避免推送旧的历史记录

---

## ✅ 安全检查清单

部署前请确认:

- [ ] 配置文件中密码字段为空或使用占位符
- [ ] 使用环境变量或 .env 文件存储密码
- [ ] `.env` 文件已添加到 `.gitignore`
- [ ] 提供 `.env.example` 作为模板
- [ ] 使用应用专用密码,而非账户密码
- [ ] 定期轮换密码
- [ ] 检查 Git 历史,确保无密码泄露
- [ ] 生产环境使用密钥管理服务 (可选)
- [ ] 限制配置文件访问权限 (chmod 600)
- [ ] 监控异常登录和邮件发送

---

## 📚 相关文档

- [邮件告警配置指南](./EMAIL_ALERT_GUIDE.md)
- [安全审计报告](./SECURITY_AUDIT_REPORT.md)
- [CSP 违规处理器源码](../utils/csp-report-handler.js)

---

## ❓ 常见问题

**Q: 我已经把密码提交到 Git 了,怎么办?**

A: 立即修改密码,然后清理 Git 历史 (参考上方"如果已经泄露"章节)。

**Q: 环境变量会在服务器重启后丢失吗?**

A: 使用永久设置 (User/Machine 级别) 或在启动脚本中设置。

**Q: .env 文件和环境变量哪个优先级高?**

A: 系统环境变量 > .env 文件 > 配置文件。

**Q: 可以加密配置文件吗?**

A: 可以,但不如使用环境变量简单。考虑使用 `node-config` + `config-encryption` 库。

**Q: 团队协作如何共享配置?**

A: 提供 `.env.example`,每个成员复制并填写自己的密码,不共享实际密码。

---

**安全第一,密码管理需谨慎!** 🔒
