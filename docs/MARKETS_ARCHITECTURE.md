# 行情数据架构统一方案

## 核心问题分析

### 之前的问题
1. **双重缓存导致数据不一致**
   - `window.MarketsStore._quotes`（全局单例）
   - `webapp._marketsLiveQuotes`（页面本地副本）
   - WebSocket 更新 Store，页面从副本读，导致延迟和不同步

2. **WebSocket 更新路径不完整**
   - WebSocket → MarketsStore → 'update' 事件
   - 事件监听器只更新副本和部分 UI
   - 交易页/首页/行情页各自渲染逻辑不统一

3. **applyMarketsQuote 永远不被调用**
   - 之前设计的统一刷新逻辑在 `applyMarketsQuote` 中
   - 但 WebSocket 数据直接进 MarketsStore，不经过此函数

## 解决方案

### 架构原则
**单一数据源（Single Source of Truth）**
- `window.MarketsStore` 作为唯一行情数据存储
- 所有页面直接从 MarketsStore 读取，不再维护本地副本
- WebSocket 更新触发统一刷新函数，确保所有 UI 同步

### 数据流向

```
WebSocket 推送
    ↓
MarketsStore._handleData()
    ↓
MarketsStore._quotes[symbol] = snapshot
    ↓
emit('update', symbol, snapshot)
    ↓
webapp 监听器 → applyMarketsQuote(snapshot)
    ↓
统一刷新逻辑
    ├─ updateFavoritesPriceRows() → 行情页自选
    ├─ renderHomeActiveRows() → 首页行情列表
    └─ 交易页实时刷新
        ├─ updateActiveSymbolQuote() → 顶部价格块
        ├─ updateTradeSnapshot() → 快照与统计
        └─ updateTradePriceBlock() → 订单簿中间价格
```

### 关键修改点

#### 1. MarketsStore 事件监听器简化
**位置**: `pages/webapp/webapp.js:4398`

```javascript
// 之前：手动复制到本地缓存，分别调用各页面渲染
window.MarketsStore.on('update', (symbol, quote) => {
  this._marketsLiveQuotes[symbol] = Object.assign(...);
  this.updateFavoritesPriceRows();
  this.renderHomeActiveRows(...);
  this.updateActiveSymbolQuote(...);
});

// 现在：直接调用统一刷新函数
window.MarketsStore.on('update', (symbol, quote) => {
  this.applyMarketsQuote && this.applyMarketsQuote(quote);
});
```

#### 2. applyMarketsQuote 不再维护本地缓存
**位置**: `pages/webapp/webapp.js:5055`

```javascript
// 移除本地缓存更新
// this._marketsLiveQuotes[symbol] = metrics; ❌

// 只保留健康标记
this._marketsLastQuoteAt = metrics.updatedAt;

// 直接传递 metrics 给 UI 更新函数
this.updateActiveSymbolQuote(metrics);
```

#### 3. 所有 UI 渲染直接读 MarketsStore
**位置**: `pages/webapp/webapp.js:1541, 5088`

```javascript
// 首页渲染
renderHomeActiveRows() {
  rows.forEach(row => {
    const symbol = ...;
    // 直接从 MarketsStore 读取
    let base = null;
    if (window.MarketsStore) {
      base = window.MarketsStore.getQuote(symbol);
    }
    const metrics = this.buildQuoteMetrics(symbol, base?.raw, base);
    // ...更新 UI
  });
}

// 行情页自选列表
updateFavoritesPriceRows() {
  rows.forEach(row => {
    const sym = row.dataset.symbol;
    // 直接从 MarketsStore 读取
    let base = null;
    if (window.MarketsStore) {
      base = window.MarketsStore.getQuote(sym);
    }
    const metrics = this.buildQuoteMetrics(sym, base?.raw, base);
    // ...更新 UI
  });
}
```

#### 4. 交易页实时刷新增强
**位置**: `pages/webapp/webapp.js:5068`

```javascript
if (symbol === this._activeSymbol) {
  // 顶部价格块
  this.updateActiveSymbolQuote(metrics);
  
  // 快照缺失或陈旧(>5s)时完整刷新
  if (stale) {
    this.updateTradeSnapshot({...}, { fromTick: true });
  } else {
    // 仅更新价格和涨跌，保留 OHLC
    this.updateTradePriceBlock(metrics.last, metrics.diff, metrics.pct);
    this.updateTradeHeaderChange(metrics.pct);
  }
}
```

### 涨跌计算统一

所有页面涨跌幅计算都通过 `buildQuoteMetrics`，内部逻辑：

