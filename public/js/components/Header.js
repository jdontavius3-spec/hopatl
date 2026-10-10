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
      badgeText = 'Calling Pilot Dohntay...';
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
          <div class="brand-tag">Nightlife Bunny Rides · Pilot Dohntay</div>
        </div>
      </div>

      <!-- HEADER ACTION / MODE DISPLAY -->
      ${isDriver ? `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:rgba(56,189,248,0.15);color:#38bdf8;padding:4px 10px;border-radius:12px;font-size:10.5px;font-weight:800;border:1px solid rgba(56,189,248,0.35);letter-spacing:0.04em;">
            PILOT CONSOLE
          </span>
          <a href="/" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:4px 8px;border-radius:8px;font-size:10.5px;font-weight:700;text-decoration:none;">
            Rider View ↗
          </a>
        </div>
      ` : `
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="btnInstallApp" style="background:#130a24;border:1px solid rgba(255,42,141,0.35);color:#ff70ba;padding:5px 10px;border-radius:12px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 0 10px rgba(255,42,141,0.2);">
            <span>📲</span>
            <span>Save App</span>
          </button>
          <button id="btnAbout" style="background:transparent;border:none;color:var(--text-secondary);font-size:11.5px;font-weight:700;cursor:pointer;padding:4px 4px;">
            How it works ↗
          </button>
        </div>
      `}
    </header>

    <!-- SYNCHRONIZED STATE PILL STRIP -->
    <div class="state-indicator-strip">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-tertiary);">Active State:</span>
        <span class="state-badge ${badgeClass}">
          <span class="state-dot"></span>
          ${badgeText}
        </span>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);">
        ${isDriver ? 'Camry Pilot Node' : 'Atlanta Nightlife VIP'}
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
