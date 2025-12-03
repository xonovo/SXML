# 杠杆账户持仓负债计算方案（币安借款模式）

## 一、业务模型分析

### 1.1 币安借款模式特点

```
业务流程：
1. 用户抵押 USDT → i_collateral 表记录
2. 用户借款 USDT → i_lever 表记录 + 杠杆账户余额增加
3. 用户用杠杆账户余额开仓（可能多次、多品种）
4. 用户可以继续借款，直到达到最大杠杆率限制
```

### 1.2 关键特点

- ✅ **借款先入账**：借款直接进入杠杆账户余额
- ✅ **开仓从余额扣**：开仓时从账户余额扣款，不绑定具体借款
- ✅ **多次借款**：用户可以多次借款，每次杠杆倍数可能不同
- ✅ **多次开仓**：用户可以用账户余额多次开仓，涉及多个品种

### 1.3 核心问题

**持仓卡片的负债应该怎么算？**

由于：
- 开仓时无法知道资金来源（自有资金 vs 借款）
- 借款可能多笔，杠杆倍数不同
- 一笔借款可能用于多个持仓

因此，**无法直接关联某个持仓对应哪笔借款**。

---

## 二、解决方案

### 2.1 方案设计

**核心思路**：按**资产占比**分配负债

```
持仓负债 = 账户总负债 × (该持仓市值 / 账户总资产)
```

### 2.2 计算公式

#### 账户总负债
```sql
total_Borrowed = SUM(i_lever.leverAmount WHERE leverStatus = 0 AND userAccount = ?)
```

#### 账户总资产
```sql
total_Assets = 杠杆账户余额 + SUM(所有持仓市值)
```

其中：
- 杠杆账户余额 = `SUM(i_balance_details.income - expense WHERE detailsWalletType = 1)`
- 持仓市值 = `(avgOpenPrice + takeSpread) * totalVolume`

#### 单个持仓负债
```sql
positionLiability = total_Borrowed × (持仓市值 / total_Assets)
```

#### 强平价计算
```sql
-- 买多强平价
liquidation_buy = avgOpenPrice × (1 - (持仓市值 / total_Assets) × 0.5)

-- 卖空强平价
liquidation_sell = avgOpenPrice × (1 + (持仓市值 / total_Assets) × 0.5)
```

**说明**：
- `持仓市值 / total_Assets` = 该持仓占用的资产比例
- 0.5 = 安全阈值（资产损失 50% 时触发强平）

---

## 三、示例计算

### 3.1 场景设置

```
用户操作流程：
1. 抵押 1000 USDT
2. 第一次借款：4000 USDT (5倍杠杆)
3. 用 3000 USDT 开仓 XAUUSD
4. 第二次借款：5000 USDT (10倍杠杆)
5. 用 5000 USDT 开仓 EURUSD
6. 剩余余额：2000 USDT
```

### 3.2 账户状态

```
i_collateral 表：
- 抵押金额：1000 USDT

i_lever 表：
- 借款 1：4000 USDT (5倍杠杆, leverStatus=0)
- 借款 2：5000 USDT (10倍杠杆, leverStatus=0)
- 总负债：9000 USDT

杠杆账户余额：
- 初始：1000 (抵押)
- + 4000 (借款1)
- - 3000 (开仓XAUUSD)
- + 5000 (借款2)
- - 5000 (开仓EURUSD)
- = 2000 USDT

持仓情况：
- XAUUSD 持仓：3000 USDT
- EURUSD 持仓：5000 USDT
- 持仓总市值：8000 USDT

账户总资产：
- 余额：2000 USDT
- 持仓市值：8000 USDT
- 总资产：10000 USDT
```

### 3.3 负债计算

#### XAUUSD 持仓卡片

```
持仓市值：3000 USDT
资产占比：3000 / 10000 = 30%

负债：9000 × 0.3 = 2700 USDT

强平价（假设买多，开仓价 2000）：
liquidation = 2000 × (1 - 0.3 × 0.5)
           = 2000 × 0.85
           = 1700 USDT
```

#### EURUSD 持仓卡片

```
持仓市值：5000 USDT
资产占比：5000 / 10000 = 50%

负债：9000 × 0.5 = 4500 USDT

强平价（假设买多，开仓价 1.10）：
liquidation = 1.10 × (1 - 0.5 × 0.5)
           = 1.10 × 0.75
           = 0.825 USDT
```

#### 验证

