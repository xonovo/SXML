(function () {
  'use strict';

  function qs(id) { return document.getElementById(id); }

  const HTML = (
    '<div id="POPUPWIN" style="z-index: 900;visibility: hidden;" onclick="clickPOP()">' +
      '<div class="nbaMask"></div>' +
      '<div class="winform" id="win">' +
        '<div class="contentA">' +
          '<div class="wintop">' +
            '<div class="wintitle">' +
              '<svg class="svg-icon2" viewBox="0 0 35 50"><path d="M19.4799356460571,22.1380000114441L19.4799356460571,27.6879997253418 24.8850002288818,27.6879997253418 24.8850002288818,22.1380000114441z M12.6110003157424,22.1380000114441L12.6110003157424,27.6879997253418 18.0160641670227,27.6879997253418 18.0160641670227,22.1380000114441z M19.4799356460571,14.7380000602L19.4799356460571,20.2880001068115 24.8850002288818,20.2880001068115 24.8850002288818,14.7380000602z M12.6110003157424,14.7380000602L12.6110003157424,20.2880001068115 18.0160641670227,20.2880001068115 18.0160641670227,14.7380000602z M18.3540925979614,0L37.6089992523193,9.18972539901733 37.6089992523193,37.439621925354 29.9520778656006,37.439621925354 17.2280750274658,45.0409994125366 21.394341468811,37.439621925354 0,37.439621925354 0,9.18972539901733z"></path></svg>' +
              '<lable id="titleA">标题</lable>' +
            '</div>' +
            '<div onclick="closeWin()" class="svg-close">' +
              '<svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M 960 154.24 L 869.76 64 L 512 421.76 L 154.24 64 L 64 154.24 L 421.76 512 L 64 869.76 L 154.24 960 L 512 602.24 L 869.76 960 L 960 869.76 L 602.24 512 Z"></path></svg>' +
            '</div>' +
          '</div>' +
          '<div class="wincontent" id="winContetnt">我</div>' +
        '</div>' +
      '</div>' +
      '<div id="dialogs2" style="visibility: hidden">' +
        '<div class="nbaMask"></div>' +
        '<div class="nbaDialog" id="dialogsPanle">' +
          '<div class="nbaDialogHd"><strong class="nbaDialogTitle"></strong></div>' +
          '<div class="nbaDialogBd" id="dialogBody">' +
            '<img id="toastIcon" alt="" style="width:36px;height:36px;margin:0 auto 12px;display:none;" />' +
            '<div id="dialog_msg2"></div>' +
          '</div>' +
          '<div class="nbaDialogHd"><strong class="nbaDialogTitle"></strong></div>' +
          '<div class="nbaDialogFt" onclick="clickdialogs()"><div class="nbaDialogBtn" id="dialogbtnText"></div></div>' +
        '</div>' +
      '</div>' +
      '<div id="lodingMsg" style="visibility: hidden">' +
        '<div class="nbaMask"></div>' +
        '<div class="nbaDialog" id="lodingMsgPanle">' +
          '<div class="nbaDialogBd" id="lodingMsg_msg"></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  const Toast = {
    init() {
      if (!qs('POPUPWIN')) {
        const div = document.createElement('div');
        div.innerHTML = HTML;
        document.body.appendChild(div);
      }
    },

    show(msg, opts) {
      this.init();
      const elMsg = qs('dialog_msg2');
      const elBtn = qs('dialogbtnText');
      const elDlg = qs('dialogs2');
      const elPanel = qs('dialogsPanle');
      const iconEl = qs('toastIcon');
      if (!elMsg || !elBtn || !elDlg || !elPanel) return;
      const ICONS = {
        success: '/images/successfully.png',
        fail: '/images/err.png'
      };
      let options = {};
      if (opts && typeof opts === 'object') {
        options = opts;
      } else if (typeof opts !== 'undefined') {
        options = { btnText: opts };
      }
      const btnText = options.btnText || options.buttonText || options.btn || options.enterText || '确定';
      const iconType = (options.icon || '').toLowerCase();

      // 使用 textContent 防止 XSS 攻击
      elMsg.textContent = msg || '';
      elBtn.textContent = btnText || '确定';
      if (iconEl) {
        if (iconType && ICONS[iconType]) {
          iconEl.src = ICONS[iconType];
          iconEl.alt = iconType + ' icon';
          iconEl.style.display = 'block';
        } else {
          iconEl.removeAttribute('src');
          iconEl.style.display = 'none';
        }
      }
      elDlg.style.visibility = 'visible';
      elPanel.setAttribute('class', 'nbaDialog');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          elPanel.setAttribute('class', 'nbaDialog move');
        });
      });
    },

    hideDialog() {
      const elDlg = qs('dialogs2');
      const elPanel = qs('dialogsPanle');
      if (!elDlg || !elPanel) return;
      elDlg.style.visibility = 'hidden';
      elPanel.setAttribute('class', 'nbaDialog');
    },

    showLoading(msg) {
      this.init();
      const elMsg = qs('lodingMsg_msg');
      const elWrap = qs('lodingMsg');
      const elPanel = qs('lodingMsgPanle');
      if (!elMsg || !elWrap || !elPanel) return;
      // 使用 textContent 防止 XSS 攻击
      elMsg.textContent = msg || '';
      elWrap.style.visibility = 'visible';
      elPanel.setAttribute('class', 'nbaDialog');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          elPanel.setAttribute('class', 'nbaDialog move');
        });
      });
    },

    hideLoading() {
      const elWrap = qs('lodingMsg');
      const elPanel = qs('lodingMsgPanle');
      if (!elWrap || !elPanel) return;
      elWrap.style.visibility = 'hidden';
      elPanel.setAttribute('class', 'nbaDialog');
    },

    hideWindow() {
      const wrap = qs('POPUPWIN');
      const win = qs('win');
      if (!wrap || !win) return;
      wrap.style.visibility = 'hidden';
      win.setAttribute('class', 'winform');
    },

    onMaskClick(evt) {
      try {
        var win = qs('win');
        if (win && evt && (win === evt.target || win.contains(evt.target))) return;
      } catch (_) { /* ignore */ }
      this.hideWindow();
    }
  };

  // 暴露全局 API（组件化）
  window.Toast = Toast;

  // 兼容旧的全局函数（保持现有页面不改即可工作）
  window.LoadShowToast = function () { Toast.init(); };
  window.ShowToast = function (msg, opts) { Toast.show(msg, opts); };
  window.ShowLoding = function (msg) { Toast.showLoading(msg); };
  window.CloseLoding = function () { Toast.hideLoading(); };
  window.clickdialogs = function () { Toast.hideDialog(); };
  window.closeWin = function () { Toast.hideWindow(); };
  window.clickPOP = function (evt) { Toast.onMaskClick(evt); };
})();
