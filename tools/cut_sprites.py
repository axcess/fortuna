#!/usr/bin/env python3
"""Cut a magenta-background character sheet into game sprites.

    python3 tools/cut_sprites.py SHEET.jpg brom pip tamsin kael [--pose stand|sit]

Figures must stand left to right with empty magenta gaps between them, one
name per figure in that order. Writes, for each figure:
    art/sprites/<name>_<pose>.png        the sprite, at 2x game resolution
    art/sprites/<name>_portrait.png      a head-and-shoulders crop (stand only)
and updates art/sprites/manifest.json + js/sprites.js (sizes and foot anchors).

Every sheet is scaled by the same factor (SCALE), so characters from different
sheets stay the same size relative to each other, as long as the sheets were
generated at the same resolution and scale.
"""
import json, sys, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art', 'sprites')
# sheet pixels -> game pixels (2x resolution). Calibrated on the starter sheet:
# a human (Tamsin, 681px head to foot) becomes 56px, i.e. 28 game units.
SCALE = 56 / 681
BG = np.array([252, 6, 253], float)


def key_out(rgb):
    """Alpha from distance to the magenta key, and colour with the key un-mixed."""
    d = np.sqrt(((rgb - BG) ** 2).sum(-1))
    a = np.clip((d - 40) / 70, 0, 1)
    safe = np.maximum(a, 1e-3)[..., None]
    fg = np.clip((rgb - (1 - a[..., None]) * BG) / safe, 0, 255)
    return despill(fg, a), a


def despill(fg, a, reach=8):
    """Pull magenta out of pixels within `reach` of the background (JPEG fringe)."""
    near = a < 0.99
    for _ in range(reach):
        g = near.copy()
        g[1:] |= near[:-1]; g[:-1] |= near[1:]; g[:, 1:] |= near[:, :-1]; g[:, :-1] |= near[:, 1:]
        near = g
    r, gr, b = fg[..., 0], fg[..., 1], fg[..., 2]
    spill = np.clip(np.minimum(r, b) - gr, 0, None) * near
    out = fg.copy()
    out[..., 0] -= spill * 0.8; out[..., 2] -= spill * 0.8
    return np.clip(out, 0, 255)


def figures(alpha):
    """Column spans of figures separated by empty columns."""
    cols = (alpha > 0.5).sum(0) > 2
    spans, start = [], None
    for x, on in enumerate(cols):
        if on and start is None: start = x
        if not on and start is not None:
            if x - start > 20: spans.append((start, x))
            start = None
    if start is not None: spans.append((start, len(cols)))
    return spans


def shrink(fg, a, factor):
    """Area-average in premultiplied space, then snap alpha to on/off for crisp pixels."""
    h, w = a.shape
    rgba = np.dstack([fg * a[..., None], a * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBa')   # premultiplied
    nw, nh = max(1, round(w * factor)), max(1, round(h * factor))
    small = np.asarray(im.resize((nw, nh), Image.BOX).convert('RGBA')).copy()
    small[..., 3] = np.where(small[..., 3] >= 128, 255, 0)
    return Image.fromarray(small, 'RGBA')


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    pose = 'sit' if '--pose' in sys.argv and sys.argv[sys.argv.index('--pose') + 1] == 'sit' else 'stand'
    if pose == 'sit': args = [x for x in args if x != 'sit']
    sheet, names = args[0], args[1:]
    rgb = np.asarray(Image.open(sheet).convert('RGB')).astype(float)
    fg, a = key_out(rgb)
    spans = figures(a)
    if len(spans) != len(names):
        sys.exit(f'Found {len(spans)} figures but got {len(names)} names: spans {spans}')
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for name, (x0, x1) in zip(names, spans):
        sub = a[:, x0:x1]
        rows = np.where((sub > 0.5).sum(1) > 0)[0]
        y0, y1 = rows[0], rows[-1] + 1
        fa, ff = a[y0:y1, x0:x1], fg[y0:y1, x0:x1]
        spr = shrink(ff, fa, SCALE)
        spr.save(os.path.join(OUT, f'{name}_{pose}.png'))
        w, h = spr.size
        # foot anchor: the middle of whatever touches the bottom 8% of the figure
        al = np.asarray(spr)[..., 3] > 0
        feet = np.where(al[int(h * 0.92):].any(0))[0]
        foot_x = int(round((feet[0] + feet[-1]) / 2)) if len(feet) else w // 2
        entry = manifest.setdefault(name, {})
        entry[pose] = {'w': w, 'h': h, 'fx': foot_x}
        if pose == 'stand':
            # portrait: a square around the head, from the top of the figure
            head_rows = fa[: int(fa.shape[0] * 0.18)] > 0.5
            hx = np.where(head_rows.any(0))[0]
            cx = (hx[0] + hx[-1]) / 2 if len(hx) else fa.shape[1] / 2
            side = int(fa.shape[0] * 0.36)
            left = int(max(0, min(fa.shape[1] - side, cx - side / 2))) if fa.shape[1] >= side else 0
            crop_a = np.zeros((side, side)); crop_f = np.zeros((side, side, 3))
            pa = fa[:side, left:left + side]; pf = ff[:side, left:left + side]
            ox = (side - pa.shape[1]) // 2
            crop_a[:pa.shape[0], ox:ox + pa.shape[1]] = pa; crop_f[:pa.shape[0], ox:ox + pa.shape[1]] = pf
            port = shrink(crop_f, crop_a, 96 / side)
            port.save(os.path.join(OUT, f'{name}_portrait.png'))
            entry['portrait'] = True
        print(f'{name}: {pose} {w}x{h} (foot at x={foot_x})')
    json.dump(manifest, open(man_path, 'w'), indent=1, sort_keys=True)
    with open(os.path.join(ROOT, 'js', 'sprites.js'), 'w') as f:
        f.write('// Generated by tools/cut_sprites.py. Sprite sizes are in 2x game pixels; fx = foot x.\n')
        f.write("'use strict';\nconst SPRITES = " + json.dumps(manifest, sort_keys=True) + ';\n')


if __name__ == '__main__':
    main()
