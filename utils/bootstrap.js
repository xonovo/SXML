(function(){
  try {
    if (window.__bootstrapLoaded) return; // guard against double-run
    window.__bootstrapLoaded = Date.now();
    try { console.log('[bootstrap] loaded', new Date(window.__bootstrapLoaded).toISOString()); } catch(_) {}

    // === 最简单的点击验证函数：无依赖，必定执行 ===
    window.__testClick = function(tag){
      try {
        var msg = 'TEST CLICK: ' + (tag || 'unknown');
        alert(msg); // 强制可见
        console && console.log && console.log('[testClick]', msg);
      } catch(_) {}
    };

    // util: lightweight non-blocking toast (no external deps)
    function __toast(msg, duration){
      try {
        var D = document; var body = D.body || D.documentElement;
        var id = '__bootstrap_toast_ctn__';
        var ctn = D.getElementById(id);
        if (!ctn){
          ctn = D.createElement('div');
          ctn.id = id;
          ctn.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:100000;pointer-events:none;display:flex;flex-direction:column;gap:8px;';
          body.appendChild(ctn);
        }
        var item = D.createElement('div');
        item.textContent = String(msg||'');
        item.style.cssText = 'max-width:80vw;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.78);color:#fff;font:14px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial;text-align:center;opacity:0;transition:opacity .18s, transform .18s;transform:translateY(10px)';
        ctn.appendChild(item);
        requestAnimationFrame(function(){ item.style.opacity = '1'; item.style.transform = 'translateY(0)'; });
        setTimeout(function(){ try{ item.style.opacity = '0'; item.style.transform = 'translateY(6px)'; setTimeout(function(){ item.remove(); }, 220); }catch(_){ } }, Math.max(800, duration||1200));
      } catch(_) {}
    }

    // 0) 轻量可视化标记（默认显示 1.5s）：用于确认脚本已运行，即使控制台不可见
    try {
      var VISUAL_DEBUG = false; // 已关闭可视化调试标记
      if (typeof window.__SXML_DEBUG_VISUAL === 'boolean') VISUAL_DEBUG = window.__SXML_DEBUG_VISUAL;
      if (VISUAL_DEBUG) {
        var tip = document.createElement('div');
        tip.textContent = 'Bootstrap loaded';
        tip.style.cssText = 'position:fixed;top:6px;left:6px;z-index:99999;background:rgba(0,0,0,0.65);color:#fff;padding:6px 8px;border-radius:6px;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial;pointer-events:none;opacity:0;transition:opacity .25s';
        document.documentElement.appendChild(tip);
        requestAnimationFrame(function(){ tip.style.opacity = '1'; });
        setTimeout(function(){ try{ tip.style.opacity = '0'; setTimeout(function(){ tip.remove(); }, 400); }catch(_){ } }, 1500);
      }
    } catch(_) {}

    // 0.5) Safe Area 兜底：如果 CSS env/constant 无法得到安全区，使用 JS 估算补偿
    try {
      function readEnvPx(mode, prop){
        try {
          var d = document.createElement('div');
          d.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:0;line-height:0;';
          // 单独设置需要测量的高度
          d.style.height = mode + '(' + prop + ')';
          document.documentElement.appendChild(d);
          var h = d.getBoundingClientRect().height || 0;
          d.remove();
          return h;
        } catch(_) { return 0; }
      }
      var topEnv = readEnvPx('env','safe-area-inset-top');
      var topConst = readEnvPx('constant','safe-area-inset-top');
      var botEnv = readEnvPx('env','safe-area-inset-bottom');
      var botConst = readEnvPx('constant','safe-area-inset-bottom');
  var top = Math.max(topEnv, topConst) || 0;
  var bottom = Math.max(botEnv, botConst) || 0;

      function isIOS(){
        try { return /iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document); } catch(_) { return false; }
      }
      function isNotchLike(){
        try {
          var w = Math.min(screen.width, screen.height);
          var h = Math.max(screen.width, screen.height);
          return (w >= 375 && h >= 812);
        } catch(_) { return false; }
      }
      if ((top <= 0 && bottom <= 0) && isIOS() && isNotchLike()) {
        // 默认值调整：顶部 40，底部保持 34
        top = 40; bottom = 34;
      }
  // 限制顶部安全区为最多 40px（占位要求：40px）
  if (top > 40) top = 40;
  // 限制底部安全区为最多 20px（TabBar 需求：20px）
  if (bottom > 20) bottom = 20;
      // 暴露变量，供其它脚本使用
      try {
        document.documentElement.style.setProperty('--safe-area-top', top + 'px');
        document.documentElement.style.setProperty('--safe-area-bottom', bottom + 'px');
      } catch(_) {}

      // 若 CSS env 无效，则用 inline 覆盖占位元素与 tabbar
      var envTopZero = (topEnv <= 0 && topConst <= 0);
      var envBotZero = (botEnv <= 0 && botConst <= 0);
      if (envTopZero && top > 0) {
        try {
          var st = document.querySelector('.safe-top');
          if (st) { st.style.height = top + 'px'; }
        } catch(_) {}
      }
      if (envBotZero && bottom > 0) {
        try {
          var tb = document.querySelector('.tabbar');
          if (tb) {
            var cs = window.getComputedStyle(tb);
            var pb = parseFloat(cs.paddingBottom || '0') || 0;
            // 不再额外 +6px，仅叠加安全区数值
            tb.style.paddingBottom = (pb + bottom) + 'px';
          }
        } catch(_) {}
      }
    } catch(_) {}

    // 1) Global click debug (capture) — verify clicks reach JS layer
    try {
      document.addEventListener('click', function(ev){
        try {
          var t = ev.target; var cls = t && t.className ? String(t.className) : '';
          console && console.log && console.log('[dbg-click]', t && t.tagName, cls);
          // 视觉点击标记：在点击处显示一个小点 400ms
          try {
            var dot = document.createElement('div');
            dot.style.cssText = 'position:fixed;width:10px;height:10px;border-radius:50%;background:rgba(255,0,0,.7);box-shadow:0 0 0 2px rgba(255,0,0,.25);z-index:99999;pointer-events:none;opacity:1;transform:translate(-50%,-50%)';
            dot.style.left = (ev.clientX || 0) + 'px';
            dot.style.top = (ev.clientY || 0) + 'px';
            document.body.appendChild(dot);
            setTimeout(function(){ try{ dot.style.transition = 'opacity .25s, transform .25s'; dot.style.opacity = '0'; dot.style.transform = 'translate(-50%,-50%) scale(0.8)'; setTimeout(function(){ dot.remove(); }, 260); }catch(_){ } }, 10);
          } catch(_) {}
        } catch(_) {}
      }, { capture: true });
    } catch(_) {}

    // 2) Bridge: works even if Page() not ready
    if (typeof window.__langClickBridge !== 'function') {
      window.__langClickBridge = async function(e){
        try {
          if (window.currentPage && typeof window.currentPage.toggleLanguage === 'function') {
            return window.currentPage.toggleLanguage(e);
          }
          if (window.i18n && typeof window.i18n.setLang === 'function') {
            var next = window.i18n.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
            await window.i18n.setLang(next);
            try {
              var btn = (e && e.currentTarget) || document.querySelector('.lang-btn');
              if (btn) btn.textContent = (next === 'zh-CN') ? 'English' : '中文';
            } catch(_) {}
            console && console.log && console.log('[bootstrap] bridge toggled ->', next);
            // 可视化兜底（非阻塞）
            try { if (!window.__LANG_TOAST_ONCE) { window.__LANG_TOAST_ONCE = 1; } } catch(_) {}
          } else {
            console && console.warn && console.warn('[bootstrap] i18n not available');
            // 最终兜底（静默）
            try { window.__LANG_TOAST_ONCE = 1; } catch(_) {}
          }
        } catch(err) {
          console && console.warn && console.warn('[bootstrap] bridge error', err);
        }
      };
    }

    // 3) Delegated fallback on .lang-btn when page handler missing
    try {
      document.addEventListener('click', async function(e){
        try {
          var btn = e.target && (e.target.closest ? e.target.closest('.lang-btn') : null);
          if (!btn) return;
          // 安全闸：无论 Page 是否已就绪，都安排一次兜底反馈，若 200ms 内没有任何一方设置反馈标志，则提示
          try {
            var fired = false;
            setTimeout(function(){ try{ if (!window.__LANG_FEEDBACK) { window.__LANG_FEEDBACK = true; } }catch(_){ } }, 200);
          } catch(_) {}
          if (window.currentPage && typeof window.currentPage.toggleLanguage === 'function') { return; } // page will handle
          if (!(window.i18n && typeof window.i18n.setLang === 'function')) {
            // 仍未就绪：静默兜底
            try { window.__LANG_TOAST_ONCE = 1; } catch(_) {}
            return;
          }
          var next = window.i18n.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
          try { window.__LANG_FEEDBACK = true; } catch(_) {}
          await window.i18n.setLang(next);
          try { btn.textContent = (next === 'zh-CN') ? 'English' : '中文'; } catch(_) {}
          console && console.log && console.log('[bootstrap] delegated toggled ->', next);
          try { if (!window.__LANG_TOAST_ONCE) { window.__LANG_TOAST_ONCE = 1; } } catch(_) {}
        } catch(_) {}
      }, { capture: true });
    } catch(_) {}

  } catch (e) {
    try { console.error('[bootstrap] failed', e); } catch(_) {}
  }
})();
