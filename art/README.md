# Painted room art

Drop a 320×180 PNG here named after a room (`office.png`, `hall.png`, `tavern.png`, `yard.png`, `inn.png`, `academy.png`) and the game uses it as that room's background. A room without an image keeps its drawn art.

A painted room also needs an `alt` layout in `js/scenes.js` with its clickable zones and animation anchors fitted to the image. The office, hall, tavern and yard have one so far. A room can also list upgrade variants (`yard_2.png`, `yard_3.png`) that replace the base image as its facility level rises.

`source/` keeps the full-size originals (1280×720). The game files are those shrunk to 320×180 with box (area-average) resampling; no palette reduction.

- `office.png`: generated with Z-Image Turbo in ComfyUI.
- `hall.png`: generated with Nano Banana 2.1, using the office as a style reference.
- `tavern.png`: generated with Nano Banana 2.1, using the office and hall as style references.
- `yard.png`, `yard_2.png`, `yard_3.png`: generated with Nano Banana 2.1 (levels 1–3; the upgrades are edits of the base image).
