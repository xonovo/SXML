-- ============================================================
-- 修正异步结算存储过程：sp_settle_closed_orders
-- 日期: 2025-12-02
-- 
-- 用途：
-- sp_settle_closed_orders 用于自动平仓（止损/止盈/爆仓）的批量结算
-- 与触发器 auto_updated_date_on_i_trade_order 配合使用
-- 
-- 平仓方式区分：
-- - 手动平仓：用户点击 → I00008 接口 → 触发器自动入账（实时）
-- - 自动平仓：系统止损/止盈/爆仓 → 定时任务调用 sp_settle_closed_orders（批量）
-- 
-- 修复内容：
-- 1. 修正开仓成本计算（takeSpread 重复乘数量问题）
-- 2. 返还本金 + 净盈亏，而不是只返还盈亏
-- 3. 使用与触发器一致的 detailsSubType = 3
-- ============================================================

USE ice_markets;

-- 应用修正后的存储过程
SOURCE ./migrations/2025-12-02-fix-sp-settle-closed-orders.sql;

-- 验证
SELECT 
    ROUTINE_NAME,
    ROUTINE_TYPE,
    CREATED,
    LAST_ALTERED
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'ice_markets'
  AND ROUTINE_NAME = 'sp_settle_closed_orders';

-- ============================================================
-- 说明：两种平仓方式的协作
-- ============================================================
-- 
-- 1. 手动平仓流程（实时）：
--    用户点击平仓按钮
--    → 调用 I00008 接口
--    → 存储过程 i_close_order 更新订单状态
--    → 触发器 auto_updated_date_on_i_trade_order 自动执行
--    → 立即入账余额（detailsSubType = 3）
--    → 用户余额实时更新
-- 
-- 2. 自动平仓流程（批量）：
--    系统监控到触发条件（止损/止盈/爆仓）
--    → 更新订单状态为已平仓
--    → 定时任务（每分钟）调用 sp_settle_closed_orders
--    → 批量处理最近5分钟的已平仓订单
--    → 入账余额（detailsSubType = 3，与触发器一致）
--    → 更新聚合持仓表
-- 
-- 3. 去重保护：
--    - 存储过程检查 NOT EXISTS (detailsSubType = 3)
--    - 确保每笔订单只入账一次
--    - 手动平仓和自动平仓不会重复
-- ============================================================

SELECT 
    '异步结算存储过程已修正' AS status,
    '用于自动平仓场景的批量结算' AS `usage`,
    '与触发器配合，避免重复入账' AS protection;
