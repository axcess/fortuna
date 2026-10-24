// ============================================================================
//  SCENES — point-and-click rooms drawn as 320×180 pixel art
//  Each room has a cached static layer (re-rendered when its state changes),
//  an animated layer, then time-of-day darkness and additive light on top.
// ============================================================================
'use strict';

const Scenes = { cur: 'office', frame: 0, cache: {} };
const SW = 320, SH = 180;

// ------------------------------------------------------------------ toolkit --
const Art = {};
Art.px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const px = Art.px;
Art.hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
Art.shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, v + amt));
  return '#' + ((1 << 24) + (f(n >> 16) << 16) + (f((n >> 8) & 255) << 8) + f(n & 255)).toString(16).slice(1);
};
Art.BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
Art.patterns = {};
// a repeating 4×4 ordered-dither pattern: `level` (0..1) of the pixels get `color`
Art.pattern = (ctx, color, level) => {
  const k = color + level;
  if (!Art.patterns[k]) {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('2d'); g.fillStyle = color;
    for (let i = 0; i < 16; i++) if (Art.BAYER[i] < level * 16) g.fillRect(i % 4, i >> 2, 1, 1);
    Art.patterns[k] = c;
  }
  return ctx.createPattern(Art.patterns[k], 'repeat');
};
Art.dither = (ctx, x, y, w, h, color, level) => { ctx.fillStyle = Art.pattern(ctx, color, level); ctx.fillRect(x, y, w, h); };
// vertical banded gradient with dithered seams between bands
Art.vgrad = (ctx, x, y, w, h, cols) => {
  const bh = h / cols.length;
  cols.forEach((c, i) => px(ctx, x, y + i * bh, w, bh + 1, c));
  cols.forEach((c, i) => { if (i) { Art.dither(ctx, x, Math.round(y + i * bh - 3), w, 3, c, 0.5); Art.dither(ctx, x, Math.round(y + i * bh), w, 2, cols[i - 1], 0.25); } });
};
Art.disc = (ctx, cx, cy, r, c) => { ctx.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); } };
// posterised additive glow: stacked discs, brightest in the middle
Art.glow = (ctx, cx, cy, r, rgb, a) => {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 8; i >= 1; i--) Art.disc(ctx, cx, cy, Math.round(r * i / 8), `rgba(${rgb},${(a / 8).toFixed(3)})`);
  ctx.restore();
};
// a bevelled box: outline, fill, light top/left, dark bottom/right
Art.box = (ctx, x, y, w, h, r) => {
  px(ctx, x, y, w, h, r[0]); px(ctx, x + 1, y + 1, w - 2, h - 2, r[2]);
  px(ctx, x + 1, y + 1, w - 2, 1, r[3]); px(ctx, x + 1, y + 1, 1, h - 2, r[3]);
  px(ctx, x + 1, y + h - 2, w - 2, 1, r[1]); px(ctx, x + w - 2, y + 1, 1, h - 2, r[1]);
};
Art.planks = (ctx, x, y, w, h, r, size = 8, seed = 1, vertical = false) => {
  const n = Math.ceil((vertical ? w : h) / size);
  for (let i = 0; i < n; i++) {
    const v = Art.hash(i, 0, seed), base = r[v < 0.3 ? 2 : v < 0.8 ? 3 : 4] || r[3];
    if (vertical) {
      const xx = x + i * size; px(ctx, xx, y, size, h, base);
      px(ctx, xx, y, 1, h, r[1]); px(ctx, xx + 1, y, 1, h, Art.shade(base, 14));
      for (let g = 0; g < h / 9; g++) { const gy = y + Art.hash(i, g, seed + 3) * (h - 4); px(ctx, xx + 2 + Art.hash(i, g, seed) * (size - 4), gy, 1, Math.min(3 + Art.hash(g, i, seed) * 8, y + h - gy), Art.shade(base, -16)); }
    } else {
      const yy = y + i * size; px(ctx, x, yy, w, size, base);
      px(ctx, x, yy + size - 1, w, 1, r[0]); px(ctx, x, yy, w, 1, Art.shade(base, 16));
      const off = Art.hash(i, 7, seed) * 60;
      for (let sx = x - off; sx < x + w; sx += 46 + Art.hash(i, sx, seed) * 30) px(ctx, sx, yy, 1, size - 1, r[1]);
      for (let g = 0; g < w / 14; g++) { const gx = x + Art.hash(g, i, seed + 5) * w; px(ctx, gx, yy + 2 + Art.hash(i, g, seed + 9) * (size - 4), 4 + Art.hash(g, i, seed + 2) * 10, 1, Art.shade(base, -14)); }
      if (Art.hash(i, 99, seed) > 0.6) { const kx = x + Art.hash(i, 98, seed) * (w - 4); px(ctx, kx, yy + size / 2 - 1, 3, 2, r[1]); px(ctx, kx + 1, yy + size / 2 - 1, 1, 1, r[0]); }
    }
  }
};
Art.bricks = (ctx, x, y, w, h, r, bw = 16, bh = 8, seed = 2) => {
  px(ctx, x, y, w, h, r[1]);
  for (let row = 0; row * bh < h; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let bx = -off; bx < w; bx += bw) {
      const v = Art.hash(bx | 0, row, seed), base = r[v < 0.25 ? 2 : v < 0.85 ? 3 : 4];
      const X = Math.max(x, x + bx + 1), W = Math.min(x + bx + bw, x + w) - X;
      if (W <= 0) continue;
      px(ctx, X, y + row * bh + 1, W, bh - 1, base);
      px(ctx, X, y + row * bh + 1, W, 1, Art.shade(base, 18));
      px(ctx, X, y + row * bh + bh - 1, W, 1, Art.shade(base, -14));
      if (v > 0.92) px(ctx, X + W / 2, y + row * bh + 3, 2, 2, r[1]);
    }
  }
};
Art.plaster = (ctx, x, y, w, h, r, seed = 3) => {
  px(ctx, x, y, w, h, r[2]);
  for (let i = 0; i < w * h / 26; i++) { const sx = x + Art.hash(i, 1, seed) * w, sy = y + Art.hash(i, 2, seed) * h; px(ctx, sx, sy, 1, 1, Art.hash(i, 3, seed) > 0.5 ? r[1] : r[3]); }
};
Art.R = {
  oak:     ['#1c1009', '#3b2313', '#5a361c', '#7b4c27', '#9a6334', '#b97c44'],
  darkoak: ['#130b06', '#28170c', '#3d2414', '#55331c', '#6e4426', '#8a5631'],
  pine:    ['#2a1a0c', '#4e3218', '#714a24', '#946234', '#b47e46', '#d29c5e'],
  stone:   ['#1b1a20', '#302e36', '#46434d', '#5d5966', '#77727f', '#938d9a'],
  warm:    ['#241a14', '#3e2e24', '#584334', '#6f5743', '#896d55', '#a38767'],
  plaster: ['#4a3c30', '#695646', '#85705c', '#9c8670', '#b39d85', '#c7b39a'],
  brass:   ['#3a2a0e', '#6b4c14', '#a8781e', '#d8a838', '#f4d470', '#fff2b0'],
  paper:   ['#7d6c4c', '#b0a07a', '#d3c39c', '#e9dcbc', '#f6eed9', '#fffaf0'],
  iron:    ['#141419', '#2a2a33', '#43434f', '#5f5f6d', '#7f7f8e', '#a3a3b2'],
  red:     ['#2a0c0a', '#521814', '#7a241c', '#9c3426', '#bf4a34', '#de6a4a'],
  green:   ['#0d1a10', '#18301c', '#25482a', '#336238', '#457e48', '#5e9c5c'],
  blue:    ['#0c1222', '#18243e', '#26385e', '#364e7e', '#4a689c', '#6684b8'],
  violet:  ['#120c22', '#221a3e', '#34285e', '#46387c', '#5c4c9c', '#7864bc'],
};
const RR = Art.R;

// ------------------------------------------------------------ time of day ---
Scenes.hour = () => S.min / 60;
Scenes.skyCols = (h) => h < 9 ? ['#f2c48a', '#f5d6a2', '#f8e4bc', '#fbeed0']
  : h < 16 ? ['#5f9ccf', '#76b0dc', '#8fc2e6', '#acd3ee']
  : h < 18 ? ['#e6915a', '#eea76c', '#f3bd82', '#f7d29c']
  : h < 19.5 ? ['#3c2f5c', '#6a4670', '#a45e72', '#d47e6e']
  : ['#0c1024', '#121836', '#1a2244', '#222c50'];
Scenes.darkness = (h) => h < 17 ? 0 : Math.min(0.5, (h - 17) * 0.13);
Scenes.lit = () => Scenes.hour() >= 16.5;

// Where idle members hang out today (stable for the day)
Scenes.whereabouts = () => {
  const out = { hall: [], tavern: [], yard: [], inn: [], academy: [] };
  for (const a of S.roster) {
    if (a.status === 'quest') continue;
    if (a.status === 'injured') { out.inn.push(a); continue; }
    if (a.status === 'training') { (a.trainKind === 'academy' ? out.academy : out.yard).push(a); continue; }
    const h = (a.id * 7 + S.day * 3) % 10;
    (h < 4 ? out.hall : h < 8 ? out.tavern : out.yard).push(a);
  }
  return out;
};

