// 登录页面 - 使用现代化 Web 3.0 开发模式
// 通过 getApp() 访问全局方法(类似微信小程序)
var app; try { app = getApp(); } catch(_) { app = window.app || {}; }

Page({
  // 页面数据
  data: {
    keyStatus: false,
    codeStatus: false,
    timer: null,
    // 客户端环境信息
    loginIp: '',
    loginLocation: '',
    loginOs: '',
    hh: '你好'
  },

  // 页面加载时执行
  onLoad(options) {
    console.log('Login page loaded', options);
    this.loadShowToast();
    this.getConfig();
    this.initClientEnv();
    // Page 初始化完成，启用登录按钮，避免初始化前点击导致的报错
    try {
      const btn = document.getElementById('but');
      if (btn) btn.removeAttribute('disabled');
    } catch (_) {}
  },

  // 页面显示时执行
  onShow() {
    console.log('Login page shown');
  },

  // 页面卸载前清理定时器
  onUnload() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  // ==================== 方法定义 ====================

  // 简单的操作系统检测
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

  // 初始化客户端环境信息
  async initClientEnv() {
    // 操作系统本地解析即可
    this.data.loginOs = this.detectOS();

    // 优先使用 ipapi.co 一次性获取 IP + 地区
    try {
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        this.data.loginIp = data.ip || this.data.loginIp;
        const parts = [data.city, data.region, data.country_name].filter(Boolean);
        this.data.loginLocation = parts.join(', ');
        return;
      }
    } catch (_) { /* 忽略，进入回退 */ }

    // 回退：仅拿公网 IP
    try {
      const res2 = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      if (res2.ok) {
        const data2 = await res2.json();
        this.data.loginIp = data2.ip || this.data.loginIp;
      }
    } catch (_) { /* 忽略 */ }
  },

  // 限制输入手机号码
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

    if (allowedKeys[event.key] || event.ctrlKey || event.metaKey) {
      return true;
    }

    const isNumericInput = (
      /^\d$/.test(event.key) ||
      (event.keyCode >= 96 && event.keyCode <= 105)
    );

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

  // 焦点集中效果和账号验证
  u_onfocus(id, check) {
    // 兼容 SXML 事件：允许传入 event 对象
    if (id && typeof id === 'object' && id.target) {
      const e = id;
      id = e.target && e.target.id;
      // 默认仅在手机号输入框触发校验逻辑
      if (typeof check === 'undefined') check = (id === 'u');
    }

    const element = document.getElementById(id);

    if (element) {
      element.placeholder = '';
    }

    if (!check) {
      return;
    }

    const accountInput = document.getElementById('u');
    if (!accountInput) {
      console.warn('Account input element not found');
      return;
    }

    const account = accountInput.value ? accountInput.value.trim() : '';
    if (!account) {
      return;
    }

    const storedAccount = (localStorage.getItem('userAccount') || '').trim();

    try {
      if (account !== storedAccount) {
        this.setData({ keyStatus: false });

        const event = new CustomEvent('accountChange', {
          detail: { account, mobile: account, matched: false }
        });
        document.dispatchEvent(event);
      } else {
        this.getConfig();
        const event = new CustomEvent('accountChange', {
          detail: { account, mobile: account, matched: true }
        });
        document.dispatchEvent(event);
      }
    } catch (error) {
      console.error('Error in account validation:', error);
      app.showToast('There was an error during the account verification process, please try again', 'confirm');
    }
  },

  // 焦点离开效果和输入验证
  u_onblur(id) {
    // 兼容 SXML 事件：允许传入 event 对象
    if (id && typeof id === 'object' && id.target) {
      const e = id;
      id = e.target && e.target.id;
    }
    // 使用 i18n 动态占位符，若 i18n 不可用则回退英文
    const PLACEHOLDERS = {
  u: (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('login.placeholder.account', 'Please enter e-mail/account') : 'Please enter e-mail/account',
      k: (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('login.placeholder.key', 'digital key（Key）') : 'digital key（Key）',
      p: (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('login.placeholder.password', 'Please enter the password') : 'Please enter the password'
    };

    try {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with id "${id}" not found`);
        return;
      }

      element.placeholder = PLACEHOLDERS[id] || (window.i18n && window.i18n.t ? window.i18n.t('input.default', 'Please enter') : 'Please enter');

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

      const event = new CustomEvent('fieldValidation', {
        detail: {
          field: id,
          value: element.value,
          isValid: element.validity.valid
        }
      });
      document.dispatchEvent(event);

    } catch (error) {
      console.error('Error in blur handler:', error);
      app.showToast('输入验证出现错误', 'confirm');
    }
  },

  // 登录账号验证（邮箱或账号）
  validateMobileInput(element) {
    const value = element.value.trim();
    if (!value) {
      element.setCustomValidity('');
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const accountPattern = /^[A-Za-z0-9._-]{4,64}$/;
    const isValid = emailPattern.test(value) || accountPattern.test(value);
    if (!isValid) {
      element.setCustomValidity('Please enter a valid e-mail or account');
      app.showToast('Please enter a valid e-mail or account', 'confirm');
    } else {
      element.setCustomValidity('');
    }
  },

  // 密钥验证
  validateKeyInput(element) {
    const value = element.value.trim();
    if (value) {
      if (value.length !== 32) {
        element.setCustomValidity('The key must be 32 bytes');
        app.showToast('The key length is incorrect', 'confirm');
      } else {
        element.setCustomValidity('');
      }
    }
  },

  // 密码验证
  validatePasswordInput(element) {
    const value = element.value;
    if (value) {
      if (value.length < 6) {
        element.setCustomValidity('The password needs to be at least 6 characters long');
        app.showToast('Insufficient password length', 'confirm');
      } else {
        element.setCustomValidity('');
      }
    }
  },

  // 登录事件
  async loginEvent() {
    const accountInput = document.getElementById('u');
    const accountValue = accountInput ? accountInput.value.trim() : '';
    if (!accountValue) {
      app.showToast('E-mail/Account not filled in correctly!', 'Re-enter');
      if (accountInput) accountInput.focus();
      return;
    }
    this.validateMobileInput(accountInput);
    if ($("#p").val() == "") {
      app.showToast("Password not filled in!", "Re-enter");
      return;
    }

    sessionStorage.setItem("u", $("#u").val());
    sessionStorage.setItem(
      "p",
      hex_md5_utf($("#u").val() + $("#p").val()).toUpperCase()
    );

    if (localStorage["apiKey"] && this.data.keyStatus) {
      const decryptedK = await Decrypt(
        localStorage["apiKey"],
        sessionStorage["p"],
        sessionStorage["p"].substring(0, 12)
      );
      sessionStorage.setItem("k", decryptedK);
      if (sessionStorage["k"] == "") {
        app.showToast("Incorrect password", "Re-enter");
        return;
      }
    } else {
      if ($("#k").val().length < 11 || $("#k").val() == "") {
        app.showToast("The number of digits for the digital key must be 32 bytes！", "Re-enter");
        return;
      }
      sessionStorage.setItem("k", $("#k").val());
    }

    // 初始化全站全局超级API实例
    window.superAPI = createSuperAPI();

    this.loginInterface();
  },

  // 表单提交（统一处理点击按钮和回车提交）
  onFormSubmit(e) {
    try {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
    } catch (_) {}
    // 直接复用原有登录流程
    this.loginEvent();
  },

  // 登录接口
  async loginInterface() {
    try {
      if (!window.superAPI) {
        window.superAPI = createSuperAPI();
      }

      const data = await window.superAPI.request(
        'I00002',
        {
          userEmail: sessionStorage["u"],
          userPassword: sessionStorage["p"],
          loginIp: this.data.loginIp,
          loginLocation: this.data.loginLocation,
          loginOs: this.data.loginOs,
          loginStatus: 1,
          loginMsg: "WEB LOGIN"
        }
      );

      console.log("loginResponse", data);

      if (data && data.status) {
        try {
          data.menuList = JSON.parse(data.menuList);
          data.leftData = JSON.parse(data.leftData);
          data.permissionSystem = JSON.parse(data.permissionSystem);
        } catch (e) {
          app.showToast("数据解析失败", "确定");
          return;
        }

        sessionStorage.setItem("USERINFO", JSON.stringify(data));

        try {
          const cipher = await Encrypt(
            sessionStorage["k"],
            sessionStorage["p"],
            sessionStorage["p"].substring(0, 12)
          );
          localStorage.setItem("apiKey", cipher);
          localStorage.setItem("userAccount", sessionStorage["u"]);
        } catch (e) {
          app.showToast("本地存储失败", "confirm");
          return;
        }

        window.location.replace(data.url);
        console.log("loginData", data);
      } else {
        app.showToast((data.code || "") + " " + (data.message || "Login failed"), "confirm");
        document.getElementById("p").focus();
      }

    } catch (error) {
      console.error("登录错误:", error);
      app.showToast("登录失败: " + (error.message || "网络错误"), "confirm");
      document.getElementById("u").focus();
    }
  },

  // 回车事件
  login_onkeydown(e) {
    const event = e || window.event;

    if (event.key === 'Enter' || event.keyCode === 13) {
      event.preventDefault();

      const passwordField = document.getElementById('p');
      if (!passwordField || !passwordField.value) {
        app.showToast('Please enter the password', 'confirm');
        return;
      }

      this.loginEvent();
    }
  },

  // 语言切换
  async changeLang(e) {
    try {
      // 兼容 SXML/DOM 事件两种结构，优先取 DOM 的 target.value
      let lang = (e && e.target && (e.target.value || (e.target.options && e.target.options[e.target.selectedIndex] && e.target.options[e.target.selectedIndex].value))) || '';
      // 兼容可能的 e.detail.value（若未来映射为框架风格）
      if (!lang && e && e.detail && typeof e.detail.value !== 'undefined') {
        lang = e.detail.value;
      }
      if (!lang) lang = 'en-US';

      // 同步选择器显示
      const sel = document.getElementById('langSelect');
      if (sel) sel.value = lang;

      // 若 i18n 不存在，动态加载后再切换
      if (!window.i18n) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '../../utils/i18n.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load i18n.js'));
          document.head.appendChild(script);
        });
      }

      if (window.i18n && typeof window.i18n.setLang === 'function') {
        await window.i18n.setLang(lang);
        // 再次应用，确保占位符和动态属性更新
        window.i18n.apply();
        // 标记就绪（避免可见性被 CSS 隐藏）
        document.documentElement.classList.add('i18n-ready');
      } else {
        // 兜底：记录在本地，刷新后生效
        localStorage.setItem('lang', lang);
      }
    } catch (err) {
      console.warn('changeLang failed:', err);
    }
  },

  // 获取本地配置
  getConfig() {
    const that = this;
    try {
      // 回填账号并设置焦点
      const uEl = document.getElementById("u");
      const pEl = document.getElementById("p");
      const account = localStorage.getItem("userAccount");
      if (uEl && account) {
        uEl.value = account;
        pEl && pEl.focus();
      } else {
        uEl && uEl.focus();
      }

      // 依据是否存在 apiKey 切换 UI
      const hasKey = !!localStorage.getItem("apiKey");
      that.setData({
        keyStatus: hasKey
      })
      // 确保 i18n 已应用，避免首次渲染未翻译
      if (window.i18n && typeof window.i18n.apply === 'function') {
        window.i18n.apply();
      }
    } catch (e) {
      console.warn('getConfig failed:', e);
    }
  },

  // 卸载密钥
  d_lock() {
    if (this.data.codeStatus) {
      app.showToast("Scan code login mode, key cannot be uninstalled", "OK");
    } else {
      this.setData({ keyStatus: false });
      localStorage.removeItem("apiKey");
      localStorage.removeItem("userAccount");
      const uEl = document.getElementById("u");
      if (uEl) uEl.value = "";
      app.showToast("The key has been uninstalled, please re-enter", "OK");
    }
  },

  // 切换成二维码
  enterCode() {
    // 若当前为二维码模式，则关闭并清理
    if (this.data.codeStatus) {
      this.setData({ codeStatus: false });
      if (this.data.timer) {
        clearInterval(this.data.timer);
        this.data.timer = null;
      }
      const containerOff = document.getElementById("canvasId");
      // 安全清理:使用 textContent 替代 innerHTML
      if (containerOff) containerOff.textContent = "";
      return;
    }

    // 打开二维码模式
    this.setData({ codeStatus: true });

    const container = document.getElementById("canvasId");
    if (!container) {
      app.showToast((window.i18n && i18n.t ? i18n.t('login.qrcode.containerMissing', 'QR code container not found') : 'QR code container not found'), 'confirm');
      return;
    }
    if (typeof QRCode !== 'function') {
      app.showToast((window.i18n && i18n.t ? i18n.t('login.qrcode.moduleMissing', 'QR code module is not loaded') : 'QR code module is not loaded'), 'confirm');
      return;
    }

    const timestamp = Date.now();
    const code = hex_md5_utf(timestamp + "SuperSystem").toUpperCase();

    // 规范化 BASE_URL，去掉末尾斜杠
    //const base = (window.API_CONFIG && window.API_CONFIG.BASE_URL) || '';
    const baseUrl = 'ICE';//base.replace(/\/+$/, '');

    // 生成二维码
    // 安全清理:先移除所有子节点,避免 innerHTML XSS 风险
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    new QRCode(container, {
      text: `${baseUrl}/scanlogin:${code}`,
      width: 200,
      height: 200,
    });

    // 轮询登录状态（先清理再启动，避免重复）
    if (this.data.timer) {
      clearInterval(this.data.timer);
      this.data.timer = null;
    }
    this.data.timer = setInterval(() => {
      this.qrcodeLogin(timestamp, code);
    }, 2000);
  },

  // 二维码登录接口
  async qrcodeLogin(t, code) {
    try {
      // 使用 SAPI 调用 I00017 接口
      const res = await window.superAPI.request('I00017', {
        t: t,
        c: code
      });

      console.log('qrcodeLogin response:', res);

      // SAPI 已经处理了解密和 status/data 提取，res 即为业务数据
      if (res && res.status) {
        const str = res.data
        var userIn = JSON.parse(str);
        sessionStorage.setItem("u", userIn.u);
        sessionStorage.setItem("p", userIn.p);
        const k2 = await Decrypt(
          localStorage["apiKey"],
          sessionStorage["p"],
          sessionStorage["p"].substring(0, 12)
        );
        sessionStorage.setItem("k", k2);
        this.loginInterface();
        
      } else {
        if (res && (res.code == 3003 || res.code == 3002)) {
          app.showToast(res.code + " " + res.message, "confirm");
          this.enterCode();
        } else {
          app.showToast((window.i18n && i18n.t ? i18n.t('login.qrcode.notFound', '未找到扫码登录数据') : '未找到扫码登录数据'), "confirm");
          this.enterCode();
        }
      }
    } catch (error) {
      console.error('qrcodeLogin error:', error);
      app.showToast((window.i18n && i18n.t ? i18n.t('login.qrcode.requestFailed', '扫码登录请求失败') : '扫码登录请求失败') + ": " + (error.message || (window.i18n && i18n.t ? i18n.t('error.network', '网络错误') : '网络错误')), "confirm");
      this.enterCode();
    }
  },

  // 路由处理（保留原有函数）
  route(param) {
    if (typeof route === 'function') {
      route(param);
    }
  },

  // 加载Toast提示（保留原有函数）
  loadShowToast() {
    if (typeof LoadShowToast === 'function') {
      LoadShowToast();
    }
  }
});
