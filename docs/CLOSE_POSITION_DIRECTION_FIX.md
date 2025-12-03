# 聚合持仓按方向平仓完整解决方案

## 🎯 核心问题

### 问题描述
**聚合持仓架构**中，一个品种+方向的所有订单聚合为一张卡片：
- 前端：显示一张 `XAUUSD 做多` 卡片（totalVolume=300）
- 后端：可能对应 3 个订单（ORD001=100, ORD002=150, ORD003=50）

**用户点击卡片的 "Close" 按钮时**：
- ❓ **应该平仓哪些 `outTradeNo`？**
- ❓ **如何区分做多和做空的持仓？**

### 核心难点
如果不传递方向信息，批量平仓会把**同品种的做多和做空都平掉**！

---

## ✅ 解决方案

### 方案架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端（webapp.js）                                          │
├─────────────────────────────────────────────────────────────┤
│  1. 聚合持仓卡片显示：XAUUSD 做多 (totalVolume=300)        │
│  2. 用户点击 Close 按钮                                     │
│  3. 读取 card.dataset.direction → 'buy'                    │
│  4. 构造 I00008 请求：                                      │
│     {                                                        │
│       userAccount: 'ICE00000001',                           │
│       outTradeNo: null,  // ← 批量平仓                     │
│       itemId: 'XAUUSD',  // ← 按品种匹配                   │
│       direction: 'buy',  // ← 按方向过滤                   │
│       currentPrice: 1850.00,                                │
│       tradeStatus: 2                                        │
│     }                                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  后端（i_close_order 存储过程）                             │
├─────────────────────────────────────────────────────────────┤
│  IF (outTradeNo IS NULL) THEN                               │
│    -- 批量平仓：按 (userAccount, itemId, direction) 匹配   │
│    UPDATE i_trade_order SET                                 │
│      tradeStatus = 2,                                       │
│      currentPrice = 1850.00                                 │
│    WHERE userAccount = 'ICE00000001'                        │
│      AND itemId = 'XAUUSD'                                  │
│      AND direction = 'buy'   ← 关键：方向过滤              │
│      AND tradeStatus = 1;                                   │
│  END IF;                                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  触发器（auto_updated_date_on_i_trade_order）               │
├─────────────────────────────────────────────────────────────┤
│  FOR EACH ROW (每个被 UPDATE 的订单)                        │
│    IF (NEW.tradeStatus = 2) THEN                            │
│      1. 计算盈亏（扣除成本和利息）                          │
│      2. 入账余额明细                                        │
│      3. 更新聚合持仓（递减 totalVolume）                   │
│      4. 杠杆账户自动还款                                    │
│    END IF;                                                  │
│  END FOR;                                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  结果                                                        │
├─────────────────────────────────────────────────────────────┤
│  i_trade_order:                                             │
│    ORD001: tradeStatus=2, closedAt=NOW() (买单已平)        │
│    ORD002: tradeStatus=2, closedAt=NOW() (买单已平)        │
│    ORD003: tradeStatus=2, closedAt=NOW() (买单已平)        │
│    ORD004: tradeStatus=1 (卖单仍持仓) ← 未受影响           │
│                                                              │
│  i_positions:                                               │
│    pId=POS001 (买): totalVolume=300-300=0 (自动隐藏)       │
│    pId=POS002 (卖): totalVolume=150 (继续显示)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 实现细节

### 1. 前端改动（webapp.js）

#### 1.1 `closePosition()` 方法

**关键改动**：
1. 获取 `direction` 信息（从 `card.dataset.direction` 或 `btn.dataset.direction`）
2. 传递 `outTradeNo: null` 表示批量平仓
3. 传递 `direction` 参数到后端

