# Stitch Keeper

A knitting companion web app for phone and tablet. It works offline and you can add it to your home screen.

## Features (step 1)
- Projects, each with its own row count and an optional "of N rows" goal and progress bar
- Extra counters (for example an 8-row cable repeat) that can advance automatically with each row and roll over into "repeat 2, 3, …"
- Undo for the last 50 changes, a reset button for rows and counters
- Notes for each project
- "Keep screen on" while knitting
- Backup and restore through a file (data is stored only on the device)

## Running it
- **On a computer:** open `index.html` in a browser. Offline mode and installing need a web address (see below).
- **On a phone:** host it, for example with GitHub Pages, open the address in Chrome or Safari, and choose *Add to Home screen*.
- When you change files, bump `CACHE_VERSION` in `sw.js` so installed copies update.

## Roadmap
1. ~~Row counter~~ ✅
2. Pattern viewer: open a PDF and keep a highlight bar on the current row, linked to the row counter
3. Ravelry: load projects and patterns from your Ravelry account
