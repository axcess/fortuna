// ============================================================================
//  CORE — state, documents, the working day, and what happens overnight
// ============================================================================
'use strict';

const U = {
  rnd: (a, b) => a + Math.random() * (b - a),
  ri: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (a) => a[Math.floor(Math.random() * a.length)],
  chance: (p) => Math.random() < p,
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  wpick: (a) => { let t = a.reduce((s, x) => s + (x.w || 1), 0) * Math.random(); for (const x of a) { t -= x.w || 1; if (t <= 0) return x; } return a[a.length - 1]; },
  shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
};

let S = null;
const Core = {};
const DAY_START = 8 * 60, DAY_END = 18 * 60, HARD_END = 22 * 60;
Core.COST = { skim: 3, read: 12, reply: 5, draft: 25, revise: 10, walk: 5, talk: 10, interview: 20, sip: 1, refill: 5, form: 15, train: 10, dispute: 15, build: 10 };

// ------------------------------------------------------------------ basics --
Core.id = () => S.nextId++;
Core.rankName = (r) => C.RANKS[r];
Core.guildRank = () => { let r = 0; C.GUILD_RANKS.forEach((g, i) => { if (S.renown >= g.renown) r = i; }); return r; };
Core.weekday = (d = S.day) => C.DAYS[(d - 1) % 7];
Core.dateStr = (d = S.day) => `${Core.weekday(d)}, Day ${d}`;
Core.clock = (m = S.min) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
Core.adv = (id) => S.roster.find(a => a.id === id);
Core.req = (id) => S.requests[id];
Core.doc = (id) => S.inbox.find(d => d.id === id) || S.archive.find(d => d.id === id);
Core.post = (id) => S.board.find(p => p.id === id);
Core.capacity = () => [0, 4, 7, 10, 14][S.fac.inn];
Core.log = (t) => { S.log.unshift({ d: S.day, m: S.min, t }); if (S.log.length > 400) S.log.length = 400; };
Core.money = (amt, cat) => {
  S.gold += amt;
  const L = S.ledger.today;
  if (amt >= 0) L.inc[cat] = (L.inc[cat] || 0) + amt; else L.exp[cat] = (L.exp[cat] || 0) - amt;
};
Core.faction = (k, d) => { S.factions[k] = U.clamp((S.factions[k] || 0) + d, -100, 100); };

// Spend working time. Returns false if the day is already over.
Core.spend = (mins, focusCost = 0) => {
  if (S.min >= HARD_END) return false;
  const slow = S.focus < 35 ? 1.5 : 1;
  const m = Math.round(mins * slow);
  S.min = Math.min(HARD_END, S.min + m);
  S.focus = U.clamp(S.focus - m * 0.07 - focusCost, 0, 100);
  if (S.min >= DAY_END) S.overtime = true;
  return true;
};
Core.readCost = (doc) => Math.round((Core.COST.read + Math.min(8, (doc.len || 0) / 120)) * (S.fac.archive ? 0.8 : 1));
Core.sip = () => {
  if (S.sips <= 0) return 'Your mug is empty. The barkeep can refill it.';
  S.sips--; S.focus = U.clamp(S.focus + 18, 0, 100); Core.spend(Core.COST.sip);
  return null;
};

// ---------------------------------------------------------------- new game -
Core.newGame = (name) => {
  S = {
    v: 1, name: name || 'The Rusty Flagon', day: 1, min: DAY_START, focus: 85, sips: 3, gold: 300, renown: 0,
    inbox: [], archive: [], requests: {}, board: [], roster: [], staff: {}, apps: {},
    fac: { tavern: 1, inn: 1, yard: 1, infirmary: 0, archive: 0, academy: 0 }, building: [], alePrice: 'fair',
    factions: { folk: 0, merchant: 0, nobles: 0, council: 0, temple: 0 },
    rules: {}, invoices: [], log: [], ledger: { today: { inc: {}, exp: {} }, days: [] },
    week: { due: 0, onTime: 0, ok: 0, fail: 0, complaints: 0, deaths: 0, misclass: 0, jobs: 0 },
    nextId: 1, overtime: false, flags: {}, over: false, padding: {},
  };
  const starters = [
    { first: 'Brom', last: 'Ironfoot', cls: 'warrior', rank: 1, traits: ['honest', 'brave', 'tidy', 'modest'], xp: 60 },
    { first: 'Pip', last: 'Quickfinger', cls: 'rogue', rank: 0, traits: ['padder', 'cautious', 'rowdy', 'greedy'], xp: 40 },
    { first: 'Tamsin', last: 'Fairweather', cls: 'cleric', rank: 0, traits: ['honest', 'cautious', 'tidy', 'modest'], xp: 20 },
    { first: 'Kael', last: 'Ashgrove', cls: 'ranger', rank: 0, traits: ['liar', 'brave', 'rowdy', 'greedy'], xp: 70 },
  ];
  for (const s of starters) {
    const a = Core.makeAdv(s.rank, s.cls);
    Object.assign(a, { first: s.first, last: s.last, name: `${s.first} ${s.last}`, traits: s.traits, xp: s.xp, known: [], joined: 0 });
    S.roster.push(a);
  }
  // first morning's mail
  Core.addDoc({ kind: 'welcome', from: 'Reeve Marlow Thistle, Millbrook Council', subject: 'Your provisional charter', seal: '#2a4a7a',
    body: [
      'Guildmaster,',
      'The Council acknowledges your inheritance of the Rusty Flagon Adventurers\' Guild and grants a provisional charter, subject to good conduct.',
      'Your duties: read the requests that come to you, post suitable work to your board, see that your members are paid and your bills are settled. Your members choose their own work from the board overnight. Post a job at too low a rank and they may take on more than they can handle. Pay too little and nobody will take it at all.',
      'A charter fee is due to the Council each week. The Council inspects every guild on Sunsday.',
      'Read carefully. People rarely tell you everything in the first paragraph.',
      'Marlow Thistle, Reeve',
    ], summary: 'Council: provisional charter granted. Weekly fee and inspections.' });
  Core.morningMail(true);
  return S;
};
Core.makeAdv = (rank, cls) => {
  const first = U.pick(C.FIRST), last = U.pick(C.LAST);
  const t = [U.chance(0.7) ? 'honest' : 'padder', U.chance(0.5) ? 'brave' : 'cautious', U.chance(0.65) ? 'tidy' : 'rowdy', U.chance(0.5) ? 'greedy' : 'modest'];
  if (U.chance(0.25)) t.push('liar');
  return {
    id: Core.id(), first, last, name: `${first} ${last}`, cls: cls || U.pick(Object.keys(C.CLASSES)), rank, xp: U.ri(0, Math.floor(C.XP_NEXT[rank] * 0.5)),
    morale: U.ri(55, 75), traits: t, known: [], status: 'idle', until: 0, injury: 0, quests: 0, wins: 0, idle: 0, joined: S ? S.day : 0,
    look: { skin: U.pick(C.SKIN), hair: U.pick(C.HAIR), style: U.ri(0, 3) }, history: [], petitioned: false,
  };
};
Core.has = (a, t) => a.traits.includes(t);
Core.reveal = (a, t) => { if (Core.has(a, t) && !a.known.includes(t)) { a.known.push(t); return true; } return false; };
Core.power = (a) => C.POWER[a.rank] * (1 + 0.35 * a.xp / C.XP_NEXT[a.rank]) * (0.75 + a.morale / 200) * (Core.has(a, 'brave') ? 1.08 : 1);
Core.hist = (a, t) => { a.history.unshift({ d: S.day, t }); if (a.history.length > 30) a.history.length = 30; };

