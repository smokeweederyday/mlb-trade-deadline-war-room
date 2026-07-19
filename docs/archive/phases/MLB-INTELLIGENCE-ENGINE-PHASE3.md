# MLB Intelligence Engine — Phase 3

Corrects league ranking pools. MLB's aggregate stats endpoint was not returning
30 team-level rows, which caused ranks of only 1 or 2. The engine now fetches
all 30 club snapshots in parallel, caches the complete matrix by date, and
refuses to label a rank as league-wide unless all 30 MLB team IDs are present.

To force a fresh matrix:

```bash
BORING_BETS_REBUILD_RANK_CACHE=1 python3 -u scripts/update_games.py YYYY-MM-DD
```
