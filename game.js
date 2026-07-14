const GAME_LOGO_BASE =
  "https://www.mlbstatic.com/team-logos/team-cap-on-dark";

const state = {
  game: null,
  timeframe: "last_30",
  location: "all"
};

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

    let gameId = requestedGameId;

    if (!gameId && requestedPlayId && cardResponse.ok) {
      const cardData = await cardResponse.json();

      const selectedPlay = (cardData.plays || []).find(
        play => play.id === requestedPlayId
      );

      if (selectedPlay) {
        gameId =
          selectedPlay.game_id ||
          createGameId(selectedPlay);
      }
    }

    if (!gameId) {
      gameId = games[0]?.id;
    }

let game = games.find(item => item.id === gameId);

if (!game && requestedPlayId && cardResponse.ok) {
  const cardData = await cardResponse.json();

  const selectedPlay = (cardData.plays || []).find(
    play => play.id === requestedPlayId
  );

  if (selectedPlay) {
    game = createFallbackGame(selectedPlay);
  }
}

if (!game) {
  throw new Error(
    "Matchup data has not been added yet."
  );
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

    renderGameHeader();
    renderControls();
    renderPitchers();

    document.title =
      `${game.away_team.abbr} at ${game.home_team.abbr} | Boring Bets`;

    status.remove();
    details.hidden = false;
  } catch (error) {
    console.error(error);

    status.textContent =
      error.message || "Unable to load matchup.";
  }
}

function renderGameHeader() {
  const game = state.game;

  setLogo(
    "gameAwayLogo",
    game.away_team.team_id,
    game.away_team.abbr
  );

  setLogo(
    "gameHomeLogo",
    game.home_team.team_id,
    game.home_team.abbr
  );

  setText("gameAwayTeam", game.away_team.abbr);
  setText("gameHomeTeam", game.home_team.abbr);

  setText(
    "gameTitle",
    `${game.away_team.name} at ${game.home_team.name}`
  );

  setText("gameDate", formatDate(game.date));
}

function renderControls() {
  const timeframeButtons =
    document.querySelectorAll("[data-timeframe]");

  const locationButtons =
    document.querySelectorAll("[data-location]");

  timeframeButtons.forEach(button => {
    const value = button.dataset.timeframe;

    button.classList.toggle(
      "active",
      value === state.timeframe
    );

    button.onclick = () => {
      state.timeframe = value;
      renderControls();
      renderPitchers();
    };
  });

  locationButtons.forEach(button => {
    const value = button.dataset.location;

    button.classList.toggle(
      "active",
      value === state.location
    );

    button.onclick = () => {
      state.location = value;
      renderControls();
      renderPitchers();
    };
  });
}

function renderPitchers() {
  const game = state.game;

  renderPitcherCard(
    "awayPitcherCard",
    game.pitchers.away
  );

  renderPitcherCard(
    "homePitcherCard",
    game.pitchers.home
  );
}

function renderPitcherCard(containerId, pitcher) {
  const container =
    document.getElementById(containerId);

  if (!container) return;

  const selectedStats =
    pitcher.stats?.[state.timeframe]?.[state.location] || {};

  const vsLeft = pitcher.stats?.vs_lhh || {};
  const vsRight = pitcher.stats?.vs_rhh || {};

  container.innerHTML = `
    <a
      class="pitcher-card-link"
      href="${pitcher.profile_url || "#"}"
    >
      <div class="pitcher-card-heading">
        <div>
          <span class="data-label">
            ${formatPitcherStatus(pitcher.status)}
          </span>

          <h2>${pitcher.name || "TBD"}</h2>

          <p>
            Age ${pitcher.age ?? "—"} ·
            Throws ${pitcher.throws ?? "—"}
          </p>
        </div>

        <span class="open-data">
          Full Pitcher Data →
        </span>
      </div>

      <div class="table-scroll">
        <table class="data-table pitcher-data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>${formatTimeframe(state.timeframe)}</th>
              <th>${formatLocation(state.location)}</th>
              <th>vs LHH</th>
              <th>vs RHH</th>
            </tr>
          </thead>

          <tbody>
            ${pitcherMetricRow(
              "ERA",
              selectedStats.era,
              selectedStats.era,
              null,
              null,
              "era"
            )}

            ${pitcherMetricRow(
              "WHIP",
              selectedStats.whip,
              selectedStats.whip,
              vsLeft.whip,
              vsRight.whip,
              "whip"
            )}

            ${pitcherMetricRow(
              "FIP",
              selectedStats.fip,
              selectedStats.fip,
              vsLeft.fip,
              vsRight.fip,
              "fip"
            )}

            ${pitcherMetricRow(
              "xFIP",
              selectedStats.xfip,
              selectedStats.xfip,
              vsLeft.xfip,
              vsRight.xfip,
              "xfip"
            )}

            ${pitcherMetricRow(
              "AVG Against",
              selectedStats.avg_against,
              selectedStats.avg_against,
              vsLeft.avg_against,
              vsRight.avg_against,
              "average"
            )}
          </tbody>
        </table>
      </div>
    </a>
  `;
}

function pitcherMetricRow(
  label,
  selectedValue,
  locationValue,
  leftValue,
  rightValue,
  type
) {
  return `
    <tr>
      <th>${label}</th>
      <td>${formatMetric(selectedValue, type)}</td>
      <td>${formatMetric(locationValue, type)}</td>
      <td>${formatMetric(leftValue, type)}</td>
      <td>${formatMetric(rightValue, type)}</td>
    </tr>
  `;
}

function createGameId(play) {
  return [
    play.date,
    String(play.away_team || "").toLowerCase(),
    String(play.home_team || "").toLowerCase()
  ].join("-");
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

function formatLocation(value) {
  if (value === "home") return "Home";
  if (value === "away") return "Away";
  return "All";
}

function formatMetric(value, type) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (type === "average") {
    return Number(value).toFixed(3).replace(/^0/, "");
  }

  return Number(value).toFixed(2);
}

function formatDate(value) {
  if (!value) return "—";

  return new Date(
    `${value}T12:00:00`
  ).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value ?? "—";
  }
}

function setLogo(id, teamId, team) {
  const img = document.getElementById(id);

  if (!img) return;

  img.src =
    `${GAME_LOGO_BASE}/${Number(teamId)}.svg`;

  img.alt =
    `${team || "Team"} logo`;
}

function createFallbackGame(play) {
  return {
    id: createGameId(play),
    date: play.date,
    sport: play.sport || "MLB",

    away_team: {
      abbr: play.away_team,
      name: play.away_team,
      team_id: play.away_team_id
    },

    home_team: {
      abbr: play.home_team,
      name: play.home_team,
      team_id: play.home_team_id
    },

    controls: {
      default_timeframe: "last_30",
      default_location: "all"
    },

    pitchers: {
      away: {
        name: "Starter TBD",
        age: null,
        throws: null,
        status: "unknown",
        stats: {}
      },

      home: {
        name: "Starter TBD",
        age: null,
        throws: null,
        status: "unknown",
        stats: {}
      }
    },

    offense: {},
    bullpens: {},
    weather: {},
    market: {}
  };
}

loadGame();


