-- =========================================
-- 禁用利息定时计提逻辑
-- 生成时间: 2025-12-01
-- 说明: 注释掉 sp_process_trade_data 中的利息计提部分
--       利息改为在最终结算时一次性计算
-- =========================================

USE ice_markets;

DELIMITER ;;
DROP PROCEDURE IF EXISTS `sp_process_trade_data`;;
CREATE PROCEDURE `sp_process_trade_data`(IN p_symbol VARCHAR(32), IN p_price DECIMAL(20,8))
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE details_Id VARCHAR(255);
  DECLARE affected INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;

  -- 记录行情快照（轻量限时缓存）
  INSERT INTO trade_ticks (symbol, price, received_at)
  VALUES (p_symbol, p_price, CURRENT_TIMESTAMP(3));

  DELETE FROM trade_ticks 
  WHERE received_at < DATE_SUB(NOW(), INTERVAL 5 HOUR);

  -- 1) 止损/止盈触发（将持仓订单标记为已平仓）
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

  -- 对正常平仓的订单，入账实现盈亏，并递减聚合持仓仓位（非强平）
  -- 计算每笔已平仓订单的实现盈亏
  INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,expense,outTradeNo,detailsRemarks)
  SELECT 
    getGenerateId('i_balance_details'),
    o.userAccount,
    o.detailsWalletType,
    2, 20,
    CASE WHEN (
      CASE WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume ELSE (o.openPrice - p_price) * o.tradeVolume END
    ) > 0 THEN (
      CASE WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume ELSE (o.openPrice - p_price) * o.tradeVolume END
    ) ELSE 0 END,
    CASE WHEN (
      CASE WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume ELSE (o.openPrice - p_price) * o.tradeVolume END
    ) < 0 THEN ABS(
      CASE WHEN o.direction = 'buy' THEN (p_price - o.openPrice) * o.tradeVolume ELSE (o.openPrice - p_price) * o.tradeVolume END
    ) ELSE 0 END,
    o.outTradeNo,
    '正常平仓PNL'
  FROM i_trade_order o
  WHERE o.deleted = 0 AND o.tradeStatus = 2 AND o.itemId = p_symbol AND o.closedAt IS NOT NULL AND o.positionId IS NOT NULL
    AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE);

  -- 递减聚合持仓总仓位（同品种同方向），均价保持不变（可选实现 FIFO/LIFO 另行扩展）
  UPDATE i_positions p
  JOIN (
    SELECT positionId AS pid, SUM(tradeVolume) AS closedVolume
    FROM i_trade_order
    WHERE deleted = 0 AND tradeStatus = 2 AND itemId = p_symbol AND closedAt IS NOT NULL AND positionId IS NOT NULL
      AND closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    GROUP BY positionId
  ) c ON c.pid = p.pId
  SET p.totalVolume = GREATEST(p.totalVolume - c.closedVolume, 0),
      p.updatedAt = NOW()
  WHERE p.deleted = 0;

  -- ========================================
  -- 2) 杠杆账户时息计提 - 已禁用（2025-12-01）
  -- ========================================
  -- 原因: 改为在最终结算时一次性计算利息，避免定时任务占用数据库连接池
  -- 
  -- 以下逻辑已注释:
  -- - UPDATE i_lever: 累加借款利息到 leverAmount
  -- - INSERT INTO i_balance_details: 将利息入账为费用流水
  -- - UPDATE i_positions: 累加聚合持仓的 interestAccrued
  --
  -- 如需恢复，请参考: docs/mysql/sp_optimization.sql (2025-11-29 版本)
  -- ========================================
  /*
  UPDATE i_lever l
  JOIN i_user u ON u.userAccount = l.userAccount AND u.deleted = 0
  SET 
    l.leverAmount = l.leverAmount + (l.leverAmount * u.leverInterest),
    l.updatedAt = NOW()
  WHERE l.deleted = 0 AND l.leverStatus = 0;

  INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,expense,outTradeNo,detailsRemarks)
  SELECT 
    getGenerateId('i_balance_details'),
    l.userAccount,
    1,
    4,31,
    (l.leverAmount * u.leverInterest),
    l.leverId,
    '小时利息计提'
  FROM i_lever l
  JOIN i_user u ON u.userAccount = l.userAccount AND u.deleted = 0
  WHERE l.deleted = 0 AND l.leverStatus = 0;

  UPDATE i_positions p
  JOIN i_user u ON u.userAccount = p.userAccount AND u.deleted = 0
  JOIN i_lever l ON l.userAccount = p.userAccount AND l.deleted = 0 AND l.leverStatus = 0
  SET p.interestAccrued = p.interestAccrued + (l.leverAmount * u.leverInterest),
      p.updatedAt = NOW()
  WHERE p.deleted = 0 AND p.totalVolume > 0;
  */

  -- 3) 更新持仓冗余指标（简化示例）：currentIndexPrice / currentPnL
  -- PnL = (direction='buy' ? (p_price - openPrice) : (openPrice - p_price)) * tradeVolume
  UPDATE i_trade_order o
  SET 
    o.currentPrice = p_price,
    o.currentPnL = (
      CASE WHEN o.direction = 'buy' 
           THEN (p_price - o.openPrice) * o.tradeVolume 
           ELSE (o.openPrice - p_price) * o.tradeVolume END
    )
  WHERE o.deleted = 0 AND o.tradeStatus = 1 AND o.itemId = p_symbol;

  -- 同步聚合持仓的浮盈亏（仅冗余，前端也可即时计算）
  UPDATE i_positions p
  JOIN (
    SELECT positionId, 
           SUM(CASE WHEN direction = 'buy' THEN (p_price - openPrice) * tradeVolume ELSE (openPrice - p_price) * tradeVolume END) AS pnl
    FROM i_trade_order
    WHERE deleted = 0 AND tradeStatus = 1 AND itemId = p_symbol AND positionId IS NOT NULL
    GROUP BY positionId
  ) t ON t.positionId = p.pId
  SET p.updatedAt = NOW()
  WHERE p.deleted = 0;

  -- 4) 简化强平判定骨架（按 50% 抵押阈值）
  -- 提示：实际应基于账户权益与阈值对比，此处骨架仅示意，具体公式请按你们生产口径替换
  -- 伪公式：当某用户在该品种的累计亏损超过 (collateral * 0.5) 时，触发强平
  -- 注意：以下为示意更新，需替换为你们的真实权益计算与用户范围筛选
  -- UPDATE i_trade_order o ... SET tradeStatus=2 WHERE 条件;

    -- 强平实现（示意）：
    -- 定义：账户权益 = 杠杆钱包余额 + 浮动盈亏累计；强平阈值 = 抵押金 * 0.5
    -- 当权益 < 阈值，则对该用户在该品种的所有持仓执行强平（tradeStatus=2），并将实现盈亏入账
    -- 1) 计算每用户在该品种的浮动盈亏
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_user_symbol_pnl AS
    SELECT o.userAccount,
      o.itemId,
      SUM(
        CASE WHEN o.direction = 'buy' 
        THEN (p_price - o.openPrice) * o.tradeVolume 
        ELSE (o.openPrice - p_price) * o.tradeVolume END
      ) AS totalPnL
    FROM i_trade_order o
    WHERE o.deleted = 0 AND o.tradeStatus = 1 AND o.itemId = p_symbol
    GROUP BY o.userAccount, o.itemId;

    -- 2) 取杠杆余额与抵押
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_user_equity AS
    SELECT t.userAccount,
      t.itemId,
      IFNULL((SELECT SUM(bd.income - bd.expense) FROM i_balance_details bd 
         WHERE bd.deleted = 0 AND bd.userAccount = t.userAccount AND bd.detailsWalletType = 1), 0) AS leveragedBalance,
      IFNULL((SELECT SUM(c.collateralAmount) FROM i_collateral c 
         WHERE c.deleted = 0 AND c.userAccount = t.userAccount AND c.collateralStatus = 0), 0) AS collateral,
      t.totalPnL
    FROM tmp_user_symbol_pnl t;

    -- 3) 找出需要强平的用户
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_user_liq AS
    SELECT userAccount, itemId, leveragedBalance, collateral, totalPnL,
      (leveragedBalance + totalPnL) AS equity,
      (collateral * 0.5) AS liqThreshold
    FROM tmp_user_equity
    WHERE (leveragedBalance + totalPnL) < (collateral * 0.5);

    -- 4) 对需要强平的用户进行平仓，并将实现盈亏入账
    -- 标记平仓
    UPDATE i_trade_order o
    JOIN tmp_user_liq liq ON liq.userAccount = o.userAccount AND liq.itemId = o.itemId
    SET o.tradeStatus = 2,
        o.closedAt = NOW(),
        o.currentPrice = p_price
    WHERE o.deleted = 0 AND o.tradeStatus = 1;

      -- 强平后，将聚合持仓的总仓位清零（示例：实际可按量减少）
      UPDATE i_positions p
      JOIN tmp_user_liq liq ON liq.userAccount = p.userAccount AND liq.itemId = p.aggItemId
      SET p.totalVolume = 0,
        p.updatedAt = NOW()
      WHERE p.deleted = 0;

    -- 入账：将 totalPnL 入账至杠杆钱包（盈亏为 income/expense 二选一）
    INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,expense,outTradeNo,detailsRemarks)
    SELECT 
      getGenerateId('i_balance_details'),
      liq.userAccount,
      1,
      2, 21,
      CASE WHEN liq.totalPnL > 0 THEN liq.totalPnL ELSE 0 END,
      CASE WHEN liq.totalPnL < 0 THEN ABS(liq.totalPnL) ELSE 0 END,
      p_symbol,
      '强平结算PNL'
    FROM tmp_user_liq liq;

    -- 清理临时表
    DROP TEMPORARY TABLE IF EXISTS tmp_user_symbol_pnl;
    DROP TEMPORARY TABLE IF EXISTS tmp_user_equity;
    DROP TEMPORARY TABLE IF EXISTS tmp_user_liq;

  -- 返回监控统计：止盈/止损平仓数 + 强平入账数
  SELECT affected AS closedCount,
         (SELECT COUNT(1) FROM i_balance_details bd WHERE bd.deleted = 0 AND bd.detailsRemarks = '强平结算PNL' AND bd.outTradeNo = p_symbol AND bd.updatedDate >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)) AS liquidationBooked;
END;;
DELIMITER ;

-- 验证存储过程重建是否成功
SHOW CREATE PROCEDURE sp_process_trade_data;

-- =========================================
-- 使用说明
-- =========================================
-- 1. 执行本脚本后，利息定时计提功能将被禁用
-- 2. 利息计算应在平仓/结算时进行，公式示例:
--    CEILING(TIMESTAMPDIFF(HOUR, l.createdDate, NOW())) * (l.leverAmount * l.leverInterest)
-- 3. 相关字段仍然保留，前端展示不受影响:
--    - i_get_balance 返回的 totalInterest
--    - i_get_orderinfo 返回的 hourlyInterest
-- 4. 如需恢复利息计提，请参考 sp_optimization.sql 原始版本
-- =========================================
