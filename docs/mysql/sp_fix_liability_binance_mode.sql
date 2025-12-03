-- =========================================
-- ICE Markets 持仓负债计算修正方案（币安借款模式）
-- 生成时间: 2025-11-29
-- 
-- 业务模型：
-- 1. 用户先借款到杠杆账户（i_lever 表记录）
-- 2. 用户用杠杆账户余额开仓（可能多次开仓）
-- 3. 持仓负债 = 账户总负债 × 该持仓占用资产比例
-- =========================================

USE ice_markets;

DELIMITER ;;

-- =========================================
-- 修改 i_get_orderinfo 存储过程
-- 返回持仓时动态计算负债比例
-- =========================================

DROP PROCEDURE IF EXISTS `i_get_orderinfo`;;
CREATE PROCEDURE `i_get_orderinfo`(
  IN user_Account VARCHAR(255),
  IN details_WalletType INT,
  IN item_Id VARCHAR(255)
)
BEGIN
  DECLARE nowCommission,position JSON;
  DECLARE available,lever_Interest,max_Lever DECIMAL(20,8) DEFAULT 0.00000000;
  
  -- 新增：账户总负债和总资产
  DECLARE total_Borrowed DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE total_Assets DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE total_PositionValue DECIMAL(20,8) DEFAULT 0.00000000;

  -- 查询用户基本信息
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

  -- 计算账户总负债（杠杆账户才有负债）
  IF details_WalletType = 1 THEN
    SELECT IFNULL(SUM(leverAmount), 0) INTO total_Borrowed
    FROM i_lever
    WHERE deleted = 0 AND userAccount = user_Account AND leverStatus = 0;
    
    -- 计算所有持仓的总市值（用于计算资产占比）
    SELECT IFNULL(SUM((avgOpenPrice + takeSpread) * totalVolume), 0) INTO total_PositionValue
    FROM i_positions
    WHERE deleted = 0 AND userAccount = user_Account AND totalVolume > 0;
    
    -- 总资产 = 账户余额 + 持仓市值
    SET total_Assets = available + total_PositionValue;
  END IF;

  -- 未成交订单列表（挂单不计算负债）
  SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',outTradeNo,
    'direction',direction,
    'tradeType',tradeType,
    'openPrice',openPrice,
    'swap',swap,
    'stopLoss',stopLoss,
    'takeProfit',takeProfit,
    'tradeVolume',tradeVolume,
    'tradeRate',tradeRate,
    'tradeStatus',tradeStatus,
    'openedAt',openedAt,
    'liability',0,  -- 挂单没有负债
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'liquidation','--'  -- 挂单没有强平价
  )) FROM i_trade_order 
  WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

  -- 持仓卡片列表（动态计算负债）
  SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',pId,
    'direction',aggDirection,
    'itemId',aggItemId,
    'tradeVolume',totalVolume,
    'openPrice',avgOpenPrice,
    'takeSpread',takeSpread,
    -- 关键：按资产占比分配负债
    'liability',CASE 
                  WHEN details_WalletType = 1 AND total_Assets > 0 
                    THEN total_Borrowed * ((avgOpenPrice + takeSpread) * totalVolume / total_Assets)
                  ELSE 0
                END,
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'stopLoss',IFNULL(stopLoss,0),
    'takeProfit',IFNULL(takeProfit,0),
    'swap',IFNULL(swap,0),
    'tradeRate',IFNULL(tradeRate,1),
    -- 强平价：基于该持仓分配的负债计算
    'liquidation',CASE 
                    WHEN details_WalletType = 1 AND total_Assets > 0 THEN
                      CASE 
                        WHEN aggDirection = 'buy' THEN
                          avgOpenPrice * (1 - ((avgOpenPrice + takeSpread) * totalVolume / total_Assets) * 0.5)
                        ELSE
                          avgOpenPrice * (1 + ((avgOpenPrice + takeSpread) * totalVolume / total_Assets) * 0.5)
                      END
                    ELSE '--'
                  END,
    'openedAt',openedAt,
    'updatedAt',updatedAt
  )) FROM i_positions 
  WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND totalVolume > 0),JSON_ARRAY());

  SELECT 
    1 AS status,
    'Get successfully' AS message,
    2000 AS code,
    available AS available,
    nowCommission AS nowCommission,
    position AS position;
