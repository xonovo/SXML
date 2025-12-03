# 聚合持仓字段补全与显示优化

## 问题描述

用户反馈 `i_get_orderinfo` 存储过程返回的 `position`（聚合持仓卡片）数据存在以下问题：

1. **字段缺失**：`swap` 和 `tradeRate` 字段值缺失（硬编码为 0 和 1）
2. **空仓显示**：当所有仓单全部平仓后（`totalVolume = 0`），持仓卡片应该隐藏但缺少判断

## 解决方案

### 1. 数据库表结构完善

在 `i_positions` 表中添加缺失的字段：

```sql
-- 执行脚本：docs/mysql/sp_alter_positions_add_takespread.sql
ALTER TABLE `i_positions` 
  ADD COLUMN IF NOT EXISTS `swap` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 
    COMMENT '聚合swap（预留字段）' AFTER `interestAccrued`,
  ADD COLUMN IF NOT EXISTS `tradeRate` DECIMAL(10,4) NOT NULL DEFAULT 1.00 
    COMMENT '交易倍率（杠杆倍数）' AFTER `swap`;
```

**完整字段列表：**
- `aggDirection`: 聚合方向（buy/sell）
- `aggItemId`: 聚合品种代码
- `totalVolume`: 总持仓量（累计补仓）
- `avgOpenPrice`: 平均开仓价格
- `avgTakeSpread`: 平均点差（加权平均）
- `totalLiability`: 总负债
- `interestAccrued`: 累计利息
- `stopLoss`: 止损价位（继承最后一次设置）
- `takeProfit`: 止盈价位（继承最后一次设置）
- `swap`: swap 值（预留）
- `tradeRate`: 交易倍率（杠杆倍数）
- `openedAt`: 首次开仓时间
- `updatedAt`: 最后更新时间

### 2. 存储过程优化

#### `i_get_orderinfo` - 返回完整字段

**修改前：**
```sql
SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
  ...
  'swap',0,              -- 硬编码
  'tradeRate',1,         -- 硬编码
  'takeSpread',takeSpread,
  ...
)) FROM i_positions 
WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND totalVolume > 0),JSON_ARRAY());
```

**修改后：**
```sql
SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
  'outTradeNo',pId,
  'direction',aggDirection,
  'itemId',aggItemId,
  'tradeVolume',totalVolume,
  'openPrice',avgOpenPrice,
  'takeSpread',avgTakeSpread,                    -- 使用平均点差
  'liability',IF(details_WalletType = 1,
    (avgOpenPrice + avgTakeSpread) * totalVolume - 
    ((avgOpenPrice + avgTakeSpread) * totalVolume / max_Lever),0),
  'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
  'stopLoss',IFNULL(stopLoss,0),                 -- 从字段读取
  'takeProfit',IFNULL(takeProfit,0),             -- 从字段读取
  'swap',IFNULL(swap,0),                         -- 从字段读取
  'tradeRate',IFNULL(tradeRate,1),               -- 从字段读取
  'liquidation',IF(details_WalletType = 1,
    IF(aggDirection = 'buy',
      avgOpenPrice * (1 - (1 / max_Lever * 0.5)),
      avgOpenPrice * (1 + (1 / max_Lever * 0.5))),'--'),
  'openedAt',openedAt,
  'updatedAt',updatedAt
)) FROM i_positions 
WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND totalVolume > 0),JSON_ARRAY());
```

**关键改进：**
1. ✅ `swap` 和 `tradeRate` 从数据库字段读取，不再硬编码
2. ✅ `stopLoss` 和 `takeProfit` 使用 `IFNULL` 防止 NULL 值
3. ✅ `takeSpread` 改为 `avgTakeSpread`（平均点差）
4. ✅ `WHERE` 条件保留 `totalVolume > 0`，自动隐藏空仓

#### `i_create_order` - 初始化字段值

**创建聚合持仓时设置初始值：**
```sql
INSERT INTO i_positions(
  outTradeNo,pId,userAccount,aggDirection,aggItemId,
  totalVolume,avgOpenPrice,avgTakeSpread,totalLiability,interestAccrued,
  stopLoss,takeProfit,swap,tradeRate,openedAt,updatedAt
)
VALUES(
  out_TradeNo,p_Id,user_Account,LOWER(direction_Temp),item_Id,
  0,0,0,0,0,
  IFNULL(stop_Loss,0),      -- 继承第一次的止损
  IFNULL(take_Profit,0),    -- 继承第一次的止盈
  0,                        -- swap 初始为 0
  IFNULL(trade_Rate,1),     -- 继承杠杆倍数
  NOW(),NOW()
);
```

