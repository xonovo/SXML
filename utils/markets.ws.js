(function(root){
  'use strict';

  var globalScope = root || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));

  function resolveDefaultEndpoint() {
    var cfg = globalScope.APP_CONFIG && globalScope.APP_CONFIG.api;
    if (cfg) {
      if (cfg.marketWsUrl) return cfg.marketWsUrl;
      if (cfg.wsUrl) return cfg.wsUrl;
    }
    if (typeof location !== 'undefined' && location.host) {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/infoway-websocket';
    }
    return 'ws://localhost:8080/infoway-websocket';
  }

  function byteToHex(byte) {
    return ('0' + byte.toString(16)).slice(-2);
  }

  function encodeBase64(str) {
    if (typeof btoa === 'function') {
      var utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(_, hex){
        return String.fromCharCode(parseInt(hex, 16));
      });
      return btoa(utf8);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    return str;
  }

  function decodeBase64(b64) {
    if (!b64) return '';
    if (typeof atob === 'function') {
      var binary = atob(b64);
      var percentEncoded = '';
      for (var i = 0; i < binary.length; i++) {
        percentEncoded += '%' + byteToHex(binary.charCodeAt(i));
      }
      try {
        return decodeURIComponent(percentEncoded);
      } catch (err) {
        return binary;
      }
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf8');
    }
    return b64;
  }

  function md5Hex(input) {
    if (typeof hex_md5_utf === 'function') return hex_md5_utf(input);
    if (typeof hex_md5 === 'function') return hex_md5(input);
    if (globalScope.CryptoJS && globalScope.CryptoJS.MD5) {
      return globalScope.CryptoJS.MD5(input).toString();
    }
    throw new Error('MD5 helper is not available');
  }

  function normalizeTimestamp(input) {
    if (input === null || typeof input === 'undefined') return '';
    if (typeof input === 'number') {
      if (!isFinite(input)) return String(input);
      var num = input;
      if (String(Math.abs(Math.trunc(num))).length <= 10) {
        num = Math.trunc(num) * 1000;
      }
      return String(Math.trunc(num));
    }
    var str = String(input).trim();
    if (!str) return '';
    var parsed = parseInt(str, 10);
    if (!isFinite(parsed)) return str;
    if (str.length <= 10) parsed *= 1000;
    return String(parsed);
  }

  function deriveClientCrypto(baseKey, timestamp) {
    if (!baseKey) return null;
    var ts = normalizeTimestamp(timestamp);
    if (!ts) return null;
    var dynamic = md5Hex(baseKey + ts).toUpperCase();
    var rawDay = new Date(parseInt(ts, 10)).getUTCDay();
    var weekday = rawDay === 0 ? 7 : rawDay - 1;
    var ivSource = dynamic;
    while (ivSource.length < weekday + 12) ivSource += baseKey;
    var iv = ivSource.substring(weekday, weekday + 12);
    return { key: dynamic, iv: iv, timestamp: ts };
  }

  function deriveServerCrypto(baseKey, timestamp) {
    if (!baseKey) return null;
    var ts = normalizeTimestamp(timestamp);
    if (!ts) return null;
    var dynamic = md5Hex(baseKey + ts).toUpperCase();
    var decryptKey = dynamic.split('').reverse().join('');
    var rawDay = new Date(parseInt(ts, 10)).getUTCDay();
    var weekday = rawDay === 0 ? 7 : rawDay - 1;
    var ivSource = decryptKey;
    while (ivSource.length < weekday + 12) ivSource += decryptKey;
    var iv = ivSource.substring(weekday, weekday + 12);
    return { key: decryptKey, iv: iv, timestamp: ts };
  }

  function ensurePromise(result) {
    if (result && typeof result.then === 'function') return result;
    return Promise.resolve(result);
  }

  function encryptPayload(plainText, key, iv) {
    var fn = (typeof globalScope.Encrypt === 'function') ? globalScope.Encrypt : null;
    if (!fn && globalScope.AESCrypto && typeof globalScope.AESCrypto.encrypt === 'function') {
      fn = function(data, k, i) { return globalScope.AESCrypto.encrypt(data, k, i); };
    }
    if (!fn) throw new Error('Encrypt helper is not available');
    try {
      return ensurePromise(fn(plainText, key, iv));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function decryptPayload(cipherText, key, iv) {
    var fn = (typeof globalScope.Decrypt === 'function') ? globalScope.Decrypt : null;
    if (!fn && globalScope.AESCrypto && typeof globalScope.AESCrypto.decrypt === 'function') {
      fn = function(data, k, i) { return globalScope.AESCrypto.decrypt(data, k, i); };
    }
    if (!fn) throw new Error('Decrypt helper is not available');
    try {
      return ensurePromise(fn(cipherText, key, iv));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function isPromiseLike(value) {
    return !!(value && typeof value.then === 'function');
  }

  function generateTrace() {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function') {
      return globalScope.crypto.randomUUID();
    }
    return 'trace-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  }

  var MARKETS_DEBUG_FLAG_KEY = 'MARKETS_WS_DEBUG';

  function coerceDebugValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      var normalized = value.trim().toLowerCase();
      if (!normalized) return null;
      if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
      if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
    }
    return null;
  }

  function readDebugFlagFromStorage() {
    var val = null;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
        val = sessionStorage.getItem(MARKETS_DEBUG_FLAG_KEY);
        if (val !== null) return val;
      }
    } catch (_) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        val = localStorage.getItem(MARKETS_DEBUG_FLAG_KEY);
        if (val !== null) return val;
      }
    } catch (_) {}
    return null;
  }

  function resolveDebugFlag(value) {
    var direct = coerceDebugValue(value);
    if (typeof direct === 'boolean') return direct;
    if (globalScope && typeof globalScope.MARKETS_WS_DEBUG !== 'undefined') {
      var globalVal = coerceDebugValue(globalScope.MARKETS_WS_DEBUG);
      if (typeof globalVal === 'boolean') return globalVal;
    }
    if (globalScope && typeof globalScope.__MARKETS_WS_DEBUG__ !== 'undefined') {
      var aliasVal = coerceDebugValue(globalScope.__MARKETS_WS_DEBUG__);
      if (typeof aliasVal === 'boolean') return aliasVal;
    }
    var stored = readDebugFlagFromStorage();
    if (stored !== null) {
      var storedVal = coerceDebugValue(stored);
      if (typeof storedVal === 'boolean') return storedVal;
    }
    return false;
  }

  function MarketsSocket(options) {
    options = options || {};
    this.options = {
      endpoint: options.endpoint || resolveDefaultEndpoint(),
      cryptoMode: options.cryptoMode || 'no',
      business: options.business || 'common', // 默认业务类型：common (外汇/期货等)，可由 setBusiness 调整
      reconnect: options.reconnect !== false,
      reconnectDelay: options.reconnectDelay || 2500,
      maxReconnectDelay: options.maxReconnectDelay || 15000,
      heartbeatInterval: options.heartbeatInterval || 15000,
      provider: options.provider || 'internal',
      useInfowayProtocol: options.useInfowayProtocol === true || /infoway-websocket/i.test(options.endpoint || ''),
      debug: resolveDebugFlag(options.debug),
      onStateChange: options.onStateChange,
      onData: options.onData,
      onError: options.onError
    };
    this.ws = null;
    this.credentials = null;
    this.watchSymbols = [];
    this.watchOptions = { business: this.options.business };
    this.activeSubscription = false;
    this.lastSubscribedCodes = '';
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.authenticated = false;
    this.sessionId = null;
    this.lastPong = null;
    this.sessionCrypto = null;
    this._manualClose = false;
    this._pendingSubscribeSymbols = null;
    this._lastSubscribeSentAt = 0;
    this.lastAuthTimestamp = 0;
    this._subscribeConfirmed = false;
    // 变体机制已废弃：采用用户更正后的单一订阅格式
  }

  MarketsSocket.prototype._log = function() {
    if (this.options.debug && typeof console !== 'undefined' && console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[MarketsSocket]');
      console.log.apply(console, args);
    }
  };

  MarketsSocket.prototype._warn = function() {
    if (typeof console !== 'undefined' && console.warn) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[MarketsSocket]');
      console.warn.apply(console, args);
    }
  };

  MarketsSocket.prototype._emitState = function(state, detail) {
    this._log('state:', state, detail || '');
    if (typeof this.options.onStateChange === 'function') {
      try {
        this.options.onStateChange(state, detail);
      } catch (err) {
        this._warn('onStateChange error', err);
      }
    }
  };

  MarketsSocket.prototype._emitError = function(err) {
    this._warn('error:', err);
    if (typeof this.options.onError === 'function') {
      try {
        this.options.onError(err);
      } catch (cbErr) {
        this._warn('onError callback error', cbErr);
      }
    }
  };

  MarketsSocket.prototype._resolveEndpoint = function() {
    var url = this.options.endpoint || resolveDefaultEndpoint();
    if (!url) return url;
    if (/^wss?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) {
      var proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
      return proto + url;
    }
    if (url.charAt(0) === '/' && typeof location !== 'undefined') {
      var scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return scheme + '//' + location.host + url;
    }
    return url;
  };

  MarketsSocket.prototype.connect = function(credentials) {
    if (credentials) {
      this.credentials = Object.assign({}, credentials);
    }
    if (!this.credentials || !this.credentials.apiKey || !this.credentials.userAccount) {
      this._emitError(new Error('Missing credentials for MarketsSocket'));
      return;
    }
    this._manualClose = false;
    this.authenticated = false;
    this.sessionCrypto = null;
    this._pendingSubscribeSymbols = null;
    this._lastSubscribeSentAt = 0;
    this._subscribeConfirmed = false;
    this._clearHeartbeat();
    this._clearReconnect();

    var endpoint = this._resolveEndpoint();
    if (!endpoint) {
      this._emitError(new Error('Unable to resolve websocket endpoint'));
      return;
    }
    var WebSocketCtor = globalScope.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WebSocketCtor) {
      this._emitError(new Error('WebSocket is not supported in this environment'));
      return;
    }
    try {
      this.ws = new WebSocketCtor(endpoint);
    } catch (err) {
      this._emitError(err);
      if (this.options.reconnect) {
        this._scheduleReconnect();
      }
      return;
    }
    this.ws.addEventListener('open', this._handleOpen.bind(this));
    this.ws.addEventListener('close', this._handleClose.bind(this));
    this.ws.addEventListener('error', this._handleError.bind(this));
    this.ws.addEventListener('message', this._handleMessage.bind(this));
    this._emitState('connecting');
  };

  MarketsSocket.prototype.disconnect = function() {
    this._manualClose = true;
    this._clearHeartbeat();
    this._clearReconnect();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.authenticated = false;
    this.sessionCrypto = null;
    this._emitState('closed');
  };

  MarketsSocket.prototype.isReady = function() {
    return !!(this.authenticated && this.ws && this.ws.readyState === WebSocket.OPEN);
  };

  MarketsSocket.prototype.updateWatchlist = function(symbols, opts) {
    var list = Array.isArray(symbols)
      ? symbols.map(function(item){ return String(item || '').trim(); }).filter(Boolean)
      : [];
    this.watchSymbols = list;
    this.watchOptions = Object.assign({ business: this.options.business }, opts || {});
    if (this.isReady()) {
      this._applyWatchlist();
    }
  };

  MarketsSocket.prototype._handleOpen = function() {
    this._log('socket open');
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this._emitState('open');
    this._sendAuth();
  };

  MarketsSocket.prototype._handleClose = function(evt) {
    this._log('socket close', evt && evt.code, evt && evt.reason);
    this.authenticated = false;
    this.sessionCrypto = null;
    this._emitState('closed', evt);
    this._clearHeartbeat();
    if (!this._manualClose && this.options.reconnect) {
      this._scheduleReconnect();
    }
  };

  MarketsSocket.prototype._handleError = function(err) {
    this._emitError(err);
  };

  MarketsSocket.prototype._handleMessage = function(evt) {
    if (!evt || typeof evt.data === 'undefined') return;
    var raw = evt.data;
    this._log('收到消息:', raw.substring(0, 200));
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      this._warn('non-json message', raw);
      return;
    }
    if (!msg) return;
    var displayCode = msg.code || (msg.data && msg.data.code) || 'N/A';
    this._log('解析后', { type: msg.type, code: displayCode, hasData: !!msg.data });

    // 处理服务端数值鉴权提示
    if (typeof msg.code === 'number' && msg.code === 4010) {
      this._sendAuth();
      return;
    }

    // 基于 Infoway 100xx/110xx 协议号的精细识别（兼容无 type 的纯 code 消息）
    if (msg && typeof msg.code === 'number' && !msg.type) {
      switch (msg.code) {
        case 10001: // Trade订阅响应
        case 10004: // Depth订阅响应
        case 10007: // Candles订阅响应
          this._subscribeConfirmed = true;
          this._emitState('subscribed', msg);
          return;
        case 10002: // Trade数据推送
        case 10005: // Depth数据推送
        case 10008: // Candles数据推送
          if (!this._subscribeConfirmed) this._subscribeConfirmed = true;
          this._forwardPayload({ type: 'data', data: msg }, false);
          return;
        case 10010: // 心跳请求 (一般为 C→S，此处仅防御性处理)
          this._emitState('ping', msg);
          return;
        case 10011: // 心跳响应
          this.lastPong = Date.now();
          this._emitState('pong', msg);
          return;
        case 11010: // 取消订阅响应
          this._emitState('unsubscribed', msg);
          return;
        default:
          // 其余 code 仍按普通数据透传，便于调试
          this._forwardPayload(msg, false);
          return;
      }
    }

    switch (msg.type) {
      case 'auth_required':
        this._sendAuth();
        return;
      case 'auth_success':
        if (this.sessionCrypto) {
          var authTs = msg && (msg.timestamp || msg.ts || (msg.data && msg.data.timestamp));
          if (authTs) this.sessionCrypto.lastServerTimestamp = normalizeTimestamp(authTs);
        }
        this._onAuthSuccess(msg);
        return;
      case 'auth_failed':
        this._emitError(msg);
        this.disconnect();
        return;
      case 'connected':
        this._handleConnected(msg);
        return;
      case 'ping':
        this._replyPing(msg);
        return;
      case 'pong':
        this.lastPong = Date.now();
        return;
      case 'error':
        this._emitError(msg);
        this._handleSubscribeError(msg);
        return;
      case 'subscribed':
        this._subscribeConfirmed = true;
        this._forwardPayload(msg, true);
        return;
      case 'unsubscribed':
        this._forwardPayload(msg, true);
        return;
      case 'data':
        if (!this._subscribeConfirmed) {
          this._subscribeConfirmed = true;
        }
        this._forwardPayload(msg, false);
        return;
      default:
        this._forwardPayload(msg, false);
        return;
    }
  };

  MarketsSocket.prototype._handleConnected = function(msg) {
    var self = this;
    var decoded;
    try {
      decoded = this._decodePayload(msg.data, msg);
    } catch (err) {
      this._emitError(err);
      return;
    }
    function finalize(payload) {
      if (payload && payload.sessionId) {
        self.sessionId = payload.sessionId;
      }
      self._emitState('connected', payload || msg);
    }
    if (isPromiseLike(decoded)) {
      decoded.then(finalize).catch(function(err){ self._emitError(err); });
    } else {
      finalize(decoded);
    }
  };

  MarketsSocket.prototype._replyPing = function(msg) {
    var self = this;
    var decoded;
    try {
      decoded = this._decodePayload(msg.data, msg);
    } catch (err) {
      this._emitError(err);
      decoded = null;
    }
    function respond() {
      var tsPayload = self.options.cryptoMode === 'no' ? Date.now() : String(Date.now());
      self._sendControlMessage('pong', { timestamp: tsPayload });
    }
    if (isPromiseLike(decoded)) {
      decoded.then(respond).catch(function(err){
        self._emitError(err);
        respond();
      });
    } else {
      respond();
    }
  };

  MarketsSocket.prototype._handleSubscribeError = function(msg) {
    if (!msg) return;
    if (msg.code === 4000 && /Invalid message format/i.test(msg.message || '')) {
      this._warn('订阅消息格式被服务端拒绝 (4000 Invalid message format)。请核对 code/business/data 结构。');
    }
    // 针对蜡烛(K线)订阅格式错误的专用自动纠正：
    if (msg.code === 4000 && /Invalid Candles subscription format/i.test(msg.message || '')) {
      // 服务器期望 data.arr: [{ type, codes }]
      if (this._pendingSubscribeSymbols && this._pendingSubscribeSymbols.length) {
        try {
          var symbolsStr = this._pendingSubscribeSymbols.join(',');
          var trace = (typeof generateTrace === 'function') ? generateTrace() : ('fix-' + Date.now());
          var business = (this.watchOptions && this.watchOptions.business) || this.options.business || 'common';
          var klineType = (this.watchOptions && this.watchOptions.klineType) || 1; // arr[].type 为周期编号
          var klineFixMessage = {
            action: 'subscribe',
            data: {
              code: 10006, // Candles
              trace: trace,
              business: business,
              data: {
                arr: [ { type: klineType, codes: symbolsStr } ]
              }
            }
          };
          this._log('[subscribe-kline:fix] ' + JSON.stringify(klineFixMessage));
          this._sendJSON(klineFixMessage);
        } catch(fixErr){ this._emitError(fixErr); }
      }
    }
  };

  MarketsSocket.prototype._forwardPayload = function(msg, isStateEvent) {
    var self = this;
    var decoded;
    try {
      decoded = this._decodePayload(msg.data, msg);
    } catch (err) {
      this._emitError(err);
      return;
    }
    function deliver(payload) {
      if (isStateEvent) {
        self._emitState(msg.type, payload || msg);
        return;
      }
      if (typeof self.options.onData === 'function') {
        var innerCode = (payload && payload.code) || (msg.data && msg.data.code) || 'N/A';
        self._log('转发到 onData, code:', innerCode);
        try {
          self.options.onData(payload || null, msg);
        } catch (cbErr) {
          self._emitError(cbErr);
        }
      }
    }
    if (isPromiseLike(decoded)) {
      decoded.then(deliver).catch(function(err){ self._emitError(err); });
    } else {
      deliver(decoded);
    }
  };

  MarketsSocket.prototype._sendAuth = function() {
    if (!this.credentials) return;
    var nowMs = Date.now();
    if (this.lastAuthTimestamp && (nowMs - this.lastAuthTimestamp) < 800) {
      this._log('skip duplicate auth within 800ms');
      return;
    }
    this.lastAuthTimestamp = nowMs;
    var timestamp = Date.now().toString();
    var dynamicApiKey = md5Hex(this.credentials.apiKey + timestamp).toUpperCase();
    var sign = md5Hex(this.credentials.userAccount + dynamicApiKey + timestamp);
    if (this.options.cryptoMode === 'aes-gcm') {
      var normalizedTs = normalizeTimestamp(timestamp);
      this.sessionCrypto = {
        mode: 'aes-gcm',
        authTimestamp: normalizedTs,
        lastClientTimestamp: normalizedTs,
        lastServerTimestamp: null
      };
    }
    var actualMode = (this.options.cryptoMode === 'aes-gcm') ? 'aes' : this.options.cryptoMode;
    var authMessage = {
      action: 'auth',
      userAccount: this.credentials.userAccount,
      timestamp: timestamp,
      sign: sign,
      cryptoMode: actualMode,
      client: 'webapp',
      version: '1.0.0'
    };
    this._log('send auth', {
      userAccount: this.credentials.userAccount,
      ts: timestamp,
      cryptoMode: actualMode,
      signSample: sign.substring(0, 8) + '...'
    });
    this._sendJSON(authMessage);
    this._emitState('authenticating');
  };

  MarketsSocket.prototype._onAuthSuccess = function(msg) {
    this.authenticated = true;
    if (this.sessionCrypto && msg) {
      var serverTs = msg.timestamp || msg.ts || (msg.payload && (msg.payload.timestamp || msg.payload.ts));
      if (serverTs) this.sessionCrypto.lastServerTimestamp = normalizeTimestamp(serverTs);
    }
    this._emitState('ready', msg);
    // 认证成功后再启动心跳，避免未鉴权的 ping 触发 4000 格式错误
    this._startHeartbeat();
    this._applyWatchlist();
  };

  MarketsSocket.prototype._applyWatchlist = function() {
    if (!this.watchSymbols || !this.watchSymbols.length) {
      this._log('skip subscribe (empty list)');
      return;
    }
    var dedup = this.watchSymbols.filter(function(code){ return typeof code === 'string' && code; });
    var codesStr = dedup.join(',');
    if (!dedup.length) {
      this._log('skip subscribe (no valid codes)');
      return;
    }
    if (this.activeSubscription && this.lastSubscribedCodes === codesStr) {
      this._log('skip subscribe (unchanged watchlist)', codesStr);
      return;
    }
    this._attemptSubscribe(dedup);
    this.activeSubscription = true;
    this.lastSubscribedCodes = codesStr;
  };

  MarketsSocket.prototype._attemptSubscribe = function(symbols, rotate) {
    if (!Array.isArray(symbols) || !symbols.length) return;
    var business = (this.watchOptions && this.watchOptions.business) || this.options.business || 'common';
    var codesStr = symbols.join(',');
    var trace = generateTrace();
    // 支持通过 watchOptions.protoCode 指定订阅类型 (10000=成交,10003=盘口,10006=K线)，默认 10000
    var protoCode = (this.watchOptions && this.watchOptions.protoCode) || 10000;

    var subscribeMessage = {
      action: 'subscribe',
      data: {
        code: protoCode,
        trace: trace,
        business: business,
        data: { codes: codesStr }
      }
    };
    this._log('[subscribe] ' + JSON.stringify(subscribeMessage));
    this._pendingSubscribeSymbols = symbols.slice();
    this._lastSubscribeSentAt = Date.now();
    this._sendJSON(subscribeMessage);
    // 若需要同时订阅盘口，可在 opts 中传入 needDepth: true 触发第二帧
    if (this.watchOptions && this.watchOptions.needDepth) {
      var depthTrace = trace + '-depth';
      var depthLevels = Number(this.watchOptions.depthLevels || this.watchOptions.depth || this.watchOptions.size || 0);
      var depthMessage = {
        action: 'subscribe',
        data: {
          code: 10003,
          trace: depthTrace,
          business: business,
          data: { codes: codesStr }
        }
      };
      if (depthLevels > 0) {
        depthMessage.data.data.depthLevels = depthLevels;
        depthMessage.data.data.depth = depthLevels;
        depthMessage.data.data.size = depthLevels;
      }
      var self = this;
      setTimeout(function(){ self._log('[subscribe-depth] ' + JSON.stringify(depthMessage)); self._sendJSON(depthMessage); }, 350);
    }
    // 若需要订阅 K 线，可传 needKline 与 klineCodes(可与 symbols 相同)；示例仅发送一次
    if (this.watchOptions && this.watchOptions.needKline) {
      var kTrace = trace + '-kline';
      var kCodes = Array.isArray(this.watchOptions.klineCodes) && this.watchOptions.klineCodes.length ? this.watchOptions.klineCodes.join(',') : codesStr;
      // WebSocket 规范：arr 每项 { type: 周期编号, codes: "AAPL.US,BTCUSDT" }
      var klineType = (this.watchOptions && this.watchOptions.klineType) || 1;
      var klineMessage = {
        action: 'subscribe',
        data: {
          code: 10006,
          trace: kTrace,
          business: business,
          data: {
            arr: [ { type: klineType, codes: kCodes } ]
          }
        }
      };
      var self2 = this;
      setTimeout(function(){ self2._log('[subscribe-kline] ' + JSON.stringify(klineMessage)); self2._sendJSON(klineMessage); }, 650);
    }
  };

  MarketsSocket.prototype._sendControlMessage = function(type, payload) {
    if (!type) return;
    if (this.options.cryptoMode === 'no') {
      var plainMessage;
      if (this.options.useInfowayProtocol) {
        // Infoway 心跳使用协议号 10010，只需要 code 与 trace
        if (type === 'ping') {
          plainMessage = { code: 10010, trace: generateTrace() };
        } else if (type === 'pong') {
          plainMessage = { code: 10011, trace: generateTrace() }; // 若服务端不需要可忽略
        } else {
          // 其它控制类型暂不定义，保持兼容旧格式
          var bodyObj = (payload && typeof payload === 'object') ? payload : {};
          plainMessage = { action: type, data: bodyObj };
        }
      } else {
        plainMessage = { type: type };
        if (payload && typeof payload === 'object') {
          for (var key in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
              plainMessage[key] = payload[key];
            }
          }
        }
      }
      this._sendJSON(plainMessage);
      return;
    }
    var meta = {};
    var encoded;
    try {
      encoded = this._encodePayload(payload || {}, meta);
    } catch (err) {
      this._emitError(err);
      return;
    }
    var self = this;
    function finalize(body) {
      if (body == null) return;
      var ts = normalizeTimestamp(meta.timestamp || Date.now().toString()) || Date.now().toString();
      var message = {
        type: type,
        data: body,
        timestamp: ts,
        cryptoMode: self.options.cryptoMode
      };
      if (self.sessionCrypto) {
        self.sessionCrypto.lastClientTimestamp = ts;
      }
      self._sendJSON(message);
    }
    if (isPromiseLike(encoded)) {
      encoded.then(finalize).catch(function(err){ self._emitError(err); });
    } else {
      finalize(encoded);
    }
  };

  MarketsSocket.prototype._encodePayload = function(obj, meta) {
    var json = typeof obj === 'string' ? obj : JSON.stringify(obj || {});
    if (this.options.cryptoMode === 'no') {
      try {
        return typeof obj === 'string' ? JSON.parse(json) : (obj || {});
      } catch (_) {
        return obj || {};
      }
    }
    if (this.options.cryptoMode === 'aes-gcm') {
      var baseKey = this.credentials && this.credentials.apiKey;
      if (!baseKey) throw new Error('Missing apiKey for AES-GCM encryption');
      var ts = normalizeTimestamp(meta && meta.timestamp ? meta.timestamp : Date.now().toString());
      if (meta) meta.timestamp = ts;
      var derived = deriveClientCrypto(baseKey, ts);
      if (!derived) throw new Error('Failed to derive AES-GCM key and IV');
      if (!this.sessionCrypto) {
        this.sessionCrypto = { mode: 'aes-gcm', authTimestamp: ts, lastClientTimestamp: ts };
      } else {
        this.sessionCrypto.lastClientTimestamp = derived.timestamp;
        if (!this.sessionCrypto.authTimestamp) this.sessionCrypto.authTimestamp = derived.timestamp;
      }
      return encryptPayload(json, derived.key, derived.iv);
    }
    throw new Error('Unsupported crypto mode: ' + this.options.cryptoMode);
  };

  MarketsSocket.prototype._decodePayload = function(body, envelope) {
    if (!body) return null;
    if (typeof body === 'object') return body;
    if (this.options.cryptoMode === 'no') {
      if (typeof body === 'string') {
        try {
          return JSON.parse(body);
        } catch (e1) {
          try {
            var decoded = decodeBase64(body);
            try {
              return JSON.parse(decoded);
            } catch (e2) {
              return decoded;
            }
          } catch (e3) {
            return body;
          }
        }
      }
      return body;
    }
    if (this.options.cryptoMode === 'aes-gcm') {
      var baseKey = this.credentials && this.credentials.apiKey;
      if (!baseKey) throw new Error('Missing apiKey for AES-GCM decryption');
      var tsCandidate = envelope && (envelope.timestamp || envelope.ts || (envelope.meta && envelope.meta.timestamp));
      if (!tsCandidate && this.sessionCrypto) {
        tsCandidate = this.sessionCrypto.lastServerTimestamp || this.sessionCrypto.lastClientTimestamp || this.sessionCrypto.authTimestamp;
      }
      var derived = deriveServerCrypto(baseKey, tsCandidate);
      if (!derived) throw new Error('Failed to derive AES-GCM decrypt context');
      if (!this.sessionCrypto) {
        this.sessionCrypto = { mode: 'aes-gcm', lastServerTimestamp: derived.timestamp };
      } else {
        this.sessionCrypto.lastServerTimestamp = derived.timestamp;
      }
      return decryptPayload(body, derived.key, derived.iv).then(function(plain) {
        if (plain == null) return null;
        try {
          return JSON.parse(plain);
        } catch (_) {
          return plain;
        }
      });
    }
    throw new Error('Unsupported crypto mode: ' + this.options.cryptoMode);
  };

  MarketsSocket.prototype._sendJSON = function(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this._warn('socket not ready');
      return;
    }
    try {
      this.ws.send(JSON.stringify(obj));
    } catch (err) {
      this._emitError(err);
    }
  };

  MarketsSocket.prototype._startHeartbeat = function() {
    var interval = this.options.heartbeatInterval;
    if (!interval) return;
    var self = this;
    this._clearHeartbeat();
    this.heartbeatTimer = setInterval(function() {
      if (self.ws && self.ws.readyState === WebSocket.OPEN && self.authenticated) {
        // 使用 Infoway 协议时保持 action: 'ping' 格式；附加业务字段便于网关路由
        var payload = { timestamp: Date.now() };
        if (self.options.useInfowayProtocol) {
          payload.business = self.options.business || 'common';
        }
        self._sendControlMessage('ping', payload);
      }
    }, interval);
  };

  MarketsSocket.prototype._clearHeartbeat = function() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  };

  MarketsSocket.prototype._scheduleReconnect = function() {
    if (!this.options.reconnect) return;
    this.reconnectAttempts += 1;
    var delay = Math.min(this.options.maxReconnectDelay, this.options.reconnectDelay * Math.pow(1.6, this.reconnectAttempts - 1));
    var self = this;
    this._clearReconnect();
    this._emitState('reconnecting', { delay: delay });
    this.reconnectTimer = setTimeout(function() {
      if (self._manualClose) return;
      self.connect();
    }, delay);
  };

  MarketsSocket.prototype._clearReconnect = function() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  MarketsSocket.prototype.setCredentials = function(credentials) {
    this.credentials = credentials ? Object.assign({}, credentials) : null;
  };

  MarketsSocket.prototype.setCryptoMode = function(mode) {
    this.options.cryptoMode = mode || 'no';
  };

  MarketsSocket.prototype.setBusiness = function(business) {
    this.options.business = business || 'common';
    this.watchOptions.business = this.options.business;
  };

  MarketsSocket.prototype.subscribe = function(symbols, opts) {
    this.updateWatchlist(symbols, opts);
  };

  MarketsSocket.prototype.unsubscribe = function() {
    // 发送取消订阅请求 (110xx 系列)，按照已订阅的类型批量取消
    if (this.isReady() && this.lastSubscribedCodes) {
      var business = (this.watchOptions && this.watchOptions.business) || this.options.business || 'common';
      var traceBase = generateTrace();
      var codesStr = this.lastSubscribedCodes; // 这里协议 110xx 为取消该连接上所有该类订阅，不需 codes，可附带用于审计
      var protoCode = (this.watchOptions && this.watchOptions.protoCode) || 10000; // 主订阅类型用于判定是否需要发送 11000
      // 取消主订阅
      if (protoCode === 10000) {
        var cancelTrade = { action: 'unsubscribe', data: { code: 11000, trace: traceBase + '-untrade', business: business, data: { codes: codesStr } } };
        this._log('[unsubscribe-trade] ' + JSON.stringify(cancelTrade));
        this._sendJSON(cancelTrade);
      } else if (protoCode === 10003) {
        var cancelDepth = { action: 'unsubscribe', data: { code: 11001, trace: traceBase + '-undepth', business: business, data: { codes: codesStr } } };
        this._log('[unsubscribe-depth] ' + JSON.stringify(cancelDepth));
        this._sendJSON(cancelDepth);
      } else if (protoCode === 10006) {
        var cancelKline = { action: 'unsubscribe', data: { code: 11002, trace: traceBase + '-unkline', business: business, data: { codes: codesStr } } };
        this._log('[unsubscribe-kline] ' + JSON.stringify(cancelKline));
        this._sendJSON(cancelKline);
      }
      // 如果附加订阅过 depth/kline 则一并取消
      if (this.watchOptions && this.watchOptions.needDepth) {
        var cancelDepth2 = { action: 'unsubscribe', data: { code: 11001, trace: traceBase + '-undepth-extra', business: business, data: { codes: codesStr } } };
        this._log('[unsubscribe-depth-extra] ' + JSON.stringify(cancelDepth2));
        this._sendJSON(cancelDepth2);
      }
      if (this.watchOptions && this.watchOptions.needKline) {
        var cancelKline2 = { action: 'unsubscribe', data: { code: 11002, trace: traceBase + '-unkline-extra', business: business, data: { codes: codesStr } } };
        this._log('[unsubscribe-kline-extra] ' + JSON.stringify(cancelKline2));
        this._sendJSON(cancelKline2);
      }
    }
    this.watchSymbols = [];
    this.activeSubscription = false;
    this.lastSubscribedCodes = '';
  };

  MarketsSocket.prototype.destroy = function() {
    this.disconnect();
    this.credentials = null;
    this.watchSymbols = [];
    this.watchOptions = { business: this.options.business };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarketsSocket;
  } else {
    globalScope.MarketsSocket = MarketsSocket;
  }
})(typeof window !== 'undefined' ? window : null);
