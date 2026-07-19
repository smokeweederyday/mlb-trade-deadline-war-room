# Today’s Card — Baseball logo fix

This patch changes baseball cards from the MLB-only cap-logo path to the universal team-ID logo path used by both MLB and affiliated Minor League clubs.

Fallback order:

1. A logo URL supplied by the event feed, when available.
2. `https://www.mlbstatic.com/team-logos/{teamId}.svg`
3. The older MLB cap-on-dark path.
4. A clean abbreviation mark instead of a broken image.

Validate from the repository root:

```bash
python3 -u scripts/check_todays_card_baseball_logos.py
```
