// mini-sdk: 简易微信小程序兼容层（仅用于开发环境）
(function(global){
  if (global.wx) return;

  function safeJsonParse(s){ try { return JSON.parse(s); } catch(e){ return null; } }

  const wx = {
    request: function(opts){
        if (!opts || !opts.url) return Promise.reject(new Error('wx.request requires url'));
        const method = (opts.method || 'GET').toUpperCase();
        const headers = opts.header || opts.headers || {};
        const body = opts.data ? (typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data)) : null;
        const p = fetch(opts.url, { method, headers, body, credentials: 'include' })
          .then(res => res.text().then(text => ({ statusCode: res.status, data: safeJsonParse(text) || text, raw: text })));
        // 回调兼容：支持 success/fail/complete，同时返回 Promise
        p.then(result => { if (typeof opts.success === 'function') opts.success(result); if (typeof opts.complete === 'function') opts.complete(result); })
         .catch(err => { if (typeof opts.fail === 'function') opts.fail(err); if (typeof opts.complete === 'function') opts.complete(err); });
        return p;
    },

    showToast: function(opts){
      const title = (typeof opts === 'string') ? opts : (opts && opts.title) || '';
      // 简易 toast：在页面右下角显示
      try {
        let wrap = document.getElementById('__mini_sdk_toast');
        if (!wrap) { wrap = document.createElement('div'); wrap.id = '__mini_sdk_toast'; wrap.style.cssText = 'position:fixed;left:50%;top:20%;transform:translateX(-50%);z-index:99999;background:rgba(0,0,0,.75);color:#fff;padding:10px 14px;border-radius:6px;font:14px/1.2 sans-serif;'; document.body.appendChild(wrap); }
        wrap.textContent = title;
        wrap.style.opacity = '1';
        clearTimeout(wrap._t);
        wrap._t = setTimeout(()=>{ wrap.style.transition='opacity .4s'; wrap.style.opacity='0'; }, (opts && opts.duration) || 1500);
      } catch(e) { console.log('Toast:', title); }
    },

    setStorageSync: function(key, val){
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch(e){ return false; }
    },
    getStorageSync: function(key){
      try { const v = localStorage.getItem(key); return v===null?undefined:JSON.parse(v); } catch(e){ return undefined; }
    },
    removeStorageSync: function(key){
      try { localStorage.removeItem(key); return true; } catch(e){ return false; }
    },
    clearStorageSync: function(){
      try { localStorage.clear(); return true; } catch(e){ return false; }
    },

    navigateTo: function(opt){
      if (!opt || !opt.url) return;
      // 支持相对路径与绝对路径
      const url = String(opt.url || '');
      window.location.href = url;
    },

    getSystemInfoSync: function(){
      return {
        platform: navigator.platform || 'web',
        system: navigator.userAgent || '',
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      };
    }
  };

  // 简易 loading 管理
  let __mini_sdk_loading = null;
  wx.showLoading = function(opts){
    const title = (typeof opts === 'string') ? opts : (opts && opts.title) || 'Loading';
    try {
      if (!__mini_sdk_loading) {
        __mini_sdk_loading = document.createElement('div');
        __mini_sdk_loading.id = '__mini_sdk_loading';
        __mini_sdk_loading.style.cssText = 'position:fixed;left:50%;top:40%;transform:translateX(-50%);z-index:99999;background:rgba(0,0,0,.75);color:#fff;padding:12px 18px;border-radius:8px;font:14px/1.2 sans-serif;';
        document.body.appendChild(__mini_sdk_loading);
      }
      __mini_sdk_loading.textContent = title;
      __mini_sdk_loading.style.display = 'block';
    } catch(e){}
  };
  wx.hideLoading = function(){ try { if (__mini_sdk_loading) __mini_sdk_loading.style.display = 'none'; } catch(e){} };

  // Page 适配：挂载到 window.currentPage，提供 setData
  function Page(def){
    if (!def || typeof def !== 'object') return;
    const page = Object.assign({}, def);
    page.data = page.data || {};
    page.setData = function(d){
      try {
        page.data = Object.assign({}, page.data, d);
        // 派发事件，页面可以监听并更新视图
        const ev = new CustomEvent('pageDataChanged', { detail: { data: page.data } });
        document.dispatchEvent(ev);
      } catch(e){ console.warn('Page.setData error', e); }
    };
    // 保存为全局 currentPage 方便其他脚本访问
    global.currentPage = page;
    // 如果定义了 onLoad/onShow 等，尝试触发 onLoad
    if (typeof page.onLoad === 'function') {
      try { page.onLoad(); } catch(e){ console.warn('page onLoad error', e); }
    }
    if (typeof page.onShow === 'function') {
      try { page.onShow(); } catch(e){ console.warn('page onShow error', e); }
    }
    return page;
  }

  // 将小程序接口暴露到 global
  global.wx = wx;
  global.Page = Page;

  // 监听 pageDataChanged 事件，便于开发者在页面层绑定自动刷新数据（可选）
  document.addEventListener('pageDataChanged', function(ev){
    try {
      // 用户可以在页面 JS 中订阅此事件，默认不执行任何 DOM 操作
      // console.log('mini-sdk pageDataChanged', ev.detail.data);
    } catch(e){}
  });
  // If rpx converter is available, run it to make mini-program styles render closer to design
  try {
    if (typeof window.__convertRpx === 'function') {
      try { window.__convertRpx(); } catch(e) { /* ignore */ }
    } else {
      // try to dynamically load utils/rpx.js if hosted by dev server
      var s = document.createElement('script');
      s.src = '/utils/rpx.js';
      s.onload = function(){ try { if (typeof window.__convertRpx === 'function') window.__convertRpx(); } catch(e){} };
      s.onerror = function(){};
      document.head.appendChild(s);
    }
  } catch(e){}

})(window);
