// ============================================================================
//  RENDER — procedural pixel-art canvas renderer (no image assets)
// ============================================================================
'use strict';

const Render = {
  cv: null, ctx: null, scale: 1, T: DATA.TILE, overlay: null, frame: 0,
  hover: null, ghost: null, selected: null, selRoom: null, rain: [],
};

Render.init = (canvas) => {
  Render.cv = canvas; Render.ctx = canvas.getContext('2d');
  for (let i = 0; i < 80; i++) Render.rain.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.6 });
  Render.resize();
};
Render.resize = () => {
  const wrap = Render.cv.parentElement;
  const aw = wrap.clientWidth, ah = wrap.clientHeight;
  const bw = DATA.MAP_W * Render.T, bh = DATA.MAP_H * Render.T;
  const s = Math.max(0.3, Math.min(aw / bw, ah / bh));
  const dpr = window.devicePixelRatio || 1;
  Render.scale = s;
  Render.cv.style.width = Math.floor(bw * s) + 'px';
  Render.cv.style.height = Math.floor(bh * s) + 'px';
  Render.cv.width = Math.floor(bw * s * dpr);
  Render.cv.height = Math.floor(bh * s * dpr);
  Render.dpr = dpr;
};
Render.toTile = (ev) => {
  const r = Render.cv.getBoundingClientRect();
  const x = (ev.clientX - r.left) / Render.scale / Render.T, y = (ev.clientY - r.top) / Render.scale / Render.T;
  return { fx: x, fy: y, x: Math.floor(x), y: Math.floor(y) };
};

// ---------------------------------------------------------------- utils ----
const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const shade = (hex, amt) => {
  let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt))); g = Math.max(0, Math.min(255, Math.round(g + amt))); b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};
const noise = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

// ------------------------------------------------------------ main draw ----
Render.draw = (alpha) => {
  const ctx = Render.ctx, T = Render.T;
  Render.frame++;
  ctx.setTransform(Render.scale * Render.dpr, 0, 0, Render.scale * Render.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  Render.drawTiles(ctx, T);
  if (Render.overlay) Render.drawOverlay(ctx, T);
  // rooms (sorted so lower ones overlap upper)
  const rooms = [...G.rooms].sort((a, b) => (a.y + a.h) - (b.y + b.h));
  for (const r of rooms) if (DATA.ROOMS[r.type].walkable) Render.drawRoom(ctx, r, T);
  // entities sorted by y for depth
  const ents = [];
  for (const r of rooms) if (!DATA.ROOMS[r.type].walkable) ents.push({ y: r.y + r.h - 0.5, k: 'room', r });
  for (const c of G.chars) if (c.state !== 'away') {
    const x = c.ox + (c.x - c.ox) * alpha, y = c.oy + (c.y - c.oy) * alpha;
    ents.push({ y: c.pose === 'lie' ? (Sim.room(c.act && c.act.room) ? Sim.room(c.act.room).y + Sim.room(c.act.room).h - 0.4 : y) : y + 0.01, k: 'char', c, x, yy: y });
  }
  for (const v of G.vis) {
    const x = v.ox + (v.x - v.ox) * alpha, y = v.oy + (v.y - v.oy) * alpha;
    ents.push({ y: y + 0.01, k: 'vis', v, x, yy: y });
  }
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e.k === 'room') Render.drawRoom(ctx, e.r, T);
    else if (e.k === 'char') Render.drawChar(ctx, e.c, e.x, e.yy, T);
    else Render.drawVisitor(ctx, e.v, e.x, e.yy, T);
  }
  Render.drawWallsFront(ctx, T);
  Render.drawLighting(ctx, T);
  for (const e of ents) if (e.k === 'char') Render.drawBubble(ctx, e.c, e.x, e.yy, T);
  Render.drawMarks(ctx, T);
  Render.drawGhost(ctx, T);
};

