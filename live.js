(() => {
  "use strict";

  const LOGO_BASE = "https://www.mlbstatic.com/team-logos/team-cap-on-dark";
  const positionFeet = {
    P: [0, 60.5], C: [0, -7], "1B": [72, 74], "2B": [42, 132], "3B": [-72, 74], SS: [-42, 132], LF: [-170, 255], CF: [0, 305], RF: [170, 255], DH: [0, -7]
  };
  const teamColors = {
    NYM: "#ff6b35", PHI: "#ff4f63", LAD: "#68a7ff", NYY: "#d7e5ff", BOS: "#ff5f66", TB: "#76d7ff", CHC: "#6fa8ff", BAL: "#ff8a3d", SFG: "#ff7b43", SEA: "#49e0d2", ATL: "#ff556d", TEX: "#4f83ff", CLE: "#ff5a67", PIT: "#ffd65c", MIL: "#ffd56a", MIA: "#48d7e8", TOR: "#55a6ff", CWS: "#d9e2de", SD: "#d9aa6d", KC: "#7ec9ff", CIN: "#ff4f56", COL: "#b998ff", DET: "#ff764f", LAA: "#ff5369", STL: "#ff4f5c", ARI: "#dd5674", WSH: "#ff5f69", ATH: "#8ee061", MIN: "#e9f1ff"
  };

  const state = {
    games: [], days: [], parks: [], index: null, lineupArchive: {}, game: null, dayGames: [], lineupSide: "away", eventFilter: "all",
    events: [], eventIndex: 0, paused: false, timer: null, demo: false, currentBatterIndex: 2,
    hudView: "field", autoView: false, heatLayer: "combined", pitchHistory: [], fieldProjection: null, plateLook: 0, lastPlateEvent: null,
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

  function gameKey(game) {
    return String(
      game?.mlb_game_pk ??
      game?.id ??
      ""
    );
  }

  function liveGameUrl(game) {
    const params = new URLSearchParams({
      id: String(game?.id || "")
    });

    if (game?.mlb_game_pk != null) {
      params.set(
        "gamePk",
        String(game.mlb_game_pk)
      );
    }

    return `live.html?${params.toString()}`;
  }

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
      const urlParams =
        new URLSearchParams(location.search);

      const requested =
        urlParams.get("id");

      const requestedGamePk =
        urlParams.get("gamePk");

      const todayParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const todayPart = type =>
        todayParts.find(part => part.type === type)?.value || "";

      const today =
        `${todayPart("year")}-${todayPart("month")}-${todayPart("day")}`;

      const todayExists =
        (state.index?.dates || []).some(entry => entry.date === today);

      const requestedDate =
        requested
          ? requested.slice(0, 10)
          : todayExists
            ? today
            : state.index.recommended_demo_date;

      await loadDay(requestedDate, requested || null, false, requestedGamePk);
      startLiveFeed();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Live page could not load.");
      $("feedHealthText").textContent = "FEED UNAVAILABLE";
      document.querySelector(".feed-health")?.classList.add("stale");
    }
  }

  async function loadDay(date, requestedGameId = null, pushHistory = true, requestedGamePk = null) {
    const entry = (state.index?.dates || []).find(item => item.date === date);
    if (!entry) throw new Error(`No live slate file exists for ${date}.`);
    const response = await fetch(`${entry.file}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Unable to load the ${date} slate.`);
    const payload = await response.json();
    state.games = Array.isArray(payload.games) ? payload.games : [];
    state.dayGames = state.games;
    const game =
      (
        requestedGamePk
          ? state.games.find(
              item =>
                String(item.mlb_game_pk) ===
                String(requestedGamePk)
            )
          : null
      ) ||
      state.games.find(
        item => item.id === requestedGameId
      ) ||
      state.games[0];
    if (!game) throw new Error(`No games are available for ${date}.`);
    state.game = game;
    $("selectedDate").textContent = formatDate(date);
    $("railDateLabel").textContent = `${state.dayGames.length} Games`;
    startGame(gameKey(game), pushHistory);
  }

  function bindStaticControls() {
    $("toggleGameRail").addEventListener("click", () => $("liveWorkstation").classList.toggle("game-collapsed"));
    $("toggleEventRail").addEventListener("click", () => $("liveWorkstation").classList.toggle("events-collapsed"));
    $("previousDate").addEventListener("click", () => changeDate(-1));
    $("nextDate").addEventListener("click", () => changeDate(1));
    $("allEventsButton").addEventListener("click", () => setEventFilter("all"));
    $("alertsOnlyButton").addEventListener("click", () => setEventFilter("alerts"));
    $("lowerLogAll")?.addEventListener("click", () => setEventFilter("all"));
    $("lowerLogAlerts")?.addEventListener("click", () => setEventFilter("alerts"));
    $("pauseFeedButton").addEventListener("click", togglePause);
    $("fieldViewButton").addEventListener("click", () => setHudView("field"));
    $("plateViewButton").addEventListener("click", () => setHudView("plate"));
    $("openPlateHudButton")?.addEventListener("click", openFullPlateHud);
    $("closePlateHudButton")?.addEventListener("click", closeFullPlateHud);
    $("fullPlateHudScene")?.addEventListener("click", closeFullPlateHud);
    $("fullPlateHudScene")?.addEventListener("pointermove", handlePlateLook);
    $("fullPlateHudScene")?.addEventListener("pointerleave", () => setPlateLook(0));
    $("fullPlateHudScene")?.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); closeFullPlateHud(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); setPlateLook(state.plateLook - 0.18); }
      if (event.key === "ArrowRight") { event.preventDefault(); setPlateLook(state.plateLook + 0.18); }
    });
    document.querySelectorAll("[data-close-plate-hud]").forEach(node => node.addEventListener("click", closeFullPlateHud));
    $("autoViewButton").addEventListener("click", toggleAutoView);
    document.querySelectorAll("[data-heat-layer]").forEach(button => button.addEventListener("click", () => setHeatLayer(button.dataset.heatLayer)));
    $("awayLineupButton").addEventListener("click", () => setLineupSide("away"));
    $("homeLineupButton").addEventListener("click", () => setLineupSide("home"));
    document.querySelectorAll("[data-right-tab]").forEach(button => button.addEventListener("click", () => setRightTab(button.dataset.rightTab)));
    $("outfieldRegion").addEventListener("click", () => openFieldDetail("outfield"));
    $("infieldRegion").addEventListener("click", () => openFieldDetail("infield"));
    $("closeDetailDrawer").addEventListener("click", closeDetailDrawer);
    $("toggleGameStateDock").addEventListener("click", toggleGameStateDock);
    $("chatLaunch").addEventListener("click", openChat);
    $("closeChat").addEventListener("click", closeChat);
    $("chatForm").addEventListener("submit", event => { event.preventDefault(); if ($("chatInput").value.trim()) { showToast("Chat UI is staged; the intelligence engine connects in a later phase."); $("chatInput").value = ""; } });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { closeFullPlateHud(); closeChat(); closeDetailDrawer(); }
      if ((event.key === "Enter" || event.key === " ") && document.activeElement === $("openPlateHudButton")) { event.preventDefault(); openFullPlateHud(); }
    });
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

  function startGame(selectedGameKey, pushHistory = true) {
    const game = state.games.find(
      item =>
        gameKey(item) ===
        String(selectedGameKey)
    );
    if (!game) return;
    state.game = game;
    state.lineupSide = "away";
    state.events = buildSeedEvents(game);
    state.eventIndex = 0;
    state.currentBatterIndex = 2;
    state.simulated = deriveLiveState(game, null);
    state.pitchHistory = buildInitialPitchHistory(game);
    if (pushHistory) {
      history.pushState(
        {},
        "",
        liveGameUrl(game)
      );
    }
    renderEverything();
  }

  function liveNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function deriveLiveState(game, previous = null) {
    const linescore = game?.linescore || {};
    const totals = linescore.totals || {};
    const bases = linescore.bases || {};

    const inningState = String(
      linescore.inning_half ||
      linescore.inning_state ||
      ""
    ).toLowerCase();

    let half = previous?.half || "top";

    if (inningState.includes("bottom")) {
      half = "bottom";
    } else if (inningState.includes("top")) {
      half = "top";
    }

    const suppliedPitchCount =
      game?.pitch_count ??
      game?.current_pitcher?.pitch_count ??
      game?.live?.pitch_count;

    return {
      awayScore: liveNumber(
        game?.score?.away ?? totals?.away?.runs,
        previous?.awayScore ?? 0
      ),
      homeScore: liveNumber(
        game?.score?.home ?? totals?.home?.runs,
        previous?.homeScore ?? 0
      ),
      inning: Math.max(
        1,
        liveNumber(
          linescore.current_inning,
          previous?.inning ?? 1
        )
      ),
      half,
      outs: liveNumber(
        linescore.outs,
        previous?.outs ?? 0
      ),
      balls: liveNumber(
        linescore.balls,
        previous?.balls ?? 0
      ),
      strikes: liveNumber(
        linescore.strikes,
        previous?.strikes ?? 0
      ),
      pitchCount: liveNumber(
        suppliedPitchCount,
        previous?.pitchCount ?? 0
      ),
      bases: [
        Boolean(bases.first),
        Boolean(bases.second),
        Boolean(bases.third)
      ]
    };
  }

  function renderEverything() {
    renderGameRail();
    renderHeader();
    renderPark();
    renderPlateView();
    renderLineup();
    renderFielders();
    renderPitcherPanel();
    renderScoreBug();
    renderEvents();
    renderLowerGameModules();
    renderFullPlateHudContext();
    setHudView(state.hudView, false);
    document.title = `${state.game.away_team?.abbr || "Away"} at ${state.game.home_team?.abbr || "Home"} Live | Boring Bets`;
  }

  function renderGameRail() {
    const railGames =
      [...state.dayGames].sort((left, right) =>
        String(left.game_time || "").localeCompare(
          String(right.game_time || "")
        )
      );

    $("gameList").innerHTML =
      railGames.map(game => {
        const key = gameKey(game);
        const active =
          key === gameKey(state.game);

        const away = game.away_team || {};
        const home = game.home_team || {};

        const sameMatchups =
          railGames.filter(
            item => item.id === game.id
          );

        const doubleheaderNumber =
          sameMatchups.length > 1
            ? sameMatchups.findIndex(
                item =>
                  gameKey(item) === key
              ) + 1
            : null;

        const awayScore =
          game.score?.away ?? "—";

        const homeScore =
          game.score?.home ?? "—";

        const rawStatus = String(
          game.status ||
          game.abstract_status ||
          ""
        );

        const phase =
          /final/i.test(rawStatus)
            ? "final"
            : /scheduled|preview/i.test(rawStatus)
              ? "scheduled"
              : "live";

        const label =
          `${away.abbr || "Away"} ` +
          `${awayScore}, ` +
          `${home.abbr || "Home"} ` +
          `${homeScore}, ` +
          `${statusLabel(game)}`;

        return `
          <button
            class="game-tile${active ? " active" : ""}"
            data-game-key="${html(key)}"
            data-phase="${phase}"
            type="button"
            aria-label="${html(label)}"
          >
            <span class="game-tile-main">
              <span class="game-team-row">
                <img
                  src="${logo(away.team_id)}"
                  alt="${html(away.abbr || "Away")}"
                >
                <strong>${html(away.abbr || "AWY")}</strong>
                <b>${html(awayScore)}</b>
              </span>

              <span class="game-team-row">
                <img
                  src="${logo(home.team_id)}"
                  alt="${html(home.abbr || "Home")}"
                >
                <strong>${html(home.abbr || "HME")}</strong>
                <b>${html(homeScore)}</b>
              </span>
            </span>

            <span class="game-tile-meta">
              <span class="game-tile-status">
                ${html(statusLabel(game))}
              </span>

              ${
                doubleheaderNumber
                  ? `<span class="game-number-badge">G${doubleheaderNumber}</span>`
                  : ""
              }
            </span>
          </button>
        `;
      }).join("") ||
      `<p class="game-list-empty">No games on this date.</p>`;

    document
      .querySelectorAll("[data-game-key]")
      .forEach(button =>
        button.addEventListener(
          "click",
          () =>
            startGame(
              button.dataset.gameKey
            )
        )
      );
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

  function getActiveMatchup() {
    const defenseSide = state.simulated.half === "top" ? "home" : "away";
    const offenseSide = defenseSide === "home" ? "away" : "home";
    const lineup = getLineup(offenseSide);
    const pitcher = state.game.pitchers?.[defenseSide] || {};
    const batter = lineup.players[state.currentBatterIndex % Math.max(1, lineup.players.length)] || {};
    return { defenseSide, offenseSide, lineup, pitcher, batter, batterHand: batter.matchup_bats || batter.bats || "R" };
  }

  function buildInitialPitchHistory(game) {
    const seed = Number(game.mlb_game_pk || game.venue?.id || 17);
    return [
      { x: 46 + (seed % 11), y: 66, label: "FF", result: "Called strike" },
      { x: 59, y: 43 + (seed % 8), label: "SL", result: "Foul" },
      { x: 38 + (seed % 7), y: 78, label: "SP", result: "Ball" }
    ];
  }

  function normalizeWallProfile(park) {
    const explicit = park?.field_geometry?.wall_points_feet;
    if (Array.isArray(explicit) && explicit.length >= 3) return explicit;
    const dimensions = park?.field_geometry?.dimensions_ft || {};
    const profile = [
      ["LF", -45, dimensions.left_line || 330],
      ["LCF", -25, dimensions.left_center || 375],
      ["CF", 0, dimensions.center || 400],
      ["RCF", 25, dimensions.right_center || 375],
      ["RF", 45, dimensions.right_line || 330]
    ];
    return profile.map(([label, angle, distance]) => {
      const radians = angle * Math.PI / 180;
      return { label, distance_ft: distance, x_ft: Math.sin(radians) * distance, y_ft: Math.cos(radians) * distance, wall_height_ft: null };
    });
  }

  function createFieldProjection(wallPoints) {
    const maxY = Math.max(...wallPoints.map(point => Number(point.y_ft) || 400), 400);
    const maxX = Math.max(...wallPoints.map(point => Math.abs(Number(point.x_ft) || 235)), 235);
    const scale = Math.min(1.34, 510 / maxY, 385 / maxX);
    return {
      scale,
      homeX: 500,
      homeY: 621,
      project(xFeet, yFeet) {
        return { x: 500 + Number(xFeet || 0) * scale, y: 621 - Number(yFeet || 0) * scale };
      }
    };
  }

  function smoothWallPath(points) {
    if (!points.length) return "";
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
      path += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midpoint.x.toFixed(1)} ${midpoint.y.toFixed(1)}`;
    }
    if (points.length > 1) {
      const last = points.at(-1);
      path += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    }
    return path;
  }

  function insetWallPoint(point, amountFeet = 12) {
    const distance = Math.hypot(point.x_ft, point.y_ft) || 1;
    const ratio = Math.max(0.75, (distance - amountFeet) / distance);
    return { ...point, x_ft: point.x_ft * ratio, y_ft: point.y_ft * ratio };
  }

  function renderPark() {
    const park = state.parks.find(item => Number(item.id) === Number(state.game.venue?.id));
    const wallPoints = normalizeWallProfile(park);
    const projection = createFieldProjection(wallPoints);
    state.fieldProjection = projection;
    const projectedWall = wallPoints.map(point => ({ ...projection.project(point.x_ft, point.y_ft), ...point }));
    const projectedTrack = wallPoints.map(point => insetWallPoint(point)).map(point => projection.project(point.x_ft, point.y_ft));
    const home = projection.project(0, 0);
    const wallPath = smoothWallPath(projectedWall);
    const trackPath = smoothWallPath(projectedTrack);
    $("outfieldShape").setAttribute("d", `M ${home.x} ${home.y} L ${projectedWall[0].x.toFixed(1)} ${projectedWall[0].y.toFixed(1)} ${wallPath.replace(/^M [^ ]+ [^ ]+/, "")} L ${home.x} ${home.y} Z`);
    $("warningTrack").setAttribute("d", trackPath);
    $("foulLineLeft").setAttribute("d", `M ${home.x} ${home.y} L ${projectedWall[0].x.toFixed(1)} ${projectedWall[0].y.toFixed(1)}`);
    $("foulLineRight").setAttribute("d", `M ${home.x} ${home.y} L ${projectedWall.at(-1).x.toFixed(1)} ${projectedWall.at(-1).y.toFixed(1)}`);

    const first = projection.project(63.64, 63.64);
    const second = projection.project(0, 127.28);
    const third = projection.project(-63.64, 63.64);
    const mound = projection.project(0, 60.5);
    $("infieldShape").setAttribute("d", `M ${second.x} ${second.y} L ${first.x} ${first.y} L ${home.x} ${home.y} L ${third.x} ${third.y} Z`);
    $("baselineShape").setAttribute("d", `M ${home.x} ${home.y} L ${first.x} ${first.y} L ${second.x} ${second.y} L ${third.x} ${third.y} Z`);
    $("moundShape").setAttribute("cx", mound.x); $("moundShape").setAttribute("cy", mound.y);
    [["homePlateShape",home],["firstBaseShape",first],["secondBaseShape",second],["thirdBaseShape",third]].forEach(([id, point]) => {
      const node = $(id); const size = id === "homePlateShape" ? 22 : 20;
      node.setAttribute("x", point.x - size / 2); node.setAttribute("y", point.y - size / 2); node.setAttribute("width", size); node.setAttribute("height", size);
      node.setAttribute("transform", `rotate(45 ${point.x} ${point.y})`);
    });

    $("dimensionLabels").innerHTML = projectedWall.map((point, index) => {
      const show = index === 0 || index === projectedWall.length - 1 || point.label === "CF" || wallPoints.length <= 6 || index % 2 === 0;
      if (!show) return "";
      const labelY = Math.max(28, point.y - 12);
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"></circle><text x="${point.x.toFixed(1)}" y="${labelY.toFixed(1)}">${html(point.label || "WALL")} ${Math.round(point.distance_ft || Math.hypot(point.x_ft, point.y_ft))}'</text>`;
    }).join("");

    const geometryVerified = park?.field_geometry?.verification_status === "verified";
    $("ballparkConsole").classList.toggle("geometry-verified", geometryVerified);
    $("ballparkConsole").classList.toggle("geometry-calibration", !geometryVerified);
    $("parkGeometryLabel").textContent = `${park?.name || state.game.venue?.name || "BALLPARK"} · FEET-BASED MAP`;
    $("geometryStatus").textContent = geometryVerified ? "DIMENSIONS VERIFIED · HOME PLATE ORIGIN ACTIVE" : "COORDINATE SYSTEM ACTIVE · WALL CALIBRATION PENDING";

    const { defenseSide, lineup, pitcher } = getActiveMatchup();
    const defensiveLineup = getLineup(defenseSide);
    const fielders = defensiveLineup.players.filter(player => player.position !== "DH");
    if (!fielders.some(player => player.position === "P")) fielders.push({ id: pitcher.id, name: pitcher.name || "Pitcher", position: "P" });
    $("fieldPlayers").innerHTML = fielders.map((player, index) => {
      const feet = positionFeet[player.position] || [((index % 3) - 1) * 60, 150 + Math.floor(index / 3) * 55];
      const point = projection.project(feet[0], feet[1]);
      const pulseClass = index === 1 ? "hot" : index === 6 ? "cold" : "";
      return `<div class="field-player ${pulseClass}" style="left:${(point.x / 10).toFixed(2)}%;top:${(point.y / 6.9).toFixed(2)}%"><button type="button" data-field-player="${html(player.id || "")}" data-player-name="${html(player.name || player.position)}"><i>${html(player.position || "—")}</i><span>${html(shortName(player.name || player.position))}</span></button></div>`;
    }).join("");
    document.querySelectorAll("[data-field-player]").forEach(button => button.addEventListener("click", () => navigatePlayer(button.querySelector("i")?.textContent === "P" ? "pitcher" : "batter", button.dataset.fieldPlayer, button.dataset.playerName)));
    $("fieldCoordinateReadout").textContent = `${wallPoints.length} wall control points · scale ${projection.scale.toFixed(2)} px/ft · ${geometryVerified ? "verified profile" : "calibration profile"}`;
    renderBaseState();
  }

  function shortName(name) {
    const parts = String(name || "").split(" ");
    return parts.length > 1 ? `${parts[0][0]}. ${parts.at(-1)}` : name;
  }

  function setHudView(view, manual = true) {
    state.hudView = view === "plate" ? "plate" : "field";
    if (manual && state.autoView) {
      state.autoView = false;
      $("autoViewButton").setAttribute("aria-pressed", "false");
    }
    const fieldActive = state.hudView === "field";
    $("fieldHudView").classList.toggle("active", fieldActive);
    $("fieldHudView").hidden = !fieldActive;
    $("plateHudView").classList.toggle("active", !fieldActive);
    $("plateHudView").hidden = fieldActive;
    $("ballparkStage").classList.toggle("field-mode", fieldActive);
    $("ballparkStage").classList.toggle("plate-mode", !fieldActive);
    $("fieldViewButton").classList.toggle("active", fieldActive);
    $("plateViewButton").classList.toggle("active", !fieldActive);
    if (!fieldActive) renderPlateView();
  }

  function toggleAutoView() {
    state.autoView = !state.autoView;
    $("autoViewButton").setAttribute("aria-pressed", String(state.autoView));
    if (state.autoView) {
      setHudView("plate", false);
      showToast("Auto view enabled: plate before pitches, field after balls in play.");
    } else {
      showToast("Auto view disabled.");
    }
  }

  function setHeatLayer(layer) {
    state.heatLayer = ["combined", "batter", "pitcher", "live"].includes(layer) ? layer : "combined";
    document.querySelectorAll("[data-heat-layer]").forEach(button => button.classList.toggle("active", button.dataset.heatLayer === state.heatLayer));
    renderPlateView();
  }

  function heatCellClass(score) {
    const magnitude = Math.abs(score);
    if (magnitude < 0.12) return "neutral";
    const level = magnitude >= 0.55 ? 3 : magnitude >= 0.3 ? 2 : 1;
    return `${score > 0 ? "batter" : "pitcher"}-${level}`;
  }

  function getHeatLayerMatrix(surface) {
    if (state.heatLayer === "combined") return surface.combined;
    if (state.heatLayer === "batter") return surface.batter.map(row => row.map(value => (value - 0.5) * 2));
    if (state.heatLayer === "pitcher") return surface.pitcher.map(row => row.map(value => -(value - 0.5) * 2));
    return surface.live.map(row => row.map(value => -(value - 0.5) * 2));
  }

  function renderPlateView() {
    if (!state.game || !window.BoringBetsHeatMapEngine) return;
    const { pitcher, batter, batterHand } = getActiveMatchup();
    const surface = window.BoringBetsHeatMapEngine.buildPrototype({
      pitcherId: pitcher.id,
      batterId: batter.id,
      batterHand,
      balls: state.simulated.balls,
      strikes: state.simulated.strikes
    });
    const matrix = getHeatLayerMatrix(surface);
    $("platePitcherName").textContent = pitcher.name || "Starter TBD";
    $("platePitcherHand").textContent = `${pitcher.throws || "R"}HP`;
    $("plateBatterName").textContent = batter.name || "Lineup Pending";
    $("plateBatterHand").textContent = `${batterHand || "R"}HB`;
    $("plateCountLabel").textContent = `COUNT ${state.simulated.balls}–${state.simulated.strikes}`;
    const batterFigure = $("batterSilhouette");
    batterFigure.classList.toggle("left-handed", batterHand === "L");
    batterFigure.setAttribute("transform", batterHand === "L" ? "translate(1000 0) scale(-1 1)" : "");
    $("heatmapStatus").textContent = "STRUCTURE DEMO";
    const layerNames = { combined: "COMBINED MATCHUP EDGE", batter: "BATTER DAMAGE SURFACE", pitcher: "PITCHER ATTACK SURFACE", live: "CURRENT LIVE COMMAND" };
    $("heatmapMetricName").textContent = layerNames[state.heatLayer];
    $("strikeZoneGrid").innerHTML = matrix.flatMap((row, rowIndex) => row.map((score, columnIndex) => {
      const percent = Math.round(score * 100);
      const zone = window.BoringBetsHeatMapEngine.zoneLabel(rowIndex, columnIndex, batterHand);
      return `<div class="heat-cell ${heatCellClass(score)}" data-value="${percent > 0 ? "+" : ""}${percent}" title="${html(zone)} · ${percent > 0 ? "batter" : percent < 0 ? "pitcher" : "neutral"} edge ${Math.abs(percent)}%"></div>`;
    })).join("");

    $("batterAdvantageZone").textContent = surface.summary.batter_zone;
    $("batterAdvantageDetail").textContent = `${Math.round(Math.abs(surface.summary.batter_score) * 100)}% prototype overlap toward batter`;
    $("pitcherAdvantageZone").textContent = surface.summary.pitcher_zone;
    $("pitcherAdvantageDetail").textContent = `${Math.round(Math.abs(surface.summary.pitcher_score) * 100)}% prototype overlap toward pitcher`;
    const pitchCall = likelyPitchCall(pitcher, state.simulated);
    $("likelyPitch").textContent = `${pitchCall.name} ${pitchCall.probability}%`;
    $("likelyPitchDetail").textContent = pitchCall.detail;
    renderPitchLocations();
    renderPlateHistory();
  }

  function likelyPitchCall(pitcher, gameState) {
    if (gameState.strikes >= 2) return { name: "PUT-AWAY PITCH", probability: 41, detail: "Two-strike arsenal branch · prototype" };
    if (gameState.balls >= 3) return { name: "FOUR-SEAM", probability: 52, detail: "Strike-acquisition branch · prototype" };
    if (gameState.balls > gameState.strikes) return { name: "FOUR-SEAM", probability: 38, detail: `${pitcher.throws || "R"}HP behind-count branch · prototype` };
    return { name: "SECONDARY", probability: 34, detail: "Even-count sequencing branch · prototype" };
  }

  function renderPitchLocations() {
    $("pitchLocationLayer").innerHTML = state.pitchHistory.slice(-7).map((pitch, index, list) => {
      const latest = index === list.length - 1;
      return `<i class="pitch-dot${latest ? " latest" : ""}" style="left:${pitch.x}%;top:${pitch.y}%"><small>${html(pitch.label || "P")}</small></i>`;
    }).join("");
  }

  function renderPlateHistory() {
    $("plateHistoryStrip").innerHTML = state.pitchHistory.slice(-5).reverse().map((pitch, index) => `<span class="plate-history-item"><i></i>${index === 0 ? "LAST" : `P-${index}`} · ${html(pitch.label || "PITCH")} · ${html(pitch.result || "Location")}</span>`).join("");
  }

  function recordPitchLocation(label, result) {
    const index = state.eventIndex + Number(state.game?.mlb_game_pk || 0);
    const x = 23 + ((index * 37) % 56);
    const y = 17 + ((index * 53) % 70);
    state.pitchHistory.push({ x, y, label: String(label || "P").slice(0, 2), result });
    if (state.pitchHistory.length > 12) state.pitchHistory.shift();
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
    renderCountLights();
    renderMiniPlate();
    renderLineScore();
    renderGameRail();
    renderFullPlateHudState();
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


  function renderCountLights() {
    const makeLights = (count, total) => Array.from({ length: total }, (_, index) => `<b class="${index < count ? "active" : ""}"></b>`).join("");
    $("ballLights").innerHTML = makeLights(state.simulated.balls, 3);
    $("strikeLights").innerHTML = makeLights(state.simulated.strikes, 2);
    $("outLights").innerHTML = makeLights(state.simulated.outs, 2);
  }

  function renderMiniPlate() {
    const latest = state.pitchHistory.at(-1) || { x: 50, y: 50 };
    $("miniPitchDot").style.left = `${Math.max(4, Math.min(96, latest.x))}%`;
    $("miniPitchDot").style.top = `${Math.max(4, Math.min(96, latest.y))}%`;
  }

  function toggleGameStateDock() {
    const dock = $("gameStateDock");
    const collapsed = dock.classList.toggle("collapsed");
    $("toggleGameStateDock").setAttribute("aria-expanded", String(!collapsed));
  }


  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatLowerValue(value, digits = 2) {
    if (value == null || value === "") return "—";
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits);
    return String(value);
  }

  function completedInningsFor(side) {
    const s = state.simulated;
    if (side === "away") return clamp(s.inning, 0, 9);
    return clamp(s.inning - 1 + (s.half === "bottom" ? 1 : 0), 0, 9);
  }

  function allocateRuns(total, completed, seed, sideOffset = 0) {
    const cells = Array.from({ length: 9 }, (_, index) => index < completed ? 0 : "–");
    if (!completed) return cells;
    let remaining = Math.max(0, Number(total) || 0);
    let cursor = (seed + sideOffset) % completed;
    while (remaining > 0) {
      const burst = remaining >= 3 && (cursor + seed) % 4 === 0 ? 2 : 1;
      cells[cursor] += Math.min(burst, remaining);
      remaining -= Math.min(burst, remaining);
      cursor = (cursor + 2 + sideOffset) % completed;
    }
    return cells;
  }

  function boxScoreData() {
    const s = state.simulated;
    const seed = Number(state.game.mlb_game_pk || state.game.venue?.id || 17);
    const awayCompleted = completedInningsFor("away");
    const homeCompleted = completedInningsFor("home");
    const awayRuns = allocateRuns(s.awayScore, awayCompleted, seed, 1);
    const homeRuns = allocateRuns(s.homeScore, homeCompleted, seed, 2);
    const awayHits = Math.max(s.awayScore + 3, s.awayScore * 2 + (seed % 4));
    const homeHits = Math.max(s.homeScore + 3, s.homeScore * 2 + ((seed + 2) % 4));
    return {
      away: { runs: awayRuns, total: s.awayScore, hits: awayHits, errors: seed % 2 },
      home: { runs: homeRuns, total: s.homeScore, hits: homeHits, errors: (seed + 1) % 2 }
    };
  }

  function renderFullBoxScore() {
    if (!$("fullBoxScore")) return;
    const data = boxScoreData();
    const game = state.game;
    const s = state.simulated;
    const header = Array.from({ length: 9 }, (_, index) => `<th>${index + 1}</th>`).join("");
    const teamRow = (side, row) => {
      const team = game[`${side}_team`] || {};
      const cells = row.runs.map((value, index) => {
        const active = index + 1 === s.inning && ((side === "away" && s.half === "top") || (side === "home" && s.half === "bottom"));
        return `<td class="${active ? "current-inning" : ""}">${html(value)}</td>`;
      }).join("");
      return `<tr><td><span><img src="${logo(team.team_id)}" alt=""><b>${html(team.abbr || side.toUpperCase())}</b></span></td>${cells}<td class="totals-cell run-total">${row.total}</td><td class="totals-cell">${row.hits}</td><td class="totals-cell">${row.errors}</td></tr>`;
    };
    $("fullBoxScore").innerHTML = `<table class="full-box-score"><thead><tr><th>TEAM</th>${header}<th>R</th><th>H</th><th>E</th></tr></thead><tbody>${teamRow("away", data.away)}${teamRow("home", data.home)}</tbody></table>`;
    $("fullBoxScoreTitle").textContent = `${game.away_team?.abbr || "Away"} at ${game.home_team?.abbr || "Home"} · All nine innings`;
    $("boxScoreStatus").textContent = `${s.half === "top" ? "TOP" : "BOTTOM"} ${s.inning}`;
    $("boxScoreFoot").innerHTML = `<div><span>LEFT ON BASE</span><strong>${game.away_team?.abbr || "AWY"} ${2 + (data.away.hits % 6)} · ${game.home_team?.abbr || "HME"} ${2 + (data.home.hits % 6)}</strong></div><div><span>LAST SCORING PLAY</span><strong>${html(state.events.find(item => item.title === "IN PLAY")?.detail || "No scoring play recorded in demo feed")}</strong></div><div><span>GAME LENGTH</span><strong>${Math.floor(2 + state.simulated.inning / 4)}:${String(17 + state.eventIndex * 2).padStart(2,"0")} · ${state.demo ? "SIMULATED" : "LIVE"}</strong></div>`;
  }

  function flowProbabilities() {
    const data = boxScoreData();
    const points = [50];
    let away = 0;
    let home = 0;
    for (let inning = 0; inning < 9; inning += 1) {
      if (data.away.runs[inning] !== "–") away += Number(data.away.runs[inning]) || 0;
      if (data.home.runs[inning] !== "–") home += Number(data.home.runs[inning]) || 0;
      const leverage = 1 + inning * .45;
      const probability = clamp(50 + (away - home) * (5.5 + leverage) + (state.simulated.half === "top" ? 1.5 : -1.5), 8, 92);
      points.push(probability);
    }
    return points;
  }

  function renderFlowOfGame() {
    if (!$("flowLinePath")) return;
    const probabilities = flowProbabilities();
    const coords = probabilities.map((probability, index) => ({ x: 42 + index * 61.8, y: 225 - probability * 2 }));
    const line = coords.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const area = `${line} L ${coords.at(-1).x.toFixed(1)} 225 L 42 225 Z`;
    $("flowLinePath").setAttribute("d", line);
    $("flowAreaPath").setAttribute("d", area);
    const current = coords[Math.min(coords.length - 1, state.simulated.inning)];
    $("flowCurrentMarker").setAttribute("cx", current.x.toFixed(1));
    $("flowCurrentMarker").setAttribute("cy", current.y.toFixed(1));
    const awayProbability = Math.round(probabilities[Math.min(probabilities.length - 1, state.simulated.inning)]);
    const homeProbability = 100 - awayProbability;
    $("flowControlLabel").textContent = awayProbability > 57 ? `${state.game.away_team?.abbr} CONTROL` : homeProbability > 57 ? `${state.game.home_team?.abbr} CONTROL` : "EVEN GAME";
    $("flowControlDetail").textContent = `${awayProbability}% ${state.game.away_team?.abbr} · ${homeProbability}% ${state.game.home_team?.abbr}`;
    const seed = Number(state.game.mlb_game_pk || 17);
    const eventPressure = state.events.slice(0, 8).reduce((total, item) => total + (item.type === "positive" ? 1.8 : item.type === "negative" ? -1.4 : 0), 0);
    const deserveAway = clamp(Math.round(50 + (state.simulated.awayScore - state.simulated.homeScore) * 4 + ((seed % 9) - 4) + eventPressure), 18, 82);
    const deserveHome = 100 - deserveAway;
    $("deserveAwayLabel").textContent = `${state.game.away_team?.abbr || "AWY"} ${deserveAway}%`;
    $("deserveHomeLabel").textContent = `${state.game.home_team?.abbr || "HME"} ${deserveHome}%`;
    $("deserveAwayFill").style.width = `${deserveAway}%`;
    $("deserveMarker").style.left = `${deserveAway}%`;
    $("deserveExplanation").textContent = state.demo ? "Prototype model uses simulated contact quality, scoring pressure and game state until real xBA/xSLG inputs are connected." : "Model blends contact quality, expected runs, sequencing and scoring pressure.";
  }

  function americanOdds(probability) {
    const p = clamp(probability / 100, .05, .95);
    return p >= .5 ? `-${Math.round((p / (1 - p)) * 100)}` : `+${Math.round(((1 - p) / p) * 100)}`;
  }

  function renderOddsCenter() {
    if (!$("oddsGrid")) return;
    const game = state.game;
    const s = state.simulated;
    const market = game.market || {};
    const awayProbability = clamp(48 + (s.awayScore - s.homeScore) * 6 + (s.half === "top" ? 2 : -2), 12, 88);
    const homeProbability = 100 - awayProbability;
    const liveTotal = Math.max(5.5, s.awayScore + s.homeScore + 3.5).toFixed(1);
    $("oddsAwayAbbr").textContent = game.away_team?.abbr || "AWY";
    $("oddsHomeAbbr").textContent = game.home_team?.abbr || "HME";
    $("oddsAwayMoneyline").textContent = market.live_away_moneyline || americanOdds(awayProbability);
    $("oddsHomeMoneyline").textContent = market.live_home_moneyline || americanOdds(homeProbability);
    $("oddsLiveTotal").textContent = market.live_total || liveTotal;
    $("oddsLiveTotalPrice").textContent = market.live_total_price || "-110";
    $("oddsFeedStatus").textContent = Object.keys(market).length ? "MARKET FEED" : "DEMO MARKET";
    const tiles = [
      ["PREGAME ML", `${game.away_team?.abbr || "AWY"} +105 / ${game.home_team?.abbr || "HME"} -115`, "Opening consensus", ""],
      ["RUN LINE", `${game.home_team?.abbr || "HME"} -1.5 +145`, "Live alternate", awayProbability > 55 ? "moved-down" : ""],
      ["PREGAME TOTAL", "8.0 -108", "Close", ""],
      ["LIVE TOTAL", `${liveTotal} -110`, `${Number(liveTotal) < 8 ? "Down" : "Up"} from open`, Number(liveTotal) < 8 ? "moved-down" : "moved-up"],
      ["F5 RESULT", `${s.awayScore > s.homeScore ? game.away_team?.abbr : game.home_team?.abbr} +0.5`, "Settled / projected", ""],
      ["NEXT INNING", `${s.half === "top" ? game.home_team?.abbr : game.away_team?.abbr} +0.5 -155`, "Inning market", ""]
    ];
    $("oddsGrid").innerHTML = tiles.map(([label,value,note,className]) => `<div class="odds-tile ${className}"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(note)}</small></div>`).join("");
    $("movementOpenLabel").textContent = "OPEN 8.0";
    $("movementCurrentLabel").textContent = `LIVE ${liveTotal}`;
    $("movementOpenMarker").style.left = "42%";
    $("movementCurrentMarker").style.left = `${clamp(42 + (8 - Number(liveTotal)) * 12, 8, 92)}%`;
    $("marketMoveSummary").textContent = Number(liveTotal) < 8 ? `Total down ${(8-Number(liveTotal)).toFixed(1)} runs` : `Total up ${(Number(liveTotal)-8).toFixed(1)} runs`;
  }

  function bullpenTeamCard(side) {
    const team = state.game[`${side}_team`] || {};
    const bullpen = state.game.bullpens?.[side] || {};
    const recent = bullpen.stats?.last_7?.all || {};
    const month = bullpen.stats?.last_30?.all || {};
    const season = bullpen.stats?.season?.all || {};
    const usedYesterday = Number(bullpen.used_yesterday ?? bullpen.usage?.used_yesterday?.length ?? 0);
    const backToBack = Number(bullpen.back_to_back ?? bullpen.usage?.back_to_back_pitcher_ids?.length ?? 0);
    const freshnessClass = usedYesterday + backToBack >= 4 ? "warning" : "";
    const freshness = usedYesterday + backToBack >= 4 ? "WORKLOAD RISK" : usedYesterday + backToBack >= 2 ? "MIXED" : "FRESH";
    const metric = (label,value) => `<div><span>${label}</span><strong>${html(formatLowerValue(value))}</strong></div>`;
    return `<section class="lower-bullpen-team"><div class="bullpen-team-heading"><div><img src="${logo(team.team_id)}" alt=""><div><span>${html(team.abbr || side.toUpperCase())} BULLPEN</span><strong>${html(team.name || bullpen.team || "Bullpen")}</strong></div></div><b class="bullpen-freshness ${freshnessClass}">${freshness}</b></div><div class="bullpen-stat-grid">${metric("7D ERA",recent.era)}${metric("7D WHIP",recent.whip)}${metric("30D ERA",month.era)}${metric("SEASON ERA",season.era)}${metric("K",recent.strikeouts)}${metric("SV/OPP",`${recent.saves ?? "—"}/${recent.save_opportunities ?? "—"}`)}</div><div class="bullpen-usage-row"><div><span>USED YESTERDAY</span><strong>${usedYesterday}</strong></div><div><span>BACK-TO-BACK</span><strong>${backToBack}</strong></div><div><span>LEVERAGE STATUS</span><strong>${html(bullpen.fresh_leverage || (freshness === "FRESH" ? "Available" : "Check arms"))}</strong></div></div></section>`;
  }

  function renderLowerBullpens() {
    if (!$("lowerBullpens")) return;
    $("lowerBullpens").innerHTML = bullpenTeamCard("away") + bullpenTeamCard("home");
  }

  function renderCompleteEventLog() {
    if (!$("completeEventLog")) return;
    const events = state.eventFilter === "alerts" ? state.events.filter(item => item.isAlert) : state.events;
    $("completeLogCount").textContent = `${events.length} EVENT${events.length === 1 ? "" : "S"}`;
    $("lowerLogAll").classList.toggle("active", state.eventFilter === "all");
    $("lowerLogAlerts").classList.toggle("active", state.eventFilter === "alerts");
    $("completeEventLog").innerHTML = events.length ? events.map((item,index) => `<div class="complete-event-row ${html(item.type)}"><time>${html(item.time)}</time><span>${html(item.title)}</span><strong>${html(item.detail)}</strong><small>${html(item.meta)} · #${String(events.length-index).padStart(3,"0")}</small></div>`).join("") : `<div class="complete-log-empty">No events match this filter.</div>`;
  }

  function renderLowerGameModules() {
    if (!state.game || !$("liveGameScroll")) return;
    renderFlowOfGame();
    renderFullBoxScore();
    renderOddsCenter();
    renderLowerBullpens();
    renderCompleteEventLog();
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

  let livePollInFlight = false;

  function startLiveFeed() {
    clearInterval(state.timer);
    state.demo = false;

    refreshLiveSlate();

    state.timer = setInterval(() => {
      refreshLiveSlate();
    }, 3000);
  }

  async function refreshLiveSlate() {
    if (
      state.paused ||
      !state.game ||
      livePollInFlight
    ) {
      return;
    }

    const entry = (state.index?.dates || []).find(
      item => item.date === state.game.date
    );

    if (!entry?.file) {
      return;
    }

    livePollInFlight = true;

    try {
      const response = await fetch(
        `${entry.file}?v=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(
          `Live slate returned HTTP ${response.status}.`
        );
      }

      const payload = await response.json();
      const games = Array.isArray(payload.games)
        ? payload.games
        : [];

      const currentGame = games.find(
        game =>
          gameKey(game) ===
          gameKey(state.game)
      );

      if (!currentGame) {
        throw new Error(
          `Game ${state.game.id} is missing from the live slate.`
        );
      }

      state.games = games;
      state.dayGames = games;
      state.game = currentGame;
      state.simulated = deriveLiveState(
        currentGame,
        state.simulated
      );
      state.demo = false;

      renderEverything();

      $("feedHealthText").textContent = "LIVE FEED";
      document
        .querySelector(".feed-health")
        ?.classList.remove("stale");
    } catch (error) {
      console.warn("Live refresh failed:", error);

      $("feedHealthText").textContent = "FEED RETRYING";
      document
        .querySelector(".feed-health")
        ?.classList.add("stale");
    } finally {
      livePollInFlight = false;
    }
  }

  function simulatePitch() {
    const s = state.simulated;
    if (state.autoView) setHudView("plate", false);

    // Demo-only event branches exercise the same normalized animation adapter
    // that the future low-latency live feed will call.
    if (state.eventIndex > 0 && state.eventIndex % 13 === 0) return simulateBattedBall("home-run");
    if (state.eventIndex > 0 && state.eventIndex % 7 === 0) return simulateBattedBall("line-drive");

    const pitches = [
      ["97.1 MPH FOUR-SEAM", "CALLED STRIKE", "called-strike"],
      ["87.4 MPH SLIDER", "SWINGING STRIKE", "swinging-strike"],
      ["90.2 MPH SPLITTER", "BALL IN DIRT", "ball"],
      ["95.8 MPH SINKER", "FOUL", "foul"],
      ["86.9 MPH CHANGEUP", "BALL LOW", "ball"]
    ];
    const pick = pitches[state.eventIndex % pitches.length];
    state.eventIndex += 1;
    s.pitchCount += 1;
    const outcome = pick[1];
    const pitchLabel = pick[0].includes("FOUR-SEAM") ? "FF" : pick[0].includes("SLIDER") ? "SL" : pick[0].includes("SPLITTER") ? "SP" : pick[0].includes("SINKER") ? "SI" : "CH";
    recordPitchLocation(pitchLabel, outcome);
    if (outcome.includes("STRIKE")) s.strikes += 1;
    else if (outcome.includes("BALL")) s.balls += 1;
    if (outcome === "FOUL" && s.strikes < 2) s.strikes += 1;
    $("lastPitch").textContent = `${pick[0]} · ${pick[1]}`;
    const latency = 38 + (state.eventIndex % 19);
    state.events.unshift(event("pitch", "PITCH", `${pick[0]} — ${pick[1].toLowerCase()}.`, `Feed received in ${latency}ms`));

    let animationType = pick[2];
    let animationBanner = pick[1];
    if (s.strikes >= 3) {
      animationType = "strikeout";
      animationBanner = "STRIKEOUT";
      advancePlateAppearance("Strikeout");
    } else if (s.balls >= 4) {
      animationType = "ball";
      animationBanner = "WALK";
      advancePlateAppearance("Walk");
    }

    if (state.eventIndex % 5 === 0) {
      const alertEvent = event(state.eventIndex % 10 === 0 ? "negative" : "positive", state.eventIndex % 10 === 0 ? "FATIGUE CHANGE" : "PITCH QUALITY", state.eventIndex % 10 === 0 ? "Release point dropped another 1.7 inches." : "Whiff rate remains above expected baseline.", "Live intelligence condition updated", true);
      state.events.unshift(alertEvent);
      pulsePage(alertEvent.type);
    }
    $("feedLatency").textContent = `${latency}ms`;
    $("gameClock").textContent = `SIMULATED LIVE · ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;

    // State and logs render first. The cinematic layer starts on the next frame
    // so presentation can never hold up the live score/count update.
    renderScoreBug(); renderPitcherPanel(); renderPlateView(); renderEvents(); renderLowerGameModules();
    const latest = state.pitchHistory.at(-1) || { x: 50, y: 50 };
    requestAnimationFrame(() => playPlateEventAnimation(animationType, {
      banner: animationBanner,
      detail: `${pick[0]} · ${pick[1]}`,
      liveText: `${pick[0]} — ${pick[1]}`,
      x: 44 + latest.x * .12,
      y: 57 + latest.y * .18
    }));
  }

  function simulateBattedBall(kind) {
    const s = state.simulated;
    const { batter } = getActiveMatchup();
    const offenseSide = s.half === "top" ? "away" : "home";
    const direction = state.eventIndex % 2 ? "left" : "right";
    state.eventIndex += 1;
    s.pitchCount += 1;
    recordPitchLocation("FF", "IN PLAY");
    const runnerCount = s.bases.filter(Boolean).length;

    if (kind === "home-run") {
      const runs = runnerCount + 1;
      if (offenseSide === "away") s.awayScore += runs; else s.homeScore += runs;
      s.bases = [false, false, false];
      state.events.unshift(event("positive", "HOME RUN", `${batter.name || "Batter"} launches a ${direction === "left" ? "pulled" : "opposite-field"} home run.`, `${runs} run${runs === 1 ? "" : "s"} score · event animation`, true));
      $("lastPitch").textContent = "98.2 MPH FOUR-SEAM · HOME RUN";
    } else {
      const runs = Number(Boolean(s.bases[1])) + Number(Boolean(s.bases[2]));
      if (offenseSide === "away") s.awayScore += runs; else s.homeScore += runs;
      s.bases = [true, Boolean(s.bases[0]), false];
      state.events.unshift(event("pitch", "LINE DRIVE", `${batter.name || "Batter"} shoots a 104.8 MPH line drive to ${direction} field.`, `${runs ? `${runs} run${runs === 1 ? "" : "s"} score` : "Runner reaches"} · event animation`));
      $("lastPitch").textContent = "96.8 MPH FOUR-SEAM · 104.8 EV LINE DRIVE";
    }

    state.currentBatterIndex += 1;
    s.balls = 0; s.strikes = 0;
    const latency = 34 + (state.eventIndex % 15);
    $("feedLatency").textContent = `${latency}ms`;
    $("gameClock").textContent = `SIMULATED LIVE · ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    renderHeader(); renderLineup(); renderScoreBug(); renderPitcherPanel(); renderPlateView(); renderEvents(); renderLowerGameModules();
    requestAnimationFrame(() => playPlateEventAnimation(kind, {
      direction,
      banner: kind === "home-run" ? "HOME RUN" : "LINE DRIVE",
      detail: kind === "home-run" ? "Ball clears the wall." : `Ball driven toward ${direction} field.`,
      liveText: kind === "home-run" ? "CONTACT… DEEP DRIVE… GONE." : `CONTACT… LINE DRIVE TO ${direction.toUpperCase()} FIELD.`
    }));
    if (state.autoView && $("fullPlateHud")?.hidden) {
      setTimeout(() => { if (state.autoView) setHudView("field", false); }, kind === "home-run" ? 1650 : 950);
      setTimeout(() => { if (state.autoView) setHudView("plate", false); }, kind === "home-run" ? 3100 : 2200);
    }
  }

  function advancePlateAppearance(result) {
    const s = state.simulated;
    if (result === "Strikeout") s.outs += 1;
    else { s.bases = [true, s.bases[0], s.bases[1]]; }
    state.events.unshift(event(result === "Walk" ? "positive" : "pitch", result.toUpperCase(), `${$("bugBatter").textContent} ${result === "Walk" ? "reaches first base" : "strikes out"}.`, `Plate appearance complete · ${s.outs} out${s.outs === 1 ? "" : "s"}`, result === "Walk"));
    state.currentBatterIndex += 1;
    s.balls = 0; s.strikes = 0;
    if (s.outs >= 3) { s.outs = 0; s.bases = [false,false,false]; if (s.half === "top") s.half = "bottom"; else { s.half = "top"; s.inning += 1; } renderHeader(); renderPark(); renderFielders(); }
    if (state.autoView) {
      setHudView("field", false);
      setTimeout(() => { if (state.autoView) setHudView("plate", false); }, 1500);
    }
    renderLineup();
    renderPlateView();
    renderLowerGameModules();
  }

  function setEventFilter(filter) {
    state.eventFilter = filter;
    $("allEventsButton").classList.toggle("active", filter === "all");
    $("alertsOnlyButton").classList.toggle("active", filter === "alerts");
    renderEvents();
    renderCompleteEventLog();
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

  function setAnimatedText(id, value) {
    const node = $(id);
    if (!node) return;
    const next = String(value ?? "—");
    if (node.dataset.liveValue !== next) {
      node.dataset.liveValue = next;
      node.textContent = next;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        node.animate([{ opacity: .45, transform: "translateY(-2px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "ease-out" });
      }
    }
  }

  function renderFullPlateHudState() {
    if (!state.game || !$("fullPlateHud")) return;
    const s = state.simulated || {};
    const { pitcher, batter, batterHand } = getActiveMatchup();
    const away = state.game.away_team || {};
    const home = state.game.home_team || {};
    const venue = state.game.venue?.name || "TRON PARK";
    const pulse = playerPulse(state.currentBatterIndex);
    const defenseSide = s.half === "top" ? "home" : "away";
    const pitcherSample = pitcher.stats?.season?.[defenseSide] || pitcher.stats?.season?.all || {};
    const inning = `${s.half === "top" ? "▲" : "▼"} ${ordinal(s.inning || 1)}`;

    setAnimatedText("fullAwayAbbr", away.abbr || "AWY");
    setAnimatedText("fullHomeAbbr", home.abbr || "HME");
    setAnimatedText("fullAwayScore", s.awayScore ?? 0);
    setAnimatedText("fullHomeScore", s.homeScore ?? 0);
    setAnimatedText("fullPlateInning", inning);
    setAnimatedText("fullPlateCount", `${s.balls || 0}–${s.strikes || 0}`);
    setAnimatedText("fullPlateOuts", `${s.outs || 0} OUT${s.outs === 1 ? "" : "S"}`);
    ["fullBaseFirst", "fullBaseSecond", "fullBaseThird"].forEach((id, index) => $(id)?.classList.toggle("active", Boolean(s.bases?.[index])));

    setAnimatedText("fullBatterName", batter.name || "LINEUP PENDING");
    setAnimatedText("fullBatterOrder", (state.currentBatterIndex % 9) + 1);
    setAnimatedText("fullBatterMeta", `${batterHand || "R"}HB · ${batter.position || batter.primary_position || "BATTER"}`);
    setAnimatedText("fullBatterToday", pulse.line || "0–0");
    setAnimatedText("fullBatterPulse", pulse.label || "LIVE");
    const batterEvents = state.events.filter(item => ["IN PLAY", "STRIKEOUT", "WALK", "HOME RUN", "LINE DRIVE"].includes(item.title)).slice(0, 3);
    $("fullBatterGameEvents").innerHTML = batterEvents.length ? batterEvents.map(item => `<p>${html(item.title)} · ${html(item.detail)}</p>`).join("") : `<p>WAITING FOR FIRST PLATE APPEARANCE RESULT</p>`;

    setAnimatedText("fullPitcherName", pitcher.name || "STARTER TBD");
    setAnimatedText("fullPitcherHand", `${pitcher.throws || "R"}HP`);
    setAnimatedText("fullPitchCount", s.pitchCount ?? 0);
    setAnimatedText("fullPitcherLine", `${pitcherSample.innings_pitched || "—"} IP · ${pitcherSample.strikeouts ?? "—"} K · ${pitcherSample.earned_runs ?? "—"} ER`);
    setAnimatedText("fullLatestPitch", state.pitchHistory.at(-1)?.label || "—");
    setAnimatedText("fullPlateLatency", `${String($("feedLatency")?.textContent || "—").replace(/ms/i, "")} MS`);

    const latest = state.pitchHistory.at(-1) || { x: 50, y: 50 };
    $("fullZonePitchDot").style.left = `${clamp(latest.x, 4, 96)}%`;
    $("fullZonePitchDot").style.top = `${clamp(latest.y, 4, 96)}%`;
    $("fullPitchMiniZone").innerHTML = state.pitchHistory.slice(-6).map((pitch, index) => `<i style="left:${clamp(pitch.x, 4, 96)}%;top:${clamp(pitch.y, 4, 96)}%" title="${html(pitch.label)} · ${html(pitch.result)}"></i>`).join("");
    $("fullPitchList").innerHTML = state.pitchHistory.slice(-4).reverse().map((pitch, index) => `<div><b>${index + 1}</b><strong>${html(pitch.label || "PITCH")}</strong><small>${html(pitch.result || "LOCATION")}</small></div>`).join("") || `<div><b>—</b><strong>WAITING</strong><small>NO PITCHES</small></div>`;

    $("fullWallHome").textContent = home.abbr || "HOME TEAM";
    $("fullWallPark").textContent = venue.toUpperCase();
    $("fullParkScoreboard").textContent = `${away.abbr || "AWY"} ${s.awayScore ?? 0}  ·  ${home.abbr || "HME"} ${s.homeScore ?? 0}`;
    $("fullPlateHud").setAttribute("aria-label", `${away.abbr || "Away"} at ${home.abbr || "Home"} immersive Plate View HUD at ${venue}`);
  }

  function setPlateLook(value) {
    state.plateLook = clamp(Number(value) || 0, -1, 1);
    const world = $("plateTheaterWorld");
    if (!world) return;
    const xShift = -50 - state.plateLook * 5.5;
    const rotate = state.plateLook * 1.15;
    world.style.transform = `translate3d(${xShift}%,-50%,0) rotateY(${rotate}deg) scale(1.015)`;
  }

  function handlePlateLook(event) {
    const scene = $("fullPlateHudScene");
    if (!scene) return;
    const rect = scene.getBoundingClientRect();
    setPlateLook(((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2);
  }

  function openFullPlateHud() {
    const modal = $("fullPlateHud");
    if (!modal) return;
    renderFullPlateHudState();
    setPlateLook(0);
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("plate-hud-open");
    $("fullPlateHudScene")?.focus({ preventScroll: true });
  }

  function closeFullPlateHud() {
    const modal = $("fullPlateHud");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("event-pitch", "event-strikeout", "event-line-drive", "event-home-run", "event-foul");
    document.body.classList.remove("plate-hud-open");
    setPlateLook(0);
    $("openPlateHudButton")?.focus({ preventScroll: true });
  }

  function animatePlateBall(keyframes, duration = 680) {
    const ball = $("plateEventBall");
    if (!ball || $("fullPlateHud")?.hidden) return;
    ball.getAnimations().forEach(animation => animation.cancel());
    ball.animate(keyframes, { duration, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" });
  }

  function flashPlateEvent(text, glyph = "") {
    const banner = $("plateEventBanner");
    const glyphNode = $("plateEventGlyph");
    if (banner) {
      banner.textContent = text;
      banner.animate([{ opacity: 0, transform: "translate(-50%,-14px)" }, { opacity: 1, transform: "translate(-50%,0)" }, { opacity: 1, transform: "translate(-50%,0)", offset: .72 }, { opacity: 0, transform: "translate(-50%,10px)" }], { duration: 1400, easing: "ease-out" });
    }
    if (glyphNode && glyph) {
      glyphNode.textContent = glyph;
      glyphNode.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.55)" }, { opacity: .95, transform: "translate(-50%,-50%) scale(1.02)" }, { opacity: 0, transform: "translate(-50%,-50%) scale(1.2)" }], { duration: 1050, easing: "ease-out" });
    }
  }

  function playPlateEventAnimation(type, payload = {}) {
    state.lastPlateEvent = { type, payload, at: Date.now() };
    const modal = $("fullPlateHud");
    const sceneOpen = modal && !modal.hidden;
    const liveText = payload.liveText || payload.detail || type.replaceAll("-", " ").toUpperCase();
    setAnimatedText("fullPlateLiveFeed", liveText);
    if (!sceneOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    modal.classList.remove("event-pitch", "event-strikeout", "event-line-drive", "event-home-run", "event-foul");
    void modal.offsetWidth;
    const direction = payload.direction === "right" ? 1 : payload.direction === "left" ? -1 : (state.eventIndex % 2 ? 1 : -1);
    const endX = direction > 0 ? "82%" : "18%";
    const impact = $("plateEventImpact");

    if (type === "home-run") {
      modal.classList.add("event-home-run");
      flashPlateEvent(payload.banner || "HOME RUN", "HR");
      animatePlateBall([{ left: "50%", top: "73%", opacity: 0, transform: "translate(-50%,-50%) scale(.5)" }, { opacity: 1, offset: .08 }, { left: direction > 0 ? "66%" : "34%", top: "30%", opacity: 1, transform: "translate(-50%,-50%) scale(1)" }, { left: endX, top: "3%", opacity: 0, transform: "translate(-50%,-50%) scale(.35)" }], 1550);
      setPlateLook(direction * .78);
      setTimeout(() => setPlateLook(0), 1500);
    } else if (type === "line-drive") {
      modal.classList.add("event-line-drive");
      flashPlateEvent(payload.banner || "LINE DRIVE", "");
      animatePlateBall([{ left: "50%", top: "73%", opacity: 0 }, { left: "49%", top: "69%", opacity: 1, offset: .08 }, { left: endX, top: "43%", opacity: 1 }, { left: direction > 0 ? "91%" : "9%", top: "39%", opacity: 0 }], 820);
      setPlateLook(direction * .92);
      setTimeout(() => setPlateLook(0), 1050);
    } else if (type === "strikeout") {
      modal.classList.add("event-strikeout");
      flashPlateEvent(payload.banner || "STRIKEOUT", "K");
      animatePlateBall([{ left: "50%", top: "49%", opacity: 0 }, { left: "50%", top: "61%", opacity: 1 }, { left: `${clamp(payload.x ?? 52, 38, 62)}%`, top: `${clamp(payload.y ?? 67, 55, 77)}%`, opacity: 1 }, { opacity: 0 }], 560);
    } else if (type === "foul") {
      modal.classList.add("event-foul");
      flashPlateEvent("FOUL BALL");
      animatePlateBall([{ left: "50%", top: "72%", opacity: 0 }, { opacity: 1, offset: .1 }, { left: direction > 0 ? "88%" : "12%", top: "38%", opacity: 0 }], 620);
    } else {
      modal.classList.add("event-pitch");
      flashPlateEvent(payload.banner || (type === "ball" ? "BALL" : type === "called-strike" ? "CALLED STRIKE" : type === "swinging-strike" ? "SWING AND MISS" : "PITCH"));
      animatePlateBall([{ left: "50%", top: "48%", opacity: 0, transform: "translate(-50%,-50%) scale(.45)" }, { opacity: 1, offset: .1 }, { left: `${clamp(payload.x ?? 50, 39, 61)}%`, top: `${clamp(payload.y ?? 68, 55, 80)}%`, opacity: 1, transform: "translate(-50%,-50%) scale(1)" }, { opacity: 0, offset: 1 }], 590);
      if (impact) impact.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.2)" }, { opacity: .85, transform: "translate(-50%,-50%) scale(1.8)", offset: .55 }, { opacity: 0, transform: "translate(-50%,-50%) scale(3)" }], { duration: 620, easing: "ease-out" });
    }
    setTimeout(() => modal.classList.remove("event-pitch", "event-strikeout", "event-line-drive", "event-home-run", "event-foul"), 1750);
  }

  function ingestPlateEvent(payload = {}) {
    if (!state.game) return;
    if (payload.state && typeof payload.state === "object") Object.assign(state.simulated, payload.state);
    if (payload.pitch) recordPitchLocation(payload.pitch.label || payload.pitch.type || "P", payload.pitch.result || payload.type || "LIVE");
    if (payload.event) state.events.unshift(event(payload.event.type || "pitch", payload.event.title || String(payload.type || "LIVE EVENT").toUpperCase(), payload.event.detail || "Live event received.", payload.event.meta || "External live event adapter", Boolean(payload.event.isAlert)));
    renderScoreBug(); renderPitcherPanel(); renderPlateView(); renderEvents(); renderLowerGameModules();
    requestAnimationFrame(() => playPlateEventAnimation(payload.type || "pitch", payload));
  }

  window.BoringBetsPlateHud = { ingest: ingestPlateEvent, open: openFullPlateHud, close: closeFullPlateHud, animate: playPlateEventAnimation };

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
    if (state.game) history.replaceState({}, "", liveGameUrl(state.game));
  }
  function openChat() { $("chatDrawer").classList.add("open"); $("chatDrawer").setAttribute("aria-hidden","false"); }
  function closeChat() { $("chatDrawer").classList.remove("open"); $("chatDrawer").setAttribute("aria-hidden","true"); }

  function navigatePlayer(type, id, name) {
    if (!id) {
      return showToast(
        `${name || "Player"} profile will open when the live feed supplies an ID.`
      );
    }

    const role =
      type === "pitcher"
        ? "pitching"
        : "hitting";

    const params =
      new URLSearchParams({
        id: String(id),
        role,
        game:
          state.game?.id || "",
        mode: "live"
      });

    location.href =
      `player.html?${params.toString()}`;
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
    const params =
      new URLSearchParams(location.search);

    const requested =
      params.get("id");

    const requestedGamePk =
      params.get("gamePk");

    const requestedKey =
      requestedGamePk || requested;

    if (
      requested &&
      requestedKey !== gameKey(state.game)
    ) {
      try {
        await loadDay(
          requested.slice(0, 10),
          requested,
          false,
          requestedGamePk
        );
      } catch (error) {
        showToast(error.message);
      }
    }
  });

  boot();
})();
