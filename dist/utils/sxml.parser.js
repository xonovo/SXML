/**
 * SXML Parser - 声明式模板解析器
 * 支持数据绑定、条件渲染、列表渲染等功能
 */

(function(window) {
  'use strict';

  class SXMLParser {
    constructor(page) {
      this.page = page;
      this.watchers = [];
    }

    // 去除 Mustache 包裹
    unwrapMustache(expr) {
      if (!expr) return '';
      const s = String(expr);
      const m = s.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
      return m ? m[1].trim() : s.trim();
    }

    /**
     * 解析并渲染 SXML 模板
     * @param {HTMLElement} container - 容器元素
     */
    parse(container) {
      console.log('🎯 [SXMLParser.parse] 开始解析容器:', container ? container.tagName : 'null');
      
      if (!container) {
        console.warn('SXML: Container not found');
        return;
      }

      // 解析所有指令
      this.parseDirectives(container);
      
      // 解析数据绑定 {{ }}
      this.parseDataBinding(container);
      
      console.log('✅ [SXMLParser.parse] 解析完成');
    }

    /**
     * 解析指令 (s-if, s-for, s-show 等)
     */
    parseDirectives(container) {
      console.log('🔧 [parseDirectives] 开始解析指令');
      
      // 处理 s-for 指令
      this.parseFor(container);
      
      // 处理 s-if 指令
      this.parseIf(container);
      
      // 处理 s-show 指令
      this.parseShow(container);
      
      // 处理 s-bind 或 : 简写
      this.parseBind(container);
      
      // 处理事件绑定 bind: 或 catch:
      this.parseEvents(container);
      
      console.log('✅ [parseDirectives] 指令解析完成');
    }

    /**
     * 解析 s-for 列表渲染
     * 格式: s-for="item in list" s-for-index="index" s-for-key="id"
     */
    parseFor(container) {
      const elements = container.querySelectorAll('[s-for],[s\\:for]');
      
      elements.forEach(element => {
        const forExprRaw = element.getAttribute('s:for') || element.getAttribute('s-for');
        const indexName = element.getAttribute('s-for-index') || 'index';
        const keyName = element.getAttribute('s-for-key') || 'index';
        
        const forExpr = this.unwrapMustache(forExprRaw);
        
        // 解析表达式: "item in listExpr" 或 "item, index in listExpr"
        const match = forExpr.match(/(\w+)(?:\s*,\s*(\w+))?\s+in\s+([\s\S]+)/);
        if (!match) {
          console.warn('SXML: Invalid s-for expression:', forExprRaw);
          return;
        }

        const itemName = match[1];
        const listExpr = match[3].trim();
        
        // 保存原始模板
        const template = element.cloneNode(true);
        template.removeAttribute('s:for');
        template.removeAttribute('s-for');
        template.removeAttribute('s-for-index');
        template.removeAttribute('s-for-key');
        
        // 创建占位符注释
        const placeholder = document.createComment(`s-for ${forExprRaw}`);
        element.parentNode.insertBefore(placeholder, element);
        element.remove();
        
        // 渲染函数
        const render = () => {
          const list = this.evaluateExpression(listExpr);
          if (!Array.isArray(list)) {
            console.warn('SXML: s-for target is not an array:', listExpr);
            return;
          }
          
          // 清除之前的渲染
          let node = placeholder.nextSibling;
          while (node && node.nodeType !== 8) { // 8 = Comment
            const next = node.nextSibling;
            node.remove();
            node = next;
          }
          
          // 渲染列表
          const fragment = document.createDocumentFragment();
          list.forEach((item, index) => {
            const clone = template.cloneNode(true);
            
            // 设置数据上下文
            clone._sxmlContext = {
              [itemName]: item,
              [indexName]: index
            };
            
            // 递归解析子元素
            this.parseElementWithContext(clone, clone._sxmlContext);
            fragment.appendChild(clone);
          });
          
          placeholder.parentNode.insertBefore(fragment, placeholder.nextSibling);
        };
        
        // 监听数据变化
        const vars = this.extractVariables(listExpr);
        vars.forEach(v => this.watchData(v, render));
        render();
      });
    }

    /**
     * 解析 s-if 条件渲染
     */
    parseIf(container) {
      // 处理 s:if / s-if 链（支持 s:else-if / s:else）
      const allIfs = Array.from(container.querySelectorAll('[s-if],[s\\:if]'));
      
      allIfs.forEach(element => {
        // 已处理过的跳过（通过标记）
        if (element._sxmlIfProcessed) return;
        
        // 收集条件链：当前元素 + 后续兄弟中的 else-if/else
        const chain = [];
        let node = element;
        while (node) {
          const hasIf = node.hasAttribute('s:if') || node.hasAttribute('s-if');
          const hasElseIf = node.hasAttribute('s:else-if') || node.hasAttribute('s-else-if');
          const hasElse = node.hasAttribute('s:else') || node.hasAttribute('s-else');
          
          if (chain.length === 0 && hasIf) {
            const condRaw = node.getAttribute('s:if') || node.getAttribute('s-if') || '';
            chain.push({ type: 'if', condRaw, template: node.cloneNode(true) });
            node._sxmlIfProcessed = true;
            node = node.nextElementSibling;
            continue;
          }
          
          if (chain.length > 0 && (hasElseIf || hasElse)) {
            if (hasElseIf) {
              const condRaw = node.getAttribute('s:else-if') || node.getAttribute('s-else-if') || '';
              chain.push({ type: 'else-if', condRaw, template: node.cloneNode(true) });
            } else {
              chain.push({ type: 'else', template: node.cloneNode(true) });
            }
            node._sxmlIfProcessed = true;
            node = node.nextElementSibling;
            continue;
          }
          break;
        }
        
        if (chain.length === 0) return;
        
        // 清理模板属性
        chain.forEach(branch => {
          branch.template.removeAttribute('s:if');
          branch.template.removeAttribute('s-if');
          branch.template.removeAttribute('s:else-if');
          branch.template.removeAttribute('s-else-if');
          branch.template.removeAttribute('s:else');
          branch.template.removeAttribute('s-else');
        });
        
        // 插入占位符并移除原节点们
        const placeholder = document.createComment('s-if chain');
        element.parentNode.insertBefore(placeholder, element);
        // 移除链上所有原始节点
        let removeNode = placeholder.nextSibling;
        while (removeNode && (removeNode._sxmlIfProcessed || removeNode === element)) {
          const next = removeNode.nextElementSibling;
          removeNode.remove();
          removeNode = next;
        }
        // 也移除起始 element（若还存在）
        if (element.parentNode) element.parentNode.removeChild(element);
        
        const render = () => {
          // 清理之前渲染
          let n = placeholder.nextSibling;
          while (n && n.nodeType !== 8) { // 8: Comment
            const next = n.nextSibling;
            n.remove();
            n = next;
          }
          
          // 依次评估条件
          for (const branch of chain) {
            if (branch.type === 'else') {
              const clone = branch.template.cloneNode(true);
              this.parse(clone);
              placeholder.parentNode.insertBefore(clone, placeholder.nextSibling);
              return;
            }
            const condExpr = this.unwrapMustache(branch.condRaw || '');
            const ok = this.evaluateExpression(condExpr);
            if (ok) {
              const clone = branch.template.cloneNode(true);
              this.parse(clone);
              placeholder.parentNode.insertBefore(clone, placeholder.nextSibling);
              return;
            }
          }
        };
        
        // 监听所有条件中的变量
        const watchVars = new Set();
        chain.forEach(branch => {
          if (branch.condRaw) {
            const expr = this.unwrapMustache(branch.condRaw);
            this.extractVariables(expr).forEach(v => watchVars.add(v));
          }
        });
        watchVars.forEach(v => this.watchData(v, render));
        render();
      });
    }

    /**
     * 解析 s-show 显示/隐藏
     */
    parseShow(container) {
      const elements = container.querySelectorAll('[s-show],[s\\:show]');
      
      console.log(`🔍 [parseShow] 找到 ${elements.length} 个 s:show 元素`);
      
      elements.forEach(element => {
        const conditionRaw = element.getAttribute('s:show') || element.getAttribute('s-show');
        const condition = this.unwrapMustache(conditionRaw);
        
        console.log(`📌 [parseShow] 元素:`, element.tagName, element.id || '', `原始条件: "${conditionRaw}" -> 解析后: "${condition}"`);
        
        const render = () => {
          const result = this.evaluateExpression(condition);
          console.log(`✨ [parseShow] 计算 "${condition}" = ${result}, 元素:`, element.tagName, element.id || '');
          element.style.display = result ? '' : 'none';
        };
        
        const vars = this.extractVariables(condition);
        vars.forEach(v => this.watchData(v, render));
        render();
      });
    }

    /**
     * 解析属性绑定 s-bind:attr="value" 或 :attr="value"
     */
    parseBind(container) {
      const elements = container.querySelectorAll('*');
      
      elements.forEach(element => {
        Array.from(element.attributes).forEach(attr => {
          if (attr.name.startsWith('s-bind:') || attr.name.startsWith(':')) {
            const attrName = attr.name.replace(/^(s-bind:|:)/, '');
            const expression = attr.value;
            
            const render = () => {
              const value = this.evaluateExpression(expression);
              element.setAttribute(attrName, value);
            };
            
            const vars = this.extractVariables(expression);
            vars.forEach(v => this.watchData(v, render));
            render();
          }
        });
      });
    }

    /**
     * 解析事件绑定 bind:tap="handleTap" 或 catch:tap="handleTap"
     */
    parseEvents(container) {
      const elements = container.querySelectorAll('*');
      
      elements.forEach(element => {
        Array.from(element.attributes).forEach(attr => {
          // 支持 bind:tap / catch:tap 以及 bindtap / catchtap
          let bindMatch = attr.name.match(/^(bind|catch):(\w+)$/);
          let bindType, eventName;
          if (bindMatch) {
            [, bindType, eventName] = bindMatch;
          } else {
            const noColon = attr.name.match(/^(bind|catch)(\w+)$/);
            if (noColon) {
              [, bindType, eventName] = noColon;
              eventName = eventName.toLowerCase();
            }
          }
          if (bindType && eventName) {
            const handlerName = attr.value;
            const webEventName = this.convertEventName(eventName);
            element.addEventListener(webEventName, (e) => {
              if (bindType === 'catch') {
                e.stopPropagation();
              }
              if (this.page && typeof this.page[handlerName] === 'function') {
                this.page[handlerName].call(this.page, e);
              } else {
                console.warn(`SXML: Handler not found: ${handlerName}`);
              }
            });
            element.removeAttribute(attr.name);
          }
        });
      });
    }

    /**
     * 解析数据绑定 {{ expression }}
     */
    parseDataBinding(container) {
      console.log('🔍 SXML: Parsing data binding, page.data:', this.page?.data);
      
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            // 排除 script 和 style 标签内的文本
            let parent = node.parentElement;
            while (parent) {
              if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
                return NodeFilter.FILTER_REJECT;
              }
              parent = parent.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        },
        false
      );
      
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('{{')) {
          textNodes.push(node);
        }
      }
      
      console.log(`🔍 SXML: Found ${textNodes.length} text nodes with {{}} `);
      
      textNodes.forEach(textNode => {
        const originalText = textNode.textContent;
        const expressions = [];
        const regex = /\{\{(.+?)\}\}/g;
        let match;
        
        while (match = regex.exec(originalText)) {
          expressions.push({
            full: match[0],
            expr: match[1].trim()
          });
        }
        
        if (expressions.length === 0) return;
        
        // 保存原始文本用于更新
        if (!textNode._sxmlOriginal) {
          textNode._sxmlOriginal = originalText;
        }
        
        const render = () => {
          let text = textNode._sxmlOriginal || originalText;
          expressions.forEach(({ full, expr }) => {
            const value = this.evaluateExpression(expr, textNode._sxmlContext);
            console.log(`📝 SXML: ${expr} = ${value}`);
            text = text.replace(full, value ?? '');
          });
          textNode.textContent = text;
        };
        
        // 监听所有相关变量
        expressions.forEach(({ expr }) => {
          const vars = this.extractVariables(expr);
          vars.forEach(v => this.watchData(v, render));
        });
        
        render();
      });
    }

    /**
     * 解析带上下文的元素（用于 s-for）
     */
    parseElementWithContext(element, context) {
      // 处理文本节点
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('{{')) {
          textNodes.push(node);
        }
      }
      
      textNodes.forEach(textNode => {
        const originalText = textNode.textContent;
        let text = originalText;
        const regex = /\{\{(.+?)\}\}/g;
        let match;
        
        while (match = regex.exec(originalText)) {
          const expr = match[1].trim();
          const value = this.evaluateExpression(expr, context);
          text = text.replace(match[0], value ?? '');
        }
        
        textNode.textContent = text;
      });
      
      // 处理属性绑定
      element.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith(':') || attr.name.startsWith('s-bind:')) {
            const attrName = attr.name.replace(/^(s-bind:|:)/, '');
            const value = this.evaluateExpression(attr.value, context);
            el.setAttribute(attrName, value);
            el.removeAttribute(attr.name);
          }
        });
      });
    }

    /**
     * 获取 page.data 中的值
     */
    getDataValue(path) {
      if (!this.page || !this.page.data) return undefined;
      
      const keys = path.split('.');
      let value = this.page.data;
      
      for (const key of keys) {
        value = value[key];
        if (value === undefined) break;
      }
      
      return value;
    }

    /**
     * 计算表达式
     */
    evaluateExpression(expr, context = {}) {
      try {
        const cleanExpr = this.unwrapMustache(expr);
        // 创建安全的求值环境
        const data = {
          ...context
        };
        
        // 合并 page.data
        if (this.page && this.page.data) {
          Object.assign(data, this.page.data);
        }
        
        // 使用 Function 构造器求值
        const func = new Function(...Object.keys(data), `return ${cleanExpr};`);
        return func(...Object.values(data));
      } catch (e) {
        console.warn('SXML: Expression evaluation error:', expr, e);
        return undefined;
      }
    }

    /**
     * 提取表达式中的变量名
     */
    extractVariables(expr) {
      const cleaned = this.unwrapMustache(expr || '');
      const vars = new Set();
      const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
      let match;
      
      while (match = regex.exec(cleaned)) {
        const varName = match[1];
        // 排除 JavaScript 关键字
        if (!['true', 'false', 'null', 'undefined', 'this'].includes(varName)) {
          vars.add(varName);
        }
      }
      
      return Array.from(vars);
    }

    /**
     * 监听数据变化
     */
    watchData(path, callback) {
      if (!this.page || !this.page.setData) {
        // 简单的轮询监听
        this.watchers.push({ path, callback, lastValue: this.getDataValue(path) });
        return;
      }
      
      // 如果 page 有 reactive 系统，使用 watch
      if (window.watch && typeof window.watch === 'function') {
        // watch 期望一个函数，在函数内部访问数据并执行回调
        window.watch(() => {
          this.getDataValue(path);  // 触发依赖收集
          callback();  // 数据变化时执行回调
        });
      }
    }

    /**
     * 转换框架事件名到 Web 事件名
     */
    convertEventName(mpEvent) {
      const eventMap = {
        'tap': 'click',
        'touchstart': 'touchstart',
        'touchmove': 'touchmove',
        'touchend': 'touchend',
        'touchcancel': 'touchcancel',
        'longtap': 'contextmenu',
        'input': 'input',
        'change': 'change',
        'submit': 'submit',
        'focus': 'focus',
        'blur': 'blur'
      };
      
      return eventMap[mpEvent] || mpEvent;
    }
  }

  // 导出到全局
  window.SXMLParser = SXMLParser;

  // 全局解析器实例
  let globalParser = null;

  // 自动解析页面
  function autoParseOnLoad() {
    console.log('🚀 [autoParseOnLoad] 开始自动解析, currentPage:', window.currentPage);
    
    // 等待 Page 实例创建
    if (window.currentPage) {
      if (!globalParser) {
        console.log('✅ [autoParseOnLoad] 创建 SXMLParser 实例');
        globalParser = new SXMLParser(window.currentPage);
        globalParser.parse(document.body);
        
        // 解析完成后显示页面内容
        document.body.classList.add('sxml-ready');
        console.log('✅ SXML parsed with currentPage');
      } else {
        console.log('⚠️  [autoParseOnLoad] globalParser 已存在,跳过');
      }
    } else {
      // 如果没有 Page 实例，延迟解析
      console.log('⏳ Waiting for currentPage...');
    }
  }

  // 监听页面资源加载完成事件
  document.addEventListener('pageResourcesLoaded', function() {
    // 稍微延迟，确保 Page() 已执行
    setTimeout(autoParseOnLoad, 100);
  });

  // 也监听 DOMContentLoaded 作为后备
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(autoParseOnLoad, 200);
    });
  }

  // 扩展 Page 函数以支持 SXML
  if (window.Page) {
    const originalPage = window.Page;
    
    window.Page = function(config) {
      const page = originalPage.call(this, config);
      
      // 在 onReady 中解析 SXML
      const originalOnReady = page.onReady;
      page.onReady = function() {
        // 解析 SXML
        if (!globalParser) {
          globalParser = new SXMLParser(page);
          globalParser.parse(document.body);
          
          // 解析完成后显示页面内容
          document.body.classList.add('sxml-ready');
          console.log('✅ SXML parsed in onReady');
        }
        
        // 调用原始 onReady
        if (originalOnReady) {
          originalOnReady.call(this);
        }
      };
      
      return page;
    };
  }

  // 提供手动刷新方法（轻量重渲染：仅数据绑定）
  window.refreshSXML = function() {
    if (window.currentPage) {
      if (!globalParser) {
        globalParser = new SXMLParser(window.currentPage);
      }
      // 只刷新数据绑定，不重新解析指令（避免重复添加监听器）
      // s:show, s:if 等指令已通过 watch 自动响应数据变化
      globalParser.parseDataBinding(document.body);
      console.log('✅ SXML refreshed (bindings only)');
    }
  };

})(window);
