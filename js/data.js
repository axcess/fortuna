// ============================================================================
//  DATA — static content tables for Guildhall: Rise of the Rusty Flagon
// ============================================================================
'use strict';

const DATA = {};

DATA.TILE = 32;
DATA.MAP_W = 24;
DATA.MAP_H = 15;
DATA.MIN_PER_TICK = 2;          // game minutes per sim tick
DATA.DAYS_PER_SEASON = 28;
DATA.SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

// ---------------------------------------------------------------- ranks ----
DATA.RANKS = [
  { id: 'F', renown: 0,    roster: 4,  title: 'Laughingstock' },
  { id: 'E', renown: 120,  roster: 6,  title: 'Upstart' },
  { id: 'D', renown: 350,  roster: 8,  title: 'Respectable' },
  { id: 'C', renown: 800,  roster: 10, title: 'Renowned' },
  { id: 'B', renown: 1600, roster: 12, title: 'Celebrated' },
  { id: 'A', renown: 3000, roster: 14, title: 'Legendary' },
  { id: 'S', renown: 5200, roster: 16, title: 'Mythic' },
];

// --------------------------------------------------------------- classes ---
// stats: mig (might), arc (arcana), agi (agility), spi (spirit)
DATA.CLASSES = {
  warrior: { name: 'Warrior', color: '#b8483a', trim: '#d9d9d9', main: 'mig', second: 'spi',
             base: { mig: 10, arc: 2, agi: 5, spi: 5 }, icon: '⚔️', desc: 'Front-liner. Shrugs off blows.' },
  mage:    { name: 'Mage',    color: '#4a55b8', trim: '#e8c64a', main: 'arc', second: 'spi',
             base: { mig: 2, arc: 11, agi: 4, spi: 5 }, icon: '🔮', desc: 'Glass cannon of the arcane.' },
  rogue:   { name: 'Rogue',   color: '#3d3d4a', trim: '#8a6a3a', main: 'agi', second: 'arc',
             base: { mig: 4, arc: 5, agi: 11, spi: 2 }, icon: '🗡️', desc: 'Locks, traps and back-stabs.' },
  cleric:  { name: 'Cleric',  color: '#e6e0cc', trim: '#d4a52a', main: 'spi', second: 'mig',
             base: { mig: 5, arc: 4, agi: 3, spi: 10 }, icon: '✨', desc: 'Heals the party, cuts injury risk.' },
  ranger:  { name: 'Ranger',  color: '#3f7a3a', trim: '#7a5230', main: 'agi', second: 'mig',
             base: { mig: 6, arc: 3, agi: 9, spi: 4 }, icon: '🏹', desc: 'Tracker. Balanced and steady.' },
  bard:    { name: 'Bard',    color: '#9c3f8c', trim: '#f0d060', main: 'spi', second: 'agi',
             base: { mig: 3, arc: 6, agi: 6, spi: 7 }, icon: '🎻', desc: 'Lifts party morale. Makes friends fast.' },
};
DATA.STAFF = {
  caretaker: { name: 'Caretaker', color: '#6b5a44', wage: 4, icon: '🧹', desc: 'Clears rubble, mends floors and furniture.' },
  cook:      { name: 'Cook',      color: '#e8e2d2', wage: 5, icon: '🍲', desc: 'Hot meals: better hunger and a mood boost.' },
  barkeep:   { name: 'Barkeep',   color: '#7a3a2a', wage: 5, icon: '🍺', desc: 'Tavern earns 60% more from townsfolk.' },
};

