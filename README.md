# The Guildmaster's Desk

A slow, point-and-click paperwork game set in a fantasy town. You inherit the run-down Rusty Flagon Adventurers' Guild and run it from behind a desk: you read letters, fill in forms, post jobs to the board and live with the consequences. You never swing a sword.

Open `index.html` in a browser. No build step. It saves to the browser each morning.

You sit at your desk from 08:00 to 18:00 with a cup of coffee. Every action costs minutes: skimming a letter (3), reading it properly (12+), drafting a posting (25), walking to another room (5), talking to someone (10). Low focus blurs the words on the page and slows you down; the coffee mug holds three sips, and the barkeep refills it.

- **The inbox.** Requests from farmers, merchants, nobles, the Council and the Temple; the *Millbrook Crier*; invoices; expense claims; complaints; job applications; promotion petitions; death notices; Council directives and forms.
- **Reading matters.** Each request has a hidden truth: the "wolves" might be a werewolf. The clues are in the full text, in follow-up letters, in the newspaper and in tavern gossip. Nobles understate; farmers exaggerate.
- **Posting jobs.** Form QP-1: minimum rank, party size, pay and hazard tags. Members choose their own work overnight. Underpay and nobody bites; under-rank it and the wrong people take it; leave a hazard off and they walk in unprepared.
- **Consequences come back as paper.** Job reports, client letters, padded expense claims to check line by line, Form 9 disposal paperwork, Council inquiries for misclassified jobs, a weekly inspection that grades your paperwork, results and accuracy.
- **Around the hall.** Point-and-click rooms: your office, the main hall and quest board, the tavern (gossip, ale prices, coffee), the training yard, the inn and, once founded, the Academy of Mind and Arcana. Hire a clerk, barkeep, drill sergeant, innkeeper and dean. Commission building works.

Code: `js/content.js` (all the writing and tables), `core.js` (rules, documents and the overnight simulation, DOM-free so it runs headless), `scenes.js` (pixel-art rooms and hotspots), `ui.js` (papers, forms and books), `main.js` (boot and save).

The Kairosoft-style real-time version of the guild (adventurers living their own lives in the hall) lives on the `claude/tender-clarke-9qzql4` branch.
