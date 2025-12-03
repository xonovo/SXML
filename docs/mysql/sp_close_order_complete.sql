-- ============================================================
-- 完整平仓存储过程：i_close_order_complete
-- 功能：
-- 1. 计算实际盈亏（考虑点差和利息）
-- 2. 杠杆账户自动还款（平仓即还款）
-- 3. 入账余额明细
-- 4. 更新持仓表状态
-- 5. 释放保证金
-- 6. 触发器联动：自动记录平仓时间 closedAt
-- ============================================================

DROP PROCEDURE IF EXISTS `i_close_order_complete`;
DELIMITER ;;

CREATE PROCEDURE `i_close_order_complete`(
  IN user_Account VARCHAR(255),
  IN out_TradeNo VARCHAR(255),  -- 如果为 NULL，则全部平仓（慎用）
  IN item_Id VARCHAR(255),       -- 选择金融产品（用于批量平仓）
  IN current_Price DECIMAL(20,8), -- 平仓价格
  IN trade_Status INT             -- 订单状态：2=已平仓
)
BEGIN
  -- 变量声明
  DECLARE v_outTradeNo, v_itemId, v_direction, v_detailsId, v_leverId VARCHAR(255);
  DECLARE v_detailsWalletType INT;
  DECLARE v_openPrice, v_tradeVolume, v_takeSpread, v_swap DECIMAL(20,8);
  DECLARE v_tradeRate DECIMAL(4,2);
  DECLARE v_totalCost, v_totalRevenue, v_pnl, v_netPnl DECIMAL(20,8);
  DECLARE v_repayAmount, v_leverBalance, v_borrowed DECIMAL(20,8);
  DECLARE done INT DEFAULT 0;
  DECLARE t_error INT DEFAULT 0;
  
  -- 游标：遍历需要平仓的订单
  DECLARE order_cursor CURSOR FOR
    SELECT 
      outTradeNo, itemId, detailsWalletType, direction,
      openPrice, tradeVolume, takeSpread, swap, tradeRate
    FROM i_trade_order
    WHERE deleted = 0 
      AND userAccount = user_Account
      AND tradeStatus = 1  -- 仅平仓「持仓中」的订单
      AND (out_TradeNo IS NULL OR outTradeNo = out_TradeNo)
      AND (item_Id IS NULL OR item_Id = '' OR itemId = item_Id);
  
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;
  
  START TRANSACTION;
  
  -- ========================================
  -- 1. 遍历所有待平仓订单
  -- ========================================
  OPEN order_cursor;
  
  read_loop: LOOP
    FETCH order_cursor INTO 
      v_outTradeNo, v_itemId, v_detailsWalletType, v_direction,
      v_openPrice, v_tradeVolume, v_takeSpread, v_swap, v_tradeRate;
    
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    -- ========================================
    -- 2. 计算盈亏（PnL）
    -- ========================================
    -- 开仓总成本 = 开仓价×数量 + 总点差费用
    -- 注意：takeSpread 已经是总费用（单位点差×数量），不能再乘以数量
    SET v_totalCost = (v_openPrice * v_tradeVolume) + v_takeSpread;
    
    -- 平仓总收入 = 平仓价 × 数量
    SET v_totalRevenue = current_Price * v_tradeVolume;
    
    -- 原始盈亏 = 收入 - 成本（做多）或 成本 - 收入（做空）
    IF v_direction = 'buy' THEN
      SET v_pnl = v_totalRevenue - v_totalCost;
    ELSE
      SET v_pnl = v_totalCost - v_totalRevenue;
    END IF;
    
    -- 净盈亏 = 原始盈亏 - 利息（杠杆账户）
    SET v_netPnl = v_pnl - IFNULL(v_swap, 0);
    
    -- ========================================
    -- 3. 更新订单状态为「已平仓」
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = current_Price,
      tradeStatus = trade_Status,
      closedAt = NOW(),  -- 触发器会自动设置，这里显式更新更安全
      pnl = v_netPnl     -- 记录实际盈亏（如果表有此字段）
    WHERE deleted = 0 
      AND userAccount = user_Account 
      AND outTradeNo = v_outTradeNo;
    
    -- ========================================
    -- 4. 入账余额明细（平仓收入）
    -- ========================================
    SET v_detailsId = getGenerateId('i_balance_details');
    
    INSERT INTO i_balance_details (
      detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
      income, expense, outTradeNo, detailsRemarks
    ) VALUES (
      v_detailsId,
      user_Account,
      v_detailsWalletType,
      1,  -- detailsType: 1=交易
      3,  -- detailsSubType: 3=平仓卖出
      CASE 
        WHEN v_netPnl > 0 THEN v_totalCost + v_netPnl  -- 盈利：本金+盈利
        ELSE v_totalCost + v_netPnl  -- 亏损：本金-亏损
      END,
      0,  -- expense=0（平仓是收入）
      v_outTradeNo,
      CONCAT('平仓 ', v_itemId, ' 净盈亏=', v_netPnl)
    );
    
    -- ========================================
    -- 5. 杠杆账户：平仓即还款逻辑
    -- ========================================
    IF v_detailsWalletType = 1 THEN
      -- 查询当前杠杆余额和总借款
      SELECT 
        IFNULL(SUM(income) - SUM(expense), 0)
      INTO v_leverBalance
      FROM i_balance_details
      WHERE deleted = 0 
        AND userAccount = user_Account 
        AND detailsWalletType = 1;
      
      SELECT 
        IFNULL(SUM(leverAmount), 0)
      INTO v_borrowed
      FROM i_lever
      WHERE deleted = 0 
        AND userAccount = user_Account 
        AND leverStatus = 0;  -- 未还款
      
      -- 计算可还款金额（取平仓收入和总借款的最小值）
      SET v_repayAmount = LEAST(v_leverBalance, v_borrowed);
      
      -- 如果有借款且平仓后有余额，则自动还款
      IF v_repayAmount > 0 THEN
        -- 找到最早的未还借款记录
        SELECT leverId INTO v_leverId
        FROM i_lever
        WHERE deleted = 0 
          AND userAccount = user_Account 
          AND leverStatus = 0
        ORDER BY createTime ASC
        LIMIT 1;
        
        -- 标记借款为已还（或部分还）
        UPDATE i_lever
        SET 
          leverStatus = 1,  -- 1=已还款
          repayAmount = v_repayAmount,
          repayTime = NOW()
        WHERE deleted = 0 
          AND userAccount = user_Account 
          AND leverId = v_leverId;
        
        -- 入账还款明细
        SET v_detailsId = getGenerateId('i_balance_details');
        INSERT INTO i_balance_details (
          detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
          income, expense, outTradeNo, detailsRemarks
        ) VALUES (
          v_detailsId,
          user_Account,
          1,  -- 杠杆账户
          3,  -- 交易类型
          7,  -- detailsSubType: 7=平仓还款
          0,
          v_repayAmount,
          v_leverId,
          CONCAT('平仓自动还款 ', v_repayAmount)
        );
        
        -- 释放对应的抵押品
        UPDATE i_collateral
        SET collateralStatus = 1  -- 1=已释放
        WHERE deleted = 0 
          AND userAccount = user_Account 
          AND collateralId = (
            SELECT collateralId FROM i_lever WHERE leverId = v_leverId LIMIT 1
          );
      END IF;
    END IF;
    
    -- ========================================
    -- 6. 更新持仓表（标记为已平仓）
    -- ========================================
    UPDATE i_positions
    SET 
      positionStatus = 2,  -- 2=已平仓（假设有此字段）
      closedAt = NOW(),
      realizedPnl = v_netPnl  -- 实现盈亏（假设有此字段）
    WHERE deleted = 0 
      AND userAccount = user_Account 
      AND outTradeNo = v_outTradeNo;
    
  END LOOP read_loop;
  
  CLOSE order_cursor;
  
  -- ========================================
  -- 7. 事务提交或回滚
  -- ========================================
  IF t_error = 1 THEN
    ROLLBACK;
    SELECT 0 AS `status`, 'Close position failed' AS `message`, 4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 1 AS `status`, 'Position(s) closed successfully' AS `message`, 
           out_TradeNo AS outTradeNo, 2000 AS `code`;
  END IF;
  
