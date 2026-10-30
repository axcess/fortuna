// The hero card: Ultimate Team layout with a frame per rank.
import { TRAITS } from '../src/engine/data/heroes.ts';
import { JOB_DEFS } from '../src/engine/data/jobs.ts';
import { tiersFor } from '../src/engine/hero.ts';
import { STATS, type Hero, type JobId } from '../src/engine/types.ts';

export const ART = 'art/sprites/';
export const JOB_TAG: Record<JobId, string> = {
  warrior: 'WAR', paladin: 'PAL', rogue: 'ROG', ranger: 'RNG', mage: 'MAG', cleric: 'CLR', bard: 'BRD', necromancer: 'NEC',
  monk: 'MNK', druid: 'DRU', summoner: 'SUM', alchemist: 'ALC',
};

export const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function portrait(h: { look: string | null; job: string }, cls = 'portrait'): string {
  return h.look
    ? `<img class="${cls}" src="${ART}${h.look}_portrait.png" alt="" draggable="false">`
    : `<div class="${cls} ph" aria-hidden="true">${JOB_TAG[h.job as JobId] ?? '?'}</div>`;
}

export function cardHTML(h: Hero, opts: { selected?: boolean; small?: boolean; attrs?: string } = {}): string {
  const tiers = tiersFor(h.job);
  const stats = STATS.map((s) => `<div class="st${tiers[s] === 'primary' ? ' pri' : ''}"><b>${h.stats[s]}</b><span>${s}</span></div>`).join('');
  return `<article class="card r-${h.rank}${opts.selected ? ' sel' : ''}${opts.small ? ' small' : ''}" ${opts.attrs ?? ''}>
    <div class="frame">
      <header><div class="ovr"><b>${h.ovr}</b><span>${JOB_DEFS[h.job].name}</span></div><div class="rank">${h.rank}</div></header>
      <div class="pic">${portrait(h)}</div>
      <div class="banner"><span class="nm">${esc(h.name)}</span>${h.trait ? `<span class="trait" title="${esc(TRAITS[h.trait].desc)}">${TRAITS[h.trait].name}</span>` : ''}</div>
      <div class="stats">${stats}</div>
    </div>
  </article>`;
}

/** A face-down card for pack opening. The back already glows in the rank's colour as a hint. */
export function backHTML(h: Hero, i: number): string {
  return `<div class="flip r-${h.rank}" data-i="${i}" tabindex="0" role="button" aria-label="Reveal card ${i + 1}">
    <div class="face back"><div class="sigil">✶</div></div>
    <div class="face front">${cardHTML(h)}</div>
  </div>`;
}
