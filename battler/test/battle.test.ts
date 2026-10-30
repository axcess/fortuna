import { describe, expect, it } from 'vitest';
import { runBattle } from '../src/engine/battle/battle.ts';
import { makeParty } from '../src/engine/battle/party.ts';
import { ballad } from '../src/engine/battle/report.ts';
import { scout } from '../src/engine/battle/scout.ts';
import type { Party, Rule } from '../src/engine/battle/types.ts';
import { generateHero } from '../src/engine/hero.ts';
import type { Hero, JobId } from '../src/engine/types.ts';

const team = (base: number, jobs: JobId[]) => jobs.map((job, i) => generateHero(base + i, { job }));
/** A hero that always follows orders and has no trait, so tests are about the rules. */
const obedient = (h: Hero): Hero => ({ ...h, personality: 'steady', trait: null, stats: { ...h.stats, WIS: 99 }, rank: 'S' });
const std = () => [
  makeParty('A', team(100, ['warrior', 'cleric', 'mage', 'ranger', 'bard'])),
  makeParty('B', team(200, ['paladin', 'rogue', 'necromancer', 'druid', 'monk']), { stance: 'aggressive' }),
] as const;

describe('determinism and termination', () => {
  it('gives an identical log for the same seed and inputs', () => {
    const [a, b] = std();
    expect(runBattle(7, a, b)).toEqual(runBattle(7, a, b));
  });
  it('varies with the seed', () => {
    const [a, b] = std();
    expect(runBattle(7, a, b).events).not.toEqual(runBattle(8, a, b).events);
  });
  it('always ends, with a defined winner on the tick cap', () => {
    for (let s = 0; s < 40; s++) {
      const a = makeParty('A', team(s * 10, ['paladin', 'cleric', 'druid', 'paladin', 'cleric']), { stance: 'defensive' });
      const b = makeParty('B', team(s * 10 + 5, ['paladin', 'cleric', 'druid', 'paladin', 'cleric']), { stance: 'defensive' });
      const r = runBattle(s, a, b, { tickCap: 400 });
      expect(r.ticks).toBeLessThanOrEqual(400);
      if (r.reason === 'tickCap') expect(r.winner === 'draw' || r.report.hpLeft[r.winner] >= r.report.hpLeft[1 - r.winner]).toBe(true);
    }
  });
});

describe('the event log', () => {
  it('attributes every action to a rule, a default attack, a stance or disobedience', () => {
    for (let s = 0; s < 20; s++) {
      const [a, b] = std();
      const r = runBattle(s, a, b);
      for (const e of r.events.filter((x) => x.type === 'action' || x.type === 'move')) {
        expect(e.source, e.text).toBeDefined();
        if (e.source!.kind === 'rule') expect(e.text).toContain(`(rule ${e.source!.index + 1})`);
        if (e.source!.kind === 'disobey') expect(e.text).toContain('DISOBEYED');
      }
    }
  });
});

