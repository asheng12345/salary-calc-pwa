/* 排班薪资计算器 · Apple 风格 PWA · 纯前端 localStorage
   薪资模型复刻原 PHP 版 index.html（固定月薪制 + 班次循环 + 工时比例 + 节假日倍率） */
(function () {
  'use strict';

  // ===== 常量 =====
  var CYCLE_WITH_NIGHT = ['day', 'day', 'rest', 'rest', 'night', 'night'];
  var CYCLE_NO_NIGHT = ['day', 'day', 'rest', 'rest'];
  var BASE_DAY = 3;
  var PROFILES_KEY = 'salaryProfiles';
  var USER_KEY = 'salaryCurrentUser';

  // ===== 状态 =====
  var profiles = loadProfiles();
  var currentUser = '';
  var cfg, salary, shifts, holidays;
  var viewYear, viewMonth;
  var modalDate = '', modalShift = 'day', modalHoliday = false;
  var timerInterval = null, minuteInterval = null;

  // ===== 工具 =====
  function $(id) { return document.getElementById(id); }
  function fmtDate(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function shiftTypeLabel(t) { return t === 'day' ? '白班' : t === 'night' ? '夜班' : '休息'; }
  function getShiftType(dateStr) { var s = shifts.find(function (x) { return x.date === dateStr; }); return s ? s.type : null; }
  function isHoliday(dateStr) { return holidays.indexOf(dateStr) >= 0; }
  function getDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function loadProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {}; } catch (e) { return {}; } }
  function defaultCfg() { return { dayStart: 9, dayEnd: 18, nightStart: 18, nightEnd: 9, dayShiftHours: 9, nightShiftHours: 15, enableNight: true }; }
  function defaultSalary() { return { baseSalary: 3000, postSalary: 1500, transport: 200, comm: 100, meal: 300, housing: 400, overtime: 0, bonus: 0, holidayRate: 2, cycleStart: 25 }; }
  function defaultProfile() { return { cfg: defaultCfg(), salary: defaultSalary(), shifts: [], holidays: [] }; }

  function persist() {
    if (!currentUser) return;
    profiles[currentUser] = { cfg: cfg, salary: salary, shifts: shifts, holidays: holidays };
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  function loadUser(name) {
    var p = profiles[name] || defaultProfile();
    cfg = Object.assign(defaultCfg(), p.cfg || {});
    salary = Object.assign(defaultSalary(), p.salary || {});
    if (salary.cycleStart === undefined) salary.cycleStart = 25;
    shifts = Array.isArray(p.shifts) ? p.shifts.slice() : [];
    holidays = Array.isArray(p.holidays) ? p.holidays.slice() : [];
  }

  // ===== 班次循环 =====
  function getCycle() { return cfg.enableNight ? CYCLE_WITH_NIGHT : CYCLE_NO_NIGHT; }
  function calcCycleShift(y, m, d) {
    var cycle = getCycle(), len = cycle.length;
    var anchor = new Date(y, m - 1, BASE_DAY);
    var target = new Date(y, m - 1, d);
    var diff = Math.round((target - anchor) / 86400000);
    var idx = ((diff % len) + len) % len;
    return cycle[idx];
  }
  function buildCycleMonthShift(y, m) {
    var days = getDaysInMonth(y, m), out = [];
    for (var d = 1; d <= days; d++) {
      var type = calcCycleShift(y, m, d);
      if (!cfg.enableNight && type === 'night') type = 'rest';
      out.push({ date: fmtDate(y, m, d), type: type });
    }
    return out;
  }
  function ensureMonthShifts(y, m) {
    var prefix = y + '-' + String(m).padStart(2, '0');
    var has = shifts.some(function (s) { return s.date.indexOf(prefix) === 0; });
    if (!has) {
      buildCycleMonthShift(y, m).forEach(function (g) {
        if (!shifts.find(function (s) { return s.date === g.date; })) shifts.push(g);
      });
      persist();
    }
  }

  // ===== 结算周期 =====
  function getCurrentCycleRange() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    var cs = salary.cycleStart || 25;
    if (cs === 1) return { startDate: fmtDate(y, m, 1), endDate: fmtDate(y, m, getDaysInMonth(y, m)) };
    if (d >= cs) {
      var em = m + 1, ey = y; if (em > 12) { em = 1; ey = y + 1; }
      return { startDate: fmtDate(y, m, cs), endDate: fmtDate(ey, em, cs) };
    } else {
      var sm = m - 1, sy = y; if (sm < 1) { sm = 12; sy = y - 1; }
      return { startDate: fmtDate(sy, sm, cs), endDate: fmtDate(y, m, cs) };
    }
  }
  function calcMonthlyTotal() {
    return salary.baseSalary + salary.postSalary + salary.transport + salary.comm + salary.meal + salary.housing + salary.overtime + salary.bonus;
  }

  // ===== 薪资计算（复刻原版固定月薪制） =====
  function baseCalc() {
    var range = getCurrentCycleRange();
    var cyc = shifts.filter(function (s) { return s.date >= range.startDate && s.date <= range.endDate; });
    var dayCount = cyc.filter(function (s) { return s.type === 'day'; }).length;
    var nightCount = cyc.filter(function (s) { return s.type === 'night'; }).length;
    var workDays = dayCount + nightCount;
    var monthlyTotal = calcMonthlyTotal();
    var monthTotalHours = dayCount * cfg.dayShiftHours + nightCount * cfg.nightShiftHours;
    var hourlyRate = monthTotalHours > 0 ? monthlyTotal / monthTotalHours : 0;
    var dailySalary = workDays > 0 ? monthlyTotal / workDays : 0;
    var baseDailySalary = workDays > 0 ? salary.baseSalary / workDays : 0;
    var holidayWorkDays = cyc.filter(function (s) { return s.type !== 'rest' && isHoliday(s.date); }).length;
    return { dayCount: dayCount, nightCount: nightCount, workDays: workDays, dailySalary: dailySalary, baseDailySalary: baseDailySalary, hourlyRate: hourlyRate, monthTotalHours: monthTotalHours, holidayWorkDays: holidayWorkDays, monthlyTotal: monthlyTotal, startDate: range.startDate, endDate: range.endDate };
  }

  function calcMoney() {
    var now = new Date();
    var todayStr = fmtDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    var b = baseCalc();
    var monthTotalHours = b.monthTotalHours, dailySalary = b.dailySalary, baseDailySalary = b.baseDailySalary;
    var dayCount = b.dayCount, nightCount = b.nightCount, holidayWorkDays = b.holidayWorkDays, monthlyTotal = b.monthlyTotal;
    var startDate = b.startDate, endDate = b.endDate;
    var todayIsHoliday = isHoliday(todayStr);

    var todaySeconds = 0, todayInfo = '', todayShift = getShiftType(todayStr), shiftHours = cfg.dayShiftHours;

    if (todayShift === 'rest') { todayInfo = '休息中'; shiftHours = 0; }
    else if (todayShift === 'day') {
      shiftHours = cfg.dayShiftHours;
      var s1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.dayStart, 0, 0);
      var e1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.dayEnd, 0, 0);
      if (now >= e1) { todaySeconds = cfg.dayShiftHours * 3600; todayInfo = '白班已完成' + (todayIsHoliday ? ' · 节假日' : ''); }
      else if (now >= s1) { todaySeconds = Math.floor((now - s1) / 1000); todayInfo = '工作中 ' + Math.floor(todaySeconds / 3600) + 'h' + Math.floor((todaySeconds % 3600) / 60) + 'm' + (todayIsHoliday ? ' · 节假日' : ''); }
      else { todayInfo = '白班 ' + String(cfg.dayStart).padStart(2, '0') + ':00 开始' + (todayIsHoliday ? ' · 节假日' : ''); }
    } else if (todayShift === 'night') {
      shiftHours = cfg.nightShiftHours;
      var yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      var ydStr = fmtDate(yest.getFullYear(), yest.getMonth() + 1, yest.getDate());
      var lastNightWasNight = getShiftType(ydStr) === 'night';
      var lastNightStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, cfg.nightStart, 0, 0);
      var lastNightEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.nightEnd, 0, 0);
      var tonightStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.nightStart, 0, 0);
      if (now >= tonightStart) {
        todaySeconds = Math.min(Math.floor((now - tonightStart) / 1000), cfg.nightShiftHours * 3600);
        todayInfo = '工作中 ' + Math.floor(todaySeconds / 3600) + 'h' + Math.floor((todaySeconds % 3600) / 60) + 'm' + (todayIsHoliday ? ' · 节假日' : '');
      } else if (lastNightWasNight && now < lastNightEnd && now >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)) {
        todaySeconds = Math.min(Math.floor((now - lastNightStart) / 1000), cfg.nightShiftHours * 3600);
        todayInfo = '工作中 ' + Math.floor(todaySeconds / 3600) + 'h' + Math.floor((todaySeconds % 3600) / 60) + 'm' + (todayIsHoliday ? ' · 节假日' : '');
      } else if (lastNightWasNight && now >= lastNightEnd) {
        todaySeconds = cfg.nightShiftHours * 3600; todayInfo = '夜班已完成' + (todayIsHoliday ? ' · 节假日' : '');
      } else { todayInfo = '夜班 ' + String(cfg.nightStart).padStart(2, '0') + ':00 开始' + (todayIsHoliday ? ' · 节假日' : ''); }
    }

    if (cfg.enableNight && todayShift !== 'night' && todaySeconds === 0) {
      var y2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      var yd2 = fmtDate(y2.getFullYear(), y2.getMonth() + 1, y2.getDate());
      if (getShiftType(yd2) === 'night') {
        var ns = new Date(y2.getFullYear(), y2.getMonth(), y2.getDate(), cfg.nightStart, 0, 0);
        var ne = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.nightEnd, 0, 0);
        if (now <= ne) { todaySeconds = Math.floor((now - ns) / 1000); shiftHours = cfg.nightShiftHours; todayInfo = '夜班收尾 ' + Math.floor(todaySeconds / 3600) + 'h' + Math.floor((todaySeconds % 3600) / 60) + 'm'; }
      }
    }

    var todayHolidayExtra = (todayIsHoliday && todayShift !== 'rest') ? baseDailySalary * (salary.holidayRate - 1) : 0;
    var todayFullPay = monthTotalHours > 0 ? monthlyTotal * (shiftHours / monthTotalHours) + todayHolidayExtra : 0;
    var todayMoney = shiftHours > 0 ? todayFullPay * (todaySeconds / (shiftHours * 3600)) : 0;

    var cyc = shifts.filter(function (s) { return s.date >= startDate && s.date <= endDate; });
    var completedMoney = 0, workedHours = 0;
    cyc.forEach(function (s) {
      if (s.date < todayStr && s.type !== 'rest') {
        var h = s.type === 'day' ? cfg.dayShiftHours : s.type === 'night' ? cfg.nightShiftHours : 0;
        var dayPay = monthTotalHours > 0 ? monthlyTotal * (h / monthTotalHours) : dailySalary;
        if (isHoliday(s.date)) dayPay += baseDailySalary * (salary.holidayRate - 1);
        completedMoney += dayPay; workedHours += h;
      }
    });
    workedHours += todaySeconds / 3600;
    var monthMoney = completedMoney + todayMoney;

    var totalHolidayExtra = 0;
    cyc.forEach(function (s) { if (s.type !== 'rest' && isHoliday(s.date)) totalHolidayExtra += baseDailySalary * (salary.holidayRate - 1); });
    var predictMoney = monthlyTotal + totalHolidayExtra;

    var rate = monthTotalHours > 0 ? Math.round((workedHours / monthTotalHours) * 100) : 0;
    var workedDays = shifts.filter(function (s) { return s.date >= startDate && s.date <= todayStr && s.type !== 'rest'; }).length;
    var totalWorkDays = dayCount + nightCount;

    return {
      todayMoney: todayMoney, monthMoney: monthMoney, predictMoney: predictMoney, workedHours: workedHours, rate: rate,
      todayInfo: todayInfo, todayShift: todayShift || 'rest', todayIsHoliday: todayIsHoliday, todayFullPay: todayFullPay,
      dayCount: dayCount, nightCount: nightCount, monthlyTotal: monthlyTotal, startDate: startDate, endDate: endDate,
      monthTotalHours: monthTotalHours, workedDays: workedDays, totalWorkDays: totalWorkDays
    };
  }

  // ===== 渲染 =====
  function setDynamic(info) {
    $('todayMoney').textContent = '¥' + info.todayMoney.toFixed(2);
    var badge = $('curShiftBadge');
    badge.textContent = shiftTypeLabel(info.todayShift);
    var sd = info.startDate, ed = info.endDate;
    $('todayProgress').textContent = '结算周期 ' + parseInt(sd.slice(5, 7)) + '月' + parseInt(sd.slice(8)) + '日 – ' + parseInt(ed.slice(5, 7)) + '月' + parseInt(ed.slice(8)) + '日' + (info.todayInfo ? ' · ' + info.todayInfo : '');
    $('heroProgress').style.width = Math.min(info.rate, 100) + '%';
    $('monthMoney').textContent = '¥' + Math.round(info.monthMoney);
    $('workedDaysCard').textContent = info.workedDays + ' / ' + info.totalWorkDays + ' 天';
    var tsh = info.todayShift === 'day' ? cfg.dayShiftHours : info.todayShift === 'night' ? cfg.nightShiftHours : 0;
    var thr = tsh > 0 ? info.todayFullPay / tsh : 0;
    $('todayHourly').textContent = info.todayShift === 'rest' ? '今日休息' : '¥' + thr.toFixed(1);
    $('hoursRate').textContent = info.workedHours.toFixed(1) + 'h / ' + Math.round(info.monthTotalHours) + 'h';
    var hb = $('holidayBadge');
    if (info.todayIsHoliday && info.todayShift !== 'rest') { hb.classList.remove('hidden'); hb.textContent = '节假日 ×' + salary.holidayRate; }
    else hb.classList.add('hidden');
  }

  function render() {
    var info = calcMoney();
    setDynamic(info);
    renderCalendar();
    renderCharts(info);
  }

  function renderCalendar() {
    $('calTitle').textContent = viewYear + '年' + viewMonth + '月';
    var grid = $('calGrid'); grid.innerHTML = '';
    var days = getDaysInMonth(viewYear, viewMonth);
    var f = new Date(viewYear, viewMonth - 1, 1).getDay();
    var offset = f === 0 ? 6 : f - 1;
    for (var i = 0; i < offset; i++) grid.appendChild(document.createElement('div'));
    var now = new Date();
    var todayStr = fmtDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    for (var d = 1; d <= days; d++) {
      var ds = fmtDate(viewYear, viewMonth, d);
      var type = getShiftType(ds), isToday = ds === todayStr, isHol = isHoliday(ds);
      var cell = document.createElement('div');
      cell.className = 'cal-day' + (type ? ' ' + type : '');
      if (isToday) cell.classList.add('today');
      var inner = '<div class="d">' + d + '</div><div class="t">' + (type ? shiftTypeLabel(type).slice(0, 1) : '') + '</div>';
      if (isHol) inner += '<span class="holi-dot"></span>';
      cell.innerHTML = inner;
      (function (dateStr, curType) { cell.onclick = function () { openShiftSheet(dateStr, curType); }; })(ds, type);
      grid.appendChild(cell);
    }
  }

  function renderCharts(info) {
    var range = getCurrentCycleRange();
    var cyc = shifts.filter(function (s) { return s.date >= range.startDate && s.date <= range.endDate; });
    var dayCount = cyc.filter(function (s) { return s.type === 'day'; }).length;
    var nightCount = cyc.filter(function (s) { return s.type === 'night'; }).length;
    var dayHours = dayCount * cfg.dayShiftHours, nightHours = nightCount * cfg.nightShiftHours;
    $('dayCountLabel').textContent = '白班 ' + dayCount + '天';
    $('nightCountLabel').textContent = '夜班 ' + nightCount + '天';

    // doughnut
    var svg = $('doughnut'), r = 44, c = 2 * Math.PI * r, total = dayHours + nightHours;
    var html = '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#e5e5ea" stroke-width="14"/>';
    if (total > 0) {
      var dayLen = dayHours / total * c;
      html += '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#007aff" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + dayLen + ' ' + (c - dayLen) + '" transform="rotate(-90 60 60)"/>';
      if (nightHours > 0 && cfg.enableNight) {
        var nightLen = nightHours / total * c;
        html += '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#5e5ce6" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + nightLen + ' ' + (c - nightLen) + '" stroke-dashoffset="' + (-dayLen) + '" transform="rotate(-90 60 60)"/>';
      }
    }
    html += '<text x="60" y="57" text-anchor="middle" font-size="15" font-weight="700" fill="#1c1c1e">' + total + 'h</text>';
    html += '<text x="60" y="73" text-anchor="middle" font-size="10" fill="#8e8e93">总工时</text>';
    svg.innerHTML = html;

    // line: 累计收益
    var sY = parseInt(range.startDate.slice(0, 4)), sM = parseInt(range.startDate.slice(5, 7)), sD = parseInt(range.startDate.slice(8));
    var eY = parseInt(range.endDate.slice(0, 4)), eM = parseInt(range.endDate.slice(5, 7)), eD = parseInt(range.endDate.slice(8));
    var cum = 0, labels = [], data = [];
    var cur = new Date(sY, sM - 1, sD), end = new Date(eY, eM - 1, eD);
    while (cur <= end) {
      var ds = fmtDate(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
      var s = cyc.find(function (x) { return x.date === ds; });
      if (s && s.type !== 'rest') {
        var h = s.type === 'day' ? cfg.dayShiftHours : s.type === 'night' ? cfg.nightShiftHours : 0;
        var pay = info.monthTotalHours > 0 ? info.monthlyTotal * (h / info.monthTotalHours) : info.dailySalary;
        if (isHoliday(ds)) pay += info.baseDailySalary * (salary.holidayRate - 1);
        cum += pay;
      }
      data.push(Math.round(cum * 100) / 100);
      cur.setDate(cur.getDate() + 1);
    }
    var svg2 = $('line'), W = 200, H = 120, pad = 8;
    if (data.length) {
      var max = Math.max.apply(null, data.concat([1]));
      var X = function (i) { return data.length <= 1 ? W / 2 : pad + i * (W - 2 * pad) / (data.length - 1); };
      var Y = function (v) { return H - pad - (v / max) * (H - 2 * pad); };
      var pts = data.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      var area = pad + ',' + (H - pad) + ' ' + pts + ' ' + (W - pad) + ',' + (H - pad);
      var g = '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#007aff" stop-opacity="0.28"/><stop offset="100%" stop-color="#007aff" stop-opacity="0"/></linearGradient></defs>';
      g += '<polygon points="' + area + '" fill="url(#lg)"/>';
      g += '<polyline points="' + pts + '" fill="none" stroke="#007aff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      svg2.innerHTML = g;
    } else svg2.innerHTML = '';
    $('predictLabel').textContent = '预计 ¥' + Math.round(info.predictMoney);
  }

  // ===== 月历翻页 =====
  function prevMonth() { viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; } ensureMonthShifts(viewYear, viewMonth); render(); }
  function nextMonth() { viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; } ensureMonthShifts(viewYear, viewMonth); render(); }

  // ===== 班次编辑 Sheet =====
  function openShiftSheet(date, type) {
    modalDate = date; modalShift = type || 'day'; modalHoliday = isHoliday(date);
    $('shiftTitle').textContent = '修改 ' + parseInt(date.slice(5, 7)) + '月' + parseInt(date.slice(8)) + '日 班次';
    updateShiftButtons();
    $('modalHoliday').checked = modalHoliday;
    showSheet('shiftSheet');
  }
  function selectShift(type) { modalShift = type; updateShiftButtons(); }
  function updateShiftButtons() {
    ['day', 'night', 'rest'].forEach(function (t) {
      var b = $('btn' + t[0].toUpperCase() + t.slice(1));
      b.className = t + (modalShift === t ? ' active ' + t : '');
    });
    $('btnNight').style.display = cfg.enableNight ? '' : 'none';
  }
  function saveShift() {
    var ex = shifts.find(function (s) { return s.date === modalDate; });
    if (ex) ex.type = modalShift; else shifts.push({ date: modalDate, type: modalShift });
    shifts.sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (modalHoliday && holidays.indexOf(modalDate) < 0) { holidays.push(modalDate); holidays.sort(); }
    else if (!modalHoliday && holidays.indexOf(modalDate) >= 0) holidays = holidays.filter(function (d) { return d !== modalDate; });
    persist(); closeSheets(); render();
    showToast(modalHoliday ? '班次已更新（节假日）' : '班次已更新');
  }

  // ===== 参数设置 Sheet =====
  function openSettingsSheet() {
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    $('inputDayStart').value = p2(cfg.dayStart) + ':00';
    $('inputDayEnd').value = p2(cfg.dayEnd) + ':00';
    var ns = cfg.enableNight ? cfg.nightStart : 18, ne = cfg.enableNight ? cfg.nightEnd : 9;
    $('inputNightStart').value = p2(ns) + ':00';
    $('inputNightEnd').value = p2(ne) + ':00';
    $('nightToggle').checked = cfg.enableNight;
    $('nightTimeWrap').style.display = cfg.enableNight ? '' : 'none';
    updateHoursCalc();
    showSheet('settingsSheet');
  }
  function updateHoursCalc() {
    var ph = function (v) { return parseInt((v || '0').split(':')[0]) || 0; };
    var ds = ph($('inputDayStart').value), de = ph($('inputDayEnd').value);
    var dh = de > ds ? de - ds : 24 - ds + de;
    $('dayHoursCalc').textContent = dh > 0 ? dh : '?';
    if (cfg.enableNight) {
      var ns = ph($('inputNightStart').value), ne = ph($('inputNightEnd').value);
      var nh = ne > ns ? ne - ns : 24 - ns + ne;
      $('nightHoursCalc').textContent = nh > 0 ? nh : '?';
    }
  }
  function toggleNight(checked) {
    cfg.enableNight = checked;
    if (!cfg.enableNight) {
      shifts.forEach(function (s) { if (s.type === 'night') s.type = 'rest'; });
    } else {
      var months = {}; shifts.forEach(function (s) { months[s.date.slice(0, 7)] = 1; });
      Object.keys(months).forEach(function (ym) {
        var y = parseInt(ym.slice(0, 4)), m = parseInt(ym.slice(5, 7));
        var gen = buildCycleMonthShift(y, m);
        gen.forEach(function (g) {
          var ex = shifts.find(function (s) { return s.date === g.date; });
          if (ex && ex.type === 'rest' && g.type === 'night') ex.type = 'night';
          else if (!ex) shifts.push(g);
        });
      });
      shifts.sort(function (a, b) { return a.date.localeCompare(b.date); });
    }
    persist(); render();
    showToast(cfg.enableNight ? '已启用夜班' : '已关闭夜班');
  }
  function saveSettings() {
    var ph = function (v) { return parseInt((v || '0').split(':')[0]) || 0; };
    cfg.dayStart = ph($('inputDayStart').value);
    cfg.dayEnd = ph($('inputDayEnd').value);
    cfg.dayShiftHours = cfg.dayEnd > cfg.dayStart ? cfg.dayEnd - cfg.dayStart : 24 - cfg.dayStart + cfg.dayEnd;
    if (cfg.dayShiftHours <= 0 || cfg.dayShiftHours > 24) { showToast('白班时间有误'); return; }
    if (cfg.enableNight) {
      cfg.nightStart = ph($('inputNightStart').value);
      cfg.nightEnd = ph($('inputNightEnd').value);
      cfg.nightShiftHours = cfg.nightEnd > cfg.nightStart ? cfg.nightEnd - cfg.nightStart : 24 - cfg.nightStart + cfg.nightEnd;
      if (cfg.nightShiftHours <= 0 || cfg.nightShiftHours > 24) { showToast('夜班时间有误'); return; }
    }
    persist(); closeSheets(); render(); showToast('参数已保存');
  }

  // ===== 工资组成 Sheet =====
  function openSalarySheet() {
    $('inputBaseSalary').value = salary.baseSalary;
    $('inputPostSalary').value = salary.postSalary;
    $('inputTransport').value = salary.transport;
    $('inputComm').value = salary.comm;
    $('inputMeal').value = salary.meal;
    $('inputHousing').value = salary.housing;
    $('inputOvertime').value = salary.overtime;
    $('inputBonus').value = salary.bonus;
    $('inputHolidayRate').value = salary.holidayRate;
    $('inputCycleStart').value = salary.cycleStart || 25;
    updateSalaryTotal();
    showSheet('salarySheet');
  }
  function updateSalaryTotal() {
    var sum = (parseFloat($('inputBaseSalary').value) || 0) + (parseFloat($('inputPostSalary').value) || 0) +
      (parseFloat($('inputTransport').value) || 0) + (parseFloat($('inputComm').value) || 0) +
      (parseFloat($('inputMeal').value) || 0) + (parseFloat($('inputHousing').value) || 0) +
      (parseFloat($('inputOvertime').value) || 0) + (parseFloat($('inputBonus').value) || 0);
    $('salaryTotal').textContent = '¥' + Math.round(sum);
  }
  function saveSalary() {
    var base = parseFloat($('inputBaseSalary').value), hol = parseFloat($('inputHolidayRate').value);
    if (isNaN(base) || base < 0) { showToast('请输入有效的基本工资'); return; }
    if (isNaN(hol) || hol < 1) { showToast('节假日倍率不能小于1'); return; }
    salary.baseSalary = base;
    salary.postSalary = parseFloat($('inputPostSalary').value) || 0;
    salary.transport = parseFloat($('inputTransport').value) || 0;
    salary.comm = parseFloat($('inputComm').value) || 0;
    salary.meal = parseFloat($('inputMeal').value) || 0;
    salary.housing = parseFloat($('inputHousing').value) || 0;
    salary.overtime = parseFloat($('inputOvertime').value) || 0;
    salary.bonus = parseFloat($('inputBonus').value) || 0;
    salary.holidayRate = hol;
    var cs = parseInt($('inputCycleStart').value);
    if (isNaN(cs) || cs < 1) cs = 1; if (cs > 28) cs = 28;
    salary.cycleStart = cs;
    persist(); closeSheets(); render(); showToast('工资组成已保存');
  }

  // ===== CSV 导入导出 =====
  function exportCSV() {
    var ym = viewYear + '-' + String(viewMonth).padStart(2, '0');
    var rows = [['日期', '班次', '节假日']];
    shifts.filter(function (s) { return s.date.indexOf(ym) === 0; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (s) {
      rows.push([s.date, shiftTypeLabel(s.type), isHoliday(s.date) ? '是' : '']);
    });
    var csv = rows.map(function (r) { return r.join(','); }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '排班_' + viewYear + '年' + viewMonth + '月.csv'; a.click();
    showToast('已导出 CSV');
  }
  function importCSV(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var lines = ev.target.result.split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (lines.length < 2) { showToast('文件为空或格式不对'); return; }
      var header = lines[0].split(',').map(function (h) { return h.trim(); });
      var dCol = header.findIndex(function (h) { return h.indexOf('日期') >= 0; }); if (dCol < 0) dCol = 0;
      var sCol = header.findIndex(function (h) { return h.indexOf('班次') >= 0; }); if (sCol < 0) sCol = 1;
      var hCol = header.findIndex(function (h) { return h.indexOf('节假日') >= 0; });
      var imported = 0;
      for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].split(',');
        var date = (cols[dCol] || '').trim(), shift = (cols[sCol] || '').trim().toLowerCase(), hol = hCol >= 0 ? (cols[hCol] || '').trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        var type = '';
        if (shift.indexOf('白') >= 0 || shift === 'day') type = 'day';
        else if (shift.indexOf('夜') >= 0 || shift === 'night') type = 'night';
        else if (shift.indexOf('休') >= 0 || shift === 'rest') type = 'rest';
        else continue;
        if (!cfg.enableNight && type === 'night') type = 'rest';
        var ex = shifts.find(function (s) { return s.date === date; });
        if (ex) ex.type = type; else shifts.push({ date: date, type: type });
        var isHol = hol.indexOf('节') >= 0 || hol === '是' || hol === '1' || hol.toLowerCase() === 'true' || hol === 'holiday';
        if (isHol && holidays.indexOf(date) < 0) { holidays.push(date); holidays.sort(); }
        else if (!isHol && holidays.indexOf(date) >= 0) holidays = holidays.filter(function (d) { return d !== date; });
        imported++;
      }
      shifts.sort(function (a, b) { return a.date.localeCompare(b.date); });
      persist(); render(); showToast('导入成功 ' + imported + ' 条');
    };
    reader.readAsText(file); e.target.value = '';
  }

  // ===== Sheet 控制 =====
  function showSheet(id) { $('scrim').classList.add('show'); $(id).classList.add('show'); }
  function closeSheets() { $('scrim').classList.remove('show'); var s = document.querySelectorAll('.sheet'); for (var i = 0; i < s.length; i++) s[i].classList.remove('show'); }

  // ===== 登录 =====
  function showLogin() { $('login').style.display = 'flex'; $('page').hidden = true; $('tabbar').hidden = true; }
  function hideLogin() { $('login').style.display = 'none'; $('page').hidden = false; $('tabbar').hidden = false; }
  function loginSubmit() {
    var name = $('nameInput').value.trim();
    if (!name) { $('loginError').textContent = '名字不能为空'; return; }
    $('loginError').textContent = '';
    currentUser = name; localStorage.setItem(USER_KEY, name);
    if (!profiles[name]) profiles[name] = defaultProfile();
    loadUser(name);
    var now = new Date(); viewYear = now.getFullYear(); viewMonth = now.getMonth() + 1;
    ensureMonthShifts(viewYear, viewMonth);
    hideLogin(); $('userLabel').textContent = name; render(); startTimer();
    showToast('欢迎，' + name);
  }
  function switchUser() {
    currentUser = ''; localStorage.removeItem(USER_KEY); stopTimer();
    $('nameInput').value = ''; showLogin();
  }

  // ===== Toast / Timer =====
  var toastTimer = null;
  function showToast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (minuteInterval) clearInterval(minuteInterval);
    timerInterval = setInterval(function () { setDynamic(calcMoney()); }, 1000);
    minuteInterval = setInterval(function () { render(); }, 60000);
  }
  function stopTimer() { if (timerInterval) clearInterval(timerInterval); if (minuteInterval) clearInterval(minuteInterval); }

  // ===== 初始化 =====
  function init() {
    var now = new Date(); viewYear = now.getFullYear(); viewMonth = now.getMonth() + 1;
    currentUser = localStorage.getItem(USER_KEY) || '';
    if (currentUser && profiles[currentUser]) {
      loadUser(currentUser);
      ensureMonthShifts(viewYear, viewMonth);
      $('userLabel').textContent = currentUser;
      hideLogin(); render(); startTimer();
    } else {
      showLogin();
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // 内联 onclick/onchange 处理器只能调用全局函数，故将 IIFE 内函数挂到 window
  window.loginSubmit = loginSubmit;
  window.switchUser = switchUser;
  window.prevMonth = prevMonth;
  window.nextMonth = nextMonth;
  window.openSettingsSheet = openSettingsSheet;
  window.openSalarySheet = openSalarySheet;
  window.closeSheets = closeSheets;
  window.selectShift = selectShift;
  window.saveShift = saveShift;
  window.exportCSV = exportCSV;
  window.saveSettings = saveSettings;
  window.saveSalary = saveSalary;
  window.toggleNight = toggleNight;
  window.importCSV = importCSV;

  document.addEventListener('DOMContentLoaded', init);
})();
