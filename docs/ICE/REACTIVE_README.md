# 🚀 响应式数据系统文档

## 简介

这是一个基于 **ES6 Proxy** 的轻量级响应式数据系统，灵感来源于 Vue 3 的响应式原理。当数据发生变化时，视图会自动更新，无需手动操作 DOM。

### 特性

✅ **自动依赖收集** - 访问的数据会被自动追踪  
✅ **双向数据绑定** - v-model 实现表单与数据同步  
✅ **计算属性** - 基于响应式数据的派生值  
✅ **条件渲染** - v-if、v-show 控制 DOM 显示  
✅ **零依赖** - 纯原生 JavaScript 实现  
✅ **轻量级** - 核心代码不到 10KB  

---

## 快速开始

### 1. 引入脚本

```html
<script src="./utils/reactive.js"></script>
<script src="./utils/bind.js"></script>
```

### 2. 创建应用

```javascript
const app = Bind.createApp({
  el: '#app',
  
  data: {
    message: 'Hello World',
    count: 0
  },
  
  methods: {
    increment() {
      this.state.count++;
    }
  }
});
```

### 3. 在 HTML 中使用指令

```html
<div id="app">
  <input v-model="message" />
  <p v-text="message"></p>
  
  <button onclick="app.methods.increment()">点击</button>
  <p>计数: <span v-text="count"></span></p>
</div>
```

---

## 核心 API

### reactive(obj)

将普通对象转换为响应式对象。

```javascript
const state = Reactive.reactive({
  user: {
    name: 'Alice',
    age: 25
  }
});

// 修改数据会自动触发依赖更新
state.user.name = 'Bob';
```

### watch(fn, options)

监听数据变化并执行回调。

```javascript
Reactive.watch(() => {
  console.log('用户名:', app.state.user.name);
});

// 修改数据时会自动打印
app.state.user.name = 'Charlie';
```

**选项：**
- `immediate`: 是否立即执行（默认 `true`）
- `scheduler`: 自定义调度器（用于批量更新）

### computed(getter)

创建计算属性。

```javascript
const fullName = Reactive.computed(() => {
  return `${state.firstName} ${state.lastName}`;
});

console.log(fullName.value); // 自动计算
```

---

## 指令系统

### v-model - 双向绑定

适用于表单输入元素，实现数据与视图的同步。

```html
<!-- 文本输入 -->
<input type="text" v-model="user.name" />

<!-- 复选框 -->
<input type="checkbox" v-model="ui.isChecked" />

<!-- 数字输入 -->
<input type="number" v-model="order.quantity" />
```

### v-text - 文本内容

将数据渲染为元素的文本内容。

```html
<p v-text="message"></p>
<!-- 等价于 -->
<p>{{ message }}</p>
```

### v-html - HTML 内容

将数据作为 HTML 渲染（⚠️ 注意 XSS 风险）。

```html
<div v-html="htmlContent"></div>
```

### v-show - 显示/隐藏

通过 CSS `display` 控制元素显示。

```html
<div v-show="isVisible">
  这段内容可以显示/隐藏
</div>
```

### v-if - 条件渲染

根据条件添加/移除 DOM 元素。

```html
<div v-if="user.isVip">
  VIP 专属内容
</div>
```

### v-class - 动态类名

```html
<!-- 对象语法 -->
<div v-class="{ active: isActive, disabled: isDisabled }"></div>

<!-- 字符串 -->
<div v-class="className"></div>
```

### v-style - 动态样式

```html
<div v-style="{ color: textColor, fontSize: fontSize + 'px' }"></div>
```

---

## 完整示例

### 登录表单

```html
<!DOCTYPE html>
<html>
<head>
  <script src="./utils/reactive.js"></script>
  <script src="./utils/bind.js"></script>
</head>
<body>
  <div id="app">
    <h1>用户登录</h1>
    
    <input v-model="form.username" placeholder="用户名" />
    <input v-model="form.password" type="password" placeholder="密码" />
    
    <div v-show="form.remember">
      <input type="checkbox" v-model="form.remember" />
      记住密码
    </div>
    
    <button onclick="app.methods.login()">登录</button>
    
    <div v-if="message.show" v-class="{ error: message.type === 'error' }">
      <p v-text="message.text"></p>
    </div>
  </div>

  <script>
    const app = Bind.createApp({
      el: '#app',
      
      data: {
        form: {
          username: '',
          password: '',
          remember: false
        },
        message: {
          show: false,
          text: '',
          type: 'info'
        }
      },
      
      methods: {
        async login() {
          if (!this.state.form.username || !this.state.form.password) {
            this.state.message.show = true;
            this.state.message.text = '请填写完整信息';
            this.state.message.type = 'error';
            return;
          }
          
          // 发送登录请求...
          console.log('登录中...', this.state.form);
        }
      }
    });
  </script>
</body>
</html>
```

---

## 在现有项目中使用

### 改造登录页面

**原始代码（手动 DOM 操作）：**

```javascript
function updateUI() {
  document.getElementById('username').value = user.name;
  document.getElementById('status').textContent = user.status;
  document.getElementById('vipBadge').style.display = user.isVip ? 'block' : 'none';
}
```

