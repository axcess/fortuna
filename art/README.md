# Painted room art

Drop a 320×180 PNG here named after a room (`office.png`, `hall.png`, `tavern.png`, `yard.png`, `inn.png`, `academy.png`) and the game uses it as that room's background. A room without an image keeps its drawn art.

A painted room also needs an `alt` layout in `js/scenes.js` with its clickable zones and animation anchors fitted to the image. The office and hall have one so far.

`source/` keeps the full-size originals (1280×720). The game files are those shrunk to 320×180 with box (area-average) resampling; no palette reduction.

- `office.png`: generated with Z-Image Turbo in ComfyUI.
- `hall.png`: generated with Nano Banana 2.1, using the office as a style reference.
