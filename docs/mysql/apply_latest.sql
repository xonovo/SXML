-- Apply latest schema/procedures for ICE Markets
-- This aggregates the baseline plus targeted migrations to produce the newest procs.
-- Usage (in MySQL client):
--   SOURCE /absolute/path/to/docs/mysql/apply_latest.sql;

-- 1) Load baseline schema + procedures + triggers
SOURCE ./ice_markets_data.sql;

-- 2) Apply focused migrations (order matters)
-- IMPORTANT: The file above is deprecated; use walletType-aware procs below
-- Override baseline with the latest wallet-type aware stored procedures
SOURCE ./sp_positions_wallet_procs.sql;

-- 3) Apply takeSpread calculation fix (2025-12-02)
SOURCE ./migrations/2025-12-02-fix-takespread-calculation.sql;