```
XAUUSD 负债：2700 USDT
EURUSD 负债：4500 USDT
账户剩余资产负债比：2000 / 10000 × 9000 = 1800 USDT

合计：2700 + 4500 + 1800 = 9000 USDT ✅ 等于总负债
```

---

## 四、实施方案

### 4.1 数据库修改

执行 SQL 脚本：`sp_fix_liability_binance_mode.sql`

**主要内容：**
1. 修改 `i_get_orderinfo` 存储过程，动态计算负债
2. 修改 `i_create_order` 存储过程，返回时动态计算负债
3. `i_positions.totalLiability` 字段保留但不再使用（设为 0）

### 4.2 前端调整（可选）

如果前端需要展示总负债，可以在账户总览页面显示：

```javascript
// 从 i_lever 表查询总负债
const totalBorrowed = await api.call('i_get_balance', { userAccount });

// 显示账户总负债
console.log('账户总负债:', totalBorrowed);
```

---

## 五、优势与对比

### 5.1 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **按资产占比分配负债（本方案）** | ✅ 不需要追踪每笔借款<br>✅ 支持多次借款<br>✅ 逻辑简单清晰 | ❌ 负债会随持仓变化而变化 | ✅ 币安借款模式<br>✅ 先借款后开仓 |
| **记录每笔实际保证金** | ✅ 负债固定<br>✅ 更精确 | ❌ 需要追踪资金来源<br>❌ 复杂度高 | ⚠️ 开仓时直接指定保证金模式 |
| **按最大杠杆计算（原方案）** | ✅ 计算简单 | ❌ 假设满杠杆，不准确 | ❌ 不适用任何场景 |

### 5.2 本方案优势

1. **准确性**：负债反映持仓占用的资金比例
2. **灵活性**：支持多次借款、多次开仓、多个品种
3. **简单性**：不需要记录复杂的资金流向
4. **动态性**：随着持仓变化，负债自动调整

---

## 六、特殊情况处理

### 6.1 部分平仓

```
原持仓：
- XAUUSD：5000 USDT (负债 3000)

平仓 50%：
- 持仓市值变为 2500 USDT
- 账户余额增加 2500 USDT
- 总资产不变，但分布变化

新负债：
- 按新的资产占比重新计算
- 例如：9000 × (2500 / 10000) = 2250 USDT
```

### 6.2 全部平仓

```
平仓后：
- 持仓市值 = 0
- 持仓负债 = 0 (0 / total_Assets × total_Borrowed)
- 所有负债归到账户余额上
```

### 6.3 加仓

```
原持仓：
- XAUUSD：3000 USDT (负债 2700)

加仓 2000 USDT：
- 账户余额减少 2000
- 持仓市值增加 2000 (变为 5000)
- 总资产不变

新负债：
- 9000 × (5000 / 10000) = 4500 USDT
- 增加了 1800 USDT 负债
```

### 6.4 还款

```
还款 3000 USDT：
- 某笔 i_lever 记录的 leverStatus 变为 1
- 总负债减少 3000 (变为 6000)

所有持仓负债按比例下降：
- XAUUSD：6000 × 0.3 = 1800 (原 2700)
- EURUSD：6000 × 0.5 = 3000 (原 4500)
```

---

## 七、数据库字段说明

### 7.1 `i_lever` 表（借款记录）

```sql
CREATE TABLE i_lever (
  leverId VARCHAR(255) PRIMARY KEY,
  userAccount VARCHAR(255),           -- 用户账号
  collateralId VARCHAR(255),          -- 关联的抵押物ID
  leverRate INT,                      -- 借款时的杠杆倍数（如 5, 10, 20）
  leverAmount DECIMAL(20,8),          -- 借款金额（USDT）
  leverInterest DECIMAL(20,8),        -- 利息比例（小时）
  leverStatus INT,                    -- 0=已借款, 1=已还款
  repaymentDate DATETIME,             -- 还款时间
  repaymentInterest DECIMAL(20,8),    -- 还款时的利息
  createdDate DATETIME,
  ...
)
```

**负债计算**：
```sql
SELECT SUM(leverAmount) FROM i_lever 
WHERE userAccount = ? AND leverStatus = 0 AND deleted = 0
```

### 7.2 `i_positions` 表（聚合持仓）