// ------------------------------------------------------------ tiles --------
Render.drawTiles = (ctx, T) => {
  const W = DATA.MAP_W, H = DATA.MAP_H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Sim.tile(x, y), px = x * T, py = y * T;
    if (t.t === 'wall') { Render.drawWall(ctx, x, y, px, py, T); continue; }
    if (t.t === 'door') { Render.drawDoor(ctx, px, py, T); continue; }
    // wooden floor planks, darker & cracked when worn
    const c = t.cond / 100;
    const base = `rgb(${Math.round(92 + 70 * c)},${Math.round(64 + 46 * c)},${Math.round(40 + 22 * c)})`;
    R(ctx, px, py, T, T, base);
    const plank = (y % 2) ? 0 : T / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 8 + 7, T, 1);
    ctx.fillRect(px + ((plank + x * 13) % T), py, 1, T);
    if (noise(x, y) > 0.6) { ctx.fillStyle = 'rgba(255,240,200,0.06)'; ctx.fillRect(px + 2, py + 1, T - 4, 6); }
    if (t.cond < 28) { // cracks & missing boards
      ctx.strokeStyle = `rgba(30,18,8,${0.25 + (28 - t.cond) / 40})`; ctx.lineWidth = 1; ctx.beginPath();
      const n1 = noise(x, y, 1), n2 = noise(x, y, 2);
      ctx.moveTo(px + 4 + n1 * 10, py + 4); ctx.lineTo(px + 12 + n2 * 8, py + 14); ctx.lineTo(px + 8 + n1 * 14, py + 26); ctx.stroke();
      if (t.cond < 12) R(ctx, px + 6 + n2 * 12, py + 8 + n1 * 12, 8, 5, '#2a1a0c');
    }
    if (t.cond < 25 && noise(x, y, 5) > 0.55) { R(ctx, px + 3, py + 22, 2, 5, '#5b7a3a'); R(ctx, px + 5, py + 20, 2, 7, '#6d8f45'); } // weeds
    if (t.t === 'rubble') Render.drawRubble(ctx, x, y, px, py, T);
    if (t.puddle > 5) {
      ctx.fillStyle = `rgba(90,140,200,${Math.min(0.55, t.puddle / 120)})`;
      ctx.beginPath(); ctx.ellipse(px + T / 2, py + T / 2 + 4, 6 + t.puddle / 10, 4 + t.puddle / 18, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (t.leak) { // stain from the hole above
      ctx.fillStyle = 'rgba(40,60,80,0.18)'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 9, 0, Math.PI * 2); ctx.fill();
      if (G.weather === 'rain' || G.weather === 'storm') {
        const f = (Render.frame * 0.6 + x * 7) % 24;
        R(ctx, px + T / 2, py + f, 1, 4, 'rgba(160,200,255,0.9)');
      }
    }
  }
};
Render.drawRubble = (ctx, x, y, px, py, T) => {
  // a heap: shadowed base, stacked stones, a splintered roof beam poking out
  ctx.fillStyle = 'rgba(20,12,6,0.45)';
  ctx.beginPath(); ctx.ellipse(px + T / 2, py + T - 7, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  const flip = noise(x, y, 7) > 0.5;
  ctx.save(); ctx.translate(px + T / 2, py + T / 2); ctx.rotate(flip ? -0.6 : 0.6);
  R(ctx, -2, -15, 4, 22, '#6b4a2b'); R(ctx, -2, -15, 2, 22, '#80592f'); R(ctx, -3, -16, 6, 3, '#4a3018');
  ctx.restore();
  const stones = [[-9, 6, 10], [1, 7, 11], [10, 6, 8], [-5, 0, 9], [5, 0, 9], [0, -6, 8]];
  stones.forEach(([sx, sy, sz], i) => {
    const n = noise(x, y, i);
    const base = n > 0.66 ? '#8d8478' : n > 0.33 ? '#7a7066' : '#9a9184';
    const cx = px + T / 2 + sx - sz / 2, cy = py + T / 2 + sy;
    R(ctx, cx, cy, sz, sz * 0.7, base);
    R(ctx, cx, cy, sz, 2, shade(base, 28));
    R(ctx, cx, cy + sz * 0.7 - 2, sz, 2, shade(base, -35));
  });
};
Render.drawWall = (ctx, x, y, px, py, T) => {
  const top = y === 0;
  R(ctx, px, py, T, T, top ? '#5d5a66' : '#4a4752');
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let r = 0; r < 4; r++) {
    ctx.fillRect(px, py + r * 8, T, 1);
    ctx.fillRect(px + ((r % 2) ? 8 : 20), py + r * 8, 1, 8);
  }
  if (top && x % 4 === 2 && x > 0 && x < DATA.MAP_W - 1) { // windows
    const night = !Sim.isDaylight();
    R(ctx, px + 7, py + 6, 18, 20, '#2a2832');
    R(ctx, px + 9, py + 8, 14, 16, night ? '#1c2440' : G.weather === 'clear' ? '#9fd0f0' : '#7d8ea0');
    if (G.weather === 'snow') { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(px + 9 + ((Render.frame * 0.3 + i * 5) % 14), py + 8 + ((Render.frame * 0.5 + i * 9) % 16), 1, 1); }
    if (G.weather === 'rain' || G.weather === 'storm') { ctx.fillStyle = 'rgba(200,220,255,0.7)'; for (let i = 0; i < 3; i++) ctx.fillRect(px + 10 + i * 5, py + 8 + ((Render.frame + i * 6) % 14), 1, 3); }
    R(ctx, px + 15, py + 8, 2, 16, '#2a2832'); R(ctx, px + 9, py + 15, 14, 2, '#2a2832');
    if (noise(x, 0) > 0.4 && !G.goals.roof) R(ctx, px + 18, py + 9, 4, 5, '#2a2832'); // broken pane
  }
  if (!top && noise(x, y, 9) > 0.8) R(ctx, px + 10, py + 12, 8, 6, '#3a3740');
};
Render.drawDoor = (ctx, px, py, T) => {
  R(ctx, px, py, T, T, '#4a4752');
  R(ctx, px + 4, py + 2, T - 8, T - 2, '#2a1c10');
  R(ctx, px + 6, py + 4, T - 12, T - 4, '#6a4424');
  R(ctx, px + 6, py + 4, 2, T - 4, '#7d5430');
  R(ctx, px + T - 10, py + 16, 2, 3, '#d8b04a');
};
Render.drawWallsFront = (ctx, T) => {
  // name plaque over the door, from the inside
  const d = G.door;
  ctx.fillStyle = 'rgba(0,0,0,0.0)';
};

