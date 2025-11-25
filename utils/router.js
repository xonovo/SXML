// 轻量滑动路由：支持右→左页面过渡，不破坏现有 Page 机制
(function(){
  'use strict';
  if (window.sxmlNavigate) return; // 避免重复定义
  var activeView = null;
  var isAnimating = false;
  var cache = {}; // { url: { html, nodes, headInfo, jsLoaded } }
  var prefersReducedMotion = false;
  var motionMediaQuery = null;
  var overlayEl = null;

  function setAnimating(state){
    isAnimating = !!state;
    window.__SXML_ROUTER_ANIMATING__ = isAnimating;
  }
  setAnimating(false);

  function initMotionPreference(){
    if (typeof window.matchMedia !== 'function') return;
    try {
      motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      prefersReducedMotion = motionMediaQuery.matches;
      var handler = function(e){ prefersReducedMotion = !!(e && e.matches); };
      if (typeof motionMediaQuery.addEventListener === 'function') {
        motionMediaQuery.addEventListener('change', handler);
      } else if (typeof motionMediaQuery.addListener === 'function') {
        motionMediaQuery.addListener(handler);
      }
    } catch(_){ }
  }
  initMotionPreference();

  function ensureOverlay(){
    if (overlayEl && overlayEl.parentNode) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'page-transition-overlay';
    document.body.appendChild(overlayEl);
    return overlayEl;
  }
  function showOverlay(){
    var overlay = ensureOverlay();
    requestAnimationFrame(function(){ overlay.classList.add('visible'); });
  }
  function hideOverlay(){
    if (!overlayEl) return;
    overlayEl.classList.remove('visible');
  }

  // 注入基础样式（若不存在）
  function injectStyles(){
    if (document.getElementById('sxml-router-style')) return;
    // 调整动画：旧页完全离开(-100%)，避免 -30% 残影；添加 will-change 与 backface-visibility 优化合成层。
    var css = [
      '.page-stack{position:relative;width:100%;height:100%;overflow:hidden;}',
      '.page-view{position:absolute;top:0;left:0;width:100%;height:100%;overflow:auto;background:inherit;will-change:transform;backface-visibility:hidden;}',
      '.page-view.enter-forward{transform:translateX(100%);}',
      '.page-view.enter-back{transform:translateX(-100%);}',
      '.page-view.current{transform:translateX(0);}',
      '.page-view.animate{transition:transform .32s cubic-bezier(.23,.8,.32,1);}',
      '.page-view.slide-out-forward{transform:translateX(-100%);}',
      '.page-view.slide-in-forward{transform:translateX(0);}',
      '.page-view.slide-out-back{transform:translateX(100%);}',
      '.page-view.slide-in-back{transform:translateX(0);}',
      '.page-view.fade-mode{transition:opacity .24s ease;will-change:opacity;}',
      '.page-view.fade-enter{opacity:0;}',
      '.page-view.fade-visible{opacity:1;}',
      '.page-view.fade-exit{opacity:1;}',
      '.page-view.fade-hidden{opacity:0;}',
      '.page-transition-overlay{position:fixed;inset:0;pointer-events:none;background:var(--page-transition-overlay,#fff);opacity:0;transition:opacity .18s ease;z-index:9999;}',
      '.page-transition-overlay.visible{opacity:.1;}'
    ].join('\n');
    var style = document.createElement('style');
    style.id='sxml-router-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureStack(){
    if (document.querySelector('.page-stack')) return;
    var bodyChildren = Array.prototype.slice.call(document.body.childNodes);
    var stack = document.createElement('div');
    stack.className = 'page-stack';
    var view = document.createElement('div');
    view.className = 'page-view current';
    bodyChildren.forEach(function(n){ view.appendChild(n); });
    stack.appendChild(view);
    document.body.appendChild(stack);
    activeView = view;
  }

  function parseBody(html){
    var temp = document.createElement('div');
    temp.innerHTML = html.replace(/^[\s\S]*?<body[^>]*>/i,'').replace(/<\/body>[\s\S]*$/i,'');
    return Array.prototype.slice.call(temp.childNodes);
  }

  function loadPageScript(url, opts){
    opts = opts || {};
    return new Promise(function(resolve){
      var existing = document.querySelector('script[data-page-script="'+url+'"]');
      if (existing && !opts.forceReload) { resolve(); return; }
      if (existing && opts.forceReload) {
        try { existing.parentNode.removeChild(existing); } catch(_) {}
      }
      var realUrl = url;
      if (opts.cacheBust) realUrl += (url.indexOf('?')> -1 ? '&' : '?') + 'rv=' + Date.now();
      var s = document.createElement('script');
      s.src = realUrl; s.async=false; s.setAttribute('data-page-script',url); // data attr 保持原始 URL 便于重复 reload
      s.onload = function(){ resolve(); };
      s.onerror = function(){ resolve(); };
      document.head.appendChild(s);
    });
  }

  function extractPageJsUrl(targetUrl){
    return targetUrl.replace(/\.html?(\?.*)?$/i, '.js');
  }

  async function prefetch(url){
    if (cache[url]) return cache[url];
    try {
      var html = await fetch(url,{cache:'no-store'}).then(function(r){return r.text();});
      var nodes = parseBody(html);
      var headInfo = parseHead(html);
      preloadPageCss(headInfo, url);
      cache[url] = { html: html, nodes: nodes, headInfo: headInfo, jsLoaded: false };
      loadPageScript(extractPageJsUrl(url)).then(function(){ if (cache[url]) cache[url].jsLoaded = true; });
      return cache[url];
    } catch(e){ console.warn('[router] prefetch failed', e); return null; }
  }

  // 解析 <head> 部分拿到页面级样式与标题
  function parseHead(html){
    var m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    var headContent = m ? m[1] : '';
    var links = [];
    headContent.replace(/<link[^>]+>/gi, function(tag){
      if (/rel=["']stylesheet["']/i.test(tag)) {
        var hrefM = tag.match(/href=["']([^"']+)["']/i);
        if (hrefM) links.push(hrefM[1]);
      }
      return tag;
    });
    var titleMatch = headContent.match(/<title>([\s\S]*?)<\/title>/i);
    return { cssLinks: links, title: titleMatch ? titleMatch[1] : '' };
  }

  function resolveHref(href, baseUrl){
    try {
      if (/^(?:https?:|data:|\/)/i.test(href)) return href; // absolute or data
      var base = baseUrl.replace(/[^\/]+$/, ''); // remove file name
      // ensure trailing slash
      if (!/\/$/.test(base)) base += '/';
      var stack = base.split('/').filter(Boolean);
      var parts = href.split('/');
      for (var i=0;i<parts.length;i++) {
        var p = parts[i];
        if (p === '.' || p === '') continue;
        if (p === '..') { if (stack.length) stack.pop(); } else { stack.push(p); }
      }
      return '/' + stack.join('/');
    } catch(_) { return href; }
  }

  function preloadPageCss(headInfo, targetUrl){
    if (!headInfo || !headInfo.cssLinks || !headInfo.cssLinks.length) return;
    headInfo.cssLinks.forEach(function(href){
      var abs = resolveHref(href, targetUrl);
      if (!abs) return;
      if (document.querySelector('link[data-sxml-css-prefetch][href="'+abs+'"]')) return;
      var link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = abs;
      link.setAttribute('data-sxml-css-prefetch','1');
      link.addEventListener('error', function(){
        try { if (link && link.parentNode) link.parentNode.removeChild(link); } catch(_){ }
      }, { once: true });
      document.head.appendChild(link);
    });
  }

  function applyPageCss(headInfo, targetUrl){
    return new Promise(function(resolve){
      if (!headInfo || !headInfo.cssLinks || !headInfo.cssLinks.length) {
        // 没有按页面加载的 CSS，直接移除旧样式
        var stale = document.querySelectorAll('link[data-sxml-page-css]');
        for (var j=0;j<stale.length;j++){ try { stale[j].parentNode.removeChild(stale[j]); } catch(_){ } }
        resolve();
        return;
      }

      var oldLinks = Array.prototype.slice.call(document.querySelectorAll('link[data-sxml-page-css]'));
      var pending = 0;
      var completed = false;

      function finish(){
        if (completed) return;
        if (pending > 0) return;
        completed = true;
        for (var i=0;i<oldLinks.length;i++){
          try { if (oldLinks[i] && oldLinks[i].parentNode) oldLinks[i].parentNode.removeChild(oldLinks[i]); } catch(_){ }
        }
        resolve();
      }

      headInfo.cssLinks.forEach(function(href){
        var abs = resolveHref(href, targetUrl);
        if (!abs) return;
        // 若已有同 href 的页面级样式，直接复用，不增加 pending
        var existing = document.querySelector('link[data-sxml-page-css][href="'+abs+'"]');
        if (existing) {
          // 将已复用的旧节点从待移除列表剔除
          for (var k=0;k<oldLinks.length;k++) {
            if (oldLinks[k] === existing) {
              oldLinks.splice(k,1);
              break;
            }
          }
          return;
        }
        pending++;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = abs;
        link.setAttribute('data-sxml-page-css','1');
        var done = function(){
          link.removeEventListener('load', done);
          link.removeEventListener('error', done);
          pending = Math.max(0, pending - 1);
          finish();
        };
        link.addEventListener('load', done, { once: true });
        link.addEventListener('error', done, { once: true });
        document.head.appendChild(link);
      });

      if (pending === 0) {
        finish();
      } else {
        // 兜底：若 CSS 长时间未加载完成，也要解除旧样式（避免卡住）
        setTimeout(function(){ pending = 0; finish(); }, 800);
      }
    });
  }
  window.sxmlPrefetch = prefetch;

  async function sxmlNavigate(targetUrl, options){
    options = options || {};
    var direction = options.direction === 'back' ? 'back' : 'forward';
  if (isAnimating) return;
    injectStyles();
    ensureStack();

    var useFade = prefersReducedMotion || !!options.forceFade;

    var before = activeView;
    var pageData = cache[targetUrl];
    if (!pageData) pageData = await prefetch(targetUrl);
    if (!pageData || !pageData.nodes) return (window.location.href = targetUrl);

    showOverlay();

    // 处理 head 中的页面级 CSS，并等待加载完成以避免闪烁
    var cssReadyPromise = applyPageCss(pageData.headInfo, targetUrl);

    var nextView = document.createElement('div');
    var nextClass = 'page-view';
    if (!useFade) {
      nextClass += ' ' + (direction === 'back' ? 'enter-back' : 'enter-forward');
    }
    nextView.className = nextClass;
  // 使用 fragment 减少多次重排
  var frag = document.createDocumentFragment();
  pageData.nodes.forEach(function(n){ frag.appendChild(n.cloneNode(true)); });
  nextView.appendChild(frag);
  before.parentNode.appendChild(nextView);

    if (useFade) {
      nextView.classList.add('fade-mode','fade-enter');
      if (before) before.classList.add('fade-mode','fade-exit');
    }

    try {
      // 若脚本未加载过则加载；若已加载则尝试直接用缓存定义快速实例化
      if (!pageData.jsLoaded) {
        await loadPageScript(extractPageJsUrl(targetUrl));
        if (cache[targetUrl]) cache[targetUrl].jsLoaded = true;
      }
    } catch(_){}

    // 确保 CSS 已加载再执行动画，减少闪烁
    try { await cssReadyPromise; } catch(_){ }
    // 通过 rAF 分离布局与动画类添加，降低卡顿
    requestAnimationFrame(function(){
      nextView.offsetHeight; // 强制 reflow
      if (useFade) {
        nextView.classList.add('fade-visible');
        if (before) before.classList.add('fade-hidden');
      } else {
        if (before) before.classList.add('animate');
        nextView.classList.add('animate');
        if (direction === 'back') {
          if (before) before.classList.add('slide-out-back');
          nextView.classList.remove('enter-back');
          nextView.classList.add('slide-in-back');
        } else {
          if (before) before.classList.add('slide-out-forward');
          nextView.classList.remove('enter-forward');
          nextView.classList.add('slide-in-forward');
        }
      }
    });
    setAnimating(true);

  var ended = false;
    function end(){
      if (ended) return; // 防止重复调用（transitionend 与 fallback 定时器竞争）
      ended = true;
  setAnimating(false);
      if (before) {
        if (useFade) {
          before.classList.remove('fade-mode','fade-exit','fade-hidden');
        } else {
          before.classList.remove('animate','slide-out-forward','slide-out-back');
        }
      }
      try {
        if (before && before.parentNode) before.parentNode.removeChild(before);
      } catch(e) { /* ignore remove errors */ }
      if (nextView) {
        if (useFade) {
          nextView.classList.remove('fade-mode','fade-enter','fade-visible');
        } else {
          nextView.classList.remove('animate','slide-in-forward','slide-in-back');
        }
        nextView.classList.add('current');
        activeView = nextView;
      }
      // back 方向默认不入栈，避免历史膨胀；可通过 forceHistory 强制记录
      try {
        var shouldPush = !options.noHistory && window.history && window.history.pushState && (direction !== 'back' || options.forceHistory);
        if (shouldPush) window.history.pushState({ url: targetUrl }, '', targetUrl);
      } catch(_){}
      // 页面实例重建（基于 page.loader 缓存的定义）
      try {
        if (typeof window.__instantiatePage === 'function') {
          window.__instantiatePage(targetUrl.replace(/\?.*$/,'')); // path 作为 key
        }
      } catch(_){}
      try { if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply(nextView); } catch(_){ }
      hideOverlay();
      clearTimeout(timer);
    }

    var timer = setTimeout(end, 420); // 稍微延长以避免动画未结束提前清理
    var watchProp = useFade ? 'opacity' : 'transform';
    nextView.addEventListener('transitionend', function(ev){
      if (ev.propertyName === watchProp) end();
    }, { once: true });
  }

  window.sxmlNavigate = sxmlNavigate;
  // 简化返回：若有 history 则使用后退触发 popstate，否则直接用 sxmlNavigate back
  window.sxmlBack = function(){
    if (window.history && window.history.state) {
      try { window.history.back(); return; } catch(_) {}
    }
    // 尝试从当前 URL 推断上一个 index/login 页面（可根据业务扩展）
    var fallback = '/pages/index/index.html';
    sxmlNavigate(fallback, { direction: 'back', noHistory: true });
  };

  window.addEventListener('popstate', function(e){
    if (e.state && e.state.url) {
      sxmlNavigate(e.state.url, { direction: 'back', noHistory: true });
    }
  });
})();
