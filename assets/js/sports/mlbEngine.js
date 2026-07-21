import { getRankHeatClass } from "../engine/colorEngine.js";

const MLB_OFFENSE_METRICS = ["AVG", "wRC+", "K%", "BB%", "OBP", "OPS"];

const MLB_PITCHER_METRICS = [
  { key: "era", label: "ERA", type: "number" },
  { key: "whip", label: "WHIP", type: "number" },
  { key: "fip", label: "FIP", type: "number" },
  { key: "xfip", label: "xFIP", type: "number" },
  { key: "avg_against", label: "AVG A", type: "average" },
  { key: "k_rate", label: "K%", type: "percent" },
  { key: "bb_rate", label: "BB%", type: "percent" },
  { key: "go_ao", label: "GO/AO", type: "number" }
];

const PITCHER_SIGNAL_WEIGHTS = Object.freeze({
  era: 1.25,
  whip: 1.1,
  fip: 1.35,
  xfip: 1.35,
  avg_against: 0.9,
  k_rate: 0.9,
  bb_rate: 0.8,
  go_ao: 0.5
});

function buildPitcherNameSignal(block) {
  let weightedScore = 0;
  let weightTotal = 0;
  let metricsUsed = 0;

  Object.entries(
    PITCHER_SIGNAL_WEIGHTS
  ).forEach(([metric, weight]) => {
    const rank = Number(
      block?.ranks?.[metric]
    );

    const poolSize = Number(
      block?.rank_pool_size?.[metric]
    );

    if (
      !Number.isFinite(rank) ||
      !Number.isFinite(poolSize) ||
      rank < 1 ||
      poolSize < 2
    ) {
      return;
    }

    // Every stored pitcher rank already uses
    // rank 1 as best, regardless of metric direction.
    const metricScore =
      1 -
      (
        2 *
        (rank - 1) /
        (poolSize - 1)
      );

    weightedScore += (
      metricScore * weight
    );

    weightTotal += weight;
    metricsUsed += 1;
  });

  if (!weightTotal) {
    return {
      score: 0,
      className:
        "pitcher-signal-neutral",
      label:
        "League-relative pitcher signal unavailable"
    };
  }

  const score = Math.max(
    -1,
    Math.min(
      1,
      weightedScore / weightTotal
    )
  );

  let className =
    "pitcher-signal-neutral";

  let description =
    "League average";

  if (score >= 0.45) {
    className =
      "pitcher-signal-strong-positive";
    description =
      "Strong positive pitcher profile";
  } else if (score >= 0.14) {
    className =
      "pitcher-signal-positive";
    description =
      "Positive pitcher profile";
  } else if (score <= -0.45) {
    className =
      "pitcher-signal-strong-negative";
    description =
      "Strong negative pitcher profile";
  } else if (score <= -0.14) {
    className =
      "pitcher-signal-negative";
    description =
      "Negative pitcher profile";
  }

  return {
    score: Number(score.toFixed(3)),
    className,
    label:
      `${description} · ` +
      `${metricsUsed} ranked metrics used`
  };
}

export function buildMlbOffenseModule({
  game,
  side,
  timeframe = "last_30"
}) {
  const isAway = side === "away";
  const gameLocation = isAway ? "away" : "home";
  const team = isAway ? game.away_team : game.home_team;
  const offense = isAway ? game.offense?.away : game.offense?.home;
  const opposingPitcher = isAway ? game.pitchers?.home : game.pitchers?.away;

  const pitcherHand =
    opposingPitcher?.throws === "L"
      ? "L"
      : opposingPitcher?.throws === "R"
        ? "R"
        : null;

  const timeframeKey = ["last_7", "last_30", "season"].includes(timeframe)
    ? timeframe
    : "last_30";
  const period = offense?.stats?.[timeframeKey] || {};
  const overallBlock = period?.all || {};
  const locationBlock = period?.[gameLocation] || {};
  const handLabel = pitcherHand ? `vs ${pitcherHand}HP` : "vs starter hand";
  const locationLabel = `${isAway ? "Away" : "Home"} ${handLabel}`;

  return {
    title: `${team?.abbr || offense?.team || "TEAM"} OFFENSE`,
    context: handLabel,
    locationContext: locationLabel,
    opponent: opposingPitcher?.name || "Starter TBD",
    gameLocation,
    activeTimeframe: timeframeKey,
    detailsUrl: `lineup.html?game=${encodeURIComponent(game.id)}&team=${encodeURIComponent(side)}`,
    metrics: MLB_OFFENSE_METRICS.map(metric => {
      const overallMetric = overallBlock?.[metric] || {};
      const locationMetric = locationBlock?.[metric] || {};

      return {
        label: metric,
        type: getMlbOffenseMetricType(metric),
        overall: {
          value: overallMetric.overall ?? null,
          rank: overallMetric.overall_rank ?? null
        },
        split: {
          value: overallMetric.vs_hand ?? null,
          rank: overallMetric.vs_hand_rank ?? null
        },
        locationSplit: {
          value: locationMetric.vs_hand ?? null,
          rank: locationMetric.vs_hand_rank ?? null,
          timeframe: timeframeKey,
          location: gameLocation
        }
      };
    })
  };
}

