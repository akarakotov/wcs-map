// Сборщик графа развития танцора WCS.
// Источник правды — graph.txt (компактный, по строке на узел).
// Делает: парсит → валидирует → генерирует graph-data.js → вшивает данные в index.html и network.html.
// Запуск: node build.mjs   (пути берутся от самого скрипта; cwd не важен)
// Коды выхода: 0 ок (возможны WARN), 1 ошибки валидации (ничего не записано), 2 ошибка ввода-вывода.
import fs from 'fs';

const dir = new URL('.', import.meta.url).pathname;
const ORDER = { 'Б':0, 'С':1, 'П':2 };

// ---- meta (меняется редко, поэтому здесь, а не в graph.txt) ----
const meta = {
  star: { label: 'Самовыражение в паре', sub: 'полярная звезда' },
  voices: {
    self:    { label: 'я',         color: '#7F77DD' },
    partner: { label: 'коннекшен', color: '#D85A30' },
    music:   { label: 'музыка',    color: '#1D9E75' }
  },
  branches: [
    { id: 'tech', label: 'Техника',  sub: 'произношение' },
    { id: 'phr',  label: 'Фразы',    sub: 'разговорник' },
    { id: 'word', label: 'Слова',    sub: 'вариации' },
    { id: 'talk', label: 'Разговор', sub: 'самовыражение' }
  ],
  levels: [
    { id: 'Б', label: 'Базовый' },
    { id: 'С', label: 'Средний' },
    { id: 'П', label: 'Продвинутый' }
  ]
};

// ---- parse ----
function splitCell(s){ return s ? s.split(',').map(x=>x.trim()).filter(Boolean) : []; }
const raw = fs.readFileSync(dir + 'graph.txt', 'utf8').split('\n');
const skills = [], milestones = [];
const errors = [], warnings = [];
let section = null;
raw.forEach((lineRaw, i) => {
  const ln = i + 1;
  const line = lineRaw.replace(/\r$/, '').trim();
  if (!line || line.startsWith('#')) return;
  if (line === '[skills]')     { section = 'skills'; return; }
  if (line === '[milestones]') { section = 'milestones'; return; }
  const p = line.split('|').map(x => x.trim());
  if (section === 'skills') {
    if (p.length < 7) { errors.push(`строка ${ln}: ожидалось ≥7 столбцов, получено ${p.length}`); return; }
    const [id, branch, level, voices, needs, src, label] = p;
    const desc = p.length > 7 ? p.slice(7).join('|').trim() : '';
    skills.push({ id, label, branch, level, voices: splitCell(voices), needs: splitCell(needs), src, desc });
  } else if (section === 'milestones') {
    if (p.length !== 5) { errors.push(`строка ${ln}: ожидалось 5 столбцов, получено ${p.length}`); return; }
    const [id, fed_by, context, expr, label] = p;
    milestones.push({ id, label, fed_by: splitCell(fed_by), context, expr });
  } else {
    errors.push(`строка ${ln}: данные вне секции [skills]/[milestones]`);
  }
});

// ---- parse blocks.txt (группировка по времени; отдельный файл, легко править) ----
const blocks = [];
const blockOf = {};
if (fs.existsSync(dir + 'blocks.txt')) {
  let bsec = null;
  fs.readFileSync(dir + 'blocks.txt', 'utf8').split('\n').forEach(rw => {
    const line = rw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) return;
    if (line === '[blocks]') { bsec = 'blocks'; return; }
    if (line === '[assign]') { bsec = 'assign'; return; }
    if (bsec === 'blocks') {
      const p = line.split('|').map(x => x.trim());
      blocks.push({ id: p[0], months: p[1] || '', label: p[2] || '' });
    } else if (bsec === 'assign') {
      const c = line.indexOf(':');
      if (c < 0) return;
      const bid = line.slice(0, c).trim();
      line.slice(c + 1).split(',').map(x => x.trim()).filter(Boolean).forEach(id => {
        if (blockOf[id]) errors.push(`blocks.txt: узел в двух блоках: ${id}`);
        blockOf[id] = bid;
      });
    }
  });
}

// ---- validate ----
const ids = new Set();
const validBranch = new Set(meta.branches.map(b => b.id));
const validLevel  = new Set(meta.levels.map(l => l.id));
const validVoice  = new Set(Object.keys(meta.voices));
const byId = {};
skills.forEach(s => {
  if (ids.has(s.id)) errors.push(`дубль id: ${s.id}`);
  ids.add(s.id); byId[s.id] = s;
  if (!validBranch.has(s.branch)) errors.push(`${s.id}: неизвестная ветка "${s.branch}"`);
  if (!validLevel.has(s.level))   errors.push(`${s.id}: неизвестный уровень "${s.level}"`);
  s.voices.forEach(v => { if (!validVoice.has(v)) errors.push(`${s.id}: неизвестный голос "${v}"`); });
});
skills.forEach(s => s.needs.forEach(n => { if (!ids.has(n)) errors.push(`${s.id}: висячая связь needs → ${n}`); }));
milestones.forEach(m => {
  if (ids.has(m.id)) errors.push(`id вехи совпадает с навыком: ${m.id}`);
  m.fed_by.forEach(f => { if (!ids.has(f)) errors.push(`${m.id}: висячая fed_by → ${f}`); });
});

