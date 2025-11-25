// 充值页面逻辑
Page({
  data: {
    currentMethod: 'blockchain', // blockchain | bank
    network: 'ERC20',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    amount: '0',
    bankAmount: '0',
    balance: '0.00',
    note: '',
    voucherUrl: ''
  },

  onLoad(options) {
    console.log('[Deposit] 页面加载', options);
    
    // 初始化数字键盘
    if (window.Numpad) {
      window.Numpad.init();
    }
    
    // 从 URL 参数获取充值方式
    const urlParams = new URLSearchParams(window.location.search);
    const method = urlParams.get('method') || options?.method || 'blockchain';
    
    // 设置初始充值方式
    if (method === 'bank' || method === 'blockchain') {
      this.setData({ currentMethod: method });
      // 延迟更新 UI，确保 DOM 已加载
      setTimeout(() => {
        this.switchToMethod(method);
      }, 100);
    }
    
    // 加载用户余额
    this.loadBalance();
    
    // 确保方法绑定到全局
    this.ensureGlobalMethodBindings();
  },

  // 确保方法绑定到全局作用域
  ensureGlobalMethodBindings() {
    if (typeof window.currentPage !== 'undefined') {
      window.currentPage.onBack = this.onBack.bind(this);
      window.currentPage.onMethodSwitch = this.onMethodSwitch.bind(this);
      window.currentPage.onNetworkSelect = this.onNetworkSelect.bind(this);
      window.currentPage.onCopyAddress = this.onCopyAddress.bind(this);
      window.currentPage.onAmountClick = this.onAmountClick.bind(this);
      window.currentPage.onCopyBankAccount = this.onCopyBankAccount.bind(this);
      window.currentPage.onUploadVoucher = this.onUploadVoucher.bind(this);
      window.currentPage.onRemoveVoucher = this.onRemoveVoucher.bind(this);
      window.currentPage.onNoteInput = this.onNoteInput.bind(this);
      window.currentPage.onSubmit = this.onSubmit.bind(this);
    }
  },

  // 加载余额
  loadBalance() {
    // TODO: 从 API 获取实际余额
    this.setData({ balance: '1234.56' });
  },

  // 返回上一页
  onBack() {
    console.log('[Deposit] 返回');
    // TODO: 实现页面返回逻辑
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  },

  // 切换充值方式
  onMethodSwitch(event) {
    const method = event.currentTarget.dataset.method;
    console.log('[Deposit] 切换充值方式:', method);
    
    this.setData({ currentMethod: method });
    this.switchToMethod(method);
  },

  // 切换到指定充值方式（供内部调用）
  switchToMethod(method) {
    // 更新 UI
    const tabs = document.querySelectorAll('.method-tab');
    tabs.forEach(tab => {
      if (tab.dataset.method === method) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // 切换表单显示
    const forms = document.querySelectorAll('.deposit-form');
    forms.forEach(form => {
      if (form.dataset.form === method) {
        form.classList.add('active');
        form.style.display = 'block';
      } else {
        form.classList.remove('active');
        form.style.display = 'none';
      }
    });
  },

  // 选择网络
  onNetworkSelect() {
    console.log('[Deposit] 选择网络');
    // TODO: 打开网络选择弹窗
    this.showToast('网络选择功能开发中', 'info');
  },

  // 复制地址
  onCopyAddress() {
    const address = this.data.address;
    this.copyToClipboard(address);
    this.showToast('地址已复制', 'success');
  },

  // 复制银行账号
  onCopyBankAccount() {
    const accountNumber = '1234567890123456';
    this.copyToClipboard(accountNumber);
    this.showToast('账号已复制', 'success');
  },

  // 复制到剪贴板
  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(err => {
        console.error('[Deposit] 复制失败:', err);
        this.fallbackCopy(text);
      });
    } else {
      this.fallbackCopy(text);
    }
  },

  // 降级复制方法
  fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('[Deposit] 降级复制失败:', err);
    }
    document.body.removeChild(textarea);
  },

  // 点击金额输入框
  onAmountClick() {
    const currentMethod = this.data.currentMethod;
    const minAmount = currentMethod === 'blockchain' ? 10 : 100;
    
    if (window.Numpad) {
      window.Numpad.open({
        value: currentMethod === 'blockchain' ? this.data.amount : this.data.bankAmount,
        minValue: minAmount,
        maxValue: 999999,
        decimalPlaces: 2,
        onConfirm: (value) => {
          console.log('[Deposit] 金额确认:', value);
          if (currentMethod === 'blockchain') {
            this.setData({ amount: value });
          } else {
            this.setData({ bankAmount: value });
          }
        }
      });
    } else {
      console.error('[Deposit] Numpad 未初始化');
      this.showToast('键盘组件未就绪', 'error');
    }
  },

  // 上传凭证
  onUploadVoucher() {
    console.log('[Deposit] 上传凭证');
    // TODO: 实现文件上传逻辑
    this.showToast('上传功能开发中', 'info');
  },

  // 移除凭证
  onRemoveVoucher() {
    console.log('[Deposit] 移除凭证');
    this.setData({ voucherUrl: '' });
    
    const preview = document.querySelector('.voucher-preview');
    if (preview) {
      preview.setAttribute('data-has-voucher', 'false');
    }
  },

  // 备注输入
  onNoteInput(event) {
    const value = event.target.value;
    this.setData({ note: value });
  },

  // 提交充值请求
  onSubmit() {
    console.log('[Deposit] 提交充值请求');
    
    const { currentMethod, amount, bankAmount, voucherUrl, note } = this.data;
    
    // 验证
    if (currentMethod === 'blockchain') {
      const numAmount = parseFloat(amount);
      if (!numAmount || numAmount < 10) {
        this.showToast('最小充值金额为 10 USDT', 'warning');
        return;
      }
    } else if (currentMethod === 'bank') {
      const numAmount = parseFloat(bankAmount);
      if (!numAmount || numAmount < 100) {
        this.showToast('最小充值金额为 100 USDT', 'warning');
        return;
      }
      
      if (!voucherUrl) {
        this.showToast('请上传转账凭证', 'warning');
        return;
      }
    }
    
    // TODO: 调用 API 提交充值请求
    this.showToast('充值请求已提交', 'success');
    
    // 延迟返回
    setTimeout(() => {
      this.onBack();
    }, 1500);
  },

  // 显示提示
  showToast(message, type = 'info') {
    console.log(`[Deposit] Toast (${type}):`, message);
    
    // 创建简单的 toast 提示
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 12px 24px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10001;
      animation: fadeIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }
});
