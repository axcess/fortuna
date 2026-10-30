import { JOB_DEFS } from '../data/jobs.ts';
import type { Hero } from '../types.ts';
import { defaultRules } from './rules.ts';
import type { Contingency, Party, Slot, Stance } from './types.ts';

/** Front row for tanks and melee, back row for casters and ranged; fill the centre column first. */
export function autoFormation(heroes: Hero[]): Record<string, Slot> {
  const pref = (h: Hero) => {
    const r = JOB_DEFS[h.job].roles;
    return r.includes('tank') ? 0 : r.includes('melee') ? 0.5 : r.includes('healer') ? 2 : r.includes('caster') ? 2 : 1.5;
  };
  const order = [...heroes].sort((a, b) => pref(a) - pref(b) || b.ovr - a.ovr);
  const taken = new Set<string>();
  const out: Record<string, Slot> = {};
  for (const h of order) {
    const want = Math.round(pref(h));
    const rows = [want, ...[0, 1, 2].filter((r) => r !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];
    place: for (const row of rows) for (const col of [1, 0, 2]) {
      const k = `${row},${col}`;
      if (!taken.has(k)) { taken.add(k); out[h.id] = { row: row as Slot['row'], col: col as Slot['col'] }; break place; }
    }
  }
  return out;
}

export interface PartyOptions { stance?: Stance; captain?: string; contingencies?: Contingency[]; formation?: Record<string, Slot> }

/** A ready-to-fight party with default rules per job; the highest-CHA hero captains unless told otherwise. */
export function makeParty(name: string, heroes: Hero[], o: PartyOptions = {}): Party {
  return {
    name, heroes,
    formation: o.formation ?? autoFormation(heroes),
    captain: o.captain ?? [...heroes].sort((a, b) => b.stats.CHA - a.stats.CHA)[0].id,
    stance: o.stance ?? 'balanced',
    rules: Object.fromEntries(heroes.map((h) => [h.id, defaultRules(h)])),
    contingencies: o.contingencies ?? [],
  };
}
