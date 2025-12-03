# 平仓后余额不返还问题修复

## 🚨 问题描述

**现象**：用户点击"平仓"后，持仓消失，但**可用余额没有增加**。

### 测试数据
- **平仓前**：可用余额 14776.4800 USDT，持仓 1 XAU
- **平仓后**：可用余额 14776.4800 USDT（未变化），持仓 0 XAU
- **预期**：余额应增加 = 本金（开仓成本）+ 盈亏（-11.785 USD）

---

## 🔍 根本原因

### 触发器中的问题代码

**文件**：`trigger_fix_close_order.sql` 第73-76行

```sql
-- ========================================
-- 3️⃣ 入账余额明细
-- ========================================
-- 改为由异步过程 sp_settle_closed_orders 统一处理，避免重复入账与长事务
-- 此处不再直接向 i_balance_details 写入记录
```

### 问题分析

1. **触发器不入账**：平仓触发器只更新持仓状态和记录日志，**不写入余额明细表**
2. **依赖异步结算**：注释说"由异步过程 `sp_settle_closed_orders` 统一处理"
3. **异步未执行**：如果定时任务没有运行，用户余额**永远不会更新**！

### 设计缺陷

```
用户点击平仓
    ↓
✅ 持仓状态更新（触发器）
✅ 日志记录（触发器）
❌ 余额入账（等待异步）
    ↓
需要定时任务调用 sp_settle_closed_orders
    ↓
❌ 如果定时任务未部署/停止，余额永远不更新！
```

---

## ✅ 解决方案

### 修复策略

**在触发器中立即入账**，不依赖异步结算。

### 修复后的代码

```sql
-- 2.4 扣除利息（杠杆账户持仓会产生利息）
SET netPnl = unrealized_Pnl - IFNULL(new.swap, 0);

-- ========================================
-- 3️⃣ 入账余额明细（平仓收入）
-- ========================================
-- 平仓后立即入账，确保用户余额实时更新
INSERT INTO i_balance_details (
  detailsId,
  userAccount,
  detailsWalletType,
  detailsType,
  detailsSubType,
  income,
  expense,
  outTradeNo,
  detailsRemarks,
  createdDate
) VALUES (
  getGenerateId('i_balance_details'),
  new.userAccount,
  new.detailsWalletType,
  1,  -- detailsType: 1=交易
  3,  -- detailsSubType: 3=平仓卖出
  openCost + netPnl,  -- income: 返还本金 + 净盈亏
  0,  -- expense: 0
  new.outTradeNo,
  CONCAT('平仓收入: 本金', openCost, ' + 盈亏', netPnl),
  CURRENT_TIMESTAMP
);
```

### 入账逻辑

| 字段 | 值 | 说明 |
|------|-----|------|
| `income` | `openCost + netPnl` | 返还本金 + 净盈亏 |
| `expense` | `0` | 平仓不扣款 |
| `detailsType` | `1` | 交易类型 |
| `detailsSubType` | `3` | 平仓卖出 |
| `detailsRemarks` | `平仓收入: 本金XXX + 盈亏XXX` | 清晰说明 |

---

## 🔢 计算示例

### 测试数据（从截图）

- **开仓价**：4223.52 USD
- **指数价**：4211.73 USD（平仓时）
- **数量**：1 XAU
- **点差费**：0 USD（截图显示）
- **盈亏**：-11.785 USD（做多亏损）

### 计算过程

```sql
-- 1. 开仓成本
openCost = (4223.52 * 1) + 0 = 4223.52 USD

-- 2. 平仓收入
totalAmount = 4211.73 * 1 = 4211.73 USD

-- 3. 原始盈亏（做多）
unrealized_Pnl = 4211.73 - 4223.52 = -11.79 USD

-- 4. 净盈亏（扣除利息，假设利息=0）
netPnl = -11.79 - 0 = -11.79 USD

-- 5. 入账金额
income = 4223.52 + (-11.79) = 4211.73 USD
```

### 余额变化

```
平仓前余额：14776.4800 USDT
返还金额：  +4211.73 USDT
平仓后余额：18988.21 USDT ✅
```

---

## 🚀 部署步骤

### 1. 备份数据库

```bash
mysqldump -u root -p ice_markets i_trade_order i_balance_details i_positions > backup_before_fix.sql
```

### 2. 应用修复脚本

```bash
mysql -u root -p ice_markets < docs/mysql/migrations/2025-12-02-fix-takespread-calculation.sql
```

或应用完整最新版本：

```bash
mysql -u root -p < docs/mysql/apply_latest.sql
```

### 3. 验证触发器

```sql
-- 检查触发器是否包含入账逻辑
SHOW CREATE TRIGGER auto_updated_date_on_i_trade_order;

-- 应该看到 INSERT INTO i_balance_details 语句
```

### 4. 测试验证

#### 测试步骤

1. **查询平仓前余额**
   ```sql
   SELECT SUM(income - expense) AS balance
   FROM i_balance_details
   WHERE userAccount = 'YOUR_USER_ACCOUNT'
     AND detailsWalletType = 0;  -- 0=现金，1=杠杆
   ```

