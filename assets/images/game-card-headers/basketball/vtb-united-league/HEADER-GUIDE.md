# VTB United League Game-Card Header Photos

Location: `basketball/vtb-united-league`  
Sport: Basketball  
Profile: `indoor_team_venue`

## Mike’s workflow

1. Create or open the team, venue, arena, track, course, tournament, or event folder
   inside `entities/`.
2. Copy this league’s category skeleton into that entity folder.
3. Put each wide game-card header image into the most accurate category.
4. Use numbered names such as `day-01.webp`, `night-02.jpg`, or `live-01.webp`.
5. Run:

   `python3 scripts/generate_game_card_header_folders.py`

   `python3 scripts/check_game_card_header_coverage.py`

## Photo requirements

- Wide horizontal composition; recommended minimum width: 1900 px.
- The venue, track, course, arena, event stage, or recognizable setting should be clear.
- Avoid close-up player portraits unless the event has no stable venue identity.
- Avoid score graphics, watermarks, heavy text overlays, and misleading weather.
- Keep licensing and attribution in the entity folder’s `ATTRIBUTION.md`.
- Do not place images directly in the league root.

## Selector principle

Every game card needs a header. Weather folders are used only when weather can
materially affect the sport or scene. Indoor sports use lighting and event-state
folders instead.
