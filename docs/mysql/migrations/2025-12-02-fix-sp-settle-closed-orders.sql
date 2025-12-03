-- ============================================================
-- 修正 sp_settle_closed_orders 存储过程
-- 日期: 2025-12-02
-- 
-- 用途：
-- 用于自动平仓（止损/止盈/爆仓）后的余额结算
-- 与触发器逻辑保持一致，但用于批处理场景
-- 
-- 使用场景：
-- - 手动平仓：触发器 auto_updated_date_on_i_trade_order 自动入账
-- - 自动平仓：定时任务调用 sp_settle_closed_orders 批量入账
-- 
-- 修复内容：
-- 1. 修正开仓成本计算（takeSpread 已是总费用，不能再乘数量）
-- 2. 返还本金 + 净盈亏，而不是只返还盈亏
-- 3. 使用 detailsSubType = 3（与触发器一致）
-- ============================================================

USE ice_markets;

DELIMITER ;;

DROP PROCEDURE IF EXISTS `sp_settle_closed_orders`;;

CREATE PROCEDURE `sp_settle_closed_orders`()
BEGIN
  DECLARE v_batch_size INT DEFAULT 100;
  DECLARE v_settled_count INT DEFAULT 0;
  
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
    SELECT 0 AS success, 'Settlement failed' AS message, v_settled_count AS processed;
  END;

  START TRANSACTION;

  -- ========================================
  -- 1. 平仓收入入账（本金 + 净盈亏）
  -- ========================================
  -- 处理已平仓但未入账的订单（自动平仓场景）
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
  SELECT 
    getGenerateId('i_balance_details'),
    o.userAccount,
    o.detailsWalletType,
    1,  -- detailsType: 1=交易
    3,  -- detailsSubType: 3=平仓卖出（与触发器保持一致）
    -- income = 本金 + 净盈亏
    -- 本金 = 开仓成本 = (开仓价 × 数量) + 总点差
    -- 净盈亏 = 原始盈亏 - 利息
    (
      -- 开仓成本（修正：takeSpread 已是总费用，不能再乘数量）
      ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0))
      +
      -- 原始盈亏（区分做多/做空）
      CASE 
        WHEN o.direction = 'buy' THEN 
          -- 做多：盈亏 = 平仓收入 - 开仓成本
          (o.currentPrice * o.tradeVolume) - ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0))
        ELSE 
          -- 做空：盈亏 = 开仓成本 - 平仓收入
          ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0)) - (o.currentPrice * o.tradeVolume)
      END
      -
      -- 扣除利息
      IFNULL(o.swap, 0)
    ),
    0,  -- expense: 平仓不扣款
    o.outTradeNo,
    CONCAT(
      '自动平仓收入: 本金',
      ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0)),
      ' + 盈亏',
      CASE 
        WHEN o.direction = 'buy' THEN 
          (o.currentPrice * o.tradeVolume) - ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0))
        ELSE 
          ((o.openPrice * o.tradeVolume) + IFNULL(o.takeSpread, 0)) - (o.currentPrice * o.tradeVolume)
      END - IFNULL(o.swap, 0)
    ),
    NOW()
  FROM i_trade_order o
  WHERE o.deleted = 0
    AND o.tradeStatus = 2  -- 已平仓
    AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)  -- 最近5分钟
    -- 去重：检查是否已入账（避免与触发器重复）
    AND NOT EXISTS (
      SELECT 1 FROM i_balance_details bd
      WHERE bd.deleted = 0
        AND bd.outTradeNo = o.outTradeNo
        AND bd.detailsSubType = 3  -- 平仓卖出
    )
  ORDER BY o.closedAt ASC
  LIMIT v_batch_size;

  SET v_settled_count = ROW_COUNT();

  -- ========================================
  -- 2. 更新聚合持仓表（递减仓位）
  -- ========================================
  -- 处理已平仓但持仓表未更新的记录
  UPDATE i_positions p
  INNER JOIN (
    SELECT 
      o.itemId,
      o.direction,
      o.userAccount,
      o.detailsWalletType,
      SUM(o.tradeVolume) AS closedVol
    FROM i_trade_order o
    WHERE o.deleted = 0
      AND o.tradeStatus = 2
      AND o.closedAt >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      -- 确保已入账（避免处理未完成的订单）
      AND EXISTS (
        SELECT 1 FROM i_balance_details bd
        WHERE bd.deleted = 0
          AND bd.outTradeNo = o.outTradeNo
          AND bd.detailsSubType = 3
      )
    GROUP BY o.itemId, o.direction, o.userAccount, o.detailsWalletType
  ) closed 
    ON closed.userAccount = p.userAccount
   AND closed.itemId = p.aggItemId
   AND closed.direction = p.aggDirection
   AND closed.detailsWalletType = p.detailsWalletType
  SET 
    p.totalVolume = GREATEST(0, p.totalVolume - closed.closedVol),
    p.updatedAt = NOW()
  WHERE p.deleted = 0
    AND p.totalVolume > 0;

  COMMIT;

  SELECT 
    1 AS success, 
    'Settlement completed' AS message,
    v_settled_count AS processed_count;
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
  AND ROUTINE_NAME = 'sp_settle_closed_orders';

