(function(root){
  'use strict';

  var globalScope = root || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));

  function EventBus(){ this._ev = {}; }
  EventBus.prototype.on = function(type, fn){ if(!type||typeof fn!=='function') return this; (this._ev[type]||(this._ev[type]=[])).push(fn); return this; };
  EventBus.prototype.off = function(type, fn){ if(!type){ this._ev={}; return this; } var arr=this._ev[type]; if(!arr) return this; if(!fn){ delete this._ev[type]; return this; } this._ev[type]=arr.filter(function(h){return h!==fn;}); return this; };
  EventBus.prototype.emit = function(type){ var arr=this._ev[type]; if(!arr||!arr.length) return; var args=[].slice.call(arguments,1); arr.slice().forEach(function(fn){ try{ fn.apply(null,args); }catch(e){ if (console && console.warn) console.warn('[MarketsStore] listener error', e); } }); };

  function getAppApi(){ return (globalScope.APP_CONFIG && globalScope.APP_CONFIG.api) || {}; }

  function resolveWsEndpoint(){
    var api = getAppApi();
    if (api && api.marketWsUrl) return api.marketWsUrl;
    if (api && api.wsUrl) return api.wsUrl;
    if (typeof location !== 'undefined' && location.host) {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/infoway-websocket';
    }
    return 'ws://localhost:8080/infoway-websocket';
  }

  async function resolveWsCredentials(){
    try {
      var userAccount = '';
      try { userAccount = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('u')) || (localStorage && localStorage.getItem && localStorage.getItem('userAccount')) || ''; } catch(_) {}
      var apiKey = '';
      try { apiKey = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('k')) || ''; } catch(_) {}
      if (!apiKey) {
        try {
          var cipher = (localStorage && localStorage.getItem && localStorage.getItem('apiKey')) || '';
          var hashed = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('p')) || '';
          if (cipher && hashed) {
            var dec = (typeof globalScope.Decrypt === 'function') ? globalScope.Decrypt : (typeof Decrypt === 'function' ? Decrypt : null);
            if (dec) apiKey = await dec(cipher, hashed, hashed.substring(0, 12));
          }
        } catch (e) { if (console && console.warn) console.warn('[MarketsStore] decrypt apiKey failed', e); }
      }
      if (!userAccount || !apiKey) return null;
      return { userAccount: userAccount, apiKey: apiKey };
    } catch (e) {
      if (console && console.warn) console.warn('[MarketsStore] resolve credentials error', e);
      return null;
    }
  }

  function collectDepthPrices(side){
    var prices = [];
    if (!Array.isArray(side)) return prices;
    if (Array.isArray(side[0]) && Array.isArray(side[1])) {
      var priceArr = side[0];
      for (var i = 0; i < priceArr.length; i++) {
        var price = Number(priceArr[i]);
        if (isFinite(price)) prices.push(price);
      }
      return prices;
    }
    for (var j = 0; j < side.length; j++) {
      var entry = side[j];
      var candidate;
      if (Array.isArray(entry)) {
        candidate = Number(entry[0]);
      } else if (entry && typeof entry === 'object') {
        candidate = Number(entry.price ?? entry.p ?? entry.v ?? entry.value ?? entry[0]);
      } else {
        candidate = Number(entry);
      }
      if (isFinite(candidate)) prices.push(candidate);
    }
    return prices;
  }

  function pickDepthExtreme(prices, type){
    if (!prices || !prices.length) return null;
    var target = prices[0];
    for (var i = 1; i < prices.length; i++) {
      var price = prices[i];
      if (!isFinite(price)) continue;
      if (!isFinite(target)) {
        target = price;
        continue;
      }
      if (type === 'ask') {
        if (price < target) target = price;
      } else if (type === 'bid') {
        if (price > target) target = price;
      }
    }
    return isFinite(target) ? target : null;
  }

  function maybeNormalizeDepthOrder(depth, symbol, store){
    if (!depth || !Array.isArray(depth.asks) || !Array.isArray(depth.bids)) return;
    var askPrices = collectDepthPrices(depth.asks);
    var bidPrices = collectDepthPrices(depth.bids);
    if (!askPrices.length || !bidPrices.length) return;
    var bestAsk = pickDepthExtreme(askPrices, 'ask');
    var bestBid = pickDepthExtreme(bidPrices, 'bid');
    if (!isFinite(bestAsk) || !isFinite(bestBid)) return;
    if (bestAsk >= bestBid) return;
    var tmp = depth.asks;
    depth.asks = depth.bids;
    depth.bids = tmp;
    if (store && store._depthSwapStats) {
      var sym = symbol || 'unknown';
      store._depthSwapStats[sym] = (store._depthSwapStats[sym] || 0) + 1;
      if (store._debugEnabled && console && console.warn && store._depthSwapStats[sym] <= 5) {
        console.warn('[MarketsStore] depth sides swapped for', sym, 'bestAsk', bestAsk, 'bestBid', bestBid);
      }
    }
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

  function resolveDebugFlag(flag) {
    var direct = coerceDebugValue(flag);
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

  function MarketsStore(){
    this._bus = new EventBus();
    this._socket = null;
    this._ready = false;
    this._quotes = Object.create(null);
    this._subRefs = Object.create(null); // symbol -> count
    this._watch = []; // de-duplicated symbol array
    this._healthTimer = null;
    this._lastUpdateMap = Object.create(null); // symbol -> ts
    this._staleThresholdMs = 30000; // 30s 无交易视为 stale
    this._resubscribeIntervalMs = 120000; // 每 2 分钟尝试一次全量重订阅（若 stale 持续）
    this._lastResubscribeAt = 0;
    this._debugEnabled = resolveDebugFlag();
    this._depthSwapStats = Object.create(null);

    // 交易日级别快照（按 symbol 存储 6.x 字段）
    this._dailySnapshot = Object.create(null); // symbol -> { yesterdayDate, yesterdayClose, todayDate, todayOpen, lastPrice, changeAbs, changePct, high, low, updatedAt }
    this._tradingCalendar = null; // 来自 HTTP 的市场交易日信息原始结构
    this._tradingSessions = null; // 来自 HTTP 的市场交易时间信息原始结构
    
    // 🔥 Funds 资产实时计算模块
    this._fundsPositions = []; // 用户持仓列表 { itemId, direction, avgOpenPrice, totalVolume, totalSwap, tradeRate }
    this._fundsStaticData = null; // 钱包余额、负债等静态数据
    this._fundsEnabled = false; // 是否启用 Funds 计算
    this._fundsWalletType = 0; // 0=Capital, 1=Leveraged
    this._fundsCallback = null; // UI 更新回调函数
  }

  MarketsStore.prototype.on = function(evt, fn){ this._bus.on(evt, fn); return this; };
  MarketsStore.prototype.off = function(evt, fn){ this._bus.off(evt, fn); return this; };
  MarketsStore.prototype.isReady = function(){ return !!this._ready; };
  MarketsStore.prototype.getSocket = function(){ return this._socket; };
  MarketsStore.prototype.getQuote = function(symbol){ return symbol ? this._quotes[symbol] || null : null; };
  MarketsStore.prototype.getSnapshot = function(){ var copy={}; for(var k in this._quotes){ if(Object.prototype.hasOwnProperty.call(this._quotes,k)) copy[k]=this._quotes[k]; } return copy; };

  MarketsStore.prototype._rebuildWatch = function(){
    var list=[]; for (var sym in this._subRefs){ if (this._subRefs[sym] > 0) list.push(sym); }
    this._watch = Array.from(new Set(list));
    if (this._socket && typeof this._socket.updateWatchlist === 'function') {
      // 自动业务类型判定：根据代码格式推断 stock/crypto/common
      var business = 'common';
      if (this._watch.length) {
        var sample = this._watch[0] || '';
        if (/\.US$|\.HK$|\.SZ$|\.SH$/i.test(sample)) {
          business = 'stock';
        } else if (/USDT$|USDC$|BTC$|ETH$/i.test(sample)) {
          business = 'crypto';
        } else {
          business = 'common';
        }
      }
      this._socket.setBusiness && this._socket.setBusiness(business);
      // 开启多通道订阅 (成交+盘口+K线)，K线默认同 codes 列表
      this._socket.updateWatchlist(this._watch, {
        business: business,
        needDepth: true,
        needKline: true,
        klineCodes: this._watch.slice() // 可后续按需拆分不同的 codes
      });
    }
  };

  MarketsStore.prototype.subscribe = function(symbols){
    if (!symbols) return;
    var arr = Array.isArray(symbols) ? symbols : [symbols];
    for (var i=0;i<arr.length;i++) {
      var s = String(arr[i]||'').trim();
      if (!s) continue;
      this._subRefs[s] = (this._subRefs[s]||0) + 1;
    }
    this._rebuildWatch();
  };

  MarketsStore.prototype.unsubscribe = function(symbols){
    if (!symbols) return;
    var arr = Array.isArray(symbols) ? symbols : [symbols];
    for (var i=0;i<arr.length;i++) {
      var s = String(arr[i]||'').trim();
      if (!s || !this._subRefs[s]) continue;
      this._subRefs[s] = Math.max(0, this._subRefs[s]-1);
      if (this._subRefs[s] === 0) delete this._subRefs[s];
    }
    this._rebuildWatch();
  };

  MarketsStore.prototype._handleState = function(state, detail){
    if (state === 'ready') this._ready = true; else if (state === 'closed') this._ready = false;
    this._bus.emit('state', state, detail);
    if (state === 'ready') this._bus.emit('ready');
  };

  MarketsStore.prototype.getAllQuotes = function(){ return this.getSnapshot(); };

  // ========== 交易日快照与市场时间 ==========

  MarketsStore.prototype.loadDailySnapshotFromStorage = function(){
    try {
      if (typeof localStorage === 'undefined') return;
      var raw = localStorage.getItem('markets:dailySnapshot');
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      this._dailySnapshot = Object.create(null);
      for (var sym in parsed){
        if (!Object.prototype.hasOwnProperty.call(parsed, sym)) continue;
        var snap = parsed[sym];
        if (!snap || typeof snap !== 'object') continue;
        this._dailySnapshot[sym] = {
          yesterdayDate: snap.yesterdayDate || null,
          yesterdayClose: isFinite(snap.yesterdayClose) ? Number(snap.yesterdayClose) : null,
          todayDate: snap.todayDate || null,
          todayOpen: isFinite(snap.todayOpen) ? Number(snap.todayOpen) : null,
          lastPrice: isFinite(snap.lastPrice) ? Number(snap.lastPrice) : null,
          changeAbs: isFinite(snap.changeAbs) ? Number(snap.changeAbs) : null,
          changePct: isFinite(snap.changePct) ? Number(snap.changePct) : null,
          high: isFinite(snap.high) ? Number(snap.high) : null,
          low: isFinite(snap.low) ? Number(snap.low) : null,
          updatedAt: snap.updatedAt || 0
        };
      }
    } catch (e) {
      if (console && console.warn) console.warn('[MarketsStore] loadDailySnapshotFromStorage failed', e);
    }
  };

  MarketsStore.prototype._persistDailySnapshotToStorage = function(){
    try {
      if (typeof localStorage === 'undefined') return;
      var out = {};
      for (var sym in this._dailySnapshot){
        if (!Object.prototype.hasOwnProperty.call(this._dailySnapshot, sym)) continue;
        out[sym] = this._dailySnapshot[sym];
      }
      localStorage.setItem('markets:dailySnapshot', JSON.stringify(out));
    } catch (e) {
      if (console && console.warn) console.warn('[MarketsStore] _persistDailySnapshotToStorage failed', e);
    }
  };

  MarketsStore.prototype.getDailySnapshot = function(symbol){
    if (!symbol) return null;
    return this._dailySnapshot[symbol] || null;
  };

  MarketsStore.prototype._ensureDailySnapshot = function(symbol){
    if (!symbol) return null;
    if (!this._dailySnapshot[symbol]){
      this._dailySnapshot[symbol] = {
        yesterdayDate: null,
        yesterdayClose: null,
        todayDate: null,
        todayOpen: null,
        lastPrice: null,
        changeAbs: null,
        changePct: null,
        high: null,
        low: null,
        updatedAt: 0
      };
    }
    return this._dailySnapshot[symbol];
  };

  MarketsStore.prototype.primeTradingCalendarFromHttp = function(payload){
    // payload: 来自“GET获取市场的交易日信息”的原始数据
    this._tradingCalendar = payload || null;
  };

  MarketsStore.prototype.primeTradingTimeFromHttp = function(payload){
    // payload: 来自“GET获取市场的交易时间”的原始数据
    this._tradingSessions = payload || null;
  };

  MarketsStore.prototype.primeDailySnapshotFromKlines = function(symbol, klines, calendarInfo){
    if (!symbol || !Array.isArray(klines) || !klines.length) return;
    var snap = this._ensureDailySnapshot(symbol);
    // API返回日K按时间降序([0]最新), 需要按时间升序排序后取最后两根
    var ordered = klines.slice();
    try { ordered.sort(function(a,b){ return ((a && (a.t||a.time||a.ts))||0) - ((b && (b.t||b.time||b.ts))||0); }); } catch(_) {}
    var len = ordered.length;
    var lastBar = ordered[len - 1];  // 今日
    var prevBar = len > 1 ? ordered[len - 2] : null;  // 昨日
    if (prevBar && isFinite(prevBar.c)){
      snap.yesterdayClose = Number(prevBar.c);
      snap.yesterdayDate = prevBar.t || (calendarInfo && calendarInfo.yesterdayDate) || snap.yesterdayDate;
    }
    if (lastBar){
      if (isFinite(lastBar.o)) snap.todayOpen = Number(lastBar.o);
      snap.todayDate = lastBar.t || (calendarInfo && calendarInfo.todayDate) || snap.todayDate;
      if (isFinite(lastBar.c)){
        snap.lastPrice = Number(lastBar.c);
      }
      if (isFinite(lastBar.h)){
        snap.high = isFinite(snap.high) ? Math.max(snap.high, Number(lastBar.h)) : Number(lastBar.h);
      }
      if (isFinite(lastBar.l)){
        snap.low = isFinite(snap.low) ? Math.min(snap.low, Number(lastBar.l)) : Number(lastBar.l);
      }
    }
    if (isFinite(snap.lastPrice) && isFinite(snap.yesterdayClose) && snap.yesterdayClose){
      var diff = snap.lastPrice - snap.yesterdayClose;
      var pct = (diff / snap.yesterdayClose) * 100;
      snap.changeAbs = isFinite(diff) ? diff : null;
      snap.changePct = isFinite(pct) ? pct : null;
    }
    snap.updatedAt = Date.now();
    this._persistDailySnapshotToStorage();
  };

  MarketsStore.prototype.updateDailySnapshotFromTick = function(symbol, last, high, low){
    if (!symbol || !isFinite(last)) return;
    var snap = this._ensureDailySnapshot(symbol);
    snap.lastPrice = Number(last);
    if (isFinite(high)){
      snap.high = isFinite(snap.high) ? Math.max(snap.high, Number(high)) : Number(high);
    }
    if (isFinite(low)){
      snap.low = isFinite(snap.low) ? Math.min(snap.low, Number(low)) : Number(low);
    }
    if (isFinite(snap.lastPrice) && isFinite(snap.yesterdayClose) && snap.yesterdayClose){
      var diff = snap.lastPrice - snap.yesterdayClose;
      var pct = (diff / snap.yesterdayClose) * 100;
      snap.changeAbs = isFinite(diff) ? diff : null;
      snap.changePct = isFinite(pct) ? pct : null;
    }
    snap.updatedAt = Date.now();
    this._persistDailySnapshotToStorage();
  };

  MarketsStore.prototype._inferPrecision = function(symbol){
    if (!symbol) return 4;
    var sym = String(symbol).toUpperCase();
    if (/^(XAU|XAG|XTI|XBR|XCU|XNI)/.test(sym)) return 2; // 金属/能源
    if (/USDT$|USDC$/i.test(sym)) return 4; // 稳定币报价精度
    if (sym.length === 6) {
      var base = sym.slice(0,3), quote = sym.slice(3);
      var forex = ['AUD','CAD','CHF','CNH','CNY','EUR','GBP','HKD','JPY','MXN','NOK','NZD','SEK','SGD','USD','ZAR'];
      if (forex.indexOf(base) >= 0 && forex.indexOf(quote) >= 0) {
        return quote === 'JPY' ? 3 : 5;
      }
    }
    if (/JPY$/.test(sym)) return 3;
    if (/BTC$|ETH$/i.test(sym)) return 2;
    return 4;
  };

  MarketsStore.prototype._computeMetrics = function(sym, last, prev){
    var diff = (last != null && prev != null) ? (last - prev) : null;
    var pct = (diff != null && prev) ? (diff / prev) * 100 : null;
    return { diff: isFinite(diff) ? diff : null, pct: isFinite(pct) ? pct : null };
  };

  function normalizeTimeframeKey(tf){
    if (tf == null) return '1m';
    if (typeof tf === 'number' && isFinite(tf)) {
      if (tf >= 1440 && tf % 1440 === 0) return (tf / 1440) + 'd';
      if (tf >= 60 && tf % 60 === 0) {
        var hours = tf / 60;
        return hours + 'h';
      }
      return tf + 'm';
    }
    var str = String(tf).trim().toLowerCase();
    if (!str) return '1m';
    if (/^\d+$/.test(str)) return normalizeTimeframeKey(Number(str));
    str = str.replace(/minute|min/g, 'm').replace(/hour|hr/g, 'h').replace(/day/g, 'd');
    if (str === '60m') return '1h';
    if (str === '1hour') return '1h';
    if (str === '1day') return '1d';
    return str;
  }

  MarketsStore.prototype.primeQuotesFromTrades = function(trades){
    if (!Array.isArray(trades) || !trades.length) return;
    for (var i=0;i<trades.length;i++) {
      var item = trades[i];
      if (!item) continue;
      var sym = item.s || item.symbol || item.code; if (!sym) continue;
      var last = Number(item.p ?? item.price ?? item.last ?? item.c ?? item.close);
      if (!isFinite(last)) continue;
      // 跳过明显的占位 0（无 prev / 无涨跌幅字段时）防止覆盖后续实时数据
      var hasChangeField = (item.pc != null) || (item.pca != null) || (item.changePct != null) || (item.changeAbs != null);
      if (last === 0 && !hasChangeField) {
        // 如果缓存里已有非 0 最新价则保留旧值
        var existing = this._quotes[sym];
        if (!existing || !isFinite(existing.last) || existing.last === 0) {
          continue;
        }
      }
      var prevSnapshot = this._quotes[sym];
      var snapshotPrev = prevSnapshot ? prevSnapshot.last : null;
      var precision = prevSnapshot ? prevSnapshot.precision : this._inferPrecision(sym);
      var m = this._computeMetrics(sym, last, snapshotPrev);
      var snapshot = {
        symbol: sym,
        last: last,
        prev: snapshotPrev,
        diff: m.diff,
        pct: m.pct,
        precision: precision,
        updatedAt: item.t || item.ts || Date.now(),
        trade: { price: last, time: item.t || item.ts || Date.now(), raw: item },
        depth: prevSnapshot ? prevSnapshot.depth : null,
        klines: prevSnapshot ? prevSnapshot.klines : null,
        raw: item
      };
      this._quotes[sym] = snapshot;
      this._bus.emit('update', sym, snapshot);
      
      // 🔥 如果 Funds 计算已启用且该品种在持仓中，触发重新计算
      if (this._fundsEnabled && this._fundsPositions.some(function(p){ return p.itemId === sym; })) {
        this._calculateAndNotifyFunds();
      }
    }
  };

  MarketsStore.prototype._handleData = function(payload){
    if (!payload) return;
    if (this._debugEnabled && console && console.log) {
      console.log('[MarketsStore] _handleData 收到:', payload.code, 'hasData:', !!payload.data);
    }
    var data = payload.data !== undefined ? payload.data : payload;

    // 统一适配层:将 Trade / Depth / Kline 的原始结构转成通用快照对象
    var self = this;
    function adaptAndStore(item) {
      if (!item) return;
      var sym = item.s || item.symbol || item.code; if (!sym) return;

      // Trade: 单笔成交或最新价
      var tradePrice = Number(item.p ?? item.price ?? item.lastPrice ?? item.last ?? item.c ?? item.close);
      var tradeTs = item.t || item.ts || item.time || null;
      var tfHint = normalizeTimeframeKey(item.timeframe || item.tf || item.ty || item.klineType || item.interval || null);

      // Depth: 买卖盘(字段可能是 bids/asks 或 b/a)
      var depth = null;
      if (item.bids || item.asks || item.b || item.a) {
        depth = {
          bids: item.bids || item.b || [],
          asks: item.asks || item.a || []
        };
        maybeNormalizeDepthOrder(depth, sym, self);
        if (self._debugEnabled && console && console.log) {
          console.log('[MarketsStore] 解析到深度数据:', sym, 'bids:', depth.bids.length, 'asks:', depth.asks.length);
        }
      }

      // Kline: 以 respList 或 klineList 形式存在
      var kSrc = item.respList || item.klineList || null;
      var klines = null;
      if (Array.isArray(kSrc)) {
        var norm = kSrc.map(function(k){
          if (!k) return null;
          return {
            t: k.t || k.time,
            o: Number(k.o ?? k.open),
            h: Number(k.h ?? k.high),
            l: Number(k.l ?? k.low),
            c: Number(k.c ?? k.close),
            v: Number(k.v ?? k.volume),
            raw: k
          };
        }).filter(Boolean);
        // 保证时间升序，避免昨收与今开计算因顺序差异而错误
        try { norm.sort(function(a,b){ return (a.t||0) - (b.t||0); }); } catch(_) {}
        // 仅保留最近 200 根，避免内存膨胀
        klines = norm.slice(-200);
        // 计算最后一根 K 线的涨幅 (close vs open)
        for (var bi = norm.length - 1; bi >= 0; bi--) {
          var bar = norm[bi];
            if (!bar) continue;
            if (isFinite(bar.o) && isFinite(bar.c) && bar.o > 0) {
              var changeAbs = bar.c - bar.o;
              var changePct = (changeAbs / bar.o) * 100;
              var tfKeyFromBar = normalizeTimeframeKey(bar.tf || bar.frame || bar.interval || tfHint || '1m');
              item._klineLastMetrics = {
                time: bar.t,
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v,
                changeAbs: changeAbs,
                changePct: changePct,
                timeframe: tfKeyFromBar
              };
              // 选择更稳定的上一个周期收盘计算涨幅
              var prevClose = null;
              var prevTime = null;
              for (var pj = bi - 1; pj >= 0; pj--) {
                var prevBar = norm[pj];
                if (prevBar && isFinite(prevBar.c)) {
                  prevClose = prevBar.c;
                  prevTime = prevBar.t;
                  break;
                }
              }
              if (isFinite(prevClose)) {
                var crossDiff = bar.c - prevClose;
                var crossPct = prevClose ? (crossDiff / prevClose) * 100 : null;
                item._klineCrossMetrics = {
                  timeframe: tfKeyFromBar,
                  prevClose: prevClose,
                  prevTime: prevTime || null,
                  lastClose: bar.c,
                  lastTime: bar.t || null,
                  changeFromPrevAbs: isFinite(crossDiff) ? crossDiff : null,
                  changeFromPrevPct: isFinite(crossPct) ? crossPct : null
                };
              }
              break;
            }
        }
      }

      var prev = self._quotes[sym] || null;
      var klineLastByTf = prev && prev.klineLastByTf ? Object.assign({}, prev.klineLastByTf) : {};
      var crossMetricsByTf = prev && prev.klineCrossMetricsByTf ? Object.assign({}, prev.klineCrossMetricsByTf) : {};
      if (item._klineLastMetrics) {
        var tfStoreKey = normalizeTimeframeKey(item._klineLastMetrics.timeframe || tfHint || '1m');
        item._klineLastMetrics.timeframe = tfStoreKey;
        klineLastByTf[tfStoreKey] = item._klineLastMetrics;
      }
      if (item._klineCrossMetrics) {
        var crossKey = normalizeTimeframeKey(item._klineCrossMetrics.timeframe || tfHint || '1m');
        item._klineCrossMetrics.timeframe = crossKey;
        crossMetricsByTf[crossKey] = item._klineCrossMetrics;
      }
      var lastVal = isFinite(tradePrice) ? tradePrice : (prev && prev.last) || null;
      var previousLast = prev ? prev.last : null;
      var precision = prev ? prev.precision : self._inferPrecision(sym);
      var metrics = self._computeMetrics(sym, lastVal, previousLast);
      var snapshot = {
        symbol: sym,
        last: lastVal,
        prev: previousLast,
        diff: metrics.diff,
        pct: metrics.pct,
        precision: precision,
        updatedAt: tradeTs || (prev && prev.updatedAt) || Date.now(),
        trade: (isFinite(tradePrice) ? { price: tradePrice, time: tradeTs, raw: item } : (prev && prev.trade) || null),
        depth: depth || (prev && prev.depth) || null,
        klines: klines || (prev && prev.klines) || null,
        klineLast: item._klineLastMetrics || (prev && prev.klineLast) || null,
        klineLastByTf: Object.keys(klineLastByTf).length ? klineLastByTf : (prev && prev.klineLastByTf) || null,
        klineCrossMetricsByTf: Object.keys(crossMetricsByTf).length ? crossMetricsByTf : (prev && prev.klineCrossMetricsByTf) || null,
        crossPeriod: item._klineCrossMetrics || (prev && prev.crossPeriod) || null,
        raw: item
      };
      if (!snapshot.klineLast && snapshot.klineLastByTf) {
        var tfSelect = normalizeTimeframeKey(tfHint || '1m');
        snapshot.klineLast = snapshot.klineLastByTf[tfSelect] || snapshot.klineLastByTf['1m'] || snapshot.klineLastByTf[Object.keys(snapshot.klineLastByTf)[0]];
      }
      if (!snapshot.crossPeriod && snapshot.klineCrossMetricsByTf) {
        var tfSelectCross = normalizeTimeframeKey(tfHint || '1m');
        snapshot.crossPeriod = snapshot.klineCrossMetricsByTf[tfSelectCross] || snapshot.klineCrossMetricsByTf['1m'] || snapshot.klineCrossMetricsByTf[Object.keys(snapshot.klineCrossMetricsByTf)[0]];
      }
      // 优先使用已固定的日级昨日收盘，避免被分钟级 prevClose 覆盖导致昨日价波动
      var dailySnap = self._dailySnapshot && self._dailySnapshot[sym];
      var appliedDailyPrev = false;
      if (dailySnap && isFinite(dailySnap.yesterdayClose)) {
        snapshot.prev = dailySnap.yesterdayClose;
        snapshot.prevSource = 'dailySnapshot';
        appliedDailyPrev = true;
      }
      // 仅当交叉指标为日级(1d)时才允许覆盖昨日收盘
      if (snapshot.crossPeriod && isFinite(snapshot.crossPeriod.prevClose) && snapshot.crossPeriod.timeframe === '1d') {
        if (snapshot.last == null && isFinite(snapshot.crossPeriod.lastClose)) snapshot.last = snapshot.crossPeriod.lastClose;
        snapshot.prev = snapshot.crossPeriod.prevClose;
        var stableDiff = isFinite(snapshot.crossPeriod.changeFromPrevAbs) ? snapshot.crossPeriod.changeFromPrevAbs : (snapshot.last != null ? snapshot.last - snapshot.prev : null);
        snapshot.diff = stableDiff;
        if (snapshot.prev) {
          snapshot.pct = isFinite(snapshot.crossPeriod.changeFromPrevPct) ? snapshot.crossPeriod.changeFromPrevPct : (snapshot.diff != null ? (snapshot.diff / snapshot.prev) * 100 : null);
        }
        snapshot.prevSource = 'dailyCrossPeriod';
      } else if (appliedDailyPrev) {
        // 重新基于日级昨日收盘计算 diff/pct
        if (snapshot.last != null && snapshot.prev != null) {
          snapshot.diff = snapshot.last - snapshot.prev;
          snapshot.pct = snapshot.prev ? (snapshot.diff / snapshot.prev) * 100 : null;
        }
      }
      if (snapshot.prevSource === 'klinePrevClose' && snapshot.crossPeriod && snapshot.crossPeriod.timeframe !== '1d') {
        console.warn('[MarketsStore] 非日级 prevClose 覆盖已阻止', sym, snapshot.crossPeriod.timeframe);
      }
      // 基于最新成交价更新交易日快照 (6.5~6.9)
      if (isFinite(lastVal)) {
        var hi = snapshot.klineLast && isFinite(snapshot.klineLast.high) ? snapshot.klineLast.high : null;
        var lo = snapshot.klineLast && isFinite(snapshot.klineLast.low) ? snapshot.klineLast.low : null;
        try { self.updateDailySnapshotFromTick(sym, lastVal, hi, lo); } catch(_){}
      }
      self._quotes[sym] = snapshot;
      self._lastUpdateMap[sym] = snapshot.updatedAt || Date.now();
      // 添加调试日志
      if (self._debugEnabled && console && console.log) {
        console.log('[MarketsStore] emit update with depth:', sym, 'bids:', depth && depth.bids && depth.bids.length, 'asks:', depth && depth.asks && depth.asks.length);
      }
      // 收到新报价时重置重订阅计时器,确保从休市恢复后立即切换到高频模式
      self._lastResubscribeAt = Date.now();
      self._bus.emit('update', sym, snapshot);
    }

    if (Array.isArray(data)) {
      for (var i=0;i<data.length;i++) adaptAndStore(data[i]);
    } else if (data && Array.isArray(data.list)) {
      for (var j=0;j<data.list.length;j++) adaptAndStore(data.list[j]);
    } else if (data && Array.isArray(data.items)) {
      for (var k=0;k<data.items.length;k++) adaptAndStore(data.items[k]);
    } else {
      adaptAndStore(data);
    }
  };

  MarketsStore.prototype._handleError = function(err){ this._bus.emit('error', err); };

  MarketsStore.prototype.init = async function(){
    if (this._socket && typeof this._socket.isReady === 'function' && this._socket.isReady()) return this;
    var MarketsSocket = globalScope.MarketsSocket || (typeof require === 'function' ? null : null);
    if (typeof MarketsSocket !== 'function') {
      if (console && console.warn) console.warn('[MarketsStore] MarketsSocket helper 未就绪');
      return this;
    }
    var creds = await resolveWsCredentials();
    if (!creds) {
      // 尝试访客模式（只建立连接不发送 auth，部分公开行情源可能允许匿名订阅）
      if (console && console.warn) {
        console.warn('[MarketsStore] ⚠️ 未找到登录凭证（userAccount/apiKey），WebSocket 可能无法连接');
      }
    } else {
      if (console && console.log) {
        console.log('[MarketsStore] ✅ 已获取凭证，用户:', creds.userAccount);
      }
    }
    var endpoint = resolveWsEndpoint();
    if (console && console.log) {
      console.log('[MarketsStore] WebSocket 端点:', endpoint);
    }
    var socket = new MarketsSocket({
      endpoint: endpoint,
      cryptoMode: 'no',
      business: 'common',
      provider: 'internal',
      reconnect: true,
      useInfowayProtocol: true,
      debug: this._debugEnabled,
      onStateChange: this._handleState.bind(this),
      onData: this._handleData.bind(this),
      onError: this._handleError.bind(this)
    });
    if (creds) {
      socket.connect(creds);
    } else {
      // 没有凭证则直接标记 open，等待后续凭证补齐再重连
      if (console && console.warn) {
        console.warn('[MarketsStore] ⚠️ 访客模式：暂不鉴权，等待后续凭证');
      }
      // 仍创建 socket 以便后续检测 ready 状态；由于 MarketsSocket.connect 会直接报 Missing credentials，这里绕开
      try { socket.credentials = {}; socket._emitState('connecting'); } catch(_) {}
    }
    this._socket = socket;
    this._startHealthCheck();
    return this;
  };

  MarketsStore.prototype.getStatus = function(){
    var sock = this._socket;
    return {
      ready: this._ready,
      subscribed: !!(sock && sock.activeSubscription),
      watchlist: this._watch.slice(),
      quoteCount: Object.keys(this._quotes).length,
      hasSocket: !!sock,
      socketReady: !!(sock && sock.isReady && sock.isReady()),
      lastSymbols: sock && sock.lastSubscribedCodes || '',
      reconnectAttempts: sock && sock.reconnectAttempts || 0,
      channels: sock ? {
        needDepth: !!(sock.watchOptions && sock.watchOptions.needDepth),
        needKline: !!(sock.watchOptions && sock.watchOptions.needKline),
        protoCode: (sock.watchOptions && sock.watchOptions.protoCode) || 10000
      } : null
    };
  };

  // 公开 K 线访问接口
  MarketsStore.prototype.getKlines = function(symbol){
    return symbol && this._quotes[symbol] ? this._quotes[symbol].klines || [] : [];
  };
  MarketsStore.prototype.getKlineMetrics = function(symbol){
    return symbol && this._quotes[symbol] ? this._quotes[symbol].klineLast || null : null;
  };
  MarketsStore.prototype.getKlineCrossMetrics = function(symbol, timeframe){
    if (!symbol || !this._quotes[symbol]) return null;
    var tfKey = normalizeTimeframeKey(timeframe || '1m');
    var snap = this._quotes[symbol];
    if (snap.klineCrossMetricsByTf && snap.klineCrossMetricsByTf[tfKey]) return snap.klineCrossMetricsByTf[tfKey];
    if (snap.crossPeriod) return snap.crossPeriod;
    return null;
  };
  MarketsStore.prototype.getStablePrevClose = function(symbol, timeframe){
    var metrics = this.getKlineCrossMetrics(symbol, timeframe);
    if (metrics && isFinite(metrics.prevClose)) return metrics.prevClose;
    return null;
  };
  MarketsStore.prototype.primeKlinesFromHttp = function(symbol, list, timeframe){
    if (!symbol) return;
    // 如果数据为空，仍然需要初始化品种结构，避免后续访问 undefined
    if (!Array.isArray(list) || !list.length) {
      // 确保品种已初始化，但保留现有数据
      if (!this._quotes[symbol]) {
        this._quotes[symbol] = { s: symbol };
      }
      return;
    }
    var tfKey = normalizeTimeframeKey(timeframe || '1m');
    this._handleData({ s: symbol, klineList: list, timeframe: tfKey });
  };

  // ========== 健康检查与自动重订阅 ==========
  MarketsStore.prototype._startHealthCheck = function(){
    var self = this;
    if (self._healthTimer) return;
    self._healthTimer = setInterval(function(){ self._runHealthScan(); }, 10000); // 每 10s 扫描
  };
  MarketsStore.prototype._runHealthScan = function(){
    var now = Date.now();
    var staleSymbols = [];
    var totalWatched = Object.keys(this._lastUpdateMap).length;
    for (var sym in this._lastUpdateMap){
      var lastTs = this._lastUpdateMap[sym];
      if (!lastTs) continue;
      if (now - lastTs > this._staleThresholdMs) staleSymbols.push(sym);
    }
    if (staleSymbols.length){
      this._bus.emit('stale', staleSymbols.slice());
      // 若长时间无更新, 尝试重新发送订阅请求
      if (this._socket && this._socket.isReady && this._socket.isReady()){
        // 动态调整重订阅间隔: 如果所有品种都过期(可能休市),延长到60秒降低请求频率
        var allStale = (totalWatched > 0 && staleSymbols.length === totalWatched);
        var effectiveInterval = allStale ? 60000 : this._resubscribeIntervalMs; // 全部休市: 60s, 部分活跃: 15s
        if (now - this._lastResubscribeAt > effectiveInterval){
          this._lastResubscribeAt = now;
          if (this._debugEnabled && console && console.log) {
            console.log('[MarketsStore] 健康检查重订阅:', allStale ? '休市模式(60s)' : '正常模式(15s)', 'stale:', staleSymbols.length, '/', totalWatched);
          }
          try { this._rebuildWatch(); } catch(e){ if (console && console.warn) console.warn('[MarketsStore] resubscribe failed', e); }
        }
      }
    }
  };

  // ========== Funds 资产实时计算模块 ==========
  
  /**
   * 启用 Funds 资产实时计算
   * @param {Object} data - I00003 接口返回的数据（根级别包含所有字段）
   * @param {Function} callback - UI 更新回调函数 function(metrics) { ... }
   */
  MarketsStore.prototype.enableFundsCalculation = function(data, callback){
    try {
      console.log('[MarketsStore] enableFundsCalculation 收到数据:', data);
      console.log('[MarketsStore] data 类型:', typeof data, ', 是否为对象:', data && typeof data === 'object');
      console.log('[MarketsStore] data.positions:', data && data.positions);
      console.log('[MarketsStore] callback 类型:', typeof callback);
      
      if (!data) {
        if (console && console.warn) console.warn('[MarketsStore] enableFundsCalculation: invalid data');
        return;
      }
      
      // I00003 返回的数据直接在根级别，不在 data.data 里
      this._fundsStaticData = data;
      this._fundsPositions = data.positions || [];
      this._fundsWalletType = data.walletType || 0;
      this._fundsCallback = callback;
      this._fundsEnabled = true;
      
      console.log('[MarketsStore] 已存储数据，positions 长度:', this._fundsPositions.length);
      
      // 订阅所有持仓品种的行情
      var symbols = this._fundsPositions.map(function(p){ return p.itemId; }).filter(Boolean);
      console.log('[MarketsStore] 提取的品种列表:', symbols);
      
      if (symbols.length > 0) {
        this.subscribe(symbols);
        if (this._debugEnabled && console && console.log) {
          console.log('[MarketsStore] Funds 已启用，订阅品种:', symbols);
        }
      }
      
      console.log('[MarketsStore] 即将调用 _calculateAndNotifyFunds');
      // 立即计算一次
      this._calculateAndNotifyFunds();
    } catch(err) {
      if (console && console.warn) console.warn('[MarketsStore] enableFundsCalculation failed', err);
    }
  };
  
  /**
   * 禁用 Funds 资产实时计算
   */
  MarketsStore.prototype.disableFundsCalculation = function(){
    try {
      if (!this._fundsEnabled) return;
      
      // 取消订阅
      var symbols = this._fundsPositions.map(function(p){ return p.itemId; }).filter(Boolean);
      if (symbols.length > 0) {
        this.unsubscribe(symbols);
      }
      
      this._fundsEnabled = false;
      this._fundsPositions = [];
      this._fundsStaticData = null;
      this._fundsCallback = null;
      
      if (this._debugEnabled && console && console.log) {
        console.log('[MarketsStore] Funds 已禁用');
      }
    } catch(err) {
      if (console && console.warn) console.warn('[MarketsStore] disableFundsCalculation failed', err);
    }
  };
  
  /**
   * 获取实时价格（内部方法）
   */
  MarketsStore.prototype.getPrice = function(itemId){
    try {
      var quote = this._quotes[itemId];
      if (!quote) return 0;
      
      // 优先级：最新价 > 收盘价 > 开盘价
      var price = Number(quote.last || quote.lastPrice || quote.c || quote.close || quote.o || quote.open);
      return isFinite(price) && price > 0 ? price : 0;
    } catch(err) {
      return 0;
    }
  };
  
  /**
   * 计算 Funds 指标并通知 UI
   * @private
   */
  MarketsStore.prototype._calculateAndNotifyFunds = function(){
    try {
      if (!this._fundsEnabled || !this._fundsCallback) {
        console.warn('[MarketsStore] _calculateAndNotifyFunds: 未启用或无回调');
        return;
      }
      
      var payload = this._fundsStaticData;
      var positions = this._fundsPositions;
      
      console.log('[MarketsStore] 🔥 开始计算 Funds (调用栈):', new Error().stack.split('\n')[2]);
      console.log('[MarketsStore] 开始计算 Funds，positions 数量:', positions.length);
      console.log('[MarketsStore] 静态数据 walletBalance:', payload.walletBalance, ', totalLiabilities:', payload.totalLiabilities);
      
      // 1️⃣ 计算持仓盈亏
      var positionPL = 0;
      var marginUsed = 0;
      
      for (var i = 0; i < positions.length; i++) {
        var pos = positions[i];
        var currentPrice = this.getPrice(pos.itemId);
        
        console.log('[MarketsStore] 持仓 ' + (i+1) + ':', {
          itemId: pos.itemId,
          currentPrice: currentPrice,
          avgOpenPrice: pos.avgOpenPrice,
          totalVolume: pos.totalVolume,
          direction: pos.direction,
          tradeRate: pos.tradeRate
        });
        
        if (!currentPrice || currentPrice <= 0) {
          console.warn('[MarketsStore] 跳过持仓 ' + pos.itemId + '，价格无效:', currentPrice);
          continue;
        }
        
        var avgOpenPrice = Number(pos.avgOpenPrice) || 0;
        var totalVolume = Number(pos.totalVolume) || 0;
        var totalSwap = Number(pos.totalSwap) || 0;
        var tradeRate = Number(pos.tradeRate) || 1;  // 🔥 默认 1 倍，避免除以 0
        if (tradeRate <= 0) tradeRate = 1;  // 🔥 强制保护
        var direction = String(pos.direction || '').toLowerCase();
        
        // 方向系数：buy=1, sell=-1
        var directionCoef = direction === 'buy' ? 1 : -1;
        
        // 盈亏 = (当前价 - 开仓价) × 数量 × 方向 - 隔夜费
        var pl = (currentPrice - avgOpenPrice) * totalVolume * directionCoef - totalSwap;
        positionPL += pl;
        
        // 已用保证金 = 开仓价 × 数量 / 杠杆倍数
        var margin = (avgOpenPrice * totalVolume) / tradeRate;
        marginUsed += margin;
        
        console.log('[MarketsStore] 持仓 ' + pos.itemId + ' 计算结果: PL=' + pl.toFixed(2) + ', margin=' + margin.toFixed(2));
      }
      
      console.log('[MarketsStore] 🔢 汇总: positionPL=' + positionPL.toFixed(2) + ', marginUsed=' + marginUsed.toFixed(2));
      
      // 2️⃣ 计算总资产（用户所有资产 - 负债）：
      // 组成：
      // 1) 现金钱包余额 cashBalance
      // 2) 杠杆钱包余额 leverBalance - borrowed - interest + collateral
      // 3) 持仓当前总价值（使用当前价 × 数量，方向 buy=正，sell=负）
      // 4) 挂单当前总价值（使用挂单 openPrice × 数量，方向同上）
      var cashBalance = Number(payload.cashBalance) || 0;
      var leverBalance = Number(payload.leverBalance) || 0;
      var borrowed = Number(payload.borrowed) || 0;
      var interest = Number(payload.interest) || 0;
      var collateral = Number(payload.collateral) || 0;
      var totalLiabilities = Number(payload.totalLiabilities) || (borrowed + interest) || 0;

      // 3) 持仓总价值（全部账户）与现金账户专属
      var positionsValue = 0;
      var cashPositionsValue = 0;
      var cashPositionPL = 0;
      for (var j = 0; j < positions.length; j++) {
        var p = positions[j];
        var priceNow = this.getPrice(p.itemId);
        if (!priceNow || priceNow <= 0) continue;
        var vol = Number(p.totalVolume) || 0;
        var dirCoef = String(p.direction||'').toLowerCase() === 'sell' ? -1 : 1;
        var posValue = (priceNow * vol * dirCoef);
        positionsValue += posValue;
        if (Number(p.detailsWalletType) === 0) {
          cashPositionsValue += posValue;
          var avgP = Number(p.avgOpenPrice) || 0;
          var swapP = Number(p.totalSwap) || 0;
          cashPositionPL += ((priceNow - avgP) * vol * dirCoef - swapP);
        }
      }

      // 4) 挂单总价值（全部账户）与现金账户专属
      var pendingOrders = Array.isArray(payload.pendingOrders) ? payload.pendingOrders : [];
      var pendingValue = 0;
      var cashPendingValue = 0;
      for (var k = 0; k < pendingOrders.length; k++) {
        var o = pendingOrders[k];
        var openPrice = Number(o.openPrice) || 0;
        var tVol = Number(o.tradeVolume) || 0;
        var oDir = String(o.direction||'').toLowerCase() === 'sell' ? -1 : 1;
        if (openPrice > 0 && tVol > 0) {
          var oVal = (openPrice * tVol * oDir);
          pendingValue += oVal;
          if (Number(o.detailsWalletType) === 0) cashPendingValue += oVal;
        }
      }

      // 综合总资产（包含现金账户+杠杆账户）
      var leverNet = leverBalance - borrowed - interest + collateral;
      var totalAsset = cashBalance + leverNet + positionsValue + pendingValue;

      // 杠杆账户（币安模式）指标：
      // A 抵押基数（来自现金账户划转并抵押的金额）
      var leverageBase = collateral;
      // B 倍率（例如 20x）与借款后可用总金额
      var leverageRatio = Number(payload.maxLeverageRatio) || 0;
      var leverageAvailableTotal = leverageRatio > 0 ? (leverageRatio * leverageBase) : 0;
      // C 实际负债上限（最大可借金额）= 借款后可用总金额 - 抵押基数
      var leverageMaxBorrowable = Math.max(0, leverageAvailableTotal - leverageBase);
      // 已借金额（含利息外的本金）
      var leverageBorrowed = Math.max(0, borrowed);
      // D 剩余可借款额度（不能重复抵押借款）
      var leverageBorrowableRemaining = Math.max(0, leverageMaxBorrowable - leverageBorrowed);
      // 展示余额（包含划转与已借款）
      var leverageDisplayBalance = leverBalance;

      console.log('[MarketsStore] 💰 总资产计算明细:', {
        cashBalance: cashBalance,
        leverBalance: leverBalance,
        borrowed: borrowed,
        interest: interest,
        collateral: collateral,
        positionsValue: positionsValue,
        pendingValue: pendingValue,
        totalAsset: totalAsset
      });
      
      // 3️⃣ 计算净值
      var equity = totalAsset;
      
      // 4️⃣ 计算保证金水平
      var marginLevel = equity > 0 ? (marginUsed / equity) * 100 : 0;
      
      // 5️⃣ 计算可用保证金
      var freeMargin = equity - marginUsed;
      
      // 6️⃣ 构造结果对象
      var metrics = {
        positionPL: positionPL,
        marginUsed: marginUsed,
        totalAsset: totalAsset,
        equity: equity,
        marginLevel: marginLevel,
        freeMargin: freeMargin,
        positionsValue: positionsValue,
        pendingValue: pendingValue,
        leverNet: leverNet,
        // 现金账户分项（用于红框口径）
        cashBalance: cashBalance,
        cashCollateral: collateral,
        cashHolding: cashPositionsValue,
        cashProfitLoss: cashPositionPL,
        cashNetWorth: (cashBalance + cashPositionsValue + cashPendingValue),
        cashPending: cashPendingValue,
        // 杠杆账户分项（用于杠杆页与风控）
        leverageBase: leverageBase,
        leverageRatio: leverageRatio,
        leverageAvailableTotal: leverageAvailableTotal,
        leverageMaxBorrowable: leverageMaxBorrowable,
        leverageBorrowed: leverageBorrowed,
        leverageBorrowableRemaining: leverageBorrowableRemaining,
        leverageDisplayBalance: leverageDisplayBalance,
        leverageInterest: interest,
        timestamp: Date.now()
      };
      
      // 7️⃣ 触发回调
      if (typeof this._fundsCallback === 'function') {
        this._fundsCallback(metrics);
      }
      
      // 8️⃣ 发出事件
      this._bus.emit('funds:update', metrics);
      
    } catch(err) {
      if (console && console.warn) console.warn('[MarketsStore] _calculateAndNotifyFunds failed', err);
    }
  };
  
  /**
   * 更新 Funds 静态数据（钱包余额、负债等）
   * @param {Object} data - 新的静态数据
   */
  MarketsStore.prototype.updateFundsStaticData = function(data){
    try {
      if (!this._fundsEnabled) return;
      if (!data || !data.data) return;
      
      this._fundsStaticData = data.data;
      this._fundsPositions = data.data.positions || [];
      
      // 重新订阅品种
      var symbols = this._fundsPositions.map(function(p){ return p.itemId; }).filter(Boolean);
      if (symbols.length > 0) {
        this.subscribe(symbols);
      }
      
      // 重新计算
      this._calculateAndNotifyFunds();
    } catch(err) {
      if (console && console.warn) console.warn('[MarketsStore] updateFundsStaticData failed', err);
    }
  };

  // 单例导出
  var singleton = new MarketsStore();
  singleton.normalizeTimeframeKey = normalizeTimeframeKey;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = singleton;
  } else {
    globalScope.MarketsStore = singleton;
  }
})(typeof window !== 'undefined' ? window : null);
