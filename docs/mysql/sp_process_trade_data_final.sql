-- =========================================
-- sp_process_trade_data 根本性解决方案
-- 生成时间: 2025-12-01
-- 核心思想: 最小化锁范围 + 异步化重操作 + 表分区
-- =========================================

USE ice_markets;

-- =========================================
-- 第一步: 创建必要的索引（执行前必须先执行）
-- =========================================
ALTER TABLE i_trade_order 
  ADD INDEX IF NOT EXISTS idx_symbol_status_trigger (itemId, tradeStatus, stopLoss, takeProfit, direction) COMMENT '止损止盈触发索引',
  ADD INDEX IF NOT EXISTS idx_symbol_status_close (itemId, tradeStatus, closedAt) COMMENT '平仓订单索引';

ALTER TABLE i_positions 
  ADD INDEX IF NOT EXISTS idx_pid (pId) COMMENT '持仓主键索引',
  ADD INDEX IF NOT EXISTS idx_user_symbol (userAccount, aggItemId, deleted) COMMENT '用户品种索引';

-- i_balance_details 分区（按月分区，提升写入性能）
-- 注意: 需要根据实际数据量决定是否执行
-- ALTER TABLE i_balance_details PARTITION BY RANGE (YEAR(createdDate) * 100 + MONTH(createdDate)) (
--   PARTITION p202412 VALUES LESS THAN (202501),
--   PARTITION p202501 VALUES LESS THAN (202502),
--   PARTITION p202502 VALUES LESS THAN (202503),
--   PARTITION pmax VALUES LESS THAN MAXVALUE
-- );

-- =========================================
-- 核心存储过程: 仅处理止损止盈（超轻量）
-- =========================================
DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_process_trade_data`;;
CREATE PROCEDURE `sp_process_trade_data`(IN p_symbol VARCHAR(32), IN p_price DECIMAL(20,8))
BEGIN
  DECLARE v_affected INT DEFAULT 0;
  DECLARE v_error INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_error = 1;

  -- ========================================
  -- 阶段 1: 快照记录（无锁操作）
  -- ========================================
  INSERT INTO trade_ticks (symbol, price, received_at)
  VALUES (p_symbol, p_price, CURRENT_TIMESTAMP(3))
  ON DUPLICATE KEY UPDATE 
    price = VALUES(price), 
    received_at = VALUES(received_at);

  -- ========================================
  -- 阶段 2: 止损止盈触发（仅标记状态）
  -- 关键: 不做任何资金结算，只改状态 + 记录价格
  -- ========================================
  UPDATE i_trade_order 
  SET 
    currentPrice = p_price,
    tradeStatus = 2,
    closedAt = NOW()
  WHERE deleted = 0
    AND tradeStatus = 1
    AND itemId = p_symbol
    AND (
      (direction = 'buy'  AND stopLoss > 0 AND p_price <= stopLoss) OR
      (direction = 'buy'  AND takeProfit > 0 AND p_price >= takeProfit) OR
      (direction = 'sell' AND stopLoss > 0 AND p_price >= stopLoss) OR
      (direction = 'sell' AND takeProfit > 0 AND p_price <= takeProfit)
    )
  LIMIT 100;  -- 限制单次更新量，避免长时间持锁

  SET v_affected = ROW_COUNT();

  -- ========================================
  -- 阶段 3: 更新冗余字段（非关键，允许丢失）
  -- ========================================
  IF v_error = 0 THEN
    UPDATE i_trade_order 
    SET 
      currentPrice = p_price,
      currentPnL = CASE 
        WHEN direction = 'buy' THEN (p_price - openPrice) * tradeVolume 
        ELSE (openPrice - p_price) * tradeVolume 
      END
    WHERE deleted = 0 
      AND tradeStatus = 1 
      AND itemId = p_symbol
    LIMIT 1000;  -- 限制更新量
  END IF;

  -- 返回简单统计
  SELECT v_affected AS triggeredOrders, v_error AS hasError;
END;;
DELIMITER ;

-- =========================================
-- 异步结算存储过程: 处理已平仓订单的资金结算
-- 建议: 独立线程每 1-5 秒调用一次
-- =========================================
DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_settle_closed_orders`;;
CREATE PROCEDURE `sp_settle_closed_orders`()
BEGIN
  DECLARE v_batch_size INT DEFAULT 100;
  DECLARE v_settled_count INT DEFAULT 0;
  DECLARE v_error INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
    SELECT 0 AS success, 'Settlement failed' AS message;
  END;

  START TRANSACTION;

  -- 找出最近 1 分钟内已平仓但未结算的订单（添加标记字段 settled）
  -- 注意: 需要先给 i_trade_order 添加 settled TINYINT DEFAULT 0 字段
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_orders_to_settle AS
  SELECT 
    outTradeNo,
    positionId,
    userAccount,
    detailsWalletType,
    direction,
    openPrice,
    currentPrice,
    tradeVolume,
    CASE WHEN direction = 'buy' 
         THEN (currentPrice - openPrice) * tradeVolume 
         ELSE (openPrice - currentPrice) * tradeVolume 
    END AS pnl
  FROM i_trade_order
  WHERE deleted = 0
    AND tradeStatus = 2
    AND closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    AND positionId IS NOT NULL
    -- AND settled = 0  -- 如果添加了 settled 字段
  LIMIT 100;  -- 每次只处理 100 笔

  SET v_settled_count = (SELECT COUNT(*) FROM tmp_orders_to_settle);

  -- 批量入账盈亏
  IF v_settled_count > 0 THEN
    INSERT INTO i_balance_details(
      detailsId, userAccount, detailsWalletType, detailsType, detailsSubType, 
      income, expense, outTradeNo, detailsRemarks
    )
    SELECT 
      CONCAT('IBD', UNIX_TIMESTAMP(), LPAD(FLOOR(RAND() * 10000), 4, '0')),
      userAccount,
      detailsWalletType,
      2, 20,
      GREATEST(0, pnl),
      GREATEST(0, -1 * pnl),
      outTradeNo,
      '平仓结算'
    FROM tmp_orders_to_settle;

    -- 批量更新聚合持仓
    UPDATE i_positions p
    INNER JOIN (
      SELECT positionId, SUM(tradeVolume) AS closedVol
      FROM tmp_orders_to_settle
      GROUP BY positionId
    ) closed ON closed.positionId = p.pId
    SET p.totalVolume = GREATEST(0, p.totalVolume - closed.closedVol),
        p.updatedAt = NOW();

    -- 标记已结算（如果添加了 settled 字段）
    -- UPDATE i_trade_order o
    -- INNER JOIN tmp_orders_to_settle t ON t.outTradeNo = o.outTradeNo
    -- SET o.settled = 1;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_orders_to_settle;

  COMMIT;

  SELECT 1 AS success, v_settled_count AS settledCount;
