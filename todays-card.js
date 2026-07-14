const cardEscape = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );

const MLB_LOGO_BASE =
  "https://www.mlbstatic.com/team-logos/team-cap-on-dark";

async function loadCard() {
  const status =
    document.getElementById("cardStatus");

  try {
    const selectedDate =
      getSelectedDate();

    const [gamesResponse, playsResponse] =
      await Promise.all([
        fetch(
          `data/games.json?v=${Date.now()}`
        ),
        fetch(
          `data/todays-card.json?v=${Date.now()}`
        )
      ]);

    if (!gamesResponse.ok) {
      throw new Error(
        "Unable to load the MLB schedule."
      );
    }

    const gamesData =
      await gamesResponse.json();

    const playsData =
      playsResponse.ok
        ? await playsResponse.json()
        : { plays: [] };

    const games =
      (gamesData.games || [])
        .filter(
          game => game.date === selectedDate
        )
        .sort(sortGames);

    const plays =
      (playsData.plays || [])
        .filter(
          play => play.date === selectedDate
        );

    const playsByGameId =
      groupPlaysByGameId(plays);

    renderDateHeader(
      selectedDate,
      gamesData,
      playsData
    );

    renderDateNavigation(
      selectedDate
    );

    function renderSummary(
  games,
  plays
) {
  setText(
    "totalGames",
    games.length
  );

  setText(
    "totalPlays",
    plays.length
  );

  setText(
    "totalUnits",
    plays
      .reduce(
        (sum, play) =>
          sum + Number(play.units || 0),
        0
      )
      .toFixed(2)
  );
}

    renderSlate(
      games,
      playsByGameId
    );

    if (!games.length && !plays.length) {
      status.textContent =
        "No games or plays are available for this date.";

      return;
    }

    status?.remove();
  } catch (error) {
    console.error(error);

    if (status) {
      status.textContent =
        error.message ||
        "Unable to load the card.";
    }
  }
}

function renderDateHeader(
  selectedDate,
  gamesData,
  playsData
) {
  setText(
    "cardDate",
    `Card date // ${formatCardDate(
      selectedDate
    )}`
  );

  const updatedAt =
    playsData.updated_at ||
    gamesData.updated_at ||
    getLatestGameUpdate(
      gamesData.games || []
    );

  setText(
    "cardUpdated",
    `Updated // ${formatCardDate(
      updatedAt,
      true
    )}`
  );
}

function renderDateNavigation(
  selectedDate
) {
  const cardDate =
    document.getElementById("cardDate");

  if (!cardDate) return;

  let navigation =
    document.getElementById(
      "cardDateNavigation"
    );

  if (!navigation) {
    navigation =
      document.createElement("nav");

    navigation.id =
      "cardDateNavigation";

    navigation.className =
      "card-date-navigation";

    navigation.setAttribute(
      "aria-label",
      "Card date navigation"
    );

    cardDate.insertAdjacentElement(
      "afterend",
      navigation
    );
  }

  const previousDate =
    shiftDate(selectedDate, -1);

  const nextDate =
    shiftDate(selectedDate, 1);

  const today =
    getLocalDateString(
      new Date()
    );

  navigation.innerHTML = `
    <a
      href="${buildDateUrl(previousDate)}"
      class="card-date-link"
    >
      ← Previous
    </a>

    <a
      href="${buildDateUrl(today)}"
      class="card-date-link"
    >
      Today
    </a>

    <a
      href="${buildDateUrl(nextDate)}"
      class="card-date-link"
    >
      Next →
    </a>
  `;
}

function renderSummary(
  games,
  plays
) {
  setText(
    "totalPlays",
    plays.length
  );

  setText(
    "totalUnits",
    plays
      .reduce(
        (sum, play) =>
          sum + Number(play.units || 0),
        0
      )
      .toFixed(2)
  );

  setText(
    "totalSports",
    new Set(
      games.map(
        game => game.sport || "MLB"
      )
    ).size
  );
}

