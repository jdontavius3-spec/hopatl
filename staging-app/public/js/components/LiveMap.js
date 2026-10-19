let map = null;
let markers = {};
let stopMarkers = [];
let accuracyRings = {};
let tracks = {};
let hasFit = false;
let leafletRetry = null;
let leafletRetryCount = 0;

function renderFallbackSvg(state) {
  const all = [...(state.tracks?.rider || []), ...(state.tracks?.pilot || [])];
  if (state.liveLocations?.rider) all.push(state.liveLocations.rider);
  if (state.liveLocations?.pilot) all.push(state.liveLocations.pilot);
  const hops = state.routeQuote?.hops || (state.destination ? [{ destination: state.destination }] : []);
  for (const h of hops) {
    if (h?.destination && Number.isFinite(h.destination.lat) && Number.isFinite(h.destination.lng)) {
      all.push({ lat: h.destination.lat, lng: h.destination.lng });
    }
  }
  if (!all.length) {
    return `<div class="map-empty">Waiting for GPS coordinates from the rider and pilot.</div>`;
  }
  const minLat = Math.min(...all.map(p => p.lat)), maxLat = Math.max(...all.map(p => p.lat));
  const minLng = Math.min(...all.map(p => p.lng)), maxLng = Math.max(...all.map(p => p.lng));
  const latSpan = Math.max(maxLat - minLat, 0.0005), lngSpan = Math.max(maxLng - minLng, 0.0005);
  const xy = p => `${12 + (p.lng - minLng) / lngSpan * 76},${88 - (p.lat - minLat) / latSpan * 76}`;
  const paths = ['rider', 'pilot'].map(role => {
    const pts = state.tracks?.[role] || [];
    return pts.length ? `<polyline class="track ${role}" fill="none" stroke="${role === 'rider' ? '#55a9ff' : '#24d69a'}" stroke-width="2" points="${pts.map(xy).join(' ')}"/>` : '';
  }).join('');
  const dots = ['rider', 'pilot'].map(role => {
    const p = state.liveLocations?.[role];
    if (!p) return '';
    const [cx, cy] = xy(p).split(',');
    return `<circle class="dot ${role}" cx="${cx}" cy="${cy}" r="3.5" fill="${role === 'rider' ? '#55a9ff' : '#24d69a'}" stroke="#fff" stroke-width="1"><title>${role} live GPS</title></circle>`;
  }).join('');
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Relative positions and movement trails for rider and pilot" style="width:100%;height:240px;background:#0b101b;border-radius:12px"><path class="grid" stroke="#1e293b" stroke-width="0.5" d="M10 10H90 M10 30H90 M10 50H90 M10 70H90 M10 90H90 M10 10V90 M30 10V90 M50 10V90 M70 10V90 M90 10V90"/>${paths}${dots}</svg>`;
}

/** Render an actual geographic map with automatic SVG radar fallback if offline. */
export function renderLiveMap(state) {
  const label = state.simulationMode ? 'AUTO-PILOT DEMO GPS' : 'LIVE GPS';
  const now = Date.now();
  const recentByRole = Object.fromEntries(
    ['rider', 'pilot'].map(role => [
      role,
      Boolean(state.liveLocations?.[role] && now - Date.parse(state.liveLocations[role].timestamp) < 45000),
    ])
  );
  const liveLabel = state.simulationMode
    ? 'SIMULATED TELEMETRY'
    : ['rider', 'pilot'].filter(role => recentByRole[role]).map(role => role.toUpperCase()).join(' + ') || 'STANDBY';
  const stale = !state.simulationMode && !recentByRole.pilot && state.tripState !== 'REQUESTED';

  return `<section class="card live-map" aria-label="Shared ${label} map">
    <div class="live-map-heading">
      <div>
        <div class="eyebrow">SHARED ${label}</div>
        <strong>Live Atlanta Trip Map</strong>
      </div>
      <span class="map-live-status ${stale ? 'stale' : ''}">${liveLabel}${stale ? ' · WAITING FOR PILOT FIX' : ''}</span>
    </div>
    <div id="live-map" class="live-map-canvas" role="region" aria-label="Map showing shared rider, pilot, and stop GPS positions">${renderFallbackSvg(state)}</div>
    <div class="legend">
      <span><i class="map-key rider-key"></i>Rider</span>
      <span><i class="map-key pilot-key"></i>Pilot</span>
      <span><i class="map-key stop-key"></i>Hop Stop</span>
    </div>
    <div class="map-coordinate-row">
      ${['rider', 'pilot'].map(role => {
        const p = state.liveLocations?.[role];
        const fresh = recentByRole[role];
        return `<div>
          <b>${role === 'rider' ? 'Rider' : 'Pilot'} · ${state.simulationMode ? 'DEMO' : fresh ? 'LIVE' : p ? 'LAST KNOWN' : 'WAITING'}</b>
          <span>${p ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : 'Waiting for GPS'}</span>
          <small>${p ? `±${Math.round(p.accuracy)} m · ${new Date(p.timestamp).toLocaleTimeString()}` : 'No location received yet'}</small>
        </div>`;
      }).join('')}
    </div>
    <div class="map-footnote">Map tiles © OpenStreetMap contributors · Pilot actions remain operational even when rider phone is locked inside a venue.</div>
  </section>`;
}

