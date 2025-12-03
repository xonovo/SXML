-- =========================================
-- 迁移: 将订单级计息切换为借据级计息（i_lever 逐笔整小时）
-- 日期: 2025-12-01
-- 说明:
--  - 计息口径：hours = TIMESTAMPDIFF(HOUR, createdDate, NOW()) 向下取整
--  - 利息 = hours * leverAmount * leverInterest（优先取 i_lever.leverInterest，缺省回退 i_user.leverInterest）
--  - 仅在“无任何杠杆持仓时”尝试偿还本金+利息（一次性），避免中途重复扣费
--  - 幂等：仅处理 repaymentDate IS NULL 的借据，记账后设置 repaymentDate，避免重复
--  - 用法：在结算过程调用 sp_repay_due_leverage(user)；亦可独立定时调用
-- =========================================

USE ice_markets;

DELIMITER ;;

-- 逐用户偿还：在无杠杆持仓时，按时间顺序偿还其未还借据（本金+整小时利息）
DROP PROCEDURE IF EXISTS `sp_repay_due_leverage`;;
CREATE PROCEDURE `sp_repay_due_leverage`(IN p_userAccount VARCHAR(255))
proc_label: BEGIN
  DECLARE v_balance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_has_open INT DEFAULT 0;
  DECLARE v_collateralId VARCHAR(255);
  DECLARE v_leverId VARCHAR(255);
  DECLARE v_amount DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_interestRate DECIMAL(10,8) DEFAULT 0.00000000;
  DECLARE v_fallbackRate DECIMAL(10,8) DEFAULT 0.00000000;
  DECLARE v_hours BIGINT DEFAULT 0;
  DECLARE v_interest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_totalPay DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_now DATETIME(3);
  DECLARE t_error INTEGER DEFAULT 0; 
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  IF p_userAccount IS NULL OR p_userAccount = '' THEN LEAVE proc_label; END IF;

  -- 若仍有杠杆持仓，直接退出（仅在“最终结算”时偿还）
  SELECT COUNT(*) INTO v_has_open
  FROM i_trade_order
  WHERE deleted = 0 AND userAccount = p_userAccount AND detailsWalletType = 1 AND tradeStatus = 1;
  IF v_has_open > 0 THEN LEAVE proc_label; END IF;

  -- 杠杆钱包余额
  SELECT IFNULL(SUM(income) - SUM(expense), 0)
    INTO v_balance
  FROM i_balance_details
  WHERE deleted = 0 AND userAccount = p_userAccount AND detailsWalletType = 1;

  -- 回退利率（如借据未存利率）
  SELECT IFNULL(leverInterest, 0) INTO v_fallbackRate
  FROM i_user WHERE deleted = 0 AND userAccount = p_userAccount
  LIMIT 1;

  SET v_now = CURRENT_TIMESTAMP(3);

  repay_loop: WHILE TRUE DO
    -- 取最早一笔未还借据
    SELECT collateralId, leverId, IFNULL(leverAmount,0), IFNULL(leverInterest, v_fallbackRate),
           TIMESTAMPDIFF(HOUR, createdDate, v_now)
      INTO v_collateralId, v_leverId, v_amount, v_interestRate, v_hours
    FROM i_lever
    WHERE deleted = 0 AND userAccount = p_userAccount AND repaymentDate IS NULL
    ORDER BY createdDate ASC
    LIMIT 1;

    -- 无待还借据 => 退出
    IF v_leverId IS NULL OR v_leverId = '' THEN LEAVE repay_loop; END IF;

    -- 按整小时计息
    SET v_interest = GREATEST(0, v_hours * v_amount * IFNULL(v_interestRate, 0));
    SET v_totalPay = v_amount + v_interest;

    -- 余额不足 => 本次不处理，退出（等待后续补充资金后再次调用）
    IF v_balance < v_totalPay THEN LEAVE repay_loop; END IF;

    START TRANSACTION;
      -- 标记借据已还
      UPDATE i_lever SET
        leverStatus = 1,
        repaymentInterest = v_interest,
        repaymentDate = v_now
      WHERE deleted = 0 AND leverId = v_leverId;

      -- 释放抵押品
      UPDATE i_collateral SET
        collateralStatus = 1
      WHERE deleted = 0 AND collateralId = v_collateralId;

      -- 记账：本金+利息
      INSERT INTO i_balance_details (
        detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
        expense, outTradeNo, detailsRemarks
      ) VALUES (
        getGenerateId('i_balance_details'), p_userAccount, 1, 3, 7,
        v_totalPay, v_leverId, CONCAT('自动偿还本金+利息(整小时): hours=', v_hours)
      );
    COMMIT;

    -- 更新可用余额，继续尝试偿还下一笔
    SET v_balance = v_balance - v_totalPay;
  END WHILE;
END;;

-- 结算过程：移除“订单级计息”，结算后尝试偿还借据（对候选用户逐一调用）
DROP PROCEDURE IF EXISTS `sp_settle_closed_orders`;;
CREATE PROCEDURE `sp_settle_closed_orders`()
BEGIN
  DECLARE v_batch_size INT DEFAULT 100;
  DECLARE v_user VARCHAR(255);
  DECLARE done INT DEFAULT 0;

  DECLARE cur_users CURSOR FOR
    SELECT DISTINCT o.userAccount
    FROM i_trade_order o
    WHERE o.deleted = 0
      AND o.tradeStatus = 2
      AND o.detailsWalletType = 1
      AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
    SELECT 0 AS success, 'Settlement failed' AS message;
  END;

  START TRANSACTION;
  -- 2.1 盈亏结算（与既有保持一致，避免重复）
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

  -- 2.3 聚合持仓递减
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

  -- 2.4 标记订单为已结算
  UPDATE i_trade_order
  SET settled = 1
  WHERE deleted = 0
    AND tradeStatus = 2
    AND closedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    AND settled = 0;

  COMMIT;

  -- 3) 对候选用户尝试偿还借据（当用户已无杠杆持仓时）
  OPEN cur_users;
  user_loop: LOOP
    FETCH cur_users INTO v_user;
    IF done = 1 THEN LEAVE user_loop; END IF;
    CALL sp_repay_due_leverage(v_user);
  END LOOP;
  CLOSE cur_users;

  SELECT 1 AS success, 'Settled successfully (lever-based interest)' AS message;
END;;

DELIMITER ;

-- =========================================
-- 验证
-- =========================================
SHOW CREATE PROCEDURE sp_repay_due_leverage;
SHOW CREATE PROCEDURE sp_settle_closed_orders;
