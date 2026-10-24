// ============================================================================
//  SIM — world state, time, economy, character AI, relationships, quests
// ============================================================================
'use strict';

const U = {
  rnd: (a, b) => a + Math.random() * (b - a),
  ri: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  hash: (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; },
};

let G = null;              // the whole saveable game state
const Sim = {};
const W = DATA.MAP_W, H = DATA.MAP_H;
const NEEDS = ['hunger', 'energy', 'hygiene', 'social', 'fun', 'purpose'];
const NEED_LABEL = { hunger: 'Hunger', energy: 'Energy', hygiene: 'Hygiene', social: 'Social', fun: 'Fun', purpose: 'Purpose' };
const STATS = ['mig', 'arc', 'agi', 'spi'];
const STAT_LABEL = { mig: 'Might', arc: 'Arcana', agi: 'Agility', spi: 'Spirit' };

// ------------------------------------------------------------ time utils --
Sim.day = () => Math.floor(G.t / 1440);
Sim.hour = () => Math.floor(G.t / 60) % 24;
Sim.hourF = () => (G.t % 1440) / 60;
Sim.season = () => Math.floor(Sim.day() / DATA.DAYS_PER_SEASON) % 4;
Sim.year = () => Math.floor(Sim.day() / (DATA.DAYS_PER_SEASON * 4)) + 1;
Sim.dateStr = (t = G.t) => {
  const d = Math.floor(t / 1440);
  return `${DATA.SEASONS[Math.floor(d / DATA.DAYS_PER_SEASON) % 4]} ${d % DATA.DAYS_PER_SEASON + 1}, Y${Math.floor(d / (DATA.DAYS_PER_SEASON * 4)) + 1}`;
};
Sim.clockStr = () => {
  const m = G.t % 1440; const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm - mm % 10).padStart(2, '0')}`;
};
Sim.isDaylight = () => { const h = Sim.hourF(); return h >= 6 && h < 20; };

// --------------------------------------------------------------- helpers ---
Sim.id = () => G.nextId++;
Sim.tile = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? null : G.map[y * W + x];
Sim.room = (id) => G.rooms.find(r => r.id === id) || null;
Sim.char = (id) => G.chars.find(c => c.id === id) || null;
Sim.has = (c, t) => c.traits.includes(t);
Sim.rankIdx = () => DATA.RANKS.findIndex(r => r.id === G.rank);
Sim.rankOk = (rk) => DATA.RANKS.findIndex(r => r.id === rk) <= Sim.rankIdx();
Sim.roomWorks = (r) => r && !r.broken;
Sim.roomsOf = (...types) => G.rooms.filter(r => types.includes(r.type) && !r.broken);
Sim.advs = () => G.chars.filter(c => c.kind === 'adv');
Sim.staff = () => G.chars.filter(c => c.kind === 'staff');
Sim.faction = (k) => G.factions[k] || 0;

Sim.walkable = (x, y) => {
  const t = Sim.tile(x, y);
  if (!t || (t.t !== 'floor' && t.t !== 'door')) return false;
  if (t.room != null) { const r = Sim.room(t.room); return !!(r && DATA.ROOMS[r.type].walkable); }
  return true;
};

Sim.log = (text, kind = 'info') => {
  G.log.unshift({ t: G.t, text, kind });
  if (G.log.length > 3000) G.log.length = 3000;
  if (typeof UI !== 'undefined') UI.ticker(text, kind);
};
Sim.money = (amt, cat) => {
  G.gold += amt;
  const L = G.today;
  if (amt >= 0) L.inc[cat] = (L.inc[cat] || 0) + amt; else L.exp[cat] = (L.exp[cat] || 0) - amt;
};
Sim.cost = (base) => Math.round(base * (Sim.faction('merchant') >= 50 ? 0.85 : 1));

// ------------------------------------------------------------- pathfinding -
Sim.bfs = (sx, sy) => {
  const N = W * H, dist = new Int16Array(N).fill(-1), prev = new Int16Array(N).fill(-1), q = new Int16Array(N);
  let qh = 0, qt = 0; const s = sy * W + sx; dist[s] = 0; q[qt++] = s;
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!Sim.walkable(nx, ny)) continue;
      const j = ny * W + nx; if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1; prev[j] = i; q[qt++] = j;
    }
  }
  return { dist, prev, s };
};
Sim.pathFrom = (B, gx, gy) => {
  let i = gy * W + gx; const out = [];
  if (B.dist[i] < 0) return null;
  while (i !== B.s && i >= 0) { out.push([i % W, (i / W) | 0]); i = B.prev[i]; }
  return out.reverse();
};
Sim.useTiles = (r) => {
  const out = [], seen = new Set();
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx >= r.x && nx < r.x + r.w && ny >= r.y && ny < r.y + r.h) continue;
      if (seen.has(k) || !Sim.walkable(nx, ny)) continue;
      const t = Sim.tile(nx, ny); if (t.t === 'door') continue;
      seen.add(k); out.push([nx, ny]);
    }
  return out;
};
Sim.users = (roomId) => {
  let n = 0;
  for (const c of G.chars) if (c.act && c.act.room === roomId && c.state !== 'away') n++;
  for (const v of G.vis) if (v.room === roomId) n++;
  return n;
};
Sim.cpos = (c) => [Math.round(c.x), Math.round(c.y)];

// pick the nearest free room among candidates, returns {room, tx, ty, path}
Sim.nearestRoom = (c, B, rooms, ignoreCap = false) => {
  let best = null, bd = 1e9;
  for (const r of rooms) {
    if (!ignoreCap && Sim.users(r.id) >= DATA.ROOMS[r.type].cap) continue;
    for (const [ux, uy] of Sim.useTiles(r)) {
      const d = B.dist[uy * W + ux];
      if (d >= 0 && d < bd) { bd = d; best = { room: r, tx: ux, ty: uy }; }
    }
  }
  if (best) best.path = Sim.pathFrom(B, best.tx, best.ty);
  return best;
};

// ---------------------------------------------------------------- appeal ---
Sim.recalcAppeal = () => {
  const A = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Sim.tile(x, y);
    if (t.t === 'floor') A[y * W + x] += (t.cond - 50) / 9 - (t.puddle > 20 ? 4 : 0) - (t.leak ? 1 : 0);
  }
  const spread = (cx, cy, cw, ch, v, r) => {
    for (let y = cy - r; y < cy + ch + r; y++) for (let x = cx - r; x < cx + cw + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = Math.max(cx - x, 0, x - (cx + cw - 1)), dy = Math.max(cy - y, 0, y - (cy + ch - 1));
      const d = Math.max(dx, dy);
      A[y * W + x] += v * (1 - d / (r + 1));
    }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Sim.tile(x, y).t === 'rubble') spread(x, y, 1, 1, -3, 2);
  for (const r of G.rooms) {
    const def = DATA.ROOMS[r.type];
    if (r.broken) spread(r.x, r.y, r.w, r.h, -4, 2);
    else spread(r.x, r.y, r.w, r.h, def.appeal[0] * (0.4 + 0.6 * r.cond / 100), def.appeal[1]);
  }
  G.appeal = Array.from(A, v => Math.round(v * 10) / 10);
};
Sim.appealAt = (x, y) => (G.appeal ? G.appeal[y * W + x] || 0 : 0);

// --------------------------------------------------------- relationships ---
Sim.relKey = (a, b) => a < b ? a + '-' + b : b + '-' + a;
Sim.rel = (a, b) => G.rels[Sim.relKey(a, b)] || 0;
Sim.relLabel = (v) => v <= -50 ? 'Nemesis' : v <= -20 ? 'Rival' : v < 10 ? 'Acquaintance' : v < 35 ? 'Friendly' : v < 65 ? 'Friend' : 'Best Friend';
Sim.compat = (a, b) => {
  let v = (U.hash(Sim.relKey(a.id, b.id) + G.seed) - 0.5) * 0.7;            // innate chemistry
  for (const t of a.traits) if (b.traits.includes(t)) v += 0.18;
  for (const [x, y] of DATA.TRAIT_CONFLICTS) {
    if ((a.traits.includes(x) && b.traits.includes(y)) || (a.traits.includes(y) && b.traits.includes(x))) v -= 0.35;
  }
  if (a.cls && a.cls === b.cls) v += 0.05;
  return U.clamp(v, -1, 1);
};
Sim.changeRel = (a, b, delta, why) => {
  if (a.id === b.id) return;
  const k = Sim.relKey(a.id, b.id), old = G.rels[k] || 0;
  if (delta > 0) delta *= 1 - Math.max(0, old) / 115;          // deep bonds take time
  if (delta < 0) delta *= 1 - Math.max(0, -old) / 140;
  const nv = U.clamp(old + delta, -100, 100); G.rels[k] = nv;
  const ol = Sim.relLabel(old), nl = Sim.relLabel(nv);
  if (ol !== nl) {
    const better = nv > old;
    const txt = better ? `${a.name} and ${b.name} are now ${nl}s${why ? ' (' + why + ')' : ''}.` : `${a.name} and ${b.name} have become ${nl === 'Acquaintance' ? 'distant' : nl + 's'}.`;
    if (nl !== 'Acquaintance' || !better) { Sim.bio(a, txt); Sim.bio(b, txt); Sim.log(txt, better ? 'good' : 'bad'); }
    if (better && nl === 'Friend') Sim.goal('friends');
  }
};
Sim.socialize = (a, b, ctx) => {
  const comp = Sim.compat(a, b);
  const charm = (Sim.has(a, 'charming') || Sim.has(b, 'charming')) ? 1.5 : 1;
  const bard = (a.cls === 'bard' || b.cls === 'bard') ? 1.2 : 1;
  const angry = (Sim.has(a, 'hothead') || Sim.has(b, 'hothead')) && comp < 0.1;
  if ((angry && U.chance(0.35)) || (comp < -0.4 && U.chance(0.25))) {
    Sim.changeRel(a, b, -U.ri(5, 10));
    Sim.moodlet(a, 'argue' + b.id, `Argued with ${b.name}`, -6, 360);
    Sim.moodlet(b, 'argue' + a.id, `Argued with ${a.name}`, -6, 360);
    Sim.say(a, '💢', `${b.name} is impossible!`); Sim.say(b, '💢', `Ugh, ${a.name} again.`);
    return -1;
  }
  const d = (1.2 + comp * 5 + U.rnd(-2, 2)) * charm * bard * (ctx === 'quest' ? 1.6 : 1);
  Sim.changeRel(a, b, d);
  if (d > 4) { Sim.say(a, '😄', `${b.name} is good company.`); }
  return d;
};

// ----------------------------------------------------------- characters ---
Sim.genName = () => {
  for (let i = 0; i < 40; i++) {
    const n = U.pick(DATA.FIRST);
    if (!G.chars.some(c => c.first === n) && !G.apps.some(c => c.first === n)) return [n, U.pick(DATA.LAST)];
  }
  return [U.pick(DATA.FIRST), U.pick(DATA.LAST)];
};
Sim.rollTraits = (n = 2) => {
  const keys = Object.keys(DATA.TRAITS), out = [];
  while (out.length < n) {
    const t = U.pick(keys);
    if (out.includes(t)) continue;
    if (DATA.TRAIT_EXCLUSIVE.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
};
Sim.newLook = (cloth) => ({
  skin: U.pick(DATA.SKIN), hair: U.pick(DATA.HAIR), style: U.ri(0, 4), cloth: cloth || U.pick(DATA.TOWNS_CLOTH),
  beard: U.chance(0.25),
});
Sim.baseChar = (kind) => {
  const [first, last] = Sim.genName();
  return {
    id: Sim.id(), kind, first, last, name: first, full: first + ' ' + last,
    ancestry: U.pick(DATA.ANCESTRY), origin: U.pick(DATA.ORIGINS), age: U.ri(17, 52),
    traits: Sim.rollTraits(2), look: Sim.newLook(),
    needs: { hunger: U.ri(60, 90), energy: U.ri(60, 95), hygiene: U.ri(50, 90), social: U.ri(50, 90), fun: U.ri(50, 90), purpose: U.ri(50, 90) },
    mood: 60, env: 0, ml: [], loyalty: 65, purse: U.ri(0, 15),
    x: 0, y: 0, ox: 0, oy: 0, dir: 1, act: null, state: 'home', th: null, bed: null,
    injury: 0, low: 0, bio: [], joined: G ? G.t : 0, quests: 0, wins: 0,
  };
};
Sim.makeAdv = (lvl = 1, cls) => {
  const c = Sim.baseChar('adv');
  c.cls = cls || U.pick(Object.keys(DATA.CLASSES));
  const def = DATA.CLASSES[c.cls];
  c.look.cloth = def.color;
  c.stats = {}; for (const s of STATS) c.stats[s] = def.base[s] + U.ri(-1, 2);
  c.lvl = 1; c.xp = 0; c.gear = 0;
  for (let i = 1; i < lvl; i++) Sim.levelUp(c, true);
  c.wage = Sim.fairWage(c);
  c.hireCost = 15 + lvl * 20 + (Sim.has(c, 'greedy') ? 15 : 0);
  return c;
};
Sim.makeStaff = (role) => {
  const c = Sim.baseChar('staff');
  c.role = role; c.look.cloth = DATA.STAFF[role].color; c.wage = DATA.STAFF[role].wage;
  return c;
};
Sim.fairWage = (c) => Math.round(2 + c.lvl * 1.1 + (Sim.has(c, 'greedy') ? 2 : 0));
Sim.xpNeed = (lvl) => Math.round(30 * Math.pow(lvl, 1.5));
Sim.statCap = (c, s) => {
  const d = DATA.CLASSES[c.cls];
  return s === d.main ? 12 + c.lvl * 3 : s === d.second ? 8 + c.lvl * 2 : 5 + c.lvl * 1.3;
};
Sim.levelUp = (c, silent) => {
  const d = DATA.CLASSES[c.cls];
  c.lvl++;
  for (const s of STATS) c.stats[s] += s === d.main ? U.rnd(1.8, 2.6) : s === d.second ? U.rnd(1.0, 1.8) : U.rnd(0.4, 1.0);
  if (silent) return;
  Sim.bio(c, `Reached level ${c.lvl}.`);
  Sim.log(`⭐ ${c.name} reached level ${c.lvl}!`, 'good');
  Sim.moodlet(c, 'lvl', 'Levelled up!', 12, 1440);
  if (c.lvl >= 5) Sim.goal('lvl5');
  const fair = Sim.fairWage(c);
  if (fair > c.wage + 1 || (Sim.has(c, 'greedy') && fair > c.wage)) {
    const ask = Sim.has(c, 'greedy') ? fair + 2 : fair;
    G.pendingEvents.push({ kind: 'raise', id: c.id, ask });
  }
};
Sim.gainXp = (c, xp) => {
  c.xp += xp;
  while (c.xp >= Sim.xpNeed(c.lvl) && c.lvl < 30) { c.xp -= Sim.xpNeed(c.lvl); Sim.levelUp(c); }
};
Sim.bio = (c, text) => { c.bio.unshift({ t: G.t, text }); if (c.bio.length > 50) c.bio.length = 50; };
Sim.say = (c, icon, text, mins = 90) => { c.th = { icon, text, until: G.t + mins }; };
Sim.moodlet = (c, k, label, v, mins) => {
  const ex = c.ml.find(m => m.k === k);
  if (ex) { ex.v = v; ex.label = label; ex.until = G.t + mins; return; }
  c.ml.push({ k, label, v, until: G.t + mins });
};
Sim.moodLabel = (m) => m < 15 ? 'Breaking' : m < 30 ? 'Miserable' : m < 45 ? 'Unhappy' : m < 60 ? 'Content' : m < 80 ? 'Happy' : 'Elated';
Sim.moodFace = (m) => m < 15 ? '😫' : m < 30 ? '😢' : m < 45 ? '😟' : m < 60 ? '😐' : m < 80 ? '🙂' : '😁';
Sim.isNight = (c) => {
  const h = Sim.hourF();
  return Sim.has(c, 'nightowl') ? (h >= 1 && h < 9.5) : (h >= 22 || h < 6);
};
Sim.home = (c) => c.state === 'home';
Sim.available = (c) => c.kind === 'adv' && c.state === 'home' && c.injury <= 0 && !(c.act && c.act.type === 'break');

// -------------------------------------------------------------- map gen ----
Sim.newGame = (guildName) => {
  G = {
    v: 1, seed: String(Math.random()).slice(2, 8), name: guildName || 'The Rusty Flagon',
    t: 7 * 60, nextId: 1, gold: 220, renown: 0, rank: 'F', debt: 1500, strikes: 0,
    map: [], rooms: [], chars: [], vis: [], apps: [], quests: [], active: [], dead: [],
    rels: {}, log: [], factions: { crown: 0, temple: 0, merchant: 0, college: 0 },
    goals: {}, lore: [], weather: 'clear', today: { inc: {}, exp: {} }, ledger: [], hist: [],
    pendingEvents: [], opinion: 0, flags: {}, totalQuests: 0, won: false, lost: false,
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    G.map.push({ t: edge ? 'wall' : 'floor', cond: U.ri(15, 55), leak: false, puddle: 0, room: null, mark: false, work: 0, claim: null, traffic: 0 });
  }
  G.door = { x: Math.floor(W / 2), y: H - 1 };
  Sim.tile(G.door.x, G.door.y).t = 'door';

  // the old, half-collapsed furnishings
  Sim.addRoom('board', 11, 1, 1, 1, { broken: true, cond: 0 });
  Sim.addRoom('hearth', 2, 2, 2, 2, { broken: true, cond: 0 });
  Sim.addRoom('cot', 19, 2, 1, 2, { cond: 35 });
  Sim.addRoom('cot', 21, 2, 1, 2, { cond: 30 });
  Sim.addRoom('dummy', 6, 10, 1, 1, { broken: true, cond: 0 });
  Sim.addRoom('dice', 15, 10, 2, 1, { broken: true, cond: 0 });
  Sim.addRoom('basin', 2, 7, 1, 1, { cond: 40 });

  // rubble — keep the hall connected
  let tries = 0, placed = 0;
  while (placed < 26 && tries++ < 600) {
    const x = U.ri(1, W - 2), y = U.ri(1, H - 2), t = Sim.tile(x, y);
    if (t.t !== 'floor' || t.room != null || (Math.abs(x - G.door.x) <= 1 && y >= H - 3)) continue;
    t.t = 'rubble';
    if (!Sim.connected()) { t.t = 'floor'; continue; }
    placed++;
  }
  // leaky roof
  let leaks = 0;
  while (leaks < 7) {
    const x = U.ri(1, W - 2), y = U.ri(1, H - 2), t = Sim.tile(x, y);
    if (t.t === 'floor' && !t.leak) { t.leak = true; leaks++; }
  }
  Sim.tile(19, 3).leak = true; // the cot under the worst leak, naturally

  // founding members
  const brom = Sim.makeAdv(2, 'warrior');
  Object.assign(brom, { first: 'Brom', last: 'Ironfoot', name: 'Brom', full: 'Brom Ironfoot', age: 58, ancestry: 'Dwarf',
    origin: 'a dwarven hold', traits: ['brave', 'lazy'], loyalty: 80 });
  brom.look.beard = true; brom.look.hair = '#9a9a9a';
  const pip = Sim.makeAdv(1, 'rogue');
  Object.assign(pip, { first: 'Pip', last: 'Quickfinger', name: 'Pip', full: 'Pip Quickfinger', age: 19, ancestry: 'Halfling',
    origin: 'the slums of Port Varra', traits: ['greedy', 'charming'], loyalty: 60 });
  for (const c of [brom, pip]) c.wage = Sim.fairWage(c);
  for (const c of [brom, pip]) Sim.addChar(c, U.ri(8, 15), U.ri(6, 9));
  Sim.bio(brom, 'The last of the old guard. Stayed when everyone else left.');
  Sim.bio(pip, 'Showed up last winter "just for the free roof". The roof leaks.');
  G.rels[Sim.relKey(brom.id, pip.id)] = 12;

  for (let i = 0; i < 2; i++) G.apps.push(Sim.makeAdv(U.ri(1, 2)));
  Sim.recalcAppeal();
  Sim.rollWeather();
  Sim.snapshot();
  return G;
};
Sim.connected = () => {
  const B = Sim.bfs(G.door.x, G.door.y);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    if (Sim.walkable(x, y) && B.dist[i] < 0) return false;
  }
  for (const r of G.rooms) {
    if (DATA.ROOMS[r.type].cap === 0) continue;
    if (!Sim.useTiles(r).some(([x, y]) => B.dist[y * W + x] >= 0)) return false;
  }
  return true;
};
Sim.addRoom = (type, x, y, w, h, extra = {}) => {
  const r = Object.assign({ id: Sim.id(), type, x, y, w, h, cond: 100, broken: false, repair: false, owners: [], claim: null, work: 0 }, extra);
  G.rooms.push(r);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) Sim.tile(xx, yy).room = r.id;
  return r;
};
Sim.addChar = (c, x, y) => {
  if (x == null) { x = G.door.x; y = G.door.y - 1; }
  c.x = c.ox = x; c.y = c.oy = y; c.joined = G.t;
  G.chars.push(c);
};

// ------------------------------------------------------------ build API ----
Sim.canPlace = (type, x, y, w, h) => {
  const def = DATA.ROOMS[type];
  if (!def) return 'Unknown';
  if (!Sim.rankOk(def.rank)) return `Requires rank ${def.rank}`;
  if (def.unique && G.rooms.some(r => r.type === type)) return 'Only one allowed';
  if (G.gold < Sim.cost(def.cost)) return 'Not enough gold';
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const t = Sim.tile(xx, yy);
    if (!t || t.t !== 'floor') return 'Must be clear floor';
    if (t.room != null) return 'Occupied';
    if (Math.abs(xx - G.door.x) + Math.abs(yy - G.door.y) <= 1) return 'Keep the doorway clear';
    if (G.chars.some(c => c.state !== 'away' && Math.round(c.x) === xx && Math.round(c.y) === yy)) return 'Someone is standing there';
    if (G.vis.some(v => Math.round(v.x) === xx && Math.round(v.y) === yy)) return 'Someone is standing there';
  }
  if (!def.walkable) {
    const r = Sim.addRoom(type, x, y, w, h);
    const ok = Sim.connected();
    Sim.removeRoomRaw(r);
    if (!ok) return 'Would block a path';
  }
  return null;
};
Sim.place = (type, x, y, w, h) => {
  const err = Sim.canPlace(type, x, y, w, h);
  if (err) return err;
  const def = DATA.ROOMS[type];
  Sim.money(-Sim.cost(def.cost), 'build');
  Sim.addRoom(type, x, y, w, h);
  Sim.recalcAppeal();
  if (type === 'bar') Sim.goal('bar');
  for (const c of G.chars) if (c.act && c.act.phase === 'walk') c.act.repath = true;
  return null;
};
Sim.removeRoomRaw = (r) => {
  G.rooms = G.rooms.filter(o => o !== r);
  for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) Sim.tile(xx, yy).room = null;
};
Sim.demolish = (r) => {
  if (r.type === 'board') return 'The Quest Board is the heart of the guild.';
  for (const c of G.chars) {
    if (c.act && c.act.room === r.id) Sim.cancel(c);
    if (c.bed === r.id) c.bed = null;
  }
  for (const v of G.vis) if (v.room === r.id) { v.room = null; v.goal = 'leave'; v.path = null; }
  Sim.removeRoomRaw(r);
  if (!r.broken) Sim.money(Math.floor(Sim.cost(DATA.ROOMS[r.type].cost) * 0.4), 'other');
  Sim.recalcAppeal();
  return null;
};
Sim.repairCost = (r) => r.broken ? Math.max(25, Math.round(DATA.ROOMS[r.type].cost * 0.3)) : Math.round(DATA.ROOMS[r.type].cost * 0.15 * (1 - r.cond / 100) + 3);
Sim.orderRepair = (r) => {
  if (r.repair) return 'Already ordered';
  const cost = Sim.repairCost(r);
  if (G.gold < cost) return 'Not enough gold';
  Sim.money(-cost, 'build'); r.repair = true; r.work = 0;
  Sim.log(`Repairs ordered for the ${DATA.ROOMS[r.type].name}. Someone with free hands will see to it.`);
  return null;
};
Sim.markRubble = (x, y) => {
  const t = Sim.tile(x, y);
  if (!t || t.t !== 'rubble') return 'Not rubble';
  if (t.mark) { t.mark = false; Sim.money(5, 'build'); return null; }
  if (G.gold < 5) return 'Not enough gold';
  Sim.money(-5, 'build'); t.mark = true; return null;
};
Sim.patchRoof = (x, y) => {
  const t = Sim.tile(x, y);
  if (!t || !t.leak) return 'No leak here';
  const c = Sim.cost(25);
  if (G.gold < c) return 'Not enough gold';
  Sim.money(-c, 'build'); t.leak = false; t.puddle = 0;
  Sim.log('A roofer patched a leak overhead.');
  if (!G.map.some(tt => tt.leak)) Sim.goal('roof');
  Sim.recalcAppeal();
  return null;
};

// ------------------------------------------------------------- jobs --------
Sim.findJob = (c, B, caretaker) => {
  let best = null, bd = 1e9;
  const consider = (kind, tx, ty, ref, standOn, extra = 0) => {
    const spots = standOn ? [[tx, ty]] : [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [tx + dx, ty + dy]).filter(([x, y]) => Sim.walkable(x, y));
    for (const [sx, sy] of spots) {
      const d = B.dist[sy * W + sx];
      if (d >= 0 && d - extra < bd) { bd = d - extra; best = { kind, ref, tx: sx, ty: sy, wx: tx, wy: ty }; }
    }
  };
  for (const r of G.rooms) {
    if (r.claim != null) continue;
    if (r.repair) for (const [ux, uy] of Sim.useTiles(r)) consider('fixroom', ux, uy, r, true, 12);
    else if (!r.broken && r.cond < 45 && (caretaker || r.cond < 30)) for (const [ux, uy] of Sim.useTiles(r)) consider('tidyroom', ux, uy, r, true, 0);
  }
  for (let i = 0; i < W * H; i++) {
    const t = G.map[i]; if (t.claim != null) continue;
    const x = i % W, y = (i / W) | 0;
    if (t.t === 'rubble' && t.mark) consider('clear', x, y, t, false, 8);
    else if (t.t === 'floor' && t.puddle > 25 && !t.room) consider('mop', x, y, t, true, 2);
    else if (t.t === 'floor' && !t.room && t.cond < (caretaker ? 45 : 25)) consider('mend', x, y, t, true, 0);
  }
  if (best) best.path = Sim.pathFrom(B, best.tx, best.ty);
  return best;
};
Sim.hasJobs = () => G.map.some(t => (t.t === 'rubble' && t.mark && t.claim == null) || (t.t === 'floor' && !t.room && (t.cond < 25 || t.puddle > 25) && t.claim == null))
  || G.rooms.some(r => (r.repair || (!r.broken && r.cond < 30)) && r.claim == null);

// ------------------------------------------------------------ AI core ------
// Each action: score is computed in decide(); A[type] holds behaviour.
const A = {};
Sim.ACTS = A;

Sim.start = (c, type, tgt, extra = {}) => {
  const def = A[type];
  c.act = Object.assign({ type, room: tgt && tgt.room ? tgt.room.id : null, tx: tgt ? tgt.tx : Math.round(c.x), ty: tgt ? tgt.ty : Math.round(c.y),
    path: tgt && tgt.path ? tgt.path : [], phase: 'walk', t: typeof def.dur === 'function' ? def.dur(c) : def.dur }, extra);
  c.pose = null;
  if (def.begin) def.begin(c, c.act);
};
Sim.cancel = (c) => {
  const a = c.act; if (!a) return;
  if (a.job) { a.job.ref.claim = null; }
  if (a.type === 'chat' && a.with) { const o = Sim.char(a.with); if (o && o.act && o.act.type === 'chat' && o.act.with === c.id) { o.act = null; o.pose = null; } }
  c.act = null; c.pose = null;
};

// idling somewhere pleasant is mildly entertaining
const loiter = (c, dm) => { const a = Sim.appealAt(Math.round(c.x), Math.round(c.y)); if (a > 0) c.needs.fun += dm * Math.min(0.25, a * 0.03); };
A.wander = { dur: () => U.ri(15, 40), icon: '', label: () => 'Wandering', tick: loiter };
A.idle = { dur: () => U.ri(10, 25), label: () => 'Idling', tick: loiter };
A.sleep = {
  dur: 60 * 12, icon: '💤', label: (c, a) => a.room ? 'Sleeping' : 'Sleeping on the floor',
  arrive(c, a) {
    const r = Sim.room(a.room);
    if (r) { c.pose = 'lie'; a.slot = Math.max(0, r.owners.indexOf(c.id)); }
    else c.pose = 'lie';
  },
  tick(c, dm, a) {
    const r = Sim.room(a.room);
    let rate = r ? DATA.ROOMS[r.type].rest * (0.7 + 0.3 * r.cond / 100) : 8;
    if (Sim.has(c, 'lazy')) rate *= 0.9;
    c.needs.energy += rate * dm / 60;
    if (G.weather === 'rain' || G.weather === 'storm') {
      const t = r ? Sim.tile(r.x, r.y + (r.h - 1)) : Sim.tile(Math.round(c.x), Math.round(c.y));
      const t2 = r ? Sim.tile(r.x, r.y) : t;
      if (t.leak || t2.leak) { a.wet = true; }
    }
    if (c.needs.energy >= 99 || (!Sim.isNight(c) && c.needs.energy > 85) || c.needs.hunger < 8) a.t = 0;
  },
  end(c, a) {
    const r = Sim.room(a.room);
    if (!r) { if (!Sim.has(c, 'slob')) Sim.moodlet(c, 'floor', 'Slept on the cold floor', -9, 720); Sim.say(c, '😣', 'My back...'); }
    else if (r.type === 'bed') Sim.moodlet(c, 'royal', 'Slept like royalty', 8, 720);
    else if (r.type === 'cot' && !Sim.has(c, 'slob')) Sim.moodlet(c, 'straw', 'Itchy straw cot', -2, 600);
    if (a.wet) { Sim.moodlet(c, 'wet', 'Dripped on all night', -10, 720); Sim.say(c, '💧', 'The roof leaked on me all night!'); }
    if (G.season === 3 && !Sim.roomsOf('hearth').length) Sim.moodlet(c, 'cold', 'Freezing hall', -8, 720);
  },
};
A.heal = {
  dur: 60 * 8, icon: '🩹', label: () => 'Recovering from injuries',
  arrive(c) { c.pose = 'lie'; },
  tick(c, dm, a) {
    const r = Sim.room(a.room);
    let m = r ? (r.type === 'infirm' ? 3 : 1.2) : 0.7;
    if (Sim.faction('temple') >= 50) m *= 2;
    c.injury -= dm / 60 * m;
    c.needs.energy += dm * 6 / 60;
    if (c.injury <= 0) { c.injury = 0; a.t = 0; Sim.say(c, '💪', 'Good as new!'); Sim.log(`${c.name} has recovered from their injuries.`, 'good'); }
    if (c.needs.hunger < 20) a.t = 0;
  },
};
A.eat = {
  dur: (c) => Sim.roomsOf('table').length ? 15 : 40, icon: '🍲', label: () => 'Getting a meal',
  begin(c, a) { a.paid = false; },
  arrive(c, a) {
    const cost = c.kind === 'staff' ? 1 : 2;
    if (G.gold >= cost) { Sim.money(-cost, 'food'); a.paid = true; }
    const cook = G.chars.find(o => o.kind === 'staff' && o.role === 'cook' && o.act && o.act.type === 'cook' && o.act.phase === 'do');
    a.meal = !a.paid ? 'gruel' : cook ? 'stew' : 'porridge';
  },
  end(c, a) {
    const tables = Sim.roomsOf('table');
    if (tables.length && a.meal !== 'gruel') {
      const B = Sim.bfs(Math.round(c.x), Math.round(c.y));
      const t = Sim.nearestRoom(c, B, tables);
      if (t) { Sim.start(c, 'dine', t, { meal: a.meal }); return; }
    }
    Sim.finishMeal(c, a.meal, false);
  },
};
A.dine = {
  dur: 30, icon: '🍽️', label: () => 'Eating at the long table',
  tick(c, dm) { c.needs.social += dm * 0.6; },
  end(c, a) {
    Sim.finishMeal(c, a.meal, true);
    const mates = G.chars.filter(o => o !== c && o.act && o.act.type === 'dine' && o.act.room === a.room && o.act.phase === 'do');
    for (const o of mates) { Sim.changeRel(c, o, 1 + Sim.compat(c, o) * 2); }
    if (mates.length) Sim.moodlet(c, 'shared', 'Shared a meal with friends', 4, 480);
  },
};
Sim.finishMeal = (c, meal, atTable) => {
  const g = Sim.has(c, 'glutton');
  if (meal === 'stew') { c.needs.hunger += 75; Sim.moodlet(c, 'meal', 'Hearty hot stew', g ? 10 : 6, 480); Sim.say(c, '😋', 'Now THAT is a stew!'); }
  else if (meal === 'porridge') { c.needs.hunger += 60; Sim.moodlet(c, 'meal', 'Plain porridge', g ? -2 : 0, 480); }
  else { c.needs.hunger += 30; Sim.moodlet(c, 'meal', 'Thin gruel (no money for food)', -8, 480); Sim.say(c, '😞', 'Gruel again...'); }
  if (!atTable && Sim.roomsOf('table').length === 0 && !Sim.has(c, 'slob')) Sim.moodlet(c, 'notable', 'Ate standing up', -2, 480);
};
A.ration = {
  dur: 15, icon: '🥖', label: () => 'Gnawing stale hardtack',
  end(c) { c.needs.hunger += 32; Sim.moodlet(c, 'meal', 'Stale hardtack for dinner', -5, 480); },
};
A.wash = {
  dur: (c) => 25, icon: '🧼', label: (c, a) => Sim.room(a.room) && Sim.room(a.room).type === 'bath' ? 'Soaking in the bathhouse' : 'Washing up',
  tick(c, dm, a) {
    const r = Sim.room(a.room); const bath = r && r.type === 'bath';
    c.needs.hygiene += dm * (bath ? 2.2 : 2.8);
    if (bath) { c.needs.fun += dm * 0.5; c.needs.social += dm * 0.3; }
    if (c.needs.hygiene >= 99) a.t = Math.min(a.t, bath ? 10 : 0);
  },
  begin(c, a) { const r = Sim.room(a.room); if (r && r.type === 'bath') a.t = 55; },
  end(c, a) { const r = Sim.room(a.room); if (r && r.type === 'bath') Sim.moodlet(c, 'bath', 'Relaxing hot bath', 8, 600); },
};
A.drink = {
  dur: () => U.ri(50, 90), icon: '🍺', label: () => 'Drinking at the bar',
  arrive(c, a) {
    if (c.purse >= 2) { c.purse -= 2; Sim.money(2, 'tavern'); }
  },
  tick(c, dm) {
    const d = Sim.has(c, 'drunkard') ? 1.5 : 1;
    c.needs.fun += dm * 0.55 * d; c.needs.social += dm * 0.5;
    if (Sim.has(c, 'loner')) c.needs.social += dm * 0.2;
  },
  end(c, a) {
    const mates = G.chars.filter(o => o !== c && o.act && o.act.type === 'drink' && o.act.room === a.room && o.act.phase === 'do');
    if (mates.length) Sim.socialize(c, U.pick(mates), 'bar');
    if (Sim.has(c, 'drunkard')) Sim.moodlet(c, 'merry', 'Merrily sozzled', 8, 300);
    if (Sim.has(c, 'pious') && mates.some(m => Sim.has(m, 'drunkard'))) Sim.moodlet(c, 'sots', 'Surrounded by sots', -4, 300);
  },
};
A.dice = {
  dur: () => U.ri(40, 70), icon: '🎲', label: () => 'Playing dice',
  tick(c, dm) { c.needs.fun += dm * (Sim.has(c, 'greedy') ? 0.7 : 0.45); c.needs.social += dm * 0.3; },
  end(c, a) {
    const others = G.chars.filter(o => o !== c && o.act && o.act.type === 'dice' && o.act.room === a.room && o.act.phase === 'do');
    if (others.length) {
      const o = U.pick(others); const stake = Math.min(U.ri(1, 8), c.purse, o.purse);
      if (stake > 0) {
        const win = U.chance(0.5);
        const [w, l] = win ? [c, o] : [o, c];
        w.purse += stake; l.purse -= stake;
        Sim.say(w, '💰', `Ha! Won ${stake} coin off ${l.name}!`);
        if (Sim.has(l, 'greedy')) Sim.moodlet(l, 'lost', `Lost ${stake}g at dice`, -5, 480);
        if (Sim.has(w, 'greedy')) Sim.moodlet(w, 'won', `Won ${stake}g at dice`, 6, 480);
      }
      Sim.socialize(c, o, 'dice');
    }
  },
};
A.read = {
  dur: () => U.ri(60, 100), icon: '📖', label: () => 'Studying',
  tick(c, dm) { Sim.train(c, 'arc', dm, Sim.has(c, 'bookworm') ? 1.5 : 1); c.needs.fun += dm * (Sim.has(c, 'bookworm') ? 0.5 : 0.08); c.needs.purpose += dm * 0.4; },
};
A.train = {
  dur: () => U.ri(70, 110), icon: '💪', label: (c, a) => Sim.room(a.room) && Sim.room(a.room).type === 'butts' ? 'Practising archery' : 'Drilling at the dummy',
  tick(c, dm, a) {
    const r = Sim.room(a.room);
    Sim.train(c, r && r.type === 'butts' ? 'agi' : 'mig', dm, Sim.has(c, 'hothead') ? 1.2 : 1);
    c.needs.purpose += dm * 0.5; c.needs.energy -= dm * 0.05; c.needs.hygiene -= dm * 0.08;
  },
};
A.pray = {
  dur: () => U.ri(50, 80), icon: '🙏', label: () => 'Praying at the shrine',
  tick(c, dm) { Sim.train(c, 'spi', dm, Sim.has(c, 'pious') ? 1.6 : 1); c.needs.purpose += dm * 0.35; c.needs.fun += dm * 0.05; },
  end(c) { if (Sim.has(c, 'pious')) Sim.moodlet(c, 'grace', 'Felt the Dawn\'s grace', 10, 1440); },
};
A.board = {
  dur: 15, icon: '📜', label: () => 'Reading the Quest Board',
  end(c) {
    c.needs.purpose += 12;
    const n = G.quests.length;
    if (!n) Sim.say(c, '😕', 'Nothing posted. Again.');
    else if (Sim.has(c, 'brave')) Sim.say(c, '😤', `${U.pick(G.quests).title}? Sign me up!`);
    else Sim.say(c, '🤔', `${n} request${n > 1 ? 's' : ''} up. Hmm.`);
  },
};
A.chore = {
  dur: 60, icon: '🔨', label: (c, a) => ({ clear: 'Clearing rubble', fixroom: 'Repairing furniture', tidyroom: 'Tidying furniture', mend: 'Mending floorboards', mop: 'Mopping up a puddle' })[a.job.kind],
  begin(c, a) {
    a.job.ref.claim = c.id;
    a.t = { clear: 90, fixroom: 120, tidyroom: 40, mend: 30, mop: 15 }[a.job.kind];
    if (c.kind === 'staff') a.t *= 0.7; else if (Sim.has(c, 'diligent')) a.t *= 0.85; else if (Sim.has(c, 'lazy')) a.t *= 1.3;
    a.t = Math.round(a.t);
  },
  tick(c, dm) { c.needs.purpose += dm * 0.45; c.needs.hygiene -= dm * 0.1; c.needs.energy -= dm * 0.04; },
  end(c, a) {
    const j = a.job; j.ref.claim = null;
    if (j.kind === 'clear') {
      j.ref.t = 'floor'; j.ref.mark = false; j.ref.cond = 30;
      G.flags.rubble = (G.flags.rubble || 0) + 1;
      if (G.flags.rubble >= 3) Sim.goal('rubble3');
      const left = DATA.LORE.filter(l => !G.lore.includes(l));
      if (left.length && U.chance(0.3)) {
        const l = left[0]; G.lore.push(l);
        Sim.log(`📜 ${c.name} found something in the rubble: ${l}`, 'lore');
        Sim.bio(c, 'Found a relic of the old guild while clearing rubble.');
        Sim.say(c, '❗', 'Hey, look what I found!');
      } else if (U.chance(0.25)) {
        const g = U.ri(3, 18); Sim.money(g, 'other'); Sim.say(c, '💰', `Found ${g} coins under the rocks!`);
      }
      Sim.recalcAppeal();
    } else if (j.kind === 'fixroom') {
      const r = j.ref; r.broken = false; r.repair = false; r.cond = 85;
      Sim.log(`🔧 ${c.name} finished repairing the ${DATA.ROOMS[r.type].name}.`, 'good');
      if (r.type === 'board') { Sim.goal('board'); Sim.postQuests(3); }
      if (r.type === 'hearth') Sim.goal('hearth');
      Sim.recalcAppeal();
    } else if (j.kind === 'tidyroom') { j.ref.cond = Math.min(100, j.ref.cond + 35); }
    else if (j.kind === 'mend') { j.ref.cond = Math.min(100, j.ref.cond + 40); Sim.recalcAppeal(); }
    else if (j.kind === 'mop') { j.ref.puddle = 0; }
    if (c.kind === 'adv') {
      if (Sim.has(c, 'diligent')) Sim.moodlet(c, 'productive', 'Productive day', 5, 720);
      if (Sim.has(c, 'lazy')) Sim.moodlet(c, 'chores', 'Did chores (ugh)', -3, 480);
    }
  },
};
A.seek = {
  dur: 5, icon: '💬', label: (c, a) => { const o = Sim.char(a.with); return o ? `Looking for ${o.name}` : 'Looking for company'; },
  arrive(c, a) {
    const o = Sim.char(a.with);
    if (o && o.act && o.act.type === 'heal' && o.act.phase === 'do' && Math.hypot(o.x - c.x, o.y - c.y) < 2.6) {
      // a bedside visit: the patient stays in bed
      o.needs.social = Math.min(100, o.needs.social + 35); o.needs.fun = Math.min(100, o.needs.fun + 15);
      Sim.moodlet(o, 'visit' + c.id, `${c.name} visited me while I was laid up`, 6, 1440);
      Sim.changeRel(c, o, 4 + Sim.compat(c, o) * 3, 'bedside visit');
      Sim.say(o, '🥲', `Thanks for stopping by, ${c.name}.`);
      Sim.start(c, 'chat', null, { with: o.id, phase: 'do', t: 30 });
      return;
    }
    const ok = o && Sim.home(o) && Math.hypot(o.x - c.x, o.y - c.y) < 2.6 && o.injury <= 0 &&
      (!o.act || ['wander', 'idle', 'board'].includes(o.act.type) || (o.act.phase === 'walk' && !['leave', 'heal'].includes(o.act.type)));
    if (!ok) { Sim.say(c, '🤷', 'Where did they go?', 30); a.t = 0; return; }
    Sim.cancel(o);
    const len = U.ri(25, 45);
    Sim.start(o, 'chat', null, { with: c.id, phase: 'do', t: len });
    Sim.start(c, 'chat', null, { with: o.id, phase: 'do', t: len, init: true });
    c.dir = o.x > c.x ? 1 : -1; o.dir = -c.dir;
  },
};
A.chat = {
  dur: 30, icon: '💬', label: (c, a) => { const o = Sim.char(a.with); return o ? `Chatting with ${o.name}` : 'Chatting'; },
  tick(c, dm) { c.needs.social += dm * 1.3; c.needs.fun += dm * 0.25; },
  end(c, a) {
    const o = Sim.char(a.with);
    if (a.init && o) Sim.socialize(c, o, 'chat');
  },
};
A.cook = {
  dur: 120, icon: '🍳', label: () => 'Cooking',
  tick(c, dm) { if (!Sim.isDaylight() && Sim.hourF() > 20.5) c.act.t = 0; },
};
A.tend = {
  dur: 120, icon: '🍺', label: () => 'Tending bar',
  tick(c, dm) { c.needs.social += dm * 0.3; const h = Sim.hourF(); if (h > 0.5 && h < 10) c.act.t = 0; },
};
A.leave = { dur: 1, icon: '🚪', label: (c) => c.state === 'quitting' ? 'Leaving the guild for good' : 'Setting out on a quest' };
A.enter = { dur: 1, icon: '', label: () => 'Arriving home' };
A.break = {
  dur: 240, icon: '🌩️', label: (c, a) => ({ sulk: 'Sulking in a corner (breakdown)', binge: 'Stress-eating (breakdown)', tantrum: 'Throwing a tantrum (breakdown)' })[a.kind],
  arrive(c, a) {
    if (a.kind === 'tantrum') {
      const r = Sim.room(a.room);
      if (r) { r.cond = Math.max(5, r.cond - 40); Sim.log(`💢 ${c.name} smashed up the ${DATA.ROOMS[r.type].name} in a rage!`, 'bad'); Sim.recalcAppeal(); }
      a.t = 40;
    }
    if (a.kind === 'binge') { const lost = Math.min(G.gold, 15); Sim.money(-lost, 'food'); c.needs.hunger = 100; a.t = 90; }
  },
  end(c, a) { Sim.moodlet(c, 'catharsis', 'Let it all out', 18, 1440 * 2); Sim.moodlet(c, 'shame', `Embarrassed about the ${a.kind}`, -4, 1440); },
};

Sim.train = (c, s, dm, mult = 1) => {
  if (c.kind !== 'adv') return;
  let m = mult * (Sim.faction('college') >= 50 ? 1.5 : 1);
  const r = c.act && Sim.room(c.act.room); if (r) m *= 0.5 + 0.5 * r.cond / 100;
  const cap = Sim.statCap(c, s);
  if (c.stats[s] < cap) c.stats[s] = Math.min(cap, c.stats[s] + dm * 0.0045 * m);
  Sim.gainXp(c, dm * 0.03 * m);
};

// -------------------------------------------------------------- decide -----
Sim.decide = (c) => {
  const n = c.needs, night = Sim.isNight(c), staff = c.kind === 'staff';
  const opts = [];
  const add = (type, s, find) => { if (s > 0) opts.push({ type, s: s + U.rnd(0, 12), find }); };
  let B = null; const bfs = () => B || (B = Sim.bfs(Math.round(c.x), Math.round(c.y)));

  // injuries trump all
  if (c.injury > 0 && n.hunger > 20) {
    add('heal', 150, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('infirm')) || (c.bed && Sim.roomWorks(Sim.room(c.bed)) && Sim.nearestRoom(c, bfs(), [Sim.room(c.bed)], true)) || { tx: Math.round(c.x), ty: Math.round(c.y), path: [] });
  }
  // sleep
  {
    let s = (100 - n.energy) * 1.1 + (night ? 50 : 0) - (n.energy > 70 && !night ? 80 : 0) + (Sim.has(c, 'lazy') ? 12 : 0);
    if (n.energy < 15) s += 80;
    if (n.energy < 92) add('sleep', s, () => {
      let r = c.bed && Sim.room(c.bed);
      if (r && r.broken) r = null;
      if (!r) {
        const free = G.rooms.find(b => DATA.ROOMS[b.type].bed && !b.broken && b.owners.length < DATA.ROOMS[b.type].bed);
        if (free) { free.owners.push(c.id); c.bed = free.id; r = free; Sim.say(c, '🛏️', 'I\'ll call this bed mine.'); }
      }
      if (r) { const t = Sim.nearestRoom(c, bfs(), [r], true); if (t) return t; }
      // the floor: find a quiet spot
      return Sim.wanderTarget(c, bfs(), 6);
    });
  }
  // hunger
  if (n.hunger < 70) {
    const s = (100 - n.hunger) * 1.25 * (Sim.has(c, 'glutton') ? 1.3 : 1) + (n.hunger < 20 ? 60 : 0);
    add('eat', s, () => G.gold >= 2 ? Sim.nearestRoom(c, bfs(), Sim.roomsOf('hearth')) : null);
    add('ration', s - 15, () => ({ tx: Math.round(c.x), ty: Math.round(c.y), path: [] }));
  }
  // hygiene
  if (n.hygiene < 60) {
    const s = (100 - n.hygiene) * (Sim.has(c, 'neat') ? 1.2 : Sim.has(c, 'slob') ? 0.45 : 0.85);
    add('wash', s, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('basin', 'bath')));
  }
  // social
  if (n.social < 70) {
    const s = (100 - n.social) * (Sim.has(c, 'loner') ? 0.4 : Sim.has(c, 'charming') ? 1.15 : 0.9);
    add('seek', s, () => {
      const cands = G.chars.filter(o => o !== c && Sim.home(o) && (o.injury <= 0 ? (!o.act || ['wander', 'idle', 'board'].includes(o.act.type)) : (o.act && o.act.type === 'heal' && o.act.phase === 'do')));
      if (!cands.length) return null;
      cands.sort((a2, b2) => (Sim.rel(c.id, b2.id) - Sim.rel(c.id, a2.id)) + U.rnd(-20, 20));
      const o = cands[0];
      const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [Math.round(o.x) + dx, Math.round(o.y) + dy]).filter(([x, y]) => (x !== Math.round(o.x) || y !== Math.round(o.y) || o.pose === 'lie') && Sim.walkable(x, y));
      let best = null;
      for (const [x, y] of spots) { const d = bfs().dist[y * W + x]; if (d >= 0 && (!best || d < best.d)) best = { d, tx: x, ty: y }; }
      if (!best) return null;
      best.path = Sim.pathFrom(bfs(), best.tx, best.ty); best.with = o.id;
      return best;
    });
    if (!staff || c.role !== 'barkeep') add('drink', s * (Sim.has(c, 'drunkard') ? 1.4 : 1) * (Sim.has(c, 'pious') ? 0.5 : 1) + 5, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('bar')));
  }
  // fun
  if (n.fun < 70) {
    const s = (100 - n.fun) * 0.95;
    add('drink', s * (Sim.has(c, 'drunkard') ? 1.4 : 0.9) * (Sim.has(c, 'pious') ? 0.4 : 1), () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('bar')));
    add('dice', s * (Sim.has(c, 'greedy') ? 1.3 : 0.85), () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('dice')));
    if (Sim.has(c, 'bookworm')) add('read', s * 1.1, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('shelf')));
    add('wash', s * 0.6 - 10, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('bath')));
  }
  if (!staff) {
    // purpose: train, study, pray, check board
    const p = (100 - n.purpose) * (Sim.has(c, 'diligent') ? 1.15 : Sim.has(c, 'lazy') ? 0.6 : 0.9);
    if (n.purpose < 85 && n.energy > 25) {
      const main = DATA.CLASSES[c.cls].main, sec = DATA.CLASSES[c.cls].second;
      const pref = (s) => s === main ? 1.2 : s === sec ? 1.0 : 0.65;
      add('train', p * pref('mig') + 4, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('dummy')));
      add('train', p * pref('agi') + 4, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('butts')));
      add('read', p * pref('arc') + (Sim.has(c, 'bookworm') ? 12 : 0), () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('shelf')));
      add('pray', p * pref('spi') + (Sim.has(c, 'pious') ? 20 : 0), () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('shrine')));
      add('board', p * 0.5 + 2, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('board')));
    }
    if (Sim.hasJobs() && !night) {
      const s = 22 + (100 - n.purpose) * 0.35 + (Sim.has(c, 'diligent') ? 35 : 0) - (Sim.has(c, 'lazy') ? 30 : 0);
      add('chore', s, () => { const j = Sim.findJob(c, bfs(), false); return j ? { tx: j.tx, ty: j.ty, path: j.path, job: j } : null; });
    }
  } else {
    // staff on duty
    const h = Sim.hourF();
    if (c.role === 'caretaker' && h >= 7 && h < 20 && Sim.hasJobs())
      add('chore', 85, () => { const j = Sim.findJob(c, bfs(), true); return j ? { tx: j.tx, ty: j.ty, path: j.path, job: j } : null; });
    if (c.role === 'cook' && h >= 6 && h < 20.5) add('cook', 85, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('hearth')));
    if (c.role === 'barkeep' && (h >= 11 || h < 0.5)) add('tend', 85, () => Sim.nearestRoom(c, bfs(), Sim.roomsOf('bar')));
  }
  add('wander', 18, () => Sim.wanderTarget(c, bfs(), 7));

  opts.sort((a2, b2) => b2.s - a2.s);
  for (const o of opts) {
    const tgt = o.find();
    if (!tgt) continue;
    const extra = {};
    if (tgt.job) extra.job = tgt.job;
    if (tgt.with) extra.with = tgt.with;
    Sim.start(c, o.type, tgt, extra);
    return;
  }
  Sim.start(c, 'idle', null);
};
Sim.wanderTarget = (c, B, range) => {
  let best = null, bs = -1e9;
  const cx = Math.round(c.x), cy = Math.round(c.y);
  for (let i = 0; i < 14; i++) {
    const x = cx + U.ri(-range, range), y = cy + U.ri(-range, range);
    if (!Sim.walkable(x, y) || Sim.tile(x, y).t === 'door') continue;
    const d = B.dist[y * W + x]; if (d < 0) continue;
    const s = Sim.appealAt(x, y) + U.rnd(0, 6) - d * 0.15;
    if (s > bs) { bs = s; best = { tx: x, ty: y }; }
  }
  if (!best) return { tx: cx, ty: cy, path: [] };
  best.path = Sim.pathFrom(B, best.tx, best.ty);
  return best;
};

// --------------------------------------------------------- per-tick char ---
Sim.step = (ent, path, dm, speed) => {
  let mv = speed * dm;
  while (mv > 0 && path.length) {
    const [nx, ny] = path[0];
    if (!Sim.walkable(nx, ny)) return 'blocked';
    const dx = nx - ent.x, dy = ny - ent.y, d = Math.hypot(dx, dy);
    if (dx) ent.dir = dx < 0 ? -1 : 1;
    if (d <= mv) {
      ent.x = nx; ent.y = ny; mv -= d; path.shift();
      const t = Sim.tile(nx, ny); t.traffic++; if (t.t === 'floor' && !t.room) t.cond = Math.max(0, t.cond - 0.012);
    } else { ent.x += dx / d * mv; ent.y += dy / d * mv; mv = 0; }
  }
  return path.length ? 'walking' : 'arrived';
};

Sim.updateChar = (c, dm) => {
  c.ox = c.x; c.oy = c.y;
  if (c.state === 'away') return;
  const n = c.needs, sleeping = c.act && c.act.type === 'sleep' && c.act.phase === 'do';
  const resting = c.act && c.act.type === 'heal' && c.act.phase === 'do';
  // need decay
  n.hunger -= dm * (3.6 / 60) * (Sim.has(c, 'glutton') ? 1.4 : 1) * (sleeping ? 0.45 : 1);
  if (!sleeping) n.energy -= dm * (4.4 / 60) * (Sim.has(c, 'lazy') ? 1.15 : 1);
  n.hygiene -= dm * (2.2 / 60) * (Sim.has(c, 'slob') ? 1.5 : 1) * (sleeping ? 0.4 : 1);
  n.social -= dm * (2.8 / 60) * (Sim.has(c, 'loner') ? 0.45 : Sim.has(c, 'charming') ? 1.2 : 1) * (sleeping ? 0.25 : resting ? 0.5 : 1);
  n.fun -= dm * (2.4 / 60) * (sleeping ? 0.25 : resting ? 0.5 : 1);
  if (c.kind === 'adv') n.purpose -= dm * (1.7 / 60) * (Sim.has(c, 'diligent') ? 1.4 : Sim.has(c, 'lazy') ? 0.6 : 1) * (sleeping ? 0.2 : 1);
  else n.purpose = 75;
  for (const k of NEEDS) n[k] = U.clamp(n[k], 0, 100);

  // action
  if (!c.act) Sim.decide(c);
  const a = c.act;
  if (a) {
    const def = A[a.type];
    if (a.phase === 'walk') {
      if (a.repath) { a.repath = false; const B = Sim.bfs(Math.round(c.x), Math.round(c.y)); a.path = Sim.pathFrom(B, a.tx, a.ty) || []; }
      const sp = 0.17 * (n.energy < 15 ? 0.7 : 1) * (c.injury > 0 ? 0.6 : 1);
      const r = Sim.step(c, a.path, dm, sp);
      if (r === 'blocked') {
        const B = Sim.bfs(Math.round(c.x), Math.round(c.y));
        const p = Sim.pathFrom(B, a.tx, a.ty);
        if (p) a.path = p; else Sim.cancel(c);
      } else if (r === 'arrived') {
        if (a.type === 'leave') { Sim.exitDoor(c); return; }
        if (a.type === 'enter') { c.state = 'home'; c.act = null; }
        else {
          a.phase = 'do';
          if (a.type === 'chore' && a.job && a.job.ref.claim !== c.id && a.job.ref.claim != null) { Sim.cancel(c); }
          else if (def.arrive) def.arrive(c, a);
          if (a.room) { const rm = Sim.room(a.room); if (rm) c.dir = (rm.x + rm.w / 2 - 0.5) >= c.x ? 1 : -1; }
          if (a.type === 'chore' && a.job) c.dir = a.job.wx >= c.x ? 1 : -1;
        }
      }
    } else if (c.act === a) {
      if (a.room && !Sim.room(a.room)) Sim.cancel(c);
      else {
        if (def.tick) def.tick(c, dm, a);
        if (c.act === a) {
          a.t -= dm;
          if (a.t <= 0) { c.act = null; c.pose = null; if (def.end) def.end(c, a); }
        }
        const r = a.room && Sim.room(a.room);
        if (r && a.type !== 'sleep' && a.type !== 'heal') r.cond = Math.max(0, r.cond - dm * 0.002);
      }
    }
    for (const k of NEEDS) n[k] = U.clamp(n[k], 0, 100);
  }
  // environment perception
  const [tx, ty] = Sim.cpos(c);
  let ap = Sim.appealAt(tx, ty);
  if (ap < 0) ap *= Sim.has(c, 'neat') ? 1.8 : Sim.has(c, 'slob') ? 0.3 : 1;
  c.env = c.env * 0.985 + ap * 0.015;

  // mood
  if (G.t % 10 === 0) Sim.updateMood(c);
  if (c.th && c.th.until < G.t) c.th = null;
};
Sim.needScore = (c) => {
  const n = c.needs;
  const w = c.kind === 'adv' ? { hunger: .2, energy: .2, hygiene: .12, social: .16, fun: .14, purpose: .18 } : { hunger: .25, energy: .25, hygiene: .15, social: .2, fun: .15, purpose: 0 };
  let s = 0; for (const k of NEEDS) s += n[k] * w[k];
  for (const k of NEEDS) if (w[k] && n[k] < 15) s -= 4;
  return s;
};
Sim.updateMood = (c) => {
  c.ml = c.ml.filter(m => m.until > G.t);
  const n = c.needs;
  if (n.hygiene < 20 && !Sim.has(c, 'slob')) Sim.moodlet(c, 'filthy', 'Feels filthy', Sim.has(c, 'neat') ? -14 : -7, 20);
  if (n.hunger < 12) Sim.moodlet(c, 'starving', 'Starving', -15, 20);
  if (n.energy < 10) Sim.moodlet(c, 'exhaust', 'Exhausted', -10, 20);
  if (c.injury > 0) Sim.moodlet(c, 'hurt', 'In pain from injuries', -5, 20);
  if (c.kind === 'adv' && c.wage < Sim.fairWage(c) - 1) Sim.moodlet(c, 'underpaid', 'Feels underpaid', -5, 20);
  if (G.chars.length >= 6 && Sim.has(c, 'loner')) Sim.moodlet(c, 'crowd', 'Hall is too crowded', -4, 20);
  let target = Sim.needScore(c) * 0.75 + 22 + c.env * 0.9;
  for (const m of c.ml) target += m.v;
  target = U.clamp(target, 0, 100);
  c.mood += (target - c.mood) * 0.06;
  // breakdowns
  if (c.mood < 12 && Sim.home(c) && !(c.act && c.act.type === 'break') && !c.ml.some(m => m.k === 'catharsis') && U.chance(0.004)) Sim.breakdown(c);
};
Sim.breakdown = (c) => {
  Sim.cancel(c);
  const kind = U.pick(['sulk', 'binge', 'tantrum']);
  const B = Sim.bfs(Math.round(c.x), Math.round(c.y));
  let tgt = null;
  if (kind === 'tantrum') tgt = Sim.nearestRoom(c, B, G.rooms.filter(r => !r.broken && DATA.ROOMS[r.type].cap > 0 && !DATA.ROOMS[r.type].bed && r.type !== 'infirm'), true);
  if (kind === 'binge') tgt = Sim.nearestRoom(c, B, Sim.roomsOf('hearth'), true);
  if (!tgt) tgt = Sim.wanderTarget(c, B, 10);
  Sim.start(c, 'break', tgt, { kind });
  Sim.say(c, '🌩️', kind === 'sulk' ? 'Leave me ALONE.' : kind === 'binge' ? 'I need... food. All of it.' : 'I CAN\'T TAKE THIS PLACE!', 240);
  Sim.log(`🌩️ ${c.name} is having a breakdown (${kind})! Their mood hit rock bottom.`, 'bad');
  Sim.bio(c, `Had a mental breakdown (${kind}).`);
};

// ---------------------------------------------------------------- door -----
Sim.exitDoor = (c) => {
  c.act = null; c.pose = null;
  if (c.state === 'quitting') {
    G.chars = G.chars.filter(o => o !== c);
    Sim.releaseBed(c);
    return;
  }
  c.state = 'away';
};
Sim.releaseBed = (c) => {
  for (const r of G.rooms) r.owners = r.owners.filter(id => id !== c.id);
  c.bed = null;
};
Sim.sendOut = (c, quitting) => {
  Sim.cancel(c);
  c.state = quitting ? 'quitting' : 'leaving';
  const B = Sim.bfs(Math.round(c.x), Math.round(c.y));
  const p = Sim.pathFrom(B, G.door.x, G.door.y);
  if (!p) { Sim.exitDoor(c); return; }
  Sim.start(c, 'leave', { tx: G.door.x, ty: G.door.y, path: p });
};
Sim.comeHome = (c) => {
  c.state = 'returning';
  c.x = c.ox = G.door.x; c.y = c.oy = G.door.y;
  const B = Sim.bfs(c.x, c.y);
  const tgt = Sim.wanderTarget({ x: G.door.x, y: G.door.y - 3 }, B, 3);
  Sim.start(c, 'enter', tgt);
  if (!tgt.path || !tgt.path.length) c.state = 'home', c.act = null;
};

// ------------------------------------------------------------- visitors ----
Sim.spawnVisitor = () => {
  const bar = Sim.roomsOf('bar').length, board = Sim.roomsOf('board').length;
  const goals = [];
  if (bar) goals.push('drink', 'drink', 'drink');
  if (board) goals.push('petition', 'petition');
  goals.push('gawk');
  const v = {
    id: Sim.id(), goal: U.pick(goals), x: G.door.x, y: G.door.y, ox: G.door.x, oy: G.door.y, dir: 1,
    look: Sim.newLook(U.pick(DATA.TOWNS_CLOTH)), path: null, phase: 'walk', t: 0, room: null, env: 0, life: 0,
  };
  G.vis.push(v);
};
Sim.updateVisitors = (dm) => {
  for (const v of G.vis) {
    v.ox = v.x; v.oy = v.y; v.life += dm;
    if (!v.path) {
      const B = Sim.bfs(Math.round(v.x), Math.round(v.y));
      let tgt = null;
      if (v.goal === 'drink') { tgt = Sim.nearestRoom(v, B, Sim.roomsOf('bar')); }
      else if (v.goal === 'petition') { tgt = Sim.nearestRoom(v, B, Sim.roomsOf('board', 'desk')); }
      else if (v.goal === 'gawk') { tgt = Sim.wanderTarget(v, B, 6); v.t = U.ri(10, 30); }
      if (!tgt || v.goal === 'leave') { v.goal = 'leave'; tgt = { tx: G.door.x, ty: G.door.y, path: Sim.pathFrom(B, G.door.x, G.door.y) || [] }; }
      v.path = tgt.path || []; v.room = tgt.room ? tgt.room.id : null; v.phase = 'walk';
      if (v.goal === 'drink') v.t = U.ri(50, 120);
      if (v.goal === 'petition') v.t = 20;
    }
    if (v.phase === 'walk') {
      const r = Sim.step(v, v.path, dm, 0.15);
      const [tx, ty] = [Math.round(v.x), Math.round(v.y)];
      v.env = v.env * 0.96 + Sim.appealAt(tx, ty) * 0.04;
      if (r === 'blocked') v.path = null;
      else if (r === 'arrived') {
        if (v.goal === 'leave') { v.gone = true; continue; }
        v.phase = 'do';
        if (v.room) { const rm = Sim.room(v.room); if (rm) v.dir = (rm.x + rm.w / 2 - 0.5) >= v.x ? 1 : -1; }
      }
    } else {
      v.t -= dm;
      if (v.room && !Sim.room(v.room)) v.t = 0;
      if (v.t <= 0) {
        if (v.goal === 'drink') {
          const keep = G.chars.some(c => c.role === 'barkeep' && c.act && c.act.type === 'tend' && c.act.phase === 'do');
          const g = Math.round(U.ri(3, 6) * (keep ? 1.6 : 1) * (1 + Math.max(0, v.env) / 15));
          Sim.money(g, 'tavern');
        }
        if (v.goal === 'petition') {
          const q = Sim.postQuests(1, true);
          if (q && q[0] && U.chance(0.3)) Sim.log(`A townsperson pinned a request: “${q[0].title}”.`);
        }
        G.opinion = U.clamp(G.opinion + (v.env > 1 ? 0.6 : v.env < -2 ? -0.6 : 0.1), -50, 100);
        if (v.env > 3 && U.chance(0.2)) Sim.gainRenown(1);
        v.goal = 'leave'; v.path = null; v.room = null;
      }
    }
    if (v.life > 600 && v.goal !== 'leave') { v.goal = 'leave'; v.path = null; v.room = null; }
  }
  G.vis = G.vis.filter(v => !v.gone);
};

// ---------------------------------------------------------------- quests ---
Sim.regionsOpen = () => {
  const ri = Sim.rankIdx() + (Sim.roomsOf('scry').length ? 1 : 0);
  return DATA.REGIONS.filter((r, i) => i <= ri && r.id !== 'voidspire');
};
Sim.genQuest = (region) => {
  const type = U.pick(DATA.QUEST_TYPES), tier = region.tier;
  const recMax = Math.min(4, 1 + Math.ceil(tier / 2));
  const rec = tier === 1 ? U.ri(1, 2) : U.ri(Math.min(2, recMax), recMax);
  const days = Math.max(1, Math.round((0.6 + tier * 0.45) * type.days * U.rnd(0.8, 1.3)));
  const fill = (s) => s.replace('{foe}', U.pick(region.foes)).replace('{place}', U.pick(region.places))
    .replace('{npc}', U.pick(DATA.Q_NPCS)).replace('{item}', U.pick(DATA.Q_ITEMS)).replace('{herb}', U.pick(DATA.Q_HERBS));
  let title = fill(type.fmt); title = title[0].toUpperCase() + title.slice(1);
  return {
    id: Sim.id(), title, region: region.id, tier, type: type.k, faction: DATA.QTYPE_FACTION[type.k],
    rec, max: Math.min(4, rec + 1), days, w: type.w, risk: type.risk,
    diff: Math.round(DATA.TIER_DIFF[tier] * rec * U.rnd(0.85, 1.2)),
    gold: Math.round(21 * Math.pow(tier, 1.75) * rec * U.rnd(0.8, 1.25) * (1 + days * 0.15)),
    renown: Math.round(4 * tier * rec * U.rnd(0.8, 1.2) * (Sim.roomsOf('scry').length ? 1.2 : 1)),
    xp: Math.round(tier * 16 * days * U.rnd(0.9, 1.15)),
    expires: Sim.day() + U.ri(3, 6), posted: G.t,
  };
};
Sim.questCap = () => 4 + (Sim.roomsOf('desk').length ? 4 : 0) + Math.floor(Sim.rankIdx() / 2);
Sim.postQuests = (n, fromVisitor) => {
  if (!Sim.roomsOf('board').length) return null;
  const regs = Sim.regionsOpen(), out = [];
  for (let i = 0; i < n; i++) {
    if (G.quests.filter(q => !q.boss).length >= Sim.questCap()) break;
    const weights = regs.map((r, j) => j === regs.length - 1 ? 3 : j === regs.length - 2 ? 2 : 1);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0), reg = regs[0];
    for (let j = 0; j < regs.length; j++) { roll -= weights[j]; if (roll <= 0) { reg = regs[j]; break; } }
    const q = Sim.genQuest(reg);
    if (fromVisitor) q.gold = Math.round(q.gold * 1.1);
    G.quests.push(q); out.push(q);
  }
  return out;
};
Sim.bossQuest = () => ({
  id: Sim.id(), boss: true, title: 'Slay the Voidwyrm atop the Voidspire', region: 'voidspire', tier: 7, type: 'slay', faction: 'crown',
  rec: 4, max: 4, days: 6, w: { mig: .35, agi: .2, arc: .25, spi: .2 }, risk: 1.6, diff: 330,
  gold: 10000, renown: 2000, xp: 1500, expires: 1e9, posted: G.t,
});

Sim.partyPower = (q, members, potions) => {
  let P = 0; const notes = [];
  for (const c of members) {
    let s = 0; for (const k of STATS) s += c.stats[k] * (q.w[k] || 0);
    if (Sim.has(c, 'hothead')) s *= 1.06;
    s *= 0.75 + c.mood / 200;
    s *= 1 + 0.12 * c.gear;
    s *= 0.7 + 0.3 * c.needs.energy / 100;
    if (q.risk >= 1 && Sim.has(c, 'brave')) s *= 1.1;
    if (q.risk >= 1 && Sim.has(c, 'coward')) s *= 0.85;
    P += s;
  }
  let syn = 1;
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const r = Sim.rel(members[i].id, members[j].id);
    if (r >= 35) { syn += 0.05; notes.push(`+ ${members[i].name} & ${members[j].name} are friends`); }
    if (r <= -20) { syn -= 0.08; notes.push(`− ${members[i].name} & ${members[j].name} are rivals`); }
  }
  const classes = new Set(members.map(c => c.cls));
  if (classes.size >= 3) { syn += 0.04 * (classes.size - 2); notes.push('+ Diverse party'); }
  if (members.some(c => c.cls === 'bard')) { syn += 0.06; notes.push('+ Bardic inspiration'); }
  P *= syn;
  let chance = 1 / (1 + Math.exp(-(P / q.diff - 1) * 5));
  if (members.some(c => Sim.has(c, 'lucky'))) { chance += 0.04; notes.push('+ Lucky charm'); }
  if (potions) { chance += 0.08; notes.push('+ Potions'); }
  if (members.some(c => c.needs.energy < 30)) notes.push('− Someone is exhausted');
  if (members.some(c => c.mood < 35)) notes.push('− Someone is unhappy');
  if (members.length < q.rec) notes.push(`− Under-staffed (recommended ${q.rec})`);
  chance = U.clamp(chance, 0.03, 0.97);
  return { P: Math.round(P), D: q.diff, chance };
};
Sim.dispatch = (qid, ids, potions) => {
  const q = G.quests.find(x => x.id === qid); if (!q) return 'Quest gone';
  const members = ids.map(Sim.char).filter(c => c && Sim.available(c));
  if (!members.length) return 'Choose at least one adventurer';
  if (members.length > q.max) return 'Too many members';
  const pcost = potions ? 15 * members.length : 0;
  if (G.gold < pcost) return 'Not enough gold for potions';
  if (pcost) Sim.money(-pcost, 'other');
  const pred = Sim.partyPower(q, members, potions);
  G.quests = G.quests.filter(x => x !== q);
  const travel = U.ri(2, 6) * 60;
  G.active.push({ q, party: members.map(c => c.id), start: G.t, end: G.t + q.days * 1440 + travel, potions, pred: pred.chance, log: [], morale: 0, nextEv: G.t + U.ri(300, 900) });
  for (const c of members) {
    Sim.sendOut(c);
    if (q.risk >= 1 && Sim.has(c, 'coward')) Sim.moodlet(c, 'dread', 'Dreading a dangerous quest', -8, 1440 * q.days);
    if (Sim.has(c, 'brave') && q.tier >= Sim.rankIdx() + 1) Sim.moodlet(c, 'thrill', 'Thrill of adventure', 6, 1440 * q.days);
    Sim.say(c, '⚔️', U.pick(['Adventure awaits!', 'Back by supper. Probably.', 'Wish me luck!', 'For the Flagon!']));
  }
  Sim.log(`⚔️ ${members.map(c => c.name).join(', ')} set out: “${q.title}”.`, 'quest');
  return null;
};
Sim.questEvent = (A2) => {
  const ms = A2.party.map(Sim.char).filter(Boolean);
  if (!ms.length) return;
  const a = U.pick(ms), b = ms.length > 1 ? U.pick(ms.filter(x => x !== a)) : null;
  const reg = DATA.REGIONS.find(r => r.id === A2.q.region);
  const foe = U.pick(reg.foes);
  const evs = [
    () => { A2.morale += 0.03; return `${a.name} spotted fresh tracks of ${foe}.`; },
    () => { A2.morale -= 0.04; a.needs.energy -= 15; return `An ambush by ${foe}! ${a.name} took a nasty hit.`; },
    () => { const g = U.ri(4, 12) * A2.q.tier; A2.bonus = (A2.bonus || 0) + g; return `The party found a hidden cache (+${g}g).`; },
    () => { A2.morale -= 0.02; return `A cold, rainy night. Nobody slept well.`; },
    () => { A2.morale += 0.02; return `${a.name} cooked a surprisingly good camp stew.`; },
  ];
  if (b) evs.push(
    () => { Sim.changeRel(a, b, 5, 'campfire stories'); A2.morale += 0.02; return `${a.name} and ${b.name} swapped stories by the campfire.`; },
    () => { const d = Sim.socialize(a, b, 'quest'); return d < 0 ? `${a.name} and ${b.name} argued over the map.` : `${a.name} saved ${b.name} from a pit trap!`; },
  );
  if (Sim.has(a, 'coward')) evs.push(() => { A2.morale -= 0.03; return `${a.name} jumped at shadows all night.`; });
  if (Sim.has(a, 'hothead')) evs.push(() => { A2.morale += 0.02; return `${a.name} charged in screaming. It worked, somehow.`; });
  if (a.cls === 'bard') evs.push(() => { A2.morale += 0.04; return `${a.name} sang a rousing ballad. Spirits lifted.`; });
  const txt = U.pick(evs)();
  A2.log.push({ t: G.t, text: txt });
};
Sim.resolveQuest = (A2) => {
  const q = A2.q;
  const ms = A2.party.map(Sim.char).filter(Boolean);
  if (!ms.length) return;
  const pw = Sim.partyPower(q, ms, A2.potions);
  const chance = U.clamp(pw.chance + A2.morale, 0.03, 0.97);
  const roll = Math.random();
  const ok = roll < chance, great = roll < chance * 0.35, disaster = !ok && pw.P < q.diff * 0.7;
  const hasCleric = ms.some(c => c.cls === 'cleric');
  let gold = 0, renown = 0, hurt = [], died = [];
  if (ok) {
    gold = Math.round(q.gold * (great ? 1.3 : 1)) + (A2.bonus || 0);
    renown = Math.round(q.renown * (great ? 1.4 : 1));
    G.factions[q.faction] = U.clamp((G.factions[q.faction] || 0) + U.ri(3, 6) + (great ? 2 : 0), -100, 100);
  } else {
    gold = Math.round((A2.bonus || 0) + (U.chance(0.4) ? q.gold * 0.2 : 0));
    renown = -Math.round(q.tier * 3);
    G.factions[q.faction] = U.clamp((G.factions[q.faction] || 0) - 2, -100, 100);
  }
  for (const c of ms) {
    let inj = (ok ? 0.07 : 0.4) * q.risk * (disaster ? 1.5 : 1);
    if (hasCleric) inj *= 0.6; if (A2.potions) inj *= 0.6;
    if (U.chance(inj)) {
      let death = disaster ? 0.14 * q.risk : 0;
      if (hasCleric) death *= 0.5; if (A2.potions) death *= 0.7;
      if (U.chance(death)) { died.push(c); continue; }
      c.injury = Math.round(U.rnd(10, 30) * (1 + q.tier * 0.3) * (ok ? 0.6 : 1));
      hurt.push(c);
    }
  }
  Sim.money(gold, 'quests');
  Sim.gainRenown(renown);
  G.totalQuests++;
  for (const c of ms) {
    if (died.includes(c)) continue;
    c.quests++;
    Sim.gainXp(c, Math.round(q.xp * (ok ? 1 : 0.4)));
    c.needs.energy = U.clamp(c.needs.energy - 25, 5, 100); c.needs.hygiene = U.clamp(c.needs.hygiene - 40, 0, 100);
    c.needs.purpose = 100; c.needs.fun = U.clamp(c.needs.fun + (ok ? 20 : -10), 0, 100);
    if (ok) { c.wins++; Sim.moodlet(c, 'quest', great ? 'Glorious victory!' : 'Triumphant return', great ? 25 : 14, 1440 * 3); c.loyalty = U.clamp(c.loyalty + 4, 0, 100); }
    else Sim.moodlet(c, 'quest', disaster ? 'Barely escaped alive' : 'Failed a quest', disaster ? -18 : -10, 1440 * 3);
    Sim.bio(c, `${ok ? (great ? 'Gloriously completed' : 'Completed') : 'Failed'} “${q.title}”.${hurt.includes(c) ? ' Came back injured.' : ''}`);
    for (const o of ms) if (o !== c && !died.includes(o) && c.id < o.id) Sim.changeRel(c, o, ok ? U.ri(2, 6) : U.ri(-3, 4), ok ? 'shared victory' : 'shared hardship');
    Sim.comeHome(c);
    Sim.say(c, ok ? '🎉' : '😞', ok ? 'We did it!' : 'That... did not go well.', 180);
  }
  for (const d of died) Sim.kill(d, `Fell during “${q.title}”`);
  const verdict = ok ? (great ? 'GLORIOUS SUCCESS' : 'Success') : (disaster ? 'DISASTER' : 'Failure');
  Sim.log(`${ok ? '🏆' : '💀'} ${verdict}: “${q.title}” — ${gold}g, ${renown >= 0 ? '+' : ''}${renown} renown.${hurt.length ? ' Injured: ' + hurt.map(c => c.name).join(', ') + '.' : ''}${died.length ? ' LOST: ' + died.map(c => c.name).join(', ') + '.' : ''}`, ok ? 'good' : 'bad');
  if (ok) Sim.goal('quest1');
  G.pendingEvents.push({ kind: 'report', q, ok, great, disaster, gold, renown, hurt: hurt.map(c => c.name), died: died.map(c => c.name), log: A2.log, party: ms.map(c => c.name), chance });
  if (q.boss && ok) { G.won = true; Sim.goal('wyrm'); G.pendingEvents.push({ kind: 'victory' }); }
};
Sim.kill = (c, why) => {
  G.chars = G.chars.filter(o => o !== c);
  Sim.releaseBed(c);
  G.dead.push({ name: c.full, cls: c.cls, lvl: c.lvl, why, t: G.t, quests: c.wins });
  for (const o of G.chars) {
    const r = Sim.rel(o.id, c.id);
    if (r >= 35) { Sim.moodlet(o, 'grief' + c.id, `Grieving for ${c.name}`, r >= 65 ? -35 : -22, 1440 * 7); Sim.bio(o, `Lost a dear friend: ${c.name}.`); }
    else Sim.moodlet(o, 'death' + c.id, `${c.name} died`, -8, 1440 * 3);
  }
};
Sim.gainRenown = (n) => {
  G.renown = Math.max(0, G.renown + n);
  const next = DATA.RANKS[Sim.rankIdx() + 1];
  if (next && G.renown >= next.renown) {
    G.rank = next.id;
    Sim.log(`🎖️ The guild has risen to Rank ${next.id} — “${next.title}”!`, 'good');
    G.pendingEvents.push({ kind: 'rank', rank: next });
    Sim.goal('rank' + next.id);
    if (next.id === 'S' && !G.quests.some(q => q.boss)) G.quests.unshift(Sim.bossQuest());
  }
};
Sim.goal = (id) => {
  if (G.goals[id]) return;
  const g = DATA.GOALS.find(x => x.id === id); if (!g) return;
  G.goals[id] = G.t;
  if (g.reward.gold) Sim.money(g.reward.gold, 'other');
  if (g.reward.renown) Sim.gainRenown(g.reward.renown);
  const rw = [g.reward.gold ? `+${g.reward.gold}g` : '', g.reward.renown ? `+${g.reward.renown} renown` : ''].filter(Boolean).join(', ');
  Sim.log(`✅ Goal complete: ${g.text}${rw ? ' (' + rw + ')' : ''}`, 'goal');
};

// ------------------------------------------------------------ recruiting ---
Sim.hire = (app) => {
  const cap = DATA.RANKS[Sim.rankIdx()].roster;
  if (Sim.advs().length >= cap) return `Roster full at rank ${G.rank} (${cap}).`;
  if (G.gold < app.hireCost) return 'Not enough gold';
  Sim.money(-app.hireCost, 'wages');
  G.apps = G.apps.filter(a => a !== app);
  Sim.addChar(app);
  Sim.bio(app, `Joined ${G.name} at level ${app.lvl}.`);
  Sim.log(`🤝 ${app.full} the ${DATA.CLASSES[app.cls].name} has joined the guild!`, 'good');
  for (const o of G.chars) if (o !== app) G.rels[Sim.relKey(o.id, app.id)] = Math.round(Sim.compat(o, app) * 10);
  Sim.goal('recruit');
  return null;
};
Sim.hireStaff = (role) => {
  const n = Sim.staff().filter(s => s.role === role).length;
  if (n >= 2) return 'You have enough of those.';
  const cost = 30;
  if (G.gold < cost) return 'Not enough gold';
  Sim.money(-cost, 'wages');
  const c = Sim.makeStaff(role);
  Sim.addChar(c);
  Sim.bio(c, `Hired as the guild ${DATA.STAFF[role].name.toLowerCase()}.`);
  Sim.log(`🧑‍🍳 Hired ${c.full} as ${DATA.STAFF[role].name}.`, 'good');
  return null;
};
Sim.dismiss = (c) => {
  Sim.log(`${c.full} has been let go.`, 'bad');
  for (const o of G.chars) if (o !== c && Sim.rel(o.id, c.id) >= 35) Sim.moodlet(o, 'fired' + c.id, `${c.name} was dismissed`, -10, 1440 * 2);
  Sim.sendOut(c, true);
};
Sim.refreshApplicants = () => {
  const n = 2 + (Sim.roomsOf('bar').length ? 1 : 0) + (G.opinion > 30 ? 1 : 0);
  const ri = Sim.rankIdx();
  G.apps = [];
  for (let i = 0; i < n; i++) G.apps.push(Sim.makeAdv(Math.max(1, U.ri(1 + ri, 2 + ri * 2))));
};
Sim.gearCost = (c) => Math.round(60 * Math.pow(c.gear + 1, 1.7));
Sim.upgradeGear = (c) => {
  if (!Sim.roomsOf('forge').length) return 'Build a Smithy first.';
  if (c.gear >= 5) return 'Already masterwork.';
  const cost = Sim.gearCost(c);
  if (G.gold < cost) return 'Not enough gold';
  Sim.money(-cost, 'build'); c.gear++;
  Sim.moodlet(c, 'gear', 'Shiny new gear!', 10, 1440 * 2);
  Sim.bio(c, `Received tier ${c.gear} gear from the smithy.`);
  return null;
};
Sim.bonus = (c) => {
  if (G.gold < 20) return 'Not enough gold';
  Sim.money(-20, 'wages'); c.purse += 20;
  c.loyalty = U.clamp(c.loyalty + 8, 0, 100);
  Sim.moodlet(c, 'bonus', 'Got a bonus!', Sim.has(c, 'greedy') ? 16 : 10, 1440 * 2);
  Sim.say(c, '💰', 'For me? Thank you!');
  return null;
};
Sim.payDebt = (amt) => {
  amt = Math.min(amt, G.debt, G.gold);
  if (amt <= 0) return 'Nothing to pay';
  Sim.money(-amt, 'debt'); G.debt -= amt;
  if (G.debt <= 0) { G.debt = 0; Sim.goal('debt'); Sim.log('🎉 The Copperhand debt is paid in full! The guild is truly yours.', 'good'); }
  return null;
};
Sim.debtInstallment = () => Math.min(G.debt, Math.round(150 * (Sim.faction('crown') >= 50 ? 0.75 : 1)));

// -------------------------------------------------------------- weather ----
Sim.rollWeather = () => {
  const s = Sim.season();
  const r = Math.random();
  const table = [[.35, .05, 0], [.12, .08, 0], [.35, .1, 0], [.1, .03, .35]][s]; // rain, storm, snow
  G.weather = r < table[1] ? 'storm' : r < table[1] + table[0] ? 'rain' : r < table[0] + table[1] + table[2] ? 'snow' : 'clear';
  G.season = s;
};

// ------------------------------------------------------------- schedule ----
Sim.hourly = (h) => {
  if (h === 6) {
    Sim.rollWeather();
    const n = 2 + (Sim.roomsOf('desk').length ? 2 : 0);
    Sim.postQuests(n);
    const before = G.quests.length;
    G.quests = G.quests.filter(q => q.expires >= Sim.day());
    if (G.quests.length < before) Sim.log(`${before - G.quests.length} request(s) expired unanswered. Townsfolk grumble.`);
    if (before > G.quests.length) G.opinion = Math.max(-50, G.opinion - (before - G.quests.length));
  }
  if (h === 12 && G.weather === 'clear' && U.chance(0.1)) Sim.log('The sun streams through the broken windows.');
};
Sim.daily = () => {
  const d = Sim.day();
  // wages
  let owed = 0; for (const c of G.chars) owed += c.wage;
  const paid = Math.min(owed, Math.max(0, G.gold));
  Sim.money(-paid, 'wages');
  if (paid < owed) {
    Sim.log(`⚠️ Couldn't make payroll! Short by ${owed - paid}g.`, 'bad');
    for (const c of G.chars) { Sim.moodlet(c, 'unpaid', 'Wasn\'t paid!', -20, 1440 * 2); c.loyalty -= 10; }
  } else for (const c of G.chars) c.purse += c.wage;
  // loyalty & quitting
  for (const c of [...G.chars]) {
    if (c.state === 'away' || c.state === 'quitting') continue;
    // loyalty drifts with mood; only the truly miserable sink low enough to quit
    let dl = (c.mood - 42) / 9 + (Sim.has(c, 'greedy') && c.purse > 40 ? 1 : 0);
    if (dl < 0 && c.mood >= 30) dl = Math.max(dl, Math.min(0, 30 - c.loyalty));
    c.loyalty = U.clamp(c.loyalty + dl, 0, 100);
    if (c.loyalty < 25 && c.loyalty > 10 && U.chance(0.5)) { Sim.log(`😠 ${c.name} is grumbling about leaving the guild.`, 'bad'); Sim.say(c, '😠', 'Why do I even stay here?', 240); }
    if (c.loyalty <= 10 && Sim.home(c)) {
      Sim.log(`🚪 ${c.full} has had enough and quit the guild!`, 'bad');
      Sim.bio(c, 'Quit the guild.');
      for (const o of G.chars) if (o !== c && Sim.rel(o.id, c.id) >= 35) Sim.moodlet(o, 'left' + c.id, `${c.name} left the guild`, -10, 1440 * 3);
      Sim.sendOut(c, true);
    }
  }
  // decay & upkeep
  for (const t of G.map) {
    if (t.t === 'floor' && !t.room) t.cond = Math.max(0, t.cond - 0.25 - t.traffic * 0.002 - (t.puddle > 20 ? 1.5 : 0));
    t.traffic = Math.floor(t.traffic * 0.7);
  }
  for (const r of G.rooms) if (!r.broken) r.cond = Math.max(0, r.cond - 0.4);
  // passive renown
  Sim.gainRenown(Sim.roomsOf('trophy').length + Sim.roomsOf('statue').length * 2 + Math.floor(Math.max(0, G.opinion) / 25));
  // debt
  if (d > 0 && d % DATA.DAYS_PER_SEASON === 0 && G.debt > 0) {
    const due = Sim.debtInstallment();
    if (G.gold >= due) { Sim.money(-due, 'debt'); G.debt -= due; Sim.log(`💸 Paid the Copperhand installment of ${due}g. ${G.debt}g remains.`); if (G.debt <= 0) { G.debt = 0; Sim.goal('debt'); } }
    else {
      G.strikes++;
      Sim.log(`⛔ Missed the Copperhand installment! Strike ${G.strikes}/3.`, 'bad');
      G.pendingEvents.push({ kind: 'strike' });
      if (G.strikes >= 3) { G.lost = true; G.pendingEvents.push({ kind: 'gameover' }); }
    }
  }
  if (d % 7 === 0) Sim.refreshApplicants();
  // random event
  if (d > 1 && U.chance(0.22)) G.pendingEvents.push({ kind: 'random' });
  // ledger history
  G.ledger.push({ d: d - 1, inc: G.today.inc, exp: G.today.exp });
  if (G.ledger.length > 60) G.ledger.shift();
  G.today = { inc: {}, exp: {} };
  Sim.recalcAppeal();
  Sim.snapshot();
  if (typeof Game !== 'undefined') Game.save(true);
};
Sim.snapshot = () => {
  const advs = G.chars;
  const mood = advs.length ? advs.reduce((s, c) => s + c.mood, 0) / advs.length : 0;
  const ap = G.appeal ? G.appeal.reduce((s, v) => s + v, 0) / G.appeal.length : 0;
  G.hist.push({ d: Sim.day(), gold: G.gold, renown: G.renown, mood: Math.round(mood), appeal: Math.round(ap * 10) / 10, n: advs.length });
  if (G.hist.length > 120) G.hist.shift();
};