// blocks: проверка ссылок и привязка к узлам
const blockIds = new Set(blocks.map(b => b.id));
Object.entries(blockOf).forEach(([id, bid]) => {
  if (!ids.has(id)) errors.push(`blocks.txt: неизвестный узел ${id}`);
  if (!blockIds.has(bid)) errors.push(`blocks.txt: неизвестный блок ${bid}`);
});
skills.forEach(s => { s.block = blockOf[s.id] || ''; if (blocks.length && !blockOf[s.id]) warnings.push(`без блока: ${s.id}`); });
// порядок блоков: пререквизит не должен стоять в более позднем блоке (учим раньше, чем то, что нужно)
if (blocks.length) {
  const bidx = {}; blocks.forEach((b, i) => bidx[b.id] = i);
  skills.forEach(s => s.needs.forEach(n => {
    if (byId[n] && byId[n].block && s.block && bidx[byId[n].block] > bidx[s.block])
      warnings.push(`блок-порядок: «${s.label}» (${s.block}) нужен «${byId[n].label}» (${byId[n].block}) — пререквизит позже`);
  }));
}

// warnings: инверсия уровня и избыточные транзитивные связи
function ancestors(id) {
  const out = new Set(), st = [...(byId[id] ? byId[id].needs : [])];
  while (st.length) { const n = st.pop(); if (out.has(n)) continue; out.add(n); (byId[n] ? byId[n].needs : []).forEach(x => st.push(x)); }
  return out;
}
skills.forEach(s => {
  s.needs.forEach(n => {
    if (byId[n] && ORDER[byId[n].level] > ORDER[s.level])
      warnings.push(`инверсия уровня: ${s.id} (${s.level}) needs ${n} (${byId[n].level})`);
  });
  s.needs.forEach(d => {
    const reach = new Set();
    s.needs.filter(x => x !== d).forEach(o => ancestors(o).forEach(a => reach.add(a)));
    if (reach.has(d)) warnings.push(`избыточная связь: ${s.id} → ${d} (уже достижима через другую связь)`);
  });
});

// ---- report ----
const cnt = {};
skills.forEach(s => { const k = s.branch + '/' + s.level; cnt[k] = (cnt[k] || 0) + 1; });
console.log('— сборка графа WCS —');
console.log(`навыки: ${skills.length}  вехи: ${milestones.length}`);
console.log('по ветке/уровню:', JSON.stringify(cnt));
if (blocks.length) { const bc = {}; skills.forEach(s => { bc[s.block || '—'] = (bc[s.block || '—'] || 0) + 1; }); console.log('по блокам:', JSON.stringify(bc)); }
if (warnings.length) { console.log(`WARN (${warnings.length}):`); warnings.forEach(w => console.log('  • ' + w)); }
if (errors.length)   { console.log(`ОШИБКИ (${errors.length}):`); errors.forEach(e => console.log('  ✗ ' + e)); console.log('Ничего не записано.'); process.exit(1); }

// ---- serialize ----
const obj = { star: meta.star, voices: meta.voices, branches: meta.branches, levels: meta.levels, blocks, skills, milestones };
function ser(o) {
  const sk = o.skills.map(s => '    ' + JSON.stringify(s)).join(',\n');
  const ms = o.milestones.map(m => '    ' + JSON.stringify(m)).join(',\n');
  return '{\n  "star": ' + JSON.stringify(o.star) +
    ',\n  "voices": ' + JSON.stringify(o.voices) +
    ',\n  "branches": ' + JSON.stringify(o.branches) +
    ',\n  "levels": ' + JSON.stringify(o.levels) +
    ',\n  "blocks": ' + JSON.stringify(o.blocks) +
    ',\n  "skills": [\n' + sk + '\n  ],\n  "milestones": [\n' + ms + '\n  ]\n}';
}
const assign = 'window.WCS_GRAPH = ' + ser(obj) + ';';

// ---- write graph-data.js (генерируемый артефакт) ----
fs.writeFileSync(dir + 'graph-data.js',
  '/* СГЕНЕРИРОВАНО build.mjs из graph.txt — НЕ редактировать вручную. */\n' + assign + '\n');
console.log('записан graph-data.js');

// ---- inject into html ----
let ok = true;
const re = /window\.WCS_GRAPH = \{[\s\S]*?\n\};/;
for (const f of ['index.html', 'network.html', 'editor.html']) {
  const p = dir + f;
  const before = fs.readFileSync(p, 'utf8');
  if (!re.test(before)) { console.log('WARN: в ' + f + ' не нашёл блок данных для замены'); ok = false; continue; }
  const after = before.replace(re, () => assign);
  if (after !== before) fs.writeFileSync(p, after);
  console.log((after !== before ? 'вшит ' : 'без изменений ') + f);
}
process.exit(ok ? 0 : 2);