2. **执行平仓**
   ```sql
   CALL i_close_order(
       'YOUR_USER_ACCOUNT',  -- userAccount
       'YOUR_POSITION_ID',   -- pId
       'XAUUSD',             -- itemId
       0,                    -- detailsWalletType (0=现金)
       'buy',                -- direction
       4211.73,              -- currentPrice
       2                     -- tradeStatus (2=已平仓)
   );
   ```

3. **检查余额明细**
   ```sql
   SELECT *
   FROM i_balance_details
   WHERE userAccount = 'YOUR_USER_ACCOUNT'
     AND detailsSubType = 3  -- 3=平仓卖出
   ORDER BY createdDate DESC
   LIMIT 1;
   ```

4. **验证余额增加**
   ```sql
   SELECT SUM(income - expense) AS balance
   FROM i_balance_details
   WHERE userAccount = 'YOUR_USER_ACCOUNT'
     AND detailsWalletType = 0;
   ```

#### 预期结果

- ✅ `i_balance_details` 表有新记录，`detailsSubType = 3`
- ✅ `income = 开仓成本 + 净盈亏`
- ✅ 用户余额增加 = `income` 值

---

## ⚠️ 注意事项

### 1. 历史平仓订单

**问题**：修复前已平仓但未入账的订单，余额仍然缺失。

**解决方案**：运行补偿脚本

```sql
-- 找出所有已平仓但未入账的订单
SELECT 
    o.outTradeNo,
    o.userAccount,
    o.detailsWalletType,
    o.openPrice,
    o.currentPrice,
    o.tradeVolume,
    o.takeSpread,
    o.swap,
    o.direction,
    o.closedAt
FROM i_trade_order o
LEFT JOIN i_balance_details bd 
    ON bd.outTradeNo = o.outTradeNo 
   AND bd.detailsSubType = 3  -- 平仓卖出
WHERE o.tradeStatus = 2  -- 已平仓
  AND o.closedAt IS NOT NULL
  AND bd.detailsId IS NULL  -- 未入账
ORDER BY o.closedAt DESC;

-- 为这些订单补充入账（需要逐个计算盈亏）
-- 建议手动审核后批量处理
```

### 2. 重复入账风险

**结论**：无风险！`sp_settle_closed_orders` 已修正逻辑。

**平仓方式区分**：

1. **手动平仓**（用户点击按钮）
   - 调用 I00008 接口 → `i_close_order` 存储过程
   - 触发器 `auto_updated_date_on_i_trade_order` 自动执行
   - **实时入账**，用户体验好

2. **自动平仓**（系统止损/止盈/爆仓）
   - 系统更新订单状态为已平仓
   - 定时任务（每分钟）调用 `sp_settle_closed_orders`
   - **批量入账**，处理自动平仓订单

**去重保护**：

两种方式都使用 `detailsSubType = 3`，存储过程会检查：
```sql
AND NOT EXISTS (
  SELECT 1 FROM i_balance_details 
  WHERE outTradeNo = o.outTradeNo 
    AND detailsSubType = 3  -- 平仓卖出
)
```

**修正内容**：

原 `sp_settle_closed_orders` 的问题：
- ❌ 只计算盈亏，不返还本金
- ❌ takeSpread 重复乘数量
- ❌ 计算公式错误

修正后的逻辑：
- ✅ 返还本金 + 净盈亏
- ✅ takeSpread 正确处理（已是总额）
- ✅ 与触发器计算逻辑完全一致
- ✅ 使用相同的 detailsSubType = 3

**部署**：
```sql
SOURCE docs/mysql/migrations/2025-12-02-fix-sp-settle-closed-orders.sql;
```

### 3. 并发问题

触发器在事务中执行，如果 `getGenerateId()` 函数有性能问题，可能影响平仓速度。

**监控指标**：
- 平仓操作耗时
- 触发器执行时间
- 数据库锁等待

---

## 📊 修复前后对比

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 平仓成功率 | ✅ 100% | ✅ 100% |
| 余额实时更新 | ❌ 0%（需等待异步） | ✅ 100%（立即入账） |
| 用户体验 | ❌ 差（余额不变） | ✅ 好（实时到账） |
| 依赖外部定时任务 | ❌ 是 | ✅ 否 |
| 数据一致性风险 | ❌ 高 | ✅ 低 |

---

## ✅ 总结

### 问题本质

**架构设计缺陷**：将关键业务逻辑（余额入账）从同步流程拆分到异步流程，但异步流程未正确实施。

### 修复原则

**关键操作必须同步完成**：
- ✅ 平仓状态更新
- ✅ 余额入账
- ✅ 持仓表更新
- ❌ 利息结算（可异步）
- ❌ 报表统计（可异步）

### 相关修复

此次修复同时解决了：
1. ✅ **takeSpread 重复计算**（7处错误）
2. ✅ **平仓余额不入账**（触发器缺陷）

---

**修复日期**：2025-12-02  
**问题严重程度**：🔴 高危（影响用户资金）  
**修复优先级**：🚨 紧急部署
