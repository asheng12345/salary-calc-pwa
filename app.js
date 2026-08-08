/* 排班薪资计算器 PWA — 前端逻辑（原生 JS，localStorage 存储） */
(function () {
  'use strict';

  var USERS_KEY = 'salaryapp:users';
  var PFX = 'salaryapp:user:';

  // ---------- 存储 ----------
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveUsers(list) { localStorage.setItem(USERS_KEY, JSON.stringify(list)); }

  function userKey(u) { return PFX + u; }
  function loadUser(u) {
    try { return JSON.parse(localStorage.getItem(userKey(u)) || 'null'); }
    catch (e) { return null; }
  }
  function saveUser(u, data) { localStorage.setItem(userKey(u), JSON.stringify(data)); }

  function defaultData() {
    return {
      config: {
        base: 5000,
        standardDays: 21.75,
        dayAllow: 0,
        nightAllow: 0,
        holidayMult: 3,
        paidHolidayRest: true,
        items: [
          { name: '全勤奖', type: 'add', amount: 300 },
          { name: '餐补', type: 'add', amount: 200 }
        ]
      },
      shifts: {},   // 'YYYY-MM-DD': 'day'|'night'|'rest'
      holidays: {}  // 'YYYY-MM-DD': name
    };
  }

  function getData() {
    var u = state.user;
    var d = loadUser(u);
    if (!d) { d = defaultData(); saveUser(u, d); }
    if (!d.config) d.config = defaultData().config;
    if (!d.shifts) d.shifts = {};
    if (!d.holidays) d.holidays = {};
    if (!d.config.items) d.config.items = [];
    return d;
  }
  function save(data) { saveUser(state.user, data); }

  // ---------- 状态 ----------
  var state = {
    user: null,
    shiftsYM: ym(new Date()),
    holiYM: ym(new Date()),
    calcYM: ym(new Date())
  };
  function ym(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function parsedYM(s) {
    var p = s.split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10) };
  }
  function shiftYM(s, delta) {
    var p = parsedYM(s);
    var d = new Date(p.y, p.m - 1 + delta, 1);
    return ym(d);
  }
  function dateStr(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function fmt(n) {
    n = Number(n) || 0;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 用户 ----------
  function ensureUsers() {
    var users = getUsers();
    if (users.length === 0) {
      users = ['默认'];
      saveUsers(users);
      saveUser('默认', defaultData());
    }
    if (!state.user || users.indexOf(state.user) === -1) state.user = users[0];
  }
  function renderUserSelect() {
    var sel = $('userSelect');
    var users = getUsers();
    sel.innerHTML = users.map(function (u) {
      return '<option value="' + esc(u) + '"' + (u === state.user ? ' selected' : '') + '>' + esc(u) + '</option>';
    }).join('');
  }
  function addUser() {
    var name = prompt('新用户名（最多20字）：', '');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    if (name.length > 20) { alert('用户名最长20个字符'); return; }
    var users = getUsers();
    if (users.indexOf(name) !== -1) { alert('用户名已存在'); return; }
    users.push(name);
    saveUsers(users);
    saveUser(name, defaultData());
    state.user = name;
    renderUserSelect();
    renderAll();
  }

  // ---------- 参数设置 ----------
  function renderConfig() {
    var d = getData();
    var c = d.config;
    $('cfg-base').value = c.base;
    $('cfg-standardDays').value = c.standardDays;
    $('cfg-dayAllow').value = c.dayAllow;
    $('cfg-nightAllow').value = c.nightAllow;
    $('cfg-holidayMult').value = c.holidayMult;
    $('cfg-paidHolidayRest').checked = !!c.paidHolidayRest;
    renderItems(d);
  }
  function renderItems(d) {
    var box = $('itemsList');
    box.innerHTML = d.config.items.map(function (it, i) {
      var sel = '<select data-i="' + i + '" class="item-type' + (it.type === 'deduct' ? ' deduct' : '') + '">' +
        '<option value="add"' + (it.type === 'add' ? ' selected' : '') + '>加</option>' +
        '<option value="deduct"' + (it.type === 'deduct' ? ' selected' : '') + '>减</option>' +
        '</select>';
      return '<div class="item-row">' +
        '<input class="name" data-i="' + i + '" value="' + esc(it.name) + '" />' +
        sel +
        '<input class="amount" data-i="' + i + '" inputmode="decimal" value="' + esc(it.amount) + '" />' +
        '<button class="del" data-i="' + i + '">×</button>' +
        '</div>';
    }).join('');
  }
  function bindConfig() {
    var map = { 'cfg-base': 'base', 'cfg-standardDays': 'standardDays', 'cfg-dayAllow': 'dayAllow',
      'cfg-nightAllow': 'nightAllow', 'cfg-holidayMult': 'holidayMult' };
    Object.keys(map).forEach(function (id) {
      $(id).addEventListener('input', function () {
        var d = getData();
        d.config[map[id]] = Number(this.value) || 0;
        save(d);
        if (state.activeTab === 'calc') renderCalc();
      });
    });
    $('cfg-paidHolidayRest').addEventListener('change', function () {
      var d = getData();
      d.config.paidHolidayRest = this.checked;
      save(d);
      if (state.activeTab === 'calc') renderCalc();
    });
    $('addItemBtn').addEventListener('click', function () {
      var d = getData();
      d.config.items.push({ name: '新项', type: 'add', amount: 0 });
      save(d);
      renderItems(d);
    });
    $('itemsList').addEventListener('input', function (e) {
      var i = e.target.getAttribute('data-i');
      if (i === null) return;
      i = parseInt(i, 10);
      var d = getData();
      if (e.target.classList.contains('name')) d.config.items[i].name = e.target.value;
      else if (e.target.classList.contains('amount')) d.config.items[i].amount = Number(e.target.value) || 0;
      save(d);
    });
    $('itemsList').addEventListener('change', function (e) {
      if (e.target.classList.contains('item-type')) {
        var i = parseInt(e.target.getAttribute('data-i'), 10);
        var d = getData();
        d.config.items[i].type = e.target.value;
        save(d);
        renderItems(d);
      }
    });
    $('itemsList').addEventListener('click', function (e) {
      if (e.target.classList.contains('del')) {
        var i = parseInt(e.target.getAttribute('data-i'), 10);
        var d = getData();
        d.config.items.splice(i, 1);
        save(d);
        renderItems(d);
      }
    });
  }

  // ---------- 月历渲染（排班） ----------
  function renderShifts() {
    $('shiftsTitle').textContent = state.shiftsYM.replace('-', '年') + '月';
    var p = parsedYM(state.shiftsYM);
    var grid = $('shiftsGrid');
    var html = dowRow();
    var first = new Date(p.y, p.m - 1, 1).getDay(); // 0=日
    var days = new Date(p.y, p.m, 0).getDate();
    var d = getData();
    var today = dateStr(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    for (var i = 0; i < first; i++) html += '<div></div>';
    for (var day = 1; day <= days; day++) {
      var ds = dateStr(p.y, p.m, day);
      var sh = d.shifts[ds];
      var cls = 'cal-cell';
      var mark = '';
      if (sh === 'day') { cls += ' day'; mark = '☀'; }
      else if (sh === 'night') { cls += ' night'; mark = '🌙'; }
      else if (sh === 'rest') { cls += ' rest'; mark = '💤'; }
      if (d.holidays[ds]) cls += ' holi';
      if (ds === today) cls += ' today';
      html += '<div class="' + cls + '" data-date="' + ds + '">' +
        '<span class="dnum">' + day + '</span><span class="mark">' + mark + '</span></div>';
    }
    grid.innerHTML = html;
  }
  function dowRow() {
    var names = ['日', '一', '二', '三', '四', '五', '六'];
    return names.map(function (n) { return '<div class="cal-dow">' + n + '</div>'; }).join('');
  }
  function bindShifts() {
    $('shiftsGrid').addEventListener('click', function (e) {
      var cell = e.target.closest('.cal-cell');
      if (!cell) return;
      var ds = cell.getAttribute('data-date');
      var d = getData();
      var cur = d.shifts[ds];
      var next = cur === 'day' ? 'night' : cur === 'night' ? 'rest' : 'day';
      d.shifts[ds] = next;
      save(d);
      renderShifts();
      if (state.activeTab === 'calc') renderCalc();
    });
    $('shiftsPrev').addEventListener('click', function () { state.shiftsYM = shiftYM(state.shiftsYM, -1); renderShifts(); });
    $('shiftsNext').addEventListener('click', function () { state.shiftsYM = shiftYM(state.shiftsYM, 1); renderShifts(); });
  }

  // ---------- 月历渲染（节假日） ----------
  function renderHoli() {
    $('holiTitle').textContent = state.holiYM.replace('-', '年') + '月';
    var p = parsedYM(state.holiYM);
    var grid = $('holiGrid');
    var html = dowRow();
    var first = new Date(p.y, p.m - 1, 1).getDay();
    var days = new Date(p.y, p.m, 0).getDate();
    var d = getData();
    var today = dateStr(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    for (var i = 0; i < first; i++) html += '<div></div>';
    for (var day = 1; day <= days; day++) {
      var ds = dateStr(p.y, p.m, day);
      var name = d.holidays[ds];
      var cls = 'cal-cell';
      if (name) cls += ' holi';
      if (ds === today) cls += ' today';
      html += '<div class="' + cls + '" data-date="' + ds + '">' +
        '<span class="dnum">' + day + '</span>' +
        (name ? '<span class="mark">🎏</span>' : '') + '</div>';
    }
    grid.innerHTML = html;
  }
  function bindHoli() {
    $('holiGrid').addEventListener('click', function (e) {
      var cell = e.target.closest('.cal-cell');
      if (!cell) return;
      var ds = cell.getAttribute('data-date');
      var d = getData();
      if (d.holidays[ds]) {
        delete d.holidays[ds];
      } else {
        var name = prompt('节假日名称：', '法定节假日');
        if (name === null) return;
        d.holidays[ds] = name.trim() || '节假日';
      }
      save(d);
      renderHoli();
      if (state.activeTab === 'calc') renderCalc();
    });
    $('holiPrev').addEventListener('click', function () { state.holiYM = shiftYM(state.holiYM, -1); renderHoli(); });
    $('holiNext').addEventListener('click', function () { state.holiYM = shiftYM(state.holiYM, 1); renderHoli(); });
  }

  // ---------- 薪资试算 ----------
  function calcMonth(d, ymStr) {
    var p = parsedYM(ymStr);
    var days = new Date(p.y, p.m, 0).getDate();
    var c = d.config;
    var daily = (Number(c.base) || 0) / (Number(c.standardDays) || 21.75);
    var D = 0, N = 0, R = 0, hw = 0, hr = 0;
    for (var day = 1; day <= days; day++) {
      var ds = dateStr(p.y, p.m, day);
      var sh = d.shifts[ds];
      var isH = !!d.holidays[ds];
      if (sh === 'day') D++;
      else if (sh === 'night') N++;
      else if (sh === 'rest') R++;
      if (isH) { if (sh === 'day' || sh === 'night') hw++; else hr++; }
    }
    var base3 = daily * (D + N);
    var dayAllow = D * (Number(c.dayAllow) || 0);
    var nightAllow = N * (Number(c.nightAllow) || 0);
    var holiWork = hw * daily * (Number(c.holidayMult) || 3);
    var holiRest = (c.paidHolidayRest ? hr * daily : 0);

    var total = base3 + dayAllow + nightAllow + holiWork + holiRest;
    var itemLines = (c.items || []).map(function (it) {
      var amt = Number(it.amount) || 0;
      total += it.type === 'deduct' ? -amt : amt;
      return { name: it.name, type: it.type, amount: amt };
    });

    return {
      daily: daily, D: D, N: N, R: R, hw: hw, hr: hr,
      base3: base3, dayAllow: dayAllow, nightAllow: nightAllow,
      holiWork: holiWork, holiRest: holiRest, items: itemLines, total: total
    };
  }
  function renderCalc() {
    $('calcTitle').textContent = state.calcYM.replace('-', '年') + '月';
    var d = getData();
    var r = calcMonth(d, state.calcYM);
    var rows = '';
    rows += row('基本工资（出勤 ' + (r.D + r.N) + ' 天）', fmt(r.base3), 'daily=' + fmt(r.daily));
    if (r.dayAllow) rows += row('白班补贴（' + r.D + ' 天）', fmt(r.dayAllow));
    if (r.nightAllow) rows += row('夜班补贴（' + r.N + ' 天）', fmt(r.nightAllow));
    if (r.holiWork) rows += row('法定节假日工资（上班 ' + r.hw + ' 天 ×' + d.config.holidayMult + '）', fmt(r.holiWork));
    if (r.holiRest) rows += row('法定节假日带薪假（' + r.hr + ' 天）', fmt(r.holiRest));
    r.items.forEach(function (it) {
      rows += row(it.name, (it.type === 'deduct' ? '-' : '') + fmt(it.amount), '', it.type);
    });
    var html = '<div class="result-title">' + state.calcYM.replace('-', '年') + '月 薪资试算</div>' +
      rows +
      '<div class="result-total"><span>实发合计</span><span class="val">¥ ' + fmt(r.total) + '</span></div>';
    $('calcResult').innerHTML = html;
  }
  function row(label, val, sub, type) {
    return '<div class="result-row ' + (type || '') + '">' +
      '<span class="label">' + esc(label) + (sub ? ' <small>(' + esc(sub) + ')</small>' : '') + '</span>' +
      '<span class="val">¥ ' + esc(val) + '</span></div>';
  }
  function bindCalc() {
    $('calcPrev').addEventListener('click', function () { state.calcYM = shiftYM(state.calcYM, -1); renderCalc(); });
    $('calcNext').addEventListener('click', function () { state.calcYM = shiftYM(state.calcYM, 1); renderCalc(); });
  }

  // ---------- Tab 切换 ----------
  function showTab(name) {
    state.activeTab = name;
    document.querySelectorAll('.tab').forEach(function (s) { s.hidden = true; });
    $('tab-' + name).hidden = false;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    if (name === 'config') renderConfig();
    if (name === 'shifts') renderShifts();
    if (name === 'holidays') renderHoli();
    if (name === 'calc') renderCalc();
  }

  function renderAll() {
    renderUserSelect();
    renderConfig();
    renderShifts();
    renderHoli();
    renderCalc();
  }

  // ---------- 初始化 ----------
  function init() {
    ensureUsers();
    state.activeTab = 'config';
    bindConfig();
    bindShifts();
    bindHoli();
    bindCalc();
    $('userSelect').addEventListener('change', function () {
      state.user = this.value;
      renderAll();
      showTab(state.activeTab);
    });
    $('addUserBtn').addEventListener('click', addUser);
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });
    renderAll();
    showTab('config');
    registerSW();
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