END;;

DELIMITER ;

-- ============================================================
-- 使用说明：
-- 1. 单个平仓：
--    CALL i_close_order_complete('ICE00000001', 'OUTS0001', NULL, 1850.50, 2);
-- 2. 批量平仓（按产品）：
--    CALL i_close_order_complete('ICE00000001', NULL, 'XAUUSD', 1850.50, 2);
-- 3. 全部平仓（慎用）：
--    CALL i_close_order_complete('ICE00000001', NULL, NULL, 0, 2);
-- ============================================================

-- ============================================================
-- 配套触发器：自动设置 closedAt 时间戳
-- ============================================================
DROP TRIGGER IF EXISTS `before_order_close`;
DELIMITER ;;
CREATE TRIGGER `before_order_close`
BEFORE UPDATE ON `i_trade_order`
FOR EACH ROW
BEGIN
  IF NEW.tradeStatus = 2 AND OLD.tradeStatus <> 2 THEN
    SET NEW.closedAt = IFNULL(NEW.closedAt, NOW());
  END IF;
END;;
DELIMITER ;

-- ============================================================
-- 优化索引（提升平仓性能）
-- ============================================================
ALTER TABLE i_trade_order 
ADD INDEX idx_close_query (userAccount, tradeStatus, deleted, itemId);

ALTER TABLE i_lever 
ADD INDEX idx_repay_query (userAccount, leverStatus, deleted, createTime);

ALTER TABLE i_positions 
ADD INDEX idx_position_close (userAccount, outTradeNo, deleted);