```sql
CREATE TABLE i_positions (
  pId VARCHAR(255) PRIMARY KEY,
  userAccount VARCHAR(255),
  aggItemId VARCHAR(255),             -- 品种ID (如 XAUUSD)
  aggDirection VARCHAR(8),            -- 方向 (buy/sell)
  totalVolume DECIMAL(20,8),          -- 总持仓量
  avgOpenPrice DECIMAL(20,8),         -- 平均开仓价
  takeSpread DECIMAL(20,8),           -- 平均点差
  totalLiability DECIMAL(20,8),       -- 【弃用】改为动态计算
  ...
)
```

**持仓市值**：
```sql
(avgOpenPrice + takeSpread) * totalVolume
```

### 7.3 `i_balance_details` 表（资金流水）

```sql
CREATE TABLE i_balance_details (
  detailsId VARCHAR(255) PRIMARY KEY,
  userAccount VARCHAR(255),
  detailsWalletType INT,              -- 0=现金账户, 1=杠杆账户
  detailsType INT,                    -- 流水类型
  detailsSubType INT,                 -- 子类型: 10=借款入账
  income DECIMAL(20,8),               -- 收入
  expense DECIMAL(20,8),              -- 支出
  ...
)
```

**杠杆账户余额**：
```sql
SELECT SUM(income - expense) FROM i_balance_details
WHERE userAccount = ? AND detailsWalletType = 1 AND deleted = 0
```

---

## 八、API 返回示例

### 8.1 查询持仓 (i_get_orderinfo)

```json
{
  "status": 1,
  "message": "Get successfully",
  "code": 2000,
  "available": 2000.00000000,
  "position": [
    {
      "outTradeNo": "IP001",
      "direction": "buy",
      "itemId": "XAUUSD",
      "tradeVolume": 1.00000000,
      "openPrice": 2000.00000000,
      "takeSpread": 0.50000000,
      "liability": 2700.00000000,        // 动态计算: 9000 × (3000/10000)
      "hourlyInterest": 0.00038616,
      "liquidation": 1700.00000000,      // 动态计算
      "stopLoss": 0,
      "takeProfit": 0,
      "swap": 0,
      "tradeRate": 5.00,
      "openedAt": "2025-11-29 10:00:00",
      "updatedAt": "2025-11-29 10:00:00"
    },
    {
      "outTradeNo": "IP002",
      "direction": "buy",
      "itemId": "EURUSD",
      "tradeVolume": 4545.45000000,
      "openPrice": 1.10000000,
      "takeSpread": 0.00010000,
      "liability": 4500.00000000,        // 动态计算: 9000 × (5000/10000)
      "hourlyInterest": 0.00038616,
      "liquidation": 0.82500000,         // 动态计算
      "stopLoss": 0,
      "takeProfit": 0,
      "swap": 0,
      "tradeRate": 10.00,
      "openedAt": "2025-11-29 11:00:00",
      "updatedAt": "2025-11-29 11:00:00"
    }
  ]
}
```

### 8.2 开仓成功 (i_create_order)

```json
{
  "status": 1,
  "message": "Successfully",
  "code": 2000,
  "available": 2000.00000000,
  "nowCommission": [],                 // 挂单列表
  "position": [
    {
      "outTradeNo": "IP001",
      "direction": "buy",
      "itemId": "XAUUSD",
      "tradeVolume": 1.00000000,
      "openPrice": 2000.00000000,
      "liability": 2700.00000000,      // 实时计算
      ...
    }
  ]
}
```

---

## 九、总结

### 9.1 方案特点

1. ✅ **符合币安模式**：先借款到账户，再用账户余额开仓
2. ✅ **动态负债计算**：按资产占比实时分配负债
3. ✅ **支持复杂场景**：多次借款、多次开仓、多个品种
4. ✅ **逻辑清晰**：不需要追踪每笔资金的具体流向
5. ✅ **前端友好**：API 直接返回计算好的负债，前端无需再计算

### 9.2 实施步骤

1. 执行 `sp_fix_liability_binance_mode.sql` 脚本
2. 测试开仓、平仓、加仓、还款等场景
3. 验证负债计算的准确性
4. 更新前端显示逻辑（如需要）

### 9.3 注意事项

- `i_positions.totalLiability` 字段保留但不再使用（设为 0）
- 负债会随持仓和余额变化而动态调整
- 强平价基于当前资产占比计算，更加准确
- 利息应基于账户总负债计算，而非单个持仓

**下一步行动**：
1. 审查 SQL 脚本和计算逻辑
2. 在测试环境验证
3. 观察生产环境数据是否符合预期