export function buildMlbPitcherModule({
  game,
  side,
  timeframe = "season",
  location = "all",
  startMode = true,
  startCount = 7
}) {
  const isAway = side === "away";
  const team = isAway ? game.away_team : game.home_team;
  const pitcher = isAway ? game.pitchers?.away : game.pitchers?.home;
  const opposingLineup = isAway ? game.lineups?.home : game.lineups?.away;
  const safePitcher = pitcher || createUnknownPitcher();

  const allowedStartCounts = [
    1,
    3,
    7,
    10,
    20
  ];

  const requestedStartCount =
    Number(startCount);

  const normalizedStartCount =
    allowedStartCounts.includes(
      requestedStartCount
    )
      ? requestedStartCount
      : 7;

  // Season remains available when recent-start mode is disabled.
  const season = selectPitcherLocationBlock(
    safePitcher.stats?.season,
    location
  );

  // This is a true start-count block generated
  // from pitcher game logs. It is not days.
  const selectedStarts =
    safePitcher.stats
      ?.last_starts
      ?.[String(normalizedStartCount)]
      ?.[location] || {};

  const primaryBlock =
    startMode
      ? selectedStarts
      : season;

  const vsLeft =
    startMode
      ? selectedStarts?.vs_lhh || {}
      : resolvePitcherSplitBlock(
          safePitcher,
          timeframe,
          location,
          "vs_lhh"
        );

  const vsRight =
    startMode
      ? selectedStarts?.vs_rhh || {}
      : resolvePitcherSplitBlock(
          safePitcher,
          timeframe,
          location,
          "vs_rhh"
        );

  const lineupMix = summarizeLineupHandedness(
    opposingLineup,
    safePitcher.throws
  );

  const seasonContext =
    `Season · ${formatLocationLabel(location)}`;

  const startsUsed =
    Number(selectedStarts?.starts_used);

  const startSampleLabel =
    startMode &&
    Number.isFinite(startsUsed)
      ? (
          startsUsed < normalizedStartCount
            ? `${startsUsed} of ${normalizedStartCount} starts available`
            : `${startsUsed} starts used`
        )
      : "";

  const primaryContext =
    startMode
      ? `Last ${normalizedStartCount} Starts · ${formatLocationLabel(location)}`
      : seasonContext;

  // A player's visible name must carry one stable identity
  // everywhere on the site. Use Season / All for that
  // canonical color. The active split can still drive the
  // surrounding contextual atmosphere.
  const canonicalPitcherBlock =
    safePitcher.stats
      ?.season
      ?.all ||
    season;

  const nameSignal =
    buildPitcherNameSignal(
      canonicalPitcherBlock
    );

  const atmosphereSignal =
    buildPitcherNameSignal(
      primaryBlock
    );

  return {
    side,
    playerId:
      safePitcher.id ?? null,
    playerRole:
      "pitching",
    name: safePitcher.name || "Starter TBD",
    nameSignalScore:
      nameSignal.score,
    atmosphereSignalScore:
      atmosphereSignal.score,
    nameSignalClass:
      nameSignal.className,
    nameSignalLabel:
      nameSignal.label,
    team: team?.abbr || "—",
    age: safePitcher.age ?? "—",
    handLabel: safePitcher.throws ? `${safePitcher.throws}HP` : "Throws —",
    statusLabel: formatPitcherStatus(safePitcher.status),
    detailsUrl:
      safePitcher.id
        ? (
            `player.html?id=${
              encodeURIComponent(
                safePitcher.id
              )
            }&role=pitching`
          )
        : "#",
    contextLabel: primaryContext,
    activeLocation: location,
    startMode: Boolean(startMode),
    activeStartCount:
      normalizedStartCount,
    startOptions:
      allowedStartCounts,
    startSampleLabel,
    lineupStatusLabel: lineupMix.statusLabel,
    lineupStatusClass: lineupMix.statusClass,
    lineupHandednessLabel: lineupMix.label,
    lineupCompleteness: lineupMix.completeness,
    lineupChanged: lineupMix.changed,
    columns: startMode
      ? [
          {
            label: "Season"
          },
          {
            label:
              `Last ${normalizedStartCount} Starts`
          },
          {
            label:
              `Last ${normalizedStartCount} Starts vs LHH`
          },
          {
            label:
              `Last ${normalizedStartCount} Starts vs RHH`
          }
        ]
      : [
          {
            label: "Season"
          },
          {
            label: "vs LHH"
          },
          {
            label: "vs RHH"
          }
        ],

    metrics: MLB_PITCHER_METRICS.map(
      metric => ({
        label: metric.label,

        values: startMode
          ? [
              normalizeRankedPitcherValue(
                season,
                metric.key,
                metric.type,
                seasonContext,
                metric.ranked !== false
              ),

              normalizeRankedPitcherValue(
                selectedStarts,
                metric.key,
                metric.type,
                primaryContext,
                metric.ranked !== false
              ),

              normalizeRankedPitcherValue(
                vsLeft,
                metric.key,
                metric.type,
                `${
                  vsLeft?._contextFallback
                  || primaryContext
                } · vs LHH`,
                metric.ranked !== false
              ),

              normalizeRankedPitcherValue(
                vsRight,
                metric.key,
                metric.type,
                `${
                  vsRight?._contextFallback
                  || primaryContext
                } · vs RHH`,
                metric.ranked !== false
              )
            ]
          : [
              normalizeRankedPitcherValue(
                season,
                metric.key,
                metric.type,
                seasonContext,
                metric.ranked !== false
              ),

              normalizeRankedPitcherValue(
                vsLeft,
                metric.key,
                metric.type,
                `${
                  vsLeft?._contextFallback
                  || seasonContext
                } · vs LHH`,
                metric.ranked !== false
              ),

              normalizeRankedPitcherValue(
                vsRight,
                metric.key,
                metric.type,
                `${
                  vsRight?._contextFallback
                  || seasonContext
                } · vs RHH`,
                metric.ranked !== false
              )
            ]
      })
    )
  };
}

function resolvePitcherSplitBlock(pitcher, timeframe, location, splitKey) {
  const exact = pitcher?.stats?.[timeframe]?.[location]?.[splitKey];
  if (exact && Object.keys(exact).length) return exact;

  // The MLB feed occasionally omits recent all-location handedness rows even
  // when it supplies the season split. Preserve a useful split instead of
  // blanking the column, but tag it honestly for hover context.
  if (location === "all") {
    const seasonFallback = pitcher?.stats?.season?.all?.[splitKey]
      || pitcher?.stats?.[splitKey];
    if (seasonFallback && Object.keys(seasonFallback).length) {
      return { ...seasonFallback, _contextFallback: "Season · All" };
    }
  }

  return {};
}

function selectPitcherLocationBlock(period, location) {
  if (!period) return {};
  const requested = period?.[location];
  if (requested && Object.keys(requested).length) return requested;
  // Do not silently substitute all-location data for Home/Away. A missing
  // location must stay missing so the page never mislabels the comparison.
  return location === "all" ? (period?.all || {}) : {};
}

function summarizeLineupHandedness(lineup, pitcherThrows) {
  const players = Array.isArray(lineup?.players) ? lineup.players.slice(0, 9) : [];
  const status = ["unknown", "projected", "partial", "confirmed"].includes(lineup?.status)
    ? lineup.status
    : (players.length >= 9 ? "projected" : players.length ? "partial" : "unknown");
  const statusLabels = {
    unknown: "Lineup unknown",
    projected: "Projected lineup",
    partial: `Partial lineup (${players.length}/9)`,
    confirmed: "Confirmed lineup"
  };

  const storedMix = lineup?.matchup_handedness;
  let left = Number(storedMix?.lhh);
  let right = Number(storedMix?.rhh);
  let unknown = Number(storedMix?.unknown);
  let switchHitters = Number(storedMix?.switch_hitters);

  if (![left, right, unknown, switchHitters].every(Number.isFinite)) {
    left = right = unknown = switchHitters = 0;
    players.forEach(player => {
      const bats = String(player?.bats || "").toUpperCase();
      const matchupBats = String(player?.matchup_bats || "").toUpperCase();
      if (bats === "S") switchHitters += 1;
      if (matchupBats === "L" || (!matchupBats && bats === "L")) left += 1;
      else if (matchupBats === "R" || (!matchupBats && bats === "R")) right += 1;
      else if (bats === "S" && pitcherThrows === "R") left += 1;
      else if (bats === "S" && pitcherThrows === "L") right += 1;
      else unknown += 1;
    });
  }

  const pieces = [];
  if (players.length) {
    pieces.push(`${left} LHH`, `${right} RHH`);
    if (switchHitters) pieces.push(`${switchHitters} S*`);
    if (unknown) pieces.push(`${unknown} unknown`);
  }

  const confidence = Number(lineup?.confidence);
  const confidenceText = Number.isFinite(confidence)
    ? ` · ${Math.round(confidence * 100)}% confidence`
    : "";

  return {
    statusLabel: `${lineup?.status_label || statusLabels[status]}${confidenceText}`,
    statusClass: `lineup-status-${status}`,
    label: pieces.length ? pieces.join(" · ") : "LHH/RHH unavailable",
    completeness: lineup?.completeness || { count: players.length, expected: 9 },
    changed: Boolean(lineup?.changed_since_last_refresh)
  };
}

