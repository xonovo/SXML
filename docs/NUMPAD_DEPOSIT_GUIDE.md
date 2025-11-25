# 数字键盘组件与充值页面使用指南

## 概述

本项目新增了两个核心功能：
1. **通用数字键盘组件** (`components/numpad/`) - 可在多个页面复用的金额输入键盘
2. **充值页面** (`pages/deposit/`) - 支持链上充值和银行转账两种方式

---

## 数字键盘组件

### 文件结构
```
components/numpad/
├── numpad.sxml    # 组件模板
├── numpad.css     # 组件样式
└── numpad.js      # 组件逻辑
```

### 功能特性
- ✅ 支持整数和小数输入
- ✅ 可配置最大值、最小值、小数位数
- ✅ 快捷金额按钮（100/1000/10000/100000 USDT）
- ✅ 实时显示等值美元
- ✅ 支持深色/浅色主题
- ✅ 底部安全区域适配

### 使用方法

#### 1. 在页面中引入组件

在 SXML 模板中使用 `s:include` 引入：

```html
<s:include src="../../components/numpad/numpad.sxml" />
```

#### 2. 在 JS 中初始化并调用

```javascript
Page({
  onLoad() {
    // 初始化键盘组件
    if (window.Numpad) {
      window.Numpad.init();
    }
  },

  onAmountClick() {
    // 打开键盘
    window.Numpad.open({
      value: '0',              // 初始值
      minValue: 10,            // 最小值
      maxValue: 999999,        // 最大值
      decimalPlaces: 2,        // 小数位数
      onConfirm: (value) => {  // 确认回调
        console.log('输入的金额:', value);
        this.setData({ amount: value });
      },
      onClose: () => {         // 关闭回调（可选）
        console.log('键盘已关闭');
      }
    });
  }
});
```

#### 3. API 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | String | `'0'` | 初始金额 |
| `maxLength` | Number | `12` | 最大输入长度 |
| `maxValue` | Number | `999999999999` | 最大金额 |
| `minValue` | Number | `0` | 最小金额 |
| `decimalPlaces` | Number | `2` | 小数位数 |
| `onConfirm` | Function | - | 确认回调，接收 value 参数 |
| `onClose` | Function | - | 关闭回调（可选） |

#### 4. 手动关闭键盘

```javascript
window.Numpad.close();
```

---

## 充值页面

### 文件结构
```
pages/deposit/
├── deposit.sxml   # 页面模板
├── deposit.css    # 页面样式
├── deposit.js     # 页面逻辑
└── deposit.json   # 页面配置
```

### 功能特性
- ✅ 两种充值方式：
  - **链上充值**：USDT 充值地址 + 二维码，支持网络选择（ERC20 等）
  - **银行转账**：银行账号信息 + 凭证上传
- ✅ 集成数字键盘组件输入金额
- ✅ 快捷金额按钮
- ✅ 一键复制地址/账号
- ✅ 最小金额验证（链上 10 USDT，银行 100 USDT）
- ✅ 完整的国际化支持（中英文）
- ✅ 深色/浅色主题适配

### 页面结构

#### 1. 顶部导航栏
- 返回按钮
- 页面标题
- 自动安全区域适配

#### 2. 币种信息卡片
- 显示 USDT 图标、名称
- 显示当前余额

#### 3. 充值方式选择
- **链上充值**（推荐）
- **银行转账**（人工审核）

#### 4. 链上充值表单
- 网络选择（ERC20/TRC20/BSC 等）
- 充值地址 + 复制按钮
- 二维码显示区域
- 金额输入（调起键盘组件）
- 重要提醒（最小金额、确认数等）

#### 5. 银行转账表单
- 金额输入
- 银行账户信息（可一键复制）
- 上传转账凭证
- 备注输入框
- 重要提醒

#### 6. 提交按钮
- 验证输入
- 提交充值请求

### 访问充值页面

#### 从 webapp 首页/Funds 页跳转
```javascript
// 在 webapp.js 中已有的方法
onDeposit() {
  // TODO: 跳转到充值页面
  window.location.href = '/pages/deposit/deposit.html';
}
```

#### 或通过路由跳转
```javascript
window.Router.push('/pages/deposit/deposit.html');
```

