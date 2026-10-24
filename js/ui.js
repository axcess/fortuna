// ============================================================================
//  UI — DOM panels, inspector, modals, events
// ============================================================================
'use strict';

const UI = { tab: 'roster', tool: null, insp: null, modalOpen: false, last: 0, toolRot: false, logFilter: 'all' };
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch]));
const bar = (v, cls = '', max = 100) => `<div class="bar ${cls}"><i style="width:${U.clamp(v / max * 100, 0, 100)}%"></i></div>`;
const needCls = (v) => v < 20 ? 'crit' : v < 45 ? 'low' : 'ok';
const ago = (t) => Sim.dateStr(t) + ' ' + String(Math.floor(t % 1440 / 60)).padStart(2, '0') + ':00';

UI.init = () => {
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { UI.tab = b.dataset.tab; UI.setTool(null); UI.renderPanel(true); });
  $('#panel').addEventListener('click', UI.onPanelClick);
  // never swap the DOM out from under a press, or the click is lost
  for (const sel of ['#panel', '#inspector']) {
    $(sel).addEventListener('pointerdown', () => { UI.pressing = true; });
  }
  window.addEventListener('pointerup', () => setTimeout(() => { UI.pressing = false; }, 0));
  $('#inspector').addEventListener('click', UI.onPanelClick);
  $('#modal').addEventListener('click', UI.onPanelClick);
  document.querySelectorAll('#speed button').forEach(b => b.onclick = () => Game.setSpeed(+b.dataset.s));
  document.querySelectorAll('#overlays button').forEach(b => b.onclick = () => {
    Render.overlay = b.dataset.o === 'none' ? null : b.dataset.o;
    document.querySelectorAll('#overlays button').forEach(x => x.classList.toggle('on', x === b));
    UI.overlayLegend();
  });
  $('#menuBtn').onclick = () => UI.menu();
  const cv = Render.cv;
  cv.addEventListener('mousemove', UI.onMove);
  cv.addEventListener('mouseleave', () => { Render.hover = null; Render.ghost = null; $('#tip').style.display = 'none'; });
  cv.addEventListener('click', UI.onCanvasClick);
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); UI.setTool(null); });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); Game.setSpeed(Game.speed ? 0 : (Game.lastSpeed || 1)); }
    if (e.key === '1' || e.key === '2' || e.key === '3') Game.setSpeed(+e.key);
    if (e.key === 'Escape') { if (UI.tool) UI.setTool(null); else UI.closeInspector(); }
    if ((e.key === 'r' || e.key === 'R') && UI.tool && UI.tool.kind === 'room') { UI.tool.rot = !UI.tool.rot; UI.onMove(UI.lastMouse || null); }
  });
};

// ---------------------------------------------------------------- top bar --
UI.renderTop = () => {
  const rk = DATA.RANKS[Sim.rankIdx()], nx = DATA.RANKS[Sim.rankIdx() + 1];
  $('#gName').textContent = G.name;
  $('#date').textContent = Sim.dateStr();
  $('#clock').textContent = Sim.clockStr();
  $('#weather').textContent = { clear: Sim.isDaylight() ? '☀️' : '🌙', rain: '🌧️', storm: '⛈️', snow: '❄️' }[G.weather];
  $('#weather').title = G.weather;
  $('#gold').textContent = Math.floor(G.gold);
  $('#gold').parentElement.classList.toggle('neg', G.gold < 20);
  $('#rank').textContent = rk.id;
  $('#renown').textContent = Math.floor(G.renown) + (nx ? ' / ' + nx.renown : '');
  $('#rankbar').style.width = (nx ? U.clamp((G.renown - rk.renown) / (nx.renown - rk.renown) * 100, 0, 100) : 100) + '%';
  $('#debt').textContent = G.debt > 0 ? G.debt + 'g' : 'Free!';
  const advs = Sim.advs();
  const mood = G.chars.length ? Math.round(G.chars.reduce((s, c) => s + c.mood, 0) / G.chars.length) : 0;
  $('#morale').textContent = Sim.moodFace(mood) + ' ' + mood;
  $('#headcount').textContent = advs.length + '/' + rk.roster;
};

// ------------------------------------------------------------------ panel --
UI.renderPanel = (force) => {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const el = $('#panel');
  if (UI.pressing && !force) return;
  const st = el.scrollTop;
  const html = UI['tab_' + UI.tab]();
  if (force || el._html !== html) { el.innerHTML = html; el._html = html; el.scrollTop = force ? 0 : st; }
  if (UI.tab === 'roster') el.querySelectorAll('canvas[data-por]').forEach(cv => { const c = Sim.char(+cv.dataset.por) || G.apps.find(a => a.id === +cv.dataset.por); if (c) Render.portrait(cv, c, 2); });
  if (UI.tab === 'ledger') UI.drawChart();
};
UI.status = (c) => {
  if (c.state === 'away') { const a = G.active.find(x => x.party.includes(c.id)); return a ? `Questing: ${a.q.title}` : 'Away'; }
  if (c.state === 'leaving') return 'Heading out on a quest';
  if (c.state === 'quitting') return 'Leaving the guild for good';
  if (c.state === 'returning') return 'Returning home';
  const a = c.act; if (!a) return 'Thinking...';
  const def = Sim.ACTS[a.type];
  const lbl = def && def.label ? def.label(c, a) : a.type;
  return a.phase === 'walk' && !['wander', 'leave', 'enter'].includes(a.type) ? `→ ${lbl}` : lbl;
};
UI.tab_roster = () => {
  const advs = Sim.advs(), staff = Sim.staff(), cap = DATA.RANKS[Sim.rankIdx()].roster;
  const card = (c) => {
    const low = Object.entries(c.needs).filter(([k, v]) => v < 25 && (c.kind === 'adv' || k !== 'purpose')).map(([k]) => ({ hunger: '🍖', energy: '😪', hygiene: '🦨', social: '👥', fun: '🥱', purpose: '❔' }[k])).join('');
    const sub = c.kind === 'adv' ? `Lv${c.lvl} ${DATA.CLASSES[c.cls].name}` : DATA.STAFF[c.role].name;
    return `<div class="card char ${UI.insp && UI.insp.id === c.id ? 'sel' : ''} ${c.state === 'away' ? 'away' : ''}" data-act="insp" data-id="${c.id}">
      <canvas data-por="${c.id}" width="48" height="48"></canvas>
      <div class="grow"><div class="row"><b>${esc(c.name)}</b><span class="mut">${sub}</span><span class="r">${Sim.moodFace(c.mood)}</span></div>
      <div class="mut small ellip">${esc(UI.status(c))}</div>
      <div class="row small">${c.injury > 0 ? '<span class="tag bad">🩹 Injured</span>' : ''}${c.loyalty < 30 ? '<span class="tag bad">Disloyal</span>' : ''}<span class="warn">${low}</span></div></div></div>`;
  };
  let h = `<h3>Adventurers <span class="mut">${advs.length}/${cap}</span></h3>`;
  h += advs.length ? advs.map(card).join('') : '<p class="mut">No adventurers! Recruit some below.</p>';
  h += `<h3>Staff</h3>` + (staff.length ? staff.map(card).join('') : '<p class="mut small">No staff yet. They work for wages and need beds and meals too.</p>');
  h += `<div class="hire">${Object.entries(DATA.STAFF).map(([k, s]) => `<button data-act="hireStaff" data-k="${k}" title="${s.desc}">${s.icon} Hire ${s.name}<br><span class="small">30g + ${s.wage}g/day</span></button>`).join('')}</div>`;
  h += `<h3>Applicants <span class="mut small">refresh weekly</span></h3>`;
  h += G.apps.length ? G.apps.map(a => `<div class="card app">
      <canvas data-por="${a.id}" width="48" height="48"></canvas>
      <div class="grow"><div class="row"><b>${esc(a.full)}</b><span class="mut">Lv${a.lvl} ${a.ancestry} ${DATA.CLASSES[a.cls].name}</span></div>
      <div class="small">${UI.statLine(a)}</div>
      <div class="small">${a.traits.map(t => `<span class="trait" title="${DATA.TRAITS[t].desc}">${DATA.TRAITS[t].name}</span>`).join('')} <span class="mut">from ${a.origin}</span></div>
      <div class="row"><button data-act="hire" data-id="${a.id}">Hire · ${a.hireCost}g</button><span class="mut small">wage ${a.wage}g/day</span></div></div></div>`).join('') : '<p class="mut small">Nobody is looking for work right now.</p>';
  return h;
};
UI.statLine = (c) => ['mig', 'arc', 'agi', 'spi'].map(s => `<span class="stat s-${s}" title="${STAT_LABEL[s]}">${STAT_LABEL[s].slice(0, 3)} ${Math.floor(c.stats[s])}</span>`).join(' ');

