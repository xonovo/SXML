/**
 * API 接口签名映射配置
 * 每个接口对应的密钥映射表
 * 
 * 说明：
 * - 不同网站/项目可能有不同的接口密钥映射
 * - 请根据实际后端接口文档配置
 * - 密钥格式通常为 32 位 MD5 字符串
 * 
 * @author King, Rainbow Haruko
 * @version 1.0.0
 */

const API_SIGN_MAP = {
  // 注意:返回的参数没有包含 status code message，这些是通用返回参数
  // 登录相关
  'I00001': 'FAA4BC4D55921F91F6958FBE967FF7BE',  // 用户注册创建一个用户(传递参数:userEmail,userName,userPassword,invitationUserAccount,userIdCardFrontImage,userIdCardReverseImage),(返回参数:[{"key": "userAccount", "note": "用户账号", "type": "string"}, {"key": "apiKey", "note": "传输密钥", "type": "string"}])
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',  // 用户登录(传递参数:userEmail,userPassword,loginIp,loginLocation,loginOs,loginStatus,loginMsg),(返回参数:[{"key": "userAccount", "note": "用户账号", "type": "string"}])
  'I00003': '4446A32D857207AFA58E09480522B08C',  // 获取我的钱包信息(传递参数:userAccount),(返回参数:[{"key": "userAccount", "note": "用户账号", "type": "string"}, {"key": "userMobile", "note": "手机号码", "type": "string"}, {"key": "userNick", "note": "昵称", "type": "string"}, {"key": "userName", "note": "真实姓名", "type": "string"}, {"key": "totalAsset", "note": "总资产", "type": "Number"}, {"key": "walletBalance", "note": "钱包余额", "type": "Number"}, {"key": "accountBalance", "note": "账户余额", "type": "Number"}, {"key": "openPositionPL", "note": "持仓盈亏", "type": "Number"}, {"key": "equity", "note": "净值", "type": "Number"}, {"key": "marginLevel", "note": "保证金水平", "type": "Number"}, {"key": "credit", "note": "信用", "type": "Number"}, {"key": "freeMargin", "note": "可用保证金", "type": "Number"}, {"key": "borrowed", "note": "已借款", "type": "Number"}, {"key": "interest", "note": "利息", "type": "Number"}])
  'I00004': 'B98A0E82B1277F34C5DFC7D5966F3114',  // 入金(第一步获取收款账户)(传递参数:userAccount,accountType,accountProtocol),(返回参数:[{"key": "accountList", "note": "账户列表", "type": "array"}])
  'I00005': 'ED6DCFBB3219A2EFC25863042EF24DBB',  // 入金(第二步预订单)(传递参数:userAccount,tradeCurrency,tradeAmount,inAccount),(返回参数:[{"key": "userAccount", "note": "用户账号", "type": "string"}, {"key": "tradeNo", "note": "资金编号", "type": "string"}])
  'I00006': '6C70919CA7D94C8B10397BE27B348DF3',  // 入金(第三步确收收到款)(传递参数:tradeNo,outAccount),(返回参数:[])
  'I00007': '8739EB068C3733ABBD60EED3A2759DAD',  // 开仓(创建仓位)(传递参数:userAccount,itemId,detailsWalletType,directionTemp,tradeType,openPrice,stopLoss,takeProfit,takeSpread,tradeVolume,tradeRate,tradeStatus),(返回参数:[{"key": "outTradeNo", "note": "开仓编号", "type": "string"}])
  'I00008': '5DD7042FE12E0845CB59D4EB00970614',  // 平仓(关闭仓位)(传递参数:userAccount,outTradeNo,itemId,currentPrice,tradeStatus),(返回参数:[{"key": "outTradeNo", "note": "开仓编号", "type": "string"}])
  'I00009': '292010831689A694FDE8AE3C6DC1E220',  // 获取交易页面数据(传递参数:userAccount,detailsWalletType,itemId),(返回参数:[{"key": "nowCommission", "note": "当前委托", "type": "array"}, {"key": "position", "note": "当前仓位", "type": "array"}, {"key": "available", "note": "可用余额", "type": "Number"}])
  'I00010': 'DE42CBF22AF680C5B909D70D75A18EDE',  // 获取杠杆账户信息(传递参数:userAccount),(返回参数:[{"key": "userAccount", "note": "用户名", "type": "string"}, {"key": "totalAsset", "note": "杠杆账户总资产", "type": "Number"}, {"key": "todayPL", "note": "今日盈亏", "type": "Number"}, {"key": "collateral", "note": "抵押物价值", "type": "Number"}, {"key": "ratio", "note": "杠杆倍数", "type": "Number"}, {"key": "totalLiabilities", "note": "总负债", "type": "Number"}, {"key": "accountEquity", "note": "账户权益", "type": "Number"}, {"key": "available", "note": "可用余额", "type": "Number"}, {"key": "netAssets", "note": "净资产", "type": "Number"}, {"key": "borrowed", "note": "已借款", "type": "Number"}, {"key": "interest", "note": "利息", "type": "Number"}])
  'I00011': '52DAB648DD0DBA6DC1FA70D694A4039B',  // 获取余额信息(传递参数:userAccount),(返回参数:[{"key": "cashBalance", "note": "现金可用余额", "type": "Number"}, {"key": "leveragedBalance", "note": "杠杆账户可用余额", "type": "Number"}, {"key": "leveragedTransfer", "note": "杠杆账户可转帐余额", "type": "Number"}, {"key": "collateral", "note": "抵押总额", "type": "Number"}, {"key": "borrowed", "note": "借款总额", "type": "Number"}, {"key": "leverInterest", "note": "每小时借款利率", "type": "Number"}, {"key": "maxLever", "note": "最大可借款倍数", "type": "Number"}])
  'I00012': '513F32071A2DD583255599465F7935FB',  // 划转资金(传递参数:userAccount,transferType,transferAmount),(返回参数:[])
  'I00013': 'B0246BF9234BDAFB406698DDF02D67EF',  // 获取交易明细(传递参数:userAccount,logType,pageNum,pageCount),(返回参数:[{"key": "detailList", "note": "交易明细", "type": "array"}])
  'I00014': '302C2F90CF4449FD0746D961B72EFE85',  // 创建一个抵押并借款(传递参数:userAccount,collateralAmount,leverRate,leverAmount),(返回参数:[{"key": "leveragedBalance", "note": "杠杆账户可用余额", "type": "Number"}, {"key": "collateral", "note": "抵押总余额", "type": "Number"}, {"key": "borrowed", "note": "负债总额", "type": "Number"}, {"key": "leveragedTransfer", "note": "账户可转金额", "type": "Number"}, {"key": "leverInterest", "note": "借款利率", "type": "Number"}])
  'I00015': 'F4737DD75AD4BEBBF37341FA23A75114',  // 止盈止损的修改(传递参数:userAccount,outTradeNo,stopLoss,takeProfit),(返回参数:[])
  'I00016': 'A0918DA58ECC538E539331F9167F8DDA',  // 还款(传递参数:userAccount,repaymentAmount),(返回参数:[])
  // 用户信息相关
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',  // 轮询二维码登录
  // 示例：添加更多接口映射
};

// 导出配置（兼容不同加载方式）
if (typeof module !== 'undefined' && module.exports) {
  // Node.js 环境
  module.exports = API_SIGN_MAP;
} else if (typeof window !== 'undefined') {
  // 浏览器环境
  window.API_SIGN_MAP = API_SIGN_MAP;
}
