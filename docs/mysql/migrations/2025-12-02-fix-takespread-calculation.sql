-- ============================================================
-- 修复 takeSpread 重复计算问题
-- 日期: 2025-12-02
-- 
-- 问题描述:
-- takeSpread 字段已经是总费用（单位点差 × 数量），但在多处被错误地
-- 再次乘以数量，导致点差费用被重复计算。
-- 
-- 错误示例:
-- ❌ openCost = (openPrice + takeSpread) * tradeVolume
--    相当于: openPrice×数量 + takeSpread×数量  （错误！点差被重复计算）
-- 
-- 正确逻辑:
-- ✅ openCost = (openPrice * tradeVolume) + takeSpread
--    相当于: openPrice×数量 + takeSpread  （正确！点差已是总额）
-- 
-- 影响范围:
-- 1. trigger_fix_close_order.sql - 平仓盈亏计算 + 余额入账
-- 2. sp_positions_wallet_procs.sql - 负债(liability)计算
-- 3. sp_close_order_complete.sql - 平仓成本计算
-- 
-- 附加修复:
-- - 触发器现在会立即入账余额，不再依赖异步结算 sp_settle_closed_orders
-- 
-- 部署方式:
-- SOURCE docs/mysql/migrations/2025-12-02-fix-takespread-calculation.sql;
-- ============================================================

USE ice_markets;

-- ============================================================
-- 1. 重新部署修正后的触发器
-- ============================================================
SOURCE docs/mysql/trigger_fix_close_order.sql;

-- ============================================================
-- 2. 重新部署修正后的存储过程
-- ============================================================
SOURCE docs/mysql/sp_positions_wallet_procs.sql;
SOURCE docs/mysql/sp_close_order_complete.sql;

-- ============================================================
-- 3. 验证部署
-- ============================================================
SELECT 
    'trigger_fix_close_order' AS component,
    TRIGGER_NAME,
    EVENT_MANIPULATION,
    ACTION_TIMING,
    CREATED
FROM information_schema.TRIGGERS 
WHERE TRIGGER_SCHEMA = 'ice_markets' 
  AND TRIGGER_NAME = 'auto_updated_date_on_i_trade_order';

SELECT 
    'stored_procedures' AS component,
    ROUTINE_NAME,
    ROUTINE_TYPE,
    CREATED,
    LAST_ALTERED
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'ice_markets'
  AND ROUTINE_NAME IN ('i_get_orderinfo', 'i_create_order', 'sp_close_order_complete')
ORDER BY ROUTINE_NAME;

-- ============================================================
-- 4. 测试验证（可选）
-- ============================================================
-- 测试场景：开仓价 100，数量 10，单位点差 0.5
-- 前端计算: takeSpread = 0.5 * 10 = 5.0（总费用）
-- 数据库应计算: openCost = 100 * 10 + 5 = 1005（不是 (100+5)*10=1050）

-- 示例测试数据（请根据实际情况调整）
-- INSERT INTO i_trade_order (...) VALUES (...);
-- 检查 liability 是否正确：应为 1005 - (1005/杠杆)，而非 1050 - (1050/杠杆)

SELECT 
    '修复完成' AS status,
    '请重启应用或重新加载存储过程' AS next_step,
    '建议测试订单提交和平仓流程验证计算正确性' AS recommendation;

-- ============================================================
-- 4. 修正异步结算存储过程（用于自动平仓）
-- ============================================================
-- sp_settle_closed_orders 用于自动平仓（止损/止盈/爆仓）的批量结算
-- 修正其计算逻辑，与触发器保持一致
SOURCE docs/mysql/migrations/2025-12-02-fix-sp-settle-closed-orders.sql;

SELECT 
    '异步结算已修正' AS notice,
    '用于自动平仓的批量结算' AS `usage`,
    '与触发器逻辑保持一致' AS consistency;
