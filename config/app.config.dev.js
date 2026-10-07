// UMD: 在浏览器中导出 window.APP_CONFIG；在 Node 中导出 module.exports
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(true);
  } else {
    root.APP_CONFIG = factory(false);
  }
})(typeof self !== 'undefined' ? self : this, function (isNode) {
  // 在 Node 环境下可用 require 取基础配置；浏览器下内联一份基础默认配置
  var base = (function(){
    if (isNode) {
      try { return require('./app.config.js'); } catch (_) {}
    }
    // 浏览器回退：与 app.config.js 同构的一份默认配置
    return {
      app: {
        name: 'Your App',
        title: 'Your App Management Entrance',
        subtitle: 'Management System',
        description: 'Modern Web 3.0 Management System powered by SXML'
      },
      api: {
        baseUrl: 'https://www.ice-markets-app.com',
        cspReportUrl: '/api/csp-report',
  wsUrl: 'wss://www.ice-markets-app.com/ws',
  marketWsUrl: 'wss://www.ice-markets-app.com/infoway-websocket',
  marketApiBaseUrl: 'https://www.ice-markets-app.com/infoway-api',
        // 开发环境：行情鉴权由服务器代理注入，前端不再持有 marketApiKey
        uploadUrl: 'https://www.ice-markets-app.com/upload',
        downloadUrl: 'https://www.ice-markets-app.com/download'
      },
      external: {
        ipGeoProvider: 'https://ipapi.co',
        ipApiProvider: 'https://api.ipify.org'
      },
      security: {
        connectSrc: [
          '\'self\'',
          'https://www.ice-markets-app.com',
          'wss://www.ice-markets-app.com',
          'https://ipapi.co',
          'https://api.ipify.org',
          // Infoway HTTP 行情接口域 (通过站点 Nginx 反向代理)
          'https://www.ice-markets-app.com/infoway-api'
        ],
        preconnectHosts: [
          'https://www.ice-markets-app.com',
          'https://ipapi.co',
          'https://api.ipify.org',
          'https://www.ice-markets-app.com/infoway-api'
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
      i18n: {
        defaultLocale: 'en-US',
        fallbackLocale: 'en-US'
      },
      branding: {
        faviconPath: '../../images/logo1.png',
        logoPath: '../../images/logo1.png',
        logoAlt: '{{APP_NAME}}'
      }
    };
  })();

  // Dev 专属增强：确保外部 IP 服务可用，并可按需调整默认语言
  var sec = base.security || {};
  function add(arr, v){ if (arr.indexOf(v) === -1) arr.push(v); }
  var connect = Array.isArray(sec.connectSrc) ? sec.connectSrc.slice() : ['\'self\''];
  add(connect, 'https://ipapi.co');
  add(connect, 'https://api.ipify.org');
  if (base.api && base.api.baseUrl) add(connect, base.api.baseUrl);
  var pre = Array.isArray(sec.preconnectHosts) ? sec.preconnectHosts.slice() : [];
  add(pre, 'https://ipapi.co');
  add(pre, 'https://api.ipify.org');

  // 可以在开发期将默认语言切到中文，如需请取消下一行注释
  // if (base.i18n) base.i18n.defaultLocale = 'zh-CN';

  return Object.assign({}, base, {
    security: Object.assign({}, sec, {
      connectSrc: connect,
      preconnectHosts: pre,
      mobileOverrides: sec.mobileOverrides
    })
  });
});
