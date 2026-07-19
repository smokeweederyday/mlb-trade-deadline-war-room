# Live Game Center — Dashboard Phase 3

This phase reorganizes the live page around the fixed-height decision dashboard and a complete scrolling game dossier.

## Dashboard changes

- Replaces the abstract plate silhouette with a detailed broadcast-style SVG scene.
- Keeps the pitcher visible on the mound behind the batter and strike-zone overlay.
- Shrinks the plate heat-map box so it no longer consumes the full HUD.
- Removes the large score bug from below the central ballpark.
- Moves inning, outs, balls, strikes, base state, latest pitch location, batter, pitcher, leverage, market and compact line score under the right-side Lineups/Pitcher/Fielders panel.
- Makes that live game-state module collapsible.

## Scrolling dossier

Below the dashboard, the page now renders every currently available game block:

- game overview
- live matchup
- both starting pitchers
- offense data when present
- both lineups and BvP fields
- both bullpens
- park geometry and weather
- defensive alignment
- market data
- complete live event log
- explicit data availability inventory

Missing provider blocks remain clearly labeled rather than being invented.

## Validation

```bash
python3 -u scripts/check_live_dashboard_phase3.py
```