// --------------------------------------------------------------- documents -
Core.addDoc = (o) => {
  const d = Object.assign({ id: Core.id(), day: S.day, read: 0, done: false, seal: '#7a1f1f', deadline: null, actions: [] }, o);
  d.len = (d.body || []).join(' ').length;
  S.inbox.push(d);
  return d;
};
Core.fileDoc = (d) => {
  d.done = true;
  S.inbox = S.inbox.filter(x => x !== d);
  S.archive.unshift(d);
  if (S.archive.length > 200) S.archive.length = 200;
  if (d.deadline != null) { S.week.due++; if (S.day <= d.deadline) S.week.onTime++; }
};
Core.open = (d, mode) => {
  // mode: 'skim' | 'read'. Re-opening a doc you've read is free.
  if (mode === 'read' && d.read < 2) { Core.spend(Core.readCost(d), 2); d.read = 2; }
  else if (mode === 'skim' && d.read < 1) { Core.spend(Core.COST.skim, 0.5); d.read = 1; }
};

// --------------------------------------------------------------- requests --
Core.newRequest = (forceProblem) => {
  const gr = Core.guildRank();
  const pool = C.PROBLEMS.filter(p => p.minRank <= gr);
  const p = forceProblem || U.pick(pool);
  const ctype = U.pick(p.clients), ct = C.CLIENT_TYPES[ctype];
  // truths above what the guild could plausibly handle are rarer early on
  const truths = p.truths.map(t => ({ ...t, w: (t.w || 1) * (t.r > gr + 1 ? 0.35 : 1) }));
  const truth = U.wpick(truths);
  const place = U.pick(p.where || C.PLACES);
  const budget = Math.round(U.ri(p.budget[0], p.budget[1]) * 1.25 * (1 + gr * 0.35) / 5) * 5;
  const r = {
    id: Core.id(), problem: p.id, ctype, client: U.pick(ct.names), faction: ct.faction, subject: p.subject, place, ask: p.ask,
    budget, fee: budget, days: U.ri(p.days[0], p.days[1]), truth: { n: truth.n, r: truth.r, h: [...truth.h] },
    status: 'open', expires: S.day + U.ri(3, 5), given: [], askedMore: false, posting: null,
  };
  S.requests[r.id] = r;
  Core.requestLetter(r);
  return r;
};
Core.clueFor = (h, used) => {
  const opts = C.CLUES[h].filter(c => !used.includes(c));
  return opts.length ? U.pick(opts) : U.pick(C.CLUES[h]);
};
Core.rankHint = (r) => r === 0 ? U.pick(['It is probably nothing much, but it worries us.', 'I expect it is a small matter for professionals.'])
  : r === 1 ? U.pick(['My neighbour went to look and came back with a gash on his arm.', 'It has gone on long enough that we are afraid.'])
  : r === 2 ? U.pick(['Two men went to look and have not come back.', 'The militia sergeant took one look and went home.'])
  : U.pick(['The militia refused outright to go near it.', 'Nobody who has seen it clearly will speak of it.', 'The priest has advised us to leave the village.']);
Core.requestLetter = (r) => {
  const ct = C.CLIENT_TYPES[r.ctype];
  const body = [U.pick(ct.open), r.ask.replace('{place}', r.place)];
  const details = [];
  const understate = r.ctype === 'noble' && U.chance(0.45);
  for (const h of U.shuffle([...r.truth.h])) {
    if (understate && U.chance(0.6)) continue;
    if (U.chance(0.82)) { const c = Core.clueFor(h, r.given); r.given.push(c); details.push(c); }
  }
  if (U.chance(0.6) && !understate) details.push(Core.rankHint(r.truth.r));
  if (r.ctype === 'farmer' && U.chance(0.25)) details.push(U.pick(['For all I know it is a dragon.', 'My wife says it is the end of the world, but she says that about the weather.']));
  if (details.length) body.push(details.join(' '));
  body.push(r.ctype === 'noble' ? `I am prepared to offer ${r.budget} crowns for a satisfactory resolution.` : `I can pay ${r.budget} gold when it is done.`);
  body.push(U.pick(ct.close));
  body.push(r.client);
  return Core.addDoc({
    kind: 'request', from: r.client, subject: r.subject, seal: ct.seal, req: r.id, body, deadline: r.expires,
    summary: `${r.subject}, at ${r.place}. Offers ${r.budget}g.`,
    clerk: details.length ? `Client offers ${r.budget}g. Worth noting: "${details[0]}"` : `Client offers ${r.budget}g. No details given.`,
  });
};
Core.askMore = (r, doc) => {
  r.askedMore = true;
  Core.spend(Core.COST.reply, 1);
  Core.faction(r.faction, -1);
  r.expires += 1; doc.deadline = r.expires;
  S.flags.followups = S.flags.followups || [];
  S.flags.followups.push(r.id);
};
Core.followUp = (r) => {
  const ct = C.CLIENT_TYPES[r.ctype];
  const missing = r.truth.h.filter(h => !r.given.some(g => C.CLUES[h].includes(g)));
  const lines = [];
  for (const h of missing) { const c = Core.clueFor(h, r.given); r.given.push(c); lines.push(c); }
  lines.push(Core.rankHint(r.truth.r));
  if (!missing.length) lines.unshift('I am not sure what more I can tell you.');
  Core.addDoc({
    kind: 'followup', from: r.client, subject: `RE: ${r.subject}`, seal: ct.seal, req: r.id, deadline: r.expires,
    body: ['Guildmaster,', 'You asked for more detail. Here is everything I know.', lines.join(' '), 'Please, act soon.', r.client],
    summary: `More detail on "${r.subject}".`, clerk: `New detail: "${lines[0]}"`,
  });
};
Core.decline = (r, doc) => {
  r.status = 'declined'; Core.faction(r.faction, -2); Core.spend(Core.COST.reply, 1);
  Core.fileDoc(doc);
  Core.log(`Declined: ${r.subject} (${r.client}).`);
};
Core.dungeonRequest = (dg) => {
  const gr = Core.guildRank();
  const truth = U.pick(dg.truths);
  const r = {
    id: Core.id(), problem: 'dungeon', ctype: 'council', client: 'The Crown (survey bounty)', faction: 'council', subject: `Survey: ${dg.name}`, place: dg.where,
    ask: dg.news, budget: 90 + gr * 50, fee: 90 + gr * 50, days: U.ri(1, 3), truth: { n: truth.n, r: truth.r, h: [...truth.h] },
    status: 'open', expires: S.day + 6, given: [], askedMore: false, posting: null, dungeon: true,
  };
  S.requests[r.id] = r;
  return r;
};

