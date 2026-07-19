# Plate Event Theater — Phase 1

Turns the full-screen Plate View HUD from a static concept image into a live-rendered retro ghost environment.

## Included

- wide pseudo-3D Tron Park scene with pointer-based left/right look
- click the park to return to the normal Live Game HUD
- live batter information module
- current-game batter results module
- live pitcher information module
- live pitch trails module
- full-screen score bug bound to the same game state as the Live Game HUD
- lightweight animations for pitches, foul balls, strikeouts, line drives and home runs
- normalized future-feed entry point: `window.BoringBetsPlateHud.ingest(event)`

The current automatic event stream is explicitly simulated. Game state is rendered before animations begin so presentation cannot delay score, count, outs or base-state updates.
