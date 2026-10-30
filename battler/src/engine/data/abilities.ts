import type { StatKey } from '../types.ts';

export type AbilityKind = 'physical' | 'spell' | 'heal' | 'buff' | 'debuff' | 'utility' | 'summon';
/**
 * Who an ability can be aimed at:
 *  enemy       one enemy            enemyRow   a whole enemy row       enemyFront  the enemy front-most row
 *  enemyArea   one enemy + the cells next to it (3×3 cross)             enemyAll    every enemy
 *  ally        one ally incl. self  allyOther  one ally, not self       allies      every ally
 *  self
 */
export type Aim = 'enemy' | 'enemyRow' | 'enemyFront' | 'enemyArea' | 'enemyAll' | 'ally' | 'allyOther' | 'allies' | 'self';

export interface StatusApply { id: StatusId; turns: number; mag?: number; chance?: number }
export type StatusId = 'taunt' | 'shieldWall' | 'guarded' | 'courage' | 'evade' | 'poison' | 'marked' | 'slowed' | 'shield'
  | 'silenced' | 'inspired' | 'dissonance' | 'asleep' | 'cursed' | 'feared' | 'regrowth' | 'barkskin' | 'corroded' | 'defending';

export const DEBUFFS: StatusId[] = ['poison', 'marked', 'slowed', 'silenced', 'dissonance', 'asleep', 'cursed', 'feared', 'corroded'];

export interface AbilityDef {
  name: string;
  kind: AbilityKind;
  aim: Aim;
  power: number;
  cost: number;           // mana
  cooldown: number;       // in the user's own actions
  melee?: boolean;        // melee: only reaches the enemy front-most row (unless flank)
  flank?: boolean;        // reaches any row; +25% against side columns
  stat?: StatKey;         // overrides the default stat (STR physical, INT spell, WIS heal)
  magic?: boolean;        // blocked by Silence
  hits?: number;          // multi-hit
  critBonus?: number;     // extra crit %
  lifesteal?: number;     // fraction of damage healed
  splash?: number;        // enemyArea: damage fraction for the cells around the centre
  status?: StatusApply;   // applied to every target hit
  gauge?: number;         // added to the target's action gauge (negative slows the next turn)
  cleanse?: boolean;
  summon?: 'skeleton' | 'familiar';
}

