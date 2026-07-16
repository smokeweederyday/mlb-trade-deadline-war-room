const canvas = document.querySelector('#globeCanvas');
const ctx = canvas.getContext('2d');
const dateInput = document.querySelector('#globeDate');
const dateLabel = document.querySelector('#globeDateLabel');
const countLabel = document.querySelector('#globeGameCount');
const gameList = document.querySelector('#globeGames');
const venuePanel = document.querySelector('#venuePanel');
const tooltip = document.querySelector('#globeTooltip');

let venues = [];
let games = [];
let filteredGames = [];
let projectedMarkers = [];
let selectedVenueId = null;
let rotation = { lon: -97, lat: 32 };
let scale = 1;
let drag = null;

const LAND = [
  [[-168,72],[-140,69],[-124,55],[-128,46],[-117,32],[-102,20],[-82,24],[-66,45],[-77,57],[-102,72]],
  [[-82,12],[-66,8],[-50,-3],[-35,-22],[-52,-55],[-69,-54],[-77,-20]],
  [[-10,36],[2,50],[28,61],[55,60],[82,72],[145,62],[178,52],[154,34],[117,22],[104,5],[78,8],[58,24],[34,31],[20,15],[7,5],[-8,20]],
  [[-17,34],[10,37],[35,31],[51,11],[42,-12],[29,-35],[14,-35],[-5,-15]],
  [[112,-11],[154,-10],[154,-39],[132,-44],[113,-29]],
  [[-52,84],[-20,81],[-22,60],[-48,60]],
  [[44,-12],[51,-13],[50,-26],[44,-25]]
];

init();

async function init(){
  const [venueResponse, gameResponse] = await Promise.all([
    fetch('data/venues.json', {cache:'no-store'}),
    fetch('data/games.json', {cache:'no-store'})
  ]);
  const venueData = await venueResponse.json();
  const gameData = await gameResponse.json();
  venues = Array.isArray(venueData) ? venueData : venueData.venues || [];
  games = Array.isArray(gameData) ? gameData : gameData.games || [];
  const availableDates = [...new Set(games.map(game => game.date).filter(Boolean))].sort();
  const today = localISODate(new Date());
  dateInput.value = availableDates.includes(today) ? today : nearestDate(availableDates, today);
  bindEvents();
  resize();
  applyDate();
  setInterval(updateVenueClock, 30_000);
}

function bindEvents(){
  window.addEventListener('resize', resize);
  dateInput.addEventListener('change', applyDate);
  document.querySelector('#globeToday').addEventListener('click',()=>{ dateInput.value=localISODate(new Date()); applyDate(); });
  document.querySelector('#globeReset').addEventListener('click',()=>{ rotation={lon:-97,lat:32};scale=1;selectedVenueId=null;render(); });
  canvas.addEventListener('pointerdown',event=>{ drag={x:event.clientX,y:event.clientY,lon:rotation.lon,lat:rotation.lat}; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove',event=>{
    if(drag){ rotation.lon=drag.lon-(event.clientX-drag.x)*.35; rotation.lat=Math.max(-75,Math.min(75,drag.lat+(event.clientY-drag.y)*.28)); render(); }
    else showTooltip(event);
  });
  canvas.addEventListener('pointerup',event=>{ drag=null; canvas.releasePointerCapture(event.pointerId); });
  canvas.addEventListener('pointerleave',()=>{ tooltip.hidden=true; });
  canvas.addEventListener('wheel',event=>{ event.preventDefault(); scale=Math.max(.72,Math.min(1.75,scale-event.deltaY*.0007)); render(); },{passive:false});
  canvas.addEventListener('click',event=>{
    if(drag) return;
    const marker=findMarker(event);
    if(marker) selectVenue(marker.venue.id);
  });
}

function resize(){
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);render();
}

function applyDate(){
  const date=dateInput.value;
  filteredGames=games.filter(game=>game.date===date && game.sport==='MLB');
  dateLabel.textContent=formatDate(date);
  countLabel.textContent=`${filteredGames.length} game${filteredGames.length===1?'':'s'}`;
  selectedVenueId=filteredGames[0]?.venue?.id || null;
  renderGameList();
  if(selectedVenueId) selectVenue(selectedVenueId,false); else renderVenueEmpty();
  render();
}

