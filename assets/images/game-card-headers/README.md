# Boring Bets Game-Card Header Library

This is the human-maintained source library for every game-card header across
Today’s Card and the future Slate.

Organization:

`<sport>/<league-or-series>/entities/<team-venue-track-event>/...`

The generated league folders intentionally cover more competitions than the
current UI. Every current Slate sport and league must be represented here.

Run:

- `python3 scripts/generate_game_card_header_folders.py`
- `python3 scripts/check_game_card_header_coverage.py`