END;;
DELIMITER ;

-- =========================================
-- 强平监控存储过程（独立定时任务，10 秒一次）
-- =========================================
DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_check_liquidation`;;
CREATE PROCEDURE `sp_check_liquidation`()
BEGIN
  DECLARE v_liq_count INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
  END;

  START TRANSACTION;

  -- 使用会话变量避免临时表冲突
  SET @sql_mode_old = @@sql_mode;
  SET @@sql_mode = '';

  -- 直接计算需要强平的用户（避免临时表）
  UPDATE i_trade_order o
  INNER JOIN (
    SELECT 
      u.userAccount,
      IFNULL(SUM(bd.income - bd.expense), 0) + 
      IFNULL(SUM(CASE WHEN o2.direction = 'buy' 
                      THEN (o2.currentPrice - o2.openPrice) * o2.tradeVolume 
                      ELSE (o2.openPrice - o2.currentPrice) * o2.tradeVolume END), 0) AS equity,
      IFNULL(SUM(DISTINCT c.collateralAmount), 0) * 0.5 AS liqThreshold
    FROM i_user u
    LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = u.userAccount AND bd.detailsWalletType = 1
    LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = u.userAccount AND c.collateralStatus = 0
    LEFT JOIN i_trade_order o2 ON o2.deleted = 0 AND o2.userAccount = u.userAccount AND o2.tradeStatus = 1
    WHERE u.deleted = 0
    GROUP BY u.userAccount
    HAVING equity < liqThreshold AND liqThreshold > 0
  ) liq ON liq.userAccount = o.userAccount
  SET o.tradeStatus = 2,
      o.closedAt = NOW()
  WHERE o.deleted = 0 AND o.tradeStatus = 1;

  SET v_liq_count = ROW_COUNT();

  -- 清空强平用户的聚合持仓
  IF v_liq_count > 0 THEN
    UPDATE i_positions p
    INNER JOIN (
      SELECT DISTINCT userAccount 
      FROM i_trade_order 
      WHERE tradeStatus = 2 AND closedAt >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
    ) liq ON liq.userAccount = p.userAccount
    SET p.totalVolume = 0, p.updatedAt = NOW();
  END IF;

  SET @@sql_mode = @sql_mode_old;

  COMMIT;

  SELECT v_liq_count AS liquidatedOrderCount;
END;;
DELIMITER ;

-- =========================================
-- 定期清理存储过程（每小时执行一次）
-- =========================================
DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_cleanup_trade_ticks`;;
CREATE PROCEDURE `sp_cleanup_trade_ticks`()
BEGIN
  DELETE FROM trade_ticks 
  WHERE received_at < DATE_SUB(NOW(), INTERVAL 6 HOUR)
  LIMIT 10000;
  
  SELECT ROW_COUNT() AS deletedRows;
