export const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type StatKey = (typeof STATS)[number];
export type Stats = Record<StatKey, number>;

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;   // weakest first
export type Rank = (typeof RANKS)[number];

export const JOBS = ['warrior', 'paladin', 'rogue', 'ranger', 'mage', 'cleric', 'bard', 'necromancer',
  'monk', 'druid', 'summoner', 'alchemist'] as const;
export type JobId = (typeof JOBS)[number];

export type TraitId = 'lucky' | 'berserker' | 'battleBorn' | 'ironSkin' | 'brave';
export type PersonalityId = 'reckless' | 'cautious' | 'loyal' | 'greedy' | 'gloryseeker' | 'steady';

export interface Hero {
  id: string;
  name: string;
  job: JobId;
  stats: Stats;
  ovr: number;
  rank: Rank;
  ovrByJob: Record<JobId, number>;
  trait: TraitId | null;
  personality: PersonalityId;
  potential: Rank;          // hidden from the player
  breakout: StatKey | null;
  seed: number;             // regenerates this hero exactly
  look: string | null;      // sprite id from the shared art set (art/sprites), null = placeholder
}
