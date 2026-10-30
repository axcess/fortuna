import { describe, expect, it } from 'vitest';
import { bestFit, generateHero, ovrFor, rankFor, tiersFor } from '../src/engine/hero.ts';
import { makeRng } from '../src/engine/rng.ts';
import { JOBS } from '../src/engine/types.ts';

describe('OVR and rank', () => {
  it('matches the handoff worked example (Rogue → 73, B)', () => {
    const stats = { STR: 52, DEX: 94, CON: 61, INT: 58, WIS: 47, CHA: 70 };
    expect(ovrFor(stats, 'rogue')).toBe(73);
    expect(rankFor(73)).toBe('B');
  });
  it('uses fixed cutoffs', () => {
    expect([95, 90, 89, 80, 79, 70, 69, 60, 59, 50, 49, 10].map(rankFor).join(''))
      .toBe('SSAABBCCDDEE');
  });
  it('adds the trait bonus', () => {
    const stats = { STR: 52, DEX: 94, CON: 61, INT: 58, WIS: 47, CHA: 70 };
    expect(ovrFor(stats, 'rogue', 'berserker')).toBe(76);
  });
});

describe('tiers', () => {
  it('takes the top two weights as primary and breaks ties by stat order', () => {
    const t = tiersFor('rogue');   // DEX .40, then STR/CON/CHA tied at .15
    expect(t.DEX).toBe('primary');
    expect(t.STR).toBe('primary');
    expect(t.CON).toBe('secondary');
    expect(t.CHA).toBe('secondary');
    expect(t.INT).toBe('off');
    expect(t.WIS).toBe('off');
  });
});

describe('generateHero', () => {
  it('is deterministic for a seed', () => {
    expect(generateHero(42)).toEqual(generateHero(42));
    expect(generateHero(42)).not.toEqual(generateHero(43));
  });
  it('keeps stats in 1..99 and stores OVR for every job', () => {
    for (let i = 0; i < 2000; i++) {
      const h = generateHero(i);
      for (const v of Object.values(h.stats)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(99); }
      expect(Object.keys(h.ovrByJob).sort()).toEqual([...JOBS].sort());
      expect(h.ovrByJob[h.job]).toBe(h.ovr);
      expect(h.rank).toBe(rankFor(h.ovr));
      expect(h.ovrByJob[bestFit(h)]).toBeGreaterThanOrEqual(h.ovr);
    }
  });
  it('honours a requested job', () => {
    expect(generateHero(7, { job: 'monk' }).job).toBe('monk');
  });
  it('rolls breakouts about 3% of the time', () => {
    let n = 0;
    for (let i = 0; i < 20000; i++) if (generateHero(i).breakout) n++;
    expect(n / 20000).toBeGreaterThan(0.02);
    expect(n / 20000).toBeLessThan(0.04);
  });
});

describe('rng', () => {
  it('is reproducible', () => {
    const a = makeRng(9), b = makeRng(9);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});
