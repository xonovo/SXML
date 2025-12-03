-- =========================================
-- ICE Markets 存储过程优化脚本（幂等执行）
-- 生成时间: 2025-11-29
-- 仅包含存储过程重建：i_get_balance, i_get_orderinfo, i_create_order, i_create_lever
-- 可安全重复执行，不修改索引，不影响表数据
-- =========================================

USE ice_markets;

DELIMITER ;;
-- 注意：表结构变更已移至独立文件 `docs/mysql/sp_alter_positions_orders_columns.sql`
-- 此处不再执行任何 ALTER 或 DDL，仅保留存储过程重建。


-- i_get_balance
DROP PROCEDURE IF EXISTS `i_get_balance`;;
CREATE PROCEDURE `i_get_balance`(IN user_Account VARCHAR(255))
BEGIN
  DECLARE cashBalance, leveragedBalance, collateral, borrowed, lever_Interest, totalInterest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE max_Lever DECIMAL(6,2) DEFAULT 0.00;

  SELECT 
    IFNULL(SUM(CASE WHEN detailsWalletType = 0 THEN income - expense ELSE 0 END), 0),
    IFNULL(SUM(CASE WHEN detailsWalletType = 1 THEN income - expense ELSE 0 END), 0)
  INTO cashBalance, leveragedBalance
  FROM i_balance_details 
  WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType IN (0, 1);

  SELECT 
    IFNULL(SUM(DISTINCT c.collateralAmount), 0),
    IFNULL(SUM(l.leverAmount), 0),
    IFNULL(SUM(CEILING(TIMESTAMPDIFF(HOUR, l.createdDate, NOW())) * (l.leverAmount * l.leverInterest)), 0)
  INTO collateral, borrowed, totalInterest
  FROM i_collateral c
  LEFT JOIN i_lever l ON l.userAccount = user_Account AND l.deleted = 0 AND l.leverStatus = 0
  WHERE c.deleted = 0 AND c.userAccount = user_Account AND c.collateralStatus = 0;

  SELECT leverInterest, maxLever * 100 INTO lever_Interest, max_Lever 
  FROM i_user WHERE deleted = 0 AND userAccount = user_Account;

  SELECT 1 AS status,'Get successfully' AS message,2000 AS code,
    cashBalance AS cashBalance,
    leveragedBalance AS leveragedBalance,
    collateral AS collateral,
    borrowed AS borrowed,
    totalInterest AS totalInterest,
    borrowed + totalInterest AS totalLiabilities,
    lever_Interest AS leverInterest,
    max_Lever AS maxLever,
    (leveragedBalance - collateral - borrowed) AS leveragedTransfer;
END;;

-- i_get_orderinfo
DROP PROCEDURE IF EXISTS `i_get_orderinfo`;;
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
    'liability',IF(details_WalletType = 1,(openPrice + takeSpread) * tradeVolume - ((openPrice + takeSpread) * tradeVolume / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
  )) FROM i_trade_order 
  WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

  -- 返回聚合持仓卡片（单品种单方向一张卡）
  -- 重要：只返回 totalVolume > 0 的持仓（仓位全部平仓后自动隐藏）
  SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',pId,
    'direction',aggDirection,
    'itemId',aggItemId,
    'tradeVolume',totalVolume,
    'openPrice',avgOpenPrice,
    'takeSpread',takeSpread,
    'liability',IF(details_WalletType = 1,(avgOpenPrice + takeSpread) * totalVolume - ((avgOpenPrice + takeSpread) * totalVolume / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'stopLoss',IFNULL(stopLoss,0),
		'takeProfit',IFNULL(takeProfit,0),
		'swap',IFNULL(swap,0),
		'tradeRate',IFNULL(tradeRate,1),
		'liquidation',IF(details_WalletType = 1,IF(aggDirection = 'buy',avgOpenPrice * (1 - (1 / max_Lever * 0.5)),avgOpenPrice * (1 + (1 / max_Lever * 0.5))),'--'),
		'openedAt',openedAt,
    'updatedAt',updatedAt
  )) FROM i_positions 
  WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND totalVolume > 0),JSON_ARRAY());

  SELECT 1 AS status,'Get successfully' AS message,2000 AS code,nowCommission,position,available,max_Lever AS maxLever;
