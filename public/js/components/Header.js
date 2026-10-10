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
    <!-- PROTOTYPE DEMONSTRATION NOTICE -->
    <div class="proto-banner">
      <span class="proto-banner-badge">TRICKHOPPER VIP</span>
      <span>Atlanta Nightlife Bunny Prototype · Pilot: Dohntay (ATL-PILOT) · Zelle · Cash App · Cash</span>
    </div>

    <!-- MAIN HEADER -->
    <header class="header-bar">
      <div class="brand-block" id="btnLogo">
        <div class="brand-mark">🐰</div>
        <div>
          <div class="brand-name">TRICKHOPPER</div>
          <div class="brand-tag">Nightlife Bunny Rides · Pilot Dohntay</div>
        </div>
      </div>

      <!-- MODE SWITCHER -->
      <div class="mode-toggle">
        <button class="mode-btn ${!isDriver ? 'active' : ''}" id="btnModeRider">
          Rider
        </button>
        <button class="mode-btn ${isDriver ? 'active-driver' : ''}" id="btnModeDriver">
          Pilot Console
        </button>
      </div>
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
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="btnInstallApp" style="background:#0f172a;border:1px solid #334155;color:#38bdf8;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:3px;">
          <span>📲</span>
          <span>Save App</span>
        </button>
        <button id="btnAbout" style="background:transparent;border:none;color:var(--primary);font-size:11.5px;font-weight:700;cursor:pointer;">
          How it works ↗
        </button>
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
