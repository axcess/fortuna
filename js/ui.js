// ============================================================================
//  UI — the desk: documents, forms, books, conversations
// ============================================================================
'use strict';

const UI = { fns: {}, n: 0, stack: [], panelFn: null };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Buttons carry closures through a registry that is reset on every render.
UI.btn = (label, fn, cls = '', attrs = '') => { const id = ++UI.n; UI.fns[id] = fn; return `<button class="${cls}" data-fn="${id}" ${attrs}>${label}</button>`; };
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fn]'); if (!b || b.disabled) return;
  const fn = UI.fns[b.dataset.fn]; if (!fn) return;
  let x = e.clientX, y = e.clientY;
  if (!x && !y) { const r = b.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }   // keyboard activation
  const before = UI.snap();
  fn(e, b);
  UI.diffFloats(before, UI.snap(), x, y - 12);
});

// ---------------------------------------------------------- floating text --
// Every action pops up what it cost or earned, right where you clicked.
UI.snap = () => S ? { day: S.day, min: S.min, gold: S.gold, renown: S.renown, focus: Math.round(S.focus) } : null;
UI.diffFloats = (a, b, x, y) => {
  if (!a || !b || a.day !== b.day) return;
  const out = [];
  if (b.min > a.min) out.push([`−${b.min - a.min} min`, 'time']);
  if (b.gold !== a.gold) out.push([`${b.gold > a.gold ? '+' : '−'}${Math.abs(b.gold - a.gold)}g`, b.gold > a.gold ? 'gain' : 'loss']);
  if (b.renown !== a.renown) out.push([`★ ${b.renown > a.renown ? '+' : '−'}${Math.abs(b.renown - a.renown)}`, b.renown > a.renown ? 'renown' : 'loss']);
  if (b.focus - a.focus >= 5) out.push([`Focus +${b.focus - a.focus}`, 'focus']);
  out.forEach(([t, k], i) => UI.float(t, x, y - i * 20, k, i * 110));
};
UI.float = (text, x, y, kind = '', delay = 0) => {
  const el = document.createElement('div');
  el.className = 'float ' + kind; el.textContent = text;
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.animationDelay = delay + 'ms';
  $('#floats').appendChild(el);
  setTimeout(() => el.remove(), 1700 + delay);
};
UI.sceneToClient = (sx, sy) => { const r = $('#frame').getBoundingClientRect(); return [r.left + sx / SW * r.width, r.top + sy / SH * r.height]; };

// People in a room occasionally say something about how they're doing.
UI.SPOTS = { hall: 'hallSpots', tavern: 'tavSpots', yard: 'yardSpots', inn: 'innSpots', academy: 'acSpots' };
UI.ambient = () => {
  if (!S || $('#veil').classList.contains('open') || $('#night').classList.contains('open') || $('#talk').classList.contains('open')) return;
  const spots = Scenes[UI.SPOTS[Scenes.cur]];
  const layer = $('#bubbles');
  if (!spots || !spots.length || layer.children.length >= 2 || Math.random() < 0.3) return;
  const s = U.pick(spots);
  if ([...layer.children].some(c => c.dataset.who == s.a.id)) return;
  const el = document.createElement('div');
  el.className = 'bubble'; el.dataset.who = s.a.id; el.textContent = Core.bark(s.a);
  el.style.left = (s.x / SW * 100) + '%'; el.style.top = ((s.y - (s.sit ? 25 : 29)) / SH * 100) + '%';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3300);
};
setInterval(UI.ambient, 1800);

// ------------------------------------------------------------------ frame --
UI.init = () => {
  const cv = $('#scene'); Scenes.ctx = cv.getContext('2d'); cv.width = SW * RES; cv.height = SH * RES;
  $('#clockout').onclick = () => UI.clockOut();
  $('#menu').onclick = () => UI.menu();
  window.addEventListener('keydown', (e) => { if ((e.key === 'l' || e.key === 'L') && !/INPUT|TEXTAREA/.test(e.target.tagName) && !$('#night').classList.contains('open')) UI.toggleLabels(); if (e.key === 'Escape') { if ($('#talk').classList.contains('open')) UI.closeTalk(); else UI.close(); } });
  UI.go('office');
};
UI.top = () => {
  $('#gname').textContent = S.name;
  $('#date').textContent = Core.dateStr();
  $('#clock').textContent = Core.clock();
  $('#dayprog').style.width = U.clamp((S.min - 480) / 600 * 100, 0, 100) + '%';
  $('#dayprog').classList.toggle('late', S.min >= 1080);
  $('#focusbar').style.width = S.focus + '%';
  $('#focusbar').className = S.focus < 35 ? 'crit' : S.focus < 60 ? 'low' : '';
  $('#sips').textContent = '●'.repeat(S.sips) + '○'.repeat(3 - S.sips);
  $('#gold').textContent = S.gold;
  $('#gold').classList.toggle('neg', S.gold < 0);
  const gr = Core.guildRank(), nx = C.GUILD_RANKS[gr + 1];
  $('#rank').textContent = C.GUILD_RANKS[gr].id;
  $('#renown').textContent = S.renown + (nx ? '/' + nx.renown : '');
  $('#unread').textContent = S.inbox.filter(d => !d.done).length;
  document.body.classList.toggle('tired', S.focus < 35);
};
UI.refresh = () => {
  UI.top();
  UI.hotspots();
  if (S.min >= 22 * 60 && !UI.nightShown) { UI.toast('It is ten at night. You fall asleep at your desk.', 'bad'); setTimeout(() => UI.clockOut(true), 600); }
};
UI.toast = (msg, kind = '') => {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3600);
};

