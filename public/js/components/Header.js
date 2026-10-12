/**
 * Header Component
 * Contains prototype disclaimer banner, mode switcher (Rider vs Driver demo),
 * and live trip state indicator.
 */

import { TRIP_STATES } from '../store.js';

export function renderHeader(state, { onModeChange, onAboutClick, onLogoClick }) {
  const isDriver = state.activeMode === 'driver';

  // Format status badge
  let badgeClass = 'idle';
  let badgeText = 'Idle';

  switch (state.tripState) {
    case TRIP_STATES.IDLE:
      badgeClass = 'idle';
      badgeText = 'Ready to Hop';
      break;
    case TRIP_STATES.BOOKING:
      badgeClass = 'booking';
      badgeText = 'Drafting Hops';
      break;
    case TRIP_STATES.REVIEW:
      badgeClass = 'booking';
      badgeText = 'Fare Review';
      break;
    case TRIP_STATES.MATCHING:
      badgeClass = 'matching';
      badgeText = `Calling Pilot ${state.driver?.name || 'Dohntay'}...`;
      break;
    case TRIP_STATES.DRIVER_ACCEPTED:
      badgeClass = 'enroute';
      badgeText = 'Pilot En Route';
      break;
    case TRIP_STATES.OUTBOUND:
      badgeClass = 'enroute';
      badgeText = 'Outbound Hop';
      break;
    case TRIP_STATES.WAITING: {
      const mins = Math.floor(state.waitTimerRemaining / 60);
      const secs = (state.waitTimerRemaining % 60).toString().padStart(2, '0');
      badgeClass = 'waiting';
      badgeText = `Hop Stop (${mins}:${secs})`;
      break;
    }
    case TRIP_STATES.RIDER_READY:
      badgeClass = 'rider-ready';
      badgeText = 'Rider Ready 🐰';
      break;
    case TRIP_STATES.RETURN_LEG:
      badgeClass = 'enroute';
      badgeText = 'Return Hop to Crib';
      break;
    case TRIP_STATES.COMPLETED:
      badgeClass = 'completed';
      badgeText = 'Run Complete 🐰';
      break;
    default:
      break;
  }

  return `
    <!-- MAIN HEADER -->
    <header class="header-bar">
      <div class="brand-block" id="btnLogo">
        <div class="brand-mark">🐰</div>
        <div>
          <div class="brand-name">TRICKHOPPER</div>
          <div class="brand-tag">Nightlife Bunny Rides · Pilot ${state.driver?.name || 'Dohntay'}</div>
        </div>
      </div>

      <!-- HEADER ACTION / MODE DISPLAY -->
      ${isDriver ? `
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="btnInstallApp" style="background:#0c1c2e;border:1px solid rgba(56,189,248,0.35);color:#38bdf8;padding:5px 10px;border-radius:12px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 0 10px rgba(56,189,248,0.2);">
            <span>📲</span>
            <span>Save Pilot</span>
          </button>
          <a href="/" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:5px 8px;border-radius:8px;font-size:10.5px;font-weight:700;text-decoration:none;">
            Rider View ↗
          </a>
        </div>
      ` : `
        <div style="display:flex;align-items:center;gap:6px;">
          <a href="/driver" id="btnNavPilotPortal" style="background:#130a24;border:1.5px solid var(--primary);color:#ff70ba;padding:5px 10px;border-radius:12px;font-size:11px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;gap:4px;box-shadow:0 0 10px rgba(255,42,141,0.25);">
            <span>🚗</span>
            <span>Pilot Console ↗</span>
          </a>
          <button id="btnAbout" style="background:transparent;border:none;color:var(--text-secondary);font-size:11.5px;font-weight:700;cursor:pointer;padding:4px 4px;">
            How it works ↗
          </button>
        </div>
      `}
    </header>

    <!-- SYNCHRONIZED STATE PILL STRIP WITH PORTAL SWITCHER -->
    <div class="state-indicator-strip" style="display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-tertiary);">Portal:</span>
        <span class="state-badge ${isDriver ? 'enroute' : 'idle'}" style="font-weight:800;">
          ${isDriver ? `🚗 Pilot Console (${state.driver?.name || 'Pilot'})` : '🐰 Passenger Booking Portal'}
        </span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${isDriver ? `
          <a href="/" style="font-size:10.5px;color:#38bdf8;font-weight:700;text-decoration:none;background:#0c1c2e;padding:3px 8px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);">
            ← Rider Portal
          </a>
        ` : `
          <a href="/driver" style="font-size:10.5px;color:#ff70ba;font-weight:700;text-decoration:none;background:#180b2a;padding:3px 8px;border-radius:6px;border:1px solid rgba(255,42,141,0.3);">
            🚗 Pilot Console →
          </a>
        `}
      </div>
    </div>

    <!-- TOAST NOTIFICATION -->
    ${state.notificationMessage ? `
      <div class="toast-notice">
        <span>${state.notificationMessage}</span>
        <button class="toast-close" id="btnCloseToast">&times;</button>
      </div>
    ` : ''}
  `;
}
