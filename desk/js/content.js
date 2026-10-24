// ============================================================================
//  CONTENT — the paperwork: clients, problems, clues, gazette, dialogue
// ============================================================================
'use strict';

const C = {};

C.RANKS = ['F', 'E', 'D', 'C', 'B', 'A'];
C.THREAT = [10, 22, 40, 66, 100, 150];          // true danger by rank
C.POWER = [10, 20, 34, 55, 84, 125];            // an adventurer's strength by rank
C.EXPECT = [9, 17, 30, 50, 80, 120];          // gold per head per day an adventurer wants
C.XP_NEXT = [90, 220, 450, 800, 1300, 99999];
C.GUILD_RANKS = [
  { id: 'F', renown: 0, title: 'Provisional Charter' },
  { id: 'E', renown: 100, title: 'Registered Guild' },
  { id: 'D', renown: 280, title: 'Licensed Guild' },
  { id: 'C', renown: 650, title: 'Chartered Guild' },
  { id: 'B', renown: 1300, title: 'Royal Charter' },
  { id: 'A', renown: 2400, title: 'Guild of the Realm' },
];
C.DAYS = ['Moonday', 'Tiwsday', 'Wodensday', 'Thorsday', 'Freyday', 'Starday', 'Sunsday'];

C.CLASSES = {
  warrior: { name: 'Warrior', color: '#a8483a', counters: ['giant', 'swarm', 'escort'] },
  ranger:  { name: 'Ranger',  color: '#3f7a3a', counters: ['beast', 'night', 'water'] },
  cleric:  { name: 'Cleric',  color: '#ddd5bd', counters: ['undead', 'poison'] },
  mage:    { name: 'Mage',    color: '#4a55b8', counters: ['magic', 'fire'] },
  rogue:   { name: 'Rogue',   color: '#3d3d4a', counters: ['stealth', 'night'] },
};

C.HAZ = {
  beast:   'Beasts',
  undead:  'Undead',
  magic:   'Sorcery',
  poison:  'Poison / Disease',
  fire:    'Fire',
  giant:   'Large Monster',
  swarm:   'Great Numbers',
  stealth: 'Discretion',
  night:   'Night Work',
  water:   'Water',
  escort:  'Escort Duty',
};

// What a careful reader can spot in a letter. One is chosen per true hazard.
C.CLUES = {
  beast:   ['The tracks were bigger than my hand, with claws.', 'We heard howling from the treeline, close.', 'Whatever it is, it eats what it kills.', 'Old Hobb swears he saw yellow eyes in the hedgerow.'],
  undead:  ['The graves behind the chapel have been disturbed. From the inside, the sexton says.', 'There is a cold in that place no fire will warm.', 'The dogs will not go near it, and the smell is of old earth.', 'My late husband\'s ring was found on the doorstep. He was buried with it.'],
  magic:   ['There are lights over the water at night, green and drifting.', 'The scarecrow was facing the house this morning. It faced the field yesterday.', 'Every clock in the house stopped at the same minute.', 'My daughter speaks in her sleep in a language none of us know.'],
  poison:  ['The sheep that drank from the stream fell sick within the day.', 'Three of the farmhands are abed with a green fever.', 'The well water has turned the colour of weak tea and smells sweet.', 'The crows are dying. Hundreds of them, in the furrows.'],
  fire:    ['There are scorch marks on the stones, and the grass is burnt in a ring.', 'We saw smoke from the hills where nobody lives.', 'The hay barn went up without a spark from anyone.', 'It was warm to the touch, like a kiln, long after it left.'],
  giant:   ['Trees were snapped clean through, like kindling.', 'The footprints in the creek bed are deep enough to bathe in.', 'It took the whole cart. The ox and all.', 'The ground shook. I thought it was thunder, but the sky was clear.'],
  swarm:   ['There are dozens of them, maybe more.', 'The walls of the cellar are crawling.', 'My boy counted forty before he stopped counting.', 'They come in a wave, and there is always another behind.'],
  stealth: ['I must ask that this matter be handled with the utmost discretion.', 'The family would prefer that nobody in town learns of this.', 'Please do not send anyone who will talk in taverns.', 'If word gets out, my position would be untenable.'],
  night:   ['It only happens after dark.', 'The attacks come at moonrise, never by day.', 'By daylight there is nothing to see at all.', 'We keep the shutters locked from sundown now.'],
  water:   ['It happens down by the old weir.', 'Something tore through the fishing nets on the lake.', 'The boat came back empty and half full of water.', 'Whatever it is, it lives under the mill pond.'],
  escort:  ['I need someone to see the cargo safely to Port Varra.', 'My daughter must reach her aunt in Greywater unharmed.', 'The wagons leave at dawn and cannot be delayed.', 'I will be travelling myself, and I am not a fighting man.'],
};