// ----------------------------------------------------------------- traits --
DATA.TRAITS = {
  glutton:   { name: 'Glutton',    desc: 'Gets hungry fast; loves a good meal.' },
  nightowl:  { name: 'Night Owl',  desc: 'Stays up late, sleeps in.' },
  hothead:   { name: 'Hot-headed', desc: 'Picks fights. Hits harder.' },
  pious:     { name: 'Pious',      desc: 'Finds joy at the shrine. Dislikes drunkards.' },
  bookworm:  { name: 'Bookworm',   desc: 'Reading is fun. Learns arcana quickly.' },
  loner:     { name: 'Loner',      desc: 'Needs little company. Dislikes crowds.' },
  greedy:    { name: 'Greedy',     desc: 'Wants raises. Loves dice.' },
  brave:     { name: 'Brave',      desc: 'Shines on dangerous quests.' },
  coward:    { name: 'Cowardly',   desc: 'Unnerved by dangerous quests.' },
  charming:  { name: 'Charming',   desc: 'Makes friends easily. Townsfolk adore them.' },
  diligent:  { name: 'Diligent',   desc: 'Does chores unprompted. Needs purpose.' },
  lazy:      { name: 'Lazy',       desc: 'Sleeps a lot. Avoids chores.' },
  neat:      { name: 'Neat',       desc: 'Hates dirt and dilapidation.' },
  slob:      { name: 'Slob',       desc: 'Rarely washes. Does not mind mess.' },
  lucky:     { name: 'Lucky',      desc: 'Fortune favours them on quests.' },
  drunkard:  { name: 'Drunkard',   desc: 'Lives for the tavern.' },
};
DATA.TRAIT_CONFLICTS = [
  ['neat', 'slob'], ['diligent', 'lazy'], ['pious', 'drunkard'], ['loner', 'charming'],
  ['brave', 'coward'], ['hothead', 'pious'], ['greedy', 'pious'],
];
DATA.TRAIT_EXCLUSIVE = DATA.TRAIT_CONFLICTS; // can't roll both on one character

// ------------------------------------------------------------------ rooms --
// use: 'adj' => character stands on a walkable tile next to the footprint
//      'on'  => character is drawn on top of the furniture (beds)
// cap: how many characters can use at once.  appeal: [value, radius]
DATA.ROOMS = {
  board:   { name: 'Quest Board',     w: 1, h: 1, cost: 0,   rank: 'F', cat: 'Guild',   cap: 2, unique: true, appeal: [1, 1],
             desc: 'Townsfolk pin requests here. Adventurers check it for work.' },
  desk:    { name: 'Reception Desk',  w: 2, h: 1, cost: 220, rank: 'E', cat: 'Guild',   cap: 2, unique: true, appeal: [2, 2],
             desc: '+2 quest postings per day and more petitioners.' },
  cot:     { name: 'Straw Cot',       w: 1, h: 2, cost: 25,  rank: 'F', cat: 'Rest',    cap: 1, bed: 1, rest: 14, use: 'on', appeal: [-1, 1],
             desc: 'Scratchy, but better than the floor.' },
  bunk:    { name: 'Bunk Bed',        w: 1, h: 2, cost: 90,  rank: 'E', cat: 'Rest',    cap: 2, bed: 2, rest: 17, use: 'on', appeal: [0, 1],
             desc: 'Sleeps two. Decent rest.' },
  bed:     { name: 'Feather Bed',     w: 2, h: 2, cost: 260, rank: 'C', cat: 'Rest',    cap: 1, bed: 1, rest: 24, use: 'on', appeal: [3, 2],
             desc: 'Luxurious. Waking up here is a joy.' },
  infirm:  { name: 'Infirmary Cot',   w: 1, h: 2, cost: 140, rank: 'E', cat: 'Rest',    cap: 1, heal: 3, use: 'on', appeal: [0, 1],
             desc: 'Injured adventurers recover 3x faster.' },
  hearth:  { name: 'Hearth & Pot',    w: 2, h: 2, cost: 120, rank: 'F', cat: 'Needs',   cap: 4, appeal: [2, 2],
             desc: 'Hot meals. 2g per serving.' },
  table:   { name: 'Long Table',      w: 3, h: 1, cost: 45,  rank: 'F', cat: 'Needs',   cap: 6, appeal: [1, 1],
             desc: 'Meals eaten together build friendships.' },
  basin:   { name: 'Wash Basin',      w: 1, h: 1, cost: 30,  rank: 'F', cat: 'Needs',   cap: 1, appeal: [0, 1],
             desc: 'A cold splash. Restores hygiene.' },
  bath:    { name: 'Bathhouse',       w: 2, h: 2, cost: 320, rank: 'C', cat: 'Needs',   cap: 3, appeal: [4, 2],
             desc: 'Hot baths: hygiene, fun and company.' },
  bar:     { name: 'Tavern Bar',      w: 3, h: 1, cost: 200, rank: 'E', cat: 'Leisure', cap: 5, appeal: [2, 2],
             desc: 'Fun and social. Townsfolk visit and spend coin.' },
  dice:    { name: 'Dice Table',      w: 2, h: 1, cost: 70,  rank: 'F', cat: 'Leisure', cap: 4, appeal: [1, 1],
             desc: 'Games of chance. Greedy folk adore it.' },
  shelf:   { name: 'Bookshelf',       w: 2, h: 1, cost: 60,  rank: 'F', cat: 'Training',cap: 2, appeal: [1, 1],
             desc: 'Study raises Arcana. Bookworms read for fun.' },
  dummy:   { name: 'Training Dummy',  w: 1, h: 1, cost: 35,  rank: 'F', cat: 'Training',cap: 1, appeal: [0, 1],
             desc: 'Drills raise Might.' },
  butts:   { name: 'Archery Butts',   w: 2, h: 1, cost: 90,  rank: 'E', cat: 'Training',cap: 2, appeal: [0, 1],
             desc: 'Target practice raises Agility.' },
  shrine:  { name: 'Shrine',          w: 2, h: 2, cost: 160, rank: 'E', cat: 'Training',cap: 3, appeal: [3, 2],
             desc: 'Prayer raises Spirit. The pious find peace.' },
  forge:   { name: 'Smithy',          w: 2, h: 2, cost: 420, rank: 'D', cat: 'Guild',   cap: 1, unique: true, appeal: [-1, 2],
             desc: 'Unlocks gear upgrades for adventurers.' },
  alch:    { name: 'Alchemy Table',   w: 2, h: 1, cost: 280, rank: 'D', cat: 'Guild',   cap: 1, unique: true, appeal: [1, 1],
             desc: 'Brews potions: +8% quest success, -injuries.' },
  scry:    { name: 'Scrying Orb',     w: 1, h: 1, cost: 900, rank: 'B', cat: 'Guild',   cap: 1, unique: true, appeal: [4, 2],
             desc: 'Distant requests: +1 quest tier offered, +renown.' },
  trophy:  { name: 'Trophy Case',     w: 1, h: 1, cost: 150, rank: 'D', cat: 'Decor',   cap: 0, appeal: [5, 3],
             desc: 'Displays spoils. +1 renown per day.' },
  plant:   { name: 'Potted Fern',     w: 1, h: 1, cost: 15,  rank: 'F', cat: 'Decor',   cap: 0, appeal: [3, 2],
             desc: 'A little green goes a long way.' },
  banner:  { name: 'Guild Banner',    w: 1, h: 1, cost: 40,  rank: 'F', cat: 'Decor',   cap: 0, appeal: [4, 3],
             desc: 'Pride in the colours.' },
  rug:     { name: 'Woven Rug',       w: 2, h: 2, cost: 55,  rank: 'F', cat: 'Decor',   cap: 0, appeal: [3, 2], walkable: true,
             desc: 'Warm underfoot. Can be walked on.' },
  statue:  { name: 'Hero Statue',     w: 1, h: 1, cost: 380, rank: 'B', cat: 'Decor',   cap: 0, appeal: [9, 4],
             desc: 'A monument to guild heroes. +2 renown/day.' },
};
DATA.BUILD_CATS = ['Rest', 'Needs', 'Leisure', 'Training', 'Guild', 'Decor'];