function formatPitcherSample(block) {
  const outs = Number(block?.outs);

  if (Number.isFinite(outs) && outs >= 0) {
    return `${Math.floor(outs / 3)}.${Math.round(outs % 3)} IP`;
  }

  const innings = block?.innings_pitched;

  if (
    innings !== null &&
    innings !== undefined &&
    innings !== ""
  ) {
    return `${innings} IP`;
  }

  const battersFaced = Number(block?.batters_faced);

  if (Number.isFinite(battersFaced) && battersFaced >= 0) {
    return `${battersFaced} batters faced`;
  }

  return "";
}

function pitcherQualificationMinimum(contextLabel = "") {
  const normalized = String(contextLabel).toLowerCase();

  const startMatch = normalized.match(
    /last\s+(1|3|7|10|20)\s+starts?/
  );

  if (startMatch) {
    const count = Number(
      startMatch[1]
    );

    return `${count} completed ${
      count === 1
        ? "start"
        : "starts"
    }`;
  }

  if (normalized.includes("season")) {
    return "10.0 IP";
  }

  if (normalized.includes("30")) {
    return "3.0 IP";
  }

  if (normalized.includes("7")) {
    return "1.0 IP";
  }

  return "";
}

function normalizeRankedPitcherValue(
  block,
  key,
  type,
  contextLabel = "",
  ranked = true
) {
  const value = normalizePitcherValue(block?.[key], type);
  const hasValue =
    value.value !== null &&
    value.value !== undefined &&
    value.value !== "";

  const rawRank = ranked
    ? block?.ranks?.[key] ?? null
    : null;

  const rawPoolSize = ranked
    ? block?.rank_pool_size?.[key] ?? null
    : null;

  const numericRank = Number(rawRank);
  const numericPoolSize = Number(rawPoolSize);

  const hasRank =
    rawRank !== null &&
    rawRank !== undefined &&
    Number.isFinite(numericRank) &&
    numericRank > 0;

  const hasPoolSize =
    rawPoolSize !== null &&
    rawPoolSize !== undefined &&
    Number.isFinite(numericPoolSize) &&
    numericPoolSize > 0;

  return {
    ...value,
    rank: hasRank ? numericRank : null,
    poolSize: hasPoolSize ? numericPoolSize : null,
    contextLabel: ranked
      ? contextLabel
      : `${contextLabel} · Informational only`,
    unrankedReason:
      ranked && hasValue && !hasRank
        ? "Not ranked — insufficient sample"
        : "",
    sampleLabel:
      ranked && hasValue && !hasRank
        ? formatPitcherSample(block)
        : "",
    minimumLabel:
      ranked && hasValue && !hasRank
        ? pitcherQualificationMinimum(contextLabel)
        : "",
    heatClass: ranked
      ? hasRank
        ? getRankHeatClass(numericRank, numericPoolSize || 30)
        : hasValue
          ? "metric-average"
          : "metric-missing"
      : hasValue
        ? "metric-average"
        : "metric-missing"
  };
}

export function buildMlbBullpenModule({
  game,
  side,
  timeframe = "last_30",
  location = "all"
}) {
  const isAway = side === "away";
  const team =
    isAway
      ? game.away_team
      : game.home_team;

  const bullpen =
    isAway
      ? game.bullpens?.away
      : game.bullpens?.home;

  const seasonStats =
    bullpen?.stats?.season?.all || {};

  const last30Stats =
    bullpen?.stats?.last_30?.all || {};

  const seasonRanks =
    seasonStats?.ranks || {};

  const seasonPools =
    seasonStats?.rank_pool_size || {};

  const last30Ranks =
    last30Stats?.ranks || {};

  const last30Pools =
    last30Stats?.rank_pool_size || {};

  const kPer9 =
    calculateBullpenPerNine(
      seasonStats.strikeouts,
      seasonStats.innings_pitched
    );

  const bbPer9 =
    calculateBullpenPerNine(
      seasonStats.walks,
      seasonStats.innings_pitched
    );

  const rankedValue = (
    value,
    rank,
    poolSize
  ) => ({
    value,
    rank,
    poolSize
  });

  return {
    title: `${
      team?.abbr ||
      bullpen?.team ||
      "—"
    } BULLPEN`,

    detailsUrl:
      bullpen?.details_url &&
      bullpen.details_url !== "#"
        ? bullpen.details_url
        : `bullpen.html?team=${encodeURIComponent(
            team?.abbr ||
            bullpen?.team ||
            ""
          )}`,

    note: bullpen?.notes || "",

    roster: normalizeBullpenRoster(
      bullpen?.roster
    ),

    usage: normalizeBullpenUsage(
      bullpen?.usage
    ),

    metrics: [
      normalizeBullpenMetric(
        "ERA",
        rankedValue(
          seasonStats.era,
          seasonRanks.era,
          seasonPools.era
        ),
        "number"
      ),

      normalizeBullpenMetric(
        "WHIP",
        rankedValue(
          seasonStats.whip,
          seasonRanks.whip,
          seasonPools.whip
        ),
        "number"
      ),

      normalizeBullpenMetric(
        "FIP",
        rankedValue(
          seasonStats.fip,
          seasonRanks.fip,
          seasonPools.fip
        ),
        "number"
      ),

      normalizeBullpenMetric(
        "K/9",
        rankedValue(
          kPer9,
          seasonRanks.k_per_9,
          seasonPools.k_per_9
        ),
        "number"
      ),

      normalizeBullpenMetric(
        "BB/9",
        rankedValue(
          bbPer9,
          seasonRanks.bb_per_9,
          seasonPools.bb_per_9
        ),
        "number"
      ),

      normalizeBullpenMetric(
        "L30 WHIP",
        rankedValue(
          last30Stats.whip,
          last30Ranks.whip,
          last30Pools.whip
        ),
        "number"
      )
    ]
  };
}

