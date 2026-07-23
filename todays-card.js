const CARD_FALLBACK_CONFIG = {"schema_version":"1.1","sports":[{"id":"baseball","label":"Baseball","mark":"BB","default_league":"mlb","leagues":[{"id":"mlb","label":"MLB","feed":"active"},{"id":"triple-a","label":"Triple-A","feed":"active"},{"id":"double-a","label":"Double-A","feed":"active"},{"id":"high-a","label":"High-A","feed":"active"},{"id":"single-a","label":"Single-A","feed":"active"},{"id":"rookie","label":"Rookie","feed":"active"},{"id":"kbo","label":"KBO","feed":"planned"},{"id":"npb","label":"NPB","feed":"planned"},{"id":"ncaa-baseball","label":"NCAA","feed":"planned"},{"id":"international-baseball","label":"International","feed":"planned"}]},{"id":"basketball","label":"Basketball","mark":"BK","default_league":"nba","leagues":[{"id":"nba","label":"NBA","feed":"planned"},{"id":"wnba","label":"WNBA","feed":"planned"},{"id":"nba-g-league","label":"G League","feed":"planned"},{"id":"ncaam","label":"NCAA Men","feed":"planned"},{"id":"ncaaw","label":"NCAA Women","feed":"planned"},{"id":"euroleague","label":"EuroLeague","feed":"planned"},{"id":"fiba","label":"FIBA / International","feed":"planned"}]},{"id":"football","label":"Football","mark":"FB","default_league":"nfl","leagues":[{"id":"nfl","label":"NFL","feed":"planned"},{"id":"ncaaf","label":"NCAA Football","feed":"planned"},{"id":"cfl","label":"CFL","feed":"planned"},{"id":"ufl","label":"UFL","feed":"planned"}]},{"id":"hockey","label":"Hockey","mark":"HK","default_league":"nhl","leagues":[{"id":"nhl","label":"NHL","feed":"planned"},{"id":"ahl","label":"AHL","feed":"planned"},{"id":"echl","label":"ECHL","feed":"planned"},{"id":"ohl","label":"OHL","feed":"planned"},{"id":"whl","label":"WHL","feed":"planned"},{"id":"qmjhl","label":"QMJHL","feed":"planned"},{"id":"ncaa-hockey","label":"NCAA","feed":"planned"},{"id":"ushl","label":"USHL","feed":"planned"},{"id":"pwhl","label":"PWHL","feed":"planned"},{"id":"shl","label":"SHL","feed":"planned"},{"id":"liiga","label":"Liiga","feed":"planned"},{"id":"del","label":"DEL","feed":"planned"},{"id":"national-league","label":"Swiss NL","feed":"planned"},{"id":"khl","label":"KHL","feed":"planned"},{"id":"international-hockey","label":"International","feed":"planned"}]},{"id":"soccer","label":"Soccer","mark":"SC","default_league":"mls","leagues":[{"id":"mls","label":"MLS","feed":"planned"},{"id":"epl","label":"Premier League","feed":"planned"},{"id":"champions-league","label":"Champions League","feed":"planned"},{"id":"europa-league","label":"Europa League","feed":"planned"},{"id":"la-liga","label":"La Liga","feed":"planned"},{"id":"serie-a","label":"Serie A","feed":"planned"},{"id":"bundesliga","label":"Bundesliga","feed":"planned"},{"id":"ligue-1","label":"Ligue 1","feed":"planned"},{"id":"liga-mx","label":"Liga MX","feed":"planned"},{"id":"nwsl","label":"NWSL","feed":"planned"},{"id":"international-soccer","label":"International","feed":"planned"}]},{"id":"tennis","label":"Tennis","mark":"TN","default_league":"atp","leagues":[{"id":"atp","label":"ATP","feed":"planned"},{"id":"wta","label":"WTA","feed":"planned"},{"id":"atp-challenger","label":"ATP Challenger","feed":"planned"},{"id":"wta-125","label":"WTA 125","feed":"planned"},{"id":"itf-men","label":"ITF Men","feed":"planned"},{"id":"itf-women","label":"ITF Women","feed":"planned"},{"id":"tennis-doubles","label":"Doubles","feed":"planned"},{"id":"team-tennis","label":"Team / International","feed":"planned"}]},{"id":"combat","label":"Combat","mark":"CF","default_league":"ufc","leagues":[{"id":"ufc","label":"UFC","feed":"planned"},{"id":"pfl","label":"PFL","feed":"planned"},{"id":"one","label":"ONE Championship","feed":"planned"},{"id":"rizin","label":"RIZIN","feed":"planned"},{"id":"regional-mma","label":"Regional MMA","feed":"planned"},{"id":"boxing","label":"Boxing","feed":"planned"}]},{"id":"golf","label":"Golf","mark":"GF","default_league":"pga-tour","leagues":[{"id":"pga-tour","label":"PGA Tour","feed":"planned"},{"id":"lpga","label":"LPGA","feed":"planned"},{"id":"dp-world-tour","label":"DP World Tour","feed":"planned"},{"id":"liv-golf","label":"LIV Golf","feed":"planned"},{"id":"korn-ferry","label":"Korn Ferry Tour","feed":"planned"}]}],"notes":"MLB and affiliated Minor League Baseball schedule feeds are active."};

const BASEBALL_LOGO_BASE = "https://www.mlbstatic.com/team-logos";
const MLB_CAP_LOGO_BASE = "https://www.mlbstatic.com/team-logos/team-cap-on-dark";
const MINOR_LEAGUE_IDS = new Set(["triple-a", "double-a", "high-a", "single-a", "rookie"]);


const cardState = {
  config: CARD_FALLBACK_CONFIG,
  date: "",
  selectedSportIds: new Set(["baseball"]),
  openLeaguesBySport: new Map(),
  statusFilter: "all",
  plays: [],
  playsByEventId: new Map(),
  leagueCache: new Map(),
  renderGeneration: 0,
  latestFeedUpdate: null,
  refreshTimer: null,
  refreshInFlight: false,
  mlbLiveTimer: null,
  mlbLiveInFlight: false,
  mlbLiveUpdatedAt: null,
  mlbLiveRawById: new Map(),
  mlbLiveScores: new Map(),
  mlbRunBadgeTimers: new Map()
};

const cardEscape = (value = "") =>
  String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);

window.addEventListener("DOMContentLoaded", async () => {
  await initialiseTodaysCard({ preserveCache: false });
  scheduleCardAutoRefresh();
  scheduleMlbLivePoll(250);
});

window.addEventListener("popstate", async () => {
  await initialiseTodaysCard({ preserveCache: false });
  scheduleCardAutoRefresh();
  scheduleMlbLivePoll(250);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshOpenLeagueFeeds();
    scheduleMlbLivePoll(100);
  }
});

// Capture image failures so every baseball card either advances to the next
// official logo source or falls back to a clean team abbreviation mark.
document.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches("img[data-baseball-team-logo]")) return;
  advanceBaseballTeamLogo(image);
}, true);

async function initialiseTodaysCard(options = {}) {
  const generation = ++cardState.renderGeneration;
  try {
    const selectedDate = getSelectedDate();
    if (selectedDate !== cardState.date) cardState.latestFeedUpdate = null;
    cardState.date = selectedDate;
    cardState.statusFilter = getRequestedFilter();

    if (!options.preserveCache) {
      let config = cardState.config || CARD_FALLBACK_CONFIG;
      let playsData = null;

      try {
        config = await fetchJson("data/sports-card-config.json");
      } catch (error) {
        console.warn("Using embedded sports-card configuration.", error);
      }

      try {
        playsData = await fetchOptionalJson("data/todays-card.json");
      } catch (error) {
        console.warn("Official plays feed is unavailable.", error);
      }

      cardState.config = config || CARD_FALLBACK_CONFIG;
      cardState.plays = (playsData?.plays || []).filter(play => play.date === cardState.date);
      cardState.playsByEventId = groupPlaysByEventId(cardState.plays);
    }

    resolveSelectedSports();
    renderDateHeader();
    renderDateNavigation();
    bindStatusFilters();
    renderSportSwitcher();
    renderSportWorkspace();
    await loadAllOpenLeagues(generation);
    if (generation !== cardState.renderGeneration) return;
    updateSummary();
  } catch (error) {
    console.error(error);
    const status = document.getElementById("cardStatus");
    if (status) status.textContent = error?.message || "Unable to load Today’s Card.";
  }
}

function resolveSelectedSports() {
  const sports = cardState.config?.sports || [];
  const validIds = new Set(sports.map(sport => sport.id));
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("sports") || params.get("sport") || readStoredSports();
  const requestedIds = String(requested || "baseball")
    .split(",")
    .map(value => value.trim())
    .filter(value => validIds.has(value));

  cardState.selectedSportIds = new Set(requestedIds.length ? requestedIds : [sports[0]?.id || "baseball"]);

  cardState.selectedSportIds.forEach(sportId => ensureOpenLeagues(sportId));

  // Preserve support for the old ?league=mlb URL when only one sport is selected.
  const legacyLeague = params.get("league");
  if (legacyLeague && cardState.selectedSportIds.size === 1) {
    const [sportId] = cardState.selectedSportIds;
    if (getLeague(sportId, legacyLeague)) {
      cardState.openLeaguesBySport.set(sportId, new Set([legacyLeague]));
    }
  }
}

function readStoredSports() {
  const stored = localStorage.getItem("bb-card-sports");
  if (stored) return stored;
  return localStorage.getItem("bb-card-sport") || "baseball";
}

function ensureOpenLeagues(sportId) {
  if (cardState.openLeaguesBySport.has(sportId)) return cardState.openLeaguesBySport.get(sportId);

  const sport = getSport(sportId);
  const stored = localStorage.getItem(`bb-card-open-leagues-${sportId}`);
  let ids = [];

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = stored.split(",");
    }
  }

  ids = ids.filter(id => getLeague(sportId, id));
  if (!ids.length) ids = [sport?.default_league || sport?.leagues?.[0]?.id].filter(Boolean);

  const open = new Set(ids);
  cardState.openLeaguesBySport.set(sportId, open);
  return open;
}

function saveSelection() {
  localStorage.setItem("bb-card-sports", [...cardState.selectedSportIds].join(","));
  cardState.openLeaguesBySport.forEach((leagues, sportId) => {
    localStorage.setItem(`bb-card-open-leagues-${sportId}`, JSON.stringify([...leagues]));
  });
}

function renderDateHeader() {
  setText("cardDate", formatCardDate(cardState.date));
  renderFeedUpdateLabel();
}

function renderFeedUpdateLabel() {
  const target = document.getElementById("cardUpdated");
  if (!target) return;
  const updated = cardState.latestFeedUpdate ? new Date(cardState.latestFeedUpdate) : null;
  if (updated && !Number.isNaN(updated.getTime())) {
    target.textContent = `Feed updated ${new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(updated)}`;
    return;
  }
  target.textContent = `Feeds checked ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date())}`;
}

