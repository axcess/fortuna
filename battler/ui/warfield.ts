// A real-time battlefield in the Total War manner, played back from the engine's
// event log. Each hero leads a regiment whose soldiers fall as the hero's HP drops;
// melee regiments march out and clash, archers loose arcing volleys, spells fly and
// burst, and the fallen stay on the field. The engine already decided everything:
// this only stages it, so replays are exact.
import manifest from '../../art/sprites/manifest.json' with { type: 'json' };
import { ABILITIES } from '../src/engine/data/abilities.ts';
import { JOB_DEFS } from '../src/engine/data/jobs.ts';
import type { BattleEvent, BattleResult, Result, UnitInfo } from '../src/engine/battle/types.ts';
import { makeRng } from '../src/engine/rng.ts';
import { ART, JOB_TAG, esc, portrait } from './card.ts';

const SPR = manifest as Record<string, { stand?: { w: number; h: number; fx: number } }>;

// ---------------------------------------------------------------- staging --
const W = 1000, H = 450;                       // world units
const TICK = 0.12;                             // seconds of battle per engine tick, at 1×
const PRELUDE = 2.2;                           // the armies march out before the first blow
const LANE_Y = [215, 305, 395];                // by grid column
const HOME_X = [[385, 290, 195], [615, 710, 805]];   // by side, then row (front first)
const MARCH = 55;                              // world units per second
const GAP = 34;                                // distance between engaged regiments
const SIDE_COL = ['#7fb0e6', '#e98d5a'];
const persp = (y: number) => 0.6 + 0.4 * (y - 150) / 300;

interface Soldier { ox: number; oy: number; phase: number; alive: boolean }
interface Corpse { x: number; y: number; img: HTMLImageElement | null; h: number; flip: boolean; kind: string }
interface Reg {
  info: UnitInfo; side: 0 | 1; img: HTMLImageElement | null; kind: 'hero' | 'beast' | 'skeleton';
  hp: number; alive: boolean; melee: boolean; caster: boolean;
  hx: number; hy: number; x: number; y: number;
  soldiers: Soldier[]; plans: { t: number; target: number }[];
  flash: number; lunge: number; diedAt: number; slot: number;
}
interface Proj { kind: 'arrow' | 'orb'; color: string; x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; arc: number }
interface Fx { kind: 'ring' | 'burst' | 'motes' | 'spark' | 'mark' | 'zzz' | 'link'; x: number; y: number; t0: number; dur: number; color: string; r: number; x2?: number; y2?: number }
interface Floater { x: number; y: number; t0: number; text: string; color: string; big: boolean }
interface Job { t: number; run: () => void }

const ORB: Record<string, string> = {
  bolt: '#b7a6ff', thorn: '#8be07a', spiritBolt: '#d59bff', drain: '#c33a5a', acidFlask: '#9ae04a', fireball: '#ff9a3c', firebomb: '#ff7a2a',
};
const RING: Record<string, string> = {
  courage: '#ffd36b', inspired: '#ffe9a0', evade: '#cfd8e6', shield: '#8fd4ff', barkskin: '#9b7a4a', shieldWall: '#d0d6e0', taunt: '#ff6b5a',
  guarded: '#ffd36b', marked: '#ff5a5a', poison: '#7fd04a', slowed: '#7fb8ff', silenced: '#c0c0d0', dissonance: '#c58aff', asleep: '#a0b4ff',
  cursed: '#9a4adf', feared: '#6a4a8a', corroded: '#9ae04a', regrowth: '#6fc28a', defending: '#d0d6e0',
};

export class WarField {
  onDone: (() => void) | null = null;
  speed = 1;
  private root: HTMLElement;
  private r: BattleResult;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement | null = null;
  private scale = 1;
  private regs = new Map<number, Reg>();
  private corpses: Corpse[] = [];
  private scorch: { x: number; y: number; r: number }[] = [];
  private projs: Proj[] = [];
  private fx: Fx[] = [];
  private floats: Floater[] = [];
  private jobs: Job[] = [];
  private jobI = 0;
  private t = 0;
  private end = 0;
  private playing = false;
  private raf = 0;
  private last = 0;
  private finished = false;
  private imgs = new Map<string, HTMLImageElement>();
  private log: HTMLElement;
  private cards: HTMLElement;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ro: ResizeObserver;