// Client voices. {ask}, {details}, {budget}, {place} are filled in.
C.CLIENT_TYPES = {
  farmer:   { faction: 'folk', names: ['Hobb Tanner', 'Widow Marsh', 'Old Garrow', 'Bessa Plowright', 'Tom Fennick', 'Agnes Rook'],
              open: ['To whoever reads the letters at the guild,', 'Dear Sirs,', 'To the Guildmaster, if it please you,'],
              close: ['I don\'t have much but I can pay what I said.', 'Please hurry. We are frightened.', 'With respect, and hope.'], seal: '#8a6a44' },
  merchant: { faction: 'merchant', names: ['Ottilie Vane of Vane & Daughters', 'Master Corwin Pellet', 'Silas Copperhand', 'The Brightwater Trading Co.'],
              open: ['Guildmaster,', 'To the Guild, regarding a commercial matter:'],
              close: ['Terms are payment on completion. No advances.', 'Time is money. Please confirm by return.'], seal: '#c9a227' },
  noble:    { faction: 'nobles', names: ['Lady Ysolde Venn', 'Lord Aldric Hollowmere', 'The Dowager Countess of Ashby', 'Sir Percival Dunmore'],
              open: ['To the Master of the Guild,', 'Guildmaster, greetings from Hollowmere Hall.'],
              close: ['I trust this will be handled promptly, as befits my station.', 'Your discretion and your haste are both expected.'], seal: '#6b2a5e' },
  council:  { faction: 'council', names: ['Reeve Marlow Thistle, for the Millbrook Council', 'Constable Dagny Holt', 'Alderman Pim Goodbarrow'],
              open: ['By order of the Millbrook Town Council:', 'Guildmaster, the Council requests the following service:'],
              close: ['Payment per the Council schedule of fees, on completion.', 'Please file your acceptance with the Reeve\'s office.'], seal: '#2a4a7a' },
  temple:   { faction: 'temple', names: ['Mother Superior Ilse of the Dawn', 'Brother Fennick', 'High Votary Saoirse'],
              open: ['Blessings upon your house, Guildmaster.', 'In the name of the Dawn,'],
              close: ['The Temple will compensate you from the alms chest.', 'May the light guide your people.'], seal: '#d8b04a' },
};
C.FACTIONS = { folk: 'Townsfolk', merchant: 'Merchants', nobles: 'Nobility', council: 'Town Council', temple: 'Temple of the Dawn' };

C.PLACES = ['the high pasture above Millbrook', 'the Old Mill', 'Hobb\'s farm', 'the King\'s Road', 'Whisperwood', 'the chapel at Ashby', 'Greywater Lake', 'the Mirefen edge', 'the quarry', 'Hollowmere Hall', 'the cellar under the Bent Nail', 'the Weeping Brook'];

