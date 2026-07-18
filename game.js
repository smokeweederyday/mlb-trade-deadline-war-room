import {
  renderOffenseWidget
} from "./assets/js/widgets/offenseWidget.js?v=phase8b-fix2";

import {
  renderPitcherWidget
} from "./assets/js/widgets/pitcherWidget.js?v=phase8b-fix2";

import {
  renderBullpenWidget
} from "./assets/js/widgets/bullpenWidget.js";

import {
  renderMatchupWidget
} from "./assets/js/widgets/matchupWidget.js?v=phase8b-fix1";

import {
  renderWeatherWidget
} from "./assets/js/widgets/weatherWidget.js";

import {
  renderMarketWidget
} from "./assets/js/widgets/marketWidget.js";

import {
  renderContextWidget
} from "./assets/js/widgets/contextWidget.js";

import {
  buildMlbOffenseModule,
  buildMlbPitcherModule,
  buildMlbBullpenModule,
  buildMlbMatchupModule,
  buildMlbWeatherModule,
  buildMlbMarketModule
} from "./assets/js/sports/mlbEngine.js?v=phase8b-fix1";

const GAME_LOGO_BASE =
  "https://www.mlbstatic.com/team-logos/team-cap-on-dark";

const state = {
  game: null,
  games: [],
  days: [],
  plays: [],
  results: [],
  evaluations: [],
  articles: [],
  timeframe: "last_30",
  awayPitcherLocation: "away",
  homePitcherLocation: "home"
};

