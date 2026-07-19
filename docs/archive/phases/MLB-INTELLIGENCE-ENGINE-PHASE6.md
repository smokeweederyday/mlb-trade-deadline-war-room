# MLB Intelligence Engine — Phase 6

## Pitcher table contract

- Season is a fixed baseline for the selected All/Home/Away location.
- Selected follows both timeframe and location.
- vs LHH and vs RHH follow both timeframe and location.
- Every statistic has a separate adjacent rank column.
- The visible rank is only the rank number.
- Hovering a rank reveals the qualifying pitcher pool and filter context.
- Colors come only from the league-wide qualifying pitcher rank for the exact filter.
- Projected or confirmed lineup handedness is shown above the split columns.
- Switch hitters count as LHH against a right-handed pitcher and RHH against a left-handed pitcher.

## Settings panel

A discreet user settings panel is the next phase. It will store preferences such as days versus games, custom window length, default location, and display density. The backend must support each selectable window before the control is exposed.