// ------------------------------------------------------------ rooms --------
Render.drawRoom = (ctx, r, T) => {
  const px = r.x * T, py = r.y * T, w = r.w * T, h = r.h * T;
  const f = Render.F[r.type];
  ctx.save();
  if (r.broken) ctx.filter = 'grayscale(0.85) brightness(0.65)';
  if (f) f(ctx, px, py, w, h, r, T);
  else R(ctx, px + 2, py + 2, w - 4, h - 4, '#a08060');
  ctx.restore();
  if (r.broken) {
    ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(px + 4, py + 6); ctx.lineTo(px + w * 0.5, py + h * 0.55); ctx.lineTo(px + w - 6, py + h - 4); ctx.stroke();
    ctx.font = '12px serif'; ctx.textAlign = 'center';
    ctx.fillText(r.repair ? '🔨' : '⚠️', px + w / 2, py + 14);
  } else if (r.cond < 30) {
    ctx.fillStyle = 'rgba(60,40,20,0.35)'; ctx.fillRect(px + 2, py + h - 6, w - 4, 3);
  }
  if (Render.selRoom === r.id) {
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2); ctx.setLineDash([]);
  }
};
const fire = (ctx, x, y, s = 1) => {
  const t = Render.frame * 0.25;
  const fl = (k) => Math.sin(t + k) * 2;
  R(ctx, x - 5 * s, y - 4 * s + fl(0), 10 * s, 6 * s, '#e0502a');
  R(ctx, x - 3 * s, y - 8 * s + fl(1), 6 * s, 6 * s, '#f08c2a');
  R(ctx, x - 1.5 * s, y - 10 * s + fl(2), 3 * s, 5 * s, '#ffe066');
};
Render.F = {
  board(ctx, x, y, w, h) {
    R(ctx, x + 3, y + 2, w - 6, h - 8, '#6b4a2b'); R(ctx, x + 5, y + 4, w - 10, h - 12, '#c9a26b');
    const n = Math.min(4, G.quests.length);
    const cols = ['#f4ecd8', '#e8d8b0', '#f0e0c8', '#fff4dc'];
    for (let i = 0; i < n; i++) R(ctx, x + 7 + (i % 2) * 9, y + 6 + Math.floor(i / 2) * 9, 8, 8, cols[i]);
    R(ctx, x + 6, y + h - 7, 3, 7, '#4a3020'); R(ctx, x + w - 9, y + h - 7, 3, 7, '#4a3020');
  },
  desk(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 8, w - 4, h - 10, '#6b4220'); R(ctx, x + 2, y + 6, w - 4, 5, '#8b5a2b');
    R(ctx, x + 10, y + 2, 10, 6, '#f4ecd8'); R(ctx, x + w - 16, y + 1, 6, 5, '#d8b04a'); R(ctx, x + w - 14, y, 2, 2, '#d8b04a');
    R(ctx, x + 30, y + 3, 4, 4, '#3a5a8a');
  },
  cot(ctx, x, y, w, h, r) {
    R(ctx, x + 4, y + 3, w - 8, h - 6, '#6b4a2b'); R(ctx, x + 6, y + 5, w - 12, h - 10, '#d9c27a');
    ctx.fillStyle = 'rgba(160,130,60,0.6)'; for (let i = 0; i < 8; i++) ctx.fillRect(x + 7 + (i * 5) % 16, y + 8 + i * 6, 6, 1);
    R(ctx, x + 7, y + 6, w - 14, 8, '#e8dcb0');
  },
  bunk(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 1, w - 4, h - 2, '#5a3a1e'); R(ctx, x + 4, y + 4, w - 8, h / 2 - 6, '#7a9ac0');
    R(ctx, x + 4, y + h / 2 + 2, w - 8, h / 2 - 6, '#7a9ac0');
    R(ctx, x + 5, y + 5, w - 10, 6, '#eee'); R(ctx, x + 5, y + h / 2 + 3, w - 10, 6, '#eee');
    R(ctx, x + 2, y + h / 2 - 2, w - 4, 3, '#4a2e16');
  },
  bed(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 1, w - 4, h - 2, '#6b3a1e'); R(ctx, x + 2, y + 1, w - 4, 8, '#8b4a24');
    R(ctx, x + 5, y + 10, w - 10, h - 14, '#8a3a6a'); R(ctx, x + 7, y + 12, w - 14, h - 18, '#a04a80');
    R(ctx, x + 7, y + 9, 22, 8, '#fff'); R(ctx, x + w - 29, y + 9, 22, 8, '#fff');
    R(ctx, x + 5, y + 30, w - 10, 3, '#d8b04a');
  },
  infirm(ctx, x, y, w, h) {
    R(ctx, x + 4, y + 2, w - 8, h - 4, '#9aa'); R(ctx, x + 6, y + 4, w - 12, h - 8, '#f4f4f0');
    R(ctx, x + 7, y + 5, w - 14, 8, '#fff'); R(ctx, x + 13, y + 28, 6, 14, '#c33'); R(ctx, x + 9, y + 32, 14, 6, '#c33');
  },
  hearth(ctx, x, y, w, h, r) {
    R(ctx, x + 2, y + 2, w - 4, h - 4, '#6e6a70'); R(ctx, x + 4, y, w - 8, 10, '#5a565c');
    for (let i = 0; i < 5; i++) R(ctx, x + 4 + i * 11, y + 14 + (i % 2) * 4, 10, 1, '#4e4a50');
    R(ctx, x + 14, y + 22, w - 28, h - 26, '#1a1210');
    if (!r.broken) { fire(ctx, x + w / 2, y + h - 8, 1.2); }
    R(ctx, x + 22, y + 18, 20, 12, '#2c2c30'); R(ctx, x + 20, y + 17, 24, 3, '#3c3c40'); // pot
    if (!r.broken && Render.frame % 40 < 20) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 28, y + 10 - (Render.frame % 20) / 4, 3, 3); }
  },
  table(ctx, x, y, w, h) {
    R(ctx, x + 1, y + 6, w - 2, h - 10, '#7a5230'); R(ctx, x + 1, y + 6, w - 2, 3, '#93653c');
    R(ctx, x + 4, y + h - 5, 3, 5, '#5a3a1e'); R(ctx, x + w - 7, y + h - 5, 3, 5, '#5a3a1e');
    for (let i = 0; i < 3; i++) R(ctx, x + 10 + i * 32, y + 10, 8, 5, '#ddd');
  },
  basin(ctx, x, y, w, h) {
    R(ctx, x + 8, y + 14, 16, 16, '#6b4a2b'); R(ctx, x + 4, y + 8, 24, 10, '#8a8a92'); R(ctx, x + 6, y + 10, 20, 5, '#6ab0e0');
  },
  bath(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 2, w - 4, h - 4, '#8a7a6a'); R(ctx, x + 6, y + 6, w - 12, h - 12, '#4a90c8');
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 10, y + 14 + Math.sin(Render.frame * 0.1) * 2, 20, 2);
    if (Render.frame % 60 < 30) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 30, y + 4 - (Render.frame % 30) / 6, 5, 4); }
  },
  bar(ctx, x, y, w, h) {
    R(ctx, x + 1, y + 8, w - 2, h - 8, '#5a3216'); R(ctx, x + 1, y + 5, w - 2, 6, '#8b5a2b');
    for (let i = 0; i < 3; i++) { R(ctx, x + 8 + i * 30, y - 1, 8, 7, '#d8b04a'); R(ctx, x + 9 + i * 30, y, 6, 2, '#fff'); }
    R(ctx, x + w - 18, y - 6, 14, 12, '#6b4a2b'); R(ctx, x + w - 18, y - 3, 14, 2, '#3a2a1a'); // barrel
  },
  dice(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 4, w - 4, h - 8, '#2f6b3a'); R(ctx, x + 2, y + 4, w - 4, 3, '#5a3a1e');
    R(ctx, x + 20, y + 12, 6, 6, '#fff'); R(ctx, x + 32, y + 14, 6, 6, '#fff'); R(ctx, x + 22, y + 14, 1, 1, '#000'); R(ctx, x + 34, y + 16, 2, 2, '#000');
  },
  shelf(ctx, x, y, w, h) {
    R(ctx, x + 2, y, w - 4, h - 2, '#5a3a1e');
    const cols = ['#a33', '#36a', '#3a6', '#c93', '#639', '#888'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      R(ctx, x + 5 + i * 6.3, y + 3 + row * 9, 5, 7, cols[(i + row * 2) % cols.length]);
    }
  },
  dummy(ctx, x, y, w, h) {
    R(ctx, x + 15, y + 8, 3, 24, '#5a3a1e'); R(ctx, x + 8, y + 14, 17, 3, '#5a3a1e');
    R(ctx, x + 10, y + 10, 13, 14, '#d9c27a'); R(ctx, x + 12, y + 2, 9, 9, '#d9c27a');
    R(ctx, x + 14, y + 5, 2, 2, '#333'); R(ctx, x + 18, y + 5, 2, 2, '#333');
  },
  butts(ctx, x, y, w, h) {
    for (const ox of [8, 38]) {
      R(ctx, x + ox, y + 4, 18, 22, '#d9c27a');
      ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(x + ox + 9, y + 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + ox + 9, y + 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(x + ox + 9, y + 14, 2, 0, Math.PI * 2); ctx.fill();
    }
  },
  shrine(ctx, x, y, w, h) {
    R(ctx, x + 6, y + 30, w - 12, h - 32, '#b8b0a0'); R(ctx, x + 10, y + 22, w - 20, 10, '#d8d0c0');
    R(ctx, x + 28, y + 4, 8, 20, '#d8d0c0');
    const g = 0.4 + Math.sin(Render.frame * 0.05) * 0.2;
    ctx.fillStyle = `rgba(255,220,120,${g})`; ctx.beginPath(); ctx.arc(x + 32, y + 8, 7, 0, Math.PI * 2); ctx.fill();
    R(ctx, x + 14, y + 26, 3, 5, '#ffe9a0'); R(ctx, x + w - 17, y + 26, 3, 5, '#ffe9a0');
  },
  forge(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 2, 30, h - 4, '#5a565c'); R(ctx, x + 6, y + 20, 22, 18, '#1a1210'); fire(ctx, x + 17, y + 36, 1);
    R(ctx, x + 38, y + 30, 20, 8, '#3a3a40'); R(ctx, x + 42, y + 38, 12, 14, '#3a3a40'); R(ctx, x + 36, y + 28, 24, 4, '#55555c');
  },
  alch(ctx, x, y, w, h) {
    R(ctx, x + 2, y + 10, w - 4, h - 12, '#6b4a2b');
    const cs = ['#6c3', '#c3c', '#3cf', '#fc3'];
    for (let i = 0; i < 4; i++) { R(ctx, x + 8 + i * 13, y + 2 + (i % 2) * 2, 7, 10, cs[i]); R(ctx, x + 10 + i * 13, y, 3, 3, '#ccc'); }
    if (Render.frame % 50 < 25) { ctx.fillStyle = 'rgba(180,255,120,0.5)'; ctx.fillRect(x + 10, y - 3 - (Render.frame % 25) / 5, 3, 3); }
  },
  scry(ctx, x, y, w, h) {
    R(ctx, x + 10, y + 22, 12, 9, '#3a2a4a');
    const g = 0.6 + Math.sin(Render.frame * 0.07) * 0.3;
    ctx.fillStyle = `rgba(150,110,255,${g})`; ctx.beginPath(); ctx.arc(x + 16, y + 14, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + 12, y + 9, 3, 3);
  },
  trophy(ctx, x, y, w, h) {
    R(ctx, x + 4, y + 2, 24, 28, '#5a3a1e'); R(ctx, x + 6, y + 4, 20, 24, 'rgba(180,220,255,0.35)');
    R(ctx, x + 10, y + 8, 12, 8, '#d8b04a'); R(ctx, x + 14, y + 16, 4, 6, '#d8b04a'); R(ctx, x + 11, y + 22, 10, 3, '#d8b04a');
  },
  plant(ctx, x, y, w, h) {
    R(ctx, x + 10, y + 20, 12, 10, '#a0522d'); R(ctx, x + 9, y + 19, 14, 3, '#b8653a');
    ctx.fillStyle = '#3f8a3a';
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.45; ctx.save(); ctx.translate(x + 16, y + 20); ctx.rotate(a + Math.PI / 2); ctx.fillRect(-2, -16, 4, 16); ctx.restore(); }
  },
  banner(ctx, x, y, w, h) {
    R(ctx, x + 14, y + 2, 3, 28, '#5a3a1e'); R(ctx, x + 6, y + 2, 20, 3, '#5a3a1e');
    R(ctx, x + 8, y + 5, 16, 18, '#a33'); R(ctx, x + 8, y + 23, 8, 4, '#a33'); R(ctx, x + 16, y + 23, 8, 2, '#a33');
    R(ctx, x + 13, y + 9, 6, 8, '#d8b04a'); R(ctx, x + 12, y + 9, 8, 2, '#d8b04a');
  },
  rug(ctx, x, y, w, h) {
    R(ctx, x + 3, y + 3, w - 6, h - 6, '#8a2f3a'); R(ctx, x + 7, y + 7, w - 14, h - 14, '#b0503a');
    R(ctx, x + 12, y + 12, w - 24, h - 24, '#d8b04a'); R(ctx, x + 16, y + 16, w - 32, h - 32, '#8a2f3a');
  },
  statue(ctx, x, y, w, h) {
    R(ctx, x + 6, y + 24, 20, 8, '#8a8a92'); R(ctx, x + 11, y + 10, 10, 14, '#b8b8c0'); R(ctx, x + 12, y + 2, 8, 8, '#b8b8c0');
    R(ctx, x + 21, y, 2, 18, '#9a9aa2'); R(ctx, x + 19, y + 12, 6, 2, '#9a9aa2');
  },
};

