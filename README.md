# Guildhall: Rise of the Rusty Flagon

A management sim in HTML5, CSS and plain JavaScript, in the spirit of *Dino Park Tycoon* and the Kairosoft games, set in a D&D / Warcraft-style fantasy world. You inherit a dilapidated adventurers' guild (leaking roof, rubble everywhere, a 1,500g debt) and build it into the most powerful guild in the realm.

**Play:** open `index.html` in any modern browser. No build step, no dependencies. Progress autosaves to the browser every in-game morning.

## The core loop

1. **Restore the hall.** Mark rubble for clearing, order repairs on the broken Quest Board, hearth, dummy and dice table, and patch roof leaks before it rains. Idle adventurers and caretakers do the work themselves.
2. **Take requests.** Townsfolk pin quests to the board. Assemble a party: success depends on how well the party's stats fit the quest, plus their mood, energy, gear and friendships.
3. **Grow.** Gold pays wages, meals and the Copperhand debt (an installment is due every season; three misses and you lose the hall). Renown raises your guild rank from F to S, which unlocks regions, furniture and roster space.
4. **Endgame.** At Rank S, a request appears to slay the Voidwyrm atop the Voidspire.

## Character simulation

Every adventurer, staff member and visiting townsperson is an autonomous agent walking the hall on a pathfinding grid, in the spirit of SimCity 4's Sims and The Sims.

| System | What it does |
|---|---|
| **Six needs** | Hunger, energy, hygiene, social, fun and purpose decay over time. A utility AI scores every possible action against current needs, personality and time of day, then walks to the right furniture to do it. |
| **Personality** | Two traits each (Glutton, Night Owl, Hot-headed, Pious, Bookworm, Loner, Greedy, Brave, Cowardly, Charming, Diligent, Lazy, Neat, Slob, Lucky, Drunkard), which change need decay, action choices, quest power and how people get along. |
| **Mood** | Mood comes from needs, the hall's appeal around them and stacked *moodlets* ("Dripped on all night −10", "Hearty hot stew +6", "Grieving for Pip −35"). Miserable characters have breakdowns: sulking, stress-eating the food budget, or smashing furniture. |
| **Relationships** | Pairwise affinity, from Nemesis to Best Friend, built by chatting, sharing a table, drinking, dice, bedside visits and campfires on quests. Innate chemistry, shared and clashing traits all matter. Friends fight better together; rivals brawl. |
| **Loyalty and wages** | Daily mood moves loyalty. Levelling up brings raise demands. Rival guilds try to poach the disloyal, and the truly miserable quit. |
| **Life story** | Every character keeps a biography: when they joined, quests won and lost, friendships, injuries, breakdowns, relics found in the rubble. |
| **Ownership** | Each person claims a bed. A bed under a roof leak means a bad night when it rains. |
| **Visitors** | Townsfolk come in to drink at the bar, post requests and gawk. How pleasant the hall is affects what they spend and the town's opinion of you. |

**Overlays** (top left of the hall) show Appeal, floor condition and foot traffic as heatmaps, SimCity-style. Floors wear down where people walk most.

## Controls

- Click a person or piece of furniture to inspect it. Click a name in the relationships list to jump to that person.
- **Build tab:** pick an item, then click the hall to place it. **R** rotates; right-click or **Esc** cancels.
- **Space** pauses; **1 / 2 / 3** set the speed.

## Code layout

```
index.html       page shell
css/style.css    UI theme (single dark "candlelit oak and parchment" look)
js/data.js       content tables: classes, traits, furniture, regions, quest types, names, goals
js/sim.js        world state, time, economy, pathfinding, needs/utility AI, relationships, quests
js/render.js     procedural pixel-art canvas renderer (no image assets): hall, furniture, people, lighting, weather, overlays
js/ui.js         panels, inspector, party builder, events and modals
js/main.js       boot, game loop with fixed-step simulation, save/load
```

The simulation runs at a fixed step (2 game-minutes per tick, 10 ticks per real second at normal speed) and is independent of the DOM, so `data.js` and `sim.js` can be loaded headless in Node for balance testing.