// The problems people write in about. Each has several possible truths.
// minRank: guild rank at which it can appear. budget is what the client offers in gold.
C.PROBLEMS = [
  { id: 'sheep', where: ['the high pasture above Millbrook', 'Hobb\'s farm', 'the Ashby downs', 'Widow Marsh\'s smallholding'], clients: ['farmer'], subject: 'Sheep going missing', ask: 'Something has been taking my sheep from {place}, one or two a night.', budget: [40, 70], days: [1, 2], minRank: 0,
    truths: [{ n: 'a wolf pack', r: 0, h: ['beast', 'night'], w: 5 }, { n: 'goblin rustlers', r: 0, h: ['swarm', 'night'], w: 3 }, { n: 'a werewolf', r: 2, h: ['beast', 'night', 'magic'], w: 1 }, { n: 'a young wyvern', r: 3, h: ['beast', 'giant'], w: 1 }] },
  { id: 'haunt', where: ['a cottage in the lower village', 'the old miller\'s house', 'the rectory at Ashby', 'a farmhouse on Fennick Lane'], clients: ['farmer', 'temple'], subject: 'A haunting', ask: 'There is something wrong in the house. Noises at night, things moved, my children will not sleep.', budget: [30, 60], days: [1, 1], minRank: 0,
    truths: [{ n: 'a family of raccoons in the attic', r: 0, h: ['night'], w: 3 }, { n: 'a restless poltergeist', r: 1, h: ['undead', 'night'], w: 3 }, { n: 'a hedge-witch\'s curse', r: 1, h: ['magic'], w: 2 }, { n: 'a necromancer\'s apprentice', r: 2, h: ['undead', 'magic', 'stealth'], w: 1 }] },
  { id: 'missing', where: ['Whisperwood', 'the Weeping Brook', 'the quarry road', 'the Ashby downs'], clients: ['farmer', 'noble'], subject: 'A missing person', ask: 'Someone dear to me has not come home. It has been three days.', budget: [50, 120], days: [1, 2], minRank: 0,
    truths: [{ n: 'a twisted ankle in a ravine', r: 0, h: [], w: 2 }, { n: 'an elopement with the blacksmith\'s son', r: 0, h: ['stealth'], w: 2 }, { n: 'bandit kidnappers', r: 1, h: ['swarm'], w: 3 }, { n: 'a fey bargain in Whisperwood', r: 2, h: ['magic', 'night'], w: 1 }] },
  { id: 'escort', where: ['the King\'s Road'], clients: ['merchant', 'noble'], subject: 'Escort required', ask: 'I require a guard for a journey along the King\'s Road.', budget: [80, 160], days: [2, 3], minRank: 0,
    truths: [{ n: 'an uneventful road', r: 0, h: ['escort'], w: 4 }, { n: 'highwaymen', r: 1, h: ['escort', 'swarm'], w: 3 }, { n: 'an ambush paid for by a rival house', r: 2, h: ['escort', 'stealth', 'swarm'], w: 1 }] },
  { id: 'pests', where: ['the cellar under the Bent Nail', 'the granary on Mill Street', 'the Brightwater warehouses', 'the Temple undercroft'], clients: ['merchant', 'farmer', 'council'], subject: 'Vermin in the cellars', ask: 'We have a vermin problem in the cellars and it is getting worse.', budget: [25, 50], days: [1, 1], minRank: 0,
    truths: [{ n: 'ordinary rats', r: 0, h: ['swarm'], w: 5 }, { n: 'giant rats', r: 0, h: ['swarm', 'poison'], w: 3 }, { n: 'an otyugh in the drains', r: 2, h: ['giant', 'poison'], w: 1 }] },
  { id: 'heirloom', where: ['Hollowmere Hall', 'Venn House', 'Ashby Manor'], clients: ['noble'], subject: 'A stolen heirloom', ask: 'An item of great sentimental value has been taken from my household.', budget: [90, 200], days: [1, 3], minRank: 1,
    truths: [{ n: 'a light-fingered maid', r: 0, h: ['stealth'], w: 3 }, { n: 'the Thieves\' Guild', r: 1, h: ['stealth', 'night'], w: 3 }, { n: 'a dragon\'s hoard', r: 4, h: ['giant', 'fire'], w: 1 }] },
  { id: 'bandits', where: ['the King\'s Road', 'the south road', 'the Greywater ferry road'], clients: ['council', 'merchant'], subject: 'Bandits on the road', ask: 'Travellers are being robbed on {place}.', budget: [70, 140], days: [1, 2], minRank: 1,
    truths: [{ n: 'a handful of desperate poachers', r: 0, h: ['swarm'], w: 3 }, { n: 'a bandit company', r: 1, h: ['swarm'], w: 3 }, { n: 'army deserters', r: 2, h: ['swarm', 'night'], w: 2 }] },
  { id: 'bridge', where: ['the Weeping Brook bridge'], clients: ['council'], subject: 'The bridge toll', ask: 'Something is extracting a "toll" from carts at the Weeping Brook bridge.', budget: [80, 150], days: [1, 1], minRank: 1,
    truths: [{ n: 'a troll', r: 2, h: ['giant'], w: 4 }, { n: 'a gang of kobolds', r: 0, h: ['swarm'], w: 2 }, { n: 'a bored ogre', r: 1, h: ['giant'], w: 2 }] },
  { id: 'well', where: ['the lower village', 'Fennick Lane', 'the tanners\' quarter'], clients: ['temple', 'farmer', 'council'], subject: 'Sickness in the village', ask: 'Folk in the lower village are falling ill and the physicians are baffled.', budget: [50, 110], days: [1, 2], minRank: 0,
    truths: [{ n: 'a dead cow in the well', r: 0, h: ['poison'], w: 3 }, { n: 'plague rats from the docks', r: 1, h: ['poison', 'swarm'], w: 2 }, { n: 'a hag\'s curse on the water', r: 2, h: ['poison', 'magic', 'water'], w: 2 }, { n: 'a ghoul nest beneath the churchyard', r: 2, h: ['undead', 'poison'], w: 1 }] },
  { id: 'barns', where: ['the outlying farms', 'Hobb\'s farm', 'the Ashby downs'], clients: ['farmer', 'council'], subject: 'Barn fires', ask: 'Three barns have burned this month. We need to know why.', budget: [50, 100], days: [1, 2], minRank: 1,
    truths: [{ n: 'an arsonist with a grudge', r: 0, h: ['stealth', 'night'], w: 3 }, { n: 'a fire salamander', r: 1, h: ['fire'], w: 3 }, { n: 'a young red dragon', r: 4, h: ['fire', 'giant', 'beast'], w: 1 }] },
  { id: 'lake', where: ['Greywater Lake'], clients: ['farmer', 'merchant'], subject: 'Trouble on the lake', ask: 'Our fishing boats are being attacked on {place}.', budget: [60, 110], days: [1, 2], minRank: 1,
    truths: [{ n: 'an enormous pike', r: 0, h: ['water', 'beast'], w: 3 }, { n: 'merrow raiders', r: 2, h: ['water', 'swarm'], w: 2 }, { n: 'a nixie\'s enchantment', r: 1, h: ['water', 'magic'], w: 2 }] },
  { id: 'vanity', where: ['Whisperwood'], clients: ['noble'], subject: 'A matter for my banquet', ask: 'I require a white stag for the centrepiece of my midsummer banquet.', budget: [100, 180], days: [2, 3], minRank: 1,
    truths: [{ n: 'a white stag, as described', r: 0, h: ['beast'], w: 4 }, { n: 'a white stag guarded by a dryad', r: 2, h: ['beast', 'magic'], w: 1 }] },
  { id: 'crypt', where: ['St. Aldric\'s churchyard'], clients: ['temple', 'council'], subject: 'The old crypt', ask: 'The sealed crypt beneath St. Aldric\'s has been found open.', budget: [100, 200], days: [2, 3], minRank: 2,
    truths: [{ n: 'grave robbers', r: 0, h: ['stealth'], w: 2 }, { n: 'skeletal guardians', r: 2, h: ['undead', 'swarm'], w: 3 }, { n: 'a barrow wight', r: 3, h: ['undead', 'magic'], w: 2 }] },
  { id: 'quarry', where: ['the quarry'], clients: ['merchant', 'council'], subject: 'Quarry workers refuse to dig', ask: 'The quarrymen broke into a cave and now refuse to go back to work.', budget: [120, 240], days: [2, 3], minRank: 2,
    truths: [{ n: 'a nest of cave spiders', r: 1, h: ['beast', 'poison', 'swarm'], w: 3 }, { n: 'a basilisk', r: 3, h: ['beast', 'magic', 'giant'], w: 2 }, { n: 'a forgotten dwarven tomb', r: 2, h: ['undead'], w: 2 }] },
  { id: 'mirefen', where: ['the Mirefen edge'], clients: ['council', 'noble'], subject: 'The Mirefen problem', ask: 'Patrols along the Mirefen edge have stopped reporting back.', budget: [200, 380], days: [3, 4], minRank: 3,
    truths: [{ n: 'a lizardfolk war party', r: 3, h: ['swarm', 'water'], w: 3 }, { n: 'a bog hag coven', r: 3, h: ['magic', 'poison', 'water'], w: 2 }, { n: 'a black dragon', r: 5, h: ['giant', 'poison', 'water'], w: 1 }] },
];

