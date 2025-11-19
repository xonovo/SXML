# 使用 .sxml 文件开发指南

## 🎯 核心概念

使用 `.sxml` 文件作为**纯模板**，完全分离模板和输出HTML，实现真正的"所见即所得"开发体验。

## 📁 文件结构

### 方式1：使用 .sxml 文件（推荐）⭐

```
pages/
  login/
    ├── login.sxml     # SXML 模板文件（源文件）
    ├── login.js       # 页面逻辑
    ├── login.css      # 页面样式
    └── login.json     # 页面配置
```

### 方式2：使用 .html 文件

```
pages/
  login/
    ├── login.html     # HTML 模板文件
    ├── login.js       # 页面逻辑
    ├── login.css      # 页面样式
    └── login.json     # 页面配置
```

## 🔄 工作流程

### 开发模式（实时编译）

1. **创建 .sxml 模板文件**
   ```bash
   pages/login/login.sxml  # 包含 {{hh}} 等 SXML 语法
   ```

2. **启动开发服务器**
   ```bash
   node dev-server-sxml.js
   # 或
   npm run dev
   ```

3. **访问页面**
   ```
   http://localhost:3000
   ```

4. **自动处理**
   - 服务器检测到 `login.sxml` 存在 → 使用它
   - 如果没有 `login.sxml` → 回退使用 `login.html`
   - 实时编译 SXML → 输出纯 HTML
   - 浏览器接收的是**已编译的 HTML**（无模板标签）

### 生产构建

```bash
node build.js
# 或
npm run build
```

**输出:**
```
dist/
  login/
    ├── login.html   # 从 login.sxml 编译生成（纯HTML）
    ├── login.css    # 复制
    ├── login.js     # 复制
    └── login.json   # 复制
```

## ✅ 优先级规则

编译器和开发服务器会按以下优先级查找模板：

```
1. pageName.sxml   ← 最优先
2. pageName.html   ← 次选
```

示例日志：
```
📄 使用 SXML 模板: login.sxml  ← 找到 .sxml
📄 使用 HTML 模板: login.html  ← 没有 .sxml，使用 .html
```

## 🎨 .sxml 文件示例

**login.sxml** (纯模板，包含SXML语法):
```html
<!DOCTYPE html>
<html lang="zh-cn">
<head>
    <meta charset="utf-8" />
    <title>ICE Markets</title>
    <link rel="stylesheet" href="../../css/element.css" />
    <script src="../../utils/page.js"></script>
    <script src="../../utils/page.loader.js"></script>
</head>
<body>
    <view class="mainpage">
        <text class="title">欢迎 {{hh}}</text>
        
        <!-- 条件渲染 -->
        <view s-if="keyStatus">已安装密钥</view>
        
        <!-- 列表渲染 -->
        <view s-for="item in list">{{item}}</view>
        
      <!-- 显示控制（编译期计算：为假则注入 display:none，不移除 DOM） -->
   <view s:show="codeStatus">扫码登录</view>
    </view>
</body>
</html>
```

**login.js** (页面逻辑):
```javascript
Page({
  data: {
    hh: '你好',
    keyStatus: false,
    codeStatus: true,
    list: ['项目1', '项目2', '项目3']
  },
  
  onLoad() {
    console.log('页面加载');
  }
});
```

## 🔍 编译效果对比

### 源文件 (login.sxml)
```html
<text>欢迎 {{hh}}</text>
<view s-if="keyStatus">已安装</view>
```

### 编译后 (浏览器接收的HTML)
```html
<!-- SXML Compiled at 2025-11-01T12:34:56.789Z -->
<text>欢迎 你好</text>
<!-- keyStatus=false，整个元素被移除 -->
```

### 查看源代码
- **开发模式**: 看到编译后的HTML ✅
- **生产模式**: 看到编译后的HTML ✅
- **.sxml 源文件**: 保留 {{hh}} 语法 ✅

## 📊 优势总结

| 特性 | .html (运行时) | .sxml (预编译) |
|------|----------------|----------------|
| **模板语法** | ✅ {{hh}} | ✅ {{hh}} |
| **浏览器源码** | ❌ 含模板标签 | ✅ 纯HTML |
| **渲染速度** | 快 | **最快** ⚡ |
| **SEO友好** | 一般 | **优秀** ✅ |
| **开发体验** | 好 | **最佳** ⭐ |
| **文件分离** | 模板=输出 | **模板≠输出** ✅ |

## 🚀 最佳实践

### 1. 开发阶段
- ✅ 使用 `.sxml` 作为模板源文件
- ✅ 运行 `npm run dev` 开发服务器
- ✅ 修改 `.sxml` 后刷新浏览器即可看到效果

### 2. 版本控制
```gitignore
# .gitignore
dist/           # 构建输出不提交
```

**提交到 Git:**
- ✅ `login.sxml` (源模板)
- ✅ `login.js` (逻辑)
- ✅ `login.css` (样式)
- ✅ `login.json` (配置)
- ❌ `dist/` (构建产物)

### 3. 部署流程
```bash
# 1. 开发
npm run dev

# 2. 测试
浏览器访问 http://localhost:3000

# 3. 构建
npm run build

# 4. 部署 dist/ 目录到服务器
```

## 🔧 迁移指南

### 从 .html 迁移到 .sxml

1. **复制文件**
   ```bash
   cp login.html login.sxml
   ```

2. **测试**
   ```bash
   npm run dev
   # 查看日志确认: 📄 使用 SXML 模板: login.sxml
   ```

3. **可选: 清理 login.html**
   - 系统会优先使用 .sxml
   - 保留 .html 作为备份也可以

## 💡 常见问题

**Q: .sxml 和 .html 可以共存吗？**
A: 可以。系统优先使用 `.sxml`，如果不存在则使用 `.html`。

**Q: 必须使用预编译吗？**
A: 推荐并默认使用预编译。早期提供的运行时解析器已弃用，浏览器端不再加载 `sxml.parser.js`。

**Q: 预编译后还需要 sxml.parser.js 吗？**
A: 不需要。所有 `s:*` 指令在编译期处理，浏览器端无需再解析模板，`sxml.parser.js` 已弃用。

**Q: 如何调试 .sxml 编译错误？**
A: 开发服务器会在页面上显示编译错误详情，也会在终端输出日志。

## 📝 命令速查

```bash
# 开发模式（支持 .sxml）
npm run dev

# 生产构建（.sxml → .html）
npm run build

# 查看构建结果
ls dist/login/
```

## 🎯 推荐工作流

```
开发 → 使用 .sxml 文件
     ↓
启动 → npm run dev
     ↓
修改 → 编辑 .sxml
     ↓
测试 → 刷新浏览器（实时编译）
     ↓
构建 → npm run build
     ↓
部署 → 上传 dist/ 目录
```

这就是使用 `.sxml` 文件的完整开发流程！🎉
