(() => {
  "use strict";

  const LOGO_BASE = "https://www.mlbstatic.com/team-logos/team-cap-on-dark";
  const positions = {
    P: [50, 69], C: [50, 89], "1B": [66, 72], "2B": [58, 58], "3B": [34, 72], SS: [42, 58], LF: [28, 31], CF: [50, 20], RF: [72, 31], DH: [50, 89]
  };
  const teamColors = {
    NYM: "#ff6b35", PHI: "#ff4f63", LAD: "#68a7ff", NYY: "#d7e5ff", BOS: "#ff5f66", TB: "#76d7ff", CHC: "#6fa8ff", BAL: "#ff8a3d", SFG: "#ff7b43", SEA: "#49e0d2", ATL: "#ff556d", TEX: "#4f83ff", CLE: "#ff5a67", PIT: "#ffd65c", MIL: "#ffd56a", MIA: "#48d7e8", TOR: "#55a6ff", CWS: "#d9e2de", SD: "#d9aa6d", KC: "#7ec9ff", CIN: "#ff4f56", COL: "#b998ff", DET: "#ff764f", LAA: "#ff5369", STL: "#ff4f5c", ARI: "#dd5674", WSH: "#ff5f69", ATH: "#8ee061", MIN: "#e9f1ff"
  };

  const state = {
    games: [], days: [], parks: [], index: null, lineupArchive: {}, game: null, dayGames: [], lineupSide: "away", eventFilter: "all",
    events: [], eventIndex: 0, paused: false, timer: null, demo: true, currentBatterIndex: 2,
    simulated: { awayScore: 3, homeScore: 2, inning: 6, half: "top", outs: 1, balls: 2, strikes: 1, pitchCount: 84, bases: [true, false, true] }
  };

  const $ = id => document.getElementById(id);
  const safe = value => value ?? "—";
  const logo = teamId => `${LOGO_BASE}/${Number(teamId)}.svg`;
  const formatDate = date => {
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  };
  const html = (value) => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  async function boot() {
    bindStaticControls();
    try {
      const [indexResponse, daysResponse, parksResponse, lineupsResponse] = await Promise.all([
        fetch(`data/live-game-index.json?v=${Date.now()}`),
        fetch(`data/days.json?v=${Date.now()}`),
        fetch(`data/ballparks/index.json?v=${Date.now()}`),
        fetch(`data/live-lineups.json?v=${Date.now()}`)
      ]);
      if (!indexResponse.ok) throw new Error("Unable to load the live game index.");
      state.index = await indexResponse.json();
      const daysPayload = daysResponse.ok ? await daysResponse.json() : { days: [] };
      const parksPayload = parksResponse.ok ? await parksResponse.json() : { parks: [] };
      const lineupsPayload = lineupsResponse.ok ? await lineupsResponse.json() : { lineups: {} };
      state.days = Array.isArray(daysPayload.days) ? daysPayload.days : [];
      state.parks = Array.isArray(parksPayload.parks) ? parksPayload.parks : [];
      state.lineupArchive = lineupsPayload.lineups || {};
      const requested = new URLSearchParams(location.search).get("id");
      const requestedDate = requested ? requested.slice(0, 10) : state.index.recommended_demo_date;
      await loadDay(requestedDate, requested || state.index.recommended_demo_game_id, false);
      startDemoFeed();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Live page could not load.");
      $("feedHealthText").textContent = "FEED UNAVAILABLE";
      document.querySelector(".feed-health")?.classList.add("stale");
    }
  }

  async function loadDay(date, requestedGameId = null, pushHistory = true) {
    const entry = (state.index?.dates || []).find(item => item.date === date);
    if (!entry) throw new Error(`No live slate file exists for ${date}.`);
    const response = await fetch(`${entry.file}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Unable to load the ${date} slate.`);
    const payload = await response.json();
    state.games = Array.isArray(payload.games) ? payload.games : [];
    state.dayGames = state.games;
    const game = state.games.find(item => item.id === requestedGameId) || state.games[0];
    if (!game) throw new Error(`No games are available for ${date}.`);
    state.game = game;
    $("selectedDate").textContent = formatDate(date);
    $("railDateLabel").textContent = `${state.dayGames.length} Games`;
    startGame(game.id, pushHistory);
  }

  function bindStaticControls() {
    $("toggleGameRail").addEventListener("click", () => $("liveWorkstation").classList.toggle("game-collapsed"));
    $("toggleEventRail").addEventListener("click", () => $("liveWorkstation").classList.toggle("events-collapsed"));
    $("previousDate").addEventListener("click", () => changeDate(-1));
    $("nextDate").addEventListener("click", () => changeDate(1));
    $("allEventsButton").addEventListener("click", () => setEventFilter("all"));
    $("alertsOnlyButton").addEventListener("click", () => setEventFilter("alerts"));
    $("pauseFeedButton").addEventListener("click", togglePause);
    $("awayLineupButton").addEventListener("click", () => setLineupSide("away"));
    $("homeLineupButton").addEventListener("click", () => setLineupSide("home"));
    document.querySelectorAll("[data-right-tab]").forEach(button => button.addEventListener("click", () => setRightTab(button.dataset.rightTab)));
    $("outfieldRegion").addEventListener("click", () => openFieldDetail("outfield"));
    $("infieldRegion").addEventListener("click", () => openFieldDetail("infield"));
    $("closeDetailDrawer").addEventListener("click", closeDetailDrawer);
    $("chatLaunch").addEventListener("click", openChat);
    $("closeChat").addEventListener("click", closeChat);
    $("chatForm").addEventListener("submit", event => { event.preventDefault(); if ($("chatInput").value.trim()) { showToast("Chat UI is staged; the intelligence engine connects in a later phase."); $("chatInput").value = ""; } });
    document.addEventListener("keydown", event => { if (event.key === "Escape") { closeChat(); closeDetailDrawer(); } });
  }

  function setDay(date) {
    state.dayGames = state.games.filter(game => game.date === date);
    $("selectedDate").textContent = formatDate(date);
    $("railDateLabel").textContent = `${state.dayGames.length} Games`;
    renderGameRail();
  }

  async function changeDate(direction) {
    if (!state.game) return;
    const dates = state.index?.dates || [];
    const currentIndex = dates.findIndex(day => day.date === state.game.date);
    const target = dates[currentIndex + direction];
    if (!target) return showToast(direction < 0 ? "No earlier schedule date." : "No later schedule date.");
    try { await loadDay(target.date, target.game_ids?.[0], true); }
    catch (error) { showToast(error.message); }
  }

  function startGame(gameId, pushHistory = true) {
    const game = state.games.find(item => item.id === gameId);
    if (!game) return;
    state.game = game;
    state.lineupSide = "away";
    state.events = buildSeedEvents(game);
    state.eventIndex = 0;
    state.currentBatterIndex = 2;
    state.simulated = deriveInitialState(game);
    if (pushHistory) history.pushState({}, "", `live.html?id=${encodeURIComponent(game.id)}`);
    renderEverything();
  }

  function deriveInitialState(game) {
    const numericSeed = Number(game.mlb_game_pk || game.venue?.id || 17);
    return {
      awayScore: numericSeed % 5,
      homeScore: (numericSeed + 2) % 5,
      inning: 6,
      half: numericSeed % 2 ? "bottom" : "top",
      outs: numericSeed % 3,
      balls: 2,
      strikes: 1,
      pitchCount: 78 + (numericSeed % 18),
      bases: [true, numericSeed % 2 === 0, true]
    };
  }

  function renderEverything() {
    renderGameRail();
    renderHeader();
    renderPark();
    renderLineup();
    renderFielders();
    renderPitcherPanel();
    renderScoreBug();
    renderEvents();
    document.title = `${state.game.away_team?.abbr || "Away"} at ${state.game.home_team?.abbr || "Home"} Live | Boring Bets`;
  }

  function renderGameRail() {
    $("gameList").innerHTML = state.dayGames.map(game => {
      const active = game.id === state.game?.id;
      const away = game.away_team || {};
      const home = game.home_team || {};
      return `<button class="game-tile${active ? " active" : ""}" data-game-id="${html(game.id)}" type="button">
        <span class="game-tile-logos"><img src="${logo(away.team_id)}" alt="${html(away.abbr || "Away")}"><img src="${logo(home.team_id)}" alt="${html(home.abbr || "Home")}"></span>
        <span class="game-tile-copy"><strong>${html(away.abbr || "AWY")} @ ${html(home.abbr || "HME")}</strong><span>${html(statusLabel(game))}</span></span>
        <span class="game-tile-score">${active ? `${state.simulated.awayScore}-${state.simulated.homeScore}` : "—"}</span>
      </button>`;
    }).join("") || `<p style="color:#789083;font-size:.65rem;padding:8px">No games on this date.</p>`;
    document.querySelectorAll("[data-game-id]").forEach(button => button.addEventListener("click", () => startGame(button.dataset.gameId)));
  }

  function statusLabel(game) {
    if (game.status === "final") return "FINAL · REPLAY MODE";
    if (game.status === "live") return "LIVE NOW";
    const time = game.game_time ? new Date(game.game_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "SCHEDULED";
    return `${time} · DEMO READY`;
  }

  function renderHeader() {
    const game = state.game;
    const away = game.away_team || {};
    const home = game.home_team || {};
    const awayColor = teamColors[away.abbr] || "#68a7ff";
    const homeColor = teamColors[home.abbr] || "#48ff93";
    $("teamMarquee").style.setProperty("--away-glow", awayColor);
    $("teamMarquee").style.setProperty("--home-glow", homeColor);
    $("ballparkStage").style.setProperty("--away-glow", awayColor);
    $("ballparkStage").style.setProperty("--home-glow", homeColor);
    [["awayLogo", away], ["bugAwayLogo", away], ["homeLogo", home], ["bugHomeLogo", home]].forEach(([id, team]) => { $(id).src = logo(team.team_id); $(id).alt = `${team.name || team.abbr || "Team"} logo`; });
    $("awayName").textContent = away.name || away.abbr || "Away";
    $("homeName").textContent = home.name || home.abbr || "Home";
    $("awayRecord").textContent = away.abbr || "AWAY";
    $("homeRecord").textContent = home.abbr || "HOME";
    $("bugAwayAbbr").textContent = away.abbr || "AWY";
    $("bugHomeAbbr").textContent = home.abbr || "HME";
    $("venueLabel").textContent = game.venue?.name || "MLB Ballpark";
    $("gameClock").textContent = `${game.status === "final" ? "REPLAY" : "SIMULATED LIVE"} · ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    const inning = `${state.simulated.half === "top" ? "▲" : "▼"} ${ordinal(state.simulated.inning)}`;
    $("inningLabel").textContent = inning;
    $("livePill").textContent = game.status === "live" ? "LIVE" : game.status === "final" ? "REPLAY DEMO" : "LIVE DEMO";
    const defenseSide = state.simulated.half === "top" ? "home" : "away";
    const offenseSide = defenseSide === "home" ? "away" : "home";
    const pitcher = game.pitchers?.[defenseSide] || {};
    const lineup = getLineup(offenseSide);
    const batter = lineup.players[state.currentBatterIndex % Math.max(1, lineup.players.length)] || {};
    $("pitcherName").textContent = pitcher.name || "Starter TBD";
    $("batterName").textContent = batter.name || "Lineup Pending";
    $("pitcherLink").onclick = () => navigatePlayer("pitcher", pitcher.id, pitcher.name);
    $("batterLink").onclick = () => navigatePlayer("batter", batter.id, batter.name);
    $("pitcherPanelName").textContent = pitcher.name || "Starter TBD";
  }

  function ordinal(value) {
    const suffix = value === 1 ? "ST" : value === 2 ? "ND" : value === 3 ? "RD" : "TH";
    return `${value}${suffix}`;
  }

  function getLineup(side) {
    const direct = state.game.lineups?.[side];
    if (Array.isArray(direct?.players) && direct.players.length) return { ...direct, source_mode: "current" };
    const teamId = state.game[`${side}_team`]?.team_id;
    const archived = state.lineupArchive?.[String(teamId)];
    if (Array.isArray(archived?.players) && archived.players.length) {
      return { ...archived, status_label: "Last Confirmed Lineup", last_updated: archived.last_updated || archived.game_date, source_mode: "fallback" };
    }
    return { team: state.game[`${side}_team`]?.abbr, players: [], status_label: "Lineup Pending", source_mode: "empty" };
  }

  function renderPark() {
    const park = state.parks.find(item => Number(item.id) === Number(state.game.venue?.id));
    if (park?.geometry) {
      const g = park.geometry;
      $("outfieldShape").setAttribute("d", `M ${g.left_start} 555 Q ${g.left_curve_x} ${g.left_curve_y} 500 ${g.center_y} Q ${g.right_curve_x} ${g.right_curve_y} ${g.right_start} 555 L 720 555 Q 680 360 500 275 Q 320 360 280 555 Z`);
      $("warningTrack").setAttribute("d", `M ${g.left_start - 8} 554 Q ${g.left_curve_x - 18} ${g.left_curve_y - 13} 500 ${g.center_y - 18} Q ${g.right_curve_x + 18} ${g.right_curve_y - 13} ${g.right_start + 8} 554`);
      $("parkGeometryLabel").textContent = `${park.name} · GEOMETRY ${park.version || "V0.1"}`;
    } else {
      $("parkGeometryLabel").textContent = `${state.game.venue?.name || "BALLPARK"} · DEFAULT GEOMETRY`;
    }
    const defenseSide = state.simulated.half === "top" ? "home" : "away";
    const lineup = getLineup(defenseSide);
    const pitcher = state.game.pitchers?.[defenseSide] || {};
    const fielders = lineup.players.filter(player => player.position !== "DH");
    if (!fielders.some(player => player.position === "P")) fielders.push({ id: pitcher.id, name: pitcher.name || "Pitcher", position: "P" });
    $("fieldPlayers").innerHTML = fielders.map((player, index) => {
      const coords = positions[player.position] || [50 + ((index % 3) - 1) * 10, 50 + Math.floor(index / 3) * 10];
      const pulseClass = index === 1 ? "hot" : index === 6 ? "cold" : "";
      return `<div class="field-player ${pulseClass}" style="left:${coords[0]}%;top:${coords[1]}%"><button type="button" data-field-player="${html(player.id || "")}" data-player-name="${html(player.name || player.position)}"><i>${html(player.position || "—")}</i><span>${html(shortName(player.name || player.position))}</span></button></div>`;
    }).join("");
    document.querySelectorAll("[data-field-player]").forEach(button => button.addEventListener("click", () => navigatePlayer(button.querySelector("i")?.textContent === "P" ? "pitcher" : "batter", button.dataset.fieldPlayer, button.dataset.playerName)));
    renderBaseState();
  }

  function shortName(name) {
    const parts = String(name || "").split(" ");
    return parts.length > 1 ? `${parts[0][0]}. ${parts.at(-1)}` : name;
  }

  function setLineupSide(side) {
    state.lineupSide = side;
    $("awayLineupButton").classList.toggle("active", side === "away");
    $("homeLineupButton").classList.toggle("active", side === "home");
    renderLineup();
  }

  function renderLineup() {
    const lineup = getLineup(state.lineupSide);
    $("lineupStatusLabel").textContent = `${lineup.team || state.game[`${state.lineupSide}_team`]?.abbr || "TEAM"} · ${lineup.status_label || "LINEUP"}`.toUpperCase();
    $("lineupFreshness").textContent = lineup.source_mode === "fallback" ? "LAST CONFIRMED" : lineup.last_updated ? "UPDATED" : "PENDING";
    const players = lineup.players || [];
    if (!players.length) {
      $("liveLineup").innerHTML = `<div style="padding:18px;border:1px solid rgba(255,255,255,.06);border-radius:8px;color:#789083;font-size:.65rem;line-height:1.6">The lineup has not been published. This panel will update automatically when the live feed confirms it.</div>`;
      $("dueUpList").innerHTML = "";
      return;
    }
    $("liveLineup").innerHTML = players.map((player, index) => {
      const pulse = playerPulse(index);
      return `<div class="lineup-row ${pulse.className}${index === state.currentBatterIndex ? " active" : ""}" data-lineup-player="${html(player.id || "")}" data-player-name="${html(player.name)}">
        <span class="order">${html(player.order || index + 1)}</span>
        <span class="player-copy"><strong>${html(player.name)}</strong><small>${html(player.position || "—")} · ${pulse.line}</small></span>
        <span class="hand">${html(player.matchup_bats || player.bats || "—")}</span>
        <span class="pulse"><b>${pulse.stat}</b><span>${pulse.label}</span></span>
      </div>`;
    }).join("");
    document.querySelectorAll("[data-lineup-player]").forEach(row => row.addEventListener("click", () => navigatePlayer("batter", row.dataset.lineupPlayer, row.dataset.playerName)));
    const due = [0,1,2].map(offset => players[(state.currentBatterIndex + offset) % players.length]);
    $("dueUpList").innerHTML = due.map((player, index) => `<div class="due-up-card"><span>${index === 0 ? "AT BAT" : `+${index}`}</span><strong>${html(shortName(player.name))}</strong></div>`).join("");
    $("dueUp").textContent = due.map(player => shortName(player.name)).join(" · ");
  }

  function playerPulse(index) {
    const pulses = [
      { className:"hot", stat:"2–3", label:"HOT", line:"104.8 EV" },
      { className:"", stat:"1–2", label:"ON BASE", line:"BB · RUN" },
      { className:"hot", stat:"HR", label:"BARRELED", line:"112.1 EV" },
      { className:"cold", stat:"0–3", label:"COLD", line:"3 K" },
      { className:"", stat:"1–3", label:"STEADY", line:"92.6 EV" },
      { className:"", stat:"0–2", label:"DUE", line:"BB · 2 PA" },
      { className:"cold", stat:"0–3", label:"QUIET", line:"2 GB" },
      { className:"", stat:"1–2", label:"LIVE", line:"RBI" },
      { className:"", stat:"0–1", label:"ON DECK", line:"BB" }
    ];
    return pulses[index % pulses.length];
  }

  function renderFielders() {
    const defenseSide = state.simulated.half === "top" ? "home" : "away";
    const lineup = getLineup(defenseSide);
    const pitcher = state.game.pitchers?.[defenseSide] || {};
    const fielders = lineup.players.filter(player => player.position !== "DH");
    if (!fielders.some(player => player.position === "P")) fielders.push({ id: pitcher.id, name: pitcher.name || "Pitcher", position: "P" });
    $("fielderGrid").innerHTML = fielders.map((player, index) => `<button class="fielder-card" type="button" data-fielder-position="${html(player.position)}"><span>${html(player.position || "—")}</span><strong>${html(player.name || "Pending")}</strong><small>${index % 3 === 0 ? "+2 positioning" : index % 3 === 1 ? "Standard depth" : "Shifted 14 ft"}</small></button>`).join("");
    document.querySelectorAll("[data-fielder-position]").forEach(button => button.addEventListener("click", () => highlightFielder(button.dataset.fielderPosition)));
  }

  function highlightFielder(position) {
    document.querySelectorAll(".field-player").forEach(node => node.style.opacity = node.querySelector("i")?.textContent === position ? "1" : ".18");
    showToast(`${position} highlighted on the field.`);
    setTimeout(() => document.querySelectorAll(".field-player").forEach(node => node.style.opacity = "1"), 1600);
  }

  function renderPitcherPanel() {
    const side = state.simulated.half === "top" ? "home" : "away";
    const pitcher = state.game.pitchers?.[side] || {};
    const sample = pitcher.stats?.season?.[side === "home" ? "home" : "away"] || pitcher.stats?.season?.all || {};
    const stats = [
      ["PITCHES", state.simulated.pitchCount, "+4 pace"], ["STRIKE %", "67%", "+3%"], ["WHIFFS", "12", "+4"],
      ["CSW%", "30%", "+5%"], ["VELOCITY", "96.4", "+1.8"], ["ERA", sample.era != null ? Number(sample.era).toFixed(2) : "—", "season"],
      ["WHIP", sample.whip != null ? Number(sample.whip).toFixed(2) : "—", "season"], ["K", "7", "today"], ["BB", "2", "today"]
    ];
    $("pitcherStatGrid").innerHTML = stats.map(([label,value,delta]) => `<div><span>${label}</span><strong>${value}</strong><small>${delta}</small></div>`).join("");
    const arsenal = [["4-SEAM",41,"96.4"],["SLIDER",27,"86.8"],["SPLITTER",19,"89.7"],["CURVE",13,"81.6"]];
    $("arsenalList").innerHTML = arsenal.map(([name,use,velo]) => `<div class="arsenal-row"><strong>${name}</strong><div class="arsenal-bar"><i style="width:${use * 1.8}%"></i></div><span>${velo}</span></div>`).join("");
    const risk = Math.min(89, 22 + Math.max(0, state.simulated.pitchCount - 70));
    $("removalRiskLabel").textContent = `${risk}%`;
    $("removalRiskMeter").style.width = `${risk}%`;
    $("riskNotes").innerHTML = `<div><span>Pitch count pressure</span><b>${state.simulated.pitchCount >= 95 ? "High" : "Moderate"}</b></div><div><span>Velocity trend</span><b>+1.8 MPH</b></div><div><span>Bullpen activity</span><b>2 arms up</b></div>`;
    $("pitcherStatusBadge").textContent = state.simulated.pitchCount > 98 ? "FATIGUE WATCH" : "DOMINATING";
    $("pitcherPulse").textContent = `${state.simulated.pitchCount} P · 12 WHIFFS · +1.8 MPH`;
  }

  function renderScoreBug() {
    const s = state.simulated;
    const inning = `${s.half === "top" ? "▲" : "▼"} ${ordinal(s.inning)}`;
    ["awayScore","bugAwayScore"].forEach(id => $(id).textContent = s.awayScore);
    ["homeScore","bugHomeScore"].forEach(id => $(id).textContent = s.homeScore);
    $("bugInning").textContent = inning;
    $("bugOuts").textContent = `${s.outs} OUT${s.outs === 1 ? "" : "S"}`;
    $("countValue").textContent = `${s.balls}–${s.strikes}`;
    $("pitchCount").textContent = s.pitchCount;
    const defenseSide = s.half === "top" ? "home" : "away";
    const offenseSide = defenseSide === "home" ? "away" : "home";
    const lineup = getLineup(offenseSide);
    const batter = lineup.players[state.currentBatterIndex % Math.max(1,lineup.players.length)] || {};
    const pitcher = state.game.pitchers?.[defenseSide] || {};
    $("bugBatter").textContent = batter.name || "Lineup Pending";
    $("bugPitcher").textContent = pitcher.name || "Starter TBD";
    $("batterPulse").textContent = playerPulse(state.currentBatterIndex).line + " · " + playerPulse(state.currentBatterIndex).label;
    $("runExpectancy").textContent = s.bases.filter(Boolean).length >= 2 ? "1.42" : "0.71";
    const awayProb = 48 + Math.max(-18, Math.min(18, (s.awayScore - s.homeScore) * 6 + (s.half === "top" ? 2 : -2)));
    $("winProbability").textContent = `${awayProb}% / ${100-awayProb}%`;
    $("liveMoneyline").textContent = awayProb > 50 ? `${state.game.away_team?.abbr} -128` : `${state.game.home_team?.abbr} -122`;
    $("liveTotal").textContent = `${Math.max(5.5, s.awayScore + s.homeScore + 3.5).toFixed(1)} -110`;
    $("leverageIndex").textContent = s.inning >= 7 ? "2.81 VERY HIGH" : "2.14 HIGH";
    renderBaseState();
    renderLineScore();
    renderGameRail();
  }

  function renderBaseState() {
    const mapping = ["baseFirst","baseSecond","baseThird"];
    const bugMapping = ["bugBaseFirst","bugBaseSecond","bugBaseThird"];
    state.simulated.bases.forEach((active,index) => { $(mapping[index]).classList.toggle("active", active); $(bugMapping[index]).classList.toggle("active", active); });
  }

  function renderLineScore() {
    const s = state.simulated;
    const innings = Array.from({length:9}, (_,index) => {
      const n = index + 1;
      const played = n < s.inning || (n === s.inning && s.half === "bottom");
      const runs = played ? ((Number(state.game.mlb_game_pk || 1) + n) % 4 === 0 ? 2 : (n + s.awayScore + s.homeScore) % 3 === 0 ? 1 : 0) : "–";
      return `<div><span>${n}</span><strong>${runs}</strong></div>`;
    }).join("");
    $("lineScore").innerHTML = innings + `<div><span>R</span><strong>${s.awayScore}-${s.homeScore}</strong></div>`;
  }

  function buildSeedEvents(game) {
    const away = game.away_team?.abbr || "AWY";
    const home = game.home_team?.abbr || "HME";
    return [
      event("positive","POSITIVE CONDITION",`${home} starter velocity is 1.8 MPH above season baseline.`,`12 whiffs · 30% CSW`,true),
      event("pitch","PITCH","96.4 MPH four-seam — ball low and away.","Count moves to 2–1"),
      event("alert","BULLPEN ACTIVITY",`${home} has two relievers warming.`,`Removal risk increased to 36%`,true),
      event("pitch","IN PLAY","104.8 MPH line drive pulled into right field.","Catch probability 42%"),
      event("negative","FATIGUE WATCH","Starter has thrown 31 pitches this inning.","Command variance widening",true),
      event("alert","MARKET MOVE",`Live total moved from 8.0 to 7.5.`,`No scoring event triggered the move`,true),
      event("pitch","PITCH","88.9 MPH splitter — swinging strike.","12th whiff of the night"),
      event("positive","DEFENSIVE EDGE",`${away} center fielder moved 18 feet toward right-center.`,`Positioning model confidence 78%`,true)
    ];
  }

  function event(type,title,detail,meta,isAlert=false) {
    return { type,title,detail,meta,isAlert,time:new Date(Date.now() - Math.random()*140000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}) };
  }

  function renderEvents() {
    const events = state.eventFilter === "alerts" ? state.events.filter(item => item.isAlert) : state.events;
    $("eventStream").innerHTML = events.map(item => `<article class="event-card ${item.type}"><header><span>${html(item.time)}</span><span>${html(item.title)}</span></header><strong>${html(item.detail)}</strong><p>${html(item.meta)}</p></article>`).join("");
  }

  function startDemoFeed() {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (state.paused || !state.game) return;
      simulatePitch();
    }, 5200);
  }

  function simulatePitch() {
    const s = state.simulated;
    const pitches = [
      ["97.1 MPH FOUR-SEAM", "CALLED STRIKE", "pitch"],
      ["87.4 MPH SLIDER", "SWINGING STRIKE", "pitch"],
      ["90.2 MPH SPLITTER", "BALL IN DIRT", "pitch"],
      ["95.8 MPH SINKER", "FOUL", "pitch"],
      ["86.9 MPH CHANGEUP", "BALL LOW", "pitch"]
    ];
    const pick = pitches[state.eventIndex % pitches.length];
    state.eventIndex += 1;
    s.pitchCount += 1;
    const outcome = pick[1];
    if (outcome.includes("STRIKE")) s.strikes += 1;
    else if (outcome.includes("BALL")) s.balls += 1;
    if (outcome === "FOUL" && s.strikes < 2) s.strikes += 1;
    $("lastPitch").textContent = `${pick[0]} · ${pick[1]}`;
    state.events.unshift(event("pitch","PITCH",`${pick[0]} — ${pick[1].toLowerCase()}.`,`Feed received in ${38 + (state.eventIndex % 19)}ms`));
    if (s.strikes >= 3 || s.balls >= 4) advancePlateAppearance(s.strikes >= 3 ? "Strikeout" : "Walk");
    if (state.eventIndex % 5 === 0) {
      const alertEvent = event(state.eventIndex % 10 === 0 ? "negative" : "positive", state.eventIndex % 10 === 0 ? "FATIGUE CHANGE" : "PITCH QUALITY", state.eventIndex % 10 === 0 ? "Release point dropped another 1.7 inches." : "Whiff rate remains above expected baseline.", "Live intelligence condition updated", true);
      state.events.unshift(alertEvent);
      pulsePage(alertEvent.type);
    }
    $("feedLatency").textContent = `${38 + (state.eventIndex % 19)}ms`;
    $("gameClock").textContent = `SIMULATED LIVE · ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    renderScoreBug(); renderPitcherPanel(); renderEvents();
  }

  function advancePlateAppearance(result) {
    const s = state.simulated;
    if (result === "Strikeout") s.outs += 1;
    else { s.bases = [true, s.bases[0], s.bases[1]]; }
    state.events.unshift(event(result === "Walk" ? "positive" : "pitch", result.toUpperCase(), `${$("bugBatter").textContent} ${result === "Walk" ? "reaches first base" : "strikes out"}.`, `Plate appearance complete · ${s.outs} out${s.outs === 1 ? "" : "s"}`, result === "Walk"));
    state.currentBatterIndex += 1;
    s.balls = 0; s.strikes = 0;
    if (s.outs >= 3) { s.outs = 0; s.bases = [false,false,false]; if (s.half === "top") s.half = "bottom"; else { s.half = "top"; s.inning += 1; } renderHeader(); renderPark(); renderFielders(); }
    renderLineup();
  }

  function setEventFilter(filter) {
    state.eventFilter = filter;
    $("allEventsButton").classList.toggle("active", filter === "all");
    $("alertsOnlyButton").classList.toggle("active", filter === "alerts");
    renderEvents();
  }

  function togglePause() {
    state.paused = !state.paused;
    $("pauseFeedButton").textContent = state.paused ? "Resume" : "Pause";
    $("pauseFeedButton").classList.toggle("active", state.paused);
    $("feedHealthText").textContent = state.paused ? "DEMO FEED PAUSED" : "DEMO FEED ACTIVE";
  }

  function setRightTab(tab) {
    document.querySelectorAll("[data-right-tab]").forEach(button => button.classList.toggle("active", button.dataset.rightTab === tab));
    document.querySelectorAll("[data-right-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.rightPanel === tab));
  }

  function openFieldDetail(type) {
    const isOutfield = type === "outfield";
    $("detailKicker").textContent = isOutfield ? "OUTFIELD INTELLIGENCE" : "INFIELD INTELLIGENCE";
    $("detailTitle").textContent = isOutfield ? `${state.game.venue?.name || "Ballpark"} Outfield` : `${state.game.venue?.name || "Ballpark"} Infield`;
    $("detailBody").innerHTML = isOutfield ? `<p>Wall geometry, defender range, wind vectors, batted-ball landing zones and park-specific handling will live here. This click target is already isolated from the central HUD so it can become a dedicated page later.</p><div class="detail-metric-grid"><div><span>WIND VECTOR</span><strong>7 MPH to RF</strong></div><div><span>CATCH PROB</span><strong>42%</strong></div><div><span>ALIGNMENT</span><strong>Pull shade</strong></div><div><span>WALL EFFECT</span><strong>+8% doubles</strong></div><div><span>VISIBILITY</span><strong>Clear</strong></div><div><span>OUTFIELD OAA</span><strong>+3 combined</strong></div></div>` : `<p>Shift state, defender starting positions, range, arm strength, double-play probability, surface condition and expected run prevention will live here.</p><div class="detail-metric-grid"><div><span>SHIFT</span><strong>2B pull shade</strong></div><div><span>DP PROB</span><strong>41%</strong></div><div><span>SURFACE</span><strong>Dry / fast</strong></div><div><span>RANGE EDGE</span><strong>+2 runs</strong></div><div><span>BUNT DEFENSE</span><strong>Standard</strong></div><div><span>RUNNER LEAD</span><strong>12.4 ft</strong></div></div>`;
    $("detailDrawer").classList.add("open"); $("detailDrawer").setAttribute("aria-hidden","false");
    history.replaceState({}, "", `live.html?id=${encodeURIComponent(state.game.id)}&view=${type}`);
  }

  function closeDetailDrawer() {
    $("detailDrawer").classList.remove("open"); $("detailDrawer").setAttribute("aria-hidden","true");
    if (state.game) history.replaceState({}, "", `live.html?id=${encodeURIComponent(state.game.id)}`);
  }
  function openChat() { $("chatDrawer").classList.add("open"); $("chatDrawer").setAttribute("aria-hidden","false"); }
  function closeChat() { $("chatDrawer").classList.remove("open"); $("chatDrawer").setAttribute("aria-hidden","true"); }

  function navigatePlayer(type, id, name) {
    if (!id) return showToast(`${name || "Player"} profile will open when the live feed supplies an ID.`);
    const params = new URLSearchParams({ id: state.game.id, player: id, mode: "live" });
    if (type === "pitcher") params.set("pitcher", id);
    else params.set("batter", id);
    location.href = `lineup.html?${params.toString()}`;
  }

  function pulsePage(type) {
    const color = type === "negative" ? "rgba(255,94,117,.23)" : "rgba(72,255,147,.2)";
    $("ballparkConsole").animate([{boxShadow:`0 0 0 ${color}`},{boxShadow:`0 0 48px ${color}`},{boxShadow:`0 0 0 ${color}`}],{duration:1100});
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    $("liveToast").textContent = message;
    $("liveToast").classList.add("show");
    toastTimer = setTimeout(() => $("liveToast").classList.remove("show"), 2400);
  }

  window.addEventListener("popstate", async () => {
    const requested = new URLSearchParams(location.search).get("id");
    if (requested && requested !== state.game?.id) {
      try { await loadDay(requested.slice(0, 10), requested, false); } catch (error) { showToast(error.message); }
    }
  });

  boot();
})();