UI.tab_quests = () => {
  let h = '';
  if (!Sim.roomsOf('board').length) h += `<div class="note">📌 The Quest Board is broken — townsfolk can't post requests. Click it in the hall and order repairs.</div>`;
  h += `<h3>Requests on the Board <span class="mut small">${G.quests.length}/${Sim.questCap()}</span></h3>`;
  if (!G.quests.length) h += '<p class="mut small">No requests posted. New ones arrive every morning, and townsfolk pin more during the day.</p>';
  for (const q of G.quests) {
    const reg = DATA.REGIONS.find(r => r.id === q.region), f = DATA.FACTIONS[q.faction];
    const top = Object.entries(q.w).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => `<span class="stat s-${k}">${STAT_LABEL[k]}</span>`).join(' ');
    const left = q.expires - Sim.day();
    h += `<div class="card quest ${q.boss ? 'boss' : ''}"><div class="grow">
      <div class="row"><b>${esc(q.title)}</b></div>
      <div class="small mut">${reg.name} · ${'★'.repeat(q.tier)} · ${f.icon} ${f.name}</div>
      <div class="small">Needs: ${top} · Party ${q.rec}${q.max > q.rec ? '–' + q.max : ''} · ${q.days}d · Risk ${q.risk >= 1.2 ? '<span class="bad">High</span>' : q.risk >= 0.9 ? 'Med' : 'Low'}</div>
      <div class="row small"><span class="gold">💰 ${q.gold}</span><span>⭐ ${q.renown}</span><span>✨ ${q.xp}xp</span>${q.boss ? '' : `<span class="mut r">${left <= 1 ? '<span class="bad">expires soon</span>' : 'expires in ' + left + 'd'}</span>`}</div>
      <button data-act="assemble" data-id="${q.id}">Assemble party</button></div></div>`;
  }
  h += `<h3>In the Field</h3>`;
  if (!G.active.length) h += '<p class="mut small">No parties out.</p>';
  for (const a of G.active) {
    const p = Math.round(U.clamp((G.t - a.start) / (a.end - a.start), 0, 1) * 50) / 50;
    const names = a.party.map(id => (Sim.char(id) || { name: '?' }).name).join(', ');
    const last = a.log[a.log.length - 1];
    h += `<div class="card"><div class="grow"><b>${esc(a.q.title)}</b><div class="small mut">${names} · predicted ${Math.round(a.pred * 100)}%</div>
      ${bar(p * 100, 'quest')}<div class="small ellip">${last ? '“' + esc(last.text) + '”' : 'The road stretches ahead...'}</div></div></div>`;
  }
  return h;
};
UI.tab_build = () => {
  const t = UI.tool;
  let h = `<div class="tools">
    <button data-act="tool" data-k="clear" class="${t && t.kind === 'clear' ? 'on' : ''}" title="Mark rubble to be cleared by idle hands (5g)">⛏️ Clear rubble<br><span class="small">5g</span></button>
    <button data-act="tool" data-k="roof" class="${t && t.kind === 'roof' ? 'on' : ''}" title="Hire a roofer to patch a leak (25g)">🪜 Patch roof<br><span class="small">${Sim.cost(25)}g</span></button>
    <button data-act="tool" data-k="demolish" class="${t && t.kind === 'demolish' ? 'on' : ''}" title="Remove furniture (40% refund)">🪓 Demolish</button>
  </div>`;
  if (t) h += `<div class="note small">${t.kind === 'room' ? `Placing <b>${DATA.ROOMS[t.type].name}</b>. Click the hall to build, <b>R</b> rotates, right-click/Esc cancels.` : 'Click tiles in the hall. Right-click or Esc to stop.'}</div>`;
  const leaks = G.map.filter(x => x.leak).length, rub = G.map.filter(x => x.t === 'rubble').length;
  h += `<div class="small mut">Rubble piles: ${rub} · Roof leaks: ${leaks}</div>`;
  for (const cat of DATA.BUILD_CATS) {
    h += `<h3>${cat}</h3><div class="grid">`;
    for (const [k, d] of Object.entries(DATA.ROOMS)) {
      if (d.cat !== cat || k === 'board') continue;
      const locked = !Sim.rankOk(d.rank), cost = Sim.cost(d.cost), have = G.rooms.filter(r => r.type === k).length;
      const dis = locked || (d.unique && have) || G.gold < cost;
      h += `<button class="bitem ${t && t.type === k ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="${dis ? '' : 'build'}" data-k="${k}" title="${esc(d.desc)}">
        <canvas data-room="${k}" width="40" height="40"></canvas>
        <div><b>${d.name}</b><div class="small">${locked ? '🔒 Rank ' + d.rank : `<span class="${G.gold < cost ? 'bad' : 'gold'}">${cost}g</span>`} · ${d.w}×${d.h}${have ? ' · have ' + have : ''}</div>
        <div class="small mut">${esc(d.desc)}</div></div></button>`;
    }
    h += '</div>';
  }
  return h;
};
UI.drawBuildIcons = () => {
  document.querySelectorAll('canvas[data-room]').forEach(cv => {
    if (cv._done) return; cv._done = true;
    const k = cv.dataset.room, d = DATA.ROOMS[k], ctx = cv.getContext('2d');
    const s = 40 / (Math.max(d.w, d.h) * 32 + 8);
    ctx.setTransform(s, 0, 0, s, (40 - d.w * 32 * s) / 2, (40 - d.h * 32 * s) / 2);
    Render.F[k](ctx, 0, 0, d.w * 32, d.h * 32, { broken: false, cond: 100, id: 0 }, 32);
  });
};
UI.tab_guild = () => {
  const ri = Sim.rankIdx(), rk = DATA.RANKS[ri], nx = DATA.RANKS[ri + 1];
  let h = `<h3>Guild Rank</h3><div class="card"><div class="grow"><div class="row"><span class="rankchip big">${rk.id}</span><b>${rk.title}</b><span class="mut r">${Math.floor(G.renown)} renown</span></div>
    ${nx ? bar((G.renown - rk.renown) / (nx.renown - rk.renown) * 100, 'renown') + `<div class="small mut">Next: Rank ${nx.id} at ${nx.renown} renown — unlocks ${UI.unlocks(nx.id)}</div>` : '<div class="small">The highest rank. Legends are told of you.</div>'}
    <div class="small">Roster cap ${rk.roster} · Town opinion: ${G.opinion > 30 ? '😊' : G.opinion > 0 ? '🙂' : G.opinion > -20 ? '😐' : '😠'} ${Math.round(G.opinion)}</div></div></div>`;
  const due = DATA.DAYS_PER_SEASON - (Sim.day() % DATA.DAYS_PER_SEASON);
  h += `<h3>The Copperhand Debt</h3><div class="card"><div class="grow">`;
  if (G.debt > 0) {
    h += `<div class="row"><b class="bad">${G.debt}g owed</b><span class="r small">Strikes: ${'⛔'.repeat(G.strikes)}${'⚪'.repeat(3 - G.strikes)}</span></div>
      <div class="small">Installment of <b>${Sim.debtInstallment()}g</b> due in <b>${due} day${due > 1 ? 's' : ''}</b> (end of the season). Three missed payments and the Consortium seizes the hall.</div>
      <div class="row"><button data-act="pay" data-n="50">Pay 50g</button><button data-act="pay" data-n="200">Pay 200g</button><button data-act="pay" data-n="99999">Pay all</button></div>`;
  } else h += '<b class="good">Debt free! The deed is yours.</b>';
  h += `</div></div><h3>Factions</h3>`;
  for (const [k, f] of Object.entries(DATA.FACTIONS)) {
    const v = G.factions[k] || 0;
    h += `<div class="fac"><span>${f.icon} ${f.name}</span><span class="r ${v >= 50 ? 'good' : ''}">${v}</span>${bar(Math.max(0, v), 'fac')}<div class="small mut">${f.perk}</div></div>`;
  }
  h += `<h3>Goals</h3><ul class="goals">`;
  for (const g of DATA.GOALS) {
    const done = !!G.goals[g.id];
    const rw = [g.reward.gold ? g.reward.gold + 'g' : '', g.reward.renown ? g.reward.renown + ' renown' : ''].filter(Boolean).join(', ');
    h += `<li class="${done ? 'done' : ''}">${done ? '✅' : '⬜'} ${g.text} ${rw ? `<span class="mut small">(${rw})</span>` : ''}</li>`;
  }
  h += `</ul><h3>Relics of the Old Guild <span class="mut small">${G.lore.length}/${DATA.LORE.length}</span></h3>`;
  h += G.lore.length ? G.lore.map(l => `<p class="lore">📜 ${esc(l)}</p>`).join('') : '<p class="mut small">Clearing rubble sometimes turns up pieces of the past.</p>';
  if (G.dead.length) {
    h += `<h3>Hall of the Fallen</h3>` + G.dead.map(d => `<p class="small">🕯️ <b>${esc(d.name)}</b>, Lv${d.lvl} ${DATA.CLASSES[d.cls].name} — ${esc(d.why)} (${Sim.dateStr(d.t)})</p>`).join('');
  }
  return h;
};
UI.unlocks = (rid) => {
  const rooms = Object.values(DATA.ROOMS).filter(d => d.rank === rid).map(d => d.name);
  const regs = DATA.REGIONS.filter(r => r.rank === rid).map(r => r.name);
  return [...regs.map(r => '🗺️ ' + r), ...rooms].join(', ') || 'more roster space';
};
UI.tab_ledger = () => {
  const y = G.ledger[G.ledger.length - 1];
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const wk = G.ledger.slice(-7), wInc = {}, wExp = {};
  for (const d of wk) { for (const [k, v] of Object.entries(d.inc)) wInc[k] = (wInc[k] || 0) + v; for (const [k, v] of Object.entries(d.exp)) wExp[k] = (wExp[k] || 0) + v; }
  const rows = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row small"><span>${k}</span><span class="r">${Math.round(v)}g</span></div>`).join('') || '<div class="small mut">—</div>';
  let h = `<h3>History <span class="mut small">gold · <span style="color:#7ec8ff">mood</span> · <span style="color:#9be89b">appeal</span></span></h3><canvas id="chart" width="320" height="140"></canvas>`;
  h += `<div class="cols"><div><h4>Income (7 days) <span class="good">${Math.round(sum(wInc))}g</span></h4>${rows(wInc)}</div><div><h4>Expenses (7 days) <span class="bad">${Math.round(sum(wExp))}g</span></h4>${rows(wExp)}</div></div>`;
  h += `<div class="small mut">Daily wages: ${G.chars.reduce((s, c) => s + c.wage, 0)}g · Today so far: +${Math.round(sum(G.today.inc))} / −${Math.round(sum(G.today.exp))}${y ? ` · Yesterday: +${Math.round(sum(y.inc))} / −${Math.round(sum(y.exp))}` : ''}</div>`;
  h += `<h3>Chronicle</h3><div class="row small">${['all', 'good', 'bad', 'quest', 'lore'].map(f => `<button class="mini ${UI.logFilter === f ? 'on' : ''}" data-act="logf" data-k="${f}">${f}</button>`).join('')}</div>`;
  h += `<div class="log">${G.log.filter(l => UI.logFilter === 'all' || l.kind === UI.logFilter || (UI.logFilter === 'good' && l.kind === 'goal')).slice(0, 120).map(l => `<div class="${l.kind}"><span class="mut">${Sim.dateStr(l.t)}</span> ${esc(l.text)}</div>`).join('')}</div>`;
  return h;
};
UI.drawChart = () => {
  const cv = $('#chart'); if (!cv) return;
  const ctx = cv.getContext('2d'), Wd = cv.width, Ht = cv.height, hs = G.hist.slice(-60);
  ctx.clearRect(0, 0, Wd, Ht);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, Wd, Ht);
  if (hs.length < 2) { ctx.fillStyle = '#aaa'; ctx.font = '14px VT323, monospace'; ctx.fillText('Check back after a few days.', 10, 70); return; }
  const line = (key, col, lo, hi) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    hs.forEach((p, i) => { const x = 6 + i / (hs.length - 1) * (Wd - 12), y = Ht - 8 - (p[key] - lo) / (hi - lo || 1) * (Ht - 16); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  };
  const g = hs.map(p => p.gold);
  line('gold', '#e8c64a', Math.min(0, ...g), Math.max(...g) * 1.1 + 1);
  line('mood', '#7ec8ff', 0, 100);
  line('appeal', '#9be89b', -8, 8);
  ctx.fillStyle = '#e8c64a'; ctx.font = '13px VT323, monospace'; ctx.fillText(Math.max(...g) + 'g', 6, 14);
};