// ------------------------------------------------------------ people -------
Render.person = (ctx, cx, fy, o) => {
  // cx: center x px, fy: foot y px
  const L = o.look, s = o.size || 1;
  const bob = o.walking ? Math.abs(Math.sin(Render.frame * 0.35 + o.seed)) * 1.5 : 0;
  const leg = o.walking ? Math.sin(Render.frame * 0.35 + o.seed) * 2 : 0;
  const y = fy - bob;
  const cloth = o.cloth || L.cloth;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, fy, 6 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  R(ctx, cx - 4 * s, y - 6 * s + leg, 3 * s, 6 * s - leg, '#3a2a1e');
  R(ctx, cx + 1 * s, y - 6 * s - leg, 3 * s, 6 * s + leg, '#3a2a1e');
  // body
  const robe = o.cls === 'mage' || o.cls === 'cleric';
  R(ctx, cx - 5 * s, y - 15 * s, 10 * s, robe ? 12 * s : 10 * s, cloth);
  R(ctx, cx - 5 * s, y - 15 * s, 10 * s, 2 * s, shade(cloth, 25));
  if (o.trim) R(ctx, cx - 5 * s, y - 8 * s, 10 * s, 1.5 * s, o.trim);
  // arms
  R(ctx, cx - 7 * s, y - 14 * s, 2 * s, 7 * s, shade(cloth, -20)); R(ctx, cx + 5 * s, y - 14 * s, 2 * s, 7 * s, shade(cloth, -20));
  R(ctx, cx - 7 * s, y - 8 * s, 2 * s, 2 * s, L.skin); R(ctx, cx + 5 * s, y - 8 * s, 2 * s, 2 * s, L.skin);
  // head
  R(ctx, cx - 4 * s, y - 23 * s, 8 * s, 8 * s, L.skin);
  const ex = o.dir < 0 ? -1 : 1;
  R(ctx, cx + (ex > 0 ? 0 : -3) * s, y - 20 * s, 1.2 * s, 1.5 * s, '#1a1a1a'); R(ctx, cx + (ex > 0 ? 3 : 0) * s - 1, y - 20 * s, 1.2 * s, 1.5 * s, '#1a1a1a');
  // hair
  const st = L.style;
  R(ctx, cx - 4 * s, y - 24 * s, 8 * s, 3 * s, L.hair);
  if (st === 1) { R(ctx, cx - 5 * s, y - 23 * s, 2 * s, 7 * s, L.hair); R(ctx, cx + 3 * s, y - 23 * s, 2 * s, 7 * s, L.hair); }
  if (st === 2) R(ctx, cx - 2 * s, y - 26 * s, 4 * s, 3 * s, L.hair);
  if (st === 3) { R(ctx, cx - 5 * s, y - 23 * s, 2 * s, 11 * s, L.hair); R(ctx, cx + 3 * s, y - 23 * s, 2 * s, 11 * s, L.hair); }
  if (L.beard) R(ctx, cx - 3 * s, y - 17 * s, 6 * s, 3 * s, L.hair);
  // class / role accessories
  const k = o.cls || o.role;
  if (k === 'warrior') { R(ctx, cx - 5 * s, y - 25 * s, 10 * s, 4 * s, '#9aa0a8'); R(ctx, cx - 1 * s, y - 27 * s, 2 * s, 3 * s, '#c33'); R(ctx, cx + 7 * s, y - 16 * s, 2 * s, 10 * s, '#c8ccd2'); R(ctx, cx + 6 * s, y - 8 * s, 4 * s, 2 * s, '#6b4a2b'); }
  if (k === 'mage') { R(ctx, cx - 6 * s, y - 25 * s, 12 * s, 2 * s, cloth); R(ctx, cx - 4 * s, y - 28 * s, 8 * s, 3 * s, cloth); R(ctx, cx - 2 * s, y - 31 * s, 4 * s, 3 * s, cloth); R(ctx, cx - 1 * s, y - 33 * s, 2 * s, 2 * s, o.trim);
    R(ctx, cx - 9 * s, y - 20 * s, 1.5 * s, 16 * s, '#6b4a2b'); R(ctx, cx - 10 * s, y - 22 * s, 3.5 * s, 3 * s, '#8af'); }
  if (k === 'rogue') { R(ctx, cx - 5 * s, y - 25 * s, 10 * s, 4 * s, cloth); R(ctx, cx - 5 * s, y - 23 * s, 1.5 * s, 7 * s, cloth); R(ctx, cx + 3.5 * s, y - 23 * s, 1.5 * s, 7 * s, cloth); R(ctx, cx - 4 * s, y - 18 * s, 8 * s, 2 * s, shade(cloth, -10)); R(ctx, cx + 6 * s, y - 9 * s, 1.5 * s, 5 * s, '#ccc'); }
  if (k === 'cleric') { R(ctx, cx - 4 * s, y - 25 * s, 8 * s, 1.5 * s, '#d4a52a'); R(ctx, cx - 1 * s, y - 13 * s, 2 * s, 5 * s, '#d4a52a'); R(ctx, cx - 2.5 * s, y - 12 * s, 5 * s, 1.5 * s, '#d4a52a'); }
  if (k === 'ranger') { R(ctx, cx - 5 * s, y - 25 * s, 10 * s, 3 * s, shade(cloth, -15)); R(ctx, cx - 6 * s, y - 24 * s, 3 * s, 5 * s, shade(cloth, -15));
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(cx - 8 * s, y - 12 * s, 7 * s, -1.2, 1.2); ctx.stroke(); }
  if (k === 'bard') { R(ctx, cx - 5 * s, y - 26 * s, 10 * s, 3 * s, cloth); R(ctx, cx + 3 * s, y - 30 * s, 1.5 * s, 5 * s, '#f0d060'); R(ctx, cx + 4 * s, y - 13 * s, 5 * s, 6 * s, '#a0622d'); R(ctx, cx + 6 * s, y - 18 * s, 1.5 * s, 6 * s, '#5a3a1e'); }
  if (k === 'cook') { R(ctx, cx - 4 * s, y - 28 * s, 8 * s, 5 * s, '#fff'); R(ctx, cx - 5 * s, y - 25 * s, 10 * s, 2 * s, '#eee'); R(ctx, cx - 4 * s, y - 13 * s, 8 * s, 9 * s, '#fff'); }
  if (k === 'barkeep') { R(ctx, cx - 4 * s, y - 12 * s, 8 * s, 8 * s, '#e8e0d0'); }
  if (k === 'caretaker') { R(ctx, cx + 7 * s, y - 22 * s, 1.5 * s, 20 * s, '#8b5a2b'); R(ctx, cx + 5 * s, y - 3 * s, 6 * s, 3 * s, '#d9c27a'); R(ctx, cx - 5 * s, y - 25 * s, 10 * s, 2 * s, '#6b5a44'); }
};
Render.lying = (ctx, px, py, L, cloth) => {
  R(ctx, px - 8, py - 6, 9, 9, L.skin);
  R(ctx, px - 9, py - 7, 10, 3, L.hair);
  R(ctx, px - 6, py - 3, 2, 1, '#1a1a1a');
  R(ctx, px + 1, py - 6, 14, 12, cloth); R(ctx, px + 1, py - 6, 14, 2, shade(cloth, 30));
};
Render.charPos = (c, x, y, T) => [x * T + T / 2, y * T + T - 4];
Render.drawChar = (ctx, c, x, y, T) => {
  const [cx, fy] = Render.charPos(c, x, y, T);
  const sel = Render.selected === c.id;
  if (c.pose === 'lie') {
    const r = c.act && Sim.room(c.act.room);
    let px = cx, py = fy - 10;
    if (r) {
      px = r.x * T + Math.min(r.w, 2) * T / 2 - (r.w > 1 ? 6 : 0);
      py = r.y * T + 14 + (c.act.slot ? T : 0);
      if (r.type === 'cot' || r.type === 'infirm') { px = r.x * T + T / 2; py = r.y * T + 22; }
    }
    if (r && (r.type === 'cot' || r.type === 'bunk' || r.type === 'infirm' || r.type === 'bed')) {
      // vertical beds: head on pillow at top, blanket covering body
      const bx = r.x * T + (r.type === 'bed' ? T / 2 + 4 : T / 2), by = r.y * T + (r.type === 'bunk' && c.act.slot ? T + 4 : 6);
      R(ctx, bx - 4, by + 2, 8, 8, c.look.skin); R(ctx, bx - 4, by + 1, 8, 3, c.look.hair);
      R(ctx, bx - 7, by + 10, 14, r.type === 'bunk' ? 14 : 30, c.look.cloth); R(ctx, bx - 7, by + 10, 14, 2, shade(c.look.cloth, 30));
    } else Render.lying(ctx, px, py, c.look, c.look.cloth);
    if (sel) Render.selRing(ctx, px, py + 8);
    if (c.act && c.act.type === 'sleep' && Render.frame % 60 < 40) {
      ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#cde'; ctx.textAlign = 'left';
      const zx = r ? r.x * T + T - 4 : px + 10, zy = r ? r.y * T + 6 : py - 10;
      ctx.fillText('z', zx, zy - (Render.frame % 60) / 10); ctx.fillText('Z', zx + 5, zy - 6 - (Render.frame % 60) / 10);
    }
    return;
  }
  if (sel) Render.selRing(ctx, cx, fy);
  const walking = c.act && c.act.phase === 'walk' && c.act.path && c.act.path.length > 0;
  const cls = c.cls ? DATA.CLASSES[c.cls] : null;
  Render.person(ctx, cx, fy, { look: c.look, cls: c.cls, role: c.role, dir: c.dir, walking, seed: c.id, trim: cls ? cls.trim : null });
  if (c.injury > 0) R(ctx, cx - 3, fy - 24, 6, 2, '#fff');
  if (c.act && c.act.type === 'break' && Render.frame % 20 < 10) { ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.fillText('💢', cx + 8, fy - 26); }
  if (Render.hover === c.id || sel) {
    ctx.font = 'bold 9px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    const tw = ctx.measureText(c.name).width + 6;
    R(ctx, cx - tw / 2, fy - 42, tw, 11, 'rgba(20,14,10,0.8)');
    ctx.fillStyle = c.kind === 'staff' ? '#9fd8a0' : '#ffe9a0'; ctx.fillText(c.name, cx, fy - 33);
  }
};
Render.drawVisitor = (ctx, v, x, y, T) => {
  const [cx, fy] = Render.charPos(v, x, y, T);
  const walking = v.phase === 'walk' && v.path && v.path.length > 0;
  Render.person(ctx, cx, fy, { look: v.look, dir: v.dir, walking, seed: v.id, size: 0.9 });
  if (v.phase === 'do' && v.goal === 'drink' && Render.frame % 90 < 45) { R(ctx, cx + 6, fy - 14, 4, 5, '#d8b04a'); R(ctx, cx + 6, fy - 14, 4, 1, '#fff'); }
};
Render.selRing = (ctx, x, y) => {
  ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); ctx.stroke();
};
Render.drawBubble = (ctx, c, x, y, T) => {
  if (c.state === 'away') return;
  let [cx, fy] = Render.charPos(c, x, y, T);
  if (c.pose === 'lie') {
    const r = c.act && Sim.room(c.act.room);
    if (r) { cx = r.x * T + T / 2; fy = r.y * T + 12; } else fy -= 6;
  }
  let icon = null, big = false;
  if (c.th && c.th.until > G.t) { icon = c.th.icon; big = true; }
  else if (c.act && c.act.phase === 'do') { const def = Sim.ACTS[c.act.type]; icon = def && def.icon; }
  else {
    const n = c.needs, low = Object.entries(n).filter(([k, v]) => v < 20 && (c.kind === 'adv' || k !== 'purpose'));
    if (low.length) icon = { hunger: '🍖', energy: '😪', hygiene: '🦨', social: '👥', fun: '🥱', purpose: '❔' }[low[0][0]];
  }
  if (!icon || c.pose === 'lie' && c.act && c.act.type === 'sleep') return;
  const bx = cx + 8, by = fy - (big ? 44 : 38);
  if (big) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx - 9, by - 9, 18, 16, 5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 5, by + 7); ctx.lineTo(bx - 8, by + 11); ctx.lineTo(bx - 1, by + 7); ctx.fill();
  }
  ctx.font = (big ? 11 : 9) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = big ? 1 : 0.85;
  ctx.fillText(icon, bx, by - 1);
  ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
};
Render.drawMarks = (ctx, T) => {
  ctx.font = '12px serif'; ctx.textAlign = 'center';
  for (let i = 0; i < G.map.length; i++) {
    const t = G.map[i];
    if (t.t === 'rubble' && t.mark) {
      const x = (i % DATA.MAP_W) * T, y = Math.floor(i / DATA.MAP_W) * T;
      ctx.strokeStyle = 'rgba(255,224,102,0.9)'; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 2, y + 2, T - 4, T - 4); ctx.setLineDash([]);
      ctx.fillText('⛏️', x + T - 8, y + 12);
    }
  }
};

