// ============================================================================
//  SCENES — point-and-click rooms drawn as 320×180 pixel art
// ============================================================================
'use strict';

const Scenes = { cur: 'office', frame: 0 };
const SW = 320, SH = 180;
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
const tint = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

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

// A little person, feet at (x, y)
Scenes.person = (ctx, x, y, a, opts = {}) => {
  const cls = a.cls ? C.CLASSES[a.cls] : null;
  const cloth = opts.cloth || (cls ? cls.color : '#7a6a5a');
  const skin = a.look ? a.look.skin : '#e0ac7e', hair = a.look ? a.look.hair : '#5a3a1a';
  const bob = opts.sit ? 0 : (Math.sin((Scenes.frame + (a.id || 0) * 13) / 18) > 0.85 ? 1 : 0);
  y -= bob;
  px(ctx, x - 4, y, 9, 2, 'rgba(0,0,0,0.25)');
  if (!opts.sit) { px(ctx, x - 3, y - 5, 3, 5, '#3a2a1e'); px(ctx, x + 1, y - 5, 3, 5, '#3a2a1e'); }
  px(ctx, x - 4, y - 13, 9, opts.sit ? 10 : 9, cloth);
  px(ctx, x - 4, y - 13, 9, 1, tint(cloth.length === 7 ? cloth : '#7a6a5a', 30));
  px(ctx, x - 5, y - 12, 1, 6, tint(cloth.length === 7 ? cloth : '#7a6a5a', -25)); px(ctx, x + 5, y - 12, 1, 6, tint(cloth.length === 7 ? cloth : '#7a6a5a', -25));
  px(ctx, x - 3, y - 20, 7, 7, skin);
  px(ctx, x - 3, y - 21, 7, 3, hair);
  if (a.look && a.look.style === 1) { px(ctx, x - 4, y - 20, 1, 5, hair); px(ctx, x + 4, y - 20, 1, 5, hair); }
  if (a.look && a.look.style === 2) px(ctx, x - 1, y - 23, 3, 2, hair);
  px(ctx, x - 1, y - 17, 1, 1, '#111'); px(ctx, x + 2, y - 17, 1, 1, '#111');
  if (a.cls === 'mage') { px(ctx, x - 4, y - 22, 9, 2, cloth); px(ctx, x - 2, y - 25, 5, 3, cloth); px(ctx, x, y - 27, 1, 2, cloth); }
  if (a.cls === 'warrior') { px(ctx, x - 4, y - 22, 9, 3, '#9aa0a8'); px(ctx, x + 6, y - 13, 1, 9, '#c8ccd2'); }
  if (a.cls === 'rogue') { px(ctx, x - 4, y - 22, 9, 3, cloth); px(ctx, x - 4, y - 20, 1, 5, cloth); px(ctx, x + 4, y - 20, 1, 5, cloth); }
  if (a.cls === 'cleric') { px(ctx, x - 3, y - 22, 7, 1, '#d4a52a'); px(ctx, x, y - 11, 1, 4, '#d4a52a'); px(ctx, x - 1, y - 10, 3, 1, '#d4a52a'); }
  if (a.cls === 'ranger') { px(ctx, x - 4, y - 22, 9, 2, '#2f5a2a'); ctx.strokeStyle = '#7a5230'; ctx.beginPath(); ctx.arc(x - 6, y - 9, 5, -1.2, 1.2); ctx.stroke(); }
  if (opts.apron) px(ctx, x - 3, y - 10, 7, 7, '#e8e0d0');
  if (a.status === 'injured') { px(ctx, x - 3, y - 19, 7, 1, '#fff'); }
};

