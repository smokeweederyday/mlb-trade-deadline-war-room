import {
  initializeHighlightControls,
  applyGlobalTierHighlights
} from "./assets/js/engine/highlightPreferences.js?v=phase11z-exact-typed-spread3";

import {
  renderOffenseWidget
} from "./assets/js/widgets/offenseWidget.js?v=phase11u-global-highlight-controls1";

import {
  renderPitcherWidget
} from "./assets/js/widgets/pitcherWidget.js?v=phase11u-global-highlight-controls1";

import {
  renderBullpenWidget
} from "./assets/js/widgets/bullpenWidget.js?v=phase11i-zero-pitch-dashes1";

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
} from "./assets/js/sports/mlbEngine.js?v=phase11t-offense-metric-expansion1";

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
  awayPitcherLocation: "all",
  homePitcherLocation: "all",
  awayPitcherStartMode: true,
  homePitcherStartMode: true,
  awayPitcherStartCount: 7,
  homePitcherStartCount: 7,
  awayOffenseTimeframe: "last_30",
  homeOffenseTimeframe: "last_30"
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
      gamesIndexResponse,
      daysResponse,
      cardResponse,
      playsResponse,
      resultsResponse,
      evaluationsResponse,
      articlesResponse
    ] = await Promise.all([
      fetch(
        `data/games-index.json?v=${Date.now()}`
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

    if (!gamesIndexResponse.ok) {
      throw new Error(
        "Unable to load game data."
      );
    }

    const gamesIndexData =
      await gamesIndexResponse.json();

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

    const indexedGames =
      Array.isArray(gamesIndexData.games)
        ? gamesIndexData.games
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
        indexedGames[0]?.id;
    }

    const indexedGame =
      indexedGames.find(
        item => item.id === gameId
      );

    const gameDate =
      selectedPlay?.date ||
      indexedGame?.date ||
      String(gameId || "").slice(0, 10);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        gameDate
      )
    ) {
      throw new Error(
        "Unable to determine the matchup date."
      );
    }

    const dateGamesResponse =
      await fetch(
        `data/games/${encodeURIComponent(
          gameDate
        )}.json?v=${Date.now()}`
      );

    if (!dateGamesResponse.ok) {
      throw new Error(
        "Unable to load matchup data."
      );
    }

    const gamesData =
      await dateGamesResponse.json();

    const games =
      Array.isArray(gamesData.games)
        ? gamesData.games
        : [];

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

    state.awayPitcherLocation = "all";
    state.homePitcherLocation = "all";
    state.awayOffenseTimeframe = "last_30";
    state.homeOffenseTimeframe = "last_30";

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

function initializeGlobalHighlightControls() {
  initializeHighlightControls({
    rangeInput:
      document.getElementById(
        "globalHighlightRange"
      ),

    rangeOutput:
      document.getElementById(
        "globalHighlightRangeOutput"
      ),

    neutralInput:
      document.getElementById(
        "globalHighlightNeutral"
      ),

    onChange: () => {
      applyGlobalTierHighlights(
        document
      );
    }
  });
}


