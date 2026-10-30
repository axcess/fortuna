// The tactics editor: formation, captain, stance, per-hero rules, contingencies, scouting.
import { ABILITIES } from '../src/engine/data/abilities.ts';
import { JOB_DEFS, type Role } from '../src/engine/data/jobs.ts';
import { PERSONALITIES } from '../src/engine/data/heroes.ts';
import { DEFAULT_RULES, RULE_SLOTS } from '../src/engine/battle/rules.ts';
import { scout } from '../src/engine/battle/scout.ts';
import type { Condition, Contingency, Party, Rule, Slot, Stance, TargetPick } from '../src/engine/battle/types.ts';
import type { Hero } from '../src/engine/types.ts';
import { JOB_TAG, esc, portrait } from './card.ts';
import { planRules } from '../src/engine/battle/planner.ts';
import { PARTY_SIZE, fromHeroes, partyHeroes, pickAndPlan, planNow, toParty, type Save } from './state.ts';

/** Reasons behind the last auto-plan, shown until the next one. */
export let planNotes: string[] = [];
export const setPlanNotes = (n: string[]) => { planNotes = n; };

export const STANCE_INFO: Record<Stance, [string, string]> = {
  aggressive: ['Aggressive', '+15% damage dealt, +10% damage taken'],
  balanced: ['Balanced', 'No modifiers'],
  defensive: ['Defensive', '−15% damage taken, −10% damage dealt'],
  focus: ['Focus Fire', 'Default attacks all go for the most wounded enemy'],
  protect: ['Protect the Back Line', 'Front-row tanks Taunt or Guard threatened allies first'],
};
const COND_LABEL: Record<Condition['type'], string> = {
  always: 'Always', selfHpBelow: 'Self HP below', allyHpBelow: 'Any ally HP below', alliesBelow: 'Several allies below',
  enemyRole: 'Enemy type present', enemiesInRow: 'Enemies in one row ≥', targetHas: 'Target is', allyTargetedByMelee: 'Ally under melee attack',
  selfManaAbove: 'Self mana above', turnAtLeast: 'Turn number ≥',
};
const TARGET_LABEL: Record<TargetPick, string> = {
  nearest: 'Nearest', lowestHp: 'Lowest HP', highestHp: 'Highest HP', lowestHpPct: 'Lowest HP %', casters: 'Casters first',
  healers: 'Healers first', focus: 'Focus target', self: 'Self', bonded: 'Bonded ally',
};
const ROLES: Role[] = ['tank', 'healer', 'caster', 'melee', 'ranged', 'support'];

