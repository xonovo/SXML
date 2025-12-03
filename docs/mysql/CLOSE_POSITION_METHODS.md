# 平仓方式说明：手动 vs 自动

## 📊 两种平仓方式对比

| 特性 | 手动平仓 | 自动平仓 |
|------|---------|---------|
| **触发方式** | 用户点击"平仓"按钮 | 系统监控（止损/止盈/爆仓） |
| **接口调用** | I00008 接口 | 系统内部触发 |
| **存储过程** | `i_close_order` | 无（直接更新订单状态） |
| **入账方式** | 触发器自动入账 | `sp_settle_closed_orders` 批量入账 |
| **入账时机** | 实时（毫秒级） | 定时任务（每分钟） |
| **用户体验** | 立即到账 | 略有延迟（最多1分钟） |
| **适用场景** | 用户主动操作 | 风控自动执行 |

---

## 🔄 手动平仓流程

```
用户点击"平仓"
    ↓
前端调用 I00008 接口
    ↓
存储过程 i_close_order
    ↓
UPDATE i_trade_order SET tradeStatus = 2
    ↓
触发器 auto_updated_date_on_i_trade_order 自动执行
    ↓
┌─────────────────────────────────────┐
│ 1. 计算开仓成本（含点差）          │
│ 2. 计算平仓收入                     │
│ 3. 计算净盈亏（扣除利息）           │
│ 4. INSERT INTO i_balance_details    │
│    - detailsType = 1（交易）        │
│    - detailsSubType = 3（平仓卖出） │
│    - income = 本金 + 净盈亏         │
│ 5. UPDATE i_positions（递减仓位）   │
│ 6. INSERT INTO i_details_log        │
└─────────────────────────────────────┘
    ↓
COMMIT 事务
    ↓
✅ 用户余额实时更新
```

### 触发器代码（简化）

```sql
CREATE TRIGGER `auto_updated_date_on_i_trade_order` 
BEFORE UPDATE ON `i_trade_order` 
FOR EACH ROW 
BEGIN
  IF (old.tradeStatus < 2 AND new.tradeStatus = 2) THEN
    -- 计算开仓成本
    SET openCost = (new.openPrice * new.tradeVolume) + new.takeSpread;
    
    -- 计算盈亏
    SET unrealized_Pnl = ...;
    SET netPnl = unrealized_Pnl - IFNULL(new.swap, 0);
    
    -- 立即入账
    INSERT INTO i_balance_details (...) VALUES (
      ...,
      openCost + netPnl,  -- income
      0,                  -- expense
      ...
    );
    
    -- 更新持仓表
    UPDATE i_positions SET totalVolume = totalVolume - new.tradeVolume ...;
  END IF;
END;
```

---

## 🤖 自动平仓流程

```
系统监控（风控引擎）
    ↓
检测到触发条件
    ├─ 止损价触发（stopLoss）
    ├─ 止盈价触发（takeProfit）
    └─ 爆仓风险（强制平仓）
    ↓
直接更新数据库
UPDATE i_trade_order SET 
  tradeStatus = 2,
  currentPrice = <市场价>,
  closedAt = NOW()
WHERE outTradeNo = ...;
    ↓
触发器 auto_updated_date_on_i_trade_order 执行
    ↓
【问题】触发器可能不会触发（如果是批量更新或外部系统）
    ↓
定时任务（每分钟）
    ↓
调用 sp_settle_closed_orders()
    ↓
┌─────────────────────────────────────┐
│ 1. 查找最近5分钟已平仓但未入账订单  │
│ 2. 批量计算每笔订单的入账金额       │
│    - 开仓成本 = (价格×数量) + 点差  │
│    - 净盈亏 = 原始盈亏 - 利息       │
│    - 入账 = 本金 + 净盈亏           │
│ 3. INSERT INTO i_balance_details    │
│    - detailsType = 1                │
│    - detailsSubType = 3（与触发器一致）│
│ 4. UPDATE i_positions（递减仓位）   │
│ 5. 去重检查（避免重复入账）         │
└─────────────────────────────────────┘
    ↓
COMMIT 事务
    ↓
✅ 用户余额更新（最多延迟1分钟）
```

### 存储过程代码（简化）

```sql
CREATE PROCEDURE `sp_settle_closed_orders`()
BEGIN
  START TRANSACTION;
  
  -- 批量入账（与触发器逻辑一致）
  INSERT INTO i_balance_details (...)
  SELECT 
    ...,
    -- income = 本金 + 净盈亏
    (
      ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0))  -- 本金
      +
      CASE WHEN o.direction = 'buy' THEN ... ELSE ... END  -- 原始盈亏
      -
      IFNULL(o.swap, 0)  -- 利息
    ),
    0,  -- expense
    ...
  FROM i_trade_order o
  WHERE o.tradeStatus = 2
    AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    -- 去重：检查是否已入账
    AND NOT EXISTS (
      SELECT 1 FROM i_balance_details 
      WHERE outTradeNo = o.outTradeNo 
        AND detailsSubType = 3
    )
  LIMIT 100;
  
  -- 更新持仓表
  UPDATE i_positions ...;
  
  COMMIT;
END;
```

---

## 🔒 去重保护机制

### 为什么需要去重？

1. **手动平仓**：触发器自动入账（`detailsSubType = 3`）
2. **自动平仓**：定时任务调用 `sp_settle_closed_orders`，也入账（`detailsSubType = 3`）

如果不去重，可能导致：
- 同一笔订单被入账两次
- 用户余额虚增

### 去重逻辑

**存储过程检查**：
```sql
AND NOT EXISTS (
  SELECT 1 FROM i_balance_details 
  WHERE outTradeNo = o.outTradeNo 
    AND detailsSubType = 3  -- 平仓卖出
)
```

