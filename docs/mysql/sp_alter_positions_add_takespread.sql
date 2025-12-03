-- =====================================================
-- 为 i_positions 表添加聚合字段和平均点差字段
-- 执行日期: 2025-11-29
-- 用途: 支持持仓聚合和平均点差计算
-- =====================================================

USE ice_markets;

-- 1. 添加聚合持仓相关字段（如果不存在）
ALTER TABLE `i_positions` 
  ADD COLUMN IF NOT EXISTS `aggDirection` ENUM('buy','sell') NULL COMMENT '聚合方向：buy=多头，sell=空头' AFTER `outTradeNo`,
  ADD COLUMN IF NOT EXISTS `aggItemId` VARCHAR(255) NULL COMMENT '聚合品种代码' AFTER `aggDirection`,
  ADD COLUMN IF NOT EXISTS `totalVolume` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 COMMENT '总持仓量（累计补仓后的总量）' AFTER `aggItemId`,
  ADD COLUMN IF NOT EXISTS `avgOpenPrice` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 COMMENT '平均开仓价格（加权平均）' AFTER `totalVolume`,
  ADD COLUMN IF NOT EXISTS `takeSpread` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 COMMENT '平均点差（加权平均，用于计算真实成本）' AFTER `avgOpenPrice`,
  ADD COLUMN IF NOT EXISTS `totalLiability` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 COMMENT '总负债（杠杆账户累计负债）' AFTER `avgTakeSpread`,
  ADD COLUMN IF NOT EXISTS `interestAccrued` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 COMMENT '累计利息' AFTER `totalLiability`,
  ADD COLUMN IF NOT EXISTS `swap` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 COMMENT '聚合swap（预留字段）' AFTER `interestAccrued`,
  ADD COLUMN IF NOT EXISTS `tradeRate` DECIMAL(10,4) NOT NULL DEFAULT 1.00 COMMENT '交易倍率（杠杆倍数）' AFTER `swap`,
  ADD COLUMN IF NOT EXISTS `openedAt` TIMESTAMP NULL COMMENT '首次开仓时间' AFTER `tradeRate`,
  ADD COLUMN IF NOT EXISTS `updatedAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间' AFTER `openedAt`;

-- 2. 添加联合索引优化查询性能
ALTER TABLE `i_positions`
  ADD INDEX IF NOT EXISTS `idx_user_agg_direction_item` (`userAccount`, `aggDirection`, `aggItemId`, `deleted`) 
    COMMENT '聚合持仓查询优化';

-- 3. 验证表结构
SHOW COLUMNS FROM `i_positions` LIKE 'avgTakeSpread';
SHOW COLUMNS FROM `i_positions` LIKE 'aggDirection';

SELECT 'i_positions 表结构更新完成，已添加 avgTakeSpread 等聚合字段' AS result;
