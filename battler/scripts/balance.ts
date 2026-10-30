// Balance harness. Usage: node scripts/balance.ts [battles]
import { runBattle } from '../src/engine/battle/battle.ts';
import { makeParty } from '../src/engine/battle/party.ts';
import type { Party, Slot, Stance } from '../src/engine/battle/types.ts';
import { generateHero } from '../src/engine/hero.ts';
import { makeRng, mixSeed } from '../src/engine/rng.ts';
import { JOBS, RANKS, type Hero, type JobId, type Rank } from '../src/engine/types.ts';

const N = Number(process.argv[2] ?? 3000);
const STANCES: Stance[] = ['aggressive', 'balanced', 'defensive', 'focus', 'protect'];
const tally = () => ({ w: 0, n: 0 });
const rate = (t: { w: number; n: number }) => (t.n ? (100 * t.w / t.n).toFixed(1) : '  - ').padStart(5) + '%';

/** A hero of the given job and rank (searches seeds deterministically). */
export function heroOf(job: JobId, rank: Rank, base: number): Hero {
  for (let i = 0; ; i++) { const h = generateHero(mixSeed(base, i), { job }); if (h.rank === rank) return h; }
}

// ------------------------------------------------------------ random parties --
const byJob: Record<string, ReturnType<typeof tally>> = {};
const byRank: Record<string, ReturnType<typeof tally>> = {};
const byStance: Record<string, ReturnType<typeof tally>> = {};
const side0 = tally();
let draws = 0, capped = 0, ticks = 0;
for (let i = 0; i < N; i++) {
  const rng = makeRng(mixSeed(99, i));
  const mk = (name: string) => makeParty(name, Array.from({ length: 5 }, () => generateHero(rng.seed())), { stance: rng.pick(STANCES) });
  const a = mk('A'), b = mk('B');
  const r = runBattle(rng.seed(), a, b);
  ticks += r.ticks;
  if (r.reason === 'tickCap') capped++;
  if (r.winner === 'draw') { draws++; continue; }
  side0.n++; if (r.winner === 0) side0.w++;
  [a, b].forEach((p, side) => {
    const won = r.winner === side ? 1 : 0;
    const st = (byStance[p.stance] ??= tally()); st.n++; st.w += won;
    for (const h of p.heroes) {
      const j = (byJob[h.job] ??= tally()); j.n++; j.w += won;
      const k = (byRank[h.rank] ??= tally()); k.n++; k.w += won;
    }
  });
}
console.log(`${N} random 5v5 battles · draws ${(100 * draws / N).toFixed(1)}% · hit tick cap ${(100 * capped / N).toFixed(1)}% · avg ${Math.round(ticks / N)} ticks`);
console.log(`side A wins ${rate(side0)} (should be ~50%)\n`);
console.log('win rate by job (per hero fielded)');
for (const j of [...JOBS].sort((x, y) => byJob[y].w / byJob[y].n - byJob[x].w / byJob[x].n)) console.log(`  ${j.padEnd(12)} ${rate(byJob[j])}`);
console.log('\nwin rate by rank');
for (const k of [...RANKS].reverse()) console.log(`  ${k}  ${rate(byRank[k] ?? tally())}`);
console.log('\nwin rate by stance');
for (const s of STANCES) console.log(`  ${s.padEnd(11)} ${rate(byStance[s])}`);

// ------------------------------------------------------------ counter triangle --
type Arch = { name: string; jobs: JobId[]; stance: Stance; slots: Slot[] };
const F = (row: 0 | 1 | 2, col: 0 | 1 | 2): Slot => ({ row, col });
const ARCH: Record<string, Arch> = {
  frontline: { name: 'Front line', jobs: ['warrior', 'paladin', 'warrior', 'cleric', 'druid'], stance: 'protect', slots: [F(0, 0), F(0, 1), F(0, 2), F(2, 1), F(2, 0)] },
  rush:      { name: 'Rush', jobs: ['monk', 'warrior', 'monk', 'rogue', 'bard'], stance: 'aggressive', slots: [F(0, 0), F(0, 1), F(0, 2), F(1, 1), F(1, 0)] },
  casters:   { name: 'Back-line casters', jobs: ['paladin', 'mage', 'mage', 'necromancer', 'alchemist'], stance: 'balanced', slots: [F(0, 1), F(2, 0), F(2, 2), F(2, 1), F(1, 1)] },
  divers:    { name: 'Divers', jobs: ['rogue', 'rogue', 'rogue', 'ranger', 'bard'], stance: 'focus', slots: [F(0, 0), F(1, 1), F(0, 2), F(2, 1), F(2, 0)] },
};
const build = (key: string, base: number): Party => {
  const a = ARCH[key];
  const heroes = a.jobs.map((j, i) => heroOf(j, 'B', mixSeed(base, i)));
  return makeParty(a.name, heroes, { stance: a.stance, formation: Object.fromEntries(heroes.map((h, i) => [h.id, a.slots[i]])) });
};
const M = Math.max(100, Math.round(N / 10));
const vs = (x: string, y: string) => {
  const t = tally();
  for (let i = 0; i < M; i++) {
    const p = build(x, mixSeed(1000 + i, 1)), q = build(y, mixSeed(2000 + i, 2));
    const swap = i % 2 === 1;   // alternate sides
    const r = swap ? runBattle(i, q, p) : runBattle(i, p, q);
    if (r.winner === 'draw') continue;
    t.n++; if (r.winner === (swap ? 1 : 0)) t.w++;
  }
  return t;
};
console.log(`\ncounter triangle (rank-B parties, ${M} battles each, sides alternated)`);
const checks: [string, string][] = [['frontline', 'rush'], ['casters', 'frontline'], ['divers', 'casters']];
let ok = 0;
for (const [x, y] of checks) {
  const t = vs(x, y);
  const pass = t.w / t.n > 0.55;
  if (pass) ok++;
  console.log(`  ${ARCH[x].name.padEnd(18)} beats ${ARCH[y].name.padEnd(18)} ${rate(t)}  ${pass ? 'yes' : 'NO'}`);
}
console.log('  other pairings:');
for (const [x, y] of [['rush', 'casters'], ['rush', 'divers'], ['frontline', 'divers'], ['divers', 'frontline']] as [string, string][])
  console.log(`  ${ARCH[x].name.padEnd(18)} vs    ${ARCH[y].name.padEnd(18)} ${rate(vs(x, y))}`);
console.log(`\ntriangle: ${ok}/3 holds`);

// ------------------------------------------------------------ auto-tactics --
{
  const { autoPlan } = await import('../src/engine/battle/planner.ts');
  const { scout } = await import('../src/engine/battle/scout.ts');
  let w = 0, n = 0;
  for (let i = 0; i < M * 2; i++) {
    const rng = makeRng(mixSeed(4242, i));
    const heroes = Array.from({ length: 5 }, () => generateHero(rng.seed()));
    const preset = makeParty('Preset', heroes);
    const planned: Party = { name: 'Planned', heroes, ...autoPlan(heroes, scout(i, preset, preset)) };
    const swap = i % 2 === 1;
    const r = swap ? runBattle(i, preset, planned) : runBattle(i, planned, preset);
    if (r.winner === 'draw') continue;
    n++; if (r.winner === (swap ? 1 : 0)) w++;
  }
  console.log(`\nauto-tactics vs job presets, same five heroes on both sides: ${(100 * w / n).toFixed(1)}% (${n} battles)`);
}
