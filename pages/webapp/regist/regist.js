// 注册页逻辑
var app;
try { app = getApp(); } catch (_) { app = window.app || {}; }

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

// 原生轻提示（自动消失，不依赖自定义控件）
function nativeToast(message, duration) {
  try {
    var ms = typeof duration === 'number' ? duration : 1800;
    var el = document.createElement('div');
    el.textContent = String(message || '');
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '12%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = 'rgba(0,0,0,0.75)';
    el.style.color = '#fff';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '8px';
    el.style.fontSize = '14px';
    el.style.lineHeight = '1.4';
    el.style.zIndex = '99999';
    el.style.opacity = '0';
    el.style.transition = 'opacity 180ms ease';
    document.body.appendChild(el);
    // 淡入
    requestAnimationFrame(function(){ el.style.opacity = '1'; });
    // 定时移除
    setTimeout(function(){
      try {
        el.style.opacity = '0';
        setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 220);
      } catch(_) { if (el && el.parentNode) el.parentNode.removeChild(el); }
    }, ms);
  } catch(_){
    try { console.info('[toast]', message); } catch(__) {}
  }
}

if (typeof PUBLIC_REGISTER_ACCOUNT === 'undefined') {
  var PUBLIC_REGISTER_ACCOUNT = 'ICE00000002';
}
if (typeof PUBLIC_REGISTER_KEY === 'undefined') {
  var PUBLIC_REGISTER_KEY = '070143E3A2777BB093A58318A963B0EE';
}
if (typeof FILE_UPLOAD_PATH === 'undefined') {
  var FILE_UPLOAD_PATH = '/file';
}

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
    this.loadjQueryShim();
    this.loadShowToast();
    this.setupI18n();
    // 预加载登录页以加速后退滑动（确保 SPA 路由切换时有缓存）
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
      } catch (_) { }

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
    } catch (_) { }
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
    // 开发环境临时跳过：设置 skipIdCardUpload=true 可跳过身份证上传测试注册接口
    const skipIdCardUpload = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      (new URLSearchParams(window.location.search).get('skipUpload') === '1');

    if (!skipIdCardUpload && (!this.data.idFrontFile || !this.data.idFrontFile.fileId || !this.data.idBackFile || !this.data.idBackFile.fileId)) {
      app.showToast(
        window.i18n ? window.i18n.t('regist.toast.idCardRequired') : 'Please upload both sides of ID card',
        'confirm'
      );
      return;
    }

    // 调用注册接口
    try {
      const registerAPI = this.ensureRegisterAPI();
      // 密码加密：email + password 的 MD5（与登录接口一致）
      const hashedPassword = hex_md5_utf(email + password).toUpperCase();

      // I00001 接口参数：userEmail, userName, userPassword, invitationUserAccount, userIdCardFrontImage, userIdCardReverseImage
      const payload = {
        userEmail: email,
        userName: realName,  // 真实姓名
        userPassword: hashedPassword,
        invitationUserAccount: inviter,  // 邀请人账号
        userIdCardFrontImage: skipIdCardUpload ? 'SKIP_DEV_MODE' : this.data.idFrontFile.fileId,  // 身份证正面
        userIdCardReverseImage: skipIdCardUpload ? 'SKIP_DEV_MODE' : this.data.idBackFile.fileId  // 身份证反面
      };

      console.log('[regist] Calling I00001 with payload:', { ...payload, userPassword: '***' });
      const data = await registerAPI.request('I00001', payload);

      if (data && data.userAccount && data.apiKey) {
        nativeToast(
          window.i18n ? window.i18n.t('regist.toast.success') : 'Registration successful! Redirecting to login...'
        );

        try {
          sessionStorage.setItem('u', data.userAccount);
          sessionStorage.setItem('k', data.apiKey);
          const cipher = await Encrypt(
            data.apiKey,
            hashedPassword,
            hashedPassword.substring(0, 12)
          );
          localStorage.setItem('apiKey', cipher);
          localStorage.setItem('userAccount', data.userAccount);
          localStorage.setItem('email', email);
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
      // SPA 路由不可用或失败，回退到硬跳转
      try {
        window.location.href = loginPage;
      } catch (_) {
        window.location.href = rootEntry;
      }
      setTimeout(release, 500);
    };

    attemptNavigate(0);
  },

  // 加载 jQuery $.ajax 兼容 shim（兜底）
  loadjQueryShim() {
    if (typeof window.$ === 'undefined' || typeof window.$.ajax !== 'function') {
      const script = document.createElement('script');
      script.src = '../../utils/jquery-ajax-shim.js?v=' + Date.now();
      script.onerror = () => {
        console.error('jquery-ajax-shim 加载失败，SAPI 调用可能失败');
      };
      document.head.appendChild(script);
    }
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
    const boxId = side === 'front' ? 'uploadFrontBox' : 'uploadBackBox';
    const box = document.getElementById(boxId);

    try {
      this.safeSetData({ [uploadingKey]: true });

      // 更新 UI 显示上传中
      if (box) {
        const statusText = box.querySelector('.upload-status');
        if (statusText) {
          statusText.textContent = side === 'front' ? '上传中...' : 'Uploading...';
          statusText.style.color = '#4169b8';
        }
        box.style.borderColor = '#4169b8';
      }

      // 取消弹窗式“上传中”提示，仅在区域内显示状态文字
      // 如需轻提示，可启用下一行：
      // nativeToast(side === 'front' ? (window.i18n ? window.i18n.t('regist.toast.uploadingFront') : 'Uploading front ID...') : (window.i18n ? window.i18n.t('regist.toast.uploadingBack') : 'Uploading back ID...'), 1200);

      const uploaded = await this.uploadFileToServer(file, side);
      this.safeSetData({ [labelKey]: uploaded });

      // 更新 UI 显示上传成功
      if (box) {
        const statusText = box.querySelector('.upload-status');
        if (statusText) {
          statusText.textContent = '✓';
          statusText.style.color = '#67c23a';
        }
        box.style.borderColor = '#67c23a';
        box.style.background = '#f0f9ff';
      }

      nativeToast(side === 'front'
        ? (window.i18n ? window.i18n.t('regist.toast.idFrontUploaded') : 'ID card front uploaded')
        : (window.i18n ? window.i18n.t('regist.toast.idBackUploaded') : 'ID card back uploaded')
      );
    } catch (err) {
      console.error('Upload failed', err);

      // 更新 UI 显示上传失败
      if (box) {
        const statusText = box.querySelector('.upload-status');
        if (statusText) {
          statusText.textContent = '✗';
          statusText.style.color = '#f56c6c';
        }
        box.style.borderColor = '#f56c6c';
      }

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

  computeRequestIv(dynamicKey, timestamp) {
    // let tsSrv = timestamp;
    // if (tsSrv && String(tsSrv).length <= 10) {
    //   tsSrv = String(parseInt(tsSrv, 10) * 1000);
    // }
    const rawWeekday = new Date(parseInt(timestamp, 10)).getUTCDay();
    const weekday = rawWeekday === 0 ? 7 : rawWeekday - 1;
    let source = dynamicKey;
    while (source.length < weekday + 12) {
      source += dynamicKey;
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
    // 文件上传端点：优先使用完整基础 URL，否则使用相对路径兜底
    const endpoint = normalizedBase ? `${normalizedBase}${FILE_UPLOAD_PATH}` : (baseUrl || window.location.origin) + FILE_UPLOAD_PATH;

    console.log('[regist] uploadFileToServer config:', {
      FILE_UPLOAD_PATH,
      baseUrl,
      normalizedBase,
      endpoint,
      fileName: file.name,
      fileSize: file.size
    });

    const md5Func = this.getMd5Function();
    if (!md5Func) {
      throw new Error('MD5 library is not loaded');
    }

    const timestamp = Date.now().toString();
    const dynamicKey = md5Func(PUBLIC_REGISTER_KEY + timestamp).toUpperCase();
    const iv = this.computeRequestIv(dynamicKey, timestamp);
    const fileMd5 = await this.computeFileMd5(file);
    const safeName = file.name || `id-card-${side}-${Date.now()}.jpg`;

    console.log('[regist] Encryption params:', {
      timestamp,
      dynamicKeyLength: dynamicKey.length,
      ivLength: iv.length,
      iv,
      fileNameForSign: safeName
    });

    const meta = {
      fileMd5,
      sign: md5Func(`${safeName}${dynamicKey}${timestamp}`),
      params: {
        fileName: safeName,
        description: `${side === 'front' ? 'ID_FRONT' : 'ID_BACK'}_${new Date().toISOString()}`,
        tags: ['ID_CARD', side.toUpperCase()]
      }
    };

    console.log('[regist] Meta before encryption:', {
      fileMd5,
      signInput: `${safeName}${dynamicKey}${timestamp}`,
      sign: meta.sign,
      params: meta.params
    });

    const encryptedPayload = await Encrypt(JSON.stringify(meta), dynamicKey, iv);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('data', encryptedPayload);

    console.log('[regist] Uploading to:', endpoint);
    console.log('[regist] Request headers:', {
      'x-user-account': PUBLIC_REGISTER_ACCOUNT,
      'x-crypto-mode': 'aes-gcm',
      'x-timestamp': timestamp
    });

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
      console.error('[regist] Upload failed:', {
        status: response.status,
        statusText: response.statusText,
        url: response.url
      });
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
