# 聚合持仓表平仓逻辑修复说明

## 🔍 问题分析

### 原始触发器的持仓表更新逻辑（ice_markets.sql 第 1853-1856 行）

```sql
UPDATE i_positions SET
  unrealizedPnl = unrealized_Pnl,
  deleted = 1
WHERE deleted = 0 AND outTradeNo = new.outTradeNo;
```

### ❌ 问题：

1. **字段不匹配**：新聚合持仓表没有 `unrealizedPnl` 字段
2. **查询条件错误**：聚合表按 `(userAccount, aggItemId, aggDirection)` 匹配，不是 `outTradeNo`
3. **逻辑错误**：聚合持仓应该**递减 `totalVolume`**，而不是删除记录
4. **完全平仓判断缺失**：当 `totalVolume` 递减到 0 时，持仓卡片应自动隐藏

---

## ✅ 新聚合持仓表结构

根据 `docs/POSITION_FIELDS_FIX.md` 和 `sp_optimization.sql`，新表字段如下：

```sql
CREATE TABLE `i_positions` (
  `pId` VARCHAR(255) PRIMARY KEY COMMENT '聚合持仓ID（唯一）',
  `userAccount` VARCHAR(255) NOT NULL,
  `aggDirection` ENUM('buy','sell') NOT NULL COMMENT '聚合方向',
  `aggItemId` VARCHAR(255) NOT NULL COMMENT '聚合品种代码',
  
  -- 核心聚合字段
  `totalVolume` DECIMAL(20,8) NOT NULL DEFAULT 0 COMMENT '总持仓量（累计补仓）',
  `avgOpenPrice` DECIMAL(20,8) NOT NULL DEFAULT 0 COMMENT '加权平均开仓价',
  `takeSpread` DECIMAL(20,8) NOT NULL DEFAULT 0 COMMENT '加权平均点差',
  `totalLiability` DECIMAL(20,8) NOT NULL DEFAULT 0 COMMENT '总负债',
  `interestAccrued` DECIMAL(20,8) NOT NULL DEFAULT 0 COMMENT '累计利息',
  
  -- 继承字段
  `stopLoss` DECIMAL(20,8) NULL COMMENT '止损价位',
  `takeProfit` DECIMAL(20,8) NULL COMMENT '止盈价位',
  `swap` DECIMAL(20,8) NOT NULL DEFAULT 0 COMMENT 'swap值',
  `tradeRate` DECIMAL(10,4) NOT NULL DEFAULT 1.00 COMMENT '交易倍率',
  
  -- 时间戳
  `openedAt` TIMESTAMP NOT NULL COMMENT '首次开仓时间',
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后更新时间',
  
  UNIQUE KEY `uk_user_item_direction` (`userAccount`, `aggItemId`, `aggDirection`, `deleted`)
);
```

---

## 🎯 关键特性

### 1. 聚合持仓：一个品种+方向 = 一条记录

**示例**：
```
用户 ICE00000001 的 XAUUSD 持仓：
- 做多 XAUUSD：pId=POS001, aggDirection='buy', totalVolume=300
- 做空 XAUUSD：pId=POS002, aggDirection='sell', totalVolume=150
```

**不是**：
```
❌ 错误理解：每个订单一条持仓记录
  - outTradeNo=ORD001, volume=100
  - outTradeNo=ORD002, volume=200
```

### 2. 开仓时累加 `totalVolume`

```sql
-- i_create_order 存储过程（sp_optimization.sql 第 253-280 行）
SET new_totalVolume = cur_totalVolume + trade_Volume;
SET new_avgOpenPrice = ((cur_avgOpenPrice * cur_totalVolume) + (open_Price * trade_Volume)) / new_totalVolume;

UPDATE i_positions
  SET totalVolume = new_totalVolume,
      avgOpenPrice = new_avgOpenPrice,
      updatedAt = NOW()
WHERE pId = p_Id;
```

### 3. 平仓时递减 `totalVolume`

```sql
-- sp_optimization.sql 第 454-467 行（监控存储过程中的逻辑）
UPDATE i_positions p
JOIN (
  SELECT positionId AS pid, SUM(tradeVolume) AS closedVolume
  FROM i_trade_order
  WHERE deleted = 0 AND tradeStatus = 2 AND itemId = p_symbol AND closedAt IS NOT NULL
  GROUP BY positionId
) c ON c.pid = p.pId
SET p.totalVolume = GREATEST(p.totalVolume - c.closedVolume, 0),
    p.updatedAt = NOW()
WHERE p.deleted = 0;
```

