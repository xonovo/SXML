# 平仓功能完整部署指南

## 📋 目录
1. [问题分析](#问题分析)
2. [解决方案](#解决方案)
3. [数据库部署](#数据库部署)
4. [前端更新](#前端更新)
5. [测试验证](#测试验证)
6. [常见问题](#常见问题)

---

## 🔍 问题分析

### 原有 I00008 存储过程问题
```sql
-- 原始版本（ice_markets.sql 第 709-740 行）
CREATE PROCEDURE `i_close_order`(...)
BEGIN
  -- ❌ 仅更新订单状态，没有后续处理
  UPDATE i_trade_order SET
    currentPrice = current_Price,
    tradeStatus = trade_Status
  WHERE ...;
END
```

### 缺失的关键逻辑
1. ❌ **没有计算盈亏（PnL）**  
   - 未考虑点差费用（`takeSpread`）
   - 未扣除利息（`swap`）
   - 未区分做多/做空的盈亏计算

2. ❌ **没有入账到余额明细表**  
   - 平仓收入未写入 `i_balance_details`
   - 导致用户余额不变化

3. ❌ **没有杠杆账户还款逻辑**  
   - 杠杆账户平仓应自动还款（平仓即还款）
   - 未标记 `i_lever` 表的借款为已还
   - 未释放抵押品（`i_collateral`）

4. ❌ **没有更新持仓表**  
   - `i_positions` 表状态未同步
   - 保证金未释放

5. ❌ **缺少利息计算**  
   - 未处理持仓期间累积的利息

---

## ✅ 解决方案

### 新存储过程：`i_close_order_complete`
完整实现以下功能：

```
┌─────────────────────────────────────────────────────────────┐
│  1. 遍历待平仓订单（支持单个/批量/全部）                    │
├─────────────────────────────────────────────────────────────┤
│  2. 计算实际盈亏（PnL）                                      │
│     - 开仓成本 = (开仓价 + 点差) × 数量                     │
│     - 平仓收入 = 平仓价 × 数量                               │
│     - 原始盈亏 = 收入 - 成本（做多）或 成本 - 收入（做空） │
│     - 净盈亏 = 原始盈亏 - 利息                              │
├─────────────────────────────────────────────────────────────┤
│  3. 更新订单状态                                            │
│     - tradeStatus = 2（已平仓）                             │
│     - closedAt = NOW()                                      │
│     - pnl = 净盈亏                                          │
├─────────────────────────────────────────────────────────────┤
│  4. 入账余额明细（i_balance_details）                       │
│     - detailsType = 1（交易）                               │
│     - detailsSubType = 3（平仓卖出）                        │
│     - income = 本金 + 盈亏                                  │
├─────────────────────────────────────────────────────────────┤
│  5. 杠杆账户自动还款                                        │
│     - 计算可还款金额 = MIN(杠杆余额, 总借款)               │
│     - 标记 i_lever.leverStatus = 1（已还款）               │
│     - 释放抵押品 i_collateral.collateralStatus = 1         │
│     - 记录还款明细（detailsSubType = 7 平仓还款）          │
├─────────────────────────────────────────────────────────────┤
│  6. 更新持仓表（i_positions）                               │
│     - positionStatus = 2（已平仓）                          │
│     - closedAt = NOW()                                      │
│     - realizedPnl = 净盈亏                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ 数据库部署

### 步骤 1：备份现有数据
```sql
-- 备份关键表
CREATE TABLE i_trade_order_backup_20250129 AS SELECT * FROM i_trade_order;
CREATE TABLE i_balance_details_backup_20250129 AS SELECT * FROM i_balance_details;
CREATE TABLE i_lever_backup_20250129 AS SELECT * FROM i_lever;
CREATE TABLE i_positions_backup_20250129 AS SELECT * FROM i_positions;
```

### 步骤 2：执行新存储过程
```bash
# 方式 1：命令行导入
mysql -u root -p ice_markets < docs/mysql/sp_close_order_complete.sql

# 方式 2：MySQL Workbench
# 打开 sp_close_order_complete.sql 文件，点击「执行」按钮
```

### 步骤 3：验证存储过程
```sql
-- 检查存储过程是否创建成功
SHOW PROCEDURE STATUS WHERE Db = 'ice_markets' AND Name = 'i_close_order_complete';

-- 查看存储过程定义
SHOW CREATE PROCEDURE i_close_order_complete;
```

### 步骤 4：更新接口配置表
```sql
-- 更新 interface 表，将 I00008 接口映射到新存储过程
UPDATE `interface` 
SET 
  interfaceCallSql = 'call i_close_order_complete(#{userAccount},#{outTradeNo},#{itemId},#{currentPrice},#{tradeStatus});',
  interfaceName = '平仓(关闭仓位-完整版)',
  interfaceParamName = 'userAccount,outTradeNo,itemId,currentPrice,tradeStatus'
WHERE interfaceNo = 'I00008';
```

### 步骤 5：验证索引优化
```sql
-- 检查索引是否创建
SHOW INDEX FROM i_trade_order WHERE Key_name = 'idx_close_query';
SHOW INDEX FROM i_lever WHERE Key_name = 'idx_repay_query';
SHOW INDEX FROM i_positions WHERE Key_name = 'idx_position_close';

-- 如果缺失，手动创建
ALTER TABLE i_trade_order ADD INDEX idx_close_query (userAccount, tradeStatus, deleted, itemId);
ALTER TABLE i_lever ADD INDEX idx_repay_query (userAccount, leverStatus, deleted, createTime);
ALTER TABLE i_positions ADD INDEX idx_position_close (userAccount, outTradeNo, deleted);
```

---

## 🖥️ 前端更新

### 已完成的改动

#### 1. 单个平仓（`closePosition`）
```javascript
// pages/webapp/webapp.js 第 7218-7290 行
// ✅ 更新接口调用为 I00008
// ✅ 添加 currentPrice 参数（从实时行情获取）
// ✅ 添加 itemId 参数（产品代码）
// ✅ 添加 tradeStatus = 2（已平仓）

const params = {
  userAccount,
  outTradeNo,
  itemId: symbol,
  currentPrice: currentPrice,  // 新增：从 getCurrentPrice(symbol) 获取
  tradeStatus: 2               // 新增：标记为已平仓
};

window.superAPI.request('I00008', params);
```

#### 2. 批量平仓（`closeAllPositions`）
```javascript
// pages/webapp/webapp.js 第 7293-7360 行
// ✅ 为每个持仓获取实时价格
// ✅ 构造完整的 I00008 参数
// ✅ 并发调用多个平仓请求

positions.push({ 
  userAccount, 
  outTradeNo, 
  itemId: symbol, 
  currentPrice: currentPrice,  // 新增
  tradeStatus: 2               // 新增
});
```

#### 3. UI 增强
- ✅ 持仓列表标题栏（Full Position + Close All 按钮）
- ✅ 持仓卡片顶部栏（产品代码 + Close 按钮）
- ✅ 挂单项多空颜色标记（红色做多/绿色做空）
- ✅ 挂单项详细信息（价格/数量/总金额/点差费用）

---

## 🧪 测试验证

### 测试场景 1：现金账户单个平仓（盈利）
```sql
-- 1. 准备测试数据（模拟开仓）
CALL i_create_order(
  'ICE00000001',  -- userAccount
  'XAUUSD',       -- itemId
  0,              -- detailsWalletType (现金账户)
  'buy',          -- direction (做多)
  0,              -- tradeType (市价单)
  1800.00,        -- openPrice (开仓价)
  1750.00,        -- stopLoss
  1850.00,        -- takeProfit
  0.50,           -- takeSpread (点差)
  100.00,         -- tradeVolume (数量)
  1.00,           -- tradeRate (无杠杆)
  1               -- tradeStatus (持仓中)
);

-- 记录返回的 outTradeNo（假设为 OUTS0001）

-- 2. 执行平仓（模拟盈利场景：平仓价高于开仓价）
CALL i_close_order_complete(
  'ICE00000001',  -- userAccount
  'OUTS0001',     -- outTradeNo
  NULL,           -- itemId (单个平仓时可为 NULL)
  1850.00,        -- currentPrice (平仓价，高于开仓价)
  2               -- tradeStatus (已平仓)
);

-- 3. 验证结果
-- 3.1 检查订单状态
SELECT outTradeNo, tradeStatus, closedAt, pnl, currentPrice
FROM i_trade_order
WHERE outTradeNo = 'OUTS0001';
-- 预期：tradeStatus=2, closedAt有值, pnl=正数

-- 3.2 检查余额明细（应有平仓收入记录）
SELECT detailsId, detailsSubType, income, expense, detailsRemarks
FROM i_balance_details
WHERE outTradeNo = 'OUTS0001' AND detailsSubType = 3
ORDER BY createTime DESC LIMIT 1;
-- 预期：detailsSubType=3(平仓卖出), income > expense

-- 3.3 检查持仓表
SELECT pId, positionStatus, closedAt, realizedPnl
FROM i_positions
WHERE outTradeNo = 'OUTS0001';
-- 预期：positionStatus=2, closedAt有值, realizedPnl=正数
```

### 测试场景 2：杠杆账户平仓（自动还款）
```sql
-- 1. 准备杠杆账户开仓（需先借款）
-- 步骤 1.1：抵押借款
CALL i_create_lever(
  'ICE00000001',  -- userAccount
  10000.00,       -- collateralAmount (抵押 1 万)
  20,             -- leverRate (20 倍杠杆)
  190000.00       -- leverAmount (借 19 万)
);

-- 步骤 1.2：开仓
CALL i_create_order(
  'ICE00000001',
  'XAUUSD',
  1,              -- detailsWalletType (杠杆账户)
  'buy',
  0,
  1800.00,
  1750.00,
  1850.00,
  0.50,
  100.00,
  20.00,          -- tradeRate (20 倍杠杆)
  1
);

-- 记录 outTradeNo（假设为 OUTL0001）

-- 2. 执行平仓
CALL i_close_order_complete(
  'ICE00000001',
  'OUTL0001',
  NULL,
  1850.00,
  2
);

-- 3. 验证自动还款
-- 3.1 检查借款状态
SELECT leverId, leverStatus, leverAmount, repayAmount, repayTime
FROM i_lever
WHERE userAccount = 'ICE00000001' AND leverStatus = 1
ORDER BY repayTime DESC LIMIT 1;
-- 预期：leverStatus=1(已还款), repayAmount>0, repayTime有值

-- 3.2 检查还款明细
SELECT detailsId, detailsSubType, expense, detailsRemarks
FROM i_balance_details
WHERE userAccount = 'ICE00000001' AND detailsSubType = 7
ORDER BY createTime DESC LIMIT 1;
-- 预期：detailsSubType=7(平仓还款), expense>0

-- 3.3 检查抵押品释放
SELECT collateralId, collateralStatus
FROM i_collateral
WHERE userAccount = 'ICE00000001'
ORDER BY createTime DESC LIMIT 1;
-- 预期：collateralStatus=1(已释放)
```

### 测试场景 3：批量平仓（同产品多持仓）
```sql
-- 1. 创建多个持仓（同一产品）
CALL i_create_order('ICE00000001', 'EURUSD', 0, 'buy', 0, 1.1000, 1.0950, 1.1050, 0.0002, 10000, 1.00, 1);
CALL i_create_order('ICE00000001', 'EURUSD', 0, 'sell', 0, 1.1020, 1.1070, 1.0970, 0.0002, 5000, 1.00, 1);
CALL i_create_order('ICE00000001', 'EURUSD', 0, 'buy', 0, 1.1010, 1.0960, 1.1060, 0.0002, 8000, 1.00, 1);

-- 2. 批量平仓（itemId 不为 NULL）
CALL i_close_order_complete(
  'ICE00000001',
  NULL,           -- outTradeNo (NULL 表示批量)
  'EURUSD',       -- itemId (指定产品)
  1.1030,         -- currentPrice
  2
);

-- 3. 验证所有 EURUSD 持仓已平仓
SELECT outTradeNo, itemId, tradeStatus, closedAt
FROM i_trade_order
WHERE userAccount = 'ICE00000001' AND itemId = 'EURUSD'
ORDER BY closedAt DESC;
-- 预期：所有 EURUSD 订单的 tradeStatus=2
```

---

## ❓ 常见问题

### Q1：前端调用 I00008 返回 401 或 403
**原因**：加密密钥配置不正确

**解决**：
```javascript
// 检查 config/api-sign-map.js
'I00008': '5DD7042FE12E0845CB59D4EB00970614',  // 确保密钥正确

// 检查 superAPI 初始化
const encryptKey = sessionStorage.getItem('k');
window.superAPI = createSuperAPI(userAccount, encryptKey);
```

### Q2：平仓后余额没有变化
**原因**：`i_balance_details` 表未正确插入记录

**排查**：
```sql
-- 查看平仓相关的余额明细
SELECT * FROM i_balance_details
WHERE outTradeNo = 'OUTS0001' AND detailsSubType IN (3, 7)
ORDER BY createTime DESC;

-- 如果为空，检查存储过程是否正确执行
-- 开启 SQL 日志
SET GLOBAL general_log = 'ON';
SET GLOBAL log_output = 'TABLE';

-- 重新平仓，查看日志
SELECT * FROM mysql.general_log WHERE command_type = 'Query' ORDER BY event_time DESC LIMIT 20;
```

### Q3：杠杆账户平仓后借款未还清
**原因**：可能余额不足或借款记录状态异常

**排查**：
```sql
-- 检查杠杆余额
SELECT SUM(income) - SUM(expense) AS leverBalance
FROM i_balance_details
WHERE userAccount = 'ICE00000001' AND detailsWalletType = 1;

-- 检查未还借款
SELECT leverId, leverAmount, leverStatus
FROM i_lever
WHERE userAccount = 'ICE00000001' AND leverStatus = 0;

-- 手动还款（如需）
UPDATE i_lever SET leverStatus = 1, repayTime = NOW() WHERE leverId = 'LEV001';
```

### Q4：平仓价格获取失败
**原因**：前端 `getCurrentPrice(symbol)` 未能获取实时行情

**解决**：
```javascript
// 检查行情数据源
if (typeof isSymbolClosed === 'function' && isSymbolClosed(symbol)) {
  alert('市场已休市，无法获取实时价格');
  return;
}

// 检查 MarketsStore 连接状态
if (window.MarketsStore && window.MarketsStore.getQuote) {
  const quote = window.MarketsStore.getQuote(symbol);
  console.log('Current quote:', quote);
}
```

### Q5：触发器未自动设置 `closedAt`
**原因**：触发器未创建或被禁用

**解决**：
```sql
-- 检查触发器
SHOW TRIGGERS WHERE `Trigger` = 'before_order_close';

-- 重新创建触发器（见 sp_close_order_complete.sql 底部）
DROP TRIGGER IF EXISTS `before_order_close`;
CREATE TRIGGER `before_order_close`
BEFORE UPDATE ON `i_trade_order`
FOR EACH ROW
BEGIN
  IF NEW.tradeStatus = 2 AND OLD.tradeStatus <> 2 THEN
    SET NEW.closedAt = IFNULL(NEW.closedAt, NOW());
  END IF;
END;
```

---

## 📊 性能监控

### 监控关键指标
```sql
-- 平仓操作耗时统计
SELECT 
  COUNT(*) AS total_closes,
  AVG(TIMESTAMPDIFF(SECOND, createTime, closedAt)) AS avg_duration_sec,
  MAX(TIMESTAMPDIFF(SECOND, createTime, closedAt)) AS max_duration_sec
FROM i_trade_order
WHERE tradeStatus = 2 AND closedAt IS NOT NULL;

-- 单日平仓数量
SELECT 
  DATE(closedAt) AS close_date,
  COUNT(*) AS daily_closes,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS profit_count,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS loss_count
FROM i_trade_order
WHERE tradeStatus = 2 AND closedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(closedAt)
ORDER BY close_date DESC;
```

---

## 🚀 部署清单

- [ ] 数据库备份完成
- [ ] 执行 `sp_close_order_complete.sql`
- [ ] 更新 `interface` 表配置
- [ ] 验证存储过程创建
- [ ] 验证索引优化
- [ ] 验证触发器创建
- [ ] 前端代码已更新（`closePosition` / `closeAllPositions`）
- [ ] 测试场景 1：现金账户平仓
- [ ] 测试场景 2：杠杆账户平仓+还款
- [ ] 测试场景 3：批量平仓
- [ ] 性能监控指标正常
- [ ] 生产环境灰度发布

---

## 📞 技术支持

如遇问题，请提供以下信息：
1. 错误日志（前端 Console + 后端 SQL 日志）
2. 测试数据（`userAccount`, `outTradeNo`, `itemId`）
3. 环境信息（开发/测试/生产）

---

**更新日期**：2025-01-29  
**作者**：AI Assistant  
**版本**：v1.0.0
