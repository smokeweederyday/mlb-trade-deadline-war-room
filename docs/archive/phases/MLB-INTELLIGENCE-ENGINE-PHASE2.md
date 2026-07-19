# MLB Intelligence Engine — Phase 2

This phase adds exact active-filter offense rankings and pitcher split enrichment.

## Offense ranking behavior

Every offense metric is compared against all MLB teams using the same active controls:

- Timeframe: Last 7 days, Last 30 days, or Season
- Location: All, Home, or Away
- Split column: overall or versus the opposing starter's handedness

Rank 1 always means best. Lower offensive strikeout rate is treated as better; higher AVG, BB%, OBP, OPS, and wRC+ are treated as better.

The importer fetches a league comparison matrix and stores the matching value and rank together in each filter block. The existing game-page controls therefore change both the displayed statistic and its corresponding rank.

## Pitchers

- LHH and RHH season splits are retained in dedicated columns.
- FIP is calculated from MLB component statistics.
- xFIP is calculated using MLB air-outs as the fly-ball input and a configurable league HR/FB rate.

Environment overrides:

- `BORING_BETS_FIP_CONSTANT`
- `BORING_BETS_LEAGUE_HR_FB`

The xFIP payload records its calculation source and the HR/FB assumption used.
