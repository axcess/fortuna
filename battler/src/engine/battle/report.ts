import type { BattleResult, HeroReport, Side } from './types.ts';

/** Readable post-battle summary lines for one side. */
export function summary(r: BattleResult, side: Side): string[] {
  const mine = r.report.heroes.filter((h) => h.side === side);
  const lines = [r.winner === side ? 'Victory.' : r.winner === 'draw' ? 'A draw.' : 'Defeat.'];
  for (const h of mine) {
    const fires = h.ruleFires.map((n, i) => `#${i + 1}×${n}`).join(' ');
    lines.push(`${h.name}: dealt ${h.dealt}, took ${h.taken}${h.healed ? `, healed ${h.healed}` : ''}${h.kills ? `, ${h.kills} kill${h.kills > 1 ? 's' : ''}` : ''}`
      + ` · rules ${fires || 'none'} · default ${h.defaults}${h.disobeyed ? ` · disobeyed ${h.disobeyed}×` : ''}${h.alive ? '' : ' · FELL'}`
      + (r.report.mvp === h.uid ? ' · MVP' : ''));
  }
  return lines;
}

/**
 * From the Guildmaster's Desk: a bard in the party writes the battle up as a
 * ballad. Every fact is in there, but you have to read for it.
 */
export function ballad(r: BattleResult, side: Side): string[] | null {
  const mine = r.report.heroes.filter((h) => h.side === side);
  const bard = mine.find((h) => h.job === 'bard' && h.alive) ?? mine.find((h) => h.job === 'bard');
  if (!bard) return null;
  const first = (h: HeroReport) => h.name.split(' ')[0];
  const won = r.winner === side;
  const fallen = mine.filter((h) => !h.alive);
  const star = mine.find((h) => h.uid === r.report.mvp);
  const unruly = [...mine].sort((a, b) => b.disobeyed - a.disobeyed)[0];
  const out = ['Hear now the lay of the field!'];
  out.push(won ? 'Our foes came on like a storm, and like a storm they passed.' : r.winner === 'draw' ? 'Long did we strive, and neither side would yield the field.' : 'Fierce was the foe, and the day was not ours.');
  if (star) out.push(`Sing of ${first(star)}, whose ${star.healed > star.dealt ? 'gentle hands mended' : 'blows fell'} like ${star.healed > star.dealt ? 'spring rain' : 'hammers'}.`);
  if (unruly && unruly.disobeyed >= 3) out.push(`${first(unruly)} heeded no orders but their own heart (${unruly.disobeyed} times, if anyone is counting).`);
  if (fallen.length) out.push(`Weep for ${fallen.map(first).join(' and ')}, who sing now with the gods.`);
  out.push(bard.alive ? `Composed by ${first(bard)}. (Music available on request.)` : `Completed from ${first(bard)}'s notes, found on the field.`);
  return out;
}
