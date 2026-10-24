// ============================================================================
//  MAIN — boot, save and load
// ============================================================================
'use strict';

const Main = { KEY: 'guildhall_desk_v1' };
Main.save = () => { try { localStorage.setItem(Main.KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: play on without saving */ } };
Main.load = () => {
  try { const d = JSON.parse(localStorage.getItem(Main.KEY)); if (d && d.v === 1 && d.roster) { S = d; return true; } } catch (e) { /* ignore */ }
  return false;
};
Main.newGame = () => {
  $('#night').innerHTML = `<div class="nightbox title">
    <h1>The Guildmaster's Desk</h1>
    <p>Great-aunt Hela left you the Rusty Flagon Adventurers' Guild: four members, a leaking inn, a tavern that mostly sells to its own staff, and a desk.</p>
    <p>You won't swing a sword. You'll read letters, fill in forms, post jobs to the board and live with the consequences. Your members pick their own work each night from what you post. If you post a job at the wrong rank, the wrong people will take it.</p>
    <p>Your day runs from eight in the morning to six at night. Everything takes time. Coffee helps.</p>
    <label for="gname">Name your guild</label><input id="gname" maxlength="28" value="The Rusty Flagon">
    <div class="acts"><button class="stamp green" id="begin">Sit down at the desk</button></div></div>`;
  $('#night').classList.add('open');
  $('#begin').onclick = () => {
    Core.newGame(($('#gname').value || '').trim() || 'The Rusty Flagon');
    $('#night').classList.remove('open');
    Main.save();
    UI.go('office');
    setTimeout(() => UI.toast('Start with the inbox on the left of your desk.'), 500);
  };
};
window.addEventListener('load', () => {
  Scenes.loadArt();
  if (!Main.load()) { Core.newGame('The Rusty Flagon'); UI.init(); Main.newGame(); }
  else UI.init();
  Scenes.loop();
});
