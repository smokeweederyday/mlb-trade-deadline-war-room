#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
payload = json.loads((root / 'data' / 'games.json').read_text())
games = payload.get('games', []) if isinstance(payload, dict) else payload
checked = 0
errors = []
for game in games:
    for side in ('away','home'):
        pitcher = game.get('pitchers',{}).get(side,{})
        name = pitcher.get('name','Unknown')
        season = pitcher.get('stats',{}).get('season',{}).get('all',{})
        for split_key in ('vs_lhh','vs_rhh'):
            split = season.get(split_key,{})
            if not split:
                continue
            checked += 1
            print(
                f"{name} {split_key}: ERA={split.get('era')} "
                f"WHIP={split.get('whip')} AVG={split.get('avg_against')} "
                f"FIP={split.get('fip')} xFIP={split.get('xfip')}"
            )
            if split.get('era') is not None:
                errors.append(f'{name} {split_key}: ERA should be unavailable, not fabricated')
            if all(split.get(metric) is None for metric in ('whip','avg_against','fip','xfip')):
                errors.append(f'{name} {split_key}: no real split metrics populated')
            if not split.get('era_unavailable_reason'):
                errors.append(f'{name} {split_key}: missing ERA explanation')
    if checked >= 8:
        break
if checked == 0:
    errors.append('No pitcher handedness blocks found')
if errors:
    print('FAIL:')
    for error in errors[:20]: print(' -', error)
    raise SystemExit(1)
print(f'PASS: verified {checked} real pitcher handedness blocks; split ERA fails honestly.')
