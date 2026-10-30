// Game state for the browser UI: the collection, packs, the party setup and the next opponent.
import { autoFormation, makeParty } from '../src/engine/battle/party.ts';
import { defaultRules } from '../src/engine/battle/rules.ts';
import type { Contingency, Party, Rule, Slot, Stance } from '../src/engine/battle/types.ts';
import { generateHero } from '../src/engine/hero.ts';
import { autoPick, autoPlan } from '../src/engine/battle/planner.ts';
import { scout } from '../src/engine/battle/scout.ts';
import { makeRng, mixSeed } from '../src/engine/rng.ts';
import type { Hero } from '../src/engine/types.ts';

export interface PartyCfg {
  ids: string[];
  formation: Record<string, Slot>;
  captain: string;
  stance: Stance;
  rules: Record<string, Rule[]>;
  contingencies: Contingency[];
}
export interface Save {
  v: 1;
  seed: number;
  collection: Hero[];
  packs: number;
  opened: number;            // packs opened so far (pack seeds derive from this)
  wins: number;
  losses: number;
  battles: number;
  party: PartyCfg;
  auto?: boolean;            // re-plan automatically before every fight
}

const KEY = 'auto_battler_v1';
export const PARTY_SIZE = 5;
export const PACK_SIZE = 5;

export function openPack(s: Save): Hero[] {
  const rng = makeRng(mixSeed(s.seed, 1000 + s.opened));
  s.opened++;
  s.packs--;
  const heroes = Array.from({ length: PACK_SIZE }, () => generateHero(rng.seed()));
  s.collection.push(...heroes);
  return heroes;
}

export function partyHeroes(s: Save): Hero[] {
  return s.party.ids.map((id) => s.collection.find((h) => h.id === id)).filter((h): h is Hero => !!h);
}

/** Pick the strongest five and lay them out with default rules. */
export function autoParty(s: Save, keep?: Partial<PartyCfg>): PartyCfg {
  const best = [...s.collection].sort((a, b) => b.ovr - a.ovr).slice(0, PARTY_SIZE);
  return fromHeroes(best, keep);
}
export function fromHeroes(heroes: Hero[], keep?: Partial<PartyCfg>): PartyCfg {
  return {
    ids: heroes.map((h) => h.id),
    formation: autoFormation(heroes),
    captain: [...heroes].sort((a, b) => b.stats.CHA - a.stats.CHA)[0]?.id ?? '',
    stance: keep?.stance ?? 'balanced',
    rules: Object.fromEntries(heroes.map((h) => [h.id, defaultRules(h)])),
    contingencies: keep?.contingencies ?? [{ when: { type: 'falls', who: 'anyHealer' }, then: { stance: 'aggressive' } }],
  };
}

export function toParty(s: Save, name: string): Party {
  return { name, heroes: partyHeroes(s), ...s.party };
}

const BANDS = ["Grimsby's Raiders", 'The Ashgrove Company', 'Black Briar Band', 'Hollowmere Wardens', 'The Copperkettle Irregulars',
  'Duskwood Reavers', 'The Stonebrow Shields', 'Larkspur Lancers'];
const STANCES: Stance[] = ['aggressive', 'balanced', 'defensive', 'focus', 'protect'];

/** An opponent near the player's strength, fixed for each battle number. */
export function opponent(s: Save): { party: Party; seed: number } {
  const seed = mixSeed(s.seed, 50_000 + s.battles);
  const rng = makeRng(seed);
  const mine = partyHeroes(s);
  const avg = mine.reduce((t, h) => t + h.ovr, 0) / Math.max(1, mine.length);
  const target = avg + Math.min(6, s.wins - s.losses);   // a little harder while you're winning
  const heroes: Hero[] = [];
  for (let tries = 0; heroes.length < PARTY_SIZE; tries++) {
    const h = generateHero(rng.seed());
    if (Math.abs(h.ovr - target) <= 7 || tries > 400) heroes.push(h);
  }
  const party = makeParty(rng.pick(BANDS), heroes, { stance: rng.pick(STANCES) });
  party.boss = [...heroes].sort((a, b) => b.ovr - a.ovr)[0].id;
  return { party, seed };
}

export function newSave(seed = 20261030): Save {
  const s: Save = { v: 1, seed, collection: [], packs: 2, opened: 0, wins: 0, losses: 0, battles: 0, party: { ids: [], formation: {}, captain: '', stance: 'balanced', rules: {}, contingencies: [] } };
  openPack(s);   // a starter pack, already opened
  s.packs = 1;   // and one waiting
  s.party = autoParty(s, { stance: 'protect' });
  return s;
}

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as Save; if (s.v === 1) return s; }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return newSave();
}
export function save(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* fine without it */ }
}

/** Apply the auto-planner to the current party, using what the scouts can see of the next opponent. */
export function planNow(s: Save): string[] {
  const opp = opponent(s);
  const heroes = partyHeroes(s);
  if (!heroes.length) return [];
  const p = autoPlan(heroes, scout(opp.seed, toParty(s, 'You'), opp.party));
  Object.assign(s.party, { formation: p.formation, captain: p.captain, stance: p.stance, rules: p.rules, contingencies: p.contingencies });
  return p.notes.map((n) => n.text);
}

/** Choose the best five (with room for a tank and a healer), then plan for them. */
export function pickAndPlan(s: Save): string[] {
  const pick = autoPick(s.collection, PARTY_SIZE);
  s.party.ids = pick.heroes.map((h) => h.id);
  return [`Party: ${pick.heroes.map((h) => `${h.name.split(' ')[0]} (${h.ovr})`).join(', ')}.`, ...pick.notes, ...planNow(s)];
}