// ---------------------------------------------------------------- regions --
DATA.REGIONS = [
  { id: 'outskirts', name: 'Millbrook Outskirts', rank: 'F', tier: 1,
    foes: ['giant rats', 'goblins', 'kobolds', 'bandits', 'feral boars'],
    places: ['Millbrook', 'the Old Mill', 'Farmer Hobb\'s field', 'the King\'s Road'] },
  { id: 'woods', name: 'Whisperwood', rank: 'E', tier: 2,
    foes: ['dire wolves', 'a spider brood', 'an owlbear', 'a mad dryad', 'gnolls'],
    places: ['Whisperwood', 'the Hollow Oak', 'Mosslight Glade', 'the Weeping Brook'] },
  { id: 'crypts', name: 'Sunken Crypts', rank: 'D', tier: 3,
    foes: ['ghouls', 'a barrow wight', 'skeletal legionnaires', 'a death cult', 'a banshee'],
    places: ['the Sunken Crypts', 'Saint Aldric\'s Ossuary', 'the Drowned Chapel'] },
  { id: 'marsh', name: 'Mirefen Marsh', rank: 'C', tier: 4,
    foes: ['a bog hag coven', 'lizardfolk raiders', 'a swamp troll', 'will-o\'-wisps', 'a black dragon wyrmling'],
    places: ['Mirefen', 'the Rotting Stilts', 'Hag\'s Crossing'] },
  { id: 'peaks', name: 'Emberfang Peaks', rank: 'B', tier: 5,
    foes: ['fire giants', 'a wyvern pair', 'an orc warband', 'salamanders', 'a stone golem'],
    places: ['Emberfang', 'the Cinder Pass', 'Khaz Varn\'s gate'] },
  { id: 'ruins', name: 'Starfall Ruins', rank: 'A', tier: 6,
    foes: ['an eye tyrant', 'a lich\'s apprentice', 'runebound golems', 'mind flayers', 'a vampire lord'],
    places: ['the Starfall Ruins', 'the Shattered Observatory', 'the Vault of Ninefold Stars'] },
  { id: 'voidspire', name: 'The Voidspire', rank: 'S', tier: 7,
    foes: ['void horrors', 'the Starless Choir', 'a herald of the Void'],
    places: ['the Voidspire'] },
];
DATA.TIER_DIFF = [0, 7, 13, 21, 31, 44, 60, 80]; // per-recommended-member difficulty

