// Auto-tactics: a plan built from each hero's stats, kit, rank and personality,
// plus whatever scouting revealed about the enemy. Every decision comes with a
// short reason, so the player can learn from it or override it.
import { ABILITIES } from '../data/abilities.ts';
import { JOB_DEFS, type Role } from '../data/jobs.ts';
import type { Hero } from '../types.ts';
import { RULE_SLOTS } from './rules.ts';
import type { ScoutReport } from './scout.ts';
import type { Condition, Contingency, Rule, Slot, Stance, TargetPick } from './types.ts';

export interface PlanNote { heroId?: string; text: string }
export interface Plan {
  formation: Record<string, Slot>;
  captain: string;
  stance: Stance;
  rules: Record<string, Rule[]>;
  contingencies: Contingency[];
  notes: PlanNote[];
}

const first = (h: Hero) => h.name.split(' ')[0];
const has = (h: Hero, ab: string) => JOB_DEFS[h.job].abilities.includes(ab);
const roles = (h: Hero) => JOB_DEFS[h.job].roles;
const meleeBasic = (h: Hero) => !!ABILITIES[JOB_DEFS[h.job].basic].melee;
const isHealer = (h: Hero) => roles(h).includes('healer') || has(h, 'draught');
/** How well a hero can stand in the front row and take hits. */
export const toughness = (h: Hero) => h.stats.CON + (roles(h).includes('tank') ? 25 : 0) + (h.trait === 'ironSkin' ? 15 : 0) + (meleeBasic(h) ? 5 : -15);

/** What the scouts saw, as counts by role. Unknown enemies count for nothing. */
function intelRoles(intel?: ScoutReport | null): Record<Role, number> {
  const out: Record<Role, number> = { tank: 0, healer: 0, caster: 0, melee: 0, ranged: 0, support: 0 };
  for (const u of intel?.revealed ?? []) for (const r of JOB_DEFS[u.job].roles) out[r]++;
  return out;
}

// ------------------------------------------------------------- formation --
function planFormation(heroes: Hero[], notes: PlanNote[]): Record<string, Slot> {
  const out: Record<string, Slot> = {};
  const byTough = [...heroes].sort((a, b) => toughness(b) - toughness(a) || b.ovr - a.ovr);
  // The front row soaks every melee blow until it falls, so it takes the toughest heroes.
  const sturdy = byTough.filter((h) => roles(h).includes('tank') || (meleeBasic(h) && h.stats.CON >= 55 && !roles(h).includes('healer')));
  const frontN = Math.max(1, Math.min(3, sturdy.length));
  const front = (sturdy.length ? sturdy : byTough).slice(0, frontN);
  const rest = heroes.filter((h) => !front.includes(h));
  // Casters and healers go to the back, squishiest in the centre (side columns take flanking bonuses).
  const back = rest.filter((h) => !meleeBasic(h) && (roles(h).includes('caster') || roles(h).includes('healer')))
    .sort((a, b) => a.stats.CON - b.stats.CON).slice(0, 3);
  const middle = rest.filter((h) => !back.includes(h));
  const cols = [1, 0, 2] as const;
  front.forEach((h, i) => { out[h.id] = { row: 0, col: cols[i] }; });
  // Put back-row heroes behind a front-row ally where possible: that column's cover cuts ranged damage.
  const covered = new Set(front.map((h) => out[h.id].col));
  const backCols = [...cols].sort((a, b) => Number(covered.has(b)) - Number(covered.has(a)));
  back.forEach((h, i) => { out[h.id] = { row: 2, col: backCols[i] }; });
  const freeMid = [...cols];
  middle.forEach((h) => {
    const col = freeMid.shift();
    if (col !== undefined) out[h.id] = { row: 1, col };
    else { const c = cols.find((c) => !Object.values(out).some((s) => s.row === 2 && s.col === c))!; out[h.id] = { row: 2, col: c }; }
  });
  if (front.length) notes.push({ text: `Front row: ${front.map((h) => `${first(h)} (CON ${h.stats.CON})`).join(', ')}, the toughest heroes, take the melee.` });
  if (middle.length) notes.push({ text: `Middle: ${middle.map(first).join(', ')}. Melee and ranged attacks reach from anywhere, so they stay out of the front line.` });
  if (back.length) notes.push({ text: `Back row: ${back.map(first).join(', ')}, the frailest in the centre where flanking can't reach them${back.some((h) => covered.has(out[h.id].col)) ? ', behind a front-liner for cover' : ''}.` });
  return out;
}