// ------------------------------------------------------------------ office --
Scenes.office = {
  title: 'Your office',
  draw(ctx) {
    const h = S.min / 60;
    // walls
    px(ctx, 0, 0, SW, 120, '#4a3828');
    for (let x = 0; x < SW; x += 12) px(ctx, x, 0, 1, 120, '#3e2e20');
    px(ctx, 0, 0, SW, 8, '#2e2218'); px(ctx, 0, 62, SW, 3, '#2e2218');
    for (let x = 0; x < SW; x += 24) px(ctx, x, 65, 1, 55, '#33261a');
    // window
    const sky = h < 9 ? '#e8c890' : h < 16 ? '#8fc0e0' : h < 18.5 ? '#e89a60' : h < 20 ? '#7a4a6a' : '#1c2440';
    px(ctx, 226, 14, 70, 56, '#2a1c12'); px(ctx, 229, 17, 64, 50, sky);
    if (h >= 19.5) { ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) ctx.fillRect(232 + i * 10, 22 + (i * 7) % 20, 1, 1); }
    else { px(ctx, 229, 52, 64, 15, h < 18.5 ? '#6a8a4a' : '#3a4a3a'); px(ctx, 240, 44, 14, 10, '#7a5a3a'); px(ctx, 238, 40, 18, 5, '#8a3a2a'); px(ctx, 266, 46, 10, 8, '#7a5a3a'); px(ctx, 264, 42, 14, 5, '#8a3a2a'); }
    px(ctx, 260, 17, 2, 50, '#2a1c12'); px(ctx, 229, 40, 64, 2, '#2a1c12');
    if (h < 18) { ctx.fillStyle = 'rgba(255,240,200,0.08)'; ctx.beginPath(); ctx.moveTo(229, 67); ctx.lineTo(293, 67); ctx.lineTo(260, 120); ctx.lineTo(190, 120); ctx.fill(); }
    // bookshelf
    px(ctx, 8, 14, 66, 104, '#2e1e12'); px(ctx, 10, 16, 62, 100, '#3a2616');
    const bc = ['#7a2a2a', '#2a4a7a', '#2a6a3a', '#8a6a2a', '#5a2a6a', '#6a6a6a', '#9a5a2a'];
    for (let row = 0; row < 4; row++) {
      px(ctx, 10, 38 + row * 25, 62, 2, '#2e1e12');
      for (let i = 0, x = 12; x < 68; i++) { const w = 3 + ((i * 7 + row * 3) % 4); px(ctx, x, 20 + row * 25, w, 18 - ((i + row) % 3) * 2, bc[(i + row * 2) % bc.length]); x += w + 1; }
    }
    // door to the hall
    px(ctx, 88, 30, 40, 90, '#2a1c12'); px(ctx, 91, 33, 34, 87, '#6a4424'); px(ctx, 94, 37, 13, 36, '#5a381c'); px(ctx, 109, 37, 13, 36, '#5a381c');
    px(ctx, 94, 78, 13, 36, '#5a381c'); px(ctx, 109, 78, 13, 36, '#5a381c'); px(ctx, 119, 76, 3, 3, '#d8b04a');
    // charter
    px(ctx, 140, 20, 42, 32, '#2a1c12'); px(ctx, 142, 22, 38, 28, '#e8dcbc');
    for (let i = 0; i < 5; i++) px(ctx, 146, 27 + i * 4, 28 - (i % 2) * 6, 1, '#8a7a5a');
    ctx.fillStyle = '#9a2a2a'; ctx.beginPath(); ctx.arc(172, 45, 4, 0, 7); ctx.fill();
    // filing cabinet
    px(ctx, 188, 56, 30, 64, '#5a5a62'); for (let i = 0; i < 3; i++) { px(ctx, 190, 60 + i * 20, 26, 17, '#6e6e78'); px(ctx, 199, 66 + i * 20, 8, 2, '#c8c8d0'); }
    if (S.fac.archive) { px(ctx, 220, 60, 4, 60, '#5a5a62'); }
    // desk
    px(ctx, 0, 118, SW, 62, '#4a2c14'); px(ctx, 0, 118, SW, 4, '#7a4a24'); px(ctx, 0, 122, SW, 1, '#2a1a0a');
    ctx.fillStyle = 'rgba(255,220,160,0.05)'; for (let x = 0; x < SW; x += 40) ctx.fillRect(x, 124, 20, 56);
    // inbox tray with a stack that grows
    const n = S.inbox.filter(d => !d.done).length;
    px(ctx, 14, 112, 58, 22, '#3a2a1a'); px(ctx, 16, 114, 54, 18, '#5a3a20');
    for (let i = 0; i < Math.min(14, n); i++) px(ctx, 19 + (i % 3), 128 - i * 2.2, 48, 3, i % 2 ? '#efe4c8' : '#e2d4b2');
    if (n > 14) { ctx.fillStyle = '#efe4c8'; ctx.save(); ctx.translate(40, 98); ctx.rotate(-0.2); ctx.fillRect(-20, -4, 40, 3); ctx.restore(); }
    // ledger, roster, planner
    px(ctx, 84, 132, 40, 26, '#1e4a2e'); px(ctx, 86, 134, 36, 22, '#2a5a3a'); px(ctx, 100, 140, 10, 8, '#d8b04a');
    px(ctx, 132, 134, 36, 26, '#6a1e1e'); px(ctx, 134, 136, 32, 22, '#7a2a2a'); px(ctx, 144, 142, 12, 2, '#d8b04a'); px(ctx, 144, 146, 12, 2, '#d8b04a');
    px(ctx, 178, 128, 44, 30, '#e8dcbc'); px(ctx, 199, 128, 2, 30, '#b8a888');
    for (let i = 0; i < 5; i++) { px(ctx, 182, 133 + i * 5, 14, 1, '#8a7a5a'); px(ctx, 204, 133 + i * 5, 14, 1, '#8a7a5a'); }
    if (S.inbox.some(d => d.deadline != null && d.deadline <= S.day)) { px(ctx, 214, 128, 6, 8, '#c33'); }
    // mug
    px(ctx, 236, 106, 20, 24, '#d8d0c0'); px(ctx, 256, 111, 5, 12, '#d8d0c0'); px(ctx, 257, 113, 3, 8, '#4a2c14');
    px(ctx, 238, 108, 16, 4, S.sips > 0 ? '#3a2010' : '#c8c0b0');
    if (S.sips > 0 && Scenes.frame % 60 < 40) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; const t = (Scenes.frame % 60) / 6; ctx.fillRect(242, 100 - t, 2, 3); ctx.fillRect(248, 96 - t, 2, 3); }
    // quill, ink, stamp
    px(ctx, 272, 130, 12, 10, '#1a1a2a'); px(ctx, 274, 128, 8, 3, '#2a2a3a'); px(ctx, 279, 106, 2, 24, '#f0f0f0'); px(ctx, 276, 106, 3, 10, '#e0e0e0');
    px(ctx, 294, 126, 14, 6, '#7a1f1f'); px(ctx, 299, 114, 4, 13, '#5a3a20'); px(ctx, 297, 110, 8, 5, '#6a4a2a');
    // lamp glow late in the day
    if (h >= 17) { const g = ctx.createRadialGradient(250, 120, 5, 250, 120, 140); g.addColorStop(0, 'rgba(255,200,120,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH); }
    if (h >= 19) { ctx.fillStyle = 'rgba(10,10,30,0.35)'; ctx.fillRect(0, 0, SW, SH); }
  },
  spots: () => [
    { x: 12, y: 96, w: 64, h: 40, label: () => `Inbox (${S.inbox.filter(d => !d.done).length} unread or unfiled)`, act: () => UI.inbox() },
    { x: 82, y: 130, w: 44, h: 30, label: 'Ledger', act: () => UI.ledger() },
    { x: 130, y: 132, w: 40, h: 30, label: 'Roster book', act: () => UI.roster() },
    { x: 176, y: 126, w: 48, h: 34, label: 'Day planner: deadlines', act: () => UI.planner() },
    { x: 232, y: 98, w: 32, h: 34, label: () => S.sips ? `Sip coffee (${S.sips} left)` : 'Coffee mug (empty)', act: () => UI.sip() },
    { x: 88, y: 30, w: 40, h: 90, label: 'Door: to the main hall', act: () => UI.go('hall') },
    { x: 186, y: 54, w: 34, h: 66, label: 'Filing cabinet: archive', act: () => UI.archive() },
    { x: 8, y: 14, w: 66, h: 80, label: 'Bookshelf: guild handbook and council rules', act: () => UI.rules() },
    { x: 138, y: 18, w: 46, h: 36, label: 'Guild charter', act: () => UI.charter() },
    { x: 226, y: 14, w: 70, h: 56, label: 'Window', act: () => UI.window() },
  ],
};