DATA.QUEST_TYPES = [
  { k: 'slay',     fmt: 'Slay {foe} near {place}',        w: { mig: .5, agi: .2, arc: .2, spi: .1 }, risk: 1.2, days: 1.0 },
  { k: 'escort',   fmt: 'Escort {npc} past {place}',       w: { mig: .3, agi: .35, arc: .05, spi: .3 }, risk: .8, days: 1.4 },
  { k: 'invest',   fmt: 'Investigate {foe} at {place}',    w: { mig: .1, agi: .4, arc: .4, spi: .1 }, risk: .7, days: 1.0 },
  { k: 'banish',   fmt: 'Banish the curse on {place}',     w: { mig: .05, agi: .05, arc: .4, spi: .5 }, risk: .9, days: 1.1 },
  { k: 'retrieve', fmt: 'Retrieve {item} from {foe}',      w: { mig: .25, agi: .5, arc: .2, spi: .05 }, risk: 1.0, days: 1.2 },
  { k: 'gather',   fmt: 'Gather {herb} in {place}',        w: { mig: .1, agi: .4, arc: .25, spi: .25 }, risk: .5, days: .9 },
  { k: 'defend',   fmt: 'Defend {place} from {foe}',       w: { mig: .45, agi: .2, arc: .1, spi: .25 }, risk: 1.1, days: 1.3 },
];
DATA.Q_NPCS = ['a spice merchant', 'Lady Venn\'s courier', 'a pilgrim band', 'the tax collector', 'a runaway prince', 'a gnome tinkerer', 'a wedding party'];
DATA.Q_ITEMS = ['a stolen heirloom', 'the mayor\'s signet', 'a relic of Pelor', 'a sealed grimoire', 'a dwarven warhorn', 'a dragon egg'];
DATA.Q_HERBS = ['moonpetal', 'nightcap mushrooms', 'silverleaf', 'emberroot', 'ghostbloom'];

DATA.FACTIONS = {
  crown:    { name: 'The Crown',             icon: '👑', perk: 'At 50: debt payments 25% smaller.' },
  temple:   { name: 'Temple of the Dawn',    icon: '☀️', perk: 'At 50: injuries heal twice as fast.' },
  merchant: { name: 'Copperhand Consortium', icon: '💰', perk: 'At 50: all construction 15% cheaper.' },
  college:  { name: 'Arcane Collegium',      icon: '📜', perk: 'At 50: training gains +50%.' },
};
DATA.QTYPE_FACTION = { slay: 'crown', defend: 'crown', escort: 'merchant', retrieve: 'merchant',
                       banish: 'temple', gather: 'college', invest: 'college' };

// ------------------------------------------------------------------ names --
DATA.FIRST = ['Brom', 'Pip', 'Elowen', 'Tamsin', 'Garrick', 'Ysolde', 'Fenn', 'Mirela', 'Corwin', 'Thessaly',
  'Odo', 'Rhiannon', 'Bastian', 'Isolde', 'Kael', 'Nim', 'Wren', 'Darius', 'Sable', 'Hollis', 'Juniper',
  'Mags', 'Talia', 'Ulric', 'Vesper', 'Aldous', 'Briar', 'Cass', 'Dagny', 'Eamon', 'Faye', 'Grisel',
  'Hob', 'Ingrid', 'Jory', 'Kestrel', 'Lark', 'Morwen', 'Nell', 'Osric', 'Perrin', 'Quill', 'Rook',
  'Saoirse', 'Tobin', 'Una', 'Varek', 'Willa', 'Zephyr', 'Agnes', 'Bryn', 'Dorian', 'Esk', 'Gwyn'];
