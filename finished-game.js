const FINISHED_LOGO_BASE = "https://www.mlbstatic.com/team-logos";

window.addEventListener("DOMContentLoaded", loadFinishedGame);

async function loadFinishedGame() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";
  const date = params.get("date") || inferDateFromId(id);
  const sport = params.get("sport") || "baseball";
  const league = params.get("league") || "mlb";
  const gamePk = params.get("gamePk") || "";

  const status = document.getElementById("finishedGameStatus");
  const content = document.getElementById("finishedGameContent");

  try {
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("This finished-game link is missing a valid game ID or date.");
    }

    setLink("backToCard", buildCardBackUrl(date));
    setText("finishedGameLeague", `${sport.toUpperCase()} · ${league.toUpperCase()}`);

    const event = await loadEvent({ id, date, sport, league, gamePk });
    if (!event) throw new Error("Finished-game data has not been synchronized for this event yet.");

    const normalized = normalizeEvent(event, { id, date, sport, league, gamePk });
    renderHeader(normalized);
    renderLineScore(normalized);
    renderDecisions(normalized);
    await renderLifecycle(normalized.id);
    renderLinks(normalized);

    document.title = `${normalized.away.abbreviation} ${displayScore(normalized.away.score)}–${displayScore(normalized.home.score)} ${normalized.home.abbreviation} | Boring Bets`;
    status?.remove();
    if (content) content.hidden = false;
  } catch (error) {
    console.error(error);
    if (status) {
      status.className = "finished-game-error";
      status.textContent = error?.message || "Unable to load the finished-game breakdown.";
    }
  }
}

async function loadEvent({ id, date, league, gamePk }) {
  if (league === "mlb") {
    const enriched = await fetchOptionalJson(`data/games/${encodeURIComponent(date)}.json`);
    if (enriched) {
      const event = findEvent(enriched.games || [], id, gamePk);
      if (event) return event;
    }

    const live = await fetchOptionalJson(`data/live-games/${encodeURIComponent(date)}.json`);
    return live ? findEvent(live.games || [], id, gamePk) : null;
  }

  const dailyPath = `data/cards/${encodeURIComponent(date)}/${encodeURIComponent(league)}.json`;
  const daily = await fetchOptionalJson(dailyPath);
  if (daily) {
    const event = findEvent(daily.events || daily.games || [], id, gamePk);
    if (event) return event;
  }

  const season = date.slice(0, 4);
  const seasonDocument = await fetchJson(
    `data/schedules/baseball/${encodeURIComponent(season)}/${encodeURIComponent(league)}.json`
  );
  return findEvent(seasonDocument.events || seasonDocument.games || [], id, gamePk);
}

function findEvent(events, id, gamePk) {
  const requestedPk = String(gamePk || "");
  return (events || []).find(event => {
    const eventPk = String(event?.mlb_game_pk || event?.game_pk || event?.gamePk || "");
    return String(event?.id || "") === id || (requestedPk && eventPk === requestedPk);
  }) || null;
}

function normalizeEvent(event, context) {
  const participants = event.participants || event.competitors || [];
  const awayRaw = event.away || event.away_team || participants[0] || {};
  const homeRaw = event.home || event.home_team || participants[1] || {};
  const away = normalizeTeam(awayRaw, "AWAY", readScore(event, "away"));
  const home = normalizeTeam(homeRaw, "HOME", readScore(event, "home"));

  return {
    id: event.id || context.id,
    date: event.date || event.card_date || context.date,
    league: context.league,
    sport: context.sport,
    gamePk: event.mlb_game_pk || event.game_pk || event.gamePk || context.gamePk,
    status: readStatus(event.status || event.abstract_status),
    startTime: event.game_time || event.start_time || event.date_time || event.gameDate || "",
    venue: event.venue?.name || event.venue || event.location || "",
    away,
    home,
    linescore: normalizeLineScore(event.linescore || {}, away.score, home.score),
    decisions: normalizeDecisions(event.decisions || event.final_result?.decisions || {}),
    gameUrl: event.game_url || `game.html?id=${encodeURIComponent(event.id || context.id)}`,
    liveUrl: event.live_url || `live.html?id=${encodeURIComponent(event.id || context.id)}`
  };
}

