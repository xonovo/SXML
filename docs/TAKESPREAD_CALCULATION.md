# 点差计算与聚合持仓方案

## 问题描述
开仓时 `takeSpread`（点差）没有计算到 `i_positions` 表中，需要实现：
1. 在 `i_positions` 表中存储平均点差 `takeSpread`
2. 根据多次补仓/部分平仓形成一个平均点差价格（加权平均）

## 解决方案

### 1. 数据库表结构修改

#### 新增字段（`i_positions` 表）
```sql
-- 执行脚本：docs/mysql/sp_alter_positions_add_takespread.sql
ALTER TABLE `i_positions` 
  ADD COLUMN `takeSpread` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 
    COMMENT '平均点差（加权平均，用于计算真实成本）' 
    AFTER `avgOpenPrice`;
```

**已有的聚合字段：**
- `aggDirection`: 聚合方向（buy/sell）
- `aggItemId`: 聚合品种代码
- `totalVolume`: 总持仓量
- `avgOpenPrice`: 平均开仓价格（加权平均）
- `takeSpread`: **新增** 平均点差（加权平均）
- `totalLiability`: 总负债
- `interestAccrued`: 累计利息
- `openedAt`: 首次开仓时间
- `updatedAt`: 最后更新时间

### 2. 点差加权平均计算逻辑

#### 补仓时计算（`i_create_order` 存储过程）
```sql
-- 读取当前聚合持仓
SELECT IFNULL(totalVolume,0), IFNULL(avgOpenPrice,0), IFNULL(takeSpread,0)
  INTO cur_totalVolume, cur_avgOpenPrice, cur_takeSpread
FROM i_positions WHERE pId = p_Id FOR UPDATE;

-- 计算新的总量和平均值
SET new_totalVolume = cur_totalVolume + trade_Volume;

-- 加权平均开仓价格
SET new_avgOpenPrice = CASE 
  WHEN new_totalVolume > 0 
    THEN ((cur_avgOpenPrice * cur_totalVolume) + (open_Price * trade_Volume)) / new_totalVolume
    ELSE open_Price
END;

-- 加权平均点差（关键逻辑）
SET new_takeSpread = CASE 
  WHEN new_totalVolume > 0 
    THEN ((cur_takeSpread * cur_totalVolume) + (take_Spread * trade_Volume)) / new_totalVolume
    ELSE take_Spread
END;

-- 更新聚合持仓
UPDATE i_positions
  SET totalVolume = new_totalVolume,
      avgOpenPrice = new_avgOpenPrice,
      takeSpread = new_takeSpread,
      totalLiability = new_totalLiability,
      updatedAt = NOW()
WHERE pId = p_Id;
```

#### 计算公式说明
```
新平均点差 = (原平均点差 × 原持仓量 + 新点差 × 新增持仓量) / (原持仓量 + 新增持仓量)

示例：
1. 首次开仓 100 单位，点差 0.0002
   takeSpread = 0.0002

2. 补仓 50 单位，点差 0.0003
   takeSpread = (0.0002 × 100 + 0.0003 × 50) / (100 + 50)
                 = (0.02 + 0.015) / 150
                 = 0.000233

3. 再补仓 150 单位，点差 0.00025
   takeSpread = (0.000233 × 150 + 0.00025 × 150) / (150 + 150)
                 = (0.03495 + 0.0375) / 300
                 = 0.0002415
```

### 3. API 返回数据更新

#### `i_get_orderinfo` 存储过程
```sql
-- 返回聚合持仓时包含 takeSpread
SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
  'pId', pId,
  'direction', aggDirection,
  'itemId', aggItemId,
  'totalVolume', totalVolume,
  'avgOpenPrice', avgOpenPrice,
  'takeSpread', takeSpread,  -- 新增返回字段
  'totalLiability', totalLiability,
  'interestAccrued', interestAccrued,
  'openedAt', openedAt,
  'updatedAt', updatedAt
)) FROM i_positions 
WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND totalVolume > 0), JSON_ARRAY());
```

### 4. 真实成本计算

持仓的**真实成本价格** = `avgOpenPrice` + `takeSpread`

用于计算：
- **杠杆账户负债**：`(avgOpenPrice + takeSpread) × totalVolume × (1 - 1/maxLever)`
- **强平价格**：基于真实成本价调整
- **盈亏计算**：`(当前价 - (avgOpenPrice + takeSpread)) × totalVolume`

### 5. 部分平仓处理

部分平仓时，`takeSpread` **不改变**，因为它反映的是历史开仓成本：
```sql
-- 平仓只减少 totalVolume，不修改 avgOpenPrice 和 takeSpread
UPDATE i_positions
  SET totalVolume = totalVolume - closedVolume,
      updatedAt = NOW()
WHERE pId = p_Id;
```

### 6. 执行步骤

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
   -- 查看字段是否添加成功
   SHOW COLUMNS FROM i_positions LIKE 'takeSpread';
   
   -- 测试开仓
   CALL i_create_order('test_user', 'EURUSD', 0, 'buy', 0, 1.1000, 0, 0, 0.0002, 100, 0, 1);
   
   -- 查看聚合持仓
   SELECT pId, aggItemId, totalVolume, avgOpenPrice, takeSpread 
   FROM i_positions WHERE userAccount = 'test_user';
   ```

## 注意事项

1. **精度保证**：`takeSpread` 使用 `DECIMAL(20,8)` 类型，支持 8 位小数精度
2. **并发安全**：使用 `FOR UPDATE` 锁定聚合持仓行，避免并发写冲突
3. **历史数据**：现有持仓的 `takeSpread` 默认为 0，新开仓后会自动计算
4. **前端显示**：建议在持仓卡片中显示真实成本价（`avgOpenPrice + takeSpread`）

## 相关文件

- 表结构修改：`docs/mysql/sp_alter_positions_add_takespread.sql`
- 存储过程更新：`docs/mysql/sp_optimization.sql`
- 本文档：`docs/TAKESPREAD_CALCULATION.md`
