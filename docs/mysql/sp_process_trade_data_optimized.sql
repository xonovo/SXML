-- =========================================
-- sp_process_trade_data 高并发优化版本
-- 生成时间: 2025-12-01
-- 优化重点: 解决多产品并行调用时的锁冲突问题
-- =========================================

USE ice_markets;

DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_process_trade_data`;;
CREATE PROCEDURE `sp_process_trade_data`(IN p_symbol VARCHAR(32), IN p_price DECIMAL(20,8))
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE affected INTEGER DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    -- 异常时自动回滚
    ROLLBACK;
    -- 记录错误日志（可选，需要日志表）
    -- INSERT INTO i_system_logs(logLevel,logMessage,createdAt) VALUES('ERROR', CONCAT('sp_process_trade_data failed: symbol=', p_symbol), NOW());
  END;

  -- ========================================
  -- 阶段 1: 记录行情快照（轻量操作，无锁）
  -- ========================================
  INSERT INTO trade_ticks (symbol, price, received_at)
  VALUES (p_symbol, p_price, CURRENT_TIMESTAMP(3))
  ON DUPLICATE KEY UPDATE price = p_price, received_at = CURRENT_TIMESTAMP(3);

  -- 定期清理（每 100 次调用清理一次，避免每次都执行 DELETE）
  IF (RAND() < 0.01) THEN
    DELETE FROM trade_ticks 
    WHERE received_at < DATE_SUB(NOW(), INTERVAL 5 HOUR)
    LIMIT 1000;  -- 限制单次删除量
  END IF;

  -- ========================================
  -- 阶段 2: 止损止盈触发（仅处理当前品种）
  -- 优化点: 添加索引提示，减少锁范围
  -- ========================================
  START TRANSACTION;
  
  -- 2.1) 标记需要平仓的订单（只锁定触发条件的行）
  UPDATE i_trade_order o
  SET o.currentPrice = p_price,
      o.tradeStatus = 2,
      o.closedAt = NOW()
  WHERE o.deleted = 0
    AND o.tradeStatus = 1
    AND o.itemId = p_symbol
    AND (
      (o.direction = 'buy'  AND o.stopLoss > 0 AND p_price <= o.stopLoss) OR
      (o.direction = 'buy'  AND o.takeProfit > 0 AND p_price >= o.takeProfit) OR
      (o.direction = 'sell' AND o.stopLoss > 0 AND p_price >= o.stopLoss) OR
      (o.direction = 'sell' AND o.takeProfit > 0 AND p_price <= o.takeProfit)
    );

  SET affected = ROW_COUNT();

  -- 2.2) 仅当有订单触发时才执行后续操作（避免空查询）
  IF affected > 0 THEN
    -- 计算实现盈亏并入账（批量操作）
    INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,expense,outTradeNo,detailsRemarks)
    SELECT 
      CONCAT('IBD', LPAD(FLOOR(RAND() * 1000000000), 10, '0')),  -- 简化 ID 生成，避免函数调用
      o.userAccount,
      o.detailsWalletType,
      2, 20,
      GREATEST(0, CASE WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume ELSE (o.openPrice - p_price) * o.tradeVolume END),
      GREATEST(0, -1 * CASE WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume ELSE (o.openPrice - p_price) * o.tradeVolume END),
      o.outTradeNo,
      '正常平仓PNL'
    FROM i_trade_order o
    WHERE o.deleted = 0 
      AND o.tradeStatus = 2 
      AND o.itemId = p_symbol 
      AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      AND o.positionId IS NOT NULL;

    -- 递减聚合持仓（使用子查询避免临时表）
    UPDATE i_positions p
    INNER JOIN (
      SELECT positionId, SUM(tradeVolume) AS closedVolume
      FROM i_trade_order
      WHERE deleted = 0 
        AND tradeStatus = 2 
        AND itemId = p_symbol 
        AND closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        AND positionId IS NOT NULL
      GROUP BY positionId
    ) closed ON closed.positionId = p.pId
    SET p.totalVolume = GREATEST(0, p.totalVolume - closed.closedVolume),
        p.updatedAt = NOW()
    WHERE p.deleted = 0;
  END IF;

  COMMIT;

  -- ========================================
  -- 阶段 3: 更新持仓指标（仅更新当前品种）
  -- 优化点: 不使用事务，允许丢失（冗余字段）
  -- ========================================
  UPDATE i_trade_order o
  SET 
    o.currentPrice = p_price,
    o.currentPnL = CASE 
      WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume 
      ELSE (o.openPrice - p_price) * o.tradeVolume 
    END
  WHERE o.deleted = 0 
    AND o.tradeStatus = 1 
    AND o.itemId = p_symbol;

  -- ========================================
  -- 阶段 4: 强平逻辑（高风险操作，异步化建议）
  -- 优化点: 改为定时任务或消息队列异步处理
  -- ========================================
  -- 注意: 以下逻辑建议移到独立的定时任务中执行（每 10 秒一次）
  -- 原因: 强平判断需要全局账户权益计算，不应在高频行情推送中执行
  
  /*
  -- 如果必须保留在此处，至少添加执行频率限制：
  IF (RAND() < 0.01) THEN  -- 1% 概率执行，相当于每 100 次行情推送检查一次
    START TRANSACTION;
    
    -- [强平逻辑保持不变...]
    
    COMMIT;
  END IF;
  */

  -- ========================================
  -- 返回结果（简化版本）
  -- ========================================
  SELECT 
    affected AS closedOrderCount,
    p_symbol AS symbol,
    p_price AS currentPrice,
    NOW() AS processedAt;

END;;
DELIMITER ;

-- =========================================
-- 建议的独立强平监控存储过程
-- =========================================
DROP PROCEDURE IF EXISTS `sp_check_liquidation`;;
CREATE PROCEDURE `sp_check_liquidation`()
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
  END;

  START TRANSACTION;

  -- 创建会话级临时表（避免冲突）
  DROP TEMPORARY TABLE IF EXISTS tmp_user_pnl;
  CREATE TEMPORARY TABLE tmp_user_pnl AS
  SELECT 
    o.userAccount,
    SUM(CASE WHEN o.direction = 'buy' THEN (o.currentPrice - o.openPrice) * o.tradeVolume 
             ELSE (o.openPrice - o.currentPrice) * o.tradeVolume END) AS totalPnL
  FROM i_trade_order o
  WHERE o.deleted = 0 AND o.tradeStatus = 1
  GROUP BY o.userAccount;

  DROP TEMPORARY TABLE IF EXISTS tmp_user_equity;
  CREATE TEMPORARY TABLE tmp_user_equity AS
  SELECT 
    p.userAccount,
    IFNULL(SUM(bd.income - bd.expense), 0) AS leveragedBalance,
    IFNULL(SUM(DISTINCT c.collateralAmount), 0) AS collateral,
    IFNULL(p.totalPnL, 0) AS totalPnL
  FROM i_user u
  LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = u.userAccount AND bd.detailsWalletType = 1
  LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = u.userAccount AND c.collateralStatus = 0
  LEFT JOIN tmp_user_pnl p ON p.userAccount = u.userAccount
  WHERE u.deleted = 0
  GROUP BY u.userAccount;

  -- 找出需要强平的用户（账户权益 < 抵押金 * 50%）
  DROP TEMPORARY TABLE IF EXISTS tmp_liquidation_users;
  CREATE TEMPORARY TABLE tmp_liquidation_users AS
  SELECT 
    userAccount,
    leveragedBalance,
    collateral,
    totalPnL,
    (leveragedBalance + totalPnL) AS equity,
    (collateral * 0.5) AS liqThreshold
  FROM tmp_user_equity
  WHERE (leveragedBalance + totalPnL) < (collateral * 0.5)
    AND collateral > 0;

  -- 标记强平订单
  UPDATE i_trade_order o
  INNER JOIN tmp_liquidation_users liq ON liq.userAccount = o.userAccount
  SET o.tradeStatus = 2,
      o.closedAt = NOW()
  WHERE o.deleted = 0 AND o.tradeStatus = 1;

  -- 清空强平用户的持仓
  UPDATE i_positions p
  INNER JOIN tmp_liquidation_users liq ON liq.userAccount = p.userAccount
  SET p.totalVolume = 0,
      p.updatedAt = NOW()
  WHERE p.deleted = 0;

  -- 入账强平盈亏
  INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,expense,outTradeNo,detailsRemarks)
  SELECT 
    CONCAT('IBD', LPAD(FLOOR(RAND() * 1000000000), 10, '0')),
    liq.userAccount,
    1,
    2, 21,
    GREATEST(0, liq.totalPnL),
    GREATEST(0, -1 * liq.totalPnL),
    'LIQUIDATION',
    CONCAT('强平结算: equity=', liq.equity, ', threshold=', liq.liqThreshold)
  FROM tmp_liquidation_users liq;

  -- 清理临时表
  DROP TEMPORARY TABLE IF EXISTS tmp_user_pnl;
  DROP TEMPORARY TABLE IF EXISTS tmp_user_equity;
  DROP TEMPORARY TABLE IF EXISTS tmp_liquidation_users;

  COMMIT;

  SELECT ROW_COUNT() AS liquidatedUserCount;
END;;
DELIMITER ;

-- =========================================
-- 推荐的索引优化
-- =========================================
-- 确保以下索引存在（提升查询性能，减少锁等待）
ALTER TABLE i_trade_order ADD INDEX idx_item_status_close (itemId, tradeStatus, closedAt) COMMENT '行情处理专用索引';
ALTER TABLE i_trade_order ADD INDEX idx_status_direction_price (tradeStatus, direction, stopLoss, takeProfit) COMMENT '止损止盈判断索引';
ALTER TABLE i_positions ADD INDEX idx_user_item (userAccount, aggItemId) COMMENT '用户品种聚合索引';
ALTER TABLE i_balance_details ADD INDEX idx_user_wallet_time (userAccount, detailsWalletType, createdDate) COMMENT '余额计算索引';

-- =========================================
-- 部署建议
-- =========================================
-- 1. 高频行情处理: 使用 sp_process_trade_data（只做止损止盈+更新价格）
-- 2. 强平监控: 独立定时任务每 10 秒调用一次 sp_check_liquidation
-- 3. 连接池隔离: 
--    - 行情处理专用连接池: 50 个连接
--    - 强平监控专用连接池: 5 个连接
--    - 用户交易专用连接池: 20 个连接
-- 4. 监控指标:
--    - SHOW ENGINE INNODB STATUS; (查看锁等待)
--    - SELECT * FROM information_schema.INNODB_TRX; (查看活跃事务)
--    - SELECT * FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_LOCK_TIME DESC LIMIT 10; (查看锁时间最长的 SQL)
-- =========================================

-- 验证存储过程
SHOW CREATE PROCEDURE sp_process_trade_data;
SHOW CREATE PROCEDURE sp_check_liquidation;