// ------------------------------------------------------------ lighting -----
Render.drawLighting = (ctx, T) => {
  const h = Sim.hourF();
  let dark = 0;
  if (h < 5) dark = 0.55; else if (h < 7) dark = 0.55 * (7 - h) / 2;
  else if (h > 21) dark = 0.55; else if (h > 18.5) dark = 0.55 * (h - 18.5) / 2.5;
  if (G.weather === 'rain' || G.weather === 'storm') dark = Math.max(dark, 0.15);
  if (G.weather === 'storm' && Render.frame % 400 < 4) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, DATA.MAP_W * T, DATA.MAP_H * T); }
  if (dark <= 0.01) return;
  ctx.fillStyle = `rgba(16,18,48,${dark})`;
  ctx.fillRect(0, 0, DATA.MAP_W * T, DATA.MAP_H * T);
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col) => {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const k = dark / 0.55;
  for (const r of G.rooms) {
    if (r.broken) continue;
    const cx = (r.x + r.w / 2) * T, cy = (r.y + r.h / 2) * T;
    const fl = 1 + Math.sin(Render.frame * 0.2 + r.id) * 0.05;
    if (r.type === 'hearth' || r.type === 'forge') glow(cx, cy + 8, 110 * fl, `rgba(255,140,50,${0.45 * k})`);
    if (r.type === 'bar') glow(cx, cy, 90, `rgba(255,190,90,${0.3 * k})`);
    if (r.type === 'shrine') glow(cx, cy - 10, 80, `rgba(255,230,140,${0.3 * k})`);
    if (r.type === 'scry') glow(cx, cy, 80, `rgba(150,110,255,${0.35 * k})`);
    if (r.type === 'shelf' || r.type === 'desk') glow(cx, cy, 50, `rgba(255,210,120,${0.18 * k})`);
  }
  ctx.globalCompositeOperation = 'source-over';
};