async function loadGame() {
  const status =
    document.getElementById("gameStatus");

  const details =
    document.getElementById("gameDetails");

  try {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const requestedGameId =
      params.get("id");

    const requestedPlayId =
      params.get("play");

    const [
      gamesResponse,
      daysResponse,
      cardResponse,
      playsResponse,
      resultsResponse,
      evaluationsResponse,
      articlesResponse
    ] = await Promise.all([
      fetch(
        `data/games.json?v=${Date.now()}`
      ),
      fetch(
        `data/days.json?v=${Date.now()}`
      ),
      fetch(
        `data/todays-card.json?v=${Date.now()}`
      ),
      fetch(
        `data/plays.json?v=${Date.now()}`
      ),
      fetch(
        `data/results.json?v=${Date.now()}`
      ),
      fetch(
        `data/evaluations.json?v=${Date.now()}`
      ),
      fetch(
        `data/articles.json?v=${Date.now()}`
      )
    ]);

    if (!gamesResponse.ok) {
      throw new Error(
        "Unable to load game data."
      );
    }

    const gamesData =
      await gamesResponse.json();

    const daysData =
      daysResponse.ok
        ? await daysResponse.json()
        : { days: [] };

    const playsData =
      playsResponse.ok
        ? await playsResponse.json()
        : { plays: [] };

    const resultsData =
      resultsResponse.ok
        ? await resultsResponse.json()
        : { results: [] };

    const evaluationsData =
      evaluationsResponse.ok
        ? await evaluationsResponse.json()
        : { evaluations: [] };

    const articlesData =
      articlesResponse.ok
        ? await articlesResponse.json()
        : { articles: [] };

    const games =
      Array.isArray(gamesData.games)
        ? gamesData.games
        : [];

    const cardData =
      cardResponse.ok
        ? await cardResponse.json()
        : { plays: [] };

    let gameId =
      requestedGameId;

    let selectedPlay =
      null;

    if (requestedPlayId) {
      selectedPlay =
        (cardData.plays || []).find(
          play =>
            play.id === requestedPlayId
        );

      if (selectedPlay && !gameId) {
        gameId =
          selectedPlay.game_id ||
          createGameId(selectedPlay);
      }
    }

    if (!gameId) {
      gameId =
        games[0]?.id;
    }

    let game =
      games.find(
        item => item.id === gameId
      );

    if (!game && selectedPlay) {
      game =
        createFallbackGame(
          selectedPlay
        );
    }

    if (!game) {
      throw new Error(
        "Matchup data has not been added yet."
      );
    }

    state.game =
      game;

    state.games =
      games;

    state.days =
      Array.isArray(daysData.days)
        ? daysData.days
        : [];

    state.plays =
      Array.isArray(playsData.plays)
        ? playsData.plays
        : [];

    state.results =
      Array.isArray(resultsData.results)
        ? resultsData.results
        : [];

    state.evaluations =
      Array.isArray(
        evaluationsData.evaluations
      )
        ? evaluationsData.evaluations
        : [];

    state.articles =
      Array.isArray(
        articlesData.articles
      )
        ? articlesData.articles
        : [];

    state.timeframe =
      game.controls?.default_timeframe ||
      gamesData.default_controls?.timeframe ||
      "last_30";

    state.awayPitcherLocation = "away";
    state.homePitcherLocation = "home";

    renderAll();

    document.title =
      `${game.away_team?.abbr || "Away"} at ` +
      `${game.home_team?.abbr || "Home"} | Boring Bets`;

    status?.remove();

    if (details) {
      details.hidden =
        false;
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
  renderGameNavigation();
  renderGameHeader();
  renderStatusStrip();
  renderControls();
  renderPitchers();
  renderOffenses();
  renderLineupMatchups();
  renderBullpens();
  renderContextCards();
  renderGameContext();
  renderGameArticles();
  renderGameLifecycle();
}

function renderGameNavigation() {
  const game =
    state.game;

  const sport =
    normalizeSport(
      game.sport
    );

  const gameDate =
    game.date;

  const dayRecord =
    state.days.find(day => {
      return (
        day.date === gameDate &&
        normalizeSport(day.sport) === sport
      );
    });

  const orderedGameIds =
    Array.isArray(dayRecord?.game_ids)
      ? dayRecord.game_ids
      : [];

  let datedSportGames =
    orderedGameIds
      .map(gameId =>
        state.games.find(
          item => item.id === gameId
        )
      )
      .filter(Boolean);

  if (!datedSportGames.length) {
    datedSportGames =
      state.games
        .filter(item => {
          return (
            item.date === gameDate &&
            normalizeSport(
              item.sport
            ) === sport
          );
        })
        .sort(sortGames);
  }

  let currentIndex =
    datedSportGames.findIndex(
      item => item.id === game.id
    );

  if (currentIndex === -1) {
    datedSportGames.push(game);
    datedSportGames.sort(sortGames);

    currentIndex =
      datedSportGames.findIndex(
        item => item.id === game.id
      );
  }

  const hasMultipleGames =
    datedSportGames.length > 1;

  const previousGame =
    currentIndex >= 0 && hasMultipleGames
      ? datedSportGames[
          (currentIndex - 1 + datedSportGames.length) %
            datedSportGames.length
        ]
      : null;

  const nextGame =
    currentIndex >= 0 && hasMultipleGames
      ? datedSportGames[
          (currentIndex + 1) %
            datedSportGames.length
        ]
      : null;

  const slateUrl =
    buildSlateUrl(
      gameDate,
      sport
    );

  setLink(
    "backToSlateLink",
    slateUrl,
    `← Back to ${sport} slate`
  );

  setLink(
    "backToSlateBottomLink",
    slateUrl,
    `View full ${sport} slate`
  );

  setLink(
    "gameCenterNavLink",
    slateUrl,
    `${sport} Game Center`
  );

  setText(
    "gameDateLabel",
    formatGameDate(gameDate)
  );

  setText(
    "gamePosition",
    currentIndex >= 0
      ? `Game ${currentIndex + 1} of ${
          datedSportGames.length
        }`
      : `Game — of ${
          datedSportGames.length
        }`
  );

  setGameNavigationLink(
    "previousGameLink",
    previousGame,
    `← Previous ${sport} game`
  );

  setGameNavigationLink(
    "previousGameBottomLink",
    previousGame,
    `← Previous ${sport} game`
  );

  setGameNavigationLink(
    "nextGameLink",
    nextGame,
    `Next ${sport} game →`
  );

  setGameNavigationLink(
    "nextGameBottomLink",
    nextGame,
    `Next ${sport} game →`
  );

  const previousDate =
    shiftDate(
      gameDate,
      -1
    );

  const nextDate =
    shiftDate(
      gameDate,
      1
    );

  setLink(
    "previousDayLink",
    buildSlateUrl(
      previousDate,
      sport
    ),
    "← Previous day"
  );

  setLink(
    "nextDayLink",
    buildSlateUrl(
      nextDate,
      sport
    ),
    "Next day →"
  );
}

function renderGameHeader() {
  const game =
    state.game;

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
  const game =
    state.game;

  const confirmedStarters = [
    game.pitchers?.away?.status,
    game.pitchers?.home?.status
  ].filter(
    value =>
      value === "confirmed"
  ).length;

  setText(
    "gameUpdatedStatus",
    `UPDATED ${formatUpdatedTime(
      game.last_updated
    )}`
  );

  const awayLineupStatus =
    game.lineups?.away?.status ||
    "projected";

  const homeLineupStatus =
    game.lineups?.home?.status ||
    "projected";

  const confirmedLineups = [
    awayLineupStatus,
    homeLineupStatus
  ].filter(
    value =>
      value === "confirmed"
  ).length;

  const lineupStatusText =
    confirmedLineups === 2
      ? "2 LINEUPS CONFIRMED"
      : confirmedLineups === 1
        ? "1 LINEUP CONFIRMED"
        : "PROJECTED LINEUPS";

  setStatusText(
    "lineupStatus",
    lineupStatusText,
    confirmedLineups === 2
      ? "confirmed"
      : confirmedLineups === 1
        ? "partial"
        : "projected"
  );

  setText(
    "starterStatus",
    `${confirmedStarters} STARTER${
      confirmedStarters === 1
        ? ""
        : "S"
    } CONFIRMED`
  );
}

function renderControls() {
  document
    .querySelectorAll(
      "[data-timeframe]"
    )
    .forEach(button => {
      const value =
        button.dataset.timeframe;

      button.classList.toggle(
        "active",
        value === state.timeframe
      );

      button.onclick = () => {
        state.timeframe =
          value;

        renderAll();
      };
    });

}

function renderPitchers() {
  const game =
    state.game;

  const awayPitcherModule =
    buildMlbPitcherModule({
      game,
      side: "away",
      timeframe:
        state.timeframe,
      location:
        state.awayPitcherLocation
    });

  renderPitcherWidget({
    container:
      document.getElementById(
        "awayPitcherCard"
      ),

    module:
      awayPitcherModule,
    onLocationChange: location => {
      state.awayPitcherLocation = location;
      renderPitchers();
      renderLineupMatchups();
    }
  });

  const homePitcherModule =
    buildMlbPitcherModule({
      game,
      side: "home",
      timeframe:
        state.timeframe,
      location:
        state.homePitcherLocation
    });

  renderPitcherWidget({
    container:
      document.getElementById(
        "homePitcherCard"
      ),

    module:
      homePitcherModule,
    onLocationChange: location => {
      state.homePitcherLocation = location;
      renderPitchers();
      renderLineupMatchups();
    }
  });
}

function renderOffenses() {
  const game =
    state.game;

  const homeOffenseModule =
    buildMlbOffenseModule({
      game,
      side: "home",
      timeframe:
        state.timeframe
    });

  renderOffenseWidget({
    container:
      document.getElementById(
        "homeOffenseCard"
      ),

    module:
      homeOffenseModule
  });

  const awayOffenseModule =
    buildMlbOffenseModule({
      game,
      side: "away",
      timeframe:
        state.timeframe
    });

  renderOffenseWidget({
    container:
      document.getElementById(
        "awayOffenseCard"
      ),

    module:
      awayOffenseModule
  });
}

function renderLineupMatchups() {
  const game =
    state.game;

  const awayPitcherMatchupModule =
    buildMlbMatchupModule({
      game,
      side: "away",
      timeframe: state.timeframe,
      location: state.awayPitcherLocation
    });

  renderMatchupWidget({
    container:
      document.getElementById(
        "awayPitcherLineupCard"
      ),

    module:
      awayPitcherMatchupModule
  });

  const homePitcherMatchupModule =
    buildMlbMatchupModule({
      game,
      side: "home",
      timeframe: state.timeframe,
      location: state.homePitcherLocation
    });

  renderMatchupWidget({
    container:
      document.getElementById(
        "homePitcherLineupCard"
      ),

    module:
      homePitcherMatchupModule
  });
}

function renderBullpens() {
  const game =
    state.game;

  const awayBullpenModule =
    buildMlbBullpenModule({
      game,
      side: "away",
      timeframe:
        state.timeframe,
      location: "all"
    });

  renderBullpenWidget({
    container:
      document.getElementById(
        "awayBullpenCard"
      ),

    module:
      awayBullpenModule
  });

  const homeBullpenModule =
    buildMlbBullpenModule({
      game,
      side: "home",
      timeframe:
        state.timeframe,
      location: "all"
    });

  renderBullpenWidget({
    container:
      document.getElementById(
        "homeBullpenCard"
      ),

    module:
      homeBullpenModule
  });
}

function renderContextCards() {
  const game =
    state.game;

  const weatherModule =
    buildMlbWeatherModule({
      game
    });

  renderWeatherWidget({
    container:
      document.getElementById(
        "weather"
      ),

    module:
      weatherModule
  });

  const marketModule =
    buildMlbMarketModule({
      game
    });

  renderMarketWidget({
    container:
      document.getElementById(
        "market"
      ),

    module:
      marketModule
  });
}

function renderGameContext() {
  renderContextWidget({
    container:
      document.getElementById(
        "gameContext"
      ),

    context:
      state.game?.context || null
  });
}


function renderGameArticles() {
  const container = document.getElementById("gameArticles");
  if (!container) return;

  const articles = state.articles.filter(
    article =>
      article.game_id === state.game?.id &&
      article.status !== "draft"
  );

  if (!articles.length) {
    container.innerHTML = `<p class="module-note">No article published for this game.</p>`;
    return;
  }

  container.innerHTML = articles.map(article => `
    <article class="game-article">
      <div class="game-article-meta">
        <span>${escapeHtml(article.author || "Boring Bets")}</span>
        <span>${escapeHtml(formatArticleTime(article.updated_at || article.published_at))}</span>
      </div>
      <h3>${escapeHtml(article.title || "Game Analysis")}</h3>
      ${article.summary ? `<p class="game-article-summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="game-article-body">${formatArticleBody(article.body || "")}</div>
    </article>
  `).join("");
}

function formatArticleBody(value) {
  return escapeHtml(value)
    .split(/\n\s*\n/)
    .map(paragraph => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function formatArticleTime(value) {
  if (!value) return "Published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Published";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function renderGameLifecycle() {
  const gameId =
    state.game?.id;

  const gamePlays =
    state.plays.filter(
      play => play.game_id === gameId
    );

  const gameResults =
    state.results.filter(
      result => result.game_id === gameId
    );

  const gameEvaluations =
    state.evaluations.filter(
      evaluation =>
        evaluation.game_id === gameId
    );

  setText(
    "gameLifecycleStatus",
    formatLifecycleStatus(
      gamePlays,
      gameResults,
      gameEvaluations
    )
  );

  renderOfficialPlays(
    gamePlays
  );

  renderResults(
    gameResults
  );

  renderEvaluations(
    gameEvaluations
  );
}

function renderOfficialPlays(plays) {
  const container =
    document.getElementById(
      "gameOfficialPlays"
    );

  if (!container) return;

  if (!plays.length) {
    container.innerHTML = `
      <p class="module-note">
        No official plays published.
      </p>
    `;
    return;
  }

  container.innerHTML = plays
    .map(play => `
      <a
        class="lifecycle-item"
        href="play.html?id=${encodeURIComponent(
          play.id
        )}"
      >
        <strong>
          ${escapeHtml(
            play.play || "Official play"
          )}
        </strong>

        <span>
          ${escapeHtml(
            play.odds || "Odds pending"
          )}
          ·
          ${formatUnits(
            play.units
          )}
          units
        </span>
      </a>
    `)
    .join("");
}

function renderResults(results) {
  const container =
    document.getElementById(
      "gameResults"
    );

  if (!container) return;

  if (!results.length) {
    container.innerHTML = `
      <p class="module-note">
        Results pending.
      </p>
    `;
    return;
  }

  container.innerHTML = results
    .map(result => `
      <div class="lifecycle-item">
        <strong>
          ${escapeHtml(
            formatResultStatus(
              result.status
            )
          )}
        </strong>

        <span>
          ${escapeHtml(
            result.final_score ||
            "Final score pending"
          )}
        </span>

        <small>
          ${formatResultUnits(
            result.units_result
          )}
        </small>
      </div>
    `)
    .join("");
}

function renderEvaluations(evaluations) {
  const container =
    document.getElementById(
      "gameEvaluations"
    );

  if (!container) return;

  const completed =
    evaluations.filter(
      evaluation =>
        evaluation.status !== "pending"
    );

  if (!completed.length) {
    container.innerHTML = `
      <p class="module-note">
        Postgame evaluation pending.
      </p>
    `;
    return;
  }

  container.innerHTML = completed
    .map(evaluation => `
      <div class="lifecycle-item">
        <strong>
          ${escapeHtml(
            formatEvaluationHeading(
              evaluation
            )
          )}
        </strong>

        <span>
          ${escapeHtml(
            evaluation.summary ||
            "Evaluation completed."
          )}
        </span>
      </div>
    `)
    .join("");
}

function formatLifecycleStatus(
  plays,
  results,
  evaluations
) {
  if (!plays.length) {
    return "NO OFFICIAL PLAY";
  }

  const allResultsGraded =
    results.length === plays.length &&
    results.every(result =>
      !["", "pending"].includes(
        String(result.status || "").toLowerCase()
      )
    );

  if (!allResultsGraded) {
    return "RESULTS PENDING";
  }

  const allEvaluated =
    evaluations.length === plays.length &&
    evaluations.every(evaluation =>
      String(
        evaluation.status || ""
      ).toLowerCase() !== "pending"
    );

  return allEvaluated
    ? "EVALUATED"
    : "GRADING COMPLETE";
}

function formatUnits(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number.toFixed(2)
    : "0.00";
}

function formatResultUnits(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Units pending";
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "Units pending";
  }

  const prefix =
    number > 0
      ? "+"
      : "";

  return `${prefix}${number.toFixed(2)} units`;
}

function formatResultStatus(value) {
  const status =
    String(value || "pending").toLowerCase();

  if (status === "win") return "WIN";
  if (status === "loss") return "LOSS";
  if (status === "push") return "PUSH";
  if (status === "void") return "VOID";

  return "PENDING";
}

function formatEvaluationHeading(evaluation) {
  return (
    evaluation.decision_quality ||
    evaluation.model_quality ||
    "POSTGAME EVALUATION"
  ).toString().toUpperCase();
}

function setGameNavigationLink(
  id,
  game,
  label
) {
  const element =
    document.getElementById(id);

  if (!element) return;

  element.textContent =
    label;

  element.classList.remove(
    "disabled"
  );

  element.removeAttribute(
    "aria-disabled"
  );

  if (!game?.id) {
    element.removeAttribute(
      "href"
    );

    element.classList.add(
      "disabled"
    );

    element.setAttribute(
      "aria-disabled",
      "true"
    );

    return;
  }

  element.href =
    `game.html?id=${encodeURIComponent(
      game.id
    )}`;

  element.onclick = event => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigateToGame(game);
  };
}

function navigateToGame(game) {
  if (!game?.id) return;

  state.game = game;
  state.timeframe =
    game.controls?.default_timeframe ||
    "last_30";
  state.awayPitcherLocation = "away";
  state.homePitcherLocation = "home";

  history.pushState(
    { gameId: game.id },
    "",
    `game.html?id=${encodeURIComponent(game.id)}`
  );

  renderAll();

  document.title =
    `${game.away_team?.abbr || "Away"} at ` +
    `${game.home_team?.abbr || "Home"} | Boring Bets`;

  window.scrollTo({ top: 0, behavior: "auto" });
}

window.addEventListener("popstate", () => {
  const gameId =
    new URLSearchParams(window.location.search).get("id");
  const game =
    state.games.find(item => item.id === gameId);

  if (game) {
    state.game = game;
    state.awayPitcherLocation = "away";
    state.homePitcherLocation = "home";
    renderAll();
  }
});

function setLink(
  id,
  href,
  label
) {
  const element =
    document.getElementById(id);

  if (!element) return;

  element.href =
    href;

  if (label) {
    element.textContent =
      label;
  }
}

function buildSlateUrl(
  date,
  sport
) {
  const params =
    new URLSearchParams();

  if (date) {
    params.set(
      "date",
      date
    );
  }

  if (sport) {
    params.set(
      "sport",
      sport.toLowerCase()
    );
  }

  return (
    `todays-card.html?${params.toString()}`
  );
}

function normalizeSport(value) {
  return String(
    value || "MLB"
  ).toUpperCase();
}

function sortGames(a, b) {
  const timeComparison =
    String(
      a.game_time || ""
    ).localeCompare(
      String(
        b.game_time || ""
      )
    );

  if (timeComparison !== 0) {
    return timeComparison;
  }

  return String(
    a.id || ""
  ).localeCompare(
    String(
      b.id || ""
    )
  );
}

function shiftDate(
  dateString,
  amount
) {
  if (
    !dateString ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      dateString
    )
  ) {
    return "";
  }

  const date =
    new Date(
      `${dateString}T12:00:00`
    );

  date.setDate(
    date.getDate() + amount
  );

  return formatDateKey(
    date
  );
}

function formatDateKey(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-${day}`
  );
}

function formatGameDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  const date =
    new Date(
      `${value}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }
  );
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
    id:
      createGameId(play),

    date:
      play.date,

    game_time:
      null,

    sport:
      play.sport || "MLB",

    last_updated:
      null,

    lineup_label:
      "Projected Lineup",

    away_team: {
      abbr:
        play.away_team,

      name:
        play.away_team,

      team_id:
        play.away_team_id
    },

    home_team: {
      abbr:
        play.home_team,

      name:
        play.home_team,

      team_id:
        play.home_team_id
    },

    controls: {
      default_timeframe:
        "last_30",

      default_location:
        "all"
    },

    workflow: {
      research_state:
        "pending",

      publication_state:
        "published",

      grading_state:
        "pending",

      archive_state:
        "active",

      official_play_ids: [
        play.id
      ],

      best_bet_id:
        play.is_best_bet
          ? play.id
          : null,

      published_at:
        null,

      graded_at:
        null,

      archived_at:
        null
    },

    pitchers: {
      away:
        createUnknownPitcher(),

      home:
        createUnknownPitcher()
    },

    offense: {},

    lineups: {
      away: {
        team:
          play.away_team,

        status:
          "projected",

        status_label:
          "Projected Lineup",

        last_updated:
          null,

        players: []
      },

      home: {
        team:
          play.home_team,

        status:
          "projected",

        status_label:
          "Projected Lineup",

        last_updated:
          null,

        players: []
      }
    },

    pitcher_vs_lineup: {
      away_pitcher: {
        pitcher:
          "Starter TBD",

        opponent:
          play.home_team,

        lineup_status:
          "projected",

        lineup_label:
          "Projected Lineup",

        summary: {},
        batters: []
      },

      home_pitcher: {
        pitcher:
          "Starter TBD",

        opponent:
          play.away_team,

        lineup_status:
          "projected",

        lineup_label:
          "Projected Lineup",

        summary: {},
        batters: []
      }
    },

    bullpens: {},
    weather: {},
    market: {},
    context: {
      score: null,
      label: "PENDING",
      alerts: [],
      positives: [],
      information: [],
      sources: {}
    },
    injuries: [],
    notes: ""
  };
}

function createUnknownPitcher() {
  return {
    name:
      "Starter TBD",

    age:
      null,

    throws:
      null,

    status:
      "unknown",

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
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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

function setStatusText(
  id,
  value,
  status
) {
  const element =
    document.getElementById(id);

  if (!element) return;

  element.textContent =
    value ?? "—";

  element.classList.remove(
    "status-confirmed",
    "status-partial",
    "status-projected"
  );

  element.classList.add(
    `status-${status}`
  );
}

function setText(
  id,
  value
) {
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
    img.removeAttribute(
      "src"
    );

    img.alt =
      `${team || "Team"} logo unavailable`;

    return;
  }

  img.src =
    `${GAME_LOGO_BASE}/${Number(
      teamId
    )}.svg`;

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

loadGame();