function renderDateNavigation() {
  const navigation = document.getElementById("cardDateNavigation");
  if (!navigation) return;

  const previous = shiftDate(cardState.date, -1);
  const next = shiftDate(cardState.date, 1);
  const today = getLocalDateString(new Date());

  navigation.innerHTML = `
    <button type="button" class="multisport-date-button multisport-date-previous" data-card-date="${previous}" aria-label="Previous day">‹</button>
    <button type="button" class="multisport-date-today" data-card-date="${today}">Today</button>
    <button type="button" class="multisport-date-button multisport-date-next" data-card-date="${next}" aria-label="Next day">›</button>
  `;

  navigation.querySelectorAll("[data-card-date]").forEach(button => {
    button.addEventListener("click", () => navigateToCardDate(button.dataset.cardDate));
  });

  const sidePrevious = document.getElementById("sidePreviousDate");
  const sideNext = document.getElementById("sideNextDate");
  if (sidePrevious) {
    sidePrevious.dataset.cardDate = previous;
    sidePrevious.title = `Previous day: ${formatCardDate(previous)}`;
    sidePrevious.onclick = () => navigateToCardDate(previous);
  }
  if (sideNext) {
    sideNext.dataset.cardDate = next;
    sideNext.title = `Next day: ${formatCardDate(next)}`;
    sideNext.onclick = () => navigateToCardDate(next);
  }
}

function bindStatusFilters() {
  document.querySelectorAll("[data-status-filter]").forEach(button => {
    const filter = button.dataset.statusFilter;
    button.classList.toggle("is-active", filter === cardState.statusFilter);
    button.onclick = () => {
      cardState.statusFilter = filter;
      document.querySelectorAll("[data-status-filter]").forEach(item => {
        item.classList.toggle("is-active", item === button);
      });
      syncUrl();
      rerenderLoadedLeagueCards();
    };
  });
}

function renderSportSwitcher() {
  const switcher = document.getElementById("sportSwitcher");
  if (!switcher) return;

  switcher.innerHTML = (cardState.config?.sports || []).map(sport => {
    const selected = cardState.selectedSportIds.has(sport.id);
    const preview = sport.leagues.slice(0, 3).map(league => league.label).join(" · ");
    return `
      <button
        type="button"
        class="sport-switcher-button${selected ? " is-active" : ""}"
        aria-pressed="${selected}"
        data-sport-id="${cardEscape(sport.id)}"
      >
        <span class="sport-switcher-mark">${cardEscape(sport.mark)}</span>
        <span class="sport-switcher-copy">
          <strong>${cardEscape(sport.label)}</strong>
          <small>${cardEscape(preview)}</small>
          <small data-sport-count="${cardEscape(sport.id)}">— events</small>
        </span>
      </button>
    `;
  }).join("");

  switcher.querySelectorAll("[data-sport-id]").forEach(button => {
    button.addEventListener("click", () => toggleSport(button.dataset.sportId));
  });

  updateSportCounts();
}

async function toggleSport(sportId) {
  if (!getSport(sportId)) return;

  if (cardState.selectedSportIds.has(sportId)) {
    // Never leave the board empty; the last selected sport stays active.
    if (cardState.selectedSportIds.size === 1) return;
    cardState.selectedSportIds.delete(sportId);
  } else {
    cardState.selectedSportIds.add(sportId);
    ensureOpenLeagues(sportId);
  }

  saveSelection();
  syncUrl();
  renderSportSwitcher();
  renderSportWorkspace();
  await loadAllOpenLeagues();
  updateSummary();
}

function renderSportWorkspace() {
  const workspace = document.getElementById("sportWorkspace");
  if (!workspace) return;

  const selectedSports = (cardState.config?.sports || []).filter(sport => cardState.selectedSportIds.has(sport.id));
  workspace.classList.toggle("has-many-sports", selectedSports.length > 1);

  if (!selectedSports.length) {
    workspace.innerHTML = `<div class="sport-board-empty">Select at least one sport.</div>`;
    return;
  }

  workspace.innerHTML = selectedSports.map(sport => {
    const open = ensureOpenLeagues(sport.id);
    return `
      <div class="sport-board-block" data-sport-workspace="${cardEscape(sport.id)}">
        <div class="league-accordion">
          ${sport.leagues.map(league => renderLeagueShell(sport.id, league, open.has(league.id))).join("")}
        </div>
      </div>
    `;
  }).join("");

  workspace.querySelectorAll("details[data-sport-id][data-league-id]").forEach(details => {
    details.addEventListener("toggle", async () => {
      const sportId = details.dataset.sportId;
      const leagueId = details.dataset.leagueId;
      const open = ensureOpenLeagues(sportId);

      if (details.open) {
        open.add(leagueId);
        saveSelection();
        await loadLeagueIntoPanel(sportId, leagueId);
      } else {
        open.delete(leagueId);
        // Keep at least the sport's default league remembered for its next activation.
        if (!open.size) {
          const fallback = getSport(sportId)?.default_league;
          if (fallback && fallback !== leagueId) open.add(fallback);
        }
        saveSelection();
      }
    });
  });
}

function renderLeagueShell(sportId, league, isOpen) {
  const planned = league.feed !== "active";
  return `
    <details class="league-dropdown" data-sport-id="${cardEscape(sportId)}" data-league-id="${cardEscape(league.id)}"${isOpen ? " open" : ""}>
      <summary>
        <span class="league-dropdown-main">
          <strong>${cardEscape(league.label)}</strong>
          <small>${planned ? "Feed connection planned" : "Connected schedule"}</small>
        </span>
        <span class="league-dropdown-status">
          <b data-count-sport="${cardEscape(sportId)}" data-league-count="${cardEscape(league.id)}">—</b>
          <span>events</span>
          <i aria-hidden="true"></i>
        </span>
      </summary>
      <div class="league-event-panel" data-sport-id="${cardEscape(sportId)}" data-league-panel="${cardEscape(league.id)}">
        <div class="league-loading-state">${planned ? "Open league to check for a connected feed." : "Loading events…"}</div>
      </div>
    </details>
  `;
}

async function loadAllOpenLeagues(generation = cardState.renderGeneration) {
  const tasks = [];
  const requestedDate = cardState.date;
  cardState.selectedSportIds.forEach(sportId => {
    ensureOpenLeagues(sportId).forEach(leagueId => {
      if (getLeague(sportId, leagueId)) {
        tasks.push(loadLeagueIntoPanel(sportId, leagueId, requestedDate, generation));
      }
    });
  });
  await Promise.all(tasks);
}

async function loadLeagueIntoPanel(
  sportId,
  leagueId,
  requestedDate = cardState.date,
  generation = cardState.renderGeneration
) {
  const panel = document.querySelector(`[data-sport-id="${cssEscape(sportId)}"][data-league-panel="${cssEscape(leagueId)}"]`);
  if (!panel) return;

  if (!panel.querySelector(".compact-event-grid")) {
    panel.innerHTML = `<div class="league-loading-state">Loading ${cardEscape(getLeague(sportId, leagueId)?.label || leagueId)}…</div>`;
  }

  try {
    const result = await loadLeagueEvents(sportId, leagueId, requestedDate);

    // A slower request for the previous card date must never overwrite the
    // board after the user has clicked a date arrow.
    if (generation !== cardState.renderGeneration || requestedDate !== cardState.date) return;

    cardState.leagueCache.set(leagueCacheKey(sportId, leagueId, requestedDate), result);
    recordFeedUpdate(result.updatedAt);
    renderLeagueResult(panel, sportId, leagueId, result);
    updateLeagueCount(sportId, leagueId, result.events.length, result.available);
    updateSportCounts();
    updateSummary();
  } catch (error) {
    if (generation !== cardState.renderGeneration || requestedDate !== cardState.date) return;
    console.error(error);
    panel.innerHTML = `<div class="league-loading-state is-error">${cardEscape(error.message || "Unable to load this league.")}</div>`;
  }
}

async function loadLeagueEvents(sportId, leagueId, date) {
  const cacheKey = leagueCacheKey(sportId, leagueId, date);
  if (cardState.leagueCache.has(cacheKey)) return cardState.leagueCache.get(cacheKey);

  if (sportId === "baseball" && leagueId === "mlb") return loadMlbEvents(date);
  if (sportId === "baseball" && MINOR_LEAGUE_IDS.has(leagueId)) {
    return loadMinorLeagueEvents(leagueId, date);
  }

  const path = `data/cards/${encodeURIComponent(date)}/${encodeURIComponent(leagueId)}.json`;
  const response = await fetch(path, { cache: "no-store" });

  if (response.status === 404) return { available: false, events: [], source: path };
  if (!response.ok) throw new Error(`Unable to load ${leagueId.toUpperCase()} events.`);

  const data = await response.json();
  if (!documentMatchesCardDate(data, date)) {
    return { available: true, events: [], source: path, dateMismatch: true };
  }
  const rawEvents = data.events || data.games || data.matches || data.fights || [];
  const selected = selectEventsForCardDate(rawEvents, date, { assumeDailyShard: true });
  return {
    available: true,
    events: selected.map(event => normalizeGenericEvent(event, sportId, leagueId, date)).sort(sortEvents),
    source: path,
    updatedAt: data.updated_at || data.updatedAt || null
  };
}

async function loadMinorLeagueEvents(leagueId, date) {
  const season = String(date).slice(0, 4);
  const dailyPath = `data/cards/${encodeURIComponent(date)}/${encodeURIComponent(leagueId)}.json`;
  const dailyResponse = await fetch(dailyPath, { cache: "no-store" });

  if (dailyResponse.ok) {
    const data = await dailyResponse.json();
    if (!documentMatchesCardDate(data, date)) {
      return { available: true, events: [], source: dailyPath, dateMismatch: true, seasonLoaded: season };
    }
    const rawEvents = data.events || data.games || [];
    const selected = selectEventsForCardDate(rawEvents, date, { assumeDailyShard: true });
    return {
      available: true,
      events: selected.map(event => normalizeGenericEvent(event, "baseball", leagueId, date)).sort(sortEvents),
      source: dailyPath,
      updatedAt: data.updated_at || data.updatedAt || null,
      seasonLoaded: season
    };
  }

  const seasonPath = `data/schedules/baseball/${encodeURIComponent(season)}/${encodeURIComponent(leagueId)}.json`;
  const seasonResponse = await fetch(seasonPath, { cache: "no-store" });
  if (seasonResponse.status === 404) {
    return {
      available: false,
      events: [],
      source: seasonPath,
      message: `Run the minor-league schedule builder for ${season}.`
    };
  }
  if (!seasonResponse.ok) throw new Error(`Unable to load ${leagueId.toUpperCase()} season schedule.`);

  const data = await seasonResponse.json();
  const rawEvents = data.events || data.games || [];
  const selected = rawEvents.filter(event => eventDateKey(event) === date);
  return {
    available: true,
    events: selected.map(event => normalizeGenericEvent(event, "baseball", leagueId, date)).sort(sortEvents),
    source: seasonPath,
    updatedAt: data.updated_at || data.updatedAt || null,
    seasonLoaded: season,
    seasonEventCount: rawEvents.length
  };
}

function readExplicitDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function eventDateKey(event) {
  const explicitFields = [
    event?.card_date,
    event?.schedule_date,
    event?.date,
    event?.game_date
  ];
  for (const value of explicitFields) {
    const explicit = readExplicitDate(value);
    if (explicit) return explicit;
  }

  const stableId = String(event?.id || event?.game_id || "");
  const idDate = stableId.match(/^(\d{4}-\d{2}-\d{2})(?:-|$)/);
  if (idDate) return idDate[1];

  const value = event?.start_time || event?.game_time || event?.date_time || event?.gameDate;
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return readExplicitDate(String(value).slice(0, 10));
  return getLocalDateString(parsed);
}

function documentMatchesCardDate(data, cardDate) {
  const declared = [data?.card_date, data?.schedule_date, data?.date]
    .map(readExplicitDate)
    .find(Boolean);
  return !declared || declared === cardDate;
}