```javascript
// 获取方向信息（从卡片的 dataset 中读取）
let direction = btn.dataset.direction;
if (!direction) {
  const card = btn.closest('.position-card');
  if (card && card.dataset && card.dataset.direction) {
    direction = card.dataset.direction;
  }
}

// 构造请求参数
const params = {
  userAccount,
  outTradeNo: null,  // ✅ 批量平仓
  itemId: symbol,    // ✅ 按品种匹配
  direction: direction || 'buy',  // ✅ 按方向过滤
  currentPrice: currentPrice,
  tradeStatus: 2
};
```

#### 1.2 `buildPositionCard()` 方法

**关键改动**：
1. 卡片头部 Close 按钮添加 `dataset.direction`
2. 卡片底部 Close 按钮添加 `dataset.direction`

```javascript
// 卡片头部按钮
closeCardBtn.dataset.direction = direction;  // 传递方向信息

// 卡片底部按钮
if (direction) closeBtn.dataset.direction = direction;
```

---

### 2. 后端改动

#### 2.1 接口配置（interface 表）

```sql
UPDATE `interface` 
SET 
  interfaceCallSql = 'call i_close_order(#{userAccount},#{outTradeNo},#{itemId},#{direction},#{currentPrice},#{tradeStatus});',
  interfaceName = '平仓(关闭仓位-聚合持仓模式)',
  interfaceParamName = 'userAccount,outTradeNo,itemId,direction,currentPrice,tradeStatus'
WHERE interfaceNo = 'I00008';
```

**改动说明**：
- 添加 `#{direction}` 参数
- 参数列表：`userAccount,outTradeNo,itemId,direction,currentPrice,tradeStatus`（共 6 个）

---

#### 2.2 存储过程（i_close_order）

```sql
CREATE PROCEDURE `i_close_order`(
  IN user_Account VARCHAR(255),
  IN out_TradeNo VARCHAR(255),  -- 如果为 NULL，则批量平仓
  IN item_Id VARCHAR(255),       -- 选择金融产品
  IN direction_Val VARCHAR(10),  -- 新增：方向过滤（'buy' 或 'sell'）
  IN current_Price DECIMAL(20,8), -- 平仓价格
  IN trade_Status INT             -- 订单状态：2=已平仓
)
BEGIN
  IF (out_TradeNo IS NULL) THEN
    -- 批量平仓：按 (userAccount, itemId, direction) 匹配
    UPDATE i_trade_order SET
      currentPrice = current_Price,
      tradeStatus = trade_Status
    WHERE deleted = 0 
      AND userAccount = user_Account 
      AND tradeStatus < 2  -- 只平仓持仓中的订单
      AND itemId = item_Id
      AND (direction_Val IS NULL OR direction = direction_Val);  -- ✅ 按方向过滤
  ELSE
    -- 单个平仓：按 outTradeNo 匹配
    UPDATE i_trade_order SET
      currentPrice = current_Price,
      tradeStatus = trade_Status
    WHERE deleted = 0 
      AND userAccount = user_Account 
      AND outTradeNo = out_TradeNo;
  END IF;
END;
```

**关键逻辑**：
- `direction_Val IS NULL`：兼容旧接口调用（不传 direction 参数）
- `direction = direction_Val`：按方向精确匹配，区分做多和做空

---

#### 2.3 触发器（auto_updated_date_on_i_trade_order）

**触发器无需改动**，保持原有逻辑：

```sql
IF (old.tradeStatus < 2 AND new.tradeStatus = 2) THEN
  -- 1. 计算盈亏
  -- 2. 入账余额明细
  -- 3. 更新聚合持仓（递减 totalVolume）
  UPDATE i_positions SET
    totalVolume = totalVolume - new.tradeVolume,
    updatedAt = CURRENT_TIMESTAMP
  WHERE deleted = 0 
    AND userAccount = new.userAccount
    AND aggItemId = new.itemId
    AND aggDirection = new.direction  -- ✅ 自动按方向匹配
    AND totalVolume > 0;
  -- 4. 杠杆账户自动还款
END IF;
```