// ------------------------------------------------------------------ tick ---
Sim.tick = () => {
  if (G.lost) return;
  const dm = DATA.MIN_PER_TICK, pt = G.t;
  G.t += dm;
  if (Math.floor(pt / 60) !== Math.floor(G.t / 60)) Sim.hourly(Sim.hour());
  if (Math.floor(pt / 1440) !== Math.floor(G.t / 1440)) Sim.daily();
  for (const c of [...G.chars]) Sim.updateChar(c, dm);
  Sim.updateVisitors(dm);
  // quests in flight
  for (const a of [...G.active]) {
    const allOut = a.party.every(id => { const c = Sim.char(id); return !c || c.state === 'away'; });
    if (!allOut) continue;
    if (G.t >= a.nextEv && G.t < a.end) { Sim.questEvent(a); a.nextEv = G.t + U.ri(400, 1100); }
    if (G.t >= a.end) { G.active = G.active.filter(x => x !== a); Sim.resolveQuest(a); }
  }
  // visitors
  const h = Sim.hourF();
  if (h >= 9 && h < 23 && G.vis.length < 3 + Sim.rankIdx() * 2) {
    const rate = (0.004 + G.renown / 60000 + (Sim.roomsOf('bar').length ? 0.012 : 0) + Math.max(0, G.opinion) / 8000) * dm;
    if (Sim.roomsOf('board').length && U.chance(rate)) Sim.spawnVisitor();
  }
  // rain into the hall
  if ((G.weather === 'rain' || G.weather === 'storm') && G.t % 10 === 0) {
    for (const t of G.map) if (t.leak) t.puddle = Math.min(100, t.puddle + (G.weather === 'storm' ? 3 : 1.2));
  } else if (G.t % 30 === 0) for (const t of G.map) if (t.puddle > 0) t.puddle = Math.max(0, t.puddle - 0.4);
  if (G.t % 60 === 0) Sim.recalcAppeal();
};