// Dungeons the Gazette reports popping up. The Crown pays a fixed survey bounty.
C.DUNGEONS = [
  { name: 'Sinkhole Stairs', where: 'Hobb\'s farm', news: 'A sinkhole has opened in a field at Hobb\'s farm, revealing worked stone stairs leading down.', truths: [{ n: 'a kobold warren', r: 0, h: ['swarm'] }, { n: 'an old smugglers\' cache with traps', r: 1, h: ['stealth'] }, { n: 'a sealed tomb', r: 2, h: ['undead'] }] },
  { name: 'The Drowned Cellar', where: 'the Old Mill', news: 'Floodwater receding at the Old Mill has exposed a cellar door nobody remembers building.', truths: [{ n: 'a giant eel', r: 1, h: ['water', 'beast'] }, { n: 'a drowned ghost', r: 1, h: ['undead', 'water'] }] },
  { name: 'Starfall Crater', where: 'Whisperwood', news: 'Shepherds report a falling star in Whisperwood. The crater glows faintly at night.', truths: [{ n: 'a meteorite and some curious foxes', r: 0, h: ['beast'] }, { n: 'a star-spawn aberration', r: 3, h: ['magic', 'giant'] }] },
  { name: 'The Whispering Barrow', where: 'the Ashby downs', news: 'A storm has torn the turf from an ancient barrow on the Ashby downs.', truths: [{ n: 'a barrow wight', r: 3, h: ['undead', 'magic'] }, { n: 'grave goods and a few bats', r: 0, h: ['beast'] }] },
  { name: 'Goblin Hole', where: 'the quarry', news: 'Quarrymen have broken into a cave system with crude goblin markings.', truths: [{ n: 'a goblin tribe', r: 1, h: ['swarm', 'night'] }, { n: 'a goblin tribe and their pet owlbear', r: 2, h: ['swarm', 'beast'] }] },
];

