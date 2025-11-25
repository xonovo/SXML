// Toast 组件适配层（实际实现在 utils/toast.js）
function LoadShowToast() { if (window.Toast && typeof window.Toast.init === 'function') window.Toast.init(); }
function ShowLoding(msg) { if (window.Toast && Toast.showLoading) Toast.showLoading(msg); }
function CloseLoding() { if (window.Toast && Toast.hideLoading) Toast.hideLoading(); }
function ShowToast(msg, opts) { if (window.Toast && Toast.show) Toast.show(msg, opts); }
function clickdialogs() { if (window.Toast && Toast.hideDialog) Toast.hideDialog(); }
function closeWin() { if (window.Toast && Toast.hideWindow) Toast.hideWindow(); }
function clickPOP(evt) { if (window.Toast && Toast.onMaskClick) Toast.onMaskClick(evt); else closeWin(); }