function selectEventsForCardDate(events, cardDate, options = {}) {
  const assumeDailyShard = Boolean(options.assumeDailyShard);
  return (events || []).filter(event => {
    const eventDate = eventDateKey(event);
    if (eventDate) return eventDate === cardDate;
    return assumeDailyShard;
  });
}

async function loadMlbEvents(date) {
  const cardPath = `data/cards/${encodeURIComponent(date)}/mlb.json`;
  const enrichedPath = `data/games/${encodeURIComponent(date)}.json`;
  const livePath = `data/live-games/${encodeURIComponent(date)}.json`;

  const cardDocument = await fetchOptionalDocument(cardPath);
  if (cardDocument) {
    if (!documentMatchesCardDate(cardDocument, date)) {
      return { available: true, events: [], source: cardPath, dateMismatch: true };
    }

    const liveDocument = await fetchOptionalDocument(livePath);
    const mergedGames = mergeMlbGameCollections(
      cardDocument.games || cardDocument.events || [],
      liveDocument?.games || []
    );

    const selected = selectEventsForCardDate(
      mergedGames,
      date,
      { assumeDailyShard: true }
    );

    return {
      available: true,
      events: selected
        .map(game => normalizeMlbEvent(game, date))
        .sort(sortEvents),
      source: cardPath,
      updatedAt: newestFeedTimestamp(
        cardDocument.updated_at || cardDocument.source_updated_at,
        liveDocument?.updated_at
      )
    };
  }

  const enrichedDocument = await fetchOptionalDocument(enrichedPath);
  if (enrichedDocument) {
    if (!documentMatchesCardDate(enrichedDocument, date)) {
      return { available: true, events: [], source: enrichedPath, dateMismatch: true };
    }
    const liveDocument = await fetchOptionalDocument(livePath);
    const mergedGames = mergeMlbGameCollections(
      enrichedDocument.games || [],
      liveDocument?.games || []
    );
    const selected = selectEventsForCardDate(mergedGames, date, { assumeDailyShard: true });
    return {
      available: true,
      events: selected.map(game => normalizeMlbEvent(game, date)).sort(sortEvents),
      source: enrichedPath,
      updatedAt: newestFeedTimestamp(enrichedDocument.updated_at, liveDocument?.updated_at)
    };
  }

  const liveDocument = await fetchOptionalDocument(livePath);
  if (liveDocument) {
    const selected = selectEventsForCardDate(liveDocument.games || [], date, { assumeDailyShard: true });
    return {
      available: true,
      events: selected.map(game => normalizeMlbEvent(game, date)).sort(sortEvents),
      source: livePath,
      updatedAt: liveDocument.updated_at || null
    };
  }

  return {
    available: false,
    events: [],
    source: cardPath,
    message: `No MLB card feed exists for ${date}. Run scripts/scheduled_refresh.py.`
  };
}

