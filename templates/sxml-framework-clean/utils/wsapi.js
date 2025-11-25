/**
 * WebSocket API 模块
 * 提供 WebSocket 连接管理、自动重连、心跳检测、事件订阅等功能
 * 支持加密通信（可选）
 * 
 * @author King, Rainbow Haruko
 * @version 1.0.0
 */

(function (global) {
  'use strict';

  /**
   * WebSocket API 管理器
   */
  class WSAPIManager {
    constructor(options = {}) {
      // WebSocket 连接
      this.ws = null;
      
      // 配置选项
      this.config = {
        url: options.url || this._getDefaultUrl(),
        protocols: options.protocols || [],
        reconnect: options.reconnect !== false, // 默认启用自动重连
        reconnectInterval: options.reconnectInterval || 3000, // 重连间隔（毫秒）
        reconnectMaxAttempts: options.reconnectMaxAttempts || 10, // 最大重连次数
        heartbeat: options.heartbeat !== false, // 默认启用心跳
        heartbeatInterval: options.heartbeatInterval || 30000, // 心跳间隔（毫秒）
        heartbeatTimeout: options.heartbeatTimeout || 5000, // 心跳超时（毫秒）
        heartbeatMessage: options.heartbeatMessage || JSON.stringify({ type: 'ping' }), // 心跳消息
        debug: options.debug || false, // 调试模式
        encrypt: options.encrypt || false, // 是否加密通信
        
        // 安全增强配置
        enforceWSS: options.enforceWSS !== false, // 默认强制 WSS
        requireAuth: options.requireAuth !== false, // 默认需要身份验证
        authToken: options.authToken || null, // 认证令牌
        enableSignature: options.enableSignature || false, // 是否启用消息签名
        signatureSecret: options.signatureSecret || null, // 签名密钥
        maxMessageSize: options.maxMessageSize || 1048576, // 最大消息大小 (1MB)
        allowedOrigins: options.allowedOrigins || [] // 允许的来源列表
      };

      // 连接状态
      this.status = {
        connected: false,
        reconnecting: false,
        reconnectAttempts: 0,
        lastConnectTime: null,
        lastDisconnectTime: null,
        authenticated: false, // 认证状态
        authTimeout: null // 认证超时定时器
      };

      // 事件监听器
      this.listeners = {
        open: [],
        close: [],
        error: [],
        message: [],
        reconnect: [],
        heartbeatTimeout: [],
        authenticated: [], // 认证成功
        authFailed: [], // 认证失败
        signatureError: [] // 签名验证失败
      };

      // 消息队列（离线时缓存消息）
      this.messageQueue = [];
      this.maxQueueSize = options.maxQueueSize || 100;

      // 心跳定时器
      this.heartbeatTimer = null;
      this.heartbeatTimeoutTimer = null;

      // 重连定时器
      this.reconnectTimer = null;

      this._log('WSAPIManager initialized', this.config);
    }

    /**
     * 获取默认 WebSocket URL
     */
    _getDefaultUrl() {
      // 从全局配置读取
      if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.api && window.APP_CONFIG.api.wsUrl) {
        let url = window.APP_CONFIG.api.wsUrl;
        
        // 强制使用 WSS (生产环境)
        if (this.config.enforceWSS && location.protocol === 'https:' && url.startsWith('ws:')) {
          url = url.replace('ws:', 'wss:');
          this._log('Enforcing WSS:', url);
        }
        
        return url;
      }

      // 开发环境默认值
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = location.host;
      return `${protocol}//${host}/ws`;
    }

    /**
     * 日志输出
     */
    _log(...args) {
      if (this.config.debug && console && console.log) {
        console.log('[WSAPI]', ...args);
      }
    }

    /**
     * 错误日志
     */
    _error(...args) {
      if (console && console.error) {
        console.error('[WSAPI]', ...args);
      }
    }

    /**
     * 连接 WebSocket
     */
    connect(url) {
      if (url) {
        this.config.url = url;
      }

      // 安全检查: 强制 WSS
      if (this.config.enforceWSS && !this.config.url.startsWith('wss://')) {
        if (location.protocol === 'https:') {
          this._error('WSS required for HTTPS pages');
          this._emit('error', new Error('WSS_REQUIRED'));
          return;
        }
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this._log('Already connected');
        return;
      }

      try {
        this._log('Connecting to', this.config.url);
        
        this.ws = new WebSocket(this.config.url, this.config.protocols);

        // 绑定事件
        this.ws.onopen = this._onOpen.bind(this);
        this.ws.onclose = this._onClose.bind(this);
        this.ws.onerror = this._onError.bind(this);
        this.ws.onmessage = this._onMessage.bind(this);

      } catch (error) {
        this._error('Connection error:', error);
        this._emit('error', error);
        
        if (this.config.reconnect) {
          this._scheduleReconnect();
        }
      }
    }

    /**
     * 断开连接
     */
    disconnect() {
      this.config.reconnect = false; // 禁用自动重连
      this._clearHeartbeat();
      this._clearReconnect();

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.status.connected = false;
      this._log('Disconnected');
    }

    /**
     * 发送消息
     */
    send(data, encrypt = this.config.encrypt) {
      // 安全检查: 需要认证
      if (this.config.requireAuth && !this.status.authenticated) {
        this._error('Authentication required');
        return false;
      }

      if (!this.status.connected) {
        this._log('Not connected, queueing message');
        
        // 离线时加入队列
        if (this.messageQueue.length < this.maxQueueSize) {
          this.messageQueue.push({ data, encrypt });
        } else {
          this._error('Message queue full, dropping message');
        }
        return false;
      }

      try {
        let message = data;

        // 如果是对象,自动序列化
        if (typeof data === 'object') {
          message = JSON.stringify(data);
        }

        // 安全检查: 消息大小限制
        if (message.length > this.config.maxMessageSize) {
          this._error('Message too large:', message.length, 'bytes');
          return false;
        }

        // 加密 (如果启用)
        if (encrypt && this._canEncrypt()) {
          message = this._encrypt(message);
        }

        // 消息签名 (如果启用)
        if (this.config.enableSignature && this.config.signatureSecret) {
          message = this._signMessage(message);
        }

        this.ws.send(message);
        this._log('Message sent:', data);
        return true;

      } catch (error) {
        this._error('Send error:', error);
        return false;
      }
    }

    /**
     * 订阅事件
     */
    on(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event].push(callback);
      } else {
        this._error('Unknown event:', event);
      }
      return this;
    }

    /**
     * 取消订阅
     */
    off(event, callback) {
      if (this.listeners[event]) {
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
          this.listeners[event].splice(index, 1);
        }
      }
      return this;
    }

    /**
     * 触发事件
     */
    _emit(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            this._error('Event callback error:', error);
          }
        });
      }
    }

    /**
     * WebSocket 打开事件
     */
    _onOpen(event) {
      this._log('Connected');
      
      this.status.connected = true;
      this.status.reconnecting = false;
      this.status.reconnectAttempts = 0;
      this.status.lastConnectTime = Date.now();

      // 发送身份验证 (如果需要)
      if (this.config.requireAuth) {
        this._authenticate();
      } else {
        // 不需要认证，直接标记为已认证
        this.status.authenticated = true;
        this._onAuthenticated();
      }

      this._emit('open', event);
    }

    /**
     * 发送身份验证
     */
    _authenticate() {
      const token = this.config.authToken || this._getAuthToken();
      
      if (!token) {
        this._error('No auth token available');
        this._emit('authFailed', new Error('NO_AUTH_TOKEN'));
        this.disconnect();
        return;
      }

      this._log('Authenticating...');

      // 发送认证消息
      const authMessage = {
        type: 'auth',
        token: token,
        timestamp: Date.now()
      };

      // 添加签名 (如果启用)
      if (this.config.enableSignature && this.config.signatureSecret) {
        authMessage.signature = this._generateSignature(JSON.stringify({ token, timestamp: authMessage.timestamp }));
      }

      this.ws.send(JSON.stringify(authMessage));

      // 设置认证超时 (10秒)
      this.status.authTimeout = setTimeout(() => {
        if (!this.status.authenticated) {
          this._error('Authentication timeout');
          this._emit('authFailed', new Error('AUTH_TIMEOUT'));
          this.disconnect();
        }
      }, 10000);
    }

    /**
     * 获取认证令牌
     */
    _getAuthToken() {
      if (typeof window !== 'undefined') {
        return sessionStorage.getItem('authToken') || 
               sessionStorage.getItem('token') ||
               localStorage.getItem('authToken');
      }
      return null;
    }

    /**
     * 认证成功处理
     */
    _onAuthenticated() {
      this._log('Authenticated');
      
      this.status.authenticated = true;

      // 清除认证超时
      if (this.status.authTimeout) {
        clearTimeout(this.status.authTimeout);
        this.status.authTimeout = null;
      }

      // 发送队列中的消息
      this._flushMessageQueue();

      // 启动心跳
      if (this.config.heartbeat) {
        this._startHeartbeat();
      }

      this._emit('authenticated');
    }

    /**
     * WebSocket 关闭事件
     */
    _onClose(event) {
      this._log('Connection closed', event.code, event.reason);
      
      this.status.connected = false;
      this.status.lastDisconnectTime = Date.now();

      this._clearHeartbeat();

      this._emit('close', event);

      // 自动重连
      if (this.config.reconnect && !event.wasClean) {
        this._scheduleReconnect();
      }
    }

    /**
     * WebSocket 错误事件
     */
    _onError(event) {
      this._error('WebSocket error:', event);
      this._emit('error', event);
    }

    /**
     * WebSocket 消息事件
     */
    _onMessage(event) {
      try {
        let data = event.data;

        // 安全检查: 消息大小
        if (data.length > this.config.maxMessageSize) {
          this._error('Message too large, dropping');
          return;
        }

        // 解密 (如果启用)
        if (this.config.encrypt && this._canEncrypt()) {
          data = this._decrypt(data);
        }

        // 尝试解析 JSON
        let parsedData;
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = data;
        }

        // 验证消息签名 (如果启用)
        if (this.config.enableSignature && this.config.signatureSecret && parsedData.signature) {
          if (!this._verifySignature(parsedData)) {
            this._error('Signature verification failed');
            this._emit('signatureError', parsedData);
            return;
          }
        }

        // 处理认证响应
        if (parsedData.type === 'auth') {
          if (parsedData.success) {
            this._onAuthenticated();
          } else {
            this._error('Authentication failed:', parsedData.error);
            this._emit('authFailed', new Error(parsedData.error || 'AUTH_FAILED'));
            this.disconnect();
          }
          return;
        }

        // 处理心跳响应
        if (this._isHeartbeatResponse(parsedData)) {
          this._handleHeartbeatResponse();
          return;
        }

        this._log('Message received:', parsedData);
        this._emit('message', parsedData);

      } catch (error) {
        this._error('Message parsing error:', error);
      }
    }

    /**
     * 发送队列中的消息
     */
    _flushMessageQueue() {
      if (this.messageQueue.length > 0) {
        this._log('Flushing message queue:', this.messageQueue.length);
        
        const queue = this.messageQueue.slice();
        this.messageQueue = [];

        queue.forEach(({ data, encrypt }) => {
          this.send(data, encrypt);
        });
      }
    }

    /**
     * 启动心跳
     */
    _startHeartbeat() {
      this._clearHeartbeat();

      this.heartbeatTimer = setInterval(() => {
        if (this.status.connected) {
          this._log('Sending heartbeat');
          this.ws.send(this.config.heartbeatMessage);

          // 启动心跳超时检测
          this.heartbeatTimeoutTimer = setTimeout(() => {
            this._log('Heartbeat timeout');
            this._emit('heartbeatTimeout');
            
            // 心跳超时，认为连接已断开
            if (this.ws) {
              this.ws.close();
            }
          }, this.config.heartbeatTimeout);
        }
      }, this.config.heartbeatInterval);
    }

    /**
     * 清除心跳
     */
    _clearHeartbeat() {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }
    }

    /**
     * 判断是否为心跳响应
     */
    _isHeartbeatResponse(data) {
      return data && (data.type === 'pong' || data.type === 'heartbeat');
    }

    /**
     * 处理心跳响应
     */
    _handleHeartbeatResponse() {
      this._log('Heartbeat received');
      
      // 清除超时定时器
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }
    }

    /**
     * 安排重连
     */
    _scheduleReconnect() {
      if (this.status.reconnectAttempts >= this.config.reconnectMaxAttempts) {
        this._error('Max reconnect attempts reached');
        return;
      }

      if (this.reconnectTimer) {
        return; // 已经在重连中
      }

      this.status.reconnecting = true;
      this.status.reconnectAttempts++;

      this._log(`Reconnecting in ${this.config.reconnectInterval}ms (attempt ${this.status.reconnectAttempts}/${this.config.reconnectMaxAttempts})`);

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this._emit('reconnect', this.status.reconnectAttempts);
        this.connect();
      }, this.config.reconnectInterval);
    }

    /**
     * 清除重连定时器
     */
    _clearReconnect() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.status.reconnecting = false;
      this.status.reconnectAttempts = 0;
    }

    /**
     * 检查是否可以加密
     */
    _canEncrypt() {
      return typeof window !== 'undefined' && 
             window.AES && 
             sessionStorage.getItem('k');
    }

    /**
     * 生成消息签名
     */
    _generateSignature(message) {
      try {
        const secret = this.config.signatureSecret;
        if (!secret) {
          this._error('No signature secret configured');
          return null;
        }

        // 使用 HMAC-SHA256 生成签名
        if (typeof window !== 'undefined' && window.MD5) {
          // 简化版: 使用 MD5(message + secret)
          // 生产环境应使用真正的 HMAC-SHA256
          return window.MD5(message + secret).toUpperCase();
        }

        // Fallback: 简单哈希
        let hash = 0;
        const str = message + secret;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16).toUpperCase();

      } catch (error) {
        this._error('Signature generation error:', error);
        return null;
      }
    }

    /**
     * 签名消息
     */
    _signMessage(message) {
      try {
        const signature = this._generateSignature(message);
        
        return JSON.stringify({
          data: message,
          signature: signature,
          timestamp: Date.now()
        });

      } catch (error) {
        this._error('Message signing error:', error);
        return message;
      }
    }

    /**
     * 验证消息签名
     */
    _verifySignature(parsedData) {
      try {
        if (!parsedData.signature || !parsedData.data) {
          return true; // 没有签名的消息跳过验证
        }

        const expectedSignature = this._generateSignature(parsedData.data);
        const isValid = parsedData.signature === expectedSignature;

        if (!isValid) {
          this._log('Signature mismatch:', {
            received: parsedData.signature,
            expected: expectedSignature
          });
        }

        return isValid;

      } catch (error) {
        this._error('Signature verification error:', error);
        return false;
      }
    }

    /**
     * 加密消息
     */
    _encrypt(message) {
      try {
        const apiKey = sessionStorage.getItem('k');
        const timestamp = Date.now().toString();
        const dynamicKey = window.MD5(apiKey + timestamp).toUpperCase();
        
  const rawWeekday = new Date().getUTCDay();
  const weekday = rawWeekday === 0 ? 7 : rawWeekday - 1;
        let iv = apiKey.substring(weekday, weekday + 12);
        while (iv.length < 12) {
          iv += apiKey;
        }
        iv = iv.substring(0, 12);

        const encrypted = window.AES.encrypt(message, dynamicKey, iv);
        return JSON.stringify({ encrypted, timestamp });
        
      } catch (error) {
        this._error('Encryption error:', error);
        return message;
      }
    }

    /**
     * 解密消息
     */
    _decrypt(message) {
      try {
        const data = JSON.parse(message);
        if (!data.encrypted || !data.timestamp) {
          return message;
        }

        const apiKey = sessionStorage.getItem('k');
        const serverDynamic = window.MD5(apiKey + data.timestamp).toUpperCase();
        const decryptKey = serverDynamic.split('').reverse().join('');
        
  const rawWeekday = new Date(parseInt(data.timestamp)).getUTCDay();
  const weekday = rawWeekday === 0 ? 7 : rawWeekday - 1;
        let iv = decryptKey.substring(weekday, weekday + 12);
        while (iv.length < 12) {
          iv += decryptKey;
        }
        iv = iv.substring(0, 12);

        return window.AES.decrypt(data.encrypted, decryptKey, iv);
        
      } catch (error) {
        this._error('Decryption error:', error);
        return message;
      }
    }

    /**
     * 获取连接状态
     */
    getStatus() {
      return {
        ...this.status,
        readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED,
        url: this.config.url,
        queueSize: this.messageQueue.length,
        authenticated: this.status.authenticated,
        securityFeatures: {
          wss: this.config.url.startsWith('wss://'),
          authRequired: this.config.requireAuth,
          signatureEnabled: this.config.enableSignature,
          encryptionEnabled: this.config.encrypt
        }
      };
    }

    /**
     * 判断是否已连接
     */
    isConnected() {
      return this.status.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * 设置认证令牌
     */
    setAuthToken(token) {
      this.config.authToken = token;
      this._log('Auth token updated');
    }

    /**
     * 设置签名密钥
     */
    setSignatureSecret(secret) {
      this.config.signatureSecret = secret;
      this._log('Signature secret updated');
    }

    /**
     * 启用/禁用安全功能
     */
    configureSecurity(options = {}) {
      if (typeof options.enforceWSS !== 'undefined') {
        this.config.enforceWSS = options.enforceWSS;
      }
      if (typeof options.requireAuth !== 'undefined') {
        this.config.requireAuth = options.requireAuth;
      }
      if (typeof options.enableSignature !== 'undefined') {
        this.config.enableSignature = options.enableSignature;
      }
      if (options.signatureSecret) {
        this.config.signatureSecret = options.signatureSecret;
      }
      this._log('Security configuration updated:', this.config);
    }
  }

  // 导出到全局
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WSAPIManager;
  } else {
    global.WSAPIManager = WSAPIManager;
    
    // 创建默认实例
    global.wsapi = new WSAPIManager();
  }

})(typeof window !== 'undefined' ? window : global);