END;;

-- i_create_order
DROP PROCEDURE IF EXISTS `i_create_order`;;
CREATE PROCEDURE `i_create_order`(IN user_Account VARCHAR(255),IN item_Id VARCHAR(255),IN details_WalletType INT(1),IN direction_Temp VARCHAR(8),IN trade_Type INT(1),IN open_Price DECIMAL(20,8),IN stop_Loss DECIMAL(20,8),IN take_Profit DECIMAL(20,8),IN take_Spread DECIMAL(20,8),IN trade_Volume DECIMAL(20,8),IN trade_Rate DECIMAL(10,4),IN trade_Status INT)
proc_label: BEGIN
  DECLARE out_TradeNo,trader_temp,details_Id,p_Id VARCHAR(255);
  DECLARE balance,totalAmount,swap_temp,lever_Interest DECIMAL(20,8) DEFAULT 0; 
  DECLARE margin_Used DECIMAL(20,8) DEFAULT 0;
  DECLARE max_Lever DECIMAL(6,2) DEFAULT 0.00;
  DECLARE nowCommission,position JSON;
  DECLARE available DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE last_step VARCHAR(64) DEFAULT 'init';
  
  -- 杠杆账户相关（DECLARE 必须在过程开头处）
  DECLARE lev_collateral DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_borrowBalance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_usedBuyingPower DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_leverageRate DECIMAL(8,2) DEFAULT 1.00;
  DECLARE lev_liqThreshold DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_hourlyInterestRate DECIMAL(10,8) DEFAULT 0.00000000;

-- 先读取当前聚合持仓行并加锁，避免并发写冲突
    DECLARE cur_totalVolume,cur_avgOpenPrice,cur_takeSpread,cur_totalLiability,new_totalVolume,new_avgOpenPrice,new_takeSpread,new_totalLiability DECIMAL(20,8) DEFAULT 0.00000000;


  DECLARE t_error INTEGER DEFAULT 0; 
  -- 异常处理器必须在所有变量/游标声明之后
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

  -- 先进行余额和杠杆校验，通过后再开启事务
  SET last_step = 'precheck_lever_or_cash';
  IF(details_WalletType = 1) THEN
    -- 杠杆账户：读取 i_lever 当前状态
    SELECT IFNULL(collateral,0),IFNULL(borrowBalance,0),IFNULL(usedBuyingPower,0),
           IFNULL(leverageRate,trade_Rate),IFNULL(liquidationThreshold,0),IFNULL(hourlyInterestRate,0)
    INTO lev_collateral,lev_borrowBalance,lev_usedBuyingPower,lev_leverageRate,lev_liqThreshold,lev_hourlyInterestRate
    FROM i_lever WHERE userAccount = user_Account AND deleted = 0 LIMIT 1;

    IF lev_leverageRate IS NULL OR lev_leverageRate <= 0 THEN SET lev_leverageRate = trade_Rate; END IF;
    -- 有效买力校验：effectiveBuyingPower = collateral * lev_leverageRate - lev_usedBuyingPower
    IF (lev_collateral * lev_leverageRate - lev_usedBuyingPower) < totalAmount THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  ELSE
    -- 非杠杆账户：现金余额校验
    IF(balance < totalAmount) THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  END IF;

  -- 校验通过，开启事务
  SET last_step = 'start_txn';
  START TRANSACTION;
  
  SET last_step = CONCAT('gen_trade_no|',t_error);
  SET out_TradeNo = getGenerateId('i_trade_order');
  IF out_TradeNo IS NULL OR out_TradeNo = '' THEN
    SET last_step = 'fallback_out_trade_no';
    SET out_TradeNo = CONCAT('ITO', REPLACE(UUID(),'-',''));
  END IF;
  -- 聚合持仓：查找或创建该用户在该品种与方向的聚合持仓卡片
  SET last_step = CONCAT('find_position_card|',t_error);
  SELECT pId INTO p_Id FROM i_positions 
    WHERE deleted = 0 AND userAccount = user_Account AND aggItemId = item_Id AND aggDirection = direction_Temp 
    LIMIT 1;

  IF p_Id IS NULL OR p_Id = '' THEN
    SET last_step = CONCAT('create_position_card|',t_error);
    SET p_Id = getGenerateId('i_positions');
    INSERT INTO i_positions(outTradeNo,pId,userAccount,aggDirection,aggItemId,totalVolume,avgOpenPrice,takeSpread,totalLiability,interestAccrued,stopLoss,takeProfit,swap,tradeRate,openedAt,updatedAt)
    VALUES(out_TradeNo,p_Id,user_Account,LOWER(direction_Temp),item_Id,0,0,0,0,0,IFNULL(stop_Loss,0),IFNULL(take_Profit,0),0,IFNULL(trade_Rate,1),NOW(),NOW());
  END IF;