C.GAZETTE_FLAVOR = [
  'ALE PRICES RISE: The Brewers\' Guild blames a poor barley harvest.',
  'COUNCIL DEBATES NEW CART TAX: Alderman Goodbarrow calls it "a necessary evil".',
  'GILDED LIONS GUILD BOASTS OF RECORD SEASON. Guildmaster Varek calls the Rusty Flagon "a charity with a sign".',
  'LADY VENN\'S DAUGHTER ENGAGED to a minor Hollowmere cousin. The town gossips.',
  'WEATHER: Rain expected through the week. Farmers pleased; nobody else is.',
  'TEMPLE ANNOUNCES ALMS DRIVE for the lower village.',
  'LOST: one prize goose, answers to "Duchess". Reward from the Bent Nail tavern.',
  'MILLBROOK MARKET DAY moved to Starday due to the Reeve\'s gout.',
  'LETTERS: "Why do adventurers track mud through the square?" asks a Concerned Ratepayer.',
  'TRAVELLING CIRCUS camps outside town. The Constable asks residents to lock up their chickens.',
  'OBITUARY: Hela Grimm, former Guildmaster of the Rusty Flagon, remembered fondly by few.',
  'COPPERHAND CONSORTIUM opens a new counting-house on Mill Street.',
];
// Gazette lines that hint at a hazard somewhere. {place} gets filled in.
C.GAZETTE_CLUES = {
  beast: 'HUNTERS WARN of something large moving in the woods near {place}.',
  undead: 'SEXTON REPORTS EMPTY GRAVES near {place}. "They were full on Tiwsday," he insists.',
  magic: 'STRANGE LIGHTS SEEN over {place}. A Collegium scholar declines to comment.',
  poison: 'PHYSICIANS URGE CAUTION: Several cases of a green fever reported near {place}.',
  fire: 'SMOKE SEEN rising from the hills near {place}, though no fires were set.',
  giant: 'TREMORS FELT near {place}. "Like footsteps," says a shaken miller.',
  swarm: 'RAIDERS SIGHTED near {place}, said to number in the dozens.',
  stealth: 'WHISPERS of a scandal at {place}. The family denies everything.',
  night: 'CURFEW URGED near {place} after a string of night-time incidents.',
  water: 'BOATMEN REFUSE to cross the water near {place}.',
  escort: 'MERCHANT WAGONS now travel in convoys after recent trouble on the roads.',
};