function makeIcon(role, heading) {
  const glyph = role === 'rider' ? 'R' : 'P';
  const rotation = Number.isFinite(heading) ? `transform:rotate(${heading}deg)` : '';
  return window.L.divIcon({
    className: '',
    html: `<span class="gps-map-marker ${role}" style="${rotation}"><i></i><b>${glyph}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 21],
  });
}

function makeStopIcon(index) {
  return window.L.divIcon({
    className: '',
    html: `<span class="gps-map-marker stop"><b>${index + 1}</b></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function updateLiveMap(state) {
  const node = document.getElementById('live-map');
  if (!node) return;
  if (!window.L) {
    if (leafletRetryCount < 8 && !leafletRetry) {
      leafletRetryCount++;
      leafletRetry = setTimeout(() => {
        leafletRetry = null;
        updateLiveMap(state);
      }, 450);
    }
    return;
  }
  if (map && map.getContainer() !== node) {
    map.remove();
    map = null;
    markers = {};
    stopMarkers = [];
    accuracyRings = {};
    tracks = {};
    hasFit = false;
  }
  if (!map) {
    node.innerHTML = '';
    map = window.L.map(node, { zoomControl: true, scrollWheelZoom: false, preferCanvas: true }).setView([33.755, -84.388], 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    for (const role of ['rider', 'pilot']) {
      tracks[role] = window.L.polyline([], {
        color: role === 'rider' ? '#55a9ff' : '#24d69a',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }
  }

  const points = [];
  for (const role of ['rider', 'pilot']) {
    const point = state.liveLocations?.[role];
    const history = state.tracks?.[role] || [];
    tracks[role].setLatLngs(history.map(p => [p.lat, p.lng]));
    if (!point) continue;
    const latlng = [point.lat, point.lng];
    points.push(latlng);
    const label = `${role === 'rider' ? 'Rider' : 'Pilot'} · ±${Math.round(point.accuracy)} m · ${new Date(point.timestamp).toLocaleTimeString()}`;
    if (!markers[role]) {
      markers[role] = window.L.marker(latlng, { icon: makeIcon(role, point.heading), title: label }).addTo(map);
    } else {
      markers[role].setLatLng(latlng).setIcon(makeIcon(role, point.heading)).bindTooltip(label);
    }
    markers[role].bindTooltip(label);
    const radius = Math.max(8, Math.min(150, Number(point.accuracy) || 12));
    if (!accuracyRings[role]) {
      accuracyRings[role] = window.L.circle(latlng, {
        radius,
        color: role === 'rider' ? '#55a9ff' : '#24d69a',
        weight: 1,
        fillOpacity: 0.1,
      }).addTo(map);
    } else {
      accuracyRings[role].setLatLng(latlng).setRadius(radius);
    }
  }

  for (const marker of stopMarkers) marker.remove();
  stopMarkers = [];
  const hops = state.routeQuote?.hops || (state.destination ? [{ destination: state.destination, waitMinutes: state.routeQuote?.waitMinutes || 15 }] : []);
  hops.forEach((hop, idx) => {
    const d = hop?.destination;
    if (!d || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return;
    const latlng = [d.lat, d.lng];
    points.push(latlng);
    const stopMarker = window.L.marker(latlng, {
      icon: makeStopIcon(idx),
      title: `Hop ${idx + 1}: ${d.label || d.query || 'Stop'}`,
    }).addTo(map);
    stopMarker.bindTooltip(`Hop ${idx + 1}: ${d.label || d.query || 'Stop'} (${hop.waitMinutes || 15}m wait)`);
    stopMarkers.push(stopMarker);
  });

  if (points.length && !hasFit) {
    map.fitBounds(points, { padding: [36, 36], maxZoom: 15 });
    hasFit = true;
  } else if (points.length && points.some(p => !map.getBounds().contains(p))) {
    map.fitBounds(points, { padding: [40, 40], maxZoom: 15, animate: true });
  }
  requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
}
