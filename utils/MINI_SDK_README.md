mini-sdk (开发时的小程序兼容层) — README

目的
---
在本地开发环境提供一个最小的微信小程序 API 兼容层，方便习惯用小程序 API (wx.*, Page) 的前端工程师在浏览器里开发页面而无需修改大量业务代码。

使用场景
---
- 仅在开发环境注入（`dev-server-sxml.js` 在 dev 模式会自动注入 `/utils/mini-sdk.js`）。
- 生产环境不注入该脚本。

已实现的 API（POC）
---
- wx.request(opts): 基于 fetch 的实现，返回 Promise，同时兼容 success/fail/complete 回调。
- wx.showToast(opts|string): 在页面上显示一个简易 toast。
- wx.showLoading(opts), wx.hideLoading(): 显示/隐藏页面 loading 提示。
- wx.setStorageSync(key, val) / wx.getStorageSync(key) / wx.removeStorageSync(key) / wx.clearStorageSync()
- wx.navigateTo({url})：简单跳转（location.href）。
- wx.getSystemInfoSync(): 返回一些基本的浏览器/屏幕信息。

- Page(def): 将页面定义对象保存为 `window.currentPage`，并实现 `setData`（会触发 `pageDataChanged` 事件），方便老代码调用 `this.setData({...})`。

注意与限制
---
- 这是一个开发时兼容层，目标是快速迭代与开发体验一致，而非生产级别 polyfill。
- 安全/权限/用户信息等敏感 API 未实现（例如 wx.login, wx.getUserInfo 等需要单独设计）。
- 部分 API 仅是简易实现，UI 表现受限于浏览器样式，可能与小程序端不一致。

扩展建议
---
- 增加 showModal / confirm 的实现（基于 window.confirm 或自定义 modal）。
- 增加 wx.login/wx.getUserProfile 的 mock/代理实现以便测试。
- 提供一个简单的数据绑定助手：自动把 `page.data` 中的字段映射到带 `data-bind="field"` 的 DOM 元素。

如何在项目中使用
---
- 在本地运行 dev server (development 模式)，`dev-server-sxml.js` 会自动在编译过的页面中注入 `/utils/mini-sdk.js`。
- 直接在页面 JS 中使用 `wx.request`, `wx.showToast`, `Page({...})` 等，无需改动。

联系方式
---
- 若想扩展或修改，请在本仓库中提交 issue 或 PR，并标注希望支持的 API 列表与兼容行为。
