/**
 * DriverView Component
 * Dedicated Driver Console showing request dispatch, 2-driver profile switcher,
 * live GPS telemetry & Screen Wake Lock controls, Turn-by-Turn navigation deep links,
 * multi-stop manifest, and Cash App instant payout wallet.
 */

import { TRIP_STATES } from '../store.js';
import { ATLANTA_DRIVERS } from '../data.js';
import { telemetry } from '../telemetry.js';
import { renderLiveMap } from './LiveMap.js';

export function renderDriverView(state, { onAcceptRequest, onAdvanceDriverState, onResetDemo, onUpdateDriverCashTag, onSelectDriver }) {
  const p = state.pricing;
  const current = state.tripState;
  const driver = state.driver;
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    { name: state.destination || 'Destination', waitMinutes: state.waitMinutes || 20 }
  ];
  const curIdx = state.currentStopIndex || 0;
  const activeStop = stops[curIdx] || stops[0];
  const isFinalStop = curIdx >= stops.length - 1;
  const nextStop = !isFinalStop ? stops[curIdx + 1] : null;

  const isIdle = current === TRIP_STATES.IDLE || current === TRIP_STATES.BOOKING || current === TRIP_STATES.REVIEW;
  const isAccepted = current === TRIP_STATES.DRIVER_ACCEPTED;
  const isOutbound = current === TRIP_STATES.OUTBOUND;
  const isWaiting = current === TRIP_STATES.WAITING;
  const isRiderReady = current === TRIP_STATES.RIDER_READY;
  const isReturn = current === TRIP_STATES.RETURN_LEG;
  const isCompleted = current === TRIP_STATES.COMPLETED;

  const totalSeconds = Math.max(0, state.waitTimerRemaining || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  // Active target for navigation deep links
  const targetName = isReturn ? state.pickup : activeStop.name;
  const targetLat = isReturn ? (state.pickupCoords?.lat || 33.7844) : (activeStop.lat || 33.8507);
  const targetLng = isReturn ? (state.pickupCoords?.lng || -84.3837) : (activeStop.lng || -84.3625);
  const navLinks = telemetry.getNavigationLinks(targetLat, targetLng, targetName);

  return `
    <div class="content-body" style="background:#090d16;color:#f8fafc;width:100%;max-width:100%;box-sizing:border-box;padding:16px 14px max(32px, calc(16px + env(safe-area-inset-bottom, 0px)));overflow-x:hidden;">
      <!-- DEDICATED PILOT DRIVER PROFILE CARD (DOHNTAY) -->
      <div style="background:#130a24;border:1.5px solid var(--primary);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px;box-shadow:0 0 18px rgba(255,42,141,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--primary);color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;box-shadow:0 0 10px rgba(255,42,141,0.4);">
              🐰
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:15px;font-weight:900;color:#f8fafc;">${driver.name}</span>
                <span style="font-size:10px;background:var(--primary);color:#ffffff;font-weight:800;padding:1px 6px;border-radius:4px;">SOLE PILOT</span>
              </div>
              <div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">
                ${driver.vehicle} · <strong style="color:var(--primary);">${driver.licensePlate}</strong>
              </div>
            </div>
          </div>
          <span style="font-size:10px;background:#064e3b;color:#34d399;font-weight:800;padding:3px 8px;border-radius:12px;">
            ● Online
          </span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,42,141,0.2);font-size:11px;">
          <div style="background:#090514;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,42,141,0.15);">
            <span style="color:#94a3b8;display:block;font-size:9.5px;text-transform:uppercase;">Cash App:</span>
            <strong style="color:#00d632;">${state.driverCashTag || driver.cashTag}</strong>
          </div>
          <div style="background:#090514;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,42,141,0.15);">
            <span style="color:#94a3b8;display:block;font-size:9.5px;text-transform:uppercase;">Zelle Phone:</span>
            <strong style="color:#c084fc;">${driver.zelleFormatted || '(943) 245-2611'}</strong>
          </div>
        </div>
      </div>

      <!-- ZELLE TRIP IN-PROGRESS ALERT -->
      ${state.paymentMethod === 'zelle' ? `
        <div style="background:#2e1065;border:1.5px solid #a855f7;border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 15px rgba(168,85,247,0.25);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:#7c3aed;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:18px;">
              🟣
            </div>
            <div>
              <div style="font-size:12.5px;font-weight:900;color:#d8b4fe;text-transform:uppercase;letter-spacing:0.04em;">ZELLE TRANSFER · DIRECT TO BANK</div>
              <div style="font-size:11px;color:#f3e8ff;">Passenger paying via Zelle to <strong>(943) 245-2611</strong> (Dohntay). Verify receipt in bank app.</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:19px;font-weight:900;color:#ffffff;">${p.formatted.totalEstimate}</div>
            <div style="font-size:10px;color:#d8b4fe;">Zelle to Verify</div>
          </div>
        </div>
      ` : ''}

      <!-- CASH TRIP IN-PROGRESS ALERT -->
      ${state.paymentMethod === 'cash' ? `
        <div style="background:#052e16;border:1.5px solid #22c55e;border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 15px rgba(34,197,94,0.2);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:#15803d;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:18px;">
              💵
            </div>
            <div>
              <div style="font-size:12.5px;font-weight:900;color:#86efac;text-transform:uppercase;letter-spacing:0.04em;">CASH TRIP · COLLECT IN CAR</div>
              <div style="font-size:11px;color:#dcfce7;">Passenger selected "I have cash". Collect before final drop-off.</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:19px;font-weight:900;color:#ffffff;">${p.formatted.totalEstimate}</div>
            <div style="font-size:10px;color:#86efac;">Cash to Collect</div>
          </div>
        </div>
      ` : ''}

      <!-- CASH APP DRIVER WALLET & EARNINGS CARD -->
      <div class="driver-demo-pane" style="background:#131a29;border:1px solid ${isCompleted ? '#059669' : '#1e293b'};box-shadow:${isCompleted ? '0 0 25px rgba(5,150,105,0.25)' : 'none'};margin-bottom:14px;">
        <div class="driver-demo-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:24px;height:24px;border-radius:6px;background:#00d632;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;">
              $
            </div>
            <span class="driver-demo-title" style="color:#00d632;">Cash App Instant Payout</span>
          </div>
          <span style="font-size:11px;background:#064e3b;color:#34d399;font-weight:700;padding:2px 8px;border-radius:12px;">
            Zero Deadhead
          </span>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;background:rgba(0,0,0,0.3);padding:8px 12px;border-radius:var(--radius-sm);border:1px solid #1e293b;">
          <span style="font-size:11px;color:#94a3b8;">Payout $cashtag:</span>
          <input 
            type="text" 
            id="inputDriverCashTag" 
            value="${state.driverCashTag || driver.cashTag}" 
            style="background:#090d16;border:1px solid #334155;color:#34d399;font-weight:800;font-size:16px;padding:6px 10px;border-radius:4px;width:140px;max-width:50%;text-align:right;"
          />
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div class="driver-payout-highlight">${p.formatted.totalDriverEarnings}</div>
            <div class="driver-payout-label">Trip Estimated Payout (${stops.length} Stops)</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:18px;font-weight:900;color:#34d399;">
              $${state.driverWalletBalance.toFixed(2)}
            </div>
            <div style="font-size:10.5px;color:#94a3b8;">Cash App Balance</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid #1e293b;font-size:11.5px;">
          <div>
            <span style="color:#94a3b8;">Transit Pay:</span>
            <strong style="color:#f8fafc;margin-left:4px;">$${p.driverPayout.transitEarnings.toFixed(2)}</strong>
          </div>
          <div>
            <span style="color:#94a3b8;">Wait Pay:</span>
            <strong style="color:#00d632;margin-left:4px;">$${p.driverPayout.waitEarnings.toFixed(2)} ($${p.driverPayout.effectiveHourlyWait}/hr)</strong>
          </div>
        </div>

        ${(p.driverPayout.overtimeEarnings || 0) > 0 ? `
          <div style="margin-top:8px;padding:6px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:4px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
            <span style="color:#fca5a5;font-weight:700;">🔥 Overtime Accrued:</span>
            <strong style="color:#f87171;">+$${p.driverPayout.overtimeEarnings.toFixed(2)} ($25.50/hr rate)</strong>
          </div>
        ` : ''}
      </div>

      <!-- TELEMETRY & TURN-BY-TURN NAV CONTROLS -->
      <div style="background:#131a29;border:1px solid #1e293b;border-radius:var(--radius-md);padding:12px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#38bdf8;">
            🛰 Dashboard Telemetry Controls
          </div>
          <div style="display:flex;gap:6px;">
            <button id="btnToggleRealGPS" style="background:#1e293b;border:1px solid #38bdf8;color:#38bdf8;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;cursor:pointer;">
              ${state.isSimulatedGPS ? 'Enable Phone GPS' : 'GPS Active ✓'}
            </button>
            <button id="btnToggleWakeLock" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;cursor:pointer;">
              ${state.wakeLockActive ? '🔆 WakeLock ON' : 'Keep Screen On'}
            </button>
          </div>
        </div>

        <!-- TURN BY TURN APP DEEP LINKS TO CURRENT TARGET -->
        <div style="margin-bottom:6px;font-size:10px;color:#94a3b8;">
          Active Route Target: <strong style="color:#38bdf8;">${targetName}</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a href="${navLinks.appleMaps}" target="_blank" class="btn-secondary" style="padding:8px 10px;font-size:11px;background:#0f172a;color:#f8fafc;border-color:#334155;text-decoration:none;text-align:center;">
            🗺 Apple Maps
          </a>
          <a href="${navLinks.googleMaps}" target="_blank" class="btn-secondary" style="padding:8px 10px;font-size:11px;background:#0f172a;color:#f8fafc;border-color:#334155;text-decoration:none;text-align:center;">
            📍 Google Maps / Waze
          </a>
        </div>
      </div>

      <!-- EMBEDDED LIVE VECTOR MAP WITH ODOMETER -->
      <div style="margin-bottom:14px;">
        ${renderLiveMap(state)}
      </div>

      <!-- MULTI-STOP DRIVER MANIFEST -->
      <div class="card" style="background:#130a24;border-color:rgba(255,42,141,0.25);color:#f8fafc;margin-bottom:14px;padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--primary);letter-spacing:0.06em;">
            🐰 TRICKHOPPER Multi-Hop Manifest
          </span>
          <span style="font-size:10.5px;color:#94a3b8;">
            Odometer: <strong style="color:var(--primary);">${state.odometerMiles.toFixed(1)} mi</strong> / ${p.distanceMiles} mi
          </span>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <span style="color:var(--primary);font-size:13px;">📍</span>
            <div>
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Starting Crib (Origin)</div>
              <div style="font-size:12.5px;font-weight:700;">${state.pickup}</div>
            </div>
          </div>

          ${stops.map((s, idx) => {
            const isCurrent = curIdx === idx && !isReturn;
            const isPassed = curIdx > idx || isReturn;
            return `
              <div style="display:flex;gap:10px;align-items:flex-start;background:${isCurrent ? 'rgba(255,42,141,0.1)' : 'transparent'};padding:${isCurrent ? '6px 8px' : '0'};border-radius:4px;border-left:${isCurrent ? '3px solid var(--primary)' : 'none'};">
                <span style="color:var(--primary);font-size:13px;font-weight:900;">[Hop ${idx + 1}]</span>
                <div style="flex:1;">
                  <div style="font-size:10px;color:var(--primary);text-transform:uppercase;font-weight:700;display:flex;justify-content:space-between;">
                    <span>Hop ${idx + 1}${isCurrent ? ' · ACTIVE TARGET' : isPassed ? ' · COMPLETED' : ''}</span>
                    <span>${s.waitMinutes}m wait window</span>
                  </div>
                  <div style="font-size:12.5px;font-weight:700;">${s.name}</div>
                  <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
                    Curbside wait pay: <strong>$${(s.waitMinutes * 0.35 * 0.85).toFixed(2)}</strong> ($17.85/hr guaranteed)
                  </div>
                </div>
              </div>
            `;
          }).join('')}

          <div style="display:flex;gap:10px;align-items:flex-start;background:${isReturn ? 'rgba(52,211,153,0.08)' : 'transparent'};padding:${isReturn ? '6px 8px' : '0'};border-radius:4px;border-left:${isReturn ? '3px solid #34d399' : 'none'};">
            <span style="color:#34d399;font-size:13px;">↺</span>
            <div>
              <div style="font-size:10px;color:#34d399;text-transform:uppercase;font-weight:700;">
                Return Hop To Crib${isReturn ? ' · ACTIVE LEG' : ''}
              </div>
              <div style="font-size:12.5px;font-weight:700;">${state.pickup}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ACTION BUTTONS FOR DRIVER DEMO ADVANCEMENT -->
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px;">
        ${isIdle ? `
          <button class="btn-primary" id="btnDriverAcceptDemo">
            <span>Claim Nightlife Run Request 🐰</span>
            <span>→</span>
          </button>
        ` : ''}

        ${isAccepted ? `
          <button class="btn-primary" id="btnDriverArrivedPickup" style="background:#0284c7;">
            <span>Mark Arrived at Crib & Depart to Hop 1 →</span>
          </button>
        ` : ''}

        ${isOutbound ? `
          <button class="btn-primary" id="btnDriverArrivedStop" style="background:#0284c7;">
            <span>Arrived at Hop ${curIdx + 1} / Begin Curbside Wait Window →</span>
          </button>
        ` : ''}

        ${isWaiting ? `
          ${state.isOvertime ? `
            <div style="background:#7f1d1d;border:1.5px solid #ef4444;border-radius:var(--radius-md);padding:12px;text-align:center;margin-bottom:6px;">
              <div style="font-size:13px;font-weight:800;color:#fee2e2;margin-bottom:2px;">
                🔥 OVERTIME METER ACTIVE (+${Math.floor((state.overtimeSeconds || 0) / 60)}:${((state.overtimeSeconds || 0) % 60).toString().padStart(2, '0')})
              </div>
              <div style="font-size:11.5px;color:#fca5a5;">
                You are earning elevated wait pay: <strong>$0.425/min ($25.50/hr)</strong> guaranteed!
              </div>
            </div>
          ` : state.gracePeriodWarning ? `
            <div style="background:#78350f;border:1.5px solid #f59e0b;border-radius:var(--radius-md);padding:10px;text-align:center;margin-bottom:6px;">
              <div style="font-size:12px;font-weight:700;color:#fef3c7;">
                ⏳ 3-Minute Grace Warning Active (${minutes}:${seconds} remaining)
              </div>
              <div style="font-size:10.5px;color:#fde68a;">
                Passenger alerted to return to the vehicle.
              </div>
            </div>
          ` : `
            <div style="background:#130a24;border:1px solid rgba(255,42,141,0.2);border-radius:var(--radius-md);padding:12px;text-align:center;margin-bottom:4px;">
              <div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">
                ⏳ Parked outside Hop ${curIdx + 1}. Clock is running at <strong>$0.30/min</strong> ($17.85/hr passive pay).
              </div>
              <div style="font-size:10.5px;color:#94a3b8;">
                Switch to <strong>Rider Mode</strong> to tap "I'm ready", or simulate it below:
              </div>
            </div>
          `}
          <button class="btn-success" id="btnDriverSimulateReady" style="background:#059669;">
            Simulate Passenger Tapping "Ready" →
          </button>
        ` : ''}

        ${isRiderReady ? `
          <div style="background:#064e3b;border:1px solid #059669;border-radius:var(--radius-md);padding:12px;text-align:center;margin-bottom:4px;">
            <strong style="color:#6ee7b7;font-size:13px;">⚡ Rider is back at vehicle!</strong>
          </div>
          <button class="btn-success" id="btnDriverStartReturn">
            ${isFinalStop 
              ? 'Hop In · Start Return Hop to Crib →' 
              : `Hop In · Depart for Hop ${curIdx + 2} (${nextStop?.name.split('(')[0].trim()}) →`}
          </button>
        ` : ''}

        ${isReturn ? `
          <button class="btn-primary" id="btnDriverCompleteTrip" style="background:${state.paymentMethod === 'cash' ? '#15803d' : state.paymentMethod === 'zelle' ? '#7c3aed' : 'var(--primary)'};color:#ffffff;box-shadow:${state.paymentMethod === 'cash' ? '0 4px 16px rgba(21,128,61,0.35)' : state.paymentMethod === 'zelle' ? '0 4px 16px rgba(124,58,237,0.35)' : '0 4px 16px rgba(255,42,141,0.35)'};">
            <span style="font-weight:900;">${state.paymentMethod === 'cash' ? '💵' : state.paymentMethod === 'zelle' ? '🟣' : '🐰'}</span>
            <span>${state.paymentMethod === 'cash' ? `Confirm Cash Received (${p.formatted.totalEstimate}) & Finish Run 🐰 →` : state.paymentMethod === 'zelle' ? `Confirm Zelle Payment Received (${p.formatted.totalEstimate}) & Finish Run 🐰 →` : 'Arrive at Crib & Trigger Cash App Payout 🐰 →'}</span>
          </button>
        ` : ''}

        ${isCompleted ? `
          <div style="background:${state.paymentMethod === 'cash' ? '#064e3b' : state.paymentMethod === 'zelle' ? '#3b0764' : '#130a24'};border:1.5px solid ${state.paymentMethod === 'cash' ? '#34d399' : state.paymentMethod === 'zelle' ? '#c084fc' : 'var(--primary)'};border-radius:var(--radius-md);padding:14px;text-align:center;margin-bottom:8px;">
            <div style="font-size:22px;margin-bottom:2px;">${state.paymentMethod === 'cash' ? '💵' : state.paymentMethod === 'zelle' ? '🟣' : '🐰'}</div>
            <div style="font-size:15px;font-weight:800;color:${state.paymentMethod === 'zelle' ? '#e9d5ff' : '#34d399'};">
              ${state.paymentMethod === 'cash' ? 'Cash Payment Received!' : state.paymentMethod === 'zelle' ? 'Zelle Payment Verified!' : 'Nightlife Run Payout Settled!'}
            </div>
            <div style="font-size:12.5px;color:${state.paymentMethod === 'zelle' ? '#d8b4fe' : '#a7f3d0'};margin-top:2px;">
              ${state.paymentMethod === 'cash' 
                ? `<strong>${p.formatted.totalEstimate}</strong> collected directly from passenger in vehicle.` 
                : state.paymentMethod === 'zelle'
                ? `<strong>${p.formatted.totalEstimate}</strong> received via Zelle to <strong>(943) 245-2611</strong>.`
                : `<strong>+$${p.driverPayout.totalEarnings.toFixed(2)}</strong> deposited to <strong>${state.driverCashTag || driver.cashTag}</strong>`}
            </div>
            <div style="font-size:10.5px;color:${state.paymentMethod === 'zelle' ? '#c084fc' : '#6ee7b7'};margin-top:2px;">
              Zero processing fees · ${state.paymentMethod === 'cash' ? '100% In Hand' : state.paymentMethod === 'zelle' ? 'Direct Bank Transfer' : 'Instant deposit'} · ${stops.length} Hops Completed · Return to Crib Safe 🐰
            </div>
          </div>
          <button class="btn-secondary" id="btnDriverResetTrip" style="background:#1e293b;color:#f8fafc;border-color:#334155;">
            Reset & Test Another Booking
          </button>
        ` : ''}

        <!-- SWITCH BACK TO RIDER MODE -->
        <button class="btn-secondary" id="btnBackToRider" style="background:transparent;color:#94a3b8;border-color:#334155;margin-top:2px;">
          ← Switch to Rider View
        </button>
      </div>
    </div>
  `;
}