function render(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  const radius=Math.min(w,h)*.39*scale, cx=w*.5, cy=h*.51;
  const gradient=ctx.createRadialGradient(cx-radius*.25,cy-radius*.3,radius*.1,cx,cy,radius);
  gradient.addColorStop(0,'#173f33');gradient.addColorStop(.58,'#09231c');gradient.addColorStop(1,'#020706');
  ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
  drawGrid(cx,cy,radius);drawLand(cx,cy,radius);ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle='rgba(94,255,174,.25)';ctx.lineWidth=1.4;ctx.stroke();
  drawMarkers(cx,cy,radius);
}

function drawGrid(cx,cy,r){
  ctx.strokeStyle='rgba(126,255,191,.08)';ctx.lineWidth=.7;
  for(let lat=-60;lat<=60;lat+=30) drawGeoLine(Array.from({length:181},(_,i)=>[-180+i*2,lat]),cx,cy,r);
  for(let lon=-180;lon<180;lon+=30) drawGeoLine(Array.from({length:121},(_,i)=>[lon,-90+i*1.5]),cx,cy,r);
}
function drawLand(cx,cy,r){
  LAND.forEach(poly=>{
    const points=poly.map(([lon,lat])=>project(lon,lat,cx,cy,r)).filter(point=>point.visible);
    if(points.length<3)return;
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle='rgba(54,139,94,.42)';ctx.strokeStyle='rgba(117,255,181,.18)';ctx.lineWidth=.8;ctx.fill();ctx.stroke();
  });
}
function drawGeoLine(points,cx,cy,r){
  let drawing=false;ctx.beginPath();
  points.forEach(([lon,lat])=>{const p=project(lon,lat,cx,cy,r);if(!p.visible){drawing=false;return;} if(!drawing){ctx.moveTo(p.x,p.y);drawing=true;}else ctx.lineTo(p.x,p.y);});ctx.stroke();
}
function drawMarkers(cx,cy,r){
  const venueIds=new Set(filteredGames.map(game=>game.venue?.id).filter(Boolean));
  projectedMarkers=[];
  venues.filter(v=>venueIds.has(v.id)).forEach(venue=>{
    const p=project(venue.longitude,venue.latitude,cx,cy,r);if(!p.visible)return;
    const active=venue.id===selectedVenueId;
    const pulse=5+Math.sin(Date.now()/500)*1.2;
    ctx.beginPath();ctx.arc(p.x,p.y,active?pulse+4:pulse,0,Math.PI*2);ctx.fillStyle=active?'rgba(72,255,151,.18)':'rgba(72,255,151,.09)';ctx.fill();
    ctx.beginPath();ctx.arc(p.x,p.y,active?5:3.6,0,Math.PI*2);ctx.fillStyle=active?'#ecfff3':'#49ff97';ctx.fill();
    projectedMarkers.push({x:p.x,y:p.y,venue});
  });
  if(projectedMarkers.length) requestAnimationFrame(()=>{ if(!drag) render(); });
}
function project(lon,lat,cx,cy,r){
  const λ=(lon-rotation.lon)*Math.PI/180, φ=lat*Math.PI/180, φ0=rotation.lat*Math.PI/180;
  const cosc=Math.sin(φ0)*Math.sin(φ)+Math.cos(φ0)*Math.cos(φ)*Math.cos(λ);
  return {x:cx+r*Math.cos(φ)*Math.sin(λ),y:cy-r*(Math.cos(φ0)*Math.sin(φ)-Math.sin(φ0)*Math.cos(φ)*Math.cos(λ)),visible:cosc>0};
}
function renderGameList(){
  if(!filteredGames.length){gameList.innerHTML='<p class="globe-empty">No MLB games are loaded for this date.</p>';return;}
  gameList.innerHTML=filteredGames.sort((a,b)=>String(a.game_time).localeCompare(String(b.game_time))).map(game=>{
    const venue=venues.find(v=>v.id===game.venue?.id);return `<button class="globe-game-card ${game.venue?.id===selectedVenueId?'is-active':''}" data-venue-id="${game.venue?.id||''}"><span><strong>${escapeHTML(game.away_team?.abbr||'TBD')} @ ${escapeHTML(game.home_team?.abbr||'TBD')}</strong><span>${escapeHTML(game.venue?.name||'Venue TBD')} · ${escapeHTML(venue?.city||'')}</span></span><time>${formatVenueTime(game.game_time,venue?.timezone)}</time></button>`;
  }).join('');
  gameList.querySelectorAll('[data-venue-id]').forEach(button=>button.addEventListener('click',()=>selectVenue(Number(button.dataset.venueId))));
}
function selectVenue(id,rerender=true){
  selectedVenueId=id;const venue=venues.find(v=>v.id===id);if(!venue){renderVenueEmpty();return;}
  const venueGames=filteredGames.filter(game=>game.venue?.id===id);
  venuePanel.innerHTML=`<div class="venue-heading"><div><p class="kicker">${escapeHTML(venue.city||'VENUE')}</p><h2>${escapeHTML(venue.name)}</h2></div><time class="venue-clock" data-timezone="${escapeHTML(venue.timezone||'UTC')}">${formatClock(venue.timezone)}</time></div><div class="venue-meta-grid"><div class="venue-meta"><span>Local game time</span><strong>${venueGames[0]?formatVenueTime(venueGames[0].game_time,venue.timezone):'—'}</strong></div><div class="venue-meta"><span>Time zone</span><strong>${escapeHTML(venue.timezone||'—')}</strong></div><div class="venue-meta"><span>Altitude</span><strong>${venue.altitude_ft!=null?`${venue.altitude_ft.toLocaleString()} ft`:'Pending'}</strong></div><div class="venue-meta"><span>Field bearing</span><strong>${venue.center_field_bearing!=null?`${venue.center_field_bearing}°`:'Pending survey'}</strong></div></div><div>${venueGames.map(game=>`<a class="globe-game-card" href="game.html?id=${encodeURIComponent(game.id)}"><span><strong>${escapeHTML(game.away_team?.name||'TBD')} @ ${escapeHTML(game.home_team?.name||'TBD')}</strong><span>Open Game Center</span></span><time>${formatVenueTime(game.game_time,venue.timezone)}</time></a>`).join('')}</div><div class="venue-weather-placeholder"><strong>Weather layer ready.</strong><br>Live precipitation, wind relative to field orientation, roof state, and park-behavior effects will attach here.</div>`;
  renderGameList();if(rerender)render();
}
function renderVenueEmpty(){venuePanel.innerHTML='<p class="kicker">NO GAMES</p><h2>Select another date</h2><p>The globe will display stadiums with games loaded for the selected date.</p>';}
function updateVenueClock(){const el=venuePanel.querySelector('[data-timezone]');if(el)el.textContent=formatClock(el.dataset.timezone);}
function showTooltip(event){const marker=findMarker(event);if(!marker){tooltip.hidden=true;return;} const rect=canvas.getBoundingClientRect();tooltip.hidden=false;tooltip.style.left=`${event.clientX-rect.left+14}px`;tooltip.style.top=`${event.clientY-rect.top+12}px`;tooltip.innerHTML=`<strong>${escapeHTML(marker.venue.name)}</strong><span>${escapeHTML(marker.venue.city||'')} · ${formatClock(marker.venue.timezone)}</span>`;}
function findMarker(event){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;return projectedMarkers.find(marker=>Math.hypot(marker.x-x,marker.y-y)<12);}
function formatVenueTime(value,timeZone){if(!value)return'TBD';try{return new Intl.DateTimeFormat('en-US',{timeZone:timeZone||'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(value));}catch{return'TBD';}}
function formatClock(timeZone){try{return new Intl.DateTimeFormat('en-US',{timeZone:timeZone||'UTC',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date());}catch{return'—';}}
function formatDate(date){if(!date)return'—';return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00`));}
function localISODate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function nearestDate(dates,target){return dates.find(date=>date>=target)||dates.at(-1)||target;}
function escapeHTML(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
