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

    let cardData = {
      plays: []
    };

    if (cardResponse.ok) {
      cardData = await cardResponse.json();
    }

    let gameId = requestedGameId;
    let selectedPlay = null;

    if (requestedPlayId) {
      selectedPlay = (cardData.plays || []).find(
        play => play.id === requestedPlayId
      );

      if (selectedPlay && !gameId) {
        gameId =
          selectedPlay.game_id ||
          createGameId(selectedPlay);
      }
    }

    if (!gameId) {
      gameId = games[0]?.id;
    }

    let game = games.find(
      item => item.id === gameId
    );

    if (!game && selectedPlay) {
      game = createFallbackGame(selectedPlay);
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
    renderStatusStrip();
    renderControls();
    renderPitchers();
    renderOffenses();

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
    game.away_team?.team_id,
    game.away_team?.abbr
  );

  setLogo(
    "gameHomeLogo",
    game.home_team?.team_id,
    game.home_team?.abbr
  );

  setText(
    "gameAwayTeam",
    game.away_team?.abbr
  );

  setText(
    "gameHomeTeam",
    game.home_team?.abbr
  );

  setText(
    "gameTitle",
    `${game.away_team?.name || game.away_team?.abbr} at ${
      game.home_team?.name || game.home_team?.abbr
    }`
  );

  setText(
    "gameDate",
    formatDate(game.date)
  );
}

function renderStatusStrip() {
  const game = state.game;

  const confirmedStarters = [
    game.pitchers?.away?.status,
    game.pitchers?.home?.status
  ].filter(status => status === "confirmed").length;

  setText(
    "gameUpdatedStatus",
    `UPDATED ${formatUpdatedTime(game.last_updated)}`
  );

  setText(
    "lineupStatus",
    String(
      game.lineup_label ||
      game.lineup_status ||
      "Projected Lineup"
    ).toUpperCase()
  );

  setText(
    "starterStatus",
    `${confirmedStarters} STARTER${
      confirmedStarters === 1 ? "" : "S"
    } CONFIRMED`
  );
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
      renderOffenses();
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
      renderOffenses();
    };
  });
}

function renderPitchers() {
  const game = state.game;

  renderPitcherCard(
    "awayPitcherCard",
    game.pitchers?.away
  );

  renderPitcherCard(
    "homePitcherCard",
    game.pitchers?.home
  );
}

function renderPitcherCard(containerId, pitcher) {
  const container =
    document.getElementById(containerId);

  if (!container) return;

  if (!pitcher) {
    container.innerHTML = `
      <div class="pitcher-card-link">
        <div class="pitcher-card-heading">
          <div>
            <span class="data-label">
              STARTER TBD
            </span>

            <h2>Starter TBD</h2>

            <p>
              Pitcher information is not available.
            </p>
          </div>
        </div>
      </div>
    `;

    return;
  }

  const timeframeStats =
    pitcher.stats?.[state.timeframe] || {};

  const allStats =
    timeframeStats.all || {};

  const locationStats =
    timeframeStats[state.location] || allStats;

  const vsLeft =
    pitcher.stats?.vs_lhh || {};

  const vsRight =
    pitcher.stats?.vs_rhh || {};

  const profileUrl =
    pitcher.profile_url || "#";

  container.innerHTML = `
    <a
      class="pitcher-card-link"
      href="${profileUrl}"
    >
      <div class="pitcher-card-heading">
        <div>
          <span class="data-label">
            ${formatPitcherStatus(pitcher.status)}
          </span>

          <h2>${pitcher.name || "Starter TBD"}</h2>

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

              <th>
                ${formatTimeframe(state.timeframe)}
              </th>

              <th>
                ${formatLocation(state.location)}
              </th>

              <th>vs LHH</th>
              <th>vs RHH</th>
            </tr>
          </thead>

          <tbody>
            ${pitcherMetricRow(
              "ERA",
              allStats.era,
              locationStats.era,
              vsLeft.era,
              vsRight.era,
              "number"
            )}

            ${pitcherMetricRow(
              "WHIP",
              allStats.whip,
              locationStats.whip,
              vsLeft.whip,
              vsRight.whip,
              "number"
            )}

            ${pitcherMetricRow(
              "FIP",
              allStats.fip,
              locationStats.fip,
              vsLeft.fip,
              vsRight.fip,
              "number"
            )}

            ${pitcherMetricRow(
              "xFIP",
              allStats.xfip,
              locationStats.xfip,
              vsLeft.xfip,
              vsRight.xfip,
              "number"
            )}

            ${pitcherMetricRow(
              "AVG Against",
              allStats.avg_against,
              locationStats.avg_against,
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
  timeframeValue,
  locationValue,
  leftValue,
  rightValue,
  type
) {
  return `
    <tr>
      <th>${label}</th>

      <td>
        ${formatMetric(timeframeValue, type)}
      </td>

      <td>
        ${formatMetric(locationValue, type)}
      </td>

      <td>
        ${formatMetric(leftValue, type)}
      </td>

      <td>
        ${formatMetric(rightValue, type)}
      </td>
    </tr>
  `;
}

function createGameId(play) {
  return [
    play.date,
    String(
      play.away_team || ""
    ).toLowerCase(),
    String(
      play.home_team || ""
    ).toLowerCase()
  ].join("-");
}

function createFallbackGame(play) {
  return {
    id: createGameId(play),
    date: play.date,
    sport: play.sport || "MLB",
    last_updated: null,
    lineup_label: "Projected Lineup",

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
      away: createUnknownPitcher(),
      home: createUnknownPitcher()
    },

    offense: {},
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

function formatTimeframe(value) {
  if (value === "last_7") {
    return "Last 7 Days";
  }

  if (value === "last_30") {
    return "Last 30 Days";
  }

  return "Season";
}

function formatLocation(value) {
  if (value === "home") {
    return "Home";
  }

  if (value === "away") {
    return "Away";
  }

  return "All";
}

function formatMetric(value, type) {
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

  if (type === "average") {
    return number
      .toFixed(3)
      .replace(/^0/, "");
  }

  return number.toFixed(2);
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

function formatUpdatedTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      value ?? "—";
  }
}

function setLogo(id, teamId, team) {
  const img =
    document.getElementById(id);

  if (!img) return;

  if (!teamId) {
    img.removeAttribute("src");
    img.alt =
      `${team || "Team"} logo unavailable`;

    return;
  }

  img.src =
    `${GAME_LOGO_BASE}/${Number(teamId)}.svg`;

  img.alt =
    `${team || "Team"} logo`;
}

document.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest("[data-jump]");

    if (!button) return;

    const section =
      document.getElementById(
        button.dataset.jump
      );

    if (!section) return;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
);

loadGame();