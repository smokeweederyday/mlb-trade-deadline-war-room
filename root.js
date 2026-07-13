const GAME_LOGO_BASE =
  "https://www.mlbstatic.com/team-logos/team-cap-on-dark";

async function loadGame() {
  const status = document.getElementById("gameStatus");
  const details = document.getElementById("gameDetails");

  try {
    const playId =
      new URLSearchParams(window.location.search).get("play");

    if (!playId) {
      throw new Error("No matchup was selected.");
    }

    const response = await fetch(
      `data/todays-card.json?v=${Date.now()}`
    );

    if (!response.ok) {
      throw new Error("Unable to load matchup data.");
    }

    const data = await response.json();
    const plays = data.plays || [];

    const selectedPlay = plays.find(
      item => item.id === playId
    );

    if (!selectedPlay) {
      throw new Error("That matchup could not be found.");
    }

    const related = plays.filter(item =>
      item.date === selectedPlay.date &&
      item.away_team === selectedPlay.away_team &&
      item.home_team === selectedPlay.home_team
    );

    document.title =
      `${selectedPlay.game} | Boring Bets`;

    setLogo(
      "gameAwayLogo",
      selectedPlay.away_team_id,
      selectedPlay.away_team
    );

    setLogo(
      "gameHomeLogo",
      selectedPlay.home_team_id,
      selectedPlay.home_team
    );

    setText("gameAwayTeam", selectedPlay.away_team);
    setText("gameHomeTeam", selectedPlay.home_team);
    setText("gameTitle", selectedPlay.game);
    setText("gameDate", selectedPlay.date);

    const container =
      document.getElementById("relatedPlays");

    container.innerHTML = "";

    related.forEach(play => {
      const link = document.createElement("a");

      link.className = "related-play-card";
      link.href =
        `play.html?id=${encodeURIComponent(play.id)}`;

      link.innerHTML = `
        <span>${play.sport}</span>
        <strong>${play.play}</strong>
        <small>${play.odds} · ${Number(play.units || 0).toFixed(2)} units</small>
      `;

      container.appendChild(link);
    });

    status.remove();
    details.hidden = false;

  } catch (error) {
    console.error(error);
    status.textContent =
      error.message || "Unable to load matchup.";
  }
}

function setText(id, value) {
  document.getElementById(id).textContent = value ?? "—";
}

function setLogo(id, teamId, team) {
  const img = document.getElementById(id);
  img.src = `${GAME_LOGO_BASE}/${Number(teamId)}.svg`;
  img.alt = `${team || "Team"} logo`;
}

loadGame();