// Magnitudes marked "×CHA" scale with the user's CHA / 50.
export const ABILITIES: Record<string, AbilityDef> = {
  // Warrior
  strike:      { name: 'Strike', kind: 'physical', aim: 'enemy', power: 20, cost: 0, cooldown: 0, melee: true },
  cleave:      { name: 'Cleave', kind: 'physical', aim: 'enemyFront', power: 14, cost: 10, cooldown: 2, melee: true },
  taunt:       { name: 'Taunt', kind: 'utility', aim: 'self', power: 0, cost: 8, cooldown: 3, status: { id: 'taunt', turns: 2 } },
  shieldWall:  { name: 'Shield Wall', kind: 'buff', aim: 'self', power: 0, cost: 8, cooldown: 3, status: { id: 'shieldWall', turns: 2, mag: 0.4 } },
  // Paladin
  smite:       { name: 'Smite', kind: 'physical', aim: 'enemy', power: 18, cost: 0, cooldown: 0, melee: true },
  guard:       { name: 'Guard', kind: 'utility', aim: 'allyOther', power: 0, cost: 10, cooldown: 3, status: { id: 'guarded', turns: 2 } },
  layOnHands:  { name: 'Lay on Hands', kind: 'heal', aim: 'ally', power: 60, cost: 25, cooldown: 6, magic: true },
  auraOfCourage: { name: 'Aura of Courage', kind: 'buff', aim: 'allies', power: 0, cost: 15, cooldown: 5, magic: true, status: { id: 'courage', turns: 3, mag: 0.10 } },
  // Rogue
  stab:        { name: 'Stab', kind: 'physical', aim: 'enemy', power: 18, cost: 0, cooldown: 0, melee: true },
  backstab:    { name: 'Backstab', kind: 'physical', aim: 'enemy', power: 24, cost: 10, cooldown: 2, melee: true, flank: true, critBonus: 20 },
  evade:       { name: 'Evade', kind: 'buff', aim: 'self', power: 0, cost: 8, cooldown: 3, status: { id: 'evade', turns: 2, mag: 30 } },
  poison:      { name: 'Poison', kind: 'physical', aim: 'enemy', power: 8, cost: 8, cooldown: 2, melee: true, status: { id: 'poison', turns: 3, mag: 7 } },
  // Ranger (physical, but aimed with DEX)
  shot:        { name: 'Shot', kind: 'physical', aim: 'enemy', power: 18, cost: 0, cooldown: 0, stat: 'DEX' },
  volley:      { name: 'Volley', kind: 'physical', aim: 'enemyRow', power: 11, cost: 12, cooldown: 3, stat: 'DEX' },
  mark:        { name: 'Mark', kind: 'debuff', aim: 'enemy', power: 0, cost: 6, cooldown: 2, status: { id: 'marked', turns: 3, mag: 0.20 } },
  pin:         { name: 'Pin', kind: 'physical', aim: 'enemy', power: 10, cost: 8, cooldown: 3, stat: 'DEX', status: { id: 'slowed', turns: 2, mag: 40 } },
  // Mage
  bolt:        { name: 'Bolt', kind: 'spell', aim: 'enemy', power: 20, cost: 0, cooldown: 0, magic: true },
  fireball:    { name: 'Fireball', kind: 'spell', aim: 'enemyArea', power: 26, cost: 20, cooldown: 3, magic: true, splash: 0.5 },
  frostNova:   { name: 'Frost Nova', kind: 'spell', aim: 'enemyFront', power: 10, cost: 15, cooldown: 4, magic: true, status: { id: 'slowed', turns: 2, mag: 40 } },
  arcaneShield: { name: 'Arcane Shield', kind: 'buff', aim: 'ally', power: 30, cost: 12, cooldown: 3, magic: true, stat: 'INT', status: { id: 'shield', turns: 3 } },
  // Cleric
  mace:        { name: 'Mace', kind: 'physical', aim: 'enemy', power: 12, cost: 0, cooldown: 0, melee: true },
  heal:        { name: 'Heal', kind: 'heal', aim: 'ally', power: 35, cost: 10, cooldown: 0, magic: true },
  groupHeal:   { name: 'Group Heal', kind: 'heal', aim: 'allies', power: 16, cost: 22, cooldown: 3, magic: true },
  silence:     { name: 'Silence', kind: 'debuff', aim: 'enemy', power: 0, cost: 10, cooldown: 3, magic: true, status: { id: 'silenced', turns: 2 } },
  cleanse:     { name: 'Cleanse', kind: 'utility', aim: 'ally', power: 0, cost: 8, cooldown: 2, magic: true, cleanse: true },
  // Bard
  cutlass:     { name: 'Cutlass', kind: 'physical', aim: 'enemy', power: 14, cost: 0, cooldown: 0, melee: true, stat: 'DEX' },
  inspire:     { name: 'Inspire', kind: 'buff', aim: 'allies', power: 0, cost: 14, cooldown: 4, status: { id: 'inspired', turns: 3, mag: 25 } },
  dissonance:  { name: 'Dissonance', kind: 'debuff', aim: 'enemyAll', power: 0, cost: 14, cooldown: 4, magic: true, status: { id: 'dissonance', turns: 3, mag: 0.12 } },
  encore:      { name: 'Encore', kind: 'utility', aim: 'allyOther', power: 0, cost: 10, cooldown: 3, gauge: 500 },
  lullaby:     { name: 'Lullaby', kind: 'debuff', aim: 'enemy', power: 0, cost: 10, cooldown: 3, magic: true, status: { id: 'asleep', turns: 1, chance: 0.5 } },
  // Necromancer
  drain:       { name: 'Drain', kind: 'spell', aim: 'enemy', power: 16, cost: 0, cooldown: 0, magic: true, lifesteal: 0.5 },
  raiseDead:   { name: 'Raise Dead', kind: 'summon', aim: 'self', power: 0, cost: 20, cooldown: 5, magic: true, summon: 'skeleton' },
  curse:       { name: 'Curse', kind: 'debuff', aim: 'enemy', power: 0, cost: 10, cooldown: 2, magic: true, stat: 'INT', status: { id: 'cursed', turns: 3, mag: 8 } },
  fear:        { name: 'Fear', kind: 'debuff', aim: 'enemy', power: 0, cost: 10, cooldown: 3, magic: true, status: { id: 'feared', turns: 3, mag: 25 } },
  // Monk (aimed with DEX)
  palm:        { name: 'Palm Strike', kind: 'physical', aim: 'enemy', power: 18, cost: 0, cooldown: 0, melee: true, stat: 'DEX' },
  flurry:      { name: 'Flurry', kind: 'physical', aim: 'enemy', power: 9, cost: 10, cooldown: 2, melee: true, stat: 'DEX', hits: 3 },
  pressurePoint: { name: 'Pressure Point', kind: 'physical', aim: 'enemy', power: 10, cost: 10, cooldown: 3, melee: true, stat: 'DEX', gauge: -400 },
  innerPeace:  { name: 'Inner Peace', kind: 'heal', aim: 'self', power: 30, cost: 10, cooldown: 4, cleanse: true },
  // Druid
  thorn:       { name: 'Thorn', kind: 'spell', aim: 'enemy', power: 14, cost: 0, cooldown: 0, magic: true },
  entangle:    { name: 'Entangle', kind: 'spell', aim: 'enemyFront', power: 6, cost: 14, cooldown: 4, magic: true, status: { id: 'slowed', turns: 2, mag: 40 } },
  regrowth:    { name: 'Regrowth', kind: 'heal', aim: 'ally', power: 10, cost: 10, cooldown: 2, magic: true, status: { id: 'regrowth', turns: 3 } },
  barkskin:    { name: 'Barkskin', kind: 'buff', aim: 'ally', power: 0, cost: 10, cooldown: 3, magic: true, status: { id: 'barkskin', turns: 3, mag: 25 } },
  // Summoner
  spiritBolt:  { name: 'Spirit Bolt', kind: 'spell', aim: 'enemy', power: 16, cost: 0, cooldown: 0, magic: true },
  callFamiliar: { name: 'Call Familiar', kind: 'summon', aim: 'self', power: 0, cost: 20, cooldown: 6, magic: true, summon: 'familiar' },
  ward:        { name: 'Ward', kind: 'buff', aim: 'ally', power: 25, cost: 10, cooldown: 3, magic: true, stat: 'INT', status: { id: 'shield', turns: 3 } },
  // Alchemist (bombs use INT)
  acidFlask:   { name: 'Acid Flask', kind: 'spell', aim: 'enemy', power: 15, cost: 0, cooldown: 0, status: { id: 'corroded', turns: 2, mag: 15 } },
  firebomb:    { name: 'Firebomb', kind: 'spell', aim: 'enemyArea', power: 18, cost: 18, cooldown: 3, splash: 0.5 },
  draught:     { name: 'Healing Draught', kind: 'heal', aim: 'ally', power: 28, cost: 10, cooldown: 2 },
  smokeBomb:   { name: 'Smoke Bomb', kind: 'buff', aim: 'allies', power: 0, cost: 14, cooldown: 4, status: { id: 'evade', turns: 2, mag: 20 } },
  // Summons and fallbacks
  claw:        { name: 'Claw', kind: 'physical', aim: 'enemy', power: 14, cost: 0, cooldown: 0, melee: true },
  flail:       { name: 'Flail', kind: 'physical', aim: 'enemy', power: 8, cost: 0, cooldown: 0, melee: true },   // used when Silence blocks a caster's basic attack
};

export interface SummonDef { name: string; basic: string; look: string | null; base: number; scale: number; tank?: boolean }
export const SUMMONS: Record<string, SummonDef> = {
  skeleton: { name: 'Skeleton', basic: 'claw', look: null, base: 30, scale: 0.3 },
  golem:    { name: 'Stone Golem', basic: 'claw', look: 'fam_golem', base: 30, scale: 0.35, tank: true },
  whelp:    { name: 'Dragon Whelp', basic: 'bolt', look: 'fam_whelp', base: 25, scale: 0.35 },
  fox:      { name: 'Fox Spirit', basic: 'claw', look: 'fam_fox', base: 25, scale: 0.35 },
  raven:    { name: 'Raven', basic: 'shot', look: 'fam_raven', base: 25, scale: 0.35 },
};
export const FAMILIARS = ['golem', 'whelp', 'fox', 'raven'];
