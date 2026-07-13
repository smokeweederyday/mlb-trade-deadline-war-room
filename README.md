# Boring Bets

**Data over hype.**

Static GitHub Pages site for daily betting cards, individual play analysis, tracked results, and betting tools.

## Local preview

1. Open this folder in Visual Studio Code.
2. Start **Live Server** from `index.html`.
3. Use the `http://127.0.0.1:5500/` address opened by Live Server.

## Daily card workflow

Edit only:

`data/todays-card.json`

Each play needs an ID, sport, matchup, MLB team IDs, play, odds, units, rating, handicapper, and analysis. The same record powers:

- Homepage featured plays
- Today’s Card
- Individual play-analysis pages

## Publishing

1. Test locally with Live Server.
2. Open GitHub Desktop.
3. Review changed files.
4. Commit to `main`.
5. Push origin.
6. GitHub Pages republishes the site.

## Trade Deadline automation

- `.github/workflows/update.yml` runs the updater.
- `scripts/update_data.py` refreshes automated data.
- `data/site-data.json` powers `trade-deadline.html`.
- Rumors remain manually approved in `data/manual-rumors.json`.

## Domain

The purchased domain is `boringbets.gg`. Do not rename `CNAME.example` to `CNAME` until GitHub Pages and DNS are configured together.
