const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

async function loadHomeCard() {
  const target = document.getElementById("featuredPlays");
  try {
    const response = await fetch(`data/todays-card.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("Card data unavailable");
    const data = await response.json();
    const plays = Array.isArray(data.plays) ? data.plays : [];
    const units = plays.reduce((sum, play) => sum + Number(play.units || 0), 0);
    document.getElementById("homePlayCount").textContent = String(plays.length);
    document.getElementById("homeUnitCount").textContent = `${units.toFixed(2)}U`;
    document.getElementById("homeUpdated").textContent = formatDate(data.updated_at);
    const featured = plays.slice(0, 3);
    target.innerHTML = featured.length ? featured.map(play => `
      <a class="featured-play" href="play.html?id=${encodeURIComponent(play.id)}">
        <div class="matchup">${escapeHtml(play.away_team)} @ ${escapeHtml(play.home_team)} // ${escapeHtml(play.sport)}</div>
        <h3>${escapeHtml(play.play)}</h3>
        <div class="play-meta"><span>${escapeHtml(play.odds)}</span><span>${Number(play.units).toFixed(2)}U</span><span>${"★".repeat(Number(play.rating || 0))}</span></div>
      </a>`).join("") : '<div class="home-card"><p>No plays have been posted yet.</p></div>';
  } catch (error) {
    target.innerHTML = '<div class="home-card"><p>Today’s card is temporarily unavailable.</p></div>';
    document.getElementById("homePlayCount").textContent = "—";
    document.getElementById("homeUnitCount").textContent = "—";
    document.getElementById("homeUpdated").textContent = "—";
  }
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
loadHomeCard();