### 充值流程

1. **选择充值方式**
   - 点击"链上充值"或"银行转账"

2. **输入金额**
   - 点击金额输入框
   - 在弹出的数字键盘输入金额
   - 或点击快捷金额按钮（100/1000/10000/100000）
   - 点击确认

3. **完成其他信息**
   - 链上：复制充值地址，向该地址转账
   - 银行：查看银行账号，完成转账后上传凭证

4. **提交请求**
   - 点击"提交充值请求"按钮
   - 系统验证后提交
   - 显示成功提示并返回

---

## 国际化配置

已在 `locales/zh-CN.js` 和 `locales/en-US.js` 中添加完整翻译：

### 中文配置
```javascript
"deposit": {
  "title": "充值",
  "coinDesc": "泰达币",
  "balance": "余额",
  // ... 更多配置
}
```

### 英文配置
```javascript
"deposit": {
  "title": "Deposit",
  "coinDesc": "Tether USD",
  "balance": "Balance",
  // ... 更多配置
}
```

页面会自动根据当前语言显示对应文本。

---

## 样式主题

组件和页面都支持深色/浅色主题切换：

```javascript
// 设置深色主题
document.documentElement.setAttribute('data-theme', 'dark');

// 设置浅色主题
document.documentElement.setAttribute('data-theme', 'light');
```

主题色使用 CSS 变量：
```css
--primary-gold: #d4af37
--primary-gold-light: #f4d03f
--text-primary, --text-secondary, --text-tertiary
--bg-primary, --bg-secondary
--border-color
```

---

## 扩展建议

### 1. 在其他页面使用数字键盘

任何需要金额输入的地方都可以使用：

```html
<!-- 在模板中引入 -->
<s:include src="../../components/numpad/numpad.sxml" />

<!-- 添加触发按钮 -->
<button bindtap="onAmountInput">输入金额</button>
```

```javascript
// 在 JS 中调用
onAmountInput() {
  window.Numpad.open({
    value: this.data.amount,
    minValue: 1,
    onConfirm: (value) => {
      this.setData({ amount: value });
    }
  });
}
```

### 2. 集成到提现页面

可以复用充值页面的结构，只需修改：
- 标题和文案
- 验证逻辑（提现需要验证余额）
- 提交接口

### 3. 添加网络选择弹窗

在 `onNetworkSelect` 方法中实现：
```javascript
onNetworkSelect() {
  // 打开 action-sheet 显示网络列表
  // 用户选择后更新 network 和 address
}
```

### 4. 实现文件上传

在 `onUploadVoucher` 方法中：
```javascript
onUploadVoucher() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    // 上传文件到服务器
    // 更新预览图
  };
  input.click();
}
```

### 5. 对接真实 API

修改 `onSubmit` 方法：
```javascript
async onSubmit() {
  // 使用 sapi.js 加密通信
  const result = await sapi.request('/api/deposit/submit', {
    method: this.data.currentMethod,
    amount: this.data.amount,
    // ... 其他参数
  });
  
  if (result.success) {
    this.showToast('充值请求已提交', 'success');
    this.onBack();
  }
}
```

---

## 常见问题

### Q1: 键盘组件无法打开？
A: 确保在 `onLoad` 中初始化了 `window.Numpad.init()`

### Q2: 如何修改快捷金额？
A: 在 `numpad.sxml` 中修改 `data-amount` 属性值

### Q3: 如何修改最小/最大金额限制？
A: 在调用 `window.Numpad.open()` 时传入 `minValue` 和 `maxValue` 参数

### Q4: 键盘样式如何自定义？
A: 修改 `components/numpad/numpad.css` 中的 CSS 变量

### Q5: 如何禁用小数输入？
A: 在调用时设置 `decimalPlaces: 0`

---

## 更新日志

**v1.0.0** (2025-11-25)
- ✅ 创建通用数字键盘组件
- ✅ 创建充值页面（链上充值 + 银行转账）
- ✅ 集成键盘组件到充值页面
- ✅ 添加完整的中英文国际化
- ✅ 支持深色/浅色主题
- ✅ 底部安全区域适配
- ✅ 编译测试通过

---

## 技术支持

如有问题或建议，请查阅项目文档或联系开发团队。