// ------------------------------------------------------------------ people --
// feet at (x, y); about 24px tall standing
Scenes.person = (ctx, x, y, a, o = {}) => {
  x = Math.round(x); y = Math.round(y);
  const cls = a.cls;
  const cloth = o.cloth || (cls ? C.CLASSES[cls].color : '#7a6a5a');
  const skin = (a.look && a.look.skin) || '#e0ac7e', hair = (a.look && a.look.hair) || '#5a3a1a';
  const t = Scenes.frame + (a.id || 0) * 37;
  const breathe = Math.floor(t / 45) % 2;
  const blink = t % 240 < 7;
  const dir = o.dir || ((a.id || 0) % 2 ? 1 : -1);
  const O = '#140d08', pants = o.pants || '#3b2c22', boot = '#24170e';
  const dk = Art.shade(cloth, -32), lt = Art.shade(cloth, 26);
  // shadow
  ctx.fillStyle = 'rgba(10,6,4,0.35)'; ctx.fillRect(x - 6, y, 13, 1); ctx.fillRect(x - 4, y + 1, 9, 1);
  let T;
  if (o.sit) {
    T = y - 15;
    px(ctx, x - 5, y - 6, 11, 4, O); px(ctx, x - 4, y - 5, 9, 2, pants);
    px(ctx, x - 4, y - 3, 3, 3, O); px(ctx, x + 2, y - 3, 3, 3, O); px(ctx, x - 3, y - 2, 2, 2, boot); px(ctx, x + 3, y - 2, 2, 2, boot);
  } else {
    T = y - 18;
    px(ctx, x - 4, y - 8, 4, 8, O); px(ctx, x + 1, y - 8, 4, 8, O);
    px(ctx, x - 3, y - 8, 2, 6, pants); px(ctx, x + 2, y - 8, 2, 6, pants);
    px(ctx, x - 3, y - 2, 3, 2, boot); px(ctx, x + 2, y - 2, 3, 2, boot);
  }
  T += breathe;
  const th = o.sit ? 9 : 10;
  // torso
  px(ctx, x - 5, T - 1, 11, th + 1, O);
  px(ctx, x - 4, T, 9, th, cloth); px(ctx, x - 4, T, 2, th, lt); px(ctx, x + 3, T, 2, th, dk);
  if (cls === 'mage' || cls === 'cleric') px(ctx, x - 4, T + th - 1, 9, 2, cloth);
  px(ctx, x - 4, T + 6, 9, 1, '#3a2414'); px(ctx, x, T + 6, 1, 1, '#d8a838');
  if (o.apron) { px(ctx, x - 3, T + 3, 7, th - 2, '#e8e0d0'); px(ctx, x - 3, T + 3, 7, 1, '#fff'); }
  // arms
  px(ctx, x - 7, T, 3, 8, O); px(ctx, x + 5, T, 3, 8, O);
  px(ctx, x - 6, T + 1, 1, 5, dk); px(ctx, x + 6, T + 1, 1, 5, dk);
  px(ctx, x - 6, T + 6, 1, 1, skin); px(ctx, x + 6, T + 6, 1, 1, skin);
  // head
  const H = T - 8;
  px(ctx, x - 4, H - 1, 9, 9, O);
  px(ctx, x - 3, H, 7, 7, skin); px(ctx, x + 3, H, 1, 7, Art.shade(skin, -26)); px(ctx, x - 3, H + 6, 7, 1, Art.shade(skin, -18));
  const ex = dir > 0 ? 1 : -1;
  if (blink) { px(ctx, x - 2 + ex, H + 3, 2, 1, Art.shade(skin, -40)); px(ctx, x + 1 + ex, H + 3, 2, 1, Art.shade(skin, -40)); }
  else { px(ctx, x - 1 + ex, H + 3, 1, 2, '#141018'); px(ctx, x + 2 + ex, H + 3, 1, 2, '#141018'); }
  px(ctx, x + ex, H + 5, 2, 1, Art.shade(skin, -45));
  if (o.glasses) { px(ctx, x - 2 + ex, H + 3, 3, 1, '#c8c8d0'); px(ctx, x + 1 + ex, H + 3, 3, 1, '#c8c8d0'); }
  // hair
  const st = a.look ? a.look.style : 0;
  px(ctx, x - 4, H - 2, 9, 1, O); px(ctx, x - 3, H - 1, 7, 2, hair); px(ctx, x - 3, H - 1, 7, 1, Art.shade(hair, 22));
  if (st === 1) { px(ctx, x - 4, H, 1, 6, hair); px(ctx, x + 4, H, 1, 6, hair); }
  if (st === 2) { px(ctx, x - 1, H - 4, 3, 2, hair); px(ctx, x - 1, H - 5, 3, 1, O); }
  if (st === 3) { px(ctx, x - 4, H, 1, 9, hair); px(ctx, x + 4, H, 1, 9, hair); }
  if (a.look && a.look.beard) px(ctx, x - 3, H + 5, 7, 3, hair);
  // class gear
  if (cls === 'warrior') {
    px(ctx, x - 5, H - 2, 11, 5, O); px(ctx, x - 4, H - 2, 9, 4, '#8a909a'); px(ctx, x - 4, H - 2, 9, 1, '#b8bec8'); px(ctx, x, H + 1, 1, 3, '#6a707a');
    px(ctx, x - 1, H - 5, 3, 3, '#a33a2a'); px(ctx, x - 6, T, 3, 3, '#8a909a'); px(ctx, x + 4, T, 3, 3, '#8a909a');
    px(ctx, x + 7, T + 4, 1, 9, '#c8ccd2'); px(ctx, x + 6, T + 4, 3, 1, '#d8a838');
  }
  if (cls === 'mage') {
    px(ctx, x - 6, H - 1, 13, 2, O); px(ctx, x - 5, H - 1, 11, 1, dk);
    px(ctx, x - 3, H - 4, 7, 3, cloth); px(ctx, x - 2, H - 7, 5, 3, cloth); px(ctx, x, H - 9, 2, 2, cloth); px(ctx, x + 2, H - 10, 1, 1, cloth);
    px(ctx, x - 1, H - 4, 1, 1, '#f4d470');
    px(ctx, x - 9, T - 6, 1, 18, '#6b4a2b'); px(ctx, x - 10, T - 8, 3, 3, '#8ad0ff');
  }
  if (cls === 'rogue') {
    px(ctx, x - 5, H - 3, 11, 4, O); px(ctx, x - 4, H - 2, 9, 3, cloth); px(ctx, x - 4, H, 1, 7, cloth); px(ctx, x + 4, H, 1, 7, cloth);
    Art.dither(ctx, x - 3, H, 7, 3, 'rgba(10,6,4,0.8)', 0.5); px(ctx, x - 3, H + 5, 7, 2, Art.shade(cloth, -10));
    px(ctx, x - 7, T + 5, 1, 4, '#c8ccd2');
  }
  if (cls === 'cleric') {
    px(ctx, x - 3, H - 2, 7, 1, '#f4d470'); px(ctx, x - 2, T + 1, 5, 5, '#f6eed9'); px(ctx, x, T + 2, 1, 3, '#d8a838'); px(ctx, x - 1, T + 3, 3, 1, '#d8a838');
  }
  if (cls === 'ranger') {
    px(ctx, x - 5, H - 2, 11, 3, O); px(ctx, x - 4, H - 2, 9, 2, '#2f5a2a'); px(ctx, x - 5, H, 2, 6, '#2f5a2a');
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 9, T + 4, 7, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
    px(ctx, x + 5, T - 3, 2, 8, '#5a3a20'); px(ctx, x + 5, T - 4, 1, 2, '#ddd');
  }
};

// ----------------------------------------------------------- shared props ---
const door = (ctx, x, y, w, h, r = RR.oak, knob = true) => {
  Art.box(ctx, x - 3, y - 3, w + 6, h + 3, RR.darkoak);
  Art.planks(ctx, x, y, w, h, r, 6, x + y, true);
  px(ctx, x, y + 6, w, 2, RR.iron[2]); px(ctx, x, y + h - 10, w, 2, RR.iron[2]);
  if (knob) { px(ctx, x + w - 6, y + h / 2, 3, 3, RR.brass[3]); px(ctx, x + w - 6, y + h / 2, 1, 1, RR.brass[5]); }
};
const candle = (ctx, x, y, lit = true) => {
  px(ctx, x - 1, y - 6, 3, 6, '#efe6cf'); px(ctx, x + 1, y - 6, 1, 6, '#cfc4a8');
  if (lit) { const f = Math.floor(Scenes.frame / 5) % 3; px(ctx, x, y - 9 - (f === 1 ? 1 : 0), 1, 3, '#ffd866'); px(ctx, x, y - 8, 1, 1, '#fff6c0'); }
};
const flame = (ctx, x, y, s = 1) => {
  const t = Scenes.frame / 4;
  for (let i = 0; i < 6; i++) {
    const fx = x + (i - 2.5) * 3 * s, h = (6 + Math.sin(t + i * 1.7) * 3 + (i % 2) * 3) * s;
    px(ctx, fx, y - h, 3 * s, h, '#d94a22'); px(ctx, fx + s, y - h * 0.7, s, h * 0.7, '#f08c2a');
  }
  px(ctx, x - 4 * s, y - 5 * s, 8 * s, 4 * s, '#ffcc44'); px(ctx, x - 2 * s, y - 3 * s, 4 * s, 2 * s, '#fff2a0');
};
const sparks = (ctx, x, y, n, rise = 30) => {
  for (let i = 0; i < n; i++) {
    const p = ((Scenes.frame * 0.6 + i * 37) % rise);
    px(ctx, x + Math.sin((Scenes.frame + i * 50) / 9) * 6 + (i % 5) * 2 - 4, y - p, 1, 1, p < rise * 0.6 ? '#ffcc66' : '#c06a2a');
  }
};
const motes = (ctx, x, y, w, h, n) => {
  for (let i = 0; i < n; i++) {
    const mx = x + (Art.hash(i, 1, 9) * w + Math.sin((Scenes.frame + i * 40) / 60) * 6 + w) % w;
    const my = y + (Art.hash(i, 2, 9) * h + Scenes.frame * 0.05 * (1 + i % 3)) % h;
    px(ctx, mx, my, 1, 1, 'rgba(255,240,200,0.55)');
  }
};
const lantern = (ctx, x, y) => {
  px(ctx, x, y - 8, 1, 8, RR.iron[1]);
  Art.box(ctx, x - 3, y, 7, 9, RR.iron); px(ctx, x - 2, y + 2, 5, 5, Scenes.lit() ? '#ffcf6a' : '#8a7a5a');
};

// Compose: cached static + animated + darkness + light
Scenes.render = (sc, ctx, name) => {
  const key = name + (Scenes.usingArt(name) ? '+art' : '') + '|' + sc.key();
  let c = Scenes.cache[name];
  if (!c || c.key !== key) {
    const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    sc.base(g);
    c = Scenes.cache[name] = { key, cv };
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c.cv, 0, 0);
  if (sc.anim) sc.anim(ctx);
  const d = sc.outdoor ? Scenes.darkness(Scenes.hour()) * 1.2 : Scenes.darkness(Scenes.hour());
  if (d > 0) { ctx.fillStyle = `rgba(12,12,34,${d})`; ctx.fillRect(0, 0, SW, SH); }
  if (sc.light) sc.light(ctx, d);
  if (sc.top) sc.top(ctx);
};

