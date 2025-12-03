-- =========================================
-- 存储过程: i_getMyWallet - 获取我的钱包资产信息
-- 日期: 2025-12-02
-- 接口: I00003
-- 说明: 返回资金账户和杠杆账户的完整资产数据
--       支持前端实时行情联动计算动态资产
--       新增：aggregated positions 汇总数据以提高前端性能
-- =========================================

USE ice_markets;

DELIMITER $$

DROP PROCEDURE IF EXISTS `i_getMyWallet`$$
CREATE PROCEDURE `i_getMyWallet`(
  IN user_Account VARCHAR(255),
  IN details_WalletType TINYINT  -- 0=资金账户，1=杠杆账户
)
BEGIN
  -- 变量声明
  DECLARE cash_Balance, lever_Balance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE total_Collateral, total_Borrowed, total_Interest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lever_Interest_Rate, max_Lever_Rate DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE frozen_Margin DECIMAL(20,8) DEFAULT 0.00000000;
  
  -- 1️⃣ 查询钱包余额（按钱包类型过滤）
  -- 资金账户: detailsWalletType=0
  -- 杠杆账户: detailsWalletType=1
  SELECT 
    SUM(CASE WHEN bd.detailsWalletType = 0 THEN bd.income - bd.expense ELSE 0 END),
    SUM(CASE WHEN bd.detailsWalletType = 1 THEN bd.income - bd.expense ELSE 0 END)
  INTO cash_Balance, lever_Balance
  FROM i_balance_details bd
  WHERE bd.deleted = 0 AND bd.userAccount = user_Account;
  
  -- 2️⃣ 查询用户杠杆配置
  SELECT 
    IFNULL(u.leverInterest, 0.00038616),
    IFNULL(u.maxLever, 0.20)
  INTO lever_Interest_Rate, max_Lever_Rate
  FROM i_user u
  WHERE u.deleted = 0 AND u.userAccount = user_Account;
  
  -- 3️⃣ 查询抵押总额（状态=0有效抵押）
  SELECT IFNULL(SUM(c.collateralAmount), 0)
  INTO total_Collateral
  FROM i_collateral c
  WHERE c.deleted = 0 
    AND c.userAccount = user_Account 
    AND c.collateralStatus = 0;
  
  -- 4️⃣ 查询借款总额与累计利息（状态=0未还款）
  SELECT 
    IFNULL(SUM(l.leverAmount), 0),
    IFNULL(SUM(
      l.leverAmount * IFNULL(l.leverInterest, lever_Interest_Rate) 
      * TIMESTAMPDIFF(HOUR, l.createdDate, NOW())
    ), 0)
  INTO total_Borrowed, total_Interest
  FROM i_lever l
  WHERE l.deleted = 0 
    AND l.userAccount = user_Account 
    AND l.leverStatus = 0;
  
  -- 5️⃣ 查询冻结保证金（挂单未成交的冻结金额）
  -- detailsSubType=5 表示限价单冻结保证金
  SELECT IFNULL(SUM(bd.expense), 0)
  INTO frozen_Margin
  FROM i_balance_details bd
  WHERE bd.deleted = 0 
    AND bd.userAccount = user_Account
    AND bd.detailsWalletType = details_WalletType
    AND bd.detailsSubType = 5
    AND bd.outTradeNo IN (
      SELECT outTradeNo FROM i_trade_order 
      WHERE deleted=0 AND userAccount=user_Account AND tradeStatus=0
    );
  
  -- 6️⃣ 查询 aggregated positions（汇总持仓）
  -- 用于前端实时计算浮动盈亏，减少数据传输量
  -- 注意：直接使用 JSON_ARRAYAGG，不使用会话变量，让 MySQL 自动转换为 JSON
  SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'itemId', aggItemId,
    'direction', aggDirection,
    'avgOpenPrice', avgOpenPrice,
    'totalVolume', totalVolume,
    'totalSwap', swap,
    'tradeRate', tradeRate,
    'detailsWalletType', detailsWalletType
  ))
  INTO @aggregated_Positions
  FROM i_positions
  WHERE deleted=0 
    AND userAccount = user_Account
    AND detailsWalletType = details_WalletType
    AND totalVolume > 0;  -- 过滤掉已平仓的汇总记录
  
  -- 如果没有持仓，设置为空数组
  IF @aggregated_Positions IS NULL THEN
    SET @aggregated_Positions = JSON_ARRAY();
  END IF;
  
  -- 7️⃣ 查询挂单列表（用于前端动态计算冻结资金）
  SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo', outTradeNo,
    'itemId', itemId,
    'direction', direction,
    'openPrice', openPrice,
    'tradeVolume', tradeVolume,
    'takeSpread', takeSpread,
    'tradeType', tradeType
  ))
  INTO @pending_Orders
  FROM i_trade_order
  WHERE deleted=0 
    AND userAccount = user_Account
    AND detailsWalletType = details_WalletType
    AND tradeStatus = 0;  -- 挂单未成交
    
  -- 如果没有挂单，设置为空数组
  IF @pending_Orders IS NULL THEN
    SET @pending_Orders = JSON_ARRAY();
  END IF;
  
  -- 8️⃣ 返回完整资产数据
  -- 前端根据实时行情动态计算：
  -- - totalAsset = walletBalance + positionPL - totalLiabilities
  -- - positionPL = Σ((currentPrice - avgOpenPrice) × totalVolume × direction - totalSwap)
  -- - equity = totalAsset - marginUsed
  -- - freeMargin = equity - marginLevel
  -- - marginLevel = (marginUsed / equity) × 100%
  SELECT 
    1 AS status,
    'Get successfully' AS message,
    2000 AS code,
    -- 账户基本信息
    user_Account AS userAccount,
    details_WalletType AS walletType,
    -- 基础余额数据
    IFNULL(cash_Balance, 0) AS cashBalance,
    IFNULL(lever_Balance, 0) AS leverBalance,
    IFNULL(CASE 
      WHEN details_WalletType = 0 THEN cash_Balance 
      ELSE lever_Balance 
    END, 0) AS walletBalance,
    -- 杠杆相关数据
    IFNULL(total_Collateral, 0) AS collateral,
    IFNULL(total_Borrowed, 0) AS borrowed,
    IFNULL(total_Interest, 0) AS interest,
    IFNULL(total_Borrowed + total_Interest, 0) AS totalLiabilities,
    IFNULL(lever_Interest_Rate, 0) AS leverInterestRate,
    IFNULL(max_Lever_Rate * 100, 0) AS maxLeverageRatio,
    -- 冻结与可用
    IFNULL(frozen_Margin, 0) AS frozenMargin,
    IFNULL(CASE 
      WHEN details_WalletType = 0 THEN cash_Balance - frozen_Margin
      ELSE lever_Balance - frozen_Margin
    END, 0) AS available,
    -- 持仓数据（前端实时计算盈亏）- 使用 CAST 转换为 JSON
    CAST(@aggregated_Positions AS JSON) AS positions,
    CAST(@pending_Orders AS JSON) AS pendingOrders;
    