**补仓时更新字段：**
```sql
UPDATE i_positions
  SET totalVolume = new_totalVolume,
      avgOpenPrice = new_avgOpenPrice,
      avgTakeSpread = new_takeSpread,
      totalLiability = new_totalLiability,
      stopLoss = IFNULL(stop_Loss, stopLoss),      -- 新值优先，否则保留
      takeProfit = IFNULL(take_Profit, takeProfit),-- 新值优先，否则保留
      tradeRate = IFNULL(trade_Rate, tradeRate),   -- 新值优先，否则保留
      updatedAt = NOW()
WHERE pId = p_Id;
```

### 3. 空仓自动隐藏机制

#### WHERE 条件过滤

```sql
WHERE deleted=0 
  AND userAccount = user_Account 
  AND aggItemId = item_Id 
  AND totalVolume > 0  -- 关键：只返回有持仓的卡片
```

#### 工作原理

1. **开仓时**：`totalVolume` 从 0 增加到实际仓位
2. **补仓时**：`totalVolume` 累加
3. **部分平仓时**：`totalVolume` 递减
4. **全部平仓时**：`totalVolume` 归零，WHERE 条件自动过滤掉该卡片
5. **返回空数组**：`IFNULL(..., JSON_ARRAY())` 确保没有持仓时返回 `[]`

#### 前端适配

前端收到的 `position` 数据：
- **有持仓**：`[{...卡片数据...}, {...}]`
- **无持仓**：`[]`（空数组）

前端只需检查数组长度：
```javascript
if (position && position.length > 0) {
  // 渲染持仓卡片
} else {
  // 显示"暂无持仓"占位符
}
```

### 4. 字段继承策略

| 字段 | 初始值来源 | 补仓时更新规则 | 说明 |
|-----|-----------|--------------|------|
| `totalVolume` | 第一次开仓量 | 累加新仓位 | 总持仓量 |
| `avgOpenPrice` | 第一次开仓价 | 加权平均 | 平均成本价 |
| `avgTakeSpread` | 第一次点差 | 加权平均 | 平均点差 |
| `totalLiability` | 第一次负债 | 累加新负债 | 总负债 |
| `stopLoss` | 第一次止损 | 新值优先，否则保留 | 最后设置的止损价 |
| `takeProfit` | 第一次止盈 | 新值优先，否则保留 | 最后设置的止盈价 |
| `swap` | 0 | 保留 | 预留字段 |
| `tradeRate` | 第一次倍率 | 新值优先，否则保留 | 杠杆倍数 |

### 5. 执行步骤

1. **执行表结构修改**
   ```bash
   mysql -u root -p ice_markets < docs/mysql/sp_alter_positions_add_takespread.sql
   ```

2. **更新存储过程**
   ```bash
   mysql -u root -p ice_markets < docs/mysql/sp_optimization.sql
   ```

3. **验证修改**
   ```sql
   -- 查看字段
   SHOW COLUMNS FROM i_positions WHERE Field IN ('swap','tradeRate','avgTakeSpread');
   
   -- 测试开仓
   CALL i_create_order('test_user','EURUSD',0,'buy',0,1.1000,1.0900,1.1100,0.0002,100,1,1);
   
   -- 查看聚合持仓
   CALL i_get_orderinfo('test_user',0,'EURUSD');
   
   -- 验证返回的 position 包含完整字段
   -- 验证 totalVolume=0 时 position 为空数组
   ```

## 注意事项

1. **字段默认值**：新增字段使用 `NOT NULL DEFAULT` 避免 NULL 值问题
2. **历史数据**：现有持仓的 `swap` 和 `tradeRate` 默认为 0 和 1
3. **前端兼容**：返回数据结构不变，只是字段值从实际数据库读取
4. **性能优化**：`totalVolume > 0` 条件配合索引快速过滤空仓

## 相关文件

- 表结构修改：`docs/mysql/sp_alter_positions_add_takespread.sql`
- 存储过程更新：`docs/mysql/sp_optimization.sql`
- 点差计算说明：`docs/TAKESPREAD_CALCULATION.md`
- 本文档：`docs/POSITION_FIELDS_FIX.md`
