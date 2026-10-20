export function renderHeader(state) {
  const status={IDLE:'Ready',REQUESTED:'Request pending',ACTIVE:'Connected · tracking',COMPLETED:'Completed'}[state.tripState]||'Ready';
  const locationStatus=state.gpsActiveByRole?.[state.activeMode]?'Location shared':'Location off';
  return `<header class="header-bar"><div class="header-brand-lockup"><span class="header-bunny-mark" aria-hidden="true">🐰</span><img class="header-logo" src="/icons/trickhopper-wordmark.svg" alt="TRICKHOPPER · Nightlife Bunny Rides" width="310" height="56"></div></header><div class="state-indicator-strip"><span class="state-badge ${state.tripState==='COMPLETED'?'completed':'idle'}">${status}</span><span style="font-size:10px;color:var(--text-tertiary)">${locationStatus}</span></div>`;
}
