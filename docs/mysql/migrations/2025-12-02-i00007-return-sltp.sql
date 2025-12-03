-- Migration: Extend I00007 to return stopLoss/takeProfit in response
-- Date: 2025-12-02

-- 1) Recreate procedure i_create_order with extended SELECT result
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
  -- in-创建订单
  DECLARE out_TradeNo,trader_temp,details_Id,p_Id VARCHAR(255);
  DECLARE balance,totalAmount,swap_temp,lever_Interest decimal(20,8) DEFAULT 0;
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  -- 1、获取当前用户的余额
  SET balance = IFNULL((SELECT SUM(income) - SUM(expense)
                        FROM i_balance_details
                        WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType),0);

  -- 2、获取当前总操作的总金额金额((开仓价 + 点差) * 数量）
  SET totalAmount = (open_Price + take_Spread) * trade_Volume;

  -- 3、计算一个小时的利息
  IF(details_WalletType > 0)THEN
     SET lever_Interest = (SELECT leverInterest FROM i_user WHERE deleted=0 AND userAccount = user_Account);
     SET swap_temp = (totalAmount - totalAmount / trade_Rate) * lever_Interest;
  END IF;

  -- 4、假如余额足够
  IF(balance >= totalAmount)THEN

     -- 4.1、获取交易员userAccount
     SET trader_temp = (SELECT invitationUserAccount FROM i_user WHERE deleted=0 AND userAccount = user_Account);

     START TRANSACTION;
     -- 4.2、创建一个订单
     SET out_TradeNo = getGenerateId('i_trade_order');
     INSERT INTO `i_trade_order`(
       outTradeNo,userAccount,itemId,detailsWalletType,direction,tradeType,openPrice,stopLoss,takeProfit,swap,takeSpread,tradeVolume,tradeRate,tradeStatus,trader
     ) VALUES (
       out_TradeNo,user_Account,item_Id,details_WalletType,direction_Temp,trade_Type,open_Price,stop_Loss,take_Profit,swap_temp,take_Spread,trade_Volume,trade_Rate,trade_Status,trader_temp
     );

     -- 4.3、假如交易状态成功
     IF(trade_Status = 1)THEN
       -- 4.4、扣除金额
       SET details_Id = getGenerateId('i_balance_details');
       INSERT INTO `i_balance_details`(
         detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,expense,outTradeNo
       ) VALUES (
         details_Id,user_Account,details_WalletType,1,2,totalAmount,out_TradeNo
       );

       -- 4.5、添加一个仓位
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
       -- 扩展返回字段：下单即回传 stopLoss / takeProfit
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

-- 2) Update interface return mapping for I00007
UPDATE `interface`
   SET `interfaceReturn` =
     '[{"key":"outTradeNo","note":"开仓编号","type":"string"},
        {"key":"stopLoss","note":"止损","type":"Number"},
        {"key":"takeProfit","note":"止盈","type":"Number"}]'
 WHERE `interfaceId` = 'I00007' AND `deleted` = 0;