export function buildMlbMatchupModule({
  game,
  side,
  timeframe = "last_30",
  location = "all"
}) {
  const isAwayPitcher = side === "away";
  const pitcher = isAwayPitcher ? game.pitchers?.away : game.pitchers?.home;
  const opponent = isAwayPitcher ? game.home_team : game.away_team;
  const opposingLineup = isAwayPitcher ? game.lineups?.home : game.lineups?.away;
  const opposingOffense = isAwayPitcher ? game.offense?.home : game.offense?.away;
  const offenseLocation = isAwayPitcher ? "home" : "away";
  const pitcherHand = pitcher?.throws === "L" ? "L" : pitcher?.throws === "R" ? "R" : null;
  const timeframeKey = ["last_7", "last_30", "season"].includes(timeframe) ? timeframe : "last_30";
  const activeLocation = ["all", "home", "away"].includes(location) ? location : "all";

  const players = Array.isArray(opposingLineup?.players)
    ? [...opposingLineup.players].sort((a, b) => Number(a.order || 99) - Number(b.order || 99)).slice(0, 9)
    : [];
  const storedMix = opposingLineup?.matchup_handedness;
  const computedMix = computeMatchupHandednessCounts(players, pitcher?.throws);
  const leftCount = finiteCount(storedMix?.lhh, computedMix.lhh);
  const rightCount = finiteCount(storedMix?.rhh, computedMix.rhh);
  const switchCount = finiteCount(storedMix?.switch_hitters, computedMix.switch_hitters);

  const pitcherPeriod = pitcher?.stats?.[timeframeKey]?.[activeLocation] || {};
  const pitcherVsLeft = pitcherPeriod?.vs_lhh || {};
  const pitcherVsRight = pitcherPeriod?.vs_rhh || {};
  const offensePeriod = opposingOffense?.stats?.[timeframeKey] || {};
  const offenseAll = offensePeriod?.all || {};
  const offenseLocationBlock = offensePeriod?.[offenseLocation] || {};

  const offenseMetric = selectOffenseMatchupMetric(offenseAll);
  const locationMetric = selectOffenseMatchupMetric(offenseLocationBlock);
  const leftProfile = summarizePitcherSplit(pitcherVsLeft, leftCount, "LHH");
  const rightProfile = summarizePitcherSplit(pitcherVsRight, rightCount, "RHH");
  const offenseProfile = summarizeOffenseSplit(offenseMetric, pitcherHand, "overall");
  const locationProfile = summarizeOffenseSplit(offenseLocationBlock?.[offenseMetric.metric] || {}, pitcherHand, offenseLocation);

  const notes = buildMatchupNotes({
    pitcherName: pitcher?.name || "The probable starter",
    opponentName: opponent?.abbr || "The opposing lineup",
    leftCount,
    rightCount,
    leftProfile,
    rightProfile,
    offenseProfile,
    locationProfile,
    pitcherHand,
    offenseLocation
  });

  const status = opposingLineup?.status || "unknown";
  const completeness = opposingLineup?.completeness || { count: players.length, expected: 9 };
  const bvpKey = isAwayPitcher ? "away_pitcher" : "home_pitcher";
  const bvpBatters = game?.pitcher_vs_lineup?.[bvpKey]?.batters || {};

  return {
    title: `${pitcher?.name || "Starter TBD"} vs ${opponent?.abbr || "Opponent"}`,
    contextLabel: `${formatTimeframeShort(timeframeKey)} · Pitcher ${formatLocationLabel(activeLocation)} · Offense ${capitalize(offenseLocation)}`,
    statusLabel: opposingLineup?.status_label || capitalize(status),
    statusClass: `lineup-status-${status}`,
    completenessLabel: `${completeness.count ?? players.length}/${completeness.expected ?? 9}`,
    leftCount,
    rightCount,
    switchCount,
    lineup: players.map(player => {
      const expectedSide = player?.matchup_bats || inferMatchupBatSide(player?.bats, pitcher?.throws);
      const isSwitch = Boolean(player?.is_switch_hitter || player?.bats === "S");
      return {
        id: player?.id ?? null,
        order: player?.order ?? "—",
        name: player?.name || "Unknown hitter",
        detailsUrl:
          player?.id
            ? (
                `player.html?id=${
                  encodeURIComponent(
                    player.id
                  )
                }&role=hitting`
              )
            : "#",
        sideLabel: isSwitch ? `S* → ${expectedSide || "?"}` : (expectedSide || player?.bats || "?"),
        sideClass: expectedSide === "L" ? "bats-left" : expectedSide === "R" ? "bats-right" : "bats-unknown",
        tooltip: isSwitch
          ? `Switch hitter projected to bat ${expectedSide === "L" ? "left" : expectedSide === "R" ? "right" : "from an unknown side"} against this pitcher.`
          : `${player?.bats || "Unknown"}-handed hitter.`,
        bvp: normalizeBvpRow(bvpBatters?.[String(player?.id)] || {})
      };
    }),
    lineupHistory: aggregateBvpLineup(players, bvpBatters),
    pitcherVsLeft: leftProfile,
    pitcherVsRight: rightProfile,
    offenseHandLabel: pitcherHand ? `${opponent?.abbr || "Offense"} vs ${pitcherHand}HP` : "Offense vs starter hand",
    locationHandLabel: pitcherHand ? `${capitalize(offenseLocation)} vs ${pitcherHand}HP` : `${capitalize(offenseLocation)} vs starter hand`,
    offenseVsHand: offenseProfile,
    locationVsHand: locationProfile,
    notes
  };
}

function normalizeBvpRow(row = {}) {
  const pa = Number(row?.plate_appearances);
  const ops = Number(row?.ops);
  const avg = Number(row?.avg);
  const available = Boolean(row?.available) && Number.isFinite(pa) && pa > 0;
  const opacity = available ? Math.max(0.22, Math.min(1, pa / 50)) : 0.22;
  let resultClass = "bvp-missing";

  // Player-button colors are always from the hitter's
  // perspective: strong history is favorable/green and
  // weak history is unfavorable/red.
  if (available && Number.isFinite(ops)) {
    if (ops >= 0.850) {
      resultClass = "bvp-hitter-strong-positive";
    } else if (ops >= 0.750) {
      resultClass = "bvp-hitter-positive";
    } else if (ops <= 0.650) {
      resultClass = "bvp-hitter-strong-negative";
    } else {
      resultClass = "bvp-hitter-negative";
    }
  }
  return {
    available,
    pa: available ? pa : 0,
    strikeouts: Number(row?.strikeouts) || 0,
    walks: Number(row?.walks) || 0,
    avg: Number.isFinite(avg) ? avg : null,
    ops: Number.isFinite(ops) ? ops : null,
    opacity,
    resultClass,
    hits: Number.isFinite(Number(row?.hits)) ? Number(row.hits) : null,
    atBats: Number.isFinite(Number(row?.at_bats)) ? Number(row.at_bats) : null,
    totalBases: Number.isFinite(Number(row?.total_bases)) ? Number(row.total_bases) : null,
    hitByPitch: Number(row?.hit_by_pitch) || 0,
    sacFlies: Number(row?.sac_flies) || 0,
    obp: Number.isFinite(Number(row?.obp)) ? Number(row.obp) : null,
    slg: Number.isFinite(Number(row?.slg)) ? Number(row.slg) : null,
    source: row?.source || "Career BvP"
  };
}

