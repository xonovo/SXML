// rpx.js - Simple RPX unit polyfill for web runtime
// Converts inline style values containing `rpx` into px based on a 750rpx design width.
// - 1rpx = viewportWidth / 750 px (commonly used in mini-program design)
// - Scans inline style attributes and <style> tags within same-origin document
// - Re-applies on resize with debounce
(function(){
  'use strict';

  var DESIGN_WIDTH = 750; // base rpx width
  var ATTR_MARK = '__rpx_applied__';

  function vw(){ return Math.max(document.documentElement.clientWidth, window.innerWidth || 0) || 375; }
  function rpxToPx(num){ return (vw() / DESIGN_WIDTH) * num; }

  function replaceRpxInCssText(cssText){
    if (!cssText || cssText.indexOf('rpx') < 0) return cssText;
    return cssText.replace(/(-?\d*\.?\d+)rpx/g, function(_, n){
      var v = parseFloat(n);
      if (isNaN(v)) return _;
      var px = rpxToPx(v);
      return Math.round(px * 1000) / 1000 + 'px';
    });
  }

  function applyElementInline(el){
    try {
      if (!el || el.nodeType !== 1) return;
      var style = el.getAttribute('style');
      if (!style || style.indexOf('rpx') < 0) return;
      var applied = el.getAttribute(ATTR_MARK);
      var next = replaceRpxInCssText(style);
      if (next && next !== style){ el.setAttribute('style', next); el.setAttribute(ATTR_MARK, '1'); }
    } catch(_) {}
  }

  function applyAllInline(){
    try {
      var list = document.querySelectorAll('[style*="rpx"]');
      for (var i=0;i<list.length;i++) applyElementInline(list[i]);
    } catch(_) {}
  }

  function applyStyleTags(){
    try {
      var styles = document.querySelectorAll('style');
      for (var i=0;i<styles.length;i++){
        var st = styles[i];
        // Skip non-text style or ones already processed
        var css = st.textContent || '';
        if (!css || css.indexOf('rpx') < 0) continue;
        var next = replaceRpxInCssText(css);
        if (next && next !== css){ st.textContent = next; }
      }
    } catch(_) {}
  }

  function applyRpx(){
    applyAllInline();
    applyStyleTags();
  }

  // Observe dynamic DOM changes to update newly added inline styles containing rpx
  var observer;
  function enableObserver(){
    try {
      if (observer) return;
      observer = new MutationObserver(function(muts){
        for (var i=0;i<muts.length;i++){
          var m = muts[i];
          if (m.type === 'attributes' && m.attributeName === 'style' && m.target){
            applyElementInline(m.target);
          } else if (m.type === 'childList'){
            if (m.addedNodes && m.addedNodes.length){
              for (var j=0;j<m.addedNodes.length;j++){
                var n = m.addedNodes[j];
                if (n && n.nodeType === 1){
                  if (n.hasAttribute && n.hasAttribute('style')) applyElementInline(n);
                  var inner = n.querySelectorAll ? n.querySelectorAll('[style*="rpx"]') : [];
                  for (var k=0;k<inner.length;k++) applyElementInline(inner[k]);
                }
              }
            }
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true, attributeFilter: ['style'] });
    } catch(_) {}
  }

  function debounce(fn, wait){
    var t; return function(){ clearTimeout(t); t = setTimeout(fn, wait||120); };
  }

  function onResize(){ applyRpx(); }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ applyRpx(); enableObserver(); });
  } else {
    applyRpx(); enableObserver();
  }
  window.addEventListener('resize', debounce(onResize, 120));

  // Expose helper
  window.rpx = function(val){ return rpxToPx(Number(val)||0); };
})();
