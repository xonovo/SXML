// 通用数字键盘组件逻辑
(function() {
  'use strict';

  // 组件状态
  const state = {
    value: '0',
    maxLength: 12,
    maxValue: 999999999999,
    minValue: 0,
    decimalPlaces: 2,
    onConfirm: null,
    onClose: null
  };

  // 初始化键盘
  function initNumpad() {
    const container = document.getElementById('numpad-container');
    if (!container) {
      console.warn('[Numpad] 容器未找到');
      return;
    }

    // 绑定事件
    bindEvents();
    console.log('[Numpad] 初始化完成');
  }

  // 绑定事件
  function bindEvents() {
    // 键盘按键事件已在 SXML 中通过 bindtap 绑定
    // 这里只需要确保全局方法可访问
    if (typeof window.currentPage !== 'undefined') {
      // 将组件方法暴露到 currentPage
      window.currentPage.onKeyTap = onKeyTap;
      window.currentPage.onShortcutTap = onShortcutTap;
      window.currentPage.onNumpadClose = onNumpadClose;
      window.currentPage.onNumpadConfirm = onNumpadConfirm;
    }
  }

  // 打开键盘
  function openNumpad(options = {}) {
    const {
      value = '0',
      maxLength = 12,
      maxValue = 999999999999,
      minValue = 0,
      decimalPlaces = 2,
      onConfirm,
      onClose
    } = options;

    state.value = value;
    state.maxLength = maxLength;
    state.maxValue = maxValue;
    state.minValue = minValue;
    state.decimalPlaces = decimalPlaces;
    state.onConfirm = onConfirm;
    state.onClose = onClose;

    updateDisplay();
    showNumpad();
  }

  // 显示键盘
  function showNumpad() {
    const container = document.getElementById('numpad-container');
    if (!container) return;

    container.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  // 隐藏键盘
  function hideNumpad() {
    const container = document.getElementById('numpad-container');
    if (!container) return;

    container.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // 更新显示
  function updateDisplay() {
    const valueEl = document.querySelector('[data-numpad-value]');
    const approxEl = document.querySelector('[data-numpad-approx]');
    
    if (valueEl) {
      valueEl.textContent = state.value;
    }
    
    if (approxEl) {
      // 假设 1 USDT = 1 USD
      const numValue = parseFloat(state.value) || 0;
      approxEl.textContent = numValue.toFixed(2);
    }
  }

  // 按键处理
  function onKeyTap(event) {
    const key = event.currentTarget.dataset.key;
    
    if (key === 'delete') {
      handleDelete();
    } else if (key === '.') {
      handleDot();
    } else {
      handleNumber(key);
    }
    
    updateDisplay();
  }

  // 处理数字输入
  function handleNumber(num) {
    if (state.value === '0') {
      state.value = num;
    } else {
      // 检查长度限制
      if (state.value.length >= state.maxLength) {
        return;
      }
      
      // 检查小数位数限制
      if (state.value.includes('.')) {
        const decimalPart = state.value.split('.')[1];
        if (decimalPart && decimalPart.length >= state.decimalPlaces) {
          return;
        }
      }
      
      const newValue = state.value + num;
      const numValue = parseFloat(newValue);
      
      // 检查最大值限制
      if (numValue > state.maxValue) {
        return;
      }
      
      state.value = newValue;
    }
  }

  // 处理小数点
  function handleDot() {
    // 如果已经有小数点，忽略
    if (state.value.includes('.')) {
      return;
    }
    
    // 如果小数位数为 0，不允许输入小数点
    if (state.decimalPlaces === 0) {
      return;
    }
    
    state.value += '.';
  }

  // 处理删除
  function handleDelete() {
    if (state.value.length === 1) {
      state.value = '0';
    } else {
      state.value = state.value.slice(0, -1);
    }
  }

  // 快捷金额处理
  function onShortcutTap(event) {
    const amount = event.currentTarget.dataset.amount;
    state.value = amount;
    updateDisplay();
  }

  // 关闭键盘
  function onNumpadClose() {
    hideNumpad();
    if (typeof state.onClose === 'function') {
      state.onClose();
    }
  }

  // 确认输入
  function onNumpadConfirm() {
    const numValue = parseFloat(state.value) || 0;
    
    // 验证最小值
    if (numValue < state.minValue) {
      if (window.currentPage && typeof window.currentPage.showToast === 'function') {
        window.currentPage.showToast(`最小金额为 ${state.minValue} USDT`, 'warning');
      }
      return;
    }
    
    hideNumpad();
    
    if (typeof state.onConfirm === 'function') {
      state.onConfirm(state.value);
    }
  }

  // 导出到全局
  window.Numpad = {
    init: initNumpad,
    open: openNumpad,
    close: hideNumpad
  };

  // 页面加载时初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNumpad);
  } else {
    initNumpad();
  }
})();
