import { JOB_DEFS } from './data/jobs.ts';
import { BREAKOUT_CHANCE, FIRST, TALENT, LAST, PERSONALITIES, POTENTIAL_SHIFT, TIER_RANGES, TRAIT_CHANCE, TRAITS } from './data/heroes.ts';
import { makeRng, type Rng } from './rng.ts';
import { JOBS, RANKS, STATS, type Hero, type JobId, type PersonalityId, type Rank, type StatKey, type Stats, type TraitId } from './types.ts';

export type Tier = 'primary' | 'secondary' | 'off';

/**
 * Tiers come from the job's weights: the top 2 weighted stats are primary, the
 * next 2 secondary, the last 2 off-stats. Tiebreak: equal weights keep the
 * order of STATS (STR, DEX, CON, INT, WIS, CHA), so the earlier stat ranks higher.
 */
export function tiersFor(job: JobId): Record<StatKey, Tier> {
  const w = JOB_DEFS[job].weights;
  const order = [...STATS].sort((a, b) => w[b] - w[a] || STATS.indexOf(a) - STATS.indexOf(b));
  const out = {} as Record<StatKey, Tier>;
  order.forEach((s, i) => { out[s] = i < 2 ? 'primary' : i < 4 ? 'secondary' : 'off'; });
  return out;
}

/** OVR = sum(stat × weight) + trait bonus, rounded. */
export function ovrFor(stats: Stats, job: JobId, trait: TraitId | null = null): number {
  const w = JOB_DEFS[job].weights;
  let sum = 0;
  for (const s of STATS) sum += stats[s] * w[s];
  // round away float noise first (73.2 must not become 73.19999)
  return Math.round(Math.round(sum * 1e6) / 1e6 + (trait ? TRAITS[trait].ovr : 0));
}

export function rankFor(ovr: number): Rank {
  return ovr >= 90 ? 'S' : ovr >= 80 ? 'A' : ovr >= 70 ? 'B' : ovr >= 60 ? 'C' : ovr >= 50 ? 'D' : 'E';
}

/** Bell curve: the average of 3 uniform rolls in [min, max]. */
function bell(rng: Rng, min: number, max: number): number {
  const u = (rng.next() + rng.next() + rng.next()) / 3;
  return Math.round(min + u * (max - min));
}

function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((t, [, w]) => t + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of items) { if ((r -= w) < 0) return v; }
  return items[items.length - 1][0];
}

export interface HeroOptions { job?: JobId }

/** Generate a hero. The same seed (and options) always gives the same hero. */
export function generateHero(seed: number, opts: HeroOptions = {}): Hero {
  const rng = makeRng(seed);
  const job = opts.job ?? rng.pick(JOBS);
  const tiers = tiersFor(job);
  const talent = bell(rng, -TALENT, TALENT);
  const stats = {} as Stats;
  for (const s of STATS) { const [lo, hi] = TIER_RANGES[tiers[s]]; stats[s] = Math.max(1, Math.min(99, bell(rng, lo, hi) + talent)); }
  let breakout: StatKey | null = null;
  if (rng.chance(BREAKOUT_CHANCE)) {
    breakout = rng.pick(STATS);
    stats[breakout] = Math.min(99, stats[breakout] + rng.int(10, 20));
  }
  const trait: TraitId | null = rng.chance(TRAIT_CHANCE) ? rng.pick(Object.keys(TRAITS) as TraitId[]) : null;
  const personality = rng.pick(Object.keys(PERSONALITIES) as PersonalityId[]);
  const ovr = ovrFor(stats, job, trait);
  const rank = rankFor(ovr);
  const shift = weighted(rng, POTENTIAL_SHIFT);
  const potential = RANKS[Math.max(0, Math.min(RANKS.length - 1, RANKS.indexOf(rank) + shift))];
  const ovrByJob = {} as Record<JobId, number>;
  for (const j of JOBS) ovrByJob[j] = ovrFor(stats, j, trait);
  const looks = JOB_DEFS[job].looks;
  return {
    id: `h${seed.toString(36)}`,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    job, stats, ovr, rank, ovrByJob, trait, personality, potential, breakout, seed,
    look: looks.length ? rng.pick(looks) : null,
  };
}

/** The job this hero would score highest in (a "hidden gem" when it isn't their own). */
export function bestFit(hero: Hero): JobId {
  return [...JOBS].sort((a, b) => hero.ovrByJob[b] - hero.ovrByJob[a])[0];
}