function aggregateBvpLineup(players, bvpBatters) {
  const rows = (Array.isArray(players) ? players : [])
    .map(player => normalizeBvpRow(bvpBatters?.[String(player?.id)] || {}))
    .filter(row => row.available);
  const totals = rows.reduce((acc, row) => {
    acc.pa += row.pa || 0;
    acc.k += row.strikeouts || 0;
    acc.bb += row.walks || 0;
    acc.h += row.hits || 0;
    acc.ab += row.atBats || 0;
    acc.tb += row.totalBases || 0;
    acc.hbp += row.hitByPitch || 0;
    acc.sf += row.sacFlies || 0;
    return acc;
  }, { pa: 0, k: 0, bb: 0, h: 0, ab: 0, tb: 0, hbp: 0, sf: 0 });
  const avg = totals.ab > 0 ? totals.h / totals.ab : null;
  const obpDen = totals.ab + totals.bb + totals.hbp + totals.sf;
  const obp = obpDen > 0 ? (totals.h + totals.bb + totals.hbp) / obpDen : null;
  const slg = totals.ab > 0 ? totals.tb / totals.ab : null;
  const ops = Number.isFinite(obp) && Number.isFinite(slg) ? obp + slg : null;
  return {
    available: totals.pa > 0,
    hittersWithHistory: rows.length,
    pa: totals.pa,
    strikeouts: totals.k,
    walks: totals.bb,
    avg,
    ops
  };
}

