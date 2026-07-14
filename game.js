const GAME_LOGO_BASE =
  "https://www.mlbstatic.com/team-logos/team-cap-on-dark";

const state = {
  game: null,
  timeframe: "last_30",
  location: "all"
};

const OFFENSE_METRICS = ["AVG", "wRC+", "K%", "BB%", "OBP", "OPS"];
const LOWER_IS_BETTER = new Set(["ERA", "WHIP", "FIP", "xFIP", "AVG Against", "K%"]);

async function loadGame() {
  const status = document.getElementById("gameStatus");
  const details = document.getElementById("gameDetails");

  try {
    const params = new URLSearchParams(window.location.search);
    const requestedGameId = params.get("id");
    const requestedPlayId = params.get("play");

    const [gamesResponse, cardResponse] = await Promise.all([
      fetch(`data/games.json?v=${Date.now()}`),
      fetch(`data/todays-card.json?v=${Date.now()}`)
    ]);

    if (!gamesResponse.ok) {
      throw new Error("Unable to load game data.");
    }

    const gamesData = await gamesResponse.json();
    const games = gamesData.games || [];
    const cardData = cardResponse.ok ? await cardResponse.json() : { plays: [] };

    let gameId = requestedGameId;
    let selectedPlay = null;

    if (requestedPlayId) {
      selectedPlay = (cardData.plays || []).find(play => play.id === requestedPlayId);
      if (selectedPlay && !gameId) {
        gameId = selectedPlay.game_id || createGameId(selectedPlay);
      }
    }

    if (!gameId) gameId = games[0]?.id;

    let game = games.find(item => item.id === gameId);
    if (!game && selectedPlay) game = createFallbackGame(selectedPlay);

    if (!game) {
      throw new Error("Matchup data has not been added yet.");
    }

    state.game = game;
    state.timeframe =
      game.controls?.default_timeframe ||
      gamesData.default_controls?.timeframe ||
      "last_30";
    state.location =
      game.controls?.default_location ||
      gamesData.default_controls?.location ||
      "all";

    renderAll();

    document.title =
      `${game.away_team.abbr} at ${game.home_team.abbr} | Boring Bets`;

    status.remove();
    details.hidden = false;
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Unable to load matchup.";
  }
}

function renderAll() {
  renderGameHeader();
  renderStatusStrip();
  renderControls();
  renderPitchers();
  renderOffenses();
  renderLineupMatchups();
  renderBullpens();
  renderContextCards();
}

function renderGameHeader() {
  const game = state.game;

  setLogo("gameAwayLogo", game.away_team?.team_id, game.away_team?.abbr);
  setLogo("gameHomeLogo", game.home_team?.team_id, game.home_team?.abbr);
  setText("gameAwayTeam", game.away_team?.abbr);
  setText("gameHomeTeam", game.home_team?.abbr);
}

function renderStatusStrip() {
  const game = state.game;
  const confirmedStarters = [
    game.pitchers?.away?.status,
    game.pitchers?.home?.status
  ].filter(value => value === "confirmed").length;

  setText("gameUpdatedStatus", `UPDATED ${formatUpdatedTime(game.last_updated)}`);
  setText("lineupStatus", "PROJECTED LINEUP");
  setText(
    "starterStatus",
    `${confirmedStarters} STARTER${confirmedStarters === 1 ? "" : "S"} CONFIRMED`
  );
}

function renderControls() {
  document.querySelectorAll("[data-timeframe]").forEach(button => {
    const value = button.dataset.timeframe;
    button.classList.toggle("active", value === state.timeframe);
    button.onclick = () => {
      state.timeframe = value;
      renderAll();
    };
  });

  document.querySelectorAll("[data-location]").forEach(button => {
    const value = button.dataset.location;
    button.classList.toggle("active", value === state.location);
    button.onclick = () => {
      state.location = value;
      renderAll();
    };
  });
}

function renderPitchers() {
  renderPitcherCard(
    "awayPitcherCard",
    state.game.pitchers?.away,
    state.game.away_team?.abbr,
    "away"
  );
  renderPitcherCard(
    "homePitcherCard",
    state.game.pitchers?.home,
    state.game.home_team?.abbr,
    "home"
  );
}

