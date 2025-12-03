-- =========================================
-- 迁移脚本: 修复 i_get_orderinfo / i_create_order 按钱包类型拆分聚合
-- 日期: 2025-12-02
-- 说明: 以“借款入账”的杠杆钱包模型，统一 takeSpread 为总费用；
--       严格按 details_WalletType 过滤余额与持仓；
--       杠杆预检仅校验杠杆钱包可用余额。
-- =========================================

USE ice_markets;

DELIMITER $$

-- i_get_orderinfo: 按 details_WalletType 过滤聚合持仓
DROP PROCEDURE IF EXISTS `i_get_orderinfo`$$
CREATE PROCEDURE `i_get_orderinfo`(IN user_Account VARCHAR(255),IN details_WalletType INT,IN item_Id VARCHAR(255))
BEGIN
  DECLARE nowCommission,position JSON;
  DECLARE available,lever_Interest,max_Lever DECIMAL(20,8) DEFAULT 0.00000000;

  SELECT 
    IFNULL(SUM(bd.income - bd.expense), 0) AS available,
    MAX(u.leverInterest) AS lever_Interest,
    MAX(u.maxLever * 100) AS max_Lever
  INTO available, lever_Interest, max_Lever
  FROM i_user u
  LEFT JOIN i_balance_details bd 
    ON bd.deleted = 0 
   AND bd.userAccount = u.userAccount 
   AND bd.detailsWalletType = details_WalletType
  WHERE u.deleted = 0 AND u.userAccount = user_Account
  GROUP BY u.userAccount;

  SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
    'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
    'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
    'liability',IF(details_WalletType = 1,(openPrice * tradeVolume + takeSpread) - ((openPrice * tradeVolume + takeSpread) / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
  )) FROM i_trade_order 
  WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

  -- 返回聚合持仓卡片（单品种单方向一张卡），严格按钱包类型过滤
  SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',pId,
    'direction',aggDirection,
    'itemId',aggItemId,
    'tradeVolume',totalVolume,
    'openPrice',avgOpenPrice,
    'takeSpread',takeSpread,
    'liability',IF(details_WalletType = 1,(avgOpenPrice * totalVolume + takeSpread) - ((avgOpenPrice * totalVolume + takeSpread) / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'stopLoss',IFNULL(stopLoss,0),
    'takeProfit',IFNULL(takeProfit,0),
    'swap',IFNULL(swap,0),
    'tradeRate',IFNULL(tradeRate,1),
    'liquidation',IF(details_WalletType = 1,IF(aggDirection = 'buy',avgOpenPrice * (1 - (1 / max_Lever * 0.5)),avgOpenPrice * (1 + (1 / max_Lever * 0.5))),'--'),
    'openedAt',openedAt,
    'updatedAt',updatedAt
  )) FROM i_positions 
  WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND detailsWalletType = details_WalletType AND totalVolume > 0),JSON_ARRAY());

  SELECT 1 AS status,'Get successfully' AS message,2000 AS code,nowCommission,position,available,max_Lever AS maxLever;
END$$

