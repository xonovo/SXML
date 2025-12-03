-- =========================================
-- 迁移: 为 i_positions 增加钱包类型，并建立必要索引
-- 日期: 2025-12-01
-- 说明: 0=现金钱包, 1=杠杆钱包；用于 Trades 页面分栏展示与后端聚合分流
-- =========================================

USE ice_markets;

-- 1) 为 i_positions 增加/重命名为 detailsWalletType 字段（如已存在则跳过）
SET @col_details_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'i_positions' AND COLUMN_NAME = 'detailsWalletType'
);

SET @col_wallet_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'i_positions' AND COLUMN_NAME = 'walletType'
);

-- 优先重命名 walletType -> detailsWalletType；若均不存在则新增 detailsWalletType
SET @sql := (
  CASE 
    WHEN @col_details_exists > 0 THEN 'SELECT "detailsWalletType exists"'
    WHEN @col_wallet_exists > 0 THEN 'ALTER TABLE i_positions CHANGE walletType detailsWalletType TINYINT(1) NOT NULL DEFAULT 0 COMMENT "0=cash,1=leveraged"'
    ELSE 'ALTER TABLE i_positions ADD COLUMN detailsWalletType TINYINT(1) NOT NULL DEFAULT 0 COMMENT "0=cash,1=leveraged" AFTER aggItemId'
  END
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 建立联合索引：用户 + 品种 + 钱包类型
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'i_positions' AND INDEX_NAME = 'idx_user_item_wallet'
);

SET @sql2 := IF(@idx_exists = 0,
  'ALTER TABLE i_positions ADD INDEX idx_user_item_wallet (userAccount, aggItemId, detailsWalletType)',
  'SELECT "idx_user_item_wallet exists"');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3) 现有历史数据的 detailsWalletType 统一置 0（现金），可后续通过回放订单或脚本纠正
UPDATE i_positions SET detailsWalletType = 0 WHERE detailsWalletType IS NULL;

-- 4) 验证
SHOW COLUMNS FROM i_positions LIKE 'detailsWalletType';
SHOW INDEX FROM i_positions WHERE Key_name = 'idx_user_item_wallet';