// -------------------------------------------------------------------- hall --
Scenes.hall = {
  title: 'Main hall',
  draw(ctx) {
    px(ctx, 0, 0, SW, 110, '#5a4a3a');
    for (let y = 0; y < 110; y += 10) for (let x = (y / 10) % 2 ? 0 : 12; x < SW; x += 24) px(ctx, x, y, 1, 10, '#4a3a2c');
    for (let y = 10; y < 110; y += 10) px(ctx, 0, y, SW, 1, '#4a3a2c');
    px(ctx, 0, 110, SW, 70, '#6a4a2c');
    for (let y = 114; y < SH; y += 8) px(ctx, 0, y, SW, 1, '#5a3c22');
    // quest board
    px(ctx, 36, 22, 86, 62, '#3a2614'); px(ctx, 39, 25, 80, 56, '#b8925a');
    const posts = S.board.slice(0, 10);
    posts.forEach((p, i) => {
      const x = 43 + (i % 5) * 15, y = 29 + Math.floor(i / 5) * 25;
      px(ctx, x, y, 12, 18, p.status === 'claimed' ? '#d8ccb0' : '#f2ead6');
      for (let k = 0; k < 4; k++) px(ctx, x + 2, y + 4 + k * 3, 8, 1, '#8a7a5a');
      px(ctx, x + 5, y, 2, 2, '#a33');
      if (p.status === 'claimed') px(ctx, x + 2, y + 12, 8, 4, '#2a6a3a');
    });
    px(ctx, 44, 84, 4, 26, '#3a2614'); px(ctx, 110, 84, 4, 26, '#3a2614');
    // stairs up to the inn
    for (let i = 0; i < 8; i++) px(ctx, 132 + i * 3, 104 - i * 10, 24, 10, i % 2 ? '#5a3a20' : '#6a4424');
    px(ctx, 130, 20, 2, 90, '#3a2614');
    // archway to the yard
    px(ctx, 168, 30, 34, 80, '#2a1c12'); px(ctx, 171, 33, 28, 77, '#9ac8e0'); px(ctx, 171, 85, 28, 25, '#6a8a4a');
    px(ctx, 180, 70, 3, 20, '#7a5a3a'); px(ctx, 176, 66, 11, 6, '#d9c27a');
    // academy door
    px(ctx, 214, 28, 32, 58, '#2a1c12'); px(ctx, 217, 31, 26, 55, S.fac.academy ? '#3a3a6a' : '#5a381c');
    if (!S.fac.academy) { px(ctx, 214, 44, 32, 4, '#8a6a44'); px(ctx, 214, 64, 32, 4, '#8a6a44'); }
    else { ctx.fillStyle = 'rgba(160,140,255,0.6)'; ctx.beginPath(); ctx.arc(230, 40, 4, 0, 7); ctx.fill(); }
    // reception counter
    px(ctx, 250, 82, 66, 30, '#5a3418'); px(ctx, 250, 80, 66, 4, '#8a5a2a');
    if (S.staff.clerk) Scenes.person(ctx, 284, 82, { id: 99, look: { skin: '#e0ac7e', hair: '#222', style: 2 } }, { cloth: '#3a4a6a' });
    px(ctx, 300, 75, 6, 5, '#d8b04a'); px(ctx, 302, 73, 2, 2, '#d8b04a');
    // tavern door at right edge
    px(ctx, 300, 20, 20, 56, '#2a1c12'); px(ctx, 302, 23, 18, 53, '#7a4a24');
    px(ctx, 288, 14, 30, 8, '#3a2614'); px(ctx, 290, 15, 26, 6, '#d8b04a');
    // office door at left edge
    px(ctx, 0, 30, 22, 80, '#2a1c12'); px(ctx, 0, 33, 19, 77, '#6a4424'); px(ctx, 14, 70, 3, 3, '#d8b04a');
    // benches and idle members
    px(ctx, 40, 140, 80, 6, '#5a3418'); px(ctx, 44, 146, 4, 8, '#3a2210'); px(ctx, 112, 146, 4, 8, '#3a2210');
    const w = Scenes.whereabouts().hall;
    Scenes.hallSpots = w.slice(0, 5).map((a, i) => ({ a, x: 54 + i * 44 + (i > 1 ? 60 : 0), y: i < 2 ? 140 : 160 }));
    for (const s of Scenes.hallSpots) Scenes.person(ctx, s.x, s.y, s.a, { sit: s.y === 140 });
  },
  spots: () => [
    { x: 36, y: 22, w: 86, h: 62, label: () => `Quest board (${S.board.length} posted)`, act: () => UI.board() },
    { x: 250, y: 70, w: 50, h: 42, label: 'Reception desk: hiring notices', act: () => UI.reception() },
    { x: 0, y: 30, w: 22, h: 80, label: 'Door: back to your office', act: () => UI.go('office') },
    { x: 300, y: 14, w: 20, h: 62, label: 'Door: the tavern', act: () => UI.go('tavern') },
    { x: 168, y: 30, w: 34, h: 80, label: 'Archway: training yard', act: () => UI.go('yard') },
    { x: 130, y: 24, w: 30, h: 86, label: 'Stairs: the inn', act: () => UI.go('inn') },
    { x: 214, y: 28, w: 32, h: 58, label: () => S.fac.academy ? 'The Academy' : 'A boarded-up door', act: () => S.fac.academy ? UI.go('academy') : UI.say('The old lecture hall. Boarded up since Hela\'s day. The builders could reopen it, with the Council\'s blessing and enough gold.') },
    ...(Scenes.hallSpots || []).map(s => ({ x: s.x - 7, y: s.y - 26, w: 15, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// ------------------------------------------------------------------ tavern --
Scenes.tavern = {
  title: 'The tavern', fac: 'tavern',
  draw(ctx) {
    px(ctx, 0, 0, SW, 112, '#4a2e1c'); for (let x = 0; x < SW; x += 16) px(ctx, x, 0, 1, 112, '#3a2214');
    px(ctx, 0, 112, SW, 68, '#5a3a20'); for (let y = 116; y < SH; y += 8) px(ctx, 0, y, SW, 1, '#4a2e18');
    // fireplace
    px(ctx, 12, 40, 56, 72, '#6a6a70'); px(ctx, 20, 64, 40, 48, '#1a1210');
    const f = Math.sin(Scenes.frame / 6) * 2;
    px(ctx, 28, 96 + f, 24, 14, '#e0502a'); px(ctx, 33, 90 - f, 14, 12, '#f08c2a'); px(ctx, 37, 86 + f, 6, 8, '#ffe066');
    px(ctx, 8, 36, 64, 6, '#5a5a62');
    // chalkboard
    px(ctx, 92, 24, 48, 34, '#5a3a20'); px(ctx, 95, 27, 42, 28, '#2a3a2a');
    ctx.fillStyle = '#e8e8d8'; ctx.font = '6px monospace'; ctx.fillText('ALE', 99, 36); ctx.fillText({ cheap: '1g', fair: '2g', steep: '3g' }[S.alePrice], 120, 36); ctx.fillText('STEW 2g', 99, 47);
    // shelves & bottles
    px(ctx, 168, 22, 140, 4, '#3a2214'); px(ctx, 168, 46, 140, 4, '#3a2214');
    const bc = ['#3a6a3a', '#6a2a2a', '#8a6a2a', '#2a4a6a'];
    for (let i = 0; i < 18; i++) { px(ctx, 172 + i * 7, 12, 4, 10, bc[i % 4]); px(ctx, 173 + i * 7, 9, 2, 3, bc[i % 4]); }
    for (let i = 0; i < 6; i++) { px(ctx, 174 + i * 22, 30, 16, 16, '#6a4424'); px(ctx, 174 + i * 22, 36, 16, 2, '#3a2214'); }
    // barkeep and bar
    if (S.staff.barkeep) Scenes.person(ctx, 240, 94, { id: 98, look: { skin: '#c68642', hair: '#5a3a1a', style: 0 } }, { cloth: '#7a3a2a', apron: true });
    px(ctx, 160, 92, 156, 26, '#5a3216'); px(ctx, 160, 89, 156, 5, '#8b5a2b');
    for (let i = 0; i < 4; i++) { px(ctx, 180 + i * 34, 82, 6, 7, '#d8b04a'); px(ctx, 180 + i * 34, 82, 6, 2, '#fff'); }
    // tables
    for (const [tx, ty] of [[40, 146], [110, 156]]) { px(ctx, tx, ty, 40, 6, '#6a4424'); px(ctx, tx + 4, ty + 6, 4, 10, '#3a2214'); px(ctx, tx + 32, ty + 6, 4, 10, '#3a2214'); px(ctx, tx + 16, ty - 4, 5, 5, '#d8b04a'); }
    if (S.fac.tavern >= 2) { px(ctx, 210, 150, 40, 6, '#6a4424'); px(ctx, 214, 156, 4, 10, '#3a2214'); px(ctx, 242, 156, 4, 10, '#3a2214'); }
    const w = Scenes.whereabouts().tavern;
    const seats = [[36, 150], [86, 150], [106, 168], [156, 168], [206, 154], [256, 154]];
    Scenes.tavSpots = w.slice(0, seats.length).map((a, i) => ({ a, x: seats[i][0], y: seats[i][1] }));
    for (const s of Scenes.tavSpots) Scenes.person(ctx, s.x, s.y, s.a, { sit: true });
    // door back
    px(ctx, 0, 40, 20, 72, '#2a1c12'); px(ctx, 0, 43, 17, 69, '#6a4424');
    const g = ctx.createRadialGradient(40, 90, 4, 40, 90, 120); g.addColorStop(0, 'rgba(255,150,60,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
  },
  spots: () => [
    { x: 160, y: 60, w: 156, h: 56, label: S.staff.barkeep ? `The bar: talk to ${S.staff.barkeep.name}, refill coffee` : 'The bar: refill coffee', act: () => UI.bar() },
    { x: 92, y: 24, w: 48, h: 34, label: 'Price board: set the price of ale', act: () => UI.prices() },
    { x: 0, y: 40, w: 20, h: 72, label: 'Door: back to the hall', act: () => UI.go('hall') },
    ...(Scenes.tavSpots || []).map(s => ({ x: s.x - 7, y: s.y - 26, w: 15, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// -------------------------------------------------------------------- yard --
Scenes.yard = {
  title: 'Training yard', fac: 'yard',
  draw(ctx) {
    const h = S.min / 60;
    px(ctx, 0, 0, SW, 80, h < 17 ? '#8fc0e0' : '#e89a60');
    px(ctx, 0, 52, SW, 28, '#6a8a5a'); px(ctx, 40, 44, 60, 10, '#5a7a4a'); px(ctx, 200, 40, 80, 14, '#5a7a4a');
    px(ctx, 0, 80, SW, 100, '#9a7a4a'); for (let i = 0; i < 40; i++) px(ctx, (i * 53) % SW, 84 + (i * 29) % 90, 3, 1, '#8a6a3a');
    for (let x = 0; x < SW; x += 16) { px(ctx, x, 66, 3, 18, '#6a4a2a'); } px(ctx, 0, 70, SW, 2, '#6a4a2a'); px(ctx, 0, 77, SW, 2, '#6a4a2a');
    // dummies
    for (const dx of [60, 100, ...(S.fac.yard >= 2 ? [140] : [])]) { px(ctx, dx, 98, 3, 30, '#5a3a20'); px(ctx, dx - 7, 104, 17, 3, '#5a3a20'); px(ctx, dx - 5, 98, 13, 16, '#d9c27a'); px(ctx, dx - 3, 90, 9, 9, '#d9c27a'); }
    if (S.fac.yard >= 2) for (const tx of [230, 270]) { ctx.fillStyle = '#d9c27a'; ctx.fillRect(tx - 10, 88, 20, 24); ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(tx, 100, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, 100, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(tx, 100, 2, 0, 7); ctx.fill(); }
    if (S.fac.yard >= 3) { ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2; ctx.strokeRect(150, 130, 70, 36); ctx.lineWidth = 1; }
    if (S.staff.trainer) Scenes.person(ctx, 196, 120, { id: 97, look: { skin: '#8d5524', hair: '#222', style: 0 } }, { cloth: '#6a2a2a' });
    // notice board
    px(ctx, 18, 100, 26, 22, '#5a3a20'); px(ctx, 20, 102, 22, 16, '#e8dcbc'); px(ctx, 28, 122, 3, 16, '#5a3a20');
    const w = Scenes.whereabouts().yard;
    const spots = [[80, 140], [120, 150], [170, 160], [250, 140], [290, 160], [60, 168]];
    Scenes.yardSpots = w.slice(0, spots.length).map((a, i) => ({ a, x: spots[i][0], y: spots[i][1] }));
    for (const s of Scenes.yardSpots) Scenes.person(ctx, s.x, s.y, s.a);
    // gate back
    px(ctx, 296, 82, 24, 50, '#2a1c12'); px(ctx, 298, 85, 22, 47, '#6a4424');
  },
  spots: () => [
    { x: 14, y: 98, w: 34, h: 42, label: 'Training roster: schedule sessions', act: () => UI.trainForm('yard') },
    { x: 296, y: 82, w: 24, h: 50, label: 'Gate: back to the hall', act: () => UI.go('hall') },
    ...(S.staff.trainer ? [{ x: 188, y: 92, w: 16, h: 30, label: `Talk to ${S.staff.trainer.name}`, act: () => UI.say(`"Give me a week with any of them and I'll make them worth twice the coin." ${S.staff.trainer.name} cracks their knuckles.`) }] : []),
    ...(Scenes.yardSpots || []).map(s => ({ x: s.x - 7, y: s.y - 26, w: 15, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// --------------------------------------------------------------------- inn --
Scenes.inn = {
  title: 'The inn', fac: 'inn',
  draw(ctx) {
    px(ctx, 0, 0, SW, 120, '#6a5a48'); for (let x = 0; x < SW; x += 8) px(ctx, x, 0, 1, 120, '#5e4e3e');
    px(ctx, 0, 120, SW, 60, '#5a3a20');
    // corridor runner
    px(ctx, 0, 140, SW, 20, '#7a2a2a'); px(ctx, 0, 144, SW, 1, '#d8b04a'); px(ctx, 0, 155, SW, 1, '#d8b04a');
    const beds = Core.capacity();
    const doors = Math.min(7, Math.ceil(beds / 2));
    for (let i = 0; i < doors; i++) {
      const x = 30 + i * 40;
      px(ctx, x, 50, 26, 70, '#2a1c12'); px(ctx, x + 2, 53, 22, 67, '#7a4a24');
      ctx.fillStyle = '#d8b04a'; ctx.font = '6px monospace'; ctx.fillText(String(i + 1), x + 11, 62);
    }
    if (S.fac.infirmary) { const x = 30 + doors * 40; px(ctx, x, 50, 30, 70, '#2a1c12'); px(ctx, x + 2, 53, 26, 67, '#e8e8e0'); px(ctx, x + 12, 70, 6, 18, '#c33'); px(ctx, x + 6, 76, 18, 6, '#c33'); }
    if (S.staff.innkeeper) Scenes.person(ctx, 290, 140, { id: 96, look: { skin: '#f1c9a5', hair: '#a0522d', style: 1 } }, { cloth: '#4a6a4a', apron: true });
    const w = Scenes.whereabouts().inn;
    Scenes.innSpots = w.slice(0, 5).map((a, i) => ({ a, x: 50 + i * 50, y: 170 }));
    for (const s of Scenes.innSpots) Scenes.person(ctx, s.x, s.y, s.a);
    px(ctx, 0, 0, 24, 120, '#5a4a38'); for (let i = 0; i < 6; i++) px(ctx, 2, 110 - i * 18, 20, 4, '#4a3a28');
  },
  spots: () => [
    { x: 24, y: 48, w: 280, h: 74, label: () => `Rooms: ${S.roster.length} of ${Core.capacity()} beds taken`, act: () => UI.innRooms() },
    { x: 0, y: 0, w: 24, h: 120, label: 'Stairs: back down to the hall', act: () => UI.go('hall') },
    ...(Scenes.innSpots || []).map(s => ({ x: s.x - 7, y: s.y - 26, w: 15, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};

// ----------------------------------------------------------------- academy --
Scenes.academy = {
  title: 'The Academy of Mind and Arcana', fac: 'academy',
  draw(ctx) {
    px(ctx, 0, 0, SW, 130, '#2e2a44'); for (let x = 0; x < SW; x += 20) px(ctx, x, 0, 2, 130, '#24203a');
    px(ctx, 0, 130, SW, 50, '#3a2a20');
    const bc = ['#7a2a2a', '#2a4a7a', '#2a6a3a', '#8a6a2a', '#5a2a6a'];
    for (const sx of [10, 250]) { px(ctx, sx, 20, 60, 110, '#1e1a2e'); for (let r = 0; r < 5; r++) for (let i = 0; i < 9; i++) px(ctx, sx + 4 + i * 6, 24 + r * 21, 5, 17, bc[(i + r) % 5]); }
    px(ctx, 140, 90, 40, 40, '#4a3a2a'); px(ctx, 136, 86, 48, 6, '#6a5a3a');
    const g = 0.5 + Math.sin(Scenes.frame / 20) * 0.3;
    ctx.fillStyle = `rgba(160,140,255,${g})`; ctx.beginPath(); ctx.arc(160, 70, 12, 0, 7); ctx.fill();
    if (S.staff.dean) Scenes.person(ctx, 200, 150, { id: 95, cls: 'mage', look: { skin: '#f1c9a5', hair: '#e8e0c8', style: 0 } });
    const w = Scenes.whereabouts().academy;
    Scenes.acSpots = w.slice(0, 5).map((a, i) => ({ a, x: 90 + i * 30, y: 168 }));
    for (const s of Scenes.acSpots) Scenes.person(ctx, s.x, s.y, s.a);
    px(ctx, 296, 120, 24, 60, '#2a1c12'); px(ctx, 298, 123, 22, 57, '#5a381c');
  },
  spots: () => [
    { x: 128, y: 50, w: 64, h: 84, label: 'Lectern: enrol members in courses', act: () => UI.trainForm('academy') },
    { x: 296, y: 120, w: 24, h: 60, label: 'Door: back to the hall', act: () => UI.go('hall') },
    ...(Scenes.acSpots || []).map(s => ({ x: s.x - 7, y: s.y - 26, w: 15, h: 28, label: `Talk to ${s.a.name}`, act: () => UI.talk(s.a) })),
  ],
};
