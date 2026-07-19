# Live Game Center — HUD Phase 2

This phase replaces the original decorative HUD geometry with two explicit coordinate systems.

## Field View

- Home plate is the origin `(0, 0)` in feet.
- Negative X points toward left field.
- Positive X points toward right field.
- Positive Y runs through center field.
- The infield uses 90-foot basepaths and a 60.5-foot mound distance.
- Wall geometry is stored as editable control points in `data/ballparks/`.
- Citizens Bank Park and the 2026 Kauffman Stadium headline dimensions are marked verified.
- Other parks have dimension-aware working profiles and remain clearly marked calibration-pending until their detailed wall polygons and heights are verified.

Run this whenever park profiles are edited:

```bash
python3 -u scripts/build_ballpark_geometry.py
```

## Plate View

The umpire/catcher view includes:

- Batter and pitcher identification
- Batter-handedness mirroring
- A 5x5 pitch-location surface
- Separate Batter, Pitcher, Live and Matchup layers
- Current count context
- Recent pitch-location markers
- Batter-advantage and pitcher-advantage summaries
- Likely-pitch placeholder logic
- Manual Field/Plate selection and automatic switching mode

The plate renderer is ready for Statcast-style `plate_x`, `plate_z`, `sz_top` and `sz_bot` ingestion. Until that data build is connected, the page visibly labels the matrices as prototype data.

## Heat-map architecture

`assets/js/live/heatMapEngine.js` owns normalization and matchup combination. It deliberately does not fetch data or decide which historical sample to use. The future live-data engine should provide normalized batter, pitcher and current-game matrices plus confidence/sample metadata.

See `data/heatmaps/schema.json` for the ingestion contract.

## Validation

```bash
python3 -u scripts/check_live_hud_phase2.py
```