-- i_create_order: 查找/创建 i_positions 时带上 walletType，并在表中记录
DROP PROCEDURE IF EXISTS `i_create_order`$$
CREATE PROCEDURE `i_create_order`(IN user_Account VARCHAR(255),IN item_Id VARCHAR(255),IN details_WalletType TINYINT,IN direction_Temp VARCHAR(8),IN trade_Type TINYINT,IN open_Price DECIMAL(20,8),IN stop_Loss DECIMAL(20,8),IN take_Profit DECIMAL(20,8),IN take_Spread DECIMAL(20,8),IN trade_Volume DECIMAL(20,8),IN trade_Rate DECIMAL(10,4),IN trade_Status INT)
proc_label: BEGIN
  DECLARE out_TradeNo,trader_temp,details_Id,p_Id VARCHAR(255);
  DECLARE balance,totalAmount,swap_temp,lever_Interest DECIMAL(20,8) DEFAULT 0; 
  DECLARE margin_Used DECIMAL(20,8) DEFAULT 0;
  DECLARE max_Lever DECIMAL(6,2) DEFAULT 0.00;
  DECLARE nowCommission,position JSON;
  DECLARE available DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE last_step VARCHAR(64) DEFAULT 'init';

  DECLARE lev_collateral DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_borrowBalance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_usedBuyingPower DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_leverageRate DECIMAL(8,2) DEFAULT 1.00;
  DECLARE lev_liqThreshold DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_hourlyInterestRate DECIMAL(10,8) DEFAULT 0.00000000;

  DECLARE cur_totalVolume,cur_avgOpenPrice,cur_takeSpread,cur_totalLiability,new_totalVolume,new_avgOpenPrice,new_takeSpread,new_totalLiability DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE t_error INTEGER DEFAULT 0; 
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  SET last_step = 'load_user_balance';
  SELECT 
    IFNULL(SUM(bd.income) - SUM(bd.expense), 0),
    u.invitationUserAccount,
    u.leverInterest,
    u.maxLever * 100
  INTO balance, trader_temp, lever_Interest, max_Lever
  FROM i_user u
  LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = user_Account AND bd.detailsWalletType = details_WalletType
  WHERE u.deleted = 0 AND u.userAccount = user_Account
  GROUP BY u.userAccount;

  SET last_step = 'compute_amounts';
  -- 开仓总成本 = 开仓价×数量 + 总点差费用
  -- 注意：take_Spread 已经是总费用（单位点差×数量），不能再乘以数量
  SET totalAmount = (open_Price * trade_Volume) + take_Spread;
  SET swap_temp = IF(details_WalletType > 0 AND trade_Rate > 0,(totalAmount - totalAmount / trade_Rate) * lever_Interest,0);
  SET margin_Used = CASE WHEN trade_Rate IS NULL OR trade_Rate <= 0 THEN totalAmount ELSE totalAmount / trade_Rate END;

  SET last_step = 'precheck_lever_or_cash';
  -- 杠杆账户采用“借款入账”的钱包模型：
  -- 下单只校验杠杆钱包可用余额（不可提现，但可用于买卖），不再按保证金/杠杆率门槛拦截
  IF(details_WalletType = 1) THEN
    -- 与现金账户一致的校验方式：按 i_balance_details(杠杆钱包) 的可用余额判断
    IF(balance < totalAmount) THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  ELSE
    -- 现金账户：按现金钱包余额校验
    IF(balance < totalAmount) THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  END IF;

  SET last_step = 'start_txn';
  START TRANSACTION;

  SET last_step = CONCAT('gen_trade_no|',t_error);
  SET out_TradeNo = getGenerateId('i_trade_order');
  IF out_TradeNo IS NULL OR out_TradeNo = '' THEN
    SET last_step = 'fallback_out_trade_no';
    SET out_TradeNo = CONCAT('ITO', REPLACE(UUID(),'-',''));
  END IF;

  SET last_step = CONCAT('find_position_card|',t_error);
  SELECT pId INTO p_Id FROM i_positions 
    WHERE deleted = 0 AND userAccount = user_Account AND aggItemId = item_Id AND aggDirection = direction_Temp AND detailsWalletType = details_WalletType
    LIMIT 1;

  IF p_Id IS NULL OR p_Id = '' THEN
    SET last_step = CONCAT('create_position_card|',t_error);
    SET p_Id = getGenerateId('i_positions');
    INSERT INTO i_positions(outTradeNo,pId,userAccount,aggDirection,aggItemId,detailsWalletType,totalVolume,avgOpenPrice,takeSpread,totalLiability,interestAccrued,stopLoss,takeProfit,swap,tradeRate,openedAt,updatedAt)
    VALUES(out_TradeNo,p_Id,user_Account,LOWER(direction_Temp),item_Id,details_WalletType,0,0,0,0,0,IFNULL(stop_Loss,0),IFNULL(take_Profit,0),0,IFNULL(trade_Rate,1),NOW(),NOW());
  END IF;

  INSERT INTO i_trade_order(
    outTradeNo,positionId,userAccount,itemId,detailsWalletType,direction,tradeType,
    openPrice,stopLoss,takeProfit,swap,takeSpread,tradeVolume,tradeRate,tradeStatus,trader,openedAt,currentPrice
  )
  VALUES(
    out_TradeNo,p_Id,user_Account,item_Id,details_WalletType,LOWER(direction_Temp),trade_Type,
    open_Price,stop_Loss,take_Profit,IFNULL(swap_temp,0),IFNULL(take_Spread,0),trade_Volume,trade_Rate,trade_Status,trader_temp,NOW(),open_Price
  );

  IF(trade_Status = 0) THEN
    INSERT INTO i_balance_details(
      detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,
      income,expense,outTradeNo,detailsRemarks,createdDate
    )
    VALUES(
      getGenerateId('i_balance_details'),user_Account,details_WalletType,1,5,
      0,IFNULL(totalAmount,0),out_TradeNo,'限价单冻结保证金',NOW()
    );
  END IF;

  IF(trade_Status = 1)THEN
    SET details_Id = getGenerateId('i_balance_details');
    IF details_Id IS NULL OR details_Id = '' THEN
      SET details_Id = CONCAT('IBD', REPLACE(UUID(),'-',''));
    END IF;
    INSERT INTO i_balance_details(
      detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,
      income,expense,outTradeNo,detailsRemarks,createdDate
    )
    VALUES(
      details_Id,user_Account,details_WalletType,1,2,
      0,IFNULL(totalAmount,0),out_TradeNo,'开仓扣款',NOW()
    );

    SELECT IFNULL(totalVolume,0), IFNULL(avgOpenPrice,0), IFNULL(takeSpread,0), IFNULL(totalLiability,0)
      INTO cur_totalVolume, cur_avgOpenPrice, cur_takeSpread, cur_totalLiability
    FROM i_positions
    WHERE pId = p_Id
    FOR UPDATE;

    SET new_totalVolume = cur_totalVolume + trade_Volume;
    SET new_avgOpenPrice = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_avgOpenPrice * cur_totalVolume) + (open_Price * trade_Volume)) / new_totalVolume
        ELSE open_Price
    END;
    -- 注意：take_Spread 已经是本次交易的总费用，直接累加即可
    SET new_takeSpread = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_takeSpread * cur_totalVolume) + IFNULL(take_Spread,0)) / new_totalVolume
        ELSE IFNULL(take_Spread,0)
    END;
    -- 新增负债 = 本次开仓成本 - 保证金
    -- 注意：take_Spread 已经是总费用，不能再乘以数量
    SET new_totalLiability = CASE 
      WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0
        THEN cur_totalLiability + ((open_Price * trade_Volume + IFNULL(take_Spread,0)) - ((open_Price * trade_Volume + IFNULL(take_Spread,0)) / max_Lever))
        ELSE cur_totalLiability
    END;

    UPDATE i_positions
      SET totalVolume = new_totalVolume,
          avgOpenPrice = new_avgOpenPrice,
          takeSpread = new_takeSpread,
          totalLiability = new_totalLiability,
          stopLoss = IFNULL(stop_Loss, stopLoss),
          takeProfit = IFNULL(take_Profit, takeProfit),
          tradeRate = IFNULL(trade_Rate, tradeRate),
          updatedAt = NOW()
    WHERE pId = p_Id;
  END IF;

  IF t_error=1 THEN 
    ROLLBACK; 
    SELECT 0 AS status,'Creation failed' AS message,4003 AS code,last_step AS failedStep; 
  ELSE 
    COMMIT;

    SELECT IFNULL(SUM(income - expense), 0) INTO available
    FROM i_balance_details 
    WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType;

    SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
      'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
      'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
      'liability',CASE 
                    WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0 
                      THEN (openPrice * tradeVolume + takeSpread) - ((openPrice * tradeVolume + takeSpread) / max_Lever)
                    ELSE 0 
                  END,
      'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
      'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
    )) FROM i_trade_order 
    WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

    SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
      'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
      'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
      'liability',CASE 
                    WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0 
                      THEN (openPrice * tradeVolume + takeSpread) - ((openPrice * tradeVolume + takeSpread) / max_Lever)
                    ELSE 0 
                  END,
      'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
      'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
    )) FROM i_trade_order 
    WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 1),JSON_ARRAY());

    SELECT 1 AS status,'Created successfully' AS message,2000 AS code,out_TradeNo AS outTradeNo,nowCommission,position,available,max_Lever AS maxLever;
  END IF;
END$$

DELIMITER ;

-- 验证（可选）
-- SHOW CREATE PROCEDURE i_get_orderinfo; 
-- SHOW CREATE PROCEDURE i_create_order;