function renderSlate(
  games,
  playsByGameId
) {
  const container =
    document.getElementById(
      "playsContainer"
    );

  if (!container) return;

  container.innerHTML = "";

  if (!games.length) {
    const message =
      document.createElement("p");

    message.className =
      "card-message";

    message.textContent =
      "No imported games are available for this date.";

    container.appendChild(message);

    return;
  }

  const heading =
    document.createElement("h2");

  heading.className =
    "sport-group-title";

  heading.textContent =
    "MLB";

  container.appendChild(heading);

  games.forEach(game => {
    const attachedPlays =
      playsByGameId.get(game.id) || [];

    if (attachedPlays.length) {
      attachedPlays.forEach(play => {
        container.appendChild(
          buildPublishedPlayCard(
            play,
            game
          )
        );
      });

      return;
    }

    container.appendChild(
      buildGameCard(game)
    );
  });
}

function buildPublishedPlayCard(
  play,
  game
) {
  const card =
    createInteractiveCard(
      `play.html?id=${encodeURIComponent(
        play.id
      )}`
    );

  card.className =
    "play-card published-play-card";

  card.innerHTML = `
    ${renderMatchupLogos(game, play)}

    <div class="play-top">
      <span class="sport">
        ${cardEscape(
          play.sport || "MLB"
        )}
      </span>

      <span
        class="stars"
        aria-label="${Number(
          play.rating || 0
        )} star rating"
      >
        ${"★".repeat(
          Number(play.rating || 0)
        )}
      </span>
    </div>

    <h2>
      ${cardEscape(play.play)}
    </h2>

    <p>
      <strong>
        ${cardEscape(
          play.game ||
          formatGameLabel(game)
        )}
      </strong>
    </p>

    <p>
      ${cardEscape(play.odds)}
      ·
      ${Number(
        play.units || 0
      ).toFixed(2)}
      units
    </p>

    <p>
      ${cardEscape(
        excerpt(
          play.analysis,
          190
        )
      )}
    </p>

    <small>
      ${cardEscape(
        play.handicapper
      )}
    </small>

    ${renderResultBadge(play)}

    <span class="card-cta">
      FULL ANALYSIS →
    </span>
  `;

  return card;
}

function buildGameCard(game) {
  const card =
    createInteractiveCard(
      `game.html?id=${encodeURIComponent(
        game.id
      )}`
    );

  card.className =
    "play-card schedule-game-card";

  const awayPitcher =
    game.pitchers?.away?.name ||
    "Starter TBD";

  const homePitcher =
    game.pitchers?.home?.name ||
    "Starter TBD";

  card.innerHTML = `
    ${renderMatchupLogos(game)}

    <div class="play-top">
      <span class="sport">
        MLB
      </span>

      <span class="game-state">
        ${cardEscape(
          formatGameStatus(game.status)
        )}
      </span>
    </div>

    <h2>
      ${cardEscape(
        formatGameLabel(game)
      )}
    </h2>

    <p>
      <strong>
        ${cardEscape(
          awayPitcher
        )}
        vs
        ${cardEscape(
          homePitcher
        )}
      </strong>
    </p>

    <p>
      ${cardEscape(
        formatGameTime(
          game.game_time
        )
      )}
      ${game.venue?.name
        ? ` · ${cardEscape(
            game.venue.name
          )}`
        : ""}
    </p>

    <p>
      No published Boring Bets play yet.
    </p>

    <span class="card-cta">
      EXPLORE MATCHUP →
    </span>
  `;

  return card;
}

function renderMatchupLogos(
  game,
  play = {}
) {
  const awayTeam =
    game?.away_team?.abbr ||
    play.away_team ||
    "AWAY";

  const homeTeam =
    game?.home_team?.abbr ||
    play.home_team ||
    "HOME";

  const awayTeamId =
    game?.away_team?.team_id ||
    play.away_team_id;

  const homeTeamId =
    game?.home_team?.team_id ||
    play.home_team_id;

  return `
    <div class="matchup-logos">
      <div class="team-logo away-logo">
        ${renderTeamLogo(
          awayTeamId,
          awayTeam
        )}

        <span>
          ${cardEscape(awayTeam)}
        </span>
      </div>

      <div class="matchup-at">
        @
      </div>

      <div class="team-logo home-logo">
        ${renderTeamLogo(
          homeTeamId,
          homeTeam
        )}

        <span>
          ${cardEscape(homeTeam)}
        </span>
      </div>
    </div>
  `;
}

