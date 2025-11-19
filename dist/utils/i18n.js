(function () {
  'use strict';

  // Simple dotted-key resolver
  function get(obj, path, fallback) {
    if (!obj || !path) return fallback;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return fallback;
      }
    }
    return cur == null ? fallback : cur;
  }


  // Decide initial language
  function detectLang() {
    const saved = localStorage.getItem('lang');
    if (saved) return saved;
    const nav = (navigator.language || navigator.userLanguage || 'en-US');
    // Normalize common cases
    if (/^zh/i.test(nav)) return 'zh-CN';
    return 'en-US';
  }

  const i18n = {
    lang: detectLang(),
    dict: {},

    async load(lang) {
      this.lang = lang || this.lang;

      // 快速路径1：优先检查是否有预加载的 JS 语言包（window.LOCALE_zh_CN / window.LOCALE_en_US）
      const jsPackKey = `LOCALE_${this.lang.replace('-', '_')}`;
      if (window[jsPackKey]) {
        this.dict = window[jsPackKey];
        this.replacePlaceholders();
        console && console.log && console.log('[i18n] using pre-loaded JS pack:', jsPackKey);
        return this.dict;
      }

      // 快速路径2：动态加载对应语言的 JS 模块（利用浏览器缓存，比 JSON 更快）
      const jsUrl = `../../locales/${this.lang}.js`;
      try {
        await this.loadScript(jsUrl);
        // 加载后再次检查
        if (window[jsPackKey]) {
          this.dict = window[jsPackKey];
          this.replacePlaceholders();
          console && console.log && console.log('[i18n] loaded JS pack from:', jsUrl);
          return this.dict;
        }
      } catch (e) {
        console && console.warn && console.warn('[i18n] failed to load JS pack:', jsUrl, e);
      }

      // Fallback: 尝试 JSON（兼容性）
      const isFile = location.protocol === 'file:';

      // Try multiple candidate paths to support pages nested under folders
      // 将最可能命中的相对路径放在最前，避免多次 404 带来的延迟
      const candidates = [
        `../../locales/${this.lang}.json`,
        `../locales/${this.lang}.json`,
        `./locales/${this.lang}.json`,
        `/locales/${this.lang}.json`
      ];

      if (!isFile) {
        // 并行尝试多个候选，谁先成功用谁；设置超时兜底避免长时间等待
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const signal = controller ? controller.signal : undefined;
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 600));

        const fetchers = candidates.map(url => (
          fetch(url, { cache: 'no-store', signal })
            .then(res => res.ok ? res.json().then(json => ({ ok: true, url, json })) : Promise.reject(new Error(res.statusText)))
            .catch(() => ({ ok: false, url }))
        ));

        try {
          // 自定义 race：取第一个 ok 的结果；若 600ms 内无成功则走内置包
          const results = await Promise.race([
            Promise.all(fetchers).then(list => list.find(x => x && x.ok)),
            timeout
          ]);

          if (results && results.ok) {
            this.dict = results.json;
            this.replacePlaceholders();
            console && console.log && console.log('[i18n] loaded locale from', results.url);
            if (controller) controller.abort();
            return this.dict;
          }
        } catch (e) {
          // ignore and fallback
        }
        if (controller) controller.abort();
      }

  // Fallback removed: avoid bundling embedded language packs; leave empty dict
  this.dict = {};
  this.replacePlaceholders();
  console && console.warn && console.warn('[i18n] no locale loaded for', this.lang);
  return this.dict;
    },

    // 替换字典中的模板占位符（{{APP_NAME}} 等）
    replacePlaceholders() {
      if (!window.APP_CONFIG || !window.APP_CONFIG.app) {
        // 如果外部配置还未加载，跳过替换（后续可能重新执行）
        return;
      }
      
      const appName = window.APP_CONFIG.app.name || 'Your App';
      const appTitle = window.APP_CONFIG.app.title || 'Your App Title';
      const appSubtitle = window.APP_CONFIG.app.subtitle || 'Management System';
      
      // 深度替换整个字典对象
      const replaceIn = (obj) => {
        if (typeof obj === 'string') {
          return obj
            .replace(/\{\{APP_NAME\}\}/g, appName)
            .replace(/\{\{APP_TITLE\}\}/g, appTitle)
            .replace(/\{\{APP_SUBTITLE\}\}/g, appSubtitle);
        } else if (Array.isArray(obj)) {
          return obj.map(replaceIn);
        } else if (obj && typeof obj === 'object') {
          const newObj = {};
          for (const k in obj) {
            newObj[k] = replaceIn(obj[k]);
          }
          return newObj;
        }
        return obj;
      };
      
      this.dict = replaceIn(this.dict);
    },

    // 动态加载 JS 脚本（返回 Promise）
    loadScript(src) {
      return new Promise((resolve, reject) => {
        // 检查是否已经加载过
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          // 等待一小段时间确保执行完成
          setTimeout(resolve, 10);
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    },

    // Translate in JS usage
    t(key, fallback) {
      return get(this.dict, key, fallback != null ? fallback : key);
    },

    // Apply to DOM using data-i18n* attributes
    apply(root) {
      const scope = root || document;

      // data-i18n: textContent
      scope.querySelectorAll('[data-i18n]').forEach(el => {
        // 跳过语言切换器及其子元素（option 标签应保持原生语言名称）
        const langSelector = document.getElementById('langSelect');
        if (langSelector && (el === langSelector || langSelector.contains(el))) {
          return; // 跳过语言切换器
        }
        
        const key = el.getAttribute('data-i18n');
        const val = this.t(key, el.textContent);
        // Preserve line breaks if provided with \n
        if (el.hasAttribute('data-i18n-html')) {
          el.innerHTML = val;
        } else {
          el.textContent = val;
        }
      });

      // Attributes
      scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', this.t(key, el.getAttribute('placeholder')));
      });

      scope.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.setAttribute('title', this.t(key, el.getAttribute('title')));
      });

      scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        el.setAttribute('aria-label', this.t(key, el.getAttribute('aria-label')));
      });

      // Alt attribute for images/icons
      scope.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        el.setAttribute('alt', this.t(key, el.getAttribute('alt')));
      });

      // Update <title> if a key is provided
      const titleKey = document.documentElement.getAttribute('data-i18n-title-key');
      if (titleKey) {
        document.title = this.t(titleKey, document.title);
      }

      // Sync language selector if present
      const sel = document.getElementById('langSelect');
      if (sel) {
        // 确保选择器值与当前语言一致，避免显示错误
        if (sel.value !== this.lang) {
          console.log('[i18n] syncing langSelect from', sel.value, 'to', this.lang);
          sel.value = this.lang;
        }
      }

      // Update <html lang="...">
      document.documentElement.setAttribute('lang', this.lang);
    },

    async setLang(lang) {
      if (!lang) return;
      this.lang = lang;
      localStorage.setItem('lang', this.lang);
      await this.load(this.lang);
      this.apply();
    }
  };

  // Expose globally
  window.i18n = i18n;

  // Initialize after DOM is ready
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await i18n.load(i18n.lang);
      i18n.apply();
      // 标记 i18n 就绪，供样式与页面淡入协调
      try {
        document.documentElement.classList.add('i18n-ready');
        const evt = new Event('i18n:ready');
        window.dispatchEvent(evt);
      } catch (_) { /* ignore */ }
    } catch (e) {
      // Non-fatal
      console && console.warn && console.warn('i18n init failed:', e);
      // 即便失败，也允许页面显示
      try {
        document.documentElement.classList.add('i18n-ready');
        const evt = new Event('i18n:ready');
        window.dispatchEvent(evt);
      } catch (_) { /* ignore */ }
    }
  });
})();