const opt = (v: string, label: string, cur: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
const num = (k: string, v: number, min: number, max: number, suffix = '') =>
  `<label class="numf"><input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}" inputmode="numeric">${suffix}</label>`;

function condParams(c: Condition): string {
  switch (c.type) {
    case 'selfHpBelow': case 'allyHpBelow': case 'selfManaAbove': return num('pct', c.pct, 5, 95, '%');
    case 'alliesBelow': return num('n', c.n, 2, 5, ' allies <') + num('pct', c.pct, 5, 95, '%');
    case 'enemyRole': return `<select data-k="role">${ROLES.map((r) => opt(r, r, c.role)).join('')}</select>`;
    case 'enemiesInRow': return num('n', c.n, 2, 3);
    case 'targetHas': return `<select data-k="status">${['marked', 'poisoned', 'silenced'].map((r) => opt(r, r, c.status)).join('')}</select>`;
    case 'turnAtLeast': return num('n', c.n, 1, 20);
    default: return '';
  }
}
export function defaultCondition(type: Condition['type']): Condition {
  switch (type) {
    case 'selfHpBelow': return { type, pct: 40 };
    case 'allyHpBelow': return { type, pct: 50 };
    case 'alliesBelow': return { type, n: 2, pct: 60 };
    case 'enemyRole': return { type, role: 'caster' };
    case 'enemiesInRow': return { type, n: 2 };
    case 'targetHas': return { type, status: 'marked' };
    case 'selfManaAbove': return { type, pct: 50 };
    case 'turnAtLeast': return { type, n: 2 };
    default: return { type } as Condition;
  }
}

function ruleRow(h: Hero, r: Rule, i: number): string {
  const jd = JOB_DEFS[h.job];
  const abil = [opt('attack', `Basic: ${ABILITIES[jd.basic].name}`, r.ability), ...jd.abilities.filter((a) => a !== jd.basic).map((a) => opt(a, ABILITIES[a].name, r.ability))].join('');
  return `<li class="rule" data-hero="${h.id}" data-i="${i}">
    <span class="ri">${i + 1}</span>
    <div class="rparts">
      <span class="rp"><em>if</em><select data-f="cond">${(Object.keys(COND_LABEL) as Condition['type'][]).map((t) => opt(t, COND_LABEL[t], r.when.type)).join('')}</select>${condParams(r.when)}</span>
      <span class="rp"><em>do</em><select data-f="ability">${abil}</select></span>
      <span class="rp"><em>at</em><select data-f="target">${(Object.keys(TARGET_LABEL) as TargetPick[]).map((t) => opt(t, TARGET_LABEL[t], r.target)).join('')}</select></span>
    </div>
    <span class="rbtns"><button data-act="up" aria-label="Move rule up"${i === 0 ? ' disabled' : ''}>↑</button><button data-act="del" aria-label="Remove rule">×</button></span>
  </li>`;
}

function contRow(c: Contingency, i: number, heroes: Hero[]): string {
  const w = c.when;
  const trig = w.type === 'falls' ? (w.who === 'captain' ? 'captain' : w.who === 'anyHealer' ? 'healer' : 'hero') : w.type;
  const resp = 'stance' in c.then ? c.then.stance : 'retreat';
  return `<li class="cont" data-ci="${i}">
    <span class="rp"><em>if</em><select data-c="trig">${opt('captain', 'our captain falls', trig)}${opt('healer', 'any healer falls', trig)}${opt('hero', 'this hero falls', trig)}${opt('bossHpBelow', 'enemy boss HP below', trig)}${opt('downTo', 'we are down to', trig)}</select>
    ${trig === 'hero' ? `<select data-c="who">${heroes.map((h) => opt(h.id, h.name, (w as { who: string }).who)).join('')}</select>` : ''}
    ${w.type === 'bossHpBelow' ? num('cpct', w.pct, 5, 95, '%') : ''}${w.type === 'downTo' ? num('cn', w.n, 1, 4, ' heroes') : ''}</span>
    <span class="rp"><em>then</em><select data-c="resp">${(Object.keys(STANCE_INFO) as Stance[]).map((s) => opt(s, `switch to ${STANCE_INFO[s][0]}`, resp)).join('')}${opt('retreat', 'everyone falls back', resp)}</select></span>
    <button data-act="cdel" aria-label="Remove contingency">×</button>
  </li>`;
}

export function tacticsHTML(s: Save, enemy: { party: Party; seed: number }, picked: string | null): string {
  const heroes = partyHeroes(s);
  const cells: string[] = [];
  for (let col = 0; col < 3; col++) for (let row = 2; row >= 0; row--) {
    const h = heroes.find((x) => s.party.formation[x.id]?.row === row && s.party.formation[x.id]?.col === col);
    cells.push(`<button class="cell${h ? ' full' : ''}${h && h.id === picked ? ' picked' : ''}" data-cell="${row},${col}" ${h ? `draggable="true" data-hero="${h.id}"` : ''} aria-label="${['Front', 'Middle', 'Back'][row]} row, ${['left', 'centre', 'right'][col]}${h ? `: ${esc(h.name)}` : ', empty'}">
      ${h ? `${portrait(h, 'mini')}<span class="cn">${esc(h.name.split(' ')[0])}</span><span class="cj">${JOB_TAG[h.job]} ${h.rank}</span>${h.id === s.party.captain ? '<span class="cap" title="Captain">C</span>' : ''}` : ''}
    </button>`);
  }
  const bench = s.collection.filter((h) => !s.party.ids.includes(h.id)).sort((a, b) => b.ovr - a.ovr);
  const sc = scout(enemy.seed, toParty(s, 'You'), enemy.party);
  const ecells: string[] = [];
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) {
    const h = enemy.party.heroes.find((x) => enemy.party.formation[x.id].row === row && enemy.party.formation[x.id].col === col);
    const seen = h && sc.revealed.find((u) => u.heroId === h.id);
    ecells.push(`<div class="cell e${seen ? ' full' : h ? ' fog' : ''}">${seen ? `<span class="cj big">${JOB_TAG[seen.job]}</span><span class="cj">Rank ${seen.rank}</span>` : h ? '<span class="q">?</span>' : ''}</div>`);
  }
  const cap = heroes.find((h) => h.id === s.party.captain);
  return `<section class="tactics">
    <div class="autobar">
      <div><h2>Auto-tactics</h2><p class="hint">Builds formation, captain, stance, every hero's rules and contingencies from their stats, class, rank and personality, and from what your scouts can see. Change anything afterwards.</p></div>
      <div class="autobtns">
        <button class="stamp" data-act="plan">Plan for me</button>
        <button class="ghost" data-act="pickplan">Pick party &amp; plan</button>
        <label class="toggle"><input type="checkbox" id="autoplan"${s.auto ? ' checked' : ''}> Re-plan before every fight</label>
      </div>
      ${planNotes.length ? `<details class="whyplan" open><summary>Why this plan</summary><ul>${planNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
    </div>
    <div class="tcol">
      <h2>Formation</h2>
      <p class="hint">Tap a hero, then a square, to move them. Front row faces the enemy. ${heroes.length < PARTY_SIZE ? `<b>${PARTY_SIZE - heroes.length} slot${PARTY_SIZE - heroes.length > 1 ? 's' : ''} free</b>: add heroes from the bench.` : ''}</p>
      <div class="grid own" style="--cols:3">${cells.join('')}</div>
      <div class="gridlabels"><span>back</span><span>middle</span><span>front →</span></div>
      <h3>Bench</h3>
      <div class="bench">${bench.map((h) => `<button class="chip${h.id === picked ? ' picked' : ''}" data-bench="${h.id}">${portrait(h, 'mini')}<span><b>${h.ovr}</b> ${esc(h.name)}<small>${JOB_DEFS[h.job].name} · ${h.rank}</small></span></button>`).join('') || '<p class="hint">Everyone is in the party. Open a pack for more heroes.</p>'}</div>
      <p class="hint">${picked && s.party.ids.includes(picked) ? `<button class="link" data-act="bench-out">Send ${esc(s.collection.find((h) => h.id === picked)!.name)} to the bench</button>` : ''}</p>
      <h2>Command</h2>
      <label class="field">Captain <select id="captain">${heroes.map((h) => opt(h.id, `${h.name} (CHA ${h.stats.CHA}) — ${JOB_DEFS[h.job].captain}`, s.party.captain)).join('')}</select></label>
      <p class="hint">${cap ? `${esc(cap.name.split(' ')[0])}'s Charisma steadies everyone's discipline while they stand.` : ''}</p>
      <label class="field">Team stance <select id="stance">${(Object.keys(STANCE_INFO) as Stance[]).map((st) => opt(st, `${STANCE_INFO[st][0]} — ${STANCE_INFO[st][1]}`, s.party.stance)).join('')}</select></label>
      <h3>Contingencies <small>(up to 3, each fires once)</small></h3>
      <ol class="conts">${s.party.contingencies.map((c, i) => contRow(c, i, heroes)).join('')}</ol>
      ${s.party.contingencies.length < 3 ? '<button class="ghost" data-act="cadd">+ Add a contingency</button>' : ''}
      <h2>Scouting</h2>
      <p class="hint">${sc.revealed.length} of ${sc.total} enemies spotted (2, plus one per ranger, bard or druid you bring).</p>
      <div class="enemyname">${esc(enemy.party.name)} · ${STANCE_INFO[enemy.party.stance][0]}</div>
      <div class="grid enemy">${ecells.join('')}</div>
      <div class="gridlabels"><span>← front</span><span>middle</span><span>back</span></div>
    </div>
    <div class="tcol rules">
      <h2>Orders</h2>
      <p class="hint">Each hero checks their rules top to bottom when it's their turn and uses the first one that applies. Higher ranks remember more rules. If none applies, they attack ${s.party.stance === 'focus' ? 'the focus target' : 'the nearest enemy'}.</p>
      ${heroes.map((h) => {
        const rules = s.party.rules[h.id] ?? [];
        const slots = RULE_SLOTS[h.rank];
        return `<div class="orders">
          <div class="oh">${portrait(h, 'mini')}<div><b>${esc(h.name)}</b><small>${JOB_DEFS[h.job].name} · Rank ${h.rank} · ${PERSONALITIES[h.personality].name}: if they disobey, ${PERSONALITIES[h.personality].disobey}</small></div></div>
          <ol>${rules.map((r, i) => ruleRow(h, r, i)).join('')}</ol>
          <div class="ofoot"><span class="slots">${rules.length} / ${slots} rule slots</span>
          ${rules.length < slots ? `<button class="ghost small" data-act="add" data-hero="${h.id}">+ Rule</button>` : ''}
          <button class="ghost small" data-act="autohero" data-hero="${h.id}">Auto</button>
          <button class="link" data-act="preset" data-hero="${h.id}">Reset to ${JOB_DEFS[h.job].name} preset</button></div>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

/** Wire up the tactics view. `rerender` redraws it; `pick` holds the selected hero. */
export function bindTactics(root: HTMLElement, s: Save, ui: { picked: string | null; rerender: () => void; changed: () => void }) {
  const heroes = () => partyHeroes(s);
  const moveTo = (id: string, row: number, col: number) => {
    const f = s.party.formation;
    const other = Object.keys(f).find((k) => s.party.ids.includes(k) && f[k].row === row && f[k].col === col);
    if (!s.party.ids.includes(id)) {
      if (other) { s.party.ids = s.party.ids.filter((x) => x !== other); delete f[other]; }
      else if (s.party.ids.length >= PARTY_SIZE) return;
      s.party.ids.push(id);
      const h = s.collection.find((x) => x.id === id)!;
      s.party.rules[id] = fromHeroes([h]).rules[id];
      if (!s.party.ids.includes(s.party.captain)) s.party.captain = id;
    } else if (other) f[other] = { ...f[id] };
    f[id] = { row, col } as Slot;
  };
  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t) return;
    if (t.dataset.cell) {
      const [row, col] = t.dataset.cell.split(',').map(Number);
      if (ui.picked && (!t.dataset.hero || t.dataset.hero !== ui.picked)) { moveTo(ui.picked, row, col); ui.picked = null; ui.changed(); }
      else ui.picked = t.dataset.hero && ui.picked !== t.dataset.hero ? t.dataset.hero : null;
      return ui.rerender();
    }
    if (t.dataset.bench) { ui.picked = ui.picked === t.dataset.bench ? null : t.dataset.bench; return ui.rerender(); }
    const act = t.dataset.act;
    const hid = t.dataset.hero ?? t.closest<HTMLElement>('.rule')?.dataset.hero;
    const i = Number(t.closest<HTMLElement>('.rule')?.dataset.i);
    if (act === 'bench-out' && ui.picked) {
      if (s.party.ids.length <= 1) return;
      s.party.ids = s.party.ids.filter((x) => x !== ui.picked);
      delete s.party.formation[ui.picked];
      if (s.party.captain === ui.picked) s.party.captain = s.party.ids[0];
      s.party.contingencies = s.party.contingencies.filter((c) => !(c.when.type === 'falls' && c.when.who === ui.picked));
      ui.picked = null;
    } else if (act === 'add' && hid) {
      s.party.rules[hid].push({ when: { type: 'always' }, ability: 'attack', target: 'nearest' });
    } else if (act === 'plan') {
      planNotes = planNow(s);
    } else if (act === 'pickplan') {
      planNotes = pickAndPlan(s);
      ui.picked = null;
    } else if (act === 'autohero' && hid) {
      const h = heroes().find((x) => x.id === hid)!;
      const r = planRules(h, heroes());
      s.party.rules[hid] = r.rules;
      planNotes = [`${h.name.split(' ')[0]}: ${r.why.join('; ')}.`];
    } else if (act === 'preset' && hid) {
      const h = heroes().find((x) => x.id === hid)!;
      s.party.rules[hid] = DEFAULT_RULES[h.job].slice(0, RULE_SLOTS[h.rank]).map((r) => ({ ...r, when: { ...r.when } }));
    } else if (act === 'up' && hid) {
      const r = s.party.rules[hid];
      [r[i - 1], r[i]] = [r[i], r[i - 1]];
    } else if (act === 'del' && hid) {
      s.party.rules[hid].splice(i, 1);
    } else if (act === 'cadd') {
      s.party.contingencies.push({ when: { type: 'downTo', n: 2 }, then: { retreat: true } });
    } else if (act === 'cdel') {
      s.party.contingencies.splice(Number(t.closest<HTMLElement>('.cont')!.dataset.ci), 1);
    } else return;
    ui.changed();
    ui.rerender();
  };
  root.onchange = (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.id === 'autoplan') s.auto = (el as HTMLInputElement).checked;
    else if (el.id === 'captain') s.party.captain = el.value;
    else if (el.id === 'stance') s.party.stance = el.value as Stance;
    const row = el.closest<HTMLElement>('.rule');
    if (row) {
      const r = s.party.rules[row.dataset.hero!][Number(row.dataset.i)];
      if (el.dataset.f === 'cond') r.when = defaultCondition(el.value as Condition['type']);
      else if (el.dataset.f === 'ability') r.ability = el.value;
      else if (el.dataset.f === 'target') r.target = el.value as TargetPick;
      else if (el.dataset.k) {
        const w = r.when as Record<string, unknown>;
        const inp = el as HTMLInputElement;
        w[el.dataset.k] = el.dataset.k === 'role' || el.dataset.k === 'status' ? el.value : Math.max(Number(inp.min), Math.min(Number(inp.max), Number(inp.value) || 0));
      }
    }
    const cr = el.closest<HTMLElement>('.cont');
    if (cr) {
      const c = s.party.contingencies[Number(cr.dataset.ci)];
      const d = (el as HTMLElement).dataset.c ?? (el as HTMLElement).dataset.k;
      if (d === 'trig') {
        const v = el.value;
        c.when = v === 'captain' ? { type: 'falls', who: 'captain' } : v === 'healer' ? { type: 'falls', who: 'anyHealer' }
          : v === 'hero' ? { type: 'falls', who: s.party.ids[0] } : v === 'bossHpBelow' ? { type: 'bossHpBelow', pct: 30 } : { type: 'downTo', n: 2 };
      } else if (d === 'who' && c.when.type === 'falls') c.when = { type: 'falls', who: el.value };
      else if (d === 'cpct' && c.when.type === 'bossHpBelow') c.when.pct = Number(el.value) || 30;
      else if (d === 'cn' && c.when.type === 'downTo') c.when.n = Number(el.value) || 2;
      else if (d === 'resp') c.then = el.value === 'retreat' ? { retreat: true } : { stance: el.value as Stance };
    }
    ui.changed();
    ui.rerender();
  };
  // drag and drop on desktop, as well as tap-to-move
  root.ondragstart = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-hero],[data-bench]');
    const hid = id?.dataset.hero ?? id?.dataset.bench;
    if (hid) e.dataTransfer?.setData('text/plain', hid);
  };
  root.ondragover = (e) => { if ((e.target as HTMLElement).closest('.grid.own .cell')) e.preventDefault(); };
  root.ondrop = (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.grid.own .cell');
    const id = e.dataTransfer?.getData('text/plain');
    if (!cell || !id) return;
    e.preventDefault();
    const [row, col] = cell.dataset.cell!.split(',').map(Number);
    moveTo(id, row, col);
    ui.picked = null;
    ui.changed();
    ui.rerender();
  };
  root.querySelectorAll<HTMLElement>('.bench .chip').forEach((c) => { c.draggable = true; });
}
