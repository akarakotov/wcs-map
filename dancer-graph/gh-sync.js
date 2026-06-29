/* gh-sync.js — общий помощник для index.html / network.html / editor.html.
   Задачи:
   1) На https (опубликованный сайт) подтягивает СВЕЖИЕ graph.txt + blocks.txt и
      обновляет window.WCS_GRAPH до отрисовки. На file:// тихо пропускает —
      остаётся вшитый снимок (см. build.mjs).
   2) Сохраняет правки обратно в репозиторий через GitHub Contents API по токену,
      который пользователь вводит один раз; токен хранится ТОЛЬКО в его браузере
      (localStorage) и уходит только на api.github.com. В коде токенов НЕТ.

   Парсер ниже — зеркало build.mjs. Формат менять синхронно в обоих местах. */
(function () {
  var REPO = 'akarakotov/wcs-map';   // owner/repo
  var BRANCH = 'main';                // ветка, с которой раздаётся GitHub Pages
  var DIR = 'dancer-graph/';          // путь внутри репо (для Contents API)
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';
  var TKEY = 'wcs_gh_token';

  // ---------- парсер (зеркало build.mjs) ----------
  function splitCell(s) { return s ? s.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : []; }

  function parseGraph(text) {
    var skills = [], milestones = [], section = null;
    text.split('\n').forEach(function (rw) {
      var line = rw.replace(/\r$/, '').trim();
      if (!line || line[0] === '#') return;
      if (line === '[skills]') { section = 'skills'; return; }
      if (line === '[milestones]') { section = 'milestones'; return; }
      var p = line.split('|').map(function (x) { return x.trim(); });
      if (section === 'skills') {
        if (p.length < 7) return;
        var desc = p.length > 7 ? p.slice(7).join('|').trim() : '';
        skills.push({ id: p[0], branch: p[1], level: p[2], voices: splitCell(p[3]), needs: splitCell(p[4]), src: p[5], label: p[6], desc: desc });
      } else if (section === 'milestones') {
        if (p.length !== 5) return;
        milestones.push({ id: p[0], fed_by: splitCell(p[1]), context: p[2], expr: p[3], label: p[4] });
      }
    });
    return { skills: skills, milestones: milestones };
  }

  function parseBlocks(text) {
    var blocks = [], blockOf = {}, bsec = null;
    (text || '').split('\n').forEach(function (rw) {
      var line = rw.replace(/\r$/, '').trim();
      if (!line || line[0] === '#') return;
      if (line === '[blocks]') { bsec = 'blocks'; return; }
      if (line === '[assign]') { bsec = 'assign'; return; }
      if (bsec === 'blocks') {
        var p = line.split('|').map(function (x) { return x.trim(); });
        blocks.push({ id: p[0], months: p[1] || '', label: p[2] || '' });
      } else if (bsec === 'assign') {
        var c = line.indexOf(':'); if (c < 0) return;
        var bid = line.slice(0, c).trim();
        line.slice(c + 1).split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (id) { blockOf[id] = bid; });
      }
    });
    return { blocks: blocks, blockOf: blockOf };
  }

  // ---------- подтянуть свежие данные перед отрисовкой ----------
  window.__refreshGraph = function () {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(false); // file:// → вшитый снимок
    return Promise.all([
      fetch('graph.txt', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('graph.txt ' + r.status); return r.text(); }),
      fetch('blocks.txt', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
    ]).then(function (res) {
      var g = parseGraph(res[0]);
      if (!g.skills.length) return false;
      var b = parseBlocks(res[1]);
      g.skills.forEach(function (s) { s.block = b.blockOf[s.id] || ''; });
      var M = window.WCS_GRAPH || {};
      window.WCS_GRAPH = {
        star: M.star, voices: M.voices, branches: M.branches, levels: M.levels,
        blocks: b.blocks.length ? b.blocks : (M.blocks || []),
        skills: g.skills, milestones: g.milestones
      };
      return true;
    }).catch(function (e) { console.warn('gh-sync: остаюсь на вшитых данных —', e && e.message); return false; });
  };

  // ---------- токен ----------
  function getToken() { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem(TKEY, t); else localStorage.removeItem(TKEY); } catch (e) {} }
  function ensureToken() {
    var t = getToken();
    if (t) return t;
    t = window.prompt(
      'Вставь GitHub fine-grained токен с правом «Contents: Read and write» на репозитории ' + REPO + '.\n\n' +
      'Хранится только в этом браузере (localStorage) и уходит только на api.github.com. ' +
      'Создать: github.com → Settings → Developer settings → Fine-grained tokens.');
    if (t) { t = t.trim(); setToken(t); }
    return t;
  }
  window.__ghClearToken = function () { setToken(''); return 'токен удалён из этого браузера'; };
  window.__ghHasToken = function () { return !!getToken(); };

  // ---------- base64 от UTF-8 ----------
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  // ---------- сохранить файл коммитом ----------
  window.__ghSave = function (filename, content, message) {
    var token = ensureToken();
    if (!token) return Promise.resolve({ ok: false, msg: 'нужен токен' });
    var url = API + DIR + filename;
    var h = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
    // 1) узнаём текущий sha (если файл уже есть)
    return fetch(url + '?ref=' + BRANCH, { headers: h, cache: 'no-store' })
      .then(function (g) {
        if (g.status === 401) { setToken(''); throw new Error('токен отклонён (401) — введи заново'); }
        if (g.status === 200) return g.json().then(function (j) { return j.sha; });
        return undefined; // 404 — создаём новый файл
      })
      .then(function (sha) {
        var body = { message: message, content: b64(content), branch: BRANCH };
        if (sha) body.sha = sha;
        return fetch(url, { method: 'PUT', headers: h, body: JSON.stringify(body) });
      })
      .then(function (put) {
        if (put.ok) return put.json().then(function (j) { return { ok: true, msg: 'сохранено в GitHub ✓', url: j.commit && j.commit.html_url }; });
        if (put.status === 401) { setToken(''); return { ok: false, msg: 'токен отклонён (401) — введи заново' }; }
        if (put.status === 403) return { ok: false, msg: 'нет прав (403): токену нужен Contents: write на ' + REPO };
        if (put.status === 409) return { ok: false, msg: 'конфликт (409): файл изменился на сервере — перезагрузи и повтори' };
        return put.json().then(function (e) { return { ok: false, msg: 'ошибка ' + put.status + ': ' + (e.message || '') }; }).catch(function () { return { ok: false, msg: 'ошибка ' + put.status }; });
      })
      .catch(function (e) { return { ok: false, msg: (e && e.message) || 'сетевая ошибка' }; });
  };
})();
