import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/engine/data/abilities.ts';
import { JOB_DEFS } from '../src/engine/data/jobs.ts';
import { runBattle } from '../src/engine/battle/battle.ts';
import { makeParty } from '../src/engine/battle/party.ts';
import { autoPick, autoPlan } from '../src/engine/battle/planner.ts';
import { RULE_SLOTS } from '../src/engine/battle/rules.ts';
import { scout } from '../src/engine/battle/scout.ts';
import { generateHero } from '../src/engine/hero.ts';
import { makeRng, mixSeed } from '../src/engine/rng.ts';

const five = (i: number) => { const rng = makeRng(mixSeed(31, i)); return Array.from({ length: 5 }, () => generateHero(rng.seed())); };

describe('autoPlan', () => {
  it('always produces a legal plan', () => {
    for (let i = 0; i < 300; i++) {
      const heroes = five(i);
      const p = autoPlan(heroes, scout(i, makeParty('a', heroes), makeParty('b', five(i + 1000))));
      const cells = heroes.map((h) => `${p.formation[h.id].row},${p.formation[h.id].col}`);
      expect(new Set(cells).size).toBe(5);
      expect(heroes.map((h) => h.id)).toContain(p.captain);
      expect(p.contingencies.length).toBeLessThanOrEqual(3);
      for (const h of heroes) {
        expect(p.rules[h.id].length).toBeLessThanOrEqual(RULE_SLOTS[h.rank]);
        for (const r of p.rules[h.id]) if (r.ability !== 'attack') expect(JOB_DEFS[h.job].abilities, ABILITIES[r.ability].name).toContain(r.ability);
      }
    }
  });
  it('is deterministic', () => {
    const h = five(3);
    expect(autoPlan(h)).toEqual(autoPlan(h));
  });
  it('beats the presets with the same heroes', () => {
    let w = 0, n = 0;
    for (let i = 0; i < 240; i++) {
      const heroes = five(i);
      const preset = makeParty('Preset', heroes);
      const planned = { name: 'Planned', heroes, ...autoPlan(heroes, scout(i, preset, preset)) };
      const swap = i % 2 === 1;
      const r = swap ? runBattle(i, preset, planned) : runBattle(i, planned, preset);
      if (r.winner === 'draw') continue;
      n++; if (r.winner === (swap ? 1 : 0)) w++;
    }
    expect(w / n).toBeGreaterThan(0.58);
  });
});

describe('autoPick', () => {
  it('makes room for a tank and a healer when they are close in strength', () => {
    const pool = Array.from({ length: 40 }, (_, i) => generateHero(mixSeed(8, i)));
    const { heroes } = autoPick(pool);
    expect(heroes.length).toBe(5);
    expect(heroes.some((h) => JOB_DEFS[h.job].roles.includes('tank')) || !pool.some((h) => JOB_DEFS[h.job].roles.includes('tank'))).toBe(true);
  });
});