  constructor(root: HTMLElement, r: BattleResult, names: [string, string]) {
    this.root = root;
    this.r = r;
    root.innerHTML = `<div class="bf-top"><div class="side s0">${esc(names[0])}</div><div class="clock" aria-hidden="true">0:00</div><div class="side s1">${esc(names[1])}</div></div>
      <div class="warwrap"><canvas class="war" role="img" aria-label="Battlefield: ${esc(names[0])} against ${esc(names[1])}"></canvas></div>
      <div class="ucards"></div>
      <div class="bf-controls">
        <button data-b="play" class="stamp">Pause</button>
        <span class="seg">${[1, 2, 4].map((s) => `<button data-speed="${s}"${s === 1 ? ' aria-pressed="true"' : ''}>${s}×</button>`).join('')}</span>
        <button data-b="skip" class="ghost">Skip to end</button>
        <button data-b="replay" class="ghost">Replay</button>
      </div>
      <details class="logbox"><summary>Battle log</summary><ol class="blog" aria-live="off"></ol></details>`;
    this.canvas = root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.log = root.querySelector('.blog')!;
    this.cards = root.querySelector('.ucards')!;
    root.querySelector('.bf-controls')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.speed) {
        this.speed = Number(b.dataset.speed);
        root.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      } else if (b.dataset.b === 'play') this.playing ? this.pause() : this.play();
      else if (b.dataset.b === 'skip') this.skip();
      else if (b.dataset.b === 'replay') { this.reset(); this.play(); }
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root.querySelector('.warwrap')!);
    this.reset();
  }

  // ------------------------------------------------------------- setup --
  private image(look: string | null): HTMLImageElement | null {
    if (!look || !SPR[look]?.stand) return null;
    let img = this.imgs.get(look);
    if (!img) { img = new Image(); img.src = `${ART}${look}_stand.png`; img.onload = () => this.draw(); this.imgs.set(look, img); }
    return img;
  }

  private addReg(u: UnitInfo, deployed: boolean) {
    const side = u.side as 0 | 1;
    const basic = u.job === 'summon' ? (u.look ? 'claw' : 'claw') : JOB_DEFS[u.job].basic;
    const roles = u.job === 'summon' ? [] : JOB_DEFS[u.job].roles;
    const kind: Reg['kind'] = u.job !== 'summon' ? 'hero' : u.look ? 'beast' : 'skeleton';
    const n = kind === 'beast' ? 0 : kind === 'skeleton' ? 4 : roles.includes('tank') ? 11 : ABILITIES[basic]?.melee ? 9 : roles.includes('caster') || roles.includes('healer') ? 4 : 7;
    const rng = makeRng(this.r.seed ^ (u.uid * 7919));
    const soldiers: Soldier[] = [];
    const files = 3;
    for (let i = 0; i < n; i++) {
      const rank = Math.floor(i / files), file = i % files;
      soldiers.push({ ox: -(rank + 1) * 13 + rng.int(-2, 2), oy: (file - 1) * 15 + rng.int(-2, 2), phase: rng.next() * 6.28, alive: true });
    }
    const dir = side === 0 ? 1 : -1;
    const hx = HOME_X[side][u.row], hy = LANE_Y[u.col];
    const reg: Reg = {
      info: u, side, img: this.image(u.look), kind, hp: u.maxHp, alive: true,
      melee: !!ABILITIES[basic]?.melee, caster: roles.includes('caster') || roles.includes('healer'),
      hx, hy, x: deployed ? hx : hx - dir * 90, y: hy, soldiers, plans: [], flash: -1, lunge: -1, diedAt: -1, slot: u.uid % 3,
    };
    this.regs.set(u.uid, reg);
  }

  private reset() {
    this.pause();
    this.regs.clear(); this.corpses = []; this.scorch = []; this.projs = []; this.fx = []; this.floats = [];
    this.t = 0; this.jobI = 0; this.finished = false;
    this.log.innerHTML = '';
    for (const u of this.r.units) this.addReg(u, false);
    for (const e of this.r.events) if (e.unit) this.image(e.unit.look);
    this.schedule();
    this.cardsHTML();
    this.terrain = null;
    this.resize();
  }

  /** Turn the event log into timed jobs: animations, impacts, deaths. */
  private schedule() {
    this.jobs = [];
    const impactAt = new Map<number, number>();
    let lastTick = -1, k = 0;
    const timeOf = (e: BattleEvent) => {
      if (e.tick !== lastTick) { lastTick = e.tick; k = 0; } else k++;
      return PRELUDE + e.tick * TICK + k * 0.05;
    };
    for (const e of this.r.events) {
      const t = timeOf(e);
      const ab = e.ability ? ABILITIES[e.ability] : undefined;
      // melee plans let regiments start walking to their next fight ahead of time
      if (e.type === 'action' && ab?.melee && e.actor !== undefined) {
        const target = e.results?.find((x) => x.outcome !== 'status')?.redirectedFrom ?? e.results?.[0]?.target;
        if (target !== undefined) this.plansFor(e.actor).push({ t, target });
      }
      if (e.type === 'action' && e.actor !== undefined && ab) {
        const flight = !ab.melee && (ab.kind === 'physical' || ab.kind === 'spell') ? (ab.kind === 'physical' ? 0.55 : 0.4) : 0;
        this.jobs.push({ t, run: () => this.cast(e, flight) });
        const hit = t + flight + (ab.melee ? 0.18 : 0);
        this.jobs.push({ t: hit, run: () => this.impact(e) });
        for (const res of e.results ?? []) impactAt.set(res.target, hit);
      } else if (e.type === 'death' && e.actor !== undefined) {
        const at = Math.max(t, (impactAt.get(e.actor) ?? 0) + 0.02);
        this.jobs.push({ t: at, run: () => this.death(e.actor!) });
      } else if (e.type === 'dot' || e.type === 'hot') {
        this.jobs.push({ t, run: () => this.applyResults(e.results ?? [], null) });
      } else if (e.type === 'summon' && e.unit) {
        const u = e.unit;
        this.jobs.push({ t, run: () => { this.addReg(u, true); this.fx.push({ kind: 'burst', x: HOME_X[u.side][u.row], y: LANE_Y[u.col], t0: this.t, dur: .6, color: '#c9b8ff', r: 30 }); this.cardsHTML(); } });
      }
      if (e.moves?.length) {
        const moves = e.moves;
        this.jobs.push({ t, run: () => { for (const m of moves) { const g = this.regs.get(m.uid); if (g) { g.hx = HOME_X[g.side][m.row]; g.hy = LANE_Y[m.col]; } } } });
      }
      if (e.type !== 'start') this.jobs.push({ t: e.type === 'death' ? Math.max(t, (impactAt.get(e.actor!) ?? 0) + 0.02) : t, run: () => this.line(e) });
      else this.line(e);
    }
    this.jobs.sort((a, b) => a.t - b.t);
    this.end = (this.jobs.at(-1)?.t ?? PRELUDE) + 1.2;
  }
  private plansFor(uid: number) {
    const known = this.regs.get(uid);
    if (known) return known.plans;
    // a summon not on the field yet: keep its plans until it arrives
    const p = (this.pending.get(uid) ?? []);
    this.pending.set(uid, p);
    return p;
  }
  private pending = new Map<number, { t: number; target: number }[]>();

  // ----------------------------------------------------------- happenings --
  private cast(e: BattleEvent, flight: number) {
    const a = this.regs.get(e.actor!);
    const ab = ABILITIES[e.ability!];
    if (!a || !ab) return;
    a.lunge = this.t;
    const targets = (e.results ?? []).map((r) => this.regs.get(r.redirectedFrom ?? r.target)).filter((x): x is Reg => !!x);
    const front = { x: a.x, y: a.y };
    if (flight) {
      const dsts = ab.aim === 'enemyRow' ? targets : targets.slice(0, ab.aim === 'enemyArea' ? 1 : targets.length);
      for (const d of dsts) {
        if (ab.kind === 'physical') {
          const volley = ab.aim === 'enemyRow' ? 2 : 4;   // several arrows per loose
          for (let i = 0; i < volley; i++) this.projs.push({ kind: 'arrow', color: '#e8dcc0', x0: front.x - (a.side ? -1 : 1) * 10 + i * 3, y0: front.y - 18 + i * 4, x1: d.x + (i - 1.5) * 6, y1: d.y - 8 + (i % 2) * 8, t0: this.t + i * .04, t1: this.t + flight + i * .04, arc: 70 });
        } else this.projs.push({ kind: 'orb', color: ORB[e.ability!] ?? '#c9b8ff', x0: front.x, y0: front.y - 26, x1: d.x, y1: d.y - 14, t0: this.t, t1: this.t + flight, arc: 10 });
      }
    } else if (ab.kind === 'heal' || ab.kind === 'buff' || ab.kind === 'utility' || ab.kind === 'debuff' || ab.kind === 'summon') {
      this.fx.push({ kind: 'ring', x: front.x, y: front.y, t0: this.t, dur: .5, color: ab.kind === 'heal' ? '#7fe0a0' : ab.kind === 'debuff' ? '#c58aff' : '#ffe08a', r: 26 });
    }
  }

  private impact(e: BattleEvent) {
    const ab = ABILITIES[e.ability!];
    const results = e.results ?? [];
    if (ab?.aim === 'enemyArea' || e.ability === 'fireball' || e.ability === 'firebomb') {
      const c = this.regs.get(results[0]?.target ?? -1);
      if (c) { this.fx.push({ kind: 'burst', x: c.x, y: c.y, t0: this.t, dur: .7, color: '#ff8a3a', r: 60 }); this.scorch.push({ x: c.x, y: c.y, r: 40 }); }
    }
    if (e.ability === 'frostNova' || e.ability === 'entangle')
      for (const r of results) { const g = this.regs.get(r.target); if (g) this.fx.push({ kind: 'ring', x: g.x, y: g.y, t0: this.t, dur: .6, color: e.ability === 'frostNova' ? '#9fd4ff' : '#7fd04a', r: 34 }); }
    if (e.ability === 'guard' && e.actor !== undefined) {
      const a = this.regs.get(e.actor), b = this.regs.get(results[0]?.target ?? -1);
      if (a && b) this.fx.push({ kind: 'link', x: a.x, y: a.y, x2: b.x, y2: b.y, t0: this.t, dur: 1.2, color: '#ffd36b', r: 0 });
    }
    this.applyResults(results, ab?.melee ? this.regs.get(e.actor!) ?? null : null);
  }

  private applyResults(results: Result[], meleeBy: Reg | null) {
    for (const res of results) {
      const g = this.regs.get(res.target);
      if (!g) continue;
      const before = g.hp;
      g.hp = res.hpAfter;
      const top = { x: g.x, y: g.y - 46 * persp(g.y) };
      switch (res.outcome) {
        case 'miss': this.float(top, 'miss', '#c9d2e0', false); break;
        case 'hit': case 'crit':
          this.float(top, `−${res.amount}`, res.outcome === 'crit' ? '#ffd34d' : '#ffffff', res.outcome === 'crit');
          g.flash = this.t;
          if (meleeBy) this.fx.push({ kind: 'spark', x: (g.x + meleeBy.x) / 2, y: g.y - 12, t0: this.t, dur: .25, color: '#fff2c0', r: 10 });
          break;
        case 'heal': if (res.amount) { this.float(top, `+${res.amount}`, '#7fe0a0', false); this.fx.push({ kind: 'motes', x: g.x, y: g.y, t0: this.t, dur: .9, color: '#8ff0b0', r: 20 }); } break;
        case 'absorbed': this.float(top, 'blocked', '#9fd4ff', false); break;
        case 'resist': this.float(top, 'resisted', '#c9d2e0', false); break;
        case 'status':
          if (res.status) {
            this.fx.push({ kind: res.status === 'asleep' ? 'zzz' : res.status === 'marked' ? 'mark' : 'ring', x: g.x, y: g.y, t0: this.t, dur: res.status === 'marked' ? 1.6 : .7, color: RING[res.status] ?? '#ffffff', r: 28 });
            if (!['courage', 'inspired', 'evade'].includes(res.status)) this.float(top, res.status, RING[res.status] ?? '#ffffff', false);
          }
          break;
      }
      if (g.hp < before) this.casualties(g);
      if (g.hp > before) this.reinforce(g);
    }
    this.updateCards();
  }

  private casualties(g: Reg) {
    const want = Math.ceil(g.soldiers.length * Math.max(0, g.hp) / g.info.maxHp);
    const alive = g.soldiers.filter((s) => s.alive);
    for (let i = alive.length - 1; i >= want && i >= 0; i--) {
      // the front of the block falls first
      const s = [...alive].sort((a, b) => (g.side ? a.ox - b.ox : b.ox - a.ox))[0];
      alive.splice(alive.indexOf(s), 1);
      s.alive = false;
      const dir = g.side === 0 ? 1 : -1;
      this.corpses.push({ x: g.x + dir * s.ox * persp(g.y), y: g.y + s.oy * persp(g.y), img: g.img, h: 30 * persp(g.y), flip: (s.phase > 3) !== !!g.side, kind: g.kind });
    }
  }
  private reinforce(g: Reg) {
    // healing brings the wounded back to their feet
    const want = Math.ceil(g.soldiers.length * g.hp / g.info.maxHp);
    let alive = g.soldiers.filter((s) => s.alive).length;
    for (const s of g.soldiers) { if (alive >= want) break; if (!s.alive) { s.alive = true; alive++; } }
  }

  private death(uid: number) {
    const g = this.regs.get(uid);
    if (!g || !g.alive) return;
    g.hp = 0;
    this.casualties(g);
    g.alive = false;
    g.diedAt = this.t;
    this.corpses.push({ x: g.x, y: g.y, img: g.img, h: 40 * persp(g.y), flip: !!g.side, kind: g.kind });
    this.updateCards();
  }

  private float(p: { x: number; y: number }, text: string, color: string, big: boolean) {
    // fan out numbers that land on the same regiment at once
    const near = this.floats.filter((f) => this.t - f.t0 < .5 && Math.abs(f.x - p.x) < 30 && Math.abs(f.y - p.y) < 30).length;
    this.floats.push({ x: p.x + ((near % 3) - 1) * 16, y: p.y - Math.floor(near / 3) * 12, t0: this.t, text, color, big });
  }

  private line(e: BattleEvent) {
    const li = document.createElement('li');
    const side = e.actor !== undefined ? this.r.units.find((u) => u.uid === e.actor)?.side ?? this.regs.get(e.actor)?.side : undefined;
    li.className = `ev ${e.type}${e.source?.kind === 'disobey' ? ' disobey' : ''}${side !== undefined ? ` s${side}` : ''}`;
    li.innerHTML = `<span class="tk">${e.tick}</span>${esc(e.text)}`;
    this.log.prepend(li);
    while (this.log.children.length > 120) this.log.lastChild!.remove();
  }

  // ------------------------------------------------------------ movement --
  /** Where a regiment wants to stand right now. */
  private goal(g: Reg): { x: number; y: number } {
    const dir = g.side === 0 ? 1 : -1;
    if (!g.alive) return { x: g.x, y: g.y };
    if (this.t < .4) return { x: g.x, y: g.y };
    if (g.melee) {
      // the fight it's walking into next, or the one it's in
      let tgt: Reg | undefined;
      for (const p of g.plans) {
        if (p.t > this.t + 3) break;
        const c = this.regs.get(p.target);
        if (c && c.alive && p.t >= this.t - 1.5) { tgt = c; break; }
      }
      if (!tgt) for (let i = g.plans.length - 1; i >= 0; i--) {
        const p = g.plans[i];
        if (p.t > this.t) continue;
        const c = this.regs.get(p.target);
        if (c && c.alive) tgt = c;
        break;
      }
      if (tgt) {
        // two melee regiments meet halfway between their home positions (fixed points, so
        // they can't chase each other); against archers and casters they charge home
        const meet = tgt.melee ? { x: (g.hx + tgt.hx) / 2 - dir * GAP / 2, y: (g.hy + tgt.hy) / 2 } : { x: tgt.x - dir * GAP, y: tgt.y };
        return { x: meet.x, y: Math.max(175, Math.min(430, meet.y + (g.slot - 1) * 12)) };
      }
      return { x: g.hx + dir * 55, y: g.hy };   // advance to the contact line
    }
    return { x: g.hx + dir * 20, y: g.hy };
  }

  private move(dt: number) {
    for (const g of this.regs.values()) {
      const pend = this.pending.get(g.info.uid);
      if (pend) { g.plans.push(...pend); g.plans.sort((a, b) => a.t - b.t); this.pending.delete(g.info.uid); }
      const to = this.goal(g);
      const dx = to.x - g.x, dy = to.y - g.y, d = Math.hypot(dx, dy);
      const step = MARCH * dt;
      if (d > step) { g.x += dx / d * step; g.y += dy / d * step; } else { g.x = to.x; g.y = to.y; }
    }
  }
  private moving(g: Reg) { const to = this.goal(g); return Math.hypot(to.x - g.x, to.y - g.y) > 2; }

  // -------------------------------------------------------------- drawing --
  private resize() {
    const wrap = this.root.querySelector<HTMLElement>('.warwrap')!;
    const cssW = wrap.clientWidth || 800;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssW * dpr * H / W);
    this.scale = this.canvas.width / W;
    this.terrain = null;
    this.draw();
  }

  /** Pixel-art grassland, painted once per size at half world resolution. */
  private paintTerrain() {
    const c = document.createElement('canvas');
    c.width = W / 2; c.height = H / 2;
    const g = c.getContext('2d')!;
    const rng = makeRng(this.r.seed);
    const sky = g.createLinearGradient(0, 0, 0, 40);
    sky.addColorStop(0, '#8fb4d6'); sky.addColorStop(1, '#c9dbe0');
    g.fillStyle = sky; g.fillRect(0, 0, W / 2, 40);
    // far hills, then the treeline
    const ridge = (y0: number, amp: number, col: string, f: number) => {
      g.fillStyle = col;
      for (let x = 0; x < W / 2; x++) { const y = y0 + Math.sin(x / f + y0) * amp + Math.sin(x / (f / 3)) * amp / 3; g.fillRect(x, y, 1, 80); }
    };
    ridge(28, 6, '#7d9a86', 40); ridge(40, 5, '#5f8060', 26);
    for (let i = 0; i < 60; i++) {
      const x = rng.int(-5, W / 2 + 5), y = rng.int(52, 66), r = rng.int(5, 10);
      g.fillStyle = i % 3 ? '#3c5e3a' : '#2f4d30'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = '#4f7448'; g.beginPath(); g.arc(x - 2, y - 2, r * .55, 0, 7); g.fill();
    }
    // the plain: darker far away, brighter near
    const grass = g.createLinearGradient(0, 62, 0, H / 2);
    grass.addColorStop(0, '#4e7a3c'); grass.addColorStop(1, '#6f9a48');
    g.fillStyle = grass; g.fillRect(0, 62, W / 2, H / 2 - 62);
    for (let i = 0; i < 900; i++) {
      const x = rng.int(0, W / 2), y = rng.int(64, H / 2), light = rng.chance(.5);
      g.fillStyle = light ? 'rgba(170,200,110,.18)' : 'rgba(30,60,30,.18)';
      g.fillRect(x, y, rng.int(2, 9), rng.int(1, 3));
    }
    // a worn road across the field
    g.fillStyle = 'rgba(160,130,80,.55)';
    for (let x = 0; x < W / 2; x++) { const y = 150 + Math.sin(x / 55) * 10 + x * .02; g.fillRect(x, y, 1, 9 + Math.sin(x / 9) * 1.5); }
    for (let i = 0; i < 160; i++) {   // tufts, flowers and stones
      const x = rng.int(0, W / 2), y = rng.int(70, H / 2), r = rng.next();
      g.fillStyle = r < .55 ? '#3d6430' : r < .75 ? '#e8d86a' : r < .85 ? '#d98aa0' : '#9a9a8a';
      g.fillRect(x, y, r < .55 ? 1 : 2, r < .55 ? 3 : 2);
    }
    // vignette
    const v = g.createRadialGradient(W / 4, H / 4, 60, W / 4, H / 4, 300);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = v; g.fillRect(0, 0, W / 2, H / 2);
    return c;
  }

  private draw() {
    const ctx = this.ctx, s = this.scale;
    if (!this.terrain) this.terrain = this.paintTerrain();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // scorch marks and the fallen
    for (const m of this.scorch) {
      const gr = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, m.r);
      gr.addColorStop(0, 'rgba(30,20,10,.55)'); gr.addColorStop(1, 'rgba(30,20,10,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r * .45, 0, 0, 7); ctx.fill();
    }
    ctx.imageSmoothingEnabled = true;
    for (const c of this.corpses) this.drawBody(c);
    // living soldiers, painted far to near
    type D = { y: number; draw: () => void };
    const ds: D[] = [];
    for (const g of this.regs.values()) {
      if (!g.alive && this.t - g.diedAt > .01) continue;
      const p = persp(g.y), dir = g.side === 0 ? 1 : -1;
      const walking = this.moving(g);
      const fighting = g.melee && this.t - g.lunge < .6;
      for (const sd of g.soldiers) {
        if (!sd.alive) continue;
        const bob = walking && !this.reduced ? Math.abs(Math.sin(this.t * 9 + sd.phase)) * 2 : 0;
        const jab = fighting && !this.reduced ? Math.max(0, Math.sin((this.t - g.lunge) * 14 + sd.phase)) * 4 * dir : 0;
        const x = g.x + dir * sd.ox * p + jab, y = g.y + sd.oy * p;
        ds.push({ y, draw: () => this.drawFigure(g, x, y - bob, 30 * p, false) });
      }
      const lunge = this.t - g.lunge < .35 && !this.reduced ? Math.sin((this.t - g.lunge) / .35 * Math.PI) * 10 * dir : 0;
      ds.push({ y: g.y + .5, draw: () => { this.drawFigure(g, g.x + 6 * dir * p + lunge, g.y, (g.kind === 'beast' ? 26 : 42) * p, true); this.drawBanner(g); } });
    }
    ds.sort((a, b) => a.y - b.y);
    for (const d of ds) d.draw();
    this.drawProjectiles();
    this.drawFx();
    this.drawFloats();
  }

  private drawFigure(g: Reg, x: number, y: number, h: number, hero: boolean) {
    const ctx = this.ctx;
    const hit = this.t - g.flash < .14;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(x, y, h * .26, h * .08, 0, 0, 7); ctx.fill();
    if (g.img && g.img.complete && g.img.naturalWidth) {
      const w = h * g.img.naturalWidth / g.img.naturalHeight;
      if (hit) ctx.filter = hero ? 'brightness(2.4) saturate(.3)' : 'brightness(1.35)';
      else if (!hero) ctx.filter = 'brightness(.88)';
      ctx.drawImage(g.img, x - w / 2, y - h, w, h);
      ctx.filter = 'none';
    } else {
      // no painted art (necromancers, skeletons): a simple silhouette
      const bone = g.kind === 'skeleton';
      ctx.fillStyle = hit ? '#fff' : bone ? '#d8d2bc' : '#3b2a52';
      ctx.beginPath(); ctx.moveTo(x - h * .18, y); ctx.lineTo(x + h * .18, y); ctx.lineTo(x + h * .1, y - h * .7); ctx.lineTo(x - h * .1, y - h * .7); ctx.fill();
      ctx.fillStyle = bone ? '#efe9d6' : '#c9c0a8';
      ctx.beginPath(); ctx.arc(x, y - h * .8, h * .12, 0, 7); ctx.fill();
      if (!bone) { ctx.fillStyle = '#2a1d3c'; ctx.beginPath(); ctx.arc(x, y - h * .84, h * .14, Math.PI, 0); ctx.fill(); }
    }
  }

  private drawBody(c: Corpse) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.flip ? -Math.PI / 2 : Math.PI / 2);
    ctx.globalAlpha = .55;
    ctx.filter = 'grayscale(.5) brightness(.55)';
    if (c.img && c.img.complete && c.img.naturalWidth) {
      const w = c.h * c.img.naturalWidth / c.img.naturalHeight;
      ctx.drawImage(c.img, -c.h * .9, -w / 2, c.h, w);
    } else { ctx.fillStyle = c.kind === 'skeleton' ? '#d8d2bc' : '#3b2a52'; ctx.fillRect(-c.h * .8, -c.h * .12, c.h * .8, c.h * .24); }
    ctx.restore();
    ctx.filter = 'none';
  }

  private drawBanner(g: Reg) {
    if (!g.alive) return;
    const ctx = this.ctx, p = persp(g.y), dir = g.side === 0 ? 1 : -1;
    if (g.kind !== 'hero') {   // summons: a strength bar, no banner
      const bw = 22 * p, frac = Math.max(0, g.hp / g.info.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(g.x - bw / 2, g.y - 36 * p, bw, 3);
      ctx.fillStyle = SIDE_COL[g.side]; ctx.fillRect(g.x - bw / 2, g.y - 36 * p, bw * frac, 3);
      return;
    }
    const x = g.x - dir * 12 * p, top = g.y - 74 * p;
    ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, g.y - 20 * p); ctx.lineTo(x, top); ctx.stroke();
    const wave = this.reduced ? 0 : Math.sin(this.t * 4 + g.info.uid) * 2;
    ctx.fillStyle = SIDE_COL[g.side];
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + dir * 26 * p, top + 2 + wave); ctx.lineTo(x + dir * 24 * p, top + 15 * p + wave); ctx.lineTo(x, top + 13 * p); ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.font = `600 ${Math.round(11 * p)}px Teko, 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'center';
    const tag = g.info.job === 'summon' ? '' : JOB_TAG[g.info.job as keyof typeof JOB_TAG];
    ctx.fillText(tag, x + dir * 12 * p, top + 11 * p + wave / 2);
    // regiment strength bar
    const bw = 30 * p, frac = Math.max(0, g.hp / g.info.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(g.x - bw / 2, g.y - 58 * p, bw, 3.2);
    ctx.fillStyle = frac < .3 ? '#d0574b' : '#6fc28a'; ctx.fillRect(g.x - bw / 2, g.y - 58 * p, bw * frac, 3.2);
  }

  private drawProjectiles() {
    const ctx = this.ctx;
    this.projs = this.projs.filter((pr) => this.t < pr.t1);
    for (const pr of this.projs) {
      if (this.t < pr.t0) continue;
      const k = (this.t - pr.t0) / (pr.t1 - pr.t0);
      const x = pr.x0 + (pr.x1 - pr.x0) * k, y = pr.y0 + (pr.y1 - pr.y0) * k - Math.sin(k * Math.PI) * pr.arc;
      if (pr.kind === 'arrow') {
        const k2 = Math.max(0, k - .05);
        const x2 = pr.x0 + (pr.x1 - pr.x0) * k2, y2 = pr.y0 + (pr.y1 - pr.y0) * k2 - Math.sin(k2 * Math.PI) * pr.arc;
        ctx.strokeStyle = pr.color; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
      } else {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 9);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(.35, pr.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      }
    }
  }

  private drawFx() {
    const ctx = this.ctx;
    this.fx = this.fx.filter((f) => this.t - f.t0 < f.dur);
    for (const f of this.fx) {
      const k = (this.t - f.t0) / f.dur;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.fillStyle = f.color;
      if (f.kind === 'ring') { ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (.4 + k), f.r * (.4 + k) * .4, 0, 0, 7); ctx.stroke(); }
      else if (f.kind === 'burst') {
        const gr = ctx.createRadialGradient(f.x, f.y - 10, 0, f.x, f.y - 10, f.r * (.5 + k));
        gr.addColorStop(0, '#fff6d0'); gr.addColorStop(.4, f.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y - 10, f.r * (.5 + k), 0, 7); ctx.fill();
      } else if (f.kind === 'spark') { for (let i = 0; i < 5; i++) { const a = i * 1.3 + f.t0 * 7; ctx.fillRect(f.x + Math.cos(a) * f.r * k, f.y + Math.sin(a) * f.r * k, 2, 2); } }
      else if (f.kind === 'motes') { for (let i = 0; i < 7; i++) ctx.fillRect(f.x + Math.sin(i * 2.1) * f.r, f.y - 10 - k * 40 - i * 4, 2, 2); }
      else if (f.kind === 'mark') { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y - 62, 6, 0, 7); ctx.moveTo(f.x - 9, f.y - 62); ctx.lineTo(f.x + 9, f.y - 62); ctx.moveTo(f.x, f.y - 71); ctx.lineTo(f.x, f.y - 53); ctx.stroke(); }
      else if (f.kind === 'zzz') { ctx.font = '700 12px sans-serif'; ctx.fillText('z z z', f.x - 10, f.y - 60 - k * 12); }
      else if (f.kind === 'link' && f.x2 !== undefined) { ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(f.x, f.y - 20); ctx.lineTo(f.x2, f.y2! - 20); ctx.stroke(); ctx.setLineDash([]); }
      ctx.globalAlpha = 1;
    }
  }

  private drawFloats() {
    const ctx = this.ctx;
    this.floats = this.floats.filter((f) => this.t - f.t0 < 1.1);
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const k = (this.t - f.t0) / 1.1;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2);
      ctx.font = f.text.startsWith('−') || f.text.startsWith('+') ? `600 ${f.big ? 26 : 19}px Teko, 'Arial Narrow', sans-serif` : `700 11px 'Alegreya Sans', sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(f.text, f.x, f.y - k * 22);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * 22);
    }
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------- unit cards --
  private cardsHTML() {
    const side = (n: 0 | 1) => [...this.regs.values()].filter((g) => g.side === n && g.kind === 'hero')
      .map((g) => `<div class="ucard s${n}" data-u="${g.info.uid}">${portrait({ look: g.info.look, job: g.info.job }, 'mini')}<span class="un">${esc(g.info.name.split(' ')[0])}</span><span class="uhp"><i></i></span><span class="umen"></span></div>`).join('');
    this.cards.innerHTML = `<div class="ugroup">${side(0)}</div><div class="ugroup enemy">${side(1)}</div>`;
    this.updateCards();
  }
  private updateCards() {
    this.cards.querySelectorAll<HTMLElement>('.ucard').forEach((c) => {
      const g = this.regs.get(Number(c.dataset.u));
      if (!g) return;
      const frac = Math.max(0, g.hp / g.info.maxHp);
      const bar = c.querySelector<HTMLElement>('.uhp i')!;
      bar.style.width = `${frac * 100}%`;
      bar.dataset.low = frac < .3 ? '1' : '';
      c.querySelector('.umen')!.textContent = g.alive ? `${g.soldiers.filter((s) => s.alive).length + 1} men` : 'fallen';
      c.classList.toggle('dead', !g.alive);
    });
  }

  // ------------------------------------------------------------ playback --
  private frame = (now: number) => {
    const dt = Math.min(.05, (now - this.last) / 1000) * this.speed;
    this.last = now;
    this.advance(dt);
    this.draw();
    if (this.playing) this.raf = requestAnimationFrame(this.frame);
  };
  private advance(dt: number) {
    const steps = Math.max(1, Math.ceil(dt / .02));
    for (let i = 0; i < steps; i++) {
      this.t += dt / steps;
      while (this.jobI < this.jobs.length && this.jobs[this.jobI].t <= this.t) this.jobs[this.jobI++].run();
      this.move(dt / steps);
    }
    this.clock();
    if (this.t >= this.end && !this.finished) this.finish();
  }
  private clock() {
    const el = this.root.querySelector('.clock');
    const sec = Math.max(0, Math.floor(Math.min(this.t, this.end)));
    if (el) el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  play() {
    if (this.finished) return;
    this.playing = true;
    this.root.querySelector<HTMLButtonElement>('[data-b="play"]')!.textContent = 'Pause';
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    const b = this.root.querySelector<HTMLButtonElement>('[data-b="play"]');
    if (b) b.textContent = this.finished ? 'Done' : 'Play';
  }
  skip() {
    this.pause();
    while (this.jobI < this.jobs.length) { this.t = this.jobs[this.jobI].t; this.jobs[this.jobI++].run(); this.move(.5); }
    for (let i = 0; i < 200; i++) this.move(.05);      // let everyone settle
    this.t = this.end + 2;
    this.clock();
    this.projs = []; this.fx = []; this.floats = [];
    this.draw();
    this.finish();
  }
  destroy() { this.pause(); this.ro.disconnect(); }
  private finish() {
    this.finished = true;
    this.pause();
    this.onDone?.();
  }
}
