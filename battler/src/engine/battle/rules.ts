import { ABILITIES } from '../data/abilities.ts';
import { JOB_DEFS } from '../data/jobs.ts';
import type { Hero, JobId, Rank } from '../types.ts';
import type { Condition, Rule, TargetPick } from './types.ts';

export const RULE_SLOTS: Record<Rank, number> = { E: 2, D: 3, C: 3, B: 4, A: 5, S: 6 };

const TARGET_TEXT: Record<TargetPick, string> = {
  nearest: 'nearest', lowestHp: 'lowest HP', highestHp: 'highest HP', lowestHpPct: 'lowest HP %', casters: 'casters first',
  healers: 'healers first', focus: 'focus target', self: 'self', bonded: 'bonded ally',
};

export function conditionText(c: Condition): string {
  switch (c.type) {
    case 'always': return 'always';
    case 'selfHpBelow': return `self HP < ${c.pct}%`;
    case 'allyHpBelow': return `an ally HP < ${c.pct}%`;
    case 'alliesBelow': return `${c.n}+ allies HP < ${c.pct}%`;
    case 'enemyRole': return `enemy ${c.role} present`;
    case 'enemiesInRow': return `${c.n}+ enemies in a row`;
    case 'targetHas': return `target is ${c.status}`;
    case 'allyTargetedByMelee': return 'an ally is under melee attack';
    case 'selfManaAbove': return `self mana > ${c.pct}%`;
    case 'turnAtLeast': return `turn ≥ ${c.n}`;
  }
}

export function ruleText(r: Rule, job: JobId): string {
  const ab = r.ability === 'attack' ? ABILITIES[JOB_DEFS[job].basic].name : ABILITIES[r.ability]?.name ?? r.ability;
  return `${conditionText(r.when)} → ${ab} → ${TARGET_TEXT[r.target]}`;
}

/**
 * Sensible starting rules for each job, used by the sims and as the editor's preset.
 * Ordered most-important first; a hero only keeps as many as their rank allows.
 */
export const DEFAULT_RULES: Record<JobId, Rule[]> = {
  warrior: [
    { when: { type: 'allyTargetedByMelee' }, ability: 'taunt', target: 'self' },
    { when: { type: 'selfHpBelow', pct: 40 }, ability: 'shieldWall', target: 'self' },
    { when: { type: 'enemiesInRow', n: 2 }, ability: 'cleave', target: 'nearest' },
    { when: { type: 'always' }, ability: 'attack', target: 'lowestHpPct' },
  ],
  paladin: [
    { when: { type: 'allyHpBelow', pct: 30 }, ability: 'layOnHands', target: 'lowestHpPct' },
    { when: { type: 'allyTargetedByMelee' }, ability: 'guard', target: 'lowestHpPct' },
    { when: { type: 'turnAtLeast', n: 1 }, ability: 'auraOfCourage', target: 'self' },
    { when: { type: 'always' }, ability: 'attack', target: 'nearest' },
  ],
  rogue: [
    { when: { type: 'enemyRole', role: 'caster' }, ability: 'backstab', target: 'casters' },
    { when: { type: 'enemyRole', role: 'healer' }, ability: 'backstab', target: 'healers' },
    { when: { type: 'selfHpBelow', pct: 50 }, ability: 'evade', target: 'self' },
    { when: { type: 'always' }, ability: 'poison', target: 'highestHp' },
  ],
  ranger: [
    { when: { type: 'turnAtLeast', n: 1 }, ability: 'mark', target: 'lowestHpPct' },
    { when: { type: 'enemiesInRow', n: 3 }, ability: 'volley', target: 'nearest' },
    { when: { type: 'enemyRole', role: 'caster' }, ability: 'pin', target: 'casters' },
    { when: { type: 'targetHas', status: 'marked' }, ability: 'attack', target: 'lowestHp' },
  ],
  mage: [
    { when: { type: 'enemiesInRow', n: 2 }, ability: 'fireball', target: 'nearest' },
    { when: { type: 'allyTargetedByMelee' }, ability: 'frostNova', target: 'nearest' },
    { when: { type: 'allyHpBelow', pct: 50 }, ability: 'arcaneShield', target: 'lowestHpPct' },
    { when: { type: 'always' }, ability: 'attack', target: 'lowestHpPct' },
  ],
  cleric: [
    { when: { type: 'alliesBelow', n: 2, pct: 60 }, ability: 'groupHeal', target: 'self' },
    { when: { type: 'allyHpBelow', pct: 65 }, ability: 'heal', target: 'lowestHpPct' },
    { when: { type: 'enemyRole', role: 'caster' }, ability: 'silence', target: 'casters' },
    { when: { type: 'always' }, ability: 'attack', target: 'nearest' },
  ],
  bard: [
    { when: { type: 'turnAtLeast', n: 1 }, ability: 'inspire', target: 'self' },
    { when: { type: 'turnAtLeast', n: 2 }, ability: 'dissonance', target: 'nearest' },
    { when: { type: 'enemyRole', role: 'caster' }, ability: 'lullaby', target: 'casters' },
    { when: { type: 'always' }, ability: 'attack', target: 'lowestHp' },
  ],
  necromancer: [
    { when: { type: 'turnAtLeast', n: 1 }, ability: 'raiseDead', target: 'self' },
    { when: { type: 'turnAtLeast', n: 1 }, ability: 'curse', target: 'highestHp' },
    { when: { type: 'selfHpBelow', pct: 60 }, ability: 'attack', target: 'lowestHp' },
    { when: { type: 'enemyRole', role: 'healer' }, ability: 'fear', target: 'healers' },
  ],
  monk: [
    { when: { type: 'selfHpBelow', pct: 40 }, ability: 'innerPeace', target: 'self' },
    { when: { type: 'enemyRole', role: 'caster' }, ability: 'pressurePoint', target: 'casters' },
    { when: { type: 'always' }, ability: 'flurry', target: 'lowestHpPct' },
    { when: { type: 'always' }, ability: 'attack', target: 'lowestHp' },
  ],
  druid: [
    { when: { type: 'allyHpBelow', pct: 70 }, ability: 'regrowth', target: 'lowestHpPct' },
    { when: { type: 'allyTargetedByMelee' }, ability: 'barkskin', target: 'lowestHpPct' },
    { when: { type: 'enemiesInRow', n: 2 }, ability: 'entangle', target: 'nearest' },
    { when: { type: 'always' }, ability: 'attack', target: 'nearest' },
  ],
  summoner: [
    { when: { type: 'turnAtLeast', n: 1 }, ability: 'callFamiliar', target: 'self' },
    { when: { type: 'allyHpBelow', pct: 50 }, ability: 'ward', target: 'lowestHpPct' },
    { when: { type: 'always' }, ability: 'attack', target: 'lowestHpPct' },
  ],
  alchemist: [
    { when: { type: 'enemiesInRow', n: 2 }, ability: 'firebomb', target: 'nearest' },
    { when: { type: 'allyHpBelow', pct: 55 }, ability: 'draught', target: 'lowestHpPct' },
    { when: { type: 'allyTargetedByMelee' }, ability: 'smokeBomb', target: 'self' },
    { when: { type: 'always' }, ability: 'attack', target: 'highestHp' },
  ],
};

export function defaultRules(hero: Hero): Rule[] {
  return DEFAULT_RULES[hero.job].slice(0, RULE_SLOTS[hero.rank]);
}
