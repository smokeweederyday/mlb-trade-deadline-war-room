import {
  renderOffenseWidget
} from "./assets/js/widgets/offenseWidget.js";

import {
  renderPitcherWidget
} from "./assets/js/widgets/pitcherWidget.js";

import {
  renderBullpenWidget
} from "./assets/js/widgets/bullpenWidget.js";

import {
  renderMatchupWidget
} from "./assets/js/widgets/matchupWidget.js";

import {
  renderWeatherWidget
} from "./assets/js/widgets/weatherWidget.js";

import {
  renderMarketWidget
} from "./assets/js/widgets/marketWidget.js";

import {
  buildMlbOffenseModule,
  buildMlbPitcherModule,
  buildMlbBullpenModule,
  buildMlbMatchupModule,
  buildMlbWeatherModule,
  buildMlbMarketModule
} from "./assets/js/sports/mlbEngine.js";

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
    const params =
      new URLSearchParams(window.location.search);

    const requestedGameId = params.get("id");
    const requestedPlayId = params.get("play");

    const [gamesResponse, cardResponse] =
      await Promise.all([
        fetch(`data/games.json?v=${Date.now()}`),
        fetch(`data/todays-card.json?v=${Date.now()}`)
      ]);

    if (!gamesResponse.ok) {
      throw new Error("Unable to load game data.");
    }

    const gamesData =
      await gamesResponse.json();

    const games =
      gamesData.games || [];

    const cardData =
      cardResponse.ok
        ? await cardResponse.json()
        : { plays: [] };

    let gameId = requestedGameId;
    let selectedPlay = null;

    if (requestedPlayId) {
      selectedPlay =
        (cardData.plays || []).find(
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

    let game =
      games.find(item => item.id === gameId);

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

    renderAll();

    document.title =
      `${game.away_team.abbr} at ${game.home_team.abbr} | Boring Bets`;

    status?.remove();

    if (details) {
      details.hidden = false;
    }
  } catch (error) {
    console.error(error);

    if (status) {
      status.textContent =
        error.message ||
        "Unable to load matchup.";
    }
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
}

function renderStatusStrip() {
  const game = state.game;

  const confirmedStarters = [
    game.pitchers?.away?.status,
    game.pitchers?.home?.status
  ].filter(
    value => value === "confirmed"
  ).length;

  setText(
    "gameUpdatedStatus",
    `UPDATED ${formatUpdatedTime(game.last_updated)}`
  );

  setText(
    "lineupStatus",
    "PROJECTED LINEUP"
  );

  setText(
    "starterStatus",
    `${confirmedStarters} STARTER${
      confirmedStarters === 1 ? "" : "S"
    } CONFIRMED`
  );
}

function renderControls() {
  document
    .querySelectorAll("[data-timeframe]")
    .forEach(button => {
      const value =
        button.dataset.timeframe;

      button.classList.toggle(
        "active",
        value === state.timeframe
      );

      button.onclick = () => {
        state.timeframe = value;
        renderAll();
      };
    });

  document
    .querySelectorAll("[data-location]")
    .forEach(button => {
      const value =
        button.dataset.location;

      button.classList.toggle(
        "active",
        value === state.location
      );

      button.onclick = () => {
        state.location = value;
        renderAll();
      };
    });
}

function renderPitchers() {
  const game = state.game;

  const awayPitcherModule =
    buildMlbPitcherModule({
      game,
      side: "away",
      timeframe: state.timeframe,
      location: state.location
    });

  renderPitcherWidget({
    container:
      document.getElementById(
        "awayPitcherCard"
      ),
    module: awayPitcherModule
  });

  const homePitcherModule =
    buildMlbPitcherModule({
      game,
      side: "home",
      timeframe: state.timeframe,
      location: state.location
    });

  renderPitcherWidget({
    container:
      document.getElementById(
        "homePitcherCard"
      ),
    module: homePitcherModule
  });
}

function renderOffenses() {
  const game = state.game;

  const homeOffenseModule =
    buildMlbOffenseModule({
      game,
      side: "home",
      timeframe: state.timeframe,
      location: state.location
    });

  renderOffenseWidget({
    container:
      document.getElementById(
        "homeOffenseCard"
      ),
    module: homeOffenseModule
  });

  const awayOffenseModule =
    buildMlbOffenseModule({
      game,
      side: "away",
      timeframe: state.timeframe,
      location: state.location
    });

  renderOffenseWidget({
    container:
      document.getElementById(
        "awayOffenseCard"
      ),
    module: awayOffenseModule
  });
}

function renderLineupMatchups() {
  const game = state.game;

  const awayPitcherMatchupModule =
    buildMlbMatchupModule({
      game,
      side: "away"
    });

  renderMatchupWidget({
    container:
      document.getElementById(
        "awayPitcherLineupCard"
      ),
    module: awayPitcherMatchupModule
  });

  const homePitcherMatchupModule =
    buildMlbMatchupModule({
      game,
      side: "home"
    });

  renderMatchupWidget({
    container:
      document.getElementById(
        "homePitcherLineupCard"
      ),
    module: homePitcherMatchupModule
  });
}

function renderBullpens() {
  const game = state.game;

  const awayBullpenModule =
    buildMlbBullpenModule({
      game,
      side: "away",
      timeframe: state.timeframe,
      location: state.location
    });

  renderBullpenWidget({
    container:
      document.getElementById(
        "awayBullpenCard"
      ),
    module: awayBullpenModule
  });

  const homeBullpenModule =
    buildMlbBullpenModule({
      game,
      side: "home",
      timeframe: state.timeframe,
      location: state.location
    });

  renderBullpenWidget({
    container:
      document.getElementById(
        "homeBullpenCard"
      ),
    module: homeBullpenModule
  });
}

function renderContextCards() {
  const game = state.game;

  const weatherModule =
    buildMlbWeatherModule({
      game
    });

  renderWeatherWidget({
    container:
      document.getElementById("weather"),
    module: weatherModule
  });

  const marketModule =
    buildMlbMarketModule({
      game
    });

  renderMarketWidget({
    container:
      document.getElementById("market"),
    module: marketModule
  });
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

function formatUpdatedTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
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

function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      value ?? "—";
  }
}

function setLogo(
  id,
  teamId,
  team
) {
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