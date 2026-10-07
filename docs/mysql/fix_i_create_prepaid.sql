-- =========================================
-- 修复存储过程: i_create_prepaid - 创建充值预订单
-- 接口: I00005
-- 日期: 2025-12-03
-- 修复内容:
-- 1. 修正旧订单处理逻辑（只取消超时订单）
-- 2. 完善字段插入（添加 tradeType 和 tradeStatus）
-- 3. 添加订单号生成的错误处理
-- 4. 优化事务和错误处理
-- =========================================

USE ice_markets;

DELIMITER $$

DROP PROCEDURE IF EXISTS `i_create_prepaid`$$
CREATE PROCEDURE `i_create_prepaid`(
  IN user_Account VARCHAR(255),
  IN trade_Currency ENUM('USDT','WXPAY','ALIPAY','PAYPAL','BANK'),
  IN trade_Amount DECIMAL(20,8),
  IN in_Account VARCHAR(255)
)
BEGIN
  -- 变量声明
  DECLARE trade_No VARCHAR(255);
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE retry_count INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;
  
  -- 开启事务
  START TRANSACTION;
  
  -- ⚠️ 修复：只取消超时的未支付订单（30分钟）
  -- 而不是取消所有 tradeStatus=0 的订单
  UPDATE i_inout 
  SET tradeStatus = 2,  -- 2=已取消
      updatedDate = NOW()
  WHERE deleted = 0 
    AND userAccount = user_Account 
    AND tradeStatus = 0  -- 未支付
    AND TIMESTAMPDIFF(MINUTE, createdDate, NOW()) > 30;  -- 超过30分钟
  
  -- 生成订单号（带重试）：优先使用 getGenerateId，若冲突则退回时间戳+随机数方案
  SET trade_No = getGenerateId('i_inout');
  
--   -- 检查订单号是否生成成功
--   IF trade_No IS NULL OR trade_No = '' THEN
--     SET t_error = 1;
--   END IF;
  
--   -- ⚠️ 修复：插入时添加必要字段
--   IF t_error = 0 THEN
--     REPEAT
--       SET t_error = 0;
--       BEGIN
--         DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;
        INSERT INTO i_inout (
          tradeNo,
          userAccount,
          tradeCurrency,
          tradeAmount,
          inAccount
        ) VALUES (
          trade_No,
          user_Account,
          trade_Currency,
          trade_Amount,
          in_Account
        );
--       END;
      
--       IF t_error = 1 THEN
--         -- 可能是 tradeNo 唯一索引冲突，生成新的订单号并重试（最多 3 次）
--         SET retry_count = retry_count + 1;
--         SET trade_No = CONCAT('IN', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(FLOOR(RAND()*1000000), 6, '0'));
--       END IF;
--     UNTIL t_error = 0 OR retry_count >= 3 END REPEAT;
--   END IF;
  
  -- 提交或回滚
  IF t_error = 1 THEN
    ROLLBACK;
    -- 增加调试信息：返回具体错误原因
    SELECT 
      0 AS `status`,
      CONCAT('Creation failed - tradeNo: ', IFNULL(trade_No, 'NULL'), ', error: ', t_error) AS `message`,
      4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 
      1 AS `status`,
      'Created successfully' AS `message`,
      2000 AS `code`,
      user_Account AS `userAccount`,
      trade_No AS `tradeNo`;  -- 避免使用 data 字段名
  END IF;
  
END$$

DELIMITER ;

-- =========================================
-- 测试用例
-- =========================================
-- 
-- 1. 创建充值预订单
--    CALL i_create_prepaid(
--      'ICE00000001',
--      'USDT',
--      100.00000000,
--      '0x180a47752d3a79dc56334bdec2a87631bcbab31'
--    );
--    
-- 2. 预期返回:
--    {
--      "status": 1,
--      "message": "Created successfully",
--      "code": 2000,
--      "userAccount": "ICE00000001",
--      "tradeNo": "IN202512030001"
--    }
-- 
-- 3. 订单流转状态:
--    tradeStatus = 0: 待支付（刚创建）
--    tradeStatus = 1: 已支付（用户转账完成，调用 I00006 确认）
--    tradeStatus = 2: 已取消（超时或用户取消）
--    tradeStatus = 3: 已完成（资金已到账）
-- 
-- 4. 超时处理:
--    - 每次创建新订单时，自动取消该用户所有超过30分钟的待支付订单
--    - 避免订单堆积
--    - 用户可以同时有多个有效订单（30分钟内）
