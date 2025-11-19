# 智能依赖系统说明

## 概述

SXML 编译器内置智能依赖分析系统，在编译时自动检测每个页面实际使用的工具库，**只引入必要的依赖**，显著提高页面加载速度。

---

## 工作原理

### 1. 依赖检测

编译器会扫描 SXML 模板和 JS 文件的内容，根据代码特征自动检测使用的工具库：

```javascript
// 示例：如果页面代码中包含 $( 或 jQuery，则引入 jQuery_v3.js
if ($("#username").val()) { ... }  // ✅ 检测到 jQuery

// 示例：如果代码中包含 sapi.get/post/request，则引入 sapi.js
sapi.get('I00017', { ... });  // ✅ 检测到 sapi

// 示例：如果代码中包含 wsapi，则引入 wsapi.js
wsapi.connect();  // ✅ 检测到 wsapi
```

### 2. 依赖规则

每个工具库都有特定的检测规则：

| 工具库 | 检测特征 | 说明 |
|--------|---------|------|
| `jQuery_v3.js` | `$(`、`jQuery`、`.ajax(`、`.each(`、`.on(` | jQuery DOM 操作 |
| `aes.js` | `AES`、`aesEncrypt`、`aesDecrypt`、`Encrypt(`、`Decrypt(` | AES 加密 |
| `md5.js` | `MD5`、`md5(`、`hex_md5` | MD5 哈希 |
| `config.js` | `CONFIG`、`getConfig(`、`config.` | 配置管理 |
| `i18n.js` | `i18n`、`i18n.t(`、`$t(` | 国际化 |
| `sapi.js` | `sapi`、`sapi.request(`、`createSuperAPI(`、`superAPI.request(`、`window.superAPI` | API 调用 |
| `wsapi.js` | `wsapi`、`wsapi.connect(`、`wsapi.send(`、`wsapi.on(` | WebSocket |
| `fileapi.js` | `fileapi`、`fileapi.upload(`、`fileapi.download(` | 文件上传下载 |
| `page.js` | `Page(`、`this.setData(`、`getCurrentPages(` | Page 函数（必需）|
| `qrcode.js` | `QRCode`、`new QRCode(` | 二维码生成 |
| `reactive.js` | `$reactive(`、`.observe(`、`.computed(` | 响应式系统 |
| `sxml.parser.js` | （已弃用） | 早期的运行时解析器，现所有指令均在编译期处理 |

### 3. 依赖链

某些模块依赖其他模块，系统会自动添加间接依赖：

```
sapi.js → aes.js, md5.js, config.js
wsapi.js → config.js
fileapi.js → config.js
i18n.js → config.js
config.js → api-sign-map.js
```

**示例**：如果页面使用了 `sapi.js`，编译器会自动引入 `aes.js`、`md5.js`、`config.js` 和 `api-sign-map.js`。

### 4. 核心依赖

以下模块是**核心依赖**，所有页面都会引入：

- `api-sign-map.js` - API 签名映射（config.js 需要）
- `config.js` - 配置系统
- `page.js` - Page() 函数
- `onload.js` - 页面加载器
- `page.loader.js` - 页面加载脚本

---

## 加载顺序

依赖按以下顺序加载（确保正确的依赖关系）：

```html
1. jQuery_v3.js      <!-- 基础库 -->
2. aes.js            <!-- 加密库 -->
3. md5.js            <!-- 哈希库 -->
4. api-sign-map.js   <!-- API 签名映射（必须在 config.js 之前）-->
5. config.js         <!-- 配置系统 -->
6. i18n.js           <!-- 国际化 -->
7. sapi.js           <!-- API 调用 -->
8. wsapi.js          <!-- WebSocket -->
9. fileapi.js        <!-- 文件 API -->
10. page.js          <!-- Page 函数 -->
11. onload.js        <!-- 页面加载器 -->
12. qrcode.js        <!-- 二维码 -->
13. reactive.js      <!-- 响应式 -->
14. sxml.parser.js   <!-- 已弃用：不再在浏览器加载 -->
```

---

## 实际案例

### 案例 1：简单导航页面（demoNav）

**代码特征**：
- 只有简单的 Page() 调用
- 没有使用任何高级功能

**检测到的依赖**：
```
✅ api-sign-map.js
✅ config.js
✅ page.js
✅ onload.js
```

**引入脚本数量**：4 个（最精简）

---

### 案例 2：登录页面（login）

**代码特征**：
```javascript
// 使用 jQuery
$("#username").val()

// 使用 i18n
i18n.t('login.title')

// 使用 QRCode
new QRCode(...)
```

**检测到的依赖**：
```
✅ jQuery_v3.js
✅ api-sign-map.js
✅ config.js
✅ i18n.js
✅ page.js
✅ onload.js
✅ qrcode.js
```

**引入脚本数量**：7 个

---

### 案例 3：用户信息页面（myInfo）

**代码特征**：
```xml
<!-- SXML 模板中使用运行时 s:for 指令 -->
<view s:for="{{items}}" s:for-item="item">
  {{item.name}}
</view>
```

**检测到的依赖**：
```
✅ api-sign-map.js
✅ config.js
✅ page.js
✅ onload.js
❌ sxml.parser.js  （已弃用，改为编译期处理）
```

**引入脚本数量**：5 个

---

### 案例 4：完整功能页面（假设）

