(function(root){
  'use strict';

  var globalScope = root || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
  var DEFAULT_BASE = 'https://www.ice-markets-app.com/infoway-api';

  function normalizeBase(url) {
    if (!url) return DEFAULT_BASE;
    var trimmed = String(url).trim();
    if (!trimmed) return DEFAULT_BASE;
    if (trimmed.indexOf('//') === 0 && typeof location !== 'undefined') {
      return (location.protocol || 'https:') + trimmed;
    }
    if (!/^https?:/i.test(trimmed)) {
      if (trimmed.charAt(0) === '/') {
        var origin = (typeof location !== 'undefined') ? (location.protocol + '//' + location.host) : DEFAULT_BASE;
        return origin.replace(/\/$/, '') + trimmed;
      }
      return 'https://' + trimmed.replace(/^\/+/, '');
    }
    return trimmed.replace(/\/$/, '');
  }

  function InfowayHttp(options) {
    options = options || {};
    this.options = {
      baseUrl: options.baseUrl || ((globalScope.APP_CONFIG && globalScope.APP_CONFIG.api && (globalScope.APP_CONFIG.api.marketApiBaseUrl || globalScope.APP_CONFIG.api.marketHttpBaseUrl)) || ''),
      timeout: typeof options.timeout === 'number' ? options.timeout : 12000,
      defaultBusiness: options.defaultBusiness || 'common',
      headers: options.headers || null
    };
  }

  InfowayHttp.prototype._resolveBaseUrl = function() {
    return normalizeBase(this.options.baseUrl || DEFAULT_BASE);
  };

  InfowayHttp.prototype._normalizeSymbols = function(symbols) {
    if (!symbols) return '';
    if (Array.isArray(symbols)) {
      return symbols.filter(Boolean).map(function(s){ return String(s).trim(); }).filter(Boolean).join(',');
    }
    return String(symbols).trim();
  };

  // 前端不再解析或发送 market apiKey，鉴权由服务器代理注入

  InfowayHttp.prototype._fetchJson = async function(path, init) {
    const base = this._resolveBaseUrl();
    let url = base + (path.charAt(0) === '/' ? path : '/' + path);
    // 不再在 URL 上附加 apikey，统一由服务端代理拼接
    // 解析当前登录账号，附加到头部，便于网关进行双因子校验 (账号 + apiKey)
    let userAccount = '';
    try { if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) userAccount = sessionStorage.getItem('u') || ''; } catch(_) {}
    const headersBase = Object.assign({}, this.options.headers || {}, (init && init.headers) || {});
    // 不再发送 x-api-key
    headersBase['x-user-account'] = userAccount || '';
    headersBase['Accept'] = 'application/json';
    const headers = headersBase;
    if (init && init.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = this.options.timeout;
    let timer = null;
    if (controller) {
      timer = setTimeout(function(){ try { controller.abort(); } catch(_) {} }, timeout);
    }
    const fetchOptions = Object.assign({ method: 'GET', headers: headers }, init || {});
    var shouldSendCredentials = false;
    try {
      if (typeof location !== 'undefined' && location.origin) {
        shouldSendCredentials = url.indexOf(location.origin) === 0;
      }
    } catch (_) {}
    if (!shouldSendCredentials && /https?:\/\/([\w.-]*ice-markets-app\.com)/i.test(url)) {
      shouldSendCredentials = true;
    }
    if (shouldSendCredentials) {
      fetchOptions.credentials = 'include';
    }
    if (controller) fetchOptions.signal = controller.signal;
    let response;
    let fetchError = null;
    try {
      response = await fetch(url, fetchOptions);
    } catch (err) {
      fetchError = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (fetchError) {
      const rawMsg = (fetchError && fetchError.message) ? fetchError.message : String(fetchError || 'unknown');
      // 识别 CSP 拦截 / 浏览器安全策略阻止
      if (/Content Security Policy|CSP|Refused to connect|blocked by CORS|TypeError: Failed to fetch/i.test(rawMsg)) {
        // 提示需要在服务器响应头的 connect-src 中加入外部域名
        throw new Error('[E-MARKET-CSP] 行情接口被浏览器安全策略阻止，请在服务器 CSP connect-src 中添加域: ' + base + '。原始信息: ' + rawMsg);
      }
      throw new Error('[E-MARKET-FETCH] 行情请求失败: ' + rawMsg);
    }
    if (!response.ok) {
      let text = '';
      try { text = await response.text(); } catch(_) {}
      // 标准化 401 错误，便于调用方区分需要重新登录还是其它错误
      if (response.status === 401) {
        throw new Error('Infoway HTTP 401: ' + (text || '{"code":401,"message":"Token invalid"}'));
      }
      throw new Error('Infoway HTTP ' + response.status + (text ? (': ' + text) : ''));
    }
    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw new Error('Infoway response is not valid JSON');
    }
    if (payload && Number(payload.ret) === 200) {
      return payload.data || [];
    }
    const msg = payload && (payload.msg || payload.message || payload.error);
    throw new Error(msg || 'Infoway API error');
  };

  InfowayHttp.prototype.getDepth = function(symbols, opts) {
    const codes = this._normalizeSymbols(symbols);
    if (!codes) return Promise.resolve([]);
    const business = (opts && opts.business) || this.options.defaultBusiness;
    const levels = opts && Number(opts.depthLevels || opts.level || opts.depth || opts.size);
    let query = '';
    if (levels && levels > 0) {
      const params = [
        'depthLevels=' + encodeURIComponent(levels),
        'depth=' + encodeURIComponent(levels),
        'size=' + encodeURIComponent(levels)
      ];
      query = '?' + params.join('&');
    }
    return this._fetchJson('/' + business + '/batch_depth/' + encodeURIComponent(codes) + query);
  };

  InfowayHttp.prototype.getTrades = function(symbols, opts) {
    const codes = this._normalizeSymbols(symbols);
    if (!codes) return Promise.resolve([]);
    const business = (opts && opts.business) || this.options.defaultBusiness;
    return this._fetchJson('/' + business + '/batch_trade/' + encodeURIComponent(codes));
  };

  InfowayHttp.prototype.getCandles = function(params, opts) {
    params = params || {};
    const codes = this._normalizeSymbols(params.symbols || params.codes);
    if (!codes) return Promise.resolve([]);
    const business = (opts && opts.business) || this.options.defaultBusiness;
    const body = {
      klineType: params.klineType || 1,
      klineNum: params.klineNum || 2,
      codes: codes
    };
    if (params.timestamp) body.timestamp = params.timestamp;
    return this._fetchJson('/' + business + '/v2/batch_kline', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  };

  InfowayHttp.prototype.getSymbolList = function(type, symbols) {
    const query = '?type=' + encodeURIComponent(type || 'FOREX') + (symbols ? ('&symbols=' + encodeURIComponent(this._normalizeSymbols(symbols))) : '');
    return this._fetchJson('/common/basic/symbols' + query);
  };

  InfowayHttp.prototype.getSymbolInfo = function(type, symbols) {
    const query = '?type=' + encodeURIComponent(type || 'FOREX') + '&symbols=' + encodeURIComponent(this._normalizeSymbols(symbols));
    return this._fetchJson('/common/basic/symbols/info' + query);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InfowayHttp;
  } else {
    globalScope.InfowayHttp = InfowayHttp;
  }
})(typeof window !== 'undefined' ? window : null);
