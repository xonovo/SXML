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
      // 登录相关
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',  // 用户登录
  // 用户信息相关
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',  // 获取用户信息
  // 示例：添加更多接口映射
  // 'I00001': 'YOUR_API_KEY_HERE',  // 接口描述
  // 'I00003': 'YOUR_API_KEY_HERE',  // 接口描述
  // 'I00004': 'YOUR_API_KEY_HERE',  // 接口描述
};

// 导出配置（兼容不同加载方式）
if (typeof module !== 'undefined' && module.exports) {
  // Node.js 环境
  module.exports = API_SIGN_MAP;
} else if (typeof window !== 'undefined') {
  // 浏览器环境
  window.API_SIGN_MAP = API_SIGN_MAP;
}