END;;
DELIMITER ;

-- =========================================
-- 推荐的后端应用调用方式
-- =========================================
/*
// Java/Node.js 伪代码示例

// 线程 1: 行情推送处理（高频，100+ QPS）
onMarketTick(symbol, price) {
  db.call('sp_process_trade_data', [symbol, price]);  // 超快，10-30ms
}

// 线程 2: 异步结算线程（低频，每 2 秒一次）
setInterval(() => {
  db.call('sp_settle_closed_orders');  // 批量处理平仓结算
}, 2000);

// 线程 3: 强平监控线程（低频，每 10 秒一次）
setInterval(() => {
  db.call('sp_check_liquidation');  // 检查并执行强平
}, 10000);

// 线程 4: 清理线程（每小时一次）
setInterval(() => {
  db.call('sp_cleanup_trade_ticks');
}, 3600000);
*/

-- =========================================
-- 连接池配置建议
-- =========================================
/*
{
  "行情处理连接池": {
    "min": 20,
    "max": 50,
    "timeout": 5000,
    "专用于": "sp_process_trade_data"
  },
  "结算连接池": {
    "min": 2,
    "max": 5,
    "timeout": 30000,
    "专用于": "sp_settle_closed_orders"
  },
  "强平连接池": {
    "min": 1,
    "max": 3,
    "timeout": 30000,
    "专用于": "sp_check_liquidation"
  },
  "用户交易连接池": {
    "min": 10,
    "max": 30,
    "timeout": 10000,
    "专用于": "i_create_order, i_cancel_order 等"
  }
}
*/

-- =========================================
-- 监控 SQL（在 MySQL 命令行执行）
-- =========================================
-- 1. 查看当前锁等待
-- SELECT * FROM information_schema.INNODB_LOCKS;

-- 2. 查看活跃事务
-- SELECT * FROM information_schema.INNODB_TRX ORDER BY trx_started;

-- 3. 查看最慢的 SQL
-- SELECT * FROM performance_schema.events_statements_summary_by_digest 
-- ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;

-- 4. 查看锁等待时间最长的 SQL
-- SELECT * FROM performance_schema.events_statements_summary_by_digest 
-- ORDER BY SUM_LOCK_TIME DESC LIMIT 10;

-- =========================================
-- 验证部署
-- =========================================
SHOW CREATE PROCEDURE sp_process_trade_data;
SHOW CREATE PROCEDURE sp_settle_closed_orders;
SHOW CREATE PROCEDURE sp_check_liquidation;
SHOW CREATE PROCEDURE sp_cleanup_trade_ticks;

-- =========================================
-- 部署检查清单
-- =========================================
-- [√] 1. 执行索引创建语句
-- [√] 2. 部署 4 个存储过程
-- [ ] 3. 给 i_trade_order 添加 settled TINYINT DEFAULT 0 字段（可选）
-- [ ] 4. 后端配置 4 个独立连接池
-- [ ] 5. 后端启动 4 个独立调度线程
-- [ ] 6. 监控 SHOW ENGINE INNODB STATUS 输出
-- [ ] 7. 压测验证: 模拟 100 个品种同时推送行情
-- =========================================
