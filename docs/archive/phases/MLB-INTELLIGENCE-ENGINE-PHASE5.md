# MLB Intelligence Engine — Phase 5

Adds filter-aware league-wide pitcher ranks and LHH/RHH splits.

Pitcher ranks are calculated against the qualifying MLB pitcher pool for the exact active timeframe, location, and batter-side split. Rank 1 is best. Each cell stores its rank pool size.

Minimum samples: 1 IP (7D), 3 IP (30D), 10 IP (season).