// ------------------------------------------------------------------ people --
C.FIRST = ['Brom', 'Pip', 'Elowen', 'Tamsin', 'Garrick', 'Ysolde', 'Fenn', 'Mirela', 'Corwin', 'Thessaly', 'Odo', 'Rhiannon',
  'Bastian', 'Kael', 'Nim', 'Wren', 'Darius', 'Sable', 'Hollis', 'Juniper', 'Mags', 'Talia', 'Ulric', 'Vesper', 'Briar', 'Cass',
  'Dagny', 'Eamon', 'Faye', 'Hob', 'Ingrid', 'Jory', 'Kestrel', 'Lark', 'Morwen', 'Nell', 'Osric', 'Perrin', 'Quill', 'Rook',
  'Saoirse', 'Tobin', 'Una', 'Willa', 'Zephyr', 'Bryn', 'Dorian', 'Esk', 'Gwyn', 'Hale'];
C.LAST = ['Ironfoot', 'Thistledown', 'Ashgrove', 'Copperkettle', 'Stormwhistle', 'Blackbriar', 'Fairweather', 'Oakenshield',
  'Underbough', 'Greymantle', 'Halfmoon', 'Brightwater', 'Mudwick', 'Quickfinger', 'Stonebrow', 'Hollowell', 'Redmane', 'Duskwood',
  'Pennywhistle', 'Grimsby', 'Larkspur', 'Tallowmere', 'Vane'];
C.SKIN = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#f7d9c4', '#b5d29b', '#c96b6b'];
C.HAIR = ['#2b1d0e', '#5a3a1a', '#a0522d', '#d8b04a', '#e8e0c8', '#7a1f1f', '#222', '#6b6b6b'];

// Hidden traits, revealed by interviews and by what people do.
C.TRAITS = {
  honest:   { name: 'Honest',    desc: 'Files accurate expense reports.' },
  padder:   { name: 'Creative accountant', desc: 'Pads expense reports.' },
  brave:    { name: 'Brave',     desc: 'Takes risky jobs. Fights harder.' },
  cautious: { name: 'Cautious',  desc: 'Avoids risky jobs.' },
  rowdy:    { name: 'Rowdy',     desc: 'Starts brawls. Generates complaints.' },
  tidy:     { name: 'Well-mannered', desc: 'Never causes trouble in town.' },
  greedy:   { name: 'Greedy',    desc: 'Wants better pay.' },
  modest:   { name: 'Modest',    desc: 'Takes jobs for less.' },
  liar:     { name: 'Embellisher', desc: 'Exaggerates on paper.' },
};

C.STAFF = {
  clerk:     { name: 'Clerk', wage: 6, desc: 'Pins a summary note to each letter, so skimming catches more.' },
  barkeep:   { name: 'Barkeep', wage: 5, desc: 'Runs the tavern. More income, and they hear rumours.' },
  trainer:   { name: 'Drill Sergeant', wage: 7, desc: 'Training sessions earn twice the experience.' },
  innkeeper: { name: 'Innkeeper', wage: 4, desc: 'Keeps the inn tidy. Members stay happier.' },
  dean:      { name: 'Dean', wage: 12, desc: 'Runs the Academy: magic and mental training, plus tuition.' },
};