// ---------------------------------------------------------------- postings -
// fields: { rank, size, pay, tags }
Core.validatePosting = (r, f) => {
  const warn = [];
  if (S.rules.hazard_act && !f.tags.length) warn.push('The Hazard Disclosure Act requires at least one hazard classification (fine: 20g).');
  if (S.rules.night_permit && f.tags.includes('night')) warn.push('Night Work requires a 10g permit, charged now.');
  const total = f.pay * f.size;
  if (total > r.fee) warn.push(`You are paying out ${total}g against a ${r.fee}g fee: the guild loses ${total - r.fee}g on this job.`);
  const want = C.EXPECT[f.rank] * r.days;
  if (f.pay < want * 0.8) warn.push(`Rank ${C.RANKS[f.rank]} members usually expect about ${want}g each for ${r.days} day${r.days > 1 ? 's' : ''}. This may go unclaimed.`);
  return warn;
};
Core.postQuest = (r, f, doc) => {
  Core.spend(Core.COST.draft, 4);
  const p = { id: Core.id(), req: r.id, title: `${r.subject} at ${r.place}`, rank: f.rank, size: f.size, pay: f.pay, tags: [...f.tags],
    posted: S.day, unclaimed: 0, status: 'open', party: [], start: 0, end: 0 };
  if (S.rules.hazard_act && !f.tags.length) { Core.money(-20, 'fines'); Core.log('Fined 20g under the Hazard Disclosure Act.'); }
  if (S.rules.night_permit && f.tags.includes('night')) Core.money(-10, 'fines');
  S.board.push(p);
  r.status = 'posted'; r.posting = p.id;
  if (doc) Core.fileDoc(doc);
  for (const d of S.inbox.filter(x => x.req === r.id && x.kind === 'followup')) Core.fileDoc(d);
  Core.log(`Posted: ${p.title} (Rank ${C.RANKS[p.rank]}, ${p.size} × ${p.pay}g).`);
  return p;
};
Core.revise = (p, f) => {
  Core.spend(Core.COST.revise, 2);
  Object.assign(p, { rank: f.rank, size: f.size, pay: f.pay, tags: [...f.tags] });
};
Core.withdraw = (p) => {
  const r = Core.req(p.req);
  p.status = 'withdrawn'; S.board = S.board.filter(x => x !== p);
  if (r) { r.status = 'declined'; Core.faction(r.faction, -3); }
  Core.spend(Core.COST.reply);
};

// --------------------------------------------------------------- doc actions
Core.approveExpenses = (d, approvedIdx) => {
  const a = Core.adv(d.adv);
  let paid = 0, deniedLegit = 0, approvedFake = 0, deniedFake = 0;
  d.items.forEach((it, i) => {
    const ok = approvedIdx.includes(i);
    if (ok) { paid += it.cost; if (it.fake) approvedFake++; }
    else if (it.fake) deniedFake++; else deniedLegit++;
  });
  Core.money(-paid, 'expenses');
  if (a) {
    a.morale = U.clamp(a.morale - deniedLegit * 4, 0, 100);
    if (approvedFake) S.padding[a.id] = (S.padding[a.id] || 0) + 1;
    if (deniedFake) { S.padding[a.id] = Math.max(0, (S.padding[a.id] || 0) - 1); if (deniedFake >= 1 && Core.reveal(a, 'padder')) Core.log(`You've caught ${a.first} padding expenses.`); }
    if (deniedLegit && !deniedFake && Core.has(a, 'honest')) Core.reveal(a, 'honest');
  }
  Core.spend(Core.COST.reply, 1);
  Core.fileDoc(d);
  return paid;
};
Core.complaintAction = (d, how) => {
  const a = Core.adv(d.adv);
  Core.spend(Core.COST.reply, 1);
  if (how === 'pay') { Core.money(-d.cost, 'compensation'); Core.faction('folk', 2); }
  if (how === 'dock') { if (a) { a.morale = U.clamp(a.morale - 12, 0, 100); } Core.faction('folk', 2); }
  if (how === 'apologize') { Core.faction('folk', d.cost ? -1 : 2); }
  if (how === 'dismiss') { Core.faction('folk', -4); S.renown = Math.max(0, S.renown - 2); }
  if (a) Core.reveal(a, 'rowdy');
  Core.fileDoc(d);
};
Core.payInvoice = (d) => {
  const inv = S.invoices.find(i => i.id === d.inv);
  if (S.gold < inv.amount) return 'Not enough gold in the strongbox.';
  Core.money(-inv.amount, inv.cat); inv.paid = true;
  Core.spend(Core.COST.reply);
  Core.fileDoc(d);
  return null;
};
Core.disputeInvoice = (d) => {
  const inv = S.invoices.find(i => i.id === d.inv);
  Core.spend(Core.COST.dispute, 2);
  if (inv.disputed) return 'You have already disputed this one.';
  inv.disputed = true;
  if (inv.cat !== 'charter' && U.chance(0.4)) { inv.amount = Math.round(inv.amount * 0.6); d.body.push(`[Amended after dispute: ${inv.amount}g]`); return `They agreed to reduce it to ${inv.amount}g.`; }
  Core.faction(inv.cat === 'charter' ? 'council' : 'merchant', -2);
  d.body.push('[Dispute rejected. Amount stands.]');
  return 'The dispute was rejected.';
};
Core.interview = (d) => {
  const a = d.app; Core.spend(Core.COST.interview, 3);
  d.interviewed = true;
  const learned = [];
  for (const t of U.shuffle([...a.traits]).slice(0, 2)) { if (!a.known.includes(t)) { a.known.push(t); learned.push(C.TRAITS[t].name); } }
  d.trueRank = a.rank;
  return learned;
};
Core.hire = (d) => {
  if (d.staff) {
    if (S.gold < 20) return 'Not enough gold for the signing fee.';
    Core.money(-20, 'wages');
    S.staff[d.staff] = { name: d.person, since: S.day };
    Core.spend(Core.COST.reply); Core.fileDoc(d);
    Core.log(`Hired ${d.person} as ${C.STAFF[d.staff].name}.`);
    return null;
  }
  if (S.roster.length >= Core.capacity()) return `The inn only has ${Core.capacity()} beds. Expand the inn first.`;
  const fee = 20 + d.app.rank * 30;
  if (S.gold < fee) return 'Not enough gold for the signing fee.';
  Core.money(-fee, 'wages');
  d.app.joined = S.day; S.roster.push(d.app);
  Core.hist(d.app, 'Joined the guild.');
  Core.spend(Core.COST.reply); Core.fileDoc(d);
  Core.log(`Signed ${d.app.name} (${C.CLASSES[d.app.cls].name}, Rank ${C.RANKS[d.app.rank]}).`);
  return null;
};
Core.promote = (d, yes) => {
  const a = Core.adv(d.adv);
  Core.spend(Core.COST.reply, 1);
  if (a) {
    a.petitioned = false;
    if (yes) { a.rank = Math.min(5, a.rank + 1); a.xp = 0; a.morale = U.clamp(a.morale + 12, 0, 100); Core.hist(a, `Promoted to Rank ${C.RANKS[a.rank]}.`); Core.log(`${a.name} promoted to Rank ${C.RANKS[a.rank]}.`); }
    else { a.morale = U.clamp(a.morale - 10, 0, 100); Core.hist(a, 'Petition for advancement denied.'); }
  }
  Core.fileDoc(d);
};
Core.deathBenefit = (d, pay) => {
  Core.spend(Core.COST.reply, 3);
  if (pay) { if (S.gold < 50) return 'Not enough gold.'; Core.money(-50, 'benefits'); for (const a of S.roster) a.morale = U.clamp(a.morale + 4, 0, 100); Core.faction('folk', 2); }
  else { for (const a of S.roster) a.morale = U.clamp(a.morale - 5, 0, 100); }
  Core.fileDoc(d);
  return null;
};
Core.resignation = (d, offer) => {
  const a = Core.adv(d.adv);
  if (!a) { Core.fileDoc(d); return 'They have already gone.'; }
  Core.spend(Core.COST.talk, 3);
  if (offer) {
    if (S.gold < 30) return 'Not enough gold.';
    Core.money(-30, 'wages'); a.morale = U.clamp(a.morale + 30, 0, 100);
    Core.hist(a, 'Talked out of resigning with a 30g bonus.'); Core.fileDoc(d);
    return `${a.first} agrees to stay.`;
  }
  Core.leave(a, 'resigned'); Core.fileDoc(d);
  return `${a.first} has packed their things.`;
};
Core.leave = (a, why) => {
  S.roster = S.roster.filter(x => x !== a);
  for (const p of S.board) if (p.party.includes(a.id) && p.status === 'open') p.party = p.party.filter(x => x !== a.id);
  Core.log(`${a.name} ${why}.`);
};
Core.census = (d, counts) => {
  Core.spend(Core.COST.form, 3);
  const actual = C.RANKS.map((_, i) => S.roster.filter(a => a.rank === i).length);
  const right = actual.every((n, i) => (counts[i] || 0) === n);
  if (!right) { Core.money(-30, 'fines'); Core.faction('council', -3); }
  else Core.faction('council', 2);
  Core.fileDoc(d);
  return right;
};
Core.fileForm9 = (d) => { Core.spend(Core.COST.form, 3); Core.faction('council', 1); Core.fileDoc(d); };
Core.proposal = (d, yes) => {
  Core.spend(Core.COST.reply, 1);
  if (yes) { const err = Core.build(d.build); if (err) return err; }
  Core.fileDoc(d);
  return null;
};