function normalizeTeam(team, fallback, scoreFallback) {
  if (typeof team === "string") {
    return { id: null, abbreviation: team, name: team, score: scoreFallback };
  }
  return {
    id: team.id || team.team_id || null,
    abbreviation: team.abbr || team.abbreviation || team.short_name || fallback,
    name: team.name || team.full_name || team.abbr || fallback,
    score: team.score ?? scoreFallback
  };
}

function normalizeLineScore(linescore, awayScore, homeScore) {
  const innings = (linescore.innings || []).map(inning => ({
    num: inning.num || inning.inning || inning.ordinal || "",
    away: inning.away?.runs ?? inning.away ?? null,
    home: inning.home?.runs ?? inning.home ?? null
  }));

  const totals = linescore.totals || linescore.teams || {};
  const awayTotals = totals.away || {};
  const homeTotals = totals.home || {};

  return {
    scheduledInnings: linescore.scheduled_innings || linescore.scheduledInnings || 9,
    innings,
    totals: {
      away: {
        runs: awayTotals.runs ?? awayScore,
        hits: awayTotals.hits ?? null,
        errors: awayTotals.errors ?? null
      },
      home: {
        runs: homeTotals.runs ?? homeScore,
        hits: homeTotals.hits ?? null,
        errors: homeTotals.errors ?? null
      }
    }
  };
}

function normalizeDecisions(decisions) {
  const normalized = {};
  ["winner", "loser", "save"].forEach(key => {
    const person = decisions[key];
    if (!person) return;
    normalized[key] = {
      id: person.id || null,
      name: person.name || person.fullName || ""
    };
  });
  return normalized;
}

function renderHeader(game) {
  setText("finishedGameDate", formatDate(game.date));
  setText("finishedGameState", finalLabel(game));
  setText("awayAbbr", game.away.abbreviation);
  setText("awayName", game.away.name);
  setText("awayScore", displayScore(game.away.score));
  setText("homeAbbr", game.home.abbreviation);
  setText("homeName", game.home.name);
  setText("homeScore", displayScore(game.home.score));
  setText("finishedVenue", game.venue || "Venue unavailable");
  setText("finishedStartTime", formatStartTime(game.startTime));

  const inningsPlayed = game.linescore.innings.length || game.linescore.scheduledInnings;
  setText("finishedInnings", inningsPlayed ? `${inningsPlayed} innings` : "Completed");

  renderTeamLogo("awayLogo", game.away);
  renderTeamLogo("homeLogo", game.home);
}

function renderTeamLogo(targetId, team) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const teamId = Number(team.id);
  const abbreviation = String(team.abbreviation || "BB").slice(0, 3).toUpperCase();

  if (!Number.isFinite(teamId) || teamId <= 0) {
    target.textContent = abbreviation.slice(0, 2);
    return;
  }

  const image = document.createElement("img");
  image.src = `${FINISHED_LOGO_BASE}/${teamId}.svg`;
  image.alt = `${abbreviation} logo`;
  image.addEventListener("error", () => {
    target.textContent = abbreviation.slice(0, 2);
  }, { once: true });
  target.replaceChildren(image);
}

function renderLineScore(game) {
  const container = document.getElementById("lineScoreTable");
  if (!container) return;

  const innings = game.linescore.innings;
  if (!innings.length) {
    container.innerHTML = `<p class="finished-empty">The final score is synchronized, but inning-by-inning data is not available in this local shard yet.</p>`;
    return;
  }

  const headers = innings.map(inning => `<th>${escapeHtml(inning.num || "—")}</th>`).join("");
  const awayCells = innings.map(inning => `<td>${displayInning(inning.away)}</td>`).join("");
  const homeCells = innings.map(inning => `<td>${displayInning(inning.home)}</td>`).join("");
  const awayTotals = game.linescore.totals.away;
  const homeTotals = game.linescore.totals.home;

  container.innerHTML = `
    <table class="finished-linescore-table">
      <thead>
        <tr><th>TEAM</th>${headers}<th>R</th><th>H</th><th>E</th></tr>
      </thead>
      <tbody>
        <tr><td>${escapeHtml(game.away.abbreviation)}</td>${awayCells}<td>${displayScore(awayTotals.runs)}</td><td>${displayValue(awayTotals.hits)}</td><td>${displayValue(awayTotals.errors)}</td></tr>
        <tr><td>${escapeHtml(game.home.abbreviation)}</td>${homeCells}<td>${displayScore(homeTotals.runs)}</td><td>${displayValue(homeTotals.hits)}</td><td>${displayValue(homeTotals.errors)}</td></tr>
      </tbody>
    </table>`;
}