**工作原理**：
1. 手动平仓：触发器入账，写入 `detailsSubType = 3`
2. 定时任务运行：检查到该订单已有 `detailsSubType = 3` 记录，跳过
3. 自动平仓：定时任务入账，写入 `detailsSubType = 3`
4. 后续定时任务：检查到已入账，跳过

**结果**：每笔订单只入账一次 ✅

---

## 📈 计算逻辑一致性

### 修复前的问题

**触发器**（修复后）：
```sql
-- 开仓成本 = (开仓价 × 数量) + 总点差
openCost = (openPrice * tradeVolume) + takeSpread;

-- 入账 = 本金 + 净盈亏
income = openCost + netPnl;
```

**存储过程**（修复前）：
```sql
-- ❌ 只计算盈亏，不返还本金
income = CASE WHEN direction = 'buy' 
         THEN (currentPrice - openPrice) * tradeVolume 
         ELSE (openPrice - currentPrice) * tradeVolume END;

-- ❌ takeSpread 重复乘数量
-- 没有处理 takeSpread
```

### 修复后的一致性

**触发器和存储过程都使用相同逻辑**：

```sql
-- 1. 开仓成本（修正：takeSpread 已是总额）
openCost = (openPrice * tradeVolume) + takeSpread;

-- 2. 平仓收入
revenue = currentPrice * tradeVolume;

-- 3. 原始盈亏（区分做多/做空）
rawPnl = CASE 
  WHEN direction = 'buy' THEN revenue - openCost
  ELSE openCost - revenue
END;

-- 4. 净盈亏（扣除利息）
netPnl = rawPnl - swap;

-- 5. 入账金额
income = openCost + netPnl;  -- 返还本金 + 盈亏
```

---

## 🚀 部署和配置

### 1. 部署修复脚本

```bash
# 修复触发器 + 存储过程
mysql -u root -p ice_markets < docs/mysql/migrations/2025-12-02-fix-takespread-calculation.sql
```

### 2. 配置定时任务

#### Node.js (推荐)

```javascript
const cron = require('node-cron');
const db = require('./db');

// 每分钟执行一次
cron.schedule('*/1 * * * *', async () => {
  try {
    const result = await db.query('CALL sp_settle_closed_orders()');
    const count = result[0][0].processed_count;
    
    if (count > 0) {
      console.log(`[Settlement] Processed ${count} auto-closed orders`);
    }
  } catch (error) {
    console.error('[Settlement] Error:', error);
  }
});

console.log('[Settlement] Cron job started (every 1 minute)');
```

#### MySQL Event Scheduler

```sql
-- 启用事件调度器
SET GLOBAL event_scheduler = ON;

-- 创建定时事件
CREATE EVENT IF NOT EXISTS evt_settle_closed_orders
ON SCHEDULE EVERY 1 MINUTE
DO CALL sp_settle_closed_orders();

-- 验证
SHOW EVENTS WHERE Name = 'evt_settle_closed_orders';
```

#### Linux Crontab

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每分钟执行）
*/1 * * * * mysql -u root -pYOUR_PASSWORD ice_markets -e "CALL sp_settle_closed_orders();" >> /var/log/settlement.log 2>&1
```

### 3. 验证部署

```sql
-- 检查触发器
SHOW CREATE TRIGGER auto_updated_date_on_i_trade_order;

-- 检查存储过程
SHOW CREATE PROCEDURE sp_settle_closed_orders;

-- 测试手动平仓
CALL i_close_order('TEST_USER', 'POS_ID', 'XAUUSD', 0, 'buy', 4211.73, 2);

-- 检查余额
SELECT * FROM i_balance_details 
WHERE userAccount = 'TEST_USER' 
  AND detailsSubType = 3 
ORDER BY createdDate DESC 
LIMIT 1;
```

---

## ⚠️ 监控建议

### 关键指标

1. **入账延迟**
   ```sql
   -- 查询已平仓但未入账的订单
   SELECT COUNT(*) AS pending_count
   FROM i_trade_order o
   WHERE o.tradeStatus = 2
     AND o.closedAt IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM i_balance_details 
       WHERE outTradeNo = o.outTradeNo 
         AND detailsSubType = 3
     );
   ```

2. **定时任务执行**
   ```javascript
   // 记录执行日志
   console.log('[Settlement]', new Date(), 'Processed:', count);
   ```

3. **重复入账检测**
   ```sql
   -- 检查是否有重复入账
   SELECT outTradeNo, COUNT(*) AS dup_count
   FROM i_balance_details
   WHERE detailsSubType = 3
   GROUP BY outTradeNo
   HAVING COUNT(*) > 1;
   ```

---

## ✅ 总结

| 对比项 | 手动平仓 | 自动平仓 |
|-------|---------|---------|
| **实现方式** | 触发器 | 定时任务 + 存储过程 |
| **优势** | 实时到账、用户体验好 | 批量处理、性能高 |
| **适用场景** | 用户主动操作 | 风控自动执行 |
| **计算逻辑** | ✅ 正确（已修复） | ✅ 正确（已修复） |
| **去重保护** | ✅ detailsSubType = 3 | ✅ 检查已入账 |
| **数据一致性** | ✅ 事务保证 | ✅ 事务保证 |

**核心要点**：
- 两种方式使用**相同的计算逻辑**
- 通过 `detailsSubType = 3` 实现**去重保护**
- 修复后的 `takeSpread` 计算**完全一致**
- 定时任务是**兜底机制**，确保自动平仓也能正常入账

---

**文档日期**：2025-12-02  
**版本**：v2.0（修正版）