**代码特征**：
```javascript
// 使用 jQuery
$("#username").val()

// 使用 i18n
i18n.t('login.title')

// 使用 SuperAPI（sapi.js 提供）
window.superAPI = createSuperAPI();
const data = await window.superAPI.request('I00002', { ... });

// 使用加密函数（aes.js 提供）
const cipher = await Encrypt(key, password, iv);
const plain = await Decrypt(cipher, password, iv);

// 使用 MD5（md5.js 提供）
const hash = hex_md5_utf(username + password);

// 使用 QRCode
new QRCode(...)
```

**检测到的依赖**：
```
✅ jQuery_v3.js
✅ aes.js         （检测到 Encrypt/Decrypt）
✅ md5.js         （检测到 hex_md5_utf）
✅ api-sign-map.js（sapi 依赖链）
✅ config.js      （sapi 依赖链）
✅ i18n.js
✅ sapi.js        （检测到 createSuperAPI 和 superAPI.request）
✅ page.js
✅ onload.js
✅ qrcode.js
```

**引入脚本数量**：10 个

这正是 **login 页面的实际依赖**！

---

## 性能优化效果

### 对比：旧系统 vs 智能依赖

#### 旧系统（全量引入）
```html
<!-- 所有页面都引入 14 个脚本 -->
<script src="../../utils/jQuery_v3.js"></script>
<script src="../../utils/aes.js"></script>
<script src="../../utils/md5.js"></script>
<script src="../../config/api-sign-map.js"></script>
<script src="../../utils/config.js"></script>
<script src="../../utils/i18n.js"></script>
<script src="../../utils/sapi.js"></script>
<script src="../../utils/wsapi.js"></script>
<script src="../../utils/fileapi.js"></script>
<script src="../../utils/page.js"></script>
<script src="../../utils/onload.js"></script>
<script src="../../utils/qrcode.js"></script>
<script src="../../utils/reactive.js"></script>
<!-- sxml.parser.js 不再需要 -->
```

#### 新系统（按需引入）
```html
<!-- 简单页面只引入 4 个脚本 -->
<script src="../../config/api-sign-map.js"></script>
<script src="../../utils/config.js"></script>
<script src="../../utils/page.js"></script>
<script src="../../utils/onload.js"></script>
```

### 性能提升

| 页面类型 | 旧系统脚本数 | 新系统脚本数 | 减少比例 |
|---------|------------|------------|---------|
| 简单页面 | 14 | 4 | **71%** ⬇️ |
| 登录页面 | 14 | 7 | **50%** ⬇️ |
| 中等页面 | 14 | 5-8 | **43-64%** ⬇️ |
| 复杂页面 | 14 | 11-12 | **14-21%** ⬇️ |

**估算加载时间节省**（基于 3G 网络）：
- 简单页面：减少约 10 个脚本 × 50KB ≈ **500KB** ⬇️ ≈ **5 秒** ⏱️
- 登录页面：减少约 7 个脚本 × 50KB ≈ **350KB** ⬇️ ≈ **3.5 秒** ⏱️

---

## 编译输出

编译时会显示检测到的依赖：

```bash
📦 开始编译: login.sxml
📊 检测到依赖: jQuery_v3.js, api-sign-map.js, config.js, i18n.js, page.js, onload.js, qrcode.js
✅ 编译完成: login.html
```

---

## 注意事项

### ⚠️ 动态引入限制

智能依赖系统基于**静态代码分析**，无法检测运行时动态引入的代码：

```javascript
// ❌ 无法检测（运行时 eval）
eval('sapi.get("I00017")');

// ❌ 无法检测（动态字符串拼接）
const apiName = 'sapi';
window[apiName].get('I00017');

// ✅ 可以检测（静态代码）
sapi.get('I00017');
```

**解决方案**：如果页面确实需要某个模块但未被检测到，可以在代码中添加占位注释：

```javascript
// 强制引入 sapi.js
// @require sapi
```

### ⚠️ 注释污染

系统会忽略注释中的关键字（避免误检测）：

```javascript
// 使用 SAPI 调用接口  ← 不会触发检测
// sapi.get('I00017')  ← 不会触发检测

sapi.get('I00017');   // ✅ 会触发检测
```

### ⚠️ 核心依赖不可移除

以下模块是核心依赖，无法通过代码优化移除：
- `api-sign-map.js`
- `config.js`
- `page.js`
- `onload.js`

---

## 扩展自定义规则

如需添加新的依赖检测规则，编辑 `utils/sxml.compiler.js` 中的 `dependencyRules`：

```javascript
const dependencyRules = {
  'your-module.js': [
    /yourFunction\(/,
    /\bYOUR_GLOBAL\b/,
    /\.yourMethod\(/
  ]
};
```

同时配置依赖链：

```javascript
const dependencyChains = {
  'your-module.js': ['config.js', 'other-dependency.js']
};
```

---

## 总结

智能依赖系统通过**自动化代码分析**，实现了：

✅ **性能优化** - 减少 43-71% 的脚本加载量  
✅ **自动化** - 无需手动管理依赖，编译时自动处理  
✅ **安全性** - 依赖链自动补全，避免遗漏间接依赖  
✅ **可维护性** - 集中管理依赖规则，易于扩展  
✅ **开发体验** - 开发者专注业务逻辑，无需关心依赖管理  

**开发者**: King, Rainbow Haruko