// ------------------------------------------------------------- facilities --
Core.BUILD = {
  tavern2: { fac: 'tavern', lvl: 2, cost: 150, name: 'Refit the tavern (new tables, a proper hearth)' },
  tavern3: { fac: 'tavern', lvl: 3, cost: 420, name: 'Expand the tavern into a taproom' },
  inn2: { fac: 'inn', lvl: 2, cost: 200, name: 'Repair the upstairs rooms (7 beds)' },
  inn3: { fac: 'inn', lvl: 3, cost: 480, name: 'Open the east wing (10 beds)' },
  inn4: { fac: 'inn', lvl: 4, cost: 900, name: 'Build a second storey (14 beds)' },
  yard2: { fac: 'yard', lvl: 2, cost: 150, name: 'New dummies and an archery range' },
  yard3: { fac: 'yard', lvl: 3, cost: 420, name: 'A sparring ring and an obstacle course' },
  infirmary: { fac: 'infirmary', lvl: 1, cost: 180, name: 'Fit out an infirmary (injuries heal twice as fast)' },
  archive: { fac: 'archive', lvl: 1, cost: 120, name: 'Install a proper filing room (reading takes 20% less time)' },
  academy: { fac: 'academy', lvl: 1, cost: 800, name: 'Found the Academy of Mind and Arcana', rank: 2 },
};
Core.buildOptions = (fac) => Object.entries(Core.BUILD).filter(([k, b]) => b.fac === fac && S.fac[fac] === b.lvl - 1 && !S.building.some(x => x.key === k));
Core.build = (key) => {
  const b = Core.BUILD[key];
  if (b.rank && Core.guildRank() < b.rank) return `Requires guild rank ${C.RANKS[b.rank]}.`;
  if (S.gold < b.cost) return 'Not enough gold.';
  Core.money(-b.cost, 'works');
  S.building.push({ key, done: S.day + 2 });
  Core.spend(Core.COST.build, 1);
  Core.log(`Commissioned: ${b.name}. Ready in two days.`);
  return null;
};
Core.train = (a, kind, days) => {
  const cost = (kind === 'academy' ? 20 : 10) * days;
  if (S.gold < cost) return 'Not enough gold.';
  if (a.status !== 'idle') return `${a.first} is busy.`;
  Core.money(-cost, 'training');
  a.status = 'training'; a.until = S.day + days; a.trainKind = kind;
  Core.spend(Core.COST.train, 1);
  Core.hist(a, `Sent to ${kind === 'academy' ? 'the Academy' : 'the training yard'} for ${days} day${days > 1 ? 's' : ''}.`);
  return null;
};