// --------------------------------------------------------------- inspector -
UI.openInspector = (kind, id) => {
  UI.insp = { kind, id };
  Render.selected = kind === 'char' ? id : null;
  Render.selRoom = kind === 'room' ? id : null;
  UI.renderInspector(true);
};
UI.closeInspector = () => { UI.insp = null; Render.selected = null; Render.selRoom = null; $('#inspector').classList.remove('open'); };
UI.renderInspector = (force) => {
  const el = $('#inspector');
  if (!UI.insp) { el.classList.remove('open'); return; }
  let html = '';
  if (UI.insp.kind === 'char') {
    const c = Sim.char(UI.insp.id);
    if (!c) { UI.closeInspector(); return; }
    html = UI.charSheet(c);
  } else {
    const r = Sim.room(UI.insp.id);
    if (!r) { UI.closeInspector(); return; }
    html = UI.roomSheet(r);
  }
  if (UI.pressing && !force) return;
  if (force || el._html !== html) {
    const st = el.querySelector('.body') ? el.querySelector('.body').scrollTop : 0;
    el.innerHTML = html; el._html = html; el.classList.add('open');
    const b = el.querySelector('.body'); if (b && !force) b.scrollTop = st;
    const cv = el.querySelector('canvas.por'); if (cv) Render.portrait(cv, Sim.char(UI.insp.id), 4);
  }
};
UI.charSheet = (c) => {
  const adv = c.kind === 'adv';
  const title = adv ? `Lv${c.lvl} ${c.ancestry} ${DATA.CLASSES[c.cls].name}` : `${c.ancestry} ${DATA.STAFF[c.role].name}`;
  let h = `<div class="ihead"><canvas class="por" width="96" height="96"></canvas><div class="grow">
    <div class="row"><b class="big">${esc(c.full)}</b><button class="x" data-act="close">✕</button></div>
    <div class="mut">${title} · age ${c.age}</div><div class="small mut">From ${c.origin}</div>
    ${adv ? `<div class="small">XP ${Math.floor(c.xp)}/${Sim.xpNeed(c.lvl)}</div>${bar(c.xp / Sim.xpNeed(c.lvl) * 100, 'xp')}` : ''}
    </div></div><div class="body">`;
  h += `<div class="status">${esc(UI.status(c))}</div>`;
  if (c.th && c.th.until > G.t) h += `<div class="thought">${c.th.icon} “${esc(c.th.text)}”</div>`;
  h += `<div class="row"><b>Mood</b><span class="r">${Sim.moodFace(c.mood)} ${Sim.moodLabel(c.mood)} (${Math.round(c.mood)})</span></div>${bar(c.mood, 'mood ' + needCls(c.mood))}`;
  const ml = [...c.ml].sort((a, b) => a.v - b.v);
  const env = Math.round(c.env * 0.9);
  h += `<div class="moodlets">${ml.map(m => `<div class="${m.v >= 0 ? 'good' : 'bad'}"><span>${esc(m.label)}</span><span class="r">${m.v > 0 ? '+' : ''}${m.v}</span></div>`).join('')}
    ${env ? `<div class="${env >= 0 ? 'good' : 'bad'}"><span>${env >= 0 ? 'Pleasant surroundings' : 'Dreary, run-down hall'}</span><span class="r">${env > 0 ? '+' : ''}${env}</span></div>` : ''}</div>`;
  h += `<h4>Needs</h4><div class="needs">`;
  for (const k of NEEDS) { if (!adv && k === 'purpose') continue; h += `<div class="need"><span>${NEED_LABEL[k]}</span>${bar(c.needs[k], needCls(c.needs[k]))}</div>`; }
  h += `</div>`;
  if (adv) {
    h += `<h4>Abilities</h4><div class="stats">`;
    for (const s of STATS) { const cap = Sim.statCap(c, s); h += `<div class="need"><span class="stat s-${s}">${STAT_LABEL[s]}</span><span class="num">${Math.floor(c.stats[s])}</span>${bar(c.stats[s], 'st s-' + s, cap)}</div>`; }
    h += `</div><div class="small mut">Training caps rise with level. Gear tier ${c.gear}/5 (+${c.gear * 12}% power).</div>`;
  }
  h += `<h4>Personality</h4><div>${c.traits.map(t => `<span class="trait" title="${DATA.TRAITS[t].desc}">${DATA.TRAITS[t].name}</span>`).join('')}</div>
    <div class="small mut">${c.traits.map(t => DATA.TRAITS[t].desc).join(' ')}</div>`;
  const rels = G.chars.filter(o => o !== c).map(o => ({ o, v: Sim.rel(c.id, o.id) })).sort((a, b) => b.v - a.v);
  h += `<h4>Relationships</h4>`;
  h += rels.length ? rels.map(({ o, v }) => `<div class="rel" data-act="insp" data-id="${o.id}"><span>${esc(o.name)}</span><span class="mut small">${Sim.relLabel(v)}</span>
      <div class="relbar"><i style="left:50%;width:0"></i><b style="${v >= 0 ? `left:50%;width:${v / 2}%` : `left:${50 + v / 2}%;width:${-v / 2}%`};background:${v >= 0 ? '#6c6' : '#d55'}"></b></div></div>`).join('') : '<p class="small mut">Nobody else around.</p>';
  h += `<h4>Life</h4><div class="small">Wage <b>${c.wage}g</b>/day · Purse ${Math.floor(c.purse)}g · Loyalty ${Math.round(c.loyalty)}${bar(c.loyalty, 'loy ' + needCls(c.loyalty))}</div>`;
  if (adv) h += `<div class="small mut">Quests: ${c.quests} (${c.wins} won) · Joined ${Sim.dateStr(c.joined)}</div>`;
  h += `<div class="bio">${c.bio.map(b => `<div><span class="mut">${Sim.dateStr(b.t)}</span> ${esc(b.text)}</div>`).join('')}</div>`;
  h += `<div class="row btns"><button data-act="bonus" data-id="${c.id}">💰 Bonus (20g)</button>`;
  if (adv) h += `<button data-act="gear" data-id="${c.id}" ${Sim.roomsOf('forge').length && c.gear < 5 ? '' : 'disabled'} title="Requires a Smithy">⚒️ Gear ${c.gear < 5 ? '(' + Sim.gearCost(c) + 'g)' : 'MAX'}</button>`;
  if (c.state === 'home') h += `<button class="danger" data-act="dismiss" data-id="${c.id}">Dismiss</button>`;
  h += `</div></div>`;
  return h;
};
UI.roomSheet = (r) => {
  const d = DATA.ROOMS[r.type];
  const users = G.chars.filter(c => c.act && c.act.room === r.id && c.state !== 'away');
  let h = `<div class="ihead"><div class="grow"><div class="row"><b class="big">${d.name}</b><button class="x" data-act="close">✕</button></div>
    <div class="small mut">${esc(d.desc)}</div></div></div><div class="body">`;
  if (r.broken) h += `<div class="note bad">Broken and unusable.${r.repair ? ' Repairs ordered — waiting for someone with free hands.' : ''}</div>`;
  h += `<div class="row"><b>Condition</b><span class="r">${Math.round(r.cond)}%</span></div>${bar(r.cond, needCls(r.cond))}`;
  h += `<div class="small mut">Appeal ${d.appeal[0] > 0 ? '+' : ''}${d.appeal[0]} (radius ${d.appeal[1]}). Worn furniture works worse and looks shabby; caretakers and diligent adventurers tidy it.</div>`;
  if (d.cap) h += `<div class="small">In use: ${users.length}/${d.cap} ${users.map(c => esc(c.name)).join(', ')}</div>`;
  if (d.bed) h += `<div class="small">Belongs to: ${r.owners.map(id => (Sim.char(id) || { name: '?' }).name).join(', ') || '<span class="mut">nobody</span>'}</div>`;
  h += `<div class="row btns">`;
  if ((r.broken || r.cond < 80) && !r.repair) h += `<button data-act="repair" data-id="${r.id}">🔨 ${r.broken ? 'Repair' : 'Refurbish'} (${Sim.repairCost(r)}g)</button>`;
  if (r.type !== 'board') h += `<button class="danger" data-act="demo" data-id="${r.id}">🪓 Demolish</button>`;
  h += `</div></div>`;
  return h;
};

