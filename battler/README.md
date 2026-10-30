# Hero Card Tactics (auto battler)

A fantasy auto battler built from the auto-battler design handoff. You collect randomly generated heroes as Ultimate Team–style cards (ranks E to S), set a formation, stance, per-hero rules and contingency plans, then press Fight and watch. There is no input once a battle starts. Every action in the log names the rule, stance, default attack or disobedience behind it.

```sh
npm install
npm test             # vitest: hero generation, battle rules, determinism, a small balance check
npm run typecheck
npm run rarity       # 100k heroes → rank distribution, overall and per job
npm run balance      # random 5v5s → win rates by job/rank/stance, plus the counter triangle
node scripts/demo.ts 3   # print one battle's log and report
npm run build:ui     # bundle the browser UI to ui/dist/app.js
```

To play locally, build the UI, then serve `ui/` over HTTP (for example `python3 -m http.server` inside `ui/`) and open `index.html`. `ui/art` is a symlink to the repo's shared `art/` folder.

## Layout

| Path | What it is |
|---|---|
| `src/engine/` | Pure game logic, no DOM. Runs under Node 22 directly (type stripping), and in the browser through esbuild |
| `src/engine/hero.ts` | Seeded hero generation, OVR, ranks, tiers, `ovrByJob`, best fit |
| `src/engine/data/` | Jobs, abilities, summons, traits, personalities, tier ranges, names. Balance tuning happens here |
| `src/engine/battle/battle.ts` | The ATB battle: timeline, formation, targeting, damage, rules, stances, contingencies, discipline, event log |
| `src/engine/battle/rules.ts` | Rule slots by rank, rule text, default rules per job |
| `src/engine/battle/scout.ts`, `report.ts` | Pre-battle scouting, post-battle summary and the bard's ballad |
| `scripts/` | `rarity.ts`, `balance.ts`, `demo.ts` |
| `ui/` | The browser game: packs, roster, tactics editor, battle viewer |

## Where this departs from the handoff, and why

- **The talent roll.** Six independent bell-curve stats average out, so OVR came out within a few points of 68 and almost every hero was B or C. No choice of tier ranges can spread that to the E-to-S targets. Each hero now also rolls one bell-curved talent value (±36) that shifts all six stats. With tier ranges of 52–96 / 32–82 / 8–62, 100k heroes land within 2.2 points of every rank target.
- **Armor and resistance.** Armor is 0.9 × CON (the handoff's starting point was 0.6), and spells are resisted by 0.4 × WIS. Without the higher armor, a melee rush beat an armored front line.
- **Backstab.** Backstab (flanking) slips past a Paladin's **Guard** but not a Warrior's **Taunt**. That one rule gives the counter triangle its third edge: divers beat back-line casters.
- **Target picks.** "Casters first" and "healers first" pick the most wounded one, and Focus Fire's shared target is the most wounded enemy, so a party converges instead of spreading damage.
- **Finesse stats.** Rangers, monks and the bard's cutlass aim with DEX instead of STR. Alchemist bombs use INT.
- **Turn-based durations.** Statuses last a number of the affected unit's own turns. A status a unit puts on itself doesn't lose a turn the moment it's cast.
- **Starting mana.** Heroes start at 60% mana.
- **Summons.** They're frailer than heroes (30% of the HP formula).

## Brought over from the Guildmaster's Desk

- **Art:** every job except Necromancer uses the desk game's painted sprites and portraits (`art/sprites`), with four or eight looks per job. The battlefield is the painted training yard.
- **Jobs:** Monk, Druid, Summoner and Alchemist join the eight jobs in the handoff.
- **Familiars:** summoners call the familiars (golem, whelp, fox, raven) as real units.
- **Ballad report:** a bard in your party writes the post-battle report as a ballad.
- **Druid scouting:** druids "read the land" and count as scouts, like rangers and bards.
- **Brave trait and names:** the Brave trait (immune to Fear) and the name lists come from the desk game.

## Balance as of this commit (`npm run balance 3000`)

| Measure | Result |
|---|---|
| Win rate by job | 45–56% |
| Win rate by stance | 46–54% |
| Win rate by rank | S 73%, A 66%, B 58%, C 50%, D 41%, E 34% |
| Side bias | none (49–51%) |
| Battles hitting the tick cap | about 1% |

**Counter triangle** (rank-B archetypes):

| Matchup | Win rate |
|---|---|
| Front line vs rush | 57% |
| Casters vs front line | 90% |
| Divers vs casters | 68% |

## Open questions from the handoff (defaults taken)

- **Timing model:** ATB timeline (the recommended default).
- **Platform:** web.
- **Party size:** 5.
- **PvP:** single-player only. The engine is deterministic from seed and inputs, so async PvP against saved setups would slot in.
- **Necromancer art:** none yet. It needs a sheet made with the same Nano Banana prompts as the other jobs.
