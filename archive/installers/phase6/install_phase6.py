#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
PATCH = Path(__file__).resolve().parent

required = [
    ROOT / 'assets/js/widgets/pitcherWidget.js',
    ROOT / 'assets/js/sports/mlbEngine.js',
    ROOT / 'styles.css',
]
missing = [str(p) for p in required if not p.exists()]
if missing:
    print('Run this installer from the main Boring Bets folder.')
    print('Missing:')
    for item in missing:
        print(f'  - {item}')
    sys.exit(1)

for rel in ('assets/js/widgets/pitcherWidget.js', 'assets/js/sports/mlbEngine.js'):
    src = PATCH / rel
    dst = ROOT / rel
    backup = dst.with_suffix(dst.suffix + '.phase6-backup')
    if not backup.exists():
        shutil.copy2(dst, backup)
    shutil.copy2(src, dst)
    print(f'Installed {rel}')

styles = ROOT / 'styles.css'
css = (PATCH / 'styles-pitcher-rank-table.css').read_text()
start = '/* BEGIN MLB INTELLIGENCE PHASE 6 */'
end = '/* END MLB INTELLIGENCE PHASE 6 */'
text = styles.read_text()
block = f'\n{start}\n{css.rstrip()}\n{end}\n'
if start in text and end in text:
    before = text.split(start, 1)[0].rstrip()
    after = text.split(end, 1)[1].lstrip()
    text = before + block + after
else:
    text = text.rstrip() + '\n' + block
styles.write_text(text)
print('Updated styles.css without replacing existing navigation styles.')
print('Phase 6 installed.')
