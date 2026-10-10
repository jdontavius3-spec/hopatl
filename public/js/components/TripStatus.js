/**
 * TripStatus Component
 * Displays driver match, vehicle telemetry, live vector street map, multi-stop route progress,
 * and transparent odometer logging.
 */

import { TRIP_STATES } from '../store.js';
import { renderLiveMap } from './LiveMap.js';

export function renderTripStatus(state, { onAdvanceTrip, onSwitchToDriver }) {
  const driver = state.driver;
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    { name: state.destination || 'Destination', waitMinutes: state.waitMinutes || 20 }
  ];
  const curIdx = state.currentStopIndex || 0;
  const activeStop = stops[curIdx] || stops[0];

  const isMatching = state.tripState === TRIP_STATES.MATCHING;
  const isAccepted = state.tripState === TRIP_STATES.DRIVER_ACCEPTED;
  const isOutbound = state.tripState === TRIP_STATES.OUTBOUND;
  const isReturnLeg = state.tripState === TRIP_STATES.RETURN_LEG;

  if (isMatching) {
    return `
      <div class="content-body" style="align-items:center;justify-content:center;text-align:center;padding-top:60px;">
        <div style="width:70px;height:70px;border-radius:50%;background:rgba(255,42,141,0.15);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px;border:1px solid rgba(255,42,141,0.3);box-shadow:0 0 20px rgba(255,42,141,0.3);animation:pulse 1.5s infinite;">
          🐰
        </div>
        <h1 class="page-title">Calling Dedicated Pilot Dohntay...</h1>
        <p class="page-subtitle" style="max-width:320px;">
          Locating Dohntay (2024 Camry Hybrid · <code>ATL-PILOT</code>) for your ${stops.length}-hop nightlife run.
        </p>
      </div>
    `;
  }

  let statusBadgeText = `Hop ${curIdx + 1} of ${stops.length} In Transit`;
  let statusTitle = `In Transit with Pilot ${driver.name}`;
  let statusSubtitle = `Heading to Hop ${curIdx + 1}: ${activeStop.name}. Curbside wait window begins on arrival.`;
  let advanceBtnText = `Simulate Arriving at Hop ${curIdx + 1} →`;

  if (isAccepted) {
    statusBadgeText = 'Pilot En Route to Crib';
    statusTitle = 'Pilot Dohntay is on the way 🐰';
    statusSubtitle = `Estimated arrival at ${state.pickup} in ${driver.etaMinutes} minutes.`;
    advanceBtnText = 'Simulate Pilot Pickup & Depart →';
  } else if (isReturnLeg) {
    statusBadgeText = 'Return Hop In Transit';
    statusTitle = `Heading Back to Crib with ${driver.name}`;
    statusSubtitle = `Returning you safely to ${state.pickup}. Zero surge, gear safe in car.`;
    advanceBtnText = state.paymentMethod === 'cash' 
      ? 'Arrive at Crib & Complete Cash Run 🐰 →'
      : state.paymentMethod === 'zelle'
      ? 'Arrive at Crib & Confirm Zelle Settle 🐰 →'
      : 'Arrive at Crib & Trigger Cash App Payout 🐰 →';
  }

  return `
    <div class="content-body">
      <!-- HEADER CALLOUT -->
      <div style="margin-bottom:14px;">
        <div class="state-badge enroute" style="margin-bottom:8px;">
          ${statusBadgeText}
        </div>
        <h1 class="page-title">
          ${statusTitle}
        </h1>
        <p class="page-subtitle" style="margin-bottom:12px;">
          ${statusSubtitle}
        </p>
      </div>

      <!-- LIVE ATLANTA MAP WITH MULTI-STOP TELEMETRY -->
      ${renderLiveMap(state)}

      <!-- DRIVER CARD -->
      <div class="driver-card" style="margin-top:14px;">
        <div class="driver-avatar" style="background:var(--primary);color:#ffffff;box-shadow:0 0 10px rgba(255,42,141,0.4);">🐰</div>
        <div class="driver-info">
          <div class="driver-name">${driver.name} <span style="font-size:10px;background:var(--primary);color:#ffffff;padding:1px 5px;border-radius:4px;font-weight:800;vertical-align:middle;">PILOT</span></div>
          <div class="driver-vehicle">${driver.vehicle}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <span class="driver-rating-badge">★ ${driver.rating}</span>
            <span style="font-size:11px;color:var(--text-tertiary);">${driver.trips} runs</span>
            <span style="font-size:11px;font-weight:700;color:var(--primary);background:rgba(255,42,141,0.15);padding:1px 6px;border-radius:4px;border:1px solid rgba(255,42,141,0.3);">
              ${driver.licensePlate}
            </span>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;font-weight:800;color:${state.paymentMethod === 'cash' ? '#34d399' : state.paymentMethod === 'zelle' ? '#c084fc' : '#ff2a8d'};">
            ${state.paymentMethod === 'cash' ? '💵 Cash Run' : state.paymentMethod === 'zelle' ? '🟣 Zelle Transfer' : 'Cash App'}
          </div>
          <div style="font-size:11px;color:${state.paymentMethod === 'cash' ? '#86efac' : state.paymentMethod === 'zelle' ? '#d8b4fe' : '#f8fafc'};font-weight:700;">
            ${state.paymentMethod === 'cash' ? `${p.formatted.totalEstimate} in car` : state.paymentMethod === 'zelle' ? (driver.zelleFormatted || '(943) 245-2611') : (driver.cashTag || '$2243Dohntay')}
          </div>
        </div>
      </div>

      <!-- MULTI-STOP ITINERARY PROGRESS CARD -->
      <div class="card" style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-light);">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-tertiary);">
            🐰 Multi-Hop Itinerary Progress
          </span>
          <span style="font-size:12px;font-weight:800;color:var(--primary);">
            ${isReturnLeg ? 'Return Hop to Crib' : `Hop ${curIdx + 1} of ${stops.length}`}
          </span>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${stops.map((s, idx) => {
            const isPassed = curIdx > idx || isReturnLeg;
            const isCurrent = curIdx === idx && !isReturnLeg;
            return `
              <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:${isCurrent ? 'var(--text-primary)' : isPassed ? 'var(--text-tertiary)' : 'var(--text-secondary)'};">
                <span style="width:20px;height:20px;border-radius:50%;background:${isPassed ? '#10b981' : isCurrent ? 'var(--primary)' : 'rgba(255,255,255,0.1)'};color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;box-shadow:${isCurrent ? '0 0 8px rgba(255,42,141,0.5)' : 'none'};">
                  ${isPassed ? '✓' : idx + 1}
                </span>
                <span style="font-weight:${isCurrent ? '800' : '500'};flex:1;">
                  ${s.name} (${s.waitMinutes}m wait)
                </span>
                ${isCurrent ? `
                  <span style="font-size:10px;background:rgba(255,42,141,0.2);color:var(--primary);padding:1px 6px;border-radius:4px;font-weight:700;border:1px solid rgba(255,42,141,0.3);">
                    Current Target
                  </span>
                ` : ''}
              </div>
            `;
          }).join('')}

          <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:${isReturnLeg ? '#34d399' : 'var(--text-tertiary)'};padding-top:4px;">
            <span style="width:20px;height:20px;border-radius:50%;background:${isReturnLeg ? '#10b981' : 'rgba(255,255,255,0.1)'};color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;">
              ↺
            </span>
            <span style="font-weight:${isReturnLeg ? '800' : '500'};">
              Return Hop to ${state.pickup} (20% discount)
            </span>
          </div>
        </div>
      </div>

      <!-- SIMULATION CONTROLS -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:auto;">
        <button class="btn-primary" id="btnAdvanceStatus" ${isReturnLeg ? `style="background:${state.paymentMethod === 'cash' ? '#15803d' : state.paymentMethod === 'zelle' ? '#7c3aed' : '#00d632'};color:#ffffff;"` : ''}>
          ${advanceBtnText}
        </button>

        <button class="btn-secondary" id="btnPeekDriver">
          Switch to Driver Telemetry View ↗
        </button>
      </div>
    </div>
  `;
}
