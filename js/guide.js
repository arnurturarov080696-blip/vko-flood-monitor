/*
 * Гид по сайту — чат-помощник без ИИ: готовые ответы, экскурсия по блокам
 * и ответы о постах по текущим данным сайта. Работает полностью в браузере.
 */
(function () {
  'use strict';

  var App = window.FloodApp;
  var G = window.GUIDE_I18N;
  if (!App || !G) return;

  function g(key, vars) {
    var s = G[App.lang] && G[App.lang][key] != null ? G[App.lang][key] : G.ru[key];
    if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
    return s;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[-‐–—]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var NL = '[^\\p{L}\\p{N}]';
  function hasPrefix(text, stem) { return new RegExp('(^|' + NL + ')' + reEsc(stem), 'u').test(text); }
  function hasWord(text, w) { return new RegExp('(^|' + NL + ')' + reEsc(w) + '($|' + NL + ')', 'u').test(text); }

  /* ---------- Поиск постов по названию ---------- */
  var PLACE_WORDS = /(^|\s)(г\.|с\.|пгт|қ\.|а\.|кенті)(?=\s|$)/g;

  function stemsFor(name, kazakh) {
    var n = norm(name).replace(PLACE_WORDS, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return [];
    var out = [];
    if (n.length >= 5) out.push({ s: n.slice(0, -1), prefix: true });
    else {
      out.push({ s: n, prefix: kazakh });
      // Русские падежи коротких названий: Уба → Убе, Убы, Убу
      if (!kazakh && /а$/.test(n)) ['е', 'ы', 'у', 'ой'].forEach(function (e) { out.push({ s: n.slice(0, -1) + e, prefix: false }); });
    }
    var first = n.split(' ')[0];
    if (first !== n && first.length >= 5) out.push({ s: first, prefix: true });
    return out;
  }

  var INDEX = App.data.posts.map(function (p) {
    var riverStems = [].concat(stemsFor(p.river), stemsFor(p.river_kk || '', true), stemsFor(p.river_en || ''));
    var placeStems = [].concat(stemsFor(p.place), stemsFor(p.place_kk || '', true), stemsFor(p.place_en || ''));
    return { p: p, river: riverStems, place: placeStems };
  });

  function hit(text, stems) {
    return stems.some(function (st) { return st.prefix ? hasPrefix(text, st.s) : hasWord(text, st.s); });
  }

  function findPosts(text) {
    var res = INDEX.map(function (e) { return { p: e.p, r: hit(text, e.river), pl: hit(text, e.place) }; });
    var both = res.filter(function (x) { return x.r && x.pl; });
    if (both.length) return both.map(function (x) { return x.p; });
    var pl = res.filter(function (x) { return x.pl; });
    if (pl.length) return pl.map(function (x) { return x.p; });
    return res.filter(function (x) { return x.r; }).map(function (x) { return x.p; });
  }

  /* ---------- Темы ---------- */
  var INTENTS = [
    ['thanks', ['спасиб', 'благодар', 'рахмет', 'thank']],
    ['hello', ['привет', 'здравств', 'добрый', 'сәлем', 'салем', 'hello', 'hi', 'hey']],
    ['todo', ['что делать', 'эвакуац', 'памятк', 'подтоплен', 'чемодан', 'не істеу', 'не істе', 'жадынама', 'су басса', 'what to do', 'evacuat', 'checklist', 'prepare', 'safety']],
    ['phones', ['телефон', 'номер', '112', 'позвон', 'звонить', 'қоңырау', 'нөмір', 'phone', 'call', 'number']],
    ['tour', ['экскурс', 'тур', 'как пользова', 'как работает', 'покажи сайт', 'обзор', 'қалай пайдалан', 'экскурсия', 'tour', 'how to use', 'how does', 'walk me']],
    ['chart', ['график', 'прогноз', 'пик', 'болжам', 'шың', 'chart', 'graph', 'forecast', 'peak']],
    ['slider', ['ползун', 'дата', 'дату', 'истори', 'архив', 'динамик', 'прошл', 'жүгірткі', 'мұрағат', 'slider', 'date', 'history', 'timeline', 'play']],
    ['table', ['таблиц', 'сортир', 'кесте', 'сұрыпта', 'table', 'sort']],
    ['warnings', ['предупрежд', 'оповещ', 'ескерту', 'warning', 'alert']],
    ['sources', ['источник', 'откуда', 'данные', 'данных', 'казгидромет', 'официальн', 'обновл', 'дереккөз', 'деректер', 'қайдан', 'source', 'data', 'kazhydromet', 'official', 'updated']],
    ['now', ['обстановк', 'ситуац', 'сейчас', 'где опасн', 'сводк', 'жағдай', 'қазір', 'situation', 'now', 'overview', 'current', 'where is it danger']],
    ['colors', ['цвет', 'статус', 'значит', 'значат', 'ня', 'оя', 'пойм', 'желт', 'красн', 'зелен', 'точк', 'түс', 'мәртебе', 'белгі', 'colour', 'color', 'status', 'mean', 'dot', 'floodplain']],
    ['find', ['найти', 'найди', 'моя река', 'мою реку', 'мой пост', 'какие посты', 'список', 'тап', 'бекеттер', 'find', 'my river', 'stations', 'list']]
  ];

  function detectIntent(text) {
    var words = text.split(' ').length;
    for (var i = 0; i < INTENTS.length; i++) {
      var name = INTENTS[i][0];
      if ((name === 'hello' || name === 'thanks') && words > 4) continue;
      var kws = INTENTS[i][1];
      for (var j = 0; j < kws.length; j++) {
        var k = kws[j];
        if (k.length <= 2 ? hasWord(text, k) : hasPrefix(text, k)) return name;
      }
    }
    return null;
  }

  /* ---------- Ответы ---------- */
  function postAnswer(p) {
    var s = App.stateOf(p, App.idx);
    var t = App.t;
    var lines = [g('p_status', { post: App.postName(p), status: t('st_' + s.status) })];
    if (s.level != null) {
      var trend = s.delta == null ? '' : t(s.delta > 0 ? 'trend_up' : s.delta < 0 ? 'trend_down' : 'trend_flat');
      lines.push(g('p_level', { lvl: s.level, d: s.delta == null ? '—' : App.signed(s.delta), trend: trend }));
      lines.push(s.level >= p.crit ? g('p_over', { x: s.level - p.crit }) : g('p_margin', { x: p.crit - s.level }));
      if (App.idx === App.lastIdx && p.peak_date && p.peak_date >= App.dates[App.idx]) lines.push(g('p_peak', { d: App.fmtDate(p.peak_date) }));
      lines.push(g('p_date', { d: App.fmtDate(s.date, true) }));
      if (s.status === 'crit') lines.push(g('p_crit'));
      else if (s.status === 'nya') lines.push(g('p_nya'));
    }
    var actions = [{ label: g('btn_show'), run: function () { show(p.id); } }];
    if (s.status === 'crit') actions.push({ label: g('btn_call'), href: 'tel:112' });
    return { text: lines.join('\n'), actions: actions };
  }

  function manyAnswer(posts) {
    var lines = [g('p_many')];
    var actions = [];
    posts.forEach(function (p) {
      var s = App.stateOf(p, App.idx);
      lines.push('• ' + App.postName(p) + ': ' + (s.level == null ? '—' : s.level + ' ' + App.t('cm')) + ', ' + App.t('st_' + s.status));
      actions.push({ label: App.place(p), run: function () { reply(postAnswer(p)); } });
    });
    return { text: lines.join('\n'), actions: actions };
  }

  function nowAnswer() {
    var posts = App.data.posts;
    var st = posts.map(function (p) { return { p: p, s: App.stateOf(p, App.idx) }; });
    var crit = st.filter(function (x) { return x.s.status === 'crit'; });
    var nya = st.filter(function (x) { return x.s.status === 'nya'; });
    var lines = [g('now_head', { d: App.fmtDate(App.dates[App.idx], true) })];
    if (App.isStale()) lines.push(g('now_stale'));
    if (!crit.length && !nya.length) lines.push(g('now_calm'));
    else lines.push(g('now_counts', { c: crit.length, n: posts.length, y: nya.length }));
    if (crit.length) {
      lines.push(g('now_crit', {
        list: crit.map(function (x) { return App.postName(x.p) + ' (' + x.s.level + ' ' + App.t('cm') + ')'; }).join('; ')
      }));
    }
    var fast = st.filter(function (x) { return x.s.delta != null && x.s.delta > 0; })
      .sort(function (a, b) { return b.s.delta - a.s.delta; })[0];
    if (fast) lines.push(g('now_rise', { post: App.postName(fast.p), d: fast.s.delta }));
    if (App.data.demo) lines.push(g('a_demo'));
    var actions = crit.slice(0, 4).map(function (x) { return { label: App.place(x.p), run: function () { reply(postAnswer(x.p)); } }; });
    return { text: lines.join('\n'), actions: actions };
  }

  function findAnswer() {
    var list = App.data.posts.map(function (p) { return '• ' + App.postName(p); }).join('\n');
    return { text: g('a_find', { list: list }) };
  }

  function answerFor(raw) {
    var text = norm(raw);
    if (!text) return null;
    var posts = findPosts(text);
    if (posts.length === 1) return postAnswer(posts[0]);
    if (posts.length > 1) return manyAnswer(posts);
    switch (detectIntent(text)) {
      case 'thanks': return { text: g('a_thanks') };
      case 'hello': return { text: g('a_hello'), chips: true };
      case 'todo': return todoAnswer();
      case 'phones': return { text: g('a_phones'), actions: [{ label: g('btn_call'), href: 'tel:112' }] };
      case 'tour': startTour(); return null;
      case 'chart': return { text: g('a_chart') };
      case 'slider': return { text: g('a_slider') };
      case 'table': return { text: g('a_table') };
      case 'warnings': return { text: g('a_warnings') };
      case 'sources': return sourcesAnswer();
      case 'now': return nowAnswer();
      case 'colors': return { text: g('a_colors') };
      case 'find': return findAnswer();
      default: return { text: g('a_unknown'), chips: true };
    }
  }

  function todoAnswer() {
    return {
      text: g('a_todo'),
      actions: [
        { label: g('btn_memo'), run: function () { scrollToEl(document.getElementById('help')); } },
        { label: g('btn_call'), href: 'tel:112' }
      ]
    };
  }
  function sourcesAnswer() {
    return { text: g('a_sources') + (App.data.demo ? '\n' + g('a_demo') : '') };
  }

  var CHIPS = [
    ['chip_tour', function () { startTour(); }],
    ['chip_now', function () { reply(nowAnswer()); }],
    ['chip_colors', function () { reply({ text: g('a_colors') }); }],
    ['chip_find', function () { reply(findAnswer()); }],
    ['chip_todo', function () { reply(todoAnswer()); }],
    ['chip_sources', function () { reply(sourcesAnswer()); }]
  ];

  /* ---------- Интерфейс ---------- */
  var root = document.createElement('div');
  root.className = 'guide';
  root.innerHTML =
    '<button type="button" class="guide-launcher" aria-expanded="false" aria-controls="guide-panel">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor"/></svg>' +
      '<span class="guide-launcher-text"></span></button>' +
    '<section class="guide-panel" id="guide-panel" role="dialog" aria-modal="false" hidden>' +
      '<header class="guide-head"><div><h2 class="guide-title"></h2><p class="guide-sub"></p></div>' +
        '<button type="button" class="guide-close"><span aria-hidden="true">×</span></button></header>' +
      '<div class="guide-log" role="log" aria-live="polite"></div>' +
      '<form class="guide-form" autocomplete="off"><input type="text" class="guide-input" maxlength="200">' +
        '<button type="submit" class="guide-send"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z" fill="currentColor"/></svg></button></form>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.guide-launcher');
  var panel = root.querySelector('.guide-panel');
  var log = root.querySelector('.guide-log');
  var form = root.querySelector('.guide-form');
  var input = root.querySelector('.guide-input');
  var started = false;

  function applyTexts() {
    root.querySelector('.guide-launcher-text').textContent = g('launcher');
    launcher.setAttribute('aria-label', g('title'));
    root.querySelector('.guide-title').textContent = g('title');
    root.querySelector('.guide-sub').textContent = g('subtitle');
    root.querySelector('.guide-close').setAttribute('aria-label', g('close'));
    root.querySelector('.guide-close').title = g('close');
    panel.setAttribute('aria-label', g('title'));
    input.placeholder = g('placeholder');
    input.setAttribute('aria-label', g('placeholder'));
    root.querySelector('.guide-send').setAttribute('aria-label', g('send'));
  }

  function textHtml(text) { return text.split('\n').map(esc).join('<br>'); }

  function addMsg(who, html) {
    var el = document.createElement('div');
    el.className = 'gmsg gmsg-' + who;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addActions(el, actions) {
    if (!actions || !actions.length) return;
    var box = document.createElement('div');
    box.className = 'gactions';
    actions.forEach(function (a) {
      var b;
      if (a.href) { b = document.createElement('a'); b.href = a.href; }
      else { b = document.createElement('button'); b.type = 'button'; b.addEventListener('click', a.run); }
      b.className = 'gbtn';
      b.textContent = a.label;
      box.appendChild(b);
    });
    el.appendChild(box);
  }

  function addChips() {
    var el = addMsg('bot gchips', '');
    addActions(el, CHIPS.map(function (c) { return { label: g(c[0]), run: c[1] }; }));
    el.querySelectorAll('.gbtn').forEach(function (b) { b.classList.add('gchip'); });
    log.scrollTop = log.scrollHeight;
  }

  function reply(ans) {
    if (!ans) return;
    var el = addMsg('bot', '<p>' + textHtml(ans.text) + '</p>');
    addActions(el, ans.actions);
    if (ans.chips) addChips();
    log.scrollTop = log.scrollHeight;
  }

  function greet() {
    log.innerHTML = '';
    addMsg('bot', '<p>' + esc(g('greet')) + '</p><p class="gnote">' + esc(g('note')) + '</p>');
    addChips();
  }

  function isMobile() { return window.innerWidth < 640; }

  function open() {
    if (!started) { applyTexts(); greet(); started = true; }
    panel.hidden = false;
    root.classList.add('open');
    launcher.setAttribute('aria-expanded', 'true');
    if (!isMobile()) input.focus();
  }
  function close() {
    endTour(true);
    panel.hidden = true;
    root.classList.remove('open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  function scrollToEl(el) {
    if (!el) return;
    if (isMobile()) close();
    var top = el.getBoundingClientRect().top + window.pageYOffset - 52;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function show(id) {
    if (isMobile()) close();
    App.select(id);
  }

  /* ---------- Экскурсия ---------- */
  var tour = null; // { i, el, focus }

  function tourTarget(step) {
    var el = document.querySelector(step.sel);
    if (!el) return null;
    if (step.sel === '#posts' || step.sel === '#warnings') el = el.closest('.panel') || el;
    return el;
  }

  function renderTour() {
    var steps = g('tour');
    var step = steps[tour.i];
    if (tour.focus) tour.focus.classList.remove('guide-focus');
    tour.focus = tourTarget(step);
    if (tour.focus) tour.focus.classList.add('guide-focus');
    var last = tour.i === steps.length - 1;
    tour.el.innerHTML =
      '<div class="gtour-step">' + esc(g('tour_step', { i: tour.i + 1, n: steps.length })) + '</div>' +
      '<h3>' + esc(step.title) + '</h3><p>' + esc(step.text) + '</p>' +
      '<div class="gactions">' +
        (tour.i > 0 ? '<button type="button" class="gbtn" data-tour="prev">' + esc(g('tour_prev')) + '</button>' : '') +
        '<button type="button" class="gbtn gbtn-primary" data-tour="' + (last ? 'done' : 'next') + '">' + esc(g(last ? 'tour_done' : 'tour_next')) + '</button>' +
      '</div>';
    log.scrollTop = log.scrollHeight;
    var primary = tour.el.querySelector('.gbtn-primary');
    if (primary && !isMobile()) primary.focus({ preventScroll: true });
    // Прокрутку окна запускаем последней: прокрутка лога чата иначе её прерывает.
    if (tour.focus) {
      var top = tour.focus.getBoundingClientRect().top + window.pageYOffset - 52;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  function startTour() {
    endTour(true);
    if (panel.hidden) open();
    tour = { i: 0, el: addMsg('bot gtour', ''), focus: null };
    tour.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tour]');
      if (!b || !tour) return;
      var a = b.getAttribute('data-tour');
      if (a === 'next') { tour.i++; renderTour(); }
      else if (a === 'prev') { tour.i--; renderTour(); }
      else endTour(false);
    });
    renderTour();
  }

  function endTour(silent) {
    if (!tour) return;
    if (tour.focus) tour.focus.classList.remove('guide-focus');
    var el = tour.el;
    tour = null;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (!silent) { reply({ text: g('tour_end') }); addChips(); }
  }

  /* ---------- События ---------- */
  launcher.addEventListener('click', function () { panel.hidden ? open() : close(); });
  root.querySelector('.guide-close').addEventListener('click', close);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.value = '';
    addMsg('user', '<p>' + esc(q) + '</p>');
    reply(answerFor(q));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
  document.addEventListener('flood:lang', function () {
    applyTexts();
    if (started) { endTour(true); greet(); }
  });

  applyTexts();
})();