async function fetchOptionalDocument(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to load ${path}.`);
  return response.json();
}

function mergeMlbGameCollections(enrichedGames, statusGames) {
  const merged = (enrichedGames || []).map(game => ({ ...game }));
  const byKey = new Map(merged.map(game => [mlbGameIdentity(game), game]));

  (statusGames || []).forEach(statusGame => {
    const key = mlbGameIdentity(statusGame);
    const target = byKey.get(key);
    if (!target) {
      const copy = { ...statusGame };
      merged.push(copy);
      byKey.set(key, copy);
      return;
    }

    ["status", "abstract_status", "score", "linescore", "decisions", "game_time"].forEach(field => {
      if (statusGame?.[field] !== undefined && statusGame?.[field] !== null) {
        target[field] = statusGame[field];
      }
    });

    ["away_team", "home_team", "pitchers", "venue"].forEach(field => {
      if (statusGame?.[field] && typeof statusGame[field] === "object") {
        target[field] = mergeNestedObjects(target[field], statusGame[field]);
      }
    });
  });

  return merged;
}

function normalizeMlbIdentityId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/(^|-)ari(?=-|$)/g, "$1az");
}

function mlbGameIdentity(game) {
  const gamePk = game?.mlb_game_pk || game?.game_pk || game?.gamePk;
  return gamePk
    ? `pk:${gamePk}`
    : `id:${normalizeMlbIdentityId(game?.id)}`;
}

function mergeNestedObjects(base, overlay) {
  const result = { ...(base || {}) };
  Object.entries(overlay || {}).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = mergeNestedObjects(result[key], value);
    } else if (value !== undefined && value !== null) {
      result[key] = value;
    }
  });
  return result;
}

function normalizeMlbLiveState(linescore = {}) {
  const readNumber = value => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const isOccupied = value => {
    if (value === true || value === 1 || value === "1") return true;
    if (!value) return false;
    if (typeof value === "object") return true;
    return ["occupied", "on", "true"].includes(String(value).toLowerCase());
  };

  const bases = linescore.bases || {};
  const offense = linescore.offense || {};

  const occupiedBases = {
    first: isOccupied(
      bases.first !== undefined ? bases.first : offense.first
    ),
    second: isOccupied(
      bases.second !== undefined ? bases.second : offense.second
    ),
    third: isOccupied(
      bases.third !== undefined ? bases.third : offense.third
    )
  };

  const inningState = String(
    linescore.inning_state ||
    linescore.inningState ||
    ""
  ).trim();

  const topFlag =
    linescore.is_top_inning !== undefined
      ? linescore.is_top_inning
      : linescore.isTopInning;

  let inningHalf = String(
    linescore.inning_half ||
    linescore.inningHalf ||
    ""
  ).toLowerCase();

  if (!inningHalf) {
    if (topFlag === true) {
      inningHalf = "top";
    } else if (topFlag === false) {
      inningHalf = "bottom";
    } else if (inningState.toLowerCase().includes("top")) {
      inningHalf = "top";
    } else if (inningState.toLowerCase().includes("bottom")) {
      inningHalf = "bottom";
    } else if (inningState.toLowerCase().includes("middle")) {
      inningHalf = "middle";
    } else if (inningState.toLowerCase().includes("end")) {
      inningHalf = "end";
    }
  }

  const calculatedRunners = Object.values(occupiedBases)
    .filter(Boolean)
    .length;

  const explicitRunners = readNumber(
    linescore.runners_on !== undefined
      ? linescore.runners_on
      : linescore.runnersOn
  );

  return {
    currentInning: readNumber(
      linescore.current_inning !== undefined
        ? linescore.current_inning
        : linescore.currentInning
    ),
    currentInningOrdinal:
      linescore.current_inning_ordinal ||
      linescore.currentInningOrdinal ||
      "",
    inningState,
    inningHalf,
    balls: readNumber(linescore.balls),
    strikes: readNumber(linescore.strikes),
    outs: readNumber(linescore.outs),
    bases: occupiedBases,
    runnersOn:
      explicitRunners !== null
        ? explicitRunners
        : calculatedRunners
  };
}

function mlbStatusIsExplicitlyLive(value) {
  const status = String(value || "").toLowerCase();

  if (
    status.includes("postpon") ||
    status.includes("cancel") ||
    status.includes("final") ||
    status.includes("completed")
  ) {
    return false;
  }

  return (
    status.includes("in progress") ||
    status.includes("live") ||
    status.includes("warmup") ||
    status.includes("delayed") ||
    status.includes("game delay") ||
    status.includes("challenge") ||
    status.includes("review")
  );
}

function normalizeMlbEvent(game, cardDate = cardState.date) {
  const startTime = game.game_time || game.start_time || game.gameDate;
  const eventDate = eventDateKey(game) || cardDate;
  const rawStatus = readStatusText(game.status);
  const awayScore = readTeamScore(game, "away");
  const homeScore = readTeamScore(game, "home");
  const finalScoreAvailable = hasFinalScore(awayScore, homeScore);

  /*
    An explicit MLB live status always wins over calendar-date
    completion logic. This keeps late games live after midnight.
  */
  const resolvedStatus = resolveEventStatus(
    rawStatus,
    startTime,
    eventDate,
    cardDate,
    finalScoreAvailable
  );

  const status = mlbStatusIsExplicitlyLive(rawStatus)
    ? "live"
    : resolvedStatus;
  const gameUrl = game.game_url || `game.html?id=${encodeURIComponent(game.id)}`;
  const liveUrl = game.live_url || `live.html?id=${encodeURIComponent(game.id)}`;
  const awayPitcher = game.pitchers?.away || {};
  const homePitcher = game.pitchers?.home || {};
  const liveState = normalizeMlbLiveState(game.linescore || {});

  return {
    id: game.id,
    sportId: "baseball",
    leagueId: "mlb",
    eventDate,
    status,
    rawStatus,
    liveState,
    startTime,
    venue: game.venue?.name || "",
    away: normalizeParticipant({
      ...(game.away_team || {}),
      id: game.away_team?.team_id || game.away_team?.id,
      abbreviation: game.away_team?.abbr || game.away_team?.abbreviation,
      score: awayScore
    }, "AWAY"),
    home: normalizeParticipant({
      ...(game.home_team || {}),
      id: game.home_team?.team_id || game.home_team?.id,
      abbreviation: game.home_team?.abbr || game.home_team?.abbreviation,
      score: homeScore
    }, "HOME"),
    awayDetail: game.card?.away_detail || formatPitcherCardDetail(awayPitcher),
    homeDetail: game.card?.home_detail || formatPitcherCardDetail(homePitcher),
    cardData: {
      pitchers: game.pitchers || {},
      weather: game.weather || {},
      market: game.market || {},
      context: game.context || {},
      lineups: game.lineups || {},
      bullpens: game.bullpens || {},
      offense: game.offense || {},
      availability: game.card?.data_available || {}
    },
    gameUrl,
    liveUrl,
    breakdownUrl: game.breakdown_url || buildFinishedGameUrl({
      id: game.id,
      eventDate,
      sportId: "baseball",
      leagueId: "mlb",
      gamePk: game.mlb_game_pk || game.game_pk
    }),
    finalScoreAvailable,
    plays: cardState.playsByEventId.get(game.id) || [],
    original: game
  };
}

function normalizeGenericEvent(event, sportId, leagueId, cardDate = cardState.date) {
  const participants = event.participants || event.competitors || [];
  const awayRaw = event.away || event.away_team || participants[0] || {};
  const homeRaw = event.home || event.home_team || participants[1] || {};
  const away = normalizeParticipant(awayRaw, "A");
  const home = normalizeParticipant(homeRaw, "B");
  if (away.score === null) away.score = readGenericEventScore(event, "away");
  if (home.score === null) home.score = readGenericEventScore(event, "home");
  const id = event.id || `${leagueId}-${event.start_time || event.game_time || Date.now()}`;
  const startTime = event.start_time || event.game_time || event.date_time || event.gameDate;
  const eventDate = eventDateKey(event) || cardDate;
  const rawStatus = readStatusText(event.status || event.abstract_status);
  const finalScoreAvailable = hasFinalScore(away.score, home.score);
  const status = resolveEventStatus(rawStatus, startTime, eventDate, cardDate, finalScoreAvailable);
  const gameUrl = event.game_url || event.research_url || `game.html?id=${encodeURIComponent(id)}`;
  const liveUrl = event.live_url || `live.html?id=${encodeURIComponent(id)}`;

  return {
    id,
    sportId,
    leagueId,
    eventDate,
    status,
    rawStatus,
    startTime,
    venue: event.venue?.name || event.venue || event.location || "",
    away,
    home,
    awayDetail: event.away_detail || event.awayDetail || "",
    homeDetail: event.home_detail || event.homeDetail || "",
    cardData: {
      pitchers: event.pitchers || {},
      weather: event.weather || {},
      market: event.market || {},
      context: event.context || {},
      lineups: event.lineups || {},
      bullpens: event.bullpens || {},
      offense: event.offense || {},
      availability: event.card?.data_available || event.data_available || {}
    },
    gameUrl,
    liveUrl,
    breakdownUrl: event.breakdown_url || buildFinishedGameUrl({
      id,
      eventDate,
      sportId,
      leagueId,
      gamePk: event.game_pk || event.gamePk
    }),
    finalScoreAvailable,
    plays: cardState.playsByEventId.get(id) || [],
    original: event
  };
}

function normalizeParticipant(participant, fallback) {
  if (typeof participant === "string") {
    return { id: null, abbreviation: participant, name: participant, score: null, record: null, logoUrl: "" };
  }
  const record = participant.record || participant.league_record || participant.leagueRecord || null;
  return {
    id: participant.id || participant.team_id || null,
    abbreviation: participant.abbr || participant.abbreviation || participant.short_name || fallback,
    name: participant.name || participant.full_name || participant.abbr || fallback,
    score: participant.score ?? null,
    record: record && typeof record === "object" ? record : null,
    logoUrl: participant.logo_url || participant.logoUrl || ""
  };
}

function renderLeagueResult(panel, sportId, leagueId, result) {
  const league = getLeague(sportId, leagueId);
  const filtered = filterEvents(result.events || []);

  if (!result.available) {
    panel.innerHTML = `
      <div class="league-feed-placeholder">
        <span>FEED PENDING</span>
        <strong>${cardEscape(league?.label || leagueId)} is ready for connection.</strong>
        <p>When its feed is added, today’s games, matches or fights will populate here beside every other selected sport.</p>
      </div>`;
    return;
  }

  if (!result.events.length) {
    panel.innerHTML = `<div class="league-feed-placeholder is-empty"><span>NO EVENTS</span><strong>No ${cardEscape(league?.label || leagueId)} events are scheduled for this date.</strong></div>`;
    return;
  }

  if (!filtered.length) {
    panel.innerHTML = `<div class="league-feed-placeholder is-empty"><span>FILTERED</span><strong>No events match the active filter.</strong></div>`;
    return;
  }

  const seasonNote = sportId === "baseball" && MINOR_LEAGUE_IDS.has(leagueId) && result.seasonEventCount
    ? `<p class="minor-league-season-note">${cardEscape(String(result.seasonLoaded || cardState.date.slice(0, 4)))} season loaded · ${cardEscape(String(result.seasonEventCount))} scheduled games in archive · showing ${cardEscape(String(filtered.length))} on this date</p>`
    : "";
  panel.innerHTML = `${seasonNote}<div class="compact-event-grid">${filtered.map(event => renderCompactEventCard(event, league)).join("")}</div>`;
}

/* BORING BETS: TEAM + WEATHER CARD BORDERS V3 */

const MLB_CARD_OFFICIAL_COLORS = Object.freeze({
  ARI: ["#a71930", "#e3d4ad", "#000000"],
  AZ:  ["#a71930", "#e3d4ad", "#000000"],
  ATL: ["#ce1141", "#13274f", "#eaaa00"],
  BAL: ["#df4601", "#000000", "#ffffff"],
  BOS: ["#bd3039", "#0c2340", "#ffffff"],
  CHC: ["#0e3386", "#cc3433", "#ffffff"],
  CHW: ["#27251f", "#c4ced4", "#ffffff"],
  CWS: ["#27251f", "#c4ced4", "#ffffff"],
  CIN: ["#c6011f", "#000000", "#ffffff"],
  CLE: ["#e31937", "#0c2340", "#ffffff"],
  COL: ["#33006f", "#c4ced4", "#000000"],
  DET: ["#0c2340", "#fa4616", "#ffffff"],
  HOU: ["#002d62", "#eb6e1f", "#ffffff"],
  KC:  ["#004687", "#bd9b60", "#ffffff"],
  KCR: ["#004687", "#bd9b60", "#ffffff"],
  LAA: ["#ba0021", "#003263", "#c4ced4"],
  LAD: ["#005a9c", "#ef3e42", "#ffffff"],
  MIA: ["#00a3e0", "#ef3340", "#000000"],
  MIL: ["#12284b", "#ffc52f", "#ffffff"],
  MIN: ["#002b5c", "#d31145", "#b9975b"],
  NYM: ["#002d72", "#ff5910", "#ffffff"],
  NYY: ["#0c2340", "#c4ced4", "#ffffff"],
  ATH: ["#003831", "#efb21e", "#ffffff"],
  OAK: ["#003831", "#efb21e", "#ffffff"],
  PHI: ["#e81828", "#002d72", "#ffffff"],
  PIT: ["#27251f", "#fdb827", "#ffffff"],
  SD:  ["#2f241d", "#ffc425", "#ffffff"],
  SDP: ["#2f241d", "#ffc425", "#ffffff"],
  SF:  ["#fd5a1e", "#27251f", "#efd19f"],
  SFG: ["#fd5a1e", "#27251f", "#efd19f"],
  SEA: ["#0c2c56", "#005c5c", "#c4ced4"],
  STL: ["#c41e3a", "#0c2340", "#fedb00"],
  TB:  ["#092c5c", "#8fbce6", "#f5d130"],
  TBR: ["#092c5c", "#8fbce6", "#f5d130"],
  TEX: ["#003278", "#c0111f", "#ffffff"],
  TOR: ["#134a8e", "#e8291c", "#ffffff"],
  WSH: ["#ab0003", "#14225a", "#ffffff"],
  WSN: ["#ab0003", "#14225a", "#ffffff"]
});

function teamWeatherCardBorderAtmosphere(event) {
  const awayCode = cardAtmosphereTeamCode(event.away);
  const homeCode = cardAtmosphereTeamCode(event.home);

  const awayColors =
    MLB_CARD_OFFICIAL_COLORS[awayCode] ||
    ["#6f7f8f", "#bcc6cf", "#35404b"];

  const homeColors =
    MLB_CARD_OFFICIAL_COLORS[homeCode] ||
    ["#8293a3", "#d5dde4", "#465563"];

  const weather =
    event.cardData?.weather ||
    {};

  const condition = String(
    weather.condition ||
    weather.summary ||
    weather.description ||
    weather.weather ||
    ""
  ).toLowerCase();

  const temperature = cardAtmosphereNumber(
    weather.temperature,
    weather.temp,
    weather.temperature_f
  );

  const wind = cardAtmosphereNumber(
    weather.wind_gust,
    weather.wind_speed,
    weather.wind_mph
  ) || 0;

  const rainChance = cardAtmosphereNumber(
    weather.rain_probability,
    weather.precipitation_probability,
    weather.precip_probability
  ) || 0;

  let weatherColors = [
    "#8ba0b2",
    "#c2ccd4"
  ];

  let weatherClass = "is-weather-neutral";
  let speed = 14;

  if (
    /thunder|lightning|electrical storm/.test(condition)
  ) {
    weatherColors = [
      "#f7fbff",
      "#759dff"
    ];

    weatherClass = "is-weather-thunder";
    speed = 6;
  } else if (
    /snow|sleet|flurr/.test(condition)
  ) {
    weatherColors = [
      "#f4fbff",
      "#9edbff"
    ];

    weatherClass = "is-weather-snow";
    speed = 17;
  } else if (
    /rain|shower|drizzle|storm/.test(condition) ||
    rainChance >= 45
  ) {
    weatherColors = [
      "#5e89a5",
      "#9bb6c7"
    ];

    weatherClass = "is-weather-rain";
    speed = 10;
  } else if (
    /overcast|cloud|fog|mist|haze|smoke/.test(condition)
  ) {
    weatherColors = [
      "#737e88",
      "#adb5bc"
    ];

    weatherClass = "is-weather-gray";
    speed = 20;
  } else if (
    /clear|sunny|sun/.test(condition)
  ) {
    weatherColors = [
      "#ffd166",
      "#61c8ff"
    ];

    weatherClass = "is-weather-clear";
    speed = 13;
  }

  if (
    Number.isFinite(temperature) &&
    temperature >= 90
  ) {
    weatherColors = [
      "#ffad42",
      weatherColors[1]
    ];

    weatherClass += " is-weather-hot";
    speed = Math.min(speed, 11);
  } else if (
    Number.isFinite(temperature) &&
    temperature <= 45
  ) {
    weatherColors = [
      "#a9e0ff",
      weatherColors[1]
    ];

    weatherClass += " is-weather-cold";
  }

  if (wind >= 15) {
    weatherColors[1] = "#55d7d0";
    weatherClass += " is-weather-windy";
    speed = Math.min(speed, 9);
  }

  if (event.status === "live") {
    speed = Math.min(speed, 9);
  }

  if (event.status === "final") {
    speed = Math.max(speed, 24);
  }

  if (event.status === "postponed") {
    speed = 30;
    weatherClass += " is-weather-postponed";
  }

  return {
    classes: weatherClass,
    style: [
      `--card-away-1:${awayColors[0]}`,
      `--card-away-2:${awayColors[1]}`,
      `--card-away-3:${awayColors[2]}`,
      `--card-weather-1:${weatherColors[0]}`,
      `--card-weather-2:${weatherColors[1]}`,
      `--card-home-1:${homeColors[0]}`,
      `--card-home-2:${homeColors[1]}`,
      `--card-home-3:${homeColors[2]}`,
      `--card-border-speed:${speed}s`
    ].join(";")
  };
}

function cardAtmosphereTeamCode(participant) {
  return String(
    participant?.abbreviation ||
    participant?.abbr ||
    participant?.name ||
    ""
  )
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function cardAtmosphereNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function renderCompactEventCard(event, league) {
  const statusLabel = formatStatus(event);
  const live = event.status === "live";
  const final = event.status === "final";
  const pastCard = isPastCardDate(event.eventDate || cardState.date);
  const completed =
    final ||
    (
      pastCard &&
      event.status !== "postponed" &&
      event.status !== "live"
    );
  const primaryUrl = completed
    ? event.breakdownUrl
    : live
      ? event.liveUrl
      : event.gameUrl;

  const primaryAction = completed
    ? "Open finished-game breakdown for"
    : live
      ? "Open live center for"
      : "Open research for";

  const plays = event.plays || [];
  const scoreSyncWarning = pastCard && !event.finalScoreAvailable && event.status !== "postponed"
    ? `<p class="compact-event-venue">Final score sync required</p>`
    : "";

  const cardAtmosphere = teamWeatherCardBorderAtmosphere(event);

  return `
    <article class="compact-event-card has-card-atmosphere${live ? " is-live" : ""}${completed ? " is-final" : ""}${plays.length ? " has-play" : ""}${cardAtmosphere.classes ? ` ${cardAtmosphere.classes}` : ""}" data-event-id="${cardEscape(event.id)}" data-event-status="${cardEscape(event.status)}" data-event-date="${cardEscape(event.eventDate || cardState.date)}" style="${cardEscape(cardAtmosphere.style)}">
      <div class="compact-event-topline"><span>${cardEscape(league?.label || event.leagueId.toUpperCase())}</span><b class="compact-event-status">${cardEscape(statusLabel)}</b></div>
      ${live
        ? renderCompactLiveScoreboard(event, primaryUrl, primaryAction)
        : `
          <a class="compact-event-matchup" href="${cardEscape(primaryUrl)}" aria-label="${cardEscape(primaryAction)} ${cardEscape(event.away.name)} at ${cardEscape(event.home.name)}">
            ${renderCompactParticipant(event.away, event.sportId, completed)}
            <div class="compact-event-divider"><span>@</span><small>${cardEscape(completed ? "Final" : formatEventTime(event.startTime))}</small></div>
            ${renderCompactParticipant(event.home, event.sportId, completed)}
          </a>`}
      ${(event.awayDetail || event.homeDetail) ? `<div class="compact-event-details"><span title="${cardEscape(event.awayDetail)}">${cardEscape(event.awayDetail || "—")}</span><i>vs</i><span title="${cardEscape(event.homeDetail)}">${cardEscape(event.homeDetail || "—")}</span></div>` : ""}
      ${event.venue ? `<p class="compact-event-venue">${cardEscape(event.venue)}</p>` : ""}
      ${renderCompactGameSignals(event)}
      ${scoreSyncWarning}
      ${renderPlayChips(plays)}
      <div class="compact-event-actions">${completed
        ? `<a href="${cardEscape(event.breakdownUrl)}">Game breakdown</a><a href="${cardEscape(event.gameUrl)}" class="compact-live-link">Archived research</a>`
        : `<a href="${cardEscape(event.gameUrl)}">Research</a><a href="${cardEscape(event.liveUrl)}" class="compact-live-link">${live ? "Live now" : "Live center"}</a>`}
      </div>
    </article>`;
}

function compactLiveScoreText(value) {
  return value === null || value === undefined || value === ""
    ? "0"
    : String(value);
}

function renderCompactLiveTeamRow(
  participant,
  sportId,
  scoreChanged
) {
  const record = formatTeamRecord(participant.record);
  const secondary = [
    participant.name,
    record
  ].filter(Boolean).join(" · ");

  const score = compactLiveScoreText(participant.score);

  return `
    <div class="compact-participant approved-live-team-row">
      ${renderParticipantLogo(participant, sportId)}

      <span class="approved-live-team-identity">
        <strong>${cardEscape(participant.abbreviation)}</strong>
        <small>${cardEscape(secondary)}</small>
      </span>

      <b
        class="compact-participant-score approved-live-team-score${scoreChanged ? " is-score-changing" : ""}"
        data-score="${cardEscape(score)}"
      >${cardEscape(score)}</b>
    </div>`;
}

function renderCompactLiveScoreboard(event, primaryUrl, primaryAction) {
  const scoreChange = updateCompactLiveScoreMemory(event);

  return `
    <a class="approved-live-scoreboard" href="${cardEscape(primaryUrl)}" aria-label="${cardEscape(primaryAction)} ${cardEscape(event.away.name)} at ${cardEscape(event.home.name)}">
      <div class="approved-live-team-panel">
        ${renderCompactLiveTeamRow(event.away, event.sportId, scoreChange.awayChanged)}
        ${renderCompactLiveTeamRow(event.home, event.sportId, scoreChange.homeChanged)}
      </div>

      ${renderCompactLiveState(event, scoreChange)}
    </a>`;
}

function renderCompactParticipant(participant, sportId, showScore) {
  const record = formatTeamRecord(participant.record);
  const secondary = [participant.name, record].filter(Boolean).join(" · ");
  return `<div class="compact-participant">${renderParticipantLogo(participant, sportId)}<span><strong>${cardEscape(participant.abbreviation)}</strong><small>${cardEscape(secondary)}</small></span>${showScore && participant.score !== null ? `<b class="compact-participant-score">${cardEscape(participant.score)}</b>` : ""}</div>`;
}

function normalizeCompactVibeColor(value) {
  const text = String(value || "").trim();

  if (/^#[0-9a-f]{3,8}$/i.test(text)) {
    return text;
  }

  if (/^[0-9a-f]{6}$/i.test(text)) {
    return `#${text}`;
  }

  return "";
}