function renderDecisions(game) {
  const container = document.getElementById("decisionsGrid");
  if (!container) return;
  const labels = { winner: "Winning pitcher", loser: "Losing pitcher", save: "Save" };
  const cards = Object.entries(labels).map(([key, label]) => {
    const person = game.decisions[key];
    return `<div class="finished-decision"><span>${label}</span><strong>${escapeHtml(person?.name || "—")}</strong></div>`;
  });
  container.innerHTML = cards.join("");
}

async function renderLifecycle(gameId) {
  const [playsData, resultsData, evaluationsData] = await Promise.all([
    fetchOptionalJson("data/plays.json"),
    fetchOptionalJson("data/results.json"),
    fetchOptionalJson("data/evaluations.json")
  ]);

  const plays = (playsData?.plays || []).filter(item => item.game_id === gameId);
  const results = (resultsData?.results || []).filter(item => item.game_id === gameId);
  const evaluations = (evaluationsData?.evaluations || []).filter(item => item.game_id === gameId);

  renderStack("finishedPlays", plays, item => `
    <a href="play.html?id=${encodeURIComponent(item.id)}">
      <strong>${escapeHtml(item.play || "Official play")}</strong>
      <small>${escapeHtml(item.odds || "")}${item.units !== undefined ? ` · ${Number(item.units).toFixed(2)}u` : ""}</small>
    </a>`);

  renderStack("finishedResults", results, item => `
    <div>
      <strong>${escapeHtml(String(item.status || "pending").toUpperCase())}</strong>
      <small>${escapeHtml(item.final_score || "Final score pending")}${item.units_result !== undefined && item.units_result !== null ? ` · ${formatSignedUnits(item.units_result)}` : ""}</small>
    </div>`);

  renderStack("finishedEvaluations", evaluations, item => `
    <div>
      <strong>${escapeHtml(item.decision_quality || item.model_quality || "POSTGAME")}</strong>
      <small>${escapeHtml(item.summary || "Evaluation completed")}</small>
    </div>`);
}

function renderStack(targetId, items, renderer) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = items.length ? items.map(renderer).join("") : `<p class="finished-empty">Nothing published.</p>`;
}

function renderLinks(game) {
  setLink("archivedResearchLink", game.gameUrl);
  setLink("finishedLiveLink", game.liveUrl);
}

function buildCardBackUrl(date) {
  const params = new URLSearchParams();
  params.set("date", date);
  params.set("sports", "baseball");
  return `todays-card.html?${params.toString()}`;
}

function readScore(event, side) {
  return event?.score?.[side]
    ?? event?.scores?.[side]
    ?? event?.linescore?.totals?.[side]?.runs
    ?? event?.linescore?.teams?.[side]?.runs
    ?? event?.live_state?.score?.[side]
    ?? null;
}

function readStatus(value) {
  if (value && typeof value === "object") {
    return value.detailedState || value.abstractGameState || value.status || "Final";
  }
  return String(value || "Final");
}

function finalLabel(game) {
  const status = String(game.status || "").toLowerCase();
  if (status.includes("postpon")) return "POSTPONED";
  if (status.includes("cancel")) return "CANCELLED";
  if (game.away.score === null || game.home.score === null) return "FINAL · SCORE SYNC NEEDED";
  return "FINAL";
}

function inferDateFromId(id) {
  const match = String(id || "").match(/^(\d{4}-\d{2}-\d{2})(?:-|$)/);
  return match ? match[1] : "";
}

function formatDate(value) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function formatStartTime(value) {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(parsed);
}

function displayScore(value) {
  return value === null || value === undefined || value === "" ? "—" : escapeHtml(value);
}

function displayInning(value) {
  return value === null || value === undefined || value === "" ? "–" : escapeHtml(value);
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : escapeHtml(value);
}

function formatSignedUnits(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Units pending";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}u`;
}

function setText(id, value) {
  const target = document.getElementById(id);
  if (target) target.textContent = String(value ?? "");
}

function setLink(id, href) {
  const target = document.getElementById(id);
  if (target) target.href = href;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${path}.`);
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
