import { getRankHeatClass } from "../engine/colorEngine.js";

const MLB_OFFENSE_METRICS = ["AVG", "wRC+", "K%", "BB%", "OBP", "OPS"];

const MLB_PITCHER_METRICS = [
  { key: "era", label: "ERA", type: "number" },
  { key: "whip", label: "WHIP", type: "number" },
  { key: "fip", label: "FIP", type: "number" },
  { key: "xfip", label: "xFIP", type: "number" },
  { key: "avg_against", label: "AVG A", type: "average" }
];

export function buildMlbOffenseModule({
  game,
  side,
  timeframe = "last_30",
  location = "all"
}) {
  const isAway = side === "away";
  const team = isAway ? game.away_team : game.home_team;
  const offense = isAway ? game.offense?.away : game.offense?.home;
  const opposingPitcher = isAway ? game.pitchers?.home : game.pitchers?.away;

  const pitcherHand =
    opposingPitcher?.throws === "L"
      ? "L"
      : opposingPitcher?.throws === "R"
        ? "R"
        : null;

  const period = offense?.stats?.[timeframe] || {};
  const selectedLocationData = period?.[location];

  // Never display All data under a Home or Away label. If the backend has
  // no selected-location block, show unavailable data so failures are honest.
  const selectedLocation =
    selectedLocationData && Object.keys(selectedLocationData).length
      ? selectedLocationData
      : location === "all"
        ? period?.all || {}
        : {};

  return {
    title: `${team?.abbr || offense?.team || "TEAM"} OFFENSE`,
    context: pitcherHand ? `vs ${pitcherHand}HP` : "Starter handedness TBD",
    opponent: opposingPitcher?.name || "Starter TBD",
    detailsUrl: `lineup.html?game=${encodeURIComponent(game.id)}&team=${encodeURIComponent(side)}`,
    metrics: MLB_OFFENSE_METRICS.map(metric => {
      const metricData = selectedLocation?.[metric] || {};

      return {
        label: metric,
        type: getMlbOffenseMetricType(metric),
        overall: {
          value: metricData.overall ?? null,
          rank: metricData.overall_rank ?? null
        },
        split: {
          value: metricData.vs_hand ?? null,
          rank: metricData.vs_hand_rank ?? null
        }
      };
    })
  };
}

