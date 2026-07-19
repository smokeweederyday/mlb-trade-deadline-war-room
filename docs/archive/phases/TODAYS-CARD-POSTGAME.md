# Today’s Card — Past-Date Final Scores and Finished-Game Breakdowns

This patch separates pregame and postgame navigation.

## Behavior

- Today and future events continue to open the normal research page or Live Center.
- Past-date event cards display the synchronized final score.
- Clicking a past game opens `finished-game.html`, not the normal pregame card.
- The finished-game page includes the final scoreboard, inning line, pitching decisions, published plays, grading, and postgame evaluations when present.
- An archived-research link remains available from the finished-game page.
- Postponed and cancelled games are not forced to FINAL.

## Validate the installation

```bash
python3 -u scripts/check_todays_card_postgame.py
```

## Synchronize MLB final scores

One past date:

```bash
python3 -u scripts/sync_baseball_final_scores.py --season 2026 --date 2026-07-18
```

All past dates in the 2026 season through yesterday:

```bash
python3 -u scripts/sync_baseball_final_scores.py --season 2026
```

The command updates only result fields inside `data/live-games/YYYY-MM-DD.json`. Existing enriched pitcher, offense, lineup, bullpen, weather, and market data remain in place.

## Refresh affiliated minor-league results

```bash
python3 -u scripts/build_minor_league_schedules.py --season 2026
```

The updated builder stores final scores, inning lines, and winning/losing/save decisions in the season archives.
