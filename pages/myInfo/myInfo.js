// 个人信息页面逻辑
Page({
  // 页面初始数据
  data: {
    userInfo: {
      name: '张三',
      email: 'zhangsan@example.com',
      phone: '138****8888',
      role: 'VIP会员',
      isVip: true,
      loginCount: 128,
      lastLoginTime: '2025-11-01 10:30',
      registeredDate: '2024-01-15'
    },
    stats: {
      todayVisits: 5,
      totalVisits: 256,
      points: 1580
    }
  },

  // 页面加载时触发
  onLoad(options) {
    // 检查登录状态
    if (!sessionStorage || !sessionStorage.getItem || !sessionStorage.getItem('k')) {
      console.warn('[myInfo] 未登录，跳转到登录页');
      window.location.replace('../../pages/index/index.html');
      return;
    }

    console.log('myInfo 页面加载', options);
    console.log('页面配置:', window.PAGE_CONFIG);
    
    // 从 sessionStorage 获取用户信息
    this.loadUserInfo();

    // 尝试从接口拉取最新的个人信息
    this.fetchUserInfoFromAPI();
  },

  // 页面初次渲染完成
  onReady() {
    console.log('myInfo 页面渲染完成');
    this.updatePageTitle();
  },

  // 页面显示时触发
  onShow() {
    console.log('myInfo 页面显示');
  },

  // 页面隐藏时触发
  onHide() {
    console.log('myInfo 页面隐藏');
  },

  // 页面卸载时触发
  onUnload() {
    console.log('myInfo 页面卸载');
  },

  // 加载用户信息
  loadUserInfo() {
    try {
      const userInfoStr = sessionStorage.getItem('USERINFO');
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        this.setData({
          userInfo: {
            ...this.data.userInfo,
            name: userInfo.userName || this.data.userInfo.name,
            email: userInfo.userEmail || this.data.userInfo.email,
            // 可根据实际数据结构调整
          }
        });
      }
    } catch (e) {
      console.error('加载用户信息失败:', e);
    }
  },

  // 从后端接口拉取用户信息（需要已登录并存在 sessionStorage 中的账号与密钥）
  async fetchUserInfoFromAPI() {
    try {
      const u = (typeof sessionStorage !== 'undefined') ? (sessionStorage.getItem('u') || sessionStorage['u']) : '';
      const k = (typeof sessionStorage !== 'undefined') ? (sessionStorage.getItem('k') || sessionStorage['k']) : '';

      if (!u || !k) {
        console.warn('未找到会话账号或密钥，跳过接口拉取');
        return;
      }

      if (typeof window.createSuperAPI !== 'function') {
        console.warn('SuperAPI 未加载，跳过接口拉取');
        return;
      }

      // 创建 API 实例并请求用户信息
      const api = window.createSuperAPI(u, k);
      // I00017 在 API_SIGN_MAP 中示例为“用户信息”，如后端有差异请对应调整
      const resp = await api.request('I00017', {});

      // 根据返回的规范更新字段，做容错映射
      if (resp) {
        const next = { ...this.data.userInfo };
        next.name  = resp.userName || resp.name || next.name;
        next.email = resp.userEmail || resp.email || next.email;
        next.phone = resp.userPhone || resp.phone || next.phone;
        next.role  = resp.userRole  || resp.role  || next.role;
        if (typeof resp.isVip !== 'undefined') next.isVip = !!resp.isVip;
        if (typeof resp.loginCount !== 'undefined') next.loginCount = Number(resp.loginCount) || next.loginCount;
        next.lastLoginTime = resp.lastLoginTime || resp.lastLogin || next.lastLoginTime;
        next.registeredDate = resp.registeredDate || resp.registered || next.registeredDate;

        this.setData({ userInfo: next });

        // 缓存一份，便于下次快速展示
        try {
          const cache = {
            userName: next.name,
            userEmail: next.email,
            userPhone: next.phone,
            userRole: next.role
          };
          sessionStorage.setItem('USERINFO', JSON.stringify(cache));
        } catch (_) {}
      }
    } catch (e) {
      console.error('拉取用户信息失败:', e);
      try { if (typeof ShowToast === 'function') ShowToast('获取用户信息失败', 'confirm'); } catch(_) {}
    }
  },

  // 更新页面标题
  updatePageTitle() {
    if (window.PAGE_CONFIG && window.PAGE_CONFIG.navigationBarTitleText) {
      document.title = window.PAGE_CONFIG.navigationBarTitleText;
    }
  },

  // 编辑个人信息
  handleEdit() {
    console.log('编辑个人信息');
    
    // 使用声明式导航
    wx.navigateTo({
      url: '../editInfo/editInfo.html'
    });
  },

  // 退出登录
  handleLogout() {
    if (confirm('确定要退出登录吗？')) {
      // 清除登录信息
      sessionStorage.clear();
      
      // 跳转到登录页
      wx.redirectTo({
        url: '../login/login.html'
      });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});

// 兼容不使用 Page() 的情况，直接绑定事件
if (!window.Page) {
  console.warn('Page loader not found, using fallback mode');
  
  window.addEventListener('load', function() {
    console.log('myInfo 页面加载完成（fallback mode）');
  });
}
