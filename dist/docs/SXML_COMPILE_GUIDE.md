# SXML 预编译方案使用指南

## 方案概述

方案2通过**预编译**将SXML模板在构建时转换为纯HTML，完全消除运行时延迟和源代码中的模板标签。

## 优势对比

### 方案1（CSS隐藏）
- ✅ 实现简单，无需构建步骤
- ❌ 源代码中仍有 `{{hh}}`
- ❌ SEO不友好
- ❌ 仍需运行时解析

### 方案2（预编译）⭐
- ✅ 零延迟渲染
- ✅ 源代码中无模板标签
- ✅ SEO友好
- ✅ 性能最佳
- ✅ 支持静态部署

## 使用方法

### 1. 开发模式（实时编译）

```bash
# 启动开发服务器
node dev-server-sxml.js

# 或使用 npm
npm run dev
```

访问: http://localhost:3000

**特性:**
- 🔥 访问页面时实时编译 SXML
- 🚀 零延迟显示
- 🔍 源代码中无 `{{hh}}`
- 📝 修改文件后刷新即可看到效果

### 2. 生产构建

```bash
# 构建所有页面
node build.js

# 或使用 npm
npm run build
```

**输出:**
```
ICE后台/
├── dist/                    # 构建输出目录
│   ├── login/
│   │   ├── login.html      # 已编译的 HTML（无模板标签）
│   │   ├── login.css
│   │   ├── login.js
│   │   └── login.json
│   └── myInfo/
│       └── ...
```

### 3. 工作原理

#### 编译前 (login.html)
```html
<text class="T1">ICE Markets<br />DEX Management entrance{{hh}}</text>
```

#### 编译后 (dist/login/login.html)
```html
<!-- SXML Compiled at 2025-11-01T12:34:56.789Z -->
<text class="T1">ICE Markets<br />DEX Management entrance你好</text>
```

## 核心文件说明

### utils/sxml.compiler.js
SXML预编译器核心，支持：
- ✅ `{{expression}}` 数据绑定
- ✅ `s-if` 条件渲染
- ✅ `s:show`（等效 v-show）显示/隐藏，编译期计算表达式，为假时注入 `display:none`
- ✅ `s-for` 列表渲染

### dev-server-sxml.js
开发服务器：
- 实时编译 SXML
- HTTP 文件服务
- 错误提示

### build.js
生产构建脚本：
- 批量编译所有页面
- 复制资源文件
- 生成到 dist 目录

## 编译规则

### 1. 数据绑定
```html
<!-- 编译前 -->
<text>{{hh}}</text>

<!-- 编译后（从 login.js 的 data 提取） -->
<text>你好</text>
```

### 2. 条件渲染
```html
<!-- 编译前 -->
<view s-if="keyStatus">显示内容</view>

<!-- 编译后（如果 keyStatus = true） -->
<view>显示内容</view>

<!-- 编译后（如果 keyStatus = false） -->
（整个元素被移除）
```

### 3. 显示控制
```html
<!-- 编译前 -->
<view s:show="codeStatus">内容</view>
<!-- 编译后：codeStatus 为假时为该元素添加 style="display:none" -->

<!-- 编译后（如果 codeStatus = false） -->
<view style="display:none;">内容</view>
```

### 4. 列表渲染
```html
<!-- 编译前 -->
<view s-for="item in list">{{item}}</view>

<!-- 编译后（假设 list = ['A', 'B', 'C']） -->
<view>A</view>
<view>B</view>
<view>C</view>
```

## 数据提取

编译器从 `login.js` 的 `Page({ data: {...} })` 中提取初始数据：

```javascript
Page({
  data: {
    hh: '你好',           // ✅ 支持字符串
    count: 0,            // ✅ 支持数字
    visible: true,       // ✅ 支持布尔值
    items: ['a', 'b']    // ✅ 支持数组
  }
});
```

## 部署方案

### 静态部署
```bash
# 1. 构建
npm run build

# 2. 部署 dist 目录到服务器
# - Nginx
# - Apache
# - GitHub Pages
# - Vercel
```

### 动态服务
```bash
# 开发/测试环境使用实时编译
npm run dev
```

## 注意事项

### ✅ 支持的特性
- 简单表达式: `{{name}}`, `{{count + 1}}`
- 条件: `s-if="visible"`
- 列表: `s-for="item in list"`

### ⚠️ 限制
- 不支持复杂的JS表达式（如函数调用）
- 不支持动态数据更新（需要重新编译）
- `setData()` 需要在运行时处理

### 💡 建议
- **开发**: 使用 `npm run dev` 实时编译
- **生产**: 使用 `npm run build` 生成静态文件
- **混合**: 静态内容预编译，动态内容运行时处理

## 与方案1的切换

### 使用预编译（方案2）
```bash
npm run dev  # 开发
npm run build  # 生产
```

### 回退到运行时解析（方案1）
直接用浏览器打开 `pages/login/login.html`，会自动使用 SXML 运行时解析器。

## 性能对比

| 指标 | 方案1 (运行时) | 方案2 (预编译) |
|------|----------------|----------------|
| 首屏渲染 | ~100-200ms | ~0ms |
| 源代码 | 含模板标签 | 纯HTML |
| SEO | 较差 | 优秀 |
| 动态更新 | 支持 | 需重新编译 |
| 部署 | 任意服务器 | 任意服务器 |

## 常见问题

**Q: 修改数据后需要重新编译吗？**
A: 开发模式下刷新页面即可；生产模式需要运行 `npm run build`。

**Q: 可以混合使用两种方案吗？**
A: 可以。预编译处理静态内容，运行时处理动态内容。

**Q: 构建后的文件可以直接用浏览器打开吗？**
A: 可以，但建议通过HTTP服务器访问以避免CORS问题。

## 下一步

1. ✅ 已创建编译器和开发服务器
2. 🔄 运行 `node dev-server-sxml.js` 测试
3. 🎯 根据需求选择部署方案
