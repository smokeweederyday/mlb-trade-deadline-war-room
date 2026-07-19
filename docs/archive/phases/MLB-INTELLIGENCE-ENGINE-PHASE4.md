# MLB Intelligence Engine Phase 4 — 30-Team Rank Hotfix

Fixes two rank-destroying bugs:

1. The validated 30-team ranks were overwritten after ingestion by a legacy slate-only ranker.
2. Cached JSON team IDs are strings, while live-fetch IDs are integers; lookups now support both.

Force a clean cache rebuild once after installation.
