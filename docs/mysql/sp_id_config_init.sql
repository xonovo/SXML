-- 初始化/补齐 getGenerateId 所需的 id_config 配置
-- 请在目标数据库中执行一次即可（可重复执行，使用 UPSERT）

USE ice_markets;

-- 假设 id_config 结构为 (tableName VARCHAR PK, prefix VARCHAR, lastNumber BIGINT, step INT, updatedAt DATETIME ...)
-- 如果你的实际结构不同，请把列名按需对齐

INSERT INTO id_config(tableName, prefix, lastNumber, step, updatedAt)
VALUES
  ('i_trade_order','ITO',0,1,NOW()),
  ('i_balance_details','IBD',0,1,NOW()),
  ('i_positions','IPS',0,1,NOW()),
  ('i_collateral','ICL',0,1,NOW()),
  ('i_lever','ILV',0,1,NOW())
ON DUPLICATE KEY UPDATE
  prefix = VALUES(prefix),
  step = VALUES(step),
  updatedAt = NOW();

-- 可选：校验
SELECT * FROM id_config WHERE tableName IN ('i_trade_order','i_balance_details','i_positions','i_collateral','i_lever');
