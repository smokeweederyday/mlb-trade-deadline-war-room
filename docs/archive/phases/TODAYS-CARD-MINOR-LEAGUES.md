# Today’s Card — Minor League Baseball expansion

This overlay preserves the green date arrows in the date strip and adds persistent green arrows on the left and right edges of the screen.

## Connected affiliated levels

- Triple-A
- Double-A
- High-A
- Single-A
- Rookie

Each level uses the same compact baseball game-card renderer as MLB: team marks, matchup, start time or score, probable pitchers when published, venue, Research and Live Center actions.

## Build the complete 2026 schedules

From the `boring-bets` repository root:

```bash
python3 -u scripts/build_minor_league_schedules.py --season 2026
```

This writes five season archives under:

```text
data/schedules/baseball/2026/
```

Today’s Card filters those full-season archives to whatever date the user selects.

## Refresh today’s minor-league games

```bash
python3 -u scripts/build_minor_league_schedules.py --season 2026 --date 2026-07-19
```

Date refresh mode merges fresh status, score and probable-pitcher information into the season archives and also writes lightweight daily files under:

```text
data/cards/2026-07-19/
```

## Validate the installation

```bash
python3 -u scripts/check_todays_card_minor_leagues.py
```

The schedule builder uses the MLB Stats API affiliated-level sport IDs:

```text
Triple-A  11
Double-A  12
High-A    13
Single-A  14
Rookie    16
```