--   SET last_step = CONCAT('insert_trade_order|',t_error);
  INSERT INTO i_trade_order(
    outTradeNo,positionId,userAccount,itemId,detailsWalletType,direction,tradeType,
    openPrice,stopLoss,takeProfit,swap,takeSpread,tradeVolume,tradeRate,tradeStatus,trader,openedAt,currentPrice
  )
  VALUES(
    out_TradeNo,p_Id,user_Account,item_Id,details_WalletType,LOWER(direction_Temp),trade_Type,
    open_Price,stop_Loss,take_Profit,IFNULL(swap_temp,0),IFNULL(take_Spread,0),trade_Volume,trade_Rate,trade_Status,trader_temp,NOW(),open_Price
  );
--   SET last_step = CONCAT('post_insert_trade_order|',t_error);

  -- 限价单：提交即冻结保证金，成交或撤单时再结算/解冻
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

  IF(trade_Status = 1)THEN
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

    -- 更新聚合持仓统计（仅当开仓成功时）
    -- 新平均开仓价：((原均价*原仓位)+(新单价*新增仓位)) / (原仓位+新增仓位)
    SET last_step = 'update_position_aggregate_read';
    

    SELECT IFNULL(totalVolume,0), IFNULL(avgOpenPrice,0), IFNULL(takeSpread,0), IFNULL(totalLiability,0)
      INTO cur_totalVolume, cur_avgOpenPrice, cur_takeSpread, cur_totalLiability
    FROM i_positions
    WHERE pId = p_Id
    FOR UPDATE;

    SET last_step = 'update_position_aggregate_compute';
   

    SET new_totalVolume = cur_totalVolume + trade_Volume;
    -- 加权平均开仓价格：((原均价*原仓位)+(新单价*新增仓位)) / (原仓位+新增仓位)
    SET new_avgOpenPrice = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_avgOpenPrice * cur_totalVolume) + (open_Price * trade_Volume)) / new_totalVolume
        ELSE open_Price
    END;
    -- 加权平均点差：((原点差*原仓位)+(新点差*新增仓位)) / (原仓位+新增仓位)
    SET new_takeSpread = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_takeSpread * cur_totalVolume) + (IFNULL(take_Spread,0) * trade_Volume)) / new_totalVolume
        ELSE IFNULL(take_Spread,0)
    END;
    SET new_totalLiability = CASE 
      WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0
        THEN cur_totalLiability + ((open_Price + IFNULL(take_Spread,0)) * trade_Volume - ((open_Price + IFNULL(take_Spread,0)) * trade_Volume / max_Lever))
        ELSE cur_totalLiability
    END;

    SET last_step = 'update_position_aggregate_write';
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
    COMMIT;      -- 查询最新的可用余额
      SET last_step = 'compute_response_lists';
      SELECT IFNULL(SUM(income - expense), 0) INTO available
      FROM i_balance_details 
      WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType;

      -- 查询未成交订单列表（与 I00009 一致）
      SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
        'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
        'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
        'liability',CASE 
                      WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0 
                        THEN (openPrice + takeSpread) * tradeVolume - ((openPrice + takeSpread) * tradeVolume / max_Lever)
                      ELSE 0 
                    END,
        'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
        'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
      )) FROM i_trade_order 
      WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

      -- 查询持仓列表（与 I00009 一致）
      SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
        'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
        'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
        'liability',CASE 
                      WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0 
                        THEN (openPrice + takeSpread) * tradeVolume - ((openPrice + takeSpread) * tradeVolume / max_Lever)
                      ELSE 0 
                    END,
        'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
        'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
      )) FROM i_trade_order 
      WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 1),JSON_ARRAY());

    SELECT 1 AS status,'Created successfully' AS message,2000 AS code,out_TradeNo AS outTradeNo,nowCommission,position,available,max_Lever AS maxLever;
  END IF;
