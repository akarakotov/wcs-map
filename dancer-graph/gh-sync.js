/* gh-sync.js — общий помощник для index.html / network.html / editor.html.
   Задачи:
   1) На https (опубликованный сайт) подтягивает СВЕЖИЕ graph.txt + blocks.txt и
      обновляет window.WCS_GRAPH до отрисовки. На file:// тихо пропускает —
      остаётся вшитый снимок (см. build.mjs).
   2) Сохраняет правки обратно в репозиторий через GitHub Contents API.
      Авторизация — «Войти через GitHub» (OAuth, D-095): страница уводит на
      github.com/login/oauth/authorize, наш прокси /github-oauth/callback меняет
      код на токен и возвращает его во fragment (#gh_token=…). Токен хранится
      ТОЛЬКО в браузере пользователя (localStorage) и уходит только на
      api.github.com. Несохранённая правка перед редиректом заначивается в
      sessionStorage и докоммичивается автоматически после возврата.
      Fallback: пока OAUTH.clientId пуст — ручной ввод токена (prompt).

   Парсер ниже — зеркало build.mjs. Формат менять синхронно в обоих местах. */
(function () {
  var REPO = 'akarakotov/wcs-map';   // owner/repo
  var BRANCH = 'main';                // ветка, с которой раздаётся GitHub Pages
  var DIR = 'dancer-graph/';          // путь внутри репо (для Contents API)
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';
  var TKEY = 'wcs_gh_token';

  // OAuth (D-095). clientId публичный по определению; secret живёт на прокси.
  var OAUTH = {
    clientId: '',  // ← заполнить после регистрации OAuth-app (Client ID)
    proxy: 'https://wcs-yerevan-production-dg7vj.ondigitalocean.app/github-oauth/callback',
    scope: 'public_repo'
  };

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
  // Сначала api.github.com (CORS открыт, содержимое свежее сразу после коммита,
  // без ~минутного лага пересборки Pages); при сбое/rate-limit — файлы с Pages.
  function fetchSource(name, required) {
    var apiUrl = API + DIR + name + '?ref=' + BRANCH;
    return fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github.raw' }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('api ' + r.status); return r.text(); })
      .catch(function () {
        return fetch(name, { cache: 'no-store' }).then(function (r) {
          if (!r.ok) { if (required) throw new Error(name + ' ' + r.status); return ''; }
          return r.text();
        });
      });
  }
  window.__refreshGraph = function () {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(false); // file:// → вшитый снимок
    return Promise.all([
      fetchSource('graph.txt', true),
      fetchSource('blocks.txt', false).catch(function () { return ''; })
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
  window.__ghClearToken = function () { setToken(''); return 'токен удалён из этого браузера'; };
  window.__ghHasToken = function () { return !!getToken(); };

  // ---------- тост (страницы разные, статус-элементы свои — общий оверлей) ----------
  function toast(msg, isErr) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'background:' + (isErr ? '#A32D2D' : '#1D9E75') + ';color:#fff;padding:9px 16px;' +
        'border-radius:9px;font:13px -apple-system,sans-serif;z-index:9999;box-shadow:0 3px 14px rgba(0,0,0,.25)';
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, isErr ? 8000 : 4000);
    } catch (e) { console.log(msg); }
  }

  // ---------- OAuth: уход на GitHub и возврат ----------
  function randState() {
    try { return crypto.randomUUID(); } catch (e) { return String(Math.random()).slice(2) + Date.now(); }
  }

  // Уводит на GitHub. pending (опционально) — несохранённая правка, докоммитим после возврата.
  window.__ghLogin = function (pending) {
    if (!OAUTH.clientId) return false;
    var state = randState();
    try {
      sessionStorage.setItem('wcs_oauth_state', state);
      sessionStorage.setItem('wcs_oauth_return', location.href.split('#')[0]);
      if (pending) sessionStorage.setItem('wcs_pending_save', JSON.stringify(pending));
    } catch (e) {}
    location.href = 'https://github.com/login/oauth/authorize' +
      '?client_id=' + encodeURIComponent(OAUTH.clientId) +
      '&scope=' + encodeURIComponent(OAUTH.scope) +
      '&redirect_uri=' + encodeURIComponent(OAUTH.proxy) +
      '&state=' + encodeURIComponent(state);
    return true;
  };

  // Прокси возвращает на REDIRECT_BASE (= index.html) с #gh_token=…&state=… или #gh_error=…
  function handleOAuthReturn() {
    if (!/[#&]gh_(token|error)=/.test(location.hash)) return;
    var params = {};
    location.hash.slice(1).split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    history.replaceState(null, '', location.pathname + location.search); // токен из адресной строки — сразу вон
    var wantState = '';
    try { wantState = sessionStorage.getItem('wcs_oauth_state') || ''; sessionStorage.removeItem('wcs_oauth_state'); } catch (e) {}
    if (params.gh_error) { toast('GitHub-вход не удался: ' + params.gh_error, true); return; }
    if (!params.gh_token) return;
    if (!wantState || params.state !== wantState) { toast('GitHub-вход отклонён: state не совпал (CSRF-защита). Попробуй ещё раз.', true); return; }
    setToken(params.gh_token);
    toast('Вошёл через GitHub ✓');
    // докоммитить заначенную правку
    var pendingRaw = null, ret = null;
    try {
      pendingRaw = sessionStorage.getItem('wcs_pending_save'); sessionStorage.removeItem('wcs_pending_save');
      ret = sessionStorage.getItem('wcs_oauth_return'); sessionStorage.removeItem('wcs_oauth_return');
    } catch (e) {}
    // после докоммита перечитываем страницу: __refreshGraph берёт данные из
    // api.github.com, так что перезагрузка сразу показывает сохранённое
    var after = function (forceReload) {
      var here = location.href.split('#')[0];
      if (ret && ret !== here) location.replace(ret);
      else if (forceReload) location.reload();
    };
    if (pendingRaw) {
      var p = null; try { p = JSON.parse(pendingRaw); } catch (e) {}
      if (p && p.filename && typeof p.content === 'string') {
        toast('Досохраняю ' + p.filename + '…');
        window.__ghSave(p.filename, p.content, p.message || ('update ' + p.filename)).then(function (r) {
          toast(p.filename + ': ' + r.msg, !r.ok);
          setTimeout(function () { after(r.ok); }, r.ok ? 1200 : 4000);
        });
        return;
      }
    }
    after(false);
  }

  // ---------- base64 от UTF-8 ----------
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  // ---------- сохранить файл коммитом ----------
  // Без токена: OAuth настроен → заначить правку и увести на GitHub (страница
  // перезагрузится, сохранение завершится после возврата); иначе — prompt.
  window.__ghSave = function (filename, content, message) {
    var token = getToken();
    if (!token) {
      if (OAUTH.clientId) {
        window.__ghLogin({ filename: filename, content: content, message: message });
        return Promise.resolve({ ok: false, msg: 'ухожу на GitHub-вход…' });
      }
      token = window.prompt(
        'Вставь GitHub fine-grained токен с правом «Contents: Read and write» на репозитории ' + REPO + '.\n\n' +
        'Хранится только в этом браузере (localStorage) и уходит только на api.github.com.');
      if (!token) return Promise.resolve({ ok: false, msg: 'нужен токен' });
      token = token.trim(); setToken(token);
    }
    var url = API + DIR + filename;
    var h = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
    // 1) узнаём текущий sha (если файл уже есть)
    return fetch(url + '?ref=' + BRANCH, { headers: h, cache: 'no-store' })
      .then(function (g) {
        if (g.status === 401) { setToken(''); throw new Error('токен отклонён (401) — войди заново'); }
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
        if (put.status === 401) { setToken(''); return { ok: false, msg: 'токен отклонён (401) — войди заново' }; }
        if (put.status === 403) return { ok: false, msg: 'нет прав (403): нужен доступ Contents: write на ' + REPO };
        if (put.status === 409) return { ok: false, msg: 'конфликт (409): файл изменился на сервере — перезагрузи и повтори' };
        return put.json().then(function (e) { return { ok: false, msg: 'ошибка ' + put.status + ': ' + (e.message || '') }; }).catch(function () { return { ok: false, msg: 'ошибка ' + put.status }; });
      })
      .catch(function (e) { return { ok: false, msg: (e && e.message) || 'сетевая ошибка' }; });
  };

  // обработать возврат с GitHub, как только DOM готов (нужен body для тоста)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleOAuthReturn);
  else handleOAuthReturn();
})();
