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

  // 底部弹窗组件初始化
  this.initActionSheet();

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
        // 先用自然高度,下一帧锁定为 px，避免首帧跳变
        vp.style.height = active.offsetHeight + 'px';
        setTimeout(() => { try { vp.style.height = 'auto'; } catch(_) {} }, 0);
      }
    } catch(e) { console.warn('init funds viewport failed', e); }

    // 初始化订单簿动态条数（基于右侧操作区域高度）
    setTimeout(() => {
      try {
        this.updateOrderbookRows();
        this.observeOrderPanels();
      } catch(e) { console.warn('init orderbook failed', e); }
    }, 100);

    setTimeout(() => {
      try {
        this.initFloatingFields();
        this.initRangePickers();
        this.initSLForms();
      } catch(e) {
        console.warn('init floating fields failed', e);
      }
    }, 0);

    // 初始化子面板高度（避免第一次点击出现瞬跳）
    setTimeout(() => {
      try { this.initSubpanelHeights(); } catch(e) { console.warn('init subpanel heights failed', e); }
    }, 50);

    // 初始化滑动删除功能
    setTimeout(() => {
      try { this.initSwipeToDelete(); } catch(e) { console.warn('init swipe to delete failed', e); }
    }, 100);
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
        } catch(err) { console.warn('refresh subpanel height after main tab switch failed', err); }
      }, 160);
    } catch(err) {
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
            } catch(_) {}
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
      slides.forEach((s,i) => {
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
        console.log('[switchTradePanel] fallback slide idx=', idx, '->', translate+'%');
        
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
    } catch(err) {
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
    } catch(e) { console.warn('updateSubpanelIndicator failed', e); }
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
      } catch(e) { console.warn('initSubpanelHeights one failed', e); }
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
  },

  onStep(e) {
    const delta = Number((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.delta) || 0);
    const stepper = e.currentTarget && e.currentTarget.closest('.stepper');
    if (!stepper) return;
    const input = stepper.querySelector('input.num');
    if (!input) return;
    const val = parseFloat(input.value || '0') || 0;
    let next = val + delta;
    // 保留两位小数
    if (input.type === 'number') {
      next = Math.round(next * 100) / 100;
    }
    input.value = String(next);
    this.refreshFloatingFields();
    this.refreshRangePickers();
  },

  onBuy() { try { (window.ShowToast || console.log)('Order submitted (mock)'); } catch(_) {} },

  onSymbolSwitch() { try { (window.ShowToast || console.log)('Symbol switch'); } catch(_) {} },

  onOrderTypeSelect(e) {
    this._sheetTrigger = e && e.currentTarget;
    const options = [
      { value: 'market', label: 'Market Order', desc: '立即按当前市场价成交' },
      { value: 'limit', label: 'Limit Order', desc: '设定价格，触发时成交' },
      { value: 'stop', label: 'Stop Order', desc: '价格到达后转为市价单' }
    ];
    this.openActionSheet({
      mode: 'menu',
      theme: 'dark',
      title: '选择下单方式',
      subtitle: 'Order Type',
      options,
      hideActions: true,
      onSelect: (option) => {
        if (this._sheetTrigger) {
          this._sheetTrigger.textContent = option.label + ' ▾';
          this._sheetTrigger.dataset.value = option.value;
        }
        try { (window.ShowToast || console.log)(`已切换为 ${option.label}`); } catch(_) {}
      }
    });
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
    } catch(err) {
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
    } catch(err) {
      console.warn('onFollowLast failed', err);
    }
  },

  initRangePickers() {
    try {
      const pickers = document.querySelectorAll('.allocation-picker');
      if (!pickers.length) return;
      pickers.forEach(picker => this.setupRangePicker(picker));
      this.refreshRangePickers();
    } catch(e) {
      console.warn('initRangePickers failed', e);
    }
  },

  setupRangePicker(picker) {
    if (!picker || picker.dataset.rangeReady === '1') return;
    picker.dataset.rangeReady = '1';
    const track = picker.querySelector('[data-role="track"]');
    if (track) {
      track.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const pointerId = ev.pointerId;
        if (track.setPointerCapture) {
          try { track.setPointerCapture(pointerId); } catch(_) {}
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
            try { track.releasePointerCapture(pointerId); } catch(_) {}
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
        const val = Number(mark.dataset.value || 0);
        this.applyRangePercent(picker, val);
      });
    });
    const amountInput = this.findRangeInput(picker.dataset.amountKey);
    if (amountInput) {
      amountInput.addEventListener('input', () => {
        if (this._rangeLock) return;
        this.syncPickerFromInputs(picker);
      });
    }
    const volumeInput = this.findRangeInput(picker.dataset.volumeKey);
    if (volumeInput && volumeInput !== amountInput) {
      volumeInput.addEventListener('input', () => {
        if (this._rangeLock) return;
        this.syncPickerFromInputs(picker);
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
    } catch(_) {
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
      const amountInput = this.findRangeInput(picker.dataset.amountKey);
      const volumeInput = this.findRangeInput(picker.dataset.volumeKey);
      const maxAmount = this.getRangeMax(picker, 'amount');
      const maxVolume = this.getRangeMax(picker, 'volume');

      const canUseAmount = amountInput && maxAmount;
      const canUseVolume = volumeInput && maxVolume;

      if (!canUseAmount && !canUseVolume) {
        this.applyRangePercent(picker, 0, { skipInputs: true });
        return;
      }

      let value = 0;
      let max = 0;
      if (canUseAmount) {
        value = parseFloat(amountInput.value || '0') || 0;
        max = maxAmount;
      } else {
        value = parseFloat(volumeInput.value || '0') || 0;
        max = maxVolume;
      }

      const pct = Math.max(0, Math.min(100, (value / max) * 100));
      this.applyRangePercent(picker, pct, { skipInputs: true });
    } catch(e) {
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

      const maxAmount = this.getRangeMax(picker, 'amount');
      const maxVolume = this.getRangeMax(picker, 'volume');
      const amountValue = maxAmount ? maxAmount * percent / 100 : 0;
      const volumeValue = maxVolume ? maxVolume * percent / 100 : 0;
      const amountUnit = picker.dataset.amountUnit || '';
      const volumeUnit = picker.dataset.volumeUnit || '';
      const amountDisplay = picker.querySelector('[data-role="amount"]');
      const volumeDisplay = picker.querySelector('[data-role="volume"]');
      if (amountDisplay) amountDisplay.textContent = `${amountValue.toFixed(2)} ${amountUnit}`.trim();
      if (volumeDisplay) volumeDisplay.textContent = `${volumeValue.toFixed(4)} ${volumeUnit}`.trim();

      if (!opts.skipInputs) {
        this._rangeLock = true;
        const amountInput = this.findRangeInput(picker.dataset.amountKey);
        if (amountInput) amountInput.value = amountValue.toFixed(2);
        const volumeInput = this.findRangeInput(picker.dataset.volumeKey);
        if (volumeInput) volumeInput.value = volumeValue.toFixed(4);
        if (opts.deferFloating) {
          this._floatingDirty = true;
        } else {
          this.refreshFloatingFields();
          this._floatingDirty = false;
        }
        requestAnimationFrame(() => { this._rangeLock = false; });
      }
    } catch(e) {
      console.warn('applyRangePercent failed', e);
      this._rangeLock = false;
    }
  },

  refreshRangePickers() {
    try {
      const pickers = document.querySelectorAll('.allocation-picker');
      pickers.forEach(picker => this.syncPickerFromInputs(picker));
    } catch(e) {
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
    } catch(e) {
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
        try { this.updateOrderbookRows(); } catch(_) {}
      });
    } catch(e) {
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
          try { input.focus({ preventScroll: true }); } catch(_) { input.focus(); }
        });
      });
      this.refreshFloatingFields();
    } catch(e) {
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
    } catch(e) {
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
    } catch(e) {
      console.warn('refreshFloatingFields failed', e);
    }
  },

  // 动态计算订单簿条数（基于对应右侧操作区域的实际高度）
  updateOrderbookRows() {
    try {
      const contents = document.querySelectorAll('.trade-content');
      contents.forEach(content => {
  const panel = content.querySelector('.order-panel');
  const bookColumns = content.querySelector('.book-columns');
  if (!panel || !bookColumns) return;

        const panelHeight = panel.offsetHeight || 0;
        if (panelHeight) {
          bookColumns.style.height = panelHeight + 'px';
        } else {
          try { bookColumns.style.removeProperty('height'); } catch(_) {}
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

        const columnsHeight = panelHeight || bookColumns.offsetHeight || 0;
  const available = Math.max(0, columnsHeight - headerH - lastH - paddingTop - paddingBottom - gapTotal);

  const sampleRow = bookColumns.querySelector('.ob-row');
  const rowH = sampleRow ? (sampleRow.getBoundingClientRect().height || sampleRow.offsetHeight || 20) : 20;
  const perSide = Math.max(1, Math.floor((available / 2) / rowH));

        const asksBook = bookColumns.querySelector('.orderbook.asks');
        if (asksBook) this.updateBookRows(asksBook, perSide, 'ask');
        const bidsBook = bookColumns.querySelector('.orderbook.bids');
        if (bidsBook) this.updateBookRows(bidsBook, perSide, 'bid');
      });
    } catch(e) {
      console.warn('updateOrderbookRows failed', e);
    }
  },

  // 监听右侧面板高度变化，触发订单簿重算
  observeOrderPanels() {
    try {
      if (typeof ResizeObserver === 'undefined') return;
      const panels = document.querySelectorAll('.trade-content .order-panel');
      const ro = new ResizeObserver(() => {
        try { this.updateOrderbookRows(); } catch(_) {}
      });
      panels.forEach(p => ro.observe(p));
      // 存一份以便可能的后续清理（当前页面无需卸载）
      this._orderPanelRO = ro;
    } catch(e) { console.warn('observeOrderPanels failed', e); }
  },

  // 更新订单簿行数
  updateBookRows(bookElement, targetRows, type) {
    try {
      const currentRows = bookElement.querySelectorAll('.ob-row');
      const currentCount = currentRows.length;

      if (currentCount === targetRows) return; // 已经是目标行数

      if (currentCount < targetRows) {
        // 需要增加行
        const rowsToAdd = targetRows - currentCount;
        for (let i = 0; i < rowsToAdd; i++) {
          const row = document.createElement('view');
          row.className = `ob-row ${type === 'ask' ? 'up' : 'down'}`;
          row.innerHTML = `<text class="quote">3649.0000</text><text class="volume">${Math.floor(Math.random() * 3000) + 1}K</text>`;
          bookElement.appendChild(row);
        }
      } else {
        // 需要减少行
        const rowsToRemove = currentCount - targetRows;
        for (let i = 0; i < rowsToRemove; i++) {
          const lastRow = bookElement.querySelector('.ob-row:last-child');
          if (lastRow) lastRow.remove();
        }
      }
    } catch(e) {
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
        menu.addEventListener('click', function(evt) {
          const option = evt.target && evt.target.closest && evt.target.closest('.sheet-option');
          if (!option) return;
          evt.preventDefault();
          self.handleSheetOption(option.dataset && option.dataset.value);
        });
      }
      this._sheetReady = true;
    } catch(e) {
      console.warn('initActionSheet failed', e);
    }
  },

  openActionSheet(config = {}) {
    try {
      this.initActionSheet();
      const layer = this._sheetLayer || document.getElementById('action-sheet');
      if (!layer) return;
      this._sheetConfig = config;
      this._sheetSelection = config.selected || null;
      layer.dataset.mode = config.mode || 'menu';
      layer.dataset.theme = config.theme || 'dark';

      const titleEl = layer.querySelector('.sheet-title');
      if (titleEl) titleEl.textContent = config.title || '';
      const subEl = layer.querySelector('.sheet-subtitle');
      if (subEl) {
        subEl.textContent = config.subtitle || '';
        subEl.style.display = config.subtitle ? 'block' : 'none';
      }

      const actions = layer.querySelector('.sheet-actions');
      if (actions) {
        const shouldHide = config.mode === 'menu' ? config.hideActions !== undefined ? !!config.hideActions : true : !!config.hideActions;
        actions.classList.toggle('hidden', shouldHide);
      }

      const confirmBtn = layer.querySelector('.sheet-btn.primary');
      if (confirmBtn) confirmBtn.textContent = config.confirmText || 'Confirm';
      const cancelBtn = layer.querySelector('.sheet-btn.ghost');
      if (cancelBtn) cancelBtn.textContent = config.cancelText || 'Cancel';

      this.renderSheetMenu(config.mode === 'menu' ? (config.options || []) : []);
      this.renderSheetAlert(config);

      requestAnimationFrame(() => {
        layer.classList.add('visible');
        layer.setAttribute('aria-hidden', 'false');
      });
    } catch(e) {
      console.warn('openActionSheet failed', e);
    }
  },

  renderSheetMenu(options = []) {
    try {
      const layer = this._sheetLayer;
      if (!layer) return;
      const list = layer.querySelector('.sheet-menu');
      if (!list) return;
      if (!options.length) {
        list.innerHTML = '';
        return;
      }
      const html = options.map(opt => `
        <button class="sheet-option" type="button" data-value="${opt.value}">
          <div class="sheet-option-main">
            <span class="sheet-option-title">${opt.label}</span>
            ${opt.desc ? `<span class="sheet-option-desc">${opt.desc}</span>` : ''}
          </div>
          ${opt.badge ? `<span class="sheet-option-badge">${opt.badge}</span>` : ''}
        </button>
      `).join('');
      list.innerHTML = html;
    } catch(e) {
      console.warn('renderSheetMenu failed', e);
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
    } catch(e) {
      console.warn('renderSheetAlert failed', e);
    }
  },

  handleSheetOption(value) {
    try {
      const cfg = this._sheetConfig;
      if (!cfg) return;
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
    } catch(e) {
      console.warn('handleSheetOption failed', e);
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
    } catch(e) {
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
      } catch(_) {}
    }, 300);
  }
});
