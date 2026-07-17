#!/usr/bin/env python3
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
raw=json.loads((root/'data/games.json').read_text())
games=raw.get('games',raw)
game=next((g for g in games if g.get('id')=='2026-07-16-nym-phi'),None)
if not game: raise SystemExit('Game 2026-07-16-nym-phi not found')
failed=False
for side in ('away','home'):
    p=game['pitchers'][side]
    print('\n'+p['name'])
    for tf in ('last_7','last_30','season'):
        stats=p['stats'][tf]
        for split in ('vs_lhh','vs_rhh'):
            vals=[]
            for loc in ('all','home','away'):
                b=stats.get(loc,{}).get(split,{})
                vals.append((b.get('whip'),b.get('fip'),b.get('xfip'),b.get('avg_against')))
            print(tf,split,'all/home/away:',vals)
            available=[v for v in vals if any(x is not None for x in v)]
            if len(available)>=2 and len(set(available))<2:
                failed=True
                print('  FAIL: location values are identical')
            for loc in ('all','home','away'):
                b=stats.get(loc,{}).get(split,{})
                if b.get('era') is not None: failed=True
if failed: raise SystemExit('\nFAIL: pitcher handedness location splits are not responding correctly.')
print('\nPASS: pitcher handedness splits respond to All/Home/Away and ERA remains blank.')
