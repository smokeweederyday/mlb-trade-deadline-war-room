# Live Game Center — Phase 1

This phase adds the first full Live Game Center without replacing the existing matchup research page.

## Added

- `live.html`
- `live.css`
- `live.js`
- `data/live-game-index.json`
- `data/live-lineups.json`
- one compact date-specific file for every MLB schedule date in `data/live-games/`
- `data/ballparks/index.json`
- one isolated editable geometry file for every venue in `data/ballparks/venue-*.json`
- `scripts/check_live_game_center.py`
- Live navigation links in the major page headers

## Current behavior

- Loads only the selected date rather than downloading the 196 MB `games.json`
- Switches games without a full page reload
- Shows all games from the selected schedule date
- Uses current lineups when present and clearly labeled last-confirmed lineups as fallback
- Uses existing pitcher, bullpen, BvP, venue, weather and market structures when available
- Runs an explicitly labeled simulated live feed so the workstation can be tested between games
- Updates pitch count, count, outs, inning, bases, player pulse, event log, score bug and alerts
- Makes the ballpark, infield, outfield, pitcher, batter and fielder objects interactive
- Includes collapsible game and event rails plus the future AI chat drawer

## Important

The 34 ballpark geometries are unique and isolated for later manual refinement, but Phase 1 geometry is a visual placeholder, not a claim of dimension accuracy.

The simulated feed is intentionally separate from the future production live collector. The next data phase should replace the simulation timer with normalized live event packets while retaining the same rendering functions.

## Check

```bash
python3 -u scripts/check_live_game_center.py
```
