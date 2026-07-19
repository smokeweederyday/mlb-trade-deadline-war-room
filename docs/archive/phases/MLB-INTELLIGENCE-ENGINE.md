# MLB Intelligence Engine — Phase 1

This install begins the advanced-stat enrichment layer without fabricating unavailable data.

## Included

- Calculates FIP from MLB component statistics for season, recent, location and handedness blocks when inputs exist.
- Keeps the FIP constant configurable with `BORING_BETS_FIP_CONSTANT` and records provenance in JSON.
- Adds rank direction rules so rank 1 always means best.
- Ranks available offense snapshots for AVG, K%, BB%, OBP and OPS.
- Stores rank coverage beside every rank instead of presenting partial-slate ranks as league-wide ranks.
- Adds an `intelligence_meta` block to each game.

## Intentionally not fabricated

- xFIP remains provider-pending.
- wRC+ remains provider-pending.
- A true 1–30 league rank requires the upcoming all-team cache. Until that is installed, each rank includes its comparison-pool coverage.

## Run

```bash
python3 -u scripts/update_games.py 2026-07-16
```

Optional season-specific FIP constant:

```bash
export BORING_BETS_FIP_CONSTANT="3.10"
```

## Next phase

1. All-30-team daily cache.
2. FanGraphs-compatible wRC+ and xFIP provider adapter.
3. Rank-color rendering on `game.html`.
4. Hourly GitHub Action refresh.
