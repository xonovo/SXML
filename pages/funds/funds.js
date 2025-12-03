// =========================================
// Funds 页面 - 资金账户与杠杆账户
// 支持实时行情联动的动态资产计算
// =========================================

import { apiRequest } from '@/utils/sapi.js';

export default {
  data() {
    return {
      activeTab: 0, // 0=资金账户, 1=杠杆账户
      
      // 资金账户数据
      cashWallet: {
        cashBalance: 0,        // 现金钱包余额
        leverBalance: 0,       // 杠杆钱包余额
        walletBalance: 0,      // 钱包余额合计
        collateral: 0,         // 抵押总额
        borrowed: 0,           // 借款总额
        interest: 0,           // 累计利息
        frozenMargin: 0,       // 冻结保证金
        available: 0,          // 可用余额
        leverInterest: 0,      // 小时利率
        maxLever: 0,           // 最大杠杆倍数
        positions: [],         // 持仓列表
        pendingOrders: []      // 挂单列表
      },
      
      // 杠杆账户数据（结构同上）
      leverWallet: {
        cashBalance: 0,
        leverBalance: 0,
        walletBalance: 0,
        collateral: 0,
        borrowed: 0,
        interest: 0,
        frozenMargin: 0,
        available: 0,
        leverInterest: 0,
        maxLever: 0,
        positions: [],
        pendingOrders: []
      },
      
      // 实时行情缓存（从 WebSocket 更新）
      priceCache: {},  // { 'XAUUSD': 4215.38, 'BTCUSDT': 98000, ... }
      
      // 轮询定时器
      refreshTimer: null
    };
  },
  
  computed: {
    // 当前激活账户
    currentWallet() {
      return this.activeTab === 0 ? this.cashWallet : this.leverWallet;
    },
    
    // ========================================
    // 1️⃣ 资产总额（动态计算）
    // ========================================
    totalAsset() {
      const wallet = this.currentWallet;
      
      // 持仓净值（根据实时行情计算浮动盈亏）
      const positionValue = this.calculatePositionValue(wallet.positions);
      
      // 挂单净值（按挂单价计算，不含滑点）
      const pendingValue = this.calculatePendingValue(wallet.pendingOrders);
      
      // 杠杆账户需减去负债
      const netBorrowed = this.activeTab === 1 ? (wallet.borrowed + wallet.interest) : 0;
      
      // 总资产 = 钱包余额 + 持仓净值 + 挂单净值 - 负债
      return wallet.walletBalance + positionValue + pendingValue - netBorrowed;
    },
    
    // ========================================
    // 2️⃣ 盈亏（动态计算）
    // ========================================
    profitLoss() {
      const wallet = this.currentWallet;
      let totalPL = 0;
      
      wallet.positions.forEach(pos => {
        const currentPrice = this.priceCache[pos.itemId] || pos.openPrice;
        const openCost = (pos.openPrice * pos.tradeVolume) + pos.takeSpread;
        const currentValue = currentPrice * pos.tradeVolume;
        
        // 做多: 盈亏 = 当前市值 - 开仓成本 - 利息
        // 做空: 盈亏 = 开仓成本 - 当前市值 - 利息
        const direction = pos.direction === 'buy' ? 1 : -1;
        const unrealizedPL = direction * (currentValue - openCost) - pos.swap;
        
        totalPL += unrealizedPL;
      });
      
      return totalPL;
    },
    
    // ========================================
    // 3️⃣ 净值（动态计算）
    // ========================================
    equity() {
      const wallet = this.currentWallet;
      
      // 净值 = 钱包余额 + 浮动盈亏 - 负债
      const netBorrowed = this.activeTab === 1 ? (wallet.borrowed + wallet.interest) : 0;
      return wallet.walletBalance + this.profitLoss - netBorrowed;
    },
    
    // ========================================
    // 4️⃣ 保证金（从抵押表读取）
    // ========================================
    marginLevel() {
      // 已占用保证金 = 冻结保证金 + 持仓占用保证金
      const wallet = this.currentWallet;
      let usedMargin = wallet.frozenMargin;
      
      wallet.positions.forEach(pos => {
        const openCost = (pos.openPrice * pos.tradeVolume) + pos.takeSpread;
        const posMargin = pos.tradeRate > 0 ? openCost / pos.tradeRate : openCost;
        usedMargin += posMargin;
      });
      
      return usedMargin;
    },
    
    // ========================================
    // 5️⃣ 信用（杠杆倍数）
    // ========================================
    credit() {
      return this.currentWallet.maxLever;
    },
    
    // ========================================
    // 可用保证金
    // ========================================
    freeMargin() {
      return Math.max(0, this.equity - this.marginLevel);
    },
    
    // ========================================
    // 保证金比率
    // ========================================
    marginRatio() {
      if (this.marginLevel === 0) return 0;
      return ((this.equity / this.marginLevel) * 100).toFixed(2);
    }
  },
  
  methods: {
    // ========================================
    // 加载钱包数据
    // ========================================
    async loadWalletData(walletType) {
      try {
        const res = await apiRequest('I00003', {
          userAccount: this.$store.state.user.userAccount,
          detailsWalletType: walletType
        });
        
        if (res.code === 2000) {
          const target = walletType === 0 ? this.cashWallet : this.leverWallet;
          Object.assign(target, {
            cashBalance: parseFloat(res.cashBalance || 0),
            leverBalance: parseFloat(res.leverBalance || 0),
            walletBalance: parseFloat(res.walletBalance || 0),
            collateral: parseFloat(res.collateral || 0),
            borrowed: parseFloat(res.borrowed || 0),
            interest: parseFloat(res.interest || 0),
            frozenMargin: parseFloat(res.frozenMargin || 0),
            available: parseFloat(res.available || 0),
            leverInterest: parseFloat(res.leverInterest || 0),
            maxLever: parseFloat(res.maxLever || 0),
            positions: res.positions || [],
            pendingOrders: res.pendingOrders || []
          });
          
          // 初始化行情缓存
          this.initPriceCache(target.positions);
        }
      } catch (err) {
        console.error('加载钱包数据失败:', err);
        this.$alert('加载失败，请稍后重试');
      }
    },
    
    // ========================================
    // 计算持仓净值
    // ========================================
    calculatePositionValue(positions) {
      let totalValue = 0;
      
      positions.forEach(pos => {
        const currentPrice = this.priceCache[pos.itemId] || pos.openPrice;
        const currentValue = currentPrice * pos.tradeVolume;
        
        // 持仓市值（不含盈亏，仅市值）
        totalValue += currentValue;
      });
      
      return totalValue;
    },
    
    // ========================================
    // 计算挂单净值
    // ========================================
    calculatePendingValue(orders) {
      let totalValue = 0;
      
      orders.forEach(order => {
        const orderValue = (order.openPrice * order.tradeVolume) + order.takeSpread;
        totalValue += orderValue;
      });
      
      return totalValue;
    },
    
    // ========================================
    // 初始化行情缓存
    // ========================================
    initPriceCache(positions) {
      positions.forEach(pos => {
        if (!this.priceCache[pos.itemId]) {
          this.priceCache[pos.itemId] = pos.openPrice;
        }
      });
    },
    
    // ========================================
    // 更新行情（从 WebSocket 推送）
    // ========================================
    updatePrice(itemId, price) {
      this.$set(this.priceCache, itemId, parseFloat(price));
    },
    
    // ========================================
    // 订阅行情推送
    // ========================================
    subscribeMarketData() {
      // 假设你有全局 WebSocket 实例
      if (window.marketWS) {
        window.marketWS.on('price', ({ symbol, price }) => {
          this.updatePrice(symbol, price);
        });
      }
    },
    
    // ========================================
    // 切换账户
    // ========================================
    switchTab(index) {
      this.activeTab = index;
      const walletType = index === 0 ? 0 : 1;
      this.loadWalletData(walletType);
    },
    
    // ========================================
    // 刷新数据
    // ========================================
    async refresh() {
      await Promise.all([
        this.loadWalletData(0),
        this.loadWalletData(1)
      ]);
    },
    
    // ========================================
    // 启动轮询（备用方案，WebSocket 断线时使用）
    // ========================================
    startPolling() {
      this.refreshTimer = setInterval(() => {
        this.refresh();
      }, 10000); // 每 10 秒刷新一次
    },
    
    // ========================================
    // 停止轮询
    // ========================================
    stopPolling() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    }
  },
  
  mounted() {
    // 初始加载
    this.refresh();
    
    // 订阅行情
    this.subscribeMarketData();
    
    // 启动轮询备份（可选）
    // this.startPolling();
  },
  
  beforeDestroy() {
    this.stopPolling();
  }
};