### 4. 自动隐藏空仓

```sql
-- i_get_orderinfo 存储过程（sp_optimization.sql 第 102 行）
WHERE deleted=0 
  AND userAccount = user_Account 
  AND aggItemId = item_Id 
  AND totalVolume > 0  -- ✅ 关键：totalVolume = 0 时自动隐藏
```

---

## 🔧 触发器修复方案

### 修复前（原始代码 - 错误）

```sql
UPDATE i_positions SET
  unrealizedPnl = unrealized_Pnl,  -- ❌ 字段不存在
  deleted = 1                       -- ❌ 不应删除，应递减
WHERE deleted = 0 AND outTradeNo = new.outTradeNo;  -- ❌ 查询条件错误
```

### 修复后（正确逻辑）

```sql
-- 更新聚合持仓表（递减仓位）
UPDATE i_positions SET
  totalVolume = totalVolume - new.tradeVolume,  -- ✅ 递减持仓量
  updatedAt = CURRENT_TIMESTAMP                  -- ✅ 更新时间
WHERE deleted = 0 
  AND userAccount = new.userAccount              -- ✅ 按用户匹配
  AND aggItemId = new.itemId                     -- ✅ 按品种匹配
  AND aggDirection = new.direction               -- ✅ 按方向匹配
  AND totalVolume > 0;                           -- ✅ 防止负数
```

---

## 📊 场景测试

### 场景 1：部分平仓（持仓递减）

**初始状态**：
```
i_positions:
  pId=POS001, userAccount=ICE00000001, aggItemId=XAUUSD, 
  aggDirection='buy', totalVolume=300, avgOpenPrice=1800

i_trade_order:
  outTradeNo=ORD001, itemId=XAUUSD, direction='buy', 
  tradeVolume=100, tradeStatus=1 (持仓中)
```

**执行平仓**：
```sql
UPDATE i_trade_order 
SET tradeStatus = 2, currentPrice = 1850
WHERE outTradeNo = 'ORD001';
```

**触发器执行后**：
```
i_positions:
  totalVolume = 300 - 100 = 200  ✅ 递减成功
  updatedAt = NOW()               ✅ 时间已更新

i_trade_order:
  tradeStatus = 2                 ✅ 已平仓
  closedAt = NOW()                ✅ 平仓时间已记录
```

**前端效果**：
- 持仓卡片继续显示（因为 `totalVolume = 200 > 0`）
- 显示剩余持仓量 200 单位

---

### 场景 2：完全平仓（持仓自动隐藏）

**初始状态**：
```
i_positions:
  totalVolume=100, avgOpenPrice=1800

i_trade_order:
  outTradeNo=ORD002, tradeVolume=100, tradeStatus=1
```

**执行平仓**：
```sql
UPDATE i_trade_order 
SET tradeStatus = 2, currentPrice = 1850
WHERE outTradeNo = 'ORD002';
```

**触发器执行后**：
```
i_positions:
  totalVolume = 100 - 100 = 0  ✅ 完全平仓
  updatedAt = NOW()

i_trade_order:
  tradeStatus = 2, closedAt = NOW()
```

**前端效果**：
- 持仓卡片**自动隐藏**（`i_get_orderinfo` 查询时 `WHERE totalVolume > 0` 过滤掉）
- 用户界面不再显示该品种的持仓

---

### 场景 3：多次补仓后分批平仓

**操作序列**：
```
1. 开仓 100 单位 @ 1800 → totalVolume=100, avgOpenPrice=1800
2. 补仓  50 单位 @ 1820 → totalVolume=150, avgOpenPrice=1806.67
3. 补仓  50 单位 @ 1810 → totalVolume=200, avgOpenPrice=1808.33
4. 平仓  80 单位 @ 1850 → totalVolume=120, avgOpenPrice=1808.33 (均价不变)
5. 平仓  60 单位 @ 1840 → totalVolume=60,  avgOpenPrice=1808.33
6. 平仓  60 单位 @ 1830 → totalVolume=0,   自动隐藏
```

**注意**：
- 平仓时**不改变 `avgOpenPrice`**（保持加权平均开仓价）
- 仅递减 `totalVolume`
- 最后一次平仓后 `totalVolume=0`，前端自动隐藏

---

## 🆚 对比：旧表 vs 新表

