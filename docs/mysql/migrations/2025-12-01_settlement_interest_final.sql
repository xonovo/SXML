-- =========================================
-- 迁移: 结算幂等 + 整小时计息(最终一次性) + 精简触发器
-- 日期: 2025-12-01
-- 说明:
--  - 仅由过程结算，触发器不做记账/还款，避免重复与长事务
--  - 结算幂等: i_trade_order.settled 标记 + NOT EXISTS 双保险
--  - 利息口径: TIMESTAMPDIFF(HOUR, openedAt, closedAt) 的整小时 × 借款额 × 利率
--  - 适用于手动/自动平仓（均以 tradeStatus=2 为准）
-- =========================================

USE ice_markets;

-- =========================================
-- 1) 幂等字段与索引
-- =========================================
SET @col_settled_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'i_trade_order' AND COLUMN_NAME = 'settled'
);

SET @sql_add_col := IF(@col_settled_exists = 0,
  'ALTER TABLE i_trade_order ADD COLUMN settled TINYINT(1) NOT NULL DEFAULT 0 COMMENT "是否已结算，0=未结算 1=已结算" AFTER tradeStatus',
  'SELECT "settled column exists"');
PREPARE s1 FROM @sql_add_col; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @idx_settle_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'i_trade_order' AND INDEX_NAME = 'idx_settle_candidate'
);

SET @sql_add_idx := IF(@idx_settle_exists = 0,
  'ALTER TABLE i_trade_order ADD INDEX idx_settle_candidate (tradeStatus, settled, closedAt)',
  'SELECT "idx_settle_candidate exists"');
PREPARE s2 FROM @sql_add_idx; EXECUTE s2; DEALLOCATE PREPARE s2;