// --------------------------------------------------------------- clicks ----
UI.onPanelClick = (e) => {
  const b = e.target.closest('[data-act]'); if (!b || !b.dataset.act || b.disabled) return;
  const a = b.dataset.act, id = +b.dataset.id, k = b.dataset.k;
  const err = (m) => m && UI.toast(m, 'bad');
  switch (a) {
    case 'insp': UI.openInspector('char', id); break;
    case 'close': UI.closeInspector(); break;
    case 'hire': { const app = G.apps.find(x => x.id === id); if (app) err(Sim.hire(app)); UI.renderPanel(true); break; }
    case 'hireStaff': err(Sim.hireStaff(k)); UI.renderPanel(true); break;
    case 'assemble': UI.partyModal(id); break;
    case 'tool': UI.setTool(UI.tool && UI.tool.kind === k ? null : { kind: k }); break;
    case 'build': UI.setTool(UI.tool && UI.tool.type === k ? null : { kind: 'room', type: k, rot: false }); break;
    case 'pay': err(Sim.payDebt(+b.dataset.n)); UI.renderPanel(); break;
    case 'bonus': err(Sim.bonus(Sim.char(id))); break;
    case 'gear': err(Sim.upgradeGear(Sim.char(id))); break;
    case 'dismiss': { const c = Sim.char(id); UI.confirm(`Dismiss ${c.full}?`, 'Friends in the guild will be upset.', () => { Sim.dismiss(c); UI.closeInspector(); }); break; }
    case 'repair': err(Sim.orderRepair(Sim.room(id))); break;
    case 'demo': { const r = Sim.room(id); UI.confirm(`Demolish the ${DATA.ROOMS[r.type].name}?`, '40% of the cost is refunded.', () => { err(Sim.demolish(r)); UI.closeInspector(); }); break; }
    case 'logf': UI.logFilter = k; UI.renderPanel(true); break;
    case 'pick': UI.partyPick(id); break;
    case 'potions': UI.party.potions = !UI.party.potions; UI.renderParty(); break;
    case 'send': UI.sendParty(); break;
    case 'choice': UI.choose(+b.dataset.i); break;
  }
  UI.renderInspector();
};
UI.setTool = (t) => {
  UI.tool = t; Render.ghost = null;
  Render.cv.style.cursor = t ? 'crosshair' : 'default';
  if (UI.tab === 'build') UI.renderPanel();
};
UI.onMove = (e) => {
  if (!e) return;
  UI.lastMouse = e;
  const p = Render.toTile(e);
  const t = UI.tool;
  if (t && t.kind === 'room') {
    const d = DATA.ROOMS[t.type]; const w = t.rot ? d.h : d.w, h = t.rot ? d.w : d.h;
    Render.ghost = { kind: 'room', type: t.type, x: Math.floor(p.fx - w / 2 + 0.5), y: Math.floor(p.fy - h / 2 + 0.5), w, h };
  } else if (t) {
    const tile = Sim.tile(p.x, p.y);
    const ok = tile && (t.kind === 'clear' ? tile.t === 'rubble' : t.kind === 'roof' ? tile.leak : tile.room != null);
    Render.ghost = { kind: 'tile', x: p.x, y: p.y, ok };
  }
  // hover
  let best = null, bd = 0.8;
  for (const c of G.chars) {
    if (c.state === 'away') continue;
    const d = Math.hypot(c.x + 0.5 - p.fx, c.y + 0.6 - p.fy); if (d < bd) { bd = d; best = c; }
  }
  Render.hover = best ? best.id : null;
  const tip = $('#tip');
  let txt = '';
  if (best) txt = `<b>${esc(best.name)}</b> ${Sim.moodFace(best.mood)}<br>${esc(UI.status(best))}`;
  else {
    const tile = Sim.tile(p.x, p.y);
    if (tile) {
      if (tile.room != null) { const r = Sim.room(tile.room); if (r) txt = `<b>${DATA.ROOMS[r.type].name}</b>${r.broken ? ' (broken)' : ''}`; }
      else if (tile.t === 'rubble') txt = `Rubble${tile.mark ? ' (marked for clearing)' : ' — use ⛏️ Clear in Build'}`;
      else if (tile.t === 'floor' && tile.leak) txt = 'Leaky roof above';
      if (Render.overlay === 'appeal') txt += `${txt ? '<br>' : ''}Appeal ${Sim.appealAt(p.x, p.y)}`;
      if (Render.overlay === 'cond' && tile.t === 'floor') txt += `${txt ? '<br>' : ''}Floor ${Math.round(tile.cond)}%`;
      if (Render.overlay === 'traffic') txt += `${txt ? '<br>' : ''}Traffic ${tile.traffic}`;
    }
  }
  if (txt && !t) {
    tip.innerHTML = txt; tip.style.display = 'block';
    const vr = $('#viewport').getBoundingClientRect();
    tip.style.left = (e.clientX - vr.left + 14) + 'px'; tip.style.top = (e.clientY - vr.top + 10) + 'px';
  } else tip.style.display = 'none';
};
UI.onCanvasClick = (e) => {
  const p = Render.toTile(e), t = UI.tool;
  if (t) {
    let err = null;
    if (t.kind === 'room') {
      const g = Render.ghost; if (!g) return;
      err = Sim.place(t.type, g.x, g.y, g.w, g.h);
      if (!err) { UI.toast(`Built ${DATA.ROOMS[t.type].name}.`, 'good'); if (DATA.ROOMS[t.type].unique || G.gold < Sim.cost(DATA.ROOMS[t.type].cost)) UI.setTool(null); }
    } else if (t.kind === 'clear') err = Sim.markRubble(p.x, p.y);
    else if (t.kind === 'roof') err = Sim.patchRoof(p.x, p.y);
    else if (t.kind === 'demolish') {
      const tile = Sim.tile(p.x, p.y), r = tile && Sim.room(tile.room);
      err = r ? Sim.demolish(r) : 'Nothing to demolish';
    }
    if (err) UI.toast(err, 'bad');
    UI.renderPanel();
    return;
  }
  if (Render.hover != null) { UI.openInspector('char', Render.hover); return; }
  const tile = Sim.tile(p.x, p.y);
  if (tile && tile.room != null) UI.openInspector('room', tile.room);
  else if (tile && tile.t === 'rubble') { UI.toast('Rubble! Open Build → ⛏️ Clear rubble to mark it.'); }
  else UI.closeInspector();
};
UI.overlayLegend = () => {
  const m = Render.overlay, el = $('#legend');
  el.style.display = m ? 'block' : 'none';
  el.innerHTML = m === 'appeal' ? '<b>Appeal</b> <span style="color:#e55">■ dreary</span> <span style="color:#5d5">■ pleasant</span> — affects everyone\'s mood & visitors\' spending'
    : m === 'cond' ? '<b>Floor condition</b> <span style="color:#e55">■ rotten</span> <span style="color:#5d5">■ sound</span> — worn by foot traffic, mended by chores'
    : m === 'traffic' ? '<b>Foot traffic</b> — where people walk most (wears the floor)' : '';
};

