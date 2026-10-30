import { JOB_DEFS } from '../data/jobs.ts';
import { makeRng } from '../rng.ts';
import type { JobId, Rank } from '../types.ts';
import { RULE_SLOTS } from './rules.ts';
import type { Party, Rule, Slot } from './types.ts';

export interface ScoutedUnit { heroId: string; job: JobId; rank: Rank; slot: Slot; rules?: Rule[] }
export interface ScoutReport { revealed: ScoutedUnit[]; total: number; full: boolean }

/**
 * What you see of the enemy before battle: 2 units, +1 per Ranger, Bard or Druid
 * in your party. A boss fight that is fully revealed also shows the enemy's rules.
 */
export function scout(seed: number, own: Party, enemy: Party): ScoutReport {
  const count = 2 + own.heroes.reduce((t, h) => t + JOB_DEFS[h.job].scout, 0);
  const order = makeRng(seed).shuffle(enemy.heroes);
  const shown = order.slice(0, count);
  const full = shown.length >= enemy.heroes.length;
  return {
    total: enemy.heroes.length,
    full,
    revealed: shown.map((h) => ({
      heroId: h.id, job: h.job, rank: h.rank, slot: enemy.formation[h.id],
      rules: full && enemy.boss ? (enemy.rules[h.id] ?? []).slice(0, RULE_SLOTS[h.rank]) : undefined,
    })),
  };
}