// ------------------------------------------------------------- the night ---
Core.endDay = () => {
  const night = [];
  const day = S.day;
  // 1. members pick work from the board
  const claimedTonight = new Set();
  const open = S.board.filter(p => p.status === 'open').sort((a, b) => b.pay - a.pay);
  for (const p of open) {
    const r = Core.req(p.req);
    const cands = [];
    for (const a of S.roster) {
      if (a.status !== 'idle' || claimedTonight.has(a.id) || a.rank < p.rank) continue;
      // members price a job by its posted rank, plus a premium when they're overqualified
      let interest = p.pay / (C.EXPECT[p.rank] * (1 + 0.2 * (a.rank - p.rank)) * r.days);
      if (Core.has(a, 'greedy')) interest *= 0.85; if (Core.has(a, 'modest')) interest *= 1.2;
      if (Core.has(a, 'brave')) interest *= 1.05;
      if (Core.has(a, 'cautious') && (p.tags.length >= 3 || a.rank === p.rank && p.rank < r.truth.r)) interest *= 0.85;
      if (p.tags.some(t => C.CLASSES[a.cls].counters.includes(t))) interest *= 1.15;
      if (a.idle >= 3) interest *= 1.15;
      if (interest >= 1) cands.push({ a, interest });
    }
    if (cands.length >= p.size) {
      cands.sort((x, y) => y.interest - x.interest);
      const party = cands.slice(0, p.size).map(c => c.a);
      for (const a of party) { claimedTonight.add(a.id); a.status = 'quest'; a.idle = 0; a.until = day + r.days; }
      p.party = party.map(a => a.id); p.status = 'claimed'; p.start = day + 1; p.end = day + r.days;
      night.push(`${party.map(a => a.first).join(', ')} took “${p.title}”.`);
      Core.log(`Claimed: ${p.title} by ${party.map(a => a.first).join(', ')}.`);
    } else {
      p.unclaimed++;
      if (p.unclaimed >= 3) {
        p.status = 'expired'; S.board = S.board.filter(x => x !== p);
        r.status = 'expired'; Core.faction(r.faction, -4); S.renown = Math.max(0, S.renown - 3);
        Core.addDoc({ kind: 'angry', from: r.client, subject: `Nobody came: ${r.subject}`, seal: C.CLIENT_TYPES[r.ctype].seal,
          body: ['Guildmaster,', `I wrote to you about ${r.subject.toLowerCase()} at ${r.place}. You posted it, and then nobody came. Three days I waited.`, 'I will take my business elsewhere, and I will tell others to do the same.', r.client],
          summary: `${r.client} is angry: the posting went unclaimed.` });
        night.push(`Nobody would take “${p.title}”. The posting lapsed.`);
      }
    }
  }
  // 2. quests resolve
  for (const p of S.board.filter(x => x.status === 'claimed' && x.end <= day)) Core.resolve(p, night);
  S.board = S.board.filter(p => p.status === 'open' || p.status === 'claimed');
  // 3. members: training, injuries, idleness, petitions, mischief
  for (const a of [...S.roster]) {
    if (a.status === 'training' && a.until <= day) {
      const acad = a.trainKind === 'academy';
      const gain = acad ? (['mage', 'cleric'].includes(a.cls) ? 70 : 30) * (S.staff.dean ? 1.5 : 1) : 30 * S.fac.yard * (S.staff.trainer ? 2 : 1);
      a.xp += Math.round(gain); a.status = 'idle';
      if (acad) a.morale = U.clamp(a.morale + 10, 0, 100);
      night.push(`${a.first} finished training (+${Math.round(gain)} xp).`);
    } else if (a.status === 'training') { a.xp += 0; }
    if (a.status === 'injured') { a.injury -= S.fac.infirmary ? 2 : 1; if (a.injury <= 0) { a.status = 'idle'; night.push(`${a.first} is fit for duty again.`); } }
    if (a.status === 'idle') { a.idle++; if (a.idle >= 3) a.morale = U.clamp(a.morale - 3, 0, 100); }
    // drift
    let dm = (60 - a.morale) * 0.05;
    if (S.alePrice === 'cheap') dm += 1.5; if (S.alePrice === 'steep') dm -= 1.5;
    if (S.staff.innkeeper) dm += 1;
    if (S.fac.tavern >= 2) dm += 0.5;
    a.morale = U.clamp(a.morale + dm, 0, 100);
    if (a.rank < 5 && !a.petitioned && (a.xp >= C.XP_NEXT[a.rank] || (Core.has(a, 'liar') && a.xp >= C.XP_NEXT[a.rank] * 0.6 && U.chance(0.25)))) {
      a.petitioned = true; S.flags.petitions = (S.flags.petitions || []).concat(a.id);
    }
    if (a.status === 'idle' && Core.has(a, 'rowdy') && U.chance(0.14)) S.flags.complaints = (S.flags.complaints || []).concat(a.id);
    if (a.morale < 20 && !a.resigning && U.chance(0.5)) { a.resigning = true; S.flags.resign = (S.flags.resign || []).concat(a.id); }
  }
  // 4. money that comes and goes without asking you
  const visitors = Math.round((8 + S.renown / 25 + (S.staff.barkeep ? 6 : 0)) * U.rnd(0.8, 1.2));
  const price = { cheap: 1, fair: 1.6, steep: 2.2 }[S.alePrice];
  const tav = Math.round(visitors * price * (0.6 + 0.4 * S.fac.tavern) * (S.staff.barkeep ? 1.25 : 1));
  Core.money(tav, 'tavern');
  const rent = S.roster.length * 2; Core.money(rent, 'rent');
  if (S.fac.academy && S.staff.dean) Core.money(30, 'tuition');
  let wages = 0; for (const k of Object.keys(S.staff)) wages += C.STAFF[k].wage;
  if (wages) Core.money(-wages, 'wages');
  night.push(`Tavern took ${tav}g from ${visitors} customers. Rent ${rent}g.${wages ? ` Staff wages ${wages}g.` : ''}`);
  // 5. works finish
  for (const b of S.building.filter(x => x.done <= day + 1)) {
    const def = Core.BUILD[b.key]; S.fac[def.fac] = def.lvl;
    night.push(`Works finished: ${def.name}.`);
  }
  S.building = S.building.filter(x => x.done > day + 1);
  // 6. deadlines
  for (const d of [...S.inbox]) {
    if (d.deadline == null || d.deadline > day) continue;
    if (d.kind === 'request' || d.kind === 'followup') {
      const r = Core.req(d.req);
      if (r && r.status === 'open' && r.expires <= day) {
        r.status = 'expired'; Core.faction(r.faction, -3); S.renown = Math.max(0, S.renown - 2);
        Core.fileDoc(d); d.expiredUnanswered = true; S.week.due++;
        night.push(`${r.client} gave up waiting for a reply.`);
      }
    }
    if (d.kind === 'form9' && d.deadline < day + 1) { Core.money(-25, 'fines'); Core.fileDoc(d); S.week.due++; night.push('Fined 25g for an unfiled Form 9.'); }
    if (d.kind === 'census' && d.deadline < day + 1) { Core.money(-30, 'fines'); Core.faction('council', -4); Core.fileDoc(d); S.week.due++; night.push('Fined 30g: no census return filed.'); }
    if (d.kind === 'resignation') { const a = Core.adv(d.adv); if (a) { Core.leave(a, 'left the guild (resignation ignored)'); night.push(`${a.first} left. You never answered their letter.`); } Core.fileDoc(d); }
  }
  for (const inv of S.invoices.filter(i => !i.paid && i.due <= day && !i.chased)) {
    inv.chased = true; inv.amount = Math.round(inv.amount * 1.15);
    const old = S.inbox.find(d => d.inv === inv.id); if (old) Core.fileDoc(old);
    Core.addDoc({ kind: 'invoice', inv: inv.id, from: inv.from, subject: `FINAL NOTICE: ${inv.what}`, seal: '#7a1f1f', deadline: day + 3,
      body: ['Guildmaster,', `Our invoice for ${inv.what} remains unpaid. A late charge has been added. The amount now due is ${inv.amount} gold.`, 'Failure to pay will be reported to the Council.', inv.from], summary: `Final notice: ${inv.amount}g owed to ${inv.from}.` });
    Core.faction(inv.cat === 'charter' ? 'council' : 'merchant', -3);
  }
  for (const inv of S.invoices.filter(i => !i.paid && i.chased && i.due + 3 <= day && !i.reported)) {
    inv.reported = true; S.renown = Math.max(0, S.renown - 6); Core.faction('council', -5); night.push(`${inv.from} reported your unpaid bill to the Council.`);
  }
  // 7. weekly inspection
  if (day % 7 === 0) Core.inspection(night);
  // ledger
  S.ledger.days.push({ d: day, inc: S.ledger.today.inc, exp: S.ledger.today.exp, gold: S.gold, renown: S.renown });
  if (S.ledger.days.length > 60) S.ledger.days.shift();
  S.ledger.today = { inc: {}, exp: {} };
  // rank
  const before = S.flags.rankSeen || 0, now = Core.guildRank();
  if (now > before) { S.flags.rankSeen = now; S.flags.rankUp = now; }
  if (S.gold < -150) S.over = true;
  // next morning
  const late = S.overtime;
  S.day++; S.min = DAY_START; S.focus = late ? 60 : 85; S.sips = 3; S.overtime = false;
  Core.morningMail();
  return night;
};

