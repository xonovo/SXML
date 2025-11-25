// 全局应用入口 app.js（非模块脚本）
// 提供类似微信小程序的 App/getApp 全局实例和方法

(function(){
  // 控制台降噪：默认静默 log/debug/warn，保留 error；?debug=1 或 localStorage.DEBUG=1 可恢复
  try {
    var search = (typeof location !== 'undefined' && location.search) || '';
    var params = (function(q){
      var map = {}; if(!q) return map; q.replace(/^\?/, '').split('&').forEach(function(p){
        if(!p) return; var kv = p.split('='); map[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]||'');
      }); return map;
    })(search);
    var debugOn = params.debug === '1' || (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG') === '1');
    if (!debugOn && typeof console === 'object') {
      var noop = function(){};
      try { console.log = noop; } catch(_) {}
      try { console.debug = noop; } catch(_) {}
      try { console.warn = noop; } catch(_) {}
      // 提供全局开关以便运行时开启: window.enableDebugLogs()
      if (typeof window !== 'undefined') {
        window.enableDebugLogs = function(){ try{ delete console.log; delete console.debug; delete console.warn; }catch(_){} };
      }
    }
  } catch(_) {}
  const App = {
    // 内部状态：避免重复动态加载 Toast
    _toastLoadAttempted: false,
  globalData: {
    lang: 'en-US', // 默认语言
        user: null,
        loading: false,
        config: {},
    },
    /**
     * 应用启动时初始化
     */
    onLaunch() {
        // 配置由 utils/config.js 注入 window.CONFIG 或 window.APP_CONFIG
        if (window && window.CONFIG) this.globalData.config = window.CONFIG;
        if (window && window.APP_CONFIG) this.globalData.appConfig = window.APP_CONFIG;
        this.initLang();
        this.listenNetwork();
        this.setupGlobalErrorHandler();
    },
    /**
     * 加载全局配置
     */
    loadConfigSync() {
        // 已由编译器注入对应环境的 app.config.*.js + utils/config.js
        this.globalData.config = window.CONFIG || this.globalData.config || {};
        this.globalData.appConfig = window.APP_CONFIG || this.globalData.appConfig || {};
    },
    /**
     * 初始化语言
     */
    initLang() {
        const lang = (function() {
          try {
            const saved = localStorage.getItem('lang');
            if (saved) return saved;
          } catch (_) {}

          try {
            if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.i18n) {
              const cfgLang = window.APP_CONFIG.i18n.defaultLang;
              if (cfgLang) return cfgLang;
            }
          } catch (_) {}

          return 'en-US';
        })();
        this.globalData.lang = lang;
        // 若全局 i18n 存在，尝试切换
        if (window.i18n && typeof window.i18n.setLang === 'function') {
          window.i18n.setLang(lang).then(function(){
            // 确保占位符替换（此时 APP_CONFIG 已就绪）
            if (window.i18n && window.i18n.replacePlaceholders) window.i18n.replacePlaceholders();
            if (window.i18n && window.i18n.apply) window.i18n.apply();
            document.documentElement.classList.add('i18n-ready');
          }).catch(function(){});
        }
    },
    /**
     * 监听网络状态
     */
    listenNetwork() {
        window.addEventListener('online', () => {
            this.globalData.network = 'online';
            console.log('网络已连接');
        });
        window.addEventListener('offline', () => {
            this.globalData.network = 'offline';
            console.warn('网络已断开');
        });
    },
    /**
     * 全局 loading 控制
     */
    setLoading(val) {
        this.globalData.loading = val;
        document.body.classList.toggle('loading', val);
        // 可选：显示/隐藏全局 loading 元素
        let loadingEl = document.getElementById('globalLoading');
        if (!loadingEl && val) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'globalLoading';
            loadingEl.innerHTML = '<div class="loading-spinner"></div>';
            loadingEl.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:9999;background:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;';
            document.body.appendChild(loadingEl);
        }
        if (loadingEl) loadingEl.style.display = val ? 'flex' : 'none';
    },
    // 全局轻提示(封装 Toast,页面可通过 getApp().showToast 使用)
    showToast(msg, btn){
      const payload = (btn && typeof btn === 'object') ? btn : (typeof btn !== 'undefined' ? { btnText: btn } : undefined);
      try {
        // 每次调用时都检查 Toast 是否可用
        if (typeof window.ShowToast === 'function') {
          window.ShowToast(msg, payload);
          return;
        }
        if (window.Toast && typeof window.Toast.show === 'function') {
          window.Toast.show(msg, payload);
          return;
        }

        // Toast 未加载：仅在首次尝试时静默加载，避免重复告警
        if (!this._toastLoadAttempted) {
          this._toastLoadAttempted = true;
          if (console && console.debug) console.debug('[App.showToast] lazy-loading toast.js');
          fetch('/utils/toast.js')
            .then(r => r.text())
            .then(code => { eval(code); })
            .catch(err => console.debug('[App.showToast] toast.js load skipped/error:', err))
            .finally(() => {
              // 加载完成后再尝试一次
              if (typeof window.ShowToast === 'function') return window.ShowToast(msg, payload);
              if (window.Toast && typeof window.Toast.show === 'function') return window.Toast.show(msg, payload);
              // 仍不可用则降级
              alert(msg);
            });
          return;
        }

        // 已尝试加载且仍不可用：直接降级
        alert(msg);
      } catch (e) {
        alert(msg);
      }
    },
    showLoading(msg){ try { if (window.Toast && typeof Toast.showLoading === 'function') { Toast.showLoading(msg); } else if (typeof window.ShowLoding === 'function') { window.ShowLoding(msg); } } catch(_){} },
    hideLoading(){ try { if (window.Toast && typeof Toast.hideLoading === 'function') { Toast.hideLoading(); } else if (typeof window.CloseLoding === 'function') { window.CloseLoding(); } } catch(_){} },
    // 语言切换入口
    setLang(lang){ try { localStorage.setItem('lang', lang); this.globalData.lang = lang; if (window.i18n && typeof window.i18n.setLang === 'function') { return window.i18n.setLang(lang).then(function(){ if (window.i18n && window.i18n.apply) window.i18n.apply(); document.documentElement.classList.add('i18n-ready'); }); } } catch(_){} return Promise.resolve(); },
    setUser(user) {
        this.globalData.user = user;
    },
    getUser() {
        return this.globalData.user;
    },
    /**
     * 全局错误处理
     */
    setupGlobalErrorHandler() {
        window.onerror = function(msg, url, line, col, error) {
            console.error('全局错误:', msg, url, line, col, error);
        };
        window.onunhandledrejection = function(e) {
            console.error('未捕获的Promise错误:', e.reason);
        };
    }
  };

  // 启动全局应用
  App.onLaunch();

  // 挂载到 window，方便页面访问
  window.App = App;
  window.getApp = function(){ return window.App; };

  // 延迟加载 Toast（确保 DOM 加载完成后再初始化）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof window.ShowToast !== 'function' && typeof window.LoadShowToast === 'function') {
        window.LoadShowToast();
      }
    });
  } else {
    // DOM 已加载，立即检查
    setTimeout(function() {
      if (typeof window.ShowToast !== 'function' && typeof window.LoadShowToast === 'function') {
        window.LoadShowToast();
      }
    }, 100);
  }
})();