| 维度 | 旧持仓表（逐订单） | 新聚合持仓表 |
|------|-------------------|-------------|
| **表名** | `i_positions` | `i_positions`（重用表名） |
| **主键** | `pId`（每订单一条） | `pId`（每品种+方向一条） |
| **查询条件** | `outTradeNo` | `(userAccount, aggItemId, aggDirection)` |
| **平仓操作** | `deleted = 1`（软删除） | `totalVolume -= volume`（递减） |
| **空仓处理** | 标记 `deleted=1` | `totalVolume=0` 自动隐藏 |
| **盈亏字段** | `unrealizedPnl` | **无此字段**（实时计算） |
| **优势** | 简单直观 | 性能优化，前端显示友好 |
| **劣势** | 数据冗余，补仓显示混乱 | 逻辑复杂，需维护聚合 |

---

## ⚠️ 注意事项

### 1. 触发器中**不要使用 `outTradeNo` 查询聚合持仓**

```sql
-- ❌ 错误写法
WHERE outTradeNo = new.outTradeNo

-- ✅ 正确写法
WHERE userAccount = new.userAccount
  AND aggItemId = new.itemId
  AND aggDirection = new.direction
```

### 2. 防止 `totalVolume` 变为负数

```sql
-- ✅ 使用 WHERE 条件防止负数
WHERE totalVolume > 0

-- 或使用 GREATEST 函数
SET totalVolume = GREATEST(totalVolume - new.tradeVolume, 0)
```

### 3. 完全平仓后不删除记录

- 新表设计中，`totalVolume=0` 的记录**仍然保留**在数据库
- 前端通过 `WHERE totalVolume > 0` 查询时自动过滤
- 保留历史记录便于审计和统计

### 4. `positionId` 字段关联

如果 `i_trade_order` 表有 `positionId` 字段（关联聚合持仓的 `pId`），应优先使用：

```sql
-- 优先方案（如果有 positionId 字段）
UPDATE i_positions SET
  totalVolume = totalVolume - new.tradeVolume,
  updatedAt = CURRENT_TIMESTAMP
WHERE pId = new.positionId
  AND totalVolume > 0;

-- 备用方案（如果没有 positionId 字段）
UPDATE i_positions SET
  totalVolume = totalVolume - new.tradeVolume,
  updatedAt = CURRENT_TIMESTAMP
WHERE deleted = 0 
  AND userAccount = new.userAccount
  AND aggItemId = new.itemId
  AND aggDirection = new.direction
  AND totalVolume > 0;
```

---

## 📋 部署检查清单

- [ ] 检查 `i_trade_order` 表是否有 `positionId` 字段
- [ ] 确认 `i_positions` 表已添加 `swap` 和 `tradeRate` 字段
- [ ] 确认 `i_positions` 表有唯一索引：`(userAccount, aggItemId, aggDirection, deleted)`
- [ ] 备份现有触发器：`SHOW CREATE TRIGGER auto_updated_date_on_i_trade_order`
- [ ] 执行修复脚本：`SOURCE trigger_fix_close_order.sql`
- [ ] 验证触发器创建：`SELECT * FROM information_schema.TRIGGERS WHERE TRIGGER_NAME = 'auto_updated_date_on_i_trade_order'`
- [ ] 测试部分平仓场景（`totalVolume` 正确递减）
- [ ] 测试完全平仓场景（前端卡片自动隐藏）
- [ ] 验证余额计算准确性（开仓成本 + 盈亏）

---

## 🎓 总结

### 原始触发器问题

- ❌ 使用旧表结构字段（`unrealizedPnl`, `outTradeNo`）
- ❌ 平仓时删除持仓记录（`deleted=1`）
- ❌ 不适配新的聚合持仓表架构

### 修复后逻辑

- ✅ 正确递减 `totalVolume`（保持 `avgOpenPrice` 不变）
- ✅ 按 `(userAccount, aggItemId, aggDirection)` 匹配聚合持仓
- ✅ `totalVolume=0` 时自动隐藏（前端查询过滤）
- ✅ 保留历史记录（不删除，仅递减到 0）

### 与其他逻辑的一致性

- 开仓累加逻辑：`i_create_order` 存储过程
- 平仓递减逻辑：触发器 `auto_updated_date_on_i_trade_order`
- 监控平仓逻辑：`sp_optimization.sql` 中的自动平仓流程
- 前端查询逻辑：`i_get_orderinfo` 存储过程（`WHERE totalVolume > 0`）

所有模块逻辑统一，确保数据一致性！

---

**文档版本**：v1.1.0  
**更新日期**：2025-01-29  
**作者**：AI Assistant
