import { ABILITIES, DEBUFFS, FAMILIARS, SUMMONS, type AbilityDef, type StatusId } from '../data/abilities.ts';
import { PERSONALITIES } from '../data/heroes.ts';
import { JOB_DEFS } from '../data/jobs.ts';
import { makeRng, type Rng } from '../rng.ts';
import { STATS, type StatKey, type Stats } from '../types.ts';
import { RULE_SLOTS, ruleText } from './rules.ts';
import type {
  BattleEvent, BattleResult, Condition, Contingency, HeroReport, Party, Result, Rule, Side, Source, Stance, TargetPick, Unit, UnitInfo,
} from './types.ts';

export const GAUGE_FULL = 1000;
export const TICK_CAP = 3000;

const STANCE_DEALT: Record<Stance, number> = { aggressive: 1.15, balanced: 1, defensive: 0.9, focus: 1, protect: 1 };
const STANCE_TAKEN: Record<Stance, number> = { aggressive: 1.10, balanced: 1, defensive: 0.85, focus: 1, protect: 1 };
const STANCE_NAME: Record<Stance, string> = { aggressive: 'Aggressive', balanced: 'Balanced', defensive: 'Defensive', focus: 'Focus Fire', protect: 'Protect the Back Line' };

interface Plan { ability: string; targets: Unit[]; source: Source; move?: { row: number; col: number }; defend?: boolean }

/**
 * Run a whole battle. Pure and deterministic: the same seed and parties always
 * give the same event log. No input is possible once it starts.
 */