function renderPitcherCard(containerId, pitcher, teamAbbr, side) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!pitcher) pitcher = createUnknownPitcher();

  const timeframeStats = pitcher.stats?.[state.timeframe] || {};
  const selectedAll = timeframeStats.all || {};
  const seasonAll = pitcher.stats?.season?.all || {};
  const locationStats = timeframeStats[state.location] || selectedAll;
  const vsLeft = pitcher.stats?.vs_lhh || {};
  const vsRight = pitcher.stats?.vs_rhh || {};
  const profileUrl = pitcher.profile_url || "#";

  const matchupLocation = side === "away" ? "Away" : "Home";
  const locationLabel = state.location === "all" ? matchupLocation : formatLocation(state.location);
  const automaticLocationStats =
    state.location === "all"
      ? (timeframeStats[side === "away" ? "away" : "home"] || selectedAll)
      : locationStats;

  container.innerHTML = `
    <a class="pitcher-card-link" href="${escapeAttribute(profileUrl)}">
      <div class="pitcher-card-heading">
        <div>
          <span class="data-label">${formatPitcherStatus(pitcher.status)}</span>
          <h2>${escapeHtml(pitcher.name || "Starter TBD")}</h2>
          <p>${escapeHtml(teamAbbr || "—")} · Age ${pitcher.age ?? "—"} · ${pitcher.throws ? `${pitcher.throws}HP` : "Throws —"}</p>
        </div>
        <span class="open-data">Full data →</span>
      </div>

      <div class="table-scroll">
        <table class="data-table pitcher-data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>${formatTimeframeShort(state.timeframe)}</th>
              <th>Season</th>
              <th>${locationLabel}</th>
              <th>vs LHH</th>
              <th>vs RHH</th>
            </tr>
          </thead>
          <tbody>
            ${pitcherMetricRow("ERA", selectedAll.era, seasonAll.era, automaticLocationStats.era, vsLeft.era, vsRight.era, "number")}
            ${pitcherMetricRow("WHIP", selectedAll.whip, seasonAll.whip, automaticLocationStats.whip, vsLeft.whip, vsRight.whip, "number")}
            ${pitcherMetricRow("FIP", selectedAll.fip, seasonAll.fip, automaticLocationStats.fip, vsLeft.fip, vsRight.fip, "number")}
            ${pitcherMetricRow("xFIP", selectedAll.xfip, seasonAll.xfip, automaticLocationStats.xfip, vsLeft.xfip, vsRight.xfip, "number")}
            ${pitcherMetricRow("AVG Against", selectedAll.avg_against, seasonAll.avg_against, automaticLocationStats.avg_against, vsLeft.avg_against, vsRight.avg_against, "average")}
          </tbody>
        </table>
      </div>
    </a>
  `;
}

function pitcherMetricRow(label, selectedValue, seasonValue, locationValue, leftValue, rightValue, type) {
  return `
    <tr>
      <th>${label}</th>
      ${metricCell(selectedValue, type, label)}
      ${metricCell(seasonValue, type, label)}
      ${metricCell(locationValue, type, label)}
      ${metricCell(leftValue, type, label)}
      ${metricCell(rightValue, type, label)}
    </tr>
  `;
}

function renderOffenses() {
  const game = state.game;

  renderOffenseCard(
    "homeOffenseCard",
    game.offense?.home,
    game.home_team,
    game.pitchers?.away
  );

  renderOffenseCard(
    "awayOffenseCard",
    game.offense?.away,
    game.away_team,
    game.pitchers?.home
  );
}

function renderOffenseCard(containerId, offense, team, opposingPitcher) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const hand = opposingPitcher?.throws === "L" ? "L" : "R";
  const splitLabel = `vs ${hand}HP`;
  const period = offense?.stats?.[state.timeframe] || {};
  const locationData = period[state.location] || period.all || {};
  const detailsUrl = offense?.details_url || "#";

  container.innerHTML = `
    <a class="module-link" href="${escapeAttribute(detailsUrl)}">
      <div class="module-heading compact-heading">
        <div>
          <span class="data-label">OFFENSE VS STARTER</span>
          <h3>${escapeHtml(team?.abbr || offense?.team || "OFFENSE")} offense ${splitLabel}</h3>
          <p>${escapeHtml(opposingPitcher?.name || "Starter TBD")} · ${formatTimeframe(state.timeframe)} · ${formatLocation(state.location)}</p>
        </div>
        <span class="open-data">Projected lineup →</span>
      </div>

      <div class="table-scroll">
        <table class="data-table offense-data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Overall</th>
              <th>Rank</th>
              <th>${splitLabel}</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            ${OFFENSE_METRICS.map(metric => offenseMetricRow(metric, locationData?.[metric])).join("")}
          </tbody>
        </table>
      </div>
    </a>
  `;
}

