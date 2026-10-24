#!/usr/bin/env python3
"""Cut a magenta-background character sheet into game sprites.

    python3 tools/cut_sprites.py SHEET.jpg brom pip tamsin kael [--pose stand|sit] [--noportrait]

Figures stand left to right and must not touch each other (a weapon may reach
over a neighbour, but not into them), one name per figure in that order. Writes, for each figure:
    art/sprites/<name>_<pose>.png        the sprite, at 2x game resolution
    art/sprites/<name>_portrait.png      a head-and-shoulders crop (stand only)
and updates art/sprites/manifest.json + js/sprites.js (sizes and foot anchors).

Every sheet is scaled by the same factor (SCALE), so characters from different
sheets stay the same size relative to each other, as long as the sheets were
generated at the same resolution and scale.
"""
import json, sys, os
from collections import deque

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


def components(mask):
    """Label 8-connected regions of a boolean mask (plain BFS, no scipy)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n; q.append((yy, xx))
    return lab, n


def figures(alpha, count):
    """One mask per figure, left to right. Figures are the big connected shapes;
    stray bits (a detached arrow, a strap) join the figure nearest to them. Works
    even when a weapon reaches over a neighbour's columns, as long as it doesn't touch."""
    small = alpha[::2, ::2] > 0.5
    lab, n = components(small)
    area = np.bincount(lab.ravel())[1:]
    order = np.argsort(-area)
    big = sorted(order[:count] + 1, key=lambda i: np.nonzero(lab == i)[1].mean())
    if len(big) < count or area[order[count - 1]] < area[order[0]] * 0.15:
        sys.exit(f'Found {int((area > area.max() * 0.15).sum())} figures but got {count} names '
                 '(figures must not touch each other)')
    cx = [np.nonzero(lab == i)[1].mean() for i in big]
    owner = np.zeros(n + 1, np.int32)
    for k, i in enumerate(big): owner[i] = k + 1
    for i in range(1, n + 1):
        if not owner[i]:
            owner[i] = 1 + int(np.argmin([abs(np.nonzero(lab == i)[1].mean() - c) for c in cx]))
    full = np.kron(owner[lab], np.ones((2, 2), np.int32))[:alpha.shape[0], :alpha.shape[1]]
    # grow each figure's region a little so its soft edge pixels come along
    masks = []
    for k in range(1, count + 1):
        m = full == k
        for _ in range(3):
            g = m.copy(); g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]; m = g
        masks.append(m)
    return masks


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
    masks = figures(a, len(names))
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for name, mask in zip(names, masks):
        own = np.where(mask, a, 0)
        ys, xs = np.nonzero(own > 0.5)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        fa, ff = own[y0:y1, x0:x1], fg[y0:y1, x0:x1]
        spr = shrink(ff, fa, SCALE)
        spr.save(os.path.join(OUT, f'{name}_{pose}.png'))
        w, h = spr.size
        # foot anchor: the middle of whatever touches the bottom 8% of the figure
        al = np.asarray(spr)[..., 3] > 0
        feet = np.where(al[int(h * 0.92):].any(0))[0]
        foot_x = int(round((feet[0] + feet[-1]) / 2)) if len(feet) else w // 2
        entry = manifest.setdefault(name, {})
        entry[pose] = {'w': w, 'h': h, 'fx': foot_x}
        if pose == 'stand' and '--noportrait' not in sys.argv:
            # portrait: a square around the head. Centre on the body (feet) and find the
            # top of the head in a narrow middle band, so a sword hilt or staff poking
            # up over a shoulder doesn't count as the head.
            H = fa.shape[0]
            feet_src = np.where((fa[int(H * 0.92):] > 0.5).any(0))[0]
            cx = (feet_src[0] + feet_src[-1]) / 2 if len(feet_src) else fa.shape[1] / 2
            band = fa[:, int(max(0, cx - H * 0.05)):int(cx + H * 0.05) + 1] > 0.5
            head_top = int(np.argmax(band.sum(1) >= 3))
            side = int((H - head_top) * 0.36)
            top0 = max(0, head_top - int(side * 0.06))
            left = int(max(0, min(fa.shape[1] - side, cx - side / 2))) if fa.shape[1] >= side else 0
            crop_a = np.zeros((side, side)); crop_f = np.zeros((side, side, 3))
            pa = fa[top0:top0 + side, left:left + side]; pf = ff[top0:top0 + side, left:left + side]
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
