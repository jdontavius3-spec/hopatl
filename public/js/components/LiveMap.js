/**
 * LiveMap Component
 * High-performance, zero-dependency SVG & Canvas vector map for Atlanta Nightlife routes.
 * Displays moving vehicle with heading angle, multi-stop numbered markers, active route polylines,
 * and live odometer HUD.
 */

import { TRIP_STATES } from '../store.js';

export function renderLiveMap(state) {
  const driver = state.driver;
  const gps = state.driverGPS || {
    lat: driver?.lat || 33.7815,
    lng: driver?.lng || -84.3830,
    speed: 26,
    heading: 45,
    accuracy: 4,
  };

  const isSimulated = state.isSimulatedGPS;
  const isWakeLock = state.wakeLockActive;
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    { name: state.destination || 'Destination', waitMinutes: 20 }
  ];
  const curIdx = state.currentStopIndex || 0;
  const isReturn = state.tripState === TRIP_STATES.RETURN_LEG;
  const isWaiting = state.tripState === TRIP_STATES.WAITING || state.tripState === TRIP_STATES.RIDER_READY;

  // Active status label
  let activeLegText = `Leg ${curIdx + 1} of ${stops.length} · In Transit`;
  if (isWaiting) {
    activeLegText = `Stop ${curIdx + 1} of ${stops.length} · Parked & Waiting`;
  } else if (isReturn) {
    activeLegText = `Return Leg · Heading to Origin`;
  }

  // Pre-calculated screen coordinates for multi-stop SVG map
  const stopCoords = [
    { cx: 180, cy: 60 },
    { cx: 330, cy: 80 },
    { cx: 330, cy: 160 },
  ];

  return `
    <div class="live-map-card">
      <div class="map-hud-bar">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="live-pulse-dot"></span>
          <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#38bdf8;">
            ${activeLegText}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${isWakeLock ? `
            <span style="font-size:10px;background:#064e3b;color:#34d399;font-weight:700;padding:2px 6px;border-radius:4px;">
              🔆 WakeLock ON
            </span>
          ` : ''}
          <span style="font-size:11px;font-family:monospace;color:#94a3b8;">
            ${gps.speed} mph · ±${gps.accuracy}m
          </span>
        </div>
      </div>

      <!-- MAP STAGE (ATLANTA NIGHTLIFE GRID) -->
      <div class="map-stage-viewport" id="mapCanvasViewport">
        <!-- SVG Vector Nightlife Map Layout -->
        <svg viewBox="0 0 400 240" class="map-svg-grid">
          <defs>
            <!-- Glow Filters -->
            <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0284c7" />
              <stop offset="50%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#059669" />
            </linearGradient>
          </defs>

          <!-- Dark Atlanta Base Grid -->
          <rect width="400" height="240" fill="#0b101b" />

          <!-- Street Corridors -->
          <line x1="30" y1="20" x2="380" y2="220" stroke="#1e293b" stroke-width="12" stroke-linecap="round" />
          <line x1="40" y1="220" x2="360" y2="30" stroke="#1e293b" stroke-width="9" stroke-linecap="round" />
          
          <line x1="30" y1="20" x2="380" y2="220" stroke="#152136" stroke-width="8" stroke-linecap="round" />
          <line x1="40" y1="220" x2="360" y2="30" stroke="#152136" stroke-width="6" stroke-linecap="round" />

          <!-- Connector secondary streets -->
          <line x1="90" y1="40" x2="110" y2="210" stroke="#162033" stroke-width="4" stroke-dasharray="3,3" />
          <line x1="220" y1="30" x2="240" y2="220" stroke="#162033" stroke-width="4" stroke-dasharray="3,3" />
          <line x1="310" y1="40" x2="330" y2="210" stroke="#162033" stroke-width="4" stroke-dasharray="3,3" />
          
          <line x1="20" y1="120" x2="380" y2="120" stroke="#162033" stroke-width="4" />
          <line x1="20" y1="170" x2="380" y2="170" stroke="#162033" stroke-width="4" />

          <!-- Street Names -->
          <text x="60" y="75" fill="#475569" font-size="8.5" font-family="sans-serif" font-weight="700" letter-spacing="1">PEACHTREE ST NE</text>
          <text x="180" y="155" fill="#475569" font-size="8" font-family="sans-serif" font-weight="700" letter-spacing="1">10TH ST MIDTOWN</text>
          <text x="250" y="85" fill="#475569" font-size="8" font-family="sans-serif" font-weight="700" letter-spacing="1">PIEDMONT RD</text>

          <!-- Active Trip Route Path Connecting Origin to Stops to Return -->
          ${stops.length === 1 ? `
            <path d="M 50,180 Q 130,110 180,60" fill="none" stroke="url(#routeGradient)" stroke-width="4" stroke-linecap="round" stroke-dasharray="6,4" class="route-line-anim" />
            <path d="M 180,60 Q 120,210 50,180" fill="none" stroke="#059669" stroke-width="2.5" stroke-dasharray="4,4" opacity="0.6" />
          ` : stops.length === 2 ? `
            <path d="M 50,180 Q 110,100 180,60 T 330,80" fill="none" stroke="url(#routeGradient)" stroke-width="4" stroke-linecap="round" stroke-dasharray="6,4" class="route-line-anim" />
            <path d="M 330,80 Q 200,220 50,180" fill="none" stroke="#059669" stroke-width="2.5" stroke-dasharray="4,4" opacity="0.6" />
          ` : `
            <path d="M 50,180 Q 110,100 180,60 T 330,80 T 330,160" fill="none" stroke="url(#routeGradient)" stroke-width="4" stroke-linecap="round" stroke-dasharray="6,4" class="route-line-anim" />
            <path d="M 330,160 Q 180,210 50,180" fill="none" stroke="#059669" stroke-width="2.5" stroke-dasharray="4,4" opacity="0.6" />
          `}

          <!-- 1. Origin / Pickup Marker -->
          <circle cx="50" cy="180" r="10" fill="#0284c7" opacity="0.3" class="pulse-ring" />
          <circle cx="50" cy="180" r="6" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
          <text x="35" y="202" fill="#38bdf8" font-size="8.5" font-weight="800">ORIGIN</text>

          <!-- 2. Multi-Stop Markers -->
          ${stops.map((s, idx) => {
            const pos = stopCoords[idx] || { cx: 200 + (idx * 50), cy: 60 };
            const isActive = curIdx === idx && !isReturn;
            return `
              <g transform="translate(${pos.cx}, ${pos.cy})">
                <circle cx="0" cy="0" r="${isActive ? 14 : 10}" fill="#f59e0b" opacity="${isActive ? 0.4 : 0.2}" class="${isActive ? 'pulse-ring' : ''}" />
                <circle cx="0" cy="0" r="8" fill="#f59e0b" stroke="#ffffff" stroke-width="2" />
                <text x="0" y="3.5" fill="#0f172a" font-size="8.5" font-weight="900" text-anchor="middle">${idx + 1}</text>
                <text x="0" y="-12" fill="#fbbf24" font-size="8" font-weight="800" text-anchor="middle">STOP ${idx + 1}</text>
              </g>
            `;
          }).join('')}

          <!-- 3. Moving Vehicle Marker (Marcus Camry / Trevon Tahoe) -->
          <g transform="translate(180, 115) rotate(${gps.heading || 45})" filter="url(#carGlow)">
            <!-- Outer radar pulse -->
            <circle cx="0" cy="0" r="16" fill="rgba(0, 229, 255, 0.2)" />
            <!-- Vehicle chassis -->
            <rect x="-8" y="-14" width="16" height="28" rx="4" fill="#000000" stroke="#00e5ff" stroke-width="2" />
            <!-- Headlights -->
            <polygon points="-5,-14 -3,-18 -1,-14" fill="#fef08a" />
            <polygon points="5,-14 3,-18 1,-14" fill="#fef08a" />
            <!-- Windshield -->
            <rect x="-6" y="-8" width="12" height="6" rx="1.5" fill="#38bdf8" opacity="0.8" />
            <!-- Roof / Label -->
            <circle cx="0" cy="2" r="3" fill="#ffffff" />
          </g>

          <!-- Vehicle Label Tag -->
          <g transform="translate(180, 145)">
            <rect x="-50" y="-9" width="100" height="18" rx="4" fill="rgba(15,23,42,0.9)" stroke="#00e5ff" stroke-width="1" />
            <text x="0" y="3.5" fill="#ffffff" font-size="8" font-weight="800" text-anchor="middle">
              ${driver.name} · ${gps.speed} mph
            </text>
          </g>
        </svg>

        <!-- COORDINATES & ODOMETER FOOTER OVERLAY -->
        <div class="map-coords-pill">
          <span>📍 Lat: ${gps.lat.toFixed(4)}° N, Lng: ${Math.abs(gps.lng).toFixed(4)}° W</span>
          <span style="color:#38bdf8;font-weight:700;">
            Odometer: ${Number(state.odometerMiles || 0).toFixed(1)} mi
          </span>
        </div>
      </div>
    </div>
  `;
}
