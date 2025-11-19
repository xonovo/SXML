# SXML 使用方案说明

## 问题：浏览器无法直接解析 .sxml 文件

SXML 文件本质是 XML 格式，浏览器不会自动解析和渲染它们。

## 💡 解决方案

### 方案一：直接在 HTML 中使用 SXML 语法（推荐）⭐

推荐采用“预编译”方案：在开发/构建阶段将 SXML 转为纯 HTML，浏览器不再加载 `sxml.parser.js`。

#### 示例：

```html
<!DOCTYPE html>
<html lang="zh-cn">
<head>
    <meta charset="utf-8" />
    <title>Login</title>
    <!-- 引入 SXML 解析器 -->
    <!-- 运行时不需要 sxml.parser.js，改为由编译器注入依赖与配置 -->
    <script src="../../utils/page.loader.js"></script>
</head>

<body>
    <!-- 直接使用 SXML 语法 -->
    <view class="container">
        <text class="title">{{appName}}</text>
        
        <view s-if="!qrMode" class="form">
            <input 
                type="text" 
                :placeholder="mobilePlaceholder"
                bind:input="handleMobileInput"
            />
            
            <button bind:tap="handleLogin" :disabled="!canSubmit">
                {{loading ? '登录中...' : '登录'}}
            </button>
        </view>
        
        <view s-if="qrMode" class="qr-code">
            <text>扫码登录</text>
        </view>
    </view>
</body>
</html>
```

**优点：**
- ✅ 浏览器可以直接加载 HTML
- ✅ 使用 SXML 语法，开发体验好
- ✅ 无需额外的文件加载步骤
- ✅ `<view>`, `<text>`, `<image>` 等标签浏览器会当作自定义元素处理

**注意：** 需要在 CSS 中为这些标签设置默认样式：

```css
/* 让 SXML 标签表现得像 HTML 元素 */
view {
    display: block;
}

text {
    display: inline;
}

image {
    display: inline-block;
}
```

---

### 方案二：使用模板容器

如果你希望保留纯 HTML 结构，可以在 HTML 中使用特殊容器存放 SXML 模板。

```html
<body>
    <!-- SXML 模板容器 -->
    <script type="text/sxml" id="page-template">
        <view class="container">
            <text>{{message}}</text>
            <button bind:tap="handleClick">Click</button>
        </view>
    </script>
    
    <!-- 渲染目标容器 -->
    <div id="app"></div>
</body>
```

运行时无需解析模板；模板已在构建时被编译为标准 HTML，依赖脚本由编译器按需注入。

**优点：**
- ✅ HTML 结构清晰
- ✅ 模板和渲染区域分离

**缺点：**
- ❌ 需要额外的模板提取逻辑
- ❌ 开发时无法直接看到页面结构

---

### 方案三：外部 .sxml 文件 + 动态加载

保留独立的 `.sxml` 文件，通过 AJAX 加载并解析。

**login.html:**
```html
<!DOCTYPE html>
<html>
<head>
    <!-- 此处省略 sxml.parser.js -->
    <script src="../../utils/page.loader.js"></script>
</head>
<body id="app">
    <!-- SXML 内容将加载到这里 -->
</body>
</html>
```

**login.sxml:**
```xml
<view class="container">
    <text>{{message}}</text>
</view>
```

`page.loader.js` 会自动检测并加载 `login.sxml`，将内容插入到 `body`。

**优点：**
- ✅ 文件结构清晰（5 个文件：.html, .css, .js, .json, .sxml）
- ✅ 模板独立维护

**缺点：**
- ❌ 需要多一次网络请求
- ❌ 本地开发可能遇到 CORS 问题

---

## 🎯 推荐做法

### 对于简单页面：**方案一** - 直接在 HTML 中使用 SXML 语法

```html
<body>
    <view class="page">
        <text>{{title}}</text>
        <button bind:tap="handleClick">Click</button>
    </view>
</body>
```

### 对于复杂页面：**方案三** - 使用独立 .sxml 文件

更好的代码组织，模板、样式、逻辑完全分离。

