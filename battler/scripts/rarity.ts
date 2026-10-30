// Generate N heroes and print the rank distribution overall and per job.
// Usage: node scripts/rarity.ts [count]
import { generateHero } from '../src/engine/hero.ts';
import { mixSeed } from '../src/engine/rng.ts';
import { JOBS, RANKS, type Rank } from '../src/engine/types.ts';

const N = Number(process.argv[2] ?? 100_000);
const TARGET: Record<Rank, number> = { S: 2, A: 10, B: 25, C: 30, D: 20, E: 13 };
const order = [...RANKS].reverse();
const all: Record<string, number> = {};
const byJob: Record<string, Record<string, number>> = {};
let breakouts = 0, gems = 0;
for (let i = 0; i < N; i++) {
  const h = generateHero(mixSeed(1234, i));
  all[h.rank] = (all[h.rank] ?? 0) + 1;
  (byJob[h.job] ??= {})[h.rank] = (byJob[h.job][h.rank] ?? 0) + 1;
  if (h.breakout) breakouts++;
  if (Math.max(...Object.values(h.ovrByJob)) > h.ovr) gems++;
}
const pct = (n: number | undefined, d: number) => (100 * (n ?? 0) / d).toFixed(1).padStart(5);
console.log(`${N} heroes`);
console.log('rank  actual  target  diff');
let worst = 0;
for (const r of order) {
  const a = 100 * (all[r] ?? 0) / N, d = a - TARGET[r];
  worst = Math.max(worst, Math.abs(d));
  console.log(`  ${r}   ${a.toFixed(1).padStart(5)}%  ${String(TARGET[r]).padStart(4)}%  ${d >= 0 ? '+' : ''}${d.toFixed(1)}`);
}
console.log(`worst deviation: ${worst.toFixed(1)} points (${worst <= 3 ? 'within' : 'OUTSIDE'} the ±3 target)`);
console.log(`breakouts ${pct(breakouts, N)}%   hidden gems (better fit elsewhere) ${pct(gems, N)}%`);
console.log('\njob          ' + order.map((r) => `   ${r}  `).join(''));
for (const j of JOBS) {
  const t = Object.values(byJob[j] ?? {}).reduce((a, b) => a + b, 0);
  console.log(j.padEnd(12) + order.map((r) => pct(byJob[j]?.[r], t) + '%').join(' '));
}