// ------------------------------------------------------------ overlays -----
Render.drawOverlay = (ctx, T) => {
  const W = DATA.MAP_W, H = DATA.MAP_H, mode = Render.overlay;
  let maxT = 1; if (mode === 'traffic') for (const t of G.map) maxT = Math.max(maxT, t.traffic);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const t = Sim.tile(x, y); let col = null;
    if (mode === 'appeal') {
      const a = U.clamp(Sim.appealAt(x, y) / 12, -1, 1);
      col = a >= 0 ? `rgba(60,220,90,${0.15 + a * 0.5})` : `rgba(230,50,40,${0.15 - a * 0.5})`;
    } else if (mode === 'cond') {
      if (t.t !== 'floor') continue;
      const c = t.cond / 100; col = `rgba(${Math.round(255 * (1 - c))},${Math.round(200 * c)},60,0.5)`;
    } else if (mode === 'traffic') {
      const v = Math.sqrt(t.traffic / maxT); if (v < 0.02) continue;
      col = `rgba(255,${Math.round(220 - 200 * v)},40,${0.15 + 0.55 * v})`;
    }
    if (col) R(ctx, x * T, y * T, T, T, col);
  }
};

// ------------------------------------------------------------ ghost --------
Render.drawGhost = (ctx, T) => {
  const g = Render.ghost; if (!g) return;
  if (g.kind === 'room') {
    const ok = !Sim.canPlace(g.type, g.x, g.y, g.w, g.h);
    ctx.globalAlpha = 0.6;
    const f = Render.F[g.type];
    if (f) f(ctx, g.x * T, g.y * T, g.w * T, g.h * T, { broken: false, cond: 100, id: 0 }, T);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ok ? 'rgba(80,220,100,0.25)' : 'rgba(230,60,50,0.35)';
    ctx.fillRect(g.x * T, g.y * T, g.w * T, g.h * T);
    ctx.strokeStyle = ok ? '#5d5' : '#e44'; ctx.lineWidth = 2; ctx.strokeRect(g.x * T + 1, g.y * T + 1, g.w * T - 2, g.h * T - 2);
    const def = DATA.ROOMS[g.type];
    const r = def.appeal[1];
    if (def.appeal[0] > 0) { ctx.strokeStyle = 'rgba(120,255,140,0.35)'; ctx.setLineDash([2, 4]); ctx.strokeRect((g.x - r) * T, (g.y - r) * T, (g.w + r * 2) * T, (g.h + r * 2) * T); ctx.setLineDash([]); }
  } else {
    const ok = g.ok;
    ctx.strokeStyle = ok ? '#ffe066' : '#e44'; ctx.lineWidth = 2;
    ctx.strokeRect(g.x * T + 1, g.y * T + 1, T - 2, T - 2);
  }
};

// ------------------------------------------------------------ portrait -----
Render.portrait = (canvas, c, scale = 3) => {
  const ctx = canvas.getContext('2d');
  canvas.width = 24 * scale; canvas.height = 24 * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const bg = c.cls ? DATA.CLASSES[c.cls].color : c.role ? DATA.STAFF[c.role].color : '#666';
  R(ctx, 0, 0, 24, 24, shade(bg, -60)); R(ctx, 0, 16, 24, 8, shade(bg, -40));
  const cls = c.cls ? DATA.CLASSES[c.cls] : null;
  Render.person(ctx, 12, 39, { look: c.look, cls: c.cls, role: c.role, dir: 1, walking: false, seed: 0, trim: cls ? cls.trim : null, size: 1.25 });
  if (c.mood < 30) { R(ctx, 9, 21, 6, 1, '#000'); }
};
