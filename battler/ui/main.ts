import { runBattle } from '../src/engine/battle/battle.ts';
import { JOB_DEFS } from '../src/engine/data/jobs.ts';
import { PERSONALITIES, TRAITS } from '../src/engine/data/heroes.ts';
import { bestFit } from '../src/engine/hero.ts';
import type { BattleResult } from '../src/engine/battle/types.ts';
import { RANKS, type Hero } from '../src/engine/types.ts';
import { reportHTML } from './battleview.ts';
import { WarField } from './warfield.ts';
import { backHTML, cardHTML, esc } from './card.ts';
import { load, newSave, openPack, opponent, partyHeroes, save, toParty, type Save } from './state.ts';
import { bindTactics, tacticsHTML } from './tactics.ts';

type Tab = 'packs' | 'roster' | 'tactics' | 'battle';
const TABS: [Tab, string][] = [['packs', 'Packs'], ['roster', 'Roster'], ['tactics', 'Tactics'], ['battle', 'Battle']];

const s: Save = load();
let tab: Tab = (['packs', 'roster', 'tactics', 'battle'] as Tab[]).find((t) => location.hash === `#${t}`) ?? 'tactics';
let picked: string | null = null;
let fresh: Hero[] = [];               // the pack just opened
let revealed = new Set<number>();
let battle: { r: BattleResult; names: [string, string]; done: boolean } | null = null;
let view: WarField | null = null;
let rosterSort: 'ovr' | 'job' | 'rank' = 'ovr';
let inspect: string | null = null;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function header() {
  $('#record').innerHTML = `<span><b>${s.wins}</b> won</span><span><b>${s.losses}</b> lost</span><span><b>${s.packs}</b> pack${s.packs === 1 ? '' : 's'}</span>`;
  $('#tabs').innerHTML = TABS.map(([t, label]) => `<button role="tab" data-tab="${t}" aria-selected="${t === tab}">${label}${t === 'packs' && s.packs ? `<i class="dot">${s.packs}</i>` : ''}</button>`).join('');
}

function render() {
  view?.destroy();
  view = null;
  header();
  const main = $('#main');
  if (tab === 'packs') main.innerHTML = packsHTML();
  else if (tab === 'roster') main.innerHTML = rosterHTML();
  else if (tab === 'tactics') {
    const opp = opponent(s);
    main.innerHTML = `${tacticsHTML(s, opp, picked)}
      <div class="fightbar"><span>Next: <b>${esc(opp.party.name)}</b></span><button class="stamp big" data-go="fight">Fight</button></div>`;
    const tui = { picked, rerender: () => { picked = tui.picked; render(); }, changed: () => save(s) };
    bindTactics(main.querySelector('.tactics')!, s, tui);
  } else main.innerHTML = battleHTML();
  if (tab === 'battle' && battle) {
    view = new WarField(main.querySelector('.bview')!, battle.r, battle.names);
    view.onDone = () => {
      if (!battle) return;
      battle.done = true;
      main.querySelector('.reportslot')!.innerHTML = reportHTML(battle.r, battle.names);
      const bar = main.querySelector('.battle .fightbar');
      if (bar && !bar.querySelector('[data-go="fight"]')) bar.insertAdjacentHTML('beforeend', `<button class="stamp" data-go="fight">${battle.r.winner === 0 ? 'Next battle (+1 pack earned)' : 'Try again'}</button>`);
      header();
    };
    if (battle.done) view.skip(); else view.play();
  }
  if (tab === 'packs') bindPacks();
}