// ------------------------------------------------------------------ office --
Scenes.office = {
  title: 'Your office',
  key: () => [Math.floor(S.min / 30), Math.min(16, S.inbox.filter(d => !d.done).length), S.sips, S.fac.archive, S.inbox.some(d => d.deadline != null && d.deadline <= S.day)].join(),
  base(ctx) {
    const h = Scenes.hour();
    // wall: plaster above, panelled wainscot below
    Art.plaster(ctx, 0, 0, SW, 60, RR.plaster, 4);
    for (let i = 0; i < 4; i++) { const sx = 52 + i * 61, sy = 14 + (i % 2) * 8; ctx.fillStyle = 'rgba(74,60,48,0.22)'; for (let k = 0; k < 3; k++) Art.disc(ctx, sx + k * 3, sy + k * 5, 6 - k * 2, 'rgba(74,60,48,0.16)'); } // water stains
    px(ctx, 0, 0, SW, 7, RR.darkoak[2]); px(ctx, 0, 7, SW, 1, RR.darkoak[0]);
    for (let bx = 30; bx < SW; bx += 96) { px(ctx, bx, 0, 10, 9, RR.darkoak[3]); px(ctx, bx, 9, 10, 1, RR.darkoak[0]); }
    Art.planks(ctx, 0, 60, SW, 58, RR.oak, 12, 21, true);
    for (let x = 4; x < SW; x += 36) { Art.box(ctx, x, 70, 30, 40, [RR.oak[1], RR.oak[2], RR.oak[3], RR.oak[4]]); px(ctx, x + 3, 73, 24, 34, RR.oak[3]); }
    px(ctx, 0, 58, SW, 3, RR.oak[4]); px(ctx, 0, 61, SW, 1, RR.oak[1]);
    // window
    Art.box(ctx, 224, 10, 78, 66, RR.darkoak);
    Art.vgrad(ctx, 228, 14, 70, 58, Scenes.skyCols(h));
    if (h < 19.5) {
      const hill = h < 18 ? '#6f8f52' : '#3b4a3c', town = h < 18 ? '#7a5a40' : '#2e2a2e', roof = h < 18 ? '#9a3e2c' : '#3a2a34';
      px(ctx, 228, 54, 70, 18, hill);
      for (let i = 0; i < 70; i += 2) px(ctx, 228 + i, 52 + Math.round(Math.sin(i / 9) * 2), 2, 3, hill);
      for (const [hx, hw, hh] of [[232, 12, 10], [246, 9, 14], [258, 14, 9], [276, 10, 12], [288, 9, 8]]) {
        px(ctx, hx, 64 - hh, hw, hh, town); for (let k = 0; k < hw / 2; k++) px(ctx, hx + k, 64 - hh - k, hw - k * 2, 1, roof);
        if (h >= 17.5) px(ctx, hx + 3, 60 - hh / 2, 2, 2, '#ffd27a');
      }
      px(ctx, 248, 36, 2, 14, town); // chapel spire
    } else { for (let i = 0; i < 14; i++) px(ctx, 229 + Art.hash(i, 1) * 68, 15 + Art.hash(i, 2) * 30, 1, 1, '#fff'); px(ctx, 284, 20, 5, 5, '#f0ecd8'); }
    px(ctx, 262, 14, 2, 58, RR.darkoak[1]); px(ctx, 228, 41, 70, 2, RR.darkoak[1]);
    ctx.save(); ctx.beginPath(); ctx.rect(228, 14, 70, 58); ctx.clip();
    ctx.strokeStyle = 'rgba(40,24,12,0.3)'; ctx.beginPath(); for (let k = -60; k < 80; k += 12) { ctx.moveTo(228 + k, 14); ctx.lineTo(228 + k + 58, 72); ctx.moveTo(298 - k, 14); ctx.lineTo(298 - k - 58, 72); } ctx.stroke(); ctx.restore();
    px(ctx, 220, 74, 86, 4, RR.oak[4]); px(ctx, 220, 78, 86, 1, RR.oak[1]);
    px(ctx, 284, 66, 9, 8, '#9a5a3a'); px(ctx, 285, 60, 2, 6, '#4e8a3e'); px(ctx, 288, 58, 2, 8, '#5e9c4c'); px(ctx, 291, 61, 2, 5, '#4e8a3e');
    // bookshelf
    Art.box(ctx, 6, 10, 72, 104, RR.darkoak);
    px(ctx, 9, 13, 66, 98, RR.darkoak[1]);
    const books = ['#7a2a24', '#2a466e', '#2e5e34', '#8a6a2a', '#5a2a62', '#5e5a52', '#9a5226', '#2e4a4a'];
    for (let row = 0; row < 4; row++) {
      const sy = 13 + row * 25;
      px(ctx, 9, sy + 22, 66, 3, RR.darkoak[3]); px(ctx, 9, sy + 22, 66, 1, RR.darkoak[4]);
      let x = 11;
      for (let i = 0; x < 72; i++) {
        const r = Art.hash(i, row, 31), w = 3 + Math.floor(r * 4), bh = 14 + Math.floor(Art.hash(row, i, 32) * 7), c = books[Math.floor(Art.hash(i, row, 33) * books.length)];
        if (r > 0.9 && x < 60) { // a scroll pile or a skull, for variety
          if (row === 1) { px(ctx, x, sy + 15, 9, 7, '#d8d0bc'); px(ctx, x + 2, sy + 17, 2, 2, '#2a2018'); px(ctx, x + 5, sy + 17, 2, 2, '#2a2018'); px(ctx, x + 2, sy + 21, 5, 1, '#a8a090'); }
          else { for (let k = 0; k < 3; k++) { px(ctx, x, sy + 16 + k * 2, 10, 2, '#e3d5b4'); px(ctx, x + 9, sy + 16 + k * 2, 1, 2, '#b8a888'); } }
          x += 11; continue;
        }
        if (x + w > 73) break;
        px(ctx, x, sy + 22 - bh, w, bh, c); px(ctx, x, sy + 22 - bh, 1, bh, Art.shade(c, 26)); px(ctx, x + w - 1, sy + 22 - bh, 1, bh, Art.shade(c, -30));
        if (bh > 16) { px(ctx, x, sy + 25 - bh, w, 1, RR.brass[3]); px(ctx, x, sy + 17, w, 1, RR.brass[2]); }
        x += w;
      }
    }
    // door
    door(ctx, 92, 32, 34, 80);
    for (const [dx, dy] of [[96, 38], [111, 38], [96, 78], [111, 78]]) { px(ctx, dx, dy, 12, 30, RR.oak[2]); px(ctx, dx, dy, 12, 1, RR.oak[1]); px(ctx, dx, dy + 29, 12, 1, RR.oak[4]); }
    // coat hook with a cloak
    px(ctx, 132, 30, 4, 2, RR.brass[3]); px(ctx, 130, 32, 8, 26, '#3a4a5e'); px(ctx, 130, 32, 2, 26, '#4a5e74'); px(ctx, 136, 34, 2, 24, '#26323f');
    // charter
    Art.box(ctx, 140, 16, 46, 38, RR.brass);
    px(ctx, 143, 19, 40, 32, RR.paper[4]); px(ctx, 143, 19, 40, 4, RR.paper[3]);
    for (let i = 0; i < 6; i++) px(ctx, 147, 25 + i * 4, i === 0 ? 32 : 26 - (i % 3) * 5, 1, RR.paper[1]);
    Art.disc(ctx, 176, 45, 4, RR.red[3]); Art.disc(ctx, 176, 45, 2, RR.red[4]); px(ctx, 172, 48, 2, 6, RR.red[2]); px(ctx, 178, 48, 2, 6, RR.red[2]);
    // filing cabinet
    Art.box(ctx, 190, 52, 30, 62, RR.iron);
    for (let i = 0; i < 3; i++) { Art.box(ctx, 192, 55 + i * 19, 26, 17, RR.iron); px(ctx, 200, 62 + i * 19, 10, 2, RR.brass[3]); px(ctx, 202, 58 + i * 19, 6, 3, RR.paper[4]); }
    if (S.fac.archive) { Art.box(ctx, 170, 80, 18, 34, RR.iron); px(ctx, 174, 86, 10, 2, RR.brass[3]); }
    // wall sconce
    px(ctx, 213, 40, 6, 2, RR.brass[2]); px(ctx, 215, 36, 2, 4, RR.brass[3]);
    // floor and rug glimpse behind the desk
    px(ctx, 0, 112, SW, 8, RR.oak[1]); px(ctx, 60, 113, 200, 6, RR.red[2]); for (let x = 62; x < 258; x += 6) px(ctx, x, 115, 3, 1, RR.brass[2]);
    // the desk
    Art.planks(ctx, 0, 118, SW, 36, RR.oak, 9, 77);
    px(ctx, 0, 118, SW, 1, RR.oak[5]);
    px(ctx, 0, 150, SW, 4, RR.oak[4]); px(ctx, 0, 150, SW, 1, RR.oak[5]); px(ctx, 0, 154, SW, 1, RR.oak[0]);
    Art.planks(ctx, 0, 155, SW, 25, RR.darkoak, 25, 78);
    for (const dx of [20, 130, 240]) { Art.box(ctx, dx, 158, 60, 18, RR.darkoak); px(ctx, dx + 27, 165, 6, 2, RR.brass[3]); }
    // blotter
    px(ctx, 80, 124, 150, 30, RR.green[1]); px(ctx, 82, 126, 146, 26, RR.green[3]); Art.dither(ctx, 82, 126, 146, 26, RR.green[2], 0.25);
    for (const cx of [80, 224]) { px(ctx, cx, 124, 6, 30, RR.oak[1]); px(ctx, cx + 1, 125, 4, 28, RR.oak[3]); }
    // light falling through the window onto the desk
    Scenes.office.sun = h < 18.2;
    // inbox tray: a stack that grows
    const n = S.inbox.filter(d => !d.done).length;
    Art.box(ctx, 14, 114, 60, 22, RR.oak); px(ctx, 17, 117, 54, 16, RR.oak[1]);
    for (let i = 0; i < Math.min(16, n); i++) {
      const sx = 19 + Math.round((Art.hash(i, 1, 5) - 0.5) * 6), sy = 130 - i * 2;
      px(ctx, sx, sy, 48, 3, RR.paper[0]); px(ctx, sx, sy, 48, 2, i % 3 ? RR.paper[4] : RR.paper[3]);
      if (Art.hash(i, 2, 5) > 0.7) Art.disc(ctx, sx + 30 + Art.hash(i, 3, 5) * 10, sy + 1, 1, ['#8e2a22', '#2a4a7a', '#c99a3e'][i % 3]);
    }
    if (n > 16) for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(46, 96 - i * 3); ctx.rotate(-0.25 + i * 0.2); px(ctx, -24, -2, 48, 3, RR.paper[4]); ctx.restore(); }
    px(ctx, 14, 134, 60, 2, RR.oak[0]);
    // ledger, roster, planner
    Art.box(ctx, 86, 132, 40, 24, RR.green); px(ctx, 104, 134, 2, 20, RR.green[1]); px(ctx, 99, 140, 12, 8, RR.brass[3]); px(ctx, 100, 141, 10, 6, RR.brass[2]);
    Art.box(ctx, 132, 134, 38, 24, RR.red); px(ctx, 140, 140, 22, 2, RR.brass[3]); px(ctx, 140, 144, 22, 2, RR.brass[3]); px(ctx, 140, 148, 14, 1, RR.brass[2]);
    px(ctx, 177, 129, 48, 28, RR.paper[1]); px(ctx, 178, 128, 22, 28, RR.paper[4]); px(ctx, 202, 128, 22, 28, RR.paper[4]); px(ctx, 200, 128, 2, 29, RR.paper[2]);
    for (let i = 0; i < 6; i++) { px(ctx, 181, 132 + i * 4, 16 - (i % 3) * 3, 1, '#4a5a8a'); px(ctx, 205, 132 + i * 4, 14 - (i % 2) * 5, 1, '#4a5a8a'); }
    if (S.inbox.some(d => d.deadline != null && d.deadline <= S.day)) { px(ctx, 218, 124, 4, 14, RR.red[4]); px(ctx, 218, 136, 2, 2, RR.red[4]); }
    // mug
    const mug = RR.paper;
    px(ctx, 237, 104, 22, 26, '#2a2018'); px(ctx, 238, 105, 20, 24, mug[4]); px(ctx, 238, 105, 4, 24, mug[5]); px(ctx, 253, 105, 5, 24, mug[2]);
    px(ctx, 258, 110, 6, 14, '#2a2018'); px(ctx, 259, 111, 4, 12, mug[3]); px(ctx, 260, 113, 2, 8, '#2a2018');
    px(ctx, 239, 106, 18, 3, S.sips > 0 ? '#3a1e0e' : mug[2]);
    if (S.sips > 0) px(ctx, 241, 106, 6, 1, '#6a3a1c');
    px(ctx, 241, 115, 12, 6, RR.blue[3]); px(ctx, 244, 117, 6, 2, RR.paper[4]);
    // ink and quill
    px(ctx, 271, 128, 14, 12, '#0e0e16'); px(ctx, 272, 129, 3, 8, '#3a3a5a'); px(ctx, 274, 125, 8, 4, RR.iron[2]);
    ctx.save(); ctx.translate(281, 126); ctx.rotate(0.35);
    px(ctx, -1, -26, 2, 27, '#f2f2ee'); for (let i = 0; i < 9; i++) { px(ctx, -4, -24 + i * 2, 3, 1, '#e6e6e0'); px(ctx, 1, -24 + i * 2, 3, 1, '#d8d8d2'); }
    ctx.restore();
    // seal stamp
    px(ctx, 294, 128, 16, 6, RR.red[3]); px(ctx, 294, 128, 16, 1, RR.red[5]); px(ctx, 299, 116, 6, 12, RR.oak[3]); px(ctx, 299, 116, 2, 12, RR.oak[4]); Art.disc(ctx, 302, 113, 4, RR.oak[4]);
  },
  anim(ctx) {
    const h = Scenes.hour();
    // clouds drifting past the window
    if (h < 19.5) {
      ctx.save(); ctx.beginPath(); ctx.rect(228, 14, 70, 38); ctx.clip();
      for (let i = 0; i < 3; i++) {
        const cx = 228 + ((Scenes.frame * 0.04 + i * 33) % 110) - 20, cy = 18 + i * 9;
        const cc = h < 16 ? 'rgba(255,255,255,0.8)' : 'rgba(255,220,200,0.6)';
        px(ctx, cx, cy, 16, 3, cc); px(ctx, cx + 3, cy - 2, 9, 2, cc);
      }
      ctx.restore();
      // chimney smoke
      for (let i = 0; i < 5; i++) { const p = (Scenes.frame * 0.15 + i * 7) % 30; px(ctx, 279 + Math.sin(p / 5) * 2, 51 - p, 2, 2, `rgba(220,220,220,${0.5 - p / 70})`); }
    }
    // steam from the mug
    if (S.sips > 0) for (let i = 0; i < 3; i++) { const p = (Scenes.frame * 0.25 + i * 9) % 26; px(ctx, 243 + i * 5 + Math.sin((Scenes.frame + i * 20) / 10) * 2, 102 - p, 2, 2, `rgba(255,255,255,${0.45 - p / 60})`); }
    if (h < 18.2) motes(ctx, 170, 80, 120, 70, 14);
    if (Scenes.lit()) { const f = Math.floor(Scenes.frame / 5) % 3; px(ctx, 215, 30 - (f === 1 ? 1 : 0), 2, 5, '#ffd866'); px(ctx, 215, 32, 2, 2, '#fff6c0'); }
  },
  light(ctx, d) {
    if (Scenes.office.sun) {
      // a soft shaft of daylight across the desk
      const h = Scenes.hour(), col = h < 9 ? '255,214,150' : h < 16 ? '255,246,220' : '255,190,120';
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.moveTo(230, 76); ctx.lineTo(296, 76); ctx.lineTo(268, 150); ctx.lineTo(168, 150); ctx.closePath(); ctx.clip();
      ctx.fillStyle = `rgba(${col},0.07)`; ctx.fillRect(160, 76, 140, 76);
      ctx.fillStyle = Art.pattern(ctx, `rgba(${col},0.10)`, 0.5); ctx.fillRect(160, 118, 140, 34);
      ctx.restore();
    }
    if (Scenes.lit()) { Art.glow(ctx, 216, 33, 80, '255,180,90', 0.2 + d * 0.3); Art.glow(ctx, 216, 33, 16, '255,220,140', 0.2); }
  },
  spots: () => [
    { x: 12, y: 106, w: 66, h: 32, label: () => `Inbox (${S.inbox.filter(d => !d.done).length} unread or unfiled)`, act: () => UI.inbox() },
    { x: 84, y: 130, w: 44, h: 28, label: 'Ledger', act: () => UI.ledger() },
    { x: 130, y: 132, w: 42, h: 28, label: 'Roster book', act: () => UI.roster() },
    { x: 175, y: 124, w: 52, h: 34, label: 'Day planner: deadlines', act: () => UI.planner() },
    { x: 234, y: 96, w: 32, h: 36, label: () => S.sips ? `Sip coffee (${S.sips} left)` : 'Coffee mug (empty)', act: () => UI.sip() },
    { x: 88, y: 28, w: 42, h: 86, label: 'Door: to the main hall', act: () => UI.go('hall') },
    { x: 188, y: 50, w: 34, h: 64, label: 'Filing cabinet: archive', act: () => UI.archive() },
    { x: 6, y: 10, w: 72, h: 88, label: 'Bookshelf: guild handbook and council rules', act: () => UI.rules() },
    { x: 138, y: 14, w: 50, h: 42, label: 'Guild charter', act: () => UI.charter() },
    { x: 224, y: 10, w: 78, h: 66, label: 'Window', act: () => UI.window() },
  ],
};

