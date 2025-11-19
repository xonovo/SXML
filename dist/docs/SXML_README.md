# SXML (Super XML) 使用指南

> 重要提示（语法与架构更新）
>
> - 指令统一采用冒号语法：`s:if`、`s:show`、`s:for`（替代早期文档中的 `s-if/s-show/s-for`）。
> - 指令条件支持两种写法：可用 `{{ }}` 包裹，也可直接写表达式（编译器会自动兼容并去壳）。例如：
>   - `s:if="isLogin"` 或 `s:if="{{ isLogin }}"`
>   - `s:show="score >= 60"` 或 `s:show="{{ score >= 60 }}"`
> - 所有 SXML 指令均在“编译期”处理，浏览器端不再加载 `sxml.parser.js`。
>
> 文档中的部分示例可能仍保留旧写法，请以以上规则为准。

SXML 是声明式模板语法，让你可以使用声明式的方式编写页面结构。

## 📦 快速开始

### 1. 运行方式（预编译）

开发阶段由开发服务器实时编译（`dev-server-sxml.js`），构建阶段由 `build.js` 预编译为纯 HTML。
浏览器只需加载 `page.loader.js`（页面生命周期与入口），无需加载 `sxml.parser.js`。

编译器会自动按页面依赖注入脚本（如 `utils/config.js`、`utils/i18n.js`）、并注入对应环境的配置脚本：

```html
<!-- 由编译器自动注入，示例（生产环境）-->
<script src="../../config/app.config.prod.js"></script>
<script>window.APP_CONFIG_URL = '../../config/app.config.prod.js';</script>
<script src="../../utils/config.js"></script>
<script src="../../utils/page.loader.js"></script>
```

### 2. 创建 .sxml 文件

将原来的 HTML 内容改写为 SXML 格式，保存为 `.sxml` 文件。

### 3. Page() 自动解析

使用 `Page()` 定义的页面会自动在 `onReady` 时解析 SXML。

---

## 🎯 核心功能

### 1. 数据绑定 `{{ }}`

双花括号绑定 page.data 中的数据：

```xml
<view class="username">Hello, {{userName}}</view>
<view class="score">Score: {{user.score}}</view>
```

```javascript
Page({
  data: {
    userName: 'Alice',
    user: {
      score: 95
    }
  }
});
```

---

### 2. 条件渲染

#### `s-if` - 条件为真时渲染元素

```xml
<view s-if="isLogin">Welcome back!</view>
<view s-if="score >= 60">Pass</view>
<view s-if="userType === 'admin'">Admin Panel</view>
```

#### `s:show` - 控制显示/隐藏 (v-show 等效)

```xml
<view s:show="loading">Loading...</view>
<button s:show="!disabled">Submit</button>
```

**编译期语义：**
- `s:if` 控制是否渲染到 DOM（不满足条件时完全移除）。
- `s:show` 等效于 Vue 的 `v-show`：编译期计算表达式，条件为假时为元素增加 `style="display:none"`，条件为真时移除该属性。
- 真值规则：`undefined`/`null`/空字符串/`0`/`false` 视为假，其余视为真。

---

### 3. 列表渲染 `s-for`

#### 基本用法

```xml
<view s-for="item in list">
  <text>{{item.name}}</text>
</view>
```

#### 带索引

```xml
<view s-for="item in products" s-for-index="idx">
  <text>{{idx + 1}}. {{item.name}} - ${{item.price}}</text>
</view>
```

#### 指定 key（推荐，提升性能）

```xml
<view s-for="user in userList" s-for-key="id">
  <text>{{user.name}}</text>
</view>
```

**JS 代码：**

```javascript
Page({
  data: {
    products: [
      { id: 1, name: 'Apple', price: 5 },
      { id: 2, name: 'Banana', price: 3 },
      { id: 3, name: 'Orange', price: 4 }
    ]
  }
});
```

---

### 4. 属性绑定

#### `s-bind:attr` 或 `:attr` 简写