// ------------------------------------------------------------------ packs --
function packsHTML(): string {
  const cards = fresh.length
    ? `<div class="pack">${fresh.map((h, i) => revealed.has(i) ? `<div class="flip r-${h.rank} open" data-i="${i}"><div class="face front">${cardHTML(h)}</div></div>` : backHTML(h, i)).join('')}</div>
       <div class="packbar">${revealed.size < fresh.length ? '<button class="ghost" data-go="revealall">Reveal all</button>' : `<button class="stamp" data-go="roster">See your roster</button>`}</div>`
    : '';
  return `<section class="packs">
    <div class="packhead">
      <div><h2>Hero packs</h2><p class="hint">Five heroes per pack. Rank rarity: S about 2%, A 10%, B 25%, C 30%, D 20%, E 13%. Win a battle to earn another pack.</p></div>
      <button class="stamp big" data-go="open" ${s.packs ? '' : 'disabled'}>${s.packs ? `Open a pack (${s.packs})` : 'No packs: win a battle'}</button>
    </div>
    ${cards || '<p class="empty">Open a pack to see who answers the call.</p>'}
  </section>`;
}
function bindPacks() {
  document.querySelectorAll<HTMLElement>('.flip:not(.open)').forEach((el) => {
    const go = () => reveal(Number(el.dataset.i), el);
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}
function reveal(i: number, el: HTMLElement) {
  if (revealed.has(i)) return;
  revealed.add(i);
  const h = fresh[i];
  el.classList.add('hinting');
  const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : h.rank === 'S' ? 1100 : h.rank === 'A' ? 650 : 350;
  setTimeout(() => { el.classList.add('open'); if (revealed.size === fresh.length) setTimeout(render, 700); }, delay);
}

// ----------------------------------------------------------------- roster --
function rosterHTML(): string {
  const list = [...s.collection].sort((a, b) => rosterSort === 'ovr' ? b.ovr - a.ovr
    : rosterSort === 'rank' ? RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank) || b.ovr - a.ovr
      : a.job.localeCompare(b.job) || b.ovr - a.ovr);
  const h = inspect ? s.collection.find((x) => x.id === inspect) : null;
  const fit = h ? bestFit(h) : null;
  return `<section class="roster">
    <div class="packhead"><div><h2>Roster <small>${s.collection.length} heroes</small></h2><p class="hint">Tap a card for details. Heroes in your party are marked.</p></div>
    <label class="field inline">Sort <select id="rsort">${(['ovr', 'rank', 'job'] as const).map((k) => `<option value="${k}"${k === rosterSort ? ' selected' : ''}>${k === 'ovr' ? 'OVR' : k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></label></div>
    ${h ? `<div class="inspect">${cardHTML(h)}<div class="idetail">
      <h3>${esc(h.name)}</h3>
      <p>${JOB_DEFS[h.job].name}, OVR ${h.ovr}, Rank ${h.rank}. Personality: <b>${PERSONALITIES[h.personality].name}</b> (when they disobey, they ${PERSONALITIES[h.personality].disobey}).</p>
      ${h.trait ? `<p>Trait: <b>${TRAITS[h.trait].name}</b>. ${TRAITS[h.trait].desc}</p>` : ''}
      ${h.breakout ? `<p>Breakout: an unusually high ${h.breakout} for a ${JOB_DEFS[h.job].name.toLowerCase()}.</p>` : ''}
      <p>Abilities: ${JOB_DEFS[h.job].abilities.join(', ').replace(/([A-Z])/g, ' $1').toLowerCase()}.</p>
      <p>Captain bonus: ${JOB_DEFS[h.job].captain}.</p>
      ${fit && fit !== h.job ? `<p class="gem">Hidden gem: would rate <b>${h.ovrByJob[fit]}</b> as a ${JOB_DEFS[fit].name}. A Job Change Scroll could unlock it someday.</p>` : ''}
      <button class="ghost" data-go="closeinspect">Close</button></div></div>` : ''}
    <div class="cards">${list.map((x) => cardHTML(x, { selected: s.party.ids.includes(x.id), small: true, attrs: `data-inspect="${x.id}" tabindex="0" role="button" aria-label="${esc(x.name)}, ${JOB_DEFS[x.job].name}, OVR ${x.ovr}"` })).join('')}</div>
    <p class="hint reset"><button class="link" data-go="reset">Start over with a new collection</button></p>
  </section>`;
}

// ----------------------------------------------------------------- battle --
function battleHTML(): string {
  if (!battle) return `<section class="battle"><p class="empty">Set your orders on the Tactics tab, then press Fight. Once it starts, you can only watch.</p><button class="stamp" data-go="tactics">Go to Tactics</button></section>`;
  return `<section class="battle"><div class="bview"></div><div class="reportslot"></div>
    <div class="fightbar"><button class="ghost" data-go="tactics">Back to Tactics</button></div></section>`;
}

function fight() {
  if (!partyHeroes(s).length) return;
  const opp = opponent(s);
  const mine = toParty(s, 'Your party');
  const r = runBattle(opp.seed, mine, opp.party);
  s.battles++;
  if (r.winner === 0) { s.wins++; s.packs++; } else if (r.winner === 1) s.losses++;
  save(s);
  battle = { r, names: [mine.name, opp.party.name], done: false };
  tab = 'battle';
  render();
}

// ----------------------------------------------------------------- wiring --
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const tb = t.closest<HTMLElement>('[data-tab]');
  if (tb) { tab = tb.dataset.tab as Tab; history.replaceState(null, '', `#${tab}`); return render(); }
  const card = t.closest<HTMLElement>('[data-inspect]');
  if (card) { inspect = card.dataset.inspect!; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
  if (!go) return;
  if (go === 'open' && s.packs) { fresh = openPack(s); revealed = new Set(); save(s); render(); }
  else if (go === 'revealall') document.querySelectorAll<HTMLElement>('.flip:not(.open)').forEach((el) => reveal(Number(el.dataset.i), el));
  else if (go === 'roster') { tab = 'roster'; fresh = []; render(); }
  else if (go === 'tactics') { tab = 'tactics'; render(); }
  else if (go === 'fight') fight();
  else if (go === 'closeinspect') { inspect = null; render(); }
  else if (go === 'reset') { Object.assign(s, newSave((Date.now() % 1e9) | 0)); save(s); inspect = null; fresh = []; battle = null; picked = null; render(); }
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.id === 'rsort') { rosterSort = el.value as typeof rosterSort; render(); }
});
document.addEventListener('keydown', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-inspect]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
});

render();
