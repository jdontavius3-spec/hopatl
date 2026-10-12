/**
 * WaitingStop Component
 * Active stop screen with live countdown timer, parked map telemetry,
 * stage-aware "I'm ready for next stop / return" CTA, and wait extension.
 */

import { TRIP_STATES } from '../store.js';
import { renderLiveMap } from './LiveMap.js';

export function renderWaitingStop(state, { onReadyToReturn, onExtendWait, onStartReturn }) {
  const isRiderReady = state.tripState === TRIP_STATES.RIDER_READY;
  const p = state.pricing;
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    { name: state.destination || 'Destination', waitMinutes: state.waitMinutes || 20 }
  ];
  const curIdx = state.currentStopIndex || 0;
  const activeStop = stops[curIdx] || stops[0];
  const isFinalStop = curIdx >= stops.length - 1;
  const nextStop = !isFinalStop ? stops[curIdx + 1] : null;

  const totalSeconds = Math.max(0, state.waitTimerRemaining || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const timerDisplay = `${minutes}:${seconds}`;

  const isOvertime = Boolean(state.isOvertime);
  const otSeconds = state.overtimeSeconds || 0;
  const otMin = Math.floor(otSeconds / 60);
  const otSec = (otSeconds % 60).toString().padStart(2, '0');
  const overtimeDisplay = `+${otMin}:${otSec}`;

  return `
    <div class="content-body">
      <div style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:800;background:rgba(255,42,141,0.15);color:var(--primary);padding:2px 8px;border-radius:10px;border:1px solid rgba(255,42,141,0.3);">
            Hop ${curIdx + 1} of ${stops.length}
          </span>
          <span style="font-size:11px;color:var(--text-tertiary);">
            ${isFinalStop ? 'Final Hop Before Return to Crib' : `Next Hop: ${nextStop?.name}`}
          </span>
        </div>
        <h1 class="page-title">Hop ${curIdx + 1} in Progress 🐰</h1>
        <p class="page-subtitle" style="margin-bottom:12px;">
          Pilot ${state.driver.name} is parked curbside at <strong>${activeStop.name}</strong>.
        </p>
      </div>

      <!-- 3-MINUTE GRACE PERIOD WARNING BANNER -->
      ${state.gracePeriodWarning && !isOvertime && !isRiderReady ? `
        <div style="background:rgba(245,158,11,0.14);border:1.5px solid #f59e0b;color:#fef3c7;border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px;font-size:12.5px;display:flex;align-items:flex-start;gap:10px;animation:pulse 2s infinite;box-shadow:0 0 16px rgba(245,158,11,0.2);">
          <span style="font-size:18px;">⚠️</span>
          <div>
            <div style="font-weight:800;font-size:13px;color:#fbbf24;">3-Minute Grace Warning (${timerDisplay} remaining)</div>
            <div style="margin-top:2px;color:#fef3c7;line-height:1.45;">
              Your reserved wait window is ending soon. Head back to Pilot ${state.driver.name}'s vehicle or tap <strong style="color:#ffffff;">+10 min</strong> below to lock in the standard <strong style="color:#fbbf24;">$0.35/min</strong> rate and avoid the $0.50/min overtime meter.
            </div>
          </div>
        </div>
      ` : ''}

      <!-- OVERTIME ACTIVE BANNER -->
      ${isOvertime && !isRiderReady ? `
        <div style="background:rgba(239,68,68,0.16);border:1.5px solid #ef4444;color:#fee2e2;border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px;font-size:12.5px;display:flex;align-items:flex-start;gap:10px;box-shadow:0 0 16px rgba(239,68,68,0.25);">
          <span style="font-size:18px;">⏱️</span>
          <div>
            <div style="font-weight:800;font-size:13px;color:#f87171;">Overtime Rate Active (+$0.50/min)</div>
            <div style="margin-top:2px;color:#fee2e2;line-height:1.45;">
              Reserved wait expired. Accrued overtime: <strong style="color:#ffffff;">+$${(p.overtimeCharge || 0).toFixed(2)}</strong> metered transparently against your payment buffer. Tap <strong style="color:#ffffff;">+10 min</strong> below to switch back to $0.35/min.
            </div>
          </div>
        </div>
      ` : ''}

      <!-- TIMER HERO CARD -->
      <div class="wait-timer-hero" style="padding:20px;margin-bottom:16px;${isOvertime ? 'background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);color:#fee2e2;border:1.5px solid #ef4444;' : state.gracePeriodWarning ? 'border:1.5px solid #f59e0b;' : ''}">
        <div class="wait-timer-tag" style="${isOvertime ? 'background:rgba(255,255,255,0.2);color:#ffffff;' : ''}">
          <span>⏱</span>
          <span>${isRiderReady ? 'Rider Ready Confirmed 🐰' : isOvertime ? `Hop ${curIdx + 1} OVERTIME METER` : `Hop ${curIdx + 1} Curbside Wait Remaining`}</span>
        </div>
        
        <div class="wait-timer-clock" style="font-size:48px;${isOvertime ? 'color:#ffffff;font-variant-numeric:tabular-nums;' : ''}">
          ${isRiderReady ? 'READY' : isOvertime ? overtimeDisplay : timerDisplay}
        </div>

        <div class="wait-timer-status" style="${isOvertime ? 'color:#fecaca;' : ''}">
          ${isRiderReady 
            ? `${state.driver.name} has received your alert and is waiting curbside.` 
            : isOvertime
            ? `Accrued Overtime: +$${(p.overtimeCharge || 0).toFixed(2)} (${p.overtimeMinutes || 0} min @ $0.50/min)`
            : `Reserved window: ${activeStop.waitMinutes}m ${state.extendedMinutes > 0 ? `(+${state.extendedMinutes}m added)` : ''}`}
        </div>
      </div>

      <!-- LIVE PARKED VEHICLE MAP VIEW -->
      ${renderLiveMap(state)}

      <!-- PRIMARY READY CTA BUTTON -->
      ${!isRiderReady ? `
        <div style="margin:16px 0 16px;">
          <button class="btn-success" id="btnReadyToReturn" style="font-size:16px;padding:16px 20px;box-shadow:0 6px 18px rgba(5,150,105,0.35);">
            <span>${isFinalStop ? '🐰 I\'m Ready to Return to the Crib' : `🐰 I\'m Ready for Hop ${curIdx + 2} (${nextStop?.name.split('(')[0].trim()})`}</span>
          </button>
          <div style="text-align:center;font-size:12px;color:var(--text-secondary);margin-top:8px;">
            Tap when walking out of the venue to alert Pilot ${state.driver.name}
          </div>
        </div>
      ` : `
        <div class="card" style="background:#130a24;border:1px solid rgba(52,211,153,0.4);text-align:center;padding:16px;margin:16px 0 16px;">
          <div style="font-size:14.5px;font-weight:800;color:#34d399;margin-bottom:4px;">
            ✓ Pilot ${state.driver.name} Alerted!
          </div>
          <div style="font-size:12.5px;color:#a7f3d0;margin-bottom:14px;">
            Head to the curb. Your ${state.driver.vehicle} is holding position.
          </div>
          <button class="btn-primary" id="btnStartReturnTrip">
            ${isFinalStop 
              ? 'Hop In · Start Return to Crib →' 
              : `Hop In · Depart for Hop ${curIdx + 2} (${nextStop?.name.split('(')[0].trim()}) →`}
          </button>
        </div>
      `}

      <!-- WAIT EXTENSION SECTION -->
      ${!isRiderReady ? `
        <div class="card" style="margin-bottom:16px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:800;color:var(--text-primary);">
              ${isOvertime ? 'Switch Back to Standard Rate' : `Need more time at Hop ${curIdx + 1}?`}
            </div>
            <div style="font-size:11px;font-weight:700;color:var(--primary);">$0.35/min</div>
          </div>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
            ${isOvertime 
              ? 'Lock in 10 or 15 minutes at $0.35/min to halt the $0.50/min overtime meter and keep your driver waiting comfortably.'
              : 'Extend your reserved wait time without losing your driver or car.'}
          </p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button class="btn-secondary" id="btnExtend10" style="padding:10px;font-size:12.5px;">
              <span>+10 min (+$3.50)</span>
            </button>
            <button class="btn-secondary" id="btnExtend15" style="padding:10px;font-size:12.5px;">
              <span>+15 min (+$5.25)</span>
            </button>
          </div>
        </div>
      ` : ''}

      <!-- CURRENT LIVE ESTIMATE CARD -->
      <div class="card-subtle" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--text-tertiary);">
            Total Upfront Fare
          </div>
          <div style="font-size:12px;color:var(--text-secondary);">
            Includes all ${stops.length} hops & return to crib
          </div>
        </div>
        <div style="font-size:18px;font-weight:900;color:var(--text-primary);">
          ${p.formatted.totalEstimate}
        </div>
      </div>
    </div>
  `;
}