function offenseMetricRow(metric, values = {}) {
  const overallRank = values.overall_rank;
  const handRank = values.vs_hand_rank;
  return `
    <tr>
      <th>${metric}</th>
      ${metricCell(values.overall, offenseMetricType(metric), metric, overallRank)}
      ${rankCell(overallRank)}
      ${metricCell(values.vs_hand, offenseMetricType(metric), metric, handRank)}
      ${rankCell(handRank)}
    </tr>
  `;
}

function renderLineupMatchups() {
  const matchup = state.game.pitcher_vs_projected_lineup || {};
  renderLineupCard("awayPitcherLineupCard", matchup.away_pitcher);
  renderLineupCard("homePitcherLineupCard", matchup.home_pitcher);
}

function renderLineupCard(containerId, data = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const summary = data.summary || data;

  container.innerHTML = `
    <button class="module-button" type="button">
      <div class="module-heading compact-heading">
        <div>
          <span class="data-label">PITCHER VS PROJECTED LINEUP</span>
          <h3>${escapeHtml(data.pitcher || "Starter TBD")} vs ${escapeHtml(data.opponent || "Opponent")}</h3>
        </div>
        <span class="open-data">Batter detail →</span>
      </div>
      <div class="matchup-summary-grid">
        ${summaryStat("PA", summary.pa, "integer")}
        ${summaryStat("K", summary.k, "integer")}
        ${summaryStat("BB", summary.bb, "integer")}
        ${summaryStat("AVG", summary.avg, "average")}
        ${summaryStat("OPS", summary.ops, "average")}
        ${summaryStat("HR", summary.hr, "integer")}
      </div>
    </button>
  `;
}

function renderBullpens() {
  renderBullpenCard("awayBullpenCard", state.game.bullpens?.away, state.game.away_team);
  renderBullpenCard("homeBullpenCard", state.game.bullpens?.home, state.game.home_team);
}

function renderBullpenCard(containerId, bullpen = {}, team = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const stats = bullpen.stats?.[state.timeframe]?.[state.location] ||
    bullpen.stats?.[state.timeframe]?.all ||
    bullpen.stats?.[state.timeframe] || {};

  container.innerHTML = `
    <a class="module-link" href="${escapeAttribute(bullpen.details_url || "#")}">
      <div class="module-heading compact-heading">
        <div>
          <span class="data-label">BULLPEN</span>
          <h3>${escapeHtml(team?.abbr || bullpen.team || "—")} relief unit</h3>
        </div>
        <span class="open-data">Workload →</span>
      </div>
      <div class="matchup-summary-grid bullpen-summary-grid">
        ${summaryStat("ERA", stats.era, "number")}
        ${summaryStat("WHIP", stats.whip, "number")}
        ${summaryStat("FIP", stats.fip, "number")}
        ${summaryStat("Used Yday", bullpen.used_yesterday, "integer")}
        ${summaryStat("B2B Arms", bullpen.back_to_back, "integer")}
        ${summaryStat("Fresh", bullpen.fresh_leverage, "integer")}
      </div>
      ${bullpen.notes ? `<p class="module-note">${escapeHtml(bullpen.notes)}</p>` : ""}
    </a>
  `;
}

function renderContextCards() {
  const weather = state.game.weather || {};
  const market = state.game.market || {};

  const weatherCard = document.getElementById("weather");
  if (weatherCard) {
    weatherCard.innerHTML = `
      <p class="kicker">WEATHER</p>
      <h3>${formatContextWeather(weather)}</h3>
      <p>${formatWind(weather)} · Humidity ${formatPercent(weather.humidity)} · Rain ${formatPercent(weather.rain_probability)}</p>
    `;
    weatherCard.href = weather.details_url || "#";
  }

  const marketCard = document.getElementById("market");
  if (marketCard) {
    marketCard.innerHTML = `
      <p class="kicker">MARKET</p>
      <h3>Total ${formatSimple(market.total_current)}</h3>
      <p>Opened ${formatSimple(market.total_open)} · Current prices and movement</p>
    `;
    marketCard.href = market.details_url || "#";
  }
}

