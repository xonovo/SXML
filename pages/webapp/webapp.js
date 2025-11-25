// webapp 页面逻辑 - 对应复杂版页面结构（轮播/功能入口/资金页等）
console.log('========================================');
console.log('🚀 webapp.js 脚本已加载');
console.log('========================================');

const FOREX_CODES = ['AUD', 'CAD', 'CHF', 'CNH', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'MXN', 'NOK', 'NZD', 'SEK', 'SGD', 'USD', 'ZAR'];
const PRIME_CACHE_KEY = 'webapp:prime-cache:v1';
const PRIME_CACHE_TTL = 5 * 60 * 1000; // 5 分钟以内的 Priming 数据视为有效
const PRIME_CACHE_LIMIT = 20;
const COLOR_SCHEME_STORAGE_KEY = 'webapp:color-scheme';
const DEFAULT_COLOR_SCHEME = 'oriental';
const MARKET_CLOSED_STALE_MS = 2 * 60 * 1000; // 2 分钟无更新视为休市（仅在停牌且无会话信息时兜底）
const MINUTES_IN_DAY = 24 * 60;
const MIN_ORDERBOOK_ROWS = 4;
const DEFAULT_DEPTH_LEVELS = 10;
const ORDERBOOK_ROW_CAP = 14;
const UNSUPPORTED_SYMBOL_TTL = 5 * 60 * 1000; // 5 分钟后自动重试
const ALWAYS_OPEN_SYMBOLS = new Set(['EURUSD', 'XAUUSD', 'USOIL', 'EURGBP']);
const DAILY_BASELINE_TTL = 30 * 60 * 1000; // 30 分钟内不重复拉取日线基准
const DEFAULT_MARKET_SESSION = {
  name: 'default-24x7',
  offsetMinutes: 0,
  windows: [
    { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00' }
  ]
};
const FX_24X5_SESSION = {
  name: 'forex-24x5',
  offsetMinutes: 0,
  windows: [
    { days: [1, 2, 3, 4, 5], start: '00:00', end: '24:00' }
  ]
};
const MARKET_SESSION_RULES = [
  {
    name: 'forex',
    matcher: /^[A-Z]{6}$/,
    session: FX_24X5_SESSION
  },
  {
    name: 'metals',
    matcher: /^(XAU|XAG|XPT|XPD)/,
    session: FX_24X5_SESSION
  },
  {
    name: 'energy',
    matcher: /^(USOIL|UKOIL|XTI|XBR)/,
    session: FX_24X5_SESSION
  }
];

function parseTimeToMinutes(value) {
  if (!value && value !== 0) return 0;
  if (typeof value === 'number') return value;
  if (value === '24:00') return MINUTES_IN_DAY;
  const parts = String(value).split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return (hours * 60 + minutes) % (MINUTES_IN_DAY + 1);
}

function isTimeWithinWindow(minuteOfDay, startMinutes, endMinutes) {
  if (startMinutes <= endMinutes) {
    return minuteOfDay >= startMinutes && minuteOfDay < endMinutes;
  }
  // 跨越午夜
  return minuteOfDay >= startMinutes || minuteOfDay < endMinutes;
}

function isWithinSession(session, timestamp = Date.now()) {
  if (!session || !Array.isArray(session.windows) || !session.windows.length) return true;
  const offset = session.offsetMinutes || 0;
  const local = new Date(timestamp + offset * 60 * 1000);
  const day = local.getUTCDay();
  const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();
  return session.windows.some((win) => {
    const allowedDays = Array.isArray(win.days) && win.days.length ? win.days : [0, 1, 2, 3, 4, 5, 6];
    if (!allowedDays.includes(day)) return false;
    if (win._startMinutes == null) win._startMinutes = parseTimeToMinutes(win.start || '00:00');
    if (win._endMinutes == null) win._endMinutes = parseTimeToMinutes(win.end || '24:00');
    return isTimeWithinWindow(minuteOfDay, win._startMinutes, win._endMinutes);
  });
}

function resolveSessionBySymbol(symbol) {
  const upper = (symbol || '').toUpperCase();
  if (!upper) return DEFAULT_MARKET_SESSION;
  for (let i = 0; i < MARKET_SESSION_RULES.length; i += 1) {
    const rule = MARKET_SESSION_RULES[i];
    if (rule.matcher && rule.matcher.test(upper)) {
      return rule.session || DEFAULT_MARKET_SESSION;
    }
  }
  return DEFAULT_MARKET_SESSION;
}

Page({
  data: {
    pageTitle: 'ICE Markets',
    active: 'home',
    currentLang: 'English',
    colorScheme: DEFAULT_COLOR_SCHEME,
    fundsOverview: null,
    // 充值页面数据
    depositAmount: '0',
    depositNetwork: 'ERC20'
  },

  onLoad() {
    console.log('========================================');
    console.log('🎯 webapp onLoad 开始执行');
    console.log('========================================');
    try { document.title = this.data.pageTitle || document.title; } catch (_) { }
    // 尽早从本地恢复交易日级别快照，避免重复 HTTP 请求
    try { if (window.MarketsStore && typeof window.MarketsStore.loadDailySnapshotFromStorage === 'function') { window.MarketsStore.loadDailySnapshotFromStorage(); } } catch (e) { console.warn('[dailySnapshot] load from storage failed', e); }
    // 初始化配色方案（本地缓存优先）
    try { this.initColorScheme && this.initColorScheme(); } catch (e) { console.warn('[colorScheme] init failed', e); }
    // 若存在本地缓存的 Priming 结果，优先恢复，做到“秒开”
    try { this.restorePrimeCache && this.restorePrimeCache(); } catch (e) { console.warn('[restorePrimeCache] early hydrate failed', e); }
    // 极速 Priming：在最早阶段并行拉取首批行情 (trades + candles)，减少首屏空白时间
    try { this.fastPrimeMarkets && this.fastPrimeMarkets(); } catch (e) { console.warn('[fastPrimeMarkets] early invoke failed', e); }
    // 初始化语言状态并应用
    try {
      if (window.i18n) {
        window.i18n.load(window.i18n.lang).then(() => {
          window.i18n.apply();
          this.setData({ currentLang: window.i18n.lang === 'zh-CN' ? '中文' : 'English' });
          const btn = document.querySelector('.lang-btn');
          if (btn) btn.textContent = (window.i18n.lang === 'zh-CN') ? '中文' : 'English';
        });
        window.addEventListener('i18n:ready', () => {
          try { window.i18n.apply(); } catch (_) { }
          this.setData({ currentLang: window.i18n.lang === 'zh-CN' ? '中文' : 'English' });
          const btn = document.querySelector('.lang-btn');
          if (btn) btn.textContent = (window.i18n.lang === 'zh-CN') ? '中文' : 'English';
        }, { once: true });
      }
    } catch (_) { }

    // 初始化轮播
    this.initSwiper();

    // 底部弹窗组件初始化
    this.initActionSheet();

    // 绑定首页行情跳转至图表详情
    this.bindHomeActiveNavigation();

    const initialTab = this.resolveInitialTabFromUrl();
    if (initialTab && initialTab !== this.data.active) {
      this.setData({ active: initialTab });
    }

    // 默认激活首页
    try {
      const homePage = document.querySelector('.page-home');
      if (homePage && !homePage.classList.contains('active')) homePage.classList.add('active');
    } catch (e) { console.warn('activate home failed', e); }

    // 同步 tabbar 状态
    try { this.activateTab(this.data.active || 'home'); } catch (e) { console.warn('init tab state failed', e); }

    this.consumeChartTradeIntent();

    // 资金页：创建视口并初始化高度
    try {
      this.ensureFundsViewport();
      const vp = document.querySelector('.funds-viewport');
      const active = document.querySelector('.funds-content.active');
      if (vp && active) {
        // 先用自然高度,下一帧锁定为 px，避免首帧跳变
        vp.style.height = active.offsetHeight + 'px';
        setTimeout(() => { try { vp.style.height = 'auto'; } catch (_) { } }, 0);
      }
    } catch (e) { console.warn('init funds viewport failed', e); }

    // 初始化订单簿动态条数（基于右侧操作区域高度）
    setTimeout(() => {
      try {
        this.updateOrderbookRows();
        this.observeOrderPanels();
      } catch (e) { console.warn('init orderbook failed', e); }
    }, 100);

    setTimeout(() => {
      try {
        this.initFloatingFields();
        this.initRangePickers();
        this.initSLForms();
      } catch (e) {
        console.warn('init floating fields failed', e);
      }
    }, 0);

    // 初始化子面板高度（避免第一次点击出现瞬跳）
    setTimeout(() => {
      try { this.initSubpanelHeights(); } catch (e) { console.warn('init subpanel heights failed', e); }
    }, 50);

    // 初始化滑动删除功能
    setTimeout(() => {
      try { this.initSwipeToDelete(); } catch (e) { console.warn('init swipe to delete failed', e); }
    }, 100);
    // 初始化 Markets 自选列表
    setTimeout(() => { try { this.initMarketsFavorites(); this.initMarketsQuotes(); } catch (e) { console.warn('init markets favorites/quotes failed', e); } }, 0);

    // 诊断：输出关键弹层相关方法的类型，帮助定位线上报错 "openFavoritesSheet is not a function"
    try {
      console.log('[diag] typeof openFavoritesSheet =', typeof this.openFavoritesSheet);
      console.log('[diag] typeof onSheetConfirm =', typeof this.onSheetConfirm);
      console.log('[diag] typeof onSheetCancel =', typeof this.onSheetCancel);
      // 若某方法缺失，提供兜底实现避免用户点击报错
      if (typeof this.openFavoritesSheet !== 'function') {
        this.openFavoritesSheet = () => { console.warn('[fallback] openFavoritesSheet missing, injecting noop.'); };
      }
      if (typeof this.onSheetConfirm !== 'function') {
        this.onSheetConfirm = () => { console.warn('[fallback] onSheetConfirm missing, auto-hide sheet'); try { this.hideActionSheet('confirm'); } catch (_) { } };
      }
      if (typeof this.onSheetCancel !== 'function') {
        this.onSheetCancel = () => { console.warn('[fallback] onSheetCancel missing, auto-hide sheet'); try { this.hideActionSheet('cancel'); } catch (_) { } };
      }
      // 多次尝试把方法注入到 window.currentPage，避免 inline onclick 找不到函数
      const bindFavorites = () => {
        if (typeof this.ensureFavoritesSheetBindings === 'function') {
          this.ensureFavoritesSheetBindings();
        }
      };
      bindFavorites();
      setTimeout(bindFavorites, 0);
      setTimeout(bindFavorites, 500);
    } catch (diagErr) { console.warn('[diag] favorites sheet method check failed', diagErr); }

    // 诊断：Trades 页签关键方法是否已暴露到 currentPage，避免 switchTradeTab 等报错
    try {
      const tradeMethods = [
        'switchTradeTab',
        'switchTradePanel',
        'switchLeveragedMode',
        'switchFundsTab',
        'toggleLongShort',
        'onOrderTypeSelect',
        'onStep',
        'onBuy',
        'deletePendingOrder',
        'onSymbolSwitch'
      ];
      tradeMethods.forEach((name) => {
        console.log(`[diag] typeof ${name} =`, typeof this[name]);
        if (typeof this[name] !== 'function') {
          this[name] = () => { console.warn(`[fallback] ${name} missing, ignoring click.`); };
        }
      });
      const bindTrades = () => {
        if (typeof this.ensureTradeTabBindings === 'function') {
          this.ensureTradeTabBindings();
        }
      };
      bindTrades();
      setTimeout(bindTrades, 0);
      setTimeout(bindTrades, 500);
    } catch (tradeDiagErr) {
      console.warn('[diag] trade tab method check failed', tradeDiagErr);
    }

    // 绑定首页功能入口方法（Deposit/Withdrawal等）
    try {
      const homeMethods = ['onFeature', 'showNotification', 'onDeposit', 'onWithdrawal', 'closeDepositPage', 'onDepositKeyTap', 'onDepositShortcut', 'onSelectNetwork', 'onDepositSubmit', 'handleNetworkSelect'];
      homeMethods.forEach((name) => {
        console.log(`[diag] typeof ${name} =`, typeof this[name]);
        if (typeof this[name] !== 'function') {
          this[name] = () => { console.warn(`[fallback] ${name} missing, ignoring click.`); };
        }
      });
      const bindHome = () => {
        if (typeof this.ensureGlobalMethodBindings === 'function') {
          this.ensureGlobalMethodBindings(homeMethods, 'home');
        } else {
          // Fallback: 手动绑定到全局
          if (typeof window !== 'undefined' && window.currentPage) {
            homeMethods.forEach(name => {
              if (typeof this[name] === 'function') {
                window.currentPage[name] = this[name].bind(this);
              }
            });
          }
        }
      };
      bindHome();
      setTimeout(bindHome, 0);
      setTimeout(bindHome, 500);
    } catch (homeDiagErr) {
      console.warn('[diag] home method check failed', homeDiagErr);
    }

    // 初始化 Infoway HTTP 数据通道（仅在用户已登录时）
    setTimeout(() => {
      try {
        // 统一鉴权检测：尝试解析账号 + apiKey 来源，并输出诊断
        const authDiag = this.getAuthState ? this.getAuthState() : null;
        let hasAuth = false;
        if (authDiag && authDiag.isAuthenticated) {
          hasAuth = true;
        } else {
          // 回退旧逻辑: 仅凭存储存在判断
          hasAuth = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('k')) ||
            (localStorage && localStorage.getItem && localStorage.getItem('apiKey'));
        }
        if (hasAuth) {
          console.log('[onLoad] 用户已登录，初始化 Infoway HTTP 数据', authDiag ? authDiag : '(legacy detection)');
          try {
            // 若解析到凭证，提前挂到实例，供后续 Infoway / Markets 复用
            if (authDiag && authDiag.apiKey) this._loginApiKey = authDiag.apiKey;
            if (authDiag && authDiag.userAccount) this._loginUserAccount = authDiag.userAccount;
          } catch (_) { }
          this.initInfowayData();
        } else {
          console.log('[onLoad] 用户未登录，进入 Guest 行情模式：启动 Priming 重试调度');
          if (typeof this.scheduleGuestPriming === 'function') {
            this.scheduleGuestPriming();
          } else {
            // Fallback: 旧版本缺少 scheduleGuestPriming 时直接做简易多次尝试
            console.warn('[guestPrime:fallback] scheduleGuestPriming 未定义，执行简易 Priming 重试');
            const maxTries = 5;
            let tries = 0;
            const attempt = async () => {
              tries++;
              console.log(`[guestPrime:fallback] attempt ${tries}/${maxTries}`);
              try {
                const client = await this.ensureInfowayHttpClient();
                if (!client) {
                  if (tries < maxTries) return setTimeout(attempt, tries * 500);
                  console.warn('[guestPrime:fallback] 放弃，InfowayHttp 未就绪');
                  return;
                }
                try { await this.refreshHomeMostActive(true); } catch (e) { console.warn('[guestPrime:fallback] refreshHomeMostActive failed', e); }
                try { await this.refreshTradeSymbol(this._activeSymbol || this._defaultSymbol, { silent: true, skipSymbolSave: true }); } catch (e) { console.warn('[guestPrime:fallback] refreshTradeSymbol failed', e); }
                console.log('[guestPrime:fallback] Priming 完成');
              } catch (err) {
                console.warn('[guestPrime:fallback] 未知错误', err);
                if (tries < maxTries) setTimeout(attempt, tries * 500);
              }
            };
            attempt();
          }
        }
      } catch (e) {
        console.warn('init Infoway data failed', e);
      }
    }, 0);

    // 页面前后台状态监听：确保从后台回到前台时自动检查并恢复行情 WebSocket
    try {
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          try { this.onAppResume && this.onAppResume(); } catch (err) { console.warn('[visibilitychange:onAppResume] failed', err); }
        }
      };
      document.removeEventListener('visibilitychange', this._boundVisibilityHandler || handleVisibility);
      document.addEventListener('visibilitychange', handleVisibility);
      this._boundVisibilityHandler = handleVisibility;

      const handleFocus = () => {
        try { this.onAppResume && this.onAppResume(); } catch (err) { console.warn('[focus:onAppResume] failed', err); }
      };
      window.removeEventListener('focus', this._boundFocusHandler || handleFocus);
      window.addEventListener('focus', handleFocus);
      this._boundFocusHandler = handleFocus;
    } catch (evtErr) {
      console.warn('[onLoad] 注册前后台监听失败', evtErr);
    }
  },

  // 极速启动 Priming：不等待 WS ready 与后续复杂初始化，直接并行获取首批行情数据
  fastPrimeMarkets() {
    if (this._fastPrimed) return;
    this._fastPrimed = true;
    try { performance.mark && performance.mark('fastPrime:start'); } catch (_) { }
    const favorites = this.getMarketsFavorites && this.getMarketsFavorites();
    const allSymbols = (this._marketsAllSymbols || []).map(s => s.value);
    const primeSymbols = (Array.isArray(favorites) && favorites.length ? favorites : allSymbols).slice(0, 10);
    if (!primeSymbols.length) return;
    console.log('[fastPrimeMarkets] start for symbols:', primeSymbols);
    this.ensureInfowayHttpClient().then(client => {
      if (!client) { console.warn('[fastPrimeMarkets] no http client'); return; }
      const business = 'common'; // 当前示例品种均归类 common
      // 分批控制速率: 超过 6 个拆成两批
      const batchLimit = 6;
      const batches = [];
      for (let i = 0; i < primeSymbols.length; i += batchLimit) batches.push(primeSymbols.slice(i, i + batchLimit));
      const timeframes = [1, 5, 15, 60]; // 1m/5m/15m/1h 多周期 K 线，便于后续切换
      const batchRequests = [];
      batches.forEach((symBatch, bi) => {
        // Trades
        batchRequests.push(this._withTimeout(client.getTrades(symBatch, { business }), 3000).then(v => ({ kind: 'trades', batch: bi, data: v })).catch(e => ({ kind: 'trades', batch: bi, error: e })));
        // Multi-timeframe candles
        timeframes.forEach(tf => {
          batchRequests.push(this._withTimeout(client.getCandles({ symbols: symBatch.join(','), klineType: tf, klineNum: 2 }, { business }), 3000).then(v => ({ kind: 'candles', tf, batch: bi, data: v })).catch(e => ({ kind: 'candles', tf, batch: bi, error: e })));
        });
      });
      return Promise.allSettled(batchRequests).then(results => {
        results.forEach(r => {
          if (r.status !== 'fulfilled') return;
          const payload = r.value;
          if (!payload) return;
          if (payload.kind === 'trades' && Array.isArray(payload.data)) {
            try { if (window.MarketsStore && window.MarketsStore.primeQuotesFromTrades) { window.MarketsStore.primeQuotesFromTrades(payload.data); } } catch (_) { }
            payload.data.forEach(entry => {
              if (entry && entry.s && entry.p && entry.p !== 0) {
                const q = { s: entry.s, last: Number(entry.p), p: Number(entry.p) };
                this.applyMarketsQuote && this.applyMarketsQuote(q);
              }
            });
          } else if (payload.kind === 'candles' && Array.isArray(payload.data)) {
            payload.data.forEach(entry => {
              if (!entry || !entry.s || !entry.respList || !entry.respList.length) return;
              const latest = entry.respList[0];
              const quote = { s: entry.s, c: latest.c, last: parseFloat(latest.c), t: Number(latest.t) || Date.now() };
              this.applyMarketsQuote && this.applyMarketsQuote(quote);
              try {
                if (window.MarketsStore && window.MarketsStore.primeKlinesFromHttp) {
                  const normalizeTf = window.MarketsStore.normalizeTimeframeKey || (tf => (typeof tf === 'number' ? tf + 'm' : (tf || '1m')));
                  const key = normalizeTf(payload.tf || entry.ty || entry.frame || 1);
                  window.MarketsStore.primeKlinesFromHttp(entry.s, entry.respList, key);
                }
              } catch (_) { }
            });
          }
        });
        try {
          performance.mark && performance.mark('fastPrime:end'); performance.measure && performance.measure('fastPrime:duration', 'fastPrime:start', 'fastPrime:end');
          const measure = performance.getEntriesByName && performance.getEntriesByName('fastPrime:duration');
          if (measure && measure.length) console.log('[fastPrimeMarkets] duration(ms)=', measure[measure.length - 1].duration);
        } catch (_) { }
        // 渲染首页最活跃区域（若已有 DOM）
        try { this.renderHomeActiveRows && this.renderHomeActiveRows(this._homeActiveSymbols || {}); } catch (_) { }
        try { this.persistPrimeCache && this.persistPrimeCache(); } catch (_) { }
      }).finally(() => {
        try { this.primeDailyPrevClose && this.primeDailyPrevClose(primeSymbols, { business }); } catch (dailyErr) { console.warn('[fastPrimeMarkets] daily baseline failed', dailyErr); }
      });
    }).catch(err => { console.warn('[fastPrimeMarkets] failed', err); });
  },

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('timeout ' + ms + 'ms')); }, ms);
      promise.then(v => { clearTimeout(timer); resolve(v); }).catch(e => { clearTimeout(timer); reject(e); });
    });
  },

  restorePrimeCache() {
    if (this._primeCacheHydrated) return;
    this._primeCacheHydrated = true;
    try {
      if (typeof window === 'undefined' || !window.localStorage || typeof localStorage.getItem !== 'function') return;
      const raw = localStorage.getItem(PRIME_CACHE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload || !payload.quotes || typeof payload.quotes !== 'object') return;
      const age = Date.now() - (payload.timestamp || 0);
      if (payload.timestamp && age > PRIME_CACHE_TTL) {
        console.log('[primeCache] cached data expired, skip restore');
        return;
      }
      const entries = Object.entries(payload.quotes).slice(0, PRIME_CACHE_LIMIT);
      entries.forEach(([sym, snapshot]) => {
        if (!sym || !snapshot) return;
        const quote = Object.assign({ s: sym }, snapshot);
        try { this.applyMarketsQuote && this.applyMarketsQuote(quote); } catch (_) { }
      });
      if (entries.length) {
        console.log('[primeCache] restored quotes from cache:', entries.map(([s]) => s));
      }
    } catch (err) {
      console.warn('[primeCache] restore failed', err);
    }
  },

  _schedulePrimeCacheSave() {
    if (this._primeCacheTimer) return;
    this._primeCacheTimer = setTimeout(() => {
      this._primeCacheTimer = null;
      try { this.persistPrimeCache && this.persistPrimeCache(); } catch (e) { console.warn('[primeCache] persist failed', e); }
    }, 800);
  },

  persistPrimeCache() {
    try {
      if (typeof window === 'undefined' || !window.localStorage || typeof localStorage.setItem !== 'function') return;
      const source = this._marketsLiveQuotes || {};
      const entries = Object.keys(source)
        .filter(sym => {
          const q = source[sym];
          return q && Number.isFinite(q.last);
        })
        .map(sym => [sym, source[sym]])
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(0, PRIME_CACHE_LIMIT);
      if (!entries.length) return;
      const payload = {
        timestamp: Date.now(),
        quotes: {}
      };
      entries.forEach(([sym, q]) => {
        payload.quotes[sym] = {
          last: q.last,
          prev: q.prev,
          diff: q.diff,
          pct: q.pct,
          updatedAt: q.updatedAt
        };
      });
      localStorage.setItem(PRIME_CACHE_KEY, JSON.stringify(payload));
      console.log('[primeCache] persisted symbols:', Object.keys(payload.quotes));
    } catch (err) {
      console.warn('[primeCache] persist error', err);
    }
  },

  initColorScheme() {
    let scheme = DEFAULT_COLOR_SCHEME;
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
        if (saved === 'western' || saved === 'oriental') scheme = saved;
      }
    } catch (_) { }
    this.applyColorScheme(scheme, { skipSave: true });
  },

  applyColorScheme(scheme, opts = {}) {
    const normalized = scheme === 'western' ? 'western' : 'oriental';
    this._colorScheme = normalized;
    if (typeof this.setData === 'function') {
      try { this.setData({ colorScheme: normalized }); } catch (_) { }
    }
    try {
      if (!opts.skipSave && typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, normalized);
      }
    } catch (_) { }
    try {
      const root = document.querySelector('.webapp-root');
      if (root) {
        root.classList.remove('scheme-oriental', 'scheme-western');
        root.classList.add('scheme-' + normalized);
      }
      const btn = document.querySelector('.scheme-toggle-btn');
      if (btn) btn.textContent = normalized === 'oriental' ? '东方配色' : '欧美配色';
    } catch (_) { }
  },

  toggleColorScheme() {
    const next = this._colorScheme === 'western' ? 'oriental' : 'western';
    this.applyColorScheme(next);
  },

  // 统一登录鉴权状态解析：提供给 onLoad 与其他模块使用
  getAuthState() {
    try {
      const state = {
        userAccount: '',
        apiKey: '',
        apiKeySource: '', // session|local|none
        accountSource: '', // session|local|none
        isAuthenticated: false
      };
      // 账号来源：优先 sessionStorage('u') 其次 localStorage('userAccount')
      try {
        const uaSession = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('u')) || '';
        const uaLocal = (localStorage && localStorage.getItem && localStorage.getItem('userAccount')) || '';
        if (uaSession) { state.userAccount = uaSession; state.accountSource = 'session'; }
        else if (uaLocal) { state.userAccount = uaLocal; state.accountSource = 'local'; }
      } catch (_) { }
      // apiKey 来源：优先 sessionStorage('k')，否则 localStorage('apiKey')（此处不解密，仅标记存在）
      try {
        const kSession = (sessionStorage && sessionStorage.getItem && sessionStorage.getItem('k')) || '';
        const kLocalCipher = (localStorage && localStorage.getItem && localStorage.getItem('apiKey')) || '';
        if (kSession) { state.apiKey = kSession; state.apiKeySource = 'session'; }
        else if (kLocalCipher) { state.apiKey = kLocalCipher; state.apiKeySource = 'local(cipher)'; }
      } catch (_) { }
      state.isAuthenticated = !!(state.userAccount && state.apiKey);
      return state;
    } catch (err) {
      console.warn('[getAuthState] 解析失败', err);
      return { isAuthenticated: false };
    }
  },

  // Guest 行情 Priming 重试：解决初始阶段 InfowayHttp / 配置尚未加载导致的请求缺失
  scheduleGuestPriming() {
    if (this._infowayGuestPrimed) return;
    const maxTries = 5;
    if (!this._guestPrimeTries) this._guestPrimeTries = 0;
    this._guestPrimeTries++;
    const attempt = this._guestPrimeTries;
    const delay = attempt === 1 ? 0 : attempt * 500; // 0,500,1000,...
    console.log(`[guestPrime] attempt ${attempt}/${maxTries} (delay=${delay}ms)`);
    setTimeout(async () => {
      try {
        const client = await this.ensureInfowayHttpClient();
        if (!client) {
          console.log('[guestPrime] InfowayHttp 尚未就绪，等待后续重试');
          if (this._guestPrimeTries < maxTries) return this.scheduleGuestPriming();
          console.warn('[guestPrime] 超过最大重试次数，放弃 HTTP Priming，仅依赖 WebSocket');
          return;
        }
        console.log('[guestPrime] InfowayHttp 就绪，执行首页与交易品种 Priming');
        try { await this.refreshHomeMostActive(true); } catch (e) { console.warn('[guestPrime] refreshHomeMostActive failed', e); }
        try { await this.refreshTradeSymbol(this._activeSymbol || this._defaultSymbol, { silent: true, skipSymbolSave: true }); } catch (e) { console.warn('[guestPrime] refreshTradeSymbol failed', e); }
        this._infowayGuestPrimed = true;
        console.log('[guestPrime] Priming 完成');
      } catch (err) {
        console.warn('[guestPrime] 未知错误', err);
        if (this._guestPrimeTries < maxTries) this.scheduleGuestPriming(); else console.warn('[guestPrime] 放弃重试');
      }
    }, delay);
  },

  ensureFundsViewport() {
    try {
      const fundsPage = document.querySelector('.page-funds');
      if (!fundsPage) return;
      if (fundsPage.querySelector('.funds-viewport')) return; // already present
      const tabs = fundsPage.querySelector('.funds-tabs');
      const contents = fundsPage.querySelectorAll('.funds-content');
      if (!tabs || !contents.length) return;
      const vp = document.createElement('div');
      vp.className = 'funds-viewport';
      // 插入到 tabs 后面
      tabs.insertAdjacentElement('afterend', vp);
      contents.forEach(c => vp.appendChild(c));
      // 移除所有 inline display:none，交由 CSS/JS 控制
      vp.querySelectorAll('.funds-content').forEach(c => { try { c.style.removeProperty('display'); } catch (_) { } });
      // 设定初始高度
      const active = vp.querySelector('.funds-content.active') || vp.querySelector('.funds-content');
      if (active) vp.style.height = active.offsetHeight + 'px';
    } catch (_) { }
  },

  async toggleLanguage() {
    try {
      if (!window.i18n) return;
      const next = window.i18n.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
      await window.i18n.setLang(next);
      this.setData({ currentLang: next === 'zh-CN' ? '中文' : 'English' });
      const btn = document.querySelector('.lang-btn');
      if (btn) btn.textContent = (next === 'zh-CN') ? '中文' : 'English';
    } catch (e) { console.warn('toggleLanguage failed', e); }
  },

  showNotification() {
    try { (window.ShowToast || console.log)('通知'); } catch (_) { }
  },

  onFeature(e) {
    const key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key;
    if (!key) return;
    switch (key) {
      case 'deposit':
        return this.onDeposit();
      case 'withdrawal':
        return this.onWithdrawal();
      default:
        console.log('feature click:', key);
    }
  },

  resolveUserAccount() {
    try {
      if (this._loginUserAccount) return String(this._loginUserAccount).trim();
    } catch (_) { }
    try {
      if (localStorage && typeof localStorage.getItem === 'function') {
        const fromStorage = localStorage.getItem('userAccount');
        if (fromStorage) return fromStorage.trim();
      }
    } catch (_) { }
    try {
      if (sessionStorage && typeof sessionStorage.getItem === 'function') {
        const legacy = sessionStorage.getItem('USERINFO');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed && parsed.userAccount) return String(parsed.userAccount).trim();
        }
      }
    } catch (_) { }
    return '';
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.activateTab(tab);
  },

  activateTab(tab) {
    if (!tab) return;
    this.setData({ active: tab });
    try {
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(t => t.classList.toggle('tab-active', t.dataset.tab === tab));
    } catch (_) { }
    try {
      const wrapper = document.querySelector('.pages-wrapper');
      if (wrapper) {
        const map = { home: 0, markets: 1, trades: 2, funds: 3 };
        const idx = map[tab] || 0;
        wrapper.style.transform = `translateX(-${idx * 25}%)`;
      }
    } catch (_) { }
    this.updateTradeFundsToggle(tab);
    // 进入 Trades 页面时并行获取 Capital / Leveraged 可用余额
    if (tab === 'trades') {
      const symbol = this._activeSymbol || this._defaultSymbol;
      if (symbol) {
        Promise.all([
          this.fetchTradeAvailable && this.fetchTradeAvailable(0, symbol),
          this.fetchTradeAvailable && this.fetchTradeAvailable(1, symbol)
        ]).then(() => {
          try { this.updateTradeMetricsUI(); this.refreshAvailableLimitsForAll(); } catch (e) { console.warn('update trade metrics after fetch failed', e); }
        });
      }
      // 兜底：若500ms内 HTTP candle 未返回，用全局缓存构造快照
      setTimeout(() => {
        try { this.ensureTradeSnapshotFromStore && this.ensureTradeSnapshotFromStore(); } catch (e) { console.warn('ensureTradeSnapshotFromStore trigger failed', e); }
      }, 500);
    }
    if (tab === 'funds') {
      try { this.fetchFundsOverview && this.fetchFundsOverview(); } catch (err) { console.warn('fetchFundsOverview failed to start', err); }
    }
  },

  updateTradeFundsToggle(tab) {
    if (tab !== 'trades' && tab !== 'funds') return;
    try {
      const toggles = document.querySelectorAll('.trade-funds-toggle');
      toggles.forEach(toggle => {
        const buttons = toggle.querySelectorAll('.tf-switch');
        buttons.forEach(btn => {
          const target = btn.dataset.target;
          if (!target) return;
          btn.classList.toggle('active', target === tab);
        });
      });
    } catch (_) { }
  },

  switchTradeFundsPage(e) {
    const target = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.target;
    if (!target) return;
    this.activateTab(target);
  },

  switchFundsTab(e) {
    const type = e.currentTarget.dataset.type;
    const tabs = document.querySelectorAll('.funds-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));
    this.ensureFundsViewport();
    const vp = document.querySelector('.funds-viewport');
    const views = document.querySelectorAll('.funds-content');
    const next = document.querySelector('.funds-content.funds-' + type);
    const prev = document.querySelector('.funds-content.active');
    if (prev === next) return;

    // 锁定当前高度为 px，准备过渡
    let fromH = 0;
    try { fromH = (vp && (vp.clientHeight || vp.offsetHeight)) || (prev && prev.offsetHeight) || 0; } catch (_) { }
    if (vp && fromH) vp.style.height = fromH + 'px';

    // 让上一个视图平滑离场
    if (prev) {
      prev.classList.remove('active');
      prev.classList.add('leaving');
      const cleanup = (ev) => {
        try {
          if (ev && ev.target !== prev) return;
          prev.classList.remove('leaving');
          prev.removeEventListener('transitionend', cleanup);
        } catch (_) { }
      };
      try { prev.addEventListener('transitionend', cleanup); } catch (_) { }
    }

    // 进入新视图
    if (next) {
      next.classList.add('active');
      try { next.style.removeProperty('display'); } catch (_) { }
    }

    // 下一帧测量目标高度并过渡
    requestAnimationFrame(() => {
      try {
        if (!vp || !next) return;
        const toH = next.offsetHeight;
        // 强制回流再设置，确保过渡触发
        void vp.offsetHeight;
        vp.style.height = toH + 'px';
        const done = () => {
          try { vp.style.height = 'auto'; vp.removeEventListener('transitionend', done); } catch (_) { }
        };
        vp.addEventListener('transitionend', done);
      } catch (_) { }
    });
  },


  fetchFundsOverview(options = {}) {
    if (this._fundsRequest && !options.force) return this._fundsRequest;
    this._fundsRequest = (async () => {
      try {
        const userAccount = this.resolveUserAccount();
        if (!userAccount) return null;
        if (!window.superAPI) {
          try { window.superAPI = typeof createSuperAPI === 'function' ? createSuperAPI() : window.superAPI; } catch (_) { }
        }
        if (!window.superAPI || typeof window.superAPI.request !== 'function') return null;
        const resp = await window.superAPI.request('I00003', { userAccount });
        if (resp) {
          this._fundsOverview = resp;
          try { this.setData({ fundsOverview: resp }); } catch (_) { }
          this.updateFundsOverviewUI(resp);
        }
        return resp;
      } catch (err) {
        console.warn('fetchFundsOverview failed', err);
        return null;
      } finally {
        this._fundsRequest = null;
      }
    })();
    return this._fundsRequest;
  },

  updateFundsOverviewUI(data) {
    try {
      const payload = data || this._fundsOverview;
      if (!payload) return;
      const formatAmount = (val, digits = 2) => {
        const num = Number(val);
        if (!Number.isFinite(num)) return '--';
        return num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
      };
      const formatSigned = (val, digits = 2) => {
        const num = Number(val);
        if (!Number.isFinite(num)) return '--';
        const prefix = num > 0 ? '+' : num < 0 ? '-' : '';
        const abs = Math.abs(num);
        return `${prefix}${abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
      };
      const formatPercent = (val) => {
        const num = Number(val);
        if (!Number.isFinite(num)) return '--';
        return `${num.toFixed(2)}%`;
      };
      const marginPercent = formatPercent(payload.marginLevel);
      const signedProfit = formatSigned(payload.openPositionPL);
      const profitDisplay = signedProfit === '--' ? '--' : `${signedProfit} USDT`;
      const values = {
        totalAsset: formatAmount(payload.totalAsset),
        totalAssetApprox: formatAmount(payload.totalAsset),
        capitalBalance: formatAmount(payload.accountBalance),
        accountNumber: payload.userAccount || this.resolveUserAccount() || '--',
        walletBalance: formatAmount(payload.walletBalance),
        profitLoss: formatSigned(payload.openPositionPL),
        netWorth: formatAmount(payload.equity),
        marginLevel: marginPercent,
        credit: formatAmount(payload.credit),
        availableMargin: formatAmount(payload.freeMargin),
        levTotalAsset: formatAmount(payload.totalAsset),
        levTotalAssetApprox: formatAmount(payload.totalAsset),
        profitValue: profitDisplay,
        collateral: formatAmount(payload.credit),
        leverageRatio: marginPercent,
        leverageRatioStat: marginPercent,
        totalLiabilities: formatAmount(payload.borrowed),
        totalLiabilitiesApprox: formatAmount(payload.borrowed),
        accountEquity: formatAmount(payload.equity),
        accountEquityApprox: formatAmount(payload.equity)
      };
      const nodes = document.querySelectorAll('[data-funds-field]');
      nodes.forEach(node => {
        const field = node.dataset && node.dataset.fundsField;
        if (!field || !(field in values)) return;
        node.textContent = values[field];
      });
    } catch (err) {
      console.warn('updateFundsOverviewUI failed', err);
    }
  },
  openDepositSheet() {
    try {
      if (typeof this.openActionSheet !== 'function') {
        console.warn('openDepositSheet skipped: openActionSheet unavailable');
        return;
      }
      const t = (key, fallback) => (window.i18n && window.i18n.t) ? window.i18n.t(key, fallback) : fallback;
      const options = [
        {
          value: 'usdt-onchain',
          labelKey: 'webapp.deposit.options.usdt.label',
          label: 'USDT On-chain deposit',
          descKey: 'webapp.deposit.options.usdt.desc',
          desc: 'TRC20 / ERC20 | realtime settlement | zero handling fee',
          icon: '../../images/app_coin_day.png',
          iconAltKey: 'webapp.deposit.options.usdt.iconAlt',
          iconAlt: 'USDT',
          metaKey: 'webapp.deposit.options.usdt.meta',
          meta: 'Recommended'
        },
        {
          value: 'bank-transfer',
          labelKey: 'webapp.deposit.options.bank.label',
          label: 'Bank transfer',
          descKey: 'webapp.deposit.options.bank.desc',
          desc: 'Support HK / SG accounts | credited within 2 hours',
          icon: '../../images/app_bank_day.png',
          iconAltKey: 'webapp.deposit.options.bank.iconAlt',
          iconAlt: 'Bank transfer',
          metaKey: 'webapp.deposit.options.bank.meta',
          meta: 'Manual review'
        }
      ];
      const title = t('webapp.deposit.sheet.title', 'Select a funding channel');
      const subtitle = t('webapp.deposit.sheet.subtitle', 'Please choose how you would like to deposit');
      this.openActionSheet({
        mode: 'menu',
        theme: 'light',
        titleKey: 'webapp.deposit.sheet.title',
        title,
        subtitleKey: 'webapp.deposit.sheet.subtitle',
        subtitle,
        hideActions: true,
        options,
        onSelect: (option) => this.handleDepositChannelSelect(option)
      });
    } catch (err) {
      console.warn('openDepositSheet failed', err);
    }
  },
  handleDepositChannelSelect(option) {
    try {
      if (!option || !option.value) return;
      
      // 打开内嵌的充值页面
      this.openDepositPage();
    } catch (err) {
      console.warn('handleDepositChannelSelect failed', err);
    }
  },
  openWithdrawalSheet() {
    try {
      if (typeof this.openActionSheet !== 'function') {
        console.warn('openWithdrawalSheet skipped: openActionSheet unavailable');
        return;
      }
      const t = (key, fallback) => (window.i18n && window.i18n.t) ? window.i18n.t(key, fallback) : fallback;
      const options = [
        {
          value: 'crypto-wallet',
          labelKey: 'webapp.withdrawal.options.crypto.label',
          label: 'Withdraw to crypto wallet',
          descKey: 'webapp.withdrawal.options.crypto.desc',
          desc: 'Safer and more reliable when depositing into ICE wallet using cryptocurrency',
          icon: '../../images/app_coin_day.png',
          iconAltKey: 'webapp.withdrawal.options.crypto.iconAlt',
          iconAlt: 'Crypto wallet',
          metaKey: 'webapp.withdrawal.options.crypto.meta',
          meta: 'Fast'
        },
        {
          value: 'bank-card',
          labelKey: 'webapp.withdrawal.options.bank.label',
          label: 'Withdraw to bank card',
          descKey: 'webapp.withdrawal.options.bank.desc',
          desc: 'Manual service through bank',
          icon: '../../images/app_bank_day.png',
          iconAltKey: 'webapp.withdrawal.options.bank.iconAlt',
          iconAlt: 'Bank card',
          metaKey: 'webapp.withdrawal.options.bank.meta',
          meta: 'Manual review'
        }
      ];
      const title = t('webapp.withdrawal.sheet.title', 'Select withdrawal method');
      const subtitle = t('webapp.withdrawal.sheet.subtitle', 'Please choose how you would like to withdraw');
      this.openActionSheet({
        mode: 'menu',
        theme: 'light',
        titleKey: 'webapp.withdrawal.sheet.title',
        title,
        subtitleKey: 'webapp.withdrawal.sheet.subtitle',
        subtitle,
        hideActions: true,
        options,
        onSelect: (option) => this.handleWithdrawalChannelSelect(option)
      });
    } catch (err) {
      console.warn('openWithdrawalSheet failed', err);
    }
  },
  handleWithdrawalChannelSelect(option) {
    try {
      if (!option || !option.value) return;
      const label = (window.i18n && option.labelKey && window.i18n.t)
        ? window.i18n.t(option.labelKey, option.label || option.value)
        : (option.label || option.value);
      const lang = (window.i18n && window.i18n.lang) || 'en-US';
      const msg = lang === 'zh-CN'
        ? `已选择${label}，请根据引导完成提现`
        : `Selected ${label}, follow the guide to complete your withdrawal.`;
      if (typeof window.ShowToast === 'function') {
        window.ShowToast(msg, { icon: 'success' });
      } else {
        console.log(msg);
      }
    } catch (err) {
      console.warn('handleWithdrawalChannelSelect failed', err);
    }
  },
  // 资金页按钮处理（占位实现）
  onDeposit() {
    try {
      this.openDepositSheet();
    } catch (err) {
      console.warn('onDeposit failed', err);
    }
  },
  onWithdrawal() {
    try {
      this.openWithdrawalSheet();
    } catch (err) {
      console.warn('onWithdrawal failed', err);
    }
  },
  onDetails() { try { (window.ShowToast || console.log)('Details'); } catch (_) { } },
  onSettings() { try { (window.ShowToast || console.log)('Settings'); } catch (_) { } },
  onLoan() { try { (window.ShowToast || console.log)('Loan'); } catch (_) { } },
  onRepayment() { try { (window.ShowToast || console.log)('Repayment'); } catch (_) { } },
  onTransfer() { try { (window.ShowToast || console.log)('Transfer'); } catch (_) { } },
  onLearnLeveraged() { try { (window.ShowToast || console.log)('Learn leveraged'); } catch (_) { } },

  /* ========== Markets 页面逻辑 ========== */

  switchMarketsTab(e) {
    try {
      const type = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.type;
      if (!type) return;

      // 更新 Tab 激活状态
      const tabs = document.querySelectorAll('.markets-tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));

      // 获取 swiper 容器和 slides
      const mainSwiper = document.querySelector('.markets-main-swiper');
      const wrapper = mainSwiper && mainSwiper.querySelector('.swiper-wrapper');
      const slides = wrapper ? Array.from(wrapper.querySelectorAll('.swiper-slide')) : [];
      if (!wrapper || !slides.length) return;

      // 目前只有一个 Selection 标签，索引为 0
      const targetIndex = 0;

      // 更新 active 类
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === targetIndex);
      });

      // 触发滑动动画
      const translatePercent = -(targetIndex * 100); // 每个 slide 宽度 100%
      wrapper.style.transform = `translateX(${translatePercent}%)`;
    } catch (err) {
      console.warn('switchMarketsTab failed', err);
    }
  },

  /* ========== Markets Favorites（自选）功能 ========== */
  _marketsFavoritesKey: 'markets:favorites',
  _marketsAllSymbols: [
    {
      value: 'EURUSD',
      label: 'EURUSD',
      labelKey: 'webapp.markets.symbol.EURUSD.label',
      descKey: 'webapp.markets.symbol.EURUSD.desc',
      business: 'common',
      quoteUnit: 'USD',
      volumeUnit: 'EUR'
    },
    {
      value: 'XAUUSD',
      label: 'XAUUSD',
      labelKey: 'webapp.markets.symbol.XAUUSD.label',
      descKey: 'webapp.markets.symbol.XAUUSD.desc',
      business: 'common',
      quoteUnit: 'USD',
      volumeUnit: 'XAU'
    },
    {
      // US 原油在 Infoway 行情中的实际代码为 USOIL
      // value 用于订阅和 HTTP 请求；展示文案通过 i18n label/desc 控制
      value: 'USOIL',
      label: 'USOIL',
      labelKey: 'webapp.markets.symbol.USOIL.label',
      descKey: 'webapp.markets.symbol.USOIL.desc',
      business: 'common',
      quoteUnit: 'USD',
      volumeUnit: 'bbl'
    },
    {
      value: 'EURGBP',
      label: 'EURGBP',
      labelKey: 'webapp.markets.symbol.EURGBP.label',
      descKey: 'webapp.markets.symbol.EURGBP.desc',
      business: 'common',
      quoteUnit: 'GBP',
      volumeUnit: 'EUR'
    }
  ],
  _defaultSymbol: 'EURUSD',
  _orderbookMaxRows: 8,
  _orderbookRowHardCap: ORDERBOOK_ROW_CAP,
  _orderbookHasData: false,
  _depthLevels: DEFAULT_DEPTH_LEVELS,
  _depthSnapshots: null,
  _homeActiveSymbols: null,
  _homeRenderThrottle: null,
  _unsupportedSymbols: null,
  _dailyBaselineAt: null,
  _dailyBaselineInFlight: null,

  initMarketsFavorites() {
    try {
      const list = this.getMarketsFavorites();
      this.renderMarketsFavorites(list);
      const addBtn = document.querySelector('.markets-tabs .add-btn');
      if (addBtn && !addBtn._favBound) {
        addBtn.addEventListener('click', () => this.openFavoritesSheet());
        addBtn._favBound = true;
      }
      this.refreshMarketsQuotes();
    } catch (e) { console.warn('initMarketsFavorites failed', e); }
  },

  getMarketsFavorites() {
    try {
      const raw = localStorage.getItem(this._marketsFavoritesKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      const allowed = new Set(this._marketsAllSymbols.map(s => s.value));
      return Array.isArray(arr) ? arr.filter(v => typeof v === 'string' && allowed.has(v)) : [];
    } catch (_) { return []; }
  },

  saveMarketsFavorites(list) {
    try { localStorage.setItem(this._marketsFavoritesKey, JSON.stringify(list || [])); } catch (_) { }
  },

  setMarketsFavorites(list) {
    if (!Array.isArray(list)) return;
    const unique = Array.from(new Set(list.map(v => String(v))));
    this.saveMarketsFavorites(unique);
    this.renderMarketsFavorites(unique);
    this.refreshMarketsQuotes();
  },

  renderMarketsFavorites(list) {
    try {
      const panel = document.getElementById('markets-watchlist');
      if (!panel) return;
      const container = panel.querySelector('.watchlist-list');
      const emptyEl = panel.querySelector('.watchlist-empty');
      if (!container) return;
      if (!list || !list.length) {
        panel.dataset.state = 'empty';
        if (emptyEl) emptyEl.style.display = 'block';
        container.innerHTML = '';
        return;
      }
      panel.dataset.state = 'filled';
      if (emptyEl) emptyEl.style.display = 'none';
      const symbolsMap = this._marketsAllSymbols.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});
      const closedLabel = this.resolveClosedLabel();
      const rows = list.map(sym => {
        const meta = symbolsMap[sym] || { value: sym, label: sym, desc: sym };
        const labelText = (window.i18n && meta.labelKey && window.i18n.t) ? window.i18n.t(meta.labelKey, meta.label) : meta.label;
        const descText = (window.i18n && meta.descKey && window.i18n.t) ? window.i18n.t(meta.descKey, meta.desc || '') : (meta.desc || '');
        return `<view class="active-row" data-symbol="${meta.value}">
          <view class="symbol-info">
            <div class="symbol-top">
              <div class="symbol-name" ${meta.labelKey ? `data-i18n="${meta.labelKey}"` : ''}>${labelText}</div>
              <span class="market-closed-tag" data-i18n="webapp.market.closedLabel" hidden>${closedLabel}</span>
            </div>
            <div class="symbol-desc" ${meta.descKey ? `data-i18n="${meta.descKey}"` : ''}>${descText}</div>
          </view>
          <view class="price-info">
            <div class="price-main">--</div>
            <div class="price-change"></div>
          </view>
            <view class="percent-badge">--</view>
        </view>`;
      }).join('');
      container.innerHTML = rows;
      this.bindMarketsWatchlistNavigation(container);
      if (window.i18n && typeof window.i18n.apply === 'function') {
        try { window.i18n.apply(); } catch (_) { }
      }
      this.updateFavoritesPriceRows();
    } catch (e) { console.warn('renderMarketsFavorites failed', e); }
  },

  bindMarketsWatchlistNavigation(container) {
    try {
      const host = container || document.querySelector('#markets-watchlist .watchlist-list');
      if (!host || host._chartNavBound) return;
      host.addEventListener('click', (ev) => {
        const row = ev.target.closest('.active-row');
        if (!row) return;
        const symbol = (row.dataset && row.dataset.symbol) || (row.querySelector('.symbol-name') && row.querySelector('.symbol-name').textContent.trim());
        if (!symbol) return;
        const labelEl = row.querySelector('.symbol-name');
        const descEl = row.querySelector('.symbol-desc');
        const meta = {
          label: labelEl ? labelEl.textContent.trim() : symbol,
          desc: descEl ? descEl.textContent.trim() : ''
        };
        this.openChartDetail(symbol, meta);
      });
      host._chartNavBound = true;
    } catch (err) {
      console.warn('bindMarketsWatchlistNavigation failed', err);
    }
  },

  ensureGlobalMethodBindings(methods = [], label = 'global') {
    try {
      if (!Array.isArray(methods) || !methods.length) return;
      if (typeof window === 'undefined') return;
      const getRuntimePage = () => {
        if (window.currentPage) return window.currentPage;
        if (typeof window.getCurrentPages === 'function') {
          const pages = window.getCurrentPages();
          if (Array.isArray(pages) && pages.length) return pages[pages.length - 1];
        }
        return null;
      };
      const runtimePage = getRuntimePage();
      if (!runtimePage) return;
      methods.forEach((name) => {
        const impl = this[name];
        if (typeof impl !== 'function') return;
        const existing = runtimePage[name];
        if (existing && existing.__original === impl) return;
        const bound = impl.bind(this);
        bound.__original = impl;
        runtimePage[name] = bound;
      });
    } catch (err) {
      console.warn(`[ensureGlobalMethodBindings:${label}] failed`, err);
    }
  },

  ensureFavoritesSheetBindings() {
    try {
      const methods = ['openFavoritesSheet', 'onSheetConfirm', 'onSheetCancel'];
      if (typeof this.ensureGlobalMethodBindings === 'function') {
        this.ensureGlobalMethodBindings(methods, 'favoritesSheet');
      }
      if (typeof window !== 'undefined' && typeof window.__invokeFavoritesSheet !== 'function') {
        window.__invokeFavoritesSheet = (evt) => {
          try {
            const page = window.currentPage;
            if (page && typeof page.openFavoritesSheet === 'function') {
              return page.openFavoritesSheet(evt);
            }
            console.warn('[fallback] __invokeFavoritesSheet: method missing on currentPage');
          } catch (err) {
            console.warn('__invokeFavoritesSheet failed', err);
          }
          return false;
        };
      }
    } catch (err) {
      console.warn('ensureFavoritesSheetBindings failed', err);
    }
  },

  ensureTradeTabBindings() {
    try {
      const methods = [
        'switchTradeTab',
        'switchTradePanel',
        'switchLeveragedMode',
        'switchFundsTab',
        'toggleLongShort',
        'onOrderTypeSelect',
        'onStep',
        'onBuy',
        'deletePendingOrder',
        'onSymbolSwitch'
      ];
      if (typeof this.ensureGlobalMethodBindings === 'function') {
        this.ensureGlobalMethodBindings(methods, 'tradeTabs');
      }
    } catch (err) {
      console.warn('ensureTradeTabBindings failed', err);
    }
  },

  openFavoritesSheet() {
    try {
      const current = this.getMarketsFavorites();
      this.openActionSheet({
        mode: 'checklist',
        // 使用 i18n key 而非硬编码文本
        titleKey: 'webapp.favorites.sheet.title',
        subtitleKey: 'webapp.favorites.sheet.subtitle',
        confirmKey: 'webapp.favorites.sheet.save',
        cancelKey: 'common.cancel',
        options: this._marketsAllSymbols.slice(),
        selected: current.slice(),
        onConfirm: (selection) => {
          this.setMarketsFavorites(Array.isArray(selection) ? selection : []);
        }
      });
    } catch (e) { console.warn('openFavoritesSheet failed', e); }
  },

  /* ========== Infoway HTTP 数据桥 ========== */
  getSymbolMeta(symbol) {
    const target = symbol || this._defaultSymbol;
    const list = Array.isArray(this._marketsAllSymbols) ? this._marketsAllSymbols : [];
    const found = list.find(item => item.value === target);
    if (found) return found;
    return {
      value: target,
      label: target,
      business: 'common',
      quoteUnit: 'USD',
      volumeUnit: target
    };
  },

  initInfowayData() {
    try {
      if (this._infowayInit) return;
      this._infowayInit = true;
      let saved = '';
      try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem) {
          saved = localStorage.getItem('markets:lastSymbol') || '';
        }
      } catch (_) { }
      this._activeSymbol = saved || this._activeSymbol || this._defaultSymbol;
      this.refreshTradeSymbol(this._activeSymbol);
      this.refreshHomeMostActive();
      if (!this._symbolRefreshTimer && typeof setInterval !== 'undefined') {
        this._symbolRefreshTimer = setInterval(() => {
          this.refreshTradeSymbol(this._activeSymbol, { silent: true, skipSymbolSave: true });
        }, 30000);
      }
      if (!this._homeActiveTimer && typeof setInterval !== 'undefined') {
        this._homeActiveTimer = setInterval(() => this.refreshHomeMostActive(true), 45000);
      }
    } catch (err) {
      console.warn('initInfowayData failed', err);
    }
  },

  async ensureInfowayHttpClient() {
    try {
      if (this._infowayHttp) return this._infowayHttp;
      if (typeof window.InfowayHttp !== 'function') {
        console.warn('InfowayHttp helper 未加载');
        return null;
      }
      const api = (window.APP_CONFIG && window.APP_CONFIG.api) || {};
      const baseUrl = api.marketApiBaseUrl || api.marketHttpBaseUrl || 'https://www.ice-markets-app.com/infoway-api';
      this._infowayHttp = new window.InfowayHttp({ baseUrl, defaultBusiness: 'common' });
      return this._infowayHttp;
    } catch (err) {
      console.warn('ensureInfowayHttpClient failed', err);
      return null;
    }
  },

  // 应用从后台回到前台时的统一处理：检查行情 WS 状态并必要时重建连接与订阅
  onAppResume() {
    try {
      const now = Date.now();
      this._lastResumeAt = now;
      const socket = (window.MarketsStore && typeof window.MarketsStore.getSocket === 'function')
        ? window.MarketsStore.getSocket()
        : this._marketsSocket;

      // 若 socket 仍处于已认证且 OPEN 状态，仅同步订阅列表
      if (socket && typeof socket.isReady === 'function' && socket.isReady()) {
        console.log('[onAppResume] socket ready, sync subscriptions');
        try { this.syncMarketsSubscriptions && this.syncMarketsSubscriptions(); } catch (syncErr) { console.warn('[onAppResume] syncMarketsSubscriptions failed', syncErr); }
        return;
      }

      console.warn('[onAppResume] socket not ready, try reconnect');
      // 若有显式封装的行情初始化入口，直接调用
      if (typeof this.initMarketsDataChannel === 'function') {
        try { this.initMarketsDataChannel(); return; } catch (initErr) { console.warn('[onAppResume] initMarketsDataChannel failed', initErr); }
      }
      if (typeof this.initMarketsQuotes === 'function') {
        try { this.initMarketsQuotes(); return; } catch (initErr2) { console.warn('[onAppResume] initMarketsQuotes failed', initErr2); }
      }
      // 兜底：若存在 ensureMarketsSocket，则尝试手动重建 socket
      if (typeof this.ensureMarketsSocket === 'function' && typeof this.resolveMarketsCredentials === 'function') {
        this.resolveMarketsCredentials().then(creds => {
          if (!creds) {
            console.warn('[onAppResume] 缺少行情凭证，跳过重连');
            return;
          }
          const sock = this.ensureMarketsSocket(creds);
          if (sock && typeof this.syncMarketsSubscriptions === 'function') {
            setTimeout(() => {
              try { this.syncMarketsSubscriptions(); } catch (syncErr2) { console.warn('[onAppResume] delayed sync failed', syncErr2); }
            }, 800);
          }
        }).catch(err => {
          console.warn('[onAppResume] ensureMarketsSocket failed', err);
        });
      }
    } catch (err) {
      console.warn('[onAppResume] unexpected error', err);
    }
  },

  async refreshHomeMostActive(silent) {
    try {
      console.log('[refreshHomeMostActive] 开始刷新首页行情...');
      const client = await this.ensureInfowayHttpClient();
      if (!client) {
        console.warn('[refreshHomeMostActive] InfowayHttp 客户端未初始化');
        return;
      }
      const symbols = (this._marketsAllSymbols || []).map(item => item.value);
      console.log('[refreshHomeMostActive] 交易对列表:', symbols);
      if (!symbols.length) {
        console.warn('[refreshHomeMostActive] 交易对列表为空');
        return;
      }
      console.log('[refreshHomeMostActive] 发起 HTTP 请求...');
      const data = await client.getTrades(symbols, { business: 'common' });
      console.log('[refreshHomeMostActive] 收到响应:', data);
      const latest = {};
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (!item || !item.s || latest[item.s]) return;
          latest[item.s] = item;
        });
      }
      console.log('[refreshHomeMostActive] 解析后的行情数据:', latest);
      this._homeActiveSymbols = latest;
      // 将 HTTP 结果预热到全局 MarketsStore，让其它页面也能立即使用
      try { if (window.MarketsStore && typeof window.MarketsStore.primeQuotesFromTrades === 'function') { window.MarketsStore.primeQuotesFromTrades(data); } } catch (_) { }
      this.renderHomeActiveRows(latest);
      // 将 HTTP 返回的最活跃列表也纳入 WebSocket 订阅，确保首页能够实时更新
      try {
        var symbolsFromHttp = Object.keys(latest || {});
        if (symbolsFromHttp && symbolsFromHttp.length && window.MarketsStore && typeof window.MarketsStore.subscribe === 'function') {
          console.log('[refreshHomeMostActive] 将首页最活跃列表纳入 WS 订阅:', symbolsFromHttp);
          window.MarketsStore.subscribe(symbolsFromHttp);
        }
      } catch (e) {
        console.warn('[refreshHomeMostActive] 尝试订阅首页最活跃列表失败', e);
      }
      // 若 diff/pct 仍缺失，尝试额外拉取最近两根 1m K 线推导昨收和涨幅
      try {
        if (window.MarketsStore) {
          const needPrime = symbols.filter(sym => {
            const q = window.MarketsStore.getQuote && window.MarketsStore.getQuote(sym);
            return !q || q.pct == null || q.diff == null || q.prev == null; // 缺关键字段
          });
          if (needPrime.length) {
            console.log('[refreshHomeMostActive] 发现缺失涨幅/昨收的交易对，执行 K 线补齐:', needPrime);
            // 批量请求 (若后端支持逗号分隔)；否则逐个请求
            let candlePayload;
            try {
              candlePayload = await client.getCandles({ symbols: needPrime.join(','), klineType: 1, klineNum: 2 }, { business: 'common' });
            } catch (batchErr) {
              console.warn('[refreshHomeMostActive] 批量获取 K 线失败，回退逐个请求', batchErr);
              candlePayload = [];
              for (let i = 0; i < needPrime.length; i++) {
                const s = needPrime[i];
                try {
                  const one = await client.getCandles({ symbols: s, klineType: 1, klineNum: 2 }, { business: 'common' });
                  if (Array.isArray(one)) candlePayload = candlePayload.concat(one);
                } catch (oneErr) { console.warn('[refreshHomeMostActive] 单个获取 K 线失败', s, oneErr); }
              }
            }
            if (Array.isArray(candlePayload)) {
              candlePayload.forEach(entry => {
                if (!entry || !entry.s) return;
                const list = entry.respList || entry.klineList || [];
                if (list.length) {
                  // 指定 timeframe '1m' 以便未来多周期区分
                  try { window.MarketsStore.primeKlinesFromHttp(entry.s, list, '1m'); } catch (_) { }
                }
              });
              // 再次渲染首页，利用补齐后的 diff/pct
              this.renderHomeActiveRows(this._homeActiveSymbols);
            }
          }
        }
      } catch (kpErr) {
        console.warn('[refreshHomeMostActive] 补齐 K 线涨幅失败', kpErr);
      }
      console.log('[refreshHomeMostActive] 首页行情刷新完成');
    } catch (err) {
      // 未登录或认证失败时不显示错误
      if (err && err.message && err.message.includes('apiKey')) {
        if (!silent) console.log('[refreshHomeMostActive] 需要登录后才能获取 HTTP 行情数据');
      } else {
        console.error('[refreshHomeMostActive] 错误:', err);
        if (!silent) console.warn('refreshHomeMostActive failed', err);
      }
    }
  },

  renderHomeActiveRows(quotesMap) {
    try {

      console.log('[renderHomeActiveRows] 开始渲染, 数据:', quotesMap);
      const panel = document.querySelector('.page-home .most-active');
      if (!panel) {
        console.warn('[renderHomeActiveRows] 找不到 .page-home .most-active 容器');
        return;
      }
      const rows = panel.querySelectorAll('.active-row');
      console.log('[renderHomeActiveRows] 找到行数:', rows.length);
      rows.forEach(row => {
        const symEl = row.querySelector('.symbol-name');
        if (!symEl) return;
        const symbol = (symEl.textContent || row.dataset.symbol || '').trim();
        if (!symbol) return;
        row.dataset.symbol = symbol;
        this.updateRowClosedTag(row, symbol);
        // 统一从全局 MarketsStore 读取最新数据
        let base = null;
        try { if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') base = window.MarketsStore.getQuote(symbol); } catch (_) { }
        const priceEl = row.querySelector('.price-main');
        const changeEl = row.querySelector('.price-change');
        const pctEl = row.querySelector('.percent-badge');
        const metrics = this.buildQuoteMetrics(symbol, (base && (base.raw || base)) || null, base || {});
        const last = metrics && isFinite(metrics.last) ? metrics.last : null;
        const diff = metrics && isFinite(metrics.diff) ? metrics.diff : null;
        const pct = metrics && isFinite(metrics.pct) ? metrics.pct : null;
        if (priceEl) priceEl.textContent = isFinite(last) ? this.formatPrice(symbol, last) : '--';
        if (changeEl) {
          if (diff == null) {
            changeEl.textContent = '--';
            changeEl.classList.remove('up', 'down');
          } else {
            changeEl.textContent = (diff >= 0 ? '+' : '') + this.formatTiny(symbol, diff);
            changeEl.classList.toggle('up', diff > 0);
            changeEl.classList.toggle('down', diff < 0);
          }
        }
        if (pctEl) {
          if (pct == null) {
            pctEl.textContent = '--';
            pctEl.classList.remove('up', 'down');
          } else {
            pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
            pctEl.classList.toggle('up', pct > 0);
            pctEl.classList.toggle('down', pct < 0);
          }
        }
      });
      console.log('[renderHomeActiveRows] 渲染完成');
      // 渲染完成后尝试恢复仍为 "--" 的行（首次 Priming 未覆盖的品种，如 USOIL）
      this._scheduleHomeMissingRecovery && this._scheduleHomeMissingRecovery();
      this.bindHomeActiveNavigation();
    } catch (err) {
      console.error('[renderHomeActiveRows] 错误:', err);
      console.warn('renderHomeActiveRows failed', err);
    }
  },

  _scheduleHomeMissingRecovery() {
    if (this._homeMissingRecoverTimer) return;
    // 1 秒后执行，避免与初始 priming/WS 第一批推送竞争
    this._homeMissingRecoverTimer = setTimeout(() => {
      this._homeMissingRecoverTimer = null;
      try { this.recoverMissingHomeQuotes(); } catch (e) { console.warn('[homeMissingRecover] failed', e); }
    }, 1000);
  },

  async recoverMissingHomeQuotes() {
    try {
      const panel = document.querySelector('.page-home .most-active');
      if (!panel) return;
      const rows = Array.from(panel.querySelectorAll('.active-row'));
      if (!rows.length) return;
      const missing = [];
      rows.forEach(r => {
        const sym = (r.dataset && r.dataset.symbol) || (r.querySelector('.symbol-name') && r.querySelector('.symbol-name').textContent.trim());
        const priceEl = r.querySelector('.price-main');
        if (!sym || !priceEl) return;
        const txt = priceEl.textContent.trim();
        if (txt === '--' || txt === '0.00' || txt === '0') missing.push(sym);
      });
      if (!missing.length) return;
      const actionable = missing.filter(sym => !this.isSymbolUnsupported(sym));
      if (!actionable.length) return;
      console.log('[homeMissingRecover] 发现缺失报价的品种:', actionable);
      const client = await this.ensureInfowayHttpClient();
      if (!client) return;
      const business = 'common'; // 当前列表均归类 common
      // 先批量请求成交
      let tradesPayload = [];
      try {
        tradesPayload = await client.getTrades(actionable, { business });
      } catch (trErr) {
        console.warn('[homeMissingRecover] 批量成交失败', trErr);
        if (this.isProductMissingError(trErr)) {
          actionable.forEach(sym => this.markSymbolUnsupported(sym, trErr && trErr.message));
          return;
        }
      }
      if (Array.isArray(tradesPayload)) {
        tradesPayload.forEach(entry => {
          if (entry && entry.s && entry.p && entry.p !== 0) {
            const quote = { s: entry.s, last: Number(entry.p), p: Number(entry.p) };
            this.applyMarketsQuote(quote);
          }
        });
      }
      // 再针对仍缺失的执行单个 K 线请求
      const remaining = actionable.filter(sym => {
        const q = this._marketsLiveQuotes && this._marketsLiveQuotes[sym];
        return !(q && isFinite(q.last) && q.last !== 0);
      });
      for (let i = 0; i < remaining.length; i++) {
        const sym = remaining[i];
        try {
          const candleArr = await client.getCandles({ symbols: sym, klineType: 1, klineNum: 2 }, { business });
          if (Array.isArray(candleArr)) {
            const entry = candleArr.find(e => e && e.s === sym);
            if (entry && entry.respList && entry.respList.length) {
              const latest = entry.respList[0];
              const quote = { s: sym, c: latest.c, last: parseFloat(latest.c), t: Number(latest.t) || Date.now() };
              this.applyMarketsQuote(quote);
            }
          }
        } catch (cErr) {
          console.warn('[homeMissingRecover] 单个 K线失败', sym, cErr);
          if (this.isProductMissingError(cErr)) {
            this.markSymbolUnsupported(sym, cErr && cErr.message);
          }
        }
      }
      this.renderHomeActiveRows(this._homeActiveSymbols); // 触发刷新
    } catch (err) { console.warn('[homeMissingRecover] 过程失败', err); }
  },

  deriveHomeQuote(symbol, liveQuote, tradeQuote) {
    const base = liveQuote || {};
    const source = Object.assign({}, tradeQuote || {}, liveQuote && liveQuote.raw ? liveQuote.raw : liveQuote || {});
    const metrics = this.buildQuoteMetrics(symbol, source, base);
    if (!this._marketsLiveQuotes) this._marketsLiveQuotes = {};
    this._marketsLiveQuotes[symbol] = Object.assign({}, this._marketsLiveQuotes[symbol], metrics);
    return metrics;
  },

  buildQuoteMetrics(symbol, quote, fallback = {}) {
    const metrics = { last: null, prev: null, diff: null, pct: null };
    // 0. 若 MarketsStore 提供了交易日级快照，则优先使用其中的日级基准
    let daily = null;
    try {
      if (window.MarketsStore && typeof window.MarketsStore.getDailySnapshot === 'function') {
        daily = window.MarketsStore.getDailySnapshot(symbol);
      }
    } catch (_) { }

    // 1. 实时最新价：优先日度快照中的 lastPrice，其次 tick / HTTP
    metrics.last = this.pickNumeric(
      daily && daily.lastPrice,
      quote && (quote.last ?? quote.p ?? quote.price ?? quote.close ?? quote.c),
      fallback.last
    );

    // 2. 昨收价：优先日度快照中的 yesterdayClose，其次缓存 prev/tick 提供的 prev
    metrics.prev = this.pickNumeric(
      daily && daily.yesterdayClose,
      fallback.prev,
      quote && (quote.prev ?? quote.prevPrice ?? quote.lastClose ?? quote.preClose ?? quote.pcPrice ?? quote.o ?? quote.open)
    );

    // 3. 初步 diff/pct：优先使用日度快照的 changeAbs/changePct，其次现成字段，最后按 last - prev 推一版
    metrics.diff = this.pickNumeric(
      daily && daily.changeAbs,
      quote && (quote.diff ?? quote.pca ?? quote.changeAbs),
      (metrics.last != null && metrics.prev != null) ? (metrics.last - metrics.prev) : null
    );
    metrics.pct = this.pickNumeric(
      daily && daily.changePct,
      quote && (quote.pct ?? quote.pc ?? quote.changePct ?? quote.percent ?? quote.changePercent),
      (metrics.diff != null && metrics.prev && metrics.prev !== 0) ? ((metrics.diff / metrics.prev) * 100) : null
    );

    // 4. 从 K 线交叉指标中拿“日级基准 prevClose/lastClose”
    let dailyPrev = null;
    let dailyLast = null;
    try {
      if (window.MarketsStore && typeof window.MarketsStore.getKlineCrossMetrics === 'function') {
        // 优先取日级，其次取当前首页时间框架
        const tfCandidates = ['1d', 'day', 1440, '1440m', this && this._homeActiveTimeframe, this && this._preferredHomeTimeframe, '1h', '1m'];
        let cross = null;
        const seen = new Set();
        for (let i = 0; i < tfCandidates.length; i += 1) {
          const tf = tfCandidates[i];
          if (tf == null) continue;
          const key = (window.MarketsStore.normalizeTimeframeKey ? window.MarketsStore.normalizeTimeframeKey(tf) : String(tf));
          if (!key || seen.has(key)) continue;
          seen.add(key);
          const cm = window.MarketsStore.getKlineCrossMetrics(symbol, key);
          if (!cm) continue;
          if (!cross) cross = cm;
          const tag = String(cm.timeframe || key).toLowerCase();
          if (tag === '1d' || tag === 'day' || tag.endsWith('d')) {
            cross = cm;
            break;
          }
        }
        if (cross) {
          if (Number.isFinite(cross.prevClose)) dailyPrev = cross.prevClose;
          if (Number.isFinite(cross.lastClose)) dailyLast = cross.lastClose;
        }
      }
    } catch (_) { }

    // 5. 如果拿到了日级基准，就用 (last - dailyPrev) 统一重算 diff/pct
    if (dailyPrev != null && Number.isFinite(dailyPrev)) {
      metrics.prev = dailyPrev;
      const baseLast = Number.isFinite(metrics.last) ? metrics.last : dailyLast;
      if (baseLast != null && Number.isFinite(baseLast)) {
        metrics.last = baseLast;
        const abs = baseLast - dailyPrev;
        metrics.diff = abs;
        metrics.pct = dailyPrev ? (abs / dailyPrev) * 100 : null;
      }
    }

    // 6. 如果只拿到涨跌幅，反推昨收（作为兜底，不会覆盖上面的日级基准）
    if ((metrics.prev == null || !isFinite(metrics.prev)) && metrics.last != null && metrics.pct != null && isFinite(metrics.pct)) {
      const denom = 1 + (metrics.pct / 100);
      if (denom !== 0) metrics.prev = metrics.last / denom;
    }
    if ((metrics.diff == null || !isFinite(metrics.diff)) && metrics.last != null && metrics.prev != null) {
      metrics.diff = metrics.last - metrics.prev;
    }
    if ((metrics.pct == null || !isFinite(metrics.pct)) && metrics.diff != null && metrics.prev) {
      metrics.pct = metrics.prev ? (metrics.diff / metrics.prev) * 100 : null;
    }
    metrics.last = isFinite(metrics.last) ? metrics.last : null;
    metrics.prev = isFinite(metrics.prev) ? metrics.prev : null;
    metrics.diff = isFinite(metrics.diff) ? metrics.diff : null;
    metrics.pct = isFinite(metrics.pct) ? metrics.pct : null;
    // 若 diff 和 pct 均为 0 或接近 0，但存在 prev 与 last 且差值超过阈值，重新推导
    if (Number.isFinite(metrics.last) && Number.isFinite(metrics.prev)) {
      const rawAbs = metrics.last - metrics.prev;
      const absThreshold = metrics.last * 0.0002; // 0.02% 以下认为过小
      if ((metrics.diff == null || Math.abs(metrics.diff) < absThreshold) && Math.abs(rawAbs) > absThreshold) {
        metrics.diff = rawAbs;
        metrics.pct = metrics.prev ? (rawAbs / metrics.prev) * 100 : null;
      }
    }
    metrics.raw = quote || null;
    return metrics;
  },

  // 调试：输出特定品种的日级涨跌推导
  debugDailyMetrics(symbol = 'XAUUSD') {
    try {
      const q = this._marketsLiveQuotes && this._marketsLiveQuotes[symbol];
      let cross = null;
      if (window.MarketsStore && typeof window.MarketsStore.getKlineCrossMetrics === 'function') {
        cross = window.MarketsStore.getKlineCrossMetrics(symbol, '1m');
      }
      const out = {
        symbol,
        last: q && q.last,
        prev: q && q.prev,
        diff: q && q.diff,
        pct: q && q.pct,
        derivedAbs: (q && Number.isFinite(q.last) && Number.isFinite(q.prev)) ? (q.last - q.prev) : null,
        crossPrevClose: cross && cross.prevClose,
        crossLastClose: cross && cross.lastClose,
        crossAbs: cross && Number.isFinite(cross.lastClose) && Number.isFinite(cross.prevClose) ? (cross.lastClose - cross.prevClose) : null,
        crossPct: cross && Number.isFinite(cross.prevClose) && Number.isFinite(cross.lastClose) ? ((cross.lastClose - cross.prevClose) / cross.prevClose) * 100 : null
      };
      console.table([out]);
      return out;
    } catch (e) { console.warn('debugDailyMetrics failed', e); }
  },

  pickNumeric(...values) {
    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      if (raw == null) continue;
      if (typeof raw === 'number') {
        if (Number.isFinite(raw)) return raw;
        continue;
      }
      let candidate = raw;
      if (typeof candidate === 'string') {
        candidate = candidate.replace(/,/g, '').replace(/%/g, '').trim();
      }
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  },

  ensureUnsupportedSet() {
    if (!this._unsupportedSymbols) {
      this._unsupportedSymbols = new Map();
    }
    return this._unsupportedSymbols;
  },

  markSymbolUnsupported(symbol, reason = '') {
    if (!symbol) return;
    const normalized = String(symbol).toUpperCase();
    if (!normalized) return;
    if (ALWAYS_OPEN_SYMBOLS.has(normalized)) {
      console.warn('[markets] 跳过将常开品种标记为未开通:', normalized, reason || '');
      return;
    }
    const store = this.ensureUnsupportedSet();
    if (!store.has(normalized)) {
      console.warn('[markets] 标的未开通或不存在:', normalized, reason || '');
    }
    store.set(normalized, { reason: reason || '', markedAt: Date.now() });
  },

  isSymbolUnsupported(symbol) {
    if (!symbol || !this._unsupportedSymbols) return false;
    const normalized = String(symbol).toUpperCase();
    if (!normalized) return false;
    const entry = this._unsupportedSymbols.get(normalized);
    if (!entry) return false;
    const expired = entry.markedAt && (Date.now() - entry.markedAt) > UNSUPPORTED_SYMBOL_TTL;
    if (expired) {
      this._unsupportedSymbols.delete(normalized);
      return false;
    }
    return true;
  },

  clearSymbolUnsupported(symbol) {
    if (!symbol || !this._unsupportedSymbols) return;
    const normalized = String(symbol).toUpperCase();
    if (!normalized) return;
    this._unsupportedSymbols.delete(normalized);
  },

  isProductMissingError(err) {
    if (!err) return false;
    const msg = typeof err === 'string' ? err : (err.message || '');
    if (!msg) return false;
    return /product\s+not\s+exists?/i.test(msg);
  },

  resolveClosedLabel() {
    try {
      if (window.i18n && typeof window.i18n.t === 'function') {
        return window.i18n.t('webapp.market.closedLabel', '休市');
      }
    } catch (_) { }
    return '休市';
  },

  isSymbolClosed(symbol) {
    if (!symbol) return false;
    const normalized = String(symbol).toUpperCase();
    if (ALWAYS_OPEN_SYMBOLS.has(normalized)) return false;
    const session = resolveSessionBySymbol(symbol);
    const withinSession = isWithinSession(session);
    const info = (this._marketsLiveQuotes || {})[symbol];
    const hasFreshQuote = info && info.updatedAt && ((Date.now() - info.updatedAt) <= MARKET_CLOSED_STALE_MS);
    if (withinSession) {
      // 正常交易时段：只要最近有报价就视为开市
      return !hasFreshQuote;
    }
    // 非交易时段：直接视为休市
    return true;
  },

  updateRowClosedTag(row, symbol) {
    if (!row) return;
    let resolvedSymbol = symbol;
    if (!resolvedSymbol) {
      const nameEl = row.querySelector('.symbol-name');
      if (nameEl) resolvedSymbol = nameEl.textContent.trim();
      if (!resolvedSymbol && row.dataset && row.dataset.symbol) resolvedSymbol = row.dataset.symbol;
    }
    if (!resolvedSymbol) return;
    let tag = row.querySelector('.market-closed-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'market-closed-tag';
      tag.textContent = this.resolveClosedLabel();
      tag.setAttribute('data-i18n', 'webapp.market.closedLabel');
      const symbolTop = row.querySelector('.symbol-top');
      if (symbolTop) {
        symbolTop.appendChild(tag);
      } else {
        let host = row.querySelector('.symbol-info');
        if (!host) host = row;
        host.appendChild(tag);
      }
    } else {
      const label = this.resolveClosedLabel();
      if (tag.textContent !== label) tag.textContent = label;
    }
    const isClosed = this.isSymbolClosed(resolvedSymbol);
    tag.hidden = !isClosed;
    row.classList.toggle('is-market-closed', isClosed);
  },

  // ===== 调试辅助: 输出当前行情快照与休市判定 =====
  debugDumpQuotes() {
    try {
      const store = this._marketsLiveQuotes || {};
      const now = Date.now();
      const out = Object.keys(store).sort().map(sym => {
        const q = store[sym];
        const ageMs = q && q.updatedAt ? (now - q.updatedAt) : null;
        return {
          symbol: sym,
          last: q && q.last,
          prev: q && q.prev,
          diff: q && q.diff,
            pct: q && q.pct,
          updatedAt: q && q.updatedAt,
          updatedAtISO: q && q.updatedAt ? new Date(q.updatedAt).toISOString() : null,
          ageMs,
          stale: ageMs != null && ageMs > MARKET_CLOSED_STALE_MS,
          closed: this.isSymbolClosed(sym)
        };
      });
      console.table(out);
      return out;
    } catch (e) { console.warn('debugDumpQuotes failed', e); }
  },

  // 强制将所有报价的更新时间回退 N 分钟，用于测试休市标签显示
  debugForceStale(minutes = 3) {
    try {
      const delta = minutes * 60 * 1000;
      const now = Date.now();
      Object.keys(this._marketsLiveQuotes || {}).forEach(sym => {
        const q = this._marketsLiveQuotes[sym];
        if (q && q.updatedAt) q.updatedAt = now - delta;
      });
      // 重新更新 closed 标签
      document.querySelectorAll('.page-home .active-row').forEach(row => {
        const symEl = row.querySelector('.symbol-name');
        const symbol = symEl && symEl.textContent.trim();
        this.updateRowClosedTag(row, symbol);
      });
      console.log(`[debugForceStale] 已将更新时间回退 ${minutes} 分钟`);
      this.debugDumpQuotes();
    } catch (e) { console.warn('debugForceStale failed', e); }
  },

  bindHomeActiveNavigation() {
    try {
      const panel = document.querySelector('.page-home .most-active');
      if (!panel || panel._chartNavBound) return;
      panel.addEventListener('click', (ev) => {
        const row = ev.target.closest('.active-row');
        if (!row) return;
        const nameEl = row.querySelector('.symbol-name');
        const descEl = row.querySelector('.symbol-desc');
        const symbol = (row.dataset && row.dataset.symbol) || (nameEl && nameEl.textContent.trim());
        if (!symbol) return;
        const meta = {
          label: nameEl ? nameEl.textContent.trim() : symbol,
          desc: descEl ? descEl.textContent.trim() : ''
        };
        this.openChartDetail(symbol, meta);
      });
      panel._chartNavBound = true;
    } catch (err) {
      console.warn('bindHomeActiveNavigation failed', err);
    }
  },

  detectBusinessFromSymbol(symbol) {
    if (!symbol) return 'common';
    if (/USDT$|USDC$|BTC$|ETH$/i.test(symbol)) return 'crypto';
    if (/\.US$|\.HK$|\.SZ$|\.SH$/i.test(symbol)) return 'stock';
    return 'common';
  },

  openChartDetail(symbol, meta = {}) {
    try {
      if (!symbol) return;
      const params = new URLSearchParams();
      params.set('symbol', symbol);
      params.set('name', meta.label || meta.name || symbol);
      if (meta.desc) params.set('desc', meta.desc);
      params.set('business', meta.business || this.detectBusinessFromSymbol(symbol));
      const url = `./chart-detail/chart-detail.html?${params.toString()}`;
      if (window.wx && typeof window.wx.navigateTo === 'function') {
        window.wx.navigateTo({ url });
      } else {
        window.location.href = url;
      }
    } catch (err) {
      console.warn('openChartDetail failed', err);
    }
  },

  resolveInitialTabFromUrl() {
    try {
      let query = window.location.search;
      if ((!query || query === '?') && window.location.hash && window.location.hash.includes('?')) {
        query = window.location.hash.substring(window.location.hash.indexOf('?'));
      }
      if (!query) return null;
      const params = new URLSearchParams(query);
      const tab = (params.get('tab') || '').trim();
      if (!tab) return null;
      const allowed = ['home', 'markets', 'trades', 'funds'];
      return allowed.includes(tab) ? tab : null;
    } catch (err) {
      console.warn('resolveInitialTabFromUrl failed', err);
      return null;
    }
  },

  consumeChartTradeIntent() {
    try {
      if (typeof sessionStorage === 'undefined' || !sessionStorage.getItem) return;
      const raw = sessionStorage.getItem('__chart_trade_intent');
      if (!raw) return;
      sessionStorage.removeItem('__chart_trade_intent');
      let intent;
      try { intent = JSON.parse(raw); } catch (_) { intent = null; }
      if (!intent || !intent.symbol) return;
      if (this.data.active !== 'trades') {
        this.activateTab('trades');
      }
      if (typeof window.ShowToast === 'function') {
        window.ShowToast(`Ready to ${intent.side === 'short' ? 'Sell Short' : 'Buy Long'} ${intent.symbol}`);
      }
    } catch (err) {
      console.warn('consumeChartTradeIntent failed', err);
    }
  },

  openSymbolPicker() {
    try {
      const active = this._activeSymbol || this._defaultSymbol;
      const options = (this._marketsAllSymbols || []).map(item => ({
        value: item.value,
        label: item.label,
        desc: item.desc || ''
      }));
      this.openActionSheet({
        mode: 'menu',
        title: 'Select instrument',
        subtitle: 'Applies to both trade panels',
        hideActions: true,
        options,
        selected: active,
        onSelect: (selection) => {
          if (selection && selection.value) {
            this.refreshTradeSymbol(selection.value);
          }
        }
      });
    } catch (err) {
      console.warn('openSymbolPicker failed', err);
    }
  },

  async refreshTradeSymbol(symbol, opts = {}) {
    try {
      const target = symbol || this._activeSymbol || this._defaultSymbol;
      if (!target) return;
      const meta = this.getSymbolMeta(target);
      this._activeSymbol = target;
      if (!opts.skipSymbolSave) {
        try {
          if (typeof localStorage !== 'undefined' && localStorage.setItem) {
            localStorage.setItem('markets:lastSymbol', target);
          }
        } catch (_) { }
      }
      this.updateTradeSymbolLabels(target, meta);
      // 从 MarketsStore 读取深度数据
      let hasDepth = false;
      try {
        if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') {
          const quote = window.MarketsStore.getQuote(target);
          if (quote && quote.depth) {
            const depthEntry = { s: target, a: quote.depth.asks, b: quote.depth.bids };
            this.renderOrderbookDepth(depthEntry, meta, { skipReflow: true });
            hasDepth = true;
          }
        }
      } catch (_) { }
      if (!hasDepth) {
        this._orderbookHasData = false;
      }
      const client = await this.ensureInfowayHttpClient();
      if (!client) return;
      const business = meta.business || 'common';
      const [depthRes, tradesRes, candleRes] = await Promise.allSettled([
        client.getDepth(target, { business, depthLevels: this._depthLevels }),
        client.getTrades(target, { business }),
        client.getCandles({ symbols: target, klineType: 1, klineNum: 2 }, { business })
      ]);
      if (depthRes.status === 'fulfilled' && Array.isArray(depthRes.value)) {
        const depthEntry = depthRes.value.find(entry => entry && entry.s === target);
        if (depthEntry) this.applyDepthSnapshot(depthEntry, meta);
      }
      if (tradesRes.status === 'fulfilled' && Array.isArray(tradesRes.value)) {
        const tradeEntry = tradesRes.value.find(entry => entry && entry.s === target);
        if (tradeEntry) this.updateActiveTradeFromHistory(tradeEntry, meta);
      }
      if (candleRes.status === 'fulfilled' && Array.isArray(candleRes.value)) {
        const candleEntry = candleRes.value.find(entry => entry && entry.s === target);
        if (candleEntry && Array.isArray(candleEntry.respList) && candleEntry.respList.length) {
          this.updateTradeSnapshot(candleEntry.respList[0], meta);
        }
      }
      // 若所有 HTTP 请求完成但快照仍缺失，用全局缓存兜底
      setTimeout(() => {
        try { this.ensureTradeSnapshotFromStore && this.ensureTradeSnapshotFromStore(); } catch (e) { console.warn('post-refresh ensureTradeSnapshotFromStore failed', e); }
      }, 300);
      this.syncMarketsSubscriptions();
    } catch (err) {
      if (!opts.silent) console.warn('refreshTradeSymbol failed', err);
    }
  },

  updateTradeSymbolLabels(symbol, meta = {}) {
    try {
      const quoteUnit = meta.quoteUnit || 'USD';
      const volumeUnit = meta.volumeUnit || symbol;
      document.querySelectorAll('.symbol-switcher .symbol').forEach(node => { node.textContent = symbol; });
      document.querySelectorAll('.buy-btn .buy-symbol').forEach(node => { node.textContent = symbol; });
      document.querySelectorAll('.book-header').forEach(header => {
        const subs = header.querySelectorAll('.col-sub');
        if (subs[0]) subs[0].textContent = `(${quoteUnit})`;
        if (subs[1]) subs[1].textContent = `(${volumeUnit})`;
      });
    } catch (err) {
      console.warn('updateTradeSymbolLabels failed', err);
    }
  },

  applyDepthSnapshot(depthEntry, meta, opts = {}) {
    try {
      if (!depthEntry) return;
      const symbol = depthEntry.s || depthEntry.symbol;
      if (!symbol) return;
      // 不再维护本地缓存，直接渲染
      const activeSymbol = this._activeSymbol || this._defaultSymbol;
      const shouldRender = !opts.skipRender && (opts.forceRender || symbol === activeSymbol);
      if (!shouldRender) return;
      const resolvedMeta = meta || this.getSymbolMeta(symbol) || {};
      this.renderOrderbookDepth(depthEntry, resolvedMeta, opts);
    } catch (err) {
      console.warn('applyDepthSnapshot failed', err);
    }
  },

  renderOrderbookDepthFromStore(symbol) {
    try {
      if (!symbol) symbol = this._activeSymbol || this._defaultSymbol;
      if (!symbol) return;
      console.log('[renderOrderbookDepthFromStore] 开始渲染', symbol);
      let quote = null;
      try {
        if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') {
          quote = window.MarketsStore.getQuote(symbol);
        }
      } catch (_) { }
      console.log('[renderOrderbookDepthFromStore] quote:', quote);
      if (!quote || !quote.depth) {
        console.warn('[renderOrderbookDepthFromStore] 无深度数据', symbol, quote);
        return;
      }
      console.log('[renderOrderbookDepthFromStore] depth:', quote.depth, 'bids:', quote.depth.bids?.length, 'asks:', quote.depth.asks?.length);
      const meta = this.getSymbolMeta(symbol) || {};
      const depthEntry = { s: symbol, a: quote.depth.asks, b: quote.depth.bids };
      this.renderOrderbookDepth(depthEntry, meta, {});
      console.log('[renderOrderbookDepthFromStore] 渲染完成');
    } catch (err) {
      console.warn('renderOrderbookDepthFromStore failed', err);
    }
  },

  renderOrderbookDepth(depthEntry, meta, opts = {}) {
    try {
      if (!depthEntry) return;
      // \u4e0d\u518d\u7ef4\u62a4 _lastDepthSnapshot\uff0c\u5168\u90e8\u4ece MarketsStore \u8bfb\u53d6
      const symbol = (meta && (meta.value || meta.label || meta.symbol)) || depthEntry.s || this._activeSymbol || this._defaultSymbol;
      let asksSource = this.normalizeDepthSide(depthEntry.a);
      let bidsSource = this.normalizeDepthSide(depthEntry.b);
      let bestAsk = this.extractBestPrice(asksSource, 'ask');
      let bestBid = this.extractBestPrice(bidsSource, 'bid');
      if (this.shouldSwapDepthSides(bestAsk, bestBid, symbol)) {
        console.warn('[renderOrderbookDepth] Detected inverted depth sides, swapping ask/bid arrays for', symbol);
        const tmpSource = asksSource;
        asksSource = bidsSource;
        bidsSource = tmpSource;
        bestAsk = this.extractBestPrice(asksSource, 'ask');
        bestBid = this.extractBestPrice(bidsSource, 'bid');
      }
      this.cacheBestQuotes(symbol, bestAsk, bestBid);
      const sections = document.querySelectorAll('.trade-content');
      sections.forEach(section => {
        const bookColumns = section.querySelector('.book-columns');
        if (!bookColumns) return;
        const localRows = Math.max(Number(bookColumns.dataset.maxRows) || this._orderbookMaxRows || MIN_ORDERBOOK_ROWS, MIN_ORDERBOOK_ROWS);
        const asks = this.prepareDepthSideRows(asksSource, 'ask', symbol, localRows);
        const bids = this.prepareDepthSideRows(bidsSource, 'bid', symbol, localRows);
        const asksEl = bookColumns.querySelector('.orderbook.asks');
        if (asksEl) asksEl.innerHTML = this.buildDepthHtml(asks, 'ask');
        const bidsEl = bookColumns.querySelector('.orderbook.bids');
        if (bidsEl) bidsEl.innerHTML = this.buildDepthHtml(bids, 'bid');
      });
      this._orderbookHasData = true;
      this.syncMarketQuotesOnDepth();
      this.refreshSpreadMetrics();
      if (!opts.skipReflow) {
        requestAnimationFrame(() => {
          try { this.updateOrderbookRows(); } catch (_) { }
        });
      }
    } catch (err) {
      console.warn('renderOrderbookDepth failed', err);
    }
  },

  extractBestPrice(rows, type) {
    try {
      if (!Array.isArray(rows) || !rows.length) return null;
      let candidate = null;
      rows.forEach((row) => {
        if (!row || !Number.isFinite(row.price)) return;
        if (candidate == null) {
          candidate = row.price;
          return;
        }
        if (type === 'ask') {
          if (row.price < candidate) candidate = row.price;
        } else if (type === 'bid') {
          if (row.price > candidate) candidate = row.price;
        }
      });
      return Number.isFinite(candidate) ? candidate : null;
    } catch (err) {
      console.warn('extractBestPrice failed', err);
      return null;
    }
  },

  cacheBestQuotes(symbol, askPrice, bidPrice) {
    try {
      const spread = this.computeDepthSpread(askPrice, bidPrice, symbol);
      this._orderbookBest = { symbol, ask: askPrice, bid: bidPrice, spread };
      this.refreshSpreadMetrics();
    } catch (err) {
      console.warn('cacheBestQuotes failed', err);
    }
  },

  computeDepthSpread(askPrice, bidPrice, symbol) {
    if (!Number.isFinite(askPrice) || !Number.isFinite(bidPrice)) return null;
    let spread = askPrice - bidPrice;
    if (Number.isFinite(spread)) {
      spread = Math.abs(spread);
      if (spread > 0) return spread;
    }
    const tick = Math.abs(this.resolveSyntheticDepthStep(symbol, askPrice || bidPrice) || 0.0001);
    return Number(tick || 0);
  },

  shouldSwapDepthSides(bestAsk, bestBid, symbol) {
    try {
      if (!Number.isFinite(bestAsk) || !Number.isFinite(bestBid)) return false;
      if (bestAsk >= bestBid) return false;
      const tick = Math.abs(this.resolveSyntheticDepthStep(symbol, bestAsk || bestBid) || 0.000001);
      const tolerance = Math.max(Math.min(tick * 0.25, 0.00001), 1e-8);
      return (bestBid - bestAsk) > tolerance;
    } catch (err) {
      console.warn('shouldSwapDepthSides failed', err);
      return false;
    }
  },

  updateSpreadMetricDisplay(panel = null) {
    try {
      if (!panel) {
        const panels = document.querySelectorAll('.trade-content .order-panel');
        panels.forEach(node => this.updateSpreadMetricDisplay(node));
        return;
      }
      const symbol = this._activeSymbol || this._defaultSymbol;
      const best = this._orderbookBest;
      const sameSymbol = best && best.symbol === symbol;
      const baseSpread = (sameSymbol && Number.isFinite(best.spread)) ? best.spread : null;
      let volume = 0;
      if (panel) {
        const volumeInput = this.findVolumeInputForPanel(panel);
        if (volumeInput) {
          const raw = parseFloat(volumeInput.value || '0');
          volume = Number.isFinite(raw) ? Math.max(0, raw) : 0;
        }
      }
  const spreadValue = baseSpread == null ? null : baseSpread * volume;
  const formatted = spreadValue == null ? '--' : this.formatPrice(symbol, spreadValue);
  const scope = panel ? panel.querySelector('.metrics') : document;
  const rows = scope ? scope.querySelectorAll('.metric-row') : [];
      rows.forEach(row => {
        const label = row.querySelector('[data-i18n="webapp.trades.metrics.spread"]');
        if (!label) return;
        const valueBox = row.querySelector('.metric-value');
        if (!valueBox) return;
        let numberNode = valueBox.querySelector('.metric-number');
        if (!numberNode) {
          const candidates = valueBox.querySelectorAll('span:not(.metric-unit), text:not(.metric-unit), b:not(.metric-unit)');
          numberNode = candidates.length ? candidates[0] : null;
        }
        if (numberNode) numberNode.textContent = formatted;
      });
    } catch (err) {
      console.warn('updateSpreadMetricDisplay failed', err);
    }
  },

  syncMarketQuotesOnDepth() {
    try {
      const panels = document.querySelectorAll('.trade-content .order-panel');
      if (!panels.length) return;
      panels.forEach(panel => this.applyMarketQuoteToPanel(panel));
    } catch (err) {
      console.warn('syncMarketQuotesOnDepth failed', err);
    }
  },

  refreshSpreadMetrics(targetPanel = null) {
    try {
      if (targetPanel) {
        this.updateSpreadMetricDisplay(targetPanel);
        return;
      }
      const panels = document.querySelectorAll('.trade-content .order-panel');
      panels.forEach(panel => this.updateSpreadMetricDisplay(panel));
    } catch (err) {
      console.warn('refreshSpreadMetrics failed', err);
    }
  },

  syncVolumeWithAvailable(panel, opts = {}) {
    try {
      if (!panel) return;
      const volumeInput = this.findVolumeInputForPanel(panel);
      if (!volumeInput) return;
      const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
      const lastPriceInput = panel.querySelector('.floating-field[data-field^="lastPrice"] input.num');
      const available = (opts.available !== undefined) ? opts.available : (this.getPanelAvailable ? this.getPanelAvailable(panel) : 0);
      const quoteVal = (opts.quoteVal !== undefined) ? opts.quoteVal : (quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0);
      const leaveReserve = opts.leaveReserve !== false; // 默认保留少量余额
      const volumePrecision = opts.volumePrecision || 6;
      const currentVol = parseFloat(volumeInput.value || '0') || 0;
      const currentCost = currentVol * quoteVal;
      const availableSafe = Math.max(available, 0);
      const reserve = (leaveReserve && availableSafe > 0 && quoteVal > 0)
        ? Math.min(availableSafe * 0.001, quoteVal * 0.01)
        : 0;
      const targetCap = Math.max(availableSafe - reserve, 0);
      const targetVolume = (quoteVal > 0) ? (targetCap / quoteVal) : 0;
      const threshold = Math.max(availableSafe * 0.001, quoteVal * 0.01);
      const nearMax = availableSafe > 0 && quoteVal > 0 && (availableSafe - currentCost) <= threshold;
      let resolvedVolume = currentVol;
      if (availableSafe <= 0 || quoteVal <= 0) {
        resolvedVolume = 0;
      } else {
        const overflow = currentCost > targetCap + 1e-6;
        const underfill = opts.fromQuoteChange && nearMax && (targetCap - currentCost) > threshold;
        if (overflow || underfill || opts.force) {
          resolvedVolume = Math.max(targetVolume, 0);
        }
      }
      const volumeStr = Math.max(resolvedVolume, 0).toFixed(volumePrecision);
      volumeInput.value = volumeStr;
      volumeInput.dataset.value = volumeStr;
      if (lastPriceInput) {
        const total = (quoteVal > 0)
          ? Math.min(parseFloat(volumeStr) * quoteVal, availableSafe)
          : 0;
        const totalStr = total > 0 ? total.toFixed(2) : '0';
        lastPriceInput.value = totalStr;
        lastPriceInput.dataset.value = totalStr;
      }
    } catch (err) {
      console.warn('syncVolumeWithAvailable failed', err);
    }
  },

  /* ===== I00009 可用余额与最大可买数量支持 ===== */
  fetchTradeAvailable(detailsWalletType, symbol) {
    try {
      const userAccount = this.resolveUserAccount();
      if (!userAccount || !symbol) return Promise.resolve(null);
      if (!window.superAPI) { try { window.superAPI = createSuperAPI && createSuperAPI(); } catch (_) { } }
      if (!window.superAPI || !window.superAPI.request) return Promise.resolve(null);
      return window.superAPI.request('I00009', { userAccount, detailsWalletType, itemId: symbol })
        .then(resp => {
          if (resp && Number.isFinite(resp.available)) {
            console.log(resp)
            if (detailsWalletType === 0) this._availableCapital = Number(resp.available);
            else if (detailsWalletType === 1) this._availableLeveraged = Number(resp.available);
          }
          return resp;
        })
        .catch(err => { console.warn('fetchTradeAvailable failed', err); return null; });
    } catch (err) {
      console.warn('fetchTradeAvailable outer failed', err);
      return Promise.resolve(null);
    }
  },

  getPanelAvailable(panel) {
    if (!panel) return 0;
    const typeBtn = panel.querySelector('.order-type .type-btn');
    const form = typeBtn && typeBtn.dataset.form === 'leveraged' ? 'leveraged' : 'capital';
    return form === 'leveraged' ? (this._availableLeveraged || 0) : (this._availableCapital || 0);
  },

  refreshAvailableLimitsForAll() {
    try { document.querySelectorAll('.trade-content .order-panel').forEach(p => this.refreshAvailableAndLimits && this.refreshAvailableAndLimits(p)); } catch (e) { console.warn('refreshAvailableLimitsForAll failed', e); }
  },

  refreshAvailableAndLimits(panel) {
    try {
      if (!panel) return;
      const available = this.getPanelAvailable(panel);
      const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
      const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
      const typeBtn = panel.querySelector('.order-type .type-btn');
      const orderType = (typeBtn && typeBtn.dataset && typeBtn.dataset.value) ? typeBtn.dataset.value : 'market';
      this.syncVolumeWithAvailable(panel, {
        available,
        quoteVal,
        leaveReserve: orderType === 'market'
      });
      const pickerType = typeBtn && typeBtn.dataset.form === 'leveraged' ? 'leveraged' : 'capital';
      const picker = document.querySelector(`.allocation-picker[data-picker="${pickerType}"]`);
      if (picker && available > 0 && quoteVal > 0) {
        const buyable = available / quoteVal;
        // data-max-volume 不能超过 buyable
        picker.dataset.maxAmount = available.toFixed(6);
        picker.dataset.maxVolume = buyable.toFixed(6);
        this.refreshRangePickers();
      }
      this.updateTradeMetricsUI && this.updateTradeMetricsUI();
    } catch (err) { console.warn('refreshAvailableAndLimits failed', err); }
  },

  updateTradeMetricsUI(scopeType) {
    try {
      document.querySelectorAll('.trade-content .order-panel').forEach(panel => {
        const typeBtn = panel.querySelector('.order-type .type-btn');
        const formType = typeBtn && typeBtn.dataset.form === 'leveraged' ? 'leveraged' : 'capital';
        if (scopeType && scopeType !== formType) return;
        const available = formType === 'leveraged' ? (this._availableLeveraged || 0) : (this._availableCapital || 0);
        const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
        const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
        const buyable = (available > 0 && quoteVal > 0) ? (available / quoteVal) : 0;
        const metrics = panel.querySelector('.metrics');
        if (!metrics) return;
        metrics.querySelectorAll('.metric-row').forEach(row => {
          const labelAvail = row.querySelector('[data-i18n="webapp.trades.metrics.available"]');
          const labelBuyable = row.querySelector('[data-i18n="webapp.trades.metrics.buyable"]');
          const valueBox = row.querySelector('.metric-value');
          if (!valueBox) return;
          let numberNode = valueBox.querySelector('.metric-number');
          if (!numberNode) {
            const cands = valueBox.querySelectorAll('text:not(.metric-unit), span:not(.metric-unit), b:not(.metric-unit)');
            numberNode = cands.length ? cands[0] : null;
          }
          if (labelAvail && numberNode) numberNode.textContent = available.toFixed(4);
          if (labelBuyable && numberNode) numberNode.textContent = buyable.toFixed(4);
        });
      });
    } catch (err) { console.warn('updateTradeMetricsUI failed', err); }
  },

  setQuoteFieldLock(panel, locked) {
    try {
      if (!panel) return;
      const field = panel.querySelector('.floating-field[data-field^="quote"]');
      if (!field) return;
      const input = field.querySelector('input.num');
      const steppers = field.querySelectorAll('.step');
      steppers.forEach(btn => {
        btn.disabled = !!locked;
        btn.classList.toggle('disabled', !!locked);
      });
      if (input) {
        input.readOnly = !!locked;
        input.dataset.marketLock = locked ? '1' : '0';
        input.classList.toggle('market-locked', !!locked);
      }
    } catch (err) {
      console.warn('setQuoteFieldLock failed', err);
    }
  },

  isMarketQuoteLocked(panel) {
    const input = panel && panel.querySelector('.floating-field[data-field^="quote"] input.num');
    return !!(input && input.dataset.marketLock === '1');
  },

  findVolumeInputForPanel(panel) {
    if (!panel) return null;
    const selectors = [
      '.floating-field[data-field="volume"] input.num',
      '.floating-field[data-field="volumeL"] input.num',
      '.floating-field[data-field^="volume"] input.num'
    ];
    for (let i = 0; i < selectors.length; i += 1) {
      const node = panel.querySelector(selectors[i]);
      if (node) return node;
    }
    return null;
  },

  applyMarketQuoteToPanel(panel, opts = {}) {
    try {
      if (!panel) return;
      const typeBtn = panel.querySelector('.order-type .type-btn');
      if (!typeBtn) return;
      const currentType = (typeBtn.dataset && typeBtn.dataset.value) ? typeBtn.dataset.value : 'market';
      if (!opts.force && currentType !== 'market') return;
      const sideBtn = panel.querySelector('.order-segment .seg-btn.active');
      const side = sideBtn && sideBtn.dataset && sideBtn.dataset.side === 'short' ? 'short' : 'long';
      const price = this.getMarketPriceForSide(side);
      if (!Number.isFinite(price)) return;
      const symbol = this._activeSymbol || this._defaultSymbol;
      const formatted = this.formatPrice(symbol, price);
      const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
      if (quoteInput) {
        quoteInput.value = formatted;
        quoteInput.dataset.value = formatted;
      }
      this.syncVolumeWithAvailable(panel, {
        leaveReserve: true,
        fromQuoteChange: true
      });
      this.refreshFloatingFields();
      if (currentType === 'market' || opts.force) {
        this.setQuoteFieldLock(panel, true);
      }
      this.refreshSpreadMetrics(panel);
      this.refreshAvailableAndLimits && this.refreshAvailableAndLimits(panel);
    } catch (err) {
      console.warn('applyMarketQuoteToPanel failed', err);
    }
  },

  getMarketPriceForSide(side = 'long') {
    const symbol = this._activeSymbol || this._defaultSymbol;
    const best = this._orderbookBest;
    if (best && best.symbol === symbol) {
      if (side === 'short' && Number.isFinite(best.bid)) return best.bid;
      if (Number.isFinite(best.ask)) return best.ask;
    }
    if (this._activeSnapshot && Number.isFinite(this._activeSnapshot.last)) {
      return this._activeSnapshot.last;
    }
    return null;
  },

  buildDepthHtml(rows, type) {
    if (!rows || !rows.length) return '';
    const symbol = this._activeSymbol || this._defaultSymbol;
    return rows.map(row => {
      const price = isFinite(row.price) ? this.formatPrice(symbol, row.price) : '--';
      const vol = this.formatVolume(row.volume);
      const syntheticClass = row.synthetic ? ' synthetic' : '';
      const bestClass = row.best ? ' best' : '';
      const sideClass = type === 'ask' ? 'up' : 'down';
      const label = row.best ? `<text class="best-tag ${sideClass}">${type === 'ask' ? '卖一' : '买一'}</text>` : '';
      return `<view class="ob-row ${sideClass}${syntheticClass}${bestClass}" data-synthetic="${row.synthetic ? '1' : '0'}" data-best="${row.best ? '1' : '0'}">${label}<text class="quote">${price}</text><text class="volume">${vol}</text></view>`;
    }).join('');
  },

  normalizeDepthSide(arr) {
    if (!arr || !arr.length) return [];
    const pair = Array.isArray(arr[0]) && Array.isArray(arr[1]) ? arr : [Array.isArray(arr) ? arr : [], []];
    const prices = Array.isArray(pair[0]) ? pair[0] : [];
    const volumes = Array.isArray(pair[1]) ? pair[1] : [];
    const len = Math.max(prices.length, volumes.length);
    const rows = [];
    for (let i = 0; i < len; i += 1) {
      const price = Number(prices[i]);
      if (!isFinite(price)) continue;
      const volume = Number(volumes[i] != null ? volumes[i] : 0);
      rows.push({ price, volume: isFinite(volume) ? volume : 0 });
    }
    return rows;
  },

  prepareDepthSideRows(rows, type, symbol, targetRows) {
    const desired = Math.max(targetRows || MIN_ORDERBOOK_ROWS, MIN_ORDERBOOK_ROWS);
    const list = Array.isArray(rows) ? rows.filter(item => item && isFinite(item.price)) : [];
    const isAsk = type === 'ask';
    const sortFn = isAsk ? ((a, b) => a.price - b.price) : ((a, b) => b.price - a.price);
    const sorted = list.slice().sort(sortFn);
    const hydrated = this.ensureDepthSideRows(sorted, type, symbol, desired);
    const trimmed = hydrated.slice(0, desired);
    const oriented = isAsk ? trimmed.slice().reverse() : trimmed;
    const bestCandidate = isAsk ? oriented.length - 1 : 0;
    let bestIndex = bestCandidate;
    if (oriented[bestIndex] && oriented[bestIndex].synthetic) {
      if (isAsk) {
        for (let i = oriented.length - 1; i >= 0; i -= 1) {
          if (!oriented[i].synthetic) { bestIndex = i; break; }
        }
      } else {
        for (let i = 0; i < oriented.length; i += 1) {
          if (!oriented[i].synthetic) { bestIndex = i; break; }
        }
      }
    }
    return oriented.map((row, idx) => Object.assign({}, row, { best: idx === bestIndex }));
  },

  ensureDepthSideRows(rows, type, symbol, targetRows) {
    const desired = Math.max(targetRows || MIN_ORDERBOOK_ROWS, MIN_ORDERBOOK_ROWS);
    const list = Array.isArray(rows) ? rows.map(item => Object.assign({}, item)) : [];
    if (!list.length) {
      const seed = this.buildSyntheticDepthAnchor(symbol, type);
      if (seed) list.push(seed);
    }
    if (!list.length) return list;
    const isAsk = type === 'ask';
    const baseNode = list[list.length - 1];
    const basePrice = baseNode && baseNode.price;
    const step = this.resolveSyntheticDepthStep(symbol, basePrice);
    if (!step || !isFinite(step) || step <= 0) return list;
    const anchorVolume = list[0] && list[0].volume;
    let currentPrice = basePrice;
    const direction = isAsk ? 1 : -1;
    const trendBias = this.getSyntheticTrendBias(symbol);
    const flowPressure = this.getSyntheticFlowPressure(symbol);
    let guard = 0;
    while (list.length < desired && guard < desired * 4) {
      guard += 1;
      if (!isFinite(currentPrice)) break;
      const idx = list.length;
      const ratioNoise = 0.75 + this.depthRandom(symbol, idx, type + '-ratio') * 0.6; // 0.75 - 1.35
      const jitterSeed = (this.depthRandom(symbol, idx, type + '-jitter') - 0.5) * step * 0.5;
      const timeSeed = this.depthTemporalSeed(symbol, idx + (type === 'ask' ? 1 : -1));
      const dynamicJitter = (timeSeed - 0.5) * step * 0.8;
      const wobble = (this.depthTemporalSeed(symbol, idx * 2 + (isAsk ? 7 : -7)) - 0.5) * step * 0.4;
      const delta = step * ratioNoise + jitterSeed + dynamicJitter + wobble;
      const depthFactor = 1 - Math.min(idx / Math.max(1, desired * 1.25), 0.85);
      const macroTilt = step * trendBias * (isAsk ? 0.55 : 0.45) * depthFactor;
      const pressureTilt = step * flowPressure * (isAsk ? 0.45 : 0.35) * depthFactor;
      currentPrice = currentPrice + direction * Math.abs(delta) + macroTilt + pressureTilt;
      if (!isFinite(currentPrice) || currentPrice <= 0) break;
      const syntheticVolume = this.computeSyntheticDepthVolume(anchorVolume, idx, symbol, type);
      list.push({ price: Number(currentPrice.toFixed(6)), volume: syntheticVolume, synthetic: true });
    }
    return list;
  },

  buildSyntheticDepthAnchor(symbol, type) {
    const snapshot = (symbol && symbol === this._activeSymbol && this._activeSnapshot) ? this._activeSnapshot : null;
    const price = snapshot && isFinite(snapshot.last) ? snapshot.last : null;
    if (!isFinite(price) || price <= 0) return null;
    const volume = Math.max(1, this.computeSyntheticDepthVolume(snapshot.volume || 0, 1, symbol, type || 'anchor'));
    return { price: Number(price), volume, synthetic: true };
  },

  resolveSyntheticDepthStep(symbol, price) {
    const absPrice = Math.abs(price || 0) || 1;
    if (symbol && /^[A-Z]{6}$/.test(symbol)) {
      return absPrice >= 1 ? 0.0002 : 0.00002;
    }
    if (/XAU|XAG|XPT|XPD/i.test(symbol || '')) return 0.05;
    if (/USOIL|UKOIL|XTI|XBR/i.test(symbol || '')) return 0.05;
    if (absPrice >= 1000) return 0.5;
    if (absPrice >= 100) return 0.1;
    if (absPrice >= 10) return 0.01;
    if (absPrice >= 1) return 0.001;
    if (absPrice >= 0.1) return 0.0001;
    return 0.00001;
  },

  getSyntheticTrendBias(symbol) {
    const snap = this._activeSnapshot;
    if (!snap) return 0;
    const open = isFinite(snap.open) && snap.open ? snap.open : snap.last;
    const last = isFinite(snap.last) ? snap.last : null;
    if (!isFinite(open) || !isFinite(last) || !open) return 0;
    const pct = isFinite(snap.changePct) ? (snap.changePct / 100) : ((last - open) / open);
    if (!isFinite(pct)) return 0;
    return Math.max(-1, Math.min(1, pct * 8));
  },

  getSyntheticFlowPressure(symbol) {
    let pressure = 0;
    const targetSymbol = symbol || this._activeSymbol || this._defaultSymbol;
    const lastTrade = this._lastTradeItem;
    if (lastTrade) {
      const tradeSymbol = lastTrade.s || lastTrade.symbol || lastTrade.sym;
      if (!tradeSymbol || !targetSymbol || tradeSymbol === targetSymbol) {
        const sideRaw = (lastTrade.side || lastTrade.sd || lastTrade.bs || lastTrade.dir || lastTrade.orderSide || lastTrade.m || '').toString().toLowerCase();
        if (sideRaw.includes('buy') || sideRaw.includes('long') || sideRaw === 'b' || sideRaw === '1') {
          pressure += 0.55;
        } else if (sideRaw.includes('sell') || sideRaw.includes('short') || sideRaw === 's' || sideRaw === '-1') {
          pressure -= 0.55;
        }
        const tradeVolume = Number(lastTrade.v || lastTrade.volume || lastTrade.qty || lastTrade.amount);
        if (isFinite(tradeVolume) && tradeVolume > 0) {
          const baseline = Math.max(1, this.estimateSyntheticVolumeBaseline(targetSymbol));
          const normalized = Math.min(1.2, tradeVolume / baseline);
          pressure += Math.max(-0.4, Math.min(0.4, normalized * (pressure >= 0 ? 0.8 : -0.8)));
        }
        const tradeDiff = Number(lastTrade.diff || lastTrade.dp || lastTrade.change);
        if (isFinite(tradeDiff) && tradeDiff !== 0) {
          pressure += tradeDiff > 0 ? 0.2 : -0.2;
        }
      }
    }
    const snap = this._activeSnapshot;
    if (snap && isFinite(snap.changeAbs) && isFinite(snap.open) && snap.open) {
      const pct = (snap.changeAbs / snap.open);
      if (isFinite(pct)) {
        pressure += Math.max(-0.3, Math.min(0.3, pct * 2));
      }
    }
    const randomBreath = (this.depthTemporalSeed(targetSymbol, 404) - 0.5) * 0.3;
    pressure += randomBreath;
    return Math.max(-1, Math.min(1, pressure));
  },

  getSyntheticDepthProfile(symbol, side = 'depth') {
    const trend = this.getSyntheticTrendBias(symbol);
    const flow = this.getSyntheticFlowPressure(symbol);
    const sideSalt = side === 'ask' ? 1 : -1;
    const bulgeCenterSeed = this.depthTemporalSeed(symbol, 160 * sideSalt);
    const bulgeWidthSeed = this.depthRandom(symbol, sideSalt * 5, `${side}-width`);
    const bulgeStrengthSeed = this.depthTemporalSeed(symbol, 190 * sideSalt);
    const taperSeed = this.depthRandom(symbol, sideSalt * 9, `${side}-taper`);
    const bulgeCenter = 1 + Math.round(bulgeCenterSeed * 3);
    const bulgeWidth = 1.1 + bulgeWidthSeed * 2.4;
    const bulgeStrength = 0.2 + bulgeStrengthSeed * 0.9;
    const taper = 0.02 + taperSeed * 0.12;
    const sidePressureBase = 1 + trend * 0.15 + (side === 'ask' ? flow : -flow) * 0.45;
    return {
      bulgeCenter,
      bulgeWidth,
      bulgeStrength,
      taper,
      sidePressure: Math.max(0.35, sidePressureBase)
    };
  },

  computeSyntheticDepthVolume(anchorVolume, index, symbol, side) {
    const base = (isFinite(anchorVolume) && anchorVolume > 0) ? anchorVolume : Math.max(1, this.estimateSyntheticVolumeBaseline(symbol));
    const profile = this.getSyntheticDepthProfile(symbol, side || 'depth');
    const trendBias = this.getSyntheticTrendBias(symbol);
    const decay = Math.max(0.22, 0.98 - index * 0.05 + trendBias * 0.03);
    const tickSeed = this.depthTemporalSeed(symbol, index);
    const noise = 0.55 + tickSeed * 1.2;
    const waveSeed = this.depthRandom(symbol, index, `${side || 'depth'}-wave`);
    const wave = 0.9 + Math.sin((index + waveSeed + tickSeed * 3.1) * 0.8) * 0.22;
    const burstSeed = this.depthRandom(symbol, index, `${side || 'depth'}-burst`);
    const burst = burstSeed > 0.68 ? (1.15 + this.depthRandom(symbol, index, `${side || 'depth'}-boost`) * 2.4) : 1;
    const bulge = 1 + profile.bulgeStrength * Math.exp(-Math.pow((index - profile.bulgeCenter) / profile.bulgeWidth, 2));
    const taper = 1 + index * profile.taper;
    const breathing = 0.9 + (this.depthTemporalSeed(symbol, index * 11 + (side === 'ask' ? 5 : -5)) - 0.5) * 0.6;
    const volume = base * decay * noise * wave * burst * bulge * taper * breathing * profile.sidePressure;
    return Number(Math.max(volume, base * 0.12).toFixed(4));
  },

  depthTemporalSeed(symbol, index) {
    const nowBucket = Math.floor(Date.now() / 5000); // 每 5s 跳一次，制造轻微波动
    const key = `${symbol || 'DEF'}:${index}:${nowBucket}`;
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
    }
    const x = Math.sin(hash) * 10000;
    return (x - Math.floor(x));
  },

  estimateSyntheticVolumeBaseline(symbol) {
    if (!symbol) return 10;
    if (/^[A-Z]{6}$/.test(symbol)) return 100000;
    if (/XAU|XAG/i.test(symbol)) return 100;
    if (/USOIL|UKOIL|XTI|XBR/i.test(symbol)) return 1000;
    return 50;
  },

  depthRandom(symbol, index, salt = '') {
    const key = `${symbol || 'DEF'}:${index}:${salt}`;
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
  },

  updateTradeSnapshot(snapshot = {}, opts = {}) {
    try {
      const symbol = this._activeSymbol || this._defaultSymbol;
      if (!symbol) return;

      // 可选：直接传入预先计算的 metrics（来自 tick 轻量刷新）
      let directMetrics = opts.metrics;
      if (directMetrics && !Number.isFinite(directMetrics.last)) directMetrics = null;

      let storeQuote = null;
      try { if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') storeQuote = window.MarketsStore.getQuote(symbol) || null; } catch (_) { }
      const storeRaw = storeQuote && (storeQuote.raw || storeQuote);
      const snapshotRaw = snapshot && (snapshot.raw || snapshot) || null;

      const metrics = directMetrics || this.buildQuoteMetrics(symbol, storeRaw || snapshotRaw, storeQuote || snapshotRaw || {});

      // OHLC 合并策略：tick 模式不覆盖已有 candle 的 open/high/low
      const prevSnap = this._activeSnapshot || {};
      const fromTick = opts.fromTick;
      let last = Number.isFinite(metrics.last) ? metrics.last : this.pickNumeric(snapshotRaw && (snapshotRaw.c || snapshotRaw.close), snapshotRaw && snapshotRaw.p, snapshotRaw && snapshotRaw.last);
      let open = fromTick ? prevSnap.open : this.pickNumeric(snapshotRaw && (snapshotRaw.o || snapshotRaw.open), snapshotRaw && snapshotRaw.c, metrics.prev, last, prevSnap.open);
      let high = fromTick ? prevSnap.high : this.pickNumeric(snapshotRaw && (snapshotRaw.h || snapshotRaw.high), prevSnap.high, last);
      let low = fromTick ? prevSnap.low : this.pickNumeric(snapshotRaw && (snapshotRaw.l || snapshotRaw.low), prevSnap.low, last);
      let changeAbs = this.pickNumeric(metrics.diff, snapshotRaw && (snapshotRaw.pca || snapshotRaw.changeAbs));
      let changePct = this.pickNumeric(metrics.pct, snapshotRaw && (snapshotRaw.pc || snapshotRaw.changePct));

      if (changeAbs == null && Number.isFinite(last) && Number.isFinite(open)) changeAbs = last - open;
      if (changePct == null && changeAbs != null && Number.isFinite(open) && open !== 0) changePct = (changeAbs / open) * 100;

      // 兜底：若无 candle 但全局 K 线提供指标
      try {
        if (!fromTick && window.MarketsStore && typeof window.MarketsStore.getKlineMetrics === 'function') {
          const km = window.MarketsStore.getKlineMetrics(symbol);
          if (km) {
            if (!Number.isFinite(open) && Number.isFinite(km.open)) open = km.open;
            if (!Number.isFinite(high) && Number.isFinite(km.high)) high = km.high;
            if (!Number.isFinite(low) && Number.isFinite(km.low)) low = km.low;
          }
        }
      } catch (_) { }

      this._activeSnapshot = { last, open, high, low, changeAbs, changePct, prev: metrics.prev, updatedAt: Date.now() };
      // 模板顺序：Open, Close(昨收), High, Low
      const statValues = [open, metrics.prev, high, low];
      const statNodes = document.querySelectorAll('.trade-capital-section .trade-header .stat b');
      statNodes.forEach((node, idx) => {
        if (!node) return;
        const val = statValues[idx];
        node.textContent = Number.isFinite(val) ? this.formatPriceFullPrecision(symbol, val) : '--';
      });
      this.updateTradeHeaderChange(changePct);
      this.updateTradePriceBlock(last, changeAbs, changePct);
    } catch (err) { console.warn('updateTradeSnapshot failed', err); }
  },

  updateTradeHeaderChange(pct) {
    try {
      const nodes = document.querySelectorAll('.trade-header .change');
      nodes.forEach(node => {
        if (pct == null || Number.isNaN(pct)) {
          node.textContent = '--';
          node.classList.remove('up', 'down');
        } else {
          node.textContent = `${pct >= 0 ? '+ ' : ''}${pct.toFixed(2)}%`;
          node.classList.toggle('up', pct > 0);
          node.classList.toggle('down', pct < 0);
        }
      });
    } catch (err) {
      console.warn('updateTradeHeaderChange failed', err);
    }
  },

  updateTradePriceBlock(price, changeAbs, changePct) {
    try {
      const symbol = this._activeSymbol || this._defaultSymbol;
      const priceText = isFinite(price) ? this.formatPrice(symbol, price) : '--';
      document.querySelectorAll('.book-last .last-price').forEach(node => { node.textContent = priceText; });
      const direction = (changeAbs == null || Number.isNaN(changeAbs)) ? 0 : (changeAbs > 0 ? 1 : (changeAbs < 0 ? -1 : 0));
      document.querySelectorAll('.book-last .last-price-row').forEach(row => {
        if (!row) return;
        if (direction === 0) {
          row.classList.remove('up');
          row.classList.remove('down');
        } else {
          row.classList.toggle('up', direction > 0);
          row.classList.toggle('down', direction < 0);
        }
        const arrow = row.querySelector('.price-arrow');
        if (arrow) {
          arrow.dataset.direction = direction > 0 ? 'up' : direction < 0 ? 'down' : 'flat';
          const upSrc = arrow.dataset.upSrc || arrow.getAttribute('data-up-src') || arrow.getAttribute('src');
          const downSrc = arrow.dataset.downSrc || arrow.getAttribute('data-down-src') || upSrc;
          const flatSrc = arrow.dataset.flatSrc || arrow.getAttribute('data-flat-src') || upSrc;
          if (upSrc) arrow.dataset.upSrc = upSrc;
          if (downSrc) arrow.dataset.downSrc = downSrc;
          if (flatSrc) arrow.dataset.flatSrc = flatSrc;
          let targetSrc = upSrc;
          if (direction < 0 && downSrc) {
            targetSrc = downSrc;
          } else if (direction === 0 && flatSrc) {
            targetSrc = flatSrc;
          }
          if (targetSrc && arrow.getAttribute('src') !== targetSrc) {
            arrow.setAttribute('src', targetSrc);
          }
          arrow.style.transform = 'none';
        }
      });
      document.querySelectorAll('.book-last .last-change').forEach(node => {
        if (changeAbs == null || Number.isNaN(changeAbs)) {
          node.textContent = '--';
          node.classList.remove('up', 'down');
        } else {
          node.textContent = (changeAbs >= 0 ? '+' : '') + this.formatTiny(symbol, changeAbs);
          node.classList.toggle('up', changeAbs > 0);
          node.classList.toggle('down', changeAbs < 0);
        }
      });
    } catch (err) {
      console.warn('updateTradePriceBlock failed', err);
    }
  },

  updateActiveTradeFromHistory(tradeItem) {
    try {
      this._lastTradeItem = tradeItem;
      const symbol = this._activeSymbol || this._defaultSymbol;
      if (!symbol || !tradeItem) return;
      if (!this._activeSnapshot || !Number.isFinite(this._activeSnapshot.last)) {
        let storeQuote = null;
        try {
          if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') {
            storeQuote = window.MarketsStore.getQuote(symbol) || null;
          }
        } catch (_) { }
        const quoteSource = tradeItem.raw || tradeItem;
        const metrics = this.buildQuoteMetrics(symbol, quoteSource, storeQuote || quoteSource || {});
        if (metrics && Number.isFinite(metrics.last)) {
          // 用历史成交补快照（若初始 Candle 请求失败）
          this.updateTradeSnapshot({ c: metrics.last, last: metrics.last, o: metrics.prev, pca: metrics.diff, pc: metrics.pct }, { fromTick: true, metrics });
        }
      }
    } catch (err) {
      console.warn('updateActiveTradeFromHistory failed', err);
    }
  },

  ensureTradeSnapshotFromStore() {
    try {
      const symbol = this._activeSymbol || this._defaultSymbol;
      if (!symbol) return;
      if (this._activeSnapshot && Number.isFinite(this._activeSnapshot.last)) return; // 已有
      let storeQuote = null;
      try { if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') storeQuote = window.MarketsStore.getQuote(symbol) || null; } catch (_) { }
      if (!storeQuote) return;
      const metrics = this.buildQuoteMetrics(symbol, storeQuote.raw || storeQuote, storeQuote);
      if (metrics && Number.isFinite(metrics.last)) {
        this.updateTradeSnapshot({ c: metrics.last, last: metrics.last, o: metrics.prev, pca: metrics.diff, pc: metrics.pct }, { fromTick: true, metrics });
      }
    } catch (e) { console.warn('ensureTradeSnapshotFromStore failed', e); }
  },

  updateActiveSymbolQuote(info) {
    try {
      if (!info || !isFinite(info.last)) return;
      const priceEl = document.querySelector('.trade-symbol-price');
      const changeEl = document.querySelector('.trade-symbol-change');
      const pctEl = document.querySelector('.trade-symbol-pct');

      // 统一走 buildQuoteMetrics，内部会优先使用日级 prevClose
      const metrics = this.buildQuoteMetrics(info.symbol || this._activeSymbol, info.raw || info, info);
      if (!metrics || !isFinite(metrics.last)) return;

      if (priceEl) {
        priceEl.textContent = this.formatPrice(info.symbol || this._activeSymbol, metrics.last);
      }
      const diff = isFinite(metrics.diff) ? metrics.diff : null;
      const pct = isFinite(metrics.pct) ? metrics.pct : null;

      if (changeEl) {
        if (diff == null) {
          changeEl.textContent = '--';
          changeEl.classList.remove('up', 'down');
        } else {
          changeEl.textContent = (diff >= 0 ? '+' : '') + this.formatTiny(info.symbol || this._activeSymbol, diff);
          changeEl.classList.toggle('up', diff > 0);
          changeEl.classList.toggle('down', diff < 0);
        }
      }
      if (pctEl) {
        if (pct == null) {
          pctEl.textContent = '--';
          pctEl.classList.remove('up', 'down');
        } else {
          pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
          pctEl.classList.toggle('up', pct > 0);
          pctEl.classList.toggle('down', pct < 0);
        }
      }
    } catch (e) {
      console.warn('updateActiveSymbolQuote failed', e);
    }
  },

  formatCompactNumber(value) {
    if (value == null || !isFinite(value)) return '--';
    const abs = Math.abs(value);
    if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return value.toFixed(2);
  },

  /* ========== Trades 页面逻辑 ========== */
  switchTradeTab(e) {
    try {
      const type = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.type;
      if (!type) return;

      // 更新 Tab 激活状态
      const tabs = document.querySelectorAll('.trade-tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));

      // 获取 swiper 容器和 slides
      const mainSwiper = document.querySelector('.trade-main-swiper');
      const wrapper = mainSwiper && mainSwiper.querySelector('.swiper-wrapper');
      const slides = wrapper ? Array.from(wrapper.querySelectorAll('.swiper-slide')) : [];
      if (!wrapper || !slides.length) return;

      // 计算目标索引（capital = 0, leveraged = 1）
      const targetIndex = type === 'leveraged' ? 1 : 0;

      // 更新 active 类
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === targetIndex);
      });

      // 触发滑动动画：从右到左（负向 translateX）
      const translatePercent = -(targetIndex * 50); // 每个 slide 宽度 50%
      wrapper.style.transform = `translateX(${translatePercent}%)`;

      // 切换后重新计算订单簿行数（稍微延迟保证布局稳定）
      setTimeout(() => this.updateOrderbookRows(), 120);

      // 主面板切换后刷新其内部激活子面板高度
      setTimeout(() => {
        try {
          const activeSlide = slides[targetIndex];
          if (!activeSlide) return;
          const subSwiper = activeSlide.querySelector('.trade-subpanel-swiper');
          if (!subSwiper) return;
          const activeSubSlide = subSwiper.querySelector('.swiper-slide[data-panel].active') || subSwiper.querySelector('.swiper-slide[data-panel]');
          if (!activeSubSlide) return;
          const h = activeSubSlide.offsetHeight;
          if (h) subSwiper.style.height = h + 'px';
        } catch (err) { console.warn('refresh subpanel height after main tab switch failed', err); }
      }, 160);
      // Fetch available balances for current tab (Capital=0 / Leveraged=1)
      const symbol = this._activeSymbol || this._defaultSymbol;
      if (symbol) {
        if (type === 'leveraged') {
          this.fetchTradeAvailable && this.fetchTradeAvailable(1, symbol).then(() => { this.updateTradeMetricsUI && this.updateTradeMetricsUI('leveraged'); this.refreshAvailableLimitsForAll && this.refreshAvailableLimitsForAll(); });
        } else {
          this.fetchTradeAvailable && this.fetchTradeAvailable(0, symbol).then(() => { this.updateTradeMetricsUI && this.updateTradeMetricsUI('capital'); this.refreshAvailableLimitsForAll && this.refreshAvailableLimitsForAll(); });
        }
      }
    } catch (err) {
      console.warn('switchTradeTab slide failed', err);
    }
  },

  // 空函数，避免 HTML 中的 bindtap 调用报错
  switchTradePanel(e) {
    // 已禁用子面板切换功能
    try {
      const btn = e && e.currentTarget;
      const panelKey = btn && btn.dataset && btn.dataset.panel;
      if (!panelKey) return;
      const tradeContent = btn.closest('.trade-content');
      if (!tradeContent) return;
      console.log('[switchTradePanel] click panelKey=', panelKey);
      const tabBtns = tradeContent.querySelectorAll('.trade-subtabs .subtab');
      tabBtns.forEach(tab => tab.classList.toggle('active', tab.dataset.panel === panelKey));

      // Swiper 控制（带动画）
      if (this._subpanelSwipers && this._subpanelSwipers.length) {
        const swiper = this._subpanelSwipers.find(s => s.el && tradeContent.contains(s.el));
        if (swiper) {
          const targetIndex = Array.from(swiper.slides).findIndex(slide => slide.dataset && slide.dataset.panel === panelKey);
          if (targetIndex >= 0) {
            try {
              swiper.slideTo(targetIndex, swiper.params.speed || 400, true);
              return;
            } catch (_) { }
          }
        }
      }

      // 回退：直接显示/隐藏
      const container = tradeContent.querySelector('.trade-subpanel-swiper');
      const wrapper = tradeContent.querySelector('.trade-subpanel-swiper .swiper-wrapper');
      const slides = tradeContent.querySelectorAll('.trade-subpanel-swiper .swiper-slide');
      const idx = Array.from(slides).findIndex(slide => slide.dataset && slide.dataset.panel === panelKey);
      if (!container || !wrapper || idx < 0) return;

      // 获取当前容器高度
      const currentHeight = container.offsetHeight;

      // Fallback 动画布局：translateX 百分比需按单页宽度计算 (100% / slides.length)
      const slideCount = slides.length || 1;
      const perSlidePercent = 100 / slideCount; // 每个滑块占 wrapper 宽度百分比
      wrapper.style.transition = 'transform 0.35s cubic-bezier(.25,.8,.25,1)';
      wrapper.style.display = 'flex';
      wrapper.style.width = (slideCount * 100) + '%';
      slides.forEach((s, i) => {
        s.style.flex = '0 0 ' + (100 / slideCount) + '%';
        s.style.display = 'block';
        s.style.order = i;
      });
      if (!wrapper.dataset.fallbackInit) {
        wrapper.dataset.fallbackInit = '1';
        wrapper.style.transform = 'translateX(0)';
      }

      // 锁定当前高度，准备过渡
      container.style.height = currentHeight + 'px';

      requestAnimationFrame(() => {
        const translate = -(idx * perSlidePercent);
        wrapper.style.transform = `translateX(${translate}%)`;
        this.updateSubpanelIndicator(tradeContent, idx);
        console.log('[switchTradePanel] fallback slide idx=', idx, '->', translate + '%');

        // 下一帧获取目标slide的高度并过渡
        requestAnimationFrame(() => {
          const targetSlide = slides[idx];
          if (targetSlide) {
            const targetHeight = targetSlide.offsetHeight;
            console.log('[switchTradePanel] height transition:', currentHeight, '->', targetHeight);
            // 设置目标高度
            container.style.height = targetHeight + 'px';
          }
        });
      });
    } catch (err) {
      console.warn('switchTradePanel failed', err);
    }
  },

  // 更新子面板指示器（分页圆点）
  updateSubpanelIndicator(tradeContent, activeIdx) {
    try {
      if (!tradeContent) return;
      const pag = tradeContent.querySelector('.trade-subpanel-pagination');
      const slides = tradeContent.querySelectorAll('.trade-subpanel-swiper .swiper-slide');
      if (!pag || !slides.length) return;
      let bullets = pag.querySelectorAll('.swiper-pagination-bullet');
      if (bullets.length !== slides.length) {
        pag.innerHTML = '';
        slides.forEach((_, i) => {
          const span = document.createElement('span');
          span.className = 'swiper-pagination-bullet' + (i === activeIdx ? ' swiper-pagination-bullet-active' : '');
          pag.appendChild(span);
        });
      } else {
        bullets.forEach((b, i) => b.classList.toggle('swiper-pagination-bullet-active', i === activeIdx));
      }
    } catch (e) { console.warn('updateSubpanelIndicator failed', e); }
  },

  // 初始化每个子面板的高度（锁定->过渡到auto）
  initSubpanelHeights() {
    const containers = document.querySelectorAll('.trade-subpanel-swiper');
    containers.forEach(container => {
      try {
        const slides = container.querySelectorAll('.swiper-slide');
        if (!slides.length) return;
        // 选中 pending 或第一个 slide
        let activeSlide = Array.from(slides).find(s => s.dataset && s.dataset.panel === 'pending');
        if (!activeSlide) activeSlide = slides[0];
        // 设置初始高度
        const h = activeSlide.offsetHeight;
        if (!h) return;
        container.style.height = h + 'px';
        // 同步指示器初始状态
        const tradeContent = container.closest('.trade-content');
        const idx = Array.from(slides).indexOf(activeSlide);
        this.updateSubpanelIndicator(tradeContent, idx);
      } catch (e) { console.warn('initSubpanelHeights one failed', e); }
    });
  },

  toggleLongShort(e) {
    const side = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.side;
    const wrap = e && e.currentTarget && e.currentTarget.parentElement;
    if (!wrap) return;
    const btns = wrap.querySelectorAll('.seg-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.side === side));
    // 更新买入按钮颜色
    const page = wrap.closest('.trade-content');
    const buyBtn = page && page.querySelector('.buy-btn');
    if (buyBtn) {
      buyBtn.classList.remove('long', 'short');
      buyBtn.classList.add(side === 'short' ? 'short' : 'long');
    }
    const panel = wrap.closest('.order-panel');
    if (panel) {
      this.applyMarketQuoteToPanel(panel);
      const resetFields = ['tp', 'sl'];
      resetFields.forEach(key => {
        const input = panel.querySelector(`.floating-field[data-field^="${key}"] input.num`);
        if (input) {
          input.value = '0';
          input.dataset.value = 0;
        }
      });
    }
  },

  onStep(e) {
    const delta = Number((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.delta) || 0);
    const stepper = e.currentTarget && e.currentTarget.closest('.stepper');
    if (!stepper) return;
    const targetKey = stepper.dataset && stepper.dataset.target;
    const panel = stepper.closest('.order-panel');
    if (targetKey && /^price/i.test(targetKey)) {
      if (panel && this.isMarketQuoteLocked(panel)) {
        return;
      }
    }
    const input = stepper.querySelector('input.num');
    if (!input) return;
    const val = parseFloat(input.value || '0') || 0;
    const tentative = val + delta;
    let next = tentative;
    const isTp = targetKey ? /^tp/i.test(targetKey) : false;
    const isSl = targetKey ? /^sl/i.test(targetKey) : false;
    const isTpSl = isTp || isSl;
    let quoteVal = 0;
    let isLong = true;
    if (panel && isTpSl) {
      const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
      quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
      const segBtns = panel.querySelectorAll('.order-segment .seg-btn');
      segBtns.forEach(btn => {
        if (btn.classList.contains('active')) isLong = (btn.dataset.side === 'long');
      });
    }
    
    // 约束1: 通用负数限制,TP/SL 若无报价也直接限制
    if (delta < 0 && val <= 0 && (!isTpSl || quoteVal <= 0)) {
      return; // 已经是0,禁止继续减
    }
    if (next < 0) next = 0;
    
    if (isTpSl && quoteVal > 0) {
      if (isTp && !isLong && val === 0 && delta > 0) {
        return; // short方向: TP值为0时加号无效
      }
      if (isSl && isLong && val === 0 && delta > 0) {
        return; // long方向: SL值为0时加号无效
      }
      if (isTp) {
        if (isLong) {
          if (val === 0 && delta > 0) {
            next = quoteVal * 1.0001;
          } else if (delta < 0 && tentative <= quoteVal) {
            next = 0;
          }
        } else {
          if (val === 0 && delta < 0) {
            next = quoteVal * 0.9999;
          } else if (delta > 0 && tentative >= quoteVal) {
            next = 0;
          }
        }
      } else if (isSl) {
        if (isLong) {
          if (val === 0 && delta < 0) {
            next = quoteVal * 0.9999;
          } else if (delta > 0 && tentative >= quoteVal) {
            next = 0;
          }
        } else {
          if (val === 0 && delta > 0) {
            next = quoteVal * 1.0001;
          } else if (delta < 0 && tentative <= quoteVal) {
            next = 0;
          }
        }
      }
    }
    
    // 保留两位小数
    if (input.type === 'number') {
      next = Math.round(next * 100) / 100;
    }
    
    if (panel && (/^volume/i.test(targetKey) || /^lastPrice/i.test(targetKey))) {
      const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
      const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
      const available = this.getPanelAvailable ? this.getPanelAvailable(panel) : 0;
      
      // 约束: Available=0 时,Volume 和 LastPrice 的加号完全禁止
      if (delta > 0 && available <= 0) {
        try { (window.ShowToast || console.log)('可用余额为0,无法增加'); } catch (_) {}
        return;
      }
      
      // 约束: Volume 加1后如果超过 Buyable,则 = Buyable
      if (/^volume/i.test(targetKey) && quoteVal > 0) {
        const maxVol = available / quoteVal; // Buyable = Available / Quote
        if (next > maxVol) {
          next = maxVol;
          try { (window.ShowToast || console.log)('已达到最大可买数量'); } catch (_) {}
        }
      }
      
      // 约束: LastPrice 加1后如果超过 Available,则 = Available
      if (/^lastPrice/i.test(targetKey)) {
        if (next > available) {
          next = available;
          try { (window.ShowToast || console.log)('已达到最大可用余额'); } catch (_) {}
        }
      }
    }
    input.value = String(next);
    
    // 双向联动计算: Volume ↔ LastPrice (使用锁避免循环)
    if (!this._calculationLock && panel) {
      this._calculationLock = true;
      try {
        const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
        const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
        
        if (quoteVal > 0) {
          if (/^volume/i.test(targetKey)) {
            // Volume 改变 → 计算 LastPrice = Volume × Quote
            const lastPriceInput = panel.querySelector('.floating-field[data-field^="lastPrice"] input.num');
            if (lastPriceInput) {
              lastPriceInput.value = (next * quoteVal).toFixed(2);
            }
          } else if (/^lastPrice/i.test(targetKey)) {
            // LastPrice 改变 → 计算 Volume = LastPrice ÷ Quote
            const volumeInput = panel.querySelector('.floating-field[data-field^="volume"] input.num');
            if (volumeInput) {
              volumeInput.value = (next / quoteVal).toFixed(6);
            }
          }
        }
      } finally {
        this._calculationLock = false;
      }
    }
    
    // TP/SL: 赋值后根据方向归零不合法的值 (无弹窗)
    if (panel && (/^tp/i.test(targetKey) || /^sl/i.test(targetKey)) && next > 0) {
      const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
      const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
      
      if (quoteVal > 0) {
        // 判断方向
        const segBtns = panel.querySelectorAll('.order-segment .seg-btn');
        let isLong = true;
        segBtns.forEach(btn => {
          if (btn.classList.contains('active')) isLong = (btn.dataset.side === 'long');
        });
        
        let shouldZero = false;
        if (/^tp/i.test(targetKey)) {
          // TP: Long时必须>Quote, Short时必须<Quote
          shouldZero = isLong ? (next <= quoteVal) : (next >= quoteVal);
        } else {
          // SL: Long时必须<Quote, Short时必须>Quote
          shouldZero = isLong ? (next >= quoteVal) : (next <= quoteVal);
        }
        
        if (shouldZero) {
          input.value = 0;
          input.dataset.value = 0;
        }
      }
    }
    
    this.refreshFloatingFields();
    this.refreshRangePickers();
    this.refreshSpreadMetrics(stepper.closest('.order-panel'));
    if (panel && this.refreshAvailableAndLimits) this.refreshAvailableAndLimits(panel);
  },

  onBuy() { try { (window.ShowToast || console.log)('Order submitted (mock)'); } catch (_) { } },

  onSymbolSwitch() {
    try {
      this.openSymbolPicker();
    } catch (err) {
      console.warn('onSymbolSwitch failed', err);
    }
  },

  onOrderTypeSelect(e) {
    this._sheetTrigger = e && e.currentTarget;
    // 使用 i18n 文案构建选项
    const t = (key, fallback) => (window.i18n && window.i18n.t) ? window.i18n.t(key, fallback) : fallback;
    const options = [
      { value: 'market', label: t('webapp.trades.orderType.market', 'Market Order'), desc: t('webapp.trades.orderType.market.desc', 'Execute immediately at current market price') },
      { value: 'limit', label: t('webapp.trades.orderType.limit', 'Limit Order'), desc: t('webapp.trades.orderType.limit.desc', 'Set a price; fills when reached') },
      { value: 'stop', label: t('webapp.trades.orderType.stop', 'Stop Order'), desc: t('webapp.trades.orderType.stop.desc', 'Triggers into market order once price hits') }
    ];
    this.openActionSheet({
      mode: 'menu',
      theme: 'light', // 改为与 Markets 相同的浅色主题
      titleKey: 'webapp.trades.orderTypeSheet.title',
      subtitleKey: 'webapp.trades.orderTypeSheet.subtitle',
      options,
      hideActions: true,
      onSelect: (option) => {
        if (this._sheetTrigger) {
          this._sheetTrigger.textContent = option.label + ' ▾';
          this._sheetTrigger.dataset.value = option.value;
          this.handleOrderTypeApplied(this._sheetTrigger, option);
        }
        const lang = (window.i18n && window.i18n.lang) || 'en-US';
        const msg = lang === 'zh-CN' ? `已切换为 ${option.label}` : `Switched to ${option.label}`;
        try {
          if (typeof window.ShowToast === 'function') {
            window.ShowToast(msg, { icon: 'success' });
          } else {
            console.log(msg);
          }
        } catch (_) { }
      }
    });
  },

  handleOrderTypeApplied(trigger, option) {
    try {
      if (!trigger || !option) return;
      const panel = trigger.closest('.order-panel');
      if (!panel) return;
      if (option.value === 'market') {
        this.applyMarketQuoteToPanel(panel, { force: true });
        this.setQuoteFieldLock(panel, true);
        this.refreshAvailableAndLimits && this.refreshAvailableAndLimits(panel);
      } else {
        const sideBtn = panel.querySelector('.order-segment .seg-btn.active');
        const side = sideBtn && sideBtn.dataset && sideBtn.dataset.side === 'short' ? 'short' : 'long';
        const price = this.getMarketPriceForSide(side);
        if (Number.isFinite(price)) {
          const symbol = this._activeSymbol || this._defaultSymbol;
          const formatted = this.formatPrice(symbol, price);
          const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
          if (quoteInput) {
            quoteInput.value = formatted;
            quoteInput.dataset.value = formatted;
          }
          this.syncVolumeWithAvailable(panel, { leaveReserve: false, fromQuoteChange: true });
        }
        this.setQuoteFieldLock(panel, false);
        this.refreshAvailableAndLimits && this.refreshAvailableAndLimits(panel);
      }
      this.refreshSpreadMetrics(panel);
    } catch (err) {
      console.warn('handleOrderTypeApplied failed', err);
    }
  },

  // Leveraged 三个模式标签切换
  switchLeveragedMode(e) {
    try {
      const btn = e && e.currentTarget;
      const mode = btn && btn.dataset && btn.dataset.mode;
      if (!btn || !mode) return;
      const group = btn.closest('.leveraged-mode-tabs');
      if (!group) return;
      const all = group.querySelectorAll('.lev-mode-tab');
      all.forEach(b => b.classList.toggle('active', b === btn));
      // 后续可根据 mode 进行：
      // full -> 显示全仓信息
      // multiplier -> 显示/调整杠杆倍数弹层
      // loan -> 打开借贷/还款弹窗
      (window.ShowToast || console.log)('Mode: ' + mode);
    } catch (err) {
      console.warn('switchLeveragedMode failed', err);
    }
  },

  onFollowLast(e) {
    try {
      const field = e && e.currentTarget && e.currentTarget.closest('.floating-field');
      const input = field && field.querySelector('input.num');
      if (!input) return;
      const ticker = document.querySelector('.book-last .last-price');
      const text = ticker && ticker.textContent ? ticker.textContent : '';
      const numericText = text.replace(/[^0-9+\-\.]/g, '');
      const value = numericText ? parseFloat(numericText) : 0;
      input.value = value ? value.toFixed(2) : '0.00';
      this.refreshFloatingFields();
      this.refreshRangePickers();
    } catch (err) {
      console.warn('onFollowLast failed', err);
    }
  },

  initRangePickers() {
    try {
      const pickers = document.querySelectorAll('.allocation-picker');
      if (!pickers.length) return;
      pickers.forEach(picker => this.setupRangePicker(picker));
      this.refreshRangePickers();
    } catch (e) {
      console.warn('initRangePickers failed', e);
    }
  },

  setupRangePicker(picker) {
    if (!picker || picker.dataset.rangeReady === '1') return;
    picker.dataset.rangeReady = '1';
    const track = picker.querySelector('[data-role="track"]');
    if (track) {
      track.addEventListener('pointerdown', (ev) => {
        // 约束2: 如果 Available = 0, 滑动条不能拖动
        const panel = picker.closest('.order-panel');
        const available = panel && this.getPanelAvailable ? this.getPanelAvailable(panel) : 0;
        const maxVolume = this.getRangeMax(picker, 'volume');
        if (available <= 0 || maxVolume <= 0) {
          try { (window.ShowToast || console.log)('可用余额为0,无法操作'); } catch (_) {}
          return; // 禁止拖动
        }
        
        ev.preventDefault();
        const pointerId = ev.pointerId;
        if (track.setPointerCapture) {
          try { track.setPointerCapture(pointerId); } catch (_) { }
        }
        let lastPercent = this.computeRangePercent(track, ev);
        this.applyRangePercent(picker, lastPercent, { deferFloating: true });
        const move = (evt) => {
          lastPercent = this.computeRangePercent(track, evt);
          this.queueRangePercent(picker, lastPercent, { deferFloating: true });
        };
        const cleanup = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', cleanup);
          if (track.releasePointerCapture) {
            try { track.releasePointerCapture(pointerId); } catch (_) { }
          }
          this.applyRangePercent(picker, lastPercent);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', cleanup, { once: true });
      });
    }
    const marks = picker.querySelectorAll('.allocation-marks .mark');
    marks.forEach(mark => {
      mark.addEventListener('click', () => {
        // 约束2: 如果 Available = 0, 标记按钮也不能点击
        const panel = picker.closest('.order-panel');
        const available = panel && this.getPanelAvailable ? this.getPanelAvailable(panel) : 0;
        const maxVolume = this.getRangeMax(picker, 'volume');
        if (available <= 0 || maxVolume <= 0) {
          try { (window.ShowToast || console.log)('可用余额为0,无法操作'); } catch (_) {}
          return;
        }
        const val = Number(mark.dataset.value || 0);
        this.applyRangePercent(picker, val);
      });
    });
    // 只监听 Volume 输入框变化,不监听 Quote 和 LastPrice
    const volumeInput = this.findRangeInput(picker.dataset.volumeKey);
    if (volumeInput) {
      volumeInput.addEventListener('input', () => {
        if (this._rangeLock || this._calculationLock) return;
        this.syncPickerFromInputs(picker);
        // 当 Volume 改变时,需要重新计算 LastPrice (使用锁避免循环)
        this._calculationLock = true;
        try {
          const panel = picker.closest('.order-panel');
          const quoteInput = panel ? panel.querySelector('.floating-field[data-field^="quote"] input.num') : null;
          const lastPriceInput = panel ? panel.querySelector('.floating-field[data-field^="lastPrice"] input.num') : null;
          if (quoteInput && lastPriceInput) {
            const vol = parseFloat(volumeInput.value || '0') || 0;
            const quote = parseFloat(quoteInput.value || '0') || 0;
            if (quote > 0) {
              lastPriceInput.value = (vol * quote).toFixed(2);
            }
          }
        } finally {
          this._calculationLock = false;
        }
        this.refreshSpreadMetrics(picker.closest('.order-panel'));
      });
    }
  },

  queueRangePercent(picker, percent, opts = {}) {
    if (!picker) return;
    if (!this._rangeQueue) this._rangeQueue = new Map();
    this._rangeQueue.set(picker, { percent, opts });
    if (this._rangeFrame) return;
    const scheduler = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    this._rangeFrame = scheduler(() => {
      const queue = this._rangeQueue ? Array.from(this._rangeQueue.entries()) : [];
      if (this._rangeQueue) this._rangeQueue.clear();
      this._rangeFrame = null;
      queue.forEach(([node, payload]) => {
        this.applyRangePercent(node, payload.percent, payload.opts || {});
      });
    });
  },

  computeRangePercent(track, evt) {
    try {
      const rect = track.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      return Math.max(0, Math.min(100, pct));
    } catch (_) {
      return 0;
    }
  },

  findRangeInput(key) {
    if (!key) return null;
    return document.querySelector(`input[data-key="${key}"]`);
  },

  getRangeMax(picker, type) {
    if (!picker) return 0;
    const attr = type === 'volume' ? picker.dataset.maxVolume : picker.dataset.maxAmount;
    return parseFloat(attr || '0') || 0;
  },

  syncPickerFromInputs(picker) {
    try {
      // 只基于 Volume 同步滑动条
      const volumeInput = this.findRangeInput(picker.dataset.volumeKey);
      const maxVolume = this.getRangeMax(picker, 'volume');

      if (!volumeInput || maxVolume <= 0) {
        this.applyRangePercent(picker, 0, { skipInputs: true });
        return;
      }

      const volumeValue = parseFloat(volumeInput.value || '0') || 0;
      const pct = Math.max(0, Math.min(100, (volumeValue / maxVolume) * 100));
      this.applyRangePercent(picker, pct, { skipInputs: true });
    } catch (e) {
      console.warn('syncPickerFromInputs failed', e);
    }
  },

  applyRangePercent(picker, pct, opts = {}) {
    try {
      if (!picker) return;
      const percent = Math.max(0, Math.min(100, Number(pct) || 0));
      picker.dataset.percent = percent.toFixed(2);
      const fill = picker.querySelector('[data-role="fill"]');
      const thumb = picker.querySelector('[data-role="thumb"]');
      const percentEl = picker.querySelector('[data-role="percent"]');
      if (fill) fill.style.width = percent + '%';
      if (thumb) thumb.style.left = percent + '%';
      if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;

      const maxVolume = this.getRangeMax(picker, 'volume');
      // 滑动条只计算 Volume(数量),LastPrice = Volume × Quote
      const volumeValue = maxVolume ? maxVolume * percent / 100 : 0;
      
      // 获取当前 Quote 价格
      const panel = picker.closest('.order-panel');
      const quoteInput = panel ? panel.querySelector('.floating-field[data-field^="quote"] input.num') : null;
      const quoteVal = quoteInput ? (parseFloat(quoteInput.value) || 0) : 0;
      
      // LastPrice = Volume × Quote
      const lastPriceValue = volumeValue * quoteVal;
      
      const amountUnit = picker.dataset.amountUnit || '';
      const volumeUnit = picker.dataset.volumeUnit || '';
      const amountDisplay = picker.querySelector('[data-role="amount"]');
      const volumeDisplay = picker.querySelector('[data-role="volume"]');
      // 更新显示:amount显示为LastPrice,volume显示为Volume
      if (amountDisplay) amountDisplay.textContent = `${lastPriceValue.toFixed(2)} ${amountUnit}`.trim();
      if (volumeDisplay) volumeDisplay.textContent = `${volumeValue.toFixed(4)} ${volumeUnit}`.trim();

      if (!opts.skipInputs) {
        this._rangeLock = true;
        // 只更新 Volume 和 LastPrice,不更新 Quote
        const volumeInput = this.findRangeInput(picker.dataset.volumeKey);
        if (volumeInput) volumeInput.value = volumeValue.toFixed(4);
        // 更新 LastPrice 输入框
        const lastPriceInput = panel ? panel.querySelector('.floating-field[data-field^="lastPrice"] input.num') : null;
        if (lastPriceInput) lastPriceInput.value = lastPriceValue.toFixed(2);
        if (opts.deferFloating) {
          this._floatingDirty = true;
        } else {
          this.refreshFloatingFields();
          this._floatingDirty = false;
        }
        this.refreshSpreadMetrics(picker.closest('.order-panel'));
        requestAnimationFrame(() => { this._rangeLock = false; });
      }
    } catch (e) {
      console.warn('applyRangePercent failed', e);
      this._rangeLock = false;
    }
  },

  refreshRangePickers() {
    try {
      const pickers = document.querySelectorAll('.allocation-picker');
      pickers.forEach(picker => this.syncPickerFromInputs(picker));
    } catch (e) {
      console.warn('refreshRangePickers failed', e);
    }
  },

  initSLForms() {
    try {
      const switches = document.querySelectorAll('.sl-switch input[type="checkbox"]');
      if (!switches.length) return;
      switches.forEach(sw => {
        if (sw.dataset.slReady === '1') return;
        sw.dataset.slReady = '1';
        const wrap = sw.closest('.sl-switch');
        if (wrap && wrap.dataset && wrap.dataset.slTarget) {
          sw.dataset.slTarget = wrap.dataset.slTarget;
        }
        sw.addEventListener('change', (evt) => {
          const el = evt.currentTarget;
          this.setSLFormState(el.dataset.slTarget, el.checked);
        });
        this.setSLFormState(sw.dataset.slTarget, sw.checked);
      });
    } catch (e) {
      console.warn('initSLForms failed', e);
    }
  },

  setSLFormState(target, enabled) {
    try {
      const selector = target ? `.tp-sl-form[data-sl-form="${target}"]` : '.tp-sl-form';
      const forms = document.querySelectorAll(selector);
      forms.forEach(form => {
        form.classList.toggle('sl-disabled', !enabled);
        const inputs = form.querySelectorAll('input, button, select, textarea');
        inputs.forEach(node => {
          node.disabled = !enabled;
        });
      });
      if (enabled) this.refreshFloatingFields();
      const reschedule = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
      reschedule(() => {
        try { this.updateOrderbookRows(); } catch (_) { }
      });
    } catch (e) {
      console.warn('setSLFormState failed', e);
    }
  },

  initFloatingFields() {
    try {
      const rows = document.querySelectorAll('.floating-field');
      if (!rows.length) return;
      rows.forEach(row => {
        if (row.dataset.floatingReady === '1') return;
        row.dataset.floatingReady = '1';
        const input = row.querySelector('input.num');
        if (!input) return;
        const updateState = () => this.applyFloatingState(row, input);
        input.addEventListener('input', updateState);
        // Volume 输入框监听:刷新 spread 和同步滑动条
        if (row.dataset && /^volume/i.test(row.dataset.field || '')) {
          input.addEventListener('input', () => {
            if (this._rangeLock) return;
            const panel = row.closest && row.closest('.order-panel');
            
            // 约束: 键盘输入验证 - Volume 不能为负,超过Buyable则=Buyable
            let val = parseFloat(input.value || '0') || 0;
            if (val < 0) {
              val = 0;
              input.value = '0';
            }
            if (panel) {
              const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
              const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
              const available = this.getPanelAvailable ? this.getPanelAvailable(panel) : 0;
              
              // Available=0 时,任何正数输入都不允许
              if (available <= 0 && val > 0) {
                input.value = '0';
                try { (window.ShowToast || console.log)('可用余额为0'); } catch (_) {}
              } else if (quoteVal > 0 && available > 0) {
                const maxVol = available / quoteVal; // Buyable
                if (val > maxVol) {
                  input.value = maxVol.toFixed(6);
                  // 键盘输入超限自动纠正,不提示
                }
              }
            }
            
            this.refreshSpreadMetrics(panel || null);
          });
        }
        // Quote 输入框监听:重新计算 buyable 和 data-max-volume
        if (row.dataset && /^quote/i.test(row.dataset.field || '')) {
          input.addEventListener('input', () => {
            const panel = row.closest && row.closest('.order-panel');
            if (panel && this.refreshAvailableAndLimits) {
              this.refreshAvailableAndLimits(panel);
            }
          });
        }
        // Take Profit 输入框监听: 根据Long/Short方向约束
        if (row.dataset && /^tp/i.test(row.dataset.field || '')) {
          input.addEventListener('input', () => {
            const panel = row.closest && row.closest('.order-panel');
            if (!panel) return;
            const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
            const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
            let tp = parseFloat(input.value || '0') || 0;
            if (tp < 0) {
              tp = 0;
              input.value = '0';
            }
            if (tp > 0 && quoteVal > 0) {
              // 判断方向
              const segBtns = panel.querySelectorAll('.order-segment .seg-btn');
              let isLong = true;
              segBtns.forEach(btn => {
                if (btn.classList.contains('active')) isLong = (btn.dataset.side === 'long');
              });
              // 方向约束
              if (isLong) {
                // Long: TP > Quote
                if (tp <= quoteVal) input.value = '0';
              } else {
                // Short: TP < Quote
                if (tp >= quoteVal) input.value = '0';
              }
            }
          });
        }
        // Stop Loss 输入框监听: 根据Long/Short方向约束
        if (row.dataset && /^sl/i.test(row.dataset.field || '')) {
          input.addEventListener('input', () => {
            const panel = row.closest && row.closest('.order-panel');
            if (!panel) return;
            const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
            const quoteVal = quoteInput ? parseFloat(quoteInput.value || '0') || 0 : 0;
            let sl = parseFloat(input.value || '0') || 0;
            if (sl < 0) {
              sl = 0;
              input.value = '0';
            }
            if (sl > 0 && quoteVal > 0) {
              // 判断方向
              const segBtns = panel.querySelectorAll('.order-segment .seg-btn');
              let isLong = true;
              segBtns.forEach(btn => {
                if (btn.classList.contains('active')) isLong = (btn.dataset.side === 'long');
              });
              // 方向约束
              if (isLong) {
                // Long: SL < Quote
                if (sl >= quoteVal) input.value = '0';
              } else {
                // Short: SL > Quote
                if (sl <= quoteVal) input.value = '0';
              }
            }
          });
        }
        // LastPrice 输入框监听:反向计算 Volume = LastPrice ÷ Quote
        if (row.dataset && /^lastPrice/i.test(row.dataset.field || '')) {
          input.addEventListener('input', () => {
            if (this._calculationLock) return;
            this._calculationLock = true;
            try {
              const panel = row.closest && row.closest('.order-panel');
              if (!panel) return;
              
              // 约束: 键盘输入验证 - LastPrice 不能为负,超过Available则=Available
              let lastPrice = parseFloat(input.value || '0') || 0;
              if (lastPrice < 0) {
                lastPrice = 0;
                input.value = '0';
              }
              const available = this.getPanelAvailable ? this.getPanelAvailable(panel) : 0;
              
              // Available=0 时,任何正数输入都不允许
              if (available <= 0 && lastPrice > 0) {
                input.value = '0';
                lastPrice = 0;
                try { (window.ShowToast || console.log)('可用余额为0'); } catch (_) {}
              } else if (lastPrice > available) {
                input.value = available.toFixed(2);
                lastPrice = available;
                // 键盘输入超限自动纠正,不提示
              }
              
              const quoteInput = panel.querySelector('.floating-field[data-field^="quote"] input.num');
              const volumeInput = panel.querySelector('.floating-field[data-field^="volume"] input.num');
              if (quoteInput && volumeInput) {
                const quote = parseFloat(quoteInput.value || '0') || 0;
                if (quote > 0) {
                  const calculatedVolume = lastPrice / quote;
                  // 确保计算出的 Volume 也不超过 Buyable
                  const maxVol = available / quote;
                  const finalVolume = Math.min(calculatedVolume, maxVol);
                  volumeInput.value = finalVolume.toFixed(6);
                  // 同步滑动条位置
                  this.refreshRangePickers && this.refreshRangePickers();
                }
              }
            } finally {
              this._calculationLock = false;
            }
          });
        }
        input.addEventListener('focus', () => {
          row.classList.add('is-focused');
          row.classList.add('field-raised');
          row.classList.remove('field-empty');
        });
        input.addEventListener('blur', () => {
          row.classList.remove('is-focused');
          this.applyFloatingState(row, input);
        });
        row.addEventListener('click', (evt) => {
          if (evt.target && evt.target.closest && evt.target.closest('button.step')) return;
          try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
        });
      });
      this.refreshFloatingFields();
    } catch (e) {
      console.warn('initFloatingFields failed', e);
    }
  },

  applyFloatingState(row, input) {
    try {
      if (!row || !input) return;
      const raw = (input.value || '').trim();
      const numeric = raw === '' ? 0 : Number(raw);
      const isNumber = !Number.isNaN(numeric);
      const isZero = !raw || !isNumber || Math.abs(numeric) < 1e-6;
      const isFocused = document.activeElement === input || row.classList.contains('is-focused');
      const shouldRaise = isFocused || !isZero;
      row.classList.toggle('field-raised', shouldRaise);
      row.classList.toggle('field-empty', !isFocused && isZero);
    } catch (e) {
      console.warn('applyFloatingState failed', e);
    }
  },

  refreshFloatingFields() {
    try {
      const rows = document.querySelectorAll('.floating-field');
      rows.forEach(row => {
        const input = row.querySelector('input.num');
        if (input) this.applyFloatingState(row, input);
      });
    } catch (e) {
      console.warn('refreshFloatingFields failed', e);
    }
  },

  // 动态计算订单簿条数（基于对应右侧操作区域的实际高度）
  updateOrderbookRows() {
    try {
      const contents = document.querySelectorAll('.trade-content');
      let needsDepthRefresh = false;
      contents.forEach(content => {
        const rightColumn = content.querySelector('.trade-right');
        const panel = content.querySelector('.order-panel');
        const bookColumns = content.querySelector('.book-columns');
        if (!bookColumns) return;

        const getVisibleHeight = (node) => {
          if (!node) return 0;
          const rect = node.getBoundingClientRect ? node.getBoundingClientRect().height : 0;
          if (rect > 0) return rect;
          return node.clientHeight || node.offsetHeight || 0;
        };

        const panelHeight = getVisibleHeight(panel);
        const rightHeight = getVisibleHeight(rightColumn);
        const targetHeight = panelHeight || rightHeight;
        if (targetHeight) {
          bookColumns.style.height = targetHeight + 'px';
        } else {
          try { bookColumns.style.removeProperty('height'); } catch (_) { }
        }

        const bookHeader = bookColumns.querySelector('.book-header');
        const bookLast = bookColumns.querySelector('.book-last');
        const headerH = bookHeader ? bookHeader.offsetHeight : 30;
        const lastH = bookLast ? bookLast.offsetHeight : 50;

        const computed = window.getComputedStyle(bookColumns);
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const gapValue = parseFloat(computed.rowGap || computed.gap) || 0;
        const gapCount = Math.max(0, bookColumns.childElementCount - 1);
        const gapTotal = gapValue * gapCount;

        const columnsHeight = targetHeight || bookColumns.offsetHeight || 0;
        const available = Math.max(0, columnsHeight - headerH - lastH - paddingTop - paddingBottom - gapTotal);

        const sampleRow = bookColumns.querySelector('.ob-row');
        const rowH = sampleRow ? (sampleRow.getBoundingClientRect().height || sampleRow.offsetHeight || 20) : 20;
        const computedRows = Math.max(1, Math.floor((available / 2) / rowH));
        const previousRows = Number(bookColumns.dataset.maxRows) || 0;
        let perSide = computedRows;
        if (computedRows <= 1 && previousRows > 1) {
          perSide = previousRows;
        }
        perSide = Math.max(perSide, MIN_ORDERBOOK_ROWS);
        const hardCap = Math.max(MIN_ORDERBOOK_ROWS, this._orderbookRowHardCap || ORDERBOOK_ROW_CAP);
        if (perSide > hardCap) {
          perSide = hardCap;
        }

        bookColumns.dataset.maxRows = String(perSide);
        const sectionIsActive = content.closest('.swiper-slide')?.classList?.contains('active');
        if (sectionIsActive) {
          this._orderbookMaxRows = perSide;
        } else if (!this._orderbookMaxRows) {
          this._orderbookMaxRows = perSide;
        }

        if (!previousRows || perSide !== previousRows) {
          if (this._orderbookHasData && this._lastDepthSnapshot) {
            needsDepthRefresh = true;
          }
        }
        const asksBook = bookColumns.querySelector('.orderbook.asks');
        if (asksBook && !this._orderbookHasData) {
          this.updateBookRows(asksBook, perSide, 'ask');
        }
        const bidsBook = bookColumns.querySelector('.orderbook.bids');
        if (bidsBook && !this._orderbookHasData) {
          this.updateBookRows(bidsBook, perSide, 'bid');
        }
      });
      if (needsDepthRefresh) {
        const symbol = this._activeSymbol || this._defaultSymbol;
        if (symbol) {
          this.renderOrderbookDepthFromStore(symbol);
        }
      }
    } catch (e) {
      console.warn('updateOrderbookRows failed', e);
    }
  },

  // 监听右侧面板高度变化，触发订单簿重算
  observeOrderPanels() {
    try {
      if (typeof ResizeObserver === 'undefined') return;
      const panels = document.querySelectorAll('.trade-content .trade-right, .trade-content .order-panel');
      const ro = new ResizeObserver(() => {
        try { this.updateOrderbookRows(); } catch (_) { }
      });
      panels.forEach(p => ro.observe(p));
      // 存一份以便可能的后续清理（当前页面无需卸载）
      this._orderPanelRO = ro;
    } catch (e) { console.warn('observeOrderPanels failed', e); }
  },

  // 更新订单簿行数
  updateBookRows(bookElement, targetRows, type) {
    try {
      const currentRows = bookElement.querySelectorAll('.ob-row');
      const currentCount = currentRows.length;

      if (currentCount === targetRows) return; // 已经是目标行数

      if (currentCount < targetRows) {
        const rowsToAdd = targetRows - currentCount;
        for (let i = 0; i < rowsToAdd; i++) {
          const row = document.createElement('view');
          row.className = `ob-row ${type === 'ask' ? 'up' : 'down'}`;
          const volumeSeed = Math.random();
          let volumeString;
          if (volumeSeed > 0.8) {
            volumeString = (Math.random() * 0.9 + 0.1).toFixed(2) + 'M';
          } else if (volumeSeed > 0.35) {
            volumeString = Math.floor(Math.random() * 900 + 100) + 'K';
          } else {
            volumeString = (Math.random() * 80 + 5).toFixed(2);
          }
          row.innerHTML = `<text class="quote">3649.0000</text><text class="volume">${volumeString}</text>`;
          if (type === 'ask') {
            bookElement.insertBefore(row, bookElement.firstChild);
          } else {
            bookElement.appendChild(row);
          }
        }
      } else {
        // 需要减少行
        const rowsToRemove = currentCount - targetRows;
        for (let i = 0; i < rowsToRemove; i++) {
          if (type === 'ask') {
            const firstRow = bookElement.querySelector('.ob-row:first-child');
            if (firstRow) firstRow.remove();
          } else {
            const lastRow = bookElement.querySelector('.ob-row:last-child');
            if (lastRow) lastRow.remove();
          }
        }
      }
    } catch (e) {
      console.warn('updateBookRows failed', e);
    }
  },

  initSwiper() {
    // 优先使用本地 vendor（已在构建阶段复制到 dist/pages/webapp/vendor）
    const localCss = '/pages/webapp/vendor/swiper-bundle.min.css';
    const localJs = '/pages/webapp/vendor/swiper-bundle.min.js';
    const cdnCss = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css';
    const cdnJs = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js';

    function loadCss(href) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
      return l;
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve(s);
        s.onerror = () => reject(new Error('load error ' + src));
        document.body.appendChild(s);
      });
    }

    loadCss(localCss);
    (async () => {
      try {
        await loadScript(localJs);
        console.log('Swiper 本地脚本加载成功');
      } catch (eLocal) {
        console.warn('本地 Swiper 加载失败，尝试 CDN:', eLocal && eLocal.message);
        loadCss(cdnCss);
        try {
          await loadScript(cdnJs);
        } catch (eCdn) {
          console.warn('CDN 加载失败，启用回退轮播');
          this.initBasicCarousel();
          return;
        }
      }
      try {
        if (typeof Swiper !== 'undefined') {
          this._bannerSwiper = new Swiper('.banner-swiper-container', {
            loop: true,
            slidesPerView: 1,
            spaceBetween: 8,
            autoplay: { delay: 3000, disableOnInteraction: false },
            pagination: { el: '.swiper-pagination', clickable: true },
            speed: 400
          });
        } else {
          this.initBasicCarousel();
        }
      } catch (eInit) {
        console.warn('Swiper 初始化异常，启用回退:', eInit && eInit.message);
        this.initBasicCarousel();
      }
    })();
  },

  // 轻量轮播回退
  initBasicCarousel() {
    try {
      const container = document.querySelector('.banner-swiper-container');
      if (!container) return;
      const wrapper = container.querySelector('.swiper-wrapper');
      const slides = Array.from(container.querySelectorAll('.swiper-slide'));
      if (!wrapper || !slides || slides.length <= 1) return;

      wrapper.style.display = 'flex';
      wrapper.style.width = `${slides.length * 100}%`;
      wrapper.style.transition = 'transform 0.45s ease';
      wrapper.style.transform = 'translateX(0)';
      slides.forEach(s => { s.style.flex = '0 0 100%'; s.style.boxSizing = 'border-box'; });

      const pagination = container.querySelector('.swiper-pagination');
      if (pagination) {
        pagination.innerHTML = '';
        slides.forEach((_, i) => {
          const b = document.createElement('button');
          b.className = 'basic-bullet';
          b.style.width = '8px'; b.style.height = '8px'; b.style.borderRadius = '50%';
          b.style.margin = '0 4px'; b.style.border = '0';
          b.style.background = i === 0 ? '#fff' : 'rgba(255,255,255,0.6)';
          b.addEventListener('click', () => { currentIndex = i; wrapper.style.transform = `translateX(-${currentIndex * 100}%)`; updateBullets(); });
          pagination.appendChild(b);
        });
      }

      let currentIndex = 0;
      function updateBullets() {
        if (!pagination) return;
        Array.from(pagination.children).forEach((c, ci) => c.style.background = ci === currentIndex ? '#fff' : 'rgba(255,255,255,0.6)');
      }

      setInterval(() => {
        currentIndex = (currentIndex + 1) % slides.length;
        wrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateBullets();
      }, 3000);
    } catch (e) { console.warn('basic carousel failed', e); }
  },

  /* ========== 通用弹窗（底部弹层） ========== */
  initActionSheet() {
    if (this._sheetReady) return;
    try {
      const layer = document.getElementById('action-sheet');
      if (!layer) return;
      this._sheetLayer = layer;
      const menu = layer.querySelector('.sheet-menu');
      const self = this;
      if (menu) {
        menu.addEventListener('click', function (evt) {
          const option = evt.target && evt.target.closest && evt.target.closest('.sheet-option');
          if (!option) return;
          evt.preventDefault();
          self.handleSheetOption(option.dataset && option.dataset.value);
        });
        menu.addEventListener('change', function (evt) {
          const input = evt.target;
          if (!input || !input.classList || !input.classList.contains('sheet-check-input')) return;
          self.handleChecklistToggle(input.value, input.checked);
        });
      }
      this._sheetReady = true;
    } catch (e) {
      console.warn('initActionSheet failed', e);
    }
  },

  openActionSheet(config = {}) {
    try {
      this.initActionSheet();
      const layer = this._sheetLayer || document.getElementById('action-sheet');
      if (!layer) return;
      this._sheetConfig = config;
      const mode = config.mode || 'menu';
      layer.dataset.mode = mode;
      this._sheetSelection = mode === 'checklist'
        ? (Array.isArray(config.selected) ? config.selected.map(item => String(item)) : [])
        : (config.selected || null);
      layer.dataset.theme = config.theme || 'light';

      const titleEl = layer.querySelector('.sheet-title');
      if (titleEl) {
        if (config.titleKey) {
          titleEl.setAttribute('data-i18n', config.titleKey);
          titleEl.textContent = (window.i18n && window.i18n.t) ? window.i18n.t(config.titleKey, config.title || '') : (config.title || '');
        } else {
          titleEl.textContent = config.title || '';
          // 移除旧的 data-i18n 避免覆盖
          try { titleEl.removeAttribute('data-i18n'); } catch (_) { }
        }
      }
      const subEl = layer.querySelector('.sheet-subtitle');
      if (subEl) {
        if (config.subtitleKey) {
          subEl.setAttribute('data-i18n', config.subtitleKey);
          subEl.textContent = (window.i18n && window.i18n.t) ? window.i18n.t(config.subtitleKey, config.subtitle || '') : (config.subtitle || '');
          subEl.style.display = 'block';
        } else {
          subEl.textContent = config.subtitle || '';
          subEl.style.display = config.subtitle ? 'block' : 'none';
          try { subEl.removeAttribute('data-i18n'); } catch (_) { }
        }
      }

      const actions = layer.querySelector('.sheet-actions');
      if (actions) {
        let shouldHide = !!config.hideActions;
        if (mode === 'menu' && config.hideActions === undefined) shouldHide = true;
        actions.classList.toggle('hidden', shouldHide);
      }

      const confirmBtn = layer.querySelector('.sheet-btn.primary');
      if (confirmBtn) {
        if (config.confirmKey) {
          confirmBtn.setAttribute('data-i18n', config.confirmKey);
          confirmBtn.textContent = (window.i18n && window.i18n.t) ? window.i18n.t(config.confirmKey, config.confirmText || '') : (config.confirmText || 'Confirm');
        } else {
          confirmBtn.textContent = config.confirmText || 'Confirm';
          try { confirmBtn.removeAttribute('data-i18n'); } catch (_) { }
        }
      }
      const cancelBtn = layer.querySelector('.sheet-btn.ghost');
      if (cancelBtn) {
        if (config.cancelKey) {
          cancelBtn.setAttribute('data-i18n', config.cancelKey);
          cancelBtn.textContent = (window.i18n && window.i18n.t) ? window.i18n.t(config.cancelKey, config.cancelText || '') : (config.cancelText || 'Cancel');
        } else {
          cancelBtn.textContent = config.cancelText || 'Cancel';
          try { cancelBtn.removeAttribute('data-i18n'); } catch (_) { }
        }
      }

      // 如果使用了 i18n key，尝试重新应用（支持语言切换时实时更新）
      if (window.i18n && typeof window.i18n.apply === 'function' && (config.titleKey || config.subtitleKey || config.confirmKey || config.cancelKey)) {
        try { window.i18n.apply(); } catch (_) { }
      }

      this.renderSheetMenu(config.options || [], mode);
      this.renderSheetAlert(config);

      requestAnimationFrame(() => {
        layer.classList.add('visible');
        layer.setAttribute('aria-hidden', 'false');
      });
    } catch (e) {
      console.warn('openActionSheet failed', e);
    }
  },

  renderSheetMenu(options = [], mode = 'menu') {
    try {
      const layer = this._sheetLayer;
      if (!layer) return;
      const list = layer.querySelector('.sheet-menu');
      if (!list) return;
      if (!options.length) {
        list.innerHTML = '';
        return;
      }
      if (mode === 'checklist') {
        list.innerHTML = this.renderSheetChecklist(options);
        return;
      }
      const html = options.map(opt => {
        const label = (window.i18n && opt.labelKey && window.i18n.t) ? window.i18n.t(opt.labelKey, opt.label) : opt.label;
        const desc = (window.i18n && opt.descKey && window.i18n.t) ? window.i18n.t(opt.descKey, opt.desc || '') : (opt.desc || '');
        const meta = (window.i18n && opt.metaKey && window.i18n.t) ? window.i18n.t(opt.metaKey, opt.meta || '') : (opt.meta || '');
        const iconAlt = (window.i18n && opt.iconAltKey && window.i18n.t) ? window.i18n.t(opt.iconAltKey, opt.iconAlt || '') : (opt.iconAlt || '');
        const classes = ['sheet-option'];
        if (opt.icon) classes.push('has-icon');
        return `
        <button class="${classes.join(' ')}" type="button" data-value="${opt.value}">
          ${opt.icon ? `<span class="sheet-option-icon-wrap"><img class="sheet-option-icon" src="${opt.icon}" alt="${iconAlt}" ${opt.iconAltKey ? `data-i18n-alt="${opt.iconAltKey}"` : ''} /></span>` : ''}
          <div class="sheet-option-main">
            <span class="sheet-option-title" ${opt.labelKey ? `data-i18n="${opt.labelKey}"` : ''}>${label}</span>
            ${desc ? `<span class="sheet-option-desc" ${opt.descKey ? `data-i18n="${opt.descKey}"` : ''}>${desc}</span>` : ''}
          </div>
          ${meta ? `<span class="sheet-option-meta" ${opt.metaKey ? `data-i18n="${opt.metaKey}"` : ''}>${meta}</span>` : (opt.badge ? `<span class="sheet-option-badge">${opt.badge}</span>` : '')}
        </button>`;
      }).join('');
      list.innerHTML = html;
      if (window.i18n && typeof window.i18n.apply === 'function') {
        try { window.i18n.apply(); } catch (_) { }
      }
    } catch (e) {
      console.warn('renderSheetMenu failed', e);
    }
  },

  renderSheetChecklist(options = []) {
    const selection = Array.isArray(this._sheetSelection) ? this._sheetSelection : [];
    return options.map(opt => {
      const normalized = String(opt.value);
      const checked = selection.includes(normalized);
      const label = (window.i18n && opt.labelKey && window.i18n.t) ? window.i18n.t(opt.labelKey, opt.label) : opt.label;
      const desc = (window.i18n && opt.descKey && window.i18n.t) ? window.i18n.t(opt.descKey, opt.desc || '') : (opt.desc || '');
      return `
        <label class="sheet-check-option">
          <input class="sheet-check-input" type="checkbox" value="${normalized}" ${checked ? 'checked' : ''} />
          <span class="sheet-check-mark"></span>
          <div class="sheet-check-body">
            <span class="sheet-check-title" ${opt.labelKey ? `data-i18n="${opt.labelKey}"` : ''}>${label}</span>
            ${desc ? `<span class="sheet-check-desc" ${opt.descKey ? `data-i18n="${opt.descKey}"` : ''}>${desc}</span>` : ''}
          </div>
          ${opt.badge ? `<span class="sheet-check-badge">${opt.badge}</span>` : ''}
        </label>
      `;
    }).join('');
  },

  /* ====== 市场行情实时订阅 ====== */
  initMarketsQuotes() {
    console.log('[initMarketsQuotes] 初始化行情订阅...');
    if (this._marketsQuotesInit) {
      console.log('[initMarketsQuotes] 已经初始化过，跳过');
      return;
    }
    this._marketsQuotesInit = true;
    this._marketsLiveQuotes = {};
    console.log('[initMarketsQuotes] 开始初始化数据通道');
    this.initMarketsDataChannel();
  },

  async initMarketsDataChannel() {
    try {
      console.log('[initMarketsDataChannel] 创建 WebSocket 连接...');
      // 优先使用全局 MarketsStore，避免多处页面各自建立连接
      if (window.MarketsStore) {
        await window.MarketsStore.init();
        // 监听全局行情更新，复用现有渲染逻辑
        if (!this._storeUpdateBound) {
          window.MarketsStore.on('update', (symbol, quote) => {
            // 统一从全局 Store 读取，触发完整刷新逻辑（复用 applyMarketsQuote 的所有逻辑）
            try {
              // 直接调用 applyMarketsQuote，它内部已包含所有页面的 UI 更新逻辑
              this.applyMarketsQuote && this.applyMarketsQuote(quote);
            } catch (e) {
              console.warn('[MarketsStore update] applyMarketsQuote failed', e);
            }
            // 处理深度数据更新
            if (quote && quote.depth) {
              console.log('[MarketsStore update] 收到深度数据', symbol, 'activeSymbol:', this._activeSymbol, 'depth:', quote.depth);
              if (symbol === this._activeSymbol) {
                try {
                  this.renderOrderbookDepthFromStore(symbol);
                } catch (e) {
                  console.warn('[MarketsStore update] renderOrderbookDepthFromStore failed', e);
                }
              }
            }
          });
          // ready 后同步订阅
          window.MarketsStore.on('ready', () => this.syncMarketsSubscriptions());
          this._storeUpdateBound = true;
        }
        const sock = window.MarketsStore.getSocket();
        if (sock && sock.isReady && sock.isReady()) {
          this.syncMarketsSubscriptions();
        }
        return;
      }
      // 兼容：无全局缓存时，退回页面内私有 Socket（旧实现）
      const socket = await this.ensureMarketsSocket();
      if (socket) {
        console.log('[initMarketsDataChannel] WebSocket 连接成功，等待认证完成再同步订阅');
        if (socket.isReady && typeof socket.isReady === 'function' && socket.isReady()) {
          console.log('[initMarketsDataChannel] Socket 已处于 ready，立即同步订阅');
          this.syncMarketsSubscriptions();
        }
      } else {
        console.warn('[initMarketsDataChannel] WebSocket 连接失败');
      }
    } catch (err) {
      console.error('[initMarketsDataChannel] 错误:', err);
      console.warn('initMarketsDataChannel failed', err);
    }
  },

  async ensureMarketsSocket(forceReconnect) {
    try {
      // 若存在全局缓存，则直接复用其 socket，避免重复连接
      if (window.MarketsStore) {
        await window.MarketsStore.init();
        return window.MarketsStore.getSocket();
      }
      if (this._marketsSocket && this._marketsSocket.isReady() && !forceReconnect) {
        return this._marketsSocket;
      }
      const creds = await this.resolveMarketsCredentials();
      if (!creds) {
        console.warn('缺少行情鉴权信息，无法建立 WebSocket');
        return null;
      }
      const endpoint = this.getMarketsEndpoint(creds.apiKey); // No change
      if (!endpoint) {
        console.warn('未配置行情 WebSocket 入口');
        return null;
      }
      if (this._marketsSocket) {
        try { this._marketsSocket.disconnect(); } catch (_) { }
        this._marketsSocket = null;
      }
      if (typeof window.MarketsSocket !== 'function') {
        console.warn('MarketsSocket helper 未加载');
        return null;
      }
      // 架构约束：禁止直连 data.infoway.io，所有地址统一按 internal 中继处理
      const provider = 'internal';
      const cryptoMode = 'no'; // 先验证基础鉴权，后续如需开启加密再调整
      const socket = new window.MarketsSocket({
        endpoint,
        cryptoMode,
        business: 'common',
        provider,
        reconnect: true,
        useInfowayProtocol: true, // 启用 Infoway 顶层 code 协议格式兼容订阅
        debug: true,
        onStateChange: (state, detail) => this.handleMarketsStateChange(state, detail),
        onData: (payload, raw) => this.handleMarketsPayload(payload, raw),
        onError: (err) => this.handleMarketsError(err)
      });
      console.log('[ensureMarketsSocket] 创建 MarketsSocket 实例', { endpoint, provider, cryptoMode });
      socket.connect(creds);
      this._marketsSocket = socket;
      return socket;
    } catch (err) {
      console.warn('ensureMarketsSocket failed', err);
      return null;
    }
  },

  async resolveMarketsCredentials() {
    try {
      const userAccount = sessionStorage.getItem('u') || localStorage.getItem('userAccount') || '';
      let apiKey = sessionStorage.getItem('k') || '';
      const hashedPwd = sessionStorage.getItem('p');
      if (!apiKey) {
        const cipher = localStorage.getItem('apiKey');
        if (cipher && hashedPwd) {
          try {
            if (typeof Decrypt === 'function') {
              apiKey = await Decrypt(cipher, hashedPwd, hashedPwd.substring(0, 12));
            } else if (typeof window.Decrypt === 'function') {
              apiKey = await window.Decrypt(cipher, hashedPwd, hashedPwd.substring(0, 12));
            }
          } catch (err) {
            console.warn('apiKey 解密失败', err);
          }
        }
      }
      let finalAccount = userAccount;
      let finalKey = apiKey;

      // 已移除临时测试凭证回落逻辑；缺失直接返回 null 让调用方处理

      if (!finalAccount || !finalKey) return null;
      return { userAccount: finalAccount, apiKey: finalKey };
    } catch (err) {
      console.warn('resolveMarketsCredentials failed', err);
      return null;
    }
  },

  getMarketsEndpoint(apiKey) {
    try {
      const business = 'common';
      const internalEndpoint = 'wss://www.ice-markets-app.com/infoway-websocket';
      const api = (window.APP_CONFIG && window.APP_CONFIG.api) || {};
      const configured = api.marketWsUrl || api.wsUrl || '';
      const officialBase = 'wss://data.infoway.io/ws';
      if (!apiKey) return '';
      if (configured && /data\.infoway\.io\/ws/i.test(configured)) {
        // 配置明确要求直连 Infoway，补齐 query 参数
        const baseNoQuery = configured.split('?')[0];
        return `${baseNoQuery}?business=${encodeURIComponent(business)}&apikey=${encodeURIComponent(apiKey)}`;
      }
      if (configured) {
        return configured;
      }
      // 默认强制走自家中继，避免占用第三方连接数
      return internalEndpoint;
    } catch (e) { console.warn('[getMarketsEndpoint] 构造行情 WS 地址失败', e); }
    return '';
  },

  refreshMarketsQuotes() {
    this.syncMarketsSubscriptions();
  },

  syncMarketsSubscriptions() {
    try {
      console.log('[syncMarketsSubscriptions] 开始同步订阅列表...');
      const favorites = this.getMarketsFavorites();
      const fallback = (this._marketsAllSymbols || []).map(item => item.value);
      const symbols = (favorites && favorites.length ? favorites.slice() : fallback.slice());
      if (this._activeSymbol && symbols.indexOf(this._activeSymbol) === -1) {
        symbols.push(this._activeSymbol);
      }
      const unique = Array.from(new Set(symbols.filter(Boolean)));
      console.log('[syncMarketsSubscriptions] 订阅交易对列表:', unique);
      this._marketsPendingSymbols = unique;
      // 诊断：输出当前 socket 状态与凭证
      try {
        const sock = window.MarketsStore ? window.MarketsStore.getSocket && window.MarketsStore.getSocket() : this._marketsSocket;
        if (sock) {
          console.log('[syncMarketsSubscriptions:diag] socket authenticated?', !!sock.authenticated, 'ready?', !!(sock.isReady && sock.isReady()), 'activeSubscription?', !!sock.activeSubscription, 'lastSubscribedCodes:', sock.lastSubscribedCodes);
        } else {
          console.log('[syncMarketsSubscriptions:diag] no socket instance yet');
        }
      } catch (_) { }
      // 业务类型推断：仅使用后端认可的 stock/crypto/common；外汇 6 位也归到 common
      const inferBusiness = (list) => {
        if (!list || !list.length) return 'common';
        const sample = (list[0] || '').toUpperCase();
        if (/\.US$|\.HK$|\.SZ$|\.SH$/.test(sample)) return 'stock';
        if (/USDT$|USDC$|BTC$|ETH$/.test(sample)) return 'crypto';
        // 外汇 6 位如 EURUSD: 后端不支持 "forex" 业务类型，统一归类为 common
        return 'common';
      };
      const business = inferBusiness(unique);
      if (window.MarketsStore) {
        window.MarketsStore.subscribe(unique);
      } else if (this._marketsSocket && typeof this._marketsSocket.updateWatchlist === 'function') {
        console.log('[syncMarketsSubscriptions] 发送订阅请求到 WebSocket');
        this._marketsSocket.updateWatchlist(unique, {
          business,
          needDepth: true,
          depthLevels: this._depthLevels,
          needKline: true,
          klineCodes: unique.slice()
        });
      } else {
        // 改为低噪声信息：socket 尚未就绪，订阅列表已暂存，等待 ready 回调再发送
        console.log('[syncMarketsSubscriptions] WebSocket 尚未就绪，延迟订阅 (will flush on ready)');
      }
      try { this.primeDailyPrevClose && this.primeDailyPrevClose(unique, { business }); } catch (dailyErr) { console.warn('[syncMarketsSubscriptions] daily baseline failed', dailyErr); }
      // 若已鉴权但仍未发送订阅（activeSubscription 未标记），触发一次强制重试
      setTimeout(() => {
        try {
          const sock = window.MarketsStore ? (window.MarketsStore.getSocket && window.MarketsStore.getSocket()) : this._marketsSocket;
          if (sock && sock.authenticated && sock.isReady && sock.isReady()) {
            if (!sock.activeSubscription || !sock.lastSubscribedCodes) {
              console.warn('[syncMarketsSubscriptions:force] 检测到未产生订阅帧，强制重发');
              if (typeof sock.updateWatchlist === 'function') {
                sock.updateWatchlist(unique, { business, needDepth: true, depthLevels: this._depthLevels, needKline: true, klineCodes: unique.slice() });
              }
            }
          }
        } catch (forceErr) { console.warn('[syncMarketsSubscriptions:force] 重试失败', forceErr); }
      }, 1200);
      // 启动行情健康监控：无增量 15s 视为 stale，触发重订阅
      this.startMarketsHealthMonitor && this.startMarketsHealthMonitor();
    } catch (err) {
      console.error('[syncMarketsSubscriptions] 错误:', err);
      console.warn('syncMarketsSubscriptions failed', err);
    }
  },

  handleMarketsStateChange(state) {
    try {
      console.log('[handleMarketsStateChange] WebSocket 状态变化:', state);
      this._marketsState = state;
      if (state === 'ready' && this._marketsSocket) {
        // ready 事件触发后才允许首次订阅，避免 4001 未认证错误
        const symbols = this._marketsPendingSymbols || this.getMarketsFavorites() || [];
        if (symbols && symbols.length) {
          console.log('[handleMarketsStateChange] WebSocket 就绪，发送订阅列表:', symbols);
          if (typeof this._marketsSocket.updateWatchlist === 'function') {
            // 根据最新列表推断业务类型并附带深度+K线订阅
            const biz = (() => {
              const s = (symbols[0] || '').toUpperCase();
              if (/\.US$|\.HK$|\.SZ$|\.SH$/.test(s)) return 'stock';
              if (/USDT$|USDC$|BTC$|ETH$/.test(s)) return 'crypto';
              // 其它（包括 6 位外汇）归类为 common
              return 'common';
            })();
            this._marketsSocket.updateWatchlist(symbols, { business: biz, needDepth: true, depthLevels: this._depthLevels, needKline: true, klineCodes: symbols.slice() });
            // 诊断：1.5 秒后检查是否成功标记 activeSubscription，否则再次尝试
            this.primeInitialMarketsData(symbols, { business: biz });
            setTimeout(() => {
              try {
                if (this._marketsSocket && this._marketsSocket.authenticated) {
                  if (!this._marketsSocket.activeSubscription) {
                    console.warn('[handleMarketsStateChange:retry] 未检测到订阅成功标记，重试 updateWatchlist');
                    this._marketsSocket.updateWatchlist(symbols, { business: biz, needDepth: true, depthLevels: this._depthLevels, needKline: true, klineCodes: symbols.slice() });
                  }
                }
              } catch (retryErr) { console.warn('[handleMarketsStateChange:retry] 重试失败', retryErr); }
            }, 1500);
          } else {
            console.warn('[handleMarketsStateChange] 缺少 updateWatchlist 方法');
          }
        } else {
          console.log('[handleMarketsStateChange] 无待订阅的交易对');
        }
      }
    } catch (err) {
      console.error('[handleMarketsStateChange] 错误:', err);
      console.warn('handleMarketsStateChange failed', err);
    }
  },


  // 首次订阅后立即通过 HTTP 拉取近期 K线 + 成交明细预热缓存，提高“空白等待”期间的体验
  async primeInitialMarketsData(symbols, opts = {}) {
    try {
      if (!Array.isArray(symbols) || !symbols.length) return;
      if (this._initialMarketsPrimed) return; // 仅执行一次
      const client = await this.ensureInfowayHttpClient();
      if (!client) return;
      const business = opts.business || 'common';
      const slice = symbols.slice(0, 10); // 控制并发，避免首屏压测
      console.log('[primeInitialMarketsData] HTTP Priming 开始 (symbols=', slice, ', business=', business, ')');
      const kType = 1; // 初次统一使用 1m 周期
      // 优先批量请求 K线；若失败回退单独请求
      let candlePayload = [];
      try {
        candlePayload = await client.getCandles({ symbols: slice.join(','), klineType: kType, klineNum: 2 }, { business });
      } catch (batchErr) {
        console.warn('[primeInitialMarketsData] 批量 K线请求失败，逐个回退', batchErr);
        for (let i = 0; i < slice.length; i++) {
          const sym = slice[i];
          try {
            const one = await client.getCandles({ symbols: sym, klineType: kType, klineNum: 2 }, { business });
            if (Array.isArray(one)) candlePayload = candlePayload.concat(one);
          } catch (oneErr) { console.warn('[primeInitialMarketsData] 单个 K线失败', sym, oneErr); }
        }
      }
      if (Array.isArray(candlePayload)) {
        candlePayload.forEach(entry => {
          if (!entry || !entry.s || !entry.respList || !entry.respList.length) return;
          const latest = entry.respList[0];
          // 将最新一根映射为行情快照供 favorites 与首页使用
          const quote = {
            s: entry.s,
            c: latest.c,
            h: latest.h,
            l: latest.l,
            o: latest.o,
            v: latest.v,
            t: Number(latest.t) || Date.now(),
            ty: kType,
            last: parseFloat(latest.c)
          };
          this.applyMarketsQuote(quote);
          try {
            if (window.MarketsStore && window.MarketsStore.primeKlinesFromHttp) {
              const normalizeTf = window.MarketsStore.normalizeTimeframeKey || (tf => (typeof tf === 'number' ? tf + 'm' : (tf || '1m')));
              window.MarketsStore.primeKlinesFromHttp(entry.s, entry.respList, normalizeTf(kType));
            }
          } catch (_) { }
        });
      }
      // 获取最近成交 (批量 getTrades 支持逗号列表)
      let tradesPayload = [];
      try {
        tradesPayload = await client.getTrades(slice, { business });
      } catch (trErr) { console.warn('[primeInitialMarketsData] 批量成交请求失败', trErr); }
      if (Array.isArray(tradesPayload)) {
        try { if (window.MarketsStore && typeof window.MarketsStore.primeQuotesFromTrades === 'function') { window.MarketsStore.primeQuotesFromTrades(tradesPayload); } } catch (_) { }
      }
      let depthPayload = [];
      try {
        depthPayload = await client.getDepth(slice, { business, depthLevels: this._depthLevels });
      } catch (depthErr) { console.warn('[primeInitialMarketsData] 批量深度请求失败', depthErr); }
      if (Array.isArray(depthPayload)) {
        depthPayload.forEach(entry => this.applyDepthSnapshot(entry));
      }
      this._initialMarketsPrimed = true;
      console.log('[primeInitialMarketsData] HTTP Priming 完成');
      try { this.primeDailyPrevClose && this.primeDailyPrevClose(slice, { business }); } catch (dailyErr) { console.warn('[primeInitialMarketsData] daily baseline failed', dailyErr); }
    } catch (err) {
      console.warn('[primeInitialMarketsData] 失败', err);
    }
  },

  async primeDailyPrevClose(symbols, opts = {}) {
    try {
      const rawList = Array.isArray(symbols) ? symbols : [];
      if (!rawList.length) return;
      const unique = Array.from(new Set(rawList.map(sym => String(sym || '').trim()).filter(Boolean)));
      if (!unique.length) return;
      if (!this._dailyBaselineAt) this._dailyBaselineAt = Object.create(null);
      if (!this._dailyBaselineInFlight) this._dailyBaselineInFlight = new Set();
      const now = Date.now();
      const pending = unique.filter(sym => {
        const lastPrime = this._dailyBaselineAt[sym] || 0;
        if ((now - lastPrime) < DAILY_BASELINE_TTL) return false;
        if (this._dailyBaselineInFlight.has(sym)) return false;
        this._dailyBaselineInFlight.add(sym);
        return true;
      });
      if (!pending.length) return;
      const client = opts.client || await this.ensureInfowayHttpClient();
      if (!client || typeof client.getCandles !== 'function') {
        pending.forEach(sym => this._dailyBaselineInFlight.delete(sym));
        return;
      }
      const business = opts.business || 'common';
      const batchSize = Math.max(1, Math.min(opts.batchSize || 5, 10));
      const unwrapEntries = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (payload && Array.isArray(payload.data)) return payload.data;
        if (payload && Array.isArray(payload.list)) return payload.list;
        if (payload && Array.isArray(payload.items)) return payload.items;
        return [];
      };
      const extractBars = (entry) => {
        if (!entry) return [];
        if (Array.isArray(entry.respList)) return entry.respList;
        if (Array.isArray(entry.klineList)) return entry.klineList;
        if (Array.isArray(entry.list)) return entry.list;
        if (Array.isArray(entry.data)) return entry.data;
        return [];
      };
      const finalizeSymbol = (sym, ok) => {
        if (!sym) return;
        if (ok) {
          this._dailyBaselineAt[sym] = Date.now();
        }
        if (this._dailyBaselineInFlight) this._dailyBaselineInFlight.delete(sym);
        if (!ok && this._dailyBaselineAt && !this._dailyBaselineAt[sym]) {
          delete this._dailyBaselineAt[sym];
        }
      };
      const fetchBatch = async (batch) => {
        if (!batch.length) return;
        let resp = null;
        try {
          resp = await client.getCandles({ symbols: batch.join(','), klineType: 8, klineNum: 2 }, { business });
        } catch (batchErr) {
          console.warn('[primeDailyPrevClose] batch request failed', batch, batchErr);
        }
        let entries = unwrapEntries(resp);
        if (!entries.length) {
          for (let i = 0; i < batch.length; i += 1) {
            const sym = batch[i];
            let singleResp = null;
            try {
              singleResp = await client.getCandles({ symbols: sym, klineType: 8, klineNum: 2 }, { business });
            } catch (singleErr) {
              console.warn('[primeDailyPrevClose] single request failed', sym, singleErr);
            }
            entries = entries.concat(unwrapEntries(singleResp));
          }
        }
        const seen = new Set();
        entries.forEach(entry => {
          const sym = entry && entry.s;
          if (!sym) return;
          seen.add(sym);
          const bars = extractBars(entry);
          if (!bars.length) {
            finalizeSymbol(sym, false);
            return;
          }
          let primed = false;
          try {
            if (window.MarketsStore && typeof window.MarketsStore.primeKlinesFromHttp === 'function') {
              window.MarketsStore.primeKlinesFromHttp(sym, bars, '1d');
              // 利用日 K 一次性初始化交易日级别快照 (6.1~6.4)
              if (typeof window.MarketsStore.primeDailySnapshotFromKlines === 'function') {
                window.MarketsStore.primeDailySnapshotFromKlines(sym, bars, null);
              }
              primed = true;
            }
          } catch (storeErr) {
            console.warn('[primeDailyPrevClose] store prime failed', sym, storeErr);
          }
          if (!primed) {
            this.applyDailyBaselineFallback(sym, bars);
          }
          finalizeSymbol(sym, true);
        });
        batch.forEach(sym => {
          if (!seen.has(sym)) finalizeSymbol(sym, false);
        });
      };
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        await fetchBatch(batch);
      }
    } catch (err) {
      console.warn('[primeDailyPrevClose] failed', err);
    }
  },

  applyDailyBaselineFallback(symbol, bars) {
    try {
      if (!symbol || !Array.isArray(bars) || !bars.length) return;
      const latest = bars[0] || null;
      let prevBar = null;
      for (let i = 1; i < bars.length; i += 1) {
        const candidate = bars[i];
        if (candidate && this.pickNumeric(candidate.c ?? candidate.close) != null) {
          prevBar = candidate;
          break;
        }
      }
      if (!latest || !prevBar) return;
      const lastClose = this.pickNumeric(latest.c ?? latest.close);
      const prevClose = this.pickNumeric(prevBar.c ?? prevBar.close);
      if (!Number.isFinite(lastClose) || !Number.isFinite(prevClose)) return;
      const diff = lastClose - prevClose;
      const pct = prevClose ? (diff / prevClose) * 100 : null;
      if (!this._marketsLiveQuotes) this._marketsLiveQuotes = {};
      const prevQuote = this._marketsLiveQuotes[symbol] || {};
      const ts = Number(latest.t || latest.time || latest.ts);
      const merged = Object.assign({}, prevQuote, {
        last: Number.isFinite(prevQuote.last) ? prevQuote.last : lastClose,
        prev: prevClose,
        diff,
        pct,
        updatedAt: Number.isFinite(ts) ? ts : (prevQuote.updatedAt || Date.now())
      });
      this._marketsLiveQuotes[symbol] = merged;
      try { this.updateFavoritesPriceRows && this.updateFavoritesPriceRows(); } catch (_) { }
      try { this.renderHomeActiveRows && this.renderHomeActiveRows(this._homeActiveSymbols); } catch (_) { }
      if (symbol === this._activeSymbol) {
        try { this.updateActiveSymbolQuote && this.updateActiveSymbolQuote(merged); } catch (_) { }
      }
    } catch (err) {
      console.warn('[applyDailyBaselineFallback] failed', err);
    }
  },
  // 行情健康监控：检测最近一次行情增量时间，若超过阈值重发订阅
  startMarketsHealthMonitor() {
    try {
      if (this._marketsHealthTimer) return; // 已启动
      this._marketsLastQuoteAt = Date.now();
      this._marketsHealthTimer = setInterval(() => {
        try {
          const now = Date.now();
          // 从缓存中推断最新更新时间
          if (this._marketsLiveQuotes) {
            for (const k in this._marketsLiveQuotes) {
              const q = this._marketsLiveQuotes[k];
              if (q && q.updatedAt && q.updatedAt > (this._marketsLastQuoteAt || 0)) {
                this._marketsLastQuoteAt = q.updatedAt;
              }
            }
          }
          const staleMs = now - (this._marketsLastQuoteAt || 0);
          if (staleMs > 15000) { // 15s 未收到增量视为异常
            console.warn('[marketsHealth] 15s 无增量，触发重订阅 (staleMs=', staleMs, ')');
            try { this.syncMarketsSubscriptions(); } catch (_) { }
          }
          // 若超过 60s 无任何增量，可能休市：启动 HTTP K 线轮询降级
          if (staleMs > 60000) {
            if (!this._closedMarketPolling) {
              console.warn('[marketsHealth] 60s 无增量，启动休市 HTTP 轮询降级');
              this.startClosedMarketPolling();
            }
          } else {
            // 一旦恢复(<=60s)，停止降级轮询
            if (this._closedMarketPolling) {
              console.log('[marketsHealth] 行情恢复，停止休市轮询');
              this.stopClosedMarketPolling();
            }
          }
        } catch (loopErr) { console.warn('[marketsHealth] loopErr', loopErr); }
      }, 5000); // 每 5s 检查一次
      console.log('[marketsHealth] 已启动行情健康监控');
    } catch (e) { console.warn('[marketsHealth] 启动失败', e); }
  },

  // 休市降级：HTTP batch_kline 轮询最近K线数据，补充界面显示
  startClosedMarketPolling() {
    if (this._closedMarketPolling) return;
    this._closedMarketPolling = true;
    this._closedMarketPollTimer = setInterval(() => {
      try {
        const watch = this.getMarketsFavorites ? (this.getMarketsFavorites() || []) : [];
        const symbols = watch.slice(0, 5); // 限制最大并发，避免频率超限
        if (!symbols.length) return;
        this.ensureInfowayHttpClient().then(client => {
          if (!client || !client.getCandles) return;
          const klineType = (this._marketsSocket && this._marketsSocket.watchOptions && this._marketsSocket.watchOptions.klineType) || 1;
          client.getCandles({ symbols: symbols.join(','), klineType: klineType, klineNum: 2 }).then(resp => {
            if (!resp || !resp.data) return;
            try {
              resp.data.forEach(entry => {
                if (!entry || !entry.s || !entry.respList || !entry.respList.length) return;
                const latest = entry.respList[0];
                // 转换为 applyMarketsQuote 可识别结构
                const quote = {
                  s: entry.s,
                  c: latest.c,
                  h: latest.h,
                  l: latest.l,
                  o: latest.o,
                  v: latest.v,
                  t: Number(latest.t) || Date.now(),
                  ty: klineType,
                  last: parseFloat(latest.c)
                };
                this.applyMarketsQuote(quote);
              });
            } catch (appErr) { console.warn('[closedMarketPolling] apply error', appErr); }
          }).catch(err => {
            console.warn('[closedMarketPolling] getCandles error', err && err.message);
          });
        });
      } catch (err) { console.warn('[closedMarketPolling] loop error', err); }
    }, 20000); // 20s 间隔
    console.log('[closedMarketPolling] started');
  },

  stopClosedMarketPolling() {
    if (this._closedMarketPollTimer) {
      clearInterval(this._closedMarketPollTimer);
      this._closedMarketPollTimer = null;
    }
    this._closedMarketPolling = false;
    console.log('[closedMarketPolling] stopped');
  },

  handleMarketsPayload(payload) {
    try {
      console.log('[handleMarketsPayload] 收到 WebSocket 数据:', payload);
      if (!payload) return;
      const code = Number(payload.code || payload.type || 0);
      const dataBlock = payload.data !== undefined ? payload.data : payload;
      if (code === 10005) {
        this.consumeDepthPayload(dataBlock);
        return;
      }
      const dispatchArray = (arr) => {
        if (!Array.isArray(arr)) return false;
        arr.forEach(item => this.applyMarketsQuote(item));
        return true;
      };
      if (dispatchArray(dataBlock)) return;
      if (dataBlock && Array.isArray(dataBlock.list)) {
        dispatchArray(dataBlock.list);
        return;
      }
      if (dataBlock && Array.isArray(dataBlock.items)) {
        dispatchArray(dataBlock.items);
        return;
      }
      if (code === 20000 || code === 20002 || typeof dataBlock === 'object') {
        this.applyMarketsQuote(dataBlock);
      }
    } catch (err) {
      console.warn('handleMarketsPayload failed', err);
    }
  },

  consumeDepthPayload(payload) {
    try {
      if (!payload) return;
      const entries = [];
      const seen = new Set();
      const traverse = (node) => {
        if (node == null) return;
        if (Array.isArray(node)) {
          node.forEach(item => traverse(item));
          return;
        }
        if (typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node.list)) traverse(node.list);
        if (Array.isArray(node.items)) traverse(node.items);
        if (Array.isArray(node.arr)) traverse(node.arr);
        if (node.data && node.data !== node) traverse(node.data);
        if (node.entry) traverse(node.entry);
        if (node.s || node.symbol) entries.push(node);
      };
      traverse(payload);
      if (!entries.length && payload && (payload.s || payload.symbol)) {
        entries.push(payload);
      }
      entries.forEach(entry => this.applyDepthSnapshot(entry));
    } catch (err) {
      console.warn('consumeDepthPayload failed', err);
    }
  },

  handleMarketsError(err) {
    console.warn('Markets socket error', err);
  },

  applyMarketsQuote(quote) {
    if (!quote) return;
    const symbol = quote.s || quote.symbol || quote.code;
    if (!symbol) return;
    if (!this._marketsLiveQuotes) this._marketsLiveQuotes = {};
    const prevMetrics = this._marketsLiveQuotes[symbol];
    const rawLast = this.pickNumeric(
      quote && (quote.last ?? quote.p ?? quote.price ?? quote.close ?? quote.c)
    );
    const rawDiff = this.pickNumeric(quote && (quote.diff ?? quote.pca ?? quote.changeAbs));
    const rawPct = this.pickNumeric(quote && (quote.pct ?? quote.pc ?? quote.changePct ?? quote.percent ?? quote.changePercent));
    const shouldIgnoreZero = rawLast === 0 && prevMetrics && isFinite(prevMetrics.last) && prevMetrics.last !== 0 && rawDiff == null && rawPct == null;
    if (shouldIgnoreZero) {
      console.warn('[applyMarketsQuote] 忽略 0 行情，保留上一笔', symbol);
      try { this._scheduleHomeMissingRecovery && this._scheduleHomeMissingRecovery(); } catch (_) { }
      return;
    }
    const metrics = this.buildQuoteMetrics(symbol, quote, prevMetrics);
    if (metrics.last == null) return;
    metrics.updatedAt = quote.t || quote.ts || Date.now();
    this.clearSymbolUnsupported(symbol);
    this._marketsLastQuoteAt = metrics.updatedAt; // 更新健康标记
    this.updateFavoritesPriceRows();
    // 更新首页"最活跃"行情
    this.renderHomeActiveRows(this._homeActiveSymbols);
    if (symbol === this._activeSymbol) {
      // 1. 更新交易页顶部即时价格块
      try { this.updateActiveSymbolQuote(metrics); } catch (_) { }
      // 2. 若当前快照缺失或陈旧(>5s)，用 tick 构造一个轻量快照并刷新订单簿 last 块
      const now = Date.now();
      const stale = !this._activeSnapshot || !Number.isFinite(this._activeSnapshot.last) || !this._activeSnapshot.updatedAt || (now - this._activeSnapshot.updatedAt) > 5000;
      if (stale) {
        try {
          this.updateTradeSnapshot({ c: metrics.last, last: metrics.last, o: metrics.prev, pca: metrics.diff, pc: metrics.pct }, { fromTick: true });
        } catch (e) { console.warn('[applyMarketsQuote] tick-based tradeSnapshot refresh failed', e); }
      } else {
        // 仅刷新价格块与涨跌，不动 open/high/low（保持 candle 结果）
        try { this.updateTradePriceBlock(metrics.last, metrics.diff, metrics.pct); this.updateTradeHeaderChange(metrics.pct); } catch (e) { console.warn('[applyMarketsQuote] realtime trade UI refresh failed', e); }
      }
    }
    try { this._schedulePrimeCacheSave && this._schedulePrimeCacheSave(); } catch (_) { }
  },

  updateFavoritesPriceRows() {
    try {
      const panel = document.getElementById('markets-watchlist');
      if (!panel) return;
      const rows = panel.querySelectorAll('.active-row');
      rows.forEach(row => {
        const sym = row.dataset.symbol;
        let base = null;
        try { if (window.MarketsStore && typeof window.MarketsStore.getQuote === 'function') base = window.MarketsStore.getQuote(sym); } catch (_) { }
        this.updateRowClosedTag(row, sym);
        const priceEl = row.querySelector('.price-main');
        const changeEl = row.querySelector('.price-change');
        const pctEl = row.querySelector('.percent-badge');
        const metrics = base ? this.buildQuoteMetrics(sym, base.raw || base, base) : null;
        if (!metrics || !isFinite(metrics.last)) {
          if (priceEl) priceEl.textContent = '--';
          if (changeEl) {
            changeEl.textContent = '--';
            changeEl.classList.remove('up', 'down');
          }
          if (pctEl) {
            pctEl.textContent = '--';
            pctEl.classList.remove('up', 'down');
          }
          return;
        }
        if (priceEl) priceEl.textContent = this.formatPrice(sym, metrics.last);
        const diff = (metrics && isFinite(metrics.diff)) ? metrics.diff : null;
        const pct = (metrics && isFinite(metrics.pct)) ? metrics.pct : null;
        if (changeEl) {
          if (diff == null) {
            changeEl.textContent = '--';
            changeEl.classList.remove('up', 'down');
          } else {
            changeEl.textContent = (diff >= 0 ? '+' : '') + this.formatTiny(sym, diff);
            changeEl.classList.toggle('up', diff > 0);
            changeEl.classList.toggle('down', diff < 0);
          }
        }
        if (pctEl) {
          if (pct == null) {
            pctEl.textContent = '--';
            pctEl.classList.remove('up', 'down');
          } else {
            pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
            pctEl.classList.toggle('up', pct > 0);
            pctEl.classList.toggle('down', pct < 0);
          }
        }
      });
    } catch (e) { console.warn('updateFavoritesPriceRows failed', e); }
  },

  getPricePrecision(sym) {
    const symbol = (sym || '').toUpperCase();
    if (!symbol) return 4;
    if (/^(XAU|XAG|XTI|XBR|XCU|XNI)/.test(symbol)) {
      // 金属/能源类优先根据最近一次真实报价的小数位动态推断精度，最多保留 5 位
      const cache = this._marketsLiveQuotes && this._marketsLiveQuotes[symbol];
      if (cache && cache.raw && cache.raw.last != null) {
        const dyn = this._detectDigitsFromValue(cache.raw.last, 5);
        if (dyn > 0) return dyn;
      }
      if (cache && cache.last != null) {
        const dyn2 = this._detectDigitsFromValue(cache.last, 5);
        if (dyn2 > 0) return dyn2;
      }
      return 2;
    }
    if (/USDT$|USDC$/i.test(symbol)) return 4;
    if (symbol.length === 6) {
      const base = symbol.slice(0, 3);
      const quote = symbol.slice(3);
      if (FOREX_CODES.includes(base) && FOREX_CODES.includes(quote)) {
        return quote === 'JPY' ? 3 : 5;
      }
    }
    if (symbol.endsWith('JPY')) return 3;
    if (symbol.endsWith('BTC') || symbol.endsWith('ETH')) return 2;
    return 4;
  },

  getTinyPrecision(sym) {
    const symbol = (sym || '').toUpperCase();
    const priceDigits = this.getPricePrecision(sym);
    // 外汇 6 位币对（如 EURUSD/EURGBP）：diff 使用 priceDigits+1，最多 6 位，避免极小波动被四舍五入成 0
    if (symbol.length === 6) {
      const base = symbol.slice(0, 3);
      const quote = symbol.slice(3);
      if (FOREX_CODES.includes(base) && FOREX_CODES.includes(quote)) {
        return Math.min(priceDigits + 1, 6);
      }
    }
    // 其他品种：涨跌金额的小数位与价格保持一致（至少 2 位），避免因为少一位看起来像 0.000
    return Math.max(2, priceDigits);
  },

  formatPrice(sym, v) {
    // 防御：null/undefined/非数字直接返回占位符，避免 toFixed 报错
    var num = Number(v);
    if (!isFinite(num)) return '--';
    const digits = this.getPricePrecision(sym);
    return num.toFixed(digits);
  },

  formatPriceFullPrecision(sym, v) {
    var num = Number(v);
    if (!isFinite(num)) return '--';
    const baseDigits = this.getPricePrecision(sym);
    const rawDigits = this._detectDigitsFromValue(v, 12);
    const digits = Math.max(baseDigits, rawDigits || 0);
    return num.toFixed(Math.min(Math.max(digits, baseDigits), 12));
  },

  formatTiny(sym, v) {
    var num = Number(v);
    if (!isFinite(num)) return '--';
    var abs = Math.abs(num);
    const digits = this.getTinyPrecision(sym);
    return abs.toFixed(digits);
  },

  formatVolume(v) {
    var num = Number(v);
    if (!isFinite(num) || num <= 0) return '--';
    var abs = Math.abs(num);
    if (abs >= 1e8) return (abs / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4) return (abs / 1e4).toFixed(2) + '万';
    if (abs >= 1e3) return (abs / 1e3).toFixed(2) + 'K';
    return abs.toFixed(2);
  },

  // 从数值或字符串中推断小数位数，去掉尾随 0，并限制最大位数
  _detectDigitsFromValue(val, maxDigits) {
    try {
      if (val == null) return 0;
      const s = String(val);
      const idx = s.indexOf('.');
      if (idx === -1) return 0;
      let frac = s.slice(idx + 1);
      frac = frac.replace(/0+$/g, '');
      if (!frac.length) return 0;
      const n = frac.length;
      const limit = typeof maxDigits === 'number' && maxDigits > 0 ? maxDigits : 8;
      return Math.min(n, limit);
    } catch (_) {
      return 0;
    }
  },

  renderSheetAlert(config = {}) {
    try {
      const layer = this._sheetLayer;
      if (!layer) return;
      const alertBox = layer.querySelector('.sheet-alert');
      if (!alertBox) return;
      if (config.mode !== 'alert') {
        alertBox.dataset.status = '';
        alertBox.querySelector('.sheet-alert-message').textContent = '';
        return;
      }
      alertBox.dataset.status = config.status || '';
      const msgEl = alertBox.querySelector('.sheet-alert-message');
      if (msgEl) msgEl.textContent = config.message || '';
    } catch (e) {
      console.warn('renderSheetAlert failed', e);
    }
  },

  handleSheetOption(value) {
    try {
      const cfg = this._sheetConfig;
      if (!cfg || cfg.mode === 'checklist') return;
      const options = cfg.options || [];
      const selected = options.find(opt => String(opt.value) === String(value));
      if (!selected) return;
      this._sheetSelection = selected;
      const layer = this._sheetLayer;
      if (layer) {
        const nodes = layer.querySelectorAll('.sheet-option');
        nodes.forEach(btn => btn.classList.toggle('active', btn.dataset.value === String(value)));
      }
      if (typeof cfg.onSelect === 'function') cfg.onSelect(selected);
      if (cfg.mode !== 'alert' && cfg.autoClose !== false) {
        this.hideActionSheet('select');
      }
    } catch (e) {
      console.warn('handleSheetOption failed', e);
    }
  },

  handleChecklistToggle(value, checked) {
    try {
      if (!Array.isArray(this._sheetSelection)) this._sheetSelection = [];
      const normalized = String(value);
      const idx = this._sheetSelection.indexOf(normalized);
      if (checked && idx === -1) {
        this._sheetSelection.push(normalized);
      } else if (!checked && idx !== -1) {
        this._sheetSelection.splice(idx, 1);
      }
      const cfg = this._sheetConfig;
      if (cfg && typeof cfg.onSelect === 'function') {
        cfg.onSelect({ value: normalized, checked, selection: this._sheetSelection.slice() });
      }
    } catch (e) {
      console.warn('handleChecklistToggle failed', e);
    }
  },

  hideActionSheet(reason = 'cancel') {
    try {
      const layer = this._sheetLayer || document.getElementById('action-sheet');
      if (!layer) return;
      layer.classList.remove('visible');
      layer.setAttribute('aria-hidden', 'true');
      const cfg = this._sheetConfig;
      const selection = this._sheetSelection;
      if (cfg) {
        if (reason === 'confirm' && typeof cfg.onConfirm === 'function') cfg.onConfirm(selection);
        if (reason === 'cancel' && typeof cfg.onCancel === 'function') cfg.onCancel(selection);
        if (typeof cfg.onClose === 'function') cfg.onClose(reason, selection);
      }
      this._sheetConfig = null;
      this._sheetSelection = null;
      this._sheetTrigger = null;
    } catch (e) {
      console.warn('hideActionSheet failed', e);
    }
  },

  onSheetCancel() {
    this.hideActionSheet('cancel');
  },

  onSheetConfirm() {
    this.hideActionSheet('confirm');
  },

  // 初始化滑动删除功能
  initSwipeToDelete() {
    const items = document.querySelectorAll('.pending-item');
    items.forEach(item => {
      const row = item.querySelector('.pending-row');
      const deleteBtn = item.querySelector('.pending-delete-btn');
      if (!row || !deleteBtn) return;

      let startX = 0;
      let currentX = 0;
      let isDragging = false;
      let isOpen = false;

      const handleTouchStart = (e) => {
        startX = e.touches[0].clientX;
        currentX = startX;
        isDragging = true;
        row.style.transition = 'none';
      };

      const handleTouchMove = (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        // 只允许向左滑动
        if (diff < 0 && diff >= -80) {
          e.preventDefault();
          row.style.transform = `translateX(${diff}px)`;
        } else if (diff > 0 && isOpen) {
          // 如果已打开，允许向右滑动关闭
          e.preventDefault();
          const newPos = -80 + diff;
          if (newPos <= 0) {
            row.style.transform = `translateX(${newPos}px)`;
          }
        }
      };

      const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        row.style.transition = 'transform 0.3s ease';

        const diff = currentX - startX;

        // 判断是否应该打开或关闭
        if (isOpen) {
          // 已打开状态：向右滑动超过 40px 则关闭
          if (diff > 40) {
            row.style.transform = 'translateX(0)';
            item.classList.remove('swipe-active');
            isOpen = false;
          } else {
            row.style.transform = 'translateX(-80px)';
          }
        } else {
          // 关闭状态：向左滑动超过 40px 则打开
          if (diff < -40) {
            row.style.transform = 'translateX(-80px)';
            item.classList.add('swipe-active');
            isOpen = true;
            // 关闭其他打开的项
            this.closeOtherSwipeItems(item);
          } else {
            row.style.transform = 'translateX(0)';
          }
        }
      };

      row.addEventListener('touchstart', handleTouchStart, { passive: true });
      row.addEventListener('touchmove', handleTouchMove, { passive: false });
      row.addEventListener('touchend', handleTouchEnd);

      // 点击删除按钮
      deleteBtn.addEventListener('click', () => {
        this.deletePendingOrder({ currentTarget: item });
      });
    });
  },

  // 关闭其他已打开的滑动项
  closeOtherSwipeItems(currentItem) {
    const items = document.querySelectorAll('.pending-item');
    items.forEach(item => {
      if (item !== currentItem && item.classList.contains('swipe-active')) {
        const row = item.querySelector('.pending-row');
        if (row) {
          row.style.transition = 'transform 0.3s ease';
          row.style.transform = 'translateX(0)';
          item.classList.remove('swipe-active');
        }
      }
    });
  },

  // 删除待处理订单
  deletePendingOrder(e) {
    const item = e.currentTarget.closest('.pending-item');
    if (!item) return;

    const orderId = item.dataset.orderId;
    console.log('Deleting order:', orderId);

    // 动画移除
    item.style.transition = 'all 0.3s ease';
    item.style.opacity = '0';
    item.style.transform = 'translateX(-100%)';

    setTimeout(() => {
      item.remove();
      // 这里应该调用 API 删除订单
      try {
        (window.ShowToast || console.log)('Order cancelled');
      } catch (_) { }
    }, 300);
  },

  onUnload() {
    try {
      if (this._marketsSocket && typeof this._marketsSocket.disconnect === 'function') {
        this._marketsSocket.disconnect();
      }
    } catch (_) { }
    this._marketsSocket = null;
    try {
      if (this._symbolRefreshTimer) {
        clearInterval(this._symbolRefreshTimer);
        this._symbolRefreshTimer = null;
      }
      if (this._homeActiveTimer) {
        clearInterval(this._homeActiveTimer);
        this._homeActiveTimer = null;
      }
    } catch (_) { }
    try {
      if (this._boundVisibilityHandler) {
        document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
        this._boundVisibilityHandler = null;
      }
      if (this._boundFocusHandler) {
        window.removeEventListener('focus', this._boundFocusHandler);
        this._boundFocusHandler = null;
      }
    } catch (_) { }
  },

  // ============================================
  // 充值页面相关方法
  // ============================================
  
  openDepositPage() {
    try {
      const overlay = document.getElementById('deposit-overlay');
      if (!overlay) return;
      
      // 重置充值金额
      this.setData({ depositAmount: '0' });
      this.updateDepositDisplay();
      
      // 显示充值页面
      overlay.setAttribute('aria-hidden', 'false');
      
      // 禁止页面滚动
      document.body.style.overflow = 'hidden';
      
      console.log('[Deposit] 打开充值页面');
    } catch (err) {
      console.warn('openDepositPage failed', err);
    }
  },

  closeDepositPage() {
    try {
      const overlay = document.getElementById('deposit-overlay');
      if (!overlay) return;
      
      // 隐藏充值页面
      overlay.setAttribute('aria-hidden', 'true');
      
      // 恢复页面滚动
      document.body.style.overflow = '';
      
      console.log('[Deposit] 关闭充值页面');
    } catch (err) {
      console.warn('closeDepositPage failed', err);
    }
  },

  updateDepositDisplay() {
    try {
      const amountEl = document.querySelector('[data-deposit-amount]');
      const approxEl = document.querySelector('[data-deposit-approx]');
      const wrapperEl = document.querySelector('.deposit-amount-display');
      
      if (amountEl) {
        amountEl.textContent = this.data.depositAmount;
        
        // 根据数字长度自适应字体大小
        const length = this.data.depositAmount.replace('.', '').length;
        if (length > 8) {
          amountEl.style.fontSize = '56px';
        } else if (length > 6) {
          amountEl.style.fontSize = '64px';
        } else {
          amountEl.style.fontSize = '72px';
        }
      }
      
      if (approxEl) {
        const numValue = parseFloat(this.data.depositAmount) || 0;
        approxEl.textContent = numValue.toFixed(2);
      }

      // 非零金额时添加样式标记以切换颜色
      if (wrapperEl) {
        const nonZero = parseFloat(this.data.depositAmount) > 0;
        wrapperEl.classList.toggle('nonzero', nonZero);
      }
    } catch (err) {
      console.warn('updateDepositDisplay failed', err);
    }
  },

  onDepositKeyTap(event) {
    try {
      const key = event.currentTarget.dataset.key;
      
      if (key === 'delete') {
        this.handleDepositDelete();
      } else if (key === '.') {
        this.handleDepositDot();
      } else {
        this.handleDepositNumber(key);
      }
      
      this.updateDepositDisplay();
    } catch (err) {
      console.warn('onDepositKeyTap failed', err);
    }
  },

  handleDepositNumber(num) {
    let amount = this.data.depositAmount;
    
    // 如果当前是 0，替换为新数字
    if (amount === '0') {
      amount = num;
    } else {
      // 检查小数点前的整数位数
      const parts = amount.split('.');
      const integerPart = parts[0];
      
      // 如果是小数部分，检查小数位数限制
      if (parts.length === 2) {
        const decimalPart = parts[1];
        if (decimalPart.length >= 2) {
          return; // 最多2位小数
        }
      } else {
        // 如果还没有小数点，检查整数位数
        if (integerPart.length >= 8) {
          return; // 整数部分最多8位
        }
      }
      
      amount += num;
    }
    
    // 检查最大值限制
    const numValue = parseFloat(amount);
    if (numValue > 99999999) {
      return;
    }
    
    this.setData({ depositAmount: amount });
  },

  handleDepositDot() {
    let amount = this.data.depositAmount;
    
    // 如果已经有小数点，忽略
    if (amount.includes('.')) {
      return;
    }
    
    amount += '.';
    this.setData({ depositAmount: amount });
  },

  handleDepositDelete() {
    let amount = this.data.depositAmount;
    
    if (amount.length === 1) {
      amount = '0';
    } else {
      amount = amount.slice(0, -1);
    }
    
    this.setData({ depositAmount: amount });
  },

  onDepositShortcut(event) {
    try {
      const amount = event.currentTarget.dataset.amount;
      this.setData({ depositAmount: amount });
      this.updateDepositDisplay();
    } catch (err) {
      console.warn('onDepositShortcut failed', err);
    }
  },

  onSelectNetwork() {
    try {
      console.log('[Deposit] 选择网络');
      
      if (typeof this.openActionSheet !== 'function') {
        console.warn('openSelectNetwork skipped: openActionSheet unavailable');
        return;
      }
      
      const t = (key, fallback) => (window.i18n && window.i18n.t) ? window.i18n.t(key, fallback) : fallback;
      
      // 网络选项
      const networks = [
        {
          value: 'ERC20',
          label: 'ERC20',
          desc: 'Ethereum Network'
        },
        {
          value: 'TRC20',
          label: 'TRC20',
          desc: 'TRON Network'
        },
        {
          value: 'BSC',
          label: 'BSC (BEP20)',
          desc: 'Binance Smart Chain'
        },
        {
          value: 'Polygon',
          label: 'Polygon',
          desc: 'Polygon Network'
        }
      ];
      
      this.openActionSheet({
        mode: 'menu',
        title: 'Select Network',
        subtitle: 'Choose the blockchain network for your deposit',
        options: networks,
        onSelect: (option) => this.handleNetworkSelect(option)
      });
    } catch (err) {
      console.warn('onSelectNetwork failed', err);
    }
  },
  
  handleNetworkSelect(option) {
    try {
      if (!option || !option.value) return;
      
      console.log('[Deposit] 选择网络:', option.value);
      
      // 更新网络显示
      this.setData({ depositNetwork: option.value });
      
      const networkNameEl = document.querySelector('[data-network-name]');
      if (networkNameEl) {
        networkNameEl.textContent = option.value;
      }
      
      // 显示提示
      const label = option.label || option.value;
      const msg = `Selected ${label}`;
      if (typeof window.ShowToast === 'function') {
        window.ShowToast(msg, { icon: 'success' });
      } else {
        console.log(msg);
      }
    } catch (err) {
      console.warn('handleNetworkSelect failed', err);
    }
  },

  onDepositSubmit() {
    try {
      const amount = parseFloat(this.data.depositAmount);
      
      // 验证最小金额
      if (!amount || amount < 10) {
        this.showToast('最小充值金额为 10 USDT', 'warning');
        return;
      }
      
      console.log('[Deposit] 提交充值:', amount, 'USDT');
      
      // TODO: 调用充值 API
      this.showToast('充值功能开发中', 'info');
      
      // 暂时关闭充值页面
      // this.closeDepositPage();
    } catch (err) {
      console.warn('onDepositSubmit failed', err);
    }
  }
});
