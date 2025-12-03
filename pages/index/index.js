// 手机登录页逻辑 - 复用 login.js 核心逻辑
var app; try { app = getApp(); } catch (_) { app = window.app || {}; }

function getAppBasePath() {
  try {
    if (window.__SXML_BASE_PATH__) return window.__SXML_BASE_PATH__;
    var pathname = (window.location && window.location.pathname) ? window.location.pathname : '/';
    var idx = pathname.indexOf('/pages/');
    var base = idx >= 0 ? pathname.substring(0, idx) : pathname.replace(/[^\/]*$/, '');
    if (!base) base = '/';
    window.__SXML_BASE_PATH__ = base;
    return base;
  } catch (_) {
    return '/';
  }
}

function buildAppUrl(subPath) {
  if (!subPath) return '/';
  if (/^[a-z]+:\/\//i.test(subPath)) return subPath;
  var normalized = subPath.replace(/^\/+/, '');
  var base = getAppBasePath();
  if (base === '/') {
    return '/' + normalized;
  }
  return (base.endsWith('/') ? base : (base + '/')) + normalized;
}

Page({
  data: {
    keyStatus: false,
    codeStatus: false,
    timer: null,
    loginIp: '',
    loginLocation: '',
    loginOs: '',
    CURRENT_YEAR: new Date().getFullYear()
  },

  onLoad() {
    this.updateTitle();
    this.loadShowToast();
    this.getConfig();
    this.initClientEnv();
    this.initLanguageButton();
    // 禁止恢复缓存的密码：清空输入框，并移除已存在的哈希
    try {
      const pwdInput = document.getElementById('p');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.setAttribute('autocomplete', 'new-password');
      }
    } catch (_) { }
    // 启用登录按钮
    try {
      const btn = document.getElementById('but');
      if (btn) btn.removeAttribute('disabled');
    } catch (_) { }
    // 预加载注册页面，加速首次滑动进入
    try {
      if (window.sxmlPrefetch) {
        window.sxmlPrefetch(buildAppUrl('pages/webapp/regist/regist.html'));
      }
    } catch (_) { }
    // 提供 d_lock 给内联 SVG 使用
    try {
      window.d_lock = () => this.d_lock();
    } catch (_) { }
  },

  initLanguageButton() {
    try {
      if (window.i18n) {
        const langBtn = document.querySelector('.lang-btn');
        if (langBtn) {
          langBtn.textContent = window.i18n.lang === 'zh-CN' ? '中文' : 'English';
        }
      }
    } catch (e) {
      console.warn('initLanguageButton failed:', e);
    }
  },

  async toggleLanguage() {
    try {
      if (!window.i18n) return;
      const next = window.i18n.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
      await window.i18n.setLang(next);
      const btn = document.querySelector('.lang-btn');
      if (btn) btn.textContent = (next === 'zh-CN') ? '中文' : 'English';
    } catch (e) {
      console.warn('toggleLanguage failed', e);
    }
  },

  updateTitle() {
    try {
      document.title = 'ICE Markets - 登录';
    } catch (_) { }
  },

  onUnload() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
    try {
      if (window.d_lock) {
        window.d_lock = null;
      }
    } catch (_) { }
  },

  // ==================== 环境检测 ====================
  detectOS() {
    try {
      const ua = navigator.userAgent || navigator.vendor || window.opera || '';
      if (/windows nt/i.test(ua)) return 'Windows';
      if (/mac os x/i.test(ua)) return 'macOS';
      if (/android/i.test(ua)) return 'Android';
      if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
      if (/linux/i.test(ua)) return 'Linux';
      return 'Unknown';
    } catch (e) {
      return 'Unknown';
    }
  },

  async initClientEnv() {
    this.data.loginOs = this.detectOS();
    // 使用后端代理避免 CSP connect-src 扩散：/ext/ipapi 与 /ext/ipify 由 nginx 反向代理到外部
    // 优先获取地理信息，其次获取纯 IP；失败则静默
    const fetchJson = async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return res.json();
      } catch (_) { }
      return null;
    };
    const geo = await fetchJson('/ext/ipapi');
    if (geo) {
      this.data.loginIp = geo.ip || this.data.loginIp;
      const parts = [geo.city, geo.region, geo.country_name].filter(Boolean);
      this.data.loginLocation = parts.join(', ');
    } else {
      const plain = await fetchJson('/ext/ipify');
      if (plain) {
        this.data.loginIp = plain.ip || this.data.loginIp;
      }
    }
  },

  // ==================== 表单验证 ====================
  onlyNum(e) {
    const event = e || window.event;
    const allowedKeys = {
      'Backspace': 8,
      'Delete': 46,
      'ArrowLeft': 37,
      'ArrowRight': 39,
      'Tab': 9,
      'Enter': 13
    };
    if (allowedKeys[event.key] || event.ctrlKey || event.metaKey) return true;
    const isNumericInput = /^\d$/.test(event.key) || (event.keyCode >= 96 && event.keyCode <= 105);
    if (!isNumericInput) {
      event.preventDefault();
      return false;
    }
    const input = event.target;
    if (input.value.length >= 11 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      return false;
    }
    return true;
  },

  u_onfocus(id, check) {
    if (id && typeof id === 'object' && id.target) {
      const e = id;
      id = e.target && e.target.id;
      if (typeof check === 'undefined') check = (id === 'u');
    }
    const element = document.getElementById(id);
    if (element) element.placeholder = '';
    if (!check) return;
    const accountInput = document.getElementById('u');
    if (!accountInput) return;
    const account = accountInput.value ? accountInput.value.trim() : '';
    if (!account) return;
    // 优先使用本地缓存的 email，其次回退 userAccount，允许用户修改输入框
    const storedAccount = (localStorage.getItem('email') || localStorage.getItem('userAccount') || '').trim();
    try {
      if (account !== storedAccount) {
        this.setData({ keyStatus: false });
      } else {
        this.getConfig();
      }
    } catch (error) {
      console.error('Error in account validation:', error);
    }
  },

  u_onblur(id) {
    if (id && typeof id === 'object' && id.target) {
      const e = id;
      id = e.target && e.target.id;
    }
    const PLACEHOLDERS = {
      u: (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('login.placeholder.email', '请输入邮箱') : '请输入邮箱',
      k: (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('login.placeholder.key', '数字密钥（Key）') : '数字密钥（Key）',
      p: (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('login.placeholder.password', '请输入密码') : '请输入密码'
    };
    try {
      const element = document.getElementById(id);
      if (!element) return;
      element.placeholder = PLACEHOLDERS[id] || '请输入';
      switch (id) {
        case 'u':
          this.validateMobileInput(element);
          break;
        case 'k':
          this.validateKeyInput(element);
          break;
        case 'p':
          this.validatePasswordInput(element);
          break;
      }
    } catch (error) {
      console.error('Error in blur handler:', error);
    }
  },

  validateMobileInput(element) {
    const value = element.value.trim();
    if (!value) {
      element.setCustomValidity('');
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailPattern.test(value);
    if (!isValid) {
      const msg = window.i18n ? window.i18n.t('login.toast.emailFormat', '请输入有效的邮箱') : '请输入有效的邮箱';
      element.setCustomValidity(msg);
      app.showToast(msg, window.i18n ? window.i18n.t('login.toast.confirm') : 'confirm');
    } else {
      element.setCustomValidity('');
    }
  },

  validateKeyInput(element) {
    const value = element.value.trim();
    if (value) {
      if (value.length !== 32) {
        element.setCustomValidity(window.i18n ? window.i18n.t('login.toast.keyLength', '密钥必须是32位') : '密钥必须是32位');
        app.showToast(window.i18n ? window.i18n.t('login.toast.keyLength') : '密钥长度不正确', window.i18n ? window.i18n.t('login.toast.confirm') : 'confirm');
      } else {
        element.setCustomValidity('');
      }
    }
  },

  validatePasswordInput(element) {
    const value = element.value;
    if (value) {
      if (value.length < 6) {
        element.setCustomValidity(window.i18n ? window.i18n.t('login.toast.passwordLength', '密码至少需要6个字符') : '密码至少需要6个字符');
        app.showToast(window.i18n ? window.i18n.t('login.toast.passwordLength') : '密码长度不足', window.i18n ? window.i18n.t('login.toast.confirm') : 'confirm');
      } else {
        element.setCustomValidity('');
      }
    }
  },

  // ==================== 登录逻辑 ====================
  checkEnvSupport() {
    try {
      // storage capability
      const testKey = '__env_test__';
      sessionStorage.setItem(testKey, '1');
      sessionStorage.removeItem(testKey);
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
    } catch (e) {
      // E-ENV-001: 本地存储不可用，多见于 iOS 隐私浏览或禁用 Cookie 场景
      const msg = '当前浏览器处于隐私模式或禁止本地存储，无法登录\n[错误码: E-ENV-001]';
      app && app.showToast ? app.showToast(msg, 'OK') : console.warn(msg, e);
      return false;
    }
    if (!window.crypto || !window.crypto.subtle) {
      // E-ENV-002: WebCrypto 不支持，旧版系统/旧版浏览器常见
      const msg = '当前浏览器不支持安全加密，请升级系统或更换 Safari 版本\n[错误码: E-ENV-002]';
      app && app.showToast ? app.showToast(msg, 'OK') : console.warn(msg);
      return false;
    }
    return true;
  },
  // ==================== 异步操作 ==================== 
  //登录逻辑
  async loginEvent() {
    if (!this.checkEnvSupport()) {
      return; // 环境不满足，已提示
    }
    const accountInput = document.getElementById('u');
    const accountValue = accountInput ? accountInput.value.trim() : '';
    if (!accountValue) {
      app.showToast(
        window.i18n ? window.i18n.t('login.toast.emailRequired') : '邮箱未正确填写！',
        window.i18n ? window.i18n.t('login.toast.reEnter') : '重新输入'
      );
      if (accountInput) accountInput.focus();
      return;
    }
    this.validateMobileInput(accountInput);
    if ($("#p").val() == "") {
      app.showToast(
        window.i18n ? window.i18n.t('login.toast.passwordRequired') : "密码未填写！",
        window.i18n ? window.i18n.t('login.toast.reEnter') : "重新输入"
      );
      return;
    }

     sessionStorage.setItem("u", $("#u").val());
    // sessionStorage.setItem(
    //   "p",
    //   // 账号 + 明文密码 MD5（与加密/解密 apiKey 保持一致）
    //   hex_md5_utf($("#u").val() + $("#p").val()).toUpperCase()
    // );
    var u = $("#u").val();
    var p = hex_md5_utf($("#u").val() + $("#p").val()).toUpperCase()

    if (localStorage["apiKey"] && this.data.keyStatus) {
      try {
        const decryptedK = await Decrypt(
          localStorage["apiKey"],
          p,
          p.substring(0, 12)
        );
        sessionStorage.setItem("k", decryptedK);
        if (!sessionStorage["k"]) {
          app && app.showToast ? app.showToast('密码输入错误！', 'confirm') : null;
          return;
        }
      } catch (decryptErr) {
        // 解密失败（通常为密码错误），给出友好弹窗提示并终止后续流程
        app && app.showToast ? app.showToast('密码输入错误！', 'confirm') : null;
        return;
      }
    } else {
      if ($("#k").val().length < 32 || $("#k").val() == "") {
        app.showToast(
          window.i18n ? window.i18n.t('login.toast.keyRequired') : "数字密钥位数必须为32位！",
          window.i18n ? window.i18n.t('login.toast.reEnter') : "重新输入"
        );
        return;
      }
      sessionStorage.setItem("k", $("#k").val());
    }

    window.superAPI = createSuperAPI();
    this.loginInterface(u, p);
  },

  async loginInterface(u,p) {
    try {
      if (!window.superAPI) {
        window.superAPI = createSuperAPI();
      }

      // 移动端 401 修复：为登录请求临时设置邮箱作为 userAccount 头
      // 注意：不写入 sessionStorage，只在请求对象上临时设置
      try {
        if (u && typeof u === 'string' && window.superAPI) {
          if (!window.superAPI.userAccount) {
            window.superAPI.userAccount = u; // 临时头部字段，仅用于登录请求
          }
        }
      } catch (eSet) { console.warn('[index@loginInterface] pre-set userAccount failed', eSet); }

      const data = await window.superAPI.request(
        'I00002',
        {
          userEmail: u,
          userPassword: p,
          loginIp: this.data.loginIp,
          loginLocation: this.data.loginLocation,
          loginOs: this.data.loginOs,
          loginStatus: 1,
          loginMsg: "MOBILE WEB LOGIN"
        }
      );

      if (data && data.status) {

        // sessionStorage.setItem("USERINFO", JSON.stringify(data));
        // var USERINFO = JSON.stringify(data);
        try {
          const cipher = await Encrypt(
            sessionStorage["k"],
            p,
            p.substring(0, 12)
          );
          localStorage.setItem("apiKey", cipher);
          localStorage.setItem("email", u);
          localStorage.setItem("userAccount", data.userAccount);
          sessionStorage.setItem("u", data.userAccount);
        } catch (e) {
          app.showToast(
            window.i18n ? window.i18n.t('login.toast.storageError') : "本地存储失败",
            window.i18n ? window.i18n.t('login.toast.confirm') : "confirm"
          );
          return;
        }

        // 登录成功后跳转到 webapp
        console.log('[login] 登录成功，跳转到 webapp');
        window.location.replace(buildAppUrl('pages/webapp/webapp.html'));
      } else {
        app.showToast(
          (data.code || "") + " " + (data.message || (window.i18n ? window.i18n.t('login.toast.loginError') : "登录失败")),
          window.i18n ? window.i18n.t('login.toast.confirm') : "confirm"
        );
        document.getElementById("p").focus();
      }

    } catch (error) {
      // 不依赖控制台，所有诊断信息都通过弹窗展示，方便 iPhone 用户截图/转述
      let errName = '';
      let errMsg = '';
      try {
        errName = error && error.name ? String(error.name) : '';
        errMsg = error && error.message ? String(error.message) : '';
      } catch (_) {
        // 如果连 name/message 都取不到，就保持空字符串
      }

      // 若出现 401，尝试补偿：提示用户刷新或重新输入 32 位密钥；可选自动重试逻辑（暂不启用避免频繁请求）
      if (errMsg && /401/.test(errMsg)) {
        console.warn('[index@loginInterface] detected 401, session k length=', (sessionStorage.getItem ? (sessionStorage.getItem('k') || '').length : (sessionStorage['k']||'').length));
      }

      const baseTitle = window.i18n ? window.i18n.t('login.toast.loginError', '登录失败') : '登录失败';
      const netText = window.i18n ? window.i18n.t('login.toast.networkError', '网络错误') : '网络错误';

      // E-L-001: loginInterface 外层请求异常
      let debugHint = '\n[错误码: E-L-001]';
      if (errName) debugHint += '\n类型: ' + errName;
      if (errMsg) debugHint += '\n信息: ' + errMsg;

      app.showToast(
        baseTitle + ': ' + netText + debugHint,
        window.i18n ? window.i18n.t('login.toast.confirm', 'confirm') : 'confirm'
      );

      try {
        const uEl = document.getElementById('u');
        if (uEl) uEl.focus();
      } catch (_) { }
    }
  },

  getConfig() {
    const that = this;
    try {
      const uEl = document.getElementById("u");
      const pEl = document.getElementById("p");
      // 从本地读取 email 作为登录名来源，若不存在则继续使用 userAccount 回退
      const email = localStorage.getItem("email");
      const accountFallback = localStorage.getItem("userAccount");
      const accountToUse = email || accountFallback || '';
      if (uEl && accountToUse) {
        uEl.value = accountToUse;
        // 不锁定输入，不设置 readonly，允许用户直接修改
        uEl.removeAttribute('readonly');
        pEl && pEl.focus();
      } else {
        uEl && uEl.focus();
      }

      const hasKey = !!localStorage.getItem("apiKey");
      that.setData({
        keyStatus: hasKey
      })

      const communicationBlock = document.getElementById('communication-key-block');
      const secureBanner = document.getElementById('secure-key-banner');
      if (communicationBlock) {
        communicationBlock.style.display = hasKey ? 'none' : '';
      }
      if (secureBanner) {
        secureBanner.style.display = hasKey ? 'flex' : 'none';
      }
      if (window.i18n && typeof window.i18n.apply === 'function') {
        window.i18n.apply();
      }
    } catch (e) {
      console.warn('getConfig failed:', e);
    }
  },

  d_lock() {
    if (this.data.codeStatus) {
      app.showToast(
        window.i18n ? window.i18n.t('login.toast.codeMode', 'Scan code login mode, key cannot be uninstalled') : 'Scan code login mode, key cannot be uninstalled',
        window.i18n ? window.i18n.t('login.toast.confirm', 'confirm') : 'confirm'
      );
      return;
    }

    try {
      localStorage.removeItem('apiKey');
      localStorage.removeItem('userAccount');
      localStorage.removeItem('email');
      sessionStorage.removeItem('k');
      sessionStorage.removeItem('u');

      const mobileInput = document.getElementById('u');
      if (mobileInput) mobileInput.value = '';
      const keyInput = document.getElementById('k');
      if (keyInput) keyInput.value = '';

      const communicationBlock = document.getElementById('communication-key-block');
      const secureBanner = document.getElementById('secure-key-banner');
      if (communicationBlock) communicationBlock.style.display = '';
      if (secureBanner) secureBanner.style.display = 'none';

      this.setData({ keyStatus: false });

      app.showToast(
        window.i18n ? window.i18n.t('login.toast.keyRemoved', 'The secure key has been uninstalled. Please re-enter the communication key.') : 'The secure key has been uninstalled. Please re-enter the communication key.',
        window.i18n ? window.i18n.t('login.toast.confirm', 'confirm') : 'confirm'
      );

      setTimeout(() => {
        try {
          window.location.reload();
        } catch (_) { }
      }, 800);
    } catch (error) {
      console.error('d_lock failed:', error);
      app.showToast(
        window.i18n ? window.i18n.t('login.toast.keyRemoveFailed', 'Failed to uninstall the secure key, please try again.') : 'Failed to uninstall the secure key, please try again.',
        window.i18n ? window.i18n.t('login.toast.confirm', 'confirm') : 'confirm'
      );
    }
  },

  goRegist() {
    var target = buildAppUrl('pages/webapp/regist/regist.html');
    if (window.sxmlNavigate) {
      window.sxmlNavigate(target);
    } else {
      window.location.href = target;
    }
  },

  loadShowToast() {
    if (typeof LoadShowToast === 'function') {
      LoadShowToast();
    }
  }
});