function renderTeamLogo(
  teamId,
  team
) {
  if (!teamId) {
    return `
      <span class="missing-team-logo">
        ${cardEscape(team)}
      </span>
    `;
  }

  return `
    <img
      src="${MLB_LOGO_BASE}/${Number(
        teamId
      )}.svg"
      alt="${cardEscape(team)} logo"
    >
  `;
}

function renderResultBadge(play) {
  const result =
    String(
      play.result || ""
    ).toLowerCase();

  if (!result) {
    return "";
  }

  const label =
    result === "win"
      ? "WIN"
      : result === "loss"
        ? "LOSS"
        : result === "push"
          ? "PUSH"
          : result.toUpperCase();

  return `
    <span class="play-result play-result-${cardEscape(
      result
    )}">
      ${cardEscape(label)}
    </span>
  `;
}

function createInteractiveCard(
  destination
) {
  const card =
    document.createElement("article");

  card.tabIndex = 0;

  card.setAttribute(
    "role",
    "link"
  );

  const open = () => {
    window.location.href =
      destination;
  };

  card.addEventListener(
    "click",
    open
  );

  card.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        open();
      }
    }
  );

  return card;
}

function groupPlaysByGameId(plays) {
  const grouped =
    new Map();

  plays.forEach(play => {
    const gameId =
      play.game_id ||
      createGameId(play);

    if (!grouped.has(gameId)) {
      grouped.set(gameId, []);
    }

    grouped
      .get(gameId)
      .push(play);
  });

  return grouped;
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

function getSelectedDate() {
  const requested =
    new URLSearchParams(
      window.location.search
    ).get("date");

  if (
    requested &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      requested
    )
  ) {
    return requested;
  }

  return getLocalDateString(
    new Date()
  );
}

function buildDateUrl(date) {
  return (
    `todays-card.html?date=` +
    encodeURIComponent(date)
  );
}

function shiftDate(
  dateString,
  numberOfDays
) {
  const date =
    new Date(
      `${dateString}T12:00:00`
    );

  date.setDate(
    date.getDate() + numberOfDays
  );

  return getLocalDateString(date);
}

function getLocalDateString(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getLatestGameUpdate(games) {
  const updates =
    games
      .map(
        game => game.last_updated
      )
      .filter(Boolean)
      .sort();

  return (
    updates.at(-1) ||
    new Date().toISOString()
  );
}

function sortGames(a, b) {
  return String(
    a.game_time || ""
  ).localeCompare(
    String(
      b.game_time || ""
    )
  );
}

function formatGameLabel(game) {
  return (
    `${game.away_team?.abbr || "Away"} ` +
    `at ` +
    `${game.home_team?.abbr || "Home"}`
  );
}

function formatGameStatus(status) {
  if (status === "live") {
    return "LIVE";
  }

  if (status === "final") {
    return "FINAL";
  }

  if (status === "postponed") {
    return "POSTPONED";
  }

  if (status === "cancelled") {
    return "CANCELLED";
  }

  return "SCHEDULED";
}

function formatGameTime(value) {
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

function excerpt(
  value,
  max
) {
  const text =
    String(value || "");

  return text.length > max
    ? `${text
        .slice(0, max)
        .trim()}…`
    : text;
}

function formatCardDate(
  value,
  includeTime = false
) {
  if (!value) {
    return "—";
  }

  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(value)
    )
      ? new Date(
          `${value}T12:00:00`
        )
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    [],
    includeTime
      ? {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }
      : {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric"
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

loadCard();