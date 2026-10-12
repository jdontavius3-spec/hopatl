/**
 * DriverView Component
 * Automotive In-Car Pilot Station for Camry Dashboard Mount
 * Features 56px+ tactile buttons, high-contrast readable typography (13-28px),
 * compact card layout, turn-by-turn navigation deep links, and instant settlement HUD.
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
    <div class="content-body" style="background:#090d16;color:#f8fafc;width:100%;max-width:100%;box-sizing:border-box;padding:12px 14px max(32px, calc(16px + env(safe-area-inset-bottom, 0px)));overflow-x:hidden;display:flex;flex-direction:column;gap:10px;">
      
      <!-- 0. PILOT FLEET IDENTITY SELECTOR (DOHNTAY VS ROCKO) -->
      <div style="background:#0c0618;border:1px solid rgba(255,42,141,0.3);border-radius:var(--radius-md);padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Active Pilot Identity:</span>
          <span style="font-size:11px;color:#34d399;font-weight:800;">2-Pilot Fleet ●</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${ATLANTA_DRIVERS.map(drv => {
            const isSelected = (state.selectedDriverId === drv.id) || (driver.id === drv.id);
            return `
              <button 
                type="button" 
                data-driver-switch-id="${drv.id}"
                style="background:${isSelected ? 'linear-gradient(135deg, #ff2a8d 0%, #a855f7 100%)' : '#180e29'};color:#ffffff;border:1.5px solid ${isSelected ? '#ff2a8d' : 'rgba(255,42,141,0.25)'};padding:10px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:10px;text-align:left;box-shadow:${isSelected ? '0 0 14px rgba(255,42,141,0.4)' : 'none'};"
              >
                <div style="font-size:22px;line-height:1;">${isSelected ? '🐰' : '🚗'}</div>
                <div style="min-width:0;flex:1;">
                  <div style="font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${drv.name}</div>
                  <div style="font-size:11.5px;color:${isSelected ? '#ffffff' : '#00d632'};font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${drv.cashTag}</div>
                  <div style="font-size:10px;color:${isSelected ? 'rgba(255,255,255,0.85)' : '#94a3b8'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${drv.licensePlate}</div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 1. PILOT DRIVER PROFILE CARD -->
      <div style="background:#130a24;border:1.5px solid var(--primary);border-radius:var(--radius-md);padding:12px 14px;box-shadow:0 0 18px rgba(255,42,141,0.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:12px;background:var(--primary);color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;box-shadow:0 0 14px rgba(255,42,141,0.5);">
              🐰
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:17px;font-weight:900;color:#f8fafc;">${driver.name}</span>
                <span style="font-size:11px;background:var(--primary);color:#ffffff;font-weight:800;padding:2px 7px;border-radius:5px;letter-spacing:0.04em;">DEDICATED PILOT</span>
              </div>
              <div style="font-size:13px;color:#cbd5e1;margin-top:2px;font-weight:600;">
                ${driver.vehicle} · <strong style="color:#ff70ba;">${driver.licensePlate}</strong>
              </div>
            </div>
          </div>
          <span style="font-size:12px;background:#064e3b;color:#34d399;font-weight:800;padding:4px 10px;border-radius:12px;border:1px solid rgba(52,211,153,0.3);">
            ● Online
          </span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,42,141,0.2);">
          <div style="background:#090514;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,42,141,0.2);min-width:0;">
            <span style="color:#94a3b8;display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">Cash App:</span>
            <strong style="color:#00d632;font-size:14.5px;display:block;margin-top:1px;">${state.driverCashTag || driver.cashTag}</strong>
          </div>
          <div style="background:#090514;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,42,141,0.2);min-width:0;">
            <span style="color:#94a3b8;display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">Zelle Phone:</span>
            <strong style="color:#c084fc;font-size:14.5px;display:block;margin-top:1px;">${driver.zelleFormatted || '(943) 245-2611'}</strong>
          </div>
        </div>
      </div>

      <!-- ZELLE TRIP ALERT (WHEN ACTIVE) -->
      ${state.paymentMethod === 'zelle' ? `
        <div style="background:#2e1065;border:1.5px solid #a855f7;border-radius:var(--radius-md);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 16px rgba(168,85,247,0.3);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:#7c3aed;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:18px;">
              🟣
            </div>
            <div>
              <div style="font-size:13px;font-weight:900;color:#d8b4fe;text-transform:uppercase;letter-spacing:0.04em;">ZELLE DIRECT BANK TRANSFER</div>
              <div style="font-size:12px;color:#f3e8ff;margin-top:2px;">Passenger sending Zelle to <strong>${driver.zelleFormatted || '(943) 245-2611'}</strong> (${driver.name})</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:900;color:#ffffff;">${p.formatted.totalEstimate}</div>
            <div style="font-size:11px;color:#d8b4fe;font-weight:700;">Direct to Bank</div>
          </div>
        </div>
      ` : ''}

      <!-- CASH TRIP ALERT (WHEN ACTIVE) -->
      ${state.paymentMethod === 'cash' ? `
        <div style="background:#052e16;border:1.5px solid #22c55e;border-radius:var(--radius-md);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 16px rgba(34,197,94,0.25);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:#15803d;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:18px;">
              💵
            </div>
            <div>
              <div style="font-size:13px;font-weight:900;color:#86efac;text-transform:uppercase;letter-spacing:0.04em;">CASH TRIP · IN-CAR SETTLEMENT</div>
              <div style="font-size:12px;color:#dcfce7;margin-top:2px;">Passenger selected Cash. Collect inside vehicle.</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:900;color:#ffffff;">${p.formatted.totalEstimate}</div>
            <div style="font-size:11px;color:#86efac;font-weight:700;">Cash to Collect</div>
          </div>
        </div>
      ` : ''}

      <!-- 2. CASH APP DRIVER WALLET & EARNINGS HUD -->
      <div style="background:#131a29;border:1.5px solid ${isCompleted ? '#059669' : '#1e293b'};border-radius:var(--radius-md);padding:14px;box-shadow:${isCompleted ? '0 0 25px rgba(5,150,105,0.3)' : 'none'};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;border-radius:7px;background:#00d632;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;">
              $
            </div>
            <span style="font-size:14px;font-weight:900;color:#00d632;">Cash App Instant Payout</span>
          </div>
          <span style="font-size:11.5px;background:#064e3b;color:#34d399;font-weight:800;padding:3px 10px;border-radius:12px;">
            Zero Deadhead
          </span>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;background:rgba(0,0,0,0.35);padding:10px 12px;border-radius:8px;border:1px solid #1e293b;">
          <span style="font-size:13px;color:#94a3b8;font-weight:600;">Payout $cashtag:</span>
          <input 
            type="text" 
            id="inputDriverCashTag" 
            value="${state.driverCashTag || driver.cashTag}" 
            style="background:#090d16;border:1px solid #334155;color:#34d399;font-weight:800;font-size:16px;padding:6px 10px;border-radius:6px;width:140px;max-width:50%;text-align:right;"
          />
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div style="font-size:28px;font-weight:900;color:#00d632;letter-spacing:-0.03em;line-height:1.1;">${p.formatted.totalDriverEarnings}</div>
            <div style="font-size:12.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-top:3px;">Trip Estimated Payout (${stops.length} Stops)</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:900;color:#34d399;line-height:1.1;">
              $${state.driverWalletBalance.toFixed(2)}
            </div>
            <div style="font-size:12px;color:#94a3b8;font-weight:600;margin-top:3px;">Cash App Balance</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid #1e293b;font-size:13px;">
          <div>
            <span style="color:#94a3b8;">Transit Pay:</span>
            <strong style="color:#f8fafc;margin-left:4px;font-size:13.5px;">$${p.driverPayout.transitEarnings.toFixed(2)}</strong>
          </div>
          <div>
            <span style="color:#94a3b8;">Wait Pay:</span>
            <strong style="color:#00d632;margin-left:4px;font-size:13.5px;">$${p.driverPayout.waitEarnings.toFixed(2)} ($${p.driverPayout.effectiveHourlyWait}/hr)</strong>
          </div>
        </div>

        ${(p.driverPayout.overtimeEarnings || 0) > 0 ? `
          <div style="margin-top:10px;padding:8px 12px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:13px;">
            <span style="color:#fca5a5;font-weight:700;">🔥 Overtime Accrued:</span>
            <strong style="color:#f87171;font-size:14px;">+$${p.driverPayout.overtimeEarnings.toFixed(2)} ($25.50/hr rate)</strong>
          </div>
        ` : ''}
      </div>

      <!-- 3. IN-CAR TELEMETRY & TURN-BY-TURN NAVIGATION DOCK -->
      <div style="background:#131a29;border:1.5px solid #1e293b;border-radius:var(--radius-md);padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div style="font-size:13px;font-weight:900;text-transform:uppercase;color:#38bdf8;letter-spacing:0.04em;">
            🛰 Telemetry Controls
          </div>
          <div style="display:flex;gap:8px;">
            <button id="btnToggleRealGPS" class="driver-toggle-btn" style="background:#1e293b;border:1.5px solid #38bdf8;color:#38bdf8;">
              ${state.isSimulatedGPS ? 'Enable GPS' : 'GPS Active ✓'}
            </button>
            <button id="btnToggleWakeLock" class="driver-toggle-btn" style="background:#1e293b;border:1.5px solid ${state.wakeLockActive ? '#10b981' : '#334155'};color:${state.wakeLockActive ? '#34d399' : '#cbd5e1'};">
              ${state.wakeLockActive ? '🔆 WakeLock ON' : 'Keep Screen On'}
            </button>
          </div>
        </div>

        <!-- TURN-BY-TURN APP DEEP LINKS TO CURRENT TARGET -->
        <div style="margin-bottom:8px;font-size:13px;color:#94a3b8;">
          Active Route Target: <strong style="color:#38bdf8;font-size:14.5px;">${targetName}</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <a href="${navLinks.appleMaps}" target="_blank" class="driver-nav-btn">
            <span style="font-size:16px;">🗺</span> Apple Maps
          </a>
          <a href="${navLinks.googleMaps}" target="_blank" class="driver-nav-btn">
            <span style="font-size:16px;">📍</span> Google / Waze
          </a>
        </div>
      </div>

      <!-- 4. EMBEDDED LIVE VECTOR MAP WITH ODOMETER -->
      <div>
        ${renderLiveMap(state)}
      </div>

      <!-- 5. MULTI-STOP DRIVER MANIFEST -->
      <div style="background:#130a24;border:1px solid rgba(255,42,141,0.25);border-radius:var(--radius-md);color:#f8fafc;padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:13px;font-weight:900;text-transform:uppercase;color:var(--primary);letter-spacing:0.06em;">
            🐰 TRICKHOPPER Manifest
          </span>
          <span style="font-size:13px;color:#cbd5e1;">
            Odometer: <strong style="color:var(--primary);font-size:14px;">${state.odometerMiles.toFixed(1)} mi</strong> / ${p.distanceMiles} mi
          </span>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <span style="color:var(--primary);font-size:16px;line-height:1;">📍</span>
            <div>
              <div style="font-size:11px;color:#94a3b8;font-weight:800;text-transform:uppercase;">Starting Crib (Origin)</div>
              <div style="font-size:14px;font-weight:700;margin-top:1px;">${state.pickup}</div>
            </div>
          </div>

          ${stops.map((s, idx) => {
            const isCurrent = curIdx === idx && !isReturn;
            const isPassed = curIdx > idx || isReturn;
            return `
              <div style="display:flex;gap:10px;align-items:flex-start;background:${isCurrent ? 'rgba(255,42,141,0.12)' : 'transparent'};padding:${isCurrent ? '8px 10px' : '0'};border-radius:6px;border-left:${isCurrent ? '3px solid var(--primary)' : 'none'};">
                <span style="color:var(--primary);font-size:14px;font-weight:900;">[Hop ${idx + 1}]</span>
                <div style="flex:1;">
                  <div style="font-size:11px;color:var(--primary);text-transform:uppercase;font-weight:800;display:flex;justify-content:space-between;">
                    <span>Hop ${idx + 1}${isCurrent ? ' · ACTIVE TARGET' : isPassed ? ' · COMPLETED' : ''}</span>
                    <span>${s.waitMinutes}m wait window</span>
                  </div>
                  <div style="font-size:14px;font-weight:700;margin-top:2px;">${s.name}</div>
                  <div style="font-size:12.5px;color:#94a3b8;margin-top:2px;">
                    Curbside wait pay: <strong style="color:#ffffff;">$${(s.waitMinutes * 0.35 * 0.85).toFixed(2)}</strong> ($17.85/hr guaranteed)
                  </div>
                </div>
              </div>
            `;
          }).join('')}

          <div style="display:flex;gap:10px;align-items:flex-start;background:${isReturn ? 'rgba(52,211,153,0.1)' : 'transparent'};padding:${isReturn ? '8px 10px' : '0'};border-radius:6px;border-left:${isReturn ? '3px solid #34d399' : 'none'};">
            <span style="color:#34d399;font-size:16px;line-height:1;">↺</span>
            <div>
              <div style="font-size:11px;color:#34d399;text-transform:uppercase;font-weight:800;">
                Return Hop To Crib${isReturn ? ' · ACTIVE LEG' : ''}
              </div>
              <div style="font-size:14px;font-weight:700;margin-top:1px;">${state.pickup}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. HIGH-VISIBILITY ACTION BUTTONS (56PX+ IN-CAR TAP TARGETS) -->
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:10px;">
        ${isIdle ? `
          <button class="btn-primary btn-in-car" id="btnDriverAcceptDemo">
            <span>Claim Nightlife Run Request 🐰</span>
            <span style="font-size:18px;">→</span>
          </button>
        ` : ''}

        ${isAccepted ? `
          <button class="btn-primary btn-in-car" id="btnDriverArrivedPickup" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);box-shadow:0 6px 24px rgba(2,132,199,0.45);">
            <span>Mark Arrived at Crib · Depart to Hop 1 →</span>
          </button>
        ` : ''}

        ${isOutbound ? `
          <button class="btn-primary btn-in-car" id="btnDriverArrivedStop" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);box-shadow:0 6px 24px rgba(2,132,199,0.45);">
            <span>Arrived at Hop ${curIdx + 1} · Start Curbside Wait →</span>
          </button>
        ` : ''}

        ${isWaiting ? `
          ${state.isOvertime ? `
            <div style="background:#7f1d1d;border:1.5px solid #ef4444;border-radius:var(--radius-md);padding:14px;text-align:center;">
              <div style="font-size:15px;font-weight:900;color:#fee2e2;">
                🔥 OVERTIME METER ACTIVE (+${Math.floor((state.overtimeSeconds || 0) / 60)}:${((state.overtimeSeconds || 0) % 60).toString().padStart(2, '0')})
              </div>
              <div style="font-size:13px;color:#fca5a5;margin-top:3px;">
                You are earning elevated wait pay: <strong>$0.425/min ($25.50/hr)</strong> guaranteed!
              </div>
            </div>
          ` : state.gracePeriodWarning ? `
            <div style="background:#78350f;border:1.5px solid #f59e0b;border-radius:var(--radius-md);padding:12px;text-align:center;">
              <div style="font-size:14px;font-weight:800;color:#fef3c7;">
                ⏳ 3-Minute Grace Warning Active (${minutes}:${seconds} remaining)
              </div>
              <div style="font-size:12px;color:#fde68a;margin-top:2px;">
                Passenger alerted to return to the vehicle.
              </div>
            </div>
          ` : `
            <div style="background:#130a24;border:1px solid rgba(255,42,141,0.25);border-radius:var(--radius-md);padding:12px;text-align:center;">
              <div style="font-size:13.5px;color:#e2e8f0;">
                ⏳ Curbside Clock Active outside Hop ${curIdx + 1}: <strong>$0.30/min</strong> ($17.85/hr passive pay)
              </div>
            </div>
          `}
          <button class="btn-in-car" id="btnDriverSimulateReady" style="background:linear-gradient(135deg, #059669 0%, #047857 100%);color:#ffffff;box-shadow:0 6px 24px rgba(5,150,105,0.45);">
            <span>Rider Ready · Hop Back In →</span>
          </button>
        ` : ''}

        ${isRiderReady ? `
          <div style="background:#064e3b;border:1.5px solid #059669;border-radius:var(--radius-md);padding:12px;text-align:center;">
            <strong style="color:#6ee7b7;font-size:14px;">⚡ Rider is back at vehicle!</strong>
          </div>
          <button class="btn-in-car" id="btnDriverStartReturn" style="background:linear-gradient(135deg, #059669 0%, #047857 100%);color:#ffffff;box-shadow:0 6px 24px rgba(5,150,105,0.45);">
            <span>${isFinalStop 
              ? 'Depart on Return Hop to Crib 🐰 →' 
              : `Depart for Hop ${curIdx + 2} (${nextStop?.name.split('(')[0].trim()}) →`}</span>
          </button>
        ` : ''}

        ${isReturn ? `
          <button class="btn-primary btn-in-car" id="btnDriverCompleteTrip" style="background:${state.paymentMethod === 'cash' ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : state.paymentMethod === 'zelle' ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : 'linear-gradient(135deg, #ff2a8d 0%, #a855f7 100%)'};color:#ffffff;box-shadow:${state.paymentMethod === 'cash' ? '0 6px 28px rgba(22,163,74,0.45)' : state.paymentMethod === 'zelle' ? '0 6px 28px rgba(124,58,237,0.45)' : '0 6px 28px rgba(255,42,141,0.45)'};">
            <span style="font-size:20px;">${state.paymentMethod === 'cash' ? '💵' : state.paymentMethod === 'zelle' ? '🟣' : '🐰'}</span>
            <span>${state.paymentMethod === 'cash' ? `Confirm Cash (${p.formatted.totalEstimate}) & Finish Run` : state.paymentMethod === 'zelle' ? `Confirm Zelle (${p.formatted.totalEstimate}) & Finish Run` : 'Confirm Run Complete & Trigger Payout'}</span>
          </button>
        ` : ''}

        ${isCompleted ? `
          <div style="background:${state.paymentMethod === 'cash' ? '#064e3b' : state.paymentMethod === 'zelle' ? '#3b0764' : '#130a24'};border:1.5px solid ${state.paymentMethod === 'cash' ? '#34d399' : state.paymentMethod === 'zelle' ? '#c084fc' : 'var(--primary)'};border-radius:var(--radius-md);padding:16px;text-align:center;">
            <div style="font-size:26px;margin-bottom:4px;">${state.paymentMethod === 'cash' ? '💵' : state.paymentMethod === 'zelle' ? '🟣' : '🐰'}</div>
            <div style="font-size:17px;font-weight:900;color:${state.paymentMethod === 'zelle' ? '#e9d5ff' : '#34d399'};">
              ${state.paymentMethod === 'cash' ? 'Cash Payment Received!' : state.paymentMethod === 'zelle' ? 'Zelle Payment Verified!' : 'Nightlife Run Payout Settled!'}
            </div>
            <div style="font-size:13.5px;color:${state.paymentMethod === 'zelle' ? '#d8b4fe' : '#a7f3d0'};margin-top:4px;">
              ${state.paymentMethod === 'cash' 
                ? `<strong>${p.formatted.totalEstimate}</strong> collected directly from passenger in vehicle.` 
                : state.paymentMethod === 'zelle'
                ? `<strong>${p.formatted.totalEstimate}</strong> received via Zelle to <strong>${driver.zelleFormatted || '(943) 245-2611'}</strong>.`
                : `<strong>+$${p.driverPayout.totalEarnings.toFixed(2)}</strong> deposited to <strong>${state.driverCashTag || driver.cashTag}</strong>`}
            </div>
            <div style="font-size:12px;color:${state.paymentMethod === 'zelle' ? '#c084fc' : '#6ee7b7'};margin-top:4px;">
              Zero processing fees · ${state.paymentMethod === 'cash' ? '100% In Hand' : state.paymentMethod === 'zelle' ? 'Direct Bank Transfer' : 'Instant deposit'} · ${stops.length} Hops Completed · Return to Crib Safe 🐰
            </div>
          </div>
          <button class="btn-secondary" id="btnDriverResetTrip" style="background:#1e293b;color:#f8fafc;border-color:#334155;min-height:50px;font-size:14px;font-weight:700;border-radius:12px;">
            Reset & Test Another Booking
          </button>
        ` : ''}

        <!-- SWITCH BACK TO RIDER MODE -->
        <button class="btn-secondary" id="btnBackToRider" style="background:transparent;color:#94a3b8;border-color:#334155;min-height:48px;font-size:13.5px;font-weight:700;border-radius:12px;margin-top:2px;">
          ← Switch to Rider View
        </button>
      </div>
    </div>
  `;
}
