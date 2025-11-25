(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.APP_CONFIG = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Generated from app.config.json for faster startup
  return {
    "app": {
      "name": "Your App",
      "title": "Your App Management Entrance",
      "subtitle": "Management System",
      "description": "Modern Web 3.0 Management System powered by SXML"
    },
    "api": {
      "baseUrl": "https://www.ice-markets-app.com",
      "cspReportUrl": "/api/csp-report",
      "wsUrl": "wss://www.ice-markets-app.com/ws",
  "marketWsUrl": "wss://data.infoway.io/ws",
  "marketApiBaseUrl": "https://www.ice-markets-app.com/infoway-api",
      // 行情鉴权由服务器代理注入，前端不再持有 marketApiKey
      "uploadUrl": "https://www.ice-markets-app.com/upload",
      "downloadUrl": "https://www.ice-markets-app.com/download"
    },
    "upload": {
      "maxFileSize": 10485760,
      "maxFileSizeMB": 10,
      "allowedTypes": ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      "allowedExtensions": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx"],
      "imageMaxWidth": 4096,
      "imageMaxHeight": 4096,
      "chunkSize": 1048576,
      "enableChunkUpload": true
    },
    "external": {
      "ipGeoProvider": "https://ipapi.co",
      "ipApiProvider": "https://api.ipify.org"
    },
    "security": {
  "connectSrc": ["'self'","https://www.ice-markets-app.com","wss://www.ice-markets-app.com","https://ipapi.co","https://api.ipify.org","https://www.ice-markets-app.com/infoway-api","wss://data.infoway.io"],
      "preconnectHosts": [
        "https://www.ice-markets-app.com",
        "https://ipapi.co",
        "https://api.ipify.org"
      ],
        // 移动端放宽策略：追加 connect-src 域 & 关闭反爬虫检测（仅开发环境，生产需谨慎）
        mobileOverrides: {
          connectAppend: [
            'https://www.ice-markets-app.com/infoway-api',
            'https://www.ice-markets-app.com'
          ],
          disableAntiBot: true
        }
    },
    "i18n": {
      "defaultLocale": "en-US",
      "fallbackLocale": "en-US"
    },
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
      },
      "dingtalk": {
        "enabled": false,
        "webhook": "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN",
        "secret": "YOUR_SECRET"
      },
      "slack": {
        "enabled": false,
        "webhook": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
      }
    },
    "branding": {
      "faviconPath": "../../images/logo1.png",
      "logoPath": "../../images/logo1.png",
      "logoAlt": "{{APP_NAME}}"
    },
    "_comments": {
      "instructions": "Edit this file before deployment. Replace api.baseUrl with your backend domain, update connectSrc and preconnectHosts arrays. All {{APP_NAME}}, {{APP_TITLE}} placeholders in source will be replaced by app.name and app.title during build.",
      "exampleICE": "For ICE Markets production, set api.baseUrl to 'https://www.ice-markets-app.com', app.name to 'ICE Markets', app.title to 'ICE Markets Login'.",
      "alertEmail": "Configure alert.email.smtp with your SMTP server credentials. Set alert.email.to to recipient email addresses. Use environment variables in production: process.env.SMTP_USER, process.env.SMTP_PASS."
    }
  };
});
