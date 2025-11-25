// 注册页逻辑
var app;
try { app = getApp(); } catch(_) { app = window.app || {}; }

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

const PUBLIC_REGISTER_ACCOUNT = 'public_user';
const PUBLIC_REGISTER_KEY = '070143E3A2777BB093A58318A963B0EE';
const FILE_UPLOAD_PATH = '/file';

Page({
  data: {
    countdown: 0,
    timer: null,
    idFrontFile: null,
    idBackFile: null,
    uploadingFront: false,
    uploadingBack: false
  },

  onLoad() {
    this.updateTitle();
    this.loadShowToast();
    this.setupI18n();
    // 预加载登录页以加速后退滑动
    if (window.sxmlPrefetch) {
      window.sxmlPrefetch(buildAppUrl('pages/index/index.html'));
    }
  },

  setupI18n() {
    const applyAndReveal = () => {
      try {
        if (window.i18n) {
          if (typeof window.i18n.apply === 'function') {
            window.i18n.apply();
          } else if (typeof window.i18n.applyTranslations === 'function') {
            window.i18n.applyTranslations();
          }
        }
      } catch (e) {
        console.warn('i18n apply failed:', e);
      }

      try {
        document.documentElement.classList.add('i18n-ready');
        if (document.body) {
          document.body.classList.add('loaded');
        }
      } catch (_) {}

      this.initLanguageButton();
    };

    if (document.documentElement.classList.contains('i18n-ready')) {
      applyAndReveal();
    } else {
      const handler = () => {
        applyAndReveal();
        window.removeEventListener('i18n:ready', handler);
      };
      window.addEventListener('i18n:ready', handler);

      // 超时保护
      setTimeout(() => {
        if (!document.documentElement.classList.contains('i18n-ready')) {
          console.warn('[regist] i18n timeout, force revealing');
          applyAndReveal();
        }
      }, 1000);
    }
  },

  initLanguageButton() {
    try {
      const btn = document.querySelector('.lang-btn');
      if (!btn) return;
      if (window.i18n) {
        btn.textContent = window.i18n.lang === 'zh-CN' ? '中文' : 'English';
      }
    } catch (e) {
      console.warn('initLanguageButton failed:', e);
    }
  },

  async toggleLanguage() {
    try {
      if (!window.i18n || typeof window.i18n.setLang !== 'function') return;
      const next = window.i18n.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
      await window.i18n.setLang(next);
      this.initLanguageButton();
    } catch (e) {
      console.warn('toggleLanguage failed:', e);
    }
  },

  updateTitle() {
    try {
      document.title = 'IEC Markets - Sign up';
    } catch (_) {}
  },

  onUnload() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  // ==================== 注册逻辑 ====================
  async registEvent() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const realName = document.getElementById('realName').value.trim();
    const inviter = document.getElementById('inviter').value.trim();

    // 表单验证
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.emailError') : 'Please enter a valid email address',
        'confirm'
      );
      return;
    }

    if (!password || password.length < 6) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.passwordError') : 'Password must be at least 6 characters',
        'confirm'
      );
      return;
    }

    if (password !== confirmPassword) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.passwordMismatch') : 'Passwords do not match',
        'confirm'
      );
      return;
    }

    if (!realName) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.realNameRequired') : 'Please enter your real name',
        'confirm'
      );
      return;
    }

    if (!inviter) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.inviterRequired') : 'Please enter inviter account',
        'confirm'
      );
      return;
    }

    // ID Card 验证（可选）
    if (!this.data.idFrontFile || !this.data.idFrontFile.fileId || !this.data.idBackFile || !this.data.idBackFile.fileId) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.idCardRequired') : 'Please upload both sides of ID card',
        'confirm'
      );
      return;
    }

    // 调用注册接口
    try {
      const registerAPI = this.ensureRegisterAPI();
      const hashedPassword = hex_md5_utf(email + password).toUpperCase();

      const payload = {
        userEmail: email,
        userPassword: hashedPassword,
        realName: realName,
        inviterAccount: inviter,
        idCardFront: this.data.idFrontFile.fileId,
        idCardBack: this.data.idBackFile.fileId,
        registerSource: 'MOBILE_WEB'
      };

      const data = await registerAPI.request('I00001', payload);

      if (data && data.userAccount && data.apiKey) {
        app.showToast(
          window.i18n ? window.i18n.t('regist.toast.success') : 'Registration successful! Redirecting to login...',
          'confirm'
        );

        try {
          sessionStorage.setItem('u', data.userAccount);
          sessionStorage.setItem('k', data.apiKey);
          sessionStorage.setItem('p', hashedPassword);
          const cipher = await Encrypt(
            data.apiKey,
            hashedPassword,
            hashedPassword.substring(0, 12)
          );
          localStorage.setItem('apiKey', cipher);
          localStorage.setItem('userAccount', data.userAccount);
        } catch (storageError) {
          console.warn('Failed to cache registration info', storageError);
        }

        // 延迟跳转到登录页
        setTimeout(() => {
          this.goLogin();
        }, 1500);

      } else {
        const errMsg = data && data.message ? data.message : (window.i18n ? window.i18n.t('regist.toast.failed') : 'Registration failed');
        app.showToast((data && data.code ? data.code + ' ' : '') + errMsg, 'confirm');
      }

    } catch (error) {
      console.error('注册错误:', error);
      app.showToast('Registration failed: ' + (error.message || 'Network error'), 'confirm');
    }
  },

  // 上传身份证正面
  uploadIdFront() {
    this.pickAndUploadId('front');
  },

  // 上传身份证反面
  uploadIdBack() {
    this.pickAndUploadId('back');
  },

  // 返回登录页
  goLogin() {
    if (this.__pendingGoLogin) {
      return;
    }
    this.__pendingGoLogin = true;
    const loginPage = buildAppUrl('pages/index/index.html');
    const rootEntry = buildAppUrl('index.html');
    const release = () => {
      this.__pendingGoLogin = false;
    };

    const attemptNavigate = (tries) => {
      const maxTries = 6;
      if (window.sxmlNavigate) {
        const animating = !!window.__SXML_ROUTER_ANIMATING__;
        if (animating && tries < maxTries) {
          setTimeout(() => attemptNavigate(tries + 1), 70);
          return;
        }
        try {
          window.sxmlNavigate(loginPage, { direction: 'back', noHistory: true });
          setTimeout(release, 500);
          return;
        } catch (navErr) {
          console.warn('[regist] sxmlNavigate failed, fallback to hard redirect', navErr);
        }
      }
      try {
        window.location.href = loginPage;
      } catch (_) {
        window.location.href = rootEntry;
      }
      setTimeout(release, 500);
    };

    attemptNavigate(0);
  },

  // 加载 Toast 工具（兜底）
  loadShowToast() {
    if (typeof window.ShowToast !== 'function') {
      const script = document.createElement('script');
      script.src = '../../utils/toast.js?v=' + Date.now();
      script.onerror = () => {
        console.warn('Toast 加载失败，使用 alert 作为兜底');
        window.ShowToast = (msg) => alert(msg);
      };
      document.head.appendChild(script);
    }
  },

  pickAndUploadId(side) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) {
        return;
      }
      this.processIdUpload(side, file);
    };
    input.click();
  },

  async processIdUpload(side, file) {
    const uploadingKey = side === 'front' ? 'uploadingFront' : 'uploadingBack';
    const labelKey = side === 'front' ? 'idFrontFile' : 'idBackFile';
    try {
      this.safeSetData({ [uploadingKey]: true });
      app.showToast(side === 'front'
        ? (window.i18n ? window.i18n.t('regist.toast.uploadingFront') : 'Uploading front ID...')
        : (window.i18n ? window.i18n.t('regist.toast.uploadingBack') : 'Uploading back ID...'),
        'none'
      );
      const uploaded = await this.uploadFileToServer(file, side);
      this.safeSetData({ [labelKey]: uploaded });
      app.showToast(side === 'front'
        ? (window.i18n ? window.i18n.t('regist.toast.idFrontUploaded') : 'ID card front uploaded')
        : (window.i18n ? window.i18n.t('regist.toast.idBackUploaded') : 'ID card back uploaded'),
        'none'
      );
    } catch (err) {
      console.error('Upload failed', err);
      app.showToast(err.message || 'Upload failed', 'confirm');
    } finally {
      this.safeSetData({ [uploadingKey]: false });
    }
  },

  ensureRegisterAPI() {
    if (this.registerAPI) {
      return this.registerAPI;
    }
    if (typeof createSuperAPI !== 'function') {
      throw new Error('SuperAPI not available');
    }
    this.registerAPI = createSuperAPI(PUBLIC_REGISTER_ACCOUNT, PUBLIC_REGISTER_KEY);
    return this.registerAPI;
  },

  getMd5Function(preferBinary = false) {
    if (preferBinary && typeof hex_md5 === 'function') return hex_md5;
    if (!preferBinary && typeof hex_md5_utf === 'function') return hex_md5_utf;
    if (typeof hex_md5 === 'function') return hex_md5;
    if (typeof md5 === 'function') return md5;
    return null;
  },

  resolveApiBaseUrl() {
    if (window.SAPI_CONFIG && window.SAPI_CONFIG.BASE_URL) {
      return window.SAPI_CONFIG.BASE_URL;
    }
    if (window.APP_CONFIG && window.APP_CONFIG.api && window.APP_CONFIG.api.baseUrl) {
      return window.APP_CONFIG.api.baseUrl;
    }
    return '';
  },

  computeRequestIv(dynamicKey, baseKey, timestamp) {
  const rawWeekday = new Date(parseInt(timestamp, 10)).getUTCDay();
  const weekday = rawWeekday === 0 ? 7 : rawWeekday - 1;
    let source = dynamicKey;
    while (source.length < weekday + 12) {
      source += baseKey;
    }
    return source.substring(weekday, weekday + 12);
  },

  computeResponseIv(decryptKey, timestamp) {
  const rawWeekday = new Date(parseInt(timestamp, 10)).getUTCDay();
  const weekday = rawWeekday === 0 ? 7 : rawWeekday - 1;
    let source = decryptKey;
    while (source.length < weekday + 12) {
      source += decryptKey;
    }
    return source.substring(weekday, weekday + 12);
  },

  async computeFileMd5(file) {
    const md5Func = this.getMd5Function(true);
    if (!md5Func) {
      throw new Error('MD5 library is not loaded');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.onload = (e) => {
        try {
          let binaryString;
          if (typeof e.target.result === 'string') {
            binaryString = e.target.result;
          } else {
            const buffer = new Uint8Array(e.target.result);
            const chunkSize = 0x8000;
            let result = '';
            for (let i = 0; i < buffer.length; i += chunkSize) {
              const chunk = buffer.subarray(i, i + chunkSize);
              result += String.fromCharCode.apply(null, Array.from(chunk));
            }
            binaryString = result;
          }
          const hash = md5Func(binaryString).toUpperCase();
          resolve(hash);
        } catch (err) {
          reject(err);
        }
      };
      if (reader.readAsBinaryString) {
        reader.readAsBinaryString(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  },

  async uploadFileToServer(file, side) {
    if (!file) {
      throw new Error('No file selected');
    }
    const baseUrl = this.resolveApiBaseUrl();
    const normalizedBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    const endpoint = normalizedBase ? `${normalizedBase}${FILE_UPLOAD_PATH}` : FILE_UPLOAD_PATH;
    const md5Func = this.getMd5Function();
    if (!md5Func) {
      throw new Error('MD5 library is not loaded');
    }

    const timestamp = Date.now().toString();
    const dynamicKey = md5Func(PUBLIC_REGISTER_KEY + timestamp).toUpperCase();
    const iv = this.computeRequestIv(dynamicKey, PUBLIC_REGISTER_KEY, timestamp);
  const fileMd5 = await this.computeFileMd5(file);
  const safeName = file.name || `id-card-${side}-${Date.now()}.jpg`;

    const meta = {
      fileMd5,
      sign: md5Func(`${safeName}${dynamicKey}${timestamp}`).toUpperCase(),
      params: {
        fileName: safeName,
        description: `${side === 'front' ? 'ID_FRONT' : 'ID_BACK'}_${new Date().toISOString()}`,
        tags: ['ID_CARD', side.toUpperCase()]
      }
    };

    const encryptedPayload = await Encrypt(JSON.stringify(meta), dynamicKey, iv);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('data', encryptedPayload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-user-account': PUBLIC_REGISTER_ACCOUNT,
        'x-crypto-mode': 'aes-gcm',
        'x-timestamp': timestamp
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status})`);
    }

    const responseJson = await response.json();

    if (!responseJson || responseJson.status !== 1 || !responseJson.data) {
      throw new Error((responseJson && responseJson.message) || 'Upload failed');
    }

    const serverTimestamp = response.headers.get('x-timestamp') || responseJson.timestamp || timestamp;
    const serverDynamic = md5Func(PUBLIC_REGISTER_KEY + serverTimestamp).toUpperCase();
    const decryptKey = serverDynamic.split('').reverse().join('');
    const responseIv = this.computeResponseIv(decryptKey, serverTimestamp);
    const decrypted = await Decrypt(responseJson.data, decryptKey, responseIv);
    const parsed = JSON.parse(decrypted || '{}');

    if (!parsed.fileId) {
      throw new Error('Upload response missing fileId');
    }

    return {
      fileId: parsed.fileId,
      fileName: parsed.fileName || safeName,
      downloadUrl: parsed.downloadUrl,
      fileMd5,
      size: file.size
    };
  },

  safeSetData(patch) {
    if (typeof this.setData === 'function') {
      this.setData(patch);
    } else if (this.data && typeof this.data === 'object') {
      Object.assign(this.data, patch);
    }
  }
});