function finiteCount(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function computeMatchupHandednessCounts(players, pitcherThrows) {
  let lhh = 0;
  let rhh = 0;
  let unknown = 0;
  let switchHitters = 0;
  (Array.isArray(players) ? players : []).forEach(player => {
    const bats = String(player?.bats || "").toUpperCase();
    const expected = String(player?.matchup_bats || inferMatchupBatSide(bats, pitcherThrows) || "").toUpperCase();
    if (bats === "S") switchHitters += 1;
    if (expected === "L") lhh += 1;
    else if (expected === "R") rhh += 1;
    else unknown += 1;
  });
  return { lhh, rhh, unknown, switch_hitters: switchHitters };
}

function selectOffenseMatchupMetric(block) {
  const preferred = ["OPS", "AVG", "OBP", "K%", "BB%"];
  for (const metric of preferred) {
    const data = block?.[metric];
    if (data?.vs_hand !== null && data?.vs_hand !== undefined) {
      return { metric, data };
    }
  }
  return { metric: "OPS", data: {} };
}

function summarizePitcherSplit(block, hitterCount, label) {
  const candidates = ["xfip", "fip", "whip", "avg_against"];
  let key = candidates.find(metric => Number.isFinite(Number(block?.[metric])));
  if (!key) {
    return {
      summary: "Unavailable",
      detail: `${hitterCount} projected ${label}`,
      heatClass: "metric-missing",
      rank: null
    };
  }
  const rank = Number(block?.ranks?.[key]);
  const poolSize = Number(block?.rank_pool_size?.[key]);
  const validRank = Number.isFinite(rank) && rank > 0 && (!Number.isFinite(poolSize) || rank <= poolSize);
  return {
    summary: rankSummary(validRank ? rank : null, poolSize),
    detail: `${formatPitcherMetricLabel(key)} ${formatPitcherMetricValue(key, block[key])} · ${hitterCount} projected ${label}`,
    heatClass: validRank ? getRankHeatClass(rank, poolSize || 30) : "metric-missing",
    rank: validRank ? rank : null,
    poolSize: Number.isFinite(poolSize) ? poolSize : null,
    metric: key
  };
}

function summarizeOffenseSplit(selection, pitcherHand, location) {
  const metric = selection?.metric || "OPS";
  const data = selection?.data || selection || {};
  const value = data?.vs_hand;
  const rank = Number(data?.vs_hand_rank);
  const coverage = Number(data?.vs_hand_rank_coverage);
  const hasValue = value !== null && value !== undefined && value !== "";
  const validRank = Number.isFinite(rank) && rank >= 1 && rank <= 30;
  return {
    summary: validRank ? ordinal(rank) : "Unavailable",
    detail: hasValue ? `${metric} ${formatOffenseValue(metric, value)}${pitcherHand ? ` vs ${pitcherHand}HP` : ""}` : `${capitalize(location)} split unavailable`,
    heatClass: hasValue && validRank ? getRankHeatClass(rank, 30) : "metric-missing",
    rank: validRank ? rank : null,
    poolSize: Number.isFinite(coverage) ? coverage : 30,
    metric
  };
}

function buildMatchupNotes({ pitcherName, opponentName, leftCount, rightCount, leftProfile, rightProfile, offenseProfile, locationProfile, pitcherHand, offenseLocation }) {
  const notes = [];
  const dominantSide = leftCount > rightCount ? "left-handed" : rightCount > leftCount ? "right-handed" : null;
  if (dominantSide) {
    notes.push({
      label: "Lineup shape",
      text: `${opponentName} projects ${Math.max(leftCount, rightCount)} ${dominantSide} hitters against ${pitcherName}.`,
      kind: "neutral"
    });
  }

  const splitProfiles = [
    { side: "left-handed hitters", count: leftCount, profile: leftProfile },
    { side: "right-handed hitters", count: rightCount, profile: rightProfile }
  ].filter(item => item.count > 0 && Number.isFinite(item.profile?.rank));
  if (splitProfiles.length) {
    const weakest = [...splitProfiles].sort((a, b) => b.profile.rank - a.profile.rank)[0];
    const strongest = [...splitProfiles].sort((a, b) => a.profile.rank - b.profile.rank)[0];
    notes.push({
      label: "Largest pitcher concern",
      text: `${pitcherName}'s weaker available split is against ${weakest.side} (${rankSummary(weakest.profile.rank, weakest.profile.poolSize).toLowerCase()}); ${weakest.count} are projected.`,
      kind: weakest.profile.rank > Math.max(18, (weakest.profile.poolSize || 30) * 0.6) ? "concern" : "neutral"
    });
    if (strongest !== weakest) {
      notes.push({
        label: "Pitcher strength",
        text: `${pitcherName}'s stronger available split is against ${strongest.side} (${rankSummary(strongest.profile.rank, strongest.profile.poolSize).toLowerCase()}).`,
        kind: "strength"
      });
    }
  }

  if (Number.isFinite(offenseProfile?.rank)) {
    notes.push({
      label: "Offense vs hand",
      text: `${opponentName} ranks ${ordinal(offenseProfile.rank)} against ${pitcherHand || "the starter's"}HP in the selected timeframe.`,
      kind: offenseProfile.rank <= 10 ? "strength" : offenseProfile.rank >= 21 ? "concern" : "neutral"
    });
  }
  if (Number.isFinite(locationProfile?.rank)) {
    notes.push({
      label: "Game-location split",
      text: `${opponentName} ranks ${ordinal(locationProfile.rank)} ${offenseLocation} against ${pitcherHand || "the starter's"}HP in the selected timeframe.`,
      kind: locationProfile.rank <= 10 ? "strength" : locationProfile.rank >= 21 ? "concern" : "neutral"
    });
  }
  return notes;
}

function rankSummary(rank, poolSize) {
  if (!Number.isFinite(Number(rank))) return "Unavailable";
  const numericRank = Number(rank);
  const numericPool = Number(poolSize);
  if (Number.isFinite(numericPool) && numericPool > 30) {
    const percentile = numericRank / numericPool;
    if (percentile <= 0.2) return "Elite";
    if (percentile <= 0.4) return "Strong";
    if (percentile <= 0.6) return "Average";
    if (percentile <= 0.8) return "Weak";
    return "Poor";
  }
  if (numericRank <= 6) return "Elite";
  if (numericRank <= 12) return "Strong";
  if (numericRank <= 18) return "Average";
  if (numericRank <= 24) return "Weak";
  return "Poor";
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"}[number % 10] || "th");
  return `${number}${suffix}`;
}

function inferMatchupBatSide(bats, pitcherThrows) {
  if (bats === "L" || bats === "R") return bats;
  if (bats === "S" && pitcherThrows === "R") return "L";
  if (bats === "S" && pitcherThrows === "L") return "R";
  return null;
}

function formatPitcherMetricLabel(key) {
  return ({xfip:"xFIP", fip:"FIP", whip:"WHIP", avg_against:"AVG A"})[key] || key;
}

function formatPitcherMetricValue(key, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return key === "avg_against" ? numeric.toFixed(3).replace(/^0/, "") : numeric.toFixed(2);
}

function formatOffenseValue(metric, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (["AVG", "OBP", "OPS"].includes(metric)) return numeric.toFixed(3).replace(/^0/, "");
  if (["K%", "BB%"].includes(metric)) return `${numeric.toFixed(1)}%`;
  return numeric.toFixed(2);
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

export function buildMlbWeatherModule({ game }) {
  const weather = game.weather || {};

  return {
    detailsUrl: weather.details_url || "#",
    headline: formatWeatherHeadline(weather),
    summary: formatWeatherSummary(weather)
  };
}

export function buildMlbMarketModule({ game }) {
  const market = game.market || {};
  const awayAbbr = game.away_team?.abbr || "Away";
  const homeAbbr = game.home_team?.abbr || "Home";

  const awayBest = market.moneyline?.best?.away || null;
  const homeBest = market.moneyline?.best?.home || null;

  const consensusAway = market.moneyline?.consensus?.away ?? null;
  const consensusHome = market.moneyline?.consensus?.home ?? null;

  const fairAway = market.moneyline?.fair?.away_price ?? null;
  const fairHome = market.moneyline?.fair?.home_price ?? null;

  const runLine = selectPrimaryRunLine(
    market.run_line?.books,
    awayAbbr,
    homeAbbr
  );

  const total = selectPrimaryTotal(
    market.total?.books
  );

  const hasMarketData = Boolean(
    awayBest ||
    homeBest ||
    consensusAway !== null ||
    consensusHome !== null ||
    runLine ||
    total
  );

  return {
    detailsUrl:
      market.details_url ||
      `market.html?game=${encodeURIComponent(game.id)}`,

    hasMarketData,

    headline:
      awayBest || homeBest
        ? `${awayAbbr} ${formatAmericanOdds(awayBest?.price)} · ` +
          `${homeAbbr} ${formatAmericanOdds(homeBest?.price)}`
        : "Market pending",

    summary:
      buildMarketSummary({
        awayAbbr,
        homeAbbr,
        awayBest,
        homeBest,
        consensusAway,
        consensusHome,
        total
      }),

    teams: {
      away: {
        abbr: awayAbbr,
        bestPrice: awayBest?.price ?? null,
        bestBook: awayBest?.bookmaker || null,
        consensusPrice: consensusAway,
        fairPrice: fairAway
      },
      home: {
        abbr: homeAbbr,
        bestPrice: homeBest?.price ?? null,
        bestBook: homeBest?.bookmaker || null,
        consensusPrice: consensusHome,
        fairPrice: fairHome
      }
    },

    runLine,
    total,

    opening: market.opening || null,
    movement: market.movement || null,
    closing: market.closing || null,

    lastUpdated:
      market.last_update ||
      market.snapshot_updated_at ||
      null,

    source: market.source || "The Odds API"
  };
}

export function buildMlbLineupModule({ game, side }) {
  const isAway = side === "away";
  const lineup = isAway ? game.lineups?.away : game.lineups?.home;
  const team = isAway ? game.away_team : game.home_team;
  const status = lineup?.status || "projected";

  return {
    title: `${team?.abbr || lineup?.team || "TEAM"} LINEUP`,
    status,
    statusLabel:
      lineup?.status_label ||
      (
        status === "confirmed"
          ? "Confirmed Lineup"
          : "Projected Lineup"
      ),
    updatedLabel:
      lineup?.last_updated
        ? `Updated ${formatLineupUpdatedTime(lineup.last_updated)}`
        : "",
    players:
      Array.isArray(lineup?.players)
        ? lineup.players
        : []
  };
}

export function getMlbOffenseMetricType(metric) {
  if (["AVG", "OBP", "OPS"].includes(metric)) return "average";
  if (["K%", "BB%"].includes(metric)) return "percent";
  return "integer";
}

function normalizePitcherValue(rawValue, type) {
  const value =
    rawValue && typeof rawValue === "object"
      ? rawValue.value
      : rawValue;

  const rank =
    rawValue && typeof rawValue === "object"
      ? rawValue.rank
      : null;

  return {
    value: value ?? null,
    rank: rank ?? null,
    display: formatMlbMetric(value, type),
    heatClass: getRankHeatClass(rank)
  };
}

function calculateBullpenPerNine(rawCount, rawInnings) {
  const countValue =
    rawCount && typeof rawCount === "object"
      ? rawCount.value
      : rawCount;

  const count = Number(countValue);
  const outs = baseballInningsToOuts(rawInnings);

  if (
    !Number.isFinite(count) ||
    !Number.isFinite(outs) ||
    outs <= 0
  ) {
    return null;
  }

  return count * 27 / outs;
}

function baseballInningsToOuts(rawInnings) {
  const inningsValue =
    rawInnings && typeof rawInnings === "object"
      ? rawInnings.value
      : rawInnings;

  if (
    inningsValue === null ||
    inningsValue === undefined ||
    inningsValue === ""
  ) {
    return null;
  }

  const text = String(inningsValue).trim();
  const match = text.match(/^(\d+)(?:\.([012]))?$/);

  if (!match) {
    return null;
  }

  const wholeInnings = Number(match[1]);
  const partialOuts = Number(match[2] || 0);

  return wholeInnings * 3 + partialOuts;
}

function buildBullpenArmNameSignal(row) {
  const heatScores = {
    "metric-elite": 1,
    "metric-good": 0.5,
    "metric-average": 0,
    "metric-poor": -0.5,
    "metric-awful": -1
  };

  const metrics = [
    {
      label: "ERA",
      value: row?.era,
      weight: 1.5
    },
    {
      label: "FIP",
      value: row?.fip,
      weight: 1.35
    },
    {
      label: "WHIP",
      value: row?.whip,
      weight: 1.1
    },
    {
      label: "K/9",
      value: row?.k_per_9,
      weight: 0.9
    },
    {
      label: "BB/9",
      value: row?.bb_per_9,
      weight: 0.8
    }
  ];

  let weightedScore = 0;
  let weightTotal = 0;
  let metricsUsed = 0;

  metrics.forEach(metric => {
    const value = Number(metric.value);

    if (!Number.isFinite(value)) {
      return;
    }

    const heatClass =
      getBullpenMetricHeatClass(
        metric.label,
        value
      );

    const metricScore =
      heatScores[heatClass];

    if (!Number.isFinite(metricScore)) {
      return;
    }

    weightedScore +=
      metricScore * metric.weight;

    weightTotal += metric.weight;
    metricsUsed += 1;
  });

  if (!weightTotal) {
    return {
      score: 0,
      className:
        "pitcher-signal-neutral",
      label:
        "Pitcher signal unavailable"
    };
  }

  const score = Math.max(
    -1,
    Math.min(
      1,
      weightedScore / weightTotal
    )
  );

  let className =
    "pitcher-signal-neutral";

  let description =
    "League-average pitcher profile";

  if (score >= 0.45) {
    className =
      "pitcher-signal-strong-positive";

    description =
      "Strong positive pitcher profile";
  } else if (score >= 0.14) {
    className =
      "pitcher-signal-positive";

    description =
      "Positive pitcher profile";
  } else if (score <= -0.45) {
    className =
      "pitcher-signal-strong-negative";

    description =
      "Strong negative pitcher profile";
  } else if (score <= -0.14) {
    className =
      "pitcher-signal-negative";

    description =
      "Negative pitcher profile";
  }

  return {
    score: Number(score.toFixed(3)),
    className,
    label:
      `${description} · ` +
      `${metricsUsed} bullpen metrics used`
  };
}


function normalizeBullpenRoster(rows = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(row => {
    const inningsAvailable =
      row?.innings_pitched !== null &&
      row?.innings_pitched !== undefined &&
      row?.innings_pitched !== "";

    const nameSignal =
      buildBullpenArmNameSignal(row);

    return {
      id: row?.id ?? null,
      name: row?.name || "Unknown reliever",
      role: row?.role || "MR",
      isIl: Boolean(row?.is_il),
      status: row?.status || "",
      injuryNote: row?.injury_note || "",

      detailsUrl:
        row?.id
          ? (
              `player.html?id=${
                encodeURIComponent(row.id)
              }&role=pitching`
            )
          : "#",

      nameSignalScore:
        nameSignal.score,

      nameSignalClass:
        nameSignal.className,

      nameSignalLabel:
        nameSignal.label,

      inningsPitched:
        inningsAvailable
          ? String(row.innings_pitched)
          : "—",

      inningsHeatClass:
        inningsAvailable
          ? "metric-average"
          : "metric-missing",

      era: formatMlbMetric(
        row?.era,
        "number"
      ),

      eraHeatClass:
        getBullpenMetricHeatClass(
          "ERA",
          row?.era
        ),

      fip: formatMlbMetric(
        row?.fip,
        "number"
      ),

      fipHeatClass:
        getBullpenMetricHeatClass(
          "FIP",
          row?.fip
        ),

      whip: formatMlbMetric(
        row?.whip,
        "number"
      ),

      whipHeatClass:
        getBullpenMetricHeatClass(
          "WHIP",
          row?.whip
        ),

      kPer9: formatMlbMetric(
        row?.k_per_9,
        "number"
      ),

      kPer9HeatClass:
        getBullpenMetricHeatClass(
          "K/9",
          row?.k_per_9
        ),

      bbPer9: formatMlbMetric(
        row?.bb_per_9,
        "number"
      ),

      bbPer9HeatClass:
        getBullpenMetricHeatClass(
          "BB/9",
          row?.bb_per_9
        ),

      pitches1d:
        Number(row?.pitches_1d) || 0,

      pitches2d:
        Number(row?.pitches_2d) || 0,

      pitches3d:
        Number(row?.pitches_3d) || 0
    };
  });
}

function normalizeBullpenUsage(usage = {}) {
  const days =
    Array.isArray(usage?.days)
      ? usage.days
      : [];

  return days.slice(-3).map(day => ({
    date: day?.date || "",
    pitches: Number(day?.pitches) || 0,
    pitchers: Number(day?.pitchers) || 0,
    outs: Number(day?.outs) || 0,
    inningsPitched:
      day?.innings_pitched || "0.0"
  }));
}

function normalizeBullpenMetric(
  label,
  rawValue,
  type
) {
  const value =
    rawValue &&
    typeof rawValue === "object"
      ? rawValue.value
      : rawValue;

  const rank =
    rawValue &&
    typeof rawValue === "object"
      ? Number(rawValue.rank)
      : null;

  const poolSize =
    rawValue &&
    typeof rawValue === "object"
      ? Number(rawValue.poolSize)
      : 30;

  const validRank =
    Number.isFinite(rank) &&
    rank >= 1 &&
    Number.isFinite(poolSize) &&
    poolSize >= rank;

  return {
    label,
    value: value ?? null,
    rank:
      validRank
        ? rank
        : null,
    poolSize:
      Number.isFinite(poolSize)
        ? poolSize
        : 30,
    display: formatMlbMetric(
      value,
      type
    ),
    heatClass:
      validRank
        ? getRankHeatClass(
            rank,
            poolSize
          )
        : getBullpenMetricHeatClass(
            label,
            value
          )
  };
}

function getBullpenMetricHeatClass(
  label,
  rawValue
) {
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    return "metric-missing";
  }

  const metric =
    String(label || "").toUpperCase();

  if (
    metric === "ERA" ||
    metric === "FIP"
  ) {
    if (value <= 3.20) return "metric-elite";
    if (value <= 3.80) return "metric-good";
    if (value <= 4.30) return "metric-average";
    if (value <= 4.80) return "metric-poor";
    return "metric-awful";
  }

  if (metric.includes("WHIP")) {
    if (value <= 1.15) return "metric-elite";
    if (value <= 1.25) return "metric-good";
    if (value <= 1.35) return "metric-average";
    if (value <= 1.45) return "metric-poor";
    return "metric-awful";
  }

  if (metric === "K/9") {
    if (value >= 10.50) return "metric-elite";
    if (value >= 9.50) return "metric-good";
    if (value >= 8.50) return "metric-average";
    if (value >= 7.50) return "metric-poor";
    return "metric-awful";
  }

  if (metric === "BB/9") {
    if (value <= 2.50) return "metric-elite";
    if (value <= 3.00) return "metric-good";
    if (value <= 3.60) return "metric-average";
    if (value <= 4.20) return "metric-poor";
    return "metric-awful";
  }

  return "metric-average";
}

function normalizeMatchupMetric(label, rawValue, type) {
  const value =
    rawValue && typeof rawValue === "object"
      ? rawValue.value
      : rawValue;

  const rank =
    rawValue && typeof rawValue === "object"
      ? rawValue.rank
      : null;

  const hasValue =
    value !== null &&
    value !== undefined &&
    value !== "";

  return {
    label,
    value: value ?? null,
    rank: rank ?? null,
    display: formatMlbMetric(value, type),
    heatClass:
      hasValue && rank === null
        ? "metric-average"
        : getRankHeatClass(rank)
  };
}

function formatMlbMetric(value, type) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  if (type === "integer") {
    return Math.round(number).toString();
  }

  if (type === "average") {
    return number
      .toFixed(3)
      .replace(/^0/, "");
  }

  if (type === "percent") {
    return `${number.toFixed(1)}%`;
  }

  return number.toFixed(2);
}

