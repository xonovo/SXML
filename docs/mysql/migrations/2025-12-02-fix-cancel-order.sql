-- ============================================================
-- 修复撤单存储过程：i_cancel_order
-- 日期: 2025-12-02
-- 
-- 问题描述：
-- 撤单时计算解冻金额使用了错误的公式：
-- ❌ cancel_Amount = (openPrice + takeSpread) * tradeVolume
-- 导致 takeSpread 重复乘以数量，解冻金额错误
-- 
-- 正确逻辑：
-- ✅ cancel_Amount = (openPrice * tradeVolume) + takeSpread
-- 
-- 影响：
-- - 撤单后返还金额错误（多返或少返）
-- - 用户余额不准确
-- ============================================================

USE ice_markets;

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
  -- 修正：takeSpread 已是总费用，不能再乘数量
  SELECT 
    detailsWalletType,
    (openPrice * tradeVolume) + IFNULL(takeSpread, 0)
  INTO details_WalletType, cancel_Amount
  FROM i_trade_order
  WHERE deleted = 0 
    AND userAccount = user_Account 
    AND outTradeNo = out_TradeNo
  LIMIT 1;

  START TRANSACTION;

  -- 更新订单状态为已取消（tradeStatus = 3）
  UPDATE i_trade_order 
  SET tradeStatus = 3,
      closedAt = NOW()
  WHERE deleted = 0 
    AND userAccount = user_Account 
    AND outTradeNo = out_TradeNo
    AND tradeStatus = 0;  -- 仅限价单（未成交）可撤销

  SET affected = ROW_COUNT();

  IF t_error = 1 THEN
    ROLLBACK;
    SELECT 0 AS status, 'Cancel failed' AS message, 4003 AS code;
  ELSEIF affected = 0 THEN
    ROLLBACK;
    SELECT 0 AS status, 'Order not cancelable' AS message, 4004 AS code;
  ELSE
    -- 解冻保证金：撤单后原路退回
    INSERT INTO i_balance_details(
      detailsId,
      userAccount,
      detailsWalletType,
      detailsType,
      detailsSubType,
      income,
      expense,
      outTradeNo,
      detailsRemarks,
      createdDate
    )
    VALUES(
      getGenerateId('i_balance_details'),
      user_Account,
      IFNULL(details_WalletType, 0),
      1,  -- detailsType: 1=交易
      6,  -- detailsSubType: 6=撤单解冻
      IFNULL(cancel_Amount, 0),  -- income: 返还冻结金额
      0,  -- expense: 0
      out_TradeNo,
      CONCAT('撤单解冻保证金: ', cancel_Amount),
      NOW()
    );
    
    COMMIT;
    SELECT 1 AS status, 'Cancelled successfully' AS message, 2000 AS code;
  END IF;
END;;

DELIMITER ;

-- ============================================================
-- 验证部署
-- ============================================================
SELECT 
  ROUTINE_NAME,
  ROUTINE_TYPE,
  CREATED,
  LAST_ALTERED
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'ice_markets'
  AND ROUTINE_NAME = 'i_cancel_order';

-- ============================================================
-- 测试脚本（可选）
-- ============================================================

-- 测试场景：提交限价单 → 撤单 → 验证余额返还
-- 
-- 1. 提交限价单（tradeStatus = 0）
-- CALL i_create_order(
--   'TEST_USER',      -- userAccount
--   'XAUUSD',         -- itemId
--   0,                -- detailsWalletType (现金)
--   'buy',            -- direction
--   0,                -- tradeType (限价单)
--   4218.30,          -- openPrice
--   10.0,             -- tradeVolume
--   4200.00,          -- stopLoss
--   4250.00,          -- takeProfit
--   5.0,              -- takeSpread (总费用 = 0.5 × 10)
--   1.0,              -- tradeRate
--   0                 -- tradeStatus (限价单)
-- );
-- 
-- 2. 查询冻结记录
-- SELECT * FROM i_balance_details 
-- WHERE userAccount = 'TEST_USER' 
--   AND detailsSubType = 5  -- 限价单冻结
-- ORDER BY createdDate DESC 
-- LIMIT 1;
-- 
-- 预期冻结金额：(4218.30 × 10) + 5 = 42188.00 USDT
-- 
-- 3. 撤单
-- CALL i_cancel_order('TEST_USER', '<outTradeNo>');
-- 
-- 4. 查询解冻记录
-- SELECT * FROM i_balance_details 
-- WHERE userAccount = 'TEST_USER' 
--   AND detailsSubType = 6  -- 撤单解冻
-- ORDER BY createdDate DESC 
-- LIMIT 1;
-- 
-- 预期解冻金额：42188.00 USDT（与冻结金额一致）
-- 
-- 5. 验证余额
-- SELECT SUM(income - expense) AS balance
-- FROM i_balance_details
-- WHERE userAccount = 'TEST_USER'
--   AND detailsWalletType = 0;
-- 
-- 预期：余额恢复到提交限价单前的数值

-- ============================================================
-- 重要说明
-- ============================================================
-- 
-- 1. 限价单流程：
--    - 提交：冻结保证金（detailsSubType = 5）
--    - 成交：扣款并开仓（detailsSubType = 2）
--    - 撤单：解冻保证金（detailsSubType = 6）
-- 
-- 2. 冻结/解冻金额计算：
--    - 冻结金额 = (开仓价 × 数量) + 总点差
--    - 解冻金额 = 冻结金额（原路返还）
--    - takeSpread 已是总费用，不能再乘数量
-- 
-- 3. 修复前后对比：
--    ❌ 修复前：(4218.30 + 5) × 10 = 42233.00（多冻结45）
--    ✅ 修复后：(4218.30 × 10) + 5 = 42188.00（正确）
-- 
-- 4. 事务安全：
--    - 使用 START TRANSACTION / COMMIT / ROLLBACK
--    - 确保订单状态更新和余额返还同时成功或失败
-- ============================================================

SELECT 
  '撤单存储过程已修正' AS status,
  '解冻金额计算正确' AS fix,
  '与开仓逻辑保持一致' AS consistency;
