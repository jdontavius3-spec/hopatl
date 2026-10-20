let map = null;
let markers = {};
let accuracyRings = {};
let tracks = {};
let hasFit = false;
let leafletRetry = null;
let leafletRetryCount = 0;

/** Render an actual geographic map. Locations and tracks are device GPS only. */
export function renderLiveMap(state) {
  const now=Date.now();
  const recentByRole=Object.fromEntries(['rider','pilot'].map(role=>[role,Boolean(state.liveLocations?.[role]&&now-Date.parse(state.liveLocations[role].timestamp)<30000)]));
  const liveLabel=['rider','pilot'].filter(role=>recentByRole[role]).map(role=>role.toUpperCase()).join(' + ')||'WAITING';
  const stale=!Object.values(recentByRole).some(Boolean);
  return `<section class="card live-map" aria-label="Shared LIVE GPS map">
    <div class="live-map-heading"><div><div class="eyebrow">SHARED LIVE GPS</div><strong>Live trip map</strong></div><span class="map-live-status ${stale?'stale':''}">${liveLabel}${stale?' · GPS STALE':''}</span></div>
    <div id="live-map" class="live-map-canvas" role="region" aria-label="Map showing shared rider and pilot GPS positions">Loading street map…</div>
    <div class="legend"><span><i class="map-key rider-key"></i>Rider</span><span><i class="map-key pilot-key"></i>Pilot</span></div>
    <div class="map-coordinate-row">${['rider','pilot'].map(role => { const p=state.liveLocations?.[role],fresh=recentByRole[role]; return `<div><b>${role==='rider'?'Rider':'Pilot'} · ${fresh?'LIVE':'STALE'}</b><span>${p ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : 'Waiting for GPS'}</span><small>${p ? `±${Math.round(p.accuracy)} m · ${new Date(p.timestamp).toLocaleTimeString()}` : 'No location received yet'}</small></div>`; }).join('')}</div>
    <div class="map-footnote">Map tiles © OpenStreetMap contributors · GPS is shared only during this trip.</div>
  </section>`;
}

function makeIcon(role, heading) {
  const glyph = role === 'rider' ? 'R' : 'P';
  const rotation = Number.isFinite(heading) ? `transform:rotate(${heading}deg)` : '';
  return window.L.divIcon({className:'',html:`<span class="gps-map-marker ${role}" style="${rotation}"><i></i><b>${glyph}</b></span>`,iconSize:[34,42],iconAnchor:[17,21]});
}

export function updateLiveMap(state) {
  const node = document.getElementById('live-map');
  if (!node) return;
  if (!window.L) { if (leafletRetryCount<10&&!leafletRetry) { leafletRetryCount++; leafletRetry=setTimeout(()=>{leafletRetry=null;updateLiveMap(state)},500); } else if (leafletRetryCount>=10) node.textContent='Street map could not load. GPS coordinates remain available below.'; return; }
  if (map && map.getContainer() !== node) { map.remove(); map=null; markers={}; accuracyRings={}; tracks={}; hasFit=false; }
  if (!map) {
    map = window.L.map(node,{zoomControl:true,scrollWheelZoom:false,preferCanvas:true}).setView([33.749,-84.388],13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
    }).addTo(map);
    for (const role of ['rider','pilot']) tracks[role]=window.L.polyline([],{color:role==='rider'?'#55a9ff':'#24d69a',weight:5,opacity:.9,lineCap:'round',lineJoin:'round'}).addTo(map);
  }
  const points=[];
  for (const role of ['rider','pilot']) {
    const point=state.liveLocations?.[role];
    const history=state.tracks?.[role]||[];
    tracks[role].setLatLngs(history.map(p=>[p.lat,p.lng]));
    if (!point) continue;
    const latlng=[point.lat,point.lng]; points.push(latlng);
    const label=`${role==='rider'?'Rider':'Pilot'} · ±${Math.round(point.accuracy)} m · ${new Date(point.timestamp).toLocaleTimeString()}`;
    if (!markers[role]) markers[role]=window.L.marker(latlng,{icon:makeIcon(role,point.heading),title:label}).addTo(map);
    else markers[role].setLatLng(latlng).setIcon(makeIcon(role,point.heading)).bindTooltip(label);
    markers[role].bindTooltip(label);
    const radius=Math.max(5,Math.min(150,Number(point.accuracy)||0));
    if (!accuracyRings[role]) accuracyRings[role]=window.L.circle(latlng,{radius,color:role==='rider'?'#55a9ff':'#24d69a',weight:1,fillOpacity:.1}).addTo(map);
    else accuracyRings[role].setLatLng(latlng).setRadius(radius);
    if (!hasFit) markers[role].openTooltip();
  }
  if (points.length && !hasFit) { map.fitBounds(points,{padding:[32,32],maxZoom:16}); hasFit=true; }
  else if (points.length && points.some(p=>!map.getBounds().contains(p))) map.fitBounds(points,{padding:[40,40],maxZoom:16,animate:true});
  requestAnimationFrame(()=>map?.invalidateSize({pan:false}));
}