// ------------------------------------------------------------- toasts/tick -
UI.toast = (msg, kind = '') => {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
};
UI.ticker = (text, kind) => {
  const el = $('#ticker'); if (!el) return;
  const d = document.createElement('div'); d.className = 'tk ' + kind; d.textContent = text;
  el.prepend(d);
  while (el.children.length > 4) el.lastChild.remove();
};

// --------------------------------------------------------------- modals ----
UI.modal = (html, choices, opts = {}) => {
  UI.modalOpen = true; UI.choices = choices || [];
  const el = $('#modal');
  el.innerHTML = `<div class="mbox ${opts.wide ? 'wide' : ''}">${html}<div class="row btns mchoices">${UI.choices.map((c, i) => `<button data-act="choice" data-i="${i}" class="${c.cls || ''}" ${c.disabled ? 'disabled' : ''}>${c.label}</button>`).join('')}</div></div>`;
  el.classList.add('open');
};
UI.closeModal = () => { UI.modalOpen = false; $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; UI.party = null; };
UI.choose = (i) => {
  const c = UI.choices[i]; if (!c) return;
  const keep = c.fn ? c.fn() : false;
  if (keep !== true) UI.closeModal();
  UI.renderPanel(); UI.renderTop();
};
UI.confirm = (title, text, fn) => UI.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>`, [{ label: 'Yes', fn }, { label: 'Cancel', cls: 'ghost' }]);

// party assembly
UI.partyModal = (qid) => {
  const q = G.quests.find(x => x.id === qid); if (!q) return;
  UI.party = { q, ids: [], potions: false };
  UI.renderParty();
};
UI.partyPick = (id) => {
  const p = UI.party; if (!p) return;
  if (p.ids.includes(id)) p.ids = p.ids.filter(x => x !== id);
  else if (p.ids.length < p.q.max) p.ids.push(id);
  else UI.toast(`Max party size is ${p.q.max}.`, 'bad');
  UI.renderParty();
};
UI.renderParty = () => {
  const p = UI.party, q = p.q;
  const advs = Sim.advs();
  const members = p.ids.map(Sim.char).filter(Boolean);
  const pred = members.length ? Sim.partyPower(q, members, p.potions) : null;
  let h = `<h2>${esc(q.title)}</h2><div class="small mut">${DATA.REGIONS.find(r => r.id === q.region).name} · ${'★'.repeat(q.tier)} · ${q.days} days · party ${q.rec}${q.max > q.rec ? '–' + q.max : ''} · difficulty ${q.diff}</div>
    <div class="small">Emphasis: ${Object.entries(q.w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="stat s-${k}">${STAT_LABEL[k]} ${Math.round(v * 100)}%</span>`).join(' ')}</div>
    <div class="plist">`;
  for (const c of advs) {
    const avail = Sim.available(c), on = p.ids.includes(c.id);
    let pw = 0; for (const s of STATS) pw += c.stats[s] * (q.w[s] || 0);
    const why = !avail ? (c.state !== 'home' ? 'away' : c.injury > 0 ? 'injured' : 'breakdown') : '';
    h += `<button class="pc ${on ? 'on' : ''}" data-act="${avail ? 'pick' : ''}" data-id="${c.id}" ${avail ? '' : 'disabled'}>
      <b>${esc(c.name)}</b> <span class="small">Lv${c.lvl} ${DATA.CLASSES[c.cls].name}</span><span class="r">${Sim.moodFace(c.mood)}</span>
      <div class="small">${why ? `<span class="bad">${why}</span>` : `fit ${Math.round(pw)} · energy ${Math.round(c.needs.energy)}${c.needs.energy < 30 ? ' ⚠️' : ''}`}</div></button>`;
  }
  h += `</div>`;
  if (Sim.roomsOf('alch').length) h += `<label class="chk"><input type="checkbox" data-act="potions" ${p.potions ? 'checked' : ''}> Bring potions (${15 * Math.max(1, members.length)}g): +8% success, fewer injuries</label>`;
  if (pred) {
    const pc = Math.round(pred.chance * 100);
    h += `<div class="pred"><div class="row"><b>Predicted success</b><span class="r big ${pc >= 70 ? 'good' : pc >= 40 ? '' : 'bad'}">${pc}%</span></div>${bar(pc, pc >= 70 ? 'ok' : pc >= 40 ? 'low' : 'crit')}
      <div class="small mut">Party power ${pred.P} vs difficulty ${pred.D}. Power comes from stats × mood × energy × gear × friendships.</div>
      ${Sim.partyPower(q, members, p.potions) && UI.partyNotes(q, members, p.potions)}</div>`;
  } else h += `<p class="mut">Pick adventurers to see the odds.</p>`;
  UI.modal(h, [{ label: '⚔️ Send them!', fn: () => { const e = Sim.dispatch(q.id, p.ids, p.potions); if (e) { UI.toast(e, 'bad'); return true; } }, disabled: !members.length },
    { label: 'Cancel', cls: 'ghost' }], { wide: true });
};
UI.partyNotes = (q, ms, potions) => {
  const notes = [];
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const r = Sim.rel(ms[i].id, ms[j].id);
    if (r >= 35) notes.push(`<span class="good">+ ${ms[i].name} & ${ms[j].name} are friends</span>`);
    if (r <= -20) notes.push(`<span class="bad">− ${ms[i].name} & ${ms[j].name} are rivals</span>`);
  }
  if (new Set(ms.map(c => c.cls)).size >= 3) notes.push('<span class="good">+ Diverse party</span>');
  if (ms.some(c => c.cls === 'bard')) notes.push('<span class="good">+ Bardic inspiration</span>');
  if (ms.some(c => c.cls === 'cleric')) notes.push('<span class="good">+ Cleric: fewer injuries & deaths</span>');
  if (ms.some(c => Sim.has(c, 'lucky'))) notes.push('<span class="good">+ Lucky</span>');
  if (potions) notes.push('<span class="good">+ Potions</span>');
  if (q.risk >= 1 && ms.some(c => Sim.has(c, 'brave'))) notes.push('<span class="good">+ Bravery on a dangerous job</span>');
  if (q.risk >= 1 && ms.some(c => Sim.has(c, 'coward'))) notes.push('<span class="bad">− A coward on a dangerous job</span>');
  if (ms.some(c => c.needs.energy < 30)) notes.push('<span class="bad">− Someone is exhausted</span>');
  if (ms.some(c => c.mood < 40)) notes.push('<span class="bad">− Someone is unhappy</span>');
  if (ms.length < q.rec) notes.push(`<span class="bad">− Under-staffed (recommended ${q.rec})</span>`);
  return `<div class="small notes">${notes.join('<br>')}</div>`;
};

