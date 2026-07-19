# Today’s Card — Multi-Sport Shell

This phase replaces the MLB-only card board with a universal sport-and-league interface.

## Included

- compact sport buttons
- expandable league dropdowns
- compact multi-column event cards
- MLB connected through the existing date-specific live files
- fallback to `data/games.json` when date files are unavailable
- current Boring Bets plays attached to their game cards
- status filters for all, live, upcoming, final and plays
- date navigation
- URL and local-storage state for sport and league selection
- ready-to-connect league shells for basketball, football, hockey, soccer, tennis, combat sports and golf
- lower hockey leagues including AHL, ECHL, OHL, WHL, QMJHL, NCAA, USHL and international leagues

## Future league feed contract

Place a league file at:

```text
data/cards/YYYY-MM-DD/<league-id>.json
```

The file may contain any one of these arrays:

```json
{
  "events": []
}
```

```json
{
  "games": []
}
```

```json
{
  "matches": []
}
```

```json
{
  "fights": []
}
```

The current MLB feed continues to use:

```text
data/live-games/YYYY-MM-DD.json
```

## Install

Copy the contents of this folder into the root of the current `boring-bets` repository and choose Merge/Replace.

Run:

```bash
python3 -u scripts/check_todays_card_multisport.py
```

Then launch the local server and open `todays-card.html`.