// ----------------------------------------------------------------- rules --
interface Cand { rule: Rule; score: number; tier: number; why: string }   // tier: 0 emergency … 4 filler
const R = (when: Condition, ability: string, target: TargetPick): Rule => ({ when, ability, target });

function candidates(h: Hero, party: Hero[], intel: Record<Role, number>): Cand[] {
  const s = h.stats, c: Cand[] = [];
  const backline = party.filter((x) => !meleeBasic(x)).length;
  const frail = s.CON < 45;
  const healers = party.filter(isHealer).length;
  const add = (rule: Rule, score: number, tier: number, why: string) => { if (rule.ability === 'attack' || has(h, rule.ability)) c.push({ rule, score, tier, why }); };
  const healAt = healers > 1 ? 55 : 65;
  // emergencies and self-preservation
  add(R({ type: 'allyHpBelow', pct: 30 }, 'layOnHands', 'lowestHpPct'), 95, 0, 'saves Lay on Hands for an ally below 30%');
  add(R({ type: 'selfHpBelow', pct: frail ? 50 : 35 }, 'shieldWall', 'self'), 60 + (100 - s.CON) / 4, 0, `raises Shield Wall below ${frail ? 50 : 35}% HP`);
  add(R({ type: 'selfHpBelow', pct: frail ? 55 : 40 }, 'evade', 'self'), 55 + (100 - s.CON) / 3, 0, `Evades when hurt (CON ${s.CON})`);
  add(R({ type: 'selfHpBelow', pct: 40 }, 'innerPeace', 'self'), 65, 0, 'meditates back to health below 40%');
  // healing, tuned by how much healing the party has
  add(R({ type: 'alliesBelow', n: 2, pct: 60 }, 'groupHeal', 'self'), 80 + s.WIS / 5, 1, 'group-heals when two allies are below 60%');
  add(R({ type: 'allyHpBelow', pct: healAt }, 'heal', 'lowestHpPct'), 85 + s.WIS / 5, 1, `heals anyone under ${healAt}% (WIS ${s.WIS})`);
  add(R({ type: 'allyHpBelow', pct: healAt + 10 }, 'regrowth', 'lowestHpPct'), 78 + s.WIS / 5, 1, `regrows anyone under ${healAt + 10}%`);
  add(R({ type: 'allyHpBelow', pct: 50 }, 'draught', 'lowestHpPct'), 60 + s.WIS / 5, 1, 'throws a Healing Draught to anyone under 50%');
  // protecting the back line
  add(R({ type: 'allyTargetedByMelee' }, 'taunt', 'self'), backline >= 2 && s.CON >= 55 ? 75 + s.CON / 5 : 30, 1, `taunts when melee reaches an ally (CON ${s.CON}, ${backline} in the back)`);
  add(R({ type: 'allyTargetedByMelee' }, 'guard', 'lowestHpPct'), backline >= 2 ? 72 : 35, 1, 'guards whoever melee is hitting');
  add(R({ type: 'allyTargetedByMelee' }, 'barkskin', 'lowestHpPct'), 55, 2, 'barkskins an ally under melee attack');
  add(R({ type: 'allyHpBelow', pct: 50 }, 'arcaneShield', 'lowestHpPct'), 45 + s.INT / 6, 2, 'shields a wounded ally');
  add(R({ type: 'allyHpBelow', pct: 50 }, 'ward', 'lowestHpPct'), 45 + s.INT / 6, 2, 'wards a wounded ally');
  add(R({ type: 'allyTargetedByMelee' }, 'smokeBomb', 'self'), 50, 2, 'drops smoke when melee arrives');
  // openers and team buffs, worth more with high CHA
  add(R({ type: 'turnAtLeast', n: 1 }, 'auraOfCourage', 'self'), 50 + s.CHA / 3, 2, `opens with Aura of Courage (CHA ${s.CHA})`);
  add(R({ type: 'turnAtLeast', n: 1 }, 'inspire', 'self'), 55 + s.CHA / 3, 2, `opens with Inspire (CHA ${s.CHA})`);
  add(R({ type: 'turnAtLeast', n: 2 }, 'dissonance', 'nearest'), 45 + s.CHA / 3, 2, 'follows with Dissonance');
  add(R({ type: 'turnAtLeast', n: 1 }, 'callFamiliar', 'self'), 85, 2, 'calls a familiar first');
  add(R({ type: 'turnAtLeast', n: 1 }, 'raiseDead', 'self'), 75, 2, 'raises the fallen whenever there are any');
  // control, aimed at what the scouts saw
  add(R({ type: 'enemyRole', role: 'caster' }, 'silence', 'casters'), 40 + intel.caster * 15, 2, intel.caster ? `silences the ${intel.caster} caster${intel.caster > 1 ? 's' : ''} the scouts saw` : 'silences casters');
  add(R({ type: 'enemyRole', role: 'healer' }, 'fear', 'healers'), 35 + intel.healer * 15, 3, 'frightens healers');
  add(R({ type: 'enemyRole', role: 'caster' }, 'lullaby', 'casters'), 40 + intel.caster * 10, 3, 'sings casters to sleep');
  add(R({ type: 'enemyRole', role: 'caster' }, 'pin', 'casters'), 40 + intel.caster * 10, 3, 'pins casters');
  add(R({ type: 'enemyRole', role: 'caster' }, 'pressurePoint', 'casters'), 45 + intel.caster * 10, 3, 'stuns casters');
  add(R({ type: 'turnAtLeast', n: 1 }, 'curse', 'highestHp'), 55 + s.INT / 5, 3, 'curses the toughest enemy');
  // area damage when enemies bunch up
  for (const [ab, n] of [['fireball', 2], ['firebomb', 2], ['cleave', 2], ['volley', 3], ['frostNova', 2], ['entangle', 2]] as const)
    add(R({ type: 'enemiesInRow', n }, ab, 'nearest'), 60 + (ABILITIES[ab].stat === 'DEX' ? s.DEX : ab === 'cleave' ? s.STR : s.INT) / 4, 3, `uses ${ABILITIES[ab].name} on ${n}+ enemies in a row`);
  // divers: go for whoever the scouts saw at the back, healers first if any
  const dive: TargetPick = intel.healer > 0 && intel.healer >= intel.caster ? 'healers' : 'casters';
  add(R({ type: 'enemyRole', role: dive === 'healers' ? 'healer' : 'caster' }, 'backstab', dive), 80 + s.DEX / 5, 3, `backstabs ${dive} first`);
  add(R({ type: 'always' }, 'backstab', 'lowestHpPct'), 60, 3, 'backstabs the most wounded otherwise');
  add(R({ type: 'always' }, 'poison', 'casters'), 50, 4, 'throws poison darts at casters');
  add(R({ type: 'always' }, 'flurry', 'lowestHpPct'), 55 + s.DEX / 5, 4, 'flurries the most wounded');
  if (party.some((x) => has(x, 'mark'))) add(R({ type: 'targetHas', status: 'marked' }, 'attack', 'lowestHp'), has(h, 'mark') ? 70 : 40, 3, 'hits marked targets first');
  add(R({ type: 'always' }, 'mark', 'lowestHpPct'), 55, 4, 'marks the most wounded');
  // the steady default, aimed by role
  const aim: TargetPick = roles(h).includes('caster') || roles(h).includes('ranged') ? 'lowestHpPct' : meleeBasic(h) ? 'nearest' : 'lowestHp';
  add(R({ type: 'always' }, 'attack', aim), aim === 'nearest' ? 20 : 62, 4, `otherwise attacks the ${aim === 'nearest' ? 'nearest enemy' : 'most wounded enemy'}`);
  return c;
}

