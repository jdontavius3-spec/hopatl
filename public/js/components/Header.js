export function renderHeader(state) {
  const pilot = state.activeMode === 'pilot';
  const statusMap = {
    IDLE: 'Ready',
    REQUESTED: 'Request pending',
    EN_ROUTE: 'Pilot en route',
    WAITING_PICKUP: 'Pickup wait running',
    ACTIVE: 'Outbound · tracking',
    WAITING_HOP: 'Standby at hop',
    WAITING_RETURN: 'Standby at final stop',
    RETURNING: 'Return leg · tracking',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  };
  const status = statusMap[state.tripState] || 'Ready';
  const badgeClass =
    state.tripState === 'COMPLETED' ? 'completed' :
    ['WAITING_PICKUP', 'WAITING_HOP', 'WAITING_RETURN'].includes(state.tripState) ? 'waiting' :
    ['EN_ROUTE', 'ACTIVE', 'RETURNING'].includes(state.tripState) ? 'enroute' :
    state.tripState === 'REQUESTED' ? 'matching' : 'idle';

  const locationStatus = state.simulationMode
    ? '⚡ Auto-Pilot Demo Active'
    : state.gpsActiveByRole?.[state.activeMode]
      ? '● Live GPS Sharing'
      : '○ GPS Standby';

  return `<header class="header-bar">
    <a href="${pilot ? '/driver' : '/'}" class="header-brand-lockup" style="text-decoration:none;color:inherit">
      <span class="header-bunny-mark" aria-hidden="true">🐰</span>
      <img class="header-logo" src="/icons/trickhopper-wordmark.svg" alt="TRICKHOPPER · Nightlife Bunny Rides" width="260" height="48">
    </a>
    <a href="${pilot ? '/' : '/driver'}" class="portal-switch-pill" title="Switch portal view">${pilot ? 'Rider Portal ↗' : 'Pilot Console ↗'}</a>
  </header>
  <div class="state-indicator-strip">
    <span class="state-badge ${badgeClass}">${status}</span>
    <span style="font-size:10.5px;font-weight:700;color:var(--text-secondary)">${pilot ? 'PILOT CONSOLE · ' : 'RIDER PORTAL · '}${locationStatus}</span>
  </div>`;
}