function formatWeatherHeadline(weather) {
  const temperature = weather.temperature;

  if (
    temperature === null ||
    temperature === undefined ||
    temperature === ""
  ) {
    return "Conditions pending";
  }

  return `${Math.round(Number(temperature))}°`;
}

function formatWeatherSummary(weather) {
  const parts = [];

  if (
    weather.wind_speed !== null &&
    weather.wind_speed !== undefined &&
    weather.wind_speed !== ""
  ) {
    const direction =
      weather.wind_direction
        ? `${weather.wind_direction} `
        : "";

    parts.push(
      `Wind ${direction}${Number(weather.wind_speed).toFixed(1)} mph`
    );
  } else {
    parts.push("Wind —");
  }

  parts.push(
    `Humidity ${formatWeatherPercent(weather.humidity)}`
  );

  parts.push(
    `Rain ${formatWeatherPercent(weather.rain_probability)}`
  );

  return parts.join(" · ");
}

function formatWeatherPercent(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return `${number <= 1
    ? Math.round(number * 100)
    : Math.round(number)}%`;
}

function selectPrimaryRunLine(
  books,
  awayAbbr,
  homeAbbr
) {
  if (!Array.isArray(books) || !books.length) {
    return null;
  }

  const row = books.find(
    item => item?.away || item?.home
  );

  if (!row) return null;

  return {
    bookmaker: row.bookmaker || null,
    away: row.away
      ? {
          team: awayAbbr,
          point: row.away.point ?? null,
          price: row.away.price ?? null
        }
      : null,
    home: row.home
      ? {
          team: homeAbbr,
          point: row.home.point ?? null,
          price: row.home.price ?? null
        }
      : null
  };
}