END;;-- i_create_lever
DROP PROCEDURE IF EXISTS `i_create_lever`;;
CREATE PROCEDURE `i_create_lever`(IN user_Account VARCHAR(255),IN collateralAmount DECIMAL(20,8),IN lever_Rate INT,IN lever_Amount DECIMAL(20,8))
BEGIN
  DECLARE collateral_Id,lever_Id,details_Id VARCHAR(255);
  DECLARE leveragedBalance,collateral,borrowed,leveragedTransfer,lever_Interest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE t_error INTEGER DEFAULT 0; 
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;
START TRANSACTION;
  SELECT 
    IFNULL(SUM(CASE WHEN bd.detailsWalletType = 1 THEN bd.income - bd.expense ELSE 0 END), 0),
    IFNULL(SUM(DISTINCT c.collateralAmount), 0),
    IFNULL(SUM(l.leverAmount), 0),
    u.leverInterest
  INTO leveragedBalance, collateral, borrowed, lever_Interest
  FROM i_user u
  LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = user_Account
  LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = user_Account AND c.collateralStatus = 0
  LEFT JOIN i_lever l ON l.deleted = 0 AND l.userAccount = user_Account AND l.leverStatus = 0
  WHERE u.deleted = 0 AND u.userAccount = user_Account;

  SET leveragedTransfer = (leveragedBalance - collateral - borrowed);

  IF(leveragedTransfer >= collateralAmount)THEN
    IF(collateralAmount * (lever_Rate - 1) = lever_Amount)THEN
      
      SET collateral_Id = getGenerateId('i_collateral');
      INSERT INTO i_collateral(collateralId,userAccount,collateralAmount) VALUES(collateral_Id,user_Account,collateralAmount);

      SET details_Id = getGenerateId('i_balance_details');
      INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,expense,outTradeNo,detailsRemarks)
      VALUES(details_Id,user_Account,1,3,9,collateralAmount,collateral_Id,'扣除借款抵押金额');

      SET lever_Id = getGenerateId('i_lever');
      INSERT INTO i_lever(leverId,userAccount,collateralId,leverRate,leverQuantity,leverAmount,leverInterest)
      VALUES(lever_Id,user_Account,collateral_Id,lever_Rate,lever_Amount,lever_Amount,lever_Interest);

      SET details_Id = getGenerateId('i_balance_details');
      INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,outTradeNo,detailsRemarks)
      VALUES(details_Id,user_Account,1,3,10,collateralAmount*lever_Rate,lever_Id,'借款放款');

      IF t_error=1 THEN ROLLBACK; SELECT 0 AS status,'Lever failed' AS message,4003 AS code; ELSE COMMIT;
        SELECT 
          IFNULL(SUM(CASE WHEN bd.detailsWalletType = 1 THEN bd.income - bd.expense ELSE 0 END), 0),
          IFNULL(SUM(DISTINCT c.collateralAmount), 0),
          IFNULL(SUM(l.leverAmount), 0)
        INTO leveragedBalance, collateral, borrowed
        FROM i_balance_details bd
        LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = user_Account AND c.collateralStatus = 0
        LEFT JOIN i_lever l ON l.deleted = 0 AND l.userAccount = user_Account AND l.leverStatus = 0
        WHERE bd.deleted = 0 AND bd.userAccount = user_Account;
        SET leveragedTransfer = (leveragedBalance - collateral - borrowed);
        SELECT 1 AS status,'Lever successfully' AS message,2000 AS code,leveragedBalance,collateral,borrowed,leveragedTransfer,lever_Interest AS leverInterest; 
      END IF;
    ELSE
      SELECT 0 AS status,'The loan amount and multiplier calculation are incorrect.' AS message,4001 AS code; 
    END IF;
  ELSE
    SELECT 0 AS status,'Insufficient balance' AS message,4004 AS code;
  END IF;
