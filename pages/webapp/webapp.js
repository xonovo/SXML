// webapp 页面逻辑 - 对应复杂版页面结构（轮播/功能入口/资金页等）
Page({
  data: {
    pageTitle: 'ICE Markets',
    active: 'home',
    currentLang: 'English'
  },

  onLoad() {
    try { document.title = this.data.pageTitle || document.title; } catch(_) {}
    // 初始化语言状态并应用
    try {
      if (window.i18n) {
        window.i18n.load(window.i18n.lang).then(() => {
          window.i18n.apply();
          this.setData({ currentLang: window.i18n.lang === 'zh-CN' ? '中文' : 'English' });
          const btn = document.querySelector('.lang-btn');
          if (btn) btn.textContent = (window.i18n.lang === 'zh-CN') ? 'English' : '中文';
        });
        window.addEventListener('i18n:ready', () => {
          try { window.i18n.apply(); } catch(_){}
          this.setData({ currentLang: window.i18n.lang === 'zh-CN' ? '中文' : 'English' });
          const btn = document.querySelector('.lang-btn');
          if (btn) btn.textContent = (window.i18n.lang === 'zh-CN') ? 'English' : '中文';
        }, { once: true });
      }
    } catch(_) {}

    // 初始化轮播
    this.initSwiper();

    // 默认激活首页
    try {
      const homePage = document.querySelector('.page-home');
      if (homePage && !homePage.classList.contains('active')) homePage.classList.add('active');
    } catch(e) { console.warn('activate home failed', e); }

    // 资金页：创建视口并初始化高度
    try {
      this.ensureFundsViewport();
      const vp = document.querySelector('.funds-viewport');
      const active = document.querySelector('.funds-content.active');
      if (vp && active) {
        // 先用自然高度，下一帧锁定为 px，避免首帧跳变
        vp.style.height = active.offsetHeight + 'px';
        setTimeout(() => { try { vp.style.height = 'auto'; } catch(_) {} }, 0);
      }
    } catch(e) { console.warn('init funds viewport failed', e); }
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
      vp.querySelectorAll('.funds-content').forEach(c => { try { c.style.removeProperty('display'); } catch(_) {} });
      // 设定初始高度
      const active = vp.querySelector('.funds-content.active') || vp.querySelector('.funds-content');
      if (active) vp.style.height = active.offsetHeight + 'px';
    } catch(_) {}
  },

  async toggleLanguage() {
    try {
      if (!window.i18n) return;
      const next = window.i18n.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
      await window.i18n.setLang(next);
      this.setData({ currentLang: next === 'zh-CN' ? '中文' : 'English' });
      const btn = document.querySelector('.lang-btn');
      if (btn) btn.textContent = (next === 'zh-CN') ? 'English' : '中文';
    } catch(e) { console.warn('toggleLanguage failed', e); }
  },

  showNotification() {
    try { (window.ShowToast || console.log)('通知'); } catch(_) {}
  },

  onFeature(e) {
    const key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key;
    console.log('feature click:', key);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    this.setData({ active: tab });
    // 更新 tab 激活样式
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.toggle('tab-active', t.dataset.tab === tab));
    // 横向滑动：根据 tab 切换 pages-wrapper 的 transform
    try {
      const wrapper = document.querySelector('.pages-wrapper');
      if (wrapper) {
        const map = { home: 0, markets: 1, trades: 2, funds: 3 };
        const idx = map[tab] || 0;
        wrapper.style.transform = `translateX(-${idx * 25}%)`;
      }
    } catch(_) {}
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
    try { fromH = (vp && (vp.clientHeight || vp.offsetHeight)) || (prev && prev.offsetHeight) || 0; } catch(_) {}
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
        } catch(_) {}
      };
      try { prev.addEventListener('transitionend', cleanup); } catch(_) {}
    }

    // 进入新视图
    if (next) {
      next.classList.add('active');
      try { next.style.removeProperty('display'); } catch(_) {}
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
          try { vp.style.height = 'auto'; vp.removeEventListener('transitionend', done); } catch(_) {}
        };
        vp.addEventListener('transitionend', done);
      } catch(_) {}
    });
  },

  // 资金页按钮处理（占位实现）
  onDeposit() { try { (window.ShowToast || console.log)('Deposit'); } catch(_) {} },
  onWithdrawal() { try { (window.ShowToast || console.log)('Withdrawal'); } catch(_) {} },
  onDetails() { try { (window.ShowToast || console.log)('Details'); } catch(_) {} },
  onSettings() { try { (window.ShowToast || console.log)('Settings'); } catch(_) {} },
  onLoan() { try { (window.ShowToast || console.log)('Loan'); } catch(_) {} },
  onRepayment() { try { (window.ShowToast || console.log)('Repayment'); } catch(_) {} },
  onTransfer() { try { (window.ShowToast || console.log)('Transfer'); } catch(_) {} },
  onLearnLeveraged() { try { (window.ShowToast || console.log)('Learn leveraged'); } catch(_) {} },

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
          new Swiper('.banner-swiper-container', {
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
  }
});
