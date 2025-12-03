# 全局路由状态管理指南

## 概述

本系统实现了完整的全局路由状态管理，支持页面刷新后恢复到上次浏览位置，包括：
- 当前页面（Home/Markets/Trades/Funds）
- Trades 页面当前激活的面板（Capital/Leveraged）
- Funds 页面当前激活的面板（Capital/Leveraged）
- 未来扩展：内嵌页面（Deposit/Withdrawal/Loan/Repayment/Transfer/Details/Setup/Support）

## 核心功能

### 1. 路由状态保存

**触发时机**：
- 用户点击 Tabbar 切换页面
- 用户切换 Trades/Funds 面板

**保存内容**：
```javascript
{
  page: 'trades',           // 当前页面
  tradesPanel: 'leveraged', // Trades 面板类型
  fundsPanel: 'capital',    // Funds 面板类型
  timestamp: 1732694400000  // 保存时间戳
}
```

**存储位置**：`sessionStorage['webapp:route-state:v1']`

**有效期**：24 小时

### 2. 路由状态恢复

**触发时机**：页面加载完成后 100ms

**恢复逻辑**：
1. 从 sessionStorage 读取路由状态
2. 检查有效期（超过 24 小时自动清除）
3. 恢复页面位置（无动画切换）
4. 恢复面板状态（更新 UI）
5. 调用对应接口（延迟 300ms，确保 UI 就绪）

**示例**：
```javascript
// 用户上次在 Funds 页面的 Leveraged 面板
{
  page: 'funds',
  fundsPanel: 'leveraged'
}

// 刷新页面后
// 1. 切换到 Funds 页面（无需调用接口，因为非用户操作）
// 2. 激活 Leveraged 面板（更新 UI）
// 3. 调用 I00003 接口获取 Leveraged 资金数据
```

## 重要修复

### 问题 1：首次进入 Home 页面就调用 I00009

**原因**：`activateTab` 方法被调用时，无论是用户操作还是初始化，都会触发接口调用

**修复**：
```javascript
// 修改前
activateTab(tab) {
  // ... UI 切换 ...
  if (tab === 'trades') {
    this.handleTab3Click({ type: 'capital' }); // ❌ 总是调用
  }
}

// 修改后
activateTab(tab, options = {}) {
  const fromUserAction = options.fromUserAction || false;
  // ... UI 切换 ...
  
  // ✅ 只有用户主动切换时才调用接口
  if (fromUserAction && tab === 'trades') {
    const currentTab = this.data.activeTradeTab || 'capital';
    this.handleTab3Click({ type: currentTab });
  }
}
```

### 问题 2：点击 Funds 按钮时，Leveraged 面板却请求 Capital 接口

**原因**：
1. `switchFundsTab` 方法没有保存当前面板状态到 `data.activeFundsTab`
2. `handleTab4Click` 从旧的 `activeTradeTab` 推断 `detailsWalletType`

**修复**：
```javascript
// 修改前
switchFundsTab(e) {
  const type = e.currentTarget.dataset.type; // leveraged
  this.handleTab4Click(e); // ❌ 但 handleTab4Click 不知道 type
  // ... UI 动画 ...
}

// 修改后
switchFundsTab(e) {
  const type = e.currentTarget.dataset.type; // leveraged
  
  // ✅ 保存到全局状态
  this.setData({ activeFundsTab: type });
  
  // ✅ 保存到路由状态（支持刷新恢复）
  const currentState = loadRouteState() || {};
  saveRouteState({
    ...currentState,
    page: 'funds',
    fundsPanel: type
  });
  
  this.handleTab4Click(e); // ✅ 现在能正确识别 type
  // ... UI 动画 ...
}
```

### 问题 3：没有全局路由状态管理

**新增功能**：
```javascript
// 工具函数
saveRouteState(state)   // 保存路由状态到 sessionStorage
loadRouteState()        // 加载路由状态（自动检查有效期）
clearRouteState()       // 清除路由状态

// 页面方法
restoreRouteState()     // 恢复路由状态（页面加载时调用）
```

## API 调用逻辑

### Trades 页面（I00009 接口）

**调用时机**：
- ✅ 用户点击 Tabbar 的 Trades 按钮
- ✅ 用户切换 Capital/Leveraged 面板
- ✅ 页面刷新后恢复（如果上次在 Trades 页面）
- ❌ 首次加载时（初始化）
- ❌ 定时器自动刷新