export function buildMlbPitcherModule({
  game,
  side,
  timeframe = "last_30",
  location = "all"
}) {
  const isAway = side === "away";
  const team = isAway ? game.away_team : game.home_team;
  const pitcher = isAway ? game.pitchers?.away : game.pitchers?.home;
  const opposingLineup = isAway ? game.lineups?.home : game.lineups?.away;
  const safePitcher = pitcher || createUnknownPitcher();

  // Season is a stable baseline. It changes only with All/Home/Away.
  const season = selectPitcherLocationBlock(
    safePitcher.stats?.season,
    location
  );

  // Selected responds to both timeframe and location.
  const selected = selectPitcherLocationBlock(
    safePitcher.stats?.[timeframe],
    location
  );

  const vsLeft = resolvePitcherSplitBlock(
    safePitcher, timeframe, location, "vs_lhh"
  );
  const vsRight = resolvePitcherSplitBlock(
    safePitcher, timeframe, location, "vs_rhh"
  );
  const lineupMix = summarizeLineupHandedness(
    opposingLineup,
    safePitcher.throws
  );

  const selectedContext = `${formatTimeframeShort(timeframe)} · ${formatLocationLabel(location)}`;
  const seasonContext = `Season · ${formatLocationLabel(location)}`;

  return {
    name: safePitcher.name || "Starter TBD",
    team: team?.abbr || "—",
    age: safePitcher.age ?? "—",
    handLabel: safePitcher.throws ? `${safePitcher.throws}HP` : "Throws —",
    statusLabel: formatPitcherStatus(safePitcher.status),
    detailsUrl: safePitcher.profile_url || "#",
    contextLabel: selectedContext,
    lineupStatusLabel: lineupMix.statusLabel,
    lineupStatusClass: lineupMix.statusClass,
    lineupHandednessLabel: lineupMix.label,
    columns: [
      { label: "Season" },
      { label: "Selected" },
      { label: "vs LHH" },
      { label: "vs RHH" }
    ],
    metrics: MLB_PITCHER_METRICS.map(metric => ({
      label: metric.label,
      values: [
        normalizeRankedPitcherValue(season, metric.key, metric.type, seasonContext),
        normalizeRankedPitcherValue(selected, metric.key, metric.type, selectedContext),
        normalizeRankedPitcherValue(
          vsLeft, metric.key, metric.type,
          `${vsLeft?._contextFallback || selectedContext} · vs LHH`
        ),
        normalizeRankedPitcherValue(
          vsRight, metric.key, metric.type,
          `${vsRight?._contextFallback || selectedContext} · vs RHH`
        )
      ]
    }))
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
  const status = lineup?.status === "confirmed" ? "confirmed" : "projected";
  const statusLabel = status === "confirmed" ? "Confirmed lineup" : "Projected lineup";

  let left = 0;
  let right = 0;
  let unknown = 0;

  players.forEach(player => {
    const bats = String(player?.bats || "").toUpperCase();
    if (bats === "L") left += 1;
    else if (bats === "R") right += 1;
    else if (bats === "S") {
      // Switch hitters are counted by the side they are expected to use in
      // this matchup.
      if (pitcherThrows === "R") left += 1;
      else if (pitcherThrows === "L") right += 1;
      else unknown += 1;
    } else unknown += 1;
  });

  const pieces = [`${left} LHH`, `${right} RHH`];
  if (unknown) pieces.push(`${unknown} unknown`);

  return {
    statusLabel,
    statusClass: status === "confirmed" ? "lineup-status-confirmed" : "lineup-status-projected",
    label: players.length ? pieces.join(" · ") : "LHH/RHH unavailable"
  };
}

function normalizeRankedPitcherValue(block, key, type, contextLabel = "") {
  const rawValue = block?.[key];
  const value = normalizePitcherValue(rawValue, type);
  const hasValue = rawValue !== null && rawValue !== undefined && rawValue !== "";
  const rank = hasValue ? (block?.ranks?.[key] ?? null) : null;
  const poolSize = hasValue ? (block?.rank_pool_size?.[key] ?? null) : null;
  const unavailableReason = key === "era"
    ? block?.era_unavailable_reason || ""
    : "";
  return {
    ...value,
    rank,
    poolSize,
    contextLabel: unavailableReason
      ? `${contextLabel} · ${unavailableReason}`
      : contextLabel,
    // Missing values must never inherit stale red/green rank metadata.
    heatClass: hasValue
      ? getRankHeatClass(rank, poolSize || 30)
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
  const team = isAway ? game.away_team : game.home_team;
  const bullpen = isAway ? game.bullpens?.away : game.bullpens?.home;
  const period = bullpen?.stats?.[timeframe] || {};
  const locationStats = period?.[location];

  const selectedStats =
    locationStats &&
    Object.keys(locationStats).length
      ? locationStats
      : period?.all || period || {};

  return {
    title: `${team?.abbr || bullpen?.team || "—"} relief unit`,
    detailsUrl: bullpen?.details_url || "#",
    note: bullpen?.notes || "",
    metrics: [
      normalizeBullpenMetric("ERA", selectedStats.era, "number"),
      normalizeBullpenMetric("WHIP", selectedStats.whip, "number"),
      normalizeBullpenMetric("FIP", selectedStats.fip, "number"),
      normalizeBullpenMetric("Used Yday", bullpen?.used_yesterday, "integer"),
      normalizeBullpenMetric("B2B Arms", bullpen?.back_to_back, "integer"),
      normalizeBullpenMetric("Fresh", bullpen?.fresh_leverage, "integer")
    ]
  };
}

export function buildMlbMatchupModule({ game, side }) {
  const isAwayPitcher = side === "away";
  const lineupMatchups =
    game.pitcher_vs_lineup ||
    game.pitcher_vs_projected_lineup ||
    {};

  const matchupData = isAwayPitcher
    ? lineupMatchups.away_pitcher
    : lineupMatchups.home_pitcher;

  const pitcher = isAwayPitcher
    ? game.pitchers?.away
    : game.pitchers?.home;

  const opponent = isAwayPitcher
    ? game.home_team
    : game.away_team;

  const summary = matchupData?.summary || matchupData || {};

  const opposingLineup = isAwayPitcher
    ? game.lineups?.home
    : game.lineups?.away;

  const lineupStatus =
    opposingLineup?.status ||
    matchupData?.lineup_status ||
    "projected";

  const lineupLabel =
    opposingLineup?.status_label ||
    matchupData?.lineup_label ||
    (
      lineupStatus === "confirmed"
        ? "Confirmed Lineup"
        : "Projected Lineup"
    );

  return {
    title:
      `${matchupData?.pitcher || pitcher?.name || "Starter TBD"} ` +
      `vs ${matchupData?.opponent || opponent?.abbr || "Opponent"}`,
    lineupStatus,
    lineupLabel,
    metrics: [
      normalizeMatchupMetric("PA", summary.pa, "integer"),
      normalizeMatchupMetric("K", summary.k, "integer"),
      normalizeMatchupMetric("BB", summary.bb, "integer"),
      normalizeMatchupMetric("AVG", summary.avg, "average"),
      normalizeMatchupMetric("OPS", summary.ops, "average"),
      normalizeMatchupMetric("HR", summary.hr, "integer")
    ]
  };
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

function normalizeBullpenMetric(label, rawValue, type) {
  const value =
    rawValue && typeof rawValue === "object"
      ? rawValue.value
      : rawValue;

  const rank =
    rawValue && typeof rawValue === "object"
      ? rawValue.rank
      : null;

  return {
    label,
    value: value ?? null,
    rank: rank ?? null,
    display: formatMlbMetric(value, type),
    heatClass: getRankHeatClass(rank)
  };
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
  if (status === "confirmed") {
    return "CONFIRMED STARTER";
  }

  if (status === "probable") {
    return "PROBABLE STARTER";
  }

  if (status === "bullpen") {
    return "BULLPEN GAME";
  }

  return "STARTER TBD";
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
