(function(){
  const DEFAULT_SYMBOL = 'BTCUSDT';
  const LW_SCRIPT_PATH = '/pages/webapp/vendor/lightweight-charts.standalone.production.js';
  const MARKETS_WS_PATH = '/utils/markets.ws.js';
  const MARKETS_STORE_PATH = '/utils/markets.store.js';
  const MD5_LIB_PATH = '/utils/md5.js';
  const TIMEFRAME_MAP = {
    '1m': { label: '1m', klineType: 1 },
    '5m': { label: '5m', klineType: 2 },
    '15m': { label: '15m', klineType: 3 },
    '1h': { label: '1h', klineType: 4 },
    '4h': { label: '4h', klineType: 5 },
    '1d': { label: '1d', klineType: 6 }
  };
  const FOREX_CODES = ['AUD','CAD','CHF','CNH','CNY','EUR','GBP','HKD','JPY','MXN','NOK','NZD','SEK','SGD','USD','ZAR'];
  const CANDLE_CACHE_TTL = 15000; // ms

  function detectBusiness(symbol) {
    if (!symbol) return 'common';
    if (/USDT$|USDC$|BTC$|ETH$/i.test(symbol)) return 'crypto';
    if (/\.US$|\.HK$|\.SZ$|\.SH$/i.test(symbol)) return 'stock';
    return 'common';
  }

  function safeNumber(value) {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      let normalized = value.trim();
      if (!normalized) return null;
      normalized = normalized.replace(/,/g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'bigint') {
      const casted = Number(value);
      return Number.isFinite(casted) ? casted : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value, digits) {
    const n = safeNumber(value);
    if (n === null) return '--';
    if (Math.abs(n) >= 1) return n.toFixed(digits != null ? digits : 2);
    return n.toFixed(digits != null ? digits : 4);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
  }

  function inferPricePrecision(symbol, business) {
    const fallback = business === 'crypto' ? 2 : 4;
    if (!symbol) return fallback;
    const cleaned = String(symbol).toUpperCase().replace(/[^A-Z]/g, '');
    if (!cleaned) return fallback;
    if (business === 'stock') return 2;
    if (business === 'crypto') {
      if (/USDT$|USDC$/.test(cleaned)) return 4;
      return cleaned.endsWith('BTC') || cleaned.endsWith('ETH') ? 2 : 4;
    }
    if (cleaned.includes('.')) return 2;
    if (cleaned.length === 6) {
      const base = cleaned.slice(0, 3);
      const quote = cleaned.slice(3);
      if (FOREX_CODES.includes(base) && FOREX_CODES.includes(quote)) {
        return quote === 'JPY' ? 3 : 5;
      }
    }
    if (/JPY$/.test(cleaned)) return 3;
    if (/USD$/.test(cleaned)) return 4;
    return fallback;
  }

  Page({
    data: {
      symbol: DEFAULT_SYMBOL,
      symbolLabel: '--',
      symbolDesc: '--',
      timeframe: '1m'
    },

    formatWithPrecision(value, overrideDigits) {
      const digits = overrideDigits != null ? overrideDigits : (this._pricePrecision || 4);
      return formatNumber(value, digits);
    },

    async onLoad() {
      this._symbol = DEFAULT_SYMBOL;
      this._business = 'common';
  this._chart = null;
      this._series = null;
      this._resizeHandler = null;
      this._marketsListener = null;
  this._marketStateListener = null;
  this._marketReadyListener = null;
      this._http = null;
      this._candles = [];
      this._loadingCandles = false;
  this._loadingCandlesFrame = null;
      this._mounted = true;
  this._httpFallbackTimer = null;
  this._httpFallbackActive = false;
  this._pricePrecision = inferPricePrecision(this._symbol, this._business);
  this._candleCache = Object.create(null);

      this.parseInitialParams();
      this.decorateTimeframeButtons();
      await this.ensureHttpClient();
      try {
        await this.ensureChart();
      } catch (err) {
        console.warn('[chart-detail] initialize chart failed', err);
        if (typeof window.ShowToast === 'function') {
          window.ShowToast('Chart library failed to load');
        }
        return;
      }
  await this.initRealtimeBridge();
  this.refreshCandles({ force: true });
    },

    onUnload() {
      this._mounted = false;
      try {
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      } catch(_) {}
      if (window.MarketsStore) {
        if (this._marketsListener) window.MarketsStore.off('update', this._marketsListener);
        if (this._marketStateListener) window.MarketsStore.off('state', this._marketStateListener);
        if (this._marketReadyListener) window.MarketsStore.off('ready', this._marketReadyListener);
        window.MarketsStore.unsubscribe && window.MarketsStore.unsubscribe(this._symbol);
      }
      if (this._chart && typeof this._chart.remove === 'function') {
        try { this._chart.remove(); } catch(_) {}
      }
      this.stopHttpFallback();
    },

    parseInitialParams() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        const symbol = (params.get('symbol') || '').toUpperCase() || DEFAULT_SYMBOL;
        const label = params.get('name') || symbol;
        const desc = params.get('desc') || 'Live Contracts';
        this._symbol = symbol;
  this._business = params.get('business') || detectBusiness(symbol);
  this._pricePrecision = inferPricePrecision(symbol, this._business);
  this._candleCache = Object.create(null);
        this.setData({ symbol, symbolLabel: label, symbolDesc: desc });
        setText('cd-symbol', label);
        setText('cd-desc', desc);
        setText('cd-price', '--');
        setText('cd-change', '--');
        setText('cd-change-pct', '--');
      } catch (err) {
        console.warn('[chart-detail] parseInitialParams failed', err);
      }
    },

    decorateTimeframeButtons() {
      try {
        const buttons = document.querySelectorAll('.timeframe-btn');
        buttons.forEach(btn => {
          const frame = btn.dataset.frame;
          btn.classList.toggle('active', frame === this.data.timeframe);
          const handler = (event) => {
            event && event.preventDefault && event.preventDefault();
            this.handleTimeframeTap({
              currentTarget: btn,
              target: btn,
              dataset: btn.dataset,
              originalEvent: event || null
            });
          };
          if (btn.__chartDetailTfHandler) {
            btn.removeEventListener('click', btn.__chartDetailTfHandler);
          }
          btn.__chartDetailTfHandler = handler;
          btn.addEventListener('click', handler);
        });
      } catch(_) {}
    },

    async ensureHttpClient() {
      if (this._http) return this._http;
      if (typeof window.InfowayHttp !== 'function') {
        console.warn('[chart-detail] InfowayHttp not ready');
        return null;
      }
      this._http = new window.InfowayHttp({ defaultBusiness: this._business });
      return this._http;
    },

    async ensureChart() {
      await this.ensureChartLibrary();
      if (this._chart) return this._chart;
      const container = document.getElementById('chart-canvas');
      if (!container || !window.LightweightCharts) return null;
      const { createChart } = window.LightweightCharts;
      this._chart = createChart(container, {
        layout: {
          background: { color: 'transparent' },
          textColor: 'rgba(255,255,255,0.8)'
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' }
        },
        crosshair: {
          mode: window.LightweightCharts.CrosshairMode.Normal
        },
        leftPriceScale: { visible: false },
        rightPriceScale: {
          visible: true,
          borderColor: 'rgba(255,255,255,0.08)'
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.08)'
        }
      });
      this._series = this._chart.addCandlestickSeries({
        upColor: '#00e29b',
        downColor: '#ff5b5b',
        borderDownColor: '#ff5b5b',
        borderUpColor: '#00e29b',
        wickUpColor: '#00e29b',
        wickDownColor: '#ff5b5b'
      });
      const resize = () => {
        if (!this._chart) return;
        this._chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight
        });
      };
      resize();
      this._resizeHandler = resize;
      window.addEventListener('resize', resize);
      return this._chart;
    },

    async ensureChartLibrary() {
      if (window.LightweightCharts) return window.LightweightCharts;
      return new Promise((resolve, reject) => {
        const existing = document.getElementById('lw-chart-lib');
        if (existing) {
          existing.addEventListener('load', () => resolve(window.LightweightCharts));
          existing.addEventListener('error', reject);
          return;
        }
        const script = document.createElement('script');
        script.id = 'lw-chart-lib';
        script.src = LW_SCRIPT_PATH;
        script.onload = () => resolve(window.LightweightCharts);
        script.onerror = (err) => {
          console.warn('[chart-detail] lightweight charts load failed', err);
          reject(err);
        };
        document.head.appendChild(script);
      });
    },

    async initRealtimeBridge() {
      await this.ensureMarketsStore();
      if (!window.MarketsStore) {
        console.warn('[chart-detail] MarketsStore missing, switching to HTTP fallback');
        this.startHttpFallback();
        return;
      }
      try {
        await window.MarketsStore.init();
      } catch (err) {
        console.warn('[chart-detail] MarketsStore init failed', err);
        this.startHttpFallback();
        return;
      }
      if (typeof window.MarketsStore.subscribe === 'function') {
        window.MarketsStore.subscribe(this._symbol);
      }
      if (typeof window.MarketsStore.on === 'function') {
        this._marketsListener = (symbol, snapshot) => {
          if (symbol !== this._symbol) return;
          this.applySnapshot(snapshot);
        };
        window.MarketsStore.on('update', this._marketsListener);
        this._marketReadyListener = () => {
          this.stopHttpFallback();
          this.updateMarketPill('Realtime');
          if (!this._candles.length) this.refreshCandles({ force: true });
        };
        this._marketStateListener = (state) => {
          if (state === 'ready') {
            this._marketReadyListener && this._marketReadyListener();
          } else if (state === 'closed') {
            this.startHttpFallback();
            this.updateMarketPill('HTTP Polling');
          }
        };
        window.MarketsStore.on('state', this._marketStateListener);
        window.MarketsStore.on('ready', this._marketReadyListener);
      }
      const existing = window.MarketsStore.getQuote && window.MarketsStore.getQuote(this._symbol);
      if (existing) this.applySnapshot(existing);
      const socketReady = window.MarketsStore.isReady && window.MarketsStore.isReady();
      if (!socketReady) {
        console.info('[chart-detail] MarketsStore not ready, enabling HTTP fallback');
        this.updateMarketPill('HTTP Polling');
        this.startHttpFallback();
      } else {
        this.updateMarketPill('Realtime');
      }
    },

    async ensureMarketsStore() {
      await this.ensureMd5Helper();
      if (window.MarketsStore) return window.MarketsStore;
      try {
        if (!window.MarketsSocket) {
          await this.loadExternalScript('markets-ws-lib', MARKETS_WS_PATH, () => window.MarketsSocket);
        }
        if (!window.MarketsStore) {
          await this.loadExternalScript('markets-store-lib', MARKETS_STORE_PATH, () => window.MarketsStore);
        }
      } catch (err) {
        console.warn('[chart-detail] ensureMarketsStore failed', err);
      }
      return window.MarketsStore || null;
    },

    async ensureMd5Helper() {
      const hasMd5 = () => (typeof window.hex_md5 === 'function') || (typeof window.hex_md5_utf === 'function') || (window.CryptoJS && window.CryptoJS.MD5);
      if (hasMd5()) return true;
      try {
        await this.loadExternalScript('legacy-md5-lib', MD5_LIB_PATH, hasMd5);
      } catch (err) {
        console.warn('[chart-detail] load md5 helper failed', err);
      }
      return hasMd5();
    },

    loadExternalScript(id, src, readyCheck) {
      return new Promise((resolve, reject) => {
        if (typeof readyCheck === 'function') {
          const readyValue = readyCheck();
          if (readyValue) {
            resolve(readyValue);
            return;
          }
        }
        let el = document.getElementById(id);
        if (el) {
          el.addEventListener('load', () => resolve(readyCheck ? readyCheck() : true), { once: true });
          el.addEventListener('error', reject, { once: true });
          return;
        }
        el = document.createElement('script');
        el.id = id;
        el.src = src;
        el.async = true;
        el.onload = () => resolve(readyCheck ? readyCheck() : true);
        el.onerror = reject;
        document.head.appendChild(el);
      });
    },

    startHttpFallback() {
      if (this._httpFallbackActive) return;
      this._httpFallbackActive = true;
      this.updateMarketPill('HTTP Polling');
      const poll = async () => {
        if (!this._mounted || !this._httpFallbackActive) return;
        try {
          await Promise.allSettled([
            this.refreshCandles({ force: true }),
            this.fetchLatestTrade()
          ]);
        } catch (err) {
          console.warn('[chart-detail] HTTP fallback poll failed', err);
        } finally {
          if (this._mounted && this._httpFallbackActive) {
            this._httpFallbackTimer = setTimeout(poll, 5000);
          }
        }
      };
      poll();
    },

    stopHttpFallback() {
      this._httpFallbackActive = false;
      if (this._httpFallbackTimer) {
        clearTimeout(this._httpFallbackTimer);
        this._httpFallbackTimer = null;
      }
    },

    async fetchLatestTrade() {
      const client = await this.ensureHttpClient();
      if (!client) return;
      try {
        const business = this._business || 'common';
        const payload = await client.getTrades(this._symbol, { business });
        const entry = this.pickSymbolEntry(payload);
        if (!entry) return;
        const price = Number(entry.p || entry.last || entry.price || entry.c);
        if (!isFinite(price)) return;
        const prev = Number(entry.prevPrice || entry.o || entry.open);
        this.applySnapshot({
          symbol: this._symbol,
          last: price,
          prev: isFinite(prev) ? prev : null,
          trade: { price, time: entry.t || entry.time || Date.now(), raw: entry }
        });
      } catch (err) {
        console.warn('[chart-detail] fetchLatestTrade failed', err);
      }
    },

    applySnapshot(snapshot) {
      if (!snapshot) return;
      const { last, prev, depth } = snapshot;
      const diff = (last != null && prev != null) ? last - prev : null;
      const pct = (diff != null && prev) ? (diff / prev) * 100 : null;
  setText('cd-price', this.formatWithPrecision(last));
      const changeEl = document.getElementById('cd-change');
      const pctEl = document.getElementById('cd-change-pct');
      if (changeEl) {
  changeEl.textContent = diff == null ? '--' : `${diff >= 0 ? '+' : ''}${this.formatWithPrecision(diff)}`;
        changeEl.classList.toggle('up', diff > 0);
        changeEl.classList.toggle('down', diff < 0);
      }
      if (pctEl) {
        pctEl.textContent = pct == null ? '--' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        pctEl.classList.toggle('up', pct > 0);
        pctEl.classList.toggle('down', pct < 0);
      }
      if (depth && depth.bids && depth.asks) {
        const volume = [...depth.bids, ...depth.asks].reduce((sum, row) => sum + (Number(row[1]) || 0), 0);
        setText('cd-volume', volume ? volume.toFixed(2) : '--');
      }
    },

    async refreshCandles(options) {
      const opts = typeof options === 'object' ? (options || {}) : { force: !!options };
      const frame = opts.frame || this.data.timeframe || '1m';
      const force = !!opts.force;
      const preferCache = opts.preferCache !== false;
      const cacheKey = this.getCacheKey(frame);
      const cached = this._candleCache[cacheKey];
      const now = Date.now();
      if (!force && preferCache && cached && (now - cached.fetchedAt) < CANDLE_CACHE_TTL) {
        if (this.data.timeframe === frame) {
          this._candles = cached.data;
          this.applySeriesData(cached.data);
          this.updateStatsFromCandle(cached.data[cached.data.length - 1] || null);
        }
        return;
      }
      if (this._loadingCandles && this._loadingCandlesFrame === frame && !force) return;
      const client = await this.ensureHttpClient();
      if (!client) return;
      const map = TIMEFRAME_MAP[frame] || TIMEFRAME_MAP['1m'];
      this._loadingCandles = true;
      this._loadingCandlesFrame = frame;
      try {
        const payload = await client.getCandles({ symbols: this._symbol, klineType: map.klineType, klineNum: 300 }, { business: this._business });
        const normalized = this.normalizeCandles(payload);
        if (!normalized || !normalized.length) {
          if (this.data.timeframe === frame) this.resetChartSeries();
          return;
        }
        const ordered = this.ensureChronological(normalized);
        const seriesData = this.sanitizeSeriesData(ordered);
        if (!seriesData.length) {
          console.warn('[chart-detail] sanitizeSeriesData produced empty payload', ordered.slice(0, 5));
          if (this.data.timeframe === frame) this.resetChartSeries();
          return;
        }
        this._candleCache[cacheKey] = { data: seriesData, fetchedAt: Date.now() };
        // 将最新 K 线推送到全局 MarketsStore 以便其它页面复用涨幅/最后一根指标
        try {
          if (window.MarketsStore && typeof window.MarketsStore.primeKlinesFromHttp === 'function') {
            var exportList = seriesData.map(function(bar){
              return { t: bar.time * 1000, o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume };
            });
            // 传入当前 timeframe 标记（multi-timeframe 缓存可在后续扩展使用）
            window.MarketsStore.primeKlinesFromHttp(this._symbol, exportList, frame);
          }
        } catch (e) {
          console.warn('[chart-detail] primeKlinesFromHttp failed', e);
        }
        if (this.data.timeframe === frame || opts.forceApply) {
          this._candles = seriesData;
          this.applySeriesData(seriesData);
          this.updateStatsFromCandle(seriesData[seriesData.length - 1]);
        }
      } catch (err) {
        console.warn('[chart-detail] refreshCandles failed', err);
      } finally {
        if (this._loadingCandlesFrame === frame) {
          this._loadingCandles = false;
          this._loadingCandlesFrame = null;
        }
      }
    },

    normalizeCandles(payload) {
      if (!payload) return [];
      let list = [];
      if (Array.isArray(payload)) {
        const target = payload.find(item => (item.code || item.symbol || item.s) === this._symbol) || payload[0];
        if (target) list = target.respList || target.klineList || target.list || target.items || [];
      } else if (payload.respList || payload.klineList) {
        list = payload.respList || payload.klineList;
      }
      const parseTime = (value) => {
        if (value == null) return null;
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
        }
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return null;
          if (/^\d+$/.test(trimmed)) {
            const num = Number(trimmed);
            if (Number.isFinite(num)) {
              return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
            }
          }
          const parsed = Date.parse(trimmed);
          if (!Number.isNaN(parsed)) {
            return Math.floor(parsed / 1000);
          }
        }
        return null;
      };
      return (list || []).map(item => {
        if (!item) return null;
        const timeRaw = item.t || item.time || item.ts || item.timestamp || (item.raw && (item.raw.t || item.raw.time));
        const time = parseTime(timeRaw);
        const open = safeNumber(item.o ?? item.open ?? item.Open);
        const high = safeNumber(item.h ?? item.high ?? item.High);
        const low = safeNumber(item.l ?? item.low ?? item.Low);
        const close = safeNumber(item.c ?? item.close ?? item.Close);
        const volume = safeNumber(item.v ?? item.volume ?? item.Volume);
        const hasValidTime = typeof time === 'number' && Number.isFinite(time);
        if (open == null || high == null || low == null || close == null || !hasValidTime) {
          return null;
        }
        return {
          time,
          open,
          high,
          low,
          close,
          volume: volume != null ? volume : 0
        };
      }).filter(Boolean);
    },

    ensureChronological(candles) {
      if (!Array.isArray(candles) || candles.length <= 1) return candles || [];
      const sorted = candles.slice().sort((a, b) => a.time - b.time);
      const deduped = [];
      for (let i = 0; i < sorted.length; i++) {
        const bar = sorted[i];
        if (!deduped.length || deduped[deduped.length - 1].time !== bar.time) {
          deduped.push(bar);
        }
      }
      return deduped;
    },

    getCacheKey(frame) {
      const symbol = (this._symbol || DEFAULT_SYMBOL || 'SYMBOL').toUpperCase();
      return `${symbol}__${frame || this.data.timeframe || '1m'}`;
    },

    applyCachedCandles(frame, opts) {
      const options = opts || {};
      if (!this._candleCache) return false;
      const cache = this._candleCache[this.getCacheKey(frame)];
      if (!cache || !cache.data || !cache.data.length) return false;
      if (options.requireFresh && (Date.now() - cache.fetchedAt) > CANDLE_CACHE_TTL) return false;
      this._candles = cache.data;
      this.applySeriesData(cache.data);
      this.updateStatsFromCandle(cache.data[cache.data.length - 1] || null);
      return true;
    },

    resetChartSeries() {
      this._candles = [];
      if (this._series) {
        try {
          this._series.setData([]);
        } catch (err) {
          console.warn('[chart-detail] resetChartSeries clear failed', err);
        }
      }
      this.updateStatsFromCandle(null);
    },

    sanitizeSeriesData(candles) {
      if (!Array.isArray(candles) || !candles.length) return [];
      const sanitized = [];
      let previousTime = null;
      for (let i = 0; i < candles.length; i++) {
        const bar = candles[i];
        if (!bar) continue;
        const timeValue = safeNumber(bar.time);
        const open = safeNumber(bar.open);
        const high = safeNumber(bar.high);
        const low = safeNumber(bar.low);
        const close = safeNumber(bar.close);
        const volume = safeNumber(bar.volume);
        if (timeValue == null || open == null || high == null || low == null || close == null) continue;
        const time = Math.floor(timeValue);
        if (!Number.isFinite(time)) continue;
        if (previousTime != null && time <= previousTime) continue;
        const hi = Math.max(open, high, low, close);
        const lo = Math.min(open, high, low, close);
        sanitized.push({
          time,
          open,
          high: hi,
          low: lo,
          close,
          volume: volume != null ? volume : 0
        });
        previousTime = time;
      }
      return sanitized;
    },

    applySeriesData(seriesData) {
      if (!this._series) return;
      if (!Array.isArray(seriesData) || !seriesData.length) {
        try {
          this._series.setData([]);
        } catch (err) {
          console.warn('[chart-detail] applySeriesData clear failed', err);
        }
        return;
      }
      try {
        this._series.setData(seriesData);
      } catch (err) {
        console.warn('[chart-detail] setData failed, retrying with trimmed payload', err);
        const fallback = seriesData
          .filter(bar => bar && typeof bar.time === 'number' && Number.isFinite(bar.time) && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
          .slice(-180);
        if (!fallback.length) return;
        try {
          this._series.setData(fallback);
        } catch (err2) {
          console.warn('[chart-detail] setData failed after fallback', err2, fallback.slice(0, 5));
        }
      }
    },

    updateStatsFromCandle(bar) {
      if (!bar) {
        ['cd-open','cd-close','cd-high','cd-low','cd-high-card','cd-low-card','cd-volume'].forEach(id => setText(id, '--'));
        return;
      }
      setText('cd-open', this.formatWithPrecision(bar.open));
      setText('cd-close', this.formatWithPrecision(bar.close));
      setText('cd-high', this.formatWithPrecision(bar.high));
      setText('cd-low', this.formatWithPrecision(bar.low));
      setText('cd-high-card', this.formatWithPrecision(bar.high));
      setText('cd-low-card', this.formatWithPrecision(bar.low));
      setText('cd-volume', bar.volume ? bar.volume.toFixed(2) : '--');
    },

    pickSymbolEntry(payload) {
      if (!payload) return null;
      const matchSymbol = (item) => {
        if (!item) return false;
        const code = item.code || item.symbol || item.s;
        return code ? code.toUpperCase() === this._symbol.toUpperCase() : false;
      };
      if (Array.isArray(payload)) {
          return payload.find(matchSymbol) || payload[0] || null;
      }
      if (payload.items && Array.isArray(payload.items)) {
        return payload.items.find(matchSymbol) || payload.items[0] || null;
      }
      if (payload.list && Array.isArray(payload.list)) {
        return payload.list.find(matchSymbol) || payload.list[0] || null;
      }
      if (payload.respList && Array.isArray(payload.respList)) {
        return payload.respList.find(matchSymbol) || payload.respList[0] || null;
      }
      return null;
    },

    updateMarketPill(text) {
      const el = document.getElementById('cd-market-pill');
      if (!el) return;
      el.textContent = text || 'Realtime';
    },

    handleTimeframeTap(e) {
      try {
        const frame = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.frame) || (e && e.target && e.target.dataset && e.target.dataset.frame);
        if (!frame || frame === this.data.timeframe) return;
        this.setData({ timeframe: frame });
        const buttons = document.querySelectorAll('.timeframe-btn');
        buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.frame === frame));
        const servedFromCache = this.applyCachedCandles(frame, { requireFresh: false });
        if (!servedFromCache) {
          this.updateMarketPill('Loading');
        }
        this.refreshCandles({ frame, force: true, preferCache: false, forceApply: true });
      } catch (err) {
        console.warn('[chart-detail] handleTimeframeTap failed', err);
      }
    },

    handleNavigateBack() {
      if (window.wx && typeof window.wx.navigateBack === 'function') {
        window.wx.navigateBack();
        return;
      }
      window.history.back();
    },

    handleBuyLong() {
      this.navigateToTrades('long');
    },

    handleSellShort() {
      this.navigateToTrades('short');
    },

    navigateToTrades(side) {
      try {
        const intent = {
          symbol: this._symbol,
          side: side,
          ts: Date.now()
        };
        sessionStorage.setItem('__chart_trade_intent', JSON.stringify(intent));
      } catch(_) {}
      const url = `../webapp.html?tab=trades&symbol=${encodeURIComponent(this._symbol)}&side=${side}`;
      if (window.wx && typeof window.wx.redirectTo === 'function') {
        window.wx.redirectTo({ url });
      } else {
        window.location.href = url;
      }
    }
  });
})();