END;;

-- =========================================
-- 修改 i_create_order 存储过程
-- 返回响应时也动态计算负债
-- =========================================

DROP PROCEDURE IF EXISTS `i_create_order`;;
CREATE PROCEDURE `i_create_order`(
  IN user_Account VARCHAR(255),
  IN item_Id VARCHAR(255),
  IN details_WalletType INT(1),
  IN direction_Temp VARCHAR(8),
  IN trade_Type INT(1),
  IN open_Price DECIMAL(20,8),
  IN stop_Loss DECIMAL(20,8),
  IN take_Profit DECIMAL(20,8),
  IN take_Spread DECIMAL(20,8),
  IN trade_Volume DECIMAL(20,8),
  IN trade_Rate DECIMAL(10,4),
  IN trade_Status INT
)
proc_label: BEGIN
  DECLARE out_TradeNo,trader_temp,details_Id,p_Id VARCHAR(255);
  DECLARE balance,totalAmount,swap_temp,lever_Interest DECIMAL(20,8) DEFAULT 0; 
  DECLARE margin_Used DECIMAL(20,8) DEFAULT 0;
  DECLARE max_Lever DECIMAL(6,2) DEFAULT 0.00;
  DECLARE nowCommission,position JSON;
  DECLARE available DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE last_step VARCHAR(64) DEFAULT 'init';
  
  -- 杠杆账户相关
  DECLARE lev_collateral DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_borrowBalance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_usedBuyingPower DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_leverageRate DECIMAL(8,2) DEFAULT 1.00;
  DECLARE lev_liqThreshold DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_hourlyInterestRate DECIMAL(10,8) DEFAULT 0.00000000;

  -- 新增：负债计算相关
  DECLARE total_Borrowed DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE total_Assets DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE total_PositionValue DECIMAL(20,8) DEFAULT 0.00000000;

  -- 聚合持仓相关
  DECLARE cur_totalVolume,cur_avgOpenPrice,cur_takeSpread,cur_totalLiability DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE new_totalVolume,new_avgOpenPrice,new_takeSpread,new_totalLiability DECIMAL(20,8) DEFAULT 0.00000000;

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
  SET totalAmount = (open_Price + take_Spread) * trade_Volume;
  SET swap_temp = IF(details_WalletType > 0 AND trade_Rate > 0,(totalAmount - totalAmount / trade_Rate) * lever_Interest,0);
  SET margin_Used = CASE WHEN trade_Rate IS NULL OR trade_Rate <= 0 THEN totalAmount ELSE totalAmount / trade_Rate END;

  -- 余额和杠杆校验
  SET last_step = 'precheck_lever_or_cash';
  IF(details_WalletType = 1) THEN
    -- 杠杆账户校验（这里不需要改动，继续用现有逻辑）
    SELECT IFNULL(collateral,0),IFNULL(borrowBalance,0),IFNULL(usedBuyingPower,0),
           IFNULL(leverageRate,trade_Rate),IFNULL(liquidationThreshold,0),IFNULL(hourlyInterestRate,0)
    INTO lev_collateral,lev_borrowBalance,lev_usedBuyingPower,lev_leverageRate,lev_liqThreshold,lev_hourlyInterestRate
    FROM i_lever WHERE userAccount = user_Account AND deleted = 0 LIMIT 1;

    IF lev_leverageRate IS NULL OR lev_leverageRate <= 0 THEN SET lev_leverageRate = trade_Rate; END IF;
    IF (lev_collateral * lev_leverageRate - lev_usedBuyingPower) < totalAmount THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  ELSE
    -- 现金账户校验
    IF(balance < totalAmount) THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  END IF;

  -- 开启事务
  SET last_step = 'start_txn';
  START TRANSACTION;
  
  SET last_step = CONCAT('gen_trade_no|',t_error);
  SET out_TradeNo = getGenerateId('i_trade_order');
  IF out_TradeNo IS NULL OR out_TradeNo = '' THEN
    SET last_step = 'fallback_out_trade_no';
    SET out_TradeNo = CONCAT('ITO', REPLACE(UUID(),'-',''));
  END IF;

  -- 查找或创建聚合持仓卡片
  SET last_step = CONCAT('find_position_card|',t_error);
  SELECT pId INTO p_Id FROM i_positions 
    WHERE deleted = 0 AND userAccount = user_Account AND aggItemId = item_Id AND aggDirection = direction_Temp 
    LIMIT 1;

  IF p_Id IS NULL OR p_Id = '' THEN
    SET last_step = CONCAT('create_position_card|',t_error);
    SET p_Id = getGenerateId('i_positions');
    INSERT INTO i_positions(
      outTradeNo,pId,userAccount,aggDirection,aggItemId,
      totalVolume,avgOpenPrice,takeSpread,totalLiability,
      interestAccrued,stopLoss,takeProfit,swap,tradeRate,openedAt,updatedAt
    )
    VALUES(
      out_TradeNo,p_Id,user_Account,LOWER(direction_Temp),item_Id,
      0,0,0,0,
      0,IFNULL(stop_Loss,0),IFNULL(take_Profit,0),0,IFNULL(trade_Rate,1),NOW(),NOW()
    );
  END IF;

  -- 插入交易订单
  INSERT INTO i_trade_order(
    outTradeNo,positionId,userAccount,itemId,detailsWalletType,direction,tradeType,
    openPrice,stopLoss,takeProfit,swap,takeSpread,tradeVolume,tradeRate,tradeStatus,trader,openedAt,currentPrice
  )
  VALUES(
    out_TradeNo,p_Id,user_Account,item_Id,details_WalletType,LOWER(direction_Temp),trade_Type,
    open_Price,stop_Loss,take_Profit,IFNULL(swap_temp,0),IFNULL(take_Spread,0),trade_Volume,trade_Rate,trade_Status,trader_temp,NOW(),open_Price
  );

  -- 限价单：冻结保证金
  IF(trade_Status = 0) THEN
    SET last_step = 'insert_balance_details_freeze';
    INSERT INTO i_balance_details(
      detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,
      income,expense,outTradeNo,detailsRemarks,createdDate
    )
    VALUES(
      getGenerateId('i_balance_details'),user_Account,details_WalletType,1,5,
      0,IFNULL(totalAmount,0),out_TradeNo,'限价单冻结保证金',NOW()
    );
  END IF;

  -- 市价单：立即扣款并更新持仓
  IF(trade_Status = 1) THEN
    SET last_step = 'gen_balance_details_id';
    SET details_Id = getGenerateId('i_balance_details');
    IF details_Id IS NULL OR details_Id = '' THEN
      SET last_step = 'fallback_balance_details_id';
      SET details_Id = CONCAT('IBD', REPLACE(UUID(),'-',''));
    END IF;
    
    SET last_step = 'insert_balance_details_expense';
    INSERT INTO i_balance_details(
      detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,
      income,expense,outTradeNo,detailsRemarks,createdDate
    )
    VALUES(
      details_Id,user_Account,details_WalletType,1,2,
      0,IFNULL(totalAmount,0),out_TradeNo,'开仓扣款',NOW()
    );

    -- 更新聚合持仓统计
    SET last_step = 'update_position_aggregate_read';
    SELECT 
      IFNULL(totalVolume,0), 
      IFNULL(avgOpenPrice,0), 
      IFNULL(takeSpread,0), 
      IFNULL(totalLiability,0)
    INTO 
      cur_totalVolume, 
      cur_avgOpenPrice, 
      cur_takeSpread, 
      cur_totalLiability
    FROM i_positions
    WHERE pId = p_Id
    FOR UPDATE;

    SET last_step = 'update_position_aggregate_compute';
    SET new_totalVolume = cur_totalVolume + trade_Volume;
    
    -- 加权平均开仓价格
    SET new_avgOpenPrice = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_avgOpenPrice * cur_totalVolume) + (open_Price * trade_Volume)) / new_totalVolume
        ELSE open_Price
    END;
    
    -- 加权平均点差
    SET new_takeSpread = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_takeSpread * cur_totalVolume) + (IFNULL(take_Spread,0) * trade_Volume)) / new_totalVolume
        ELSE IFNULL(take_Spread,0)
    END;
    
    -- 注意：totalLiability 字段保留但不再使用，由前端动态计算
    SET new_totalLiability = 0;

    SET last_step = 'update_position_aggregate_write';
    UPDATE i_positions
      SET totalVolume = new_totalVolume,
          avgOpenPrice = new_avgOpenPrice,
          takeSpread = new_takeSpread,
          totalLiability = new_totalLiability,  -- 暂时保留字段，设为 0
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
    
    -- 查询最新的可用余额
    SET last_step = 'compute_response_lists';
    SELECT IFNULL(SUM(income - expense), 0) INTO available
    FROM i_balance_details 
    WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType;

    -- 计算账户总负债和总资产（用于响应）
    IF details_WalletType = 1 THEN
      SELECT IFNULL(SUM(leverAmount), 0) INTO total_Borrowed
      FROM i_lever
      WHERE deleted = 0 AND userAccount = user_Account AND leverStatus = 0;
      
      SELECT IFNULL(SUM((avgOpenPrice + takeSpread) * totalVolume), 0) INTO total_PositionValue
      FROM i_positions
      WHERE deleted = 0 AND userAccount = user_Account AND totalVolume > 0;
      
      SET total_Assets = available + total_PositionValue;
    END IF;

    -- 查询未成交订单列表
    SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'outTradeNo',outTradeNo,
      'direction',direction,
      'tradeType',tradeType,
      'openPrice',openPrice,
      'swap',swap,
      'stopLoss',stopLoss,
      'takeProfit',takeProfit,
      'tradeVolume',tradeVolume,
      'tradeRate',tradeRate,
      'tradeStatus',tradeStatus,
      'openedAt',openedAt,
      'liability',0,  -- 挂单没有负债
      'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
      'liquidation','--'
    )) FROM i_trade_order 
    WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

    -- 查询持仓列表（动态计算负债）
    SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'outTradeNo',pId,
      'direction',aggDirection,
      'itemId',aggItemId,
      'tradeVolume',totalVolume,
      'openPrice',avgOpenPrice,
      'takeSpread',takeSpread,
      'liability',CASE 
                    WHEN details_WalletType = 1 AND total_Assets > 0 
                      THEN total_Borrowed * ((avgOpenPrice + takeSpread) * totalVolume / total_Assets)
                    ELSE 0
                  END,
      'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
      'stopLoss',IFNULL(stopLoss,0),
      'takeProfit',IFNULL(takeProfit,0),
      'swap',IFNULL(swap,0),
      'tradeRate',IFNULL(tradeRate,1),
      'liquidation',CASE 
                      WHEN details_WalletType = 1 AND total_Assets > 0 THEN
                        CASE 
                          WHEN aggDirection = 'buy' THEN
                            avgOpenPrice * (1 - ((avgOpenPrice + takeSpread) * totalVolume / total_Assets) * 0.5)
                          ELSE
                            avgOpenPrice * (1 + ((avgOpenPrice + takeSpread) * totalVolume / total_Assets) * 0.5)
                        END
                      ELSE '--'
                    END,
      'openedAt',openedAt,
      'updatedAt',updatedAt
    )) FROM i_positions 
    WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND totalVolume > 0),JSON_ARRAY());

    SELECT 
      1 AS status,
      'Successfully' AS message,
      2000 AS code,
      available AS available,
      nowCommission AS nowCommission,
      position AS position;
  END IF;
END;;

DELIMITER ;

-- =========================================
-- 说明
-- =========================================
SELECT '币安模式负债计算方案执行完毕！' AS message,
       '负债计算逻辑：持仓负债 = 账户总负债 × (持仓市值 / 账户总资产)' AS formula,
       '账户总负债：SUM(i_lever.leverAmount WHERE leverStatus=0)' AS total_borrowed,
       '账户总资产：杠杆账户余额 + SUM(持仓市值)' AS total_assets,
       '持仓市值：(avgOpenPrice + takeSpread) * totalVolume' AS position_value,
       '强平价：基于持仓资产占比计算' AS liquidation;
