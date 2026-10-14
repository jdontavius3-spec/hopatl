export function renderHeader(state) {
  const pilot=state.activeMode==='pilot';
  const status={IDLE:'Ready',REQUESTED:'Request pending',ACTIVE:'Connected · tracking',COMPLETED:'Completed'}[state.tripState]||'Ready';
  return `<header class="header-bar"><a href="${pilot?'/driver':'/'}" class="brand-block" style="text-decoration:none;color:inherit"><div class="brand-mark">🐰</div><div><div class="brand-name">TRICKHOPPER</div><div class="brand-tag">${pilot?'Pilot portal':'Rider portal'}</div></div></a><a href="${pilot?'/':'/driver'}" class="footer-link">${pilot?'Rider ↗':'Pilot ↗'}</a></header><div class="state-indicator-strip"><span class="state-badge ${state.tripState==='COMPLETED'?'completed':'idle'}">${status}</span><span style="font-size:10px;color:var(--text-tertiary)">${state.simulationMode?'SIMULATION DATA':state.gpsActiveByRole?.[state.activeMode]?'LIVE GPS SHARING':'GPS NOT SHARING'}</span></div>`;
}