export function planRules(h: Hero, party: Hero[], intel?: ScoutReport | null): { rules: Rule[]; why: string[] } {
  const slots = RULE_SLOTS[h.rank];
  const picked = candidates(h, party, intelRoles(intel)).sort((a, b) => b.score - a.score).slice(0, slots)
    .sort((a, b) => a.tier - b.tier || b.score - a.score);
  return { rules: picked.map((p) => p.rule), why: picked.map((p) => p.why) };
}

// --------------------------------------------------------- the whole plan --
export function autoPlan(heroes: Hero[], intel?: ScoutReport | null): Plan {
  const notes: PlanNote[] = [];
  const formation = planFormation(heroes, notes);
  const er = intelRoles(intel);
  const tanks = heroes.filter((h) => roles(h).includes('tank')).length;
  const healers = heroes.filter(isHealer).length;
  const backline = heroes.filter((h) => formation[h.id].row === 2).length;
  const brawlers = heroes.filter((h) => meleeBasic(h) && !roles(h).includes('tank')).length;

  // Captain: Charisma feeds everyone's discipline, but only while the captain stands,
  // so prefer someone out of the front line unless a front-liner is far more charismatic.
  const capScore = (h: Hero) => h.stats.CHA + (formation[h.id].row > 0 ? 8 : 0) + (h.personality === 'steady' || h.personality === 'loyal' ? 3 : 0);
  const cap = [...heroes].sort((a, b) => capScore(b) - capScore(a) || b.ovr - a.ovr)[0];
  notes.push({ heroId: cap.id, text: `Captain: ${first(cap)} (CHA ${cap.stats.CHA})${formation[cap.id].row > 0 ? ', safely out of the front line' : ''}. ${JOB_DEFS[cap.job].captain}.` });

  let stance: Stance, why: string;
  if (er.healer >= 2 || (er.healer >= 1 && brawlers + heroes.filter((h) => roles(h).includes('ranged')).length >= 2)) { stance = 'focus'; why = `the scouts saw ${er.healer} healer${er.healer > 1 ? 's' : ''}, so everyone finishes the same target before it can be healed`; }
  else if (tanks >= 1 && backline >= 2 && healers >= 1) { stance = 'protect'; why = `${backline} heroes in the back and a tank to cover them`; }
  else if (brawlers >= 3 || (healers === 0 && brawlers >= 2)) { stance = 'aggressive'; why = `${brawlers} melee fighters want the battle short${healers ? '' : ', and there is no healer to make a long fight pay'}`; }
  else if (healers >= 2) { stance = 'defensive'; why = `${healers} healers win long fights`; }
  else { stance = 'balanced'; why = 'a mixed party with no clear edge to press'; }
  notes.push({ text: `Stance: ${stance === 'focus' ? 'Focus Fire' : stance === 'protect' ? 'Protect the Back Line' : stance[0].toUpperCase() + stance.slice(1)}, because ${why}.` });

  const rules: Record<string, Rule[]> = {};
  for (const h of heroes) {
    const r = planRules(h, heroes, intel);
    rules[h.id] = r.rules;
    notes.push({ heroId: h.id, text: `${first(h)} (${JOB_DEFS[h.job].name}, ${RULE_SLOTS[h.rank]} rule slots): ${r.why.join('; ')}.` });
    if (h.personality === 'reckless' || h.personality === 'greedy' || h.personality === 'gloryseeker')
      notes.push({ heroId: h.id, text: `${first(h)} is ${h.personality === 'gloryseeker' ? 'a glory-seeker' : h.personality} and will sometimes ignore these orders.` });
  }

  const contingencies: Contingency[] = [];
  const healer = heroes.find(isHealer);
  if (healer && stance !== 'aggressive') { contingencies.push({ when: { type: 'falls', who: 'anyHealer' }, then: { stance: 'aggressive' } }); notes.push({ text: 'If a healer falls, turn Aggressive: a long fight is lost without healing.' }); }
  if (stance !== 'aggressive') { contingencies.push({ when: { type: 'bossHpBelow', pct: 30 }, then: { stance: 'aggressive' } }); notes.push({ text: 'When their leader drops below 30%, go Aggressive to finish them.' }); }
  if (backline >= 2) { contingencies.push({ when: { type: 'downTo', n: 2 }, then: { retreat: true } }); notes.push({ text: 'Down to two heroes: everyone falls back.' }); }
  return { formation, captain: cap.id, stance, rules, contingencies: contingencies.slice(0, 3), notes };
}