DATA.LAST = ['Ironfoot', 'Thistledown', 'Ashgrove', 'Copperkettle', 'Stormwhistle', 'Blackbriar', 'Fairweather',
  'Oakenshield', 'Underbough', 'Greymantle', 'Halfmoon', 'Brightwater', 'Mudwick', 'Quickfinger', 'Stonebrow',
  'Hollowell', 'Redmane', 'Duskwood', 'Pennywhistle', 'Grimsby', 'Larkspur', 'Tallowmere', 'Vane'];
DATA.ORIGINS = ['a farm outside Millbrook', 'the slums of Port Varra', 'a dwarven hold', 'an elven enclave',
  'a monastery in the hills', 'a travelling circus', 'a disgraced noble house', 'a fishing village',
  'the Collegium dormitories', 'a halfling burrow', 'an orcish clan', 'nowhere in particular'];
DATA.ANCESTRY = ['Human', 'Human', 'Human', 'Dwarf', 'Elf', 'Halfling', 'Half-Orc', 'Gnome', 'Tiefling', 'Dragonborn'];
DATA.SKIN = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#f7d9c4', '#b5d29b', '#c96b6b', '#9fb4c9'];
DATA.HAIR = ['#2b1d0e', '#5a3a1a', '#a0522d', '#d8b04a', '#e8e0c8', '#7a1f1f', '#222', '#6b6b6b', '#3a5a8a'];
DATA.TOWNS_CLOTH = ['#8a6d4b', '#6b7a4b', '#7a4b4b', '#4b5a7a', '#8a8a6b', '#5a4b6b'];

DATA.LORE = [
  'A tarnished badge: "Rusty Flagon Adventurers\' Guild — Est. 1012". Once, this place mattered.',
  'A torn ledger page lists heroes who once drank here: Sir Aldric the Bold, Merriwen Starseeker...',
  'A cracked portrait of a stern woman in plate. The plaque reads "Guildmistress Hela Grimm".',
  'A note in faded ink: "The Voidspire stirs again. We are too few. Close the doors and pray."',
  'A rusted key stamped with a flagon. Whatever it opened is long gone.',
  'A child\'s drawing of the guild hall, full of tiny smiling adventurers. Someone kept it.',
  'Scorched charter papers. The Crown once granted this guild a royal seal.',
  'A dice cup with three bone dice. All of them land on six. Suspicious.',
];

// --------------------------------------------------------------- goals -----
DATA.GOALS = [
  { id: 'rubble3', text: 'Clear 3 piles of rubble',             reward: { gold: 40 } },
  { id: 'board',   text: 'Repair the Quest Board',              reward: { gold: 30, renown: 10 } },
  { id: 'hearth',  text: 'Repair the Hearth',                   reward: { gold: 30 } },
  { id: 'quest1',  text: 'Complete your first quest',           reward: { gold: 50, renown: 10 } },
  { id: 'recruit', text: 'Recruit a new adventurer',            reward: { renown: 15 } },
  { id: 'friends', text: 'Two adventurers become Friends',      reward: { gold: 60 } },
  { id: 'rankE',   text: 'Reach Guild Rank E',                  reward: { gold: 100 } },
  { id: 'bar',     text: 'Build a Tavern Bar',                  reward: { renown: 30 } },
  { id: 'roof',    text: 'Patch every roof leak',               reward: { gold: 80, renown: 20 } },
  { id: 'lvl5',    text: 'Raise an adventurer to level 5',      reward: { gold: 120 } },
  { id: 'debt',    text: 'Pay off the Copperhand debt',         reward: { renown: 100 } },
  { id: 'rankC',   text: 'Reach Guild Rank C',                  reward: { gold: 500 } },
  { id: 'rankS',   text: 'Reach Guild Rank S',                  reward: { gold: 2000 } },
  { id: 'wyrm',    text: 'Slay the Voidwyrm',                   reward: {} },
];
