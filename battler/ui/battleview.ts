// Plays a finished battle back from its event log. The engine already decided
// everything; this only animates it, so replays are exact.
import manifest from '../../art/sprites/manifest.json' with { type: 'json' };
import { ABILITIES } from '../src/engine/data/abilities.ts';
import { ballad, summary } from '../src/engine/battle/report.ts';
import type { BattleEvent, BattleResult, UnitInfo } from '../src/engine/battle/types.ts';
import { ART, JOB_TAG, esc } from './card.ts';

const SPR = manifest as Record<string, { stand?: { w: number; h: number; fx: number } }>;
const ROW_X = [[41, 27, 13], [59, 73, 87]];      // % across the field, by side then row (front first)
const COL_Y = [55, 74, 93];                         // % down the field (feet), by column

interface View { info: UnitInfo; hp: number; alive: boolean; row: number; col: number; el: HTMLElement }

export class BattleView {
  private views = new Map<number, View>();
  private i = 0;
  private timer: number | null = null;
  speed = 1;
  onDone: (() => void) | null = null;
  private field: HTMLElement;
  private log: HTMLElement;
  private order: HTMLElement;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private root: HTMLElement;
  private r: BattleResult;

  constructor(root: HTMLElement, r: BattleResult, names: [string, string]) {
    this.root = root;
    this.r = r;
    root.innerHTML = `<div class="bf-top"><div class="side s0">${esc(names[0])}</div><div class="order" aria-label="Upcoming turns"></div><div class="side s1">${esc(names[1])}</div></div>
      <div class="arena" role="img" aria-label="Battlefield"><div class="midline"></div></div>
      <div class="bf-controls">
        <button data-b="play" class="stamp">Pause</button>
        <span class="seg">${[1, 2, 4].map((s) => `<button data-speed="${s}"${s === 1 ? ' aria-pressed="true"' : ''}>${s}×</button>`).join('')}</span>
        <button data-b="skip" class="ghost">Skip to end</button>
        <button data-b="replay" class="ghost">Replay</button>
      </div>
      <ol class="blog" aria-live="polite"></ol>`;
    this.field = root.querySelector('.arena')!;
    this.log = root.querySelector('.blog')!;
    this.order = root.querySelector('.order')!;
    root.querySelector('.bf-controls')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.speed) {
        this.speed = Number(b.dataset.speed);
        root.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      } else if (b.dataset.b === 'play') this.timer ? this.pause() : this.play();
      else if (b.dataset.b === 'skip') this.skip();
      else if (b.dataset.b === 'replay') this.reset(true);
    });
    this.reset(false);
  }

  private place(v: View) {
    v.el.style.left = `${ROW_X[v.info.side][v.row]}%`;
    v.el.style.top = `${COL_Y[v.col]}%`;
    v.el.style.zIndex = String(10 + v.col);
  }

  private addUnit(u: UnitInfo) {
    const el = document.createElement('div');
    el.className = `unit side${u.side}${u.summon ? ' summon' : ''}`;
    const m = u.look ? SPR[u.look]?.stand : undefined;
    el.style.setProperty('--h', String(m ? m.h : 50));
    el.innerHTML = `<div class="hpbar"><i></i></div>${u.look && m ? `<img src="${ART}${u.look}_stand.png" alt="">` : `<div class="noart">${u.job === 'summon' ? '☠' : JOB_TAG[u.job as keyof typeof JOB_TAG] ?? '?'}</div>`}<span class="uname">${esc(u.name.split(' ')[0])}</span>`;
    this.field.appendChild(el);
    const v: View = { info: u, hp: u.maxHp, alive: true, row: u.row, col: u.col, el };
    this.views.set(u.uid, v);
    this.place(v);
    this.hp(v);
  }

  private hp(v: View) {
    const p = Math.max(0, v.hp / v.info.maxHp);
    const bar = v.el.querySelector<HTMLElement>('.hpbar i')!;
    bar.style.width = `${p * 100}%`;
    bar.dataset.low = p < 0.3 ? '1' : '';
  }

  private float(uid: number, text: string, kind: string) {
    const v = this.views.get(uid);
    if (!v) return;
    const f = document.createElement('span');
    f.className = `fnum ${kind}`;
    f.textContent = text;
    f.style.left = v.el.style.left;
    f.style.top = `calc(${v.el.style.top} - var(--unit-h) - 1.2em)`;
    this.field.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  private apply(e: BattleEvent, animate: boolean) {
    if (e.type === 'summon' && e.unit) this.addUnit(e.unit);
    for (const m of e.moves ?? []) { const v = this.views.get(m.uid); if (v) { v.row = m.row; v.col = m.col; this.place(v); } }
    const actor = e.actor !== undefined ? this.views.get(e.actor) : undefined;
    if (actor && animate && e.type === 'action') {
      actor.el.classList.remove('acting');
      void actor.el.offsetWidth;
      actor.el.classList.add('acting');
    }
    for (const res of e.results ?? []) {
      const v = this.views.get(res.target);
      if (!v) continue;
      v.hp = res.hpAfter;
      this.hp(v);
      if (!animate) continue;
      if (res.outcome === 'miss') this.float(res.target, 'miss', 'miss');
      else if (res.outcome === 'hit' || res.outcome === 'crit') {
        this.float(res.target, `−${res.amount}`, res.outcome);
        v.el.classList.remove('hit'); void v.el.offsetWidth; v.el.classList.add('hit');
      } else if (res.outcome === 'heal' && res.amount) this.float(res.target, `+${res.amount}`, 'heal');
      else if (res.outcome === 'absorbed') this.float(res.target, 'blocked', 'miss');
      else if (res.outcome === 'resist') this.float(res.target, 'resisted', 'miss');
      else if (res.status) this.float(res.target, res.status, 'status');
    }
    if (e.type === 'death' && actor) { actor.alive = false; actor.hp = 0; this.hp(actor); actor.el.classList.add('dead'); }
    if (e.type !== 'start' || animate) this.line(e);
  }

  private line(e: BattleEvent) {
    const li = document.createElement('li');
    li.className = `ev ${e.type}${e.source?.kind === 'disobey' ? ' disobey' : ''}${e.actor !== undefined ? ` s${this.views.get(e.actor)?.info.side ?? ''}` : ''}`;
    li.innerHTML = `<span class="tk">${e.tick}</span>${esc(e.text)}`;
    this.log.prepend(li);
    while (this.log.children.length > 80) this.log.lastChild!.remove();
  }

  /** The next few units to act, read ahead from the log (the battle is already decided). */
  private upcoming() {
    const next: number[] = [];
    for (let j = this.i; j < this.r.events.length && next.length < 8; j++) {
      const e = this.r.events[j];
      if ((e.type === 'action' || e.type === 'skip' || e.type === 'move') && e.actor !== undefined) next.push(e.actor);
    }
    this.order.innerHTML = next.map((uid, k) => {
      const v = this.views.get(uid);
      const u = v?.info ?? this.r.events.find((x) => x.unit?.uid === uid)?.unit;
      return u ? `<span class="o s${u.side}${k === 0 ? ' now' : ''}">${esc(u.name.split(' ')[0])}</span>` : '';
    }).join('<i>›</i>');
  }

  private step = () => {
    if (this.i >= this.r.events.length) { this.finish(); return; }
    const e = this.r.events[this.i++];
    this.apply(e, true);
    this.upcoming();
    const base = e.type === 'action' ? 620 : e.type === 'death' || e.type === 'contingency' || e.type === 'summon' ? 520 : 260;
    this.timer = window.setTimeout(this.step, (this.reduced ? base * 0.6 : base) / this.speed);
  };

  play() {
    if (this.i >= this.r.events.length) return;
    this.root.querySelector<HTMLButtonElement>('[data-b="play"]')!.textContent = 'Pause';
    this.timer = window.setTimeout(this.step, 200);
  }
  pause() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.root.querySelector<HTMLButtonElement>('[data-b="play"]')!.textContent = 'Play';
  }
  skip() {
    this.pause();
    while (this.i < this.r.events.length) this.apply(this.r.events[this.i++], false);
    this.upcoming();
    this.finish();
  }
  reset(autoplay: boolean) {
    this.pause();
    this.field.querySelectorAll('.unit,.fnum').forEach((n) => n.remove());
    this.log.innerHTML = '';
    this.views.clear();
    this.i = 0;
    for (const u of this.r.units) this.addUnit(u);
    this.upcoming();
    if (autoplay) this.play();
  }
  destroy() { this.pause(); }
  private finish() {
    this.pause();
    this.root.querySelector<HTMLButtonElement>('[data-b="play"]')!.textContent = 'Done';
    this.onDone?.();
  }
}