function selectPrimaryTotal(books) {
  if (!Array.isArray(books) || !books.length) {
    return null;
  }

  const row = books.find(
    item => item?.over || item?.under
  );

  if (!row) return null;

  return {
    bookmaker: row.bookmaker || null,
    over: row.over
      ? {
          point: row.over.point ?? null,
          price: row.over.price ?? null
        }
      : null,
    under: row.under
      ? {
          point: row.under.point ?? null,
          price: row.under.price ?? null
        }
      : null
  };
}

function buildMarketSummary({
  awayAbbr,
  homeAbbr,
  awayBest,
  homeBest,
  consensusAway,
  consensusHome,
  total
}) {
  const parts = [];

  if (
    consensusAway !== null ||
    consensusHome !== null
  ) {
    parts.push(
      `Consensus ${awayAbbr} ${formatAmericanOdds(consensusAway)} · ` +
      `${homeAbbr} ${formatAmericanOdds(consensusHome)}`
    );
  }

  if (
    total?.over?.point !== null &&
    total?.over?.point !== undefined
  ) {
    parts.push(
      `Total ${formatLine(total.over.point)}`
    );
  }

  if (!parts.length) {
    const bestBooks = [
      awayBest?.bookmaker,
      homeBest?.bookmaker
    ]
      .filter(Boolean)
      .join(" / ");

    return bestBooks
      ? `Best prices: ${bestBooks}`
      : "Current prices unavailable";
  }

  return parts.join(" · ");
}

function formatAmericanOdds(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number > 0
    ? `+${Math.round(number)}`
    : `${Math.round(number)}`;
}

function formatLine(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return Number.isInteger(number)
    ? number.toString()
    : number.toFixed(1);
}

function formatLineupUpdatedTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }
  );
}

function formatPitcherStatus(status) {
  const normalized =
    String(status || "").toLowerCase();

  if (
    normalized === "changed" ||
    normalized.includes("change")
  ) {
    return "CHANGED";
  }

  if (normalized === "confirmed") {
    return "CONFIRMED";
  }

  return "PROBABLE";
}

function formatTimeframeShort(value) {
  if (value === "last_7") return "7D";
  if (value === "last_30") return "30D";
  return "Season";
}

function formatLocationLabel(value) {
  if (value === "home") return "Home";
  if (value === "away") return "Away";
  return "All";
}

function createUnknownPitcher() {
  return {
    name: "Starter TBD",
    age: null,
    throws: null,
    status: "unknown",
    stats: {
      last_7: {
        all: {},
        home: {},
        away: {}
      },
      last_30: {
        all: {},
        home: {},
        away: {}
      },
      season: {
        all: {},
        home: {},
        away: {}
      },
      vs_lhh: {},
      vs_rhh: {}
    }
  };
}
