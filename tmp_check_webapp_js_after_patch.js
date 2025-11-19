// webapp 页面逻辑 - IEC Markets
Page({
  data: {
    pageTitle: 'IEC Markets',
    active: 'home',
    currentLang: 'English'
  },

  onLoad() {
    this.updateTitle();
    this.initTabBar();
    this.initSwiper();
    // 确保分页（小点）在视觉上下移额外 10rpx
    try {
      var that = this;
      setTimeout(function(){
        try { that.adjustPaginationOffset && that.adjustPaginationOffset(10); } catch(e){}
      }, 120);
    } catch(e){}
    // 开发环境验证：检测 mini-sdk 是否可用、wx.request 与 showToast
    try {
      var that = this;
      setTimeout(function(){
        if (window.wx) {
          try {
            wx.showToast({ title: 'mini-sdk OK' });
          } catch(e) { console.warn('wx.showToast failed', e); }

          try {
            wx.request({
              url: '/pages/index/index.html',
              method: 'GET',
              success: function(r){ console.log('wx.request success', r); },
              fail: function(e){ console.warn('wx.request fail', e); }
            });
          } catch(e) { console.warn('wx.request threw', e); }

          try { that.setData && that.setData({ sdkOk: true }); } catch(e){}
        } else {
          console.warn('mini-sdk not available');
        }
      }, 200);
    } catch(e){ console.warn('verifyMiniSdk error', e); }
  },

  // 在运行时将分页向下平移指定的 rpx 值（由 utils/rpx.js 处理转换）
  adjustPaginationOffset(rpx) {
    try {
      if (!document) return;
      var pag = document.querySelector('.banner-swiper-container .swiper-pagination');
      if (!pag) return;
      // 如果已有 transform，保留原有值并追加 translateY
      var existing = pag.getAttribute('style') || '';
      // 防止重复追加
      if (existing.indexOf('translateY') === -1) {
        var add = 'transform: translateY(' + (rpx || 10) + 'rpx);';
        pag.setAttribute('style', existing ? (existing + ';' + add) : add);
        // 调用运行时转换器把 rpx 转为 px
        try { window.__convertRpx && window.__convertRpx(); } catch(e){}
      }
    } catch(e) { console.warn('adjustPaginationOffset error', e); }
  },

  initSwiper() {
    // 动态加载 Swiper CSS/JS：优先尝试本地 vendor（pages/webapp/vendor），无则回退到 CDN
  // Use absolute paths to avoid relative resolution issues from dev server
  const localCss = '/pages/webapp/vendor/swiper-bundle.min.css';
  const localJs = '/pages/webapp/vendor/swiper-bundle.min.js';
    const cdnCss = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css';
    const cdnJs = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js';

    function loadCss(href) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      // prefer appending to head; if CSP blocks external, browser will ignore and we fall back
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

  // 先尝试本地 CSS（绝对路径，避免相对解析导致的 404）
  const localCssLink = loadCss(localCss);
    // 尝试本地 JS -> CDN -> 回退
    (async () => {
      try {
        await loadScript(localJs);
        console.log('✅ Swiper 本地脚本加载成功');
      } catch (eLocal) {
  // 本地加载失败，尝试 CDN
        console.warn('⚠️ 本地 Swiper 加载失败，尝试 CDN:', eLocal && eLocal.message);
        // 加载 CDN CSS 作为后备样式
  // Only add CDN CSS if not blocked by CSP — browser will reject if so
  loadCss(cdnCss);
        try {
          await loadScript(cdnJs);
          console.log('✅ Swiper CDN 加载成功');
        } catch (eCdn) {
          console.warn('⚠️ Swiper CDN 加载失败，启用本地回退轮播:', eCdn && eCdn.message);
          this.initBasicCarousel();
          return;
        }
      }

      // 到这里 Swiper 已加载（本地或 CDN），尝试初始化
      try {
        if (typeof Swiper !== 'undefined') {
          new Swiper('.banner-swiper-container', {
            loop: true,
            slidesPerView: 1,
            spaceBetween: 8,
            autoplay: {
              delay: 3000,
              disableOnInteraction: false
            },
            pagination: {
              el: '.swiper-pagination',
              clickable: true
            },
            speed: 400
          });
          console.log('✅ Swiper 轮播初始化完成');
        } else {
          console.warn('⚠️ Swiper 未定义，启用本地回退');
          this.initBasicCarousel();
        }
      } catch (eInit) {
        console.warn('⚠️ Swiper 初始化异常，启用本地回退:', eInit && eInit.message);
        this.initBasicCarousel();
      }
    })();
  },

  /**
   * 本地轻量轮播回退（用于 CDN 被阻止或网络不通时）
   */
  initBasicCarousel() {
    try {
        idx = (idx + 1) % slides.length;
      const container = document.querySelector('.banner-swiper-container');
      if (!container) return;
      const wrapper = container.querySelector('.swiper-wrapper');
      const slides = Array.from(container.querySelectorAll('.swiper-slide'));
      if (!wrapper || !slides || slides.length <= 1) return;

      // 设置 wrapper 和 slide 布局以支持横向滑动
      wrapper.style.display = 'flex';
      wrapper.style.width = `${slides.length * 100}%`;
      wrapper.style.transition = 'transform 0.45s ease';
      wrapper.style.transform = 'translateX(0)';
      slides.forEach(s => {
        s.style.flex = '0 0 100%';
        s.style.boxSizing = 'border-box';
      });

      // 分页点处理
      const pagination = container.querySelector('.swiper-pagination');
      if (pagination) {
        pagination.innerHTML = '';
        slides.forEach((_, i) => {
          const b = document.createElement('button');
          b.className = 'basic-bullet';
          b.style.width = '8px';
          b.style.height = '8px';
          b.style.borderRadius = '50%';
          b.style.margin = '0 4px';
          b.style.border = '0';
          b.style.background = i === 0 ? '#fff' : 'rgba(255,255,255,0.6)';
          b.addEventListener('click', () => {
            currentIndex = i;
            wrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
            updateBullets();
          });
          pagination.appendChild(b);
        });
      }

      let currentIndex = 0;
      function updateBullets() {
        if (!pagination) return;
        Array.from(pagination.children).forEach((c, ci) => c.style.background = ci === currentIndex ? '#fff' : 'rgba(255,255,255,0.6)');
      }

      // 自动轮播，向左移动（视觉上是从右到左滚动）
      setInterval(() => {
        currentIndex = (currentIndex + 1) % slides.length;
        wrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateBullets();
      }, 3000);
      console.log('🔁 已启用本地回退轮播（带滑动动画）');
    } catch (e) {
      console.warn('⚠️ 本地轮播初始化失败:', e && e.message);
    }
  },

  updateTitle() {
    if (document && document.title) {
      document.title = this.data.pageTitle;
    }
  },

  initTabBar() {
    const homeTab = document.querySelector('.tab[data-tab="home"]');
    if (homeTab) {
      homeTab.classList.add('tab-active');
    }
  },

  toggleLanguage() {
    const newLang = this.data.currentLang === 'English' ? '中文' : 'English';
    this.setData({ currentLang: newLang });
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) langBtn.textContent = newLang;
    console.log('语言切换:', newLang);
  },

  showNotification() {
    console.log('打开通知');
  },

  onFeature(e) {
    const key = e.currentTarget.dataset.key;
    console.log('功能点击:', key);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    this.setData({ active: tab });
    
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => {
      if (t.dataset.tab === tab) {
        t.classList.add('tab-active');
      } else {
        t.classList.remove('tab-active');
      }
    });
    
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.style.display = 'none');
    const currentPage = document.querySelector(`.page-`);
    if (currentPage) currentPage.style.display = 'block';
    console.log('切换到:', tab);
  }
});
