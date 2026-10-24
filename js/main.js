// ============================================================================
//  MAIN — boot, game loop, save/load
// ============================================================================
'use strict';

const Game = { speed: 1, lastSpeed: 1, acc: 0, lastT: 0, lastUI: 0, TICK_MS: 100, MULT: [0, 1, 3, 6], KEY: 'guildhall_save_v1' };

Game.setSpeed = (s) => {
  Game.speed = s; if (s) Game.lastSpeed = s;
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.s === s));
  document.body.classList.toggle('paused', !s);
};
Game.save = (quiet) => {
  try { localStorage.setItem(Game.KEY, JSON.stringify(G)); if (!quiet) Sim.log('Game saved.'); return true; }
  catch (e) { if (!quiet) UI.toast('Could not save in this browser.', 'bad'); return false; }
};
Game.hasSave = () => { try { return !!localStorage.getItem(Game.KEY); } catch (e) { return false; } };
Game.load = () => {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(Game.KEY)); } catch (e) { data = null; }
  if (!data || !data.map) return false;
  G = data;
  // live references (claims, paths, actions) don't survive serialisation — reset them
  for (const t of G.map) t.claim = null;
  for (const r of G.rooms) r.claim = null;
  G.vis = [];
  for (const c of [...G.chars]) {
    c.act = null; c.pose = null;
    if (c.state === 'leaving') c.state = G.active.some(a => a.party.includes(c.id)) ? 'away' : 'home';
    if (c.state === 'returning') c.state = 'home';
    if (c.state === 'quitting') { G.chars = G.chars.filter(o => o !== c); continue; }
    if (c.state === 'home' && !Sim.walkable(Math.round(c.x), Math.round(c.y))) { c.x = G.door.x; c.y = G.door.y - 1; }
    c.ox = c.x; c.oy = c.y;
  }
  Sim.recalcAppeal();
  return true;
};
Game.start = () => {
  UI.closeModal();
  Game.setSpeed(1);
  UI.renderTop(); UI.renderPanel(true); UI.closeInspector();
  $('#ticker').innerHTML = '';
};
Game.newGamePrompt = () => {
  UI.modal(`<h2 class="title">The Rusty Flagon</h2>
    <p>Your great-aunt Hela left you the deed to an adventurers' guild. Once, it was the pride of Millbrook. Now the roof leaks, rubble is piled to the rafters, and the Copperhand Consortium says you owe them <b>1,500 gold</b>.</p>
    <p>Two adventurers never got the memo that everyone left: <b>Brom</b>, an old dwarf warrior who should have retired years ago, and <b>Pip</b>, a halfling rogue who came for the free roof.</p>
    <p>Clear the rubble. Fix the board. Feed your people. Take whatever work the town offers. Turn this ruin into the greatest guild in the realm.</p>
    <label class="field" for="gname">Name your guild <input id="gname" maxlength="28" value="The Rusty Flagon"></label>`,
    [{ label: '⚔️ Take the keys', fn: () => {
      const name = ($('#gname').value || '').trim() || 'The Rusty Flagon';
      Sim.newGame(name);
      Game.start();
      Sim.log(`You push open the creaking doors of ${name}. Dust everywhere.`, 'lore');
      setTimeout(() => UI.toast('Tip: click the broken Quest Board, then order repairs.'), 1200);
    } }], { wide: true });
};
Game.loop = (ts) => {
  const dt = Math.min(250, ts - (Game.lastT || ts)); Game.lastT = ts;
  if (G && !UI.modalOpen && Game.speed && !G.lost) {
    Game.acc += dt * Game.MULT[Game.speed];
    let n = 0;
    while (Game.acc >= Game.TICK_MS && n < 40) { Sim.tick(); Game.acc -= Game.TICK_MS; n++; }
    if (n >= 40) Game.acc = 0;
  }
  if (G) {
    const alpha = Game.speed && !UI.modalOpen ? Math.min(1, Game.acc / Game.TICK_MS) : 1;
    Render.draw(alpha);
    if (ts - Game.lastUI > 300) {
      Game.lastUI = ts;
      UI.renderTop(); UI.renderPanel(); UI.renderInspector(); UI.renderHint();
      if (UI.tab === 'build') UI.drawBuildIcons();
      UI.processEvents();
    }
  }
  requestAnimationFrame(Game.loop);
};

UI.renderHint = () => {
  const el = $('#hint');
  const next = DATA.GOALS.filter(g => !G.goals[g.id]).slice(0, 2);
  const tips = {
    rubble3: 'Build → ⛏️ Clear rubble, then click rubble piles.',
    board: 'Click the broken Quest Board in the hall → Repair.',
    hearth: 'Click the cold hearth (top-left) → Repair.',
    quest1: 'Quests tab → pick a request → Assemble party.',
    recruit: 'Roster tab → hire an applicant.',
    friends: 'Friendships grow over meals, chats and quests.',
    rankE: 'Earn renown from quests.',
    bar: 'Build → Leisure → Tavern Bar.',
    roof: 'Build → 🪜 Patch roof on dripping tiles.',
  };
  const html = next.map(g => `<div>⬜ ${g.text}${tips[g.id] ? `<span class="mut"> · ${tips[g.id]}</span>` : ''}</div>`).join('');
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
};

window.addEventListener('load', () => {
  Render.init($('#cv'));
  UI.init();
  window.addEventListener('resize', () => Render.resize());
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => Render.resize()).observe($('#viewport'));
  if (Game.hasSave() && Game.load()) {
    Game.start();
    UI.modal(`<h2 class="title">${esc(G.name)}</h2><p>Welcome back, guildmaster. It is ${Sim.dateStr()}.</p>`, [
      { label: 'Continue' }, { label: 'New game', cls: 'ghost', fn: () => { Game.newGamePrompt(); return true; } }]);
  } else {
    Sim.newGame('The Rusty Flagon');  // a world to show behind the intro
    Game.start();
    Game.newGamePrompt();
  }
  requestAnimationFrame(Game.loop);
});
