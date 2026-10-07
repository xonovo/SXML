/**
 * 统一日志系统
 * 支持: 安全事件日志、审计日志、性能监控日志
 * @author SXML Security Team
 * @version 1.0.0
 * @date 2025-11-02
 */

(function () {
  'use strict';

  // 日志级别
  const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    CRITICAL: 4
  };

  // 事件类型
  const EventType = {
    // 安全事件
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT: 'LOGOUT',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
    SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
    BRUTE_FORCE_ATTEMPT: 'BRUTE_FORCE_ATTEMPT',
    XSS_ATTEMPT: 'XSS_ATTEMPT',
    CSRF_ATTEMPT: 'CSRF_ATTEMPT',
    
    // 审计事件
    DATA_CREATE: 'DATA_CREATE',
    DATA_UPDATE: 'DATA_UPDATE',
    DATA_DELETE: 'DATA_DELETE',
    DATA_EXPORT: 'DATA_EXPORT',
    PERMISSION_CHANGE: 'PERMISSION_CHANGE',
    CONFIG_CHANGE: 'CONFIG_CHANGE',
    
    // 性能事件
    PAGE_LOAD: 'PAGE_LOAD',
    API_CALL: 'API_CALL',
    RESOURCE_LOAD: 'RESOURCE_LOAD',
    ERROR_OCCURRED: 'ERROR_OCCURRED'
  };

  class Logger {
    constructor() {
      this.apiEndpoint = '/api/logs';
      this.batchSize = 10;
      this.flushInterval = 5000; // 5秒
      this.logQueue = [];
      this.failedLoginAttempts = new Map(); // IP -> {count, lastAttempt}
      this.performanceMetrics = new Map();
      // 仅在开发环境启用服务端日志上报；生产默认关闭，避免 404
      try {
        const host = (window && window.location && window.location.hostname) || '';
        const isDev = host === 'localhost' || host === '127.0.0.1';
        if (!isDev) {
          this.apiEndpoint = '';
        }
      } catch (_) { /* silent */ }
      
      // 启动定时刷新
      this.startAutoFlush();
      
      // 监听页面卸载
      window.addEventListener('beforeunload', () => this.flush());
    }

    /**
     * 获取客户端信息
     */
    getClientInfo() {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${screen.width}x${screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookieEnabled: navigator.cookieEnabled,
        online: navigator.onLine
      };
    }

    /**
     * 获取设备指纹
     */
    getDeviceFingerprint() {
      return sessionStorage.getItem('_dfp') || 'unknown';
    }

    /**
     * 获取用户账号
     */
    getUserAccount() {
      try {
        const userInfo = sessionStorage.getItem('USERINFO');
        if (userInfo) {
          const parsed = JSON.parse(userInfo);
          return parsed.userEmail || parsed.username || 'anonymous';
        }
      } catch (e) {
        // ignore
      }
      return sessionStorage.getItem('u') || 'anonymous';
    }

    /**
     * 创建日志条目
     */
    createLogEntry(eventType, level, data = {}) {
      return {
        timestamp: new Date().toISOString(),
        eventType,
        level: Object.keys(LogLevel)[level],
        userAccount: this.getUserAccount(),
        deviceFingerprint: this.getDeviceFingerprint(),
        sessionId: this.getSessionId(),
        pageUrl: window.location.href,
        referrer: document.referrer,
        clientInfo: this.getClientInfo(),
        ...data
      };
    }

    /**
     * 获取会话ID
     */
    getSessionId() {
      let sessionId = sessionStorage.getItem('_session_id');
      if (!sessionId) {
        sessionId = 'SID_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('_session_id', sessionId);
      }
      return sessionId;
    }

    /**
     * 安全事件日志
     */
    logSecurityEvent(eventType, data = {}) {
      const level = eventType.includes('FAILED') || eventType.includes('ATTEMPT') 
        ? LogLevel.WARNING 
        : LogLevel.INFO;
      
      const logEntry = this.createLogEntry(eventType, level, {
        category: 'security',
        ...data
      });

      // 检测暴力破解
      if (eventType === EventType.LOGIN_FAILED) {
        this.detectBruteForce(data.ipAddress || 'unknown');
      }

      this.enqueue(logEntry);
      this.logToConsole(logEntry);
      
      return logEntry;
    }

    /**
     * 审计日志
     */
    logAudit(eventType, data = {}) {
      const logEntry = this.createLogEntry(eventType, LogLevel.INFO, {
        category: 'audit',
        ...data
      });

      this.enqueue(logEntry);
      this.logToConsole(logEntry);
      
      return logEntry;
    }

    /**
     * 性能监控日志
     */
    logPerformance(eventType, data = {}) {
      const logEntry = this.createLogEntry(eventType, LogLevel.DEBUG, {
        category: 'performance',
        ...data
      });

      // 性能日志仅在超过阈值时发送
      if (this.shouldLogPerformance(eventType, data)) {
        this.enqueue(logEntry);
      }
      
      this.logToConsole(logEntry, true);
      
      return logEntry;
    }

    /**
     * 错误日志
     */
    logError(error, context = {}) {
      const logEntry = this.createLogEntry(EventType.ERROR_OCCURRED, LogLevel.ERROR, {
        category: 'error',
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        ...context
      });

      this.enqueue(logEntry);
      this.logToConsole(logEntry);
      
      return logEntry;
    }

    /**
     * 检测暴力破解
     */
    detectBruteForce(ipAddress) {
      const now = Date.now();
      const record = this.failedLoginAttempts.get(ipAddress) || { count: 0, lastAttempt: 0 };
      
      // 重置计数（超过5分钟）
      if (now - record.lastAttempt > 5 * 60 * 1000) {
        record.count = 1;
      } else {
        record.count++;
      }
      
      record.lastAttempt = now;
      this.failedLoginAttempts.set(ipAddress, record);
      
      // 触发告警（5次失败）
      if (record.count >= 5) {
        this.logSecurityEvent(EventType.BRUTE_FORCE_ATTEMPT, {
          ipAddress,
          attemptCount: record.count,
          severity: 'HIGH',
          recommendation: 'Block IP or enable CAPTCHA'
        });
      }
    }

    /**
     * 判断是否应记录性能日志
     */
    shouldLogPerformance(eventType, data) {
      const thresholds = {
        PAGE_LOAD: 3000,      // 页面加载 > 3秒
        API_CALL: 2000,       // API 调用 > 2秒
        RESOURCE_LOAD: 5000   // 资源加载 > 5秒
      };
      
      const threshold = thresholds[eventType] || 1000;
      return data.duration > threshold || data.failed;
    }

    /**
     * 添加到队列
     */
    enqueue(logEntry) {
      this.logQueue.push(logEntry);
      
      // 达到批量大小立即发送
      if (this.logQueue.length >= this.batchSize) {
        this.flush();
      }
    }

    /**
     * 刷新日志到服务器
     */
    async flush() {
      if (this.logQueue.length === 0) return;
      if (!this.apiEndpoint) return; // 生产环境默认不发送到后端
      
      const logs = [...this.logQueue];
      this.logQueue = [];
      
      try {
        // 优先使用 sendBeacon (页面卸载时可靠)
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify({ logs })], { type: 'application/json' });
          navigator.sendBeacon(this.apiEndpoint, blob);
        } else {
          // 降级为 fetch
          await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs }),
            keepalive: true
          });
        }
      } catch (error) {
        console.error('Failed to send logs:', error);
        // 失败时存储到 localStorage 待重试
        this.saveToLocalStorage(logs);
      }
    }

    /**
     * 保存到 localStorage（离线缓存）
     */
    saveToLocalStorage(logs) {
      try {
        const cached = JSON.parse(localStorage.getItem('_cached_logs') || '[]');
        cached.push(...logs);
        // 限制最多缓存 100 条
        const limited = cached.slice(-100);
        localStorage.setItem('_cached_logs', JSON.stringify(limited));
      } catch (e) {
        console.error('Failed to cache logs:', e);
      }
    }

    /**
     * 重试发送缓存的日志
     */
    async retryCachedLogs() {
      try {
        const cached = JSON.parse(localStorage.getItem('_cached_logs') || '[]');
        if (cached.length > 0) {
          if (!this.apiEndpoint) return; // 无上报端点则不重试
          await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs: cached })
          });
          localStorage.removeItem('_cached_logs');
        }
      } catch (e) {
        console.error('Failed to retry cached logs:', e);
      }
    }

    /**
     * 启动自动刷新
     */
    startAutoFlush() {
      setInterval(() => this.flush(), this.flushInterval);
      
      // 页面可见时重试缓存日志
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.retryCachedLogs();
        }
      });
    }

    /**
     * 控制台输出（开发环境）
     */
    logToConsole(logEntry, isPerformance = false) {
      if (typeof console === 'undefined') return;
      
      const isDev = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1';
      
      if (!isDev && isPerformance) return; // 生产环境不输出性能日志
      
      const prefix = `[${logEntry.level}] [${logEntry.category}]`;
      const style = this.getConsoleStyle(logEntry.level);
      
      console.log(`%c${prefix} ${logEntry.eventType}`, style, logEntry);
    }

    /**
     * 获取控制台样式
     */
    getConsoleStyle(level) {
      const styles = {
        DEBUG: 'color: #888',
        INFO: 'color: #0066cc',
        WARNING: 'color: #ff9900; font-weight: bold',
        ERROR: 'color: #cc0000; font-weight: bold',
        CRITICAL: 'color: #fff; background: #cc0000; font-weight: bold; padding: 2px 5px'
      };
      return styles[level] || '';
    }

    /**
     * 页面加载性能监控
     */
    monitorPageLoad() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const perfData = window.performance.timing;
          const loadTime = perfData.loadEventEnd - perfData.navigationStart;
          const domReady = perfData.domContentLoadedEventEnd - perfData.navigationStart;
          const firstPaint = performance.getEntriesByType('paint')[0]?.startTime || 0;
          
          this.logPerformance(EventType.PAGE_LOAD, {
            loadTime,
            domReady,
            firstPaint,
            dns: perfData.domainLookupEnd - perfData.domainLookupStart,
            tcp: perfData.connectEnd - perfData.connectStart,
            request: perfData.responseStart - perfData.requestStart,
            response: perfData.responseEnd - perfData.responseStart,
            domProcessing: perfData.domComplete - perfData.domLoading
          });
        }, 0);
      });
    }

    /**
     * API 调用性能监控
     */
    wrapFetch() {
      const originalFetch = window.fetch;
      const self = this;
      
      window.fetch = async function(...args) {
        const startTime = performance.now();
        const url = args[0];
        
        try {
          const response = await originalFetch.apply(this, args);
          const duration = performance.now() - startTime;
          
          self.logPerformance(EventType.API_CALL, {
            url,
            method: args[1]?.method || 'GET',
            status: response.status,
            duration,
            success: response.ok
          });
          
          return response;
        } catch (error) {
          const duration = performance.now() - startTime;
          
          self.logPerformance(EventType.API_CALL, {
            url,
            method: args[1]?.method || 'GET',
            duration,
            failed: true,
            error: error.message
          });
          
          throw error;
        }
      };
    }

    /**
     * 全局错误监控
     */
    monitorErrors() {
      window.addEventListener('error', (event) => {
        this.logError(event.error || new Error(event.message), {
          source: event.filename,
          line: event.lineno,
          column: event.colno
        });
      });
      
      window.addEventListener('unhandledrejection', (event) => {
        this.logError(new Error(event.reason), {
          type: 'unhandledPromiseRejection',
          promise: event.promise
        });
      });
    }
  }

  // 全局单例
  const logger = new Logger();

  // 导出到 window
  window.Logger = logger;
  window.LogLevel = LogLevel;
  window.EventType = EventType;

  // 自动启动监控
  logger.monitorPageLoad();
  // 仅在开发环境包裹 fetch，以避免生产环境产生 /api/logs 请求
  try {
    const host = (window && window.location && window.location.hostname) || '';
    const isDev = host === 'localhost' || host === '127.0.0.1';
    if (isDev) {
      logger.wrapFetch();
    }
  } catch (_) { /* silent */ }
  logger.monitorErrors();

})();
