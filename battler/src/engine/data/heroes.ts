import type { PersonalityId, TraitId } from '../types.ts';

/** Stat roll ranges by tier. Tuned with scripts/rarity.ts toward the rank targets. */
export const TIER_RANGES = {
  primary: [52, 96],
  secondary: [32, 82],
  off: [8, 62],
} as const;

/**
 * One hero-wide "talent" roll (bell curve in [-TALENT, +TALENT]) added to every
 * stat. Independent per-stat rolls average out and leave OVR far too clustered
 * (nearly all B/C); a shared talent roll gives the E-to-S spread the rank targets need.
 */
export const TALENT = 36;

export const BREAKOUT_CHANCE = 0.03;
export const TRAIT_CHANCE = 0.25;

export interface TraitDef { name: string; ovr: number; desc: string }
export const TRAITS: Record<TraitId, TraitDef> = {
  lucky:      { name: 'Lucky',       ovr: 2, desc: '+5% crit chance.' },
  berserker:  { name: 'Berserker',   ovr: 3, desc: 'Deals up to +50% damage as their HP drops.' },
  battleBorn: { name: 'Battle-Born', ovr: 2, desc: '+10 to every stat for their first 3 turns.' },
  ironSkin:   { name: 'Iron Skin',   ovr: 2, desc: '+15 armor.' },
  brave:      { name: 'Brave',       ovr: 1, desc: 'Immune to Fear, +5 discipline.' },   // from the Guildmaster's Desk traits
};

export interface PersonalityDef { name: string; discipline: number; disobey: string }
export const PERSONALITIES: Record<PersonalityId, PersonalityDef> = {
  reckless:    { name: 'Reckless',     discipline: -15, disobey: 'charges the highest-HP enemy' },
  cautious:    { name: 'Cautious',     discipline: 5,   disobey: 'holds back to defend' },
  loyal:       { name: 'Loyal',        discipline: 10,  disobey: 'sticks by an ally' },
  greedy:      { name: 'Greedy',       discipline: -10, disobey: 'goes for the kill on the weakest enemy' },
  gloryseeker: { name: 'Glory-Seeker', discipline: -10, disobey: 'shows off their strongest move' },
  steady:      { name: 'Steady',       discipline: 15,  disobey: 'falls back on their last order' },
};

/** Potential is the current rank shifted by one of these steps (weights in %). */
export const POTENTIAL_SHIFT: [number, number][] = [[-2, 5], [-1, 15], [0, 40], [1, 25], [2, 12], [3, 3]];

// Name lists carried over from the Guildmaster's Desk.
export const FIRST = ['Brom', 'Pip', 'Elowen', 'Tamsin', 'Garrick', 'Ysolde', 'Fenn', 'Mirela', 'Corwin', 'Thessaly', 'Odo', 'Rhiannon',
  'Bastian', 'Kael', 'Nim', 'Wren', 'Darius', 'Sable', 'Hollis', 'Juniper', 'Mags', 'Talia', 'Ulric', 'Vesper', 'Briar', 'Cass',
  'Mira', 'Torvald', 'Saoirse', 'Hob', 'Ingrid', 'Peregrin', 'Willa', 'Jory', 'Morwen', 'Eamon', 'Una', 'Faye', 'Tobin', 'Gwyn'];
export const LAST = ['Ironfoot', 'Thistledown', 'Ashgrove', 'Copperkettle', 'Stormwhistle', 'Blackbriar', 'Fairweather', 'Oakenshield',
  'Quickfinger', 'Greymantle', 'Hollowell', 'Redmane', 'Pennywhistle', 'Duskwood', 'Underbough', 'Larkspur', 'Mudwick', 'Vane',
  'Stonebrow', 'Grimsby'];