function readCompactTeamColor(team = {}) {
  return normalizeCompactVibeColor(firstDefined(
    team.primary_color,
    team.primaryColor,
    team.team_color,
    team.teamColor,
    team.color,
    team.colors?.primary,
    team.brand?.primary
  ));
}

function compactLiveVibeStyle(event) {
  const context = event.cardData?.context || {};
  const original = event.original || {};

  const explicitVibe = normalizeCompactVibeColor(firstDefined(
    context.vibe_color,
    context.vibeColor,
    context.atmosphere_color,
    context.atmosphereColor,
    original.vibe_color,
    original.vibeColor,
    original.atmosphere_color,
    original.atmosphereColor,
    original.atmosphere?.color,
    original.card?.vibe_color
  ));

  const awayColor = readCompactTeamColor(
    original.away_team || event.away || {}
  );

  const homeColor = readCompactTeamColor(
    original.home_team || event.home || {}
  );

  const firstColor =
    explicitVibe ||
    awayColor ||
    homeColor ||
    "#5aa7ff";

  const secondColor =
    explicitVibe ||
    homeColor ||
    awayColor ||
    "#9674ff";

  return [
    `--compact-live-vibe-a:${firstColor}`,
    `--compact-live-vibe-b:${secondColor}`
  ].join(";");
}

function readCompactScoreNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getCompactLiveScoreMemory() {
  if (!cardState.compactLiveScoreMemory) {
    cardState.compactLiveScoreMemory = new Map();
  }

  return cardState.compactLiveScoreMemory;
}

function updateCompactLiveScoreMemory(event) {
  const memory = getCompactLiveScoreMemory();
  const key = String(event.id || "");

  const away = readCompactScoreNumber(event.away?.score);
  const home = readCompactScoreNumber(event.home?.score);
  const previous = memory.get(key) || null;
  const now = Date.now();

  let changedSide = "";
  let runDelta = 0;
  let changedAt = previous?.changedAt || 0;

  if (previous) {
    if (
      away !== null &&
      previous.away !== null &&
      away > previous.away
    ) {
      changedSide = "away";
      runDelta = away - previous.away;
      changedAt = now;
    } else if (
      home !== null &&
      previous.home !== null &&
      home > previous.home
    ) {
      changedSide = "home";
      runDelta = home - previous.home;
      changedAt = now;
    }
  }

  const next = {
    away,
    home,
    changedSide: changedSide || previous?.changedSide || "",
    runDelta: changedSide ? runDelta : previous?.runDelta || 0,
    changedAt
  };

  memory.set(key, next);

  const recentlyChanged =
    Boolean(next.changedAt) &&
    Boolean(next.changedSide) &&
    now - next.changedAt < 2400;

  return {
    awayChanged: recentlyChanged && next.changedSide === "away",
    homeChanged: recentlyChanged && next.changedSide === "home",
    showRunBadge: recentlyChanged && next.runDelta > 0,
    runDelta: recentlyChanged ? next.runDelta : 0
  };
}