export function runBattle(seed: number, partyA: Party, partyB: Party, opts: { tickCap?: number } = {}): BattleResult {
  const rng: Rng = makeRng(seed);
  const parties: [Party, Party] = [partyA, partyB];
  const units: Unit[] = [];
  const events: BattleEvent[] = [];
  const stance: [Stance, Stance] = [partyA.stance, partyB.stance];
  const fired: [boolean[], boolean[]] = [[], []];
  const owner = new Map<number, number>();           // summon uid → summoner uid (for credit)
  const stats = new Map<number, HeroReport>();
  let tick = 0;
  let seq = 0;

  // ------------------------------------------------------------- setup --
  const captainUid: [number, number] = [-1, -1];
  const bossUid: [number, number] = [-1, -1];
  for (const side of [0, 1] as Side[]) {
    const p = parties[side];
    for (const h of p.heroes) {
      const slot = p.formation[h.id];
      if (!slot) throw new Error(`${h.name} has no place in the formation`);
      const jd = JOB_DEFS[h.job];
      const u: Unit = {
        uid: units.length, side, heroId: h.id, name: h.name, job: h.job, look: h.look, base: { ...h.stats }, roles: jd.roles,
        basic: jd.basic, abilities: jd.abilities, rules: (p.rules[h.id] ?? []).slice(0, RULE_SLOTS[h.rank]),
        personality: h.personality, trait: h.trait, row: slot.row, col: slot.col, hp: 0, maxHp: 0, mana: 0, maxMana: 0, gauge: 0,
        cd: {}, statuses: [], alive: true, summon: false, ovr: h.ovr, actions: 0, bonded: null, lastHitBy: null, meleeTargetedAt: -1,
      };
      units.push(u);
      if (h.id === p.captain) captainUid[side] = u.uid;
      if (h.id === (p.boss ?? p.captain)) bossUid[side] = u.uid;
    }
    const cells = new Set<string>();
    for (const u of units.filter((x) => x.side === side)) {
      const k = `${u.row},${u.col}`;
      if (cells.has(k)) throw new Error(`Two heroes share the cell ${k}`);
      cells.add(k);
    }
  }
  for (const u of units) {
    const cap = units[captainUid[u.side]];
    u.maxHp = Math.round((100 + u.base.CON * 5) * (cap?.job === 'druid' ? 1.05 : 1));
    u.hp = u.maxHp;
    u.maxMana = Math.round(20 + (u.base.INT + u.base.WIS) * 0.5);
    u.mana = Math.min(u.maxMana, u.maxMana * 0.6 + (cap?.job === 'alchemist' ? 10 : 0));
    stats.set(u.uid, { uid: u.uid, name: u.name, side: u.side, job: u.job, dealt: 0, taken: 0, healed: 0, kills: 0, ruleFires: u.rules.map(() => 0), defaults: 0, disobeyed: 0, alive: true });
  }
  for (const side of [0, 1] as Side[]) {
    for (const [a, b] of parties[side].bonds ?? []) {
      const ua = units.find((u) => u.heroId === a && u.side === side), ub = units.find((u) => u.heroId === b && u.side === side);
      if (ua && ub) { ua.bonded = ub.uid; ub.bonded = ua.uid; }
    }
  }
  const info = (u: Unit): UnitInfo => ({ uid: u.uid, side: u.side, heroId: u.heroId, name: u.name, job: u.job, look: u.look, row: u.row, col: u.col, maxHp: u.maxHp, summon: u.summon });
  const startUnits = units.map(info);

  // ------------------------------------------------------------ helpers --
  const emit = (e: Omit<BattleEvent, 'seq' | 'tick'>) => { events.push({ seq: seq++, tick, ...e }); };
  const alive = (side: Side) => units.filter((u) => u.alive && u.side === side);
  const foes = (u: Unit) => alive((1 - u.side) as Side);
  const friends = (u: Unit) => alive(u.side);
  const captain = (side: Side) => { const c = units[captainUid[side]]; return c && c.alive ? c : null; };
  const capJob = (side: Side) => captain(side)?.job ?? null;
  const status = (u: Unit, id: StatusId) => u.statuses.find((s) => s.id === id);
  const has = (u: Unit, id: StatusId) => !!status(u, id);
  const mag = (u: Unit, id: StatusId) => status(u, id)?.mag ?? 0;
  const pct = (u: Unit) => u.hp / u.maxHp;
  const credit = (u: Unit) => stats.get(owner.get(u.uid) ?? u.uid);

  const eff = (u: Unit, s: StatKey) => Math.min(120, u.base[s] + (u.trait === 'battleBorn' && u.actions < 3 ? 10 : 0));
  const speed = (u: Unit) => Math.max(20, 100 + eff(u, 'DEX') + mag(u, 'inspired') - mag(u, 'slowed') + (capJob(u.side) === 'bard' ? 5 : 0));
  const armor = (u: Unit) => Math.max(0, eff(u, 'CON') * 0.6 + (u.trait === 'ironSkin' ? 15 : 0) + mag(u, 'barkskin') - mag(u, 'corroded'));
  const resist = (u: Unit) => eff(u, 'WIS') * 0.3;
  const discipline = (u: Unit) => {
    const cap = captain(u.side);
    let d = 50 + eff(u, 'WIS') * 0.4 + (cap ? eff(cap, 'CHA') * 0.2 : 0) + (u.personality ? PERSONALITIES[u.personality].discipline : 0);
    if (capJob(u.side) === 'monk') d += 5;
    if (capJob((1 - u.side) as Side) === 'necromancer') d -= 5;
    if (u.trait === 'brave') d += 5;
    d -= mag(u, 'feared');
    return Math.max(30, Math.min(100, d));
  };
  const addStatus = (t: Unit, id: StatusId, turns: number, m: number, src: Unit) => {
    if (id === 'feared' && t.trait === 'brave') return false;
    t.statuses = t.statuses.filter((s) => s.id !== id);
    // a status a unit puts on itself mid-turn shouldn't lose a turn when that turn ends
    t.statuses.push({ id, turns: turns + (t === src ? 1 : 0), mag: m, src: src.uid });
    return true;
  };

  // ---------------------------------------------------------- targeting --
  const nearestSort = (u: Unit) => (a: Unit, b: Unit) => a.row - b.row || Math.abs(a.col - u.col) - Math.abs(b.col - u.col) || a.uid - b.uid;
  const frontRow = (list: Unit[]) => Math.min(...list.map((x) => x.row));
  const focusTarget = (side: Side) => [...alive((1 - side) as Side)].sort((a, b) => b.ovr - a.ovr || a.uid - b.uid)[0];

  /** Enemies this ability may legally aim at (melee reach, then taunt). */
  const enemyReach = (u: Unit, ab: AbilityDef) => {
    let c = foes(u);
    if (!c.length) return c;
    if (ab.melee && !ab.flank) { const fr = frontRow(c); c = c.filter((x) => x.row === fr); }
    const taunting = c.filter((x) => has(x, 'taunt'));
    return taunting.length ? taunting : c;
  };

  const pick = (u: Unit, cands: Unit[], how: TargetPick, enemy: boolean): Unit | null => {
    if (!cands.length) return null;
    const near = [...cands].sort(nearestSort(u));
    const by = (f: (x: Unit) => number) => [...cands].sort((a, b) => f(a) - f(b) || a.uid - b.uid)[0];
    switch (how) {
      case 'nearest': return near[0];
      case 'lowestHp': return by((x) => x.hp);
      case 'highestHp': return by((x) => -x.hp);
      case 'lowestHpPct': return by(pct);
      case 'casters': return near.find((x) => x.roles.includes('caster')) ?? near[0];
      case 'healers': return near.find((x) => x.roles.includes('healer')) ?? near[0];
      case 'focus': { const f = enemy ? focusTarget(u.side) : null; return f && cands.includes(f) ? f : near[0]; }
      case 'self': return cands.includes(u) ? u : enemy ? near[0] : by(pct);
      case 'bonded': { const b = u.bonded !== null ? units[u.bonded] : null; return b && cands.includes(b) ? b : enemy ? near[0] : by(pct); }
    }
  };
  const defaultPick = (u: Unit): TargetPick => (stance[u.side] === 'focus' ? 'focus' : 'nearest');

  const freeCell = (side: Side, nearCol: number): { row: number; col: number } | null => {
    const taken = new Set(alive(side).map((x) => `${x.row},${x.col}`));
    for (let row = 0; row < 3; row++)
      for (const col of [0, 1, 2].sort((a, b) => Math.abs(a - nearCol) - Math.abs(b - nearCol)))
        if (!taken.has(`${row},${col}`)) return { row, col };
    return null;
  };

  // ------------------------------------------------- rule evaluation --
  const usable = (u: Unit, id: string) => {
    const ab = ABILITIES[id];
    if (!ab) return false;
    if (id !== u.basic && !u.abilities.includes(id)) return false;
    if ((u.cd[id] ?? 0) > 0 || u.mana < ab.cost) return false;
    if (ab.magic && has(u, 'silenced')) return false;
    return true;
  };

  const conditionHolds = (u: Unit, c: Condition): boolean => {
    switch (c.type) {
      case 'always': return true;
      case 'selfHpBelow': return pct(u) * 100 < c.pct;
      case 'allyHpBelow': return friends(u).some((x) => pct(x) * 100 < c.pct);
      case 'alliesBelow': return friends(u).filter((x) => pct(x) * 100 < c.pct).length >= c.n;
      case 'enemyRole': return foes(u).some((x) => x.roles.includes(c.role));
      case 'enemiesInRow': return [0, 1, 2].some((r) => foes(u).filter((x) => x.row === r).length >= c.n);
      case 'targetHas': return foes(u).some((x) => has(x, c.status === 'poisoned' ? 'poison' : c.status));
      case 'allyTargetedByMelee': return friends(u).some((x) => x !== u && x.meleeTargetedAt >= lastActed(u));
      case 'selfManaAbove': return (u.mana / u.maxMana) * 100 > c.pct;
      case 'turnAtLeast': return u.actions + 1 >= c.n;
    }
  };
  const lastActedAt = new Map<number, number>();
  const lastActed = (u: Unit) => lastActedAt.get(u.uid) ?? 0;

  /** Work out who an ability would hit, honouring the rule's condition as a filter. Null = not usable now. */
  const resolveTargets = (u: Unit, id: string, how: TargetPick, cond: Condition | null): Unit[] | null => {
    const ab = ABILITIES[id];
    const enemyFilter = (list: Unit[]) => {
      if (cond?.type === 'enemyRole') list = list.filter((x) => x.roles.includes(cond.role));
      if (cond?.type === 'targetHas') list = list.filter((x) => has(x, cond.status === 'poisoned' ? 'poison' : cond.status));
      return list;
    };
    switch (ab.aim) {
      case 'self':
        if (ab.summon === 'skeleton' && !units.some((x) => !x.alive && !x.summon && !x.raised)) return null;
        if (ab.summon === 'familiar' && units.some((x) => x.alive && owner.get(x.uid) === u.uid)) return null;
        if (ab.summon && !freeCell(u.side, u.col)) return null;
        if (ab.status && has(u, ab.status.id)) return null;
        if (ab.kind === 'heal' && u.hp >= u.maxHp && !(ab.cleanse && u.statuses.some((s) => DEBUFFS.includes(s.id)))) return null;
        return [u];
      case 'enemy': {
        let c = enemyFilter(enemyReach(u, ab));
        if (ab.kind === 'debuff' && ab.status) c = c.filter((x) => !has(x, ab.status!.id));
        const t = pick(u, c, how, true);
        return t ? [t] : null;
      }
      case 'enemyArea': {
        const t = pick(u, enemyFilter(enemyReach(u, ab)), how, true);
        if (!t) return null;
        return [t, ...foes(u).filter((x) => Math.abs(x.row - t.row) + Math.abs(x.col - t.col) === 1)];
      }
      case 'enemyRow': {
        let rows = [0, 1, 2].filter((r) => foes(u).some((x) => x.row === r));
        if (cond?.type === 'enemiesInRow') rows = rows.filter((r) => foes(u).filter((x) => x.row === r).length >= cond.n);
        const t = pick(u, enemyFilter(foes(u).filter((x) => rows.includes(x.row))), how, true);
        return t ? foes(u).filter((x) => x.row === t.row) : null;
      }
      case 'enemyFront': {
        const f = foes(u);
        if (!f.length) return null;
        const row = f.filter((x) => x.row === frontRow(f));
        if (cond?.type === 'enemiesInRow' && row.length < cond.n) return null;
        if (ab.status && row.every((x) => has(x, ab.status!.id))) return null;
        return row;
      }
      case 'enemyAll': {
        const f = foes(u);
        if (ab.status && f.every((x) => has(x, ab.status!.id))) return null;
        return f.length ? f : null;
      }
      case 'ally':
      case 'allyOther': {
        let c = friends(u);
        if (ab.aim === 'allyOther') c = c.filter((x) => x !== u);
        if (cond?.type === 'allyHpBelow') c = c.filter((x) => pct(x) * 100 < cond.pct);
        if (ab.kind === 'heal') c = c.filter((x) => x.hp < x.maxHp);
        if (ab.cleanse && ab.kind !== 'heal') c = c.filter((x) => x.statuses.some((s) => DEBUFFS.includes(s.id)));
        if (ab.status) c = c.filter((x) => !has(x, ab.status!.id));
        if (ab.gauge) c = c.filter((x) => x.gauge < GAUGE_FULL / 2);
        const t = pick(u, c, how === 'nearest' ? 'lowestHpPct' : how, false);
        return t ? [t] : null;
      }
      case 'allies': {
        const f = friends(u);
        if (ab.kind === 'heal' && !f.some((x) => x.hp < x.maxHp)) return null;
        if (ab.status && f.every((x) => has(x, ab.status!.id))) return null;
        return f;
      }
    }
  };

  const basicPlan = (u: Unit, how: TargetPick, source: Source): Plan | null => {
    for (const id of [u.basic, 'flail']) {
      if (id === 'flail' || usable(u, id)) {
        const t = resolveTargets(u, id, how, null);
        if (t) return { ability: id, targets: t, source };
      }
    }
    return null;
  };

  const planFromRules = (u: Unit): Plan | null => {
    for (let i = 0; i < u.rules.length; i++) {
      const r = u.rules[i];
      const id = r.ability === 'attack' ? u.basic : r.ability;
      if (!usable(u, id) || !conditionHolds(u, r.when)) continue;
      const t = resolveTargets(u, id, r.target, r.when);
      if (t) return { ability: id, targets: t, source: { kind: 'rule', index: i, text: ruleText(r, u.job as Exclude<Unit['job'], 'summon'>) } };
    }
    return null;
  };

  /** Protect the Back Line: a front-row tank covers a threatened ally before following their own rules. */
  const protectPlan = (u: Unit): Plan | null => {
    if (stance[u.side] !== 'protect' || u.row !== 0) return null;
    const threatened = friends(u).filter((x) => x.row > 0 && (x.meleeTargetedAt >= lastActed(u) || pct(x) < 0.5) && !has(x, 'guarded'));
    if (!threatened.length) return null;
    const src: Source = { kind: 'stance', stance: 'protect' };
    if (usable(u, 'guard')) {
      const t = [...threatened].sort((a, b) => pct(a) - pct(b) || a.uid - b.uid)[0];
      return { ability: 'guard', targets: [t], source: src };
    }
    if (usable(u, 'taunt') && !has(u, 'taunt')) return { ability: 'taunt', targets: [u], source: src };
    return null;
  };

  const disobeyPlan = (u: Unit): Plan | null => {
    const p = u.personality!;
    const src: Source = { kind: 'disobey', personality: p };
    switch (p) {
      case 'reckless': return basicPlan(u, 'highestHp', src);
      case 'greedy': return basicPlan(u, 'lowestHp', src);
      case 'cautious': {
        const cell = u.row < 2 && !friends(u).some((x) => x.row === u.row + 1 && x.col === u.col) ? { row: u.row + 1, col: u.col } : null;
        return cell ? { ability: '', targets: [u], source: src, move: cell } : { ability: '', targets: [u], source: src, defend: true };
      }
      case 'loyal': {
        const b = u.bonded !== null && units[u.bonded].alive ? units[u.bonded] : [...friends(u)].filter((x) => x !== u).sort(nearestSort(u))[0];
        if (b) {
          if (usable(u, 'guard') && !has(b, 'guarded')) return { ability: 'guard', targets: [b], source: src };
          const heal = u.abilities.find((id) => ABILITIES[id].kind === 'heal' && ABILITIES[id].aim !== 'self' && usable(u, id));
          if (heal && pct(b) < 0.7) return { ability: heal, targets: [b], source: src };
          const foe = b.lastHitBy !== null ? units[b.lastHitBy] : null;
          if (foe && foe.alive && enemyReach(u, ABILITIES[u.basic]).includes(foe)) return { ability: u.basic, targets: [foe], source: src };
        }
        return basicPlan(u, 'nearest', src);
      }
      case 'gloryseeker': {
        const best = u.abilities.filter((id) => ['physical', 'spell'].includes(ABILITIES[id].kind) && usable(u, id))
          .sort((a, b) => ABILITIES[b].power * (ABILITIES[b].hits ?? 1) - ABILITIES[a].power * (ABILITIES[a].hits ?? 1))[0];
        const t = best ? resolveTargets(u, best, 'highestHp', null) : null;
        return t ? { ability: best, targets: t, source: src } : basicPlan(u, 'highestHp', src);
      }
      case 'steady': {
        const r: Rule | undefined = u.rules[u.rules.length - 1];
        if (r) {
          const id = r.ability === 'attack' ? u.basic : r.ability;
          const t = usable(u, id) ? resolveTargets(u, id, r.target, null) : null;
          if (t) return { ability: id, targets: t, source: src };
        }
        return basicPlan(u, defaultPick(u), src);
      }
    }
  };

  // --------------------------------------------------------- execution --
  const kill = (t: Unit, by: Unit | null) => {
    t.alive = false;
    t.hp = 0;
    t.statuses = [];
    const r = stats.get(t.uid);
    if (r) r.alive = false;
    if (by) { const c = credit(by); if (c) c.kills++; }
    emit({ type: 'death', actor: t.uid, text: `${t.name} falls.` });
  };

  /** One hit of a damaging ability on one target. */
  const strike = (u: Unit, t: Unit, ab: AbilityDef, frac: number): Result => {
    if (ab.melee) t.meleeTargetedAt = tick;
    if (ab.kind === 'physical') {
      const hitChance = Math.max(50, Math.min(98, 85 + (eff(u, 'DEX') - eff(t, 'DEX')) / 4 + (capJob(u.side) === 'ranger' ? 5 : 0) - mag(t, 'evade')));
      if (!has(t, 'asleep') && rng.next() * 100 >= hitChance) return { target: t.uid, outcome: 'miss', hpAfter: t.hp };
    }
    const stat = ab.stat ?? (ab.kind === 'physical' ? 'STR' : 'INT');
    let dmg = ab.power * (eff(u, stat) / 50) * frac;
    const critChance = eff(u, 'DEX') / 10 + (u.trait === 'lucky' ? 5 : 0) + (capJob(u.side) === 'rogue' ? 3 : 0) + (ab.critBonus ?? 0);
    const crit = rng.next() * 100 < critChance;
    if (crit) dmg *= 1.5;
    // dealt
    dmg *= STANCE_DEALT[stance[u.side]] * (1 + mag(u, 'courage')) * (1 - mag(u, 'dissonance'));
    if (u.trait === 'berserker') dmg *= 1 + 0.5 * (1 - pct(u));
    if (ab.kind === 'physical' && capJob(u.side) === 'warrior') dmg *= 1.05;
    if (ab.kind === 'spell' && capJob(u.side) === 'mage') dmg *= 1.05;
    // taken
    dmg *= STANCE_TAKEN[stance[t.side]] * (1 + mag(t, 'marked')) * (1 - mag(t, 'shieldWall')) * (has(t, 'defending') ? 0.7 : 1);
    if (capJob(t.side) === 'paladin') dmg *= 0.95;
    if (!ab.melee && t.row === 2 && friends(t).some((x) => x.row === 0 && x.col === t.col)) dmg *= 0.85;
    if (ab.flank && t.col !== 1) dmg *= 1.25;
    dmg *= ab.kind === 'physical' ? 100 / (100 + armor(t)) : 100 / (100 + resist(t));
    let amount = Math.max(1, Math.round(dmg));
    // Guard: the guardian takes the blow
    let recv = t;
    const g = status(t, 'guarded');
    if (g && units[g.src].alive && units[g.src] !== t) recv = units[g.src];
    const shield = status(recv, 'shield');
    if (shield) {
      const soak = Math.min(shield.mag, amount);
      shield.mag -= soak;
      amount -= soak;
      if (shield.mag <= 0) recv.statuses = recv.statuses.filter((s) => s !== shield);
      if (amount <= 0) return { target: recv.uid, outcome: 'absorbed', amount: 0, hpAfter: recv.hp, redirectedFrom: recv !== t ? t.uid : undefined };
    }
    recv.hp = Math.max(0, recv.hp - amount);
    recv.lastHitBy = u.uid;
    recv.statuses = recv.statuses.filter((s) => s.id !== 'asleep');
    const c = credit(u); if (c) c.dealt += amount;
    const tr = stats.get(recv.uid); if (tr) tr.taken += amount;
    if (ab.lifesteal) healUnit(u, u, Math.round(amount * ab.lifesteal));
    if (recv.hp <= 0) kill(recv, u);
    return { target: recv.uid, outcome: crit ? 'crit' : 'hit', amount, hpAfter: recv.hp, redirectedFrom: recv !== t ? t.uid : undefined };
  };

  const healUnit = (u: Unit, t: Unit, amount: number) => {
    const real = Math.min(amount, t.maxHp - t.hp);
    t.hp += real;
    const c = credit(u); if (c) c.healed += real;
    return real;
  };

  const summonUnit = (u: Unit, kind: 'skeleton' | 'familiar'): Result[] => {
    const cell = freeCell(u.side, u.col)!;
    let type = 'skeleton', from: Unit | null = null;
    if (kind === 'skeleton') {
      from = units.filter((x) => !x.alive && !x.summon && !x.raised).sort((a, b) => b.ovr - a.ovr || a.uid - b.uid)[0];
      from.raised = true;
    } else type = rng.pick(FAMILIARS);
    const sd = SUMMONS[type];
    const boost = capJob(u.side) === 'summoner' ? 1.2 : 1;
    const v = Math.round((sd.base + eff(u, 'INT') * sd.scale) * boost);
    const base = Object.fromEntries(STATS.map((s) => [s, v])) as Stats;
    if (sd.tank) base.CON += 20;
    const s: Unit = {
      uid: units.length, side: u.side, heroId: null, name: from ? `${from.name}'s Skeleton` : `${u.name.split(' ')[0]}'s ${sd.name}`, job: 'summon',
      look: sd.look, base, roles: sd.tank ? ['tank', 'melee'] : ['melee'], basic: sd.basic, abilities: [sd.basic], rules: [], personality: null, trait: null,
      row: cell.row, col: cell.col, hp: 0, maxHp: Math.round((100 + base.CON * 5) * 0.5), mana: 0, maxMana: 0, gauge: 0, cd: {}, statuses: [],
      alive: true, summon: true, ovr: 0, actions: 0, bonded: null, lastHitBy: null, meleeTargetedAt: -1,
    };
    s.hp = s.maxHp;
    units.push(s);
    owner.set(s.uid, u.uid);
    emit({ type: 'summon', actor: u.uid, unit: info(s), side: u.side, text: `${u.name} ${from ? `raises ${from.name}` : 'calls'} — ${s.name} joins the fight.` });
    return [{ target: s.uid, outcome: 'status', hpAfter: s.hp }];
  };

  const perform = (u: Unit, plan: Plan) => {
    const src = plan.source;
    const r = stats.get(u.uid);
    if (r) {
      if (src.kind === 'rule') r.ruleFires[src.index]++;
      else if (src.kind === 'default') r.defaults++;
      else if (src.kind === 'disobey') r.disobeyed++;
    }
    const who = sourceText(u, src);
    if (plan.move) {
      u.row = plan.move.row; u.col = plan.move.col;
      emit({ type: 'move', actor: u.uid, source: src, text: `${u.name}${who} pulls back to the ${['front', 'middle', 'back'][u.row]} row.` });
      return;
    }
    if (plan.defend) {
      addStatus(u, 'defending', 1, 0.3, u);
      emit({ type: 'action', actor: u.uid, source: src, ability: 'defend', results: [{ target: u.uid, outcome: 'status', status: 'defending', hpAfter: u.hp }], text: `${u.name}${who} raises their guard.` });
      return;
    }
    const ab = ABILITIES[plan.ability];
    u.mana -= ab.cost;
    if (ab.cooldown) u.cd[plan.ability] = ab.cooldown + 1;   // +1: the end of this turn ticks it once
    const results: Result[] = [];
    if (ab.summon) results.push(...summonUnit(u, ab.summon));
    else if (ab.kind === 'physical' || ab.kind === 'spell') {
      plan.targets.forEach((t, i) => {
        const frac = ab.aim === 'enemyArea' && i > 0 ? ab.splash ?? 0.5 : 1;
        for (let h = 0; h < (ab.hits ?? 1); h++) {
          if (!t.alive) break;
          const res = strike(u, t, ab, frac);
          results.push(res);
          if (res.outcome !== 'miss' && t.alive) {
            if (ab.status) {
              const st = ab.status;
              const m = (st.mag ?? 0) * (st.id === 'poison' ? eff(u, 'STR') / 50 : 1);
              if (addStatus(t, st.id, st.turns, m, u)) results.push({ target: t.uid, outcome: 'status', status: st.id, hpAfter: t.hp });
            }
            if (ab.gauge) t.gauge = Math.max(0, t.gauge + ab.gauge);
          }
        }
      });
    } else if (ab.kind === 'heal') {
      const mult = capJob(u.side) === 'cleric' ? 1.05 : 1;
      for (const t of plan.targets) {
        if (ab.cleanse) t.statuses = t.statuses.filter((s) => !DEBUFFS.includes(s.id));
        const amt = healUnit(u, t, Math.round(ab.power * (eff(u, 'WIS') / 50) * mult));
        results.push({ target: t.uid, outcome: 'heal', amount: amt, hpAfter: t.hp });
        if (ab.status?.id === 'regrowth') addStatus(t, 'regrowth', ab.status.turns, Math.round(ab.power * (eff(u, 'WIS') / 50) * mult), u);
      }
    } else {
      for (const t of plan.targets) {
        if (ab.cleanse) { t.statuses = t.statuses.filter((s) => !DEBUFFS.includes(s.id)); results.push({ target: t.uid, outcome: 'status', hpAfter: t.hp }); }
        if (ab.gauge) { t.gauge = Math.max(0, t.gauge + ab.gauge); results.push({ target: t.uid, outcome: 'status', hpAfter: t.hp }); }
        const st = ab.status;
        if (!st) continue;
        if (st.chance !== undefined && rng.next() >= Math.max(0.2, Math.min(0.8, st.chance * eff(u, 'CHA') / 50))) {
          results.push({ target: t.uid, outcome: 'resist', status: st.id, hpAfter: t.hp });
          continue;
        }
        let m = st.mag ?? 0;
        if (['courage', 'inspired', 'dissonance', 'marked'].includes(st.id)) m *= eff(u, 'CHA') / 50;
        if (st.id === 'cursed') m *= eff(u, 'INT') / 50;
        if (st.id === 'shield') m = ab.power * (eff(u, ab.stat ?? 'INT') / 50);
        if (addStatus(t, st.id, st.turns, Math.round(m * 100) / 100, u)) results.push({ target: t.uid, outcome: 'status', status: st.id, hpAfter: t.hp });
        else results.push({ target: t.uid, outcome: 'resist', status: st.id, hpAfter: t.hp });
      }
    }
    emit({ type: 'action', actor: u.uid, source: src, ability: plan.ability, results, text: `${u.name}${who}: ${ab.name}${resultText(results, ab)}` });
  };

  const sourceText = (u: Unit, s: Source) =>
    s.kind === 'rule' ? ` (rule ${s.index + 1})` : s.kind === 'disobey' ? ` DISOBEYED (${PERSONALITIES[s.personality].name}: ${PERSONALITIES[s.personality].disobey})`
      : s.kind === 'stance' ? ` (${STANCE_NAME[s.stance]})` : u.summon ? '' : ' (default attack)';
  const resultText = (rs: Result[], ab: AbilityDef) => {
    const parts = rs.map((r) => {
      const t = units[r.target];
      const hp = `${Math.round((100 * r.hpAfter) / t.maxHp)}%`;
      const guard = r.redirectedFrom !== undefined ? ` (guarding ${units[r.redirectedFrom].name})` : '';
      switch (r.outcome) {
        case 'miss': return `missed ${t.name}`;
        case 'hit': return `${t.name} −${r.amount}${guard} (${hp})`;
        case 'crit': return `CRIT ${t.name} −${r.amount}${guard} (${hp})`;
        case 'absorbed': return `${t.name}'s shield absorbs it${guard}`;
        case 'heal': return `${t.name} +${r.amount} (${hp})`;
        case 'resist': return `${t.name} resists${r.status ? ` ${r.status}` : ''}`;
        case 'status': return r.status ? `${t.name} ${r.status}` : t.name;
      }
    });
    return parts.length && !ab.summon ? ` → ${parts.join(', ')}` : '';
  };

  // ------------------------------------------------------- contingencies --
  const checkContingencies = () => {
    for (const side of [0, 1] as Side[]) {
      const list: Contingency[] = (parties[side].contingencies ?? []).slice(0, 3);
      list.forEach((c, i) => {
        if (fired[side][i]) return;
        const heroes = units.filter((u) => u.side === side && !u.summon);
        let hit = false;
        const w = c.when;
        if (w.type === 'falls') {
          if (w.who === 'captain') hit = !units[captainUid[side]].alive;
          else if (w.who === 'anyHealer') hit = heroes.some((u) => !u.alive && u.roles.includes('healer'));
          else hit = heroes.some((u) => u.heroId === w.who && !u.alive);
        } else if (w.type === 'bossHpBelow') {
          const boss = units[bossUid[(1 - side) as Side]];
          hit = !boss.alive || pct(boss) * 100 < w.pct;
        } else if (w.type === 'downTo') hit = heroes.filter((u) => u.alive).length <= w.n;
        if (!hit) return;
        fired[side][i] = true;
        if ('stance' in c.then) {
          stance[side] = c.then.stance;
          emit({ type: 'contingency', side, text: `${parties[side].name}: contingency ${i + 1} — switching to ${STANCE_NAME[c.then.stance]}.` });
        } else {
          for (const u of heroes.filter((x) => x.alive).sort((a, b) => b.row - a.row)) {
            for (const row of [2, 1]) {
              if (u.row >= row) break;
              if (!friends(u).some((x) => x.row === row && x.col === u.col)) { u.row = row; break; }
            }
          }
          emit({ type: 'contingency', side, text: `${parties[side].name}: contingency ${i + 1} — everyone falls back.` });
        }
      });
    }
  };

  // ------------------------------------------------------------- a turn --
  const takeTurn = (u: Unit) => {
    // damage and healing over time
    for (const s of [...u.statuses]) {
      if (!u.alive) break;
      if (s.id === 'poison' || s.id === 'cursed') {
        const amt = Math.max(1, Math.round(s.mag));
        u.hp = Math.max(0, u.hp - amt);
        const c = credit(units[s.src]); if (c) c.dealt += amt;
        const tr = stats.get(u.uid); if (tr) tr.taken += amt;
        emit({ type: 'dot', actor: u.uid, results: [{ target: u.uid, outcome: 'hit', amount: amt, hpAfter: u.hp }], text: `${u.name} suffers ${amt} from ${s.id === 'poison' ? 'poison' : 'the curse'}.` });
        if (u.hp <= 0) kill(u, units[s.src]);
      } else if (s.id === 'regrowth') {
        const amt = healUnit(units[s.src], u, Math.round(s.mag));
        if (amt) emit({ type: 'hot', actor: u.uid, results: [{ target: u.uid, outcome: 'heal', amount: amt, hpAfter: u.hp }], text: `${u.name} regrows ${amt} HP.` });
      }
    }
    if (u.alive) {
      if (has(u, 'asleep')) {
        u.statuses = u.statuses.filter((s) => s.id !== 'asleep');
        emit({ type: 'skip', actor: u.uid, text: `${u.name} is asleep and loses the turn.` });
      } else {
        let plan: Plan | null = null;
        if (u.summon) plan = basicPlan(u, 'nearest', { kind: 'default' });
        else {
          plan = protectPlan(u);
          if (!plan && u.personality && rng.next() * 100 >= discipline(u)) plan = disobeyPlan(u);
          plan ??= planFromRules(u);
          plan ??= basicPlan(u, defaultPick(u), { kind: 'default' });
        }
        if (plan) perform(u, plan);
      }
    }
    // end of turn
    u.actions++;
    lastActedAt.set(u.uid, tick);
    u.mana = Math.min(u.maxMana, u.mana + 5);
    for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k]--;
    u.statuses = u.statuses.filter((s) => --s.turns > 0);
    checkContingencies();
  };

  // --------------------------------------------------------- main loop --
  const cap = opts.tickCap ?? TICK_CAP;
  emit({ type: 'start', text: `${partyA.name} (${STANCE_NAME[partyA.stance]}) vs ${partyB.name} (${STANCE_NAME[partyB.stance]}).` });
  const over = () => !alive(0).length || !alive(1).length;
  while (!over() && tick < cap) {
    tick++;
    for (const u of units) if (u.alive) u.gauge += speed(u);
    const ready = units.filter((u) => u.alive && u.gauge >= GAUGE_FULL)
      .map((u) => ({ u, coin: rng.next() }))
      .sort((a, b) => b.u.gauge - a.u.gauge || eff(b.u, 'DEX') - eff(a.u, 'DEX') || a.coin - b.coin)
      .map((x) => x.u);
    for (const u of ready) {
      if (!u.alive || over()) continue;
      u.gauge = 0;
      takeTurn(u);
    }
  }

  // ------------------------------------------------------------ result --
  const hpLeft = ([0, 1] as Side[]).map((side) => {
    const hs = units.filter((u) => u.side === side && !u.summon);
    return hs.reduce((t, u) => t + u.hp, 0) / hs.reduce((t, u) => t + u.maxHp, 0);
  }) as [number, number];
  let winner: Side | 'draw';
  let reason: 'wipe' | 'tickCap' = 'wipe';
  if (!alive(1).length && alive(0).length) winner = 0;
  else if (!alive(0).length && alive(1).length) winner = 1;
  else {
    reason = 'tickCap';
    winner = hpLeft[0] > hpLeft[1] ? 0 : hpLeft[1] > hpLeft[0] ? 1 : 'draw';
  }
  emit({ type: 'end', text: winner === 'draw' ? 'The battle ends in a draw.'
    : `${parties[winner].name} wins${reason === 'tickCap' ? ' on remaining HP (time ran out)' : ''}.` });

  const heroes = [...stats.values()].filter((r) => !units[r.uid].summon);
  const score = (r: HeroReport) => r.dealt + 1.5 * r.healed + 0.5 * r.taken + 30 * r.kills;
  const pool = heroes.filter((r) => winner === 'draw' || r.side === winner);
  const mvp = pool.length ? pool.sort((a, b) => score(b) - score(a) || a.uid - b.uid)[0].uid : null;
  return { seed, winner, reason, ticks: tick, units: startUnits, events, report: { heroes, mvp, hpLeft } };
}
