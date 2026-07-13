const $ = s => document.querySelector(s);
let state = {teams:[],trades:[],rumors:[],impact:[],meta:{}};

async function loadData(){
  const res = await fetch(`data/site-data.json?v=${Date.now()}`);
  if(!res.ok) throw new Error("Unable to load site data");
  state = await res.json();
  render();
}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function badge(v){return `<span class="badge ${esc(v.toLowerCase())}">${esc(v)}</span>`}
function render(){
  $("#lastUpdated").textContent = new Date(state.meta.updated_at).toLocaleString();
  $("#tradeCount").textContent = state.trades.length;
  $("#rumorCount").textContent = state.rumors.length;
  $("#raceCount").textContent = state.teams.filter(t=>Number(t.wcgb)<=4).length;
  renderTrades(); renderRumors(); renderTeams(); renderImpact();
}
function renderTrades(){
  const q=($("#tradeSearch")?.value||"").toLowerCase();
  $("#tradeCards").innerHTML=state.trades.filter(x=>JSON.stringify(x).toLowerCase().includes(q)).map(x=>`
    <article class="card"><div class="card-top"><div>
      <div>${badge("Confirmed")} <span class="meta">${esc(x.date)}</span></div>
      <div class="trade-title">${esc(x.from)} → ${esc(x.to)}: ${esc(x.players)}</div>
      <div class="context">Return: ${esc(x.return)}</div></div></div>
      <div class="impact"><strong>Betting impact:</strong> ${esc(x.betting_impact)}</div>
      <p><a class="source" href="${esc(x.source)}" target="_blank" rel="noopener">Open source ↗</a></p>
    </article>`).join("")||'<div class="card">No matching confirmed trades.</div>';
}
function renderRumors(){
  const f=$("#confidenceFilter")?.value||"";
  $("#rumorCards").innerHTML=state.rumors.filter(x=>!f||x.confidence===f).map(x=>`
    <article class="card"><div class="card-top"><div>
      <div>${badge(x.confidence)} <span class="meta">${esc(x.status)}</span></div>
      <div class="trade-title">${esc(x.player)} • ${esc(x.team)} • ${esc(x.role)}</div>
      <div class="context">${esc(x.context)}</div></div></div>
      <div class="impact"><strong>Betting relevance:</strong> ${esc(x.betting_relevance)}</div>
      <p><a class="source" href="${esc(x.source)}" target="_blank" rel="noopener">Open report ↗</a></p>
    </article>`).join("")||'<div class="card">No rumors match this filter.</div>';
}
function renderTeams(){
  const f=$("#tierFilter")?.value||"";
  $("#teamRows").innerHTML=state.teams.filter(x=>!f||x.tier===f).map(x=>`<tr>
    <td><strong>${esc(x.team)}</strong><br><span class="meta">${esc(x.division)}</span></td>
    <td>${x.w}-${x.l}</td><td>${x.wcgb}</td><td>${x.run_diff>0?"+":""}${x.run_diff}</td>
    <td><span class="tier ${esc(x.tier.replaceAll(" ","-"))}">${esc(x.tier)}</span></td>
    <td>${esc(x.need)}</td><td>${esc(x.betting_note)}</td></tr>`).join("");
}
function renderImpact(){
  $("#impactCards").innerHTML=state.impact.map(x=>`<article class="card">
    <div>${badge(x.impact)}</div><h3>${esc(x.event)}</h3><p><strong>Markets:</strong> ${esc(x.markets)}</p>
    <p class="context">${esc(x.checklist)}</p><div class="impact">${esc(x.rule)}</div></article>`).join("");
}
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tabs button,.tab-panel").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); $("#"+b.dataset.tab).classList.add("active");
}));
$("#tradeSearch").addEventListener("input",renderTrades);
$("#confidenceFilter").addEventListener("change",renderRumors);
$("#tierFilter").addEventListener("change",renderTeams);
function tick(){
  const d=new Date("2026-08-03T18:00:00-04:00")-new Date();
  if(d<=0){$("#countdown").textContent="Deadline passed";return}
  const days=Math.floor(d/864e5),hrs=Math.floor(d%864e5/36e5),mins=Math.floor(d%36e5/6e4);
  $("#countdown").textContent=`${days}d ${hrs}h ${mins}m remaining`;
}
tick();setInterval(tick,60000);loadData().catch(e=>{$("#tradeCards").innerHTML=`<div class="card">${esc(e.message)}</div>`});