/** Pick a party from a collection: the strongest heroes, but make room for a tank and a healer. */
export function autoPick(collection: Hero[], size = 5): { heroes: Hero[]; notes: string[] } {
  const byOvr = [...collection].sort((a, b) => b.ovr - a.ovr);
  const pick = byOvr.slice(0, size);
  const notes: string[] = [];
  const cutoff = pick.at(-1)?.ovr ?? 0;
  const need = (test: (h: Hero) => boolean, label: string) => {
    if (pick.some(test)) return;
    const cand = byOvr.find((h) => test(h) && !pick.includes(h) && h.ovr >= cutoff - 12);
    if (!cand) return;
    // swap out the weakest hero who isn't the party's only tank or only healer
    const sole = (h: Hero) => (roles(h).includes('tank') && pick.filter((x) => roles(x).includes('tank')).length === 1) || (isHealer(h) && pick.filter(isHealer).length === 1);
    const out = [...pick].sort((a, b) => a.ovr - b.ovr).find((h) => !sole(h));
    if (!out) return;
    pick.splice(pick.indexOf(out), 1, cand);
    notes.push(`${first(cand)} (${cand.ovr}) comes in for ${first(out)} (${out.ovr}) so the party has a ${label}.`);
  };
  need((h) => roles(h).includes('tank'), 'tank');
  need(isHealer, 'healer');
  return { heroes: pick, notes };
}

