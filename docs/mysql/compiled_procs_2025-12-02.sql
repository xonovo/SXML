-- Compiled latest procedures for ICE Markets
-- Date: 2025-12-02

/*
Included procedures (latest):
- i_create_order      (extended to return stopLoss/takeProfit)
- i_close_order       (batch or single close)
- i_get_orderinfo     (returns nowCommission/position/available/maxLever, includes stopLoss/takeProfit)
- i_modify_TP_SL      (updates both i_trade_order and i_positions)
Also updates interface mapping for I00007 to include stopLoss/takeProfit in interfaceReturn.
*/

-- ===== i_create_order =====
DROP PROCEDURE IF EXISTS `i_create_order`;
DELIMITER ;;
CREATE PROCEDURE `i_create_order`(
  IN user_Account VARCHAR(255),
  IN item_Id VARCHAR(255), -- enum('EURUSD','XAUUSD','XTIUSD','EURGBP')
  IN details_WalletType INT(1), -- 0=cash, 1=leveraged, 2=futures
  IN direction_Temp ENUM('buy', 'sell'), -- buy=long, sell=short
  IN trade_Type INT(1), -- 0=market,1=limit,2=stop
  IN open_Price decimal(20,8), -- open price
  IN stop_Loss decimal(20,8), -- stop loss
  IN take_Profit decimal(20,8), -- take profit
  IN take_Spread decimal(20,8), -- spread
  IN trade_Volume decimal(20,8), -- volume
  IN trade_Rate decimal(4,2), -- leverage multiple
  IN trade_Status INT
)
BEGIN
  DECLARE out_TradeNo,trader_temp,details_Id,p_Id VARCHAR(255);
  DECLARE balance,totalAmount,swap_temp,lever_Interest decimal(20,8) DEFAULT 0;
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  SET balance = IFNULL((SELECT SUM(income) - SUM(expense)
                        FROM i_balance_details
                        WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType),0);

  SET totalAmount = (open_Price + take_Spread) * trade_Volume;

  IF(details_WalletType > 0)THEN
     SET lever_Interest = (SELECT leverInterest FROM i_user WHERE deleted=0 AND userAccount = user_Account);
     SET swap_temp = (totalAmount - totalAmount / trade_Rate) * lever_Interest;
  END IF;

  IF(balance >= totalAmount)THEN
     SET trader_temp = (SELECT invitationUserAccount FROM i_user WHERE deleted=0 AND userAccount = user_Account);

     START TRANSACTION;
     SET out_TradeNo = getGenerateId('i_trade_order');
     INSERT INTO `i_trade_order`(
       outTradeNo,userAccount,itemId,detailsWalletType,direction,tradeType,openPrice,stopLoss,takeProfit,swap,takeSpread,tradeVolume,tradeRate,tradeStatus,trader
     ) VALUES (
       out_TradeNo,user_Account,item_Id,details_WalletType,direction_Temp,trade_Type,open_Price,stop_Loss,take_Profit,swap_temp,take_Spread,trade_Volume,trade_Rate,trade_Status,trader_temp
     );

     IF(trade_Status = 1)THEN
       SET details_Id = getGenerateId('i_balance_details');
       INSERT INTO `i_balance_details`(
         detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,expense,outTradeNo
       ) VALUES (
         details_Id,user_Account,details_WalletType,1,2,totalAmount,out_TradeNo
       );

       SET p_Id = getGenerateId('i_positions');
       INSERT INTO `i_positions`(
         pId,userAccount,outTradeNo,itemId,marginUsed,stopLoss,takeProfit
       ) VALUES (
         p_Id,user_Account,out_TradeNo,item_Id,totalAmount / trade_Rate,stop_Loss,take_Profit
       );
     END IF;

     IF t_error=1 THEN
       ROLLBACK;
       SELECT 0 AS `status`,'Creation failed' AS `message`,4003 AS `code`;
     ELSE
       COMMIT;
       SELECT 1 AS `status`,'Created successfully' AS `message`,
              out_TradeNo AS outTradeNo,
              stop_Loss AS stopLoss,
              take_Profit AS takeProfit,
              2000 AS `code`;
     END IF;
  ELSE
     SELECT 0 AS `status`,'Insufficient balance' AS `message`,4001 AS `code`;
  END IF;
END
;;
DELIMITER ;