1. 优先使用 `MarketsStore.getDailySnapshot(symbol)` 的日级昨收
2. 其次使用 `MarketsStore.getKlineCrossMetrics` 的周期昨收
3. 最后回退到 tick 中的 prev 字段或缓存的 last

确保首页/行情/交易三页面基于**相同的昨收价**计算涨跌。

### 进入交易页的兜底逻辑

**触发点 1**: 点击底部 Trades Tab
```javascript
activateTab('trades') {
  // 500ms 后若 HTTP Candle 未返回，用 MarketsStore 构造快照
  setTimeout(() => {
    this.ensureTradeSnapshotFromStore();
  }, 500);
}
```

**触发点 2**: 切换品种后
```javascript
refreshTradeSymbol(symbol) {
  // HTTP 请求完成后 300ms 再兜底
  setTimeout(() => {
    this.ensureTradeSnapshotFromStore();
  }, 300);
}
```

**兜底函数**: `ensureTradeSnapshotFromStore`
- 检查 `_activeSnapshot` 是否存在且有效
- 若缺失，从 `MarketsStore.getQuote` 构造最小快照
- 调用 `updateTradeSnapshot` 触发 UI 刷新

## 部署验证清单

### 浏览器 Console 检查

```javascript
// 1. MarketsStore 是否就绪
window.MarketsStore.getStatus()
// 预期: { ready: true, subscribed: [...], quoteCount: N }

// 2. 查看某品种缓存
window.MarketsStore.getQuote('XAUUSD')
// 预期: { symbol, last, prev, diff, pct, ... }

// 3. 查看日级快照
window.MarketsStore.getDailySnapshot('XAUUSD')
// 预期: { yesterdayClose, lastPrice, changeAbs, changePct, ... }

// 4. 检查页面是否读取同一数据
// 首页
document.querySelector('.page-home .active-row[data-symbol="XAUUSD"] .price-main').textContent
// 行情页
document.querySelector('#markets-watchlist .active-row[data-symbol="XAUUSD"] .price-main').textContent
// 交易页
document.querySelector('.book-last .last-price').textContent
// 预期: 三处价格完全一致
```

### 数据流验证

1. **WebSocket 推送到达**
   - 打开 Console
   - 订阅某品种（如切到交易页选择 EURUSD）
   - 观察 `[applyMarketsQuote]` 日志
   - 确认首页/行情/交易页价格**同时**更新

2. **HTTP priming 兜底**
   - 断开 WebSocket（或限制网络）
   - 刷新页面
   - 观察 500ms 后交易页是否仍显示价格
   - 确认来自 `ensureTradeSnapshotFromStore`

3. **涨跌幅一致性**
   - 对比首页和交易页同一品种的涨跌幅
   - 都应基于 `getDailySnapshot` 的 `yesterdayClose`
   - 数值应精确匹配（包括小数位）

## 性能优化

### 节流机制
- 首页渲染：200ms 节流避免频繁重绘
- 自选列表：无节流（品种少）
- 交易页：5s 新鲜度检查避免过度刷新 OHLC

### 内存管理
- 移除 `webapp._marketsLiveQuotes` 副本，减少内存占用
- MarketsStore 自动管理 stale 品种（30s 无更新视为陈旧）
- 2 分钟自动重订阅防止数据过期

## 常见问题排查

### 问题：三页面价格仍不一致
**检查**:
1. `window.MarketsStore` 是否存在且 ready？
2. `webapp._storeUpdateBound` 是否为 true？
3. Console 是否有 `applyMarketsQuote` 调用日志？

### 问题：交易页不更新
**检查**:
1. `_activeSymbol` 是否与推送的 symbol 匹配？
2. `_activeSnapshot.updatedAt` 时间戳是否更新？
3. `.book-last .last-price` DOM 节点是否存在？

### 问题：涨跌幅为 0 或 --
**检查**:
1. `getDailySnapshot(symbol).yesterdayClose` 是否有值？
2. `getKlineCrossMetrics(symbol, '1d')` 是否返回昨收？
3. HTTP priming 是否成功获取日 K 线？

## 后续扩展

### 支持更多数据类型
- Depth（深度）：已支持，自动合并
- Kline（K 线）：已支持多周期
- Trades（逐笔）：已支持，可扩展历史回放

### 多页面实例
- 若有多个 iframe 或窗口
- 建议每个实例独立 MarketsStore
- 或通过 SharedWorker 共享 WebSocket

### 离线缓存
- 当前已支持 localStorage 持久化日级快照
- 可扩展为 IndexedDB 存储完整 K 线历史

---

**最后更新**: 2025-11-25  
**负责人**: Copilot  
**版本**: 1.0  
