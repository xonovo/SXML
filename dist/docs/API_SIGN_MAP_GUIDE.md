# API 签名映射配置说明

## 概述

`config/api-sign-map.js` 文件用于配置 API 接口的签名密钥映射。不同的项目/网站可能有不同的接口密钥配置，因此该文件独立于主配置文件。

## 文件位置

```
config/
  ├── app.config.js        # 应用主配置（或 app.config.{env}.js）
  └── api-sign-map.js      # API 签名映射配置 ⭐
```

## 配置格式

```javascript
const API_SIGN_MAP = {
  // 接口编号: 对应的密钥（32位MD5字符串）
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',  // 用户登录
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',  // 获取用户信息
  
  // 添加更多接口映射
  'I00001': 'YOUR_API_KEY_HERE',
  'I00003': 'YOUR_API_KEY_HERE',
};
```

## 使用方法

### 1. 在 HTML 中引入

在页面中，需要在 `config.js` **之前**引入 `api-sign-map.js`：

```html
<!-- 正确的引入顺序 -->
<script src="../../config/api-sign-map.js"></script>
<script src="../../utils/config.js"></script>
<script src="../../utils/sapi.js"></script>
```

### 2. 在编译配置中添加

如果使用 SXML 编译器，需要确保 `api-sign-map.js` 被包含在依赖列表中。

编辑 `utils/sxml.compiler.js`，在全局依赖中添加：

```javascript
const GLOBAL_DEPS = [
  'config/api-sign-map.js',  // ⭐ 添加这行
  'utils/jQuery_v3.js',
  'utils/aes.js',
  'utils/md5.js',
  'utils/config.js',
  // ... 其他依赖
];
```

### 3. 在代码中使用

配置加载后，可以通过 `window.API_CONFIG.SIGN_MAP` 访问：

```javascript
// 查看所有接口映射
console.log(window.API_CONFIG.SIGN_MAP);

// 获取特定接口的密钥
const loginKey = window.API_CONFIG.SIGN_MAP['I00002'];

// SuperAPI 会自动使用这些密钥
const result = await window.superAPI.request('I00002', {
  userEmail: 'user@example.com',
  userPassword: 'hashed_password'
});
```

## 配置步骤

### 步骤 1: 获取接口文档

从后端开发人员处获取接口文档，包含：
- 接口编号（如 `I00002`）
- 接口名称/描述
- 对应的签名密钥

### 步骤 2: 编辑配置文件

打开 `config/api-sign-map.js`，添加或修改接口映射：

```javascript
const API_SIGN_MAP = {
  // 登录模块
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',  // 用户登录
  'I00003': 'ABC123...',                          // 短信登录
  
  // 用户模块
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',  // 获取用户信息
  'I00018': 'DEF456...',                          // 修改用户信息
  
  // 订单模块
  'I00101': 'GHI789...',                          // 创建订单
  'I00102': 'JKL012...',                          // 查询订单
  
  // ... 继续添加
};
```

### 步骤 3: 重新构建

修改配置后，需要重新构建项目：

```bash
npm run build
```

## 安全建议

### ⚠️ 重要提示

1. **不要在前端明文存储敏感密钥**
   - 这些密钥用于签名验证，不是用于加密
   - 真正的加密密钥应该通过登录接口从服务端获取

2. **不同环境使用不同密钥**
   ```javascript
   // 根据环境使用不同配置
   const isDev = location.hostname === 'localhost';
   const API_SIGN_MAP = isDev ? DEV_KEYS : PROD_KEYS;
   ```

3. **定期更新密钥**
   - 建议定期更换 API 签名密钥
   - 更新后通知所有开发人员

4. **版本控制注意事项**
   - 考虑将此文件添加到 `.gitignore`
   - 提供模板文件 `api-sign-map.js.example`

## 故障排查

### 问题 1: API 调用返回签名错误

**症状**: 接口返回 `signature error` 或类似错误

**解决方案**:
1. 检查 `api-sign-map.js` 是否正确引入
2. 确认接口编号是否正确
3. 验证密钥是否与后端一致

```javascript
// 调试：打印当前使用的密钥
console.log('Interface I00002 key:', window.API_CONFIG.SIGN_MAP['I00002']);
```