**响应式版本：**

```html
<!-- HTML -->
<input id="username" v-model="user.name" />
<span id="status" v-text="user.status"></span>
<span id="vipBadge" v-show="user.isVip">VIP</span>
```

```javascript
// JavaScript
const app = Bind.createApp({
  el: '#loginPage',
  data: {
    user: {
      name: '',
      status: 'offline',
      isVip: false
    }
  }
});

// 修改数据即可，视图自动更新
app.state.user.name = 'Alice';
app.state.user.isVip = true;
```

---

## 计算属性示例

```javascript
const app = Bind.createApp({
  el: '#app',
  
  data: {
    firstName: 'John',
    lastName: 'Doe',
    items: [
      { name: '商品A', price: 100, quantity: 2 },
      { name: '商品B', price: 50, quantity: 3 }
    ]
  },
  
  computed: {
    // 全名
    fullName: function() {
      return `${this.state.firstName} ${this.state.lastName}`;
    },
    
    // 购物车总价
    totalPrice: function() {
      return this.state.items.reduce((sum, item) => {
        return sum + item.price * item.quantity;
      }, 0);
    }
  }
});
```

在 HTML 中使用：

```html
<p>欢迎, <span v-text="fullName"></span>!</p>
<p>总价: ¥<span v-text="totalPrice"></span></p>
```

---

## 高级用法

### 监听数据变化

```javascript
// 监听单个属性
Reactive.watch(() => {
  console.log('用户名变化:', app.state.user.name);
});

// 监听多个属性
Reactive.watch(() => {
  const { username, password } = app.state.form;
  console.log('表单变化:', username, password);
});
```

### 批量更新（防抖）

```javascript
const scheduler = Reactive.createScheduler();

Reactive.watch(() => {
  console.log('批量更新:', app.state.list);
}, { scheduler });

// 连续修改只会触发一次更新
app.state.list.push(1);
app.state.list.push(2);
app.state.list.push(3);
// 输出: 批量更新: [1, 2, 3]
```

### 手动停止监听

```javascript
const stop = Reactive.watch(() => {
  console.log(app.state.count);
});

// 不再需要监听时
stop();
```

---

## 性能优化建议

### 1. 避免深层嵌套

```javascript
// ❌ 不推荐
const state = reactive({
  level1: {
    level2: {
      level3: {
        level4: {
          data: 'value'
        }
      }
    }
  }
});

// ✅ 推荐
const state = reactive({
  data: 'value',
  metadata: { ... }
});
```

### 2. 使用计算属性缓存

```javascript
// ❌ 每次访问都重新计算
<span v-text="items.filter(i => i.done).length"></span>

// ✅ 使用计算属性，只在依赖变化时重新计算
computed: {
  doneCount: function() {
    return this.state.items.filter(i => i.done).length;
  }
}
```

### 3. 大列表优化

对于超过 100 项的列表，考虑使用虚拟滚动或分页。

---

## 浏览器兼容性

- ✅ Chrome 49+
- ✅ Firefox 18+
- ✅ Safari 10+
- ✅ Edge 12+
- ❌ IE 11 及以下（不支持 Proxy）

### Polyfill

对于不支持 Proxy 的浏览器，系统会在控制台显示警告。可以考虑使用 `proxy-polyfill` 或降级为 `Object.defineProperty` 实现。

---

## 常见问题

### Q: 为什么修改数据后视图没有更新？

A: 确保修改的是响应式对象，而不是普通对象：

```javascript
// ❌ 错误
const normalObj = { count: 0 };
normalObj.count++; // 不会触发更新

// ✅ 正确
app.state.count++; // 自动更新
```

### Q: 如何在方法中访问 state？

A: 使用 `this.state`：

```javascript
methods: {
  increment() {
    this.state.count++; // ✅
    // count++; // ❌ 错误
  }
}
```

### Q: v-model 不支持哪些元素？

A: 目前支持 `input`、`textarea`、`select`。不支持自定义组件。

---

## 与 Vue/React 对比

| 特性 | 本系统 | Vue 3 | React |
|------|--------|-------|-------|
| 响应式 | Proxy | Proxy | Hooks |
| 大小 | ~10KB | ~40KB | ~40KB |
| 学习曲线 | 低 | 中 | 中 |
| 生态 | 无 | 丰富 | 丰富 |
| 适用场景 | 小型项目 | 中大型 | 中大型 |

---

## 示例项目

查看 `demo.html` 了解完整的使用示例，包括：

- ✅ 双向绑定表单
- ✅ 计算属性（订单总价）
- ✅ 条件渲染（VIP 徽章）
- ✅ 列表操作（待办事项）

---

## 下一步

1. 在浏览器中打开 `demo.html` 查看效果
2. 阅读 `reactive.js` 和 `bind.js` 源码理解原理
3. 在你的项目中引入并开始使用

---

## 许可证

MIT License - 自由使用和修改

---

**💡 提示**: 这是一个教学性质的轻量级实现。生产环境建议使用 Vue.js、React 等成熟框架。
