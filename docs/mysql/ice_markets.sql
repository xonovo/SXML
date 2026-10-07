/*
 Navicat Premium Data Transfer

 Source Server         : ICE
 Source Server Type    : MySQL
 Source Server Version : 80043 (8.0.43-0ubuntu0.24.04.2)
 Source Host           : 67.230.182.91:3306
 Source Schema         : ice_markets

 Target Server Type    : MySQL
 Target Server Version : 80043 (8.0.43-0ubuntu0.24.04.2)
 File Encoding         : 65001

 Date: 05/12/2025 19:20:38
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for files
-- ----------------------------
DROP TABLE IF EXISTS `files`;
CREATE TABLE `files`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `fileId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '文件唯一标识（UUID）',
  `userAccount` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '上传用户',
  `fileName` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '原始文件名',
  `fileSize` bigint NOT NULL COMMENT '文件大小（字节）',
  `fileMd5` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '文件MD5',
  `mimeType` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'MIME类型',
  `filePath` varchar(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '文件存储路径',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '文件描述',
  `tags` json NULL COMMENT '文件标签',
  `downloads` int NULL DEFAULT 0 COMMENT '下载次数',
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '软删除时间（预留）',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `fileId`(`fileId` ASC) USING BTREE,
  INDEX `idx_user`(`userAccount` ASC) USING BTREE,
  INDEX `idx_fileId`(`fileId` ASC) USING BTREE,
  INDEX `idx_uploaded`(`uploaded_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 10 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '文件上传记录表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_acquisition_account
-- ----------------------------
DROP TABLE IF EXISTS `i_acquisition_account`;
CREATE TABLE `i_acquisition_account`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `accountId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账户id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ICE00000001' COMMENT '用户账户',
  `accountType` enum('USDT','WXPAY','ALIPAY','PAYPAL','BANK') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USDT' COMMENT '账户类型',
  `accountProtocol` enum('ERC20','TRC20','OTER','BEP20') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OTER' COMMENT '协议',
  `accountName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '户名',
  `bankName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '如果账户类型为银行，则填写银行之分行',
  `accountStatus` int NOT NULL DEFAULT 1 COMMENT '状态，0=失效，1=有效',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `accountId_unique`(`accountId` ASC, `userAccount` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '收款账号表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_balance_details
-- ----------------------------
DROP TABLE IF EXISTS `i_balance_details`;
CREATE TABLE `i_balance_details`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `detailsId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `otherUserAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ICE00000001' COMMENT 'Counterparty userAccount ',
  `detailsItem` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0' COMMENT '记账币种，0=US本币，其余关联i_item_type表',
  `detailsWalletType` int NOT NULL DEFAULT 0 COMMENT '钱包类型 0=现金钱包，1=杠杆钱包，2=合约钱包',
  `detailsType` int NOT NULL DEFAULT 0 COMMENT '明细类型 0=出入金，1=业务交易，2=其它，3=借还款',
  `detailsSubType` int NOT NULL DEFAULT 0 COMMENT '子类型 0=入金充值，1=出金提现，2=业务买入支出，3=业务卖出收入，4=分润提成，5=活动赠金，6=出金手续费，7=还款，8=划转，9=抵押支出，10=借款',
  `income` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '收入 ',
  `expense` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '支出 ',
  `balance` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '余额 ',
  `detailsStatus` int NOT NULL DEFAULT 1 COMMENT '状态 0=冻结，1=正常，2=异常交易需要手工解除冻结',
  `outTradeNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '业务交易订单号',
  `tradeNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '出入金支付流水号(出入金记录表)',
  `detailsRemarks` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '备注 ',
  `prevBlockHash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '前区块哈希 前一个区块的SHA-256哈希值（小端序），形成链式结构。',
  `merkleRoot` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '‌默克尔根 本区块所有交易的Merkle树根哈希（SHA-256双重哈希）',
  `tradeTimestamp` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '时间戳',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `detailsid_unique`(`detailsId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_wallet_deleted`(`userAccount` ASC, `detailsWalletType` ASC, `deleted` ASC) USING BTREE COMMENT '用户余额查询优化',
  INDEX `idx_wallet_status`(`detailsWalletType` ASC, `detailsStatus` ASC, `deleted` ASC) USING BTREE COMMENT '钱包状态过滤',
  INDEX `idx_created_date`(`createdDate` DESC) USING BTREE COMMENT '时间序列查询'
) ENGINE = InnoDB AUTO_INCREMENT = 13 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_collateral
-- ----------------------------
DROP TABLE IF EXISTS `i_collateral`;
CREATE TABLE `i_collateral`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `collateralId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `collateralCurrency` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USDT' COMMENT '币种 USDT，或者交易品种',
  `collateralAmount` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '抵押物金额',
  `collateralStatus` int NOT NULL DEFAULT 0 COMMENT '抵押物状态 0=抵押，1=解除抵押',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `collateralId_unique`(`collateralId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_status`(`userAccount` ASC, `collateralStatus` ASC, `deleted` ASC) USING BTREE COMMENT '抵押物状态查询'
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '抵押物表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_details_info
-- ----------------------------
DROP TABLE IF EXISTS `i_details_info`;
CREATE TABLE `i_details_info`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `infoId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `infoType` int NOT NULL DEFAULT 0 COMMENT '状态 0=交易订单，1=资金流水，2=负债记录',
  `infoBlock` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'JSON信息',
  `infoRead` datetime(3) NULL DEFAULT NULL COMMENT '已读时间',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `infoId_unique`(`infoId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '明细表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_details_log
-- ----------------------------
DROP TABLE IF EXISTS `i_details_log`;
CREATE TABLE `i_details_log`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `logNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `logType` int NOT NULL DEFAULT 0 COMMENT '交易属性 0=交易记录，1=资金流水，2=借款',
  `logData` json NULL COMMENT 'JSON数据',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `logNo_unique`(`logNo` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_type_created`(`userAccount` ASC, `logType` ASC, `createdDate` DESC, `deleted` ASC) USING BTREE COMMENT '用户日志查询优化'
) ENGINE = InnoDB AUTO_INCREMENT = 244371 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '明细表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_inout
-- ----------------------------
DROP TABLE IF EXISTS `i_inout`;
CREATE TABLE `i_inout`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `tradeNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `tradeCurrency` enum('USDT','WXPAY','ALIPAY','PAYPAL','BANK') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USDT' COMMENT '币种 USDT',
  `tradeAttributes` int NOT NULL DEFAULT 0 COMMENT '交易属性 0=入金，1=出金',
  `tradeAmount` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '交易金额 USD',
  `inAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联i_acquisition_account 进账账号或者地址',
  `outAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '关联i_acquisition_account 出账账号或者地址',
  `tradeStatus` int NOT NULL DEFAULT 0 COMMENT '状态 0=预订单，1=成功，2=取消',
  `tradeRemarks` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '备注 ',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `tradeNo_unique`(`tradeNo` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_status`(`userAccount` ASC, `tradeStatus` ASC, `deleted` ASC) USING BTREE COMMENT '用户出入金查询'
) ENGINE = InnoDB AUTO_INCREMENT = 37 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '充值表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_item_type
-- ----------------------------
DROP TABLE IF EXISTS `i_item_type`;
CREATE TABLE `i_item_type`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `itemId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `itemEnName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'english Name',
  `itemCnName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'chinese Name',
  `StandardLot` int NOT NULL DEFAULT 100 COMMENT '每手数量',
  `itemRemarks` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '备注 ',
  `itemUnit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '单位',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `itemId_unique`(`itemId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_lever
-- ----------------------------
DROP TABLE IF EXISTS `i_lever`;
CREATE TABLE `i_lever`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `leverId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `collateralId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '抵押物ID 关联抵押物表',
  `leverCurrency` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USDT' COMMENT '币种 USDT，或者交易品种',
  `leverRate` int NOT NULL DEFAULT 20 COMMENT '杠杆率 20-100倍',
  `leverQuantity` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '借款数量 ',
  `leverPrice` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '借款时USD兑换金额',
  `leverAmount` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '借款USD金额',
  `leverInterest` decimal(20, 8) NOT NULL DEFAULT 0.00038616 COMMENT '利息比例 按照小时结算利息',
  `leverStatus` int NOT NULL DEFAULT 0 COMMENT '借款状态 0=已借款，1=已还款',
  `repaymentDate` datetime(3) NULL DEFAULT NULL COMMENT 'Repayment Date',
  `repaymentInterest` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '还款利息USD金额',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `leverId_unique`(`leverId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_status`(`userAccount` ASC, `leverStatus` ASC, `deleted` ASC) USING BTREE COMMENT '借款状态查询',
  INDEX `idx_user_repayment`(`userAccount` ASC, `repaymentDate` ASC, `deleted` ASC) USING BTREE COMMENT '还款记录查询',
  INDEX `idx_created_status`(`createdDate` ASC, `leverStatus` ASC) USING BTREE COMMENT '借款时间序列'
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '借款还款表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_login_log
-- ----------------------------
DROP TABLE IF EXISTS `i_login_log`;
CREATE TABLE `i_login_log`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `userAccount` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户名',
  `logId` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id',
  `loginIp` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL COMMENT 'Login Ip',
  `loginLocation` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT '登录地点',
  `loginOs` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT '系统',
  `loginStatus` int NOT NULL DEFAULT 0 COMMENT '登录状态(0失败 1成功)',
  `loginMsg` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT '提示消息',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  INDEX `logId_unique`(`logId` ASC) USING BTREE,
  INDEX `idx_user_created`(`userAccount` ASC, `createdDate` DESC) USING BTREE COMMENT '用户登录历史'
) ENGINE = InnoDB AUTO_INCREMENT = 100 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_positions
-- ----------------------------
DROP TABLE IF EXISTS `i_positions`;
CREATE TABLE `i_positions`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `pId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '持仓id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `outTradeNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '订单号',
  `itemId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EURUSD' COMMENT '对应i_item_type',
  `aggDirection` enum('buy','sell') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `aggItemId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `detailsWalletType` tinyint(1) NOT NULL DEFAULT 0 COMMENT '0=cash,1=leveraged',
  `totalVolume` decimal(20, 8) NOT NULL DEFAULT 0.00000000,
  `avgOpenPrice` decimal(20, 8) NOT NULL DEFAULT 0.00000000,
  `totalLiability` decimal(20, 8) NOT NULL DEFAULT 0.00000000,
  `takeSpread` decimal(20, 8) NOT NULL DEFAULT 0.00000000,
  `swap` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '聚合swap',
  `tradeRate` decimal(10, 4) NOT NULL DEFAULT 1.0000 COMMENT '交易倍率（杠杆倍数）',
  `openedAt` datetime(3) NULL DEFAULT NULL,
  `updatedAt` datetime(3) NULL DEFAULT NULL,
  `interestAccrued` decimal(20, 8) NOT NULL DEFAULT 0.00000000,
  `unrealizedPnl` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '未实现盈亏，(当前价-开仓价)×手数',
  `marginUsed` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '保证金，合约价值×保证金比例+风险附加保证金，其中合约价值=开仓价×数量',
  `stopLoss` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '止损价位',
  `takeProfit` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '止盈价位',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `pId_unique`(`pId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_deleted`(`userAccount` ASC, `deleted` ASC) USING BTREE COMMENT '用户持仓查询',
  INDEX `idx_order_deleted`(`outTradeNo` ASC, `deleted` ASC) USING BTREE COMMENT '订单关联查询',
  INDEX `idx_user_item_wallet`(`userAccount` ASC, `aggItemId` ASC, `detailsWalletType` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 15 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '持仓表表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_trade_order
-- ----------------------------
DROP TABLE IF EXISTS `i_trade_order`;
CREATE TABLE `i_trade_order`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `outTradeNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id ',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'userAccount',
  `itemId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0' COMMENT '关联期货ID i_item_type表',
  `positionId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'outTradeNo',
  `detailsWalletType` int NOT NULL DEFAULT 0 COMMENT '钱包类型 0=现金钱包，1=杠杆钱包，2=合约钱包',
  `direction` enum('buy','sell') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'buy' COMMENT '类型 buy=买多，sell=买空',
  `tradeType` int NOT NULL DEFAULT 0 COMMENT '成交类型 0=市场价，1=限制价格，2=停止',
  `openPrice` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '开仓价格 USD',
  `currentPrice` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '当前市场价格/平仓价格',
  `stopLoss` decimal(20, 8) NOT NULL COMMENT '止损价位',
  `takeProfit` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '止盈价位',
  `swap` decimal(20, 8) NOT NULL DEFAULT 0.00000000 COMMENT '利息（detailsWalletType>1）',
  `takeSpread` decimal(10, 8) NOT NULL DEFAULT 0.00000000 COMMENT '点差 （佣金commission）点差x数量',
  `tradeVolume` int NOT NULL DEFAULT 0 COMMENT '数量 ',
  `tradeRate` decimal(4, 2) NOT NULL DEFAULT 0.00 COMMENT '交易倍率 交易倍率不为0，则动用现金账户',
  `tradeStatus` int NOT NULL DEFAULT 1 COMMENT '订单状态 0=等待交易，1=持仓中，2=已平仓，3=已取消',
  `settled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已结算，0=未结算 1=已结算',
  `openedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '订单创建时间戳',
  `closedAt` timestamp NULL DEFAULT NULL COMMENT '平仓时间',
  `tradeRemarks` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '备注 ',
  `trader` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0' COMMENT '交易员',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `outTradeNo_unique`(`outTradeNo` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_user_status_item`(`userAccount` ASC, `tradeStatus` ASC, `itemId` ASC, `deleted` ASC) USING BTREE COMMENT '持仓查询优化',
  INDEX `idx_user_wallet_status`(`userAccount` ASC, `detailsWalletType` ASC, `tradeStatus` ASC, `deleted` ASC) USING BTREE COMMENT '用户订单过滤',
  INDEX `idx_status_opened`(`tradeStatus` ASC, `openedAt` DESC) USING BTREE COMMENT '订单时间序列',
  INDEX `idx_item_status`(`itemId` ASC, `tradeStatus` ASC, `deleted` ASC) USING BTREE COMMENT '品种持仓统计',
  INDEX `idx_symbol_status_sl_tp`(`itemId` ASC, `direction` ASC, `tradeStatus` ASC, `stopLoss` ASC, `takeProfit` ASC) USING BTREE,
  INDEX `idx_settle_candidate`(`tradeStatus` ASC, `settled` ASC, `closedAt` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 84 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for i_user
-- ----------------------------
DROP TABLE IF EXISTS `i_user`;
CREATE TABLE `i_user`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `userAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id',
  `userEmail` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL COMMENT 'Login Email',
  `userMobile` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT 'Login Mobile',
  `userImg` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT 'User Photo',
  `userPassword` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT 'Login Initial password：123456',
  `userPayPassword` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT 'Pay payment password：123456',
  `userSalt` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT 'Password Salt ',
  `userNick` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT '' COMMENT 'Nick',
  `userName` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL DEFAULT '' COMMENT 'Real Name',
  `userIdCardType` int NOT NULL DEFAULT 0 COMMENT 'Document type 0=ID card, 1=passport, 2=military officer certificate, 3=social security card',
  `userIdCard` varchar(255) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL COMMENT 'Number',
  `userIdCardFrontImage` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Front Image',
  `userIdCardReverseImage` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Reverse Image',
  `invitationUserAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'ICE00000001' COMMENT 'Agency UserAccount',
  `apiKey` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '1020304050607080102030405060708',
  `accesslevel` int NOT NULL DEFAULT 0 COMMENT 'Access level',
  `maxLever` decimal(6, 2) NOT NULL DEFAULT 0.20 COMMENT 'lever',
  `leverInterest` decimal(20, 8) NOT NULL DEFAULT 0.00038616 COMMENT '借款利率 按照小时结算利息',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `userEmail_unique`(`userEmail` ASC) USING BTREE,
  UNIQUE INDEX `userAccount_unique`(`userAccount` ASC) USING BTREE,
  INDEX `idx_access_deleted`(`accesslevel` ASC, `deleted` ASC) USING BTREE COMMENT '权限等级过滤'
) ENGINE = InnoDB AUTO_INCREMENT = 14 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for id_config
-- ----------------------------
DROP TABLE IF EXISTS `id_config`;
CREATE TABLE `id_config`  (
  `tableName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `prefix` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `suffix` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `dateTimeFormat` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `randomLength` int NULL DEFAULT 8,
  `counter` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`tableName`) USING BTREE,
  UNIQUE INDEX `prefix_index`(`prefix` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for interface
-- ----------------------------
DROP TABLE IF EXISTS `interface`;
CREATE TABLE `interface`  (
  `rowId` int NOT NULL AUTO_INCREMENT COMMENT 'Self increase 1',
  `interfaceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'id',
  `interfaceType` enum('APP','WEB','MANAGE') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'APP' COMMENT 'type APP,WEB,MANAGE',
  `interfaceName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Name',
  `interfaceSql` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SQL',
  `interfaceKey` varchar(3000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Key',
  `interfaceReturn` json NULL COMMENT 'Return',
  `registId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'ICE00000001' COMMENT 'userAccount',
  `databaseType` int NOT NULL DEFAULT 0 COMMENT '0=stored procedure，1=function',
  `interfaceVison` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'V1',
  `accesslevel` int NOT NULL DEFAULT 0 COMMENT 'Access level',
  `sign` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'sign',
  `createdDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `updatedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Physical creation time, changed by database',
  `indexed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'ES index flag.',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Logical deletion flag.',
  PRIMARY KEY (`rowId`) USING BTREE,
  UNIQUE INDEX `interfaceid_unique`(`interfaceId` ASC) USING BTREE,
  INDEX `indexed_index`(`indexed` ASC) USING BTREE,
  INDEX `idx_type_access`(`interfaceType` ASC, `accesslevel` ASC, `deleted` ASC) USING BTREE COMMENT '接口类型过滤'
) ENGINE = InnoDB AUTO_INCREMENT = 31 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for market_prices
-- ----------------------------
DROP TABLE IF EXISTS `market_prices`;
CREATE TABLE `market_prices`  (
  `symbol` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '交易对符号 如 BTC/USDT',
  `price` decimal(20, 8) NOT NULL COMMENT '最新价格',
  `volume_24h` decimal(20, 8) NULL DEFAULT 0.00000000 COMMENT '24小时成交量',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`symbol`) USING BTREE,
  INDEX `idx_updated`(`updated_at` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '市场实时价格表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for market_trade_data
-- ----------------------------
DROP TABLE IF EXISTS `market_trade_data`;
CREATE TABLE `market_trade_data`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `symbol` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '品种代码（如 EURUSD, XAUUSD）',
  `price` decimal(20, 8) NOT NULL COMMENT '成交价格',
  `received_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '接收时间（毫秒精度）',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_symbol`(`symbol` ASC) USING BTREE,
  INDEX `idx_received`(`received_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 126398 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '实时Trade数据临时表（默认存储过程使用）' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for trade_subscriptions
-- ----------------------------
DROP TABLE IF EXISTS `trade_subscriptions`;
CREATE TABLE `trade_subscriptions`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '订阅ID',
  `symbol` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '品种代码（如 EURUSD, XAUUSD）',
  `business` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'common' COMMENT '市场类型: stock/crypto/common',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '启用状态: 1=监控中, 0=已停止',
  `description` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '订阅描述（如：欧元美元实时监控）',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注信息',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_symbol`(`symbol` ASC) USING BTREE COMMENT '一个品种一条记录',
  INDEX `idx_enabled`(`enabled` ASC) USING BTREE COMMENT '快速查询启用的订阅',
  INDEX `idx_updated`(`updated_at` ASC) USING BTREE COMMENT '增量检查索引'
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = 'Trade 订阅配置表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for trade_ticks
-- ----------------------------
DROP TABLE IF EXISTS `trade_ticks`;
CREATE TABLE `trade_ticks`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `symbol` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '品种代码（对应 Infoway data.s）',
  `price` decimal(20, 8) NOT NULL COMMENT '成交价格（对应 Infoway data.p）',
  `volume` decimal(20, 8) NULL DEFAULT NULL COMMENT '成交量（对应 Infoway data.v）',
  `direction` tinyint NULL DEFAULT NULL COMMENT '方向: 1=买入, 2=卖出（对应 Infoway data.td）',
  `trade_time` bigint NULL DEFAULT NULL COMMENT 'Infoway 时间戳，秒（对应 Infoway data.t）',
  `received_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '本地接收时间（毫秒精度）',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_symbol`(`symbol` ASC) USING BTREE,
  INDEX `idx_trade_time`(`trade_time` ASC) USING BTREE,
  INDEX `idx_received`(`received_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 23673251 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = 'Trade 逐笔数据（5小时自动清理）' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ws_active_subscriptions
-- ----------------------------
DROP TABLE IF EXISTS `ws_active_subscriptions`;
CREATE TABLE `ws_active_subscriptions`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `userAccount` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `market` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `dataType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `symbol` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `interval_time` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `infoway_subscription_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `subscribed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_data_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_sub`(`sessionId` ASC, `market` ASC, `dataType` ASC, `symbol` ASC, `interval_time` ASC) USING BTREE,
  INDEX `idx_session`(`sessionId` ASC) USING BTREE,
  INDEX `idx_user`(`userAccount` ASC) USING BTREE,
  INDEX `idx_symbol`(`market` ASC, `symbol` ASC) USING BTREE,
  INDEX `idx_infoway_sub`(`infoway_subscription_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 24 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ws_connection_logs
-- ----------------------------
DROP TABLE IF EXISTS `ws_connection_logs`;
CREATE TABLE `ws_connection_logs`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `userAccount` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `event_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `event_data` json NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `user_agent` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_session`(`sessionId` ASC) USING BTREE,
  INDEX `idx_user`(`userAccount` ASC) USING BTREE,
  INDEX `idx_event`(`event_type` ASC) USING BTREE,
  INDEX `idx_time`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 37 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ws_infoway_subscriptions
-- ----------------------------
DROP TABLE IF EXISTS `ws_infoway_subscriptions`;
CREATE TABLE `ws_infoway_subscriptions`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `subscription_key` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `market` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `dataType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `symbol` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `interval_time` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `infoway_subscription_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `client_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_subscription`(`subscription_key` ASC) USING BTREE,
  INDEX `idx_market_symbol`(`market` ASC, `symbol` ASC) USING BTREE,
  INDEX `idx_client_count`(`client_count` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 24 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ws_subscription_permission
-- ----------------------------
DROP TABLE IF EXISTS `ws_subscription_permission`;
CREATE TABLE `ws_subscription_permission`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `userAccount` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户账户',
  `market` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '市场类型',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `max_symbols` int NULL DEFAULT 10,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_user_market`(`userAccount` ASC, `market` ASC) USING BTREE,
  INDEX `idx_userAccount`(`userAccount` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Function structure for getGenerateId
-- ----------------------------
DROP FUNCTION IF EXISTS `getGenerateId`;
delimiter ;;
CREATE FUNCTION `getGenerateId`(targetTableName varchar(255))
 RETURNS varchar(255) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
BEGIN
#Routine body goes here...
DECLARE newCounter int(11);
DECLARE oldCounter int(11);
DECLARE generatedId varchar(255);

set oldCounter= (select counter from id_config where tableName = targetTableName);
update id_config set counter = counter + 1 where tableName = targetTableName;
set newCounter =oldCounter + 1;
set generatedId=(select concat(prefix, IFNULL(date_format(now(), dateTimeFormat), ''), LPAD(newCounter mod pow(10, randomLength), randomLength, 0), suffix) as generatedId from id_config where tableName = targetTableName);

RETURN generatedId;
END
;;
delimiter ;

-- ----------------------------
-- Function structure for getMD5Str
-- ----------------------------
DROP FUNCTION IF EXISTS `getMD5Str`;
delimiter ;;
CREATE FUNCTION `getMD5Str`(originalStr LONGTEXT)
 RETURNS varchar(32) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
BEGIN
	#get MD5
DECLARE encryStr varchar(32);
SET encryStr=UCASE(MD5(originalStr));
RETURN encryStr;
END
;;
delimiter ;

-- ----------------------------
-- Function structure for getRandomStr
-- ----------------------------
DROP FUNCTION IF EXISTS `getRandomStr`;
delimiter ;;
CREATE FUNCTION `getRandomStr`(size int(2))
 RETURNS varchar(100) CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
BEGIN
	#Routine body goes here...
DECLARE str varchar(100);
DECLARE orStr varchar(26);
DECLARE tempStr varchar(1);
DECLARE sizeT int(2);

SET sizeT = size;
SET orStr = "qwertyuiopasdfghjklzxcvbnm";

SET str = SUBSTRING(orStr,(select round(26*rand(),0)),1);

WHILE sizeT>1 DO
	SET tempStr = SUBSTRING(orStr,(select round(26*rand(),0)),1);
	SET str = concat(str,tempStr);
	SET sizeT = sizeT-1;
END WHILE;

RETURN str;
END
;;
delimiter ;

-- ----------------------------
-- Function structure for getTimestamp
-- ----------------------------
DROP FUNCTION IF EXISTS `getTimestamp`;
delimiter ;;
CREATE FUNCTION `getTimestamp`()
 RETURNS bigint
  DETERMINISTIC
BEGIN
#Routine body goes here...
RETURN UNIX_TIMESTAMP() * 1000 + FLOOR(MICROSECOND(NOW(6))/1000);
END
;;
delimiter ;

-- ----------------------------
-- Function structure for interface_authentication
-- ----------------------------
DROP FUNCTION IF EXISTS `interface_authentication`;
delimiter ;;
CREATE FUNCTION `interface_authentication`(user_Account varchar(255),
interface_Id varchar(255),
interface_sign varchar(255))
 RETURNS int
BEGIN
	#authentication
	#King
	#2025-10-01
	DECLARE re int(4);
	DECLARE user_level,interface_level int(1);
	
	SET user_level = (SELECT accesslevel FROM i_user WHERE deleted=0 AND userAccount=user_Account);
	SET interface_level = (SELECT accesslevel FROM interface WHERE deleted=0 AND interfaceId=interface_Id);
	
	IF(user_level>=user_level)THEN
	   IF((SELECT sign FROM interface WHERE deleted=0 AND interfaceId=interface_Id) = interface_sign)THEN
   	   SET re = 2000;
		 ELSE
		   SET re = 4002;
		 END IF;
  ELSE
	   SET re = 4001;
  END IF;

	RETURN re;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_cancel_order
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_cancel_order`;
delimiter ;;
CREATE PROCEDURE `i_cancel_order`(IN user_Account VARCHAR(255),
  IN out_TradeNo VARCHAR(255))
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE affected INTEGER DEFAULT 0;
  DECLARE details_WalletType INT DEFAULT 0;
  DECLARE cancel_Amount DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;

  -- 读取订单必要信息（钱包类型、金额）
  -- 修正：takeSpread 已是总费用，不能再乘数量
  SELECT 
    detailsWalletType,
    (openPrice * tradeVolume) + IFNULL(takeSpread, 0)
  INTO details_WalletType, cancel_Amount
  FROM i_trade_order
  WHERE deleted = 0 
    AND userAccount = user_Account 
    AND outTradeNo = out_TradeNo
  LIMIT 1;

  START TRANSACTION;

  -- 更新订单状态为已取消（tradeStatus = 3）
  UPDATE i_trade_order 
  SET tradeStatus = 3,
      closedAt = NOW()
  WHERE deleted = 0 
    AND userAccount = user_Account 
    AND outTradeNo = out_TradeNo
    AND tradeStatus = 0;  -- 仅限价单（未成交）可撤销

  SET affected = ROW_COUNT();

  IF t_error = 1 THEN
    ROLLBACK;
    SELECT 0 AS status, 'Cancel failed' AS message, 4003 AS code;
  ELSEIF affected = 0 THEN
    ROLLBACK;
    SELECT 0 AS status, 'Order not cancelable' AS message, 4004 AS code;
  ELSE
    -- 解冻保证金：撤单后原路退回
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
    VALUES(
      getGenerateId('i_balance_details'),
      user_Account,
      IFNULL(details_WalletType, 0),
      1,  -- detailsType: 1=交易
      6,  -- detailsSubType: 6=撤单解冻
      IFNULL(cancel_Amount, 0),  -- income: 返还冻结金额
      0,  -- expense: 0
      out_TradeNo,
      CONCAT('撤单解冻保证金: ', cancel_Amount),
      NOW()
    );
    
    COMMIT;
    SELECT 1 AS status, 'Cancelled successfully' AS message, 2000 AS code;
  END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_check_in
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_check_in`;
delimiter ;;
CREATE PROCEDURE `i_check_in`(IN trade_No VARCHAR(255),
IN out_Account VARCHAR(255))
BEGIN
#in-入金第三步
DECLARE details_Id,user_Account VARCHAR(255);
DECLARE trade_Amount DECIMAL(20,8) DEFAULT 0.00000000;
DECLARE trade_Status INT;
DECLARE t_error INTEGER DEFAULT 0;
DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

start transaction;

SET trade_Status = (SELECT tradeStatus FROM i_inout WHERE deleted = 0  AND tradeNo = trade_No);

IF(trade_Status = 0)THEN

UPDATE i_inout SET
tradeStatus = 1,
outAccount = out_Account
WHERE deleted=0 AND tradeNo = trade_No;

SELECT userAccount,tradeAmount INTO user_Account,trade_Amount FROM i_inout WHERE deleted=0 AND tradeNo = trade_No;

SET details_Id = getGenerateId('i_balance_details');
INSERT INTO `i_balance_details`(
detailsId,
userAccount,
income,
tradeNo
)VALUES(
details_Id,
user_Account,
trade_Amount,
trade_No
);

IF t_error=1 THEN
ROLLBACK;
SELECT 0 as `status`,'Check failed' as `message`,4003 AS `code`;
ELSE
commit;
SELECT 1 as `status`,'Check successfully' as `message`,2000 AS `code`;
END if;

ELSE
   SELECT 0 as `status`,'Repeated confirmation' as `message`,4002 AS `code`;
END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_close_order
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_close_order`;
delimiter ;;
CREATE PROCEDURE `i_close_order`(IN user_Account VARCHAR(255),
  IN p_Id VARCHAR(255),           -- 聚合持仓ID（必填用于单/全平仓）
  IN item_Id VARCHAR(255),        -- 产品代码（从 i_positions 取）
  IN details_WalletType INT,      -- 钱包类型：0=现金，1=杠杆
  IN direction_Val VARCHAR(10),   -- 方向过滤：'buy' 或 'sell'；NULL 表示全部方向
  IN current_Price DECIMAL(20,8), -- 平仓价格
  IN trade_Status INT)
BEGIN
  DECLARE t_error INTEGER DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  -- 参数校验：itemId 必填（按你的约定）
  IF (item_Id IS NULL OR item_Id = '') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Missing itemId for close', MYSQL_ERRNO = 4004;
  END IF;

  -- 兜底获取产品与方向（当 itemId 或 direction 缺失时）
  IF (direction_Val IS NULL OR direction_Val = '') THEN
    SELECT aggDirection INTO direction_Val
    FROM i_positions
    WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType
      AND (pId = p_Id OR p_Id IS NULL OR p_Id = '')
      AND aggItemId = item_Id
    LIMIT 1;
  END IF;

  START TRANSACTION;

  -- 单/全平仓：按 (userAccount, itemId, walletType[, direction]) 更新持仓订单为已平仓
  UPDATE i_trade_order SET
    currentPrice = current_Price,
    tradeStatus = trade_Status
  WHERE deleted = 0
    AND userAccount = user_Account
    AND itemId = item_Id
    AND detailsWalletType = details_WalletType
    AND tradeStatus = 1
    AND (
      direction_Val IS NULL OR direction = direction_Val
    );

  -- 说明：递减 i_positions.totalVolume 与日志记录由触发器 `auto_updated_date_on_i_trade_order` 逐行处理

  IF t_error = 1 THEN
    ROLLBACK;
    SELECT 0 AS `status`, 'Close order failed' AS `message`, 4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 1 AS `status`, 'Close order successfully' AS `message`, 2000 AS `code`;
  END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_close_order_complete
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_close_order_complete`;
delimiter ;;
CREATE PROCEDURE `i_close_order_complete`(IN user_Account VARCHAR(255),
  IN out_TradeNo VARCHAR(255),  -- 如果为 NULL，则全部平仓（慎用）
  IN item_Id VARCHAR(255),       -- 选择金融产品（用于批量平仓）
  IN current_Price DECIMAL(20,8), -- 平仓价格
  IN trade_Status INT)
BEGIN
  -- 变量声明
  DECLARE v_outTradeNo, v_itemId, v_direction, v_detailsId, v_leverId VARCHAR(255);
  DECLARE v_detailsWalletType INT;
  DECLARE v_openPrice, v_tradeVolume, v_takeSpread, v_swap DECIMAL(20,8);
  DECLARE v_tradeRate DECIMAL(4,2);
  DECLARE v_totalCost, v_totalRevenue, v_pnl, v_netPnl DECIMAL(20,8);
  DECLARE v_repayAmount, v_leverBalance, v_borrowed DECIMAL(20,8);
  DECLARE done INT DEFAULT 0;
  DECLARE t_error INT DEFAULT 0;
  
  -- 游标：遍历需要平仓的订单
  DECLARE order_cursor CURSOR FOR
    SELECT 
      outTradeNo, itemId, detailsWalletType, direction,
      openPrice, tradeVolume, takeSpread, swap, tradeRate
    FROM i_trade_order
    WHERE deleted = 0 
      AND userAccount = user_Account
      AND tradeStatus = 1  -- 仅平仓「持仓中」的订单
      AND (out_TradeNo IS NULL OR outTradeNo = out_TradeNo)
      AND (item_Id IS NULL OR item_Id = '' OR itemId = item_Id);
  
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error = 1;
  
  START TRANSACTION;
  
  -- ========================================
  -- 1. 遍历所有待平仓订单
  -- ========================================
  OPEN order_cursor;
  
  read_loop: LOOP
    FETCH order_cursor INTO 
      v_outTradeNo, v_itemId, v_detailsWalletType, v_direction,
      v_openPrice, v_tradeVolume, v_takeSpread, v_swap, v_tradeRate;
    
    IF done THEN
      LEAVE read_loop;
    END IF;
    
    -- ========================================
    -- 2. 计算盈亏（PnL）
    -- ========================================
    -- 开仓总成本 = 开仓价×数量 + 总点差费用
    -- 注意：takeSpread 已经是总费用（单位点差×数量），不能再乘以数量
    SET v_totalCost = (v_openPrice * v_tradeVolume) + v_takeSpread;
    
    -- 平仓总收入 = 平仓价 × 数量
    SET v_totalRevenue = current_Price * v_tradeVolume;
    
    -- 原始盈亏 = 收入 - 成本（做多）或 成本 - 收入（做空）
    IF v_direction = 'buy' THEN
      SET v_pnl = v_totalRevenue - v_totalCost;
    ELSE
      SET v_pnl = v_totalCost - v_totalRevenue;
    END IF;
    
    -- 净盈亏 = 原始盈亏 - 利息（杠杆账户）
    SET v_netPnl = v_pnl - IFNULL(v_swap, 0);
    
    -- ========================================
    -- 3. 更新订单状态为「已平仓」
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = current_Price,
      tradeStatus = trade_Status,
      closedAt = NOW(),  -- 触发器会自动设置，这里显式更新更安全
      pnl = v_netPnl     -- 记录实际盈亏（如果表有此字段）
    WHERE deleted = 0 
      AND userAccount = user_Account 
      AND outTradeNo = v_outTradeNo;
    
    -- ========================================
    -- 4. 入账余额明细（平仓收入）
    -- ========================================
    SET v_detailsId = getGenerateId('i_balance_details');
    
    INSERT INTO i_balance_details (
      detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
      income, expense, outTradeNo, detailsRemarks
    ) VALUES (
      v_detailsId,
      user_Account,
      v_detailsWalletType,
      1,  -- detailsType: 1=交易
      3,  -- detailsSubType: 3=平仓卖出
      CASE 
        WHEN v_netPnl > 0 THEN v_totalCost + v_netPnl  -- 盈利：本金+盈利
        ELSE v_totalCost + v_netPnl  -- 亏损：本金-亏损
      END,
      0,  -- expense=0（平仓是收入）
      v_outTradeNo,
      CONCAT('平仓 ', v_itemId, ' 净盈亏=', v_netPnl)
    );
    
    -- ========================================
    -- 5. 杠杆账户：平仓即还款逻辑
    -- ========================================
    IF v_detailsWalletType = 1 THEN
      -- 查询当前杠杆余额和总借款
      SELECT 
        IFNULL(SUM(income) - SUM(expense), 0)
      INTO v_leverBalance
      FROM i_balance_details
      WHERE deleted = 0 
        AND userAccount = user_Account 
        AND detailsWalletType = 1;
      
      SELECT 
        IFNULL(SUM(leverAmount), 0)
      INTO v_borrowed
      FROM i_lever
      WHERE deleted = 0 
        AND userAccount = user_Account 
        AND leverStatus = 0;  -- 未还款
      
      -- 计算可还款金额（取平仓收入和总借款的最小值）
      SET v_repayAmount = LEAST(v_leverBalance, v_borrowed);
      
      -- 如果有借款且平仓后有余额，则自动还款
      IF v_repayAmount > 0 THEN
        -- 找到最早的未还借款记录
        SELECT leverId INTO v_leverId
        FROM i_lever
        WHERE deleted = 0 
          AND userAccount = user_Account 
          AND leverStatus = 0
        ORDER BY createTime ASC
        LIMIT 1;
        
        -- 标记借款为已还（或部分还）
        UPDATE i_lever
        SET 
          leverStatus = 1,  -- 1=已还款
          repayAmount = v_repayAmount,
          repayTime = NOW()
        WHERE deleted = 0 
          AND userAccount = user_Account 
          AND leverId = v_leverId;
        
        -- 入账还款明细
        SET v_detailsId = getGenerateId('i_balance_details');
        INSERT INTO i_balance_details (
          detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
          income, expense, outTradeNo, detailsRemarks
        ) VALUES (
          v_detailsId,
          user_Account,
          1,  -- 杠杆账户
          3,  -- 交易类型
          7,  -- detailsSubType: 7=平仓还款
          0,
          v_repayAmount,
          v_leverId,
          CONCAT('平仓自动还款 ', v_repayAmount)
        );
        
        -- 释放对应的抵押品
        UPDATE i_collateral
        SET collateralStatus = 1  -- 1=已释放
        WHERE deleted = 0 
          AND userAccount = user_Account 
          AND collateralId = (
            SELECT collateralId FROM i_lever WHERE leverId = v_leverId LIMIT 1
          );
      END IF;
    END IF;
    
    -- ========================================
    -- 6. 更新持仓表（标记为已平仓）
    -- ========================================
    UPDATE i_positions
    SET 
      positionStatus = 2,  -- 2=已平仓（假设有此字段）
      closedAt = NOW(),
      realizedPnl = v_netPnl  -- 实现盈亏（假设有此字段）
    WHERE deleted = 0 
      AND userAccount = user_Account 
      AND outTradeNo = v_outTradeNo;
    
  END LOOP read_loop;
  
  CLOSE order_cursor;
  
  -- ========================================
  -- 7. 事务提交或回滚
  -- ========================================
  IF t_error = 1 THEN
    ROLLBACK;
    SELECT 0 AS `status`, 'Close position failed' AS `message`, 4003 AS `code`;
  ELSE
    COMMIT;
    SELECT 1 AS `status`, 'Position(s) closed successfully' AS `message`, 
           out_TradeNo AS outTradeNo, 2000 AS `code`;
  END IF;
  
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_create_lever
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_create_lever`;
delimiter ;;
CREATE PROCEDURE `i_create_lever`(IN user_Account VARCHAR(255),IN collateralAmount DECIMAL(20,8),IN lever_Rate INT,IN lever_Amount DECIMAL(20,8))
BEGIN
  DECLARE collateral_Id,lever_Id,details_Id VARCHAR(255);
  DECLARE leveragedBalance,collateral,borrowed,leveragedTransfer,lever_Interest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE t_error INTEGER DEFAULT 0; 
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;
START TRANSACTION;
  SELECT 
    IFNULL(SUM(CASE WHEN bd.detailsWalletType = 1 THEN bd.income - bd.expense ELSE 0 END), 0),
    IFNULL(SUM(DISTINCT c.collateralAmount), 0),
    IFNULL(SUM(l.leverAmount), 0),
    u.leverInterest
  INTO leveragedBalance, collateral, borrowed, lever_Interest
  FROM i_user u
  LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = user_Account
  LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = user_Account AND c.collateralStatus = 0
  LEFT JOIN i_lever l ON l.deleted = 0 AND l.userAccount = user_Account AND l.leverStatus = 0
  WHERE u.deleted = 0 AND u.userAccount = user_Account;

  SET leveragedTransfer = (leveragedBalance - collateral - borrowed);

  IF(leveragedTransfer >= collateralAmount)THEN
    IF(collateralAmount * (lever_Rate - 1) = lever_Amount)THEN
      
      SET collateral_Id = getGenerateId('i_collateral');
      INSERT INTO i_collateral(collateralId,userAccount,collateralAmount) VALUES(collateral_Id,user_Account,collateralAmount);

      SET details_Id = getGenerateId('i_balance_details');
      INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,expense,outTradeNo,detailsRemarks)
      VALUES(details_Id,user_Account,1,3,9,collateralAmount,collateral_Id,'扣除借款抵押金额');

      SET lever_Id = getGenerateId('i_lever');
      INSERT INTO i_lever(leverId,userAccount,collateralId,leverRate,leverQuantity,leverAmount,leverInterest)
      VALUES(lever_Id,user_Account,collateral_Id,lever_Rate,lever_Amount,lever_Amount,lever_Interest);

      SET details_Id = getGenerateId('i_balance_details');
      INSERT INTO i_balance_details(detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,income,outTradeNo,detailsRemarks)
      VALUES(details_Id,user_Account,1,3,10,collateralAmount*lever_Rate,lever_Id,'借款放款');

      IF t_error=1 THEN ROLLBACK; SELECT 0 AS status,'Lever failed' AS message,4003 AS code; ELSE COMMIT;
        SELECT 
          IFNULL(SUM(CASE WHEN bd.detailsWalletType = 1 THEN bd.income - bd.expense ELSE 0 END), 0),
          IFNULL(SUM(DISTINCT c.collateralAmount), 0),
          IFNULL(SUM(l.leverAmount), 0)
        INTO leveragedBalance, collateral, borrowed
        FROM i_balance_details bd
        LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = user_Account AND c.collateralStatus = 0
        LEFT JOIN i_lever l ON l.deleted = 0 AND l.userAccount = user_Account AND l.leverStatus = 0
        WHERE bd.deleted = 0 AND bd.userAccount = user_Account;
        SET leveragedTransfer = (leveragedBalance - collateral - borrowed);
        SELECT 1 AS status,'Lever successfully' AS message,2000 AS code,leveragedBalance,collateral,borrowed,leveragedTransfer,lever_Interest AS leverInterest; 
      END IF;
    ELSE
      SELECT 0 AS status,'The loan amount and multiplier calculation are incorrect.' AS message,4001 AS code; 
    END IF;
  ELSE
    SELECT 0 AS status,'Insufficient balance' AS message,4004 AS code;
  END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_create_order
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_create_order`;
delimiter ;;
CREATE PROCEDURE `i_create_order`(IN user_Account VARCHAR(255),IN item_Id VARCHAR(255),IN details_WalletType TINYINT,IN direction_Temp VARCHAR(8),IN trade_Type TINYINT,IN open_Price DECIMAL(20,8),IN stop_Loss DECIMAL(20,8),IN take_Profit DECIMAL(20,8),IN take_Spread DECIMAL(20,8),IN trade_Volume DECIMAL(20,8),IN trade_Rate DECIMAL(10,4),IN trade_Status INT)
proc_label: BEGIN
  DECLARE out_TradeNo,trader_temp,details_Id,p_Id VARCHAR(255);
  DECLARE balance,totalAmount,swap_temp,lever_Interest DECIMAL(20,8) DEFAULT 0; 
  DECLARE margin_Used DECIMAL(20,8) DEFAULT 0;
  DECLARE max_Lever DECIMAL(6,2) DEFAULT 0.00;
  DECLARE nowCommission,position JSON;
  DECLARE available DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE last_step VARCHAR(64) DEFAULT 'init';

  DECLARE lev_collateral DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_borrowBalance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_usedBuyingPower DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_leverageRate DECIMAL(8,2) DEFAULT 1.00;
  DECLARE lev_liqThreshold DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE lev_hourlyInterestRate DECIMAL(10,8) DEFAULT 0.00000000;

  DECLARE cur_totalVolume,cur_avgOpenPrice,cur_takeSpread,cur_totalLiability,new_totalVolume,new_avgOpenPrice,new_takeSpread,new_totalLiability DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE t_error INTEGER DEFAULT 0; 
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  SET last_step = 'load_user_balance';
  SELECT 
    IFNULL(SUM(bd.income) - SUM(bd.expense), 0),
    u.invitationUserAccount,
    u.leverInterest,
    u.maxLever * 100
  INTO balance, trader_temp, lever_Interest, max_Lever
  FROM i_user u
  LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = user_Account AND bd.detailsWalletType = details_WalletType
  WHERE u.deleted = 0 AND u.userAccount = user_Account
  GROUP BY u.userAccount;

  SET last_step = 'compute_amounts';
  -- 开仓总成本 = 开仓价×数量 + 总点差费用
  -- 注意：take_Spread 已经是总费用（单位点差×数量），不能再乘以数量
  SET totalAmount = (open_Price * trade_Volume) + take_Spread;
  SET swap_temp = IF(details_WalletType > 0 AND trade_Rate > 0,(totalAmount - totalAmount / trade_Rate) * lever_Interest,0);
  SET margin_Used = CASE WHEN trade_Rate IS NULL OR trade_Rate <= 0 THEN totalAmount ELSE totalAmount / trade_Rate END;

  SET last_step = 'precheck_lever_or_cash';
  -- 杠杆账户采用"借款入账"的钱包模型：
  -- 下单只校验杠杆钱包可用余额（不可提现，但可用于买卖），不再按保证金/杠杆率门槛拦截
  IF(details_WalletType = 1) THEN
    -- 与现金账户一致的校验方式：按 i_balance_details(杠杆钱包) 的可用余额判断
    IF(balance < totalAmount) THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  ELSE
    -- 现金账户：按现金钱包余额校验
    IF(balance < totalAmount) THEN
      SELECT 0 AS status,'Insufficient balance' AS message,4001 AS code;
      LEAVE proc_label;
    END IF;
  END IF;

  SET last_step = 'start_txn';
  START TRANSACTION;

  SET last_step = CONCAT('gen_trade_no|',t_error);
  SET out_TradeNo = getGenerateId('i_trade_order');
  IF out_TradeNo IS NULL OR out_TradeNo = '' THEN
    SET last_step = 'fallback_out_trade_no';
    SET out_TradeNo = CONCAT('ITO', REPLACE(UUID(),'-',''));
  END IF;

  SET last_step = CONCAT('find_position_card|',t_error);
  SELECT pId INTO p_Id FROM i_positions 
    WHERE deleted = 0 AND userAccount = user_Account AND aggItemId = item_Id AND aggDirection = direction_Temp AND detailsWalletType = details_WalletType
    LIMIT 1;

  IF p_Id IS NULL OR p_Id = '' THEN
    SET last_step = CONCAT('create_position_card|',t_error);
    SET p_Id = getGenerateId('i_positions');
    INSERT INTO i_positions(outTradeNo,pId,userAccount,aggDirection,aggItemId,detailsWalletType,totalVolume,avgOpenPrice,takeSpread,totalLiability,interestAccrued,stopLoss,takeProfit,swap,tradeRate,openedAt,updatedAt)
    VALUES(out_TradeNo,p_Id,user_Account,LOWER(direction_Temp),item_Id,details_WalletType,0,0,0,0,0,IFNULL(stop_Loss,0),IFNULL(take_Profit,0),0,IFNULL(trade_Rate,1),NOW(),NOW());
  END IF;

  INSERT INTO i_trade_order(
    outTradeNo,positionId,userAccount,itemId,detailsWalletType,direction,tradeType,
    openPrice,stopLoss,takeProfit,swap,takeSpread,tradeVolume,tradeRate,tradeStatus,trader,openedAt,currentPrice
  )
  VALUES(
    out_TradeNo,p_Id,user_Account,item_Id,details_WalletType,LOWER(direction_Temp),trade_Type,
    open_Price,stop_Loss,take_Profit,IFNULL(swap_temp,0),IFNULL(take_Spread,0),trade_Volume,trade_Rate,trade_Status,trader_temp,NOW(),open_Price
  );

  IF(trade_Status = 0) THEN
    INSERT INTO i_balance_details(
      detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,
      income,expense,outTradeNo,detailsRemarks,createdDate
    )
    VALUES(
      getGenerateId('i_balance_details'),user_Account,details_WalletType,1,5,
      0,IFNULL(totalAmount,0),out_TradeNo,'限价单冻结保证金',NOW()
    );
  END IF;

  IF(trade_Status = 1)THEN
    SET details_Id = getGenerateId('i_balance_details');
    IF details_Id IS NULL OR details_Id = '' THEN
      SET details_Id = CONCAT('IBD', REPLACE(UUID(),'-',''));
    END IF;
    INSERT INTO i_balance_details(
      detailsId,userAccount,detailsWalletType,detailsType,detailsSubType,
      income,expense,outTradeNo,detailsRemarks,createdDate
    )
    VALUES(
      details_Id,user_Account,details_WalletType,1,2,
      0,IFNULL(totalAmount,0),out_TradeNo,'开仓扣款',NOW()
    );

    SELECT IFNULL(totalVolume,0), IFNULL(avgOpenPrice,0), IFNULL(takeSpread,0), IFNULL(totalLiability,0)
      INTO cur_totalVolume, cur_avgOpenPrice, cur_takeSpread, cur_totalLiability
    FROM i_positions
    WHERE pId = p_Id
    FOR UPDATE;

    SET new_totalVolume = cur_totalVolume + trade_Volume;
    SET new_avgOpenPrice = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_avgOpenPrice * cur_totalVolume) + (open_Price * trade_Volume)) / new_totalVolume
        ELSE open_Price
    END;
    -- 注意：take_Spread 已经是本次交易的总费用，直接累加即可
    SET new_takeSpread = CASE 
      WHEN new_totalVolume > 0 
        THEN ((cur_takeSpread * cur_totalVolume) + IFNULL(take_Spread,0)) / new_totalVolume
        ELSE IFNULL(take_Spread,0)
    END;
    -- 新增负债 = 本次开仓成本 - 保证金
    -- 注意：take_Spread 已经是总费用，不能再乘以数量
    SET new_totalLiability = CASE 
      WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0
        THEN cur_totalLiability + ((open_Price * trade_Volume + IFNULL(take_Spread,0)) - ((open_Price * trade_Volume + IFNULL(take_Spread,0)) / max_Lever))
        ELSE cur_totalLiability
    END;

    UPDATE i_positions
      SET totalVolume = new_totalVolume,
          avgOpenPrice = new_avgOpenPrice,
          takeSpread = new_takeSpread,
          totalLiability = new_totalLiability,
          stopLoss = IFNULL(stop_Loss, stopLoss),
          takeProfit = IFNULL(take_Profit, takeProfit),
          tradeRate = IFNULL(trade_Rate, tradeRate),
          updatedAt = NOW()
    WHERE pId = p_Id;
  END IF;

  IF t_error=1 THEN 
    ROLLBACK; 
    SELECT 0 AS status,'Creation failed' AS message,4003 AS code,last_step AS failedStep; 
  ELSE 
    COMMIT;

    SELECT IFNULL(SUM(income - expense), 0) INTO available
    FROM i_balance_details 
    WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = details_WalletType;

    SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
      'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
      'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
      'liability',CASE 
                    WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0 
                      THEN (openPrice * tradeVolume + takeSpread) - ((openPrice * tradeVolume + takeSpread) / max_Lever)
                    ELSE 0 
                  END,
      'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
      'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
    )) FROM i_trade_order 
    WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

    SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
      'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
      'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
      'liability',CASE 
                    WHEN details_WalletType = 1 AND max_Lever IS NOT NULL AND max_Lever > 0 
                      THEN (openPrice * tradeVolume + takeSpread) - ((openPrice * tradeVolume + takeSpread) / max_Lever)
                    ELSE 0 
                  END,
      'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
      'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
    )) FROM i_trade_order 
    WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 1),JSON_ARRAY());

    SELECT 1 AS status,'Created successfully' AS message,2000 AS code,out_TradeNo AS outTradeNo,nowCommission,position,available,max_Lever AS maxLever;
  END IF;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_create_prepaid
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_create_prepaid`;
delimiter ;;
CREATE PROCEDURE `i_create_prepaid`(IN user_Account VARCHAR(255),
  IN trade_Currency ENUM('USDT','WXPAY','ALIPAY','PAYPAL','BANK'),
  IN trade_Amount DECIMAL(20,8),
  IN in_Account VARCHAR(255))
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
      trade_No AS `tradeNo`;  -- ⚠️ 改为 data 字段，与前端对应
  END IF;
  
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_create_UserAccount
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_create_UserAccount`;
delimiter ;;
CREATE PROCEDURE `i_create_UserAccount`(IN user_Email VARCHAR(255),
IN user_Name VARCHAR(255),
IN user_Password VARCHAR(255),
IN invitation_UserAccount VARCHAR(255),
IN user_IdCardFrontImage LONGTEXT,
IN user_IdCardReverseImage LONGTEXT)
BEGIN
#createUser
DECLARE user_Salt,api_Key,user_Account VARCHAR(255);
DECLARE t_error INTEGER DEFAULT 0;
DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

start transaction;
SET user_Salt = getRandomStr(4);
SET user_Password = getMD5Str(CONCAT(user_Password,user_Salt));
SET user_Account = getGenerateId('i_user');
set api_Key=getMD5Str(getMD5Str(CONCAT(user_Email,getRandomStr(8))));

INSERT INTO i_user (
userAccount,
userEmail,
userPassword,
userPayPassword,
userSalt,
userNick,
userName,
invitationUserAccount,
userIdCardFrontImage,
userIdCardReverseImage,
apiKey
)VALUES(
user_Account,
user_Email,
user_Password,
user_Password,
user_Salt,
user_Name,
user_Name,
invitation_UserAccount,
user_IdCardFrontImage,
user_IdCardReverseImage,
api_Key
);

IF t_error=1 THEN
ROLLBACK;
SELECT 0 as `status`,'Creation failed' as `message`,4003 AS `code`;
ELSE
commit;
SELECT 1 as `status`,'Created successfully' as `message`,user_Account as userAccount,api_Key AS apiKey,2000 AS `code`;
END if;

END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_getDetailsLog
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_getDetailsLog`;
delimiter ;;
CREATE PROCEDURE `i_getDetailsLog`(IN user_Account VARCHAR(255),
IN log_Type INT,
IN pageNum INT,
IN pageCount INT)
BEGIN
#getLeveraged
DECLARE PageCountFrom INT(11) DEFAULT 0;
DECLARE detailList JSON;

SET PageCountFrom = pageNum * pageCount;

SET detailList = IFNULL((SELECT JSON_ARRAYAGG(logData) FROM(SELECT logData FROM i_details_log WHERE deleted=0 AND userAccount = user_Account AND logType = log_Type ORDER BY createdDate DESC LIMIT PageCountFrom,pageCount)a),JSON_ARRAY());

SELECT 1 as `status`,'Get Successfully' as `message`,2000 AS `code`,detailList;
	 
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_getLeveraged
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_getLeveraged`;
delimiter ;;
CREATE PROCEDURE `i_getLeveraged`(IN user_Account VARCHAR(255))
BEGIN
#getLeveraged
#DECLARE user_Mobile,user_Nick,user_Name VARCHAR(255);

#SELECT userMobile,userNick,userName INTO user_Mobile,user_Nick,user_Name FROM i_user WHERE deleted=0 AND userAccount = user_Account;

SELECT 1 as `status`,'Get Successfully' as `message`,2000 AS `code`,
user_Account AS userAccount,
'0.00' AS totalAsset,#杠杆账户总资产
'0.00' AS todayPL ,#今日盈亏
'0.00' AS collateral,#抵押物价值
20 AS ratio,#持仓盈亏
'0.00' AS totalLiabilities,#总负债
'0.00' AS accountEquity,#账户权益
'0.00' AS available,#可用余额
'0.00' AS netAssets,#净资产
'0.00' AS borrowed,#已借款
'0.00' AS interest#利息
;
	 
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_getMyWallet
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_getMyWallet`;
delimiter ;;
CREATE PROCEDURE `i_getMyWallet`(IN user_Account VARCHAR(255),
  IN details_WalletType TINYINT)
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
    
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_get_balance
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_get_balance`;
delimiter ;;
CREATE PROCEDURE `i_get_balance`(IN user_Account VARCHAR(255))
BEGIN
  DECLARE cashBalance, leveragedBalance, collateral, borrowed, lever_Interest, totalInterest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE max_Lever DECIMAL(6,2) DEFAULT 0.00;

  SELECT 
    IFNULL(SUM(CASE WHEN detailsWalletType = 0 THEN income - expense ELSE 0 END), 0),
    IFNULL(SUM(CASE WHEN detailsWalletType = 1 THEN income - expense ELSE 0 END), 0)
  INTO cashBalance, leveragedBalance
  FROM i_balance_details 
  WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType IN (0, 1);

  SELECT 
    IFNULL(SUM(DISTINCT c.collateralAmount), 0),
    IFNULL(SUM(l.leverAmount), 0),
    IFNULL(SUM(CEILING(TIMESTAMPDIFF(HOUR, l.createdDate, NOW())) * (l.leverAmount * l.leverInterest)), 0)
  INTO collateral, borrowed, totalInterest
  FROM i_collateral c
  LEFT JOIN i_lever l ON l.userAccount = user_Account AND l.deleted = 0 AND l.leverStatus = 0
  WHERE c.deleted = 0 AND c.userAccount = user_Account AND c.collateralStatus = 0;

  SELECT leverInterest, maxLever * 100 INTO lever_Interest, max_Lever 
  FROM i_user WHERE deleted = 0 AND userAccount = user_Account;

  SELECT 1 AS status,'Get successfully' AS message,2000 AS code,
    cashBalance AS cashBalance,
    leveragedBalance AS leveragedBalance,
    collateral AS collateral,
    borrowed AS borrowed,
    totalInterest AS totalInterest,
    borrowed + totalInterest AS totalLiabilities,
    lever_Interest AS leverInterest,
    max_Lever AS maxLever,
    (leveragedBalance - collateral - borrowed) AS leveragedTransfer;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_get_inAccount
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_get_inAccount`;
delimiter ;;
CREATE PROCEDURE `i_get_inAccount`(IN user_Account VARCHAR(255),  -- 保留参数但不使用（接口兼容）
  IN account_Type ENUM('USDT','WXPAY','ALIPAY','PAYPAL','BANK'),
  IN account_Protocol VARCHAR(50))
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
    
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_get_orderinfo
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_get_orderinfo`;
delimiter ;;
CREATE PROCEDURE `i_get_orderinfo`(IN user_Account VARCHAR(255),IN details_WalletType INT,IN item_Id VARCHAR(255))
BEGIN
  DECLARE nowCommission,position JSON;
  DECLARE available,lever_Interest,max_Lever DECIMAL(20,8) DEFAULT 0.00000000;

  SELECT 
    IFNULL(SUM(bd.income - bd.expense), 0) AS available,
    MAX(u.leverInterest) AS lever_Interest,
    MAX(u.maxLever * 100) AS max_Lever
  INTO available, lever_Interest, max_Lever
  FROM i_user u
  LEFT JOIN i_balance_details bd 
    ON bd.deleted = 0 
   AND bd.userAccount = u.userAccount 
   AND bd.detailsWalletType = details_WalletType
  WHERE u.deleted = 0 AND u.userAccount = user_Account
  GROUP BY u.userAccount;

  SET nowCommission = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',outTradeNo,'direction',direction,'tradeType',tradeType,'openPrice',openPrice,
    'swap',swap,'stopLoss',stopLoss,'takeProfit',takeProfit,'tradeVolume',tradeVolume,
    'tradeRate',tradeRate,'tradeStatus',tradeStatus,'openedAt',openedAt,
    'liability',IF(details_WalletType = 1,(openPrice * tradeVolume + takeSpread) - ((openPrice * tradeVolume + takeSpread) / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'liquidation',IF(details_WalletType = 1,IF(direction = 'buy',openPrice * (1 - (1 / max_Lever * 0.6)),openPrice * (1 + (1 / max_Lever * 0.6))),'--')
  )) FROM i_trade_order 
  WHERE deleted=0 AND userAccount = user_Account AND detailsWalletType = details_WalletType AND itemId = item_Id AND tradeStatus = 0),JSON_ARRAY());

  -- 返回聚合持仓卡片（单品种单方向一张卡），严格按钱包类型过滤
  SET position = IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'outTradeNo',pId,
    'direction',aggDirection,
    'itemId',aggItemId,
    'tradeVolume',totalVolume,
    'openPrice',avgOpenPrice,
    'takeSpread',takeSpread,
    'liability',IF(details_WalletType = 1,(avgOpenPrice * totalVolume + takeSpread) - ((avgOpenPrice * totalVolume + takeSpread) / max_Lever),0),
    'hourlyInterest',IF(details_WalletType = 1,lever_Interest,0),
    'stopLoss',IFNULL(stopLoss,0),
    'takeProfit',IFNULL(takeProfit,0),
    'swap',IFNULL(swap,0),
    'tradeRate',IFNULL(tradeRate,1),
    'liquidation',IF(details_WalletType = 1,IF(aggDirection = 'buy',avgOpenPrice * (1 - (1 / max_Lever * 0.5)),avgOpenPrice * (1 + (1 / max_Lever * 0.5))),'--'),
    'openedAt',openedAt,
    'updatedAt',updatedAt
  )) FROM i_positions 
  WHERE deleted=0 AND userAccount = user_Account AND aggItemId = item_Id AND detailsWalletType = details_WalletType AND totalVolume > 0),JSON_ARRAY());

  SELECT 1 AS status,'Get successfully' AS message,2000 AS code,nowCommission,position,available,max_Lever AS maxLever;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_Login
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_Login`;
delimiter ;;
CREATE PROCEDURE `i_Login`(IN user_Email VARCHAR(255),
IN user_Password VARCHAR(255),
IN login_Ip VARCHAR(255),
IN login_Location VARCHAR(255),
IN login_Os VARCHAR(255),
IN login_Status INT(1),
IN login_Msg VARCHAR(255))
BEGIN
#createUser
DECLARE user_Salt,new_userPassword,user_Account,log_Id VARCHAR(255);
DECLARE t_error INTEGER DEFAULT 0;
DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

SELECT userAccount,userPassword,userSalt INTO user_Account,new_userPassword,user_Salt FROM i_user WHERE deleted=0 AND (userEmail = user_Email or userAccount = user_Email OR userMobile = user_Email);

IF(user_Account IS NOT NULL AND user_Account<>'')THEN
   SET user_Password = getMD5Str(CONCAT(user_Password,user_Salt));
	 IF(user_Password = new_userPassword)THEN
	    start transaction;
			   SET log_Id = getGenerateId('i_login_log');
			   INSERT INTO i_login_log (
				 logId,
         userAccount,
         loginIp,
         loginLocation,
         loginOs,
         loginStatus,
         loginMsg
         )VALUES(
				 log_Id,
         user_Account,
         login_Ip,
         login_Location,
         login_Os,
         login_Status,
         login_Msg
         );
				 
			IF t_error=1 THEN
      ROLLBACK;
         SELECT 0 as `status`,'Log Save failed' as `message`,4002 AS `code`;
      ELSE
      commit;
         SELECT 1 as `status`,'Login successfully' as `message`,2000 AS `code`,user_Account AS userAccount;
      END if;
	 ELSE
	    SELECT 0 as `status`,'Incorrect password' as `message`,4003 AS `code`;
	 END IF;
ELSE
   SELECT 0 as `status`,'There is no such user' as `message`,4004 AS `code`;
END IF;
	 
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_modify_TP_SL
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_modify_TP_SL`;
delimiter ;;
CREATE PROCEDURE `i_modify_TP_SL`(IN user_Account VARCHAR(255),#用户名
IN out_TradeNo VARCHAR(255),#仓单号
IN stop_Loss DECIMAL(20,8),#划转金额
IN take_Profit DECIMAL(20,8))
BEGIN
#划转资金
DECLARE t_error INTEGER DEFAULT 0;
DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

   start transaction;
   
	 UPDATE i_trade_order SET
	 stopLoss = stop_Loss,
	 takeProfit = take_Profit
	 WHERE deleted=0 AND outTradeNo = out_TradeNo;
	 
	 UPDATE i_positions SET
	 stopLoss = stop_Loss,
	 takeProfit = take_Profit
	 WHERE deleted=0 AND outTradeNo = out_TradeNo;
	 
   IF t_error=1 THEN
   ROLLBACK;
   SELECT 0 as `status`,'modify failed' as `message`,4003 AS `code`;
   ELSE
   commit;
   SELECT 1 as `status`,'modify successfully' as `message`,2000 AS `code`;
   END if;

END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_repayment
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_repayment`;
delimiter ;;
CREATE PROCEDURE `i_repayment`(IN user_Account VARCHAR(255),#用户名
IN repayment_Amount DECIMAL(20,8))
BEGIN
#还款
DECLARE balance,lever_Amount,swapTotal DECIMAL(20,8) DEFAULT 0.00000000;
DECLARE remaining INT DEFAULT 0;
DECLARE collateral_Id,lever_Id VARCHAR(255);
DECLARE t_error INTEGER DEFAULT 0;
DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

#1、获取杠杆账户余额
SET balance = IFNULL((SELECT SUM(income) - SUM(expense) FROM i_balance_details WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = 1),0);

#2、获取借款笔数
SET  remaining = (SELECT COUNT(rowId) FROM i_lever WHERE deleted = 0 AND userAccount = user_Account AND repaymentDate IS NULL);

start transaction;

			 WHILE remaining > 0 DO
			   SELECT collateralId,leverAmount,leverId,CEILING(TIMESTAMPDIFF(HOUR, createdDate, NOW())) * (leverAmount * leverInterest) INTO collateral_Id,lever_Amount,lever_Id,swapTotal FROM i_lever WHERE deleted = 0 AND userAccount = user_Account AND leverStatus = 0 ORDER BY createdDate DESC LIMIT 1;
				 IF(lever_Amount IS NOT NULL AND balance >= lever_Amount)THEN
			      
						#设置还款
				    UPDATE i_lever SET
						leverStatus = 1,
						repaymentInterest = swapTotal,
						repaymentDate = CURRENT_TIMESTAMP(3)
						WHERE deleted = 0 AND leverId = lever_Id;
						
						#设置解除抵押物
				    UPDATE i_collateral SET
						collateralStatus = 1
						WHERE deleted = 0 AND collateralId = collateral_Id;
				 
				    #7、还款
            INSERT INTO `i_balance_details`(
            detailsId,
            userAccount,
	          detailsWalletType,
	          detailsType,
	          detailsSubType,
            expense,
						outTradeNo,
            detailsRemarks
            )VALUES(
            getGenerateId('i_balance_details'),
            user_Account,
	          1,
	          3,
	          7,
            lever_Amount + swapTotal,
            lever_Id,
						'手动偿还本金+利息'
            );
						
						SET balance = balance - (lever_Amount + swapTotal);
				    SET remaining = remaining - 1;
				 ELSE
				    SET remaining = 0;
				 END IF;
			 END WHILE;
			 
			 
IF t_error=1 THEN
ROLLBACK;
SELECT 0 as `status`,'modify failed' as `message`,4003 AS `code`;
ELSE
commit;
SELECT 1 as `status`,'modify successfully' as `message`,2000 AS `code`;
END if;

END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for i_transfer
-- ----------------------------
DROP PROCEDURE IF EXISTS `i_transfer`;
delimiter ;;
CREATE PROCEDURE `i_transfer`(IN user_Account VARCHAR(255),
IN transferType INT,#0=现金钱包支出,1=杠杆账户支出
IN transferAmount DECIMAL(20,8))
BEGIN
#划转资金
DECLARE details_Id VARCHAR(255);
DECLARE outStatus,inStatus INT;
DECLARE balance DECIMAL(20,8) DEFAULT 0.00000000;
DECLARE t_error INTEGER DEFAULT 0;
DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

IF(transferType = 0)THEN
   SET outStatus = 0;
	 SET inStatus = 1;
ELSE
	 SET outStatus = 1;
	 SET inStatus = 0;
END IF;

#1、获取当前用户的余额
SET balance = IFNULL((SELECT SUM(income) - SUM(expense) FROM i_balance_details WHERE deleted = 0 AND userAccount = user_Account AND detailsWalletType = outStatus),0);

#2、假如余额足够
IF(balance >= transferAmount)THEN

   start transaction;
   
   #划出账户
   SET details_Id = getGenerateId('i_balance_details');
   INSERT INTO `i_balance_details`(
   detailsId,
   userAccount,
   otherUserAccount,
   detailsWalletType,
   expense,
   detailsType,
   detailsSubType
   )VALUES(
   details_Id,
   user_Account,
   user_Account,
   outStatus,
   transferAmount,
   2,
   8
   );
   
   
   #划入账户
   SET details_Id = getGenerateId('i_balance_details');
   INSERT INTO `i_balance_details`(
   detailsId,
   userAccount,
   otherUserAccount,
   detailsWalletType,
   income,
   detailsType,
   detailsSubType
   )VALUES(
   details_Id,
   user_Account,
   user_Account,
   inStatus,
   transferAmount,
   2,
   8
   );



   IF t_error=1 THEN
   ROLLBACK;
   SELECT 0 as `status`,'transfer failed' as `message`,4003 AS `code`;
   ELSE
   commit;
   SELECT 1 as `status`,'transfer successfully' as `message`,2000 AS `code`;
   END if;

ELSE
   SELECT 0 as `status`,'Insufficient balance' as `message`,4001 AS `code`;
END IF;

END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_check_liquidation
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_check_liquidation`;
delimiter ;;
CREATE PROCEDURE `sp_check_liquidation`()
BEGIN
  DECLARE v_liq_count INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION 
  BEGIN
    ROLLBACK;
  END;

  START TRANSACTION;

  -- 直接更新需要强平的订单
  UPDATE i_trade_order o
  INNER JOIN (
    SELECT 
      u.userAccount,
      IFNULL(SUM(bd.income - bd.expense), 0) + 
      IFNULL(SUM(CASE WHEN o2.direction = 'buy' 
                      THEN (o2.currentPrice - o2.openPrice) * o2.tradeVolume 
                      ELSE (o2.openPrice - o2.currentPrice) * o2.tradeVolume END), 0) AS equity,
      IFNULL(SUM(DISTINCT c.collateralAmount), 0) * 0.5 AS liqThreshold
    FROM i_user u
    LEFT JOIN i_balance_details bd ON bd.deleted = 0 AND bd.userAccount = u.userAccount AND bd.detailsWalletType = 1
    LEFT JOIN i_collateral c ON c.deleted = 0 AND c.userAccount = u.userAccount AND c.collateralStatus = 0
    LEFT JOIN i_trade_order o2 ON o2.deleted = 0 AND o2.userAccount = u.userAccount AND o2.tradeStatus = 1
    WHERE u.deleted = 0
    GROUP BY u.userAccount
    HAVING equity < liqThreshold AND liqThreshold > 0
  ) liq ON liq.userAccount = o.userAccount
  SET o.tradeStatus = 2,
      o.closedAt = NOW(),
      o.detailsRemarks = CONCAT('强平: equity=', liq.equity, ', threshold=', liq.liqThreshold)
  WHERE o.deleted = 0 AND o.tradeStatus = 1;

  SET v_liq_count = ROW_COUNT();

  -- 清空强平用户的聚合持仓
  IF v_liq_count > 0 THEN
    UPDATE i_positions p
    INNER JOIN (
      SELECT DISTINCT userAccount 
      FROM i_trade_order 
      WHERE tradeStatus = 2 
        AND closedAt >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
        AND detailsRemarks LIKE '强平:%'
    ) liq ON liq.userAccount = p.userAccount
    SET p.totalVolume = 0, p.updatedAt = NOW();
  END IF;

  COMMIT;

  SELECT v_liq_count AS liquidatedOrderCount;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_process_trade_data
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_process_trade_data`;
delimiter ;;
CREATE PROCEDURE `sp_process_trade_data`(IN p_symbol VARCHAR(32), IN p_price DECIMAL(20,8))
BEGIN
  
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_repay_due_leverage
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_repay_due_leverage`;
delimiter ;;
CREATE PROCEDURE `sp_repay_due_leverage`(IN p_userAccount VARCHAR(255))
proc_label: BEGIN
  DECLARE v_balance DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_has_open INT DEFAULT 0;
  DECLARE v_collateralId VARCHAR(255);
  DECLARE v_leverId VARCHAR(255);
  DECLARE v_amount DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_interestRate DECIMAL(10,8) DEFAULT 0.00000000;
  DECLARE v_fallbackRate DECIMAL(10,8) DEFAULT 0.00000000;
  DECLARE v_hours BIGINT DEFAULT 0;
  DECLARE v_interest DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_totalPay DECIMAL(20,8) DEFAULT 0.00000000;
  DECLARE v_now DATETIME(3);
  DECLARE t_error INTEGER DEFAULT 0; 
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET t_error=1;

  IF p_userAccount IS NULL OR p_userAccount = '' THEN LEAVE proc_label; END IF;

  -- 若仍有杠杆持仓，直接退出（仅在“最终结算”时偿还）
  SELECT COUNT(*) INTO v_has_open
  FROM i_trade_order
  WHERE deleted = 0 AND userAccount = p_userAccount AND detailsWalletType = 1 AND tradeStatus = 1;
  IF v_has_open > 0 THEN LEAVE proc_label; END IF;

  -- 杠杆钱包余额
  SELECT IFNULL(SUM(income) - SUM(expense), 0)
    INTO v_balance
  FROM i_balance_details
  WHERE deleted = 0 AND userAccount = p_userAccount AND detailsWalletType = 1;

  -- 回退利率（如借据未存利率）
  SELECT IFNULL(leverInterest, 0) INTO v_fallbackRate
  FROM i_user WHERE deleted = 0 AND userAccount = p_userAccount
  LIMIT 1;

  SET v_now = CURRENT_TIMESTAMP(3);

  repay_loop: WHILE TRUE DO
    -- 取最早一笔未还借据
    SELECT collateralId, leverId, IFNULL(leverAmount,0), IFNULL(leverInterest, v_fallbackRate),
           TIMESTAMPDIFF(HOUR, createdDate, v_now)
      INTO v_collateralId, v_leverId, v_amount, v_interestRate, v_hours
    FROM i_lever
    WHERE deleted = 0 AND userAccount = p_userAccount AND repaymentDate IS NULL
    ORDER BY createdDate ASC
    LIMIT 1;

    -- 无待还借据 => 退出
    IF v_leverId IS NULL OR v_leverId = '' THEN LEAVE repay_loop; END IF;

    -- 按整小时计息
    SET v_interest = GREATEST(0, v_hours * v_amount * IFNULL(v_interestRate, 0));
    SET v_totalPay = v_amount + v_interest;

    -- 余额不足 => 本次不处理，退出（等待后续补充资金后再次调用）
    IF v_balance < v_totalPay THEN LEAVE repay_loop; END IF;

    START TRANSACTION;
      -- 标记借据已还
      UPDATE i_lever SET
        leverStatus = 1,
        repaymentInterest = v_interest,
        repaymentDate = v_now
      WHERE deleted = 0 AND leverId = v_leverId;

      -- 释放抵押品
      UPDATE i_collateral SET
        collateralStatus = 1
      WHERE deleted = 0 AND collateralId = v_collateralId;

      -- 记账：本金+利息
      INSERT INTO i_balance_details (
        detailsId, userAccount, detailsWalletType, detailsType, detailsSubType,
        expense, outTradeNo, detailsRemarks
      ) VALUES (
        getGenerateId('i_balance_details'), p_userAccount, 1, 3, 7,
        v_totalPay, v_leverId, CONCAT('自动偿还本金+利息(整小时): hours=', v_hours)
      );
    COMMIT;

    -- 更新可用余额，继续尝试偿还下一笔
    SET v_balance = v_balance - v_totalPay;
  END WHILE;
END
;;
delimiter ;

-- ----------------------------
-- Procedure structure for sp_settle_closed_orders
-- ----------------------------
DROP PROCEDURE IF EXISTS `sp_settle_closed_orders`;
delimiter ;;
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
END
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_balance_details
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_on_i_balance_details`;
delimiter ;;
CREATE TRIGGER `auto_on_i_balance_details` BEFORE INSERT ON `i_balance_details` FOR EACH ROW begin
 DECLARE json_data JSON;
 DECLARE row_Id INT;
 DECLARE prev_BlockHash,times_tamp varchar(255);
 
set new.balance = IFNULL((SELECT (SUM(income) + new.income) - (SUM(expense) + new.expense) FROM i_balance_details WHERE deleted=0 AND userAccount = new.userAccount AND detailsWalletType = new.detailsWalletType),new.income - new.expense); 

 #set new.updatedDate = new.createdDate;
 set new.detailsRemarks = (SELECT MAX(rowId) FROM i_balance_details);
 
 set times_tamp = getTimestamp();
 set row_Id = (SELECT MAX(rowId) FROM i_balance_details);
 set prev_BlockHash = (SELECT merkleRoot FROM i_balance_details WHERE deleted=0 AND rowId = row_Id);
 -- 将新记录转换为JSON字符串
 SET json_data = JSON_OBJECT(
     'rowId',NEW.rowId,
     'detailsId',NEW.detailsId,
     'userAccount',NEW.userAccount,
     'otherUserAccount',NEW.otherUserAccount,
     'detailsItem',NEW.detailsItem,
     'detailsType',NEW.detailsType,
     'detailsSubType',NEW.detailsSubType,
     'income',NEW.income,
     'expense',NEW.expense,
     'balance',NEW.balance,
     'detailsStatus',NEW.detailsStatus,
     'outTradeNo',NEW.outTradeNo,
     'tradeNo',NEW.tradeNo,
     'detailsRemarks',NEW.detailsRemarks,
     'tradeTimestamp',times_tamp,
     'prevBlockHash',prev_BlockHash
 );
 SET new.prevBlockHash = prev_BlockHash;
 set new.merkleRoot = SHA2(json_data,256);
 set new.tradeTimestamp = times_tamp;
 
 INSERT INTO i_details_log(
 logNo,
 userAccount,
 logType,
 logData
 )VALUES(
 getGenerateId('i_details_log'),
 new.userAccount,
 IF(new.detailsWalletType = 0,1,2),
 JSON_OBJECT(
 'id',new.detailsId,
 'createdDate',DATE_FORMAT(new.createdDate,'%Y-%m-%d %H:%i:%s'),
 'type',new.detailsSubType,
 'title',CASE new.detailsSubType WHEN 0 THEN '入金充值' WHEN 1 THEN '出金提现' WHEN 2 THEN '开仓支出' WHEN 3 THEN '平仓卖出' WHEN 4 THEN '分润提成' WHEN 5 THEN '活动赠金' WHEN 6 THEN '出金手续费' WHEN 7 THEN '平仓还款' WHEN 8 THEN IF(new.income = 0,'资金划出','资金划入') WHEN 9 THEN '借款抵押支出' WHEN 10 THEN '放款入账' ELSE '其它' END,
 'amount',IF(NEW.income = 0,- new.expense,NEW.income),
 'titleEn',CASE new.detailsSubType WHEN 0 THEN 'Deposit' WHEN 1 THEN 'Withdrawal' WHEN 2 THEN 'Open position' WHEN 3 THEN 'Close position' WHEN 4 THEN 'Profit sharing commission' WHEN 5 THEN 'Activity bonus' WHEN 6 THEN 'Withdrawal handling fee' WHEN 7 THEN 'Closing position and repayment' WHEN 8 THEN IF(new.income = 0,'Transfer out','Funds transfer') WHEN 9 THEN 'Loan mortgage expenses' WHEN 10 THEN 'Loan receipt' ELSE 'other' END,
 'status',1,
 'outTradeNo',IF(NEW.tradeNo IS NULL,new.outTradeNo,NEW.tradeNo)
 )
 );
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_balance_details
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_balance_details`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_balance_details` BEFORE UPDATE ON `i_balance_details` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_collateral
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_collateral`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_collateral` BEFORE UPDATE ON `i_collateral` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_details_info
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_details_info`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_details_info` BEFORE UPDATE ON `i_details_info` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_details_log
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_details_log`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_details_log` BEFORE UPDATE ON `i_details_log` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_inout
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_inout`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_inout` BEFORE UPDATE ON `i_inout` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_item_type
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_item_type`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_item_type` BEFORE UPDATE ON `i_item_type` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_lever
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_lever`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_lever` BEFORE UPDATE ON `i_lever` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_login_log
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_login_log`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_login_log` BEFORE UPDATE ON `i_login_log` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_positions
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_positions`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_positions` BEFORE UPDATE ON `i_positions` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_trade_order
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_on_i_trade_order`;
delimiter ;;
CREATE TRIGGER `auto_on_i_trade_order` BEFORE INSERT ON `i_trade_order` FOR EACH ROW begin

IF(new.tradeStatus > 0)THEN
   INSERT INTO i_details_log(
   logNo,
   userAccount,
   logData
   )VALUES(
   getGenerateId('i_details_log'),
   new.userAccount,
   JSON_OBJECT(
   'outTradeNo',new.outTradeNo,
	 'itemId',new.itemId,
   'createdDate',DATE_FORMAT(new.createdDate,'%Y-%m-%d %H:%i:%s'),
   'type',0,
	 'openPrice',new.openPrice,
	 'currentPrice',new.currentPrice,
	 'tradeVolume',new.tradeVolume,
	 'takeSpread',new.takeSpread,
	 'totalAmount',(new.openPrice + new.takeSpread) * new.tradeVolume,
	 'walletType',new.detailsWalletType,
	 'direction',new.direction,
	 'tradeType',new.tradeType,
	 'status',new.tradeStatus,
	 'stopLoss',new.stopLoss,
   'takeProfit',new.takeProfit,
   'swap',new.swap,
	 'tradeRate',new.tradeRate
   )
   );
END IF;

end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_trade_order
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_trade_order`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_trade_order` BEFORE UPDATE ON `i_trade_order` FOR EACH ROW BEGIN
  -- ========== 变量声明 ==========
  DECLARE totalAmount, unrealized_Pnl, swapTotal, balance DECIMAL(20,8) DEFAULT 0;
  DECLARE openCost, netPnl DECIMAL(20,8) DEFAULT 0;  -- 新增：开仓成本、净盈亏
  DECLARE lever_Amount DECIMAL(20,8);
  DECLARE lever_Id, collateral_Id VARCHAR(255);
  DECLARE remaining INT DEFAULT 0;
  
  -- 更新时间戳
  SET new.updatedDate = CURRENT_TIMESTAMP(3);
  
  -- ========== 判断是否需要平仓 ==========
  -- 条件：订单状态从 <2 变为 2（已平仓）
  IF (old.tradeStatus < 2 AND new.tradeStatus = 2) THEN
    
    -- 1️⃣ 设置平仓时间
    SET new.closedAt = CURRENT_TIMESTAMP;
    
    -- ========================================
    -- 2️⃣ 计算盈亏（修正版本）
    -- ========================================
    
    -- 2.1 计算开仓成本（含点差）
    -- 开仓时用户支付：开仓价×数量 + 总点差费用
    -- 注意：takeSpread 已经是总费用（单位点差×数量），不能再乘以数量
    SET openCost = (new.openPrice * new.tradeVolume) + new.takeSpread;
    
    -- 2.2 计算平仓收入
    -- 平仓时用户收回：平仓价 × 数量
    SET totalAmount = new.currentPrice * new.tradeVolume;
    
    -- 2.3 计算原始盈亏（区分做多/做空）
    IF (new.direction = 0) THEN  
      -- 做多：盈亏 = 平仓收入 - 开仓成本
      SET unrealized_Pnl = totalAmount - openCost;
    ELSE  
      -- 做空：盈亏 = 开仓成本 - 平仓收入
      SET unrealized_Pnl = openCost - totalAmount;
    END IF;
    
    -- 2.4 扣除利息（杠杆账户持仓会产生利息）
    SET netPnl = unrealized_Pnl - IFNULL(new.swap, 0);
    
    -- ========================================
    -- 3️⃣ 入账余额明细（平仓收入）
    -- ========================================
    -- 平仓后立即入账，确保用户余额实时更新
    INSERT INTO i_balance_details (
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
    ) VALUES (
      getGenerateId('i_balance_details'),
      new.userAccount,
      new.detailsWalletType,
      1,  -- detailsType: 1=交易
      3,  -- detailsSubType: 3=平仓卖出
      openCost + netPnl,  -- income: 返还本金 + 净盈亏
      0,  -- expense: 0
      new.outTradeNo,
      CONCAT('平仓收入: 本金', openCost, ' + 盈亏', netPnl),
      CURRENT_TIMESTAMP
    );
    
    -- ========================================
    -- 4️⃣ 更新聚合持仓表（递减仓位）
    -- ========================================
    -- 注意：新架构使用聚合持仓表（一个品种+方向=一条记录）
    -- 平仓时需要递减 totalVolume，而不是删除记录
    UPDATE i_positions SET
      totalVolume = totalVolume - new.tradeVolume,  -- 递减持仓量
      updatedAt = CURRENT_TIMESTAMP                  -- 更新时间
    WHERE deleted = 0 
      AND userAccount = new.userAccount
      AND aggItemId = new.itemId
      AND aggDirection = new.direction
      AND totalVolume > 0;  -- 防止负数
    
    -- ========================================
    -- 5️⃣ 记录操作日志
    -- ========================================
    INSERT INTO i_details_log (
      logNo,
      userAccount,
      logData
    ) VALUES (
      getGenerateId('i_details_log'),
      new.userAccount,
      JSON_OBJECT(
        'outTradeNo', new.outTradeNo,
        'itemId', new.itemId,
        'createdDate', DATE_FORMAT(new.createdDate, '%Y-%m-%d %H:%i:%s'),
        'type', 1,  -- 0=开仓，1=平仓
        'openPrice', new.openPrice,
        'currentPrice', new.currentPrice,
        'tradeVolume', new.tradeVolume,
        'takeSpread', new.takeSpread,
        'totalAmount', (new.openPrice * new.tradeVolume) + new.takeSpread,
        'walletType', new.detailsWalletType,
        'direction', new.direction,
        'tradeType', new.tradeType,
        'status', new.tradeStatus,
        'stopLoss', new.stopLoss,
        'takeProfit', new.takeProfit,
        'swap', new.swap,
        'tradeRate', new.tradeRate,
        'netPnl', netPnl  -- 新增：记录净盈亏
      )
    );
    
    -- ========================================
    -- 6️⃣ 杠杆账户自动还款
    -- ========================================
    -- 为避免长事务与循环，在触发器中不做还款；
    -- 建议在结算过程或专用过程（如 sp_repay_due_leverage）中以批处理方式处理，
    -- 严格按整小时计息：TIMESTAMPDIFF(HOUR, createdDate, NOW())（向下取整）。
    
  END IF;
  
END
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table i_user
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_i_user`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_i_user` BEFORE UPDATE ON `i_user` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table interface
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_on_interface`;
delimiter ;;
CREATE TRIGGER `auto_on_interface` BEFORE INSERT ON `interface` FOR EACH ROW begin
 set new.sign = getMD5Str(CONCAT(getRandomStr(4),new.interfaceId));
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table interface
-- ----------------------------
DROP TRIGGER IF EXISTS `auto_updated_date_on_interface`;
delimiter ;;
CREATE TRIGGER `auto_updated_date_on_interface` BEFORE UPDATE ON `interface` FOR EACH ROW begin
 set new.updatedDate = CURRENT_TIMESTAMP(3); 
end
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table market_prices
-- ----------------------------
DROP TRIGGER IF EXISTS `trg_market_price_insert`;
delimiter ;;
CREATE TRIGGER `trg_market_price_insert` AFTER INSERT ON `market_prices` FOR EACH ROW BEGIN
  -- 更新该品种所有持仓的当前价格
  UPDATE i_trade_order
  SET currentPrice = NEW.price
  WHERE deleted = 0
    AND tradeStatus = 1
    AND itemId = NEW.symbol
  LIMIT 500;
END
;;
delimiter ;

-- ----------------------------
-- Triggers structure for table market_prices
-- ----------------------------
DROP TRIGGER IF EXISTS `trg_market_price_update`;
delimiter ;;
CREATE TRIGGER `trg_market_price_update` AFTER UPDATE ON `market_prices` FOR EACH ROW BEGIN
  DECLARE v_symbol VARCHAR(32);
  DECLARE v_new_price DECIMAL(20,8);
  DECLARE v_affected INT DEFAULT 0;
  
  SET v_symbol = NEW.symbol;
  SET v_new_price = NEW.price;
  
  -- ========================================
  -- 仅当价格变化时执行（避免无效触发）
  -- ========================================
  IF OLD.price <> NEW.price THEN
    
    -- ========================================
    -- 做多止损触发: 价格 <= 止损价
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = v_new_price,
      tradeStatus = 2,
      closedAt = NOW(),
      detailsRemarks = CONCAT('止损触发@', v_new_price)
    WHERE deleted = 0
      AND tradeStatus = 1
      AND itemId = v_symbol
      AND direction = 'buy'
      AND stopLoss > 0
      AND v_new_price <= stopLoss
    LIMIT 50;  -- 限制单次更新量，避免长时间持锁
    
    -- ========================================
    -- 做多止盈触发: 价格 >= 止盈价
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = v_new_price,
      tradeStatus = 2,
      closedAt = NOW(),
      detailsRemarks = CONCAT('止盈触发@', v_new_price)
    WHERE deleted = 0
      AND tradeStatus = 1
      AND itemId = v_symbol
      AND direction = 'buy'
      AND takeProfit > 0
      AND v_new_price >= takeProfit
    LIMIT 50;
    
    -- ========================================
    -- 做空止损触发: 价格 >= 止损价
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = v_new_price,
      tradeStatus = 2,
      closedAt = NOW(),
      detailsRemarks = CONCAT('止损触发@', v_new_price)
    WHERE deleted = 0
      AND tradeStatus = 1
      AND itemId = v_symbol
      AND direction = 'sell'
      AND stopLoss > 0
      AND v_new_price >= stopLoss
    LIMIT 50;
    
    -- ========================================
    -- 做空止盈触发: 价格 <= 止盈价
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = v_new_price,
      tradeStatus = 2,
      closedAt = NOW(),
      detailsRemarks = CONCAT('止盈触发@', v_new_price)
    WHERE deleted = 0
      AND tradeStatus = 1
      AND itemId = v_symbol
      AND direction = 'sell'
      AND takeProfit > 0
      AND v_new_price <= takeProfit
    LIMIT 50;
    
    -- ========================================
    -- 更新所有持仓的当前价格和浮动盈亏（冗余字段）
    -- ========================================
    UPDATE i_trade_order
    SET 
      currentPrice = v_new_price,
      currentPnL = CASE 
        WHEN direction = 'buy' THEN (v_new_price - openPrice) * tradeVolume 
        ELSE (openPrice - v_new_price) * tradeVolume 
      END
    WHERE deleted = 0
      AND tradeStatus = 1
      AND itemId = v_symbol
    LIMIT 500;  -- 限制更新量
    
  END IF;
END
;;
delimiter ;

SET FOREIGN_KEY_CHECKS = 1;
