// The post-battle report.
import { ABILITIES } from '../src/engine/data/abilities.ts';
import { ballad, summary } from '../src/engine/battle/report.ts';
import type { BattleResult } from '../src/engine/battle/types.ts';
import { esc } from './card.ts';

export function reportHTML(r: BattleResult, names: [string, string]): string {
  const won = r.winner === 0;
  const rows = r.report.heroes.filter((h) => h.side === 0).map((h) => `<tr class="${h.alive ? '' : 'fell'}">
    <th>${esc(h.name)}${r.report.mvp === h.uid ? ' <span class="mvp">MVP</span>' : ''}</th><td>${h.dealt}</td><td>${h.taken}</td><td>${h.healed}</td><td>${h.kills}</td>
    <td class="fires">${h.ruleFires.map((n, i) => `<span title="Rule ${i + 1}">#${i + 1}·${n}</span>`).join(' ') || '–'}</td><td>${h.defaults}</td><td>${h.disobeyed || '–'}</td></tr>`).join('');
  const song = ballad(r, 0);
  const why = whyLines(r);
  return `<div class="report">
    <h2 class="${won ? 'win' : r.winner === 'draw' ? '' : 'loss'}">${won ? 'Victory' : r.winner === 'draw' ? 'Draw' : 'Defeat'} <small>vs ${esc(names[1])}${r.reason === 'tickCap' ? ' · decided on remaining HP' : ''}</small></h2>
    ${why.length ? `<ul class="why">${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <div class="tablewrap"><table><thead><tr><th>Hero</th><th>Dealt</th><th>Taken</th><th>Healed</th><th>Kills</th><th>Rules fired</th><th>Default</th><th>Disobeyed</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${song ? `<blockquote class="ballad">${song.map((l) => `<p>${esc(l)}</p>`).join('')}</blockquote>` : ''}
    <details><summary>Plain summary</summary>${summary(r, 0).map((l) => `<p>${esc(l)}</p>`).join('')}</details>
  </div>`;
}

/** A few plain reasons a battle went the way it did, read from the report. */
function whyLines(r: BattleResult): string[] {
  const out: string[] = [];
  const mine = r.report.heroes.filter((h) => h.side === 0), theirs = r.report.heroes.filter((h) => h.side === 1);
  const sum = (l: typeof mine, k: 'dealt' | 'healed' | 'disobeyed') => l.reduce((t, h) => t + h[k], 0);
  if (sum(mine, 'disobeyed') >= 6) out.push(`Your heroes ignored orders ${sum(mine, 'disobeyed')} times. A high-Charisma captain and Wise heroes keep discipline up.`);
  if (sum(theirs, 'healed') > sum(mine, 'healed') * 1.5 && sum(theirs, 'healed') > 150) out.push(`They out-healed you ${sum(theirs, 'healed')} to ${sum(mine, 'healed')}. Silence or rush their healers.`);
  const idle = mine.filter((h) => h.ruleFires.length && h.ruleFires.every((n) => n === 0) && h.defaults > 3);
  for (const h of idle.slice(0, 2)) out.push(`None of ${h.name.split(' ')[0]}'s rules ever applied, so they only made default attacks.`);
  const first = r.events.find((e) => e.type === 'death');
  if (first && first.actor !== undefined) {
    const u = r.units.find((x) => x.uid === first.actor) ?? r.events.find((e) => e.unit?.uid === first.actor)?.unit;
    if (u) out.push(`${u.name} fell first, at tick ${first.tick}.`);
  }
  return out;
}

export function abilityName(id: string) { return ABILITIES[id]?.name ?? id; }
