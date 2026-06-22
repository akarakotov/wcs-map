(function () {
  'use strict';

  const DATA_URL = window.SKILLS_DATA_URL || 'data.json';
  const STORAGE_KEY = 'wiy-wcs-skills-' + (window.SKILLS_STORAGE_SUFFIX || 'v0.1');
  const STATE_LOCKED = 0;
  const STATE_SEEN = 1;
  const STATE_CONFIDENT = 2;

  const CIRCLED = { 1: '①', 2: '②', 3: '③', 4: '④' };
  const ROLE_INFO = {
    lead: { short: '🕺 lead', label: 'роль лидера' },
    follow: { short: '💃 follow', label: 'роль фолловера' },
    both: { short: '', label: 'обе роли' },
  };

  let data = null;
  let progress = {};
  let modalCurrentItemId = null;

  function loadProgress() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.warn('Не удалось прочитать прогресс:', e);
      return {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.warn('Не удалось сохранить прогресс:', e);
    }
  }

  function getItemState(itemId) {
    return progress[itemId] || STATE_LOCKED;
  }

  function setItemState(itemId, newState) {
    if (newState === STATE_LOCKED) {
      delete progress[itemId];
    } else {
      progress[itemId] = newState;
    }
    saveProgress();
    renderItem(itemId);
    renderBranchProgress();
    renderTotalProgress();
  }

  function cycleItemState(itemId) {
    const current = getItemState(itemId);
    const next = (current + 1) % 3;
    setItemState(itemId, next);
  }

  function findItemById(itemId) {
    for (const branch of data.branches) {
      const item = branch.items.find(i => i.id === itemId);
      if (item) return { item, branch };
    }
    return null;
  }

  function findBranchById(branchId) {
    return data.branches.find(b => b.id === branchId) || null;
  }

  function stateInfo(stateNum) {
    return data.states[String(stateNum)] || data.states['0'];
  }

  function stageInfo(stage) {
    if (!data.maturity_model) return null;
    return data.maturity_model.find(m => m.stage === stage) || null;
  }

  function stageShortLabel(stage) {
    const info = stageInfo(stage);
    const txt = info ? (info.label_ru || '').split('—')[0].trim() : ('Стадия ' + stage);
    return (CIRCLED[stage] || stage) + ' ' + txt;
  }

  function renderItem(itemId) {
    const found = findItemById(itemId);
    if (!found) return;
    const el = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!el) return;
    const state = getItemState(itemId);
    el.className = 'item state-' + state;
    el.dataset.state = state;
    const iconEl = el.querySelector('.item-state-icon');
    if (iconEl) iconEl.textContent = stateInfo(state).icon;
  }

  function renderBranchProgress() {
    for (const branch of data.branches) {
      const total = branch.items.length;
      const seen = branch.items.filter(i => getItemState(i.id) >= STATE_SEEN).length;
      const conf = branch.items.filter(i => getItemState(i.id) === STATE_CONFIDENT).length;
      const el = document.querySelector(`[data-branch-progress="${branch.id}"]`);
      if (el) {
        el.textContent = `${seen}/${total}${conf > 0 ? ` · 💪 ${conf}` : ''}`;
      }
    }
  }

  function renderTotalProgress() {
    let total = 0, seen = 0, conf = 0;
    for (const branch of data.branches) {
      for (const item of branch.items) {
        total++;
        const s = getItemState(item.id);
        if (s >= STATE_SEEN) seen++;
        if (s === STATE_CONFIDENT) conf++;
      }
    }
    document.getElementById('stat-seen').textContent = seen;
    document.getElementById('stat-confident').textContent = conf;
    document.getElementById('stat-total').textContent = `/ ${total}`;

    const seenPct = total ? (seen / total) * 100 : 0;
    const confPct = total ? (conf / total) * 100 : 0;
    document.getElementById('bar-seen').style.width = seenPct + '%';
    document.getElementById('bar-confident').style.width = confPct + '%';
  }

  function buildItemNode(item) {
    const btn = document.createElement('button');
    btn.className = 'item state-' + getItemState(item.id);
    btn.dataset.itemId = item.id;
    btn.type = 'button';
    btn.setAttribute('aria-label', `${item.name_en} — клик чтобы открыть детали`);

    const icon = document.createElement('span');
    icon.className = 'item-state-icon';
    icon.textContent = stateInfo(getItemState(item.id)).icon;

    const nameWrap = document.createElement('span');
    nameWrap.className = 'item-name';
    nameWrap.textContent = item.name_en;
    if (item.name_ru) {
      const ruSpan = document.createElement('span');
      ruSpan.className = 'item-name-ru';
      ruSpan.textContent = item.name_ru;
      nameWrap.appendChild(ruSpan);
    }

    btn.appendChild(icon);
    btn.appendChild(nameWrap);

    // role chip — only for role-specific skills (lead / follow); "both" is the silent default
    if (item.role && item.role !== 'both' && ROLE_INFO[item.role]) {
      const roleChip = document.createElement('span');
      roleChip.className = 'item-role role-' + item.role;
      roleChip.textContent = ROLE_INFO[item.role].short;
      roleChip.title = ROLE_INFO[item.role].label;
      btn.appendChild(roleChip);
    }

    const level = document.createElement('span');
    const levelCode = item.level_code || item.level;
    level.className = 'item-level level-' + levelCode;
    level.textContent = item.level;

    btn.appendChild(level);

    btn.addEventListener('click', (e) => {
      if (e.shiftKey) {
        cycleItemState(item.id);
      } else {
        openModal(item.id);
      }
    });

    return btn;
  }

  function buildItemsContainer(branch) {
    const wrap = document.createElement('div');
    wrap.className = 'items';

    const useStages = data.maturity_model && branch.items.some(i => i.stage);
    if (useStages) {
      const byStage = {};
      for (const item of branch.items) {
        const s = item.stage || 0;
        (byStage[s] = byStage[s] || []).push(item);
      }
      Object.keys(byStage).map(Number).sort((a, b) => a - b).forEach(s => {
        const head = document.createElement('div');
        head.className = 'stage-group-header stage-s' + s;
        head.textContent = stageShortLabel(s);
        wrap.appendChild(head);
        for (const item of byStage[s]) wrap.appendChild(buildItemNode(item));
      });
    } else {
      for (const item of branch.items) wrap.appendChild(buildItemNode(item));
    }
    return wrap;
  }

  function buildBranchNode(branch) {
    const section = document.createElement('section');
    section.className = 'branch branch-' + (branch.kind || 'skills');
    section.dataset.branchId = branch.id;

    const header = document.createElement('div');
    header.className = 'branch-header';

    const icon = document.createElement('span');
    icon.className = 'branch-icon';
    icon.textContent = branch.icon || '•';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'branch-title-wrap';
    const h2 = document.createElement('h2');
    h2.className = 'branch-title';
    h2.textContent = branch.title;
    titleWrap.appendChild(h2);
    if (branch.subtitle_ru) {
      const sub = document.createElement('p');
      sub.className = 'branch-subtitle';
      sub.textContent = branch.subtitle_ru;
      titleWrap.appendChild(sub);
    }
    if (branch.intro_ru) {
      const intro = document.createElement('p');
      intro.className = 'branch-intro';
      intro.textContent = branch.intro_ru;
      titleWrap.appendChild(intro);
    }

    const progressEl = document.createElement('span');
    progressEl.className = 'branch-progress';
    progressEl.dataset.branchProgress = branch.id;
    progressEl.textContent = '0/' + branch.items.length;

    header.appendChild(icon);
    header.appendChild(titleWrap);
    header.appendChild(progressEl);
    section.appendChild(header);

    section.appendChild(buildItemsContainer(branch));

    return section;
  }

  function renderExtras() {
    // Maturity legend (only on the master map; container absent on other maps)
    const matWrap = document.getElementById('maturity-legend');
    if (matWrap && data.maturity_model) {
      matWrap.innerHTML = '';
      for (const m of data.maturity_model) {
        const card = document.createElement('div');
        card.className = 'maturity-card stage-s' + m.stage;
        const h = document.createElement('div');
        h.className = 'maturity-card-head';
        h.innerHTML = `<span class="maturity-num">${CIRCLED[m.stage] || m.stage}</span> <strong>${m.label_ru || ''}</strong>`;
        const tags = document.createElement('div');
        tags.className = 'maturity-tags';
        if (m.wsdc) tags.appendChild(tagEl('WSDC: ' + m.wsdc));
        if (m.dreyfus) tags.appendChild(tagEl('Dreyfus: ' + m.dreyfus));
        const d = document.createElement('p');
        d.className = 'maturity-desc';
        d.textContent = m.descriptor_ru || '';
        card.appendChild(h);
        card.appendChild(tags);
        card.appendChild(d);
        matWrap.appendChild(card);
      }
    }

    // Reconciliation note
    const rec = document.getElementById('reconciliation');
    if (rec && data.reconciliation_ru) rec.textContent = data.reconciliation_ru;

    // Directions ("where to grow")
    const dirWrap = document.getElementById('directions');
    if (dirWrap && data.directions) {
      dirWrap.innerHTML = '';
      for (const dir of data.directions) {
        const card = document.createElement('div');
        card.className = 'direction-card';
        const t = document.createElement('h3');
        t.textContent = dir.title_ru || '';
        const p = document.createElement('p');
        p.textContent = dir.description_ru || '';
        card.appendChild(t);
        card.appendChild(p);
        if (dir.branches && dir.branches.length) {
          const chips = document.createElement('div');
          chips.className = 'direction-branches';
          for (const bid of dir.branches) {
            const br = findBranchById(bid);
            if (br) {
              const chip = document.createElement('span');
              chip.className = 'direction-chip';
              chip.textContent = (br.icon ? br.icon + ' ' : '') + br.title;
              chips.appendChild(chip);
            }
          }
          card.appendChild(chips);
        }
        dirWrap.appendChild(card);
      }
    }

    // Glossary
    const glWrap = document.getElementById('glossary');
    if (glWrap && data.glossary) {
      glWrap.innerHTML = '';
      for (const g of data.glossary) {
        const row = document.createElement('div');
        row.className = 'glossary-row';
        const t = document.createElement('dt');
        t.textContent = g.term_en || '';
        const d = document.createElement('dd');
        d.textContent = g.ru || '';
        row.appendChild(t);
        row.appendChild(d);
        glWrap.appendChild(row);
      }
    }
  }

  function tagEl(text) {
    const s = document.createElement('span');
    s.className = 'mini-tag';
    s.textContent = text;
    return s;
  }

  function renderAll() {
    document.getElementById('page-title').textContent = data.meta.title;
    document.getElementById('page-subtitle').textContent = data.meta.subtitle;
    const note = document.getElementById('footer-note');
    if (note) note.textContent = data.meta.note_ru || '';
    const ver = document.getElementById('footer-version');
    if (ver) ver.textContent = `v${data.meta.version} · обновлено ${data.meta.last_updated}`;

    renderExtras();

    const container = document.getElementById('branches');
    container.innerHTML = '';
    for (const branch of data.branches) {
      container.appendChild(buildBranchNode(branch));
    }
    renderBranchProgress();
    renderTotalProgress();
  }

  // -- Modal --
  function openModal(itemId) {
    const found = findItemById(itemId);
    if (!found) return;
    const { item, branch } = found;
    modalCurrentItemId = itemId;
    const modal = document.getElementById('item-modal');

    document.getElementById('modal-title').textContent = item.name_en;

    const stageLabel = item.stage ? ' · ' + stageShortLabel(item.stage) : '';
    const roleLabel = (item.role && ROLE_INFO[item.role] && item.role !== 'both')
      ? ' · ' + ROLE_INFO[item.role].label : '';
    document.getElementById('modal-subtitle').textContent =
      `${branch.icon} ${branch.title} · ${item.name_ru || ''}${stageLabel}${roleLabel}`;
    document.getElementById('modal-description').textContent = item.description_ru || '';

    // "why" block (master map)
    const whyWrap = document.getElementById('modal-why');
    if (whyWrap) {
      if (item.why_ru) {
        document.getElementById('modal-why-text').textContent = item.why_ru;
        whyWrap.hidden = false;
      } else {
        whyWrap.hidden = true;
      }
    }

    // trains: resolve against item ids first, then branch ids
    const trainsWrap = document.getElementById('modal-trains');
    const trainsList = document.getElementById('modal-trains-list');
    trainsList.innerHTML = '';
    let trainsCount = 0;
    if (item.trains && item.trains.length) {
      for (const ref of item.trains) {
        const name = resolveTrainName(ref);
        if (name) {
          const li = document.createElement('li');
          li.textContent = name;
          trainsList.appendChild(li);
          trainsCount++;
        }
      }
    }
    trainsWrap.hidden = trainsCount === 0;

    // patterns examples (master map)
    const patWrap = document.getElementById('modal-patterns');
    if (patWrap) {
      const patList = document.getElementById('modal-patterns-list');
      patList.innerHTML = '';
      if (item.patterns_examples && item.patterns_examples.length) {
        for (const p of item.patterns_examples) {
          const li = document.createElement('li');
          li.textContent = p;
          patList.appendChild(li);
        }
        patWrap.hidden = false;
      } else {
        patWrap.hidden = true;
      }
    }

    const videoWrap = document.getElementById('modal-video');
    const videoLink = document.getElementById('modal-video-link');
    if (item.video && item.video.url) {
      videoLink.href = item.video.url;
      videoLink.textContent = item.video.label || 'Открыть видео';
      videoWrap.hidden = false;
    } else {
      videoWrap.hidden = true;
    }

    updateModalStateButtons();

    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
  }

  function resolveTrainName(refId) {
    const byItem = findItemById(refId);
    if (byItem) return byItem.item.name_en + (byItem.item.name_ru ? ' · ' + byItem.item.name_ru : '');
    const br = findBranchById(refId);
    if (br) return (br.icon ? br.icon + ' ' : '') + br.title;
    return null;
  }

  function closeModal() {
    const modal = document.getElementById('item-modal');
    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.removeAttribute('open');
    }
    modalCurrentItemId = null;
  }

  function updateModalStateButtons() {
    if (!modalCurrentItemId) return;
    const current = getItemState(modalCurrentItemId);
    document.querySelectorAll('.state-btn').forEach(btn => {
      const s = parseInt(btn.dataset.state, 10);
      btn.classList.toggle('active', s === current);
    });
  }

  function attachModalHandlers() {
    document.getElementById('modal-close').addEventListener('click', closeModal);

    const modal = document.getElementById('item-modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.querySelectorAll('.state-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (modalCurrentItemId == null) return;
        const newState = parseInt(btn.dataset.state, 10);
        setItemState(modalCurrentItemId, newState);
        updateModalStateButtons();
      });
    });
  }

  function attachResetHandler() {
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (!confirm('Сбросить все отметки прогресса? Это нельзя отменить.')) return;
      progress = {};
      saveProgress();
      data.branches.forEach(branch => {
        branch.items.forEach(item => renderItem(item.id));
      });
      renderBranchProgress();
      renderTotalProgress();
    });
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      console.error('Не удалось загрузить data.json:', e);
      document.getElementById('branches').innerHTML =
        '<p style="text-align:center;color:#999">Не удалось загрузить карту. Проверьте, что страница открыта через сервер (не file://).</p>';
      return;
    }
    progress = loadProgress();
    renderAll();
    attachModalHandlers();
    attachResetHandler();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
