# Phase 8B — Batter vs Pitcher Lineup History

Adds career MLB Stats API batter-vs-pitcher PA, K, BB, AVG and OPS to each lineup row.

Color is from the pitcher's perspective:
- batter OPS <= .650: green (pitcher success)
- .650–.849: neutral
- batter OPS >= .850: red (batter success / pitcher concern)

Opacity is sample confidence, scaling to full brightness at 50 PA. Missing BvP remains grey.