### 问题 2: SIGN_MAP 为空对象

**症状**: `window.API_CONFIG.SIGN_MAP` 是 `{}`

**解决方案**:
1. 确认 `api-sign-map.js` 在 `config.js` 之前引入
2. 检查浏览器控制台是否有加载错误
3. 清除浏览器缓存后重试

```javascript
// 检查加载状态
console.log('API_SIGN_MAP loaded:', !!window.API_SIGN_MAP);
console.log('API_CONFIG.SIGN_MAP:', window.API_CONFIG.SIGN_MAP);
```

### 问题 3: 构建后密钥丢失

**症状**: 开发环境正常，构建后密钥丢失

**解决方案**:
确保 `build.dist.js` 或 `build.js` 中包含了 `config/api-sign-map.js` 的复制：

```javascript
// 在构建脚本中添加
const configFiles = [
  'config/app.config.js',
  'config/api-sign-map.js'
];

configFiles.forEach(file => {
  const src = path.join(PROJECT_ROOT, file);
  const dest = path.join(DIST_DIR, file);
  fs.copyFileSync(src, dest);
});
```

## 示例：完整的接口配置

```javascript
/**
 * API 接口签名映射配置
 * 项目: MyApp 后台管理系统
 * 更新时间: 2025-11-02
 */

const API_SIGN_MAP = {
  // ==================== 认证模块 ====================
  'I00001': 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',  // 发送验证码
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',  // 用户登录
  'I00003': 'B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7',  // 短信登录
  'I00004': 'C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8',  // 退出登录
  'I00005': 'D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9',  // 刷新Token
  
  // ==================== 用户模块 ====================
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',  // 获取用户信息
  'I00018': 'E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0',  // 修改用户信息
  'I00019': 'F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1',  // 修改密码
  'I00020': 'G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2',  // 上传头像
  
  // ==================== 订单模块 ====================
  'I00101': 'H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3',  // 创建订单
  'I00102': 'I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4',  // 查询订单
  'I00103': 'J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5',  // 取消订单
  'I00104': 'K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6',  // 订单列表
  
  // ==================== 支付模块 ====================
  'I00201': 'L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6A7',  // 创建支付
  'I00202': 'M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6A7B8',  // 查询支付状态
  'I00203': 'N4O5P6Q7R8S9T0U1V2W3X4Y5Z6A7B8C9',  // 支付回调
  
  // ==================== 文件模块 ====================
  'I00301': 'O5P6Q7R8S9T0U1V2W3X4Y5Z6A7B8C9D0',  // 文件上传
  'I00302': 'P6Q7R8S9T0U1V2W3X4Y5Z6A7B8C9D0E1',  // 文件下载
  'I00303': 'Q7R8S9T0U1V2W3X4Y5Z6A7B8C9D0E1F2',  // 删除文件
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API_SIGN_MAP;
} else if (typeof window !== 'undefined') {
  window.API_SIGN_MAP = API_SIGN_MAP;
}
```

## 多环境配置示例

如果需要区分开发和生产环境：

```javascript
/**
 * API 签名映射配置（多环境）
 */

// 开发环境密钥
const DEV_SIGN_MAP = {
  'I00002': 'DEV_KEY_00000C4D55921F91F6958FBE967FF7BE',
  'I00017': 'DEV_KEY_17DDE8B62CE8ED1746D23997A635FEDA',
};

// 生产环境密钥
const PROD_SIGN_MAP = {
  'I00002': '00000C4D55921F91F6958FBE967FF7BE',
  'I00017': '17DDE8B62CE8ED1746D23997A635FEDA',
};

// 根据环境选择
const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_SIGN_MAP = isDev ? DEV_SIGN_MAP : PROD_SIGN_MAP;

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API_SIGN_MAP;
} else if (typeof window !== 'undefined') {
  window.API_SIGN_MAP = API_SIGN_MAP;
}
```

---

## 相关文档

- [SuperAPI 文档](SAPI_README.md) - API 调用和加密通信
- [应用配置指南](../README.md#配置指南) - 主配置文件说明
- [部署指南](DEPLOYMENT.md) - 生产环境配置

---

**开发者**: King, Rainbow Haruko  
**更新时间**: 2025-11-02