END;;

DELIMITER ;

-- 验证重建是否成功
SHOW CREATE PROCEDURE i_get_balance; 
SHOW CREATE PROCEDURE i_get_orderinfo; 
SHOW CREATE PROCEDURE i_create_order; 
SHOW CREATE PROCEDURE i_create_lever;

-- 可选：止损止盈监控过程（自动平仓）
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

  -- 2) 杠杆账户时息计提（逐用户）- 已禁用，改为最终结算时一次性计算
  -- 说明：借款余额为 i_lever.leverAmount 或借款汇总字段；此处使用 i_lever.leverAmount 与 i_user.leverInterest 计提小时利息
  /*
  UPDATE i_lever l
  JOIN i_user u ON u.userAccount = l.userAccount AND u.deleted = 0
  SET 
    l.leverAmount = l.leverAmount + (l.leverAmount * u.leverInterest),
    l.updatedAt = NOW()
  WHERE l.deleted = 0 AND l.leverStatus = 0;

  -- 将时息以资金流的方式入账（expense 到杠杆钱包），并累加到聚合持仓的 interestAccrued
  -- 注意：这里仅做骨架，具体 outTradeNo/remarks 可按需填充
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

-- 撤销未成交订单（仅 tradeStatus = 0 可撤销）
DELIMITER ;;
DROP PROCEDURE IF EXISTS `i_cancel_order`;;
CREATE PROCEDURE `i_cancel_order`(
  IN user_Account VARCHAR(255),
  IN out_TradeNo VARCHAR(255)
)
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE affected INTEGER DEFAULT 0;
  DECLARE details_WalletType INT DEFAULT 0;
  DECLARE cancel_Amount DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;

  -- 读取订单必要信息（钱包类型、金额）
  SELECT detailsWalletType,
         (openPrice + takeSpread) * tradeVolume
  INTO details_WalletType, cancel_Amount
  FROM i_trade_order
  WHERE deleted = 0 AND userAccount = user_Account AND outTradeNo = out_TradeNo
  LIMIT 1;

  UPDATE i_trade_order 
  SET tradeStatus = 3
  WHERE deleted = 0 
    AND userAccount = user_Account 
    AND outTradeNo = out_TradeNo
    AND tradeStatus = 0;

  SET affected = ROW_COUNT();

  IF t_error = 1 THEN
    SELECT 0 AS status,'Cancel failed' AS message,4003 AS code;
  ELSEIF affected = 0 THEN
    SELECT 0 AS status,'Order not cancelable' AS message,4004 AS code;
  ELSE
    -- 解冻保证金：撤单后原路退回
    INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,expense,outTradeNo,detailsRemarks,createdDate)
    VALUES(getGenerateId('i_balance_details'),user_Account,IFNULL(details_WalletType,0),1,6,IFNULL(cancel_Amount,0),0,out_TradeNo,'撤单解冻保证金',NOW());
    SELECT 1 AS status,'Cancelled successfully' AS message,2000 AS code;
  END IF;
END;;
DELIMITER ;

-- 注册/更新撤单接口至 interface 表（I00018）
INSERT INTO interface(
  interfaceId, interfaceType, interfaceName, interfaceSql, interfaceKey, interfaceReturn, registId, databaseType, interfaceVison, accesslevel, deleted
) VALUES(
  'I00018','APP','取消未成交订单','call i_cancel_order(#{userAccount},#{outTradeNo});','userAccount,outTradeNo','[]','ICE00000001',0,'V1',0,0
)
ON DUPLICATE KEY UPDATE
  interfaceType=VALUES(interfaceType),
  interfaceName=VALUES(interfaceName),
  interfaceSql=VALUES(interfaceSql),
  interfaceKey=VALUES(interfaceKey),
  interfaceReturn=VALUES(interfaceReturn),
  registId=VALUES(registId),
  databaseType=VALUES(databaseType),
  interfaceVison=VALUES(interfaceVison),
  accesslevel=VALUES(accesslevel),
  deleted=0,
  updatedDate=CURRENT_TIMESTAMP(3);

-- 验证重建是否成功（取消接口）
SHOW CREATE PROCEDURE i_cancel_order;