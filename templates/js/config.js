(function () {
  'use strict';

  // ============================================================
  // 模块 1: state — 全局状态（5 行能讲清）
  // ============================================================
  const state = (() => {
    let oldConfig = {};
    let newConfig = {};
    let currentSite = '';
    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
    return {
      get old() { return oldConfig; },
      get new() { return newConfig; },
      get currentSite() { return currentSite; },
      setCurrentSite(site) { currentSite = site; },
      init(config) { oldConfig = clone(config); newConfig = clone(config); },
      setNew(config) { newConfig = config; },
      commitChanges() { oldConfig = clone(newConfig); },
    };
  })();

  // ============================================================
  // 模块 2: api — 统一 fetch 封装（一处错误处理）
  // ============================================================
  const api = (() => {
    const baseUrl = 'sv/rss/api';
    async function request(path, opts) {
      try {
        const res = await fetch(baseUrl + path, opts);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (parseInt(data.code) !== 200) throw new Error(data.msg);
        // data.msg 可能是 JSON 字符串（getMainConfig 返回的 toml）也可能就是普通文本（备份成功、恢复成功）
        // try-catch JSON.parse：parse 成功返回对象，失败返回原字符串
        let payload = data.msg;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch (_) { /* 保留原字符串 */ }
        }
        return { ok: true, data: payload };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    return {
      getConfig(password) {
        return request('/getMainConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pw: password }),
        });
      },
      setConfig(password, toml) {
        return request('/setMainConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pw: password, toml }),
        });
      },
      syncCookieCloud() {
        return request('/getCookieCloud', { method: 'GET' });
      },
      backup() {
        return request('/backupMainConfig', { method: 'GET' });
      },
      restore() {
        return request('/restoreMainConfig', { method: 'GET' });
      },
    };
  })();

  // ============================================================
  // 模块 3: fields — 声明式字段表（1 处替代原 50+ 行）
  // ============================================================
  const fields = (() => {
    // 字段声明：id → { path, type, event, label }
    // - path:  在 newConfig 里的路径（数组，支持嵌套 rss.free_check）
    // - type:  'string' | 'number' | 'float' | 'boolean'
    // - event: 'blur' | 'change'（checkbox 用 change，文本框用 blur）
    // - label: 中文标签（diff 显示用）
    const FIELDS = [
      { id: 'port',               path: ['port'],                  type: 'number',  event: 'blur',   label: '通信端口' },
      { id: 'is_debug',           path: ['is_debug'],              type: 'boolean', event: 'change', label: 'Debug模式' },
      { id: 'time_to_rss',        path: ['time_to_rss'],           type: 'number',  event: 'blur',   label: 'RSS间隔（分钟）' },
      { id: 'time_to_rss_list',   path: ['time_to_rss_list'],      type: 'number',  event: 'blur',   label: '列表等待时间（分钟）' },
      { id: 'queue_num',          path: ['queue_num'],             type: 'number',  event: 'blur',   label: '种子缓存队列长度' },
      { id: 'send_num',           path: ['send_num'],              type: 'number',  event: 'blur',   label: '单次请求返回种子数' },
      { id: 'num_per_turn',       path: ['num_per_turn'],          type: 'number',  event: 'blur',   label: '每轮RSS最大记录数' },
      { id: 'douban_ck',          path: ['douban_ck'],             type: 'string',  event: 'blur',   label: '豆瓣Cookie' },
      { id: 'ptgen',              path: ['ptgen'],                 type: 'string',  event: 'blur',   label: 'PTGEN地址' },
      { id: 'cache_use',          path: ['cache_use'],             type: 'boolean', event: 'change', label: '使用本地PTGEN缓存' },
      { id: 'free_check',         path: ['rss', 'free_check'],     type: 'boolean', event: 'change', label: '检测免费状态' },
      { id: 'time_check',         path: ['rss', 'time_check'],     type: 'float',   event: 'blur',   label: '发布时间限制' },
      { id: 'hr_check',           path: ['rss', 'hr_check'],       type: 'boolean', event: 'change', label: '检测HR标志' },
      { id: 'quick_scan',         path: ['rss', 'quick_scan'],     type: 'boolean', event: 'change', label: '快速轮循' },
      { id: 'cc_url',             path: ['cc_server', 'url'],      type: 'string',  event: 'blur',   label: 'CC服务器地址' },
      { id: 'cc_key',             path: ['cc_server', 'key'],      type: 'string',  event: 'blur',   label: 'CC用户Key' },
      { id: 'cc_password',        path: ['cc_server', 'password'], type: 'string',  event: 'blur',   label: 'CC端对端密码' },
      { id: 'qywx_is_used',       path: ['qiyeweixin', 'is_used'], type: 'boolean', event: 'change', label: '企业微信通知' },
      { id: 'corpsecret',         path: ['qiyeweixin', 'corpsecret'], type: 'string', event: 'blur', label: '企业微信公司密钥' },
      { id: 'agentid',            path: ['qiyeweixin', 'agentid'], type: 'string',  event: 'blur',   label: '企业微信代理ID' },
      { id: 'corpid',             path: ['qiyeweixin', 'corpid'],  type: 'string',  event: 'blur',   label: '企业微信公司ID' },
      { id: 'userid',             path: ['qiyeweixin', 'userid'],  type: 'string',  event: 'blur',   label: '企业微信用户ID' },
      { id: 'mobile',             path: ['qiyeweixin', 'mobile'],  type: 'string',  event: 'blur',   label: '企业微信手机号' },
      { id: 'email_is_used',      path: ['email', 'is_used'],      type: 'boolean', event: 'change', label: '邮件通知' },
      { id: 'SMTP_SERVER',        path: ['email', 'SMTP_SERVER'],  type: 'string',  event: 'blur',   label: 'SMTP服务器' },
      { id: 'SMTP_SSL',           path: ['email', 'SMTP_SSL'],     type: 'boolean', event: 'change', label: 'SMTP使用SSL' },
      { id: 'SMTP_EMAIL',         path: ['email', 'SMTP_EMAIL'],   type: 'string',  event: 'blur',   label: '发件邮箱' },
      { id: 'SMTP_PASSWORD',      path: ['email', 'SMTP_PASSWORD'], type: 'string', event: 'blur',   label: '邮箱密码' },
      { id: 'SMTP_NAME',          path: ['email', 'SMTP_NAME'],    type: 'string',  event: 'blur',   label: '发件人姓名' },
      { id: 'iyuu_is_used',       path: ['iyuu', 'is_used'],       type: 'boolean', event: 'change', label: 'IYUU通知' },
      { id: 'iyuu_token',         path: ['iyuu', 'iyuu_token'],    type: 'string',  event: 'blur',   label: 'IYUU Token' },
    ];

    // 工具：按路径读/写嵌套对象
    function getByPath(obj, path) {
      return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
    }
    function setByPath(obj, path, val) {
      const parent = path.slice(0, -1).reduce((o, k) => {
        if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
        return o[k];
      }, obj);
      parent[path[path.length - 1]] = val;
    }
    function parseValue(el, type) {
      if (type === 'boolean') return el.checked;
      const v = el.value;
      // 空字符串保留为 ''（不转 undefined），避免保存时丢失原本为空的字段
      if (v == null) return '';
      if (type === 'number') return v === '' ? '' : parseInt(v, 10);
      if (type === 'float') return v === '' ? '' : parseFloat(v);
      return v;
    }

    return {
      FIELDS,
      getByPath,
      setByPath,
      parseValue,
      // 从 config 填表单（加载配置后调用）
      fill(config) {
        FIELDS.forEach((f) => {
          const el = document.getElementById(f.id);
          if (!el) return;
          const val = getByPath(config, f.path);
          if (f.type === 'boolean') el.checked = !!val;
          else el.value = (val == null ? '' : val);
        });
      },
      // 从表单读出 config（保存前调用）
      // 注意：所有 FIELDS 声明的字段都会被写出（包括空字符串），
      // 避免保存时丢失用户原本就为空的字段
      read() {
        const config = {};
        FIELDS.forEach((f) => {
          const el = document.getElementById(f.id);
          if (!el) return;
          const val = parseValue(el, f.type);
          setByPath(config, f.path, val);
        });
        return config;
      },
      // 自动绑定所有字段的 blur/change 事件（替代 159 行 addBlurListeners）
      bind() {
        FIELDS.forEach((f) => {
          const el = document.getElementById(f.id);
          if (!el) return;
          el.addEventListener(f.event, () => {
            // 实时同步到 new_config（保留老 addBlurListeners 的语义：编辑即同步）
            const newCfg = state.new;
            const val = parseValue(el, f.type);
            setByPath(newCfg, f.path, val);
            state.setNew(newCfg);
          });
        });
      },
    };
  })();

  // ============================================================
  // 模块 4: sites — 站点选择（19 站点声明式）
  // ============================================================
  const sites = (() => {
    const SITE_LIST = [
      { value: 'audiences.me',        label: '观众' },
      { value: 'springsunday.net',    label: '春天' },
      { value: 'hhanclub.top',        label: '憨憨' },
      { value: 'ubits.club',          label: '优堡' },
      { value: 'hdhome.org',          label: '家园' },
      { value: 'www.hddolby.com',     label: '杜比' },
      { value: 'pterclub.net',        label: '猫站' },
      { value: 'pt.keepfrds.com',     label: '朋友' },
      { value: 'zmpt.cc',             label: '织梦' },
      { value: 'reelflix.xyz',        label: 'RF' },
      { value: 'filelist.io',         label: 'FL' },
      { value: 'ourbits.club',        label: '我堡' },
      { value: 'sunnypt.top',         label: '阳光' },
      { value: 'ptlgs.org',           label: '劳改所' },
      { value: 'pt.xingyungept.org',  label: '星陨阁' },
      { value: 'cspt.top',            label: '财神' },
      { value: 'www.hdkyl.in',        label: '麒麟' },
      { value: 'hdsky.me',            label: '天空' },
      { value: 'kp.m-team.cc',        label: '馒头', cookiesPlaceholder: '请从站点获取令牌替换xxx的内容：x-api-key=***' },
    ];
    const DEFAULT_PLACEHOLDER = '请从站点请求中复制Cookies信息';

    const SITE_FIELDS = [
      { id: 'site_is_used',            path: 'is_used',             type: 'boolean', label: '启用' },
      { id: 'site_domain',             path: 'domain',              type: 'string',  label: '域名映射',     default: (sel) => sel },
      { id: 'site_cookies',            path: 'cookies',             type: 'string',  label: 'Cookies' },
      { id: 'site_seed_size_less_GB',  path: 'seed_size_less_GB',   type: 'float',   label: '种子体积上限', default: () => 40 },
      { id: 'site_seed_size_more_GB',  path: 'seed_size_more_GB',   type: 'float',   label: '种子体积下限', default: () => 10 },
      { id: 'site_url',                path: 'url',                 type: 'string',  label: 'RSS 链接' },
    ];

    function getConfigFor(config, site, key) {
      if (!config.rss || !config.rss[key]) return undefined;
      return config.rss[key][site];
    }

    // 切站点时调用
    function fill(config) {
      const sel = document.getElementById('site_selector').value;
      const container = document.getElementById('site_config_container');
      if (!sel) {
        container.style.display = 'none';
        state.setCurrentSite('');
        return;
      }
      container.style.display = 'block';
      state.setCurrentSite(sel);
      // 渲染 SITE_FIELDS
      SITE_FIELDS.forEach((f) => {
        const el = document.getElementById(f.id);
        if (!el) return;
        const val = getConfigFor(config, sel, f.path);
        if (f.type === 'boolean') el.checked = !!val;
        else el.value = (val == null ? (f.default ? f.default(sel) : '') : val);
      });
      // 馒头站点特殊 placeholder
      const site = SITE_LIST.find((s) => s.value === sel);
      document.getElementById('site_cookies').placeholder =
        (site && site.cookiesPlaceholder) || DEFAULT_PLACEHOLDER;
    }

    // 读当前站点配置（保存前调用）
    function readCurrent() {
      const sel = state.currentSite;
      if (!sel) return {};
      const result = { rss: {} };
      SITE_FIELDS.forEach((f) => {
        const el = document.getElementById(f.id);
        if (!el) return;
        if (!result.rss[f.path]) result.rss[f.path] = {};
        // 复用 fields.parseValue 进行类型转换，避免保存后类型与加载不一致（譬如 number 被存为字符串）
        result.rss[f.path][sel] = fields.parseValue(el, f.type);
      });
      return result;
    }

    return { SITE_LIST, SITE_FIELDS, fill, readCurrent };
  })();

  // ============================================================
  // 模块 5: diff — 字段级 diff（含 label 展示）
  // ============================================================
  const diff = (() => {
    function deepEqual(a, b) {
      if (a === b) return true;
      // null 和 undefined 视为相等（都表示"未设置"）
      if (a == null && b == null) return true;
      if (a == null || b == null) return a === b || a === '' || b === '';
      if (typeof a !== typeof b) {
        // 空字符串与 null/undefined 视为相等（表示"未填"）
        if ((typeof a === 'string' && a === '' && (b == null || b === 0)) ||
            (typeof b === 'string' && b === '' && (a == null || a === 0))) return true;
        return false;
      }
      if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
      return false;
    }

    function compute(oldCfg, newCfg) {
      const changes = [];
      // 1) 顶层字段（FIELDS）
      fields.FIELDS.forEach((f) => {
        const oldVal = fields.getByPath(oldCfg, f.path);
        const newVal = fields.getByPath(newCfg, f.path);
        if (!deepEqual(oldVal, newVal)) {
          changes.push({ label: f.label, oldVal, newVal });
        }
      });
      // 2) 站点配置（按站点 + 字段）
      const oldIsUsed = oldCfg.rss?.is_used || {};
      const newIsUsed = newCfg.rss?.is_used || {};
      const allSites = new Set([...Object.keys(oldIsUsed), ...Object.keys(newIsUsed)]);
      allSites.forEach((site) => {
        const siteInfo = sites.SITE_LIST.find((s) => s.value === site);
        const siteLabel = (siteInfo ? siteInfo.label : site);
        sites.SITE_FIELDS.forEach((f) => {
          const oldVal = oldCfg.rss?.[f.path]?.[site];
          const newVal = newCfg.rss?.[f.path]?.[site];
          if (!deepEqual(oldVal, newVal)) {
            changes.push({ label: `${siteLabel} - ${f.label || f.id}`, oldVal, newVal });
          }
        });
      });
      return changes;
    }

    function formatValue(val) {
      // boolean 转中文“开/关”，更符合使用者理解
      if (val === true) return '开';
      if (val === false) return '关';
      if (val === null || val === undefined) return '未设置';
      if (val === '') return '空';
      return JSON.stringify(val);
    }

    function format(changes) {
      if (changes.length === 0) return '没有配置项发生变更';
      return '以下配置项将被修改:\n\n' + changes
        .map((c) => `  ${c.label}: ${formatValue(c.oldVal)} → ${formatValue(c.newVal)}`)
        .join('\n');
    }

    return { compute, format };
  })();

  // ============================================================
  // 模块 6: actions — 5 个顶层动作
  // ============================================================
  const actions = (() => {
    function getPassword() {
      return document.getElementById('adminPassword').value;
    }

    async function load() {
      const pw = getPassword();
      if (!pw) { void window.alertModal('请输入密码后再加载配置'); return; }
      const r = await api.getConfig(pw);
      if (!r.ok) { void window.alertModal('加载配置失败: ' + r.error); return; }
      state.init(r.data);
      fields.fill(state.new);
      sites.fill(state.new);
      document.getElementById('configForm').style.display = 'block';
    }

    async function save() {
      const pw = getPassword();
      if (!pw) { void window.alertModal('请输入密码后再保存配置'); return; }
      // 重新读一次表单（确保拿到最新值，不依赖实时 bind 的中间态）
      const formCfg = fields.read();
      const siteCfg = sites.readCurrent();
      // 以 state.old 为基线 deep-clone，这样 19 个站点的原有字段都保留，
      // 避免 sites.readCurrent() 只输出当前选中站点，导致其他站点在 diff 中误报
      const newCfg = JSON.parse(JSON.stringify(state.old));
      mergeDeep(newCfg, formCfg);
      mergeDeep(newCfg, siteCfg);
      const changes = diff.compute(state.old, newCfg);
      const ok = await window.confirmModal({
        message: diff.format(changes) + '\n\n确认保存这些更改吗？',
        confirmText: '保存', cancelText: '取消', danger: true,
      });
      if (!ok) return;
      const r = await api.setConfig(pw, newCfg);
      if (!r.ok) { void window.alertModal('配置保存失败: ' + r.error); return; }
      state.setNew(newCfg);
      state.commitChanges();
      void window.alertModal('配置已保存');
    }

    async function backup() {
      const ok = await window.confirmModal({
        message: '确定要备份当前配置吗？',
        confirmText: '备份', cancelText: '取消',
      });
      if (!ok) return;
      const r = await api.backup();
      void window.alertModal(r.ok ? (r.data || '备份成功') : '配置备份失败: ' + r.error);
    }

    async function restore() {
      const ok = await window.confirmModal({
        message: '确定要从备份恢复配置吗？这将覆盖当前的所有配置！',
        confirmText: '恢复', cancelText: '取消', danger: true,
      });
      if (!ok) return;
      const r = await api.restore();
      if (!r.ok) { void window.alertModal('配置恢复失败: ' + r.error); return; }
      void window.alertModal('配置恢复成功！页面将重新加载以应用配置。');
      location.reload();
    }

    async function syncCookieCloud() {
      const r = await api.syncCookieCloud();
      void window.alertModal(r.ok ? (r.data || '同步成功') : '配置同步失败: ' + r.error);
      if (r.ok) location.reload();
    }

    // 深度合并（form 配置 + 站点配置）
    function mergeDeep(target, source) {
      if (source == null) return target;
      for (const key of Object.keys(source)) {
        const sv = source[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
          target[key] = mergeDeep(target[key] || {}, sv);
        } else {
          target[key] = sv;
        }
      }
      return target;
    }

    return { load, save, backup, restore, syncCookieCloud };
  })();

  // ============================================================
  // 主入口：DOMContentLoaded 绑定事件
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    // 顶栏固定按钮的边距计算
    setTimeout(() => {
      const fb = document.querySelector('.fixed-top-buttons');
      if (fb) {
        const container = document.querySelector('.container');
        if (container) container.style.marginTop = (fb.offsetHeight + 20) + 'px';
      }
    }, 100);

    // 5 个动作按钮
    document.getElementById('loadBtn').addEventListener('click', actions.load);
    document.getElementById('saveBtn').addEventListener('click', actions.save);
    document.getElementById('backupBtn').addEventListener('click', actions.backup);
    document.getElementById('restoreBtn').addEventListener('click', actions.restore);
    document.getElementById('forceSync').addEventListener('click', actions.syncCookieCloud);

    // 返回首页按钮
    const backBtn = document.querySelector('.back-button');
    if (backBtn) backBtn.addEventListener('click', () => { window.location.href = '/'; });

    // 字段实时同步到 new_config（替代原 addBlurListeners 的 159 行）
    fields.bind();

    // 站点选择
    document.getElementById('site_selector').addEventListener('change', (e) => {
      // 切换前先保存当前站点配置到 new_config（与原逻辑一致）
      // 实际上 sites.fill 内部 setCurrentSite(newSel)，所以这里只需要 fill
      sites.fill(state.new);
    });
  });
})();