function renderAll() {
  initializeGlobalHighlightControls();

  renderGameNavigation();
  renderGameHeader();
  renderStatusStrip();
  renderControls();
  renderPitchers();
  renderOffenses();
  renderBullpens();
  renderLineupMatchups();
  renderContextCards();
  renderGameContext();
  renderGameArticles();
  renderGameLifecycle();

  applyGlobalTierHighlights(
    document
  );
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

  const today =
    formatDateKey(
      new Date()
    );

  setLink(
    "gameCenterNavLink",
    buildSlateUrl(
      today,
      sport
    ),
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

  renderGameStadiumWeather(game);

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

  const startTime =
    formatGameStartTime(
      game.game_time
    );

  const venueName =
    game.venue?.name
      ? ` · ${game.venue.name}`
      : "";

  setText(
    "gameStartTime",
    `${startTime}${venueName}`
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


/* BORING BETS: GAME HEADER STADIUM WEATHER V1 */

function renderGameStadiumWeather(game) {
  const card = document.getElementById("gameStadiumWeather");
  const photo = document.getElementById("gameStadiumPhoto");

  if (!card || !photo) return;

  const venue = game?.venue || {};
  const weather = game?.weather || {};
  const venueName = String(
    venue.name ||
    venue.full_name ||
    game?.venue_name ||
    "Venue TBD"
  );

  const condition = String(
    weather.condition ||
    weather.summary ||
    weather.description ||
    "Conditions pending"
  );

  const temperature = gameHeaderFiniteNumber(
    weather.temperature,
    weather.temp,
    weather.temperature_f
  );

  const humidity = gameHeaderFiniteNumber(
    weather.humidity,
    weather.relative_humidity
  );

  const windSpeed = gameHeaderFiniteNumber(
    weather.wind_speed,
    weather.wind_mph
  );

  const rainChance = gameHeaderFiniteNumber(
    weather.rain_probability,
    weather.precipitation_probability,
    weather.precip_probability
  );

  const windDirection = String(
    weather.wind_direction ||
    weather.wind_direction_text ||
    ""
  ).trim();

  const weatherClass = gameHeaderWeatherClass(weather, venue);

  card.className = `game-stadium-weather ${weatherClass}`;
  /*
    BORING BETS: ROBUST INDOOR ROOF ATTRIBUTES V2
    Record whether this header image is truly exposed to weather.
  */
  {
    const bbIndoorGateVenueSlug =
      typeof gameHeaderVariantSlug === "function"
        ? gameHeaderVariantSlug(venueName)
        : String(venueName || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    const bbIndoorGateRoof =
      typeof gameHeaderVenueRoofState === "function"
        ? gameHeaderVenueRoofState(
            game,
            venue,
            bbIndoorGateVenueSlug
          )
        : { profile: "outdoor", state: "unknown" };

    card.dataset.venueSlug = bbIndoorGateVenueSlug;
    card.dataset.roofProfile =
      bbIndoorGateRoof?.profile || "outdoor";
    card.dataset.roofState =
      bbIndoorGateRoof?.state || "unknown";
    /*
      BORING BETS: T-MOBILE WEATHER EXPOSURE EXCEPTION V1

      T-Mobile Park remains exposed to outside weather even when its
      movable roof is closed. Weather exposure and roof state are
      therefore tracked independently.
    */
    const bbWeatherExposureVenueId = String(
      venue?.id ??
      venue?.venue_id ??
      venue?.venueId ??
      game?.venue_id ??
      game?.venueId ??
      game?.venue?.id ??
      game?.venue?.venue_id ??
      game?.venue?.venueId ??
      ""
    ).trim();

    const bbWeatherExposureVenueName = String(
      venue?.name ??
      venue?.venue_name ??
      venue?.venueName ??
      game?.venue_name ??
      game?.venueName ??
      game?.venue?.name ??
      ""
    ).toLowerCase();

    const bbAlwaysWeatherExposed =
      bbWeatherExposureVenueId === "680" ||
      card.dataset.venueSlug === "t-mobile-park" ||
      bbWeatherExposureVenueName.includes("t-mobile park");

    card.dataset.weatherExposed =
      bbAlwaysWeatherExposed ? "true" : "false";

  }

  card.setAttribute(
    "aria-label",
    `${venueName}. ${condition}. ${
      Number.isFinite(temperature)
        ? `${Math.round(temperature)} degrees.`
        : "Temperature unavailable."
    }`
  );

  setText(
    "gameVenueName",
    venueName
  );

  const gameHeaderTimeOnly = String(
    gameHeaderFormatTime(game?.game_time, venue) || "Time TBD"
  )
    .split("•")[0]
    .trim();

  setText(
    "gameStartTime",
    gameHeaderTimeOnly || "Time TBD"
  );

  setText(
    "gameWeatherTemperature",
    Number.isFinite(temperature)
      ? `${Math.round(temperature)}°`
      : "—°"
  );

  setText(
    "gameWeatherCondition",
    condition
  );

  setText(
    "gameWeatherWind",
    Number.isFinite(windSpeed)
      ? `${windDirection ? `${windDirection} ` : ""}${windSpeed.toFixed(1)} mph`
      : "— mph"
  );

  setText(
    "gameWeatherHumidity",
    Number.isFinite(humidity)
      ? `${Math.round(humidity)}%`
      : "—%"
  );

  setText(
    "gameWeatherIcon",
    gameHeaderWeatherIcon(weatherClass)
  );

  const rainElement = document.getElementById("gameRainChance");
  if (rainElement) {
    const showRain = Number.isFinite(rainChance) && rainChance > 0;
    rainElement.hidden = !showRain;
    rainElement.textContent = showRain
      ? `Rain ${Math.round(rainChance)}%`
      : "";
  }

  photo.alt = `${venueName} under ${condition.toLowerCase()} conditions`;

  /* BORING BETS: PER-VENUE STADIUM PHOTO POSITION V1 */
  const stadiumPhotoPositionSlug = typeof gameHeaderVariantSlug === "function"
    ? gameHeaderVariantSlug(venueName)
    : String(venueName || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

  const stadiumPhotoPositions = {
    /*
      Rogers Centre approved closed-roof image is already the final asset
      dimensions. Shift the source lower inside the viewport so the visible
      picture moves upward and shows more stadium below the roof.
    */
    "rogers-centre": "50% 72%"
  };

  photo.style.objectPosition =
    stadiumPhotoPositions[stadiumPhotoPositionSlug] || "50% 50%";

  /*
    BORING BETS: LOANDEPOT CLOSED HARD PHOTO FREEZE V1

    A closed LoanDepot Park must remain completely static. Do not re-run the
    candidate loader or permit any inherited animation beneath the stadium
    header. Open-roof games continue through the normal dynamic path.
  */
  const bbFreezeLoanDepotClosed =
    stadiumPhotoPositionSlug === "loandepot-park" &&
    card.dataset.roofState !== "open";

  if (bbFreezeLoanDepotClosed) {
    const bbLoanDepotClosedPhoto =
      "assets/images/stadiums/4169-hero-commons-v1.jpg";

    card.classList.add("is-enclosed-static");
    photo.classList.remove("is-loading");

    photo.style.animation = "none";
    photo.style.transition = "none";
    photo.style.opacity = "1";
    photo.style.filter = "none";
    photo.style.transform = "none";

    const currentPhoto = photo.getAttribute("src") || "";

    if (
      currentPhoto !== bbLoanDepotClosedPhoto &&
      !photo.currentSrc.endsWith("/4169-hero-commons-v1.jpg")
    ) {
      photo.src = bbLoanDepotClosedPhoto;
    }

    photo.dataset.stadiumCandidateKey = bbLoanDepotClosedPhoto;
    photo.dataset.stadiumResolvedUrl = bbLoanDepotClosedPhoto;

    const cancelLoanDepotAnimations = () => {
      if (typeof card.getAnimations !== "function") return;

      card.getAnimations({ subtree: true }).forEach((animation) => {
        try {
          animation.cancel();
        } catch (_) {
          // Ignore already-finished or browser-owned animations.
        }
      });
    };

    cancelLoanDepotAnimations();

    requestAnimationFrame(() => {
      cancelLoanDepotAnimations();
      photo.classList.remove("is-loading");
      photo.style.opacity = "1";
      photo.style.filter = "none";
      photo.style.transform = "none";
    });
  } else {
    gameHeaderLoadStadiumPhoto(
      photo,
      gameHeaderStadiumPhotoCandidates(game, venue)
    );
  }
}

function gameHeaderFiniteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function gameHeaderFormatTime(value, venue = {}) {
  if (!value) return "Time TBD";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";

  const requestedZone = String(
    venue.timezone ||
    venue.time_zone ||
    venue.tz ||
    "America/New_York"
  ).trim();

  const options = {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  };

  try {
    return date.toLocaleTimeString(
      "en-US",
      {
        ...options,
        timeZone: requestedZone
      }
    );
  } catch (_error) {
    return date.toLocaleTimeString("en-US", options);
  }
}

function gameHeaderWeatherClass(weather = {}, venue = {}) {
  const condition = String(
    weather.condition ||
    weather.summary ||
    weather.description ||
    ""
  ).toLowerCase();

  const roofText = [
    weather.roof,
    weather.roof_status,
    weather.roof_type,
    venue.roof,
    venue.roof_status,
    venue.roof_type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const temperature = gameHeaderFiniteNumber(
    weather.temperature,
    weather.temp,
    weather.temperature_f
  );

  const wind = gameHeaderFiniteNumber(
    weather.wind_speed,
    weather.wind_mph
  );

  const rainChance = gameHeaderFiniteNumber(
    weather.rain_probability,
    weather.precipitation_probability,
    weather.precip_probability
  );

  const classes = [];

  if (/closed|indoor|dome/.test(roofText)) {
    classes.push("is-weather-roofed");
  } else if (/thunder|lightning/.test(condition)) {
    classes.push("is-weather-thunder");
  } else if (/snow|sleet|flurr/.test(condition)) {
    classes.push("is-weather-snow");
  } else if (
    /rain|shower|drizzle|storm/.test(condition) ||
    (Number.isFinite(rainChance) && rainChance >= 45)
  ) {
    classes.push("is-weather-rain");
  } else if (/cloud|overcast|fog|mist|haze|smoke/.test(condition)) {
    classes.push("is-weather-cloudy");
  } else if (/clear|sunny|sun/.test(condition)) {
    classes.push("is-weather-clear");
  } else {
    classes.push("is-weather-neutral");
  }

  if (Number.isFinite(temperature) && temperature >= 90) {
    classes.push("is-weather-hot");
  } else if (Number.isFinite(temperature) && temperature <= 45) {
    classes.push("is-weather-cold");
  }

  if (Number.isFinite(wind) && wind >= 15) {
    classes.push("is-weather-windy");
  }

  return classes.join(" ");
}

function gameHeaderWeatherIcon(weatherClass) {
  if (weatherClass.includes("is-weather-thunder")) return "ϟ";
  if (weatherClass.includes("is-weather-snow")) return "✣";
  if (weatherClass.includes("is-weather-rain")) return "☂";
  if (weatherClass.includes("is-weather-cloudy")) return "☁";
  if (weatherClass.includes("is-weather-clear")) return "☀";
  if (weatherClass.includes("is-weather-roofed")) return "⌂";
  return "◌";
}

/* BORING BETS: SAFE STADIUM VARIANT SELECTOR V2 */

const GAME_HEADER_RETRACTABLE_ROOF_VENUES = new Set([
  "american-family-field",
  "chase-field",
  "daikin-park",
  "globe-life-field",
  "loandepot-park",
  "rogers-centre",
  "t-mobile-park"
]);

const GAME_HEADER_FIXED_CLOSED_ROOF_VENUES = new Set([
  "tropicana-field"
]);

const GAME_HEADER_VENUE_TIMEZONES = {
  "american-family-field": "America/Chicago",
  "angel-stadium": "America/Los_Angeles",
  "busch-stadium": "America/Chicago",
  "chase-field": "America/Phoenix",
  "citizens-bank-park": "America/New_York",
  "citi-field": "America/New_York",
  "comerica-park": "America/Detroit",
  "coors-field": "America/Denver",
  "daikin-park": "America/Chicago",
  "fenway-park": "America/New_York",
  "globe-life-field": "America/Chicago",
  "great-american-ball-park": "America/New_York",
  "kauffman-stadium": "America/Chicago",
  "las-vegas-ballpark": "America/Los_Angeles",
  "loandepot-park": "America/New_York",
  "nationals-park": "America/New_York",
  "oracle-park": "America/Los_Angeles",
  "oriole-park-at-camden-yards": "America/New_York",
  "petco-park": "America/Los_Angeles",
  "pnc-park": "America/New_York",
  "progressive-field": "America/New_York",
  "rate-field": "America/Chicago",
  "rogers-centre": "America/Toronto",
  "sutter-health-park": "America/Los_Angeles",
  "t-mobile-park": "America/Los_Angeles",
  "target-field": "America/Chicago",
  "tropicana-field": "America/New_York",
  "truist-park": "America/New_York",
  "uniqlo-field-at-dodger-stadium": "America/Los_Angeles",
  "dodger-stadium": "America/Los_Angeles",
  "wrigley-field": "America/Chicago",
  "yankee-stadium": "America/New_York"
};

function gameHeaderVariantSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function gameHeaderVenueRoofState(game = {}, venue = {}, venueSlug = "") {
  if (GAME_HEADER_FIXED_CLOSED_ROOF_VENUES.has(venueSlug)) {
    return {
      profile: "fixed_closed",
      state: "closed"
    };
  }

  const profile = GAME_HEADER_RETRACTABLE_ROOF_VENUES.has(venueSlug)
    ? "retractable"
    : "outdoor";

  const weather = game && game.weather ? game.weather : {};
  const roofText = [
    game.roof,
    game.roof_status,
    game.roof_type,
    weather.roof,
    weather.roof_status,
    weather.roof_type,
    venue.roof,
    venue.roof_status,
    venue.roof_type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let state = "unknown";

  if (/closed|indoor|dome/.test(roofText)) {
    state = "closed";
  } else if (/open/.test(roofText)) {
    state = "open";
  }

  return {
    profile,
    state
  };
}

function gameHeaderVenueLocalHour(value, venue = {}, venueSlug = "") {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const requestedZone = String(
    venue.timezone ||
    venue.time_zone ||
    venue.tz ||
    GAME_HEADER_VENUE_TIMEZONES[venueSlug] ||
    "America/New_York"
  ).trim();

  try {
    const formatter = new Intl.DateTimeFormat(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: requestedZone
      }
    );

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((part) => part.type === "hour");
    const minutePart = parts.find((part) => part.type === "minute");

    if (!hourPart) return null;

    const hour = Number(hourPart.value) % 24;
    const minute = minutePart ? Number(minutePart.value) : 0;

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour + (minute / 60);
  } catch (_error) {
    return null;
  }
}

function gameHeaderTimeOfDay(game = {}, venue = {}, venueSlug = "") {
  const hour = gameHeaderVenueLocalHour(
    game.game_time,
    venue,
    venueSlug
  );

  if (!Number.isFinite(hour)) return "";

  if (hour >= 17 && hour < 20) return "dusk";
  if (hour >= 7 && hour < 17) return "day";
  return "night";
}

function gameHeaderAppendVariantBases(
  target,
  key,
  roofProfile,
  roofState,
  timeOfDay
) {
  if (!key) return;

  const add = (value) => {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  };

  if (roofProfile === "fixed_closed" || roofState === "closed") {
    add(`${key}-closed`);
    add(key);
    return;
  }

  if (roofProfile === "retractable") {
    if (roofState === "open") {
      if (timeOfDay) add(`${key}-open-${timeOfDay}`);
      add(`${key}-open`);
    }

    add(key);
    return;
  }

  if (timeOfDay) add(`${key}-${timeOfDay}`);
  add(key);
}

function gameHeaderStadiumPhotoCandidates(game, venue = {}) {
  const venueId = String(
    venue.id ||
    venue.venue_id ||
    game?.venue_id ||
    ""
  ).trim();

  const venueName = String(
    venue.name ||
    venue.full_name ||
    game?.venue_name ||
    "stadium"
  );

  const slug = gameHeaderVariantSlug(venueName);
  const roof = gameHeaderVenueRoofState(game, venue, slug);
  const timeOfDay = gameHeaderTimeOfDay(game, venue, slug);

  const variantExplicit = [];

  if (roof.state === "closed") {
    variantExplicit.push(
      game?.stadium_image_closed_url,
      game?.venue_image_closed_url,
      venue.image_closed_url,
      venue.photo_closed_url
    );
  } else if (roof.state === "open") {
    variantExplicit.push(
      game?.stadium_image_open_url,
      game?.venue_image_open_url,
      venue.image_open_url,
      venue.photo_open_url
    );
  }

  const explicit = [
    ...variantExplicit,
    game?.stadium_image_url,
    game?.venue_image_url,
    venue.image_url,
    venue.photo_url,
    venue.hero_image_url,
    venue.image,
    venue.photo
  ].filter(Boolean);

  const baseNames = [];

  for (const key of [venueId, slug]) {
    gameHeaderAppendVariantBases(
      baseNames,
      key,
      roof.profile,
      roof.state,
      timeOfDay
    );
  }

  const local = [];

  for (const baseName of baseNames) {
    for (const extension of ["webp", "jpg", "jpeg", "png"]) {
      local.push(`assets/images/stadiums/${baseName}.${extension}`);
    }
  }

  /* BORING BETS: LOANDEPOT EXPLICIT OLD FALLBACK V2 */
  const venueSpecificFallbacks = [];
  /*
    BORING BETS: ADMIN STADIUM NAME FOLDERS V4

    Tarp-covered fields are rain-delay images, not ordinary rain images.

    Admin convention:
      assets/images/stadiums/venues/<stadium-name-slug>/<variant>.<extension>

    Relevant variants:
      fair-day.webp
      fair-night.webp
      rain-day.webp
      rain-night.webp
      rain-delay-day.webp
      rain-delay-night.webp

    Rain-delay images are selected only for an official delay, an explicit
    rain-delay-photo flag, or near-certain rain across most of the game window.
  */
  {
    const adminVenueName = String(
      venue?.name ??
      venue?.venue_name ??
      venue?.venueName ??
      game?.venue_name ??
      game?.venueName ??
      game?.venue?.name ??
      ""
    ).trim();

    const adminVenueId = String(
      venue?.id ??
      venue?.venue_id ??
      venue?.venueId ??
      game?.venue_id ??
      game?.venueId ??
      game?.venue?.id ??
      game?.venue?.venue_id ??
      game?.venue?.venueId ??
      ""
    ).trim();

    const adminVenueFolder = (
      adminVenueName ||
      String(slug || "") ||
      (adminVenueId ? `venue-${adminVenueId}` : "")
    )
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (adminVenueFolder) {
      const adminStatusText = [
        game?.status,
        game?.status_detail,
        game?.statusDetail,
        game?.detailed_state,
        game?.detailedState,
        game?.state,
        game?.game_status,
        game?.gameStatus,
        game?.delay_reason,
        game?.delayReason,
        game?.postponement_reason,
        game?.postponementReason,
        game?.notes,
        game?.note,
        game?.weather?.status,
        game?.weather?.delay_reason,
        game?.weather?.delayReason
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const adminWeatherText = [
        game?.weather?.condition,
        game?.weather?.short_forecast,
        game?.weather?.forecast,
        game?.weather?.summary,
        game?.weather?.text,
        game?.weather_condition,
        game?.weather_text,
        game?.forecast,
        game?.condition
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const adminOfficialRainDelay =
        /\brain(?:ed)?\s+delay\b/.test(adminStatusText) ||
        /\bweather\s+delay\b/.test(adminStatusText) ||
        /\bdelayed\b.{0,32}\b(?:rain|weather)\b/.test(adminStatusText) ||
        /\b(?:rain|weather)\b.{0,32}\bdelayed\b/.test(adminStatusText) ||
        /\bsuspended\b.{0,32}\b(?:rain|weather)\b/.test(adminStatusText) ||
        /\b(?:rain|weather)\b.{0,32}\bsuspended\b/.test(adminStatusText) ||
        /\bpostponed\b.{0,32}\b(?:rain|weather)\b/.test(adminStatusText) ||
        /\b(?:rain|weather)\b.{0,32}\bpostponed\b/.test(adminStatusText);

      const adminExplicitRainDelayPhoto = [
        game?.use_rain_delay_photo,
        game?.useRainDelayPhoto,
        game?.rain_delay_photo,
        game?.rainDelayPhoto,
        game?.rain_delay_likely,
        game?.rainDelayLikely,
        game?.tarp_expected,
        game?.tarpExpected,
        game?.weather?.use_rain_delay_photo,
        game?.weather?.useRainDelayPhoto,
        game?.weather?.rain_delay_likely,
        game?.weather?.rainDelayLikely,
        game?.weather?.tarp_expected,
        game?.weather?.tarpExpected
      ].some((value) => value === true);

      const adminToProbability = (value) => {
        if (value === null || value === undefined || value === "") {
          return null;
        }

        const parsed = Number.parseFloat(
          String(value).replace("%", "").trim()
        );

        if (!Number.isFinite(parsed)) {
          return null;
        }

        return parsed <= 1 ? parsed * 100 : parsed;
      };

      const adminToCoverage = (value) => {
        if (value === null || value === undefined || value === "") {
          return null;
        }

        const parsed = Number.parseFloat(
          String(value).replace("%", "").trim()
        );

        if (!Number.isFinite(parsed)) {
          return null;
        }

        return parsed > 1 ? parsed / 100 : parsed;
      };

      const adminProbabilityValues = [
        game?.rain_probability,
        game?.rainProbability,
        game?.precip_probability,
        game?.precipProbability,
        game?.precipitation_probability,
        game?.precipitationProbability,
        game?.weather?.rain_probability,
        game?.weather?.rainProbability,
        game?.weather?.precip_probability,
        game?.weather?.precipProbability,
        game?.weather?.precipitation_probability,
        game?.weather?.precipitationProbability
      ]
        .map(adminToProbability)
        .filter((value) => value !== null);

      const adminCoverageValues = [
        game?.rain_game_window_coverage,
        game?.rainGameWindowCoverage,
        game?.precip_game_window_coverage,
        game?.precipGameWindowCoverage,
        game?.rain_window_coverage,
        game?.rainWindowCoverage,
        game?.precip_window_coverage,
        game?.precipWindowCoverage,
        game?.weather?.rain_game_window_coverage,
        game?.weather?.rainGameWindowCoverage,
        game?.weather?.precip_game_window_coverage,
        game?.weather?.precipGameWindowCoverage,
        game?.weather?.rain_window_coverage,
        game?.weather?.rainWindowCoverage,
        game?.weather?.precip_window_coverage,
        game?.weather?.precipWindowCoverage
      ]
        .map(adminToCoverage)
        .filter((value) => value !== null);

      const adminMostGameRainFlag = [
        game?.rain_for_most_of_game,
        game?.rainForMostOfGame,
        game?.precip_for_most_of_game,
        game?.precipForMostOfGame,
        game?.weather?.rain_for_most_of_game,
        game?.weather?.rainForMostOfGame,
        game?.weather?.precip_for_most_of_game,
        game?.weather?.precipForMostOfGame
      ].some((value) => value === true);

      const adminGameWindowArrays = [
        game?.weather?.game_window,
        game?.weather?.gameWindow,
        game?.weather?.game_hours,
        game?.weather?.gameHours,
        game?.weather?.hourly_game_window,
        game?.weather?.hourlyGameWindow,
        game?.game_window_weather,
        game?.gameWindowWeather
      ].filter(Array.isArray);

      let adminNearCertainHourlyCoverage = false;

      for (const entries of adminGameWindowArrays) {
        const probabilities = entries
          .map((entry) =>
            adminToProbability(
              entry?.rain_probability ??
              entry?.rainProbability ??
              entry?.precip_probability ??
              entry?.precipProbability ??
              entry?.precipitation_probability ??
              entry?.precipitationProbability ??
              entry?.probability
            )
          )
          .filter((value) => value !== null);

        if (probabilities.length >= 2) {
          const nearCertainCount = probabilities.filter(
            (value) => value >= 99.5
          ).length;

          if (nearCertainCount / probabilities.length >= 0.75) {
            adminNearCertainHourlyCoverage = true;
            break;
          }
        }
      }

      const adminMaxProbability = adminProbabilityValues.length
        ? Math.max(...adminProbabilityValues)
        : null;

      const adminMaxCoverage = adminCoverageValues.length
        ? Math.max(...adminCoverageValues)
        : null;

      const adminNearCertainMostGame =
        adminNearCertainHourlyCoverage ||
        (
          adminMaxProbability !== null &&
          adminMaxProbability >= 99.5 &&
          (
            adminMostGameRainFlag ||
            (
              adminMaxCoverage !== null &&
              adminMaxCoverage >= 0.75
            )
          )
        );

      const adminUseRainDelayPhoto =
        adminOfficialRainDelay ||
        adminExplicitRainDelayPhoto ||
        adminNearCertainMostGame;

      /*
        BORING BETS: DETAILED VENUE WEATHER CATEGORIES V2

        Event state and atmospheric condition are intentionally separate.
        A tarp photograph is an event-state/rain-delay image, while ordinary
        rain remains weather/rain.
      */
      let adminEventState = "";

      if (adminUseRainDelayPhoto) {
        adminEventState = "rain-delay";
      } else if (
        /\bpostponed\b/.test(adminStatusText) &&
        /\b(?:rain|weather|storm|snow|ice)\b/.test(adminStatusText)
      ) {
        adminEventState = "postponed-weather";
      } else if (
        /\bsuspended\b/.test(adminStatusText) &&
        /\b(?:rain|weather|storm|snow|ice)\b/.test(adminStatusText)
      ) {
        adminEventState = "suspended-weather";
      } else if (
        /\bdelay(?:ed)?\b/.test(adminStatusText) &&
        /\b(?:rain|weather|storm|snow|ice)\b/.test(adminStatusText)
      ) {
        adminEventState = "weather-delay";
      }

      const adminTemperatureValue = Number.parseFloat(
        String(
          game?.weather?.temperature ??
          game?.weather?.temp ??
          game?.weather?.temperature_f ??
          game?.temperature ??
          ""
        ).replace("°", "").trim()
      );

      let adminWeather = "fair";

      if (/\blightning\b/.test(adminWeatherText)) {
        adminWeather = "lightning";
      } else if (
        /\bthunderstorm\b/.test(adminWeatherText) ||
        /\bthunder\b/.test(adminWeatherText) ||
        /\belectrical storm\b/.test(adminWeatherText)
      ) {
        adminWeather = "thunderstorm";
      } else if (/\bhail\b/.test(adminWeatherText)) {
        adminWeather = "hail";
      } else if (
        /\bfreezing rain\b/.test(adminWeatherText) ||
        /\bice storm\b/.test(adminWeatherText)
      ) {
        adminWeather = "freezing-rain";
      } else if (/\bsleet\b/.test(adminWeatherText)) {
        adminWeather = "sleet";
      } else if (
        /\bheavy snow\b/.test(adminWeatherText) ||
        /\bblizzard\b/.test(adminWeatherText) ||
        /\bsnow squall\b/.test(adminWeatherText)
      ) {
        adminWeather = "heavy-snow";
      } else if (
        /\bsnow\b/.test(adminWeatherText) ||
        /\bflurr/.test(adminWeatherText)
      ) {
        adminWeather = "snow";
      } else if (
        /\bheavy rain\b/.test(adminWeatherText) ||
        /\bdownpour\b/.test(adminWeatherText) ||
        /\btorrential\b/.test(adminWeatherText)
      ) {
        adminWeather = "heavy-rain";
      } else if (
        /\brain\b/.test(adminWeatherText) ||
        /\bshowers?\b/.test(adminWeatherText)
      ) {
        adminWeather = "rain";
      } else if (/\bdrizzle\b/.test(adminWeatherText)) {
        adminWeather = "drizzle";
      } else if (/\bfog\b|\bmist\b/.test(adminWeatherText)) {
        adminWeather = "fog";
      } else if (/\bsmoke\b/.test(adminWeatherText)) {
        adminWeather = "smoke";
      } else if (/\bhaze\b/.test(adminWeatherText)) {
        adminWeather = "haze";
      } else if (
        /\bdust\b/.test(adminWeatherText) ||
        /\bsandstorm\b/.test(adminWeatherText)
      ) {
        adminWeather = "dust";
      } else if (
        /\bovercast\b/.test(adminWeatherText) ||
        /\bmostly cloudy\b/.test(adminWeatherText)
      ) {
        adminWeather = "overcast";
      } else if (
        /\bpartly cloudy\b/.test(adminWeatherText) ||
        /\bpartly sunny\b/.test(adminWeatherText) ||
        /\bscattered clouds?\b/.test(adminWeatherText)
      ) {
        adminWeather = "partly-cloudy";
      } else if (/\bcloud/.test(adminWeatherText)) {
        adminWeather = "cloudy";
      } else if (
        /\bwind\b/.test(adminWeatherText) ||
        /\bwindy\b/.test(adminWeatherText) ||
        /\bgust/.test(adminWeatherText)
      ) {
        adminWeather = "windy";
      } else if (
        Number.isFinite(adminTemperatureValue) &&
        adminTemperatureValue >= 95
      ) {
        adminWeather = "extreme-heat";
      } else if (
        Number.isFinite(adminTemperatureValue) &&
        adminTemperatureValue <= 35
      ) {
        adminWeather = "extreme-cold";
      }

      const adminRoofText = [
        game?.roof,
        game?.roof_status,
        game?.roofStatus,
        game?.venue?.roof,
        game?.venue?.roof_status,
        game?.venue?.roofStatus,
        venue?.roof,
        venue?.roof_status,
        venue?.roofStatus
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let adminRoof = "";

      if (
        /\bclosed\b/.test(adminRoofText) ||
        /\bfixed\b/.test(adminRoofText) ||
        /\bdome\b/.test(adminRoofText)
      ) {
        adminRoof = "closed";
      } else if (/\bopen\b/.test(adminRoofText)) {
        adminRoof = "open";
      }

      const adminTimeSources = [];

      try {
        if (typeof gameHeaderFormatTime === "function") {
          adminTimeSources.push(
            gameHeaderFormatTime(
              game?.game_time ??
                game?.start_time ??
                game?.datetime ??
                game?.date_time ??
                game?.game_datetime ??
                game?.time ??
                "",
              venue
            )
          );
        }
      } catch (_) {
        // Continue through explicit and raw time fields.
      }

      adminTimeSources.push(
        game?.display_time,
        game?.local_time,
        game?.game_time_local,
        game?.start_time_local,
        game?.scheduled_time,
        game?.game_time,
        game?.start_time,
        game?.datetime,
        game?.date_time,
        game?.game_datetime,
        game?.time
      );

      let adminHour = null;

      for (const source of adminTimeSources) {
        const text = String(source || "").trim();
        if (!text) continue;

        const match12 = text.match(
          /\b(\d{1,2})(?::\d{2})?\s*(AM|PM)\b/i
        );

        if (match12) {
          let parsedHour = Number.parseInt(match12[1], 10) % 12;
          if (match12[2].toUpperCase() === "PM") {
            parsedHour += 12;
          }
          adminHour = parsedHour;
          break;
        }

        const match24 = text.match(
          /(?:T|\s)([01]\d|2[0-3]):[0-5]\d/
        );

        if (match24) {
          adminHour = Number.parseInt(match24[1], 10);
          break;
        }
      }

      if (adminHour === null) {
        const rawStart =
          game?.game_time ??
          game?.start_time ??
          game?.datetime ??
          game?.date_time ??
          game?.game_datetime ??
          "";

        const startDate = new Date(rawStart);

        if (!Number.isNaN(startDate.getTime())) {
          try {
            const hourText = new Intl.DateTimeFormat("en-US", {
              timeZone:
                venue?.timezone ??
                venue?.time_zone ??
                "America/New_York",
              hour: "2-digit",
              hourCycle: "h23"
            }).format(startDate);

            const parsedHour = Number.parseInt(hourText, 10);
            if (Number.isFinite(parsedHour)) {
              adminHour = parsedHour;
            }
          } catch (_) {
            // Leave unknown rather than guessing.
          }
        }
      }

      let adminTime = "day";

      if (
        adminHour !== null &&
        (adminHour >= 19 || adminHour < 6)
      ) {
        adminTime = "night";
      } else if (
        adminHour !== null &&
        adminHour >= 17 &&
        adminHour < 19
      ) {
        adminTime = "dusk";
      }

      const adminFolder =
        `assets/images/stadiums/venues/${adminVenueFolder}`;

      /*
        BORING BETS: RECURSIVE WEATHER FOLDER FALLBACKS V2

        Nested folder examples:
          weather/cloudy/day-01.webp
          event-state/rain-delay/night-01.webp
          roof/closed/night-01.webp
          interior/night-01.webp
          exterior/day-01.webp

        Exact and severe conditions fall safely toward broader and calmer
        visual states. A missing rain image never escalates into lightning.
      */
      const adminBases = [];

      const addAdminBase = (value) => {
        if (value && !adminBases.includes(value)) {
          adminBases.push(value);
        }
      };

      const adminTimeFallbacks = {
        day: ["day", "dusk"],
        dusk: ["dusk", "night", "day"],
        night: ["night", "dusk"]
      }[adminTime] || [adminTime, "day"];

      const adminWeatherFallbackMap = {
        lightning: [
          "lightning",
          "thunderstorm",
          "heavy-rain",
          "rain",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        thunderstorm: [
          "thunderstorm",
          "heavy-rain",
          "rain",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        hail: [
          "hail",
          "thunderstorm",
          "heavy-rain",
          "rain",
          "overcast",
          "cloudy",
          "fair"
        ],
        "freezing-rain": [
          "freezing-rain",
          "sleet",
          "rain",
          "overcast",
          "cloudy",
          "fair"
        ],
        sleet: [
          "sleet",
          "snow",
          "rain",
          "overcast",
          "cloudy",
          "fair"
        ],
        "heavy-snow": [
          "heavy-snow",
          "snow",
          "overcast",
          "cloudy",
          "fair"
        ],
        snow: [
          "snow",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        "heavy-rain": [
          "heavy-rain",
          "rain",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        rain: [
          "rain",
          "drizzle",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        drizzle: [
          "drizzle",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        fog: [
          "fog",
          "haze",
          "overcast",
          "cloudy",
          "fair"
        ],
        smoke: [
          "smoke",
          "haze",
          "overcast",
          "cloudy",
          "fair"
        ],
        haze: [
          "haze",
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        dust: [
          "dust",
          "haze",
          "overcast",
          "cloudy",
          "fair"
        ],
        overcast: [
          "overcast",
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        cloudy: [
          "cloudy",
          "partly-cloudy",
          "fair"
        ],
        "partly-cloudy": [
          "partly-cloudy",
          "fair",
          "cloudy"
        ],
        windy: [
          "windy",
          "partly-cloudy",
          "fair",
          "cloudy"
        ],
        "extreme-heat": [
          "extreme-heat",
          "fair",
          "partly-cloudy",
          "cloudy"
        ],
        "extreme-cold": [
          "extreme-cold",
          "fair",
          "partly-cloudy",
          "cloudy"
        ],
        fair: [
          "fair",
          "partly-cloudy",
          "cloudy"
        ]
      };

      const adminWeatherFallbacks =
        adminWeatherFallbackMap[adminWeather] ||
        [adminWeather, "fair"];

      const adminWeatherExposed =
        adminVenueId === "680" ||
        adminVenueFolder === "t-mobile-park";

      const adminIndoorClosed =
        adminRoof === "closed" &&
        !adminWeatherExposed;

      if (adminIndoorClosed) {
        for (const timeValue of adminTimeFallbacks) {
          addAdminBase(`roof/closed/${timeValue}`);
        }
        addAdminBase("roof/closed/default");

        for (const timeValue of adminTimeFallbacks) {
          addAdminBase(`interior/${timeValue}`);
        }
        addAdminBase("interior/default");
      } else {
        if (adminEventState) {
          for (const timeValue of adminTimeFallbacks) {
            addAdminBase(
              `event-state/${adminEventState}/${timeValue}`
            );
          }
          addAdminBase(
            `event-state/${adminEventState}/default`
          );
        }

        if (adminRoof) {
          for (const weatherValue of adminWeatherFallbacks) {
            for (const timeValue of adminTimeFallbacks) {
              addAdminBase(
                `roof/${adminRoof}/${weatherValue}/${timeValue}`
              );
            }
          }
        }

        for (const weatherValue of adminWeatherFallbacks) {
          for (const timeValue of adminTimeFallbacks) {
            addAdminBase(
              `weather/${weatherValue}/${timeValue}`
            );
          }
          addAdminBase(
            `weather/${weatherValue}/default`
          );
        }

        if (adminRoof) {
          for (const timeValue of adminTimeFallbacks) {
            addAdminBase(`roof/${adminRoof}/${timeValue}`);
          }
          addAdminBase(`roof/${adminRoof}/default`);
        }

        for (const timeValue of adminTimeFallbacks) {
          addAdminBase(`exterior/${timeValue}`);
        }
        addAdminBase("exterior/default");
      }

      /*
        Legacy flat filenames remain valid until each venue is migrated.
      */
      if (adminEventState) {
        for (const timeValue of adminTimeFallbacks) {
          addAdminBase(
            `${adminEventState}-${timeValue}`
          );
        }
        addAdminBase(adminEventState);
      }

      if (!adminIndoorClosed) {
        for (const weatherValue of adminWeatherFallbacks) {
          for (const timeValue of adminTimeFallbacks) {
            addAdminBase(
              `${weatherValue}-${timeValue}`
            );
          }
          addAdminBase(weatherValue);
        }
      }

      if (adminRoof) {
        for (const timeValue of adminTimeFallbacks) {
          addAdminBase(`${adminRoof}-fair-${timeValue}`);
        }
        addAdminBase(`${adminRoof}-fair`);
        addAdminBase(adminRoof);
      }

      for (const timeValue of adminTimeFallbacks) {
        addAdminBase(`fair-${timeValue}`);
      }

      addAdminBase(adminTime);
      addAdminBase("default");

      /*
        BORING BETS: UNIVERSAL NUMBERED VENUE IMAGE RESOLVER V1

        Numbered files are tried in deterministic order:
          <variant>-01.webp = primary
          <variant>-02.webp = fallback
          <variant>-03.webp = next fallback

        Existing unnumbered files remain supported as legacy fallbacks.
        Other sports can use the same resolver with their own ordered variant
        names, such as interior-night, clay-day, or closed-night.
      */
      const adminSportValue = String(
        game?.sport ??
        game?.sport_slug ??
        game?.sportSlug ??
        game?.league_sport ??
        game?.leagueSport ??
        venue?.sport ??
        "baseball"
      );

      const adminIndexedCandidates =
        window.BoringBetsVenueImages &&
        typeof window.BoringBetsVenueImages.getCandidates === "function"
          ? window.BoringBetsVenueImages.getCandidates({
              sport: adminSportValue,
              venueId: adminVenueId,
              venueName: adminVenueName,
              venueSlug: adminVenueFolder,
              variants: adminBases
            })
          : [];

      if (adminIndexedCandidates.length) {
        venueSpecificFallbacks.unshift(
          ...adminIndexedCandidates
        );
      } else {
        /*
          Safe legacy fallback when the generated venue index has not loaded.
          This preserves every existing unnumbered stadium photograph.
        */
        const adminExtensions = [
          "webp",
          "jpg",
          "jpeg",
          "png"
        ];

        const adminCandidates = [];

        for (const base of adminBases) {
          for (const extension of adminExtensions) {
            adminCandidates.push(
              `${adminFolder}/${base}.${extension}`
            );
          }
        }

        venueSpecificFallbacks.unshift(
          ...adminCandidates
        );
      }
    }
  }




  /*
    BORING BETS: CITI FIELD COMPLETE PHOTO RESTORE V3

    Citi does not yet have an approved real rain-delay photograph.
    Rainy games use the correct Citi day/night photograph, while the existing
    outdoor weather layer supplies the rain treatment.
  */
  {
    const citiRestoreVenueId = String(
      venue?.id ??
      venue?.venue_id ??
      venue?.venueId ??
      game?.venue_id ??
      game?.venueId ??
      game?.venue?.id ??
      game?.venue?.venue_id ??
      game?.venue?.venueId ??
      ""
    ).trim();

    const citiRestoreVenueName = String(
      venue?.name ??
      venue?.venue_name ??
      venue?.venueName ??
      game?.venue_name ??
      game?.venueName ??
      game?.venue?.name ??
      ""
    ).toLowerCase();

    const citiRestoreIsVenue =
      citiRestoreVenueId === "3289" ||
      slug === "citi-field" ||
      slug.includes("citi-field") ||
      citiRestoreVenueName.includes("citi field");

    if (citiRestoreIsVenue) {
      const citiRestoreWeatherText = [
        game?.weather?.condition,
        game?.weather?.short_forecast,
        game?.weather?.forecast,
        game?.weather?.summary,
        game?.weather?.text,
        game?.weather_condition,
        game?.weather_text,
        game?.forecast,
        game?.condition
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const citiRestoreIsRain =
        /\brain\b/.test(citiRestoreWeatherText) ||
        /\bdrizzle\b/.test(citiRestoreWeatherText) ||
        /\bshowers?\b/.test(citiRestoreWeatherText) ||
        /\bstorm\b/.test(citiRestoreWeatherText) ||
        /\bthunder\b/.test(citiRestoreWeatherText);

      if (citiRestoreIsRain) {
        const citiRestoreTimeSources = [];

        try {
          if (typeof gameHeaderFormatTime === "function") {
            citiRestoreTimeSources.push(
              gameHeaderFormatTime(
                game?.game_time ??
                  game?.start_time ??
                  game?.datetime ??
                  game?.date_time ??
                  game?.game_datetime ??
                  game?.time ??
                  "",
                venue
              )
            );
          }
        } catch (_) {
          // Continue through explicit and raw time fields.
        }

        citiRestoreTimeSources.push(
          game?.display_time,
          game?.local_time,
          game?.game_time_local,
          game?.start_time_local,
          game?.scheduled_time,
          game?.game_time,
          game?.start_time,
          game?.datetime,
          game?.date_time,
          game?.game_datetime,
          game?.time
        );

        let citiRestoreHour = null;

        for (const source of citiRestoreTimeSources) {
          const text = String(source || "").trim();
          if (!text) continue;

          const match12 = text.match(
            /\b(\d{1,2})(?::\d{2})?\s*(AM|PM)\b/i
          );

          if (match12) {
            let parsedHour = Number.parseInt(match12[1], 10) % 12;
            if (match12[2].toUpperCase() === "PM") {
              parsedHour += 12;
            }
            citiRestoreHour = parsedHour;
            break;
          }

          const match24 = text.match(
            /(?:T|\s)([01]\d|2[0-3]):[0-5]\d/
          );

          if (match24) {
            citiRestoreHour = Number.parseInt(match24[1], 10);
            break;
          }
        }

        if (citiRestoreHour === null) {
          const rawStart =
            game?.game_time ??
            game?.start_time ??
            game?.datetime ??
            game?.date_time ??
            game?.game_datetime ??
            "";

          const startDate = new Date(rawStart);

          if (!Number.isNaN(startDate.getTime())) {
            try {
              const hourText = new Intl.DateTimeFormat("en-US", {
                timeZone:
                  venue?.timezone ??
                  venue?.time_zone ??
                  "America/New_York",
                hour: "2-digit",
                hourCycle: "h23"
              }).format(startDate);

              const parsedHour = Number.parseInt(hourText, 10);
              if (Number.isFinite(parsedHour)) {
                citiRestoreHour = parsedHour;
              }
            } catch (_) {
              // Leave unknown rather than guessing.
            }
          }
        }

        const citiRestoreIsNight =
          citiRestoreHour !== null &&
          (citiRestoreHour >= 19 || citiRestoreHour < 6);

        venueSpecificFallbacks.push(
          citiRestoreIsNight
            ? "assets/images/stadiums/3289-night-rain-v3.webp"
            : "assets/images/stadiums/3289-day-rain-v3.webp"
        );
      }
    }
  }


  /*
    BORING BETS: WRIGLEY NIGHT SELECTION V2

    Recognize Wrigley primarily by MLB venue ID 17 and use the same displayed
    time information as the header. A unique night filename avoids stale
    browser caching.
  */
  {
    const wrigleyNightVenueId = String(
      venue?.id ??
      venue?.venue_id ??
      venue?.venueId ??
      game?.venue_id ??
      game?.venueId ??
      game?.venue?.id ??
      game?.venue?.venue_id ??
      game?.venue?.venueId ??
      ""
    ).trim();

    const wrigleyNightVenueName = String(
      venue?.name ??
      venue?.venue_name ??
      venue?.venueName ??
      game?.venue_name ??
      game?.venueName ??
      game?.venue?.name ??
      ""
    ).toLowerCase();

    const wrigleyNightIsVenue =
      wrigleyNightVenueId === "17" ||
      slug === "wrigley-field" ||
      slug.includes("wrigley-field") ||
      wrigleyNightVenueName.includes("wrigley field");

    if (wrigleyNightIsVenue) {
      const wrigleyNightTimeSources = [];

      try {
        if (typeof gameHeaderFormatTime === "function") {
          wrigleyNightTimeSources.push(
            gameHeaderFormatTime(
              game?.game_time ??
                game?.start_time ??
                game?.datetime ??
                game?.date_time ??
                game?.game_datetime ??
                game?.time ??
                "",
              venue
            )
          );
        }
      } catch (_) {
        // Continue through explicit and raw time fields.
      }

      wrigleyNightTimeSources.push(
        game?.display_time,
        game?.local_time,
        game?.game_time_local,
        game?.start_time_local,
        game?.scheduled_time,
        game?.game_time,
        game?.start_time,
        game?.datetime,
        game?.date_time,
        game?.game_datetime,
        game?.time
      );

      let wrigleyNightHour = null;

      for (const source of wrigleyNightTimeSources) {
        const text = String(source || "").trim();
        if (!text) continue;

        const match12 = text.match(
          /\b(\d{1,2})(?::\d{2})?\s*(AM|PM)\b/i
        );

        if (match12) {
          let parsedHour = Number.parseInt(match12[1], 10) % 12;
          if (match12[2].toUpperCase() === "PM") {
            parsedHour += 12;
          }
          wrigleyNightHour = parsedHour;
          break;
        }

        const match24 = text.match(
          /(?:T|\s)([01]\d|2[0-3]):[0-5]\d/
        );

        if (match24) {
          wrigleyNightHour = Number.parseInt(match24[1], 10);
          break;
        }
      }

      if (wrigleyNightHour === null) {
        const rawStart =
          game?.game_time ??
          game?.start_time ??
          game?.datetime ??
          game?.date_time ??
          game?.game_datetime ??
          "";

        const startDate = new Date(rawStart);

        if (!Number.isNaN(startDate.getTime())) {
          try {
            const hourText = new Intl.DateTimeFormat("en-US", {
              timeZone:
                venue?.timezone ??
                venue?.time_zone ??
                "America/Chicago",
              hour: "2-digit",
              hourCycle: "h23"
            }).format(startDate);

            const parsedHour = Number.parseInt(hourText, 10);
            if (Number.isFinite(parsedHour)) {
              wrigleyNightHour = parsedHour;
            }
          } catch (_) {
            // Leave unknown rather than guessing.
          }
        }
      }

      const wrigleyNightIsNight =
        wrigleyNightHour !== null &&
        (wrigleyNightHour >= 19 || wrigleyNightHour < 6);

      if (wrigleyNightIsNight) {
        venueSpecificFallbacks.push(
          "assets/images/stadiums/17-night-v2.webp"
        );
      }
    }
  }


  /* BORING BETS: FENWAY RAIN HERO V1 */
  {
    const fenwayVenueId = String(
      venue?.id ??
      venue?.venue_id ??
      venue?.venueId ??
      game?.venue_id ??
      game?.venueId ??
      game?.venue?.id ??
      game?.venue?.venue_id ??
      game?.venue?.venueId ??
      ""
    ).trim();

    const fenwayVenueName = String(
      venue?.name ??
      venue?.venue_name ??
      venue?.venueName ??
      game?.venue_name ??
      game?.venueName ??
      game?.venue?.name ??
      ""
    ).toLowerCase();

    const fenwayIsVenue =
      fenwayVenueId === "3" ||
      slug === "fenway-park" ||
      slug.includes("fenway-park") ||
      fenwayVenueName.includes("fenway park");

    if (fenwayIsVenue) {
      const fenwayWeatherText = [
        game?.weather?.condition,
        game?.weather?.short_forecast,
        game?.weather?.forecast,
        game?.weather?.summary,
        game?.weather?.text,
        game?.weather_condition,
        game?.weather_text,
        game?.forecast,
        game?.condition
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const fenwayIsRain =
        /\brain\b/.test(fenwayWeatherText) ||
        /\bdrizzle\b/.test(fenwayWeatherText) ||
        /\bshowers?\b/.test(fenwayWeatherText) ||
        /\bstorm\b/.test(fenwayWeatherText) ||
        /\bthunder\b/.test(fenwayWeatherText);

      if (fenwayIsRain) {
        venueSpecificFallbacks.push(
          "assets/images/stadiums/3-rain.webp"
        );
      }
    }
  }

  /*
    BORING BETS: CHASE FIELD NIGHT HERO V4

    Identify Chase Field primarily by MLB venue ID 15. Venue-name and slug
    checks remain as fallbacks so this rule does not depend on one exact name.
  */
  {
    const chaseVenueId = String(
      venue?.id ??
      venue?.venue_id ??
      venue?.venueId ??
      game?.venue_id ??
      game?.venueId ??
      game?.venue?.id ??
      game?.venue?.venue_id ??
      game?.venue?.venueId ??
      ""
    ).trim();

    const chaseVenueName = String(
      venue?.name ??
      venue?.venue_name ??
      venue?.venueName ??
      game?.venue_name ??
      game?.venueName ??
      game?.venue?.name ??
      ""
    ).toLowerCase();

    const chaseIsVenue =
      chaseVenueId === "15" ||
      slug === "chase-field" ||
      slug.includes("chase-field") ||
      chaseVenueName.includes("chase field");

    if (chaseIsVenue) {
      const chaseTimeSources = [];

      try {
        if (typeof gameHeaderFormatTime === "function") {
          chaseTimeSources.push(
            gameHeaderFormatTime(
              game?.game_time ??
                game?.start_time ??
                game?.datetime ??
                game?.date_time ??
                game?.game_datetime ??
                game?.time ??
                "",
              venue
            )
          );
        }
      } catch (_) {
        // Continue through raw source fields.
      }

      chaseTimeSources.push(
        game?.display_time,
        game?.local_time,
        game?.game_time_local,
        game?.start_time_local,
        game?.scheduled_time,
        game?.game_time,
        game?.start_time,
        game?.datetime,
        game?.date_time,
        game?.game_datetime,
        game?.time
      );

      let chaseDisplayHour = null;

      for (const chaseTimeSource of chaseTimeSources) {
        const chaseTimeText = String(chaseTimeSource || "").trim();
        if (!chaseTimeText) continue;

        const chase12HourMatch = chaseTimeText.match(
          /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i
        );

        if (chase12HourMatch) {
          let parsedChaseHour =
            Number.parseInt(chase12HourMatch[1], 10) % 12;

          if (chase12HourMatch[3].toUpperCase() === "PM") {
            parsedChaseHour += 12;
          }

          chaseDisplayHour = parsedChaseHour;
          break;
        }

        const chase24HourMatch = chaseTimeText.match(
          /(?:T|\s)([01]\d|2[0-3]):[0-5]\d/
        );

        if (chase24HourMatch) {
          chaseDisplayHour =
            Number.parseInt(chase24HourMatch[1], 10);
          break;
        }
      }

      const chaseIsNight =
        chaseDisplayHour !== null &&
        (chaseDisplayHour >= 19 || chaseDisplayHour < 6);

      if (chaseIsNight) {
        venueSpecificFallbacks.push(
          "assets/images/stadiums/15-night.webp"
        );
      }
    }
  }

  if (
    slug === "loandepot-park" &&
    roof.state !== "open"
  ) {
    venueSpecificFallbacks.push(
      "assets/images/stadiums/4169-hero-commons-v1.jpg"
    );
  }

  /*
    BORING BETS: CHASE FIELD NIGHT PRIORITY FIX V2

    Venue-specific time/roof overrides must be evaluated before the ordinary
    closed/default candidates. This lets Chase Field's night image win from
    7:00 PM through 5:59 AM local time, while the regular image wins during
    the daytime.
  */
  return [
    ...venueSpecificFallbacks,
    ...explicit,
    ...local,
    "assets/images/stadiums/default.svg"
  ];
}
/*
  BORING BETS: STABLE STADIUM PHOTO LOADER V1

  Live data refreshes may rerender the stadium header many times. Keep the
  current photograph visible while checking candidates and avoid reloading the
  same candidate list on every refresh.
*/
function gameHeaderLoadStadiumPhoto(image, candidates) {
  const urls = [...new Set(candidates.filter(Boolean))];

  if (!urls.length) {
    image.classList.remove("is-loading");
    return;
  }

  const candidateKey = urls.join("\n");
  const currentKey = image.dataset.stadiumCandidateKey || "";
  const hasVisiblePhoto = Boolean(
    image.currentSrc ||
    image.getAttribute("src")
  );

  /*
    Nothing relevant changed. Do not reset src, opacity, event handlers, or the
    fallback search just because live game data refreshed.
  */
  if (candidateKey === currentKey && hasVisiblePhoto) {
    image.classList.remove("is-loading");
    return;
  }

  image.dataset.stadiumCandidateKey = candidateKey;

  const requestId = String(
    (Number(image.dataset.stadiumLoadRequestId) || 0) + 1
  );

  image.dataset.stadiumLoadRequestId = requestId;

  /*
    Only show the initial loading state when there is no photo yet. During a
    replacement search, preserve the existing stadium photograph at full
    opacity.
  */
  if (hasVisiblePhoto) {
    image.classList.remove("is-loading");
  } else {
    image.classList.add("is-loading");
  }

  let index = 0;

  const requestIsCurrent = () =>
    image.dataset.stadiumLoadRequestId === requestId;

  const tryNext = () => {
    if (!requestIsCurrent()) return;

    if (index >= urls.length) {
      image.classList.remove("is-loading");
      return;
    }

    const url = urls[index++];
    const probe = new Image();

    probe.onload = () => {
      if (!requestIsCurrent()) return;

      const currentAttribute = image.getAttribute("src") || "";

      if (currentAttribute === url || image.currentSrc === probe.currentSrc) {
        image.classList.remove("is-loading");
        image.dataset.stadiumResolvedUrl = url;
        return;
      }

      /*
        The replacement is already decoded/cached by the probe. Swap only now,
        after success, so a missing candidate can never blank or flash the
        visible stadium photo.
      */
      image.onload = () => {
        if (!requestIsCurrent()) return;

        image.classList.remove("is-loading");
        image.dataset.stadiumResolvedUrl = url;
        image.onload = null;
        image.onerror = null;
      };

      image.onerror = () => {
        if (!requestIsCurrent()) return;

        image.onload = null;
        image.onerror = null;
        tryNext();
      };

      image.src = url;
    };

    probe.onerror = tryNext;
    probe.src = url;
  };

  tryNext();
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
        "season",
      location:
        state.awayPitcherLocation,
      startMode:
        state.awayPitcherStartMode,
      startCount:
        state.awayPitcherStartCount
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
    },

    onStartModeChange: active => {
      state.awayPitcherStartMode =
        Boolean(active);

      if (active) {
        state.awayPitcherStartCount =
          state.awayPitcherStartCount || 7;
      }

      renderPitchers();
    },

    onStartCountChange: count => {
      state.awayPitcherStartCount =
        Number(count) || 7;

      state.awayPitcherStartMode =
        true;

      renderPitchers();
    }
  });

  const homePitcherModule =
    buildMlbPitcherModule({
      game,
      side: "home",
      timeframe:
        "season",
      location:
        state.homePitcherLocation,
      startMode:
        state.homePitcherStartMode,
      startCount:
        state.homePitcherStartCount
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
    },

    onStartModeChange: active => {
      state.homePitcherStartMode =
        Boolean(active);

      if (active) {
        state.homePitcherStartCount =
          state.homePitcherStartCount || 7;
      }

      renderPitchers();
    },

    onStartCountChange: count => {
      state.homePitcherStartCount =
        Number(count) || 7;

      state.homePitcherStartMode =
        true;

      renderPitchers();
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
        state.homeOffenseTimeframe
    });

  renderOffenseWidget({
    container:
      document.getElementById(
        "homeOffenseCard"
      ),

    module:
      homeOffenseModule,

    onTimeframeChange: timeframe => {
      state.homeOffenseTimeframe = timeframe;
      renderOffenses();
    }
  });

  const awayOffenseModule =
    buildMlbOffenseModule({
      game,
      side: "away",
      timeframe:
        state.awayOffenseTimeframe
    });

  renderOffenseWidget({
    container:
      document.getElementById(
        "awayOffenseCard"
      ),

    module:
      awayOffenseModule,

    onTimeframeChange: timeframe => {
      state.awayOffenseTimeframe = timeframe;
      renderOffenses();
    }
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

const GAME_NAVIGATION_ANCHOR_SELECTOR = [
  "#awayPitcherCard",
  "#homePitcherCard",
  "#awayOffenseCard",
  "#homeOffenseCard",
  "#awayPitcherLineupCard",
  "#homePitcherLineupCard",
  "#awayBullpenCard",
  "#homeBullpenCard",
  "#pitching",
  "#bullpens",
  "#weather",
  "#market",
  "#context",
  "#gameContext",
  "#gameArticles",
  "#gameOfficialPlays",
  "#gameResults",
  "#gameEvaluations",
  "#gameDetails"
].join(",");

function captureGameNavigationScrollState() {
  const viewportX =
    Math.max(
      0,
      Math.min(
        window.innerWidth - 1,
        window.innerWidth / 2
      )
    );

  const viewportY =
    Math.max(
      0,
      Math.min(
        window.innerHeight - 1,
        window.innerHeight / 2
      )
    );

  const centeredElement =
    document.elementFromPoint(
      viewportX,
      viewportY
    );

  let anchor =
    centeredElement?.closest?.(
      GAME_NAVIGATION_ANCHOR_SELECTOR
    ) || null;

  if (!anchor) {
    const candidates = [
      ...document.querySelectorAll(
        GAME_NAVIGATION_ANCHOR_SELECTOR
      )
    ].filter(element => {
      const rect =
        element.getBoundingClientRect();

      return (
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.top <= window.innerHeight
      );
    });

    anchor =
      candidates
        .map(element => {
          const rect =
            element.getBoundingClientRect();

          const center =
            rect.top + rect.height / 2;

          return {
            element,
            distance:
              Math.abs(center - viewportY)
          };
        })
        .sort(
          (a, b) =>
            a.distance - b.distance
        )[0]?.element || null;
  }

  if (!anchor?.id) {
    return null;
  }

  const rect =
    anchor.getBoundingClientRect();

  const relativePosition =
    rect.height > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (viewportY - rect.top) /
              rect.height
          )
        )
      : 0;

  return {
    anchorId: anchor.id,
    relativePosition,
    viewportY
  };
}

function restoreGameNavigationScrollState(
  scrollState
) {
  if (!scrollState?.anchorId) {
    return;
  }

  const restore = () => {
    const anchor =
      document.getElementById(
        scrollState.anchorId
      );

    if (!anchor) {
      return;
    }

    const rect =
      anchor.getBoundingClientRect();

    const pointInsideAnchor =
      rect.top +
      rect.height *
        scrollState.relativePosition;

    const targetScroll =
      window.scrollY +
      pointInsideAnchor -
      scrollState.viewportY;

    window.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: "auto"
    });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(restore);
  });

  // Recheck once widgets and logos have settled.
  window.setTimeout(
    restore,
    100
  );
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

  const scrollState =
    captureGameNavigationScrollState();

  state.game = game;
  state.timeframe =
    game.controls?.default_timeframe ||
    "last_30";
  state.awayPitcherLocation = "all";
  state.homePitcherLocation = "all";
  state.awayOffenseTimeframe = "last_30";
  state.homeOffenseTimeframe = "last_30";

  history.pushState(
    {
      gameId: game.id,
      scrollState
    },
    "",
    `game.html?id=${encodeURIComponent(game.id)}`
  );

  renderAll();

  document.title =
    `${game.away_team?.abbr || "Away"} at ` +
    `${game.home_team?.abbr || "Home"} | Boring Bets`;

  restoreGameNavigationScrollState(
    scrollState
  );
}

window.addEventListener("popstate", () => {
  const gameId =
    new URLSearchParams(window.location.search).get("id");
  const game =
    state.games.find(item => item.id === gameId);

  if (game) {
    state.game = game;
    state.awayPitcherLocation = "all";
    state.homePitcherLocation = "all";
    state.awayOffenseTimeframe = "last_30";
    state.homeOffenseTimeframe = "last_30";
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

function formatGameStartTime(value) {
  if (!value) {
    return "Time TBD";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Time TBD";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }
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

/* BORING BETS: LOANDEPOT COMMONS HERO V1 */