-- ============================================================
-- 测试脚本（可选）
-- ============================================================

-- 测试场景：模拟自动平仓后调用结算
-- 
-- 1. 准备测试数据（假设系统自动平仓了一笔订单）
-- UPDATE i_trade_order 
-- SET tradeStatus = 2, 
--     currentPrice = 4200.00,
--     closedAt = NOW()
-- WHERE outTradeNo = 'TEST_AUTO_CLOSE_001';
-- 
-- 2. 调用结算存储过程
-- CALL sp_settle_closed_orders();
-- 
-- 3. 验证结果
-- SELECT * FROM i_balance_details 
-- WHERE outTradeNo = 'TEST_AUTO_CLOSE_001' 
--   AND detailsSubType = 3;
-- 
-- 预期：
-- - income = 本金 + 净盈亏（与触发器计算结果一致）
-- - detailsRemarks 包含详细计算说明

-- ============================================================
-- 定时任务配置建议
-- ============================================================

-- Node.js (node-cron)
-- const cron = require('node-cron');
-- 
-- // 每分钟执行一次，处理自动平仓的订单
-- cron.schedule('*/1 * * * *', async () => {
--   try {
--     const result = await db.query('CALL sp_settle_closed_orders()');
--     console.log(`[Settlement] Processed ${result[0].processed_count} orders`);
--   } catch (error) {
--     console.error('[Settlement] Error:', error);
--   }
-- });

-- MySQL Event Scheduler
-- CREATE EVENT IF NOT EXISTS evt_settle_closed_orders
-- ON SCHEDULE EVERY 1 MINUTE
-- DO CALL sp_settle_closed_orders();

-- ============================================================
-- 重要说明
-- ============================================================
-- 
-- 1. 平仓方式区分：
--    - 手动平仓：用户点击按钮 → 触发器自动入账（实时）
--    - 自动平仓：系统止损/止盈/爆仓 → sp_settle_closed_orders 批量入账（定时）
-- 
-- 2. 去重保护：
--    - 存储过程检查 detailsSubType = 3，不会与触发器重复
--    - 触发器和存储过程使用相同的 detailsSubType
-- 
-- 3. 计算逻辑一致性：
--    - 开仓成本 = (开仓价 × 数量) + 总点差（takeSpread 已是总额）
--    - 净盈亏 = 原始盈亏 - 利息
--    - 入账金额 = 本金 + 净盈亏
-- 
-- 4. 性能优化：
--    - 批量处理最近5分钟的订单（可调整）
--    - 限制每次处理 100 条（v_batch_size）
--    - 使用索引加速查询
-- ============================================================

SELECT 
  '存储过程已修正' AS status,
  '计算逻辑与触发器保持一致' AS consistency,
  '用于自动平仓场景的批量结算' AS `usage`;
