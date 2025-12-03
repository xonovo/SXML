// 轻量 Page 运行时与页面自动加载器
(function(){
	'use strict';

	// 简易日志
	function log(){ try{ console.log.apply(console, ['[page.loader]'].concat([].slice.call(arguments))); }catch(_){} }
	function warn(){ try{ console.warn.apply(console, ['[page.loader]'].concat([].slice.call(arguments))); }catch(_){} }

	// 当前页面实例 + 预加载安全 stub，防止页面脚本未加载时点击触发报错
	var currentPage = null;
	var __pendingCalls = [];
	var __pageDefs = {}; // 缓存各页面的原始定义，便于后续快速重新实例化
	window.__SXML_REAL_PAGE__ = window.__SXML_REAL_PAGE__ || null;

	function normalizePageKey(input){
		if (!input) return '';
		try {
			var cleaned = String(input).replace(/\?.*$/,'');
			if (/^https?:/i.test(cleaned)) {
				cleaned = new URL(cleaned, window.location.href).pathname;
			}
			if (!cleaned.startsWith('/')) {
				var abs = new URL(cleaned, window.location.href);
				cleaned = abs.pathname;
			}
			return cleaned.replace(/\?.*$/,'');
		} catch(_){
			try {
				return String(input).replace(/\?.*$/,'');
			} catch(__) {
				return '';
			}
		}
	}

	function inferPageKeyFromScript(){
		try {
			if (window.__SXML_PENDING_PAGE_URL__) {
				return normalizePageKey(window.__SXML_PENDING_PAGE_URL__);
			}
			var script = document.currentScript;
			if (!script) {
				var scripts = document.getElementsByTagName('script');
				if (scripts && scripts.length) script = scripts[scripts.length - 1];
			}
			if (!script) return null;
			var attr = script.getAttribute && script.getAttribute('data-page-url');
			if (attr) return normalizePageKey(attr);
			var src = script.getAttribute ? script.getAttribute('src') : (script.src || '');
			if (src) {
				var key = src.replace(/\?.*$/,'').replace(/\.js$/i, '.html');
				return normalizePageKey(key);
			}
		} catch(_){ }
		try { return normalizePageKey(location.pathname || ''); } catch(__) { return ''; }
	}
	function clone(obj){ if (!obj || typeof obj !== 'object') return obj; try { return JSON.parse(JSON.stringify(obj)); } catch(_) { var o = Array.isArray(obj)?[]:{}; for (var k in obj){ if (Object.prototype.hasOwnProperty.call(obj,k)) o[k]=clone(obj[k]); } return o; } }
	function instantiateFromDef(url){
		var def = __pageDefs[url];
		if (!def) {
			log('no page def for', url);
			log('available page defs:', Object.keys(__pageDefs));
			return null;
		}
		log('instantiating from cached def:', url);
		var inst = {};
		for (var k in def){ if (k !== 'data' && Object.prototype.hasOwnProperty.call(def,k)) inst[k] = def[k]; }
		inst.data = clone(def.data) || {};
		if (!inst.setData) inst.setData = setData.bind(inst);
		currentPage = inst; // 更新内部变量，但不覆盖 window.currentPage(stub)
		window.__SXML_REAL_PAGE__ = inst;
		log('currentPage updated to:', inst);
		log('methods available:', Object.keys(inst).filter(function(k){ return typeof inst[k] === 'function'; }));
		try { if (typeof inst.onLoad === 'function') inst.onLoad(); } catch(e){ warn('cached onLoad error', e); }
		try { if (typeof inst.onShow === 'function') inst.onShow(); } catch(e){ }
		return inst;
	}
	window.__instantiatePage = instantiateFromDef; // 暴露给 router
	window.__getPageDef = function(url){ return __pageDefs[url]; };
	
	// 通用 fallback：尝试转发给真实页面实例或缓存调用
	// 关键：使用 getter 动态获取当前页面实例的方法，而不是闭包捕获旧引用
	function resolveHomeEntries(){
		try {
			if (window.__SXML_HOME_ENTRIES__) return window.__SXML_HOME_ENTRIES__;
			var pathname = (location && location.pathname) ? location.pathname : '/';
			var idx = pathname.indexOf('/pages/');
			var base = idx >= 0 ? pathname.substring(0, idx) : pathname.replace(/[^\/]*$/, '');
			if (!base) base = '/';
			var normalizedBase = base === '/' ? '/' : (base.endsWith('/') ? base : base + '/');
			var entries = {
				page: normalizedBase + 'pages/index/index.html',
				root: base === '/' ? '/index.html' : (base.endsWith('/') ? base + 'index.html' : base + '/index.html')
			};
			window.__SXML_HOME_ENTRY__ = entries.root; // 向后兼容
			window.__SXML_HOME_ENTRIES__ = entries;
			return entries;
		} catch(_){
			return { page: '/pages/index/index.html', root: '/index.html' };
		}
	}

	function universalProxy(methodName, options){
		options = options || {};
		return function(e){
			var realPage = currentPage;
			log('[universalProxy]', methodName, 'realPage:', realPage, 'hasMethod:', realPage && typeof realPage[methodName]);
			if (realPage && typeof realPage[methodName] === 'function') {
				log('[universalProxy] calling', methodName);
				return realPage[methodName].call(realPage, e);
			}
			if (typeof options.fallback === 'function') {
				warn('[stub] method not found, invoking fallback:', methodName);
				return options.fallback(e, realPage);
			}
			warn('[stub] method not found, caching call:', methodName);
			__pendingCalls.push({ fn: methodName, args: [e] });
		};
	}

	function fallbackGoLogin(triggerEvent){
		var tries = 0;
		var maxTries = 5;
		var waitBase = 40; // 线性退避等待页面脚本就绪
		function tryDelegate(){
			var pageInstance = currentPage;
			if (pageInstance && typeof pageInstance.goLogin === 'function') {
				log('[fallbackGoLogin] resolved real goLogin after wait');
				try {
					return pageInstance.goLogin.call(pageInstance, triggerEvent);
				} catch(callErr){
					warn('[fallbackGoLogin] real goLogin threw error', callErr);
				}
			}
			if (tries < maxTries) {
				tries++;
				return setTimeout(tryDelegate, waitBase * tries);
			}
			hardFallback();
		}
		function hardFallback(){
			var entries = resolveHomeEntries();
			var pageTarget = entries.page;
			var rootTarget = entries.root;
			try {
				if (window.sxmlBack) {
					window.sxmlBack();
					return;
				}
			} catch(_){ }
			try {
				if (window.sxmlNavigate) {
					window.sxmlNavigate(pageTarget, { direction: 'back', noHistory: true });
					return;
				}
			} catch(_){ }
			try {
				window.location.href = pageTarget;
				return;
			} catch(_){ }
			try {
				window.location.href = rootTarget;
			} catch(__) {
				try { window.location.replace(rootTarget); } catch(___) {}
			}
		}
		tryDelegate();
	}
	
	// 创建全局 stub，HTML 事件绑定会引用这个对象
	// 所有方法都通过 universalProxy 动态代理到 currentPage 变量
	var globalStub = {
		__sxmlStub: true,
		goRegist: universalProxy('goRegist'),
		goLogin: universalProxy('goLogin', { fallback: fallbackGoLogin }),
		loginEvent: universalProxy('loginEvent'),
		toggleLanguage: universalProxy('toggleLanguage'),
		registEvent: universalProxy('registEvent'),
		uploadIdFront: universalProxy('uploadIdFront'),
		uploadIdBack: universalProxy('uploadIdBack'),
		u_onfocus: universalProxy('u_onfocus'),
		u_onblur: universalProxy('u_onblur'),
		// webapp 页面方法
		switchTab: universalProxy('switchTab'),
		switchTradeFundsPage: universalProxy('switchTradeFundsPage'),
		switchFundsTab: universalProxy('switchFundsTab'),
		clickFeature: universalProxy('clickFeature'),
		openSymbolPicker: universalProxy('openSymbolPicker'),
		selectSymbol: universalProxy('selectSymbol'),
		searchSymbols: universalProxy('searchSymbols'),
		toggleFavoriteStar: universalProxy('toggleFavoriteStar'),
		onMarketRowClick: universalProxy('onMarketRowClick'),
		renderSheetAlert: universalProxy('renderSheetAlert'),
		closeActionSheet: universalProxy('closeActionSheet'),
		// 新增: 暴露 Guest Priming & HTTP 初始化相关方法，解决 stub 上缺失导致调用 undefined
		scheduleGuestPriming: universalProxy('scheduleGuestPriming'),
		ensureInfowayHttpClient: universalProxy('ensureInfowayHttpClient'),
		refreshHomeMostActive: universalProxy('refreshHomeMostActive'),
		refreshTradeSymbol: universalProxy('refreshTradeSymbol'),
		// chart-detail 页面交互
		handleTimeframeTap: universalProxy('handleTimeframeTap'),
		handleNavigateBack: universalProxy('handleNavigateBack'),
		handleBuyLong: universalProxy('handleBuyLong'),
		handleSellShort: universalProxy('handleSellShort')
	};
	window.currentPage = globalStub;
	window.__SXML_PAGE_STUB__ = globalStub;
	function getActivePageInstance(){ return currentPage; }
	window.__getActivePageInstance = getActivePageInstance;

	// 简易 setData：浅合并 data，并尝试更新绑定的 dataset（这里只做最小实现）
	function setData(patch){
		try {
			this.data = this.data || {};
			for (var k in patch) { this.data[k] = patch[k]; }
		} catch(_) {}
	}

	// Page 定义入口（供 pages/*/*.js 调用）
	window.Page = function(def){
		try {
			def = def || {};
			var inst = {};
			for (var k in def) inst[k] = def[k];
			if (!inst.data) inst.data = {};
			if (!inst.setData) inst.setData = setData.bind(inst);
			// 记录原始定义，使用脚本自身推断的页面路径作为 key
			try {
				var urlKey = inferPageKeyFromScript();
				if (urlKey) {
					__pageDefs[urlKey] = def;
					log('cached page def for', urlKey);
				} else if (location && location.pathname) {
					var fallbackKey = location.pathname.replace(/\?.*$/,'');
					__pageDefs[fallbackKey] = def;
					log('cached page def via location', fallbackKey);
				}
				var shouldInstantiate = true;
				var activePath = null;
				var pendingPath = null;
				try { activePath = normalizePageKey(location && location.pathname ? location.pathname : ''); } catch(_){ }
				try {
					if (window.__SXML_PENDING_PAGE_URL__) {
						pendingPath = normalizePageKey(window.__SXML_PENDING_PAGE_URL__);
					}
				} catch(_){ }
				if (urlKey) {
					var matchesActive = activePath && urlKey === activePath;
					var matchesPending = pendingPath && urlKey === pendingPath;
					if (!matchesActive && !matchesPending) {
						shouldInstantiate = false;
						log('prefetch mode detected, skip instantiation for', urlKey, 'current:', activePath || '(none)', 'pending:', pendingPath || '(none)');
					}
				}
				if (!shouldInstantiate) {
					return inst;
				}
				if (pendingPath && urlKey === pendingPath) {
					try { delete window.__SXML_PENDING_PAGE_URL__; } catch(_){ window.__SXML_PENDING_PAGE_URL__ = null; }
				}
			} catch(_){ }
			currentPage = inst; // 更新内部变量，让 stub 的 universalProxy 可以访问
			window.__SXML_REAL_PAGE__ = inst;
			// 不覆盖 window.currentPage(stub)，保持事件绑定始终有效
			// 回放在脚本尚未加载前缓存的调用（只在首次替换时）
			if (__pendingCalls && __pendingCalls.length) {
				for (var i=0;i<__pendingCalls.length;i++) {
					var c = __pendingCalls[i];
					if (c && c.fn && typeof inst[c.fn] === 'function') {
						try { inst[c.fn].apply(inst, c.args||[]); } catch(_) {}
					}
				}
				__pendingCalls.length = 0;
			}
			log('Page registered');
			// Page() 调用后即可触发 onLoad（若在页面 JS 动态加载完成后）
			try { if (typeof inst.onLoad === 'function') inst.onLoad(); } catch(e) { warn('onLoad error', e); }
			return inst;
		} catch (e) {
			warn('Page register failed', e);
		}
	};

	function loadScript(src){
		return new Promise(function(resolve, reject){
			try {
				var s = document.createElement('script');
				s.src = src;
				s.async = false;
				s.setAttribute('data-page-script', src); // 标记页面脚本，便于路由清理
				s.onload = function(){ resolve(); };
				s.onerror = function(){ reject(new Error('load failed: '+src)); };
				document.head.appendChild(s);
			} catch(e) { reject(e); }
		});
	}

	// 自动推断并加载当前页面的 JS（/pages/<name>/<name>.js）
	function firePageResourcesLoaded(detail){
		try {
			var payload = Object.assign({ timestamp: Date.now() }, detail || {});
			var evt = new CustomEvent('pageResourcesLoaded', { detail: payload });
			document.dispatchEvent(evt);
		} catch(err) {
			try {
				var legacy = document.createEvent('CustomEvent');
				legacy.initCustomEvent('pageResourcesLoaded', false, false, detail || {});
				document.dispatchEvent(legacy);
			} catch(_) {}
		}
	}

	async function boot(){
		try {
			var overridePath = window.__SXML_PENDING_PAGE_URL__ || null;
			var isRelativeOverride = !!(overridePath && !/^([a-z]+:)?\//i.test(overridePath));
			var path = overridePath || location.pathname; // e.g. /pages/webapp/regist/regist.html
			var normalizedPath = path;
			if (!normalizedPath.startsWith('/')) {
				normalizedPath = '/' + normalizedPath.replace(/^\.\//,'');
			}
			var m = normalizedPath.match(/\/pages\/(.+)\/([^\/]+)\.html$/i);
			if (!m) { warn('no page html matched', normalizedPath); return; }
			var folder = m[1]; var name = m[2];
			var dir = normalizedPath.replace(/[^\/]+$/, ''); // 当前 HTML 所在目录
			var jsUrl = dir + name + '.js';
			if (isRelativeOverride) {
				var relDir = overridePath.replace(/[^\/]+$/, '');
				jsUrl = relDir + name + '.js';
			}
			log('loading page script:', jsUrl);
			await loadScript(jsUrl);
			firePageResourcesLoaded({ pageUrl: normalizedPath, scriptUrl: jsUrl });
			// 全局 Guest Priming 兜底：如果 webapp 页面脚本缺失 scheduleGuestPriming 或未实例化导致 onLoad 未触发
			try {
				if (/\/pages\/webapp\/webapp\.html$/i.test(normalizedPath)) {
					setTimeout(function(){
						try {
							var pageObj = window.__SXML_REAL_PAGE__ || window.currentPage;
							if (!pageObj || typeof pageObj !== 'object') { return; }
							var hasAuth = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('k')) ||
									(localStorage && localStorage.getItem && localStorage.getItem('apiKey'));
							if (hasAuth) { return; } // 仅针对未登录 Guest 模式
							if (pageObj._infowayGuestPrimed) { return; } // 已完成
							if (typeof pageObj.scheduleGuestPriming === 'function') {
								console.log('[globalGuestPrime] invoke scheduleGuestPriming (兜底)');
								try { pageObj.scheduleGuestPriming(); } catch(e){ console.warn('[globalGuestPrime] scheduleGuestPriming 调用失败', e); }
							} else {
								console.warn('[globalGuestPrime] scheduleGuestPriming 缺失，执行简易 Priming 兜底');
								var tries = 0; var maxTries = 5;
								var simpleAttempt = function(){
									tries++;
									console.log('[globalGuestPrime:fallback] attempt', tries, '/', maxTries);
									var ensureClient = pageObj.ensureInfowayHttpClient || pageObj.ensureInfowayClient || null;
									if (!ensureClient || typeof ensureClient !== 'function') {
										console.warn('[globalGuestPrime:fallback] ensureInfowayHttpClient 缺失');
										return;
									}
									Promise.resolve().then(function(){ return ensureClient.call(pageObj); }).then(function(client){
										if (!client) {
											if (tries < maxTries) return setTimeout(simpleAttempt, tries * 500);
											console.warn('[globalGuestPrime:fallback] 放弃，InfowayHttp 未就绪');
											return;
										}
										var refreshMost = pageObj.refreshHomeMostActive || null;
										var refreshTrade = pageObj.refreshTradeSymbol || null;
										if (refreshMost) { try { refreshMost.call(pageObj, true); } catch(e){ console.warn('[globalGuestPrime:fallback] refreshHomeMostActive error', e); } }
										if (refreshTrade) { try { refreshTrade.call(pageObj, pageObj._activeSymbol || pageObj._defaultSymbol, { silent: true, skipSymbolSave: true }); } catch(e){ console.warn('[globalGuestPrime:fallback] refreshTradeSymbol error', e); } }
										pageObj._infowayGuestPrimed = true;
										console.log('[globalGuestPrime:fallback] Priming 完成');
									}).catch(function(err){
										console.warn('[globalGuestPrime:fallback] 未知错误', err);
										if (tries < maxTries) setTimeout(simpleAttempt, tries * 500);
									});
								};
								simpleAttempt();
							}
						} catch(guestErr){ console.warn('[globalGuestPrime] 兜底逻辑异常', guestErr); }
					}, 50);
				}
			} catch(_){ }
			if (!window.currentPage) {
				warn('page script loaded but no Page() called');
			} else {
				log('page ready');
			}
		} catch(e) {
			warn('boot failed', e);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();

