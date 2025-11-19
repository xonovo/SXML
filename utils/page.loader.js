// 轻量 Page 运行时与页面自动加载器
(function(){
	'use strict';

	// 简易日志
	function log(){ try{ console.log.apply(console, ['[page.loader]'].concat([].slice.call(arguments))); }catch(_){} }
	function warn(){ try{ console.warn.apply(console, ['[page.loader]'].concat([].slice.call(arguments))); }catch(_){} }

	// 当前页面实例
	var currentPage = null;
	window.currentPage = null;

	// 简易 setData：浅合并 data，并尝试更新绑定的 dataset（这里只做最小实现）
	function setData(patch){
		try {
			this.data = this.data || {};
			for (var k in patch) { this.data[k] = patch[k]; }
		} catch(_) {}
	}

	// Page 定义入口（供 pages/*/*.js 调用）
	window.Page = function(def){
		try {
			def = def || {};
			var inst = {};
			for (var k in def) inst[k] = def[k];
			if (!inst.data) inst.data = {};
			if (!inst.setData) inst.setData = setData.bind(inst);
			currentPage = inst;
			window.currentPage = inst;
			log('Page registered');
			// Page() 调用后即可触发 onLoad（若在页面 JS 动态加载完成后）
			try { if (typeof inst.onLoad === 'function') inst.onLoad(); } catch(e) { warn('onLoad error', e); }
			return inst;
		} catch (e) {
			warn('Page register failed', e);
		}
	};

	function loadScript(src){
		return new Promise(function(resolve, reject){
			try {
				var s = document.createElement('script');
				s.src = src;
				s.async = false;
				s.onload = function(){ resolve(); };
				s.onerror = function(){ reject(new Error('load failed: '+src)); };
				document.head.appendChild(s);
			} catch(e) { reject(e); }
		});
	}

	// 自动推断并加载当前页面的 JS（/pages/<name>/<name>.js）
	async function boot(){
		try {
			var path = location.pathname; // e.g. /pages/webapp/webapp.html
			var m = path.match(/\/pages\/(.+?)\/([^\/]+)\.html$/i);
			if (!m) { warn('no page html matched', path); return; }
			var folder = m[1]; var name = m[2];
			var jsUrl = '/pages/' + folder + '/' + name + '.js';
			log('loading page script:', jsUrl);
			await loadScript(jsUrl);
			if (!window.currentPage) {
				warn('page script loaded but no Page() called');
			} else {
				log('page ready');
			}
		} catch(e) {
			warn('boot failed', e);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();

