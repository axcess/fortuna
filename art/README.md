# Painted room art

Drop a 640×360 PNG here named after a room (`office.png`, `hall.png`, `tavern.png`, `yard.png`, `inn.png`, `academy.png`) and the game uses it as that room's background. A room without an image keeps its drawn art.

A painted room also needs an `alt` layout in `js/scenes.js` with its clickable zones and animation anchors fitted to the image. All six rooms have one. A room can also list upgrade variants (`yard_2.png`, `yard_3.png`, `inn_infirmary.png`) that replace the base image as facilities are built.

`source/` keeps the full-size originals. The game files are those shrunk to 640×360 with box (area-average) resampling; no palette reduction. The game draws at 640×360 but its coordinates stay in 320×180 units (`RES = 2` in `js/scenes.js`).

- `office.png`: generated with Z-Image Turbo in ComfyUI.
- `hall.png`: generated with Nano Banana 2.1, using the office as a style reference.
- `tavern.png`: generated with Nano Banana 2.1, using the office and hall as style references.
- `yard.png`, `yard_2.png`, `yard_3.png`: generated with Nano Banana 2.1 (levels 1–3; the upgrades are edits of the base image).
- `inn.png`, `inn_infirmary.png`: generated with Nano Banana 2.1 (the infirmary version is an edit of the base).
- `academy.png`: generated with Nano Banana 2.1.

## Character sprites

`sprites/` holds cut-out characters made from lineup sheets on a flat magenta (#FF00FF) background, e.g. `source/cast_starters_standing.jpg` (Nano Banana 2.1). Cut a sheet with:

    python3 tools/cut_sprites.py art/source/cast_starters_standing.jpg brom pip tamsin kael

Names go left to right. It keys out the magenta, removes the magenta fringe, separates the figures (they mustn't touch; a weapon reaching over a neighbour is fine), shrinks every sheet by the same factor (a human ends up 56 px tall), and writes `<name>_stand.png`, a 96×96 `<name>_portrait.png`, `manifest.json` and `js/sprites.js`. `Scenes.SPRITE_OF` in `js/scenes.js` maps a named character's full name to their sprite.

Recruit looks are named `<class>_<variant>` (for example `warrior_orc`, `mage_gnome`). Every member without a named sprite gets one of their class's looks, chosen from their id so it never changes. The class sheets so far:

    python3 tools/cut_sprites.py art/source/class_warrior.jpg warrior_human warrior_orc warrior_dwarf warrior_elf
    python3 tools/cut_sprites.py art/source/class_mage.jpg mage_human mage_orc mage_gnome mage_elf
    python3 tools/cut_sprites.py art/source/class_rogue.jpg rogue_human rogue_orc rogue_dwarf rogue_elf
    python3 tools/cut_sprites.py art/source/class_paladin.jpg paladin_dwarf paladin_human paladin_orc paladin_elf
    python3 tools/cut_sprites.py art/source/class_cleric.jpg cleric_human cleric_orc cleric_dwarf cleric_elf

    python3 tools/cut_sprites.py art/source/class_summoner.jpg summoner_human summoner_orc summoner_dwarf summoner_elf
    python3 tools/cut_sprites.py art/source/class_bard.jpg bard_human bard_halfling bard_orc bard_elf
    python3 tools/cut_sprites.py art/source/class_alchemist.jpg alchemist_dwarf alchemist_human alchemist_gnome alchemist_orc
    python3 tools/cut_sprites.py art/source/class_monk.jpg monk_human monk_orc monk_dwarf monk_elf
    python3 tools/cut_sprites.py art/source/class_witch.jpg witch_human witch_orc witch_halfling witch_elf
    python3 tools/cut_sprites.py art/source/familiars.jpg fam_golem fam_whelp fam_wisp fam_fox fam_raven fam_lantern --noportrait

Familiars (`fam_*`) are drawn beside summoners; `Scenes.FLOATS` lists the ones that hover. Rangers and staff have no sheets yet and are still drawn procedurally.