---

## 🔧 添加 CSS 基础样式

为了让 SXML 标签正常显示，在全局 CSS 中添加：

```css
/* css/element.css 或全局样式文件 */

/* SXML 标签基础样式 */
view {
    display: block;
}

text {
    display: inline;
}

image {
    display: inline-block;
    max-width: 100%;
}

button {
    display: inline-block;
    cursor: pointer;
}

input {
    display: inline-block;
}

/* 其他自定义标签 */
scroll-view {
    display: block;
    overflow: auto;
}

swiper {
    display: block;
    position: relative;
}
```

---

## 💡 实际应用示例

### login.html（使用方案一）

```html
<!DOCTYPE html>
<html lang="zh-cn">
<head>
    <meta charset="utf-8" />
    <title>ICE Markets Login</title>
    
    <style>
        /* 基础 SXML 标签样式 */
        view { display: block; }
        text { display: inline; }
        image { display: inline-block; }
    </style>
    
    <script src="../../utils/jQuery_v3.js"></script>
    <!-- 此处省略 sxml.parser.js -->
    <script src="../../utils/page.loader.js"></script>
</head>

<body>
    <view class="mainpage">
        <view class="header">
            <image src="../../images/logo1.png" class="logo" />
            <text class="title">ICE Markets</text>
        </view>
        
        <!-- 表单区域 - 非扫码模式显示 -->
    <view s:show="!codeStatus" class="form">
            <input 
                id="u"
                type="tel" 
                :placeholder="mobilePlaceholder"
                bind:input="handleMobileInput"
                bind:blur="handleMobileBlur"
            />
            
            <input 
                id="p"
                type="password" 
                placeholder="请输入密码"
                bind:input="handlePasswordInput"
                bind:keydown="handleLoginKeydown"
            />
            
            <!-- 密钥输入 - 条件显示 -->
            <input 
                s-if="!keyStatus"
                id="k"
                type="password" 
                placeholder="密钥（32位）"
                maxlength="32"
            />
            
            <button bind:tap="handleLogin" :disabled="!canSubmit">
                {{loading ? '登录中...' : '登录'}}
            </button>
        </view>
        
        <!-- 二维码区域 -->
        <view s-if="codeStatus" class="qr-container">
            <view id="canvasId"></view>
            <text>请使用手机扫码登录</text>
        </view>
        
        <!-- 切换登录方式 -->
        <view s-if="keyStatus" class="switch-mode">
            <image 
                src="../../images/witeCode.png" 
                bind:tap="handleSwitchMode"
            />
        </view>
    </view>
</body>
</html>
```

### login.js

```javascript
Page({
  data: {
    mobilePlaceholder: '请输入手机号',
    codeStatus: false,
    keyStatus: false,
    loading: false,
    canSubmit: false,
    mobile: '',
    password: ''
  },
  
  onLoad() {
    this.getConfig();
  },
  
  handleMobileInput(e) {
    this.setData({ 
      mobile: e.target.value,
      canSubmit: e.target.value.length === 11 && this.data.password.length >= 6
    });
  },
  
  handlePasswordInput(e) {
    this.setData({ 
      password: e.target.value,
      canSubmit: this.data.mobile.length === 11 && e.target.value.length >= 6
    });
  },
  
  async handleLogin() {
    if (!this.data.canSubmit) return;
    
    this.setData({ loading: true });
    
    try {
      await this.loginAPI();
      wx.navigateTo({ url: '/pages/home/home' });
    } catch (error) {
      ShowToast(error.message);
    } finally {
      this.setData({ loading: false });
    }
  },
  
  handleSwitchMode() {
    this.setData({ codeStatus: !this.data.codeStatus });
  }
});
```

---

## ✅ 结论

**推荐使用方案一**：直接在 HTML 的 `<body>` 中使用 SXML 语法。

这样既能享受 SXML 的便利性，又不需要额外的文件加载，浏览器可以直接解析 HTML，SXML 解析器在运行时处理数据绑定和指令。

记得在全局 CSS 中添加 SXML 标签的基础样式！
