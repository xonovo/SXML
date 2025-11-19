// webapp 页面逻辑 - IEC Markets
Page({
  data: {
    pageTitle: 'IEC Markets',
    active: 'home',
    currentLang: 'English',
    tabs: [
      { key: 'home', label: 'Home' },
      { key: 'markets', label: 'Markets' },
      { key: 'trades', label: 'Trades' },
      { key: 'funds', label: 'Funds' }
    ]
  },

  onLoad() {
    this.updateTitle();
    this.initTabBar();
  },

  updateTitle() {
    if (document && document.title) {
      document.title = this.data.pageTitle;
    }
  },

  // 初始化 TabBar 状态
  initTabBar() {
    this.switchTab({ currentTarget: { dataset: { tab: 'home' } } });
  },

  // 切换语言
  toggleLanguage() {
    const newLang = this.data.currentLang === 'English' ? '中文' : 'English';
    this.setData({ currentLang: newLang });
    
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) {
      langBtn.textContent = newLang;
    }
    
    console.log('语言切换:', newLang);
    // TODO: 实现实际的语言切换逻辑
  },

  // 显示通知
  showNotification() {
    console.log('打开通知');
    // TODO: 实现通知功能
  },

  // 功能入口点击
  onFeature(e) {
    const key = e.currentTarget.dataset.key;
    console.log('功能点击:', key);
    
    switch(key) {
      case 'deposit':
        console.log('打开充值页面');
        // TODO: 跳转到充值页面
        break;
      case 'withdrawal':
        console.log('打开提现页面');
        // TODO: 跳转到提现页面
        break;
      case 'help':
        console.log('打开帮助中心');
        // TODO: 打开帮助页面
        break;
      case 'support':
        console.log('打开客服支持');
        // TODO: 打开客服页面
        break;
    }
  },
        root.querySelectorAll('.page').forEach(p => p.classList.remove('hidden'));
        const start = root.querySelector(`.page-${this.data.active}`);
        if (start) start.classList.add('active');
      }
    } catch (_) {}
    // 小延时确保 DOM 准备好，然后统一入口逻辑
    setTimeout(() => { this.switchTab(this.data.active); this.updateThemeToggleUI(); }, 50);
  },

  updateTitle() {
    try { document.title = this.data.pageTitle || document.title; } catch(_) {}
  },

  switchTab(e) {
    // 支持传入事件对象或字符串 tab key
    const tab = (typeof e === 'string') ? e : (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || (e && e.target && e.target.dataset && e.target.dataset.tab);
    if (!tab) return;
    // 更新页面数据状态
    try { this.setData({ active: tab }); } catch (_) { /* ignore if setData not available */ }

    // 运行时切换 DOM：通过 .active class 切换并依赖 CSS 过渡
    try {
      const root = document.querySelector('.webapp-root');
      if (root) {
        const current = root.querySelector('.page.active');
        const target = root.querySelector(`.page-${tab}`);
        if (current && target && current === target) {
          // 已在目标页，无需切换
        } else {
          if (current) current.classList.remove('active');
          if (target) target.classList.add('active');
        }

        // 更新 tab 按钮激活态
        root.querySelectorAll('.tab').forEach(btn => {
          try {
            const t = btn.getAttribute('data-tab') || btn.dataset.tab;
            if (t === tab) btn.classList.add('active'); else btn.classList.remove('active');
          } catch (_) {}
        });
      }
    } catch (err) {
      // 防御性容错
      console.warn('switchTab DOM update failed', err);
    }

    // 可选：触发特定 tab 的数据加载
    if (tab === 'markets') { this.loadMarkets(); }
  },

  // 示例占位方法：在切换到 Markets 时可以加载行情数据
  loadMarkets() {
    // TODO: 使用 WebSocket 或 API 拉取实时行情并渲染
    console.log('加载Markets数据（占位）');
  }

  // 切换主题（由页面按钮调用）
  ,toggleTheme() {
    try {
  // 检查 body 或 html 上是否存在 theme-day（两者可能在不同时间被设置）
  const isDay = ((document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('theme-day')) || (document.body && document.body.classList && document.body.classList.contains('theme-day'))) || false;
  const newMode = isDay ? 'night' : 'day';
      try { if (window && window.setAppTheme) window.setAppTheme(newMode); } catch (_) {}
      this.updateThemeToggleUI();
    } catch (e) { console.warn('toggleTheme failed', e); }
  }

  // 更新主题切换按钮显示
  ,updateThemeToggleUI() {
    try {
      const btn = document.querySelector('.theme-toggle');
      if (!btn) return;
  const isDay = ((document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('theme-day')) || (document.body && document.body.classList && document.body.classList.contains('theme-day'))) || false;
      btn.textContent = isDay ? '🌞' : '🌙';
    } catch (_) {}
  }
});
