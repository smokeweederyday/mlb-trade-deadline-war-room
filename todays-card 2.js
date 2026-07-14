const cardEscape = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const MLB_LOGO_BASE = "https://www.mlbstatic.com/team-logos/team-cap-on-dark";

async function loadCard() {
  const status = document.getElementById("cardStatus");
  try {
    const response = await fetch(`data/todays-card.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("Unable to load today’s card.");
    const data = await response.json();
    const plays = Array.isArray(data.plays) ? data.plays : [];
    document.getElementById("cardDate").textContent = `Card date // ${formatCardDate(data.date)}`;
    document.getElementById("cardUpdated").textContent = `Updated // ${formatCardDate(data.updated_at, true)}`;
    document.getElementById("totalPlays").textContent = plays.length;
    document.getElementById("totalUnits").textContent = plays.reduce((sum, play) => sum + Number(play.units || 0), 0).toFixed(2);
    document.getElementById("totalSports").textContent = new Set(plays.map(play => play.sport)).size;
    const container = document.getElementById("playsContainer");
    container.innerHTML = "";
    if (!plays.length) {
      status.textContent = "No plays have been posted yet.";
      return;
    }
    let currentSport = null;
    plays.forEach(play => {
      if (play.sport !== currentSport) {
        currentSport = play.sport;
        const heading = document.createElement("h2");
        heading.className = "sport-group-title";
        heading.textContent = currentSport;
        container.appendChild(heading);
      }
      container.appendChild(buildPlayCard(play));
    });
    status.remove();
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Unable to load today’s card.";
  }
}

function buildPlayCard(play) {
  const card = document.createElement("article");
  card.className = "play-card";
  card.tabIndex = 0;
  card.setAttribute("role", "link");
  const destination = `play.html?id=${encodeURIComponent(play.id)}`;
  const open = () => { window.location.href = destination; };
  card.addEventListener("click", open);
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
  });
  card.innerHTML = `
    <div class="matchup-logos">
      <div class="team-logo away-logo"><img src="${MLB_LOGO_BASE}/${Number(play.away_team_id)}.svg" alt="${cardEscape(play.away_team)} logo"><span>${cardEscape(play.away_team)}</span></div>
      <div class="matchup-at">@</div>
      <div class="team-logo home-logo"><img src="${MLB_LOGO_BASE}/${Number(play.home_team_id)}.svg" alt="${cardEscape(play.home_team)} logo"><span>${cardEscape(play.home_team)}</span></div>
    </div>
    <div class="play-top"><span class="sport">${cardEscape(play.sport)}</span><span class="stars" aria-label="${Number(play.rating || 0)} star rating">${"★".repeat(Number(play.rating || 0))}</span></div>
    <h2>${cardEscape(play.play)}</h2>
    <p><strong>${cardEscape(play.game)}</strong></p>
    <p>${cardEscape(play.odds)} · ${Number(play.units || 0).toFixed(2)} units</p>
    <p>${cardEscape(excerpt(play.analysis, 190))}</p>
    <small>${cardEscape(play.handicapper)}</small><span class="card-cta">FULL ANALYSIS →</span>`;
  return card;
}
function excerpt(value, max) { const text = String(value || ""); return text.length > max ? `${text.slice(0, max).trim()}…` : text; }
function formatCardDate(value, includeTime = false) { const date = new Date(value); if (Number.isNaN(date.getTime())) return String(value || "—"); return date.toLocaleString([], includeTime ? {month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"} : {weekday:"long",month:"long",day:"numeric",year:"numeric"}); }
loadCard();
