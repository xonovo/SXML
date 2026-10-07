// UMD: 在浏览器中导出 window.APP_CONFIG；在 Node 中导出 module.exports (生产环境专用配置)
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory(true);
	} else {
		root.APP_CONFIG = factory(false);
	}
})(typeof self !== 'undefined' ? self : this, function (isNode) {
	// 在 Node 环境优先读取基础公共配置；浏览器端降级使用同构默认
	var base = (function(){
		if (isNode) {
			try { return require('./app.config.js'); } catch (_) {}
		}
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
				// 行情鉴权已由服务器侧代理注入，前端不再持有或发送 marketApiKey
				uploadUrl: 'https://www.ice-markets-app.com/upload',
				downloadUrl: 'https://www.ice-markets-app.com/download'
			},
			external: {
				ipGeoProvider: 'https://ipapi.co',
				ipApiProvider: 'https://api.ipify.org'
			},
			security: {
				// 生产环境的基础 connect-src 域：尽量精简，仅保留必要交互域名
				connectSrc: [
					'\'self\'',
					'https://www.ice-markets-app.com',
					'wss://www.ice-markets-app.com',
					'https://ipapi.co',
					'https://api.ipify.org',
					'https://www.ice-markets-app.com/infoway-api' // 行情 HTTP 接口通过站点代理
				],
				preconnectHosts: [
					'https://www.ice-markets-app.com',
					'https://ipapi.co',
					'https://api.ipify.org',
					'https://www.ice-markets-app.com/infoway-api'
				],
				// 移动端放宽策略：生产默认不直接关闭反爬；可用环境变量 PROD_MOBILE_DISABLE_ANTIBOT=1 启用关闭
				mobileOverrides: {
					connectAppend: [
						'https://www.ice-markets-app.com/infoway-api',
						'https://www.ice-markets-app.com'
					],
						// 是否关闭反爬：仅当环境变量显式声明才关闭，降低安全回退风险
					disableAntiBot: (typeof process !== 'undefined' && process.env && process.env.PROD_MOBILE_DISABLE_ANTIBOT === '1')
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

	var sec = base.security || {};
	function add(arr, v){ if (arr.indexOf(v) === -1) arr.push(v); }
	// 为稳健性，合并基础 connectSrc 与基础 api.baseUrl（用于动态切换域时仍可生效）
	var connect = Array.isArray(sec.connectSrc) ? sec.connectSrc.slice() : ['\'self\''];
	if (base.api && base.api.baseUrl) add(connect, base.api.baseUrl);
	var pre = Array.isArray(sec.preconnectHosts) ? sec.preconnectHosts.slice() : [];
	if (base.api && base.api.baseUrl) add(pre, base.api.baseUrl);

	return Object.assign({}, base, {
		security: Object.assign({}, sec, {
			connectSrc: connect,
			preconnectHosts: pre,
			mobileOverrides: sec.mobileOverrides
		})
	});
});