```xml
<!-- 完整写法 -->
<image s-bind:src="avatarUrl" />
<view s-bind:class="activeClass" />

<!-- 简写 -->
<image :src="avatarUrl" />
<view :class="activeClass" />
<input :placeholder="inputHint" :maxlength="maxLen" />
```

**示例：**

```xml
<button :disabled="loading" :class="btnClass">
  {{loading ? 'Loading...' : 'Submit'}}
</button>
```

```javascript
Page({
  data: {
    loading: false,
    btnClass: 'btn-primary'
  }
});
```

---

### 5. 事件绑定

#### `bind:event` - 普通事件绑定（冒泡）

```xml
<button bind:tap="handleLogin">Login</button>
<input bind:input="handleInput" bind:blur="handleBlur" />
<view bind:touchstart="handleTouchStart">Touch me</view>
```

#### `catch:event` - 阻止冒泡

```xml
<view bind:tap="handleOuter">
  <button catch:tap="handleInner">Click</button>
</view>
```

点击 button 只触发 `handleInner`，不会触发 `handleOuter`。

---

### 6. 事件名称映射

SXML 自动将框架事件名转换为 Web 事件：

| SXML 事件 | Web 事件 | 说明 |
|-----------|----------|------|
| `tap` | `click` | 点击 |
| `input` | `input` | 输入 |
| `change` | `change` | 值改变 |
| `focus` | `focus` | 获得焦点 |
| `blur` | `blur` | 失去焦点 |
| `touchstart` | `touchstart` | 触摸开始 |
| `touchmove` | `touchmove` | 触摸移动 |
| `touchend` | `touchend` | 触摸结束 |
| `longtap` | `contextmenu` | 长按 |
| `submit` | `submit` | 表单提交 |

---

## 🌟 完整示例

### login.sxml

```xml
<view class="login-page">
  <view class="header">
    <image src="{{logo}}" mode="aspectFit" />
    <text class="title">{{appName}}</text>
  </view>
  
  <!-- 账号密码登录 -->
  <view s:show="!qrMode" class="form">
    <input 
      type="text" 
      :placeholder="mobilePlaceholder"
      bind:input="handleMobileInput"
      bind:blur="handleMobileBlur"
    />
    
    <input 
      type="password" 
      placeholder="请输入密码"
      bind:input="handlePasswordInput"
    />
    
    <button 
      bind:tap="handleLogin" 
      :disabled="!canSubmit"
      :class="submitBtnClass"
    >
      {{loading ? '登录中...' : '登录'}}
    </button>
  </view>
  
  <!-- 二维码登录 -->
  <view s-if="qrMode" class="qr-container">
    <view id="qrcode"></view>
    <text>请使用手机扫码登录</text>
  </view>
  
  <!-- 切换登录方式 -->
  <view class="switch-mode" bind:tap="handleSwitchMode">
    <text>{{qrMode ? '账号密码登录' : '扫码登录'}}</text>
  </view>
  
  <!-- 错误提示 -->
  <view s-if="errorMsg" class="error">{{errorMsg}}</view>
</view>
```

### login.js

```javascript
Page({
  data: {
    logo: '../../images/logo.png',
    appName: 'ICE Markets',
    mobilePlaceholder: '请输入手机号',
    qrMode: false,
    loading: false,
    canSubmit: false,
    submitBtnClass: 'btn-disabled',
    errorMsg: '',
    mobile: '',
    password: ''
  },
  
  onLoad() {
    console.log('Login page loaded');
  },
  
  handleMobileInput(e) {
    this.data.mobile = e.target.value;
    this.updateSubmitState();
  },
  
  handlePasswordInput(e) {
    this.data.password = e.target.value;
    this.updateSubmitState();
  },
  
  updateSubmitState() {
    const canSubmit = this.data.mobile.length === 11 && this.data.password.length >= 6;
    this.setData({
      canSubmit,
      submitBtnClass: canSubmit ? 'btn-primary' : 'btn-disabled'
    });
  },
  
  async handleLogin() {
    if (!this.data.canSubmit) return;
    
    this.setData({ loading: true, errorMsg: '' });
    
    try {
      // 调用登录接口
      const result = await this.loginAPI();
      wx.navigateTo({ url: '/pages/home/home' });
    } catch (error) {
      this.setData({ errorMsg: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  
  handleSwitchMode() {
    this.setData({ qrMode: !this.data.qrMode });
  }
});
```