// -------------------------------------------------------------------- hall --
Scenes.hall = {
  title: 'Main hall',
  key: () => [Math.floor(S.min / 30), S.board.map(p => p.status[0]).join(''), S.fac.academy, !!S.staff.clerk].join(),
  base(ctx) {
    // stone walls with timber framing
    Art.bricks(ctx, 0, 0, SW, 108, RR.stone, 18, 9, 11);
    Art.dither(ctx, 0, 0, SW, 30, '#0c0a10', 0.25);
    px(ctx, 0, 10, SW, 6, RR.darkoak[3]); px(ctx, 0, 10, SW, 1, RR.darkoak[4]); px(ctx, 0, 16, SW, 1, RR.darkoak[0]);
    for (const bx of [26, 128, 206, 248]) { px(ctx, bx, 16, 6, 92, RR.darkoak[3]); px(ctx, bx, 16, 1, 92, RR.darkoak[4]); px(ctx, bx + 5, 16, 1, 92, RR.darkoak[1]); }
    // floor in perspective
    px(ctx, 0, 108, SW, 72, RR.oak[3]);
    for (let y = 108, k = 0; y < SH; k++) { const hh = 3 + k * 1.6; px(ctx, 0, y, SW, 1, RR.oak[1]); px(ctx, 0, y + 1, SW, 1, RR.oak[4]); y += hh; }
    ctx.strokeStyle = RR.oak[1]; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = -10; i <= 10; i++) { ctx.moveTo(160 + i * 14, 108); ctx.lineTo(160 + i * 46, 180); } ctx.stroke();
    Art.dither(ctx, 0, 108, SW, 12, RR.oak[1], 0.5);
    // guild banners
    for (const bx of [8, 304]) { px(ctx, bx - 2, 18, 14, 2, RR.brass[2]); px(ctx, bx, 20, 10, 26, RR.red[3]); px(ctx, bx, 20, 2, 26, RR.red[4]); px(ctx, bx, 46, 5, 4, RR.red[3]); px(ctx, bx + 5, 46, 5, 2, RR.red[3]); px(ctx, bx + 3, 26, 4, 6, RR.brass[3]); }
    // quest board
    Art.box(ctx, 36, 22, 86, 62, RR.darkoak);
    px(ctx, 40, 26, 78, 54, '#b38652'); Art.dither(ctx, 40, 26, 78, 54, '#a47844', 0.5); Art.dither(ctx, 40, 26, 78, 54, '#c4975e', 0.12);
    px(ctx, 40, 26, 78, 1, '#d4a86e');
    S.board.slice(0, 10).forEach((p, i) => {
      const x = 44 + (i % 5) * 15, y = 30 + Math.floor(i / 5) * 25, tilt = Art.hash(i, p.id, 4) > 0.5 ? 1 : 0;
      px(ctx, x + 1, y + 1, 12, 19, 'rgba(40,24,10,0.35)');
      px(ctx, x, y + tilt, 12, 18, p.status === 'claimed' ? RR.paper[2] : RR.paper[4]);
      for (let k = 0; k < 5; k++) px(ctx, x + 2, y + 4 + k * 2 + tilt, k === 0 ? 8 : 6 + (k % 2) * 2, 1, RR.paper[1]);
      px(ctx, x + 5, y, 2, 2, RR.red[4]);
      if (p.status === 'claimed') { px(ctx, x + 1, y + 13, 10, 4, RR.green[3]); px(ctx, x + 2, y + 14, 8, 2, RR.green[4]); }
    });
    for (const lx of [46, 108]) { Art.box(ctx, lx, 84, 6, 26, RR.darkoak); }
    // stairs to the inn
    for (let i = 0; i < 9; i++) { const sx = 132 + i * 2.6, sy = 102 - i * 9.5; Art.box(ctx, sx, sy, 26, 10, RR.oak); px(ctx, sx + 1, sy + 1, 24, 1, RR.oak[5]); }
    px(ctx, 156, 20, 3, 86, RR.darkoak[3]); for (let i = 0; i < 8; i++) px(ctx, 158, 26 + i * 10, 6, 2, RR.darkoak[3]);
    // archway to the yard
    px(ctx, 166, 28, 38, 82, RR.stone[0]);
    Art.vgrad(ctx, 170, 34, 30, 50, Scenes.skyCols(Scenes.hour()));
    px(ctx, 170, 76, 30, 34, '#5f8a4a'); Art.dither(ctx, 170, 76, 30, 34, '#4e7a3c', 0.25);
    px(ctx, 182, 62, 3, 24, RR.oak[2]); px(ctx, 177, 58, 13, 8, '#d9c27a'); px(ctx, 179, 52, 9, 7, '#d9c27a');
    for (let k = 0; k < 6; k++) px(ctx, 166 + k, 28 + (5 - k), 38 - k * 2, 1, RR.stone[0]);
    for (let y = 30; y < 110; y += 9) { px(ctx, 166, y, 4, 8, RR.stone[4]); px(ctx, 200, y + 4, 4, 8, RR.stone[4]); }
    // academy door
    if (S.fac.academy) { door(ctx, 217, 32, 26, 54, RR.violet); Art.disc(ctx, 230, 42, 3, '#b8a8ff'); }
    else {
      door(ctx, 217, 32, 26, 54, RR.oak, false);
      for (const by of [44, 62]) { ctx.save(); ctx.translate(230, by); ctx.rotate(by === 44 ? -0.15 : 0.12); Art.box(ctx, -18, -2, 36, 5, RR.pine); px(ctx, -14, 0, 1, 1, RR.iron[4]); px(ctx, 13, 0, 1, 1, RR.iron[4]); ctx.restore(); }
    }
    // reception counter
    Art.planks(ctx, 252, 84, 64, 28, RR.oak, 7, 41);
    px(ctx, 250, 80, 68, 5, RR.oak[4]); px(ctx, 250, 80, 68, 1, RR.oak[5]); px(ctx, 250, 85, 68, 1, RR.oak[0]);
    px(ctx, 300, 75, 7, 5, RR.brass[3]); px(ctx, 302, 73, 3, 2, RR.brass[4]); px(ctx, 301, 76, 2, 1, RR.brass[5]);
    for (let i = 0; i < 3; i++) px(ctx, 262 + i * 2, 77 - i, 14, 3, RR.paper[3 + (i % 2)]);
    // tavern door with hanging sign
    door(ctx, 303, 24, 17, 52);
    px(ctx, 284, 14, 34, 2, RR.iron[2]); Art.box(ctx, 288, 16, 26, 9, RR.oak); px(ctx, 293, 18, 4, 5, RR.brass[3]); px(ctx, 300, 19, 8, 1, RR.paper[3]);
    // office door at left edge
    door(ctx, 3, 32, 18, 76);
    // bench
    Art.box(ctx, 38, 138, 84, 7, RR.oak); px(ctx, 44, 145, 4, 12, RR.oak[1]); px(ctx, 112, 145, 4, 12, RR.oak[1]);
    // chandelier
    px(ctx, 220, 0, 1, 14, RR.iron[1]); px(ctx, 206, 14, 30, 2, RR.iron[2]); px(ctx, 210, 16, 22, 1, RR.iron[1]);
  },
  anim(ctx) {
    for (const cx of [207, 214, 221, 228, 235]) candle(ctx, cx, 14, true);
    const w = Scenes.whereabouts().hall;
    Scenes.hallSpots = w.slice(0, 5).map((a, i) => ({ a, x: 52 + i * 26 + (i > 2 ? 70 : 0), y: i < 3 ? 140 : 162, sit: i < 3 }));
    if (S.staff.clerk) Scenes.person(ctx, 282, 84, { id: 99, look: { skin: '#e0ac7e', hair: '#222', style: 2 } }, { cloth: '#3a4a6a', glasses: true });
    for (const s of Scenes.hallSpots) Scenes.person(ctx, s.x, s.y, s.a, { sit: s.sit });
  },
  light(ctx, d) {
    Art.glow(ctx, 221, 12, 60, '255,190,110', 0.1 + d * 0.5);
    if (Scenes.hour() < 18) Art.glow(ctx, 185, 100, 40, '255,250,220', 0.12);
  },
  spots: () => [
    { x: 36, y: 22, w: 86, h: 62, label: () => `Quest board (${S.board.length} posted)`, act: () => UI.board() },
    { x: 250, y: 70, w: 50, h: 42, label: 'Reception desk: hiring notices', act: () => UI.reception() },
    { x: 0, y: 30, w: 24, h: 80, label: 'Door: back to your office', act: () => UI.go('office') },
    { x: 300, y: 14, w: 20, h: 64, label: 'Door: the tavern', act: () => UI.go('tavern') },
    { x: 166, y: 28, w: 38, h: 82, label: 'Archway: training yard', act: () => UI.go('yard') },
    { x: 130, y: 20, w: 32, h: 92, label: 'Stairs: the inn', act: () => UI.go('inn') },
    { x: 214, y: 28, w: 32, h: 60, label: () => S.fac.academy ? 'The Academy' : 'A boarded-up door', act: () => S.fac.academy ? UI.go('academy') : UI.say('The old lecture hall. Boarded up since Hela\'s day. The builders could reopen it, with the Council\'s blessing and enough gold.') },
    ...(Scenes.hallSpots || []).map(s => ({ x: s.x - 8, y: s.y - 28, w: 17, h: 30, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// ------------------------------------------------------------------ tavern --
Scenes.tavern = {
  title: 'The tavern', fac: 'tavern',
  key: () => [Math.floor(S.min / 30), S.alePrice, S.fac.tavern, !!S.staff.barkeep].join(),
  base(ctx) {
    // timber-framed plaster
    Art.plaster(ctx, 0, 0, SW, 112, RR.warm, 7);
    for (const bx of [0, 74, 150, 316]) { px(ctx, bx, 0, 6, 112, RR.darkoak[3]); px(ctx, bx, 0, 1, 112, RR.darkoak[4]); }
    px(ctx, 0, 0, SW, 8, RR.darkoak[2]); px(ctx, 0, 62, 150, 4, RR.darkoak[3]);
    ctx.strokeStyle = RR.darkoak[3]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(80, 64); ctx.lineTo(148, 10); ctx.stroke(); ctx.lineWidth = 1;
    Art.planks(ctx, 0, 112, SW, 68, RR.oak, 8, 13);
    Art.dither(ctx, 0, 112, SW, 8, RR.oak[0], 0.5);
    // fireplace
    Art.bricks(ctx, 12, 38, 56, 74, RR.stone, 10, 6, 21);
    px(ctx, 20, 62, 40, 50, '#140c08'); Art.dither(ctx, 20, 62, 40, 10, RR.stone[1], 0.5);
    for (let k = 0; k < 4; k++) px(ctx, 20 + k, 62 - k, 40 - k * 2, 1, RR.stone[2]);
    Art.box(ctx, 8, 34, 64, 6, RR.oak);
    px(ctx, 24, 104, 32, 4, RR.oak[1]); px(ctx, 28, 100, 24, 4, RR.oak[2]);
    // antlers & candles on the mantle
    px(ctx, 36, 20, 8, 6, RR.oak[2]); for (const s of [-1, 1]) { px(ctx, 40 + s * 6, 12, 2, 10, '#d8cbb0'); px(ctx, 40 + s * 10, 10, 2, 6, '#d8cbb0'); px(ctx, 40 + s * 3, 14, 2, 5, '#d8cbb0'); }
    // chalkboard
    Art.box(ctx, 92, 24, 48, 34, RR.oak); px(ctx, 95, 27, 42, 28, '#24302a'); Art.dither(ctx, 95, 27, 42, 28, '#2e3c34', 0.25);
    const price = { cheap: 1, fair: 2, steep: 3 }[S.alePrice];
    px(ctx, 99, 32, 12, 1, '#e8e8d8'); px(ctx, 99, 34, 8, 1, '#e8e8d8'); for (let i = 0; i < price; i++) Art.disc(ctx, 122 + i * 5, 33, 1, '#f4d470');
    px(ctx, 99, 42, 16, 1, '#e8e8d8'); px(ctx, 99, 44, 10, 1, '#e8e8d8'); Art.disc(ctx, 122, 43, 1, '#f4d470'); Art.disc(ctx, 127, 43, 1, '#f4d470');
    // shelves of bottles and barrels
    for (const sy of [24, 48]) { Art.box(ctx, 164, sy, 150, 4, RR.oak); }
    const bc = ['#3a6a3a', '#7a2a2a', '#9a7a2a', '#2a4a6a', '#5a3a6a'];
    for (let i = 0; i < 19; i++) { const c = bc[i % 5], hh = 8 + (i % 3) * 2; px(ctx, 168 + i * 7.5, 24 - hh, 5, hh, c); px(ctx, 168 + i * 7.5, 24 - hh, 1, hh, Art.shade(c, 40)); px(ctx, 169 + i * 7.5, 21 - hh, 3, 3, c); }
    for (let i = 0; i < 6; i++) { const bx = 168 + i * 24; Art.box(ctx, bx, 30, 18, 18, RR.pine); px(ctx, bx, 34, 18, 2, RR.iron[2]); px(ctx, bx, 42, 18, 2, RR.iron[2]); Art.disc(ctx, bx + 9, 39, 2, RR.pine[1]); }
    // bar
    Art.planks(ctx, 160, 94, 160, 24, RR.darkoak, 6, 51);
    px(ctx, 158, 89, 162, 6, RR.oak[4]); px(ctx, 158, 89, 162, 1, RR.oak[5]); px(ctx, 158, 95, 162, 1, RR.oak[0]);
    for (let i = 0; i < 5; i++) { const mx = 176 + i * 28; px(ctx, mx, 81, 7, 8, RR.brass[2]); px(ctx, mx, 81, 7, 2, '#fff6e0'); px(ctx, mx + 7, 83, 2, 4, RR.brass[2]); }
    // tables
    const tables = [[24, 146], [96, 158], ...(S.fac.tavern >= 2 ? [[206, 150]] : []), ...(S.fac.tavern >= 3 ? [[264, 164]] : [])];
    for (const [tx, ty] of tables) { Art.box(ctx, tx, ty, 46, 7, RR.oak); px(ctx, tx + 5, ty + 7, 4, 12, RR.oak[1]); px(ctx, tx + 37, ty + 7, 4, 12, RR.oak[1]); px(ctx, tx + 18, ty - 5, 6, 6, RR.brass[3]); px(ctx, tx + 18, ty - 5, 6, 1, '#fff6e0'); }
    px(ctx, 0, 42, 18, 70, RR.darkoak[0]); door(ctx, 1, 44, 15, 66);
  },
  anim(ctx) {
    flame(ctx, 40, 102, 1.4); sparks(ctx, 40, 90, 8, 26);
    for (const lx of [110, 230, 290]) lantern(ctx, lx, 12);
    for (const cx of [20, 60]) candle(ctx, cx, 34, true);
    if (S.staff.barkeep) Scenes.person(ctx, 238, 92, { id: 98, look: { skin: '#c68642', hair: '#5a3a1a', style: 0, beard: true } }, { cloth: '#7a3a2a', apron: true });
    const w = Scenes.whereabouts().tavern;
    const seats = [[30, 152], [64, 152], [104, 164], [138, 164], [214, 156], [250, 156]];
    Scenes.tavSpots = w.slice(0, seats.length).map((a, i) => ({ a, x: seats[i][0], y: seats[i][1] }));
    for (const s of Scenes.tavSpots) Scenes.person(ctx, s.x, s.y, s.a, { sit: true });
  },
  light(ctx, d) {
    const f = Math.sin(Scenes.frame / 7) * 4;
    Art.glow(ctx, 40, 92, 100 + f, '255,130,50', 0.22 + d * 0.3);
    for (const lx of [110, 230, 290]) Art.glow(ctx, lx, 16, 36, '255,200,110', 0.12 + d * 0.3);
  },
  spots: () => [
    { x: 158, y: 60, w: 160, h: 58, label: S.staff.barkeep ? `The bar: talk to ${S.staff.barkeep.name}, refill coffee` : 'The bar: refill coffee', act: () => UI.bar() },
    { x: 92, y: 24, w: 48, h: 34, label: 'Price board: set the price of ale', act: () => UI.prices() },
    { x: 0, y: 42, w: 20, h: 70, label: 'Door: back to the hall', act: () => UI.go('hall') },
    ...(Scenes.tavSpots || []).map(s => ({ x: s.x - 8, y: s.y - 26, w: 17, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// -------------------------------------------------------------------- yard --
Scenes.yard = {
  title: 'Training yard', fac: 'yard', outdoor: true,
  key: () => [Math.floor(S.min / 30), S.fac.yard, !!S.staff.trainer].join(),
  base(ctx) {
    const h = Scenes.hour();
    Art.vgrad(ctx, 0, 0, SW, 64, Scenes.skyCols(h));
    const day = h < 18;
    // far hills, near hills, trees
    for (let x = 0; x < SW; x++) { const y1 = 46 + Math.sin(x / 40) * 5 + Math.sin(x / 13) * 2; px(ctx, x, y1, 1, 30, day ? '#7f9e6a' : '#3a4a40'); }
    for (let x = 0; x < SW; x++) { const y2 = 56 + Math.sin(x / 25 + 2) * 4; px(ctx, x, y2, 1, 30, day ? '#5f8a4a' : '#2e3e34'); }
    for (let i = 0; i < 9; i++) { const tx = 10 + i * 37 + Art.hash(i, 1) * 10, ty = 52 + Art.hash(i, 2) * 6; Art.disc(ctx, tx, ty, 7, day ? '#3f6a34' : '#22322a'); Art.disc(ctx, tx - 2, ty - 2, 4, day ? '#4e7e40' : '#2a3a30'); px(ctx, tx, ty + 6, 2, 6, RR.oak[1]); }
    // ground
    px(ctx, 0, 82, SW, 98, '#9a7a4c'); Art.dither(ctx, 0, 82, SW, 98, '#8a6a3e', 0.25); Art.dither(ctx, 0, 82, SW, 20, '#7a5e36', 0.25);
    for (let i = 0; i < 60; i++) { const gx = Art.hash(i, 3) * SW, gy = 86 + Art.hash(i, 4) * 92; px(ctx, gx, gy, 1, 2, '#6a8a3e'); px(ctx, gx + 1, gy - 1, 1, 3, '#7a9a4a'); }
    // fence
    for (let x = 2; x < SW; x += 18) { Art.box(ctx, x, 64, 4, 22, RR.pine); }
    px(ctx, 0, 69, SW, 3, RR.pine[3]); px(ctx, 0, 69, SW, 1, RR.pine[4]); px(ctx, 0, 78, SW, 3, RR.pine[3]); px(ctx, 0, 78, SW, 1, RR.pine[4]);
    // dummies
    for (const dx of [60, 102, ...(S.fac.yard >= 2 ? [144] : [])]) {
      px(ctx, dx + 1, 128, 14, 2, 'rgba(30,20,10,0.35)');
      Art.box(ctx, dx + 6, 96, 4, 34, RR.oak); Art.box(ctx, dx - 2, 104, 20, 4, RR.oak);
      px(ctx, dx, 98, 16, 18, '#c9ac62'); Art.dither(ctx, dx, 98, 16, 18, '#b0944e', 0.25); px(ctx, dx, 104, 16, 1, '#7a5a30'); px(ctx, dx, 110, 16, 1, '#7a5a30');
      Art.disc(ctx, dx + 8, 90, 5, '#c9ac62'); px(ctx, dx + 5, 89, 2, 2, '#2a2018'); px(ctx, dx + 9, 89, 2, 2, '#2a2018'); px(ctx, dx + 6, 93, 5, 1, '#7a5a30');
    }
    if (S.fac.yard >= 2) for (const tx of [232, 276]) {
      Art.box(ctx, tx - 2, 110, 4, 24, RR.oak); Art.disc(ctx, tx, 100, 11, '#d9c27a');
      Art.disc(ctx, tx, 100, 9, RR.red[3]); Art.disc(ctx, tx, 100, 6, '#f0e8d8'); Art.disc(ctx, tx, 100, 3, RR.red[3]); px(ctx, tx, 100, 1, 1, '#f4d470');
    }
    if (S.fac.yard >= 3) { ctx.strokeStyle = RR.oak[2]; ctx.strokeRect(150.5, 132.5, 72, 36); for (const [rx, ry] of [[150, 132], [222, 132], [150, 168], [222, 168]]) Art.box(ctx, rx - 2, ry - 6, 4, 8, RR.oak); }
    // weapon rack
    Art.box(ctx, 196, 92, 26, 4, RR.oak); for (let i = 0; i < 4; i++) { px(ctx, 199 + i * 6, 74, 2, 20, RR.iron[4]); px(ctx, 198 + i * 6, 92, 4, 2, RR.brass[2]); }
    // notice board
    Art.box(ctx, 16, 98, 30, 24, RR.oak); px(ctx, 19, 101, 24, 18, RR.paper[3]); for (let i = 0; i < 4; i++) px(ctx, 22, 104 + i * 4, 18 - (i % 2) * 6, 1, RR.paper[1]); Art.box(ctx, 29, 122, 4, 18, RR.oak);
    // gate
    door(ctx, 299, 84, 19, 50, RR.pine);
  },
  anim(ctx) {
    if (S.staff.trainer) Scenes.person(ctx, 192, 128, { id: 97, look: { skin: '#8d5524', hair: '#222', style: 0, beard: true } }, { cloth: '#6a2a2a' });
    const w = Scenes.whereabouts().yard;
    const spots = [[80, 142], [122, 152], [176, 162], [252, 142], [282, 164], [56, 168]];
    Scenes.yardSpots = w.slice(0, spots.length).map((a, i) => ({ a, x: spots[i][0], y: spots[i][1] }));
    for (const s of Scenes.yardSpots) Scenes.person(ctx, s.x, s.y, s.a);
    // birds
    if (Scenes.hour() < 18) for (let i = 0; i < 2; i++) { const bx = (Scenes.frame * 0.3 + i * 140) % 360 - 20, by = 20 + i * 8 + Math.sin(Scenes.frame / 20 + i) * 2, f = Math.floor(Scenes.frame / 8 + i) % 2; px(ctx, bx, by, 2, 1, '#2a2a30'); px(ctx, bx + 3, by, 2, 1, '#2a2a30'); px(ctx, bx + 2, by + f, 1, 1, '#2a2a30'); }
  },
  spots: () => [
    { x: 14, y: 96, w: 34, h: 44, label: 'Training roster: schedule sessions', act: () => UI.trainForm('yard') },
    { x: 296, y: 82, w: 24, h: 54, label: 'Gate: back to the hall', act: () => UI.go('hall') },
    ...(S.staff.trainer ? [{ x: 184, y: 100, w: 17, h: 30, label: `Talk to ${S.staff.trainer.name}`, act: () => UI.say(`"Give me a week with any of them and I'll make them worth twice the coin." ${S.staff.trainer.name} cracks their knuckles.`) }] : []),
    ...(Scenes.yardSpots || []).map(s => ({ x: s.x - 8, y: s.y - 28, w: 17, h: 30, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// --------------------------------------------------------------------- inn --
Scenes.inn = {
  title: 'The inn', fac: 'inn',
  key: () => [Math.floor(S.min / 30), S.fac.inn, S.fac.infirmary, !!S.staff.innkeeper].join(),
  base(ctx) {
    // striped wallpaper over wainscot
    px(ctx, 0, 0, SW, 120, '#6a5040'); for (let x = 0; x < SW; x += 10) { px(ctx, x, 0, 4, 84, '#735848'); px(ctx, x + 4, 0, 1, 84, '#5e4636'); }
    Art.dither(ctx, 0, 0, SW, 84, '#4a3a2e', 0.12);
    px(ctx, 0, 0, SW, 6, RR.darkoak[2]);
    Art.planks(ctx, 0, 84, SW, 36, RR.oak, 9, 61, true); px(ctx, 0, 84, SW, 3, RR.oak[4]); px(ctx, 0, 87, SW, 1, RR.oak[1]);
    Art.planks(ctx, 0, 120, SW, 60, RR.oak, 7, 62);
    // runner rug in perspective
    ctx.fillStyle = RR.red[2]; ctx.beginPath(); ctx.moveTo(120, 120); ctx.lineTo(200, 120); ctx.lineTo(250, 180); ctx.lineTo(70, 180); ctx.fill();
    ctx.fillStyle = RR.red[3]; ctx.beginPath(); ctx.moveTo(126, 120); ctx.lineTo(194, 120); ctx.lineTo(240, 180); ctx.lineTo(80, 180); ctx.fill();
    ctx.strokeStyle = RR.brass[2]; ctx.beginPath(); ctx.moveTo(130, 120); ctx.lineTo(86, 180); ctx.moveTo(190, 120); ctx.lineTo(234, 180); ctx.stroke();
    // room doors
    const doors = Math.min(7, Math.ceil(Core.capacity() / 2));
    for (let i = 0; i < doors; i++) {
      const x = 32 + i * 38;
      door(ctx, x, 54, 24, 66);
      Art.box(ctx, x + 8, 60, 9, 7, RR.brass); px(ctx, x + 11, 62, 3, 3, RR.brass[1]);
    }
    if (S.fac.infirmary) { const x = 32 + doors * 38; door(ctx, x, 54, 26, 66, RR.paper, true); px(ctx, x + 11, 70, 5, 16, RR.red[4]); px(ctx, x + 5, 76, 17, 5, RR.red[4]); }
    // stairs down
    px(ctx, 0, 0, 24, 120, RR.darkoak[1]); for (let i = 0; i < 7; i++) Art.box(ctx, 0, 104 - i * 15, 22, 6, RR.oak);
    // innkeeper's lectern
    Art.box(ctx, 286, 118, 26, 30, RR.oak); px(ctx, 284, 114, 30, 5, RR.oak[4]); px(ctx, 288, 108, 18, 7, RR.paper[4]); px(ctx, 296, 108, 1, 7, RR.paper[1]);
  },
  anim(ctx) {
    for (let i = 0; i < 4; i++) lantern(ctx, 50 + i * 76, 30);
    if (S.staff.innkeeper) Scenes.person(ctx, 300, 116, { id: 96, look: { skin: '#f1c9a5', hair: '#a0522d', style: 1 } }, { cloth: '#4a6a4a', apron: true });
    const w = Scenes.whereabouts().inn;
    Scenes.innSpots = w.slice(0, 5).map((a, i) => ({ a, x: 60 + i * 46, y: 168 }));
    for (const s of Scenes.innSpots) Scenes.person(ctx, s.x, s.y, s.a);
  },
  light(ctx, d) { for (let i = 0; i < 4; i++) Art.glow(ctx, 50 + i * 76, 34, 34, '255,200,110', 0.12 + d * 0.3); },
  spots: () => [
    { x: 26, y: 50, w: 260, h: 72, label: () => `Rooms: ${S.roster.length} of ${Core.capacity()} beds taken`, act: () => UI.innRooms() },
    { x: 0, y: 0, w: 24, h: 120, label: 'Stairs: back down to the hall', act: () => UI.go('hall') },
    ...(Scenes.innSpots || []).map(s => ({ x: s.x - 8, y: s.y - 28, w: 17, h: 30, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// ----------------------------------------------------------------- academy --
Scenes.academy = {
  title: 'The Academy of Mind and Arcana', fac: 'academy',
  key: () => [Math.floor(S.min / 30), !!S.staff.dean].join(),
  base(ctx) {
    Art.bricks(ctx, 0, 0, SW, 130, ['#0a0716', '#141026', '#1c1634', '#221b3e', '#29214a', '#302756'], 20, 10, 31);
    Art.dither(ctx, 0, 0, SW, 40, '#06040e', 0.25);
    Art.planks(ctx, 0, 130, SW, 50, RR.darkoak, 8, 32);
    // tall shelves
    const bc = ['#7a2a24', '#2a466e', '#2e5e34', '#8a6a2a', '#5a2a62'];
    for (const sx of [8, 252]) {
      Art.box(ctx, sx, 14, 60, 118, RR.darkoak);
      for (let r = 0; r < 5; r++) { px(ctx, sx + 3, 34 + r * 21, 54, 2, RR.darkoak[3]); for (let i = 0, x = sx + 4; x < sx + 54; i++) { const w = 3 + Math.floor(Art.hash(i, r, sx) * 3), c = bc[Math.floor(Art.hash(r, i, sx) * 5)]; px(ctx, x, 18 + r * 21, w, 16, c); px(ctx, x, 18 + r * 21, 1, 16, Art.shade(c, 28)); x += w; } }
    }
    // star chart
    Art.box(ctx, 120, 14, 80, 40, RR.brass); px(ctx, 123, 17, 74, 34, '#14122a');
    for (let i = 0; i < 18; i++) px(ctx, 125 + Art.hash(i, 1, 4) * 70, 19 + Art.hash(i, 2, 4) * 30, 1, 1, '#e8e0ff');
    ctx.strokeStyle = 'rgba(200,180,255,0.5)'; ctx.beginPath(); ctx.arc(160, 34, 13, 0, 7); ctx.stroke();
    // lectern
    Art.box(ctx, 146, 100, 28, 32, RR.oak); px(ctx, 140, 94, 40, 7, RR.oak[4]); px(ctx, 146, 90, 28, 5, RR.paper[4]); px(ctx, 159, 90, 2, 5, RR.paper[1]);
    door(ctx, 299, 124, 19, 56, RR.violet);
  },
  anim(ctx) {
    const b = Math.sin(Scenes.frame / 30) * 2;
    Art.disc(ctx, 160, 72 + b, 9, '#7a64c8'); Art.disc(ctx, 160, 72 + b, 6, '#a898ec'); px(ctx, 156, 67 + b, 3, 3, '#f2eeff');
    for (let i = 0; i < 10; i++) { const a = Scenes.frame / 40 + i * 0.63; px(ctx, 160 + Math.cos(a) * (16 + i % 3 * 4), 72 + b + Math.sin(a) * 8, 1, 1, '#d8ccff'); }
    for (const cx of [100, 220]) candle(ctx, cx, 132, true);
    if (S.staff.dean) Scenes.person(ctx, 206, 156, { id: 95, cls: 'mage', look: { skin: '#f1c9a5', hair: '#e8e0c8', style: 0, beard: true } }, { cloth: '#4a3a7a' });
    const w = Scenes.whereabouts().academy;
    Scenes.acSpots = w.slice(0, 5).map((a, i) => ({ a, x: 84 + i * 30, y: 172 }));
    for (const s of Scenes.acSpots) Scenes.person(ctx, s.x, s.y, s.a);
  },
  light(ctx, d) { Art.glow(ctx, 160, 72, 70, '170,140,255', 0.2 + d * 0.2); for (const cx of [100, 220]) Art.glow(ctx, cx, 124, 24, '255,210,130', 0.15); },
  spots: () => [
    { x: 136, y: 56, w: 48, h: 78, label: 'Lectern: enrol members in courses', act: () => UI.trainForm('academy') },
    { x: 296, y: 120, w: 24, h: 60, label: 'Door: back to the hall', act: () => UI.go('hall') },
    ...(Scenes.acSpots || []).map(s => ({ x: s.x - 8, y: s.y - 28, w: 17, h: 30, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// ------------------------------------------------------------ painted art --
// A room can have a painted background in art/<room>.png (320×180). When it
// loads, the room switches to its `alt` layout: the image replaces the drawn
// static layer, and the alt version supplies hotspots and animations fitted to it.
Scenes.ROOMS = ['office', 'hall', 'tavern', 'yard', 'inn', 'academy'];
Scenes.art = {};
Scenes.loadArt = () => {
  for (const name of Scenes.ROOMS) {
    if (!Scenes[name].alt) continue;
    const img = new Image();
    img.onload = () => { Scenes.art[name] = img; delete Scenes.cache[name]; if (typeof UI !== 'undefined' && S) UI.refresh(); };
    img.src = `art/${name}.png`;   // a missing file just leaves the drawn room in place
    for (const v of Scenes[name].alt.variants || []) {
      const vi = new Image();
      vi.onload = () => { Scenes.art[v] = vi; delete Scenes.cache[name]; };
      vi.src = `art/${v}.png`;
    }
  }
};
Scenes.usingArt = (name) => !!(Scenes.art[name] && Scenes[name].alt);

// The office, fitted to art/office.png (coordinates in the 320×180 image)
Scenes.office.alt = {
  key: () => [Math.floor(S.min / 30), Math.min(20, S.inbox.filter(d => !d.done).length), S.sips, S.inbox.some(d => d.deadline != null && d.deadline <= S.day)].join(),
  base(ctx) {
    const h = Scenes.hour();
    ctx.drawImage(Scenes.art.office, 0, 0, SW, SH);
    // the window darkens through the evening; stars come out at night
    if (h >= 17) {
      // clip to the two pointed-arch panes of the window
      ctx.save(); ctx.beginPath();
      for (const [l, r] of [[247, 272], [273, 299]]) { const m = (l + r) / 2; ctx.moveTo(l, 74); ctx.lineTo(l, 24); ctx.quadraticCurveTo(l, 12, m, 5); ctx.quadraticCurveTo(r, 12, r, 24); ctx.lineTo(r, 74); ctx.closePath(); }
      ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = h < 18.5 ? '#e8a070' : h < 19.5 ? '#7a5a8a' : '#2a3466'; ctx.fillRect(246, 6, 54, 70);
      ctx.restore();
      if (h >= 19.5) for (let i = 0; i < 10; i++) px(ctx, 250 + Art.hash(i, 1) * 46, 10 + Art.hash(i, 2) * 30, 1, 1, '#f4f0ff');
    }
    // letters pile up above the tray when the inbox overflows
    const n = S.inbox.filter(d => !d.done).length;
    for (let i = 0; i < Math.max(0, n - 7); i++) {
      const sx = 46 + Math.round((Art.hash(i, 1, 5) - 0.5) * 8), sy = 102 - i * 2;
      px(ctx, sx, sy, 36, 3, RR.paper[0]); px(ctx, sx, sy, 36, 2, i % 3 ? RR.paper[4] : RR.paper[3]);
      if (Art.hash(i, 2, 5) > 0.7) Art.disc(ctx, sx + 22, sy + 1, 1, ['#8e2a22', '#2a4a7a', '#c99a3e'][i % 3]);
    }
    // an empty mug shows its bottom instead of coffee
    if (S.sips === 0) { px(ctx, 236, 119, 15, 4, '#d9d2c4'); px(ctx, 237, 122, 13, 1, '#b9b0a2'); px(ctx, 240, 120, 6, 1, '#8a5a3a'); }
    // a red ribbon marks the planner when something is overdue
    if (S.inbox.some(d => d.deadline != null && d.deadline <= S.day)) { px(ctx, 214, 115, 4, 16, RR.red[4]); px(ctx, 214, 129, 2, 3, RR.red[3]); px(ctx, 216, 130, 2, 2, RR.red[3]); }
    // a candle stub on the desk for evenings
    px(ctx, 289, 141, 9, 3, RR.brass[2]); px(ctx, 290, 141, 7, 1, RR.brass[4]);
    px(ctx, 292, 133, 3, 8, '#efe6cf'); px(ctx, 294, 133, 1, 8, '#cfc4a8');
  },
  anim(ctx) {
    const h = Scenes.hour();
    if (S.sips > 0) for (let i = 0; i < 3; i++) { const p = (Scenes.frame * 0.25 + i * 9) % 24; px(ctx, 239 + i * 4 + Math.sin((Scenes.frame + i * 20) / 10) * 2, 115 - p, 2, 2, `rgba(255,255,255,${0.45 - p / 55})`); }
    if (h < 18) motes(ctx, 180, 80, 110, 60, 16);
    if (Scenes.lit()) { const f = Math.floor(Scenes.frame / 5) % 3; px(ctx, 293, 129 - (f === 1 ? 1 : 0), 1, 4, '#ffd866'); px(ctx, 293, 131, 1, 1, '#fff6c0'); }
  },
  light(ctx, d) {
    const h = Scenes.hour();
    if (h < 18) {
      // sunlight falling from the window across the desk
      const col = h < 9 ? '255,214,150' : h < 16 ? '255,246,220' : '255,190,120';
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.moveTo(248, 80); ctx.lineTo(300, 80); ctx.lineTo(268, 146); ctx.lineTo(170, 146); ctx.closePath(); ctx.clip();
      ctx.fillStyle = `rgba(${col},0.06)`; ctx.fillRect(160, 78, 150, 70);
      ctx.restore();
    }
    if (Scenes.lit()) { Art.glow(ctx, 293, 131, 90, '255,180,90', 0.2 + d * 0.35); Art.glow(ctx, 293, 131, 14, '255,220,140', 0.25); }
  },
  spots: () => [
    { x: 31, y: 100, w: 61, h: 47, label: () => `Inbox (${S.inbox.filter(d => !d.done).length} unread or unfiled)`, act: () => UI.inbox() },
    { x: 93, y: 117, w: 43, h: 28, label: 'Ledger', act: () => UI.ledger() },
    { x: 139, y: 116, w: 85, h: 27, label: 'Day planner: deadlines', act: () => UI.planner() },
    { x: 231, y: 115, w: 28, h: 29, label: () => S.sips ? `Sip coffee (${S.sips} left)` : 'Coffee mug (empty)', act: () => UI.sip() },
    { x: 163, y: 59, w: 38, h: 12, label: 'Roster book', act: () => UI.roster() },
    { x: 153, y: 71, w: 60, h: 45, label: 'Filing cabinet: archive', act: () => UI.archive() },
    { x: 75, y: 8, w: 72, h: 92, label: 'Door: to the main hall', act: () => UI.go('hall') },
    { x: 0, y: 0, w: 60, h: 98, label: 'Bookshelf: guild handbook and council rules', act: () => UI.rules() },
    { x: 157, y: 7, w: 53, h: 46, label: 'Guild charter', act: () => UI.charter() },
    { x: 240, y: 0, w: 66, h: 82, label: 'Window', act: () => UI.window() },
  ],
};

// The main hall, fitted to art/hall.png
Scenes.hall.alt = {
  key: () => [Math.floor(S.min / 30), S.board.map(p => p.status[0]).join(''), S.fac.academy].join(),
  base(ctx) {
    const h = Scenes.hour();
    ctx.drawImage(Scenes.art.hall, 0, 0, SW, SH);
    // the yard beyond the archway, and the sunlight it throws, fade with the day
    if (h >= 17) {
      const tint = h < 18.5 ? '#e8a070' : h < 19.5 ? '#7a5a8a' : '#2a3466';
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint;
      ctx.beginPath(); ctx.moveTo(172, 116); ctx.lineTo(172, 70); ctx.quadraticCurveTo(172, 55, 190, 54); ctx.quadraticCurveTo(208, 55, 208, 70); ctx.lineTo(208, 116); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(170, 116); ctx.lineTo(210, 116); ctx.lineTo(250, 180); ctx.lineTo(140, 180); ctx.closePath(); ctx.globalAlpha = 0.3; ctx.fill();
      ctx.restore();
    }
    // notices pinned to the cork
    S.board.slice(0, 10).forEach((p, i) => {
      const x = 61 + (i % 5) * 9.4, y = 66 + Math.floor(i / 5) * 19, tilt = Art.hash(i, p.id, 4) > 0.5 ? 1 : 0;
      px(ctx, x + 1, y + 1 + tilt, 8, 14, 'rgba(40,24,10,0.35)');
      px(ctx, x, y + tilt, 8, 14, p.status === 'claimed' ? RR.paper[2] : RR.paper[4]);
      for (let k = 0; k < 4; k++) px(ctx, x + 1, y + 3 + k * 2 + tilt, k === 0 ? 6 : 4 + (k % 2) * 2, 1, RR.paper[1]);
      px(ctx, x + 3, y, 2, 2, RR.red[4]);
      if (p.status === 'claimed') px(ctx, x + 1, y + 10 + tilt, 6, 3, RR.green[3]);
    });
    // once the Academy is founded, the boarded door becomes a proper one
    if (S.fac.academy) {
      ctx.save(); ctx.beginPath(); ctx.rect(226, 56, 38, 40); ctx.rect(226, 96, 19, 22); ctx.clip();
      door(ctx, 230, 60, 30, 56, RR.violet); Art.disc(ctx, 245, 70, 3, '#b8a8ff');
      ctx.restore();
    }
  },
  anim(ctx) {
    // candle flames on the chandelier
    const f = Math.floor(Scenes.frame / 5);
    for (const [cx, cy] of [[138, 21], [149, 15], [156, 26], [170, 16], [175, 25], [185, 21]]) {
      const k = (f + cx) % 3; px(ctx, cx, cy - (k === 1 ? 1 : 0), 1, 3, '#ffd866'); px(ctx, cx, cy + 1, 1, 1, '#fff6c0');
    }
    if (Scenes.hour() < 17.5) motes(ctx, 160, 90, 70, 60, 12);
    // the clerk stands behind the counter (clipped so the counter hides their legs)
    if (S.staff.clerk) {
      ctx.save(); ctx.beginPath(); ctx.rect(240, 60, 70, 37); ctx.clip();
      Scenes.person(ctx, 258, 110, { id: 99, look: { skin: '#e0ac7e', hair: '#222', style: 2 } }, { cloth: '#3a4a6a', glasses: true });
      ctx.restore();
    }
    const w = Scenes.whereabouts().hall;
    const seats = [[22, 160, true], [50, 160, true], [78, 160, true], [132, 168, false], [214, 170, false]];
    Scenes.hallSpots = w.slice(0, seats.length).map((a, i) => ({ a, x: seats[i][0], y: seats[i][1], sit: seats[i][2] }));
    for (const s of Scenes.hallSpots) Scenes.person(ctx, s.x, s.y, s.a, { sit: s.sit });
  },
  light(ctx, d) {
    Art.glow(ctx, 162, 22, 70, '255,190,110', 0.08 + d * 0.5);
    if (Scenes.hour() >= 17.5) Art.glow(ctx, 262, 102, 18, '255,210,130', d * 0.3);
  },
  spots: () => [
    { x: 56, y: 60, w: 54, h: 48, label: () => `Quest board (${S.board.length} posted)`, act: () => UI.board() },
    { x: 245, y: 94, w: 60, h: 54, label: 'Reception desk: hiring notices', act: () => UI.reception() },
    { x: 4, y: 48, w: 38, h: 90, label: 'Door: back to your office', act: () => UI.go('office') },
    { x: 305, y: 54, w: 15, h: 100, label: 'Door: the tavern', act: () => UI.go('tavern') },
    { x: 276, y: 40, w: 30, h: 22, label: 'Door: the tavern', act: () => UI.go('tavern'), noTag: true },
    { x: 168, y: 50, w: 47, h: 66, label: 'Archway: training yard', act: () => UI.go('yard') },
    { x: 111, y: 40, w: 50, h: 78, label: 'Stairs: the inn', act: () => UI.go('inn') },
    { x: 226, y: 57, w: 36, h: 38, label: () => S.fac.academy ? 'The Academy' : 'A boarded-up door', act: () => S.fac.academy ? UI.go('academy') : UI.say('The old lecture hall. Boarded up since Hela\'s day. The builders could reopen it, with the Council\'s blessing and enough gold.') },
    ...(Scenes.hallSpots || []).map(s => ({ x: s.x - 8, y: s.y - 28, w: 17, h: 30, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// The tavern, fitted to art/tavern.png
Scenes.tavern.alt = {
  key: () => [S.alePrice].join(),
  base(ctx) {
    ctx.drawImage(Scenes.art.tavern, 0, 0, SW, SH);
    // prices chalked on the board: one coin per gold
    const chalk = 'rgba(236,236,220,0.85)', price = { cheap: 1, fair: 2, steep: 3 }[S.alePrice];
    px(ctx, 168, 62, 14, 1, chalk); px(ctx, 168, 64, 9, 1, chalk);
    for (let i = 0; i < price; i++) Art.disc(ctx, 190 + i * 5, 63, 1, '#f4d470');
    px(ctx, 168, 72, 18, 1, chalk); px(ctx, 168, 74, 11, 1, chalk);
    Art.disc(ctx, 190, 73, 1, '#f4d470'); Art.disc(ctx, 195, 73, 1, '#f4d470');
  },
  anim(ctx) {
    // the painted fire flickers: a pulsing glow and a few bright embers, plus sparks
    const fl = 0.5 + 0.5 * Math.sin(Scenes.frame / 4) * Math.sin(Scenes.frame / 7.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    Art.disc(ctx, 112, 108, 9, `rgba(255,170,60,${0.12 + fl * 0.12})`); Art.disc(ctx, 112, 110, 5, `rgba(255,220,120,${0.1 + fl * 0.15})`);
    ctx.restore();
    for (let i = 0; i < 4; i++) if (Art.hash(i, Math.floor(Scenes.frame / 6)) > 0.5) px(ctx, 104 + i * 5, 112 + (i % 2) * 3, 1, 1, '#ffe8a0');
    sparks(ctx, 112, 100, 6, 20);
    const f = Math.floor(Scenes.frame / 5);
    for (const [cx, cy] of [[92, 71], [124, 72], [130, 70]]) { const k = (f + cx) % 3; px(ctx, cx, cy - (k === 1 ? 1 : 0), 1, 3, '#ffd866'); px(ctx, cx, cy + 1, 1, 1, '#fff6c0'); }
    if (S.staff.barkeep) {
      ctx.save(); ctx.beginPath(); ctx.rect(230, 60, 60, 38); ctx.clip();
      Scenes.person(ctx, 256, 112, { id: 98, look: { skin: '#c68642', hair: '#5a3a1a', style: 0, beard: true } }, { cloth: '#7a3a2a', apron: true });
      ctx.restore();
    }
    const w = Scenes.whereabouts().tavern;
    const seats = [[73, 165, true], [175, 158, true], [285, 170, true], [212, 113, true], [136, 168, false]];
    Scenes.tavSpots = w.slice(0, seats.length).map((a, i) => ({ a, x: seats[i][0], y: seats[i][1], sit: seats[i][2] }));
    for (const s of Scenes.tavSpots) Scenes.person(ctx, s.x, s.y, s.a, { sit: s.sit });
  },
  light(ctx, d) {
    const f = Math.sin(Scenes.frame / 7) * 4;
    Art.glow(ctx, 112, 108, 80 + f, '255,130,50', 0.18 + d * 0.3);
    for (const [lx, ly] of [[84, 32], [172, 33], [250, 33]]) Art.glow(ctx, lx, ly, 28, '255,200,110', 0.1 + d * 0.3);
  },
  spots: () => [
    { x: 218, y: 48, w: 92, h: 100, label: S.staff.barkeep ? `The bar: talk to ${S.staff.barkeep.name}, refill coffee` : 'The bar: refill coffee', act: () => UI.bar() },
    { x: 160, y: 54, w: 48, h: 32, label: 'Price board: set the price of ale', act: () => UI.prices() },
    { x: 4, y: 48, w: 38, h: 92, label: 'Door: back to the hall', act: () => UI.go('hall') },
    ...(Scenes.tavSpots || []).map(s => ({ x: s.x - 8, y: s.y - 26, w: 17, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// The training yard, fitted to art/yard.png; yard_2 / yard_3 show its upgrades
Scenes.yard.alt = {
  variants: ['yard_2', 'yard_3'],
  key: () => [Math.floor(S.min / 30), S.fac.yard].join(),
  base(ctx) {
    const h = Scenes.hour();
    const img = (S.fac.yard >= 3 && Scenes.art.yard_3) || (S.fac.yard >= 2 && Scenes.art.yard_2) || Scenes.art.yard;
    ctx.drawImage(img, 0, 0, SW, SH);
    // the sky warms at sunset and deepens to night; stars come out
    if (h >= 16.5) {
      // one smooth tint, strongest in the sky and easing off towards the ground
      const rgb = h < 18 ? '240,176,128' : h < 19.5 ? '154,106,144' : '58,68,120';
      const g = ctx.createLinearGradient(0, 0, 0, SH);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.3, `rgba(${rgb},1)`); g.addColorStop(0.55, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0.45)`);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH); ctx.restore();
      // stars, only where there's open sky (not on the trees or the wall)
      if (h >= 19.5) for (let i = 0; i < 30; i++) {
        const x = Art.hash(i, 1, 7) * 270, y = Art.hash(i, 2, 7) * 42;
        if ((x > 50 && x < 112 && y > 12) || x > 214) continue;
        px(ctx, x, y, 1, 1, '#f4f0ff');
      }
    }
  },
  anim(ctx) {
    if (S.staff.trainer) Scenes.person(ctx, 206, 124, { id: 97, look: { skin: '#8d5524', hair: '#222', style: 0, beard: true } }, { cloth: '#6a2a2a' });
    const w = Scenes.whereabouts().yard;
    const spots = [[150, 140], [232, 136], [112, 160], [190, 156], [262, 160], [72, 150]];
    Scenes.yardSpots = w.slice(0, spots.length).map((a, i) => ({ a, x: spots[i][0], y: spots[i][1] }));
    for (const s of Scenes.yardSpots) Scenes.person(ctx, s.x, s.y, s.a);
    if (Scenes.hour() < 18) for (let i = 0; i < 2; i++) { const bx = (Scenes.frame * 0.3 + i * 140) % 360 - 20, by = 18 + i * 9 + Math.sin(Scenes.frame / 20 + i) * 2, f = Math.floor(Scenes.frame / 8 + i) % 2; px(ctx, bx, by, 2, 1, '#2a2a30'); px(ctx, bx + 3, by, 2, 1, '#2a2a30'); px(ctx, bx + 2, by + f, 1, 1, '#2a2a30'); }
  },
  spots: () => [
    { x: 8, y: 64, w: 42, h: 72, label: 'Training roster: schedule sessions', act: () => UI.trainForm('yard') },
    { x: 288, y: 33, w: 32, h: 90, label: 'Gate: back to the hall', act: () => UI.go('hall') },
    ...(S.staff.trainer ? [{ x: 198, y: 96, w: 17, h: 30, label: `Talk to ${S.staff.trainer.name}`, act: () => UI.say(`"Give me a week with any of them and I'll make them worth twice the coin." ${S.staff.trainer.name} cracks their knuckles.`) }] : []),
    ...(Scenes.yardSpots || []).map(s => ({ x: s.x - 8, y: s.y - 28, w: 17, h: 30, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// every scene draws through the shared compositor, using painted art when present
for (const name of Scenes.ROOMS) {
  const sc = Scenes[name], drawnSpots = sc.spots;
  sc.draw = (ctx) => Scenes.usingArt(name) ? Scenes.render({ ...sc, ...sc.alt }, ctx, name) : Scenes.render(sc, ctx, name);
  sc.spots = () => (Scenes.usingArt(name) && sc.alt.spots ? sc.alt.spots() : drawnSpots());
}