function compactOrdinalInning(value) {
  const inning = Number(value);
  if (!Number.isFinite(inning)) return "";

  const rounded = Math.max(1, Math.round(inning));
  const remainder100 = rounded % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${rounded}th`;
  }

  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

function renderLiveIndicatorPips(value, total, shape, activeClass) {
  const numeric = Number(value);
  const count = Number.isFinite(numeric) ? Math.max(0, Math.min(total, Math.floor(numeric))) : 0;

  return Array.from({ length: total }, (_, index) => {
    const active = index < count ? ` ${activeClass}` : "";
    return `<span class="compact-live-pip compact-live-pip-${shape}${active}"></span>`;
  }).join("");
}

function renderCompactLiveState(event, suppliedScoreChange = null) {
  if (
    event.status !== "live" ||
    event.sportId !== "baseball" ||
    event.leagueId !== "mlb"
  ) {
    return "";
  }

  const state = event.liveState || {};
  const bases = state.bases || {};
  const scoreChange =
    suppliedScoreChange ||
    updateCompactLiveScoreMemory(event);

  const inning = Number(state.currentInning);
  const inningText = Number.isFinite(inning)
    ? String(Math.max(1, Math.round(inning)))
    : String(state.currentInningOrdinal || "").replace(/\D/g, "") || "–";

  const half = String(state.inningHalf || "").toLowerCase();
  const inningState = String(state.inningState || "").toLowerCase();

  let inningMarker = "◆";

  if (half === "top" || inningState.includes("top")) {
    inningMarker = "▲";
  } else if (half === "bottom" || inningState.includes("bottom")) {
    inningMarker = "▼";
  } else if (half === "middle" || inningState.includes("middle")) {
    inningMarker = "MID";
  } else if (half === "end" || inningState.includes("end")) {
    inningMarker = "END";
  }

  const occupied = value => value ? " is-occupied" : "";
  const balls = Number.isFinite(Number(state.balls)) ? Number(state.balls) : 0;
  const strikes = Number.isFinite(Number(state.strikes)) ? Number(state.strikes) : 0;
  const outs = Number.isFinite(Number(state.outs)) ? Number(state.outs) : 0;
  const countLabel = `${balls}-${strikes}`;

  const runBase = scoreChange.showRunBadge
    ? `<span class="compact-base compact-base-home is-run-badge"><em>${cardEscape(String(scoreChange.runDelta))}</em></span>`
    : `<span class="compact-base compact-base-home is-home-hidden"></span>`;

  return `
    <section class="compact-live-state approved-live-state" aria-label="${cardEscape(`${inningMarker} ${inningText}, ${balls} balls, ${strikes} strikes, ${outs} outs`)}">
      <div class="compact-live-situation">
        <div class="compact-live-inning">
          <span class="approved-live-inning-marker">${cardEscape(inningMarker)}</span>
          <strong>${cardEscape(inningText)}</strong>
        </div>

        <div class="compact-live-bases">
          <div class="compact-base-diamond is-standard" aria-hidden="true">
            <span class="compact-base compact-base-second${occupied(bases.second)}"></span>
            <span class="compact-base compact-base-third${occupied(bases.third)}"></span>
            <span class="compact-base compact-base-first${occupied(bases.first)}"></span>
            ${runBase}
          </div>
        </div>

        <div class="compact-live-count-stack" aria-label="${cardEscape(`${countLabel}, ${outs} outs`)}">
          <strong class="compact-live-count-number">${cardEscape(countLabel)}</strong>

          <div class="compact-live-outs" aria-hidden="true">
            ${renderLiveIndicatorPips(outs, 2, "circle", "is-out-active")}
          </div>
        </div>
      </div>
    </section>`;
}

function renderCompactGameSignals(event) {
  if (event.sportId !== "baseball" || event.leagueId !== "mlb") return "";
  const data = event.cardData || {};
  const signals = [
    ["Weather", formatWeatherSignal(data.weather)],
    ["Market", formatMarketSignal(data.market, event)],
    ["Matchup", formatContextSignal(data.context)],
    ["Lineups", formatLineupSignal(data.lineups)],
    ["Offense", formatOffenseSignal(data.offense, event)],
    ["Bullpens", formatBullpenSignal(data.bullpens, event)]
  ];

  return `<div class="compact-event-signal-grid">${signals.map(([label, value]) => `
    <div class="compact-event-signal${String(value).toLowerCase().includes("pending") ? " is-pending" : ""}">
      <span>${cardEscape(label)}</span>
      <strong title="${cardEscape(value)}">${cardEscape(value)}</strong>
    </div>`).join("")}
  </div>`;
}

function formatTeamRecord(record) {
  if (!record || typeof record !== "object") return "";
  const wins = record.wins;
  const losses = record.losses;
  return wins !== null && wins !== undefined && losses !== null && losses !== undefined
    ? `${wins}-${losses}`
    : "";
}

function formatPitcherCardDetail(pitcher = {}) {
  const name = pitcher.name || "Starter TBD";
  const throws = pitcher.throws || "";
  const era = readPitcherCardStat(pitcher, "era");
  const pieces = [name];
  if (throws) pieces.push(String(throws));
  if (era !== null) pieces.push(`${era.toFixed(2)} ERA`);
  return pieces.join(" · ");
}

function readPitcherCardStat(pitcher, metric) {
  const candidates = [
    pitcher?.last_30?.[metric],
    pitcher?.stats?.last_30?.all?.[metric],
    pitcher?.season?.[metric],
    pitcher?.stats?.season?.all?.[metric]
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function formatWeatherSignal(weather = {}) {
  const condition = weather.condition || "";
  const temperature = finiteNumber(weather.temperature);
  const wind = finiteNumber(weather.wind_speed);
  const direction = weather.wind_direction || "";
  const rain = finiteNumber(weather.rain_probability);
  if (!condition && temperature === null && wind === null && rain === null) return "Weather pending";
  const pieces = [];
  if (temperature !== null) pieces.push(`${Math.round(temperature)}°`);
  if (condition) pieces.push(condition);
  if (wind !== null) pieces.push(`${direction ? `${direction} ` : ""}${Math.round(wind)} mph`);
  if (rain !== null && rain >= 20) pieces.push(`${Math.round(rain)}% rain`);
  return pieces.join(" · ") || "Weather pending";
}

function formatMarketSignal(market = {}, event) {
  const moneyline = market.moneyline || {};
  const best = moneyline.best || {};
  const consensus = moneyline.consensus || {};
  const awayPrice = firstDefined(
    market.away_moneyline,
    best.away?.price,
    consensus.away
  );
  const homePrice = firstDefined(
    market.home_moneyline,
    best.home?.price,
    consensus.home
  );
  const totalRow = Array.isArray(market.total?.books) ? market.total.books.find(Boolean) : null;
  const total = firstDefined(
    typeof market.total === "number" ? market.total : null,
    typeof market.total === "string" ? market.total : null,
    totalRow?.over?.point,
    totalRow?.under?.point
  );
  if (awayPrice === null && homePrice === null && total === null) return "Odds pending";
  const pieces = [];
  if (awayPrice !== null) pieces.push(`${event.away.abbreviation} ${formatAmericanOdds(awayPrice)}`);
  if (homePrice !== null) pieces.push(`${event.home.abbreviation} ${formatAmericanOdds(homePrice)}`);
  if (total !== null) pieces.push(`T ${formatLineNumber(total)}`);
  return pieces.join(" · ");
}

function formatContextSignal(context = {}) {
  const score = finiteNumber(context.score);
  const label = context.label || "";
  if (score === null && !label) return "Model pending";
  return [label, score !== null ? Math.round(score) : ""].filter(value => value !== "").join(" · ");
}

function formatLineupSignal(lineups = {}) {
  const away = lineupStatusLabel(lineups.away);
  const home = lineupStatusLabel(lineups.home);
  if (!away && !home) return "Lineups pending";
  return `${away || "Pending"} / ${home || "Pending"}`;
}

function formatOffenseSignal(offense = {}, event) {
  const away = readOffenseCardSignal(offense.away);
  const home = readOffenseCardSignal(offense.home);
  if (!away && !home) return "Offense pending";
  return `${event.away.abbreviation} ${away || "—"} · ${event.home.abbreviation} ${home || "—"}`;
}

function readOffenseCardSignal(teamOffense = {}) {
  const compactRank = firstDefined(teamOffense.wrc_plus_rank, teamOffense.ops_rank);
  const compactValue = firstDefined(teamOffense.wrc_plus, teamOffense.ops);
  const all = teamOffense?.stats?.last_30?.all || {};
  const wrc = all["wRC+"] || {};
  const ops = all.OPS || {};
  const rank = firstDefined(compactRank, wrc.vs_hand_rank, wrc.overall_rank, ops.vs_hand_rank, ops.overall_rank);
  const value = firstDefined(compactValue, wrc.vs_hand, wrc.overall, ops.vs_hand, ops.overall);
  if (rank !== null) return `rank ${Math.round(Number(rank))}`;
  const number = finiteNumber(value);
  if (number === null) return "";
  return number > 2 ? `${Math.round(number)} wRC+` : `${number.toFixed(3)} OPS`;
}

function formatBullpenSignal(bullpens = {}, event) {
  const away = readBullpenCardSignal(bullpens.away);
  const home = readBullpenCardSignal(bullpens.home);
  if (!away && !home) return "Bullpen pending";
  return `${event.away.abbreviation} ${away || "—"} · ${event.home.abbreviation} ${home || "—"}`;
}

function readBullpenCardSignal(bullpen = {}) {
  const all = bullpen?.stats?.last_30?.all || {};
  const era = finiteNumber(firstDefined(bullpen.era, all.era));
  const rank = finiteNumber(firstDefined(bullpen.era_rank, all?.ranks?.era));
  if (era !== null && rank !== null) return `${era.toFixed(2)} · rank ${Math.round(rank)}`;
  if (era !== null) return `${era.toFixed(2)} ERA`;
  if (rank !== null) return `rank ${Math.round(rank)}`;
  return "";
}

function lineupStatusLabel(lineup) {
  if (!lineup || typeof lineup !== "object") return "";
  const value = String(lineup.status_label || lineup.status || "").toLowerCase();
  if (value.includes("confirm")) return "Confirmed";
  if (value.includes("project")) return "Projected";
  if (value.includes("official")) return "Official";
  return value ? value.replace(/(^|\s)\S/g, character => character.toUpperCase()) : "";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function formatAmericanOdds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value || "—");
  return number > 0 ? `+${Math.round(number)}` : `${Math.round(number)}`;
}

function formatLineNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value || "—");
  return Number.isInteger(number) ? `${number}` : number.toFixed(1);
}

function renderParticipantLogo(participant, sportId) {
  const teamId = Number(participant.id);
  if (sportId === "baseball" && Number.isFinite(teamId) && teamId > 0) {
    const abbreviation = String(participant.abbreviation || "BB").slice(0, 3).toUpperCase();
    const suppliedLogo = participant.logoUrl || participant.logo_url || "";
    const primaryLogo = suppliedLogo || `${BASEBALL_LOGO_BASE}/${teamId}.svg`;
    return `<img
      src="${cardEscape(primaryLogo)}"
      alt="${cardEscape(abbreviation)} logo"
      loading="lazy"
      decoding="async"
      data-baseball-team-logo
      data-team-id="${teamId}"
      data-team-abbreviation="${cardEscape(abbreviation)}"
      data-logo-stage="${suppliedLogo ? "supplied" : "primary"}"
    >`;
  }
  return renderGenericParticipantLogo(participant.abbreviation);
}

function advanceBaseballTeamLogo(image) {
  const teamId = Number(image.dataset.teamId);
  const stage = image.dataset.logoStage || "primary";

  if (Number.isFinite(teamId) && stage === "supplied") {
    image.dataset.logoStage = "primary";
    image.src = `${BASEBALL_LOGO_BASE}/${teamId}.svg`;
    return;
  }

  if (Number.isFinite(teamId) && stage === "primary") {
    image.dataset.logoStage = "cap";
    image.src = `${MLB_CAP_LOGO_BASE}/${teamId}.svg`;
    return;
  }

  const fallback = document.createElement("span");
  fallback.className = "compact-generic-logo";
  fallback.setAttribute("aria-label", `${image.dataset.teamAbbreviation || "Team"} logo unavailable`);
  fallback.textContent = String(image.dataset.teamAbbreviation || "BB").slice(0, 2);
  image.replaceWith(fallback);
}

function renderGenericParticipantLogo(abbreviation) {
  return `<span class="compact-generic-logo">${cardEscape(String(abbreviation || "BB").slice(0, 2))}</span>`;
}

function renderPlayChips(plays) {
  if (!plays.length) return `<div class="compact-no-play">No published play</div>`;
  return `<div class="compact-play-list">${plays.slice(0, 2).map(play => `<a href="play.html?id=${encodeURIComponent(play.id)}" title="${cardEscape(play.play)}"><span>${play.is_best_bet ? "BEST" : "PLAY"}</span><strong>${cardEscape(play.play)}</strong><small>${cardEscape(play.odds || "")}${play.units !== undefined ? ` · ${Number(play.units).toFixed(2)}u` : ""}</small></a>`).join("")}${plays.length > 2 ? `<span class="compact-more-plays">+${plays.length - 2} more</span>` : ""}</div>`;
}

function filterEvents(events) {
  switch (cardState.statusFilter) {
    case "live": return events.filter(event => event.status === "live");
    case "upcoming": return events.filter(event => event.status === "upcoming");
    case "final": return events.filter(event => event.status === "final");
    case "plays": return events.filter(event => (event.plays || []).length > 0);
    default: return events;
  }
}

function rerenderLoadedLeagueCards() {
  document.querySelectorAll("[data-sport-id][data-league-panel]").forEach(panel => {
    const sportId = panel.dataset.sportId;
    const leagueId = panel.dataset.leaguePanel;
    const result = cardState.leagueCache.get(leagueCacheKey(sportId, leagueId, cardState.date));
    if (result) renderLeagueResult(panel, sportId, leagueId, result);
  });
}

function updateSummary() {
  const selected = cardState.selectedSportIds;
  const loadedResults = [...cardState.leagueCache.entries()]
    .filter(([key]) => {
      const [sportId, , date] = key.split("|");
      return selected.has(sportId) && date === cardState.date;
    })
    .map(([, result]) => result)
    .filter(result => result.available);

  const events = loadedResults.flatMap(result => result.events || []);
  const uniqueEvents = [...new Map(events.map(event => [`${event.sportId}|${event.leagueId}|${event.id}`, event])).values()];
  setText("totalGames", uniqueEvents.length);
  setText("totalLive", uniqueEvents.filter(event => event.status === "live").length);
  setText("totalPlays", cardState.plays.length);
  setText("activeLeagues", loadedResults.filter(result => (result.events || []).length).length);
}

function updateSportCounts() {
  (cardState.config?.sports || []).forEach(sport => {
    const count = [...cardState.leagueCache.entries()]
      .filter(([key]) => key.startsWith(`${sport.id}|`) && key.endsWith(`|${cardState.date}`))
      .reduce((sum, [, result]) => sum + (result.events?.length || 0), 0);
    const target = document.querySelector(`[data-sport-count="${cssEscape(sport.id)}"]`);
    if (target) target.textContent = `${count || "—"} events`;
  });
}

function updateLeagueCount(sportId, leagueId, count, available) {
  const target = document.querySelector(`[data-count-sport="${cssEscape(sportId)}"][data-league-count="${cssEscape(leagueId)}"]`);
  if (target) target.textContent = available ? String(count) : "—";
}

function groupPlaysByEventId(plays) {
  const map = new Map();
  plays.forEach(play => {
    const id = play.game_id || [play.date, play.away_team, play.home_team].filter(Boolean).join("-").toLowerCase();
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(play);
  });
  return map;
}

function readTeamScore(game, side) {
  return game?.score?.[side]
    ?? game?.scores?.[side]
    ?? game?.linescore?.totals?.[side]?.runs
    ?? game?.linescore?.teams?.[side]?.runs
    ?? game?.live_state?.score?.[side]
    ?? null;
}

function readGenericEventScore(event, side) {
  return event?.score?.[side]
    ?? event?.scores?.[side]
    ?? event?.linescore?.totals?.[side]?.runs
    ?? event?.linescore?.teams?.[side]?.runs
    ?? null;
}

function readStatusText(status) {
  if (status && typeof status === "object") {
    return status.detailedState || status.abstractGameState || status.status || status.code || "Scheduled";
  }
  return String(status || "Scheduled");
}

function normalizeStatus(status) {
  const value = readStatusText(status).trim().toLowerCase();

  // Check pregame phrases before live phrases: "Not Started" must never be
  // classified as live just because it contains the word "started".
  if ([
    "scheduled",
    "not started",
    "pre-game",
    "pregame",
    "preview",
    "warmup",
    "delayed start",
    "tbd"
  ].some(token => value === token || value.includes(token))) return "upcoming";

  if ([
    "final",
    "completed",
    "complete",
    "game over",
    "completed early"
  ].some(token => value === token || value.includes(token))) return "final";

  if ([
    "live",
    "in progress",
    "in_progress",
    "game started",
    "warmup",
    "manager challenge",
    "review"
  ].some(token => value === token || value.includes(token))) return "live";

  return "upcoming";
}

function resolveEventStatus(rawStatus, startTime, eventDate, cardDate, finalScoreAvailable = false) {
  const normalized = normalizeStatus(rawStatus);
  const rawValue = readStatusText(rawStatus).trim().toLowerCase();
  const now = new Date();
  const today = getLocalDateString(now);
  const start = startTime ? new Date(startTime) : null;
  const hasValidStart = start && !Number.isNaN(start.getTime());

  if (["postponed", "cancelled", "canceled", "suspended"].some(token => rawValue.includes(token))) {
    return "postponed";
  }

  // Future cards are always pregame, even when a stale season archive carries
  // an old FINAL or LIVE label.
  if (cardDate > today) return "upcoming";

  // A game whose scheduled first pitch is still in the future cannot be live
  // or final. This is the critical same-day stale-status guard.
  if (hasValidStart && start.getTime() > now.getTime()) return "upcoming";

  // A mismatched record is filtered before normalization, but keep this final
  // guard here so a malformed feed cannot label another date as completed.
  if (eventDate && cardDate && eventDate !== cardDate) return "upcoming";

  // On past cards a verified away/home score is stronger evidence than a stale
  // schedule label. This lets archived cards consistently display FINAL and the
  // score after the result-sync command has updated the local shard.
  if (cardDate < today && finalScoreAvailable) return "final";

  return normalized;
}

function formatStatus(event) {
  if (event.status === "live") return "LIVE";
  if (event.status === "final") return "FINAL";
  if (event.status === "postponed") return "POSTPONED";
  if (isPastCardDate(event.eventDate || cardState.date)) return "FINAL · SCORE PENDING";
  return formatEventTime(event.startTime);
}

function hasFinalScore(awayScore, homeScore) {
  return awayScore !== null && awayScore !== undefined && awayScore !== "" &&
    homeScore !== null && homeScore !== undefined && homeScore !== "";
}

function isPastCardDate(dateString) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateString || "")) &&
    String(dateString) < getLocalDateString(new Date());
}

function buildFinishedGameUrl({ id, eventDate, sportId, leagueId, gamePk }) {
  const params = new URLSearchParams();
  params.set("id", String(id || ""));
  params.set("date", String(eventDate || cardState.date));
  params.set("sport", String(sportId || ""));
  params.set("league", String(leagueId || ""));
  if (gamePk !== null && gamePk !== undefined && gamePk !== "") {
    params.set("gamePk", String(gamePk));
  }
  return `finished-game.html?${params.toString()}`;
}

function formatEventTime(value) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatCardDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function getSelectedDate() {
  const requested = new URLSearchParams(window.location.search).get("date");
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  return getLocalDateString(new Date());
}

function getRequestedFilter() {
  const requested = new URLSearchParams(window.location.search).get("filter");
  return ["all", "live", "upcoming", "final", "plays"].includes(requested) ? requested : "all";
}

function navigateToCardDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
  cardState.date = date;
  cardState.latestFeedUpdate = null;
  cardState.leagueCache.clear();
  history.pushState({}, "", buildCardUrl());
  initialiseTodaysCard({ preserveCache: false }).then(scheduleCardAutoRefresh);
}

function syncUrl() {
  history.replaceState({}, "", buildCardUrl());
}

function buildCardUrl() {
  const params = new URLSearchParams();
  params.set("date", cardState.date);
  params.set("sports", [...cardState.selectedSportIds].join(","));
  if (cardState.statusFilter !== "all") params.set("filter", cardState.statusFilter);
  return `todays-card.html?${params.toString()}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSport(id) {
  return cardState.config?.sports?.find(sport => sport.id === id) || null;
}

function getLeague(sportId, leagueId) {
  return getSport(sportId)?.leagues?.find(league => league.id === leagueId) || null;
}

function leagueCacheKey(sportId, leagueId, date) {
  return `${sportId}|${leagueId}|${date}`;
}

function sortEvents(a, b) {
  return new Date(a.startTime || 0) - new Date(b.startTime || 0);
}

function recordFeedUpdate(value) {
  if (!value) return;
  cardState.latestFeedUpdate = newestFeedTimestamp(cardState.latestFeedUpdate, value);
  renderFeedUpdateLabel();
}

function newestFeedTimestamp(...values) {
  const valid = values
    .filter(Boolean)
    .map(value => ({ value, time: new Date(value).getTime() }))
    .filter(item => Number.isFinite(item.time));
  if (!valid.length) return values.find(Boolean) || null;
  valid.sort((a, b) => b.time - a.time);
  return valid[0].value;
}

function scheduleCardAutoRefresh() {
  if (cardState.refreshTimer) window.clearTimeout(cardState.refreshTimer);
  const today = getLocalDateString(new Date());
  const delay = cardState.date === today ? 300_000 : 300_000;
  cardState.refreshTimer = window.setTimeout(async () => {
    await refreshOpenLeagueFeeds();
    scheduleCardAutoRefresh();
  }, delay);
}

async function refreshOpenLeagueFeeds() {
  if (document.hidden || cardState.refreshInFlight) return;
  cardState.refreshInFlight = true;
  const generation = ++cardState.renderGeneration;
  const activeDate = cardState.date;
  try {
    [...cardState.leagueCache.keys()]
      .filter(key => key.endsWith(`|${activeDate}`))
      .forEach(key => cardState.leagueCache.delete(key));
    await loadAllOpenLeagues(generation);
    if (generation === cardState.renderGeneration && activeDate === cardState.date) {
      updateSummary();
      renderFeedUpdateLabel();
    }
  } catch (error) {
    console.warn("Today’s Card background refresh failed; keeping the last good board.", error);
  } finally {
    cardState.refreshInFlight = false;
  }
}


/* BORING BETS: MLB LIVE POLLING ENGINE V1 */

function scheduleMlbLivePoll(delay = null) {
  if (cardState.mlbLiveTimer) {
    window.clearTimeout(cardState.mlbLiveTimer);
  }

  const today = getLocalDateString(new Date());

  /*
    Today's card always polls rapidly. A past card continues polling
    rapidly only while its feed still contains an unfinished live game.
    This preserves late-night games after midnight without hammering
    every historical card.
  */
  const defaultDelay =
    cardState.date === today ||
    cardState.mlbLiveHasOpenGames === true
      ? 2_500
      : 300_000;

  cardState.mlbLiveTimer = window.setTimeout(
    pollMlbLiveState,
    delay === null ? defaultDelay : Math.max(100, delay)
  );
}

function mlbEventIdAliases(value) {
  const id = String(value || "").trim();
  if (!id) return [];

  return [...new Set([
    id,
    id.replace(/(^|-)ari(?=-|$)/gi, "$1az"),
    id.replace(/(^|-)az(?=-|$)/gi, "$1ari")
  ])];
}

function findMlbCardArticle(event) {
  const gamePk =
    event?.mlb_game_pk ||
    event?.game_pk ||
    event?.gamePk ||
    null;

  if (gamePk !== null && gamePk !== undefined && gamePk !== "") {
    const escapedPk = cssEscape(String(gamePk));
    const gamePkSelectors = [
      `[data-game-pk="${escapedPk}"]`,
      `[data-mlb-game-pk="${escapedPk}"]`,
      `[data-mlb-pk="${escapedPk}"]`
    ];

    for (const selector of gamePkSelectors) {
      const article = document.querySelector(selector);
      if (article) return article;
    }
  }

  for (const id of mlbEventIdAliases(event?.id)) {
    const article = document.querySelector(
      `[data-event-id="${cssEscape(id)}"]`
    );
    if (article) return article;
  }

  return null;
}

function mlbLiveRenderSignature(event) {
  return JSON.stringify([
    event?.status || null,
    event?.abstractStatus || event?.abstract_status || null,
    event?.score || null,
    event?.scores || null,
    event?.away?.score ?? null,
    event?.home?.score ?? null,
    event?.liveState || event?.live_state || null,
    event?.linescore || null
  ]);
}

async function pollMlbLiveState() {
  if (document.hidden || cardState.mlbLiveInFlight) {
    scheduleMlbLivePoll();
    return;
  }

  const activeDate = cardState.date;

  /*
    Do not stop polling solely because midnight passed. The selected
    date may still contain a legitimate unfinished late-night game.
  */
  cardState.mlbLiveInFlight = true;

  try {
    const path = `data/live-games/${encodeURIComponent(activeDate)}.json`;
    const documentValue = await fetchOptionalDocument(path);

    if (
      !documentValue ||
      activeDate !== cardState.date ||
      !documentMatchesCardDate(documentValue, activeDate)
    ) {
      return;
    }

    const updatedAt = documentValue.updated_at || null;
    if (updatedAt && updatedAt === cardState.mlbLiveUpdatedAt) {
      return;
    }

    const rawGames = (documentValue.games || []).filter(
      game => game && typeof game === "object"
    );

    const normalizedEvents = rawGames
      .map(game => normalizeMlbEvent(game, activeDate))
      .sort(sortEvents);

    cardState.mlbLiveHasOpenGames =
      normalizedEvents.some(
        event => event.status === "live"
      );

    normalizedEvents.forEach(event => {
      const article = findMlbCardArticle(event);

      /*
        A missing card may simply be excluded by the current filter.
        Never rebuild the whole MLB panel from the rapid pitch poll.
        The slower safety refresh handles newly added games.
      */
      if (!article) return;

      const renderedState = mlbCardStatusFamily(
        article.dataset.eventStatus
      );

      const nextState = mlbCardStatusFamily(
        event.status
      );

      const nextSignature = mlbLiveRenderSignature(event);

      /*
        Replace only this individual card when its broad state changes:
        upcoming -> live, live -> final, postponed, etc.
      */
      if (
        renderedState !== nextState ||
        article.dataset.mlbLiveSignature !== nextSignature
      ) {
        replaceMlbCardInPlace(article, event);

        const replacementArticle = findMlbCardArticle(event);
        if (replacementArticle) {
          replacementArticle.dataset.mlbLiveSignature = nextSignature;
        }
        return;
      }

      article.dataset.eventStatus = String(event.status || "");
      applyMlbLiveEventToCard(event);
    });

    cardState.mlbLiveUpdatedAt = updatedAt;
    recordFeedUpdate(updatedAt);
  } catch (error) {
    console.warn(
      "MLB rapid live-state poll failed; keeping the last good state.",
      error
    );
  } finally {
    cardState.mlbLiveInFlight = false;
    scheduleMlbLivePoll();
  }
}

function mlbCardStatusFamily(value) {
  const status = String(value || "").toLowerCase();

  if (
    status.includes("postpon") ||
    status.includes("cancel")
  ) {
    return "postponed";
  }

  if (
    status.includes("final") ||
    status.includes("completed") ||
    status.includes("game over")
  ) {
    return "final";
  }

  if (
    status.includes("live") ||
    status.includes("in progress") ||
    status.includes("warmup") ||
    status.includes("challenge") ||
    status.includes("review")
  ) {
    return "live";
  }

  return "upcoming";
}

function replaceMlbCardInPlace(article, event) {
  const league = getLeague("baseball", "mlb");
  const template = document.createElement("template");

  template.innerHTML = renderCompactEventCard(event, league).trim();

  const replacement = template.content.firstElementChild;
  if (!replacement) return;

  article.replaceWith(replacement);
}

function mlbLiveStructuralSignature(game) {
  const pitchers = game?.pitchers || {};

  const compactPitcher = value => ({
    id: value?.id ?? null,
    name: value?.name || value?.fullName || "",
    status: value?.status || ""
  });

  return JSON.stringify({
    status: game?.status || "",
    abstractStatus: game?.abstract_status || "",
    gameTime: game?.game_time || "",
    awayPitcher: compactPitcher(pitchers.away),
    homePitcher: compactPitcher(pitchers.home)
  });
}

async function refreshMlbPanelSilently(activeDate) {
  const panel = document.querySelector(
    '[data-sport-id="baseball"][data-league-panel="mlb"]'
  );

  if (!panel) return;

  const result = await loadMlbEvents(activeDate);

  if (activeDate !== cardState.date) return;

  cardState.leagueCache.set(
    leagueCacheKey("baseball", "mlb", activeDate),
    result
  );

  recordFeedUpdate(result.updatedAt);
  renderLeagueResult(panel, "baseball", "mlb", result);
  updateLeagueCount("baseball", "mlb", result.events.length, result.available);
  updateSportCounts();
  updateSummary();
}

function applyMlbLiveEventToCard(event) {
  const article = document.querySelector(
    `[data-event-id="${cssEscape(event.id)}"]`
  );

  if (!article || event.status !== "live") return;

  const scoreNodes = article.querySelectorAll(
    ".approved-live-team-score"
  );

  const nextAway = liveInteger(event.away?.score);
  const nextHome = liveInteger(event.home?.score);
  const previous = cardState.mlbLiveScores.get(event.id);

  if (scoreNodes.length >= 2) {
    patchLiveScoreNode(scoreNodes[0], nextAway, previous?.away);
    patchLiveScoreNode(scoreNodes[1], nextHome, previous?.home);
  }

  if (
    previous &&
    nextAway !== null &&
    nextHome !== null &&
    previous.away !== null &&
    previous.home !== null
  ) {
    const runDelta =
      Math.max(0, nextAway - previous.away) +
      Math.max(0, nextHome - previous.home);

    if (runDelta > 0) {
      showLiveRunBadge(article, event.id, runDelta);
    }
  }

  cardState.mlbLiveScores.set(event.id, {
    away: nextAway,
    home: nextHome
  });

  patchLiveSituation(article, event.liveState || {});
  patchMlbLiveDetails(article, event);
}

function patchMlbLiveDetails(article, event) {
  const detailNodes = article.querySelectorAll(
    ".compact-event-details span"
  );

  const details = [
    event.awayDetail || "",
    event.homeDetail || ""
  ];

  detailNodes.forEach((node, index) => {
    const value = details[index] || "—";

    if (node.textContent !== value) {
      node.textContent = value;
      node.title = value;
    }
  });

  const venueNode = article.querySelector(".compact-event-venue");
  if (venueNode && event.venue && venueNode.textContent !== event.venue) {
    venueNode.textContent = event.venue;
  }
}

function liveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function patchLiveScoreNode(node, nextValue, previousValue) {
  if (!node || nextValue === null) return;

  const text = String(nextValue);
  const changed =
    previousValue !== undefined &&
    previousValue !== null &&
    previousValue !== nextValue;

  node.textContent = text;
  node.dataset.score = text;

  if (!changed) return;

  node.classList.remove("is-score-changing");
  void node.offsetWidth;
  node.classList.add("is-score-changing");

  window.setTimeout(() => {
    node.classList.remove("is-score-changing");
  }, 1_500);
}

function showLiveRunBadge(article, eventId, runDelta) {
  const home = article.querySelector(".compact-base-home");
  if (!home) return;

  home.classList.remove("is-home-hidden");
  home.classList.add("is-run-badge");
  home.innerHTML = `<em>${cardEscape(String(runDelta))}</em>`;

  const priorTimer = cardState.mlbRunBadgeTimers.get(eventId);
  if (priorTimer) window.clearTimeout(priorTimer);

  const timer = window.setTimeout(() => {
    home.classList.remove("is-run-badge");
    home.classList.add("is-home-hidden");
    home.innerHTML = "";
    cardState.mlbRunBadgeTimers.delete(eventId);
  }, 2_000);

  cardState.mlbRunBadgeTimers.set(eventId, timer);
}

function patchLiveSituation(article, state) {
  const inning = Number(state.currentInning);
  const inningText = Number.isFinite(inning)
    ? String(Math.max(1, Math.round(inning)))
    : String(state.currentInningOrdinal || "").replace(/\D/g, "") || "–";

  const half = String(state.inningHalf || "").toLowerCase();
  const inningState = String(state.inningState || "").toLowerCase();

  let marker = "◆";
  if (half === "top" || inningState.includes("top")) marker = "▲";
  else if (half === "bottom" || inningState.includes("bottom")) marker = "▼";
  else if (half === "middle" || inningState.includes("middle")) marker = "MID";
  else if (half === "end" || inningState.includes("end")) marker = "END";

  const markerNode = article.querySelector(
    ".approved-live-inning-marker"
  );
  const inningNode = article.querySelector(
    ".compact-live-inning strong"
  );

  if (markerNode) markerNode.textContent = marker;
  if (inningNode) inningNode.textContent = inningText;

  const bases = state.bases || {};
  patchBase(
    article.querySelector(".compact-base-first"),
    Boolean(bases.first)
  );
  patchBase(
    article.querySelector(".compact-base-second"),
    Boolean(bases.second)
  );
  patchBase(
    article.querySelector(".compact-base-third"),
    Boolean(bases.third)
  );

  const balls = liveInteger(state.balls) ?? 0;
  const strikes = liveInteger(state.strikes) ?? 0;
  const outs = Math.max(0, Math.min(2, liveInteger(state.outs) ?? 0));

  const countNode = article.querySelector(
    ".compact-live-count-number"
  );
  if (countNode) countNode.textContent = `${balls}-${strikes}`;

  const outsNode = article.querySelector(".compact-live-outs");
  if (outsNode) {
    outsNode.innerHTML = renderLiveIndicatorPips(
      outs,
      2,
      "circle",
      "is-out-active"
    );
  }
}

function patchBase(node, occupied) {
  if (!node) return;
  node.classList.toggle("is-occupied", occupied);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${path}.`);
  return response.json();
}

async function fetchOptionalJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}


/* TODAY_CARD_SUMMARY_SCALE
   The four headline totals share one relative scale:
   0 = red, half of the current maximum = gray,
   current maximum = green.
*/
const TODAY_CARD_SCALED_SUMMARIES = [
  "Events Loaded",
  "Live Now",
  "Official Plays",
  "Active Leagues"
];

function parseTodayCardCount(value) {
  const match = String(value || "")
    .replaceAll(",", "")
    .match(/-?\d+(?:\.\d+)?/);

  return match
    ? Number(match[0])
    : null;
}

function mixTodayCardRgb(from, to, amount) {
  const safeAmount = Math.max(
    0,
    Math.min(1, amount)
  );

  return from.map(
    (channel, index) =>
      Math.round(
        channel +
        (
          to[index] - channel
        ) * safeAmount
      )
  );
}

function findTodayCardSummaryValues() {
  const main =
    document.querySelector(".card-main");

  if (!main) return [];

  const matches = [];

  main
    .querySelectorAll(
      "span, small, p, dt, label"
    )
    .forEach(label => {
      const labelText = String(
        label.textContent || ""
      )
        .replace(/\s+/g, " ")
        .trim();

      const summaryLabel =
        TODAY_CARD_SCALED_SUMMARIES.find(
          expected =>
            labelText.toLowerCase() ===
            expected.toLowerCase()
        );

      if (!summaryLabel) return;

      const container =
        label.closest(
          "div, article, section, li"
        );

      const valueElement =
        container?.querySelector(
          [
            "strong",
            "output",
            "[data-summary-value]",
            ".count",
            ".value",
            ".number"
          ].join(",")
        );

      if (!valueElement) return;

      const value =
        parseTodayCardCount(
          valueElement.textContent
        );

      if (
        value === null ||
        !Number.isFinite(value)
      ) {
        return;
      }

      matches.push({
        label: summaryLabel,
        value,
        element: valueElement
      });
    });

  return matches.filter(
    (item, index, items) =>
      items.findIndex(
        candidate =>
          candidate.element ===
          item.element
      ) === index
  );
}

function applyTodayCardSummaryScale() {
  const summaries =
    findTodayCardSummaryValues();

  if (!summaries.length) return;

  const highest = Math.max(
    ...summaries.map(
      summary => summary.value
    ),
    0
  );

  const midpoint =
    highest / 2;

  const red = [255, 105, 124];
  const gray = [181, 190, 196];
  const green = [99, 255, 155];

  summaries.forEach(summary => {
    let rgb = gray;

    if (highest > 0) {
      if (summary.value <= midpoint) {
        const progress =
          midpoint > 0
            ? summary.value / midpoint
            : 0;

        rgb = mixTodayCardRgb(
          red,
          gray,
          progress
        );
      } else {
        const upperRange =
          highest - midpoint;

        const progress =
          upperRange > 0
            ? (
                summary.value -
                midpoint
              ) / upperRange
            : 1;

        rgb = mixTodayCardRgb(
          gray,
          green,
          progress
        );
      }
    }

    summary.element.classList.add(
      "today-card-scaled-summary"
    );

    summary.element.style.setProperty(
      "--summary-r",
      String(rgb[0])
    );

    summary.element.style.setProperty(
      "--summary-g",
      String(rgb[1])
    );

    summary.element.style.setProperty(
      "--summary-b",
      String(rgb[2])
    );

    summary.element.title =
      `${summary.label}: ${summary.value}. ` +
      `Current scale maximum: ${highest}; ` +
      `midpoint: ${midpoint}.`;
  });
}

function installTodayCardSummaryScale() {
  let scheduled = false;

  const scheduleUpdate = () => {
    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      applyTodayCardSummaryScale();
    });
  };

  scheduleUpdate();

  const main =
    document.querySelector(".card-main");

  if (!main) return;

  new MutationObserver(
    scheduleUpdate
  ).observe(main, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    installTodayCardSummaryScale,
    { once: true }
  );
} else {
  installTodayCardSummaryScale();
}