---

## 🔧 高级用法

### 1. 嵌套数据绑定

```xml
<view>{{user.profile.name}}</view>
<view>{{products[0].title}}</view>
```

### 2. 表达式计算

```xml
<view>{{price * quantity}}</view>
<view>{{score >= 60 ? 'Pass' : 'Fail'}}</view>
<view>{{userName.toUpperCase()}}</view>
```

### 3. 组合使用

```xml
<view s-for="item in list" s-for-index="idx">
  <view s-if="item.visible">
    <text :class="item.active ? 'active' : ''">
      {{idx + 1}}. {{item.name}}
    </text>
    <button bind:tap="handleDelete" data-id="{{item.id}}">
      Delete
    </button>
  </view>
</view>
```

---

## 📌 注意事项

1. **SXML 标签**：推荐使用 `<view>`, `<text>`, `<image>` 等声明式标签，也支持标准 HTML 标签
   
2. **数据更新**：修改 `data` 后需要调用 `setData()` 触发视图更新：
   ```javascript
   // ❌ 错误：不会触发更新
   this.data.count = 10;
   
   // ✅ 正确：触发视图更新
   this.setData({ count: 10 });
   ```

3. **事件处理器**：必须在 Page() 对象中定义，不能使用全局函数

4. **性能优化**：
   - `s-for` 时指定 `s-for-key` 提升渲染性能
   - 大列表避免使用复杂表达式
   - 使用 `s-show` 代替频繁切换的 `s-if`

5. **CSS 兼容**：SXML 仅处理模板，样式依然使用普通 CSS

---

## 🚀 迁移指南

### 从 HTML 迁移到 SXML

**原 HTML:**
```html
<div class="user" id="user-{{userId}}">
  <img src="{{avatar}}" onclick="currentPage.handleClick()" />
  <span>{{userName}}</span>
</div>
```

**SXML:**
```xml
<view class="user" :id="'user-' + userId">
  <image :src="avatar" bind:tap="handleClick" />
  <text>{{userName}}</text>
</view>
```

**主要改动：**
- `<div>` → `<view>`
- `<img>` → `<image>`
- `<span>` → `<text>`
- `onclick="currentPage.xxx()"` → `bind:tap="xxx"`
- 动态属性用 `:attr` 或 `s-bind:attr`

---

## 💡 最佳实践

1. **语义化标签**：使用 `<view>`, `<text>`, `<image>` 替代 `<div>`, `<span>`, `<img>`

2. **数据驱动**：所有状态存储在 `data` 中，通过 `setData` 更新

3. **条件渲染优化**：
   - 频繁切换用 `s-show`
   - 大块内容用 `s-if`

4. **列表 key**：为列表项指定唯一 key，避免不必要的重渲染

5. **事件委托**：对于大量相同元素，使用事件委托减少监听器数量

---

## 🆚 语法对照表

| 特性 | 传统 HTML | SXML |
|------|----------------|------|
| 条件渲染 | `v-if` (Vue) | `s:if` |
| 显示隐藏 | `v-show` (Vue) | `s:show` |
| 列表渲染 | `v-for` (Vue) | `s:for`, `s:for-key` |
| 属性绑定 | `:属性` (Vue) | `:属性="value"` 或 `s:bind:属性` |
| 事件绑定 | `@click` (Vue) | `bind:tap`, `bind:click` |
| 数据绑定 | `{{expression}}` | 相同 |

**主要特性：**
- 声明式指令：`s:` 前缀
- 属性绑定支持 `:attr` 简写
- 运行环境：现代 Web 浏览器

---

## 🎓 示例项目

查看 `pages/login/login.sxml` 获取完整示例。

开始使用 SXML，享受声明式开发的乐趣！🎉