function summaryStat(label, value, type) {
  return `
    <span class="summary-stat">
      <small>${label}</small>
      <strong>${formatMetric(value, type)}</strong>
    </span>
  `;
}

function metricCell(value, type, metric, rank = null) {
  return `<td class="${rankColorClass(rank, metric)}">${formatMetric(value, type)}</td>`;
}

function rankCell(rank) {
  return `<td class="rank-cell ${rankColorClass(rank)}">${rank ? `#${rank}` : "—"}</td>`;
}

function rankColorClass(rank) {
  const number = Number(rank);
  if (!Number.isFinite(number)) return "stat-neutral";
  if (number <= 5) return "stat-best";
  if (number <= 10) return "stat-good";
  if (number <= 20) return "stat-neutral";
  if (number <= 25) return "stat-poor";
  return "stat-worst";
}

function offenseMetricType(metric) {
  if (["AVG", "OBP", "OPS"].includes(metric)) return "average";
  if (["K%", "BB%"].includes(metric)) return "percent";
  return "integer";
}

function createGameId(play) {
  return [
    play.date,
    String(play.away_team || "").toLowerCase(),
    String(play.home_team || "").toLowerCase()
  ].join("-");
}

function createFallbackGame(play) {
  return {
    id: createGameId(play),
    date: play.date,
    sport: play.sport || "MLB",
    last_updated: null,
    lineup_label: "Projected Lineup",
    away_team: { abbr: play.away_team, name: play.away_team, team_id: play.away_team_id },
    home_team: { abbr: play.home_team, name: play.home_team, team_id: play.home_team_id },
    controls: { default_timeframe: "last_30", default_location: "all" },
    pitchers: { away: createUnknownPitcher(), home: createUnknownPitcher() },
    offense: {},
    pitcher_vs_projected_lineup: {},
    bullpens: {},
    weather: {},
    market: {}
  };
}

function createUnknownPitcher() {
  return {
    name: "Starter TBD",
    age: null,
    throws: null,
    status: "unknown",
    stats: {
      last_7: { all: {}, home: {}, away: {} },
      last_30: { all: {}, home: {}, away: {} },
      season: { all: {}, home: {}, away: {} },
      vs_lhh: {},
      vs_rhh: {}
    }
  };
}

function formatPitcherStatus(status) {
  if (status === "confirmed") return "CONFIRMED STARTER";
  if (status === "probable") return "PROBABLE STARTER";
  if (status === "bullpen") return "BULLPEN GAME";
  return "STARTER TBD";
}

function formatTimeframe(value) {
  if (value === "last_7") return "Last 7 Days";
  if (value === "last_30") return "Last 30 Days";
  return "Season";
}

function formatTimeframeShort(value) {
  if (value === "last_7") return "7D";
  if (value === "last_30") return "30D";
  return "Season";
}

function formatLocation(value) {
  if (value === "home") return "Home";
  if (value === "away") return "Away";
  return "All";
}

function formatMetric(value, type) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (type === "average") return number.toFixed(3).replace(/^0/, "");
  if (type === "percent") return `${number.toFixed(1)}%`;
  if (type === "integer") return Math.round(number).toString();
  return number.toFixed(2);
}

function formatUpdatedTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function formatContextWeather(weather) {
  const temperature = weather.temperature;
  if (temperature === null || temperature === undefined) return "Conditions pending";
  return `${Math.round(Number(temperature))}°`;
}

function formatWind(weather) {
  if (weather.wind_speed === null || weather.wind_speed === undefined) return "Wind —";
  return `Wind ${weather.wind_direction || ""} ${Number(weather.wind_speed).toFixed(1)} mph`.trim();
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  return `${number <= 1 ? Math.round(number * 100) : Math.round(number)}%`;
}

function formatSimple(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "—";
}

function setLogo(id, teamId, team) {
  const img = document.getElementById(id);
  if (!img) return;
  if (!teamId) {
    img.removeAttribute("src");
    img.alt = `${team || "Team"} logo unavailable`;
    return;
  }
  img.src = `${GAME_LOGO_BASE}/${Number(teamId)}.svg`;
  img.alt = `${team || "Team"} logo`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value || "#");
}

loadGame();