**说明**：
- 触发器按 `(userAccount, aggItemId, aggDirection)` 匹配聚合持仓
- `new.direction` 自动获取订单的方向信息
- 无需额外传参，自动支持按方向分组

---

## 📊 场景测试

### 场景 1：用户同时持有做多和做空

**初始状态**：
```
i_positions:
  pId=POS001, aggItemId=XAUUSD, aggDirection='buy',  totalVolume=300
  pId=POS002, aggItemId=XAUUSD, aggDirection='sell', totalVolume=150

i_trade_order:
  ORD001: itemId=XAUUSD, direction='buy',  volume=100, tradeStatus=1
  ORD002: itemId=XAUUSD, direction='buy',  volume=150, tradeStatus=1
  ORD003: itemId=XAUUSD, direction='buy',  volume=50,  tradeStatus=1
  ORD004: itemId=XAUUSD, direction='sell', volume=100, tradeStatus=1
  ORD005: itemId=XAUUSD, direction='sell', volume=50,  tradeStatus=1
```

**用户操作**：点击 "XAUUSD 做多" 卡片的 Close 按钮

**前端请求**：
```javascript
{
  userAccount: 'ICE00000001',
  outTradeNo: null,
  itemId: 'XAUUSD',
  direction: 'buy',  // ← 关键
  currentPrice: 1850.00,
  tradeStatus: 2
}
```

**存储过程执行**：
```sql
UPDATE i_trade_order SET
  currentPrice = 1850.00,
  tradeStatus = 2
WHERE userAccount = 'ICE00000001'
  AND itemId = 'XAUUSD'
  AND direction = 'buy'  -- ← 只匹配做多订单
  AND tradeStatus = 1;
```

**触发器执行**（3 次，每个订单一次）：
```sql
-- ORD001 平仓
UPDATE i_positions SET totalVolume = 300 - 100 = 200
WHERE aggItemId='XAUUSD' AND aggDirection='buy';

-- ORD002 平仓
UPDATE i_positions SET totalVolume = 200 - 150 = 50
WHERE aggItemId='XAUUSD' AND aggDirection='buy';

-- ORD003 平仓
UPDATE i_positions SET totalVolume = 50 - 50 = 0
WHERE aggItemId='XAUUSD' AND aggDirection='buy';
```

**最终结果**：
```
i_positions:
  pId=POS001 (买): totalVolume=0  ← 自动隐藏（WHERE totalVolume > 0 过滤）
  pId=POS002 (卖): totalVolume=150  ← 未受影响，继续显示

i_trade_order:
  ORD001: tradeStatus=2, closedAt=NOW() ✅
  ORD002: tradeStatus=2, closedAt=NOW() ✅
  ORD003: tradeStatus=2, closedAt=NOW() ✅
  ORD004: tradeStatus=1  ← 卖单仍持仓 ✅
  ORD005: tradeStatus=1  ← 卖单仍持仓 ✅
```

**前端效果**：
- "XAUUSD 做多" 卡片消失（totalVolume=0）
- "XAUUSD 做空" 卡片继续显示（totalVolume=150）

---

### 场景 2：Close All（列表级别批量平仓）

**初始状态**：同场景 1

**用户操作**：点击 "Close All" 按钮（位于列表顶部）

**前端逻辑**：
```javascript
// closeAllPositions() 方法遍历所有持仓卡片
const cards = container.querySelectorAll('.position-card');
cards.forEach(card => {
  const symbol = card.dataset.symbol || card.querySelector('.pos-symbol')?.textContent;
  const direction = card.dataset.direction;  // ✅ 获取方向
  const currentPrice = getCurrentPrice(symbol);
  
  positions.push({
    userAccount,
    outTradeNo: null,  // 批量平仓
    itemId: symbol,
    direction: direction,  // ✅ 传递方向
    currentPrice,
    tradeStatus: 2
  });
});

// 并发调用 I00008
Promise.allSettled(positions.map(pos => superAPI.request('I00008', pos)));
```

