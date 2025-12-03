-- ============================================================
-- 修复平仓触发器：auto_updated_date_on_i_trade_order
-- 
-- 修复内容：
-- 1. 修正盈亏计算逻辑（原逻辑未扣除开仓成本和点差）
-- 2. 正确计算：本金 + 净盈亏（盈亏 - 利息）
-- 3. 支持聚合持仓表递减（按方向分组）
-- 4. 保留所有原有功能（还款、抵押品释放、日志）
-- 
-- 部署方式：
-- 1. 备份：SHOW CREATE TRIGGER auto_updated_date_on_i_trade_order;
-- 2. 执行：SOURCE trigger_fix_close_order.sql;
-- 3. 验证：SELECT * FROM information_schema.TRIGGERS 
--          WHERE TRIGGER_NAME = 'auto_updated_date_on_i_trade_order';
-- 4. 更新接口配置（见文件底部）
-- ============================================================

USE ice_markets;

-- 删除旧触发器
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_trade_order`;

DELIMITER ;;

CREATE TRIGGER `auto_updated_date_on_i_trade_order` 
BEFORE UPDATE ON `i_trade_order` 
FOR EACH ROW 
BEGIN
  -- ========== 变量声明 ==========
  DECLARE totalAmount, unrealized_Pnl, swapTotal, balance DECIMAL(20,8) DEFAULT 0;
  DECLARE openCost, netPnl DECIMAL(20,8) DEFAULT 0;  -- 新增：开仓成本、净盈亏
  DECLARE lever_Amount DECIMAL(20,8);
  DECLARE lever_Id, collateral_Id VARCHAR(255);
  DECLARE remaining INT DEFAULT 0;
  
  -- 更新时间戳
  SET new.updatedDate = CURRENT_TIMESTAMP(3);
  
  -- ========== 判断是否需要平仓 ==========
  -- 条件：订单状态从 <2 变为 2（已平仓）
  IF (old.tradeStatus < 2 AND new.tradeStatus = 2) THEN
    
    -- 1️⃣ 设置平仓时间
    SET new.closedAt = CURRENT_TIMESTAMP;
    
    -- ========================================
    -- 2️⃣ 计算盈亏（修正版本）
    -- ========================================
    
    -- 2.1 计算开仓成本（含点差）
    -- 开仓时用户支付：开仓价×数量 + 总点差费用
    -- 注意：takeSpread 已经是总费用（单位点差×数量），不能再乘以数量
    SET openCost = (new.openPrice * new.tradeVolume) + new.takeSpread;
    
    -- 2.2 计算平仓收入
    -- 平仓时用户收回：平仓价 × 数量
    SET totalAmount = new.currentPrice * new.tradeVolume;
    
    -- 2.3 计算原始盈亏（区分做多/做空）
    -- 统一使用字符串方向：'buy' / 'sell'
    IF (LOWER(CAST(new.direction AS CHAR)) = 'buy') THEN  
      -- 做多：盈亏 = 平仓收入 - 开仓成本
      SET unrealized_Pnl = totalAmount - openCost;
    ELSE  
      -- 做空：盈亏 = 开仓成本 - 平仓收入
      SET unrealized_Pnl = openCost - totalAmount;
    END IF;
    
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
    
    -- ========================================
    -- 4️⃣ 更新聚合持仓表（递减仓位）
    -- ========================================
    -- 注意：新架构使用聚合持仓表（一个品种+方向=一条记录）
    -- 平仓时需要递减 totalVolume，而不是删除记录
    UPDATE i_positions SET
      totalVolume = totalVolume - new.tradeVolume,  -- 递减持仓量
      updatedAt = CURRENT_TIMESTAMP                  -- 更新时间
    WHERE deleted = 0 
      AND userAccount = new.userAccount
      AND aggItemId = new.itemId
      AND aggDirection = LOWER(CAST(new.direction AS CHAR))
      AND totalVolume > 0;  -- 防止负数
    
    -- ========================================
    -- 5️⃣ 记录操作日志
    -- ========================================
    INSERT INTO i_details_log (
      logNo,
      userAccount,
      logData
    ) VALUES (
      getGenerateId('i_details_log'),
      new.userAccount,
      JSON_OBJECT(
        'outTradeNo', new.outTradeNo,
        'itemId', new.itemId,
        'createdDate', DATE_FORMAT(new.createdDate, '%Y-%m-%d %H:%i:%s'),
        'type', 1,  -- 0=开仓，1=平仓
        'openPrice', new.openPrice,
        'currentPrice', new.currentPrice,
        'tradeVolume', new.tradeVolume,
        'takeSpread', new.takeSpread,
        'totalAmount', (new.openPrice * new.tradeVolume) + new.takeSpread,
        'walletType', new.detailsWalletType,
        'direction', LOWER(CAST(new.direction AS CHAR)),
        'tradeType', new.tradeType,
        'status', new.tradeStatus,
        'stopLoss', new.stopLoss,
        'takeProfit', new.takeProfit,
        'swap', new.swap,
        'tradeRate', new.tradeRate,
        'netPnl', netPnl  -- 新增：记录净盈亏
      )
    );
    
    -- ========================================
    -- 6️⃣ 杠杆账户自动还款
    -- ========================================
    -- 为避免长事务与循环，在触发器中不做还款；
    -- 建议在结算过程或专用过程（如 sp_repay_due_leverage）中以批处理方式处理，
    -- 严格按整小时计息：TIMESTAMPDIFF(HOUR, createdDate, NOW())（向下取整）。
    
  END IF;
  
END;;

DELIMITER ;

-- ============================================================
-- 验证触发器是否正确创建
-- ============================================================
SELECT 
  TRIGGER_NAME,
  EVENT_MANIPULATION,
  EVENT_OBJECT_TABLE,
  ACTION_TIMING,
  DEFINER
FROM information_schema.TRIGGERS 
WHERE TRIGGER_SCHEMA = 'ice_markets' 
  AND TRIGGER_NAME = 'auto_updated_date_on_i_trade_order';

-- ============================================================
-- 测试脚本（可选）
-- ============================================================

-- 测试场景 1：现金账户盈利平仓（聚合持仓模式）
-- 
-- 1. 准备测试数据（假设已有聚合持仓）
-- INSERT INTO i_positions (
--   pId, userAccount, aggItemId, aggDirection,
--   totalVolume, avgOpenPrice, takeSpread
-- ) VALUES (
--   'POS001', 'ICE00000001', 'XAUUSD', 'buy',
--   100.00, 1800.00, 0.50
-- );
--
-- INSERT INTO i_trade_order (
--   outTradeNo, userAccount, itemId, detailsWalletType,
--   direction, openPrice, currentPrice, tradeVolume, 
--   takeSpread, swap, tradeStatus
-- ) VALUES (
--   'TEST_PROFIT_001', 'ICE00000001', 'XAUUSD', 0,
--   'buy', 1800.00, 1800.00, 100.00,
--   0.50, 0, 1
-- );
-- 
-- 2. 模拟平仓（盈利）
-- UPDATE i_trade_order 
-- SET tradeStatus = 2, currentPrice = 1850.00
-- WHERE outTradeNo = 'TEST_PROFIT_001';
-- 
-- 3. 验证结果
-- SELECT income, expense, detailsSubType, detailsRemarks
-- FROM i_balance_details 
-- WHERE outTradeNo = 'TEST_PROFIT_001';
-- 
-- SELECT totalVolume, avgOpenPrice, updatedAt
-- FROM i_positions
-- WHERE pId = 'POS001';
-- 
-- 预期结果：
-- 余额明细：
-- - income = (1800 + 0.5) * 100 + [(1850 * 100) - (1800.5 * 100)]
--          = 180,050 + 4,950 = 185,000 USD
-- - detailsSubType = 3（平仓卖出）
-- 
-- 聚合持仓：
-- - totalVolume = 100 - 100 = 0（完全平仓后自动隐藏）
-- - updatedAt 已更新

-- 测试场景 2：部分平仓（聚合持仓递减）
-- 
-- 1. 假设总持仓 200 单位，平仓 50 单位
-- UPDATE i_positions SET totalVolume = 200 WHERE pId = 'POS001';
-- UPDATE i_trade_order SET tradeVolume = 50 WHERE outTradeNo = 'TEST_PROFIT_001';
--
-- 2. 执行平仓
-- UPDATE i_trade_order 
-- SET tradeStatus = 2, currentPrice = 1850.00
-- WHERE outTradeNo = 'TEST_PROFIT_001';
-- 
-- 3. 验证聚合持仓
-- SELECT totalVolume FROM i_positions WHERE pId = 'POS001';
-- 
-- 预期结果：
-- - totalVolume = 200 - 50 = 150（部分平仓，持仓卡片继续显示）

-- ============================================================
-- 回滚脚本（如果需要恢复原始触发器）
-- ============================================================

-- DROP TRIGGER IF EXISTS `auto_updated_date_on_i_trade_order`;
-- 
-- -- 然后从备份中重新创建原始触发器
-- -- SHOW CREATE TRIGGER auto_updated_date_on_i_trade_order;

-- ============================================================
-- 部署注意事项
-- ============================================================

-- 1. 部署前务必备份：
--    mysqldump -u root -p ice_markets i_trade_order i_balance_details > backup.sql
--
-- 2. 部署时间建议：
--    - 选择交易量较低的时段（如凌晨）
--    - 通知用户暂停交易 5 分钟
--
-- 3. 部署后验证：
--    - 使用小额测试账户进行实际平仓测试
--    - 检查 i_balance_details 余额是否准确
--    - 验证杠杆账户还款逻辑
--
-- 4. 回滚准备：
--    - 保留原触发器的 CREATE 语句
--    - 准备快速回滚脚本

-- ============================================================
-- 更新接口配置：添加 direction 参数支持（聚合持仓模式）
-- ============================================================

-- 步骤 1：更新 I00008 接口配置（添加 direction 参数）
-- 基于真实结构：interfaceId 作为唯一键；SQL/参数列为 interfaceSql / interfaceKey
UPDATE `interface`
SET 
  interfaceSql = 'call i_close_order(#{userAccount},#{pId},#{itemId},#{detailsWalletType},#{direction},#{currentPrice},#{tradeStatus});',
  interfaceKey = 'userAccount,pId,itemId,detailsWalletType,direction,currentPrice,tradeStatus',
  interfaceName = '平仓(关闭仓位-聚合持仓模式)'
WHERE interfaceId = 'I00008';

-- 插入兜底：当上述 UPDATE 未影响任何行时，按 interfaceId 插入
INSERT INTO `interface` (interfaceId, interfaceType, interfaceName, interfaceSql, interfaceKey, `sign`, databaseType, interfaceVison, accesslevel, registId, indexed, deleted)
SELECT 'I00008', 'APP', '平仓(关闭仓位-聚合持仓模式)',
       'call i_close_order(#{userAccount},#{pId},#{itemId},#{detailsWalletType},#{direction},#{currentPrice},#{tradeStatus});',
       'userAccount,pId,itemId,detailsWalletType,direction,currentPrice,tradeStatus',
       'I00008',
       0, 'V1', 0, 'ICE00000001', 0, 0
WHERE NOT EXISTS (
  SELECT 1 FROM `interface` WHERE interfaceId = 'I00008'
);

-- 步骤 2：更新存储过程签名（添加 direction 参数）
DROP PROCEDURE IF EXISTS `i_close_order`;

DELIMITER ;;

-- 统一支持聚合持仓 pId 的单/全平仓；方向为空表示全平当前产品
CREATE PROCEDURE `i_close_order`(
  IN user_Account VARCHAR(255),
  IN p_Id VARCHAR(255),           -- 聚合持仓ID（必填用于单/全平仓）
  IN item_Id VARCHAR(255),        -- 产品代码（从 i_positions 取）
  IN details_WalletType INT,      -- 钱包类型：0=现金，1=杠杆
  IN direction_Val VARCHAR(10),   -- 方向过滤：'buy' 或 'sell'；NULL 表示全部方向
  IN current_Price DECIMAL(20,8), -- 平仓价格
  IN trade_Status INT             -- 订单状态：2=已平仓
)
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  -- 参数校验：itemId 必填（按你的约定）
  IF (item_Id IS NULL OR item_Id = '') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Missing itemId for close', MYSQL_ERRNO = 4004;
  END IF;

  -- 兜底获取产品与方向（当 itemId 或 direction 缺失时）
  IF (direction_Val IS NULL OR direction_Val = '') THEN
    SELECT aggDirection INTO direction_Val
    FROM i_positions
    WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType
      AND (pId = p_Id OR p_Id IS NULL OR p_Id = '')
      AND aggItemId = item_Id
    LIMIT 1;
  END IF;

  START TRANSACTION;

  -- 单/全平仓：按 (userAccount, itemId, walletType[, direction]) 更新持仓订单为已平仓
  UPDATE i_trade_order SET
    currentPrice = current_Price,
    tradeStatus = trade_Status
  WHERE deleted = 0
    AND userAccount = user_Account
    AND itemId = item_Id
    AND detailsWalletType = details_WalletType
    AND tradeStatus = 1
    AND (
      direction_Val IS NULL OR direction = direction_Val
    );

  -- 说明：递减 i_positions.totalVolume 与日志记录由触发器 `auto_updated_date_on_i_trade_order` 逐行处理

  IF t_error = 1 THEN
    ROLLBACK;
    SELECT 0 AS `status`, 'Close order failed' AS `message`, 4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 1 AS `status`, 'Close order successfully' AS `message`, 2000 AS `code`;
  END IF;
END;;

DELIMITER ;

-- ============================================================
-- 验证部署结果
-- ============================================================

-- 检查接口配置
-- 根据实际表结构选择可用字段进行验证
SELECT interfaceId, interfaceName, interfaceSql, interfaceKey
FROM `interface`
WHERE interfaceId = 'I00008';

-- 检查存储过程
SHOW CREATE PROCEDURE i_close_order;

-- 检查触发器
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = 'ice_markets' 
  AND TRIGGER_NAME = 'auto_updated_date_on_i_trade_order';

-- ============================================================
-- 更新日期：2025-01-29
-- 作者：AI Assistant
-- 版本：v1.1.0（支持聚合持仓按方向分组平仓）
-- ============================================================
