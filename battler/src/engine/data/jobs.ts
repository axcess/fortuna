import type { JobId, Stats } from '../types.ts';

export type Role = 'tank' | 'healer' | 'caster' | 'melee' | 'ranged' | 'support';

export interface JobDef {
  name: string;
  weights: Stats;                 // OVR weights, sum to 1
  roles: Role[];                  // used by "enemy of type present" conditions and default AI
  basic: string;                  // ability used for the default attack
  abilities: string[];            // the job's skill list (basic included)
  captain: string;                // party-wide passive when captain (see battle/captain.ts)
  scout: number;                  // extra enemy units revealed before battle
  /** Sprite ids from the shared art set. Empty = placeholder art. */
  looks: string[];
}

// The first eight jobs are from the design handoff. Monk, Druid, Summoner and
// Alchemist come from the Guildmaster's Desk cast, which already has art for them.
export const JOB_DEFS: Record<JobId, JobDef> = {
  warrior: {
    name: 'Warrior', weights: { STR: .35, DEX: .15, CON: .30, INT: .05, WIS: .10, CHA: .05 }, roles: ['tank', 'melee'],
    basic: 'strike', abilities: ['strike', 'cleave', 'taunt', 'shieldWall'], captain: 'Battle Drill: +5% physical damage', scout: 0,
    looks: ['warrior_human', 'warrior_orc', 'warrior_dwarf', 'warrior_elf'],
  },
  paladin: {
    name: 'Paladin', weights: { STR: .25, DEX: .05, CON: .30, INT: .05, WIS: .20, CHA: .15 }, roles: ['tank', 'healer', 'melee'],
    basic: 'smite', abilities: ['smite', 'guard', 'layOnHands', 'auraOfCourage'], captain: 'Bulwark: -5% damage taken', scout: 0,
    looks: ['paladin_human', 'paladin_orc', 'paladin_dwarf', 'paladin_elf'],
  },
  rogue: {
    name: 'Rogue', weights: { STR: .15, DEX: .40, CON: .15, INT: .10, WIS: .05, CHA: .15 }, roles: ['melee'],
    basic: 'stab', abilities: ['stab', 'backstab', 'evade', 'poison'], captain: 'Opportunist: +3% crit chance', scout: 0,
    looks: ['rogue_human', 'rogue_orc', 'rogue_dwarf', 'rogue_elf'],
  },
  ranger: {
    name: 'Ranger', weights: { STR: .15, DEX: .35, CON: .15, INT: .10, WIS: .20, CHA: .05 }, roles: ['ranged'],
    basic: 'shot', abilities: ['shot', 'volley', 'mark', 'pin'], captain: 'Keen Eyes: +5 hit chance', scout: 1,
    looks: ['ranger_human', 'ranger_orc', 'ranger_halfling', 'ranger_elf'],
  },
  mage: {
    name: 'Mage', weights: { STR: .05, DEX: .15, CON: .10, INT: .45, WIS: .20, CHA: .05 }, roles: ['caster'],
    basic: 'bolt', abilities: ['bolt', 'fireball', 'frostNova', 'arcaneShield'], captain: 'Arcane Focus: +5% spell damage', scout: 0,
    looks: ['mage_human', 'mage_orc', 'mage_gnome', 'mage_elf'],
  },
  cleric: {
    name: 'Cleric', weights: { STR: .05, DEX: .05, CON: .20, INT: .10, WIS: .40, CHA: .20 }, roles: ['healer', 'caster'],
    basic: 'mace', abilities: ['mace', 'heal', 'groupHeal', 'silence', 'cleanse'], captain: 'Blessing: +5% healing', scout: 0,
    looks: ['cleric_human', 'cleric_orc', 'cleric_dwarf', 'cleric_elf'],
  },
  bard: {
    name: 'Bard', weights: { STR: .05, DEX: .20, CON: .05, INT: .15, WIS: .15, CHA: .40 }, roles: ['support'],
    basic: 'cutlass', abilities: ['cutlass', 'inspire', 'dissonance', 'encore', 'lullaby'], captain: 'Marching Song: +5 speed', scout: 1,
    looks: ['bard_human', 'bard_halfling', 'bard_orc', 'bard_elf'],
  },
  necromancer: {
    name: 'Necromancer', weights: { STR: .05, DEX: .05, CON: .10, INT: .35, WIS: .25, CHA: .20 }, roles: ['caster'],
    basic: 'drain', abilities: ['drain', 'raiseDead', 'curse', 'fear'], captain: 'Dread: enemies -5 discipline', scout: 0,
    looks: [],   // no art yet
  },
  monk: {
    name: 'Monk', weights: { STR: .20, DEX: .30, CON: .15, INT: .05, WIS: .25, CHA: .05 }, roles: ['melee'],
    basic: 'palm', abilities: ['palm', 'flurry', 'pressurePoint', 'innerPeace'], captain: 'Still Mind: +5 discipline', scout: 0,
    looks: ['monk_human', 'monk_orc', 'monk_dwarf', 'monk_elf'],
  },
  druid: {
    name: 'Druid', weights: { STR: .05, DEX: .10, CON: .15, INT: .20, WIS: .35, CHA: .15 }, roles: ['healer', 'caster'],
    basic: 'thorn', abilities: ['thorn', 'entangle', 'regrowth', 'barkskin'], captain: 'Grove Ward: +5% max HP', scout: 1,
    looks: ['druid_dwarf', 'druid_orc', 'druid_human', 'druid_elf'],
  },
  summoner: {
    name: 'Summoner', weights: { STR: .05, DEX: .10, CON: .10, INT: .35, WIS: .15, CHA: .25 }, roles: ['caster', 'support'],
    basic: 'spiritBolt', abilities: ['spiritBolt', 'callFamiliar', 'ward'], captain: 'Pact: summons +20% stats', scout: 0,
    looks: ['summoner_human', 'summoner_orc', 'summoner_dwarf', 'summoner_elf', 'summoner_human_2', 'summoner_orc_2', 'summoner_halfling', 'summoner_elf_2'],
  },
  alchemist: {
    name: 'Alchemist', weights: { STR: .05, DEX: .25, CON: .10, INT: .35, WIS: .15, CHA: .10 }, roles: ['ranged', 'support'],
    basic: 'acidFlask', abilities: ['acidFlask', 'firebomb', 'draught', 'smokeBomb'], captain: 'Field Kits: +10 starting mana', scout: 0,
    looks: ['alchemist_dwarf', 'alchemist_human', 'alchemist_gnome', 'alchemist_orc'],
  },
};