-- =========================================
-- 2) 结算过程（幂等 + 整小时计息）
-- =========================================
DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_settle_closed_orders`;;
CREATE PROCEDURE `sp_settle_closed_orders`()
BEGIN
  DECLARE v_batch_size INT DEFAULT 100;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
    SELECT 0 AS success, 'Settlement failed' AS message;
  END;

  START TRANSACTION;

  -- 2.1 盈亏结算（避重 + 小批量）
  INSERT INTO i_balance_details(
    detailsId, userAccount, detailsWalletType, detailsType, detailsSubType, 
    income, expense, outTradeNo, detailsRemarks
  )
  SELECT 
    CONCAT('IBD', UNIX_TIMESTAMP(), LPAD(FLOOR(RAND() * 10000), 4, '0')),
    o.userAccount,
    o.detailsWalletType,
    2, 20,
    GREATEST(0, CASE WHEN o.direction = 'buy' 
                     THEN (o.currentPrice - o.openPrice) * o.tradeVolume 
                     ELSE (o.openPrice - o.currentPrice) * o.tradeVolume END),
    GREATEST(0, -1 * CASE WHEN o.direction = 'buy' 
                          THEN (o.currentPrice - o.openPrice) * o.tradeVolume 
                          ELSE (o.openPrice - o.currentPrice) * o.tradeVolume END),
    o.outTradeNo,
    CONCAT('平仓结算: ', o.detailsRemarks)
  FROM i_trade_order o
  WHERE o.deleted = 0
    AND o.tradeStatus = 2
    AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    AND o.positionId IS NOT NULL
    AND o.settled = 0
    AND NOT EXISTS (
      SELECT 1 FROM i_balance_details bd
      WHERE bd.deleted = 0
        AND bd.userAccount = o.userAccount
        AND bd.outTradeNo = o.outTradeNo
        AND bd.detailsSubType IN (3,20,21)
    )
  ORDER BY o.closedAt ASC
  LIMIT v_batch_size;

  -- 2.2 杠杆利息(整小时, 一次性)
  INSERT INTO i_balance_details(
    detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
    income, expense, outTradeNo, detailsRemarks
  )
  SELECT 
    CONCAT('IBD', UNIX_TIMESTAMP(), LPAD(FLOOR(RAND() * 10000), 4, '0')),
    o.userAccount,
    o.detailsWalletType,
    3, 21,  -- 借还款/利息
    0,
    GREATEST(
      0,
      TIMESTAMPDIFF(HOUR, o.openedAt, o.closedAt) *
      GREATEST(0, ((o.openPrice + IFNULL(o.takeSpread,0)) * o.tradeVolume) - (((o.openPrice + IFNULL(o.takeSpread,0)) * o.tradeVolume) / NULLIF(o.tradeRate,0))) *
      IFNULL(u.leverInterest, 0)
    ),
    o.outTradeNo,
    CONCAT('杠杆利息(整小时): hours=', TIMESTAMPDIFF(HOUR, o.openedAt, o.closedAt))
  FROM i_trade_order o
  JOIN i_user u ON u.deleted = 0 AND u.userAccount = o.userAccount
  WHERE o.deleted = 0
    AND o.tradeStatus = 2
    AND o.detailsWalletType = 1
    AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    AND o.settled = 0
    AND TIMESTAMPDIFF(HOUR, o.openedAt, o.closedAt) > 0
    AND NOT EXISTS (
      SELECT 1 FROM i_balance_details bd
      WHERE bd.deleted = 0
        AND bd.userAccount = o.userAccount
        AND bd.outTradeNo = o.outTradeNo
        AND bd.detailsSubType = 21
    )
  ORDER BY o.closedAt ASC
  LIMIT v_batch_size;

  -- 2.3 聚合持仓递减（按近1分钟平仓订单汇总）
  UPDATE i_positions p
  INNER JOIN (
    SELECT positionId, SUM(tradeVolume) AS closedVol
    FROM i_trade_order
    WHERE deleted = 0
      AND tradeStatus = 2
      AND closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      AND positionId IS NOT NULL
    GROUP BY positionId
  ) closed ON closed.positionId = p.pId
  SET p.totalVolume = GREATEST(0, p.totalVolume - closed.closedVol),
      p.updatedAt = NOW();

  -- 2.4 标记订单为已结算（提高幂等与并发安全）
  UPDATE i_trade_order
  SET settled = 1
  WHERE deleted = 0
    AND tradeStatus = 2
    AND closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    AND settled = 0;

  COMMIT;

  SELECT 1 AS success, 'Settled successfully' AS message;
END;;
DELIMITER ;

-- =========================================
-- 3) 精简订单触发器（仅做轻量更新，不做记账/还款）
-- =========================================
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_trade_order`;
DELIMITER ;;
CREATE TRIGGER `auto_updated_date_on_i_trade_order` 
BEFORE UPDATE ON `i_trade_order` 
FOR EACH ROW 
BEGIN
  -- 更新时间戳
  SET NEW.updatedDate = CURRENT_TIMESTAMP(3);

  -- 仅在状态从 <2 变为 2（已平仓）时执行
  IF (OLD.tradeStatus < 2 AND NEW.tradeStatus = 2) THEN
    -- 设置平仓时间
    SET NEW.closedAt = CURRENT_TIMESTAMP(3);

    -- 递减聚合持仓（按用户/品种/方向/钱包类型）
    UPDATE i_positions
    SET totalVolume = GREATEST(0, totalVolume - NEW.tradeVolume),
        updatedAt = CURRENT_TIMESTAMP(3)
    WHERE deleted = 0
      AND userAccount = NEW.userAccount
      AND aggItemId = NEW.itemId
      AND aggDirection = NEW.direction
      AND detailsWalletType = NEW.detailsWalletType
      AND totalVolume > 0;

    -- 记录操作日志（不做财务入账）
    INSERT INTO i_details_log (
      logNo, userAccount, logData
    ) VALUES (
      getGenerateId('i_details_log'),
      NEW.userAccount,
      JSON_OBJECT(
        'outTradeNo', NEW.outTradeNo,
        'itemId', NEW.itemId,
        'createdDate', DATE_FORMAT(NEW.createdDate, '%Y-%m-%d %H:%i:%s'),
        'type', 1,  -- 0=开仓，1=平仓
        'openPrice', NEW.openPrice,
        'currentPrice', NEW.currentPrice,
        'tradeVolume', NEW.tradeVolume,
        'takeSpread', NEW.takeSpread,
        'walletType', NEW.detailsWalletType,
        'direction', NEW.direction,
        'tradeType', NEW.tradeType,
        'status', NEW.tradeStatus
      )
    );
  END IF;
END;;
DELIMITER ;

-- =========================================
-- 4) 验证
-- =========================================
SHOW COLUMNS FROM i_trade_order LIKE 'settled';
SHOW INDEX FROM i_trade_order WHERE Key_name = 'idx_settle_candidate';
SHOW CREATE PROCEDURE sp_settle_closed_orders;
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME = 'auto_updated_date_on_i_trade_order';