**参数**：
- `userAccount`: 用户账号（从 localStorage/sessionStorage 读取）
- `detailsWalletType`: 0=Capital, 1=Leveraged（从 `data.activeTradeTab` 推断）
- `itemId`: 交易品种（从 `_activeSymbol` 读取）

### Funds 页面（I00003 接口）

**调用时机**：
- ✅ 用户点击 Tabbar 的 Funds 按钮
- ✅ 用户切换 Capital/Leveraged 面板
- ✅ 页面刷新后恢复（如果上次在 Funds 页面）
- ❌ 首次加载时（初始化）

**参数**：
- `userAccount`: 用户账号
- `detailsWalletType`: 0=Capital, 1=Leveraged（从 `data.activeFundsTab` 推断）

## 状态流转图

```
用户操作                      全局状态                    接口调用
─────────                   ──────────                 ─────────
点击 Trades 按钮  ──>  activeTradeTab: 'capital'  ──>  I00009 (type=0)
                       page: 'trades'
                       
切换到 Leveraged  ──>  activeTradeTab: 'leveraged' ──>  I00009 (type=1)
                       page: 'trades'
                       
点击 Funds 按钮   ──>  activeFundsTab: 'capital'  ──>  I00003 (type=0)
                       page: 'funds'
                       
切换到 Leveraged  ──>  activeFundsTab: 'leveraged' ──>  I00003 (type=1)
                       page: 'funds'
                       
刷新页面         ──>  从 sessionStorage 恢复     ──>  调用对应接口
```

## 未来扩展：内嵌页面路由

### 计划支持的内嵌页面

1. **Deposit**（充值）- 当前已支持
2. **Withdrawal**（提现）- 待实现
3. **Loan**（借贷）- 待实现
4. **Repayment**（还款）- 待实现
5. **Transfer**（转账）- 待实现
6. **Details**（明细）- 待实现
7. **Setup**（设置）- 待实现
8. **Support**（支持）- 待实现

### 扩展方式

```javascript
// 保存内嵌页面状态
saveRouteState({
  page: 'funds',
  fundsPanel: 'capital',
  subPage: 'deposit',          // 内嵌页面
  depositMethod: 'blockchain', // 内嵌页面参数
  depositNetwork: 'ERC20'      // 内嵌页面参数
});

// 恢复时
if (state.subPage === 'deposit') {
  this.openDepositPage({
    method: state.depositMethod,
    network: state.depositNetwork
  });
}
```

## 调试方法

### 查看当前路由状态

```javascript
// 浏览器控制台
JSON.parse(sessionStorage.getItem('webapp:route-state:v1'))
```

### 手动设置路由状态

```javascript
// 模拟刷新后恢复到 Leveraged 面板
saveRouteState({
  page: 'funds',
  fundsPanel: 'leveraged'
});
location.reload();
```

### 清除路由状态

```javascript
// 浏览器控制台
sessionStorage.removeItem('webapp:route-state:v1');
location.reload();
```

## 注意事项

1. **sessionStorage vs localStorage**
   - 使用 `sessionStorage` 存储路由状态，标签页关闭后自动清除
   - 用户账号等持久信息仍使用 `localStorage`

2. **有效期检查**
   - 路由状态有效期为 24 小时
   - 超过有效期自动清除，避免恢复到过时状态

3. **接口调用时机**
   - 只在用户主动操作时调用接口（`fromUserAction: true`）
   - 页面刷新恢复时调用接口（因为用户期望看到最新数据）
   - 初始化、定时器等非用户操作不调用接口

4. **UI 与数据同步**
   - 先更新全局状态（`setData`）
   - 再保存路由状态（`saveRouteState`）
   - 最后调用接口（`handleTab3Click` / `handleTab4Click`）

## 测试清单

- [x] 首次进入 Home 页面，不调用 I00009
- [x] 点击 Trades 按钮，调用 Capital 面板的 I00009
- [x] 切换到 Leveraged 面板，调用 Leveraged 的 I00009
- [x] 在 Leveraged 面板刷新页面，恢复到 Leveraged 并调用对应接口
- [x] 点击 Funds 按钮，调用 Capital 面板的 I00003
- [x] 在 Funds 页面切换到 Leveraged，调用 Leveraged 的 I00003
- [x] 在 Funds Leveraged 面板刷新，正确恢复并调用对应接口
- [ ] 打开 Deposit 页面后刷新，恢复到 Deposit 页面（待扩展）

## 相关文件

- `pages/webapp/webapp.js`：主逻辑实现
- `docs/ROUTE_STATE_GUIDE.md`：本文档
- `docs/PAGE_DEV_GUIDE.md`：页面开发指南