Core.resolve = (p, night) => {
  const r = Core.req(p.req);
  const party = p.party.map(Core.adv).filter(Boolean);
  if (!party.length) { p.status = 'done'; return; }
  let P = 0; for (const a of party) P += Core.power(a);
  const unready = [];
  for (const h of r.truth.h) {
    if (p.tags.includes(h)) P *= 1.06; else { P *= 0.82; unready.push(h); }
    if (party.some(a => C.CLASSES[a.cls].counters.includes(h))) P *= 1.12;
  }
  const T = C.THREAT[r.truth.r] * (1 + 0.1 * Math.max(0, r.truth.h.length - 1));
  const ratio = P / T;
  const chance = U.clamp(1 / (1 + Math.exp(-(ratio - 1) * 5)), 0.03, 0.97);
  const roll = Math.random();
  const ok = roll < chance, great = roll < chance * 0.3, disaster = !ok && ratio < 0.65;
  const cleric = party.some(a => a.cls === 'cleric');
  const hurt = [], dead = [];
  for (const a of party) {
    let inj = ok ? 0.08 : disaster ? 0.6 : 0.35; if (cleric) inj *= 0.6;
    let die = disaster ? 0.3 : ok ? 0 : 0.04; if (cleric) die *= 0.5;
    if (U.chance(die)) dead.push(a);
    else if (U.chance(inj)) { a.status = 'injured'; a.injury = U.ri(2, 5); hurt.push(a); }
  }
  const lead = party[0];
  for (const a of party) {
    if (dead.includes(a)) continue;
    a.quests++; if (ok) a.wins++;
    a.xp += Math.round((20 + 35 * r.truth.r) * (ok ? 1 : 0.4) * (great ? 1.3 : 1));
    a.morale = U.clamp(a.morale + (ok ? 8 : -8) - dead.length * 15, 0, 100);
    if (!hurt.includes(a)) a.status = 'idle';
    Core.hist(a, `${ok ? 'Completed' : 'Failed'}: ${p.title} (found ${r.truth.n}).${hurt.includes(a) ? ' Injured.' : ''}`);
  }
  for (const a of dead) { Core.leave(a, 'died on a job'); S.week.deaths++; }
  for (const a of S.roster) if (!party.includes(a) && dead.length) a.morale = U.clamp(a.morale - 8 * dead.length, 0, 100);
  // money and reputation
  let fee = 0, payout = 0;
  if (ok) {
    fee = r.fee + (great && U.chance(0.5) ? Math.round(r.fee * 0.15) : 0);
    payout = p.pay * party.length;
    Core.money(fee, 'fees'); Core.money(-payout, 'payouts');
    S.renown += 5 + r.truth.r * 8 + (great ? 5 : 0);
    Core.faction(r.faction, 3); S.week.ok++;
    if (S.rules.form9 && r.truth.h.some(h => h === 'beast' || h === 'giant')) {
      Core.addDoc({ kind: 'form9', from: 'Office of the Reeve', subject: 'Form 9: Disposal of Remains', seal: '#2a4a7a', deadline: S.day + 3, ref: p.title,
        body: ['FORM 9: DISPOSAL OF MONSTER REMAINS', `Regarding: ${p.title}. Remains: ${r.truth.n}.`, 'Method of disposal: ☐ Burial ☐ Burning ☐ Sold to the Collegium', 'To be completed and filed within two days of the work.'],
        summary: `Form 9 required for ${p.title}.` });
    }
  } else {
    S.renown = Math.max(0, S.renown - (3 + r.truth.r * 2) - dead.length * 15);
    Core.faction(r.faction, -4); S.week.fail++;
  }
  r.status = 'done'; p.status = 'done';
  // the Council checks your classification against what was actually found
  const misclassified = r.truth.r > p.rank || unready.length > 0;
  S.week.jobs++; if (misclassified) S.week.misclass++;
  if (misclassified && !ok) {
    Core.money(-30, 'fines'); Core.faction('council', -3);
    Core.addDoc({ kind: 'inquiry', from: 'Inspector Quillon, Millbrook Council', subject: `Inquiry: ${p.title}`, seal: '#2a4a7a',
      body: ['NOTICE OF INQUIRY', `The Council has reviewed the failed job "${p.title}".`,
        r.truth.r > p.rank ? `It was posted as Rank ${C.RANKS[p.rank]}. What your members found (${r.truth.n}) was Rank ${C.RANKS[r.truth.r]} work.` : `It was posted without listing all its hazards (${unready.map(h => C.HAZ[h]).join(', ')}).`,
        'The guild is fined 30 gold for negligent classification. The fine has been deducted.', 'Inspector Quillon'],
      summary: `Fined 30g for misclassifying "${p.title}".` });
  }
  // the paperwork that results
  const surprised = unready.map(h => C.HAZ[h].toLowerCase());
  const lines = [];
  lines.push(`We went out to ${r.place} about the ${r.subject.toLowerCase()}. What we found was ${r.truth.n}.`);
  if (surprised.length) lines.push(`Nobody told us there would be ${surprised.join(' or ')}. We went in unprepared.`);
  if (r.truth.r > p.rank) lines.push(`With respect, this was not a Rank ${C.RANKS[p.rank]} job. It was Rank ${C.RANKS[r.truth.r]} at least.`);
  if (ok) lines.push(great ? 'It went better than we could have hoped.' : 'The job is done.');
  else lines.push(disaster ? 'It was a slaughter. We ran.' : 'We could not finish it. We came back.');
  if (hurt.length) lines.push(`Injured: ${hurt.map(a => a.first).join(', ')}.`);
  if (dead.length) lines.push(`${dead.map(a => a.name).join(' and ')} did not come back.`);
  Core.addDoc({ kind: 'report', from: lead.name, subject: `Report: ${p.title}`, seal: '#5a3a1e', body: ['Guildmaster,', ...lines, `${lead.first}${party.length > 1 ? ', for the party' : ''}`],
    summary: `${ok ? 'SUCCESS' : 'FAILED'}: ${p.title}. Found ${r.truth.n}.${dead.length ? ' CASUALTIES.' : ''}`, outcome: ok ? 'ok' : 'fail' });
  const ct = C.CLIENT_TYPES[r.ctype];
  if (ok) Core.addDoc({ kind: 'thanks', from: r.client, subject: `RE: ${r.subject}`, seal: ct.seal,
    body: ['Guildmaster,', `Thank you. Your people dealt with ${r.truth.n}. The fee of ${fee} gold has been sent.`, r.client], summary: `${r.client} paid ${fee}g.` });
  else Core.addDoc({ kind: 'angry', from: r.client, subject: `RE: ${r.subject}`, seal: ct.seal,
    body: ['Guildmaster,', `Your adventurers failed. The problem at ${r.place} is still there, and I will not be paying.`, r.client], summary: `${r.client} is unhappy. No fee.` });
  // expense claim from a survivor
  const claimant = party.find(a => !dead.includes(a));
  if (claimant) {
    const items = [];
    for (const g of U.shuffle([...C.EXPENSES.general]).slice(0, 2)) items.push({ label: g[0], cost: U.ri(g[1], g[2]), fake: false });
    for (const h of r.truth.h) { const e = U.pick(C.EXPENSES[h]); items.push({ label: e[0], cost: U.ri(e[1], e[2]), fake: false }); }
    if (Core.has(claimant, 'padder')) {
      const n = 1 + Math.min(2, S.padding[claimant.id] || 0);
      const fakes = U.shuffle(C.EXPENSES.fake.filter(f => !items.some(i => i.label === f[0]) && !r.truth.h.some(h => (C.EXPENSES[h] || []).some(e => e[0] === f[0])))).slice(0, n);
      for (const f of fakes) items.push({ label: f[0], cost: U.ri(f[1], f[2]), fake: true });
    }
    U.shuffle(items);
    S.flags.expenses = (S.flags.expenses || []).concat([{ adv: claimant.id, title: p.title, items }]);
  }
  for (const a of dead) S.flags.deaths = (S.flags.deaths || []).concat([{ name: a.name, first: a.first, title: p.title }]);
  night.push(`${ok ? '✔' : '✘'} ${p.title}: ${ok ? 'done' : 'failed'}.${dead.length ? ' Lives were lost.' : ''}`);
};

Core.inspection = (night) => {
  const w = S.week;
  const paper = w.due ? w.onTime / w.due : 1;
  const success = w.ok + w.fail ? w.ok / (w.ok + w.fail) : 0.5;
  const grade = (x) => x >= 0.9 ? 'A' : x >= 0.75 ? 'B' : x >= 0.55 ? 'C' : x >= 0.35 ? 'D' : 'F';
  const unpaid = S.invoices.filter(i => !i.paid && i.due < S.day).length;
  const accuracy = w.jobs ? 1 - w.misclass / w.jobs : 1;
  const delta = Math.round((paper - 0.6) * 20 + (success - 0.5) * 20 + (accuracy - 0.7) * 30 - w.deaths * 5 - unpaid * 3);
  S.renown = Math.max(0, S.renown + delta);
  Core.faction('council', Math.sign(delta) * 2);
  S.flags.inspection = { paper: grade(paper), success: grade(success), acc: grade(accuracy), misclass: w.misclass, jobs: w.jobs, deaths: w.deaths, unpaid, delta, ok: w.ok, fail: w.fail, onTime: w.onTime, due: w.due };
  S.week = { due: 0, onTime: 0, ok: 0, fail: 0, complaints: 0, deaths: 0, misclass: 0, jobs: 0 };
  night.push(`The Council inspector visited. Renown ${delta >= 0 ? '+' : ''}${delta}.`);
};

