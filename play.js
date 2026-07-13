const PLAY_LOGO_BASE = "https://www.mlbstatic.com/team-logos/team-cap-on-dark";
async function loadPlay() {
  const status = document.getElementById("playStatus");
  const details = document.getElementById("playDetails");
  try {
    const playId = new URLSearchParams(window.location.search).get("id");
    if (!playId) throw new Error("No play was selected.");
    const response = await fetch(`data/todays-card.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("Unable to load card data.");
    const data = await response.json();
    const play = (data.plays || []).find(item => item.id === playId);
    if (!play) throw new Error("That play could not be found.");
    document.title = `${play.play} | Boring Bets`;
    setLogo("awayLogo", play.away_team_id, play.away_team);
    setLogo("homeLogo", play.home_team_id, play.home_team);
    setText("awayTeam", play.away_team); setText("homeTeam", play.home_team); setText("playSport", `${play.sport} // ${play.game}`); setText("playTitle", play.play); setText("playOdds", play.odds); setText("playUnits", Number(play.units || 0).toFixed(2)); setText("playRating", "★".repeat(Number(play.rating || 0))); setText("playHandicapper", play.handicapper);
    const analysis = document.getElementById("playAnalysis");
    analysis.innerHTML = "";
    String(play.analysis || "Analysis has not been posted.").split(/\n\s*\n/).map(text => text.trim()).filter(Boolean).forEach(text => { const p = document.createElement("p"); p.textContent = text; analysis.appendChild(p); });
    status.remove(); details.hidden = false;
  } catch (error) { console.error(error); status.textContent = error.message || "Unable to load play."; }
}
function setText(id, value) { document.getElementById(id).textContent = value ?? "—"; }
function setLogo(id, teamId, team) { const img = document.getElementById(id); img.src = `${PLAY_LOGO_BASE}/${Number(teamId)}.svg`; img.alt = `${team || "Team"} logo`; }
loadPlay();
