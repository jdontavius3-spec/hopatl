/** Shared live coordinate plot. Not a street map: positions and trails come only from device GPS. */
export function renderLiveMap(state) {
  const label=state.simulationMode?'SIMULATED GPS':'LIVE GPS';
  const all = [...(state.tracks?.rider||[]), ...(state.tracks?.pilot||[])];
  if (!all.length) return `<section class="card live-map" aria-label="Live GPS track"><div class="eyebrow">SHARED LIVE TRACK</div><div class="map-empty">Waiting for GPS coordinates from the rider and pilot.</div></section>`;
  const minLat=Math.min(...all.map(p=>p.lat)), maxLat=Math.max(...all.map(p=>p.lat)), minLng=Math.min(...all.map(p=>p.lng)), maxLng=Math.max(...all.map(p=>p.lng));
  const latSpan=Math.max(maxLat-minLat,0.00008), lngSpan=Math.max(maxLng-minLng,0.00008);
  const xy=p=>`${12+(p.lng-minLng)/lngSpan*76},${88-(p.lat-minLat)/latSpan*76}`;
  const paths=['rider','pilot'].map(role=>{const pts=state.tracks[role]||[]; return pts.length?`<polyline class="track ${role}" points="${pts.map(xy).join(' ')}"/>`:''}).join('');
  const dots=['rider','pilot'].map(role=>{const p=state.liveLocations[role];return p?`<circle class="dot ${role}" cx="${xy(p).split(',')[0]}" cy="${xy(p).split(',')[1]}" r="3.1"><title>${role} ${label.toLowerCase()}</title></circle>`:''}).join('');
  return `<section class="card live-map" aria-label="Shared ${label} track"><div class="eyebrow">SHARED ${label} TRACK · TRACE</div><svg viewBox="0 0 100 100" role="img" aria-label="Relative positions and movement trails for rider and pilot"><path class="grid" d="M10 10H90 M10 30H90 M10 50H90 M10 70H90 M10 90H90 M10 10V90 M30 10V90 M50 10V90 M70 10V90 M90 10V90"/>${paths}${dots}</svg><div class="legend"><span>● Rider</span><span>● Pilot</span></div><div class="map-footnote">${state.simulationMode?'Generated coordinates for local flow simulation; not device GPS.':'Relative GPS plot, not a road map. Axis scales to the points received in this session.'}</div></section>`;
}