**存储过程执行**（2 次请求）：
```sql
-- 请求 1：平仓做多
UPDATE i_trade_order SET tradeStatus=2
WHERE userAccount='ICE00000001' AND itemId='XAUUSD' AND direction='buy';

-- 请求 2：平仓做空
UPDATE i_trade_order SET tradeStatus=2
WHERE userAccount='ICE00000001' AND itemId='XAUUSD' AND direction='sell';
```

**最终结果**：
- 所有 XAUUSD 订单（做多+做空）全部平仓
- 两张聚合持仓卡片都消失（totalVolume=0）

---

## ⚠️ 注意事项

### 1. 兼容性处理

**问题**：旧接口调用可能不传 `direction` 参数

**解决**：存储过程中使用 `direction_Val IS NULL OR direction = direction_Val`
```sql
AND (direction_Val IS NULL OR direction = direction_Val)
```
- 如果不传 `direction`（NULL），则不过滤方向（平仓所有方向）
- 如果传 `direction`（'buy'/'sell'），则精确匹配

### 2. 前端降级方案

**问题**：如果无法获取 `direction` 信息怎么办？

**解决**：默认值为 `'buy'`，并在确认对话框中明确提示
```javascript
direction: direction || 'buy',  // 默认做多

const confirmMsg = lang === 'zh-CN' 
  ? `确认平仓所有 ${symbol} ${directionLabel} 持仓？` 
  : `Confirm closing all ${symbol} ${directionLabel} positions?`;
```

### 3. 触发器性能优化

**问题**：批量平仓时触发器会执行多次

**优化**：
- 触发器按 `FOR EACH ROW` 执行，无法避免
- 但聚合持仓更新使用增量递减（`totalVolume = totalVolume - volume`）
- 利用 MySQL 的行级锁保证并发安全

---

## 📋 部署清单

### 前端部署
- [x] 修改 `closePosition()` 方法（获取 direction，传递参数）
- [x] 修改 `buildPositionCard()` 方法（设置 dataset.direction）
- [x] 修改 `closeAllPositions()` 方法（遍历时读取 direction）
- [ ] 测试：点击单个持仓卡片 Close 按钮
- [ ] 测试：点击 Close All 按钮
- [ ] 验证：做多和做空分别平仓不互相影响

### 后端部署
- [x] 更新 `interface` 表配置（添加 direction 参数）
- [x] 更新 `i_close_order` 存储过程（添加 direction_Val 参数）
- [x] 修复触发器（盈亏计算 + 聚合持仓递减）
- [ ] 执行 SQL 脚本：`SOURCE trigger_fix_close_order.sql`
- [ ] 验证接口配置：`SELECT * FROM interface WHERE interfaceNo='I00008'`
- [ ] 验证存储过程：`SHOW CREATE PROCEDURE i_close_order`
- [ ] 测试批量平仓：模拟多订单场景

---

## 🎓 技术总结

### 关键设计决策

1. **outTradeNo=NULL 表示批量平仓**
   - 优势：前后端统一逻辑，无需新增接口
   - 劣势：需要额外参数（itemId, direction）过滤

2. **direction 参数必须传递**
   - 原因：聚合持仓按方向分组，必须区分做多和做空
   - 影响：接口签名变更（5 个参数 → 6 个参数）

3. **触发器自动处理聚合持仓**
   - 优势：业务逻辑集中，前端无需关心聚合逻辑
   - 劣势：调试困难，错误排查复杂

4. **totalVolume=0 自动隐藏**
   - 优势：前端查询自动过滤（`WHERE totalVolume > 0`）
   - 劣势：历史数据保留在数据库（空间占用）

---

**文档版本**：v1.2.0  
**更新日期**：2025-01-29  
**作者**：AI Assistant  
**适用范围**：聚合持仓架构 + 按方向分组平仓