-- ===== i_close_order =====
DROP PROCEDURE IF EXISTS `i_close_order`;
DELIMITER ;;
CREATE PROCEDURE `i_close_order`(
  IN user_Account VARCHAR(255),
  IN out_TradeNo VARCHAR(255), -- NULL means close all of itemId
  IN item_Id VARCHAR(255),
  IN current_Price decimal(20,8),
  IN trade_Status INT
)
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  START TRANSACTION;

  IF(out_TradeNo IS NULL)THEN
     UPDATE i_trade_order SET
       currentPrice = current_Price,
       tradeStatus = trade_Status
     WHERE deleted = 0 AND userAccount = user_Account AND tradeStatus < 2 AND itemId = item_Id;
  ELSE
     UPDATE i_trade_order SET
       currentPrice = current_Price,
       tradeStatus = trade_Status
     WHERE deleted = 0 AND userAccount = user_Account AND outTradeNo = out_TradeNo AND tradeStatus < 2;
  END IF;

  IF t_error=1 THEN
    ROLLBACK;
    SELECT 0 AS `status`,'close failed' AS `message`,4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 1 AS `status`,'close successfully' AS `message`,out_TradeNo AS outTradeNo,2000 AS `code`;
  END IF;
END
;;
DELIMITER ;

-- ===== i_get_orderinfo =====
DROP PROCEDURE IF EXISTS `i_get_orderinfo`;
DELIMITER ;;
CREATE PROCEDURE `i_get_orderinfo`(
  IN user_Account VARCHAR(255),
  IN details_WalletType INT, -- 0=cash,1=leveraged
  IN item_Id VARCHAR(255)
)
BEGIN
  DECLARE nowCommission,position JSON;
  DECLARE available,lever_Interest,max_Lever DECIMAL(20,8) DEFAULT 0.00000000;

  SET available = IFNULL((SELECT SUM(income) - SUM(expense)
                          FROM i_balance_details
                          WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType),0);

  IF(details_WalletType = 1)THEN
     SELECT leverInterest,maxLever * 100 INTO lever_Interest,max_Lever FROM i_user WHERE deleted=0 AND userAccount = user_Account;
  END IF;

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
    'liability',IF(details_WalletType = 1,(openPrice + takeSpread) * tradeVolume - ((openPrice + takeSpread) * tradeVolume / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
  )) FROM i_trade_order WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

  SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
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
    'liability',IF(details_WalletType = 1,(openPrice + takeSpread) * tradeVolume - ((openPrice + takeSpread) * tradeVolume / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
  )) FROM i_trade_order WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 1),JSON_ARRAY());

  SELECT 1 AS `status`,'Get successfully' AS `message`,2000 AS `code`,
         nowCommission,
         position,
         available,
         (SELECT maxLever * 100 FROM i_user WHERE deleted=0 AND userAccount = user_Account) AS maxLever;
END
;;
DELIMITER ;

-- ===== i_modify_TP_SL =====
DROP PROCEDURE IF EXISTS `i_modify_TP_SL`;
DELIMITER ;;
CREATE PROCEDURE `i_modify_TP_SL`(
  IN user_Account VARCHAR(255), -- 用户名
  IN out_TradeNo VARCHAR(255),  -- 仓单号
  IN stop_Loss DECIMAL(20,8),
  IN take_Profit DECIMAL(20,8)
)
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  START TRANSACTION;

  UPDATE i_trade_order SET
    stopLoss = stop_Loss,
    takeProfit = take_Profit
  WHERE deleted=0 AND outTradeNo = out_TradeNo;

  UPDATE i_positions SET
    stopLoss = stop_Loss,
    takeProfit = take_Profit
  WHERE deleted=0 AND outTradeNo = out_TradeNo;

  IF t_error=1 THEN
    ROLLBACK;
    SELECT 0 AS `status`,'modify failed' AS `message`,4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 1 AS `status`,'modify successfully' AS `message`,2000 AS `code`;
  END IF;
END
;;
DELIMITER ;

-- ===== Update interface mapping =====
UPDATE `interface`
   SET `interfaceReturn` =
     '[{"key":"outTradeNo","note":"开仓编号","type":"string"},
       {"key":"stopLoss","note":"止损","type":"Number"},
       {"key":"takeProfit","note":"止盈","type":"Number"}]'
 WHERE `interfaceId` = 'I00007' AND `deleted` = 0;
