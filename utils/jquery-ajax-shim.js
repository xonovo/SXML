/*
 * Lightweight jQuery $.ajax compatibility shim using fetch.
 * Purpose: Allow legacy code (like utils/sapi.js) that calls $.ajax
 * to run without loading jQuery globally.
 * Scope: Only implements the subset of $.ajax used by sapi.js
 * (POST, headers, JSON body, timeout, success/error callbacks).
 */
(function (global) {
  if (global.$ && typeof global.$.ajax === 'function') {
    return; // jQuery already present
  }

  function ajax(options) {
    const url = options.url;
    const method = (options.method || options.type || 'GET').toUpperCase();
    const headers = options.headers || {};
    const timeout = typeof options.timeout === 'number' ? options.timeout : 30000;
    const data = options.data;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: data != null ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
      signal: controller ? controller.signal : undefined
    };

    fetch(url, fetchOptions)
      .then(async (resp) => {
        if (timer) clearTimeout(timer);
        const statusText = resp.statusText || '';
        const jqXHRLike = {
          status: resp.status,
          statusText,
          getResponseHeader: (name) => resp.headers.get(name)
        };
        if (!resp.ok) {
          const err = new Error(statusText || 'HTTP Error');
          if (typeof options.error === 'function') {
            options.error(jqXHRLike, 'error', err);
          }
          return;
        }
        let json;
        try {
          json = await resp.json();
        } catch (e) {
          // If not JSON, pass raw text
          json = await resp.text();
        }
        if (typeof options.success === 'function') {
          options.success(json, 'success', jqXHRLike);
        }
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        const jqXHRLike = { status: 0, statusText: 'Network Error', getResponseHeader: () => null };
        const textStatus = err && err.name === 'AbortError' ? 'timeout' : 'error';
        if (typeof options.error === 'function') {
          options.error(jqXHRLike, textStatus, err);
        }
      });
  }

  const $ = global.$ || (global.$ = {});
  $.ajax = ajax;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
