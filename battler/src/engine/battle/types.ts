import type { StatusId } from '../data/abilities.ts';
import type { Role } from '../data/jobs.ts';
import type { Hero, JobId, PersonalityId, Stats, TraitId } from '../types.ts';

export type Stance = 'aggressive' | 'balanced' | 'defensive' | 'focus' | 'protect';
export type Side = 0 | 1;

// ----------------------------------------------------------------- rules --
export type Condition =
  | { type: 'always' }
  | { type: 'selfHpBelow'; pct: number }
  | { type: 'allyHpBelow'; pct: number }
  | { type: 'alliesBelow'; n: number; pct: number }
  | { type: 'enemyRole'; role: Role }
  | { type: 'enemiesInRow'; n: number }
  | { type: 'targetHas'; status: 'marked' | 'poisoned' | 'silenced' }
  | { type: 'allyTargetedByMelee' }
  | { type: 'selfManaAbove'; pct: number }
  | { type: 'turnAtLeast'; n: number };

export type TargetPick = 'nearest' | 'lowestHp' | 'highestHp' | 'lowestHpPct' | 'casters' | 'healers' | 'focus' | 'self' | 'bonded';

/** condition → action → target. `ability: 'attack'` is the job's basic attack. */
export interface Rule { when: Condition; ability: string; target: TargetPick }

// ------------------------------------------------------- contingencies --
export type Trigger =
  | { type: 'falls'; who: string | 'anyHealer' | 'captain' }
  | { type: 'bossHpBelow'; pct: number }
  | { type: 'downTo'; n: number };
export type Response = { stance: Stance } | { retreat: true };
export interface Contingency { when: Trigger; then: Response }

// ---------------------------------------------------------------- party --
export interface Slot { row: 0 | 1 | 2; col: 0 | 1 | 2 }   // row 0 = front
export interface Party {
  name: string;
  heroes: Hero[];
  formation: Record<string, Slot>;      // hero id → slot
  captain: string;                      // hero id
  stance: Stance;
  rules: Record<string, Rule[]>;        // hero id → ordered rules (extra rules beyond the rank's slots are ignored)
  contingencies?: Contingency[];        // up to 3, each fires once
  bonds?: [string, string][];           // bonded pairs
  boss?: string;                        // hero id treated as the boss (defaults to the captain)
}

// ----------------------------------------------------------------- units --
export interface Status { id: StatusId; turns: number; mag: number; src: number }
export interface Unit {
  uid: number;
  side: Side;
  heroId: string | null;               // null for summons
  name: string;
  job: JobId | 'summon';
  look: string | null;
  base: Stats;
  roles: Role[];
  basic: string;
  abilities: string[];
  rules: Rule[];
  personality: PersonalityId | null;
  trait: TraitId | null;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gauge: number;
  cd: Record<string, number>;
  statuses: Status[];
  alive: boolean;
  summon: boolean;
  ovr: number;
  actions: number;                     // how many turns this unit has taken
  bonded: number | null;
  lastHitBy: number | null;
  meleeTargetedAt: number;             // tick this unit was last aimed at by melee
  raised?: boolean;                    // a fallen unit already raised
}

// ---------------------------------------------------------------- events --
export type Source =
  | { kind: 'rule'; index: number; text: string }
  | { kind: 'default' }
  | { kind: 'disobey'; personality: PersonalityId }
  | { kind: 'stance'; stance: Stance };

export interface Result {
  target: number;
  outcome: 'hit' | 'crit' | 'miss' | 'heal' | 'status' | 'resist' | 'absorbed';
  amount?: number;
  status?: StatusId;
  hpAfter: number;
  redirectedFrom?: number;             // Guard: damage taken in place of this unit
}

export interface BattleEvent {
  seq: number;
  tick: number;
  type: 'start' | 'action' | 'dot' | 'hot' | 'death' | 'summon' | 'contingency' | 'skip' | 'move' | 'end';
  actor?: number;
  source?: Source;
  ability?: string;
  results?: Result[];
  unit?: UnitInfo;                     // for summons
  side?: Side;
  text: string;
}

export interface UnitInfo { uid: number; side: Side; heroId: string | null; name: string; job: JobId | 'summon'; look: string | null; row: number; col: number; maxHp: number; summon: boolean }

export interface HeroReport {
  uid: number; name: string; side: Side; job: string;
  dealt: number; taken: number; healed: number; kills: number;
  ruleFires: number[]; defaults: number; disobeyed: number; alive: boolean;
}
export interface BattleResult {
  seed: number;
  winner: Side | 'draw';
  reason: 'wipe' | 'tickCap';
  ticks: number;
  units: UnitInfo[];
  events: BattleEvent[];
  report: { heroes: HeroReport[]; mvp: number | null; hpLeft: [number, number] };
}
