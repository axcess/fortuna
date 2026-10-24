# Art guides

Layout references for making replacement art (for example with ComfyUI). Every room is exported empty: no people, no paperwork, plain daytime light.

| File | Use |
|---|---|
| `<room>_320x180.png` | The room at the game's native size. |
| `<room>_1280x720.png` | The same, scaled up 4× with hard pixels. Feed this to ControlNet or img2img. |
| `<room>_zones.png` | The clickable areas outlined (yellow: things, blue: exits). New art must keep these objects in these boxes, or the hotspots won't line up. |
| `palette_swatches.png` | Every colour ramp the game's art uses, labelled by material. |
| `palette_strip.png`, `palette.hex` | The same 78 colours as a 1-pixel strip and a hex list, for palette-quantize nodes. |

Rooms: `office`, `hall`, `tavern`, `yard`, `inn`, `academy`.

Finished art should come back at exactly 320×180. People, the inbox pile, lighting and other animated layers are drawn on top by the game, so leave them out.
