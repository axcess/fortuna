// Print one battle's log. Usage: node scripts/demo.ts [seed]
import { runBattle } from '../src/engine/battle/battle.ts';
import { makeParty } from '../src/engine/battle/party.ts';
import { generateHero } from '../src/engine/hero.ts';
import type { JobId } from '../src/engine/types.ts';

const seed = Number(process.argv[2] ?? 1);
const team = (base: number, jobs: JobId[]) => jobs.map((job, i) => generateHero(base + i, { job }));
const a = makeParty('The Rusty Flagon', team(seed * 100, ['warrior', 'cleric', 'mage', 'ranger', 'bard']), { stance: 'protect' });
const b = makeParty('Grimsby\'s Raiders', team(seed * 100 + 50, ['paladin', 'rogue', 'necromancer', 'druid', 'monk']), { stance: 'aggressive' });
for (const p of [a, b]) console.log(p.name + ': ' + p.heroes.map((h) => `${h.name} (${h.job} ${h.rank}${h.ovr})`).join(', '));
const r = runBattle(seed, a, b);
for (const e of r.events) console.log(String(e.tick).padStart(4), e.text);
console.log('\nwinner', r.winner, r.reason, 'ticks', r.ticks, 'events', r.events.length);
for (const h of r.report.heroes) console.log(`${h.name.padEnd(22)} dealt ${String(h.dealt).padStart(4)} taken ${String(h.taken).padStart(4)} healed ${String(h.healed).padStart(4)} kills ${h.kills} rules ${h.ruleFires.join('/')} default ${h.defaults} disobeyed ${h.disobeyed}${r.report.mvp === h.uid ? '  ★ MVP' : ''}`);
