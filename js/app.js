(function () {
  'use strict';

  var D = window.FLOOD_DATA;
  var DICT = window.I18N;
  var STALE_HOURS = 24;
  var RANK = { crit: 3, nya: 2, norm: 1, nodata: 0 };
  var GLYPH = { crit: '!!', nya: '!', norm: '', nodata: '?' };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------- Данные ---------- */
  var dates = Array.from(new Set([].concat.apply([], D.posts.map(function (p) { return p.series.map(function (s) { return s.date; }); })))).sort();
  var lastIdx = dates.length - 1;
  var levels = {};
  D.posts.forEach(function (p) {
    var m = {};
    p.series.forEach(function (s) { m[s.date] = s.level_cm; });
    levels[p.id] = m;
  });
  var postById = {};
  D.posts.forEach(function (p) { postById[p.id] = p; });

  function levelOn(p, date) { var v = levels[p.id][date]; return v == null ? null : v; }

  function stateOf(p, idx) {
    var date = dates[idx];
    var level = levelOn(p, date);
    if (level == null) return { date: date, level: null, delta: null, status: 'nodata', margin: null, fill: null };
    var prev = idx > 0 ? levelOn(p, dates[idx - 1]) : null;
    return {
      date: date,
      level: level,
      delta: prev == null ? null : level - prev,
      status: level >= p.crit ? 'crit' : level >= p.nya ? 'nya' : 'norm',
      margin: p.crit - level,
      fill: level / p.crit
    };
  }

  function parseDate(iso) { var a = iso.split('-'); return new Date(+a[0], a[1] - 1, +a[2]); }
  function localIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayDiff(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 864e5); }
  function hoursAgo(ts) { return (Date.now() - new Date(ts).getTime()) / 36e5; }

  /* ---------- Состояние ---------- */
  var urlLang = new URLSearchParams(location.search).get('lang');
  var state = {
    lang: (urlLang && DICT[urlLang]) ? urlLang : (DICT[store.get('lang')] ? store.get('lang') : 'ru'),
    idx: lastIdx,
    selected: null,
    sort: { key: 'danger', dir: -1 },
    threshold: Number(store.get('threshold')) || 25,
    timer: null
  };

  function t(key, vars) {
    var s = DICT[state.lang][key];
    if (s == null) s = DICT.ru[key];
    if (s == null) return key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
    return s;
  }
  // Свои названия месяцев: не во всех браузерах есть данные локали kk-KZ.
  function dmy(d, monthsKey, withYear) {
    var mon = t(monthsKey)[d.getMonth()];
    if (state.lang === 'kk') return (withYear ? d.getFullYear() + ' ж. ' : '') + d.getDate() + ' ' + mon;
    return d.getDate() + ' ' + mon + (withYear ? ' ' + d.getFullYear() + ' г.' : '');
  }
  function fmtDate(iso, long) { return dmy(parseDate(iso), 'months', long); }
  function fmtShort(iso) { return dmy(parseDate(iso), 'months_short', false); }
  function fmtDateTime(ts) {
    var d = new Date(ts);
    return dmy(d, 'months', false) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
  function river(p) { return state.lang === 'kk' ? (p.river_kk || p.river) : p.river; }
  function place(p) { return state.lang === 'kk' ? (p.place_kk || p.place) : p.place; }
  function postName(p) { return (state.lang === 'kk' ? river(p) + ' өз.' : 'р. ' + river(p)) + ' — ' + place(p); }
  function statusText(s) { return t('st_' + s); }

  /* ---------- Статичные тексты ---------- */
  function renderStatic() {
    document.documentElement.lang = state.lang;
    document.title = t('title');
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)); });
    $('#kpis').setAttribute('aria-label', t('title'));

    $('#contacts').innerHTML = t('contacts').map(function (c) {
      var num = c.num
        ? '<a class="tel" href="tel:' + c.num + '">' + c.num + '</a>'
        : '<span class="tel unknown">' + esc(t('help_verify')) + '</span>';
      return '<li>' + num + '<span>' + esc(c.label) + '</span></li>';
    }).join('');
    $('#memo').innerHTML = t('memo').map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
    $('#threshold').value = state.threshold;
    updatePlayButton();
  }

  /* ---------- Дата ---------- */
  var slider = $('#slider');
  slider.max = lastIdx;

  function setIdx(i) {
    state.idx = Math.max(0, Math.min(lastIdx, i));
    renderDynamic();
  }
  function updatePlayButton() {
    var b = $('#play');
    var playing = !!state.timer;
    b.innerHTML = '<span aria-hidden="true">' + (playing ? '❚❚' : '▶') + '</span>';
    b.setAttribute('aria-label', playing ? t('pause') : t('play'));
    b.title = playing ? t('pause') : t('play');
  }
  function stop() { clearInterval(state.timer); state.timer = null; updatePlayButton(); }
  function play() {
    if (state.idx >= lastIdx) setIdx(Math.max(0, lastIdx - 45));
    state.timer = setInterval(function () {
      if (state.idx >= lastIdx) { stop(); return; }
      setIdx(state.idx + 1);
    }, 320);
    updatePlayButton();
  }

  /* ---------- Уведомления ---------- */
  function renderNotices() {
    var html = '';
    var latestUpdate = D.posts.reduce(function (m, p) { return p.updated_at > m ? p.updated_at : m; }, D.generated_at || '');
    var h = hoursAgo(latestUpdate);
    if (h > STALE_HOURS) {
      html += '<div class="notice stale" role="alert"><span class="ico">⚠</span><span>' +
        esc(t('stale', { t: fmtDateTime(latestUpdate), h: Math.floor(h) })) + '</span></div>';
    }
    if (state.idx < lastIdx) {
      html += '<div class="notice history"><span class="ico">⏱</span><span>' + esc(t('history', { d: fmtDate(dates[state.idx], true) })) + '</span></div>';
    }
    if (D.demo) {
      html += '<div class="notice demo"><span class="ico">ℹ</span><span>' + esc(t('demo_note')) + '</span></div>';
    }
    $('#notices').innerHTML = html;
  }

  /* ---------- KPI ---------- */
  function renderKpis() {
    var st = D.posts.map(function (p) { return { p: p, s: stateOf(p, state.idx) }; });
    var crit = st.filter(function (x) { return x.s.status === 'crit'; }).length;
    var nya = st.filter(function (x) { return x.s.status === 'nya'; }).length;
    var fastest = st.filter(function (x) { return x.s.delta != null; })
      .sort(function (a, b) { return b.s.delta - a.s.delta; })[0];
    var n = D.posts.length;

    var rise;
    if (fastest && fastest.s.delta > 0) {
      rise = '<div class="value">' + signed(fastest.s.delta) + ' <small>' + esc(t('cm_day')) + '</small></div>' +
        '<div class="sub"><button type="button" class="sub-link" data-select="' + fastest.p.id + '">' + esc(postName(fastest.p)) + '</button></div>';
    } else {
      rise = '<div class="value">—</div><div class="sub">' + esc(t('no_rise')) + '</div>';
    }

    var snow;
    if (D.snow && D.snow.pct != null) {
      snow = '<div class="value">' + D.snow.pct + '<small>%</small></div><div class="sub">' +
        esc(t('kpi_snow_sub', { src: D.snow.source, d: fmtShort(D.snow.date) })) + '</div>';
    } else {
      snow = '<div class="value">—</div><div class="sub">' + esc(t('no_data')) + '</div>';
    }

    $('#kpis').innerHTML =
      '<div class="kpi k-crit' + (crit ? ' active' : '') + '"><div class="label">' + esc(t('kpi_crit')) + '</div>' +
        '<div class="value">' + crit + '</div><div class="sub">' + esc(t('kpi_of', { n: n })) + '</div></div>' +
      '<div class="kpi k-nya' + (nya ? ' active' : '') + '"><div class="label">' + esc(t('kpi_nya')) + '</div>' +
        '<div class="value">' + nya + '</div><div class="sub">' + esc(t('kpi_nya_sub')) + ' · ' + esc(t('kpi_of', { n: n })) + '</div></div>' +
      '<div class="kpi k-rise"><div class="label">' + esc(t('kpi_rise')) + '</div>' + rise + '</div>' +
      '<div class="kpi k-snow"><div class="label">' + esc(t('kpi_snow')) + '</div>' + snow + '</div>';
  }

  /* ---------- Карта ---------- */
  var map = null, markers = {};

  function initMap() {
    if (!window.L) {
      $('#map').innerHTML = '<div class="map-fallback">' + esc(t('map_unavailable')) + '</div>';
      return;
    }
    map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    map.on('mouseout', function () { map.scrollWheelZoom.disable(); });

    var bounds = [];
    D.posts.forEach(function (p) {
      var m = L.marker([p.lat, p.lon], { keyboard: true, riseOnHover: true });
      m.bindTooltip('', { direction: 'top', offset: [0, -12], className: 'tip' });
      m.on('click', function () { select(p.id, { from: 'map' }); });
      m.addTo(map);
      markers[p.id] = m;
      bounds.push([p.lat, p.lon]);
    });
    // Пока пользователь не двигал карту, подгоняем охват под размер контейнера
    // (контейнер может иметь нулевой размер при загрузке в скрытой вкладке).
    var touched = false;
    var fit = function () { map.invalidateSize(); if (!touched) map.fitBounds(bounds, { padding: [30, 30], animate: false }); };
    map.on('zoomstart movestart', function (e) { if (e.hard !== true && fitting === false) touched = true; });
    var fitting = true;
    fit();
    fitting = false;
    if (window.ResizeObserver) new ResizeObserver(function () { fitting = true; fit(); fitting = false; }).observe($('#map'));
  }

  function renderMap() {
    if (!map) return;
    D.posts.forEach(function (p) {
      var s = stateOf(p, state.idx);
      var m = markers[p.id];
      var sel = p.id === state.selected;
      m.setIcon(L.divIcon({
        className: '',
        html: '<span class="pin pin-' + s.status + (sel ? ' sel' : '') + '">' + GLYPH[s.status] + '</span>',
        iconSize: [22, 22], iconAnchor: [11, 11]
      }));
      m.setZIndexOffset(sel ? 1000 : RANK[s.status] * 100);
      if (m._icon) m._icon.setAttribute('aria-label', postName(p) + ': ' + statusText(s.status));
      var tip = '<b>' + esc(postName(p)) + '</b>';
      if (s.level != null) {
        tip += t('level_now') + ': <strong>' + s.level + ' ' + t('cm') + '</strong><br>' +
          t('delta_day') + ': ' + (s.delta == null ? '—' : signed(s.delta) + ' ' + t('cm')) + '<br>';
      }
      tip += '<span class="st-' + s.status + '"><strong>' + esc(statusText(s.status)) + '</strong></span>';
      m.setTooltipContent(tip);
    });
  }

  /* ---------- Карточка поста ---------- */
  function renderCard() {
    var el = $('#card');
    var p = postById[state.selected];
    if (!p) { el.innerHTML = '<div class="card-empty">' + esc(t('pick_post')) + '</div>'; return; }
    var s = stateOf(p, state.idx);
    var isLatest = state.idx === lastIdx;

    var deltaHtml = '—', trend = '';
    if (s.delta != null) {
      var cls = s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : '';
      deltaHtml = '<span class="' + cls + '">' + signed(s.delta) + '</span> <small>' + esc(t('cm_day')) + '</small>';
      trend = t(s.delta > 0 ? 'trend_up' : s.delta < 0 ? 'trend_down' : 'trend_flat');
    }

    var marginMetric;
    if (s.level == null) {
      marginMetric = '<div class="metric"><div class="m-label">' + esc(t('margin')) + '</div><div class="m-val">—</div></div>';
    } else if (s.level >= p.crit) {
      marginMetric = '<div class="metric bad"><div class="m-label">' + esc(t('over')) + '</div><div class="m-val">' +
        (s.level - p.crit) + ' <small>' + esc(t('cm')) + '</small></div><div class="m-note">' + esc(t('crit_short')) + ' ' + p.crit + ' ' + esc(t('cm')) + '</div></div>';
    } else {
      marginMetric = '<div class="metric"><div class="m-label">' + esc(t('margin')) + '</div><div class="m-val">' +
        s.margin + ' <small>' + esc(t('cm')) + '</small></div><div class="m-note">' + esc(t('crit_short')) + ' ' + p.crit + ' · ' + esc(t('nya_short')) + ' ' + p.nya + ' ' + esc(t('cm')) + '</div></div>';
    }

    var peak;
    if (!isLatest) peak = '<span class="muted">—</span><div class="m-note">' + esc(t('peak_latest_only')) + '</div>';
    else if (!p.peak_date) peak = '<span class="muted peak">' + esc(t('no_fc')) + '</span>';
    else if (p.peak_date < dates[state.idx]) peak = '<span class="peak">' + esc(t('peak_passed', { d: fmtShort(p.peak_date) })) + '</span>';
    else peak = '<span class="peak">' + esc(fmtDate(p.peak_date)) + '</span>';

    var stale = hoursAgo(p.updated_at) > STALE_HOURS;

    el.innerHTML =
      '<div class="card-head"><h2>' + esc(state.lang === 'kk' ? river(p) + ' өз.' : 'р. ' + river(p)) +
        ' <span class="place">— ' + esc(place(p)) + '</span></h2>' +
        '<span class="badge badge-' + s.status + '">' + esc(statusText(s.status)) + '</span></div>' +
      '<div class="metrics">' +
        '<div class="metric"><div class="m-label">' + esc(t('level_now')) + '</div><div class="m-val">' +
          (s.level == null ? '—' : s.level + ' <small>' + esc(t('cm')) + '</small>') + '</div><div class="m-note">' + esc(fmtDate(s.date)) + '</div></div>' +
        '<div class="metric"><div class="m-label">' + esc(t('delta_day')) + '</div><div class="m-val">' + deltaHtml + '</div><div class="m-note">' + esc(trend) + '</div></div>' +
        marginMetric +
        '<div class="metric"><div class="m-label">' + esc(t('peak')) + '</div><div class="m-val">' + peak + '</div></div>' +
      '</div>' +
      '<figure class="chart-box"><figcaption>' + esc(t('chart_title')) + '</figcaption><div id="chart-host"></div>' +
        '<ul class="chart-legend">' +
          '<li><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#1f6fb2" stroke-width="2.5"/></svg>' + esc(t('chart_obs')) + '</li>' +
          (isLatest && p.forecast && p.forecast.length ? '<li><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#1f6fb2" stroke-width="2.5" stroke-dasharray="4 3"/></svg>' + esc(t('chart_fc')) + '</li>' : '') +
          '<li><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#d99100" stroke-width="2" stroke-dasharray="6 3"/></svg>' + esc(t('nya_short')) + '</li>' +
          '<li><svg width="22" height="10"><rect x="0" y="0" width="22" height="10" fill="rgba(210,58,44,.12)"/><line x1="0" y1="9" x2="22" y2="9" stroke="#d23a2c" stroke-width="2"/></svg>' + esc(t('chart_zone')) + '</li>' +
        '</ul></figure>' +
      '<div class="card-meta"><span>' + esc(t('updated')) + ': ' + esc(fmtDateTime(p.updated_at)) + '</span>' +
        (p.source ? '<span>' + esc(t('source')) + ': <a href="' + esc(p.source) + '" target="_blank" rel="noopener">' + esc(t('kgm')) + ', ' + esc(t('source_link')) + '</a></span>' : '') +
        (stale ? '<span class="post-stale">⚠ ' + esc(t('post_stale')) + '</span>' : '') +
      '</div>';

    drawChart(p);
  }

  function niceStep(span) {
    var raw = span / 5;
    var steps = [5, 10, 20, 25, 50, 100, 200, 250, 500];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i];
    return 1000;
  }

  function drawChart(p) {
    var host = $('#chart-host');
    if (!host) return;
    var idx = state.idx;
    var W = Math.max(280, Math.round(host.clientWidth || 500));
    var H = W < 420 ? 220 : 250;
    var labelLen = Math.max((t('nya_short') + ' ' + p.nya).length, (t('crit_short') + ' ' + p.crit).length);
    var m = { l: 38, r: Math.round(labelLen * 6.8 + 12), t: 10, b: 24 };

    var start = Math.max(0, idx - 29);
    var obs = [];
    for (var i = start; i <= idx; i++) {
      var v = levelOn(p, dates[i]);
      if (v != null) obs.push({ x: i, v: v, date: dates[i] });
    }
    var fc = (idx === lastIdx && p.forecast && p.forecast.length && obs.length)
      ? p.forecast.map(function (f) { return { x: idx + dayDiff(dates[idx], f.date), v: f.level_cm, date: f.date, fc: true }; })
      : [];
    var all = obs.concat(fc);
    if (!all.length) { host.innerHTML = '<p class="muted">' + esc(t('no_data')) + '</p>'; return; }

    var xMin = start, xMax = fc.length ? fc[fc.length - 1].x : idx;
    var vals = all.map(function (o) { return o.v; }).concat([p.nya, p.crit]);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var padV = (hi - lo) * 0.1 + 10;
    var step = niceStep(hi - lo + 2 * padV);
    lo = Math.floor((lo - padV) / step) * step;
    hi = Math.ceil((hi + padV) / step) * step;

    var X = function (x) { return m.l + (x - xMin) / Math.max(1, xMax - xMin) * (W - m.l - m.r); };
    var Y = function (v) { return m.t + (hi - v) / (hi - lo) * (H - m.t - m.b); };
    var x0 = m.l, x1 = W - m.r;

    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc(t('chart_title') + ': ' + postName(p)) + '">';
    // зона выше ОЯ
    svg += '<rect x="' + x0 + '" y="' + m.t + '" width="' + (x1 - x0) + '" height="' + Math.max(0, Y(p.crit) - m.t) + '" fill="rgba(210,58,44,.10)"/>';
    // сетка
    for (var g = lo; g <= hi; g += step) {
      svg += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="#e8edf1"/>';
      svg += '<text x="' + (x0 - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + '</text>';
    }
    // подписи дат
    var every = W < 420 ? 10 : 5;
    for (var d = xMax; d >= xMin; d -= every) {
      var iso = d <= lastIdx ? dates[d] : (fc.filter(function (f) { return f.x === d; })[0] || {}).date;
      if (!iso) continue;
      svg += '<line x1="' + X(d) + '" x2="' + X(d) + '" y1="' + (H - m.b) + '" y2="' + (H - m.b + 4) + '" stroke="#b8c2cc"/>';
      svg += '<text x="' + X(d) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(fmtShort(iso)) + '</text>';
    }
    // пороги
    svg += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(p.nya) + '" y2="' + Y(p.nya) + '" stroke="#d99100" stroke-width="1.5" stroke-dasharray="6 3"/>';
    svg += '<text class="thr-label" x="' + (x1 + 6) + '" y="' + (Y(p.nya) + 4) + '" style="fill:#8a5a00">' + esc(t('nya_short')) + ' ' + p.nya + '</text>';
    svg += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(p.crit) + '" y2="' + Y(p.crit) + '" stroke="#d23a2c" stroke-width="1.8"/>';
    svg += '<text class="thr-label" x="' + (x1 + 6) + '" y="' + (Y(p.crit) + 4) + '" style="fill:#a8261b">' + esc(t('crit_short')) + ' ' + p.crit + '</text>';
    // линия даты бюллетеня
    if (fc.length) svg += '<line x1="' + X(idx) + '" x2="' + X(idx) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="#9fb0bf" stroke-dasharray="2 3"/>';
    // наблюдения
    var path = obs.map(function (o, k) { return (k ? 'L' : 'M') + X(o.x).toFixed(1) + ' ' + Y(o.v).toFixed(1); }).join('');
    svg += '<path d="' + path + '" fill="none" stroke="#1f6fb2" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    // прогноз
    if (fc.length) {
      var lastObs = obs[obs.length - 1];
      var fpath = 'M' + X(lastObs.x) + ' ' + Y(lastObs.v) + fc.map(function (o) { return 'L' + X(o.x).toFixed(1) + ' ' + Y(o.v).toFixed(1); }).join('');
      svg += '<path d="' + fpath + '" fill="none" stroke="#1f6fb2" stroke-width="2.5" stroke-dasharray="5 4" stroke-linecap="round"/>';
      fc.forEach(function (o) { svg += '<circle cx="' + X(o.x) + '" cy="' + Y(o.v) + '" r="2.5" fill="#fff" stroke="#1f6fb2" stroke-width="1.5"/>'; });
    }
    var lo2 = obs[obs.length - 1];
    svg += '<circle cx="' + X(lo2.x) + '" cy="' + Y(lo2.v) + '" r="4.5" fill="#1f6fb2" stroke="#fff" stroke-width="2"/>';
    // hover
    svg += '<g class="hover" style="display:none"><line y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="#5b6b7a" stroke-width="1"/>' +
      '<circle r="4" fill="#fff" stroke="#15202b" stroke-width="2"/>' +
      '<rect rx="6" height="36" fill="#15202b" opacity=".92"/>' +
      '<text class="h1" style="fill:#fff;font-weight:700;font-size:12px"></text><text class="h2" style="fill:#cfd8e0;font-size:11px"></text></g>';
    svg += '<rect class="hit" x="' + x0 + '" y="' + m.t + '" width="' + (x1 - x0) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/>';
    svg += '</svg>';
    host.innerHTML = svg;

    var el = host.querySelector('svg');
    var hov = el.querySelector('.hover');
    function show(ev) {
      var r = el.getBoundingClientRect();
      var vx = (ev.clientX - r.left) / r.width * W;
      var best = all[0], bd = Infinity;
      all.forEach(function (o) { var dd = Math.abs(X(o.x) - vx); if (dd < bd) { bd = dd; best = o; } });
      var cx = X(best.x), cy = Y(best.v);
      hov.style.display = '';
      var ln = hov.querySelector('line'); ln.setAttribute('x1', cx); ln.setAttribute('x2', cx);
      var c = hov.querySelector('circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy);
      var t1 = best.v + ' ' + t('cm');
      var t2 = fmtShort(best.date) + (best.fc ? ' · ' + t('chart_fc').toLowerCase() : '');
      var bw = Math.max(t1.length * 7.5, t2.length * 6.2) + 16;
      var bx = cx + 10 + bw > W ? cx - 10 - bw : cx + 10;
      var by = Math.max(m.t, Math.min(cy - 18, H - m.b - 36));
      var rect = hov.querySelector('rect'); rect.setAttribute('x', bx); rect.setAttribute('y', by); rect.setAttribute('width', bw);
      var h1 = hov.querySelector('.h1'); h1.textContent = t1; h1.setAttribute('x', bx + 8); h1.setAttribute('y', by + 15);
      var h2 = hov.querySelector('.h2'); h2.textContent = t2; h2.setAttribute('x', bx + 8); h2.setAttribute('y', by + 29);
    }
    el.addEventListener('pointermove', show);
    el.addEventListener('pointerdown', show);
    el.addEventListener('pointerleave', function () { hov.style.display = 'none'; });
  }

  /* ---------- Таблица ---------- */
  var DEFAULT_DIR = { danger: -1, name: 1, level: -1, delta: -1, margin: 1, fill: -1 };

  function sortValue(key, p, s) {
    if (key === 'danger') return RANK[s.status] * 10 + (s.fill || 0);
    if (key === 'level') return s.level;
    if (key === 'delta') return s.delta;
    if (key === 'margin') return s.margin;
    if (key === 'fill') return s.fill;
    return 0;
  }

  function renderTable() {
    var key = state.sort.key, dir = state.sort.dir;
    var rows = D.posts.map(function (p) { return { p: p, s: stateOf(p, state.idx) }; });
    rows.sort(function (a, b) {
      var va = sortValue(key, a.p, a.s), vb = sortValue(key, b.p, b.s);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va === vb) return (RANK[b.s.status] - RANK[a.s.status]) || ((b.s.fill || 0) - (a.s.fill || 0));
      return (va - vb) * dir;
    });

    $$('#posts th').forEach(function (th) {
      var k = th.dataset.sort;
      if (k === key) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      if (k === 'danger') th.querySelector('button').title = t('sort_danger');
    });

    var SCALE = 1.3;
    $('#posts tbody').innerHTML = rows.map(function (r) {
      var p = r.p, s = r.s;
      var sel = p.id === state.selected;
      var fillW = s.fill == null ? 0 : Math.min(1, s.fill / SCALE) * 100;
      var color = s.status === 'crit' ? 'var(--crit)' : s.status === 'nya' ? 'var(--nya)' : 'var(--norm)';
      var deltaCls = s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : '';
      return '<tr data-id="' + p.id + '"' + (sel ? ' class="sel" aria-selected="true"' : '') + '>' +
        '<td><button type="button" class="post-btn"><span class="dot dot-' + s.status + '"></span><span>' +
          '<b>' + esc(river(p)) + '</b> — ' + esc(place(p)) + '<small class="st-' + s.status + '">' + esc(statusText(s.status)) + '</small></span></button></td>' +
        '<td class="num"><b>' + (s.level == null ? '—' : s.level) + '</b></td>' +
        '<td class="num ' + deltaCls + '">' + (s.delta == null ? '—' : signed(s.delta)) + '</td>' +
        '<td class="num' + (s.margin != null && s.margin <= 0 ? ' up' : '') + '">' + (s.margin == null ? '—' : signed(s.margin).replace('+', '')) + '</td>' +
        '<td class="fill-col"><div class="fill-cell"><div class="bar" aria-hidden="true">' +
          '<span style="width:' + fillW.toFixed(1) + '%;background:' + color + '"></span>' +
          '<i style="left:' + (p.nya / p.crit / SCALE * 100).toFixed(1) + '%"></i>' +
          '<i class="t-crit" style="left:' + (100 / SCALE).toFixed(1) + '%"></i></div>' +
          '<small>' + (s.fill == null ? '—' : Math.round(s.fill * 100) + '%') + '</small></div></td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- Предупреждения ---------- */
  var SEV = { crit: 3, nya: 2, info: 1 };

  function renderWarnings() {
    var list = [];
    D.posts.forEach(function (p) {
      var s = stateOf(p, state.idx);
      if (s.level == null) return;
      var name = postName(p);
      var rank = s.fill;
      if (s.status === 'crit') list.push({ sev: 3, kind: 'auto', title: t('w_crit'), text: t('w_crit_t', { post: name, lvl: s.level, x: s.level - p.crit }), id: p.id, rank: rank });
      else if (s.status === 'nya') list.push({ sev: 2, kind: 'auto', title: t('w_nya'), text: t('w_nya_t', { post: name, lvl: s.level, x: p.crit - s.level }), id: p.id, rank: rank });
      if (s.delta != null && s.delta >= state.threshold) {
        list.push({ sev: s.status === 'crit' ? 3 : 2, kind: 'auto', title: t('w_rapid'), text: t('w_rapid_t', { post: name, d: s.delta }), id: p.id, rank: rank + 0.001 });
      }
    });
    var cur = dates[state.idx];
    (D.official_warnings || []).forEach(function (w) {
      var day = localIso(new Date(w.issued_at));
      var age = dayDiff(day, cur);
      if (age < 0 || age > 2) return;
      list.push({
        sev: SEV[w.severity] || 1, kind: 'official', ts: w.issued_at,
        source: state.lang === 'kk' ? (w.source_kk || w.source) : w.source, url: w.url,
        text: (w.text && (w.text[state.lang] || w.text.ru)) || ''
      });
    });
    list.sort(function (a, b) {
      return (b.sev - a.sev) ||
        ((a.kind === 'official' ? 0 : 1) - (b.kind === 'official' ? 0 : 1)) ||
        (a.kind === 'official' ? (b.ts > a.ts ? 1 : -1) : (b.rank - a.rank));
    });

    if (!list.length) { $('#warnings').innerHTML = '<li class="warn-empty">' + esc(t('warn_none')) + '</li>'; return; }
    $('#warnings').innerHTML = list.map(function (w) {
      if (w.kind === 'official') {
        return '<li class="warn sev-' + w.sev + '"><div class="warn-meta"><span class="kind official">' + esc(t('warn_official')) + '</span>' +
          '<a href="' + esc(w.url) + '" target="_blank" rel="noopener">' + esc(w.source) + '</a><span>' + esc(fmtDateTime(w.ts)) + '</span></div>' +
          '<p>' + esc(w.text) + '</p></li>';
      }
      return '<li class="warn sev-' + w.sev + '"><div class="warn-meta"><span class="kind">' + esc(t('warn_auto')) + '</span><span>' + esc(fmtShort(cur)) + '</span></div>' +
        '<h3>' + esc(w.title) + '</h3><p>' + esc(w.text) + '</p>' +
        '<button type="button" class="act" data-select="' + w.id + '">' + esc(t('w_show')) + '</button></li>';
    }).join('');
  }

  /* ---------- Общий рендер ---------- */
  function renderDynamic() {
    slider.value = state.idx;
    $('#date-text').textContent = fmtDate(dates[state.idx], true);
    $('#to-latest').hidden = state.idx === lastIdx;
    renderNotices();
    renderKpis();
    renderMap();
    renderCard();
    renderTable();
    renderWarnings();
  }

  function select(id, opts) {
    if (!postById[id]) return;
    state.selected = id;
    store.set('post', id);
    renderMap();
    renderCard();
    renderTable();
    opts = opts || {};
    if (map && opts.from !== 'map') {
      var p = postById[id];
      var ll = L.latLng(p.lat, p.lon);
      if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll);
    }
    if (opts.scroll && window.innerWidth < 1020) $('#card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- События ---------- */
  slider.addEventListener('input', function () { if (state.timer) stop(); setIdx(+slider.value); });
  $('#play').addEventListener('click', function () { state.timer ? stop() : play(); });
  $('#to-latest').addEventListener('click', function () { stop(); setIdx(lastIdx); });

  $$('.lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.lang = b.dataset.lang;
      store.set('lang', state.lang);
      renderStatic();
      renderDynamic();
    });
  });

  $$('#posts th').forEach(function (th) {
    th.querySelector('button').addEventListener('click', function () {
      var k = th.dataset.sort;
      if (state.sort.key === k) state.sort.dir *= -1;
      else state.sort = { key: k, dir: DEFAULT_DIR[k] };
      renderTable();
    });
  });

  $('#posts tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr) select(tr.dataset.id, { scroll: true });
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-select]');
    if (b) select(b.dataset.select, { scroll: true });
  });

  $('#threshold').addEventListener('change', function () {
    var v = Math.round(+this.value);
    if (!(v >= 1)) v = 25;
    state.threshold = v;
    this.value = v;
    store.set('threshold', String(v));
    renderWarnings();
  });

  var rT;
  window.addEventListener('resize', function () {
    clearTimeout(rT);
    rT = setTimeout(function () {
      if (map) map.invalidateSize();
      var p = postById[state.selected];
      if (p) drawChart(p);
    }, 150);
  });

  /* ---------- Старт ---------- */
  var saved = store.get('post');
  if (saved && postById[saved]) state.selected = saved;
  else {
    var worst = D.posts.map(function (p) { return { p: p, s: stateOf(p, lastIdx) }; })
      .sort(function (a, b) { return (RANK[b.s.status] - RANK[a.s.status]) || ((b.s.fill || 0) - (a.s.fill || 0)); })[0];
    state.selected = worst ? worst.p.id : null;
  }

  renderStatic();
  initMap();
  renderDynamic();
})();