// --------------------------------------------------------------- events ----
UI.processEvents = () => {
  if (UI.modalOpen || !G.pendingEvents.length) return;
  const ev = G.pendingEvents.shift();
  if (ev.kind === 'report') return UI.reportModal(ev);
  if (ev.kind === 'rank') return UI.modal(`<h2>🎖️ Rank ${ev.rank.id}: ${ev.rank.title}!</h2><p>Word of ${esc(G.name)} spreads through the town. Doors open that were shut before.</p><p><b>Unlocked:</b> ${UI.unlocks(ev.rank.id)}</p><p>Roster cap is now <b>${ev.rank.roster}</b>.</p>${ev.rank.id === 'S' ? '<p class="bad"><b>A new request has appeared on the board, written in ink that drinks the light…</b></p>' : ''}`, [{ label: 'Huzzah!' }]);
  if (ev.kind === 'raise') return UI.raiseModal(ev);
  if (ev.kind === 'strike') return UI.modal(`<h2>⛔ Missed Payment</h2><p>A Copperhand collector in a velvet coat taps the doorframe with a ledger. "Strike ${G.strikes}, guildmaster. At three, the hall belongs to the Consortium."</p>`, [{ label: 'Understood' }]);
  if (ev.kind === 'gameover') return UI.modal(`<h2>💀 The Hall is Seized</h2><p>The Consortium boards up the windows. ${esc(G.name)}'s story ends here… for now.</p>`, [{ label: 'Start over', fn: () => Game.newGamePrompt() }]);
  if (ev.kind === 'victory') return UI.modal(`<h2>🐉 The Voidwyrm Falls!</h2><p>The sky over the Voidspire turns blue for the first time in a century. Bards will sing of ${esc(G.name)} for a thousand years. From a ruin with a leaking roof to the greatest guild in the realm — well done, guildmaster.</p><p class="mut">You can keep playing.</p>`, [{ label: 'Keep playing' }]);
  if (ev.kind === 'random') return UI.randomEvent();
};
UI.reportModal = (ev) => {
  const head = ev.ok ? (ev.great ? '🏆 Glorious Success!' : '✅ Quest Complete') : (ev.disaster ? '💀 Disaster' : '❌ Quest Failed');
  const h = `<h2>${head}</h2><p><b>${esc(ev.q.title)}</b><br><span class="small mut">${ev.party.map(esc).join(', ')} · odds were ${Math.round(ev.chance * 100)}%</span></p>
    <div class="qlog">${ev.log.map(l => `<div>• ${esc(l.text)}</div>`).join('') || '<div class="mut">An uneventful journey.</div>'}</div>
    <p><span class="gold">💰 ${ev.gold}g</span> · ⭐ ${ev.renown >= 0 ? '+' : ''}${ev.renown} renown</p>
    ${ev.hurt.length ? `<p class="bad">🩹 Injured: ${ev.hurt.map(esc).join(', ')}</p>` : ''}${ev.died.length ? `<p class="bad">🕯️ Fallen: ${ev.died.map(esc).join(', ')}. Their friends will grieve.</p>` : ''}`;
  UI.modal(h, [{ label: 'Onward' }]);
};
UI.raiseModal = (ev) => {
  const c = Sim.char(ev.id); if (!c) return;
  const mid = Math.round((c.wage + ev.ask) / 2);
  UI.modal(`<h2>💬 ${esc(c.name)} wants a raise</h2><p>“I'm level ${c.lvl} now. ${Sim.has(c, 'greedy') ? 'Gold doesn\'t grow on trees — well, not in this hall.' : 'I think I\'ve earned it.'} I want <b>${ev.ask}g</b> a day.” (currently ${c.wage}g)</p>`, [
    { label: `Agree (${ev.ask}g)`, fn: () => { c.wage = ev.ask; Sim.moodlet(c, 'raise', 'Got a raise', 8, 1440 * 3); c.loyalty = U.clamp(c.loyalty + 10, 0, 100); } },
    { label: `Haggle (${mid}g)`, fn: () => {
      if (U.chance(Sim.has(c, 'greedy') ? 0.35 : 0.65)) { c.wage = mid; UI.toast(`${c.name} grudgingly accepts ${mid}g.`); }
      else { c.wage = mid; c.loyalty -= 10; Sim.moodlet(c, 'raise', 'Lowballed on a raise', -8, 1440 * 3); UI.toast(`${c.name} accepts, but resents it.`, 'bad'); }
    } },
    { label: 'Refuse', cls: 'danger', fn: () => { c.loyalty = U.clamp(c.loyalty - 20, 0, 100); Sim.moodlet(c, 'raise', 'Raise refused', -14, 1440 * 4); Sim.bio(c, 'Was refused a raise.'); } },
  ]);
};
UI.randomEvent = () => {
  const home = G.chars.filter(c => Sim.home(c));
  const advs = Sim.advs().filter(c => Sim.home(c));
  const pool = [];
  pool.push(() => UI.modal(`<h2>🎻 A Wandering Minstrel</h2><p>A minstrel with a battered lute offers to play for the guild tonight. “Twenty gold, and I'll make your hall sound like a palace.”</p>`, [
    { label: 'Hire them (20g)', disabled: G.gold < 20, fn: () => { Sim.money(-20, 'other'); for (const c of home) { c.needs.fun = Math.min(100, c.needs.fun + 40); c.needs.social = Math.min(100, c.needs.social + 20); Sim.moodlet(c, 'minstrel', 'Minstrel\'s ballad', 8, 1440); } Sim.log('🎻 A minstrel played the hall into the small hours.', 'good'); } },
    { label: 'No thanks', cls: 'ghost' }]));
  const poachable = advs.filter(c => c.lvl >= 2 && c.loyalty < 75);
  if (poachable.length) {
    const c = U.pick(poachable), counter = 30 + c.lvl * 15;
    const best = G.chars.filter(o => o !== c).map(o => Sim.rel(c.id, o.id)).reduce((a, b) => Math.max(a, b), 0);
    pool.push(() => UI.modal(`<h2>🦁 The Gilded Lions Come Calling</h2><p>A recruiter from the rival <b>Gilded Lions</b> guild has offered <b>${esc(c.full)}</b> (Lv${c.lvl} ${DATA.CLASSES[c.cls].name}, loyalty ${Math.round(c.loyalty)}) a fat contract.</p>`, [
      { label: `Counter-offer (${counter}g)`, disabled: G.gold < counter, fn: () => { Sim.money(-counter, 'wages'); c.loyalty = U.clamp(c.loyalty + 25, 0, 100); Sim.moodlet(c, 'valued', 'Feels valued', 10, 1440 * 3); Sim.bio(c, 'Turned down the Gilded Lions after a counter-offer.'); } },
      { label: 'Appeal to their loyalty', fn: () => {
        const p = c.loyalty / 100 + best / 200;
        if (U.chance(p)) { c.loyalty = U.clamp(c.loyalty + 8, 0, 100); Sim.log(`${c.name} told the Lions to get lost. “My friends are here.”`, 'good'); Sim.bio(c, 'Refused to join the Gilded Lions.'); }
        else { Sim.log(`${c.name} accepted the Gilded Lions' offer and left!`, 'bad'); Sim.bio(c, 'Left for the Gilded Lions.'); Sim.sendOut(c, true); }
      } },
      { label: 'Let them go', cls: 'danger', fn: () => { Sim.sendOut(c, true); Sim.log(`${c.name} left for the Gilded Lions.`, 'bad'); } }]));
  }
  if (G.renown >= 80) pool.push(() => { const g = U.ri(80, 200); UI.modal(`<h2>👑 A Noble Patron</h2><p>Lady Venn, a minor noble, has taken an interest in your guild's revival and sends a purse of ${g} gold.</p>`, [
    { label: `Accept the gold (+${g}g)`, fn: () => Sim.money(g, 'other') },
    { label: 'Ask for a royal introduction instead', fn: () => { G.factions.crown += 12; UI.toast('The Crown takes note of you. (+12 standing)', 'good'); } }]); });
  pool.push(() => UI.modal(`<h2>🐀 Rats!</h2><p>A family of rats has moved into the walls. They're getting into the bedding and the food stores.</p>`, [
    { label: 'Hire an exterminator (25g)', disabled: G.gold < 25, fn: () => Sim.money(-25, 'other') },
    { label: 'Ignore them', cls: 'danger', fn: () => { for (const c of home) { c.needs.hygiene = Math.max(0, c.needs.hygiene - 30); Sim.moodlet(c, 'rats', 'Rats in the hall', Sim.has(c, 'neat') ? -12 : Sim.has(c, 'slob') ? -1 : -6, 1440 * 2); } } }]));
  const dd = Sim.day() % DATA.DAYS_PER_SEASON;
  if (dd >= 8 && dd <= 20 && !G.flags['fest' + Math.floor(Sim.day() / DATA.DAYS_PER_SEASON)]) pool.push(() => {
    G.flags['fest' + Math.floor(Sim.day() / DATA.DAYS_PER_SEASON)] = true;
    UI.modal(`<h2>🎪 ${DATA.SEASONS[Sim.season()]} Festival</h2><p>Millbrook's ${DATA.SEASONS[Sim.season()].toLowerCase()} festival is today! A booth for ${esc(G.name)} would get the guild noticed.</p>`, [
      { label: 'Run a booth (50g)', disabled: G.gold < 50, fn: () => { Sim.money(-50, 'other'); Sim.gainRenown(25); G.opinion = Math.min(100, G.opinion + 15); for (const c of home) Sim.moodlet(c, 'fest', 'Festival fun', 8, 1440); Sim.log('🎪 The guild\'s festival booth was a hit!', 'good'); } },
      { label: 'Give everyone the day off', fn: () => { for (const c of home) { c.needs.fun = 100; Sim.moodlet(c, 'fest', 'Day off at the festival', 10, 1440); } } },
      { label: 'Skip it', cls: 'ghost' }]);
  });
  if (advs.length) pool.push(() => { const c = U.pick(advs); UI.modal(`<h2>🧙 A Mysterious Pedlar</h2><p>A hooded pedlar offers a shimmering trinket “for your finest warrior”. 60 gold.</p>`, [
    { label: `Buy it for ${esc(c.name)} (60g)`, disabled: G.gold < 60, fn: () => { Sim.money(-60, 'other'); if (U.chance(0.7) && c.gear < 5) { c.gear++; Sim.log(`The trinket was real! ${c.name}'s gear improved.`, 'good'); Sim.bio(c, 'Received an enchanted trinket from a pedlar.'); } else Sim.log('The trinket turned to dust by morning. Swindled!', 'bad'); } },
    { label: 'Send them away', cls: 'ghost' }]); });
  const pairs = [];
  for (const a of advs) for (const b of advs) if (a.id < b.id && Sim.rel(a.id, b.id) <= -20) pairs.push([a, b]);
  if (pairs.length) pool.push(() => { const [a, b] = U.pick(pairs); UI.modal(`<h2>💢 Brawl in the Hall!</h2><p><b>${esc(a.name)}</b> and <b>${esc(b.name)}</b> have come to blows over the last bowl of stew. Tables are flipping.</p>`, [
    { label: 'Make them shake hands', fn: () => { if (U.chance(0.5 + Sim.compat(a, b) / 2)) { Sim.changeRel(a, b, 22, 'forced reconciliation'); Sim.log(`${a.name} and ${b.name} grudgingly made up.`, 'good'); } else { Sim.changeRel(a, b, -10); Sim.log(`The handshake turned into round two.`, 'bad'); } } },
    { label: 'Dock their pay (10g each)', fn: () => { for (const c of [a, b]) { c.purse = Math.max(0, c.purse - 10); c.loyalty -= 4; Sim.moodlet(c, 'docked', 'Pay docked for brawling', -6, 1440 * 2); } } },
    { label: 'Let them settle it', cls: 'danger', fn: () => { const l = U.pick([a, b]); l.injury = U.ri(6, 14); Sim.changeRel(a, b, U.ri(-5, 15), 'settled it with fists'); Sim.log(`${l.name} lost the brawl and is nursing bruises.`); } }]); });
  if (G.lore.length >= 3 && !G.flags.veteran) pool.push(() => { G.flags.veteran = true; UI.modal(`<h2>🧓 An Old Visitor</h2><p>An elderly woman leans on a cane at the door. “I was Hela Grimm's apprentice, long ago. I heard someone was digging up the old guild's relics.” She presses a heavy purse into your hand. “Make this place what it was.”</p>`, [
    { label: 'Thank her (+150g, +20 renown)', fn: () => { Sim.money(150, 'other'); Sim.gainRenown(20); } }]); });
  if (G.opinion > 20) pool.push(() => { const g = Math.round(G.opinion * 1.5); UI.modal(`<h2>🪙 Townsfolk Donations</h2><p>Grateful locals have filled the donation jar by the door: ${g} gold.</p>`, [{ label: 'Wonderful!', fn: () => Sim.money(g, 'other') }]); });
  if (advs.length) pool.push(() => { const c = U.pick(advs); const hasCleric = advs.some(o => o.cls === 'cleric' && o !== c);
    UI.modal(`<h2>🤒 Marsh Fever</h2><p>${esc(c.name)} woke up shivering and green.${hasCleric ? ' Luckily the guild cleric knows a remedy.' : ''}</p>`, [{ label: 'Oh dear', fn: () => { if (!hasCleric) { c.injury = U.ri(10, 24); Sim.cancel(c); } } }]); });
  if (G.map.some(t => t.leak)) pool.push(() => { G.weather = 'storm'; UI.modal(`<h2>⛈️ Storm Rolling In</h2><p>Black clouds over Millbrook. Every hole in that roof is about to make itself known.</p>`, [{ label: 'Fetch the buckets' }]); });
  U.pick(pool)();
};