// --------------------------------------------------------- morning mail ----
Core.invoice = (from, what, amount, cat, due = 3) => {
  const inv = { id: Core.id(), from, what, amount, cat, due: S.day + due, paid: false };
  S.invoices.push(inv);
  Core.addDoc({ kind: 'invoice', inv: inv.id, from, subject: `Invoice: ${what}`, seal: cat === 'charter' ? '#2a4a7a' : '#6b6b6b', deadline: inv.due,
    body: ['INVOICE', `To: the Guildmaster, ${S.name}`, `For: ${what}`, `Amount due: ${amount} gold`, `Payable by: ${Core.dateStr(inv.due)}`, from], summary: `${from}: ${amount}g for ${what}.` });
};
Core.morningMail = (first) => {
  const d = S.day, gr = Core.guildRank();
  // the paper
  Core.gazette();
  // follow-ups you asked for
  for (const id of (S.flags.followups || [])) { const r = Core.req(id); if (r && r.status === 'open') Core.followUp(r); }
  S.flags.followups = [];
  // new requests
  const n = first ? 3 : U.ri(1, 3) + (gr >= 2 ? 1 : 0) + (S.renown > 400 ? 1 : 0);
  for (let i = 0; i < n; i++) Core.newRequest(first && i === 0 ? C.PROBLEMS[0] : null);
  // what your members have been up to
  for (const e of (S.flags.expenses || [])) {
    const a = Core.adv(e.adv); if (!a) continue;
    const total = e.items.reduce((s, i) => s + i.cost, 0);
    Core.addDoc({ kind: 'expense', adv: a.id, from: a.name, subject: `Expense claim: ${e.title}`, seal: '#5a3a1e', items: e.items, deadline: d + 4,
      body: ['EXPENSE CLAIM', `Claimant: ${a.name}`, `Job: ${e.title}`, 'Itemised below. Receipts available on request (they are not).'],
      summary: `${a.first} claims ${total}g in expenses.`, clerk: `Total ${total}g across ${e.items.length} items.` });
  }
  S.flags.expenses = [];
  for (const x of (S.flags.deaths || [])) {
    Core.addDoc({ kind: 'notice', from: 'Brother Fennick, Temple of the Dawn', subject: `Death notice: ${x.name}`, seal: '#111', deadline: d + 2,
      body: [`It is my sad duty to record the death of ${x.name}, a member of your guild, during "${x.title}".`, `Their family in the lower village asks whether the guild will pay the customary death benefit of 50 gold towards the burial.`, 'The other members are watching to see what you do.', 'Brother Fennick'],
      summary: `${x.first} is dead. The family asks for a 50g death benefit.` });
  }
  S.flags.deaths = [];
  for (const id of (S.flags.petitions || [])) {
    const a = Core.adv(id); if (!a) continue;
    const claimed = Core.has(a, 'liar') ? a.quests + U.ri(2, 5) : a.quests;
    Core.addDoc({ kind: 'promotion', adv: a.id, from: a.name, subject: `Petition for advancement to Rank ${C.RANKS[a.rank + 1]}`, seal: '#5a3a1e', deadline: d + 3,
      body: ['PETITION FOR RANK ADVANCEMENT', `Petitioner: ${a.name}, ${C.CLASSES[a.cls].name}, currently Rank ${C.RANKS[a.rank]}.`, `Jobs completed in service of the guild: ${claimed}.`,
        Core.has(a, 'liar') ? 'I have also, in a private capacity, slain a manticore and been knighted twice.' : 'I believe my record speaks for itself.',
        'Members ranked higher may take more dangerous postings. Please approve.'],
      summary: `${a.first} wants promotion to Rank ${C.RANKS[a.rank + 1]}.`, clerk: 'Check the roster book: experience and job count are on file.' });
  }
  S.flags.petitions = [];
  for (const id of (S.flags.complaints || [])) {
    const a = Core.adv(id); if (!a) continue;
    const c = U.pick(C.COMPLAINTS); S.week.complaints++;
    Core.addDoc({ kind: 'complaint', adv: a.id, cost: c.cost, from: c.who, subject: `A complaint about ${a.first}`, seal: '#6b6b6b', deadline: d + 3,
      body: ['Guildmaster,', c.text.replace('{a}', a.name), c.who], summary: `Complaint about ${a.first}${c.cost ? `, wants ${c.cost}g` : ''}.` });
  }
  S.flags.complaints = [];
  for (const id of (S.flags.resign || [])) {
    const a = Core.adv(id); if (!a) continue;
    Core.addDoc({ kind: 'resignation', adv: a.id, from: a.name, subject: 'Resignation', seal: '#5a3a1e', deadline: d + 1,
      body: ['Guildmaster,', 'I have had enough. The work is scarce, the bunks are bad, and I do not feel valued here.', 'I will be leaving tomorrow unless something changes.', a.first],
      summary: `${a.first} is resigning. Leaves tomorrow.` });
  }
  S.flags.resign = [];
  if (S.flags.inspection) {
    const i = S.flags.inspection;
    Core.addDoc({ kind: 'inspection', from: 'Inspector Quillon, Millbrook Council', subject: 'Weekly inspection report', seal: '#2a4a7a',
      body: ['WEEKLY INSPECTION REPORT', `Paperwork handled on time: ${i.onTime}/${i.due} (Grade ${i.paper})`, `Jobs: ${i.ok} completed, ${i.fail} failed (Grade ${i.success})`, `Postings correctly classified: ${i.jobs - i.misclass}/${i.jobs} (Grade ${i.acc})`, `Deaths: ${i.deaths}. Overdue bills: ${i.unpaid}.`, `Change to guild standing: ${i.delta >= 0 ? '+' : ''}${i.delta} renown.`, 'Inspector Quillon'],
      summary: `Inspection: paperwork ${i.paper}, jobs ${i.success}, accuracy ${i.acc}, renown ${i.delta >= 0 ? '+' : ''}${i.delta}.` });
    S.flags.inspection = null;
  }
  if (S.flags.rankUp) {
    const g = C.GUILD_RANKS[S.flags.rankUp];
    Core.addDoc({ kind: 'charter', from: 'Reeve Marlow Thistle', subject: `Charter upgraded: Rank ${g.id}`, seal: '#2a4a7a',
      body: ['Guildmaster,', `The Council has upgraded your charter. ${S.name} is now a ${g.title} (Rank ${g.id}).`, 'You can expect more demanding clients, and better fees.', S.flags.rankUp === 2 ? 'The Council would also look favourably on an Academy, should you wish to found one.' : '', 'Marlow Thistle, Reeve'].filter(Boolean),
      summary: `Guild promoted to Rank ${g.id}.` });
    S.flags.rankUp = null;
  }
  // bills
  if (d % 7 === 1) Core.invoice('Millbrook Council', 'weekly charter fee', 40 + gr * 20, 'charter', 4);
  if (U.chance(0.35)) {
    const opt = U.pick([['Hopsworth Brewery', 'ale delivery', 25 + S.fac.tavern * 15, 'supplies'], ['Goody Wren\'s Laundry', 'bedding and linens', 10 + S.roster.length * 3, 'supplies'],
      ['Oakes & Son, Roofers', 'emergency roof repairs', U.ri(30, 60), 'repairs'], ['Pellet the Chandler', 'candles and lamp oil', U.ri(12, 25), 'supplies'], ['Mill Street Bakery', 'bread for the tavern', U.ri(15, 30), 'supplies']]);
    Core.invoice(opt[0], opt[1], opt[2], opt[3]);
  }
  // directives roll out over the first fortnight
  const sched = { 3: 'hazard_act', 6: 'form9', 9: 'night_permit', 12: 'census' };
  if (sched[d] || (d > 12 && d % 14 === 12)) {
    const k = sched[d] || 'census', dir = C.DIRECTIVES.find(x => x.id === k);
    if (k !== 'census') S.rules[k] = true;
    Core.addDoc({ kind: 'directive', from: 'Millbrook Council', subject: `Directive: ${dir.title}`, seal: '#2a4a7a', body: ['COUNCIL DIRECTIVE', dir.title.toUpperCase(), dir.text, 'By order, Marlow Thistle, Reeve'], summary: dir.title });
    if (k === 'census') Core.addDoc({ kind: 'census', from: 'Office of the Reeve', subject: 'Census return: membership by rank', seal: '#2a4a7a', deadline: d + 3,
      body: ['CENSUS RETURN', 'Declare the number of members of your guild at each rank, including those away on work or injured.', 'Inaccurate returns carry a fine of 30 gold.'], summary: 'Census form: count your members by rank.' });
  }
  // job applications
  if (U.chance(first ? 1 : 0.45)) Core.application();
  const missing = Object.keys(C.STAFF).filter(k => !S.staff[k] && (k !== 'dean' || S.fac.academy));
  if (missing.length && U.chance(first ? 0 : 0.2)) Core.staffApplication(U.pick(missing));
  // proposals
  if (!first && U.chance(0.12)) {
    const opts = Object.keys(Core.BUILD).filter(k => { const b = Core.BUILD[k]; return S.fac[b.fac] === b.lvl - 1 && !S.building.some(x => x.key === k) && (!b.rank || Core.guildRank() >= b.rank); });
    if (opts.length) {
      const k = U.pick(opts), b = Core.BUILD[k];
      Core.addDoc({ kind: 'proposal', build: k, from: 'Oakes & Son, Builders', subject: `Proposal: ${b.name}`, seal: '#6b6b6b',
        body: ['Guildmaster,', `We have surveyed the hall and propose the following works: ${b.name}.`, `Our price is ${b.cost} gold, with the work done in two days.`, 'Oakes & Son'], summary: `Builders propose: ${b.name} (${b.cost}g).` });
    }
  }
};
Core.application = () => {
  const gr = Core.guildRank();
  const a = Core.makeAdv(Math.min(4, U.ri(0, Math.max(0, gr))));
  const claimRank = Core.has(a, 'liar') ? Math.min(5, a.rank + 1) : a.rank;
  const boasts = ['I once held a bridge alone against six goblins.', 'I have a recommendation from the Collegium, somewhere.', 'I am punctual and I do not steal.', 'I survived the siege of Khaz Varn.', 'I can start immediately.', 'My previous guild closed for reasons unrelated to me.'];
  Core.addDoc({ kind: 'application', app: a, from: a.name, subject: `Application: ${C.CLASSES[a.cls].name}, Rank ${C.RANKS[claimRank]}`, seal: '#5a3a1e', deadline: S.day + 4, claimRank,
    body: ['To the Guildmaster,', `I wish to join ${S.name} as a ${C.CLASSES[a.cls].name.toLowerCase()}. I hold Rank ${C.RANKS[claimRank]} with the Adventurers' Registry.`, U.pick(boasts), `Signing fee: ${20 + a.rank * 30} gold.`, a.name],
    summary: `${a.first} applies: ${C.CLASSES[a.cls].name}, claims Rank ${C.RANKS[claimRank]}.` });
};
Core.staffApplication = (role) => {
  const name = `${U.pick(C.FIRST)} ${U.pick(C.LAST)}`;
  Core.addDoc({ kind: 'application', staff: role, person: name, from: name, subject: `Application: ${C.STAFF[role].name}`, seal: '#5a3a1e', deadline: S.day + 4,
    body: ['To the Guildmaster,', `I would like to work for you as ${C.STAFF[role].name.toLowerCase()}.`, C.STAFF[role].desc, `I ask ${C.STAFF[role].wage} gold a day and a 20 gold signing fee.`, name],
    summary: `${name} applies to be your ${C.STAFF[role].name.toLowerCase()} (${C.STAFF[role].wage}g/day).` });
};
Core.gazette = () => {
  const items = [];
  const open = Object.values(S.requests).filter(r => r.status === 'open' || r.status === 'posted');
  for (const r of U.shuffle(open).slice(0, 2)) {
    if (!U.chance(0.55)) continue;
    const h = U.pick(r.truth.h.length ? r.truth.h : ['beast']);
    items.push({ text: C.GAZETTE_CLUES[h].replace('{place}', r.place) });
  }
  if (U.chance(0.22) || S.day === 2) {
    const dg = U.pick(C.DUNGEONS);
    const r = Core.dungeonRequest(dg);
    items.unshift({ text: `${dg.news.toUpperCase().split('.')[0]}. The Crown offers a survey bounty of ${r.budget} gold to any chartered guild.`, dungeon: r.id });
  }
  for (const f of U.shuffle([...C.GAZETTE_FLAVOR]).slice(0, 2)) items.push({ text: f });
  if (S.rules.hazard_act && U.chance(0.3)) items.push({ text: 'COUNCIL REMINDS GUILDS that hazard classifications are now compulsory on all postings.' });
  Core.addDoc({ kind: 'gazette', from: 'The Millbrook Crier', subject: `The Millbrook Crier, ${Core.dateStr()}`, seal: '#222', items, body: items.map(i => i.text), summary: `Today's paper: ${items.length} stories.` });
};

