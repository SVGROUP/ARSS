/**
 * interface.html JS（IIFE 模块化）
 * 职责：12 个工具接口的调用与结果展示
 * 模式：与 config.js 对齐
 *   - 所有事件用 addEventListener 绑定（不用内联 onclick）
 *   - fetch 统一封装（失败显示 network 错误，结果 div 标红/标绿）
 *   - 共享 modal（如果需要）通过 window.confirmModal 调用
 */
(function () {
  'use strict';

  // ============================================================
  // 模块 1: api — 统一 fetch 封装
  // ============================================================
  const api = (() => {
    const BASE = 'sv/rss/api';

    function buildUrl(method, query) {
      const url = `${BASE}/${method}`;
      if (!query || Object.keys(query).length === 0) return url;
      const qs = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
        .join('&');
      return `${url}?${qs}`;
    }

    function call(method, { query, body } = {}) {
      const options = { method: 'GET' };
      if (body !== undefined) {
        options.method = 'POST';
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
      }
      return fetch(buildUrl(method, query), options).then((response) =>
        response.json().then((data) => ({ response, data })),
      );
    }

    return { call, buildUrl };
  })();

  // ============================================================
  // 模块 2: ui — 结果区渲染
  // ============================================================
  const ui = (() => {
    function setResult(method, text, kind) {
      const el = document.getElementById(`${method}_result`);
      if (!el) return;
      el.textContent = text;
      el.className = 'result' + (kind ? ' ' + kind : '');
    }

    return { setResult };
  })();

  // ============================================================
  // 模块 3: interface — 12 个 API 的声明式定义
  //
  // 每条记录描述一个 API：
  //   - method:    接口名（与 Flask 路由对应）
  //   - inputs:    字段列表 [{ id, type }]，type: text/checkbox
  //   - body:      true=POST JSON，false=GET query，function(selValues)=>query 动态 query
  //
  // 这样改动 API 参数只改这一张表，不用碰 DOM 读取代码。
  // ============================================================
  const INTERFACES = [
    { method: 'forceRss', inputs: [] },

    { method: 'checkDetail', inputs: [{ id: 'checkDetail_url', type: 'text', as: 'url' }] },

    { method: 'delByHash', inputs: [{ id: 'delByHash_h', type: 'text', as: 'h' }] },

    { method: 'delByUrl', inputs: [{ id: 'delByUrl_u', type: 'text', as: 'u' }] },

    { method: 'getHashInfo',
      inputs: [{ id: 'adminPassword', type: 'password', as: 'pw', required: true },
               { id: 'getHashInfo_h', type: 'text', as: 'h' }],
      body: (v) => ({ h: v.h, pw: v.pw }) },

    { method: 'updateHash',
      inputs: [{ id: 'updateHash_h', type: 'text', as: 'h' },
               { id: 'updateHash_s', type: 'text', as: 's' }] },

    { method: 'getNearlyInfo',
      inputs: [{ id: 'getNearlyInfo_t', type: 'text', as: 't' }] },

    { method: 'forceUpdateIntro',
      inputs: [{ id: 'forceUpdateIntro_h', type: 'text', as: 'h' }] },

    { method: 'addByUrl',
      inputs: [{ id: 'addByUrl_h', type: 'text', as: 'h' },
               { id: 'addByUrl_url', type: 'text', as: 'url' },
               { id: 'addByUrl_hr', type: 'text', as: 'hr' },
               { id: 'addByUrl_sf', type: 'text', as: 'sf' },
               { id: 'addByUrl_force', type: 'checkbox', as: 'force' }],
      query(selValues) {
        // 解析 URL 提取 hostname 作为 ss（站点架构）
        let ss = '';
        try { ss = new URL(selValues.url).hostname; } catch (_) { /* 留空 */ }
        const q = { h: selValues.h, url: selValues.url, hr: selValues.hr, sf: selValues.sf, ss };
        if (selValues.force) q.force = 1;
        return q;
      } },

    { method: 'addDoubanM',
      inputs: [{ id: 'addDouban_douban', type: 'text', as: 'douban' },
               { id: 'addDouban_imdb', type: 'text', as: 'imdb' },
               { id: 'addDouban_descr', type: 'text', as: 'descr' }],
      body: (v) => ({ douban: v.douban, imdb: v.imdb, descr: v.descr }) },

    { method: 'modDouban',
      inputs: [{ id: 'modDouban_douban', type: 'text', as: 'douban' },
               { id: 'modDouban_imdb', type: 'text', as: 'imdb' },
               { id: 'modDouban_descr', type: 'text', as: 'descr' }],
      body: (v) => ({ douban: v.douban, imdb: v.imdb, descr: v.descr }) },

    { method: 'selDouban',
      inputs: [{ id: 'selDouban_d', type: 'text', as: 'd' }] },

    { method: 'delDouban',
      inputs: [{ id: 'delDouban_douban', type: 'text', as: 'douban' },
               { id: 'delDouban_imdb', type: 'text', as: 'imdb' }],
      body: (v) => ({ douban: v.douban, imdb: v.imdb }) },
  ];

  // ============================================================
  // 模块 4: actions — 执行一次接口调用
  // ============================================================
  const actions = {
    collectValues(iface) {
      const v = {};
      for (const inp of iface.inputs) {
        const el = document.getElementById(inp.id);
        if (!el) continue;
        v[inp.as] = (inp.type === 'checkbox') ? el.checked : el.value;
      }
      return v;
    },
    checkRequired(iface, values) {
      for (const inp of iface.inputs) {
        if (!inp.required) continue;
        if (inp.type === 'text' && !values[inp.as]) {
          ui.setResult(iface.method, '错误: 请先填写必填项', 'error');
          return false;
        }
        if (inp.type === 'password' && !values[inp.as]) {
          void window.alertModal('请输入密码');
          return false;
        }
      }
      return true;
    },
    call(iface) {
      const values = actions.collectValues(iface);
      if (!actions.checkRequired(iface, values)) return;

      // 决定走 POST body 还是 GET query：
      //   - body:    POST JSON
      //   - query:   GET query
      //   - 都没有：  无参数调用（仅限 inputs 为空）
      let body, query;
      if (typeof iface.body === 'function') {
        body = iface.body(values);
      } else if (typeof iface.query === 'function') {
        query = iface.query(values);
      } else if (iface.inputs.length > 0) {
        // 默认走 GET query（inputs 里所有字段按 as 映射为 query 参数）
        query = {};
        for (const inp of iface.inputs) {
          query[inp.as] = values[inp.as];
        }
      }
      // 两者都没有 且 inputs 为空 → 无参数（如 forceRss）

      api.call(iface.method, { body, query })
        .then(({ response, data }) => {
          if (!response.ok || (data && data.code !== 200)) {
            const msg = (data && data.msg) || `HTTP error! status: ${response.status}`;
            ui.setResult(iface.method, `错误: ${msg}`, 'error');
          } else {
            const msg = (data && data.msg) || '操作成功';
            ui.setResult(iface.method, msg, 'success');
          }
        })
        .catch((err) => {
          ui.setResult(iface.method, `错误: ${err.message}`, 'error');
        });
    },
  };

  // ============================================================
  // 模块 5: bind — 启动时绑定所有按钮的 click 事件
  // ============================================================
  function bind() {
    for (const iface of INTERFACES) {
      const btn = document.getElementById(`${iface.method}_btn`);
      if (!btn) continue;
      btn.addEventListener('click', () => actions.call(iface));
    }
  }

  // DOMContentLoaded 后绑定（template 渲染时 DOM 已就绪，这里保险用一次）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
