import {
  getRankHeatClass
} from "../engine/colorEngine.js";

const MLB_OFFENSE_METRICS = [
  "AVG",
  "wRC+",
  "K%",
  "BB%",
  "OBP",
  "OPS"
];

const MLB_PITCHER_METRICS = [
  {
    key: "era",
    label: "ERA",
    type: "number"
  },
  {
    key: "whip",
    label: "WHIP",
    type: "number"
  },
  {
    key: "fip",
    label: "FIP",
    type: "number"
  },
  {
    key: "xfip",
    label: "xFIP",
    type: "number"
  },
  {
    key: "avg_against",
    label: "AVG A",
    type: "average"
  }
];

export function buildMlbOffenseModule({
  game,
  side,
  timeframe = "last_30",
  location = "all"
}) {
  const isAway = side === "away";

  const team = isAway
    ? game.away_team
    : game.home_team;

  const offense = isAway
    ? game.offense?.away
    : game.offense?.home;

  const opposingPitcher = isAway
    ? game.pitchers?.home
    : game.pitchers?.away;

  const pitcherHand =
    opposingPitcher?.throws === "L"
      ? "L"
      : opposingPitcher?.throws === "R"
        ? "R"
        : null;

  const period =
    offense?.stats?.[timeframe] || {};

  const selectedLocation =
    period?.[location] ||
    period?.all ||
    {};

  return {
    title:
      `${team?.abbr || offense?.team || "TEAM"} OFFENSE`,

    context:
      pitcherHand
        ? `vs ${pitcherHand}HP`
        : "Starter handedness TBD",

    opponent:
      opposingPitcher?.name ||
      "Starter TBD",

    detailsUrl:
      offense?.details_url || "#",

    metrics:
      MLB_OFFENSE_METRICS.map(metric => {
        const metricData =
          selectedLocation?.[metric] || {};

        return {
          label: metric,
          type:
            getMlbOffenseMetricType(metric),

          overall: {
            value:
              metricData.overall ?? null,
            rank:
              metricData.overall_rank ?? null
          },

          split: {
            value:
              metricData.vs_hand ?? null,
            rank:
              metricData.vs_hand_rank ?? null
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

  const team = isAway
    ? game.away_team
    : game.home_team;

  const pitcher = isAway
    ? game.pitchers?.away
    : game.pitchers?.home;

  const safePitcher =
    pitcher || createUnknownPitcher();

  const timeframeStats =
    safePitcher.stats?.[timeframe] || {};

  const selectedAll =
    timeframeStats.all || {};

  const seasonAll =
    safePitcher.stats?.season?.all || {};

  const matchupLocation =
    isAway ? "away" : "home";

  const selectedLocationKey =
    location === "all"
      ? matchupLocation
      : location;

  const selectedLocation =
    timeframeStats?.[selectedLocationKey] ||
    selectedAll;

  const vsLeft =
    safePitcher.stats?.vs_lhh || {};

  const vsRight =
    safePitcher.stats?.vs_rhh || {};

  return {
    name:
      safePitcher.name ||
      "Starter TBD",

    team:
      team?.abbr || "—",

    age:
      safePitcher.age ?? "—",

    handLabel:
      safePitcher.throws
        ? `${safePitcher.throws}HP`
        : "Throws —",

    statusLabel:
      formatPitcherStatus(
        safePitcher.status
      ),

    detailsUrl:
      safePitcher.profile_url || "#",

    columns: [
      {
        label:
          formatTimeframeShort(timeframe)
      },
      {
        label: "Season"
      },
      {
        label:
          formatLocationLabel(
            selectedLocationKey
          )
      },
      {
        label: "vs LHH"
      },
      {
        label: "vs RHH"
      }
    ],

    metrics:
      MLB_PITCHER_METRICS.map(metric => ({
        label: metric.label,

        values: [
          normalizePitcherValue(
            selectedAll?.[metric.key],
            metric.type
          ),

          normalizePitcherValue(
            seasonAll?.[metric.key],
            metric.type
          ),

          normalizePitcherValue(
            selectedLocation?.[metric.key],
            metric.type
          ),

          normalizePitcherValue(
            vsLeft?.[metric.key],
            metric.type
          ),

          normalizePitcherValue(
            vsRight?.[metric.key],
            metric.type
          )
        ]
      }))
  };
}

export function buildMlbBullpenModule({
  game,
  side,
  timeframe = "last_30",
  location = "all"
}) {
  const isAway = side === "away";

  const team = isAway
    ? game.away_team
    : game.home_team;

  const bullpen = isAway
    ? game.bullpens?.away
    : game.bullpens?.home;

  const period =
    bullpen?.stats?.[timeframe] || {};

  const selectedStats =
    period?.[location] ||
    period?.all ||
    period ||
    {};

  return {
    title:
      `${team?.abbr || bullpen?.team || "—"} relief unit`,

    detailsUrl:
      bullpen?.details_url || "#",

    note:
      bullpen?.notes || "",

    metrics: [
      normalizeBullpenMetric(
        "ERA",
        selectedStats.era,
        "number"
      ),

      normalizeBullpenMetric(
        "WHIP",
        selectedStats.whip,
        "number"
      ),

      normalizeBullpenMetric(
        "FIP",
        selectedStats.fip,
        "number"
      ),

      normalizeBullpenMetric(
        "Used Yday",
        bullpen?.used_yesterday,
        "integer"
      ),

      normalizeBullpenMetric(
        "B2B Arms",
        bullpen?.back_to_back,
        "integer"
      ),

      normalizeBullpenMetric(
        "Fresh",
        bullpen?.fresh_leverage,
        "integer"
      )
    ]
  };
}

export function buildMlbMatchupModule({
  game,
  side
}) {
  const isAwayPitcher =
    side === "away";

  const matchupData =
    isAwayPitcher
      ? game.pitcher_vs_projected_lineup?.away_pitcher
      : game.pitcher_vs_projected_lineup?.home_pitcher;

  const pitcher =
    isAwayPitcher
      ? game.pitchers?.away
      : game.pitchers?.home;

  const opponent =
    isAwayPitcher
      ? game.home_team
      : game.away_team;

  const summary =
    matchupData?.summary ||
    matchupData ||
    {};

  return {
    title:
      `${matchupData?.pitcher ||
        pitcher?.name ||
        "Starter TBD"} vs ${
        matchupData?.opponent ||
        opponent?.abbr ||
        "Opponent"
      }`,

    metrics: [
      normalizeMatchupMetric(
        "PA",
        summary.pa,
        "integer"
      ),

      normalizeMatchupMetric(
        "K",
        summary.k,
        "integer"
      ),

      normalizeMatchupMetric(
        "BB",
        summary.bb,
        "integer"
      ),

      normalizeMatchupMetric(
        "AVG",
        summary.avg,
        "average"
      ),

      normalizeMatchupMetric(
        "OPS",
        summary.ops,
        "average"
      ),

      normalizeMatchupMetric(
        "HR",
        summary.hr,
        "integer"
      )
    ]
  };
}

export function buildMlbWeatherModule({
  game
}) {
  const weather =
    game.weather || {};

  return {
    detailsUrl:
      weather.details_url || "#",

    headline:
      formatWeatherHeadline(weather),

    summary:
      formatWeatherSummary(weather)
  };
}

export function buildMlbMarketModule({
  game
}) {
  const market =
    game.market || {};

  return {
    detailsUrl:
      market.details_url || "#",

    headline:
      formatMarketHeadline(market),

    summary:
      formatMarketSummary(market)
  };
}

export function getMlbOffenseMetricType(metric) {
  if (
    metric === "AVG" ||
    metric === "OBP" ||
    metric === "OPS"
  ) {
    return "average";
  }

  if (
    metric === "K%" ||
    metric === "BB%"
  ) {
    return "percent";
  }

  return "integer";
}

function normalizePitcherValue(
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
      ? rawValue.rank
      : null;

  return {
    value:
      value ?? null,

    rank:
      rank ?? null,

    display:
      formatPitcherMetric(
        value,
        type
      ),

    heatClass:
      getRankHeatClass(rank)
  };
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
      ? rawValue.rank
      : null;

  return {
    label,

    value:
      value ?? null,

    rank:
      rank ?? null,

    display:
      formatMlbMetric(
        value,
        type
      ),

    heatClass:
      getRankHeatClass(rank)
  };
}

function normalizeMatchupMetric(
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
      ? rawValue.rank
      : null;

  const hasValue =
    value !== null &&
    value !== undefined &&
    value !== "";

  return {
    label,

    value:
      value ?? null,

    rank:
      rank ?? null,

    display:
      formatMlbMetric(
        value,
        type
      ),

    heatClass:
      hasValue && rank === null
        ? "metric-average"
        : getRankHeatClass(rank)
  };
}

function formatPitcherMetric(
  value,
  type
) {
  return formatMlbMetric(
    value,
    type
  );
}

function formatMlbMetric(
  value,
  type
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number =
    Number(value);

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
  const temperature =
    weather.temperature;

  if (
    temperature === null ||
    temperature === undefined ||
    temperature === ""
  ) {
    return "Conditions pending";
  }

  return `${Math.round(
    Number(temperature)
  )}°`;
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
      `Wind ${direction}${Number(
        weather.wind_speed
      ).toFixed(1)} mph`
    );
  } else {
    parts.push("Wind —");
  }

  parts.push(
    `Humidity ${formatWeatherPercent(
      weather.humidity
    )}`
  );

  parts.push(
    `Rain ${formatWeatherPercent(
      weather.rain_probability
    )}`
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

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return `${
    number <= 1
      ? Math.round(number * 100)
      : Math.round(number)
  }%`;
}

function formatMarketHeadline(market) {
  const currentTotal =
    market.total_current;

  if (
    currentTotal === null ||
    currentTotal === undefined ||
    currentTotal === ""
  ) {
    return "Market pending";
  }

  return `Total ${currentTotal}`;
}

function formatMarketSummary(market) {
  const openingTotal =
    market.total_open;

  const currentTotal =
    market.total_current;

  if (
    openingTotal === null ||
    openingTotal === undefined ||
    openingTotal === ""
  ) {
    return "Opening price unavailable";
  }

  if (
    currentTotal === null ||
    currentTotal === undefined ||
    currentTotal === ""
  ) {
    return `Opened ${openingTotal}`;
  }

  return `Opened ${openingTotal} · Current ${currentTotal}`;
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
  if (value === "last_7") {
    return "7D";
  }

  if (value === "last_30") {
    return "30D";
  }

  return "Season";
}

function formatLocationLabel(value) {
  if (value === "home") {
    return "Home";
  }

  if (value === "away") {
    return "Away";
  }

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