END$$

DELIMITER ;

-- =========================================
-- 使用说明
-- =========================================
-- 
-- 1. 调用示例:
--    CALL i_getMyWallet('ICE00000001', 0);  -- 查询资金账户
--    CALL i_getMyWallet('ICE00000001', 1);  -- 查询杠杆账户
-- 
-- 2. 返回的 data JSON 包含:
--    - walletBalance: 当前钱包余额（现金或杠杆）
--    - borrowed + interest = totalLiabilities: 总负债
--    - collateral: 抵押物金额
--    - maxLeverageRatio: 最大杠杆倍数
--    - positions: aggregated 持仓数组（用于实时盈亏计算）
--    - pendingOrders: 挂单数组（用于冻结资金计算）
-- 
-- 3. 前端实时计算公式:
--    ```javascript
--    // 3.1 持仓盈亏
--    let positionPL = 0;
--    data.positions.forEach(pos => {
--      const currentPrice = getCurrentPrice(pos.itemId);
--      const direction = pos.direction === 'buy' ? 1 : -1;
--      const pl = (currentPrice - pos.avgOpenPrice) * pos.totalVolume * direction - pos.totalSwap;
--      positionPL += pl;
--    });
--    
--    // 3.2 总资产 = 钱包余额 + 持仓盈亏 - 总负债
--    const totalAsset = data.walletBalance + positionPL - data.totalLiabilities;
--    
--    // 3.3 净值 = 总资产（已包含持仓盈亏和负债）
--    const equity = totalAsset;
--    
--    // 3.4 已用保证金 = Σ(开仓价 × 数量 / 杠杆率)
--    let marginUsed = 0;
--    data.positions.forEach(pos => {
--      marginUsed += (pos.avgOpenPrice * pos.totalVolume) / pos.tradeRate;
--    });
--    
--    // 3.5 保证金水平 = (已用保证金 / 净值) × 100%
--    const marginLevel = (marginUsed / equity) * 100;
--    
--    // 3.6 可用保证金 = 净值 - 已用保证金
--    const freeMargin = equity - marginUsed;
--    ```
-- 
-- 4. 实时更新策略:
--    - 页面加载时调用一次 I00003 获取静态数据
--    - 订阅行情推送，每次价格更新时前端重算所有动态字段
--    - 避免频繁调用后端接口，减少服务器负载
-- 
-- 5. 性能优化:
--    - 使用 i_positions 汇总表代替 i_trade_order，减少传输数据量
--    - 前端缓存 positions 数组，仅在下单/平仓时重新请求
--    - WebSocket 推送仅包含价格，所有计算在前端完成