// ------------------------------------------------------------------ scenes -
UI.go = (scene) => {
  if (scene !== Scenes.cur && Scenes.cur) Core.spend(Core.COST.walk);
  Scenes.cur = scene; UI.close(); UI.closeTalk();
  $('#bubbles').innerHTML = '';
  $('#labels').classList.toggle('all', UI.labelsOn);
  UI.flashLabels();
  const sc = Scenes[scene];
  $('#where').textContent = sc.title;
  UI.refresh();
};
UI.hotspots = () => {
  const sc = Scenes[Scenes.cur];
  sc.draw(Scenes.ctx);   // also recomputes where people stand
  const lay = $('#spots');
  if (UI.n % 500 < 20) for (const k of Object.keys(UI.fns)) if (+k < UI.n - 1500) delete UI.fns[k];   // forget stale buttons
  let html = '', tags = '';
  sc.spots().forEach((s, i) => {
    const label = typeof s.label === 'function' ? s.label() : s.label;
    const [tag, kind] = UI.tagFor(label);
    html += UI.btn('', s.act, 'spot', `style="left:${s.x / SW * 100}%;top:${s.y / SH * 100}%;width:${s.w / SW * 100}%;height:${s.h / SH * 100}%" aria-label="${esc(label)}" data-label="${esc(label)}" data-i="${i}"`);
    // the tag floats above the spot, or just inside it when the spot touches the top edge
    const cx = (s.x + s.w / 2) / SW * 100, below = s.y < 16;
    const ty = (below ? s.y + 2 : s.y) / SH * 100;   // near the top edge: hang just inside the spot
    const edge = cx < 9 ? ' left' : cx > 91 ? ' right' : '';
    if (!s.noTag) tags += `<span class="tag ${kind}${below ? ' below' : ''}${edge}" data-i="${i}" style="left:${cx}%;top:${ty}%">${esc(tag)}</span>`;
  });
  lay.innerHTML = html;
  $('#labels').innerHTML = tags;
  lay.querySelectorAll('.spot').forEach(b => {
    const t = $(`#labels .tag[data-i="${b.dataset.i}"]`);
    b.onmouseenter = b.onfocus = () => { $('#caption').textContent = b.dataset.label; t && t.classList.add('show'); };
    b.onmouseleave = b.onblur = () => { $('#caption').textContent = UI.defaultCaption(); t && t.classList.remove('show'); };
  });
  $('#caption').textContent = UI.defaultCaption();
  const fac = sc.fac;
  $('#facinfo').innerHTML = (fac ? `${{ tavern: 'Tavern', inn: 'Inn', yard: 'Training yard', academy: 'Academy' }[fac]} · level ${S.fac[fac]} ${UI.btn('Commission works', () => UI.works(fac), 'mini')}` : '') +
    UI.btn(`Labels: ${UI.labelsOn ? 'on' : 'off'}`, () => UI.toggleLabels(), 'mini', `aria-pressed="${!!UI.labelsOn}" title="Show the names of everything you can click (L)"`);
};
// Short tag text for a hotspot, and its kind: exit, person or thing.
UI.tagFor = (label) => {
  let m = label.match(/^(Door|Archway|Gate|Stairs): (?:back (?:down )?)?(?:to |down to )?(?:the )?(.*)$/i);
  if (m) return ['→ ' + m[2].replace(/^your /, '').replace(/^\w/, c => c.toUpperCase()), 'exit'];
  m = label.match(/^Talk to (\S+)/);
  if (m) return [m[1], 'person'];
  m = label.match(/^(Inbox|Quest board) \((\d+)/);
  if (m) return [`${m[1]} (${m[2]})`, 'thing'];
  m = label.match(/^Sip coffee \((\d+)/);
  if (m) return [`Coffee (${m[1]})`, 'thing'];
  if (/^Rooms:/.test(label)) return ['Rooms', 'thing'];
  if (/^The bar/.test(label)) return ['The bar', 'thing'];
  if (/^The Academy$/.test(label)) return ['→ Academy', 'exit'];
  return [label.split(':')[0], 'thing'];
};
UI.labelPref = () => { try { const v = localStorage.getItem('desk_labels'); if (v != null) return v === '1'; } catch (e) { /* storage unavailable */ } return matchMedia('(hover: none)').matches; };
UI.labelsOn = UI.labelPref();
UI.toggleLabels = () => {
  UI.labelsOn = !UI.labelsOn;
  try { localStorage.setItem('desk_labels', UI.labelsOn ? '1' : '0'); } catch (e) { /* not remembered, fine */ }
  $('#labels').classList.toggle('all', UI.labelsOn);
  UI.hotspots();
};
// Entering a room shows every label briefly, so you can see what's clickable.
UI.flashLabels = () => {
  const l = $('#labels'); l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash');
  clearTimeout(UI.flashT); UI.flashT = setTimeout(() => l.classList.remove('flash'), 2600);
};
UI.defaultCaption = () => Scenes.cur === 'office' ? 'Click things on your desk. The inbox is on the left.' : 'Click a door to move on, or a person to talk (10 min).';
Scenes.loop = () => {
  Scenes.frame++;
  if (S && Scenes.frame % 2 === 0) Scenes[Scenes.cur].draw(Scenes.ctx);
  requestAnimationFrame(Scenes.loop);
};

// -------------------------------------------------------------- the panel --
// One sheet of paper at a time sits over the scene.
UI.show = (html, opts = {}) => {
  const el = $('#sheet');
  el.className = 'sheet open ' + (opts.cls || '');
  el.innerHTML = `<div class="sheet-bar">${UI.stack.length ? UI.btn('← Back', () => UI.back(), 'ghost') : ''}<span class="sheet-title">${opts.title || ''}</span>${UI.btn('✕', () => UI.close(), 'ghost x', 'aria-label="Close"')}</div><div class="sheet-body">${html}</div>`;
  $('#veil').classList.add('open');
  UI.top();
};
UI.open = (fn) => { if (UI.panelFn) UI.stack.push(UI.panelFn); UI.panelFn = fn; fn(); };
UI.root = (fn) => { UI.stack = []; UI.panelFn = fn; fn(); };
UI.back = () => { const fn = UI.stack.pop(); UI.panelFn = fn || null; if (fn) fn(); else UI.close(); };
UI.redraw = () => { if (UI.panelFn) UI.panelFn(); UI.refresh(); };
UI.close = () => { $('#sheet').className = 'sheet'; $('#veil').classList.remove('open'); UI.stack = []; UI.panelFn = null; if (S) UI.refresh(); };

// ------------------------------------------------------------------- inbox -
UI.KIND = {
  request: ['Request', 'req'], followup: ['Follow-up', 'req'], gazette: ['Newspaper', 'news'], expense: ['Expense claim', 'money'], invoice: ['Invoice', 'money'],
  complaint: ['Complaint', 'bad'], application: ['Application', 'people'], promotion: ['Petition', 'people'], resignation: ['Resignation', 'bad'],
  notice: ['Death notice', 'bad'], report: ['Job report', 'info'], thanks: ['Letter', 'good'], angry: ['Letter', 'bad'], directive: ['Council directive', 'council'],
  form9: ['Form 9', 'council'], inquiry: ['Inquiry', 'bad'], census: ['Census', 'council'], inspection: ['Inspection', 'council'], charter: ['Charter', 'council'], welcome: ['Letter', 'council'], proposal: ['Proposal', 'money'],
};
UI.deadlineTag = (d) => {
  if (d.deadline == null) return '';
  const left = d.deadline - S.day;
  return left < 0 ? '<span class="due over">overdue</span>' : left === 0 ? '<span class="due over">due today</span>' : left === 1 ? '<span class="due soon">due tomorrow</span>' : `<span class="due">due ${C.DAYS[(d.deadline - 1) % 7]}</span>`;
};
UI.inbox = () => UI.root(UI.inboxView);
UI.inboxView = () => {
  const docs = S.inbox.filter(d => !d.done).sort((a, b) => (a.deadline ?? 999) - (b.deadline ?? 999) || a.id - b.id);
  let h = `<p class="hint">Unopened letters cost time to read. <b>Skim</b> (3 min) gives you the gist; <b>reading carefully</b> takes longer and shows every detail.</p><ul class="docs">`;
  for (const d of docs) {
    const [k, cls] = UI.KIND[d.kind] || ['Letter', 'info'];
    h += `<li>${UI.btn(`<span class="seal" style="background:${d.seal}"></span><span class="dk ${cls}">${k}</span><span class="dsub">${esc(d.subject)}</span><span class="dfrom">${esc(d.from)}</span>${UI.deadlineTag(d)}<span class="dread">${d.read === 2 ? 'read' : d.read === 1 ? 'skimmed' : 'unopened'}</span>`, () => UI.open(() => UI.docView(d.id)), 'docrow ' + (d.read ? 'opened' : ''))}</li>`;
  }
  h += '</ul>';
  if (!docs.length) h += '<p class="empty">The inbox is empty. Is this what peace feels like?</p>';
  UI.show(h, { title: `Inbox: ${plural(docs.length, 'item')}`, cls: 'wide' });
};

// --------------------------------------------------------------- documents -
UI.style = (d) => {
  if (d.kind === 'gazette') return 'paper';
  if (['invoice', 'form9', 'census', 'directive', 'inspection', 'charter', 'expense', 'promotion', 'proposal'].includes(d.kind)) return 'form';
  const r = d.req && Core.req(d.req);
  if (r) return r.ctype === 'farmer' ? 'hand' : r.ctype === 'noble' ? 'fancy' : 'letter';
  if (['report', 'resignation', 'application'].includes(d.kind)) return 'hand';
  return 'letter';
};
UI.blurText = (text, seed) => {
  if (S.focus >= 35) return esc(text);
  let i = 0;
  return text.split(' ').map(w => ((seed * 31 + (i++) * 17) % 6 === 0 ? `<span class="blur">${esc(w)}</span>` : esc(w))).join(' ');
};
UI.docView = (id) => {
  const d = Core.doc(id); if (!d) return UI.back();
  const [kind] = UI.KIND[d.kind] || ['Letter'];
  if (!d.read && !d.done) {
    const rc = Math.round(Core.readCost(d) * (S.focus < 35 ? 1.5 : 1));
    UI.show(`<div class="envelope"><span class="seal big" style="background:${d.seal}"></span>
      <div class="env-from">${esc(d.from)}</div><div class="env-sub">${esc(d.subject)}</div>${UI.deadlineTag(d)}
      <div class="env-acts">${UI.btn(`Skim it <small>3 min</small>`, () => { Core.open(d, 'skim'); UI.redraw(); })}${UI.btn(`Read carefully <small>${rc} min</small>`, () => { Core.open(d, 'read'); UI.redraw(); }, 'primary')}</div>
      ${S.focus < 35 ? '<p class="hint bad">You are tired. Words are swimming. Everything takes longer. Coffee would help.</p>' : ''}</div>`, { title: kind });
    return;
  }
  const st = UI.style(d);
  let body = '';
  if (d.read === 2 || d.done) {
    if (d.kind === 'gazette') {
      body = `<div class="masthead">The Millbrook Crier</div><div class="dateline">${Core.dateStr(d.day)} · One Copper</div><div class="cols">` +
        d.items.map((it, i) => `<p class="story ${i === 0 ? 'lead' : ''}">${UI.blurText(it.text, d.id + i)}${it.dungeon && Core.req(it.dungeon).status === 'open' && !d.done ? `<br>${UI.btn('Draft a survey posting', () => UI.open(() => UI.postingForm(it.dungeon, null, d.id)), 'stamp small')}` : ''}</p>`).join('') + '</div>';
    } else body = d.body.map((p, i) => `<p>${UI.blurText(p, d.id + i)}</p>`).join('');
  } else {
    body = `<p class="skimmed">You skimmed this: <b>${esc(d.summary || d.subject)}</b></p>`;
    if (S.staff.clerk && d.clerk) body += `<p class="clerk">📎 ${esc(S.staff.clerk.name)}'s note: ${esc(d.clerk)}</p>`;
    if (!d.done) body += `<p>${UI.btn(`Read it properly <small>${Core.readCost(d)} min</small>`, () => { Core.open(d, 'read'); UI.redraw(); })}</p>`;
    if (d.kind === 'gazette') body += d.items.filter(it => it.dungeon && Core.req(it.dungeon).status === 'open').map(it => `<p>${UI.btn('Draft a survey posting (dungeon bounty)', () => UI.open(() => UI.postingForm(it.dungeon, null, d.id)), 'stamp small')}</p>`).join('');
  }
  if (d.read === 2 && S.staff.clerk && d.clerk && d.kind !== 'gazette') body += `<p class="clerk">📎 ${esc(S.staff.clerk.name)}'s note: ${esc(d.clerk)}</p>`;
  if (d.kind === 'expense') body += UI.expenseTable(d);
  if (d.kind === 'application' && d.interviewed) body += `<div class="notes"><b>Your interview notes:</b> Actually Rank ${C.RANKS[d.app.rank]}${d.claimRank !== d.app.rank ? ' <span class="bad">(lied about rank)</span>' : ''}. ${d.app.known.length ? 'Struck you as ' + d.app.known.map(t => C.TRAITS[t].name.toLowerCase()).join(', ') + '.' : 'Hard to read.'}</div>`;
  if (d.kind === 'census') body += `<div class="census">${C.RANKS.map((r, i) => `<label>Rank ${r} <input type="number" min="0" max="30" value="0" id="cen${i}"></label>`).join('')}</div>`;
  const acts = d.done ? `<p class="filed">Filed.</p>` : UI.actions(d);
  UI.show(`<div class="doc ${st}"><div class="dhead"><span class="seal" style="background:${d.seal}"></span><div><b>${esc(d.from)}</b><br><span>${esc(d.subject)}</span></div><div class="dmeta">Received ${Core.dateStr(d.day)}<br>${UI.deadlineTag(d)}</div></div><div class="dbody">${body}</div></div><div class="acts">${acts}</div>`, { title: kind, cls: 'docsheet' });
};
UI.expenseTable = (d) => {
  let h = `<table class="exp"><thead><tr><th>Approve</th><th>Item</th><th>Gold</th></tr></thead><tbody>`;
  d.items.forEach((it, i) => { h += `<tr><td><input type="checkbox" id="ex${i}" ${d.done ? 'disabled' : 'checked'}></td><td>${esc(it.label)}</td><td>${it.cost}</td></tr>`; });
  h += `</tbody></table><p class="hint">Cross-check items against the job report. Untick anything that doesn't belong.</p>`;
  return h;
};
UI.after = (msg, kind) => { if (msg) UI.toast(msg, kind); UI.back(); UI.refresh(); };
UI.actions = (d) => {
  const B = UI.btn, s = 'stamp';
  const file = B('File it', () => { Core.fileDoc(d); UI.after(); }, s + ' grey');
  const r = d.req && Core.req(d.req);
  switch (d.kind) {
    case 'request': case 'followup': {
      if (!r || r.status !== 'open') return `<p class="filed">This request is ${r ? r.status : 'closed'}.</p>` + file;
      return B(`Draft a posting <small>${Core.COST.draft} min</small>`, () => UI.open(() => UI.postingForm(r.id, null, d.id)), s + ' green') +
        (r.askedMore ? '' : B(`Ask for more detail <small>5 min, +1 day</small>`, () => { Core.askMore(r, d); UI.after('Letter sent. A reply should come tomorrow.'); }, s)) +
        B('Decline <small>5 min</small>', () => { Core.decline(r, d); UI.after('Declined.'); }, s + ' red');
    }
    case 'expense': return B('Approve ticked items', () => {
      const idx = d.items.map((_, i) => ($('#ex' + i).checked ? i : -1)).filter(i => i >= 0);
      const paid = Core.approveExpenses(d, idx); UI.after(`Paid out ${paid}g in expenses.`);
    }, s + ' green');
    case 'invoice': { const inv = S.invoices.find(i => i.id === d.inv); if (inv && inv.paid) return file;
      return B(`Pay ${inv.amount}g`, () => { const e = Core.payInvoice(d); e ? UI.toast(e, 'bad') : UI.after('Paid.'); }, s + ' green') +
        B(`Dispute <small>15 min</small>`, () => { const m = Core.disputeInvoice(d); UI.toast(m); UI.redraw(); }, s) + B('Leave it for now', () => UI.back(), s + ' grey'); }
    case 'complaint': return (d.cost ? B(`Pay ${d.cost}g`, () => { Core.complaintAction(d, 'pay'); UI.after(); }, s + ' green') + B('Dock their pay', () => { Core.complaintAction(d, 'dock'); UI.after(); }, s) : '') +
      B('Send an apology', () => { Core.complaintAction(d, 'apologize'); UI.after(); }, s) + B('Dismiss it', () => { Core.complaintAction(d, 'dismiss'); UI.after(); }, s + ' red');
    case 'application': if (d.staff) return B(`Hire <small>20g + ${C.STAFF[d.staff].wage}g/day</small>`, () => { const e = Core.hire(d); e ? UI.toast(e, 'bad') : UI.after('Hired.', 'good'); }, s + ' green') + B('Reject', () => { Core.fileDoc(d); UI.after(); }, s + ' red');
      return (d.interviewed ? '' : B(`Interview <small>20 min</small>`, () => { const l = Core.interview(d); UI.toast(l.length ? `You learn: ${l.join(', ')}.` : 'They give little away.'); UI.redraw(); }, s)) +
        B(`Sign them <small>${20 + d.app.rank * 30}g</small>`, () => { const e = Core.hire(d); e ? UI.toast(e, 'bad') : UI.after('Signed.', 'good'); }, s + ' green') + B('Reject', () => { Core.fileDoc(d); UI.after(); }, s + ' red');
    case 'promotion': return B('Approve', () => { Core.promote(d, true); UI.after('Approved.'); }, s + ' green') + B('Deny', () => { Core.promote(d, false); UI.after('Denied.'); }, s + ' red') + B('Check the roster book', () => UI.open(() => UI.memberView(d.adv)), s + ' grey');
    case 'notice': return B('Pay the 50g benefit', () => { const e = Core.deathBenefit(d, true); e ? UI.toast(e, 'bad') : UI.after(); }, s + ' green') + B('Send condolences only', () => { Core.deathBenefit(d, false); UI.after(); }, s);
    case 'resignation': return B('Offer a 30g bonus to stay', () => { UI.after(Core.resignation(d, true)); }, s + ' green') + B('Accept the resignation', () => { UI.after(Core.resignation(d, false)); }, s + ' red');
    case 'form9': return B(`Complete and file <small>15 min</small>`, () => { Core.fileForm9(d); UI.after('Form 9 filed.'); }, s + ' green');
    case 'census': return B(`File the return <small>15 min</small>`, () => { const ok = Core.census(d, C.RANKS.map((_, i) => +$('#cen' + i).value || 0)); UI.after(ok ? 'Census filed.' : 'Filed. (Something about those numbers nags at you.)'); }, s + ' green') + B('Check the roster book', () => UI.open(UI.rosterView), s + ' grey');
    case 'proposal': return B(`Approve <small>${Core.BUILD[d.build].cost}g</small>`, () => { const e = Core.proposal(d, true); e ? UI.toast(e, 'bad') : UI.after('Works commissioned.'); }, s + ' green') + B('Decline', () => { Core.proposal(d, false); UI.after(); }, s + ' red');
    default: return file;
  }
};

// ---------------------------------------------------------- posting form ---
UI.postingForm = (reqId, postId, docId) => {
  const r = Core.req(reqId), p = postId && Core.post(postId);
  const f = UI.form && UI.form.req === reqId ? UI.form : { req: reqId, rank: p ? p.rank : 0, size: p ? p.size : 1, pay: p ? p.pay : C.EXPECT[0] * r.days, tags: p ? [...p.tags] : [] };
  UI.form = f;
  const warn = Core.validatePosting(r, f);
  const total = f.pay * f.size, margin = r.fee - total;
  const ranks = C.RANKS.map((rk, i) => `<label class="radio ${f.rank === i ? 'on' : ''}"><input type="radio" name="rk" value="${i}" ${f.rank === i ? 'checked' : ''}>${rk}</label>`).join('');
  const tags = Object.entries(C.HAZ).map(([k, v]) => `<label class="chk ${f.tags.includes(k) ? 'on' : ''}"><input type="checkbox" value="${k}" ${f.tags.includes(k) ? 'checked' : ''}>${v}</label>`).join('');
  const h = `<div class="doc form qp">
    <div class="formhead"><b>FORM QP-1</b> · Quest Posting · ${esc(S.name)}</div>
    <div class="row2"><div><small>Client</small><br>${esc(r.client)}</div><div><small>Location</small><br>${esc(r.place)}</div><div><small>Client's fee</small><br><b>${r.fee}g</b></div><div><small>Est. duration</small><br>${plural(r.days, 'day')}</div></div>
    <div class="field"><small>Job title</small><div class="line">${esc(r.subject)} at ${esc(r.place)}</div></div>
    <div class="field"><small>Minimum member rank</small><div class="radios" id="f-rank">${ranks}</div></div>
    <div class="field"><small>Party size</small><div class="radios" id="f-size">${[1, 2, 3, 4, 5].map(n => `<label class="radio ${f.size === n ? 'on' : ''}"><input type="radio" name="sz" value="${n}" ${f.size === n ? 'checked' : ''}>${n}</label>`).join('')}</div></div>
    <div class="field"><small>Pay per member (gold)</small><div class="pay"><input type="number" id="f-pay" min="0" max="2000" value="${f.pay}"><span>× ${f.size} = <b>${total}g</b> paid out · guild keeps <b class="${margin < 0 ? 'bad' : 'good'}">${margin}g</b></span></div>
      <small class="hint">Rank ${C.RANKS[f.rank]} members usually expect about ${C.EXPECT[f.rank] * r.days}g each for this.</small></div>
    <div class="field"><small>Hazard classification (members prepare for what's listed)</small><div class="tags" id="f-tags">${tags}</div></div>
    ${warn.length ? `<ul class="warn">${warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  </div><div class="acts">${p ? UI.btn(`Revise posting <small>${Core.COST.revise} min</small>`, () => { Core.revise(p, f); UI.form = null; UI.after('Posting revised.'); }, 'stamp green')
    : UI.btn(`Post to the board <small>${Core.COST.draft} min</small>`, () => { Core.postQuest(r, f, docId && Core.doc(docId) && !Core.doc(docId).done && Core.doc(docId).kind !== 'gazette' ? Core.doc(docId) : null); UI.form = null; UI.stack = []; UI.panelFn = null; UI.toast('Pinned to the board.', 'good'); UI.inbox(); UI.refresh(); }, 'stamp green')}
    ${UI.btn('Cancel', () => { UI.form = null; UI.back(); }, 'stamp grey')}</div>`;
  UI.show(h, { title: p ? 'Revise posting' : 'Draft a posting', cls: 'docsheet' });
  const sheet = $('#sheet');
  sheet.querySelectorAll('#f-rank input').forEach(i => i.onchange = () => { f.rank = +i.value; f.pay = Math.max(f.pay, Math.round(C.EXPECT[f.rank] * r.days)); UI.postingForm(reqId, postId, docId); });
  sheet.querySelectorAll('#f-size input').forEach(i => i.onchange = () => { f.size = +i.value; UI.postingForm(reqId, postId, docId); });
  sheet.querySelectorAll('#f-tags input').forEach(i => i.onchange = () => { f.tags = i.checked ? [...f.tags, i.value] : f.tags.filter(t => t !== i.value); UI.postingForm(reqId, postId, docId); });
  const pay = $('#f-pay'); pay.onchange = () => { f.pay = Math.max(0, Math.round(+pay.value || 0)); UI.postingForm(reqId, postId, docId); };
};

// ------------------------------------------------------------------- board -
UI.board = () => UI.root(UI.boardView);
UI.boardView = () => {
  let h = '';
  if (!S.board.length) h = '<p class="empty">The board is bare. Draft postings from the requests in your inbox.</p>';
  for (const p of S.board) {
    const r = Core.req(p.req);
    const party = p.party.map(Core.adv).filter(Boolean).map(a => a.first).join(', ');
    h += `<div class="posting ${p.status}"><div class="ptitle">${esc(p.title)}</div>
      <div class="pmeta">Rank ${C.RANKS[p.rank]}+ · ${p.size} × ${p.pay}g · fee ${r.fee}g · ${p.tags.map(t => `<span class="tag">${C.HAZ[t]}</span>`).join(' ') || '<span class="tag none">no hazards listed</span>'}</div>
      <div class="pstat">${p.status === 'claimed' ? `Taken by <b>${esc(party)}</b>. Expected back ${Core.dateStr(p.end + 1)}.` : `Unclaimed for ${plural(p.unclaimed, 'night')}${p.unclaimed >= 2 ? ' <span class="bad">(lapses tonight)</span>' : ''}.`}</div>
      ${p.status === 'open' ? `<div class="acts">${UI.btn('Revise', () => { UI.form = null; UI.open(() => UI.postingForm(r.id, p.id)); }, 'stamp small')}${UI.btn('Withdraw', () => { Core.withdraw(p); UI.redraw(); }, 'stamp small red')}</div>` : ''}</div>`;
  }
  UI.show(h, { title: 'The quest board', cls: 'wide' });
};

// ------------------------------------------------------------------ roster -
UI.roster = () => UI.root(UI.rosterView);
UI.rosterView = () => {
  let h = `<p class="hint">${S.roster.length} of ${Core.capacity()} beds. Members choose their own work from the board each night.</p><table class="roster"><thead><tr><th>Name</th><th>Class</th><th>Rank</th><th>Experience</th><th>Mood</th><th>Status</th><th>Record</th></tr></thead><tbody>`;
  for (const a of S.roster) {
    const st = a.status === 'quest' ? 'on a job' : a.status === 'training' ? 'training' : a.status === 'injured' ? `injured (${a.injury}d)` : a.idle >= 3 ? `idle ${a.idle} days` : 'available';
    h += `<tr>${`<td>${UI.btn(esc(a.name), () => UI.open(() => UI.memberView(a.id)), 'link')}</td>`}<td>${C.CLASSES[a.cls].name}</td><td>${C.RANKS[a.rank]}</td>
      <td><div class="xp"><i style="width:${Math.min(100, a.xp / C.XP_NEXT[a.rank] * 100)}%"></i></div><small>${a.xp}/${C.XP_NEXT[a.rank]}</small></td>
      <td>${a.morale >= 75 ? '😊' : a.morale >= 50 ? '🙂' : a.morale >= 30 ? '😐' : '😠'}</td><td>${st}</td><td>${a.wins}/${a.quests}</td></tr>`;
  }
  h += '</tbody></table>';
  const staff = Object.entries(S.staff);
  h += `<h4>Staff</h4>${staff.length ? staff.map(([k, s]) => `<p>${esc(s.name)}, ${C.STAFF[k].name} (${C.STAFF[k].wage}g/day)</p>`).join('') : '<p class="hint">No staff. You do everything yourself.</p>'}`;
  UI.show(h, { title: 'Roster book', cls: 'wide' });
};
UI.memberView = (id) => {
  const a = Core.adv(id);
  if (!a) return UI.show('<p class="empty">No longer on the roster.</p>', { title: 'Roster book' });
  const h = `<div class="member"><canvas id="por" width="96" height="96"></canvas><div>
    <h3>${esc(a.name)}</h3><p>${C.CLASSES[a.cls].name}, Rank ${C.RANKS[a.rank]} · joined ${a.joined ? Core.dateStr(a.joined) : 'before your time'}</p>
    <p>Experience ${a.xp}/${C.XP_NEXT[a.rank]} · jobs ${a.wins} won of ${a.quests} · mood ${Math.round(a.morale)}</p>
    <p>On file: ${a.known.length ? a.known.map(t => `<span class="tag" title="${esc(C.TRAITS[t].desc)}">${C.TRAITS[t].name}</span>`).join(' ') : '<span class="hint">Nothing yet. Talk to them, interview them, watch their paperwork.</span>'}</p></div></div>
    <h4>Service record</h4><ul class="hist">${a.history.map(x => `<li><small>Day ${x.d}</small> ${esc(x.t)}</li>`).join('') || '<li class="hint">Nothing recorded.</li>'}</ul>`;
  UI.show(h, { title: 'Roster book' });
  UI.portrait($('#por'), a);
};
UI.portrait = (cv, a) => {
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3a2a1e'; ctx.fillRect(0, 0, cv.width, cv.height);
  const sid = Scenes.spriteFor(a), pic = sid && Scenes.sprites[sid + '_portrait'];
  if (pic) { ctx.drawImage(pic, 0, 0, cv.width, cv.height); return; }
  ctx.save(); ctx.scale(4, 4); Scenes.person(ctx, 12, 33, a); ctx.restore();   // 96px = 24 units
};

// --------------------------------------------------------- ledger, planner -
UI.ledger = () => UI.root(() => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const t = S.ledger.today, days = S.ledger.days.slice(-7);
  const rows = (o) => Object.entries(o).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="hint">nothing</td></tr>';
  const owed = S.invoices.filter(i => !i.paid);
  let h = `<div class="ledger"><p class="big">Strongbox: <b class="${S.gold < 0 ? 'bad' : ''}">${S.gold}g</b></p>
    <div class="cols2"><div><h4>Today in</h4><table>${rows(t.inc)}</table></div><div><h4>Today out</h4><table>${rows(t.exp)}</table></div></div>
    <h4>Last seven days</h4><table class="week"><tr><th>Day</th><th>In</th><th>Out</th><th>Balance</th></tr>${days.map(d => `<tr><td>${Core.weekday(d.d).slice(0, 3)} ${d.d}</td><td>${sum(d.inc)}</td><td>${sum(d.exp)}</td><td>${d.gold}</td></tr>`).join('')}</table>
    <h4>Unpaid bills</h4>${owed.length ? owed.map(i => `<p>${esc(i.from)}: ${i.amount}g for ${esc(i.what)}, due ${Core.dateStr(i.due)}</p>`).join('') : '<p class="hint">None. Remarkable.</p>'}
    <p class="hint">Money in: client fees, tavern takings, rent (2g per member per day)${S.fac.academy ? ', tuition' : ''}. Money out: member pay, expenses, bills, staff wages, fines.</p></div>`;
  UI.show(h, { title: 'Ledger' });
});
UI.planner = () => UI.root(() => {
  const items = [];
  for (const d of S.inbox) if (d.deadline != null && !d.done) items.push({ day: d.deadline, text: `${UI.KIND[d.kind][0]}: ${d.subject}` });
  for (const p of S.board) if (p.status === 'claimed') items.push({ day: p.end + 1, text: `Party due back: ${p.title}` }); else items.push({ day: S.day + 3 - p.unclaimed, text: `Posting lapses if unclaimed: ${p.title}` });
  for (const b of S.building) items.push({ day: b.done, text: `Works finish: ${Core.BUILD[b.key].name}` });
  for (const a of S.roster) if (a.status === 'training') items.push({ day: a.until + 1, text: `${a.first} back from training` });
  if (S.day % 7 !== 0) items.push({ day: S.day + (7 - S.day % 7), text: 'Council inspection (Sunsday night)' });
  items.sort((a, b) => a.day - b.day);
  let h = '<ul class="plan">';
  let last = null;
  for (const it of items) { if (it.day !== last) { h += `<li class="pday">${it.day < S.day ? 'Overdue' : it.day === S.day ? 'Today' : Core.dateStr(it.day)}</li>`; last = it.day; } h += `<li>${esc(it.text)}</li>`; }
  h += '</ul>';
  if (!items.length) h = '<p class="empty">Nothing pressing. Suspicious.</p>';
  UI.show(h, { title: 'Day planner' });
});
UI.archive = () => UI.root(() => {
  const h = `<p class="hint">Filed papers. Re-reading costs nothing.</p><ul class="docs">${S.archive.slice(0, 80).map(d => `<li>${UI.btn(`<span class="seal" style="background:${d.seal}"></span><span class="dk">${(UI.KIND[d.kind] || ['Letter'])[0]}</span><span class="dsub">${esc(d.subject)}</span><span class="dfrom">${Core.dateStr(d.day)}</span>`, () => UI.open(() => UI.docView(d.id)), 'docrow opened')}</li>`).join('')}</ul>`;
  UI.show(S.archive.length ? h : '<p class="empty">The filing cabinet is empty and smells of mice.</p>', { title: 'Archive', cls: 'wide' });
});
UI.rules = () => UI.root(() => {
  const active = C.DIRECTIVES.filter(d => S.rules[d.id]);
  UI.show(`<h4>Council rules in force</h4>${active.length ? active.map(d => `<p><b>${d.title}.</b> ${esc(d.text)}</p>`).join('') : '<p class="hint">None yet. Give it time.</p>'}
    <h4>The Guildmaster's handbook (Hela's notes in the margins)</h4>
    <p><b>Read before you post.</b> Clients rarely say what they mean. Nobles understate. Farmers exaggerate. The gazette and the tavern know things the letter doesn't.</p>
    <p><b>Rank.</b> Members only take postings at or below their rank. Post too low and the wrong people take it. Post too high and nobody can.</p>
    <p><b>Pay.</b> Members want roughly ${C.RANKS.map((r, i) => `${r}: ${C.EXPECT[i]}g`).join(', ')} per head per day. Pay less and the posting sits. The guild keeps whatever the client's fee leaves over.</p>
    <p><b>Hazards.</b> Members prepare for the hazards you list. An unlisted hazard is a nasty surprise. Some classes are better against some hazards (clerics against undead and disease, rangers against beasts and the dark, mages against sorcery and fire, rogues for discreet work, warriors for big things and crowds, paladins against undead and for guarding people on the road, summoners against sorcery and crowds, bards for escorts and quiet work, alchemists against poison and fire, monks against crowds and for quiet work, hedge-witches against sorcery and the dark).</p>
    <p><b>Deadlines.</b> The inspector counts how much paperwork you handle on time.</p>
    <p class="hint">"Drink the coffee while it's hot. Nothing else in this office will wait for you." – H.G.</p>`, { title: 'Bookshelf' });
});
UI.charter = () => UI.root(() => {
  const gr = Core.guildRank(), g = C.GUILD_RANKS[gr], nx = C.GUILD_RANKS[gr + 1];
  UI.show(`<div class="doc fancy"><div class="dbody"><p class="center big">${esc(S.name)}</p><p class="center">${g.title} · Rank ${g.id}</p>
    <p>Renown: ${S.renown}${nx ? ` (Rank ${nx.id} at ${nx.renown})` : ''}</p>
    <h4>Standing in town</h4>${Object.entries(C.FACTIONS).map(([k, v]) => `<p>${v}: <b class="${S.factions[k] > 0 ? 'good' : S.factions[k] < 0 ? 'bad' : ''}">${S.factions[k] > 0 ? '+' : ''}${S.factions[k]}</b></p>`).join('')}</div></div>`, { title: 'Guild charter' });
});
UI.window = () => {
  const h = S.min / 60;
  UI.say(h < 10 ? 'Millbrook is waking up. Carts on Mill Street, smoke from the bakery. Somewhere out there, someone is writing you a letter.'
    : h < 16 ? 'Midday. The square is busy. A Gilded Lions recruiter is handing out leaflets by the fountain.'
    : h < 18 ? 'The afternoon light is going gold. Shops are shutting. Your coffee has gone cold.'
    : 'Dark outside. Lamplighters are on their rounds. Most sensible people have gone home.');
};
UI.sip = () => { const e = Core.sip(); if (e) UI.toast(e); else UI.toast('Ah. Coffee.'); UI.refresh(); };

// --------------------------------------------------------- around the hall -
UI.reception = () => UI.root(() => {
  const roles = Object.keys(C.STAFF).filter(k => !S.staff[k] && (k !== 'dean' || S.fac.academy));
  UI.show(`<p>${S.staff.clerk ? `${esc(S.staff.clerk.name)} looks up from a stack of forms. "What do you need, Guildmaster?"` : 'An empty desk and a little brass bell. You ring it out of habit. Nobody comes.'}</p>
    <h4>Pin a notice in the window</h4><p class="hint">Applications arrive in tomorrow's post. 10 minutes to write.</p>
    <div class="acts">${UI.btn('Seeking adventurers', () => { Core.spend(10, 1); S.flags.wantAdv = true; UI.after('Notice pinned.'); }, 'stamp')}${roles.map(k => UI.btn(`Seeking a ${C.STAFF[k].name.toLowerCase()}`, () => { Core.spend(10, 1); S.flags.wantStaff = (S.flags.wantStaff || []).concat(k); UI.after('Notice pinned.'); }, 'stamp')).join('')}</div>
    <h4>Staff roles</h4>${Object.entries(C.STAFF).map(([k, s]) => `<p><b>${s.name}</b> (${s.wage}g/day): ${s.desc}${S.staff[k] ? ` <span class="good">${esc(S.staff[k].name)}</span>` : ''}</p>`).join('')}`, { title: 'Reception desk' });
});
UI.bar = () => {
  const name = S.staff.barkeep ? S.staff.barkeep.name : null;
  UI.root(() => UI.show(`<p>${name ? `${esc(name)} polishes a tankard that was already clean.` : 'The bar is self-service. There is an honesty jar. It is mostly buttons.'}</p>
    <div class="acts">${UI.btn(`Refill your coffee <small>5 min</small>`, () => { S.sips = 3; Core.spend(Core.COST.refill); UI.after('A fresh mug. Your hands thank you.'); }, 'stamp')}
    ${name ? UI.btn(`Ask ${esc(name)} for gossip <small>10 min</small>`, () => { Core.spend(Core.COST.talk, 1); UI.close(); UI.say(Core.rumor(true), name); }, 'stamp') : ''}</div>`, { title: 'The bar' }));
};
UI.prices = () => UI.root(() => UI.show(`<p>The chalkboard says ale is <b>${{ cheap: '1g', fair: '2g', steep: '3g' }[S.alePrice]}</b> a mug.</p>
  <p class="hint">Cheap ale keeps members happy but earns less. Steep ale earns more and grumbling.</p>
  <div class="acts">${['cheap', 'fair', 'steep'].map(k => UI.btn(`${k[0].toUpperCase() + k.slice(1)} (${{ cheap: '1g', fair: '2g', steep: '3g' }[k]})`, () => { S.alePrice = k; Core.spend(2); UI.after('Chalkboard updated.'); }, 'stamp ' + (S.alePrice === k ? 'green' : ''))).join('')}</div>`, { title: 'Price board' }));
UI.innRooms = () => UI.root(() => UI.show(`<p>${S.roster.length} members, ${Core.capacity()} beds.${S.staff.innkeeper ? ` ${esc(S.staff.innkeeper.name)} keeps the place tidy.` : ' The sheets could do with a wash.'}</p>
  <ul>${S.roster.map(a => `<li>${esc(a.name)}: ${a.status === 'quest' ? 'away on a job' : a.status === 'injured' ? `laid up, ${a.injury} more days${S.fac.infirmary ? ' (infirmary)' : ''}` : 'in residence'}</li>`).join('')}</ul>
  <div class="acts">${UI.btn('Commission works', () => UI.open(() => UI.worksView('inn')), 'stamp')}${S.fac.infirmary ? '' : UI.btn('Fit out an infirmary', () => UI.open(() => UI.worksView('infirmary')), 'stamp')}</div>`, { title: 'The inn' }));
UI.works = (fac) => UI.root(() => UI.worksView(fac));
UI.worksView = (fac) => {
  const opts = Core.buildOptions(fac);
  const extra = fac === 'inn' && !S.fac.infirmary ? Core.buildOptions('infirmary') : [];
  const all = [...opts, ...extra];
  UI.show(`<p class="hint">Oakes &amp; Son do the work in two days. 10 minutes to sign the order.</p>${all.length ? all.map(([k, b]) => `<p>${esc(b.name)}: <b>${b.cost}g</b>${b.rank && Core.guildRank() < b.rank ? ` <span class="bad">(needs guild rank ${C.RANKS[b.rank]})</span>` : ''} ${UI.btn('Commission', () => { const e = Core.build(k); e ? UI.toast(e, 'bad') : UI.after('Works ordered.'); }, 'stamp small')}</p>`).join('') : '<p class="empty">Nothing more to build here for now.</p>'}
    ${S.building.length ? `<h4>Under way</h4>${S.building.map(b => `<p>${esc(Core.BUILD[b.key].name)}, ready ${Core.dateStr(b.done + 1)}</p>`).join('')}` : ''}`, { title: 'Works' });
};
UI.trainForm = (kind) => UI.root(() => {
  const per = kind === 'academy' ? 20 : 10;
  const idle = S.roster.filter(a => a.status === 'idle');
  UI.show(`<p class="hint">${kind === 'academy' ? 'Lectures in arcana, theology and the discipline of the mind. Mages and clerics learn fastest. Everyone comes back calmer.' : `Drills and sparring. Yard level ${S.fac.yard}${S.staff.trainer ? `, with ${esc(S.staff.trainer.name)} shouting` : ''}.`} ${per}g per member per day. 10 minutes to arrange.</p>
    ${idle.length ? idle.map(a => `<p>${esc(a.name)}, ${C.CLASSES[a.cls].name} ${C.RANKS[a.rank]} (${a.xp}/${C.XP_NEXT[a.rank]} xp) ${[1, 2, 3].map(dd => UI.btn(`${dd}d`, () => { const e = Core.train(a, kind, dd); e ? UI.toast(e, 'bad') : UI.after(`${a.first} is booked in.`); }, 'stamp small')).join('')}</p>`).join('') : '<p class="empty">Nobody is free right now.</p>'}`, { title: kind === 'academy' ? 'Academy enrolment' : 'Training roster' });
});

// ------------------------------------------------------------- talking -----
UI.talk = (a) => {
  const lines = Core.chat(a);
  UI.say(lines.join(' '), a.name, a);
};
UI.say = (text, who, a) => {
  const el = $('#talk');
  el.innerHTML = `${a ? '<canvas id="tpor" width="96" height="96"></canvas>' : ''}<div class="tbody">${who ? `<b>${esc(who)}</b>` : ''}<p>${esc(text)}</p></div>${UI.btn('Done', () => UI.closeTalk(), 'ghost')}`;
  el.classList.add('open');
  if (a) UI.portrait($('#tpor'), a);
  UI.refresh();
};
UI.closeTalk = () => $('#talk').classList.remove('open');

// ----------------------------------------------------------- end of day ----
UI.clockOut = (forced) => {
  if (!forced && S.min < 17 * 60 && !UI.confirmEarly) {
    UI.confirmEarly = true;
    UI.toast(`It's only ${Core.clock()}. Click "Clock out" again to leave early.`);
    setTimeout(() => { UI.confirmEarly = false; }, 4000);
    return;
  }
  UI.confirmEarly = false; UI.nightShown = true;
  const left = Core.clock(), unread = S.inbox.filter(d => !d.done).length, late = S.overtime;
  // tomorrow's job notices
  if (S.flags.wantAdv) { S.flags.wantAdv = false; S.flags.queueAdv = true; }
  const night = Core.endDay();
  if (S.flags.queueAdv) { Core.application(); S.flags.queueAdv = false; }
  for (const k of (S.flags.wantStaff || [])) Core.staffApplication(k);
  S.flags.wantStaff = [];
  UI.close(); UI.closeTalk();
  const h = `<h2>Night falls</h2><p>You put on your coat at <b>${left}</b>${unread ? `, leaving ${plural(unread, 'item')} in the inbox` : ' with an empty inbox'}.${late ? ' You will be tired tomorrow.' : ''}</p>
    <ul class="night">${night.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${S.over ? '<p class="bad"><b>The Council has suspended your charter.</b> The guild owes more than it can pay. The doors are chained in the morning.</p>' : `<p class="hint">Morning brings ${plural(S.inbox.filter(d => !d.done && d.day === S.day).length, 'new item')}.</p>`}
    <div class="acts">${S.over ? UI.btn('Start again', () => { Main.newGame(); }, 'stamp red') : UI.btn(`Begin ${Core.dateStr()}`, () => { $('#night').classList.remove('open'); UI.nightShown = false; Main.save(); Scenes.cur = 'office'; UI.go('office'); UI.morningFloats(); }, 'stamp green')}</div>`;
  $('#night').innerHTML = `<div class="nightbox">${h}</div>`;
  $('#night').classList.add('open');
};
UI.morningFloats = () => {
  const fresh = S.inbox.filter(d => !d.done && d.day === S.day).length;
  const last = S.ledger.days[S.ledger.days.length - 1];
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  setTimeout(() => {
    if (fresh) { const [x, y] = UI.sceneToClient(44, 100); UI.float(`+${fresh} letters`, x, y, 'mail'); }
    if (last) {
      const net = sum(last.inc) - sum(last.exp), r = $('#gold').getBoundingClientRect();
      if (net) UI.float(`${net > 0 ? '+' : '−'}${Math.abs(net)}g yesterday`, r.left + r.width / 2, r.bottom + 14, net > 0 ? 'gain' : 'loss', 250);
    }
  }, 250);
};
UI.menu = () => UI.root(() => UI.show(`<p>${esc(S.name)} · ${Core.dateStr()}</p><p class="hint">The game saves every morning in this browser.</p>
  <div class="acts">${UI.btn('Save now', () => { Main.save(); UI.toast('Saved.'); }, 'stamp')}${UI.btn('Read the handbook', () => UI.rules(), 'stamp')}${UI.btn('Start a new game', () => Main.newGame(), 'stamp red')}</div>`, { title: 'Menu' }));