// --------------------------------------------------------------- talking ---
Core.rumor = (barkeep) => {
  const open = Object.values(S.requests).filter(r => (r.status === 'open' || r.status === 'posted') && r.truth.h.length);
  if (!open.length || U.chance(barkeep && S.staff.barkeep ? 0.1 : 0.35)) return U.pick(C.TALK.nothing);
  const r = U.pick(open);
  const missing = r.truth.h.filter(h => !r.given.some(g => C.CLUES[h].includes(g)));
  const h = U.pick(missing.length ? missing : r.truth.h);
  const clue = Core.clueFor(h, []);
  r.given.push(clue);
  return U.pick(barkeep ? C.TALK.barkeep : C.TALK.rumor).replace('{place}', r.place).replace('{clue}', clue);
};
Core.chat = (a) => {
  Core.spend(Core.COST.talk, 1.5);
  const lines = [U.pick(C.TALK.greet)];
  if (a.status === 'injured') lines.push(U.pick(C.TALK.injured));
  else if (a.morale < 35) lines.push(U.pick(C.TALK.unhappy));
  else if (a.morale > 75) lines.push(U.pick(C.TALK.happy));
  const cheap = S.board.find(p => p.status === 'open' && a.rank >= p.rank && p.pay < C.EXPECT[p.rank] * Core.req(p.req).days * 0.95);
  if (cheap && U.chance(0.6)) lines.push(U.pick(C.TALK.underpaid).replace('{q}', cheap.title).replace('{g}', cheap.pay));
  else if (a.status === 'idle' && a.idle >= 2) lines.push(U.pick(C.TALK.idle));
  if (U.chance(0.55)) lines.push(Core.rumor(false));
  a.morale = U.clamp(a.morale + 2, 0, 100);
  // you get a feel for people by talking to them
  if (U.chance(0.3)) { const t = U.pick(a.traits); if (Core.reveal(a, t)) lines.push(`(You get the impression ${a.first} is ${C.TRAITS[t].name.toLowerCase()}.)`); }
  return lines;
};
