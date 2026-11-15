/*
 * Данные для сайта.
 *
 * В рабочей версии этот файл генерирует сборщик (парсер бюллетеней + админка):
 *   window.FLOOD_DATA = { demo: false, generated_at, posts: [...], official_warnings: [...], snow: {...} };
 * Формат поста — см. PRD, раздел 6.1.
 *
 * Сейчас здесь генератор СИНТЕТИЧЕСКИХ данных (демо). Ряды строятся относительно
 * текущей даты, чтобы прототип всегда выглядел «свежим». Реальные посты, координаты
 * и пороги НЯ/ОЯ нужно взять у Казгидромета.
 */
(function () {
  if (window.FLOOD_DATA) return;

  var DAYS = 60;
  var KAZHYDROMET = 'https://www.kazhydromet.kz';
  var MCHS = 'https://www.gov.kz/memleket/entities/emer';

  // base — меженный уровень; L — уровень на последнюю дату; d — изменение за сутки;
  // tp — через сколько суток пик (отрицательное — пик пройден); sig — ширина волны, сут.
  var SPECS = [
    { id: 'ulba_ridder', river: 'Ульба', river_kk: 'Үлбі', place: 'г. Риддер', place_kk: 'Риддер қ.', river_en: 'Ulba', place_en: 'Ridder', lon: 83.51, lat: 50.345, nya: 250, crit: 300, base: 150, L: 272, d: 9, tp: 6, sig: 9, fc: true },
    { id: 'ulba_ukg', river: 'Ульба', river_kk: 'Үлбі', place: 'г. Усть-Каменогорск', place_kk: 'Өскемен қ.', river_en: 'Ulba', place_en: 'Oskemen', lon: 82.66, lat: 49.985, nya: 380, crit: 430, base: 220, L: 441, d: 14, tp: 6, sig: 9.75, fc: true },
    { id: 'irtysh_ukg', river: 'Иртыш', river_kk: 'Ертіс', place: 'г. Усть-Каменогорск', place_kk: 'Өскемен қ.', river_en: 'Irtysh', place_en: 'Oskemen', lon: 82.58, lat: 49.945, nya: 420, crit: 480, base: 290, L: 336, d: 3, tp: 10, sig: 12.4, fc: false },
    { id: 'uba_shem', river: 'Уба', river_kk: 'Үбі', place: 'г. Шемонаиха', place_kk: 'Шемонаиха қ.', river_en: 'Uba', place_en: 'Shemonaikha', lon: 81.91, lat: 50.63, nya: 305, crit: 360, base: 220, L: 414, d: 6, tp: 2, sig: 8, fc: true },
    { id: 'glub_glub', river: 'Глубочанка', river_kk: 'Глубочанка', place: 'пгт Глубокое', place_kk: 'Глубокое кенті', river_en: 'Glubochanka', place_en: 'Glubokoye', lon: 82.30, lat: 50.14, nya: 200, crit: 240, base: 110, L: 218, d: -4, tp: -3, sig: 9, fc: false },
    { id: 'bukh_katon', river: 'Бухтарма', river_kk: 'Бұқтырма', place: 'с. Катон-Карагай', place_kk: 'Катонқарағай а.', river_en: 'Bukhtarma', place_en: 'Katonkaragay', lon: 85.62, lat: 49.17, nya: 330, crit: 390, base: 180, L: 284, d: 12, tp: 12, sig: 10.2, fc: false },
    { id: 'bukh_altai', river: 'Бухтарма', river_kk: 'Бұқтырма', place: 'г. Алтай', place_kk: 'Алтай қ.', river_en: 'Bukhtarma', place_en: 'Altai', lon: 84.27, lat: 49.73, nya: 360, crit: 420, base: 230, L: 379, d: 18, tp: 7, sig: 7.6, fc: true },
    { id: 'naryn_ulken', river: 'Нарын', river_kk: 'Нарын', place: 'с. Улкен Нарын', place_kk: 'Үлкен Нарын а.', river_en: 'Naryn', place_en: 'Ulken Naryn', lon: 84.52, lat: 49.20, nya: 260, crit: 310, base: 140, L: 327, d: 31, tp: 3, sig: 4.25, fc: true },
    { id: 'kurchum', river: 'Курчум', river_kk: 'Күршім', place: 'с. Курчум', place_kk: 'Күршім а.', river_en: 'Kurchum', place_en: 'Kurchum', lon: 83.66, lat: 48.57, nya: 290, crit: 340, base: 160, L: 241, d: 5, tp: 8, sig: 11.4, fc: false },
    { id: 'karaertis_buran', river: 'Кара Ертис', river_kk: 'Қара Ертіс', place: 'с. Буран', place_kk: 'Боран а.', river_en: 'Kara Ertis', place_en: 'Buran', lon: 85.21, lat: 48.00, nya: 350, crit: 410, base: 240, L: 362, d: 26, tp: 4, sig: 4.3, fc: true }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h; }

  // Бюллетень выходит дважды в сутки: 08:00 и 20:00 по местному времени.
  var now = new Date();
  var updated = new Date(now);
  if (now.getHours() >= 20) updated.setHours(20, 0, 0, 0);
  else if (now.getHours() >= 8) updated.setHours(8, 0, 0, 0);
  else { updated = addDays(updated, -1); updated.setHours(20, 0, 0, 0); }
  var endDay = new Date(updated); endDay.setHours(12, 0, 0, 0);

  var N = DAYS;
  var posts = SPECS.map(function (s) {
    var tpAbs = N - 1 + s.tp;
    var H = (s.L - s.base) / Math.exp(-(s.tp * s.tp) / (2 * s.sig * s.sig));
    function raw(t) { return s.base + H * Math.exp(-((t - tpAbs) * (t - tpAbs)) / (2 * s.sig * s.sig)); }
    var r = rng(hash(s.id));
    var vals = [];
    for (var t = 0; t < N; t++) {
      var noise = t < N - 9 ? (r() * 4 - 2) : 0;
      vals.push(raw(t) + noise);
    }
    // Подгоняем последние сутки под заданное изменение, плавно.
    var e = (s.L - s.d) - vals[N - 2];
    for (var k = N - 9; k <= N - 2; k++) vals[k] += e * (k - (N - 9)) / 7;
    vals[N - 1] = s.L;

    var series = vals.map(function (v, i) {
      return { date: isoDate(addDays(endDay, i - (N - 1))), level_cm: Math.round(v) };
    });
    var forecast = [];
    if (s.fc) for (var f = 1; f <= 3; f++) forecast.push({ date: isoDate(addDays(endDay, f)), level_cm: Math.round(raw(N - 1 + f)) });

    return {
      id: s.id, river: s.river, river_kk: s.river_kk, place: s.place, place_kk: s.place_kk,
      river_en: s.river_en, place_en: s.place_en,
      lon: s.lon, lat: s.lat, nya: s.nya, crit: s.crit,
      series: series,
      forecast: forecast,
      peak_date: s.fc ? isoDate(addDays(endDay, s.tp)) : null,
      updated_at: updated.toISOString(),
      source: KAZHYDROMET
    };
  });

  function at(daysAgo, h, m) {
    var d = addDays(updated, -daysAgo); d.setHours(h, m, 0, 0);
    if (d > now) d = new Date(now);
    return d.toISOString();
  }
  var issuedToday = updated.getHours() === 20 ? 20 : 9;

  window.FLOOD_DATA = {
    demo: true,
    generated_at: updated.toISOString(),
    posts: posts,
    snow: { pct: 124, date: isoDate(addDays(endDay, -2)), source: 'Казгидромет (демо)', source_kk: 'Қазгидромет (демо)', source_en: 'Kazhydromet (demo)', url: KAZHYDROMET },
    official_warnings: [
      {
        id: 'kgm-1', severity: 'crit', source: 'Казгидромет', source_kk: 'Қазгидромет', source_en: 'Kazhydromet', url: KAZHYDROMET,
        issued_at: at(0, issuedToday, 30),
        text: {
          ru: 'Штормовое предупреждение. В ближайшие 2–3 суток на реках Уба, Ульба и Нарын ожидается дальнейший подъём уровней воды, выход на пойму и подтопление прибрежных населённых пунктов.',
          en: 'Storm warning. Over the next 2–3 days, water levels on the Uba, Ulba and Naryn rivers are expected to keep rising, overflow onto floodplains and flood riverside settlements.',
          kk: 'Дауылды ескерту. Алдағы 2–3 тәулікте Үбі, Үлбі және Нарын өзендерінде су деңгейінің одан әрі көтерілуі, жайылмаға шығуы және жағалаудағы елді мекендерді су басуы күтіледі.'
        }
      },
      {
        id: 'dchs-1', severity: 'crit', source: 'ДЧС ВКО', source_kk: 'ШҚО ТЖД', source_en: 'East Kazakhstan Emergency Department', url: MCHS,
        issued_at: at(0, issuedToday + 1, 15),
        text: {
          ru: 'Жителям прибрежных улиц Шемонаихи рекомендовано подготовиться к возможной эвакуации. Следите за сообщениями акимата района.',
          en: 'Residents of riverside streets in Shemonaikha are advised to prepare for possible evacuation. Follow announcements from the district akimat.',
          kk: 'Шемонаиханың жағалаудағы көшелерінің тұрғындарына ықтимал эвакуацияға дайындалу ұсынылады. Аудан әкімдігінің хабарламаларын қадағалаңыз.'
        }
      },
      {
        id: 'kgm-2', severity: 'nya', source: 'Казгидромет', source_kk: 'Қазгидромет', source_en: 'Kazhydromet', url: KAZHYDROMET,
        issued_at: at(1, 18, 0),
        text: {
          ru: 'На реках бассейна Бухтармы и на Кара Ертисе сохраняется высокая водность. Возможен выход воды на пойму.',
          en: 'Water levels remain high on rivers of the Bukhtarma basin and on the Kara Ertis. Water may overflow onto floodplains.',
          kk: 'Бұқтырма алабының өзендерінде және Қара Ертісте жоғары сулылық сақталуда. Судың жайылмаға шығуы мүмкін.'
        }
      }
    ]
  };
})();
