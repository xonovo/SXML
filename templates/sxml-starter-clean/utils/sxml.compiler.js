/**
 * SXML 预编译器 - 将 SXML 模板编译为纯 HTML
 * 在构建时运行，生成已渲染的 HTML 文件
 * 支持从外部配置文件读取品牌、域名和安全策略
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SXMLCompiler {
  constructor(env = null) {
    this.cache = new Map();
    // 为每次编译生成唯一的 nonce（用于 CSP）
    this.nonce = crypto.randomBytes(16).toString('base64');
    
    // 加载外部配置文件（支持环境变量）
    this.env = env || process.env.NODE_ENV || 'production';
    this.appConfig = this.loadAppConfig();
  }

  /**
   * 加载应用配置文件（支持多环境）
   * @returns {Object} 配置对象
   */
  loadAppConfig() {
    // 仅使用 JS 配置；不再读取 JSON
    const envRaw = String(this.env || '').toLowerCase();
    const envAlias = envRaw === 'production' || envRaw === 'prod' ? 'prod'
                    : envRaw === 'test' ? 'test'
                    : 'dev';

    const candidates = [
      path.resolve(__dirname, '..', 'config', `app.config.${envAlias}.js`),
      path.resolve(__dirname, '..', 'config', 'app.config.js')
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const cfg = require(p);
          if (cfg && typeof cfg === 'object') {
            const tag = p.includes(`.${envAlias}.js`) ? `${envAlias.toUpperCase()}` : 'DEFAULT';
            console.log(`✅ 已加载 ${tag} 环境配置(JS):`, p);
            return cfg;
          }
        }
      } catch (e) {
        console.warn(`⚠️  读取配置失败: ${p}: ${e.message}`);
      }
    }

    console.warn('⚠️  未找到 JS 配置，使用内置默认值');
    
    // 默认配置
    return {
      app: {
        name: 'Your App',
        title: 'Your App Management Entrance',
        description: 'Modern Web 3.0 Management System'
      },
      api: {
        baseUrl: 'https://api.example.com'
      },
      external: {
        ipGeoProvider: 'https://ipapi.co',
        ipApiProvider: 'https://api.ipify.org'
      },
      security: {
        connectSrc: ["'self'", "https://api.example.com", "https://ipapi.co", "https://api.ipify.org"],
        preconnectHosts: ["https://api.example.com", "https://ipapi.co", "https://api.ipify.org"]
      },
      branding: {
        faviconPath: '../../images/logo1.png',
        logoPath: '../../images/logo1.png',
        logoAlt: 'App Logo'
      }
    };
  }

  /**
   * 生成新的 nonce（每个页面独立）
   */
  generateNonce() {
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * 编译 SXML 模板
   * @param {string} sxmlPath - SXML 模板文件路径（.sxml 或 .html）
   * @param {string} jsPath - JS 文件路径
   * @param {string} outputPath - 输出文件路径
  * @param {string} jsonPath - JSON 配置文件路径（可选）
   */
  compile(sxmlPath, jsPath, outputPath, jsonPath = null) {
    console.log(`📦 开始编译: ${path.basename(sxmlPath)} -> ${sxmlPath}`);

    // 读取 SXML 模板和 JS 文件
    const sxmlContent = fs.readFileSync(sxmlPath, 'utf-8');
    const jsContent = fs.readFileSync(jsPath, 'utf-8');
    try {
      const cnt = (sxmlContent.match(/s[:：]show=/g) || []).length;
      console.log('[read] source s:show count =', cnt);
    } catch (_) {}
    // 读取 JSON 配置
    let pageConfig = {};
    if (jsonPath && fs.existsSync(jsonPath)) {
      try {
        pageConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      } catch (e) {
        console.warn('⚠️  JSON 配置解析失败');
      }
    }
    this.pageConfig = pageConfig;
    
    // 保存页面名称，用于引入同名CSS
    this.pageName = path.basename(sxmlPath, path.extname(sxmlPath));
    // 检查同名CSS文件是否存在
    const cssPath = sxmlPath.replace(/\.(sxml|html)$/, '.css');
    this.hasPageCss = fs.existsSync(cssPath);

    // 分析页面依赖（智能检测使用的工具库）
    this.pageDependencies = this.analyzeDependencies(sxmlContent, jsContent);
    console.log(`📊 检测到依赖: ${this.pageDependencies.join(', ')}`);

    // 提取初始数据
    const initialData = this.extractPageData(jsContent);
    
    // 编译模板
    const compiledHtml = this.compileTemplate(sxmlContent, initialData);

    // 写入输出文件
    fs.writeFileSync(outputPath, compiledHtml, 'utf-8');
    console.log(`✅ 编译完成: ${path.basename(outputPath)}`);
  }

  /**
   * 分析页面依赖 - 智能检测页面实际使用的工具库
   * @param {string} sxmlContent - SXML 模板内容
   * @param {string} jsContent - JS 文件内容
   * @returns {Array} 依赖的工具库列表
   */
  analyzeDependencies(sxmlContent, jsContent) {
    const deps = new Set();
    const combinedContent = sxmlContent + '\n' + jsContent;

    // 定义依赖检测规则（模块名 -> 检测特征）
    const dependencyRules = {
      'jQuery_v3.js': [
        /\$\(/,                           // $( 或 $.
        /jQuery/,
        /\.ajax\(/,
        /\.each\(/,
        /\.on\(/
      ],
      'aes.js': [
        /\bAES\b/,                        // AES 加密
        /aesEncrypt/,
        /aesDecrypt/,
        /\bEncrypt\(/,                    // 加密函数
        /\bDecrypt\(/                     // 解密函数
      ],
      'md5.js': [
        /\bMD5\b/,                        // MD5 哈希
        /md5\(/,
        /hex_md5/                         // hex_md5_utf 等函数
      ],
      'config.js': [
        /\bCONFIG\b/,                     // 配置对象
        /getConfig\(/,
        /config\./
      ],
      'i18n.js': [
        /\bi18n\b/,                       // 国际化
        /i18n\.t\(/,
        /\$t\(/
      ],
      'sapi.js': [
        /\bsapi\b/,                       // API 调用
        /sapi\.request\(/,
        /sapi\.get\(/,
        /sapi\.post\(/,
        /createSuperAPI\(/,               // SuperAPI 工厂函数
        /superAPI\.request\(/,            // SuperAPI 实例调用
        /window\.superAPI/                // 全局 SuperAPI
      ],
      'wsapi.js': [
        /\bwsapi\b/,                      // WebSocket
        /wsapi\.connect\(/,
        /wsapi\.send\(/,
        /wsapi\.on\(/
      ],
      'fileapi.js': [
        /\bfileapi\b/,                    // 文件上传下载
        /fileapi\.upload\(/,
        /fileapi\.download\(/
      ],
      'page.js': [
        /\bPage\(/,                       // Page 函数（必需）
        /this\.setData\(/,
        /getCurrentPages\(/
      ],
      'qrcode.js': [
        /\bQRCode\b/,                     // 二维码
        /new QRCode\(/
      ],
      'reactive.js': [
        /\$reactive\(/,                   // 响应式系统
        /\.observe\(/,
        /\.computed\(/
      ],
  /*
   * 运行时 SXML 解析器已弃用：所有指令均在编译阶段处理。
   * 如需恢复，请重新启用下方规则并在 loadOrder 中加入 'sxml.parser.js'。
   * 'sxml.parser.js': [ /s:for=/, /s:if=.*\{\{/, /s:show=/, /parseTemplate\(/ ]
   */
    };

    // 核心依赖（始终引入）
    const coreDeps = [
      'api-sign-map.js',  // API 签名映射（config.js 依赖）
      'config.js',        // 配置系统（几乎所有页面需要）
      'app.js',           // 全局 App（类似微信小程序 getApp）
      'logger.js',        // 日志系统（安全审计、性能监控）
      'zh-CN.js',         // 默认中文语言包（预加载，避免异步等待）
      'i18n.js',          // 国际化系统
      'toast.js',         // Toast 组件（全局 ShowToast 等）
      'page.js',          // Page 函数（必需）
      'onload.js'         // 页面加载器（必需）
    ];

    // 检测每个依赖
    for (const [module, patterns] of Object.entries(dependencyRules)) {
      for (const pattern of patterns) {
        if (pattern.test(combinedContent)) {
          deps.add(module);
          break; // 找到一个特征即可
        }
      }
    }

    // 依赖关系链（如果使用 A，则必须引入 B）
    const dependencyChains = {
      'sapi.js': ['aes.js', 'md5.js', 'config.js'],       // sapi 依赖加密和配置
      'wsapi.js': ['config.js'],                           // wsapi 依赖配置
      'fileapi.js': ['config.js'],                         // fileapi 依赖配置
      'i18n.js': ['config.js'],                            // i18n 依赖配置
      'config.js': ['api-sign-map.js']                     // config 依赖签名映射
    };

    // 根据依赖链自动添加间接依赖
    const addTransitiveDeps = (module) => {
      if (dependencyChains[module]) {
        for (const dep of dependencyChains[module]) {
          if (!deps.has(dep)) {
            deps.add(dep);
            addTransitiveDeps(dep); // 递归添加
          }
        }
      }
    };

    for (const dep of [...deps]) {
      addTransitiveDeps(dep);
    }

    // 添加核心依赖
    coreDeps.forEach(dep => deps.add(dep));

    // 转换为有序数组（按加载顺序）
    const loadOrder = [
      'jQuery_v3.js',      // 基础库（很多模块依赖）
      'aes.js',            // 加密库
      'md5.js',            // 哈希库
      'api-sign-map.js',   // API 签名映射（必须在 config.js 之前）
      'config.js',         // 配置系统
      'app.js',            // 全局 App（在业务之前）
      'logger.js',         // 日志系统（在业务逻辑之前初始化）
      'zh-CN.js',          // 预加载中文语言包（在 i18n.js 之前同步可用）
      'i18n.js',           // 国际化
      'sapi.js',           // API 调用
      'wsapi.js',          // WebSocket
      'fileapi.js',        // 文件 API
      'toast.js',          // Toast 组件（在 Page 之前，保证全局函数可用）
      'page.js',           // Page 函数
      'onload.js',         // 页面加载器
      'qrcode.js',         // 二维码
      'reactive.js'        // 响应式
    ];

    // 按顺序返回
    return loadOrder.filter(module => deps.has(module));
  }

  /**
   * 生成脚本标签
   * @returns {string} script 标签 HTML
   */
  generateScriptTags() {
    const scripts = [];
    const deps = this.pageDependencies || [];
    // 开发环境下添加缓存破坏参数，避免浏览器缓存旧版脚本
    const envRaw = String(this.env || '').toLowerCase();
    const isDev = envRaw === 'dev' || envRaw === 'development';
    const cacheBust = isDev ? (`?v=${Date.now()}`) : '';

    for (const module of deps) {
      let path = '';
      let comment = '';

      // 确定文件路径和注释
      if (module === 'api-sign-map.js') {
        path = '../../config/api-sign-map.js' + cacheBust;
        comment = '<!-- API 签名映射配置（必须在 config.js 之前加载）-->';
      } else if (module === 'app.js') {
        path = `../../app.js${cacheBust}`;
      } else if (module.match(/^(zh-CN|en-US)\.js$/)) {
        // 语言包文件放在 locales/ 目录
        path = `../../locales/${module}${cacheBust}`;
      } else {
        path = `../../utils/${module}${cacheBust}`;
      }

      // 添加注释（仅对特殊模块）
      if (comment) {
        scripts.push(`    ${comment}`);
      }

      // 在加载 config.js 之前，注入当前环境对应的配置 URL（供 runtime 使用）
      if (module === 'config.js') {
        const envRaw = String(this.env || 'production').toLowerCase();
        let configFileJs;
        if (envRaw === 'dev' || envRaw === 'development') {
          configFileJs = '../../config/app.config.dev.js' + cacheBust;
        } else if (envRaw === 'test') {
          configFileJs = '../../config/app.config.test.js';
        } else if (envRaw === 'prod' || envRaw === 'production') {
          // 生产环境统一注入 prod 配置
          configFileJs = '../../config/app.config.prod.js';
        } else {
          // 其他未知环境使用默认
          configFileJs = '../../config/app.config.js';
        }
        // 直接加载 JS 配置以加速首屏，同时设置 APP_CONFIG_URL 供兜底逻辑使用
        scripts.push(`    <script type="text/javascript" src="${configFileJs}"></script>`);
        scripts.push(`    <script>window.APP_CONFIG_URL = '${configFileJs}';</script>`);
      }

      scripts.push(`    <script type="text/javascript" src="${path}"></script>`);
      
      // toast.js 加载后验证
      if (module === 'toast.js') {
        scripts.push(`    <script>
      // 确保 Toast 可用（静默回退加载，不输出控制台日志）
      (function(){
        try {
          if (typeof window.ShowToast !== 'function') {
            fetch('../../utils/toast.js${cacheBust}').then(function(r){return r.text();}).then(function(code){ try{ eval(code); }catch(_){ } }).catch(function(){ /* silent */ });
          }
        } catch(_) {}
      })();
    </script>`);
      }
    }

    return scripts.join('\n');
  }

  /**
   * 从 Page() 配置中提取初始数据
   */
  extractPageData(jsContent) {
    const data = {};
    
    // 尝试精确提取 Page 的 data 对象（支持嵌套花括号）
    const dataStartMatch = jsContent.match(/data\s*:\s*\{/);
    if (!dataStartMatch) {
      console.warn('⚠️  未找到 Page data');
      return data;
    }

    // 从 data 对象的第一个 { 开始，进行括号配对提取完整对象
    const startIndex = jsContent.indexOf('{', dataStartMatch.index);
    let i = startIndex;
    let brace = 0;
    let inStr = false;
    let strQuote = '';
    let prevChar = '';
    for (; i < jsContent.length; i++) {
      const ch = jsContent[i];
      if (inStr) {
        if (ch === strQuote && prevChar !== '\\') {
          inStr = false;
          strQuote = '';
        }
      } else {
        if (ch === '"' || ch === "'") {
          inStr = true;
          strQuote = ch;
        } else if (ch === '{') {
          brace++;
        } else if (ch === '}') {
          brace--;
          if (brace === 0) {
            // i 指向与起始 { 配对的结束 }
            i++; // 包含结束大括号
            break;
          }
        }
      }
      prevChar = ch;
    }

    const fullDataObject = jsContent.slice(startIndex, i); // 形如 { ... }
    const dataContent = fullDataObject.slice(1, -1); // 去掉首尾花括号
    
    try {
      // 安全解析：尝试使用 JSON5 风格的解析（不使用 eval）
      const jsonStr = this.convertToJSON(dataContent);
      const dataObj = JSON.parse(jsonStr);
      Object.assign(data, dataObj);
    } catch (e) {
      // 如果解析失败，使用正则表达式解析（简化版）
      console.warn('⚠️  使用备用解析方法:', e.message);
      
      // 解析简单字段
      const fieldRegex = /(\w+)\s*:\s*('([^']*)'|"([^"]*)"|true|false|null|\d+\.?\d*|\{[\s\S]*?\}|\[[\s\S]*?\])/g;
      let match;
      
      while ((match = fieldRegex.exec(dataContent)) !== null) {
        const key = match[1];
        let value = match[2].trim();
        
        // 解析值类型
        if (value.startsWith("'") || value.startsWith('"')) {
          // 字符串
          data[key] = value.slice(1, -1);
        } else if (value === 'true' || value === 'false') {
          // 布尔值
          data[key] = value === 'true';
        } else if (value === 'null') {
          // null
          data[key] = null;
        } else if (value.startsWith('[')) {
          // 数组 - 尝试 JSON 解析
          try {
            const arrJson = value.replace(/'/g, '"');
            data[key] = JSON.parse(arrJson);
          } catch {
            data[key] = [];
          }
        } else if (value.startsWith('{')) {
          // 对象 - 尝试 JSON 解析
          try {
            const objJson = this.convertToJSON(value);
            data[key] = JSON.parse(objJson);
          } catch {
            data[key] = {};
          }
        } else if (!isNaN(value)) {
          // 数字
          data[key] = Number(value);
        } else {
          // 其他类型
          data[key] = value;
        }
      }
    }

    console.log('📊 提取的数据:', data);
    return data;
  }

  /**
   * 将 JavaScript 对象字面量转换为 JSON 字符串
   * @param {string} jsObjStr - JavaScript 对象字面量字符串
   * @returns {string} JSON 字符串
   */
  convertToJSON(jsObjStr) {
    let result = jsObjStr.trim();
    
    // 1. 将单引号字符串替换为双引号（注意避免嵌套引号）
    result = result.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');
    
    // 2. 为无引号的键添加双引号（匹配对象键）
    // 匹配: word: 但不匹配已经有引号的
    result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // 3. 处理特殊值（已经是标准格式）
    // true, false, null 不需要额外处理
    
    // 4. 清理多余空格
    result = result.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    
    return result;
  }

  /**
   * 编译模板内容
   */
  compileTemplate(html, data) {
    let compiled = html;
  try { console.log('[pipeline] at start s:show count =', (compiled.match(/s[:：]show=/g) || []).length); } catch (_) {}

    // 0. SXML 到 HTML 转换（必须在其他步骤之前）
    compiled = this.convertSxmlToHtml(compiled);
  try { console.log('[pipeline] after convertSxmlToHtml s:show count =', (compiled.match(/s[:：]show=/g) || []).length); } catch (_) {}

    // 1. 处理条件渲染 s:if（在数据绑定之前，以便求值原始表达式）
    compiled = this.compileIf(compiled, data);
  try { console.log('[pipeline] after compileIf s:show count =', (compiled.match(/s[:：]show=/g) || []).length); } catch (_) {}

    // 2. 处理显示/隐藏 s:show（在数据绑定之前，以便求值原始表达式并保留属性）
    compiled = this.compileShow(compiled, data);
  try { console.log('[pipeline] after compileShow s:show count =', (compiled.match(/s[:：]show=/g) || []).length); } catch (_) {}

    // 3. 替换数据绑定 {{ }}（在 s:if/s:show 之后，避免提前求值破坏指令）
    compiled = this.compileDataBinding(compiled, data);
  try { console.log('[pipeline] after compileDataBinding s:show count =', (compiled.match(/s[:：]show=/g) || []).length); } catch (_) {}

    // 4. 处理列表渲染 s-for
    compiled = this.compileFor(compiled, data);

    // 5. 添加 HTML 结构（如果是纯 SXML）
    compiled = this.wrapHtmlStructure(compiled, data);

    // 6. 添加编译标记注释
    compiled = this.addCompileMark(compiled);

    return compiled;
  }

  /**
   * 将 SXML 语法转换为 HTML
   */
  convertSxmlToHtml(sxml) {
    let html = sxml;

    // SXML 事件绑定 → HTML 事件
    const eventMap = {
      'bindtap': 'onclick',
      'catchtap': 'onclick',
      'bindlongtap': 'oncontextmenu',
      'bindtouchstart': 'ontouchstart',
      'bindtouchmove': 'ontouchmove',
      'bindtouchend': 'ontouchend',
      'bindinput': 'oninput',
      'bindchange': 'onchange',
      'bindfocus': 'onfocus',
      'bindblur': 'onblur',
      'bindsubmit': 'onsubmit',
      'bindkeydown': 'onkeydown',
      'bindkeyup': 'onkeyup'
    };

    // 替换事件绑定
    for (const [wxEvent, htmlEvent] of Object.entries(eventMap)) {
      const regex = new RegExp(`\\s${wxEvent}\\s*=\\s*["']([^"']+)["']`, 'g');
      html = html.replace(regex, (match, handler) => {
  // 恢复为原始写法，便于开发调试，直接抛出异常暴露问题
  return ` ${htmlEvent}="currentPage.${handler}(event)"`;
      });
    }

    // SXML 组件 → HTML 标签
    const componentMap = {
      'view': 'div',
      'text': 'span',
      'button': 'button',
      'input': 'input',
      'textarea': 'textarea',
      'image': 'img',
      'icon': 'i',
      'picker': 'select',
      'navigator': 'a',
      'swiper': 'div',
      'swiper-item': 'div',
      'scroll-view': 'div',
      'block': 'template'
    };

    // 替换组件标签（保持属性不变）
    for (const [wxTag, htmlTag] of Object.entries(componentMap)) {
      // 开始标签
      const openRegex = new RegExp(`<${wxTag}(\\s|>)`, 'gi');
      html = html.replace(openRegex, `<${htmlTag}$1`);
      
      // 结束标签
      const closeRegex = new RegExp(`</${wxTag}>`, 'gi');
      html = html.replace(closeRegex, `</${htmlTag}>`);
    }

  // 处理自闭合标签（image 等）；icon 仅匹配独立 <i ... />，避免误伤 <input ... />
  html = html.replace(/<img([^>]*?)\/>/g, '<img$1>');
  html = html.replace(/<i(?=\s|>)([^>]*?)\/>/g, '<i$1></i>');

    // mode 属性转换（image 组件）
    html = html.replace(/\smode\s*=\s*["']([^"']+)["']/g, (match, mode) => {
      const styleMap = {
        'aspectFit': 'object-fit: contain;',
        'aspectFill': 'object-fit: cover;',
        'widthFix': 'width: 100%; height: auto;',
        'scaleToFill': 'width: 100%; height: 100%;'
      };
      return styleMap[mode] ? ` style="${styleMap[mode]}"` : '';
    });

    // \n 转换为 <br />（SXML 中的换行）
    html = html.replace(/\\n/g, '<br />');

    return html;
  }

  /**
   * 为纯 SXML 内容添加 HTML 结构
   */
  wrapHtmlStructure(content, data = {}) {
    // 检查是否已有 <!DOCTYPE html>
    if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
      return content;
    }

    // 获取页面配置
    const config = this.pageConfig || {};
    const appConfig = this.appConfig || {};
    
    // 标题:优先使用 pageConfig,然后使用 appConfig,最后使用默认值
    let title = config.navigationBarTitleText || 
                  (appConfig.app && appConfig.app.title) || 
                  'Your App';
    
    // 如果 title 包含模板变量,进行替换
    if (title.includes('{{') && title.includes('}}')) {
      title = title.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
        expr = expr.trim();
        try {
          const value = this.evaluateExpression(expr, data);
          return value !== undefined ? String(value) : match;
        } catch (e) {
          console.warn(`[wrapHtmlStructure] 无法替换标题中的模板变量: ${match}`, e);
          return match;
        }
      });
    }

    // 构建内联样式
    let bodyStyle = '';
    if (config.style) {
      const styleObj = config.style;
      bodyStyle = `
  <style>
    html, body {
      ${styleObj['font-family'] ? `font-family: ${styleObj['font-family']};` : ''}
      ${styleObj.display ? `display: ${styleObj.display};` : ''}
      ${styleObj['justify-content'] ? `justify-content: ${styleObj['justify-content']};` : ''}
      ${styleObj['align-items'] ? `align-items: ${styleObj['align-items']};` : ''}
      margin: 0;
      width: 100%;
      height: 100%;
      ${styleObj.background ? `background: ${styleObj.background};` : ''}
    }
  </style>`;
    }

    // 纯 SXML，需要添加 HTML 结构
    // 根据页面配置设置浏览器主题色（近似导航栏样式）
    const navBg = (config.window && config.window.navigationBarBackgroundColor) || config.navigationBarBackgroundColor;
    const themeMeta = navBg ? `\n  <meta name="theme-color" content="${navBg}">` : '';

    // 构建页面专属CSS引用（如果存在）
    const pageCssLink = this.hasPageCss 
      ? `  <link rel="preload" href="./${this.pageName}.css" as="style" />\n  <link rel="stylesheet" type="text/css" href="./${this.pageName}.css" />\n` 
      : '';

    // 从外部配置读取安全策略和外部域
    const security = appConfig.security || {};
    const external = appConfig.external || {};
    const connectSrcList = security.connectSrc || ["'self'"];
    const connectSrc = connectSrcList.join(' ');
    
    const preconnectHosts = security.preconnectHosts || [];
    const preconnectLinks = preconnectHosts.map(host => {
      const hostname = host.replace(/^https?:\/\//, '');
      return `  <link rel="dns-prefetch" href="//${hostname}" />\n  <link rel="preconnect" href="${host}" crossorigin />`;
    }).join('\n');

    // Favicon 路径
    const faviconPath = (appConfig.branding && appConfig.branding.faviconPath) || '../../images/logo1.png';

    return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- 安全策略 (CSP) - 临时允许内联样式和脚本以兼容现有代码 -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src ${connectSrc}; base-uri 'self'; form-action 'self';">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  ${themeMeta}
  <meta name="sxml-compiled" content="true">
  <!-- 防止缓存 -->
  <meta http-equiv="pragma" content="no-cache">
  <meta http-equiv="cache-control" content="no-cache">
  <meta http-equiv="expires" content="0">
  
  <title>${title}</title>
  
  <!-- 连接优化：预解析与预连接，降低握手延迟 -->
${preconnectLinks}
  
  <!-- 预加载关键CSS，防止FOUC（无样式内容闪烁）-->
  <link rel="preload" href="../../css/element.css" as="style" />
  <link rel="stylesheet" type="text/css" href="../../css/element.css" />
${pageCssLink}  <link rel="icon" href="${faviconPath}" type="image/x-icon" />
  
  <!-- 防止页面闪烁的内联关键CSS -->
  <style>
    /* 首屏淡入 */
    body { 
      opacity: 0; 
      transition: opacity 0.3s ease-in;
    }
    body.loaded { 
      opacity: 1; 
    }
    /* 仅隐藏需要替换文本内容的元素，避免把 input/button 等交互控件隐藏 */
    [data-i18n]:not(input):not(button):not(select):not(textarea),
    [data-i18n-html]:not(input):not(button):not(select):not(textarea) {
      visibility: hidden;
    }
    .i18n-ready [data-i18n],
    .i18n-ready [data-i18n-html] {
      visibility: visible;
    }
    /* Bot 检测拒绝访问样式 */
    .access-denied {
      padding: 50px;
      text-align: center;
    }
  </style>
${bodyStyle}
</head>
<body>
${content}

  <!-- 动态依赖库（根据页面实际使用智能引入）-->
${this.generateScriptTags()}
  <!-- 页面加载器 -->
    <script>window.SXML_PRECOMPILED = true;</script>
    <script type="text/javascript" src="../../utils/page.loader.js"></script>
    
  <!-- 页面加载完成后显示内容：优先等待 i18n 就绪，最多延迟 800ms -->
    <script>
      (function(){
        // 反爬虫检测：检测自动化工具特征
        function detectBot() {
            const ua = navigator.userAgent ? navigator.userAgent.toLowerCase() : '';
            const isIos = /iphone|ipad|ipod/.test(ua);
            const isAndroid = /android/.test(ua);
            const isMobile = isIos || isAndroid;
            const isSafariUa = /safari/.test(ua) && !/chrome|crios|fxios|edge|edga|edgios/.test(ua);

            if (navigator.webdriver) return true;
            if (!isMobile && window.navigator && window.navigator.plugins && window.navigator.plugins.length === 0) return true;

            const botPatterns = ['bot', 'crawl', 'spider', 'scrape', 'python', 'requests', 'urllib', 'scrapy', 'selenium', 'phantomjs'];
            if (botPatterns.some(pattern => ua.includes(pattern))) return true;

            if (screen.width === 0 || screen.height === 0) return true;

            if (!window.chrome && !window.opera && !/firefox|edge|msie|trident/i.test(ua) && !isSafariUa) {
              return true;
            }

            return false;
          }
        
        // 生成设备指纹
        function generateFingerprint() {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx.textBaseline = 'top';
          ctx.font = '14px Arial';
          ctx.fillText('browser fingerprint', 2, 2);
          return canvas.toDataURL().slice(-50);
        }
        
        // 如果检测到机器人，隐藏内容或重定向
        if (detectBot()) {
          document.body.innerHTML = '<div class="access-denied"><h1>Access Denied</h1><p>Automated access is not allowed.</p></div>';
          console.error('Bot detected');
          return;
        }
        
        // 生成并存储设备指纹（用于后端验证）
        try {
          const fp = generateFingerprint();
          sessionStorage.setItem('_dfp', fp);
        } catch (e) { /* ignore */ }
        
        function reveal(){
          if (!document.body.classList.contains('loaded')) {
            document.body.classList.add('loaded');
          }
        }
        // 若 i18n 存在，等待其就绪事件，确保翻译文本已应用再显示
        if (window.i18n) {
          if (document.documentElement.classList.contains('i18n-ready')) {
            reveal();
          } else {
            window.addEventListener('i18n:ready', reveal, { once: true });
            // 兜底：若 800ms 内未就绪也先显示，避免白屏过久
            setTimeout(reveal, 800);
          }
        } else {
          // 无 i18n 时按 DOMContentLoaded 或立即显示
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', reveal);
          } else {
            reveal();
          }
        }
      })();
    </script>
</body>
</html>`;
  }

  /**
   * 编译数据绑定 {{ expression }}
   * 注意:不处理运行时指令属性(s:开头的所有属性)内的 Mustache,让运行时解析
   */
  compileDataBinding(html, data) {
    // 策略:先将所有 s: 指令属性替换为占位符,处理完后再还原
    const placeholders = [];
    let placeholderIndex = 0;
    
    // 步骤1:保护所有 s: 或 s： 开头的运行时指令属性
    let result = html.replace(/(s[:：]\w+)\s*=\s*["']([^"']*)["']/g, (match) => {
      const placeholder = `__SXML_DIRECTIVE_${placeholderIndex}__`;
      placeholders.push({ placeholder, original: match });
      placeholderIndex++;
      return placeholder;
    });
    
    // 步骤2:替换其他所有 {{}}
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
      expr = expr.trim();
      console.log(`[compileDataBinding] 发现模板变量: {{${expr}}}`);
      try {
        const value = this.evaluateExpression(expr, data);
        console.log(`[compileDataBinding] 替换结果: {{${expr}}} -> ${value}`);
        return value !== undefined ? String(value) : match;
      } catch (e) {
        console.warn(`⚠️  无法解析表达式: ${expr}`, e.message);
        return match;
      }
    });
    
    // 步骤3:还原所有运行时指令属性
    placeholders.forEach(({ placeholder, original }) => {
      result = result.replace(placeholder, original);
    });
    
    return result;
  }

  /**
   * 编译条件渲染 s:if / s:else-if / s:else
   * 支持完整的条件链
   */
  compileIf(html, data) {
    // 先处理自闭合标签的 s:if（如 <img ... s:if="..." />）
    const selfClosingIfRegex = /<(\w+)([^>]*)\s+s:if\s*=\s*["']([^"']+)["']([^>]*?)\s*\/?>/g;
    let compiled = html.replace(selfClosingIfRegex, (match, tag, before, condition, after) => {
      // 检查是否为自闭合标签（img, input, br, hr 等）
      const selfClosingTags = ['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
      if (!selfClosingTags.includes(tag.toLowerCase())) {
        return match; // 不是自闭合标签，留给后续处理
      }
      
      try {
        const cond = this.unwrapMustache ? this.unwrapMustache(condition) : condition;
        const conditionResult = this.evaluateExpression(cond, data);
        if (conditionResult) {
          // 移除 s:if 属性，保留标签
          return `<${tag}${before}${after}>`;
        } else {
          // 条件不满足，移除整个标签
          return '';
        }
      } catch (e) {
        console.warn(`⚠️  自闭合标签 s:if 条件解析失败: ${condition}`);
        return match;
      }
    });
    
    // 匹配连续的条件块：s:if + 可选的 s:else-if + 可选的 s:else
  const conditionChainRegex = /<(\w+)([^>]*)\s+s:if\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>((?:\s*<\1([^>]*)\s+s:else-if\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>)*)\s*(?:<\1([^>]*)\s+s:else\s*([^>]*)>([\s\S]*?)<\/\1>)?/g;
    
    // 先处理完整的条件链
    compiled = compiled.replace(conditionChainRegex, (match) => {
      try {
        // 分解整个匹配块，提取所有条件元素
        const elements = [];
        
        // 提取 s:if
        const ifMatch = match.match(/<(\w+)([^>]*)\s+s:if\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/);
        if (ifMatch) {
          elements.push({
            type: 'if',
            tag: ifMatch[1],
            before: ifMatch[2],
            condition: ifMatch[3],
            after: ifMatch[4],
            content: ifMatch[5]
          });
        }
        
        // 提取所有 s:else-if
        const elseIfRegex = /<(\w+)([^>]*)\s+s:else-if\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/g;
        let elseIfMatch;
        while ((elseIfMatch = elseIfRegex.exec(match)) !== null) {
          elements.push({
            type: 'else-if',
            tag: elseIfMatch[1],
            before: elseIfMatch[2],
            condition: elseIfMatch[3],
            after: elseIfMatch[4],
            content: elseIfMatch[5]
          });
        }
        
        // 提取 s:else
        const elseMatch = match.match(/<(\w+)([^>]*)\s+s:else\s*([^>]*)>([\s\S]*?)<\/\1>/);
        if (elseMatch) {
          elements.push({
            type: 'else',
            tag: elseMatch[1],
            before: elseMatch[2],
            after: elseMatch[3],
            content: elseMatch[4]
          });
        }
        
        // 依次评估条件，返回第一个为真的分支
        for (const el of elements) {
          if (el.type === 'else') {
            // else 分支无条件渲染
            return `<${el.tag}${el.before}${el.after}>${el.content}</${el.tag}>`;
          }
          
          const cond = this.unwrapMustache ? this.unwrapMustache(el.condition) : el.condition;
          const conditionResult = this.evaluateExpression(cond, data);
          if (conditionResult) {
            return `<${el.tag}${el.before}${el.after}>${el.content}</${el.tag}>`;
          }
        }
        
        // 所有条件都不满足，移除整个条件链
        return '';
      } catch (e) {
        console.warn(`⚠️  条件链解析失败:`, e.message);
        return match;
      }
    });
    
    // 再处理孤立的 s:if（没有 else-if/else 的简单情况）
    const simpleIfRegex = /<(\w+)([^>]*)\s+s:if\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/g;
    compiled = compiled.replace(simpleIfRegex, (match, tag, before, condition, after, content) => {
      // 检查后面是否紧跟 s:else-if 或 s:else，如果是则跳过（已被条件链处理）
      const nextElementRegex = /^\s*<\w+[^>]*\s+s:else/;
      const afterMatch = compiled.substr(compiled.indexOf(match) + match.length, 100);
      if (nextElementRegex.test(afterMatch)) {
        return match; // 已被条件链处理，保持原样
      }
      
      try {
        const cond = this.unwrapMustache ? this.unwrapMustache(condition) : condition;
        const conditionResult = this.evaluateExpression(cond, data);
        if (conditionResult) {
          return `<${tag}${before}${after}>${content}</${tag}>`;
        } else {
          return '';
        }
      } catch (e) {
        console.warn(`⚠️  s:if 条件解析失败: ${condition}`);
        return match;
      }
    });
    
    return compiled;
  }

  /**
   * 编译显示/隐藏 s:show
   */
  compileShow(html, data) {
    const showRegex = /<(\w+)([^>]*)\s+s:show\s*=\s*["']([^"']+)["']([^>]*)>/g;
    
    return html.replace(showRegex, (match, tag, before, condition, after) => {
      try {
        const cond = this.unwrapMustache ? this.unwrapMustache(condition) : condition;
        const result = this.evaluateExpression(cond, data);
        const display = result ? '' : ' style="display:none;"';
        
        // 移除 s:show，添加 style
        return `<${tag}${before}${after}${display}>`;
      } catch (e) {
        console.warn(`⚠️  s:show 条件解析失败: ${condition}`);
        return match;
      }
    });
  }

  /**
   * 编译列表渲染 s:for（简化版）
   */
  compileFor(html, data) {
    const forRegex = /<(\w+)([^>]*)\s+s:for\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/g;
    
    return html.replace(forRegex, (match, tag, before, forExpr, after, template) => {
      try {
        // 支持整体 Mustache 包裹：s:for="{{ item, idx in listExpr }}"
        const raw = this.unwrapMustache ? this.unwrapMustache(forExpr) : forExpr;
        
        // 解析 s:for="item in listExpr" 或 "item, index in listExpr"
        const forMatch = raw.match(/(\w+)(?:\s*,\s*(\w+))?\s+in\s+([\s\S]+)/);
        if (!forMatch) {
          console.warn(`⚠️  s:for 语法错误: ${forExpr}`);
          return match;
        }

        const [, itemName, indexName, listExpr] = forMatch;
        const list = this.evaluateExpression(listExpr.trim(), data);

        if (!Array.isArray(list)) {
          console.warn(`⚠️  s:for 数据不是数组: ${listExpr}`);
          return '';
        }

        // 渲染每一项
        return list.map((item, index) => {
          let itemHtml = template;
          
          // 替换 {{item}} 占位
          itemHtml = itemHtml.replace(new RegExp(`\\{\\{\\s*${itemName}\\s*\\}\\}`, 'g'), item);
          
          // 替换 {{index}} 占位
          if (indexName) {
            itemHtml = itemHtml.replace(new RegExp(`\\{\\{\\s*${indexName}\\s*\\}\\}`, 'g'), index);
          }
          
          return `<${tag}${before}${after}>${itemHtml}</${tag}>`;
        }).join('');
      } catch (e) {
        console.warn(`⚠️  s:for 编译失败: ${forExpr}`, e.message);
        return match;
      }
    });
  }

  /**
   * 去除 Mustache 包裹："{{ expr }}" -> "expr"
   */
  unwrapMustache(expr) {
    try {
      const s = String(expr);
      const m = s.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
      return m ? m[1].trim() : s.trim();
    } catch (e) {
      return expr;
    }
  }

  /**
   * 判断值是否为真(空值当作 false)
   * @param {*} value - 要判断的值
   * @returns {boolean}
   */
  isTruthy(value) {
    // null、undefined、空字符串、0、false 都视为假
    if (value === null || value === undefined || value === '' || value === 0 || value === false) {
      return false;
    }
    return true;
  }

  /**
   * 求值表达式（安全版本，不使用 new Function）
   */
  evaluateExpression(expr, data) {
    try {
      // 移除表达式中的空格
      const cleanExpr = expr.trim();
      
      // 1. 处理方法调用（如 userInfo.name.substring(0,1)）
      const methodCallMatch = cleanExpr.match(/^(.+?)\.(\w+)\((.*?)\)$/);
      if (methodCallMatch) {
        const [, objPath, method, argsStr] = methodCallMatch;
        const obj = this.evaluateExpression(objPath, data);
        
        if (obj && typeof obj[method] === 'function') {
          // 解析参数
          const args = argsStr.split(',').map(arg => {
            const trimmed = arg.trim();
            // 数字
            if (!isNaN(trimmed)) return Number(trimmed);
            // 字符串
            if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
              return trimmed.slice(1, -1);
            }
            // 变量
            return this.evaluateExpression(trimmed, data);
          });
          return obj[method](...args);
        }
      }
      
      // 2. 处理链式属性访问（如 user.profile.name）
      if (/^[\w.]+$/.test(cleanExpr) && cleanExpr.includes('.')) {
        const parts = cleanExpr.split('.');
        let value = data;
        for (const part of parts) {
          value = value?.[part];
          if (value === undefined) return undefined;
        }
        return value;
      }
      
      // 3. 处理简单的属性访问（如 user.name）
      const propAccessMatch = cleanExpr.match(/^(\w+)\.(\w+)$/);
      if (propAccessMatch) {
        const [, obj, prop] = propAccessMatch;
        return data[obj]?.[prop];
      }
      
      // 4. 处理数组访问（如 items[0]）
      const arrayAccessMatch = cleanExpr.match(/^(\w+)\[(\d+)\]$/);
      if (arrayAccessMatch) {
        const [, arr, index] = arrayAccessMatch;
        return data[arr]?.[parseInt(index)];
      }
      
      // 5. 处理直接变量（如 userName）
      if (/^\w+$/.test(cleanExpr)) {
        // 特殊处理：APP_* 全局配置变量
        if (cleanExpr.startsWith('APP_') && this.appConfig && this.appConfig.app) {
          const configKey = cleanExpr.replace('APP_', '').toLowerCase();
          // APP_NAME -> app.name, APP_TITLE -> app.title
          console.log(`[evaluateExpression] APP_ 变量: ${cleanExpr} -> configKey: ${configKey}, value:`, this.appConfig.app[configKey]);
          if (this.appConfig.app[configKey] !== undefined) {
            return this.appConfig.app[configKey];
          }
        }
        return data[cleanExpr];
      }
      
      // 6. 处理三元运算符（如 isVip ? 'VIP' : 'Normal'）
      const ternaryMatch = cleanExpr.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
      if (ternaryMatch) {
        const [, condition, truePart, falsePart] = ternaryMatch;
        const condResult = this.evaluateExpression(condition, data);
        return condResult ? this.evaluateExpression(truePart, data) : this.evaluateExpression(falsePart, data);
      }
      
      // 7. 处理字符串字面量
      if (cleanExpr.startsWith("'") && cleanExpr.endsWith("'")) {
        return cleanExpr.slice(1, -1);
      }
      if (cleanExpr.startsWith('"') && cleanExpr.endsWith('"')) {
        return cleanExpr.slice(1, -1);
      }
      
      // 8. 处理数字字面量
      if (!isNaN(cleanExpr)) {
        return Number(cleanExpr);
      }
      
      // 9. 处理布尔值
      if (cleanExpr === 'true') return true;
      if (cleanExpr === 'false') return false;
      if (cleanExpr === 'null') return null;
      
      // 10. 处理简单比较运算符（如 count > 0, isActive === true）
      const comparisonMatch = cleanExpr.match(/^(.+?)\s*(===|!==|==|!=|>|<|>=|<=)\s*(.+)$/);
      if (comparisonMatch) {
        const [, left, op, right] = comparisonMatch;
        const leftVal = this.evaluateExpression(left, data);
        const rightVal = this.evaluateExpression(right, data);
        
        switch (op) {
          case '===': return leftVal === rightVal;
          case '!==': return leftVal !== rightVal;
          case '==': return leftVal == rightVal;
          case '!=': return leftVal != rightVal;
          case '>': return leftVal > rightVal;
          case '<': return leftVal < rightVal;
          case '>=': return leftVal >= rightVal;
          case '<=': return leftVal <= rightVal;
        }
      }
      
      // 11. 处理逻辑运算符（如 isVip && isActive）
      const logicalMatch = cleanExpr.match(/^(.+?)\s*(&&|\|\|)\s*(.+)$/);
      if (logicalMatch) {
        const [, left, op, right] = logicalMatch;
        const leftVal = this.evaluateExpression(left, data);
        
        if (op === '&&') {
          // 空值当作 false
          return this.isTruthy(leftVal) ? this.evaluateExpression(right, data) : false;
        } else if (op === '||') {
          // 空值当作 false
          return this.isTruthy(leftVal) ? leftVal : this.evaluateExpression(right, data);
        }
      }
      
      // 12. 处理取反运算符（如 !isActive）
      if (cleanExpr.startsWith('!')) {
        const innerExpr = cleanExpr.slice(1).trim();
        const innerVal = this.evaluateExpression(innerExpr, data);
        // 使用 isTruthy 来判断,空值当作 false
        return !this.isTruthy(innerVal);
      }
      
      // 如果以上都不匹配，返回原值
      console.warn(`⚠️  无法解析表达式: ${expr}`);
      return expr;
      
    } catch (e) {
      console.error(`❌ 表达式求值失败: ${expr}`, e);
      return '';
    }
  }

  /**
   * 添加编译标记
   */
  addCompileMark(html) {
    const timestamp = new Date().toISOString();
    const comment = `\n<!-- SXML Compiled at ${timestamp} -->\n`;
    
    // 在 <body> 标签后添加注释
    return html.replace(/<body([^>]*)>/, `<body$1>${comment}`);
  }

  /**
   * 批量编译页面
   */
  compilePages(pagesDir, outputDir) {
    console.log('🚀 开始批量编译 SXML 页面...\n');

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 扫描 pages 目录
    const pageFolders = fs.readdirSync(pagesDir);

    pageFolders.forEach(folder => {
      const folderPath = path.join(pagesDir, folder);
      
      if (!fs.statSync(folderPath).isDirectory()) {
        return;
      }

      // 优先查找 .sxml 文件，其次是 .html 文件
      const sxmlPath = path.join(folderPath, `${folder}.sxml`);
      const htmlPath = path.join(folderPath, `${folder}.html`);
      const jsPath = path.join(folderPath, `${folder}.js`);
  const jsonPath = path.join(folderPath, `${folder}.json`);
      
      // 确定使用哪个模板文件
      let templatePath = null;
      if (fs.existsSync(sxmlPath)) {
        templatePath = sxmlPath;
        console.log(`📄 使用 SXML 模板: ${folder}.sxml`);
      } else if (fs.existsSync(htmlPath)) {
        templatePath = htmlPath;
        console.log(`📄 使用 HTML 模板: ${folder}.html`);
      }
      
      if (templatePath && fs.existsSync(jsPath)) {
        const outputPath = path.join(outputDir, folder, `${folder}.html`);
        
        // 确保输出子目录存在
        const outputSubDir = path.join(outputDir, folder);
        if (!fs.existsSync(outputSubDir)) {
          fs.mkdirSync(outputSubDir, { recursive: true });
        }

        // 编译
  this.compile(templatePath, jsPath, outputPath, jsonPath);
        
        // 复制其他资源文件
        this.copyResources(folderPath, outputSubDir, folder);
      }
    });

    console.log('\n✅ 所有页面编译完成！');
  }

  /**
   * 复制资源文件（CSS, JS, JSON等）
   */
  copyResources(srcDir, destDir, pageName) {
    const extensions = ['.css', '.js', '.json', '.png', '.jpg', '.svg'];
    
    extensions.forEach(ext => {
      const srcFile = path.join(srcDir, `${pageName}${ext}`);
      const destFile = path.join(destDir, `${pageName}${ext}`);
      
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
      }
    });
  }
}

// CLI 使用
if (require.main === module) {
  const compiler = new SXMLCompiler();
  
  const pagesDir = path.join(__dirname, '..', 'pages');
  const outputDir = path.join(__dirname, '..', 'dist');
  
  compiler.compilePages(pagesDir, outputDir);
}

module.exports = SXMLCompiler;
