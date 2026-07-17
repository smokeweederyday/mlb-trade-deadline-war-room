#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
raw = json.loads((root / 'data' / 'games.json').read_text())
games = raw.get('games', raw) if isinstance(raw, dict) else raw
issues=[]; checked=0
for game in games:
    pitchers=game.get('pitchers')
    if not isinstance(pitchers,dict): continue
    for side in ('away','home'):
        p=pitchers.get(side)
        if not isinstance(p,dict): continue
        for tf in ('last_7','last_30','season'):
            for loc in ('all','home','away'):
                block=p.get('stats',{}).get(tf,{}).get(loc,{})
                for split in ('vs_lhh','vs_rhh'):
                    sb=block.get(split,{})
                    if sb:
                        checked += 1
                        if sb.get('era') is not None:
                            issues.append(f"{p.get('name')} {tf}/{loc}/{split}: ERA must be null")
                        if sb.get('ranks',{}).get('era') is not None:
                            issues.append(f"{p.get('name')} {tf}/{loc}/{split}: ERA rank must be null")
                        for metric in ('whip','fip','xfip','avg_against'):
                            rank=sb.get('ranks',{}).get(metric)
                            pool=sb.get('rank_pool_size',{}).get(metric)
                            if rank is not None and pool is not None and not (1 <= rank <= pool):
                                issues.append(f"{p.get('name')} {tf}/{loc}/{split} {metric}: impossible rank {rank}/{pool}")
        if checked >= 12: break
    if checked >= 12: break
print(f'Checked {checked} pitcher handedness blocks.')
if issues:
    print('FAIL:')
    for issue in issues[:30]: print(' -',issue)
    raise SystemExit(1)
print('PASS: split ERA is blank and all populated split ranks fit their pools.')
