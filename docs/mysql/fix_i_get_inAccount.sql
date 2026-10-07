-- =========================================
-- 修复存储过程: i_get_inAccount - 获取收款账户列表
-- 接口: I00004
-- 日期: 2025-12-03
-- 修复内容:
-- 1. 移除错误的 userAccount 过滤（收款账户是平台的，不属于用户）
-- 2. 修正返回字段名为 inAccount（前端期望的字段）
-- 3. 支持空 accountProtocol 返回所有网络
-- 4. 只返回启用状态的账户
-- =========================================

USE ice_markets;

DELIMITER $$

DROP PROCEDURE IF EXISTS `i_get_inAccount`$$
CREATE PROCEDURE `i_get_inAccount`(
  IN user_Account VARCHAR(255),  -- 保留参数但不使用（接口兼容）
  IN account_Type ENUM('USDT','WXPAY','ALIPAY','PAYPAL','BANK'),
  IN account_Protocol VARCHAR(50)  -- 改为 VARCHAR，支持空字符串或具体协议
)
BEGIN
  -- 声明变量
  DECLARE account_List JSON;
  
  -- 查询收款账户列表
  -- 注意：
  -- 1. 不按 userAccount 过滤（这是平台收款账户，不属于特定用户）
  -- 2. account_Protocol 为空或 '' 时返回所有网络
  -- 3. 只返回启用状态的账户 (accountStatus=1)
  SET account_List = IFNULL((
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'accountId', accountId,
      'accountType', accountType,
      'accountProtocol', accountProtocol,
      'inAccount', accountName,  -- ⚠️ 修复：返回 inAccount 作为收款地址
      'accountName', accountName,
      'bankName', bankName
    ))
    FROM i_acquisition_account
    WHERE deleted = 0
      AND userAccount = '0' -- 平台账户
      AND accountStatus = 1  -- 只返回启用的账户
      AND accountType = account_Type
      AND (
        account_Protocol IS NULL 
        OR account_Protocol = '' 
        OR accountProtocol = account_Protocol
      )  -- ⚠️ 修复：支持空协议返回所有网络
  ), JSON_ARRAY());
  
  -- 返回结果
  SELECT 
    1 AS `status`,
    'Get Successfully' AS `message`,
    2000 AS `code`,
    account_List AS `accountList`;
    
END$$

DELIMITER ;

-- =========================================
-- 测试用例
-- =========================================
-- 
-- 1. 获取所有 USDT 网络的收款账户
--    CALL i_get_inAccount('ICE00000001', 'USDT', '');
--    预期：返回 ERC20、TRC20、BEP20 等所有启用的 USDT 收款地址
-- 
-- 2. 获取特定网络的收款账户
--    CALL i_get_inAccount('ICE00000001', 'USDT', 'ERC20');
--    预期：只返回 ERC20 网络的 USDT 收款地址
-- 
-- 3. 返回格式示例:
--    {
--      "status": 1,
--      "message": "Get Successfully",
--      "code": 2000,
--      "accountList": [
--        {
--          "accountId": 1,
--          "accountType": "USDT",
--          "accountProtocol": "ERC20",
--          "inAccount": "0x180a47752d3a79dc56334bdec2a87631bcbab31",
--          "accountName": "0x180a47752d3a79dc56334bdec2a87631bcbab31",
--          "bankName": null
--        },
--        {
--          "accountId": 2,
--          "accountType": "USDT",
--          "accountProtocol": "TRC20",
--          "inAccount": "TXyz...abc",
--          "accountName": "TXyz...abc",
--          "bankName": null
--        }
--      ]
--    }