// ---------------------------------------------------------------- menu -----
UI.menu = () => {
  UI.modal(`<h2>${esc(G.name)}</h2><p class="small mut">Autosaves every morning. Keys: Space pause · 1/2/3 speed · R rotate · Esc cancel.</p>`, [
    { label: '💾 Save', fn: () => { Game.save(); UI.toast('Saved.', 'good'); } },
    { label: '❓ How to play', fn: () => { UI.help(); return true; } },
    { label: '🆕 New game', cls: 'danger', fn: () => { Game.newGamePrompt(); return true; } },
    { label: 'Close', cls: 'ghost' }]);
};
UI.help = () => UI.modal(`<h2>How to Run a Guild</h2><div class="help">
  <p><b>Your people live their own lives.</b> Every adventurer and staff member has six needs (hunger, energy, hygiene, social, fun, purpose) and decides for themselves what to do next. Build the furniture that meets those needs and they'll look after themselves. Click anyone to see what they're thinking.</p>
  <p><b>Mood</b> comes from needs, moodlets (recent events) and the <b>appeal</b> of the hall around them. Rubble, rotten floors and puddles drag it down; decor lifts it. Very unhappy people have breakdowns, lose loyalty and eventually quit.</p>
  <p><b>Relationships</b> grow from chatting, sharing meals, drinking and questing together. Friends fight better side by side; rivals bicker and brawl.</p>
  <p><b>Quests</b> show up on the Quest Board. Pick a party: success depends on stats matching the quest, mood, energy, gear and friendships. Clerics cut injuries; bards inspire.</p>
  <p><b>Fix up the hall:</b> mark rubble for clearing (idle hands do it), order repairs on broken furniture, patch roof leaks before the rain, and hire a caretaker.</p>
  <p><b>Money:</b> wages are paid daily and meals cost 2g each. A Copperhand installment is due at the end of every season. Miss three and you lose the hall.</p>
  <p><b>Rank up</b> through renown to unlock regions, furniture and roster space. At Rank S, face the Voidwyrm.</p></div>`, [{ label: 'Got it' }], { wide: true });
