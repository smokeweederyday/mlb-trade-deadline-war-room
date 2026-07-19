# Boring Bets

**Data over hype.**

Boring Bets is a data-dense sports research terminal. The current production engine focuses on MLB, with a multi-sport Today’s Card shell ready for additional league feeds.

## Local preview

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/todays-card.html
```

The browser displays static HTML, JavaScript, CSS, and generated JSON. It does not need a public website or application server.

## Refresh today’s data once

```bash
python3 -u scripts/scheduled_refresh.py --days-ahead 0 --continue-on-error
```

That refreshes the MLB research feed, official status and scores, affiliated Minor League cards, and the lightweight files used by Today’s Card.

## Keep local cards updating

```bash
python3 -u scripts/run_local_card_refresh.py
```

Leave that Terminal window open. It performs fast card/status updates every 15 minutes and a full MLB enrichment every hour. The Mac must be awake and connected to the internet.

## Automatic GitHub refresh

`.github/workflows/mlb-games.yml` updates generated card data on GitHub even before the website is publicly available. GitHub Actions runs independently of GitHub Pages. Once the workflow changes are pushed and Actions are enabled, the repository can keep its JSON feeds current without the local Mac running.

Sportsbook prices require an `ODDS_API_KEY` repository secret. Without it, the cards continue to populate but display **Odds pending**.

## Data flow

```text
External sports feeds
        ↓
Python refresh and enrichment
        ↓
data/games/YYYY-MM-DD.json
        ↓
data/cards/YYYY-MM-DD/<league>.json
        ↓
Today’s Card and game pages
```

## Repository organization

- `data/games/` — enriched game research shards
- `data/cards/` — lightweight league/date card feeds
- `data/live-games/` — lightweight official status and score mirrors
- `scripts/` — refresh, build, validation, and maintenance commands
- `docs/` — architecture, roadmap, automation, and archived phase notes
- `tests/fixtures/` — sample and debugging data
- `archive/` — old installers and source backups that should not clutter the root

See [`docs/DATA-AUTOMATION.md`](docs/DATA-AUTOMATION.md) for the complete update model.

## Publishing

1. Test locally.
2. Review changes in GitHub Desktop.
3. Commit to the current branch.
4. Push origin.
5. Confirm the **MLB Games Data** workflow is enabled in GitHub Actions.

Do not place backup ZIP files inside the repository.