describe('tactics', () => {
  it('fires a heal rule once an ally drops below the threshold', () => {
    const healer = obedient(generateHero(1, { job: 'cleric' }));
    const tank = obedient(generateHero(2, { job: 'warrior' }));
    const a = makeParty('A', [tank, healer]);
    const heal: Rule = { when: { type: 'allyHpBelow', pct: 80 }, ability: 'heal', target: 'lowestHpPct' };
    a.rules[healer.id] = [heal];
    const b = makeParty('B', team(300, ['rogue', 'rogue', 'monk']), { stance: 'aggressive' });
    const r = runBattle(3, a, b);
    const heals = r.events.filter((e) => e.actor === r.units.find((u) => u.heroId === healer.id)!.uid && e.ability === 'heal');
    expect(heals.length).toBeGreaterThan(0);
    for (const e of heals) expect(e.source).toMatchObject({ kind: 'rule', index: 0 });
  });

  it('lets melee reach only the front-most living row', () => {
    for (let seed = 0; seed < 10; seed++) {
      const [a, b] = std();
      for (const p of [a, b]) p.heroes = p.heroes.map((h) => ({ ...h, personality: 'steady' }));   // nobody steps back
      const r = runBattle(seed, a, b);
      const row = new Map(r.units.map((u) => [u.uid, u.row]));
      const side = new Map(r.units.map((u) => [u.uid, u.side]));
      const dead = new Set<number>();
      for (const e of r.events) {
        if (e.type === 'summon' && e.unit) { row.set(e.unit.uid, e.unit.row); side.set(e.unit.uid, e.unit.side); }
        if (e.type === 'death') dead.add(e.actor!);
        if (!['strike', 'smite', 'stab', 'palm', 'mace', 'cutlass', 'cleave'].includes(e.ability ?? '')) continue;
        for (const res of e.results ?? []) {
          if (res.redirectedFrom !== undefined || res.outcome === 'status') continue;
          const s = side.get(res.target);
          const front = Math.min(...[...row].filter(([u]) => side.get(u) === s && (!dead.has(u) || u === res.target)).map(([, rw]) => rw));
          expect(row.get(res.target), e.text).toBe(front);
        }
      }
    }
  });

  it('makes enemies attack a taunting unit', () => {
    const tank = obedient(generateHero(5, { job: 'warrior' }));
    const a = makeParty('A', [tank, ...team(400, ['mage', 'cleric'])]);
    a.rules[tank.id] = [{ when: { type: 'always' }, ability: 'taunt', target: 'self' }];
    const b = makeParty('B', team(500, ['ranger', 'ranger']).map(obedient));
    for (const h of b.heroes) b.rules[h.id] = [{ when: { type: 'always' }, ability: 'attack', target: 'lowestHp' }];
    const r = runBattle(5, a, b);
    const tankUid = r.units.find((u) => u.heroId === tank.id)!.uid;
    const tauntAt = r.events.find((e) => e.ability === 'taunt')!.seq;
    const shots = r.events.filter((e) => e.seq > tauntAt && e.ability === 'shot').slice(0, 2);
    for (const e of shots) expect(e.results![0].target).toBe(tankUid);
  });

  it('fires each contingency once', () => {
    const [a, b] = std();
    a.contingencies = [{ when: { type: 'downTo', n: 4 }, then: { stance: 'defensive' } }];
    b.contingencies = [{ when: { type: 'bossHpBelow', pct: 99 }, then: { stance: 'focus' } }];
    const r = runBattle(4, a, b);
    expect(r.events.filter((e) => e.type === 'contingency' && e.side === 1).length).toBe(1);
    expect(r.events.filter((e) => e.type === 'contingency' && e.side === 0).length).toBeLessThanOrEqual(1);
  });

  it('caps rules at the rank’s slot count', () => {
    const h = { ...generateHero(9, { job: 'warrior' }), rank: 'E' as const };
    const a: Party = makeParty('A', [h]);
    a.rules[h.id] = Array.from({ length: 6 }, () => ({ when: { type: 'always' as const }, ability: 'attack', target: 'nearest' as const }));
    const r = runBattle(1, a, makeParty('B', team(600, ['mage'])));
    expect(r.report.heroes.find((x) => x.side === 0)!.ruleFires.length).toBe(2);
  });
});

describe('scouting and the ballad', () => {
  it('reveals 2 enemies plus one per ranger, bard or druid', () => {
    const [a, b] = std();    // A has a ranger and a bard
    expect(scout(1, a, b).revealed.length).toBe(4);
    expect(scout(1, b, a).revealed.length).toBe(3);   // B has a druid
  });
  it('shows rules only for a fully revealed boss fight', () => {
    const [a, b] = std();
    b.boss = b.heroes[0].id;
    const strong = makeParty('S', team(700, ['ranger', 'ranger', 'bard', 'bard', 'druid']));
    expect(scout(1, strong, b).revealed.every((u) => u.rules)).toBe(true);
    expect(scout(1, a, b).revealed.some((u) => u.rules)).toBe(false);
  });
  it('lets a party with a bard read the battle as a ballad', () => {
    const [a, b] = std();
    const r = runBattle(2, a, b);
    expect(ballad(r, 0)?.join(' ')).toMatch(/Hear now/);
    expect(ballad(r, 1)).toBeNull();
  });
});

describe('balance sanity (small sample)', () => {
  it('has no side bias and few unfinished battles', async () => {
    const { makeRng, mixSeed } = await import('../src/engine/rng.ts');
    let a = 0, n = 0, capped = 0;
    for (let i = 0; i < 300; i++) {
      const rng = makeRng(mixSeed(5, i));
      const mk = (name: string) => makeParty(name, Array.from({ length: 5 }, () => generateHero(rng.seed())));
      const r = runBattle(rng.seed(), mk('A'), mk('B'));
      if (r.reason === 'tickCap') capped++;
      if (r.winner !== 'draw') { n++; if (r.winner === 0) a++; }
    }
    expect(a / n).toBeGreaterThan(0.42);
    expect(a / n).toBeLessThan(0.58);
    expect(capped / 300).toBeLessThan(0.05);
  });
});