export function reportHTML(r: BattleResult, names: [string, string]): string {
  const won = r.winner === 0;
  const rows = r.report.heroes.filter((h) => h.side === 0).map((h) => `<tr class="${h.alive ? '' : 'fell'}">
    <th>${esc(h.name)}${r.report.mvp === h.uid ? ' <span class="mvp">MVP</span>' : ''}</th><td>${h.dealt}</td><td>${h.taken}</td><td>${h.healed}</td><td>${h.kills}</td>
    <td class="fires">${h.ruleFires.map((n, i) => `<span title="Rule ${i + 1}">#${i + 1}·${n}</span>`).join(' ') || '–'}</td><td>${h.defaults}</td><td>${h.disobeyed || '–'}</td></tr>`).join('');
  const song = ballad(r, 0);
  const why = whyLines(r);
  return `<div class="report">
    <h2 class="${won ? 'win' : r.winner === 'draw' ? '' : 'loss'}">${won ? 'Victory' : r.winner === 'draw' ? 'Draw' : 'Defeat'} <small>vs ${esc(names[1])}${r.reason === 'tickCap' ? ' · decided on remaining HP' : ''}</small></h2>
    ${why.length ? `<ul class="why">${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <div class="tablewrap"><table><thead><tr><th>Hero</th><th>Dealt</th><th>Taken</th><th>Healed</th><th>Kills</th><th>Rules fired</th><th>Default</th><th>Disobeyed</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${song ? `<blockquote class="ballad">${song.map((l) => `<p>${esc(l)}</p>`).join('')}</blockquote>` : ''}
    <details><summary>Plain summary</summary>${summary(r, 0).map((l) => `<p>${esc(l)}</p>`).join('')}</details>
  </div>`;
}

/** A few plain reasons a battle went the way it did, read from the report. */
function whyLines(r: BattleResult): string[] {
  const out: string[] = [];
  const mine = r.report.heroes.filter((h) => h.side === 0), theirs = r.report.heroes.filter((h) => h.side === 1);
  const sum = (l: typeof mine, k: 'dealt' | 'healed' | 'disobeyed') => l.reduce((t, h) => t + h[k], 0);
  if (sum(mine, 'disobeyed') >= 6) out.push(`Your heroes ignored orders ${sum(mine, 'disobeyed')} times. A high-Charisma captain and Wise heroes keep discipline up.`);
  if (sum(theirs, 'healed') > sum(mine, 'healed') * 1.5 && sum(theirs, 'healed') > 150) out.push(`They out-healed you ${sum(theirs, 'healed')} to ${sum(mine, 'healed')}. Silence or rush their healers.`);
  const idle = mine.filter((h) => h.ruleFires.length && h.ruleFires.every((n) => n === 0) && h.defaults > 3);
  for (const h of idle.slice(0, 2)) out.push(`None of ${h.name.split(' ')[0]}'s rules ever applied, so they only made default attacks.`);
  const first = r.events.find((e) => e.type === 'death');
  if (first && first.actor !== undefined) {
    const u = r.units.find((x) => x.uid === first.actor) ?? r.events.find((e) => e.unit?.uid === first.actor)?.unit;
    if (u) out.push(`${u.name} fell first, at tick ${first.tick}.`);
  }
  return out;
}

export function abilityName(id: string) { return ABILITIES[id]?.name ?? id; }