// Expense report line items. legit: when it's a plausible claim given hazards.
C.EXPENSES = {
  general: [['Trail rations (4 days)', 8, 14], ['Lantern oil', 2, 5], ['Rope, 50 ft', 3, 6], ['Bandages', 4, 8], ['Stabling for the mule', 5, 10]],
  beast: [['Hunting snares', 6, 12], ['Bear grease (scent masking)', 4, 9]],
  undead: [['Holy water, 3 vials', 15, 24], ['Silver dust', 12, 20]],
  magic: [['Warding chalk', 8, 14], ['Antimagic charm (used)', 18, 30]],
  poison: [['Antitoxin, 2 doses', 14, 22], ['Face cloths, boiled', 2, 4]],
  fire: [['Fire-ward salve', 10, 18], ['Water barrels', 4, 8]],
  giant: [['Caltrops', 6, 10], ['Replacement shield', 20, 35]],
  swarm: [['Arrows, 3 dozen', 9, 15], ['Oil flasks', 6, 12]],
  stealth: [['Bribes (unspecified)', 10, 25], ['Dark cloaks', 6, 12]],
  night: [['Torches, 2 dozen', 3, 6], ['Lantern oil (extra)', 3, 6]],
  water: [['Boat hire', 10, 18], ['Grappling hook', 5, 9]],
  escort: [['Wagon wheel repair', 8, 14], ['Road toll', 4, 8]],
  fake: [['Emotional support goat', 15, 30], ['"Morale-boosting" ale, 2 barrels', 20, 40], ['Fancy hat (for disguise)', 12, 25], ['Map (lost)', 8, 15],
    ['Fire-ward salve', 10, 18], ['Holy water, 3 vials', 15, 24], ['Commemorative portrait', 25, 45], ['Second commemorative portrait', 25, 45], ['Lute strings', 4, 8]],
};

C.COMPLAINTS = [
  { who: 'Brannoc, landlord of the Bent Nail', text: '{a} started a fight in my tavern last night. Two chairs, one table and my good mirror. I want 30 gold.', cost: 30 },
  { who: 'Widow Marsh', text: 'One of your lot, {a}, tramped through my turnip beds on the way back from a job. I want it known.', cost: 10 },
  { who: 'Constable Dagny Holt', text: 'Your member {a} was found asleep in the town fountain. This is the second time. A fine of 15 gold is due.', cost: 15 },
  { who: 'Master Pellet, chandler', text: '{a} bought forty candles on the guild\'s name and has not paid. The amount is 18 gold.', cost: 18 },
  { who: 'A Concerned Ratepayer', text: 'I saw {a} singing loudly outside the chapel at the third bell. Disgraceful. I expect an apology in writing.', cost: 0 },
];

C.DIRECTIVES = [
  { id: 'hazard_act', title: 'The Hazard Disclosure Act', text: 'From tomorrow, every quest posted in Millbrook must carry at least one Hazard Classification. Postings that carry none will be fined 20 gold each.' },
  { id: 'form9', title: 'Monster Remains Disposal (Form 9)', text: 'After any job involving beasts or large monsters, the posting guild must file Form 9 (Disposal of Remains) within two days. Failure to file carries a fine of 25 gold.' },
  { id: 'night_permit', title: 'Nocturnal Operations Permit', text: 'Postings classified as Night Work now require a permit of 10 gold, payable when posting.' },
  { id: 'census', title: 'Quarterly Membership Census', text: 'All chartered guilds must declare their membership by rank. Returns are due within three days. Inaccurate returns will be fined.' },
];

// --------------------------------------------------------------- dialogue ---
C.TALK = {
  greet: ['Morning, boss.', 'Guildmaster.', 'Oh! Didn\'t see you there.', 'Come to check on us, have you?', 'Any work going?'],
  idle: ['Quiet day. Too quiet. I\'m going soft.', 'Been three days without a job. My sword\'s getting rusty.', 'Anything on the board for someone of my rank?', 'Honestly? I could use the coin.'],
  happy: ['Best guild I\'ve worked for. Don\'t let it go to your head.', 'The stew\'s gotten better. Or I\'ve gotten hungrier.', 'Feeling good, boss.'],
  unhappy: ['I\'ll be honest, boss. I\'m thinking about the Gilded Lions.', 'The bunks are lumpy, the pay is late and the ale is watered.', 'Nobody listens around here.'],
  underpaid: ['That {q} posting? {g} gold for that? Not a chance.', 'Who\'s going to risk their neck on "{q}" for {g} gold?'],
  injured: ['Still mending. Doctor says another day or two.', 'Don\'t look at me like that. It\'s just a flesh wound.'],
  rumor: ['Heard something about that business at {place}. {clue}', 'My cousin lives out by {place}. She says: "{clue}"', 'You didn\'t hear it from me, but about {place}: {clue}'],
  barkeep: ['Gossip\'s cheap, ale isn\'t. But here\'s one for free: about {place}, {clue}', 'Folk from {place} were in last night. {clue}'],
  nothing: ['Nothing worth repeating, boss.', 'Quiet in town. Too quiet.', 'All I\'ve heard is complaints about the cart tax.'],
};
