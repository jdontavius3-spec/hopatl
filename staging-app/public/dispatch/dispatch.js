const root = document.querySelector('#dispatch-app');
const key = 'trickhopper_dispatch_session';
let token = sessionStorage.getItem(key);
let timer = null;
let busy = false;
let actionBusy = false;
let refreshing = false;

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => (value ? new Date(value).toLocaleString() : '—');
const money = cents => `$${((Number(cents) || 0) / 100).toFixed(2)}`;
const smsHref = (phone, body) => `sms:${encodeURIComponent(phone).replace('%2B', '+')}?&body=${encodeURIComponent(body)}`;
const duration = value => {
  if (value === null || value === undefined) return '—';
  const total = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

function exportMetrics(records) {
  const columns = [
    'trip_id',
    'status',
    'trip_state',
    'mode',
    'hops_count',
    'deposit_status',
    'total_fare_usd',
    'requested_at',
    'accepted_at',
    'completed_at',
    'closed_at',
    'request_to_accept_seconds',
    'ride_duration_seconds',
    'end_to_end_seconds',
    'planned_distance_miles',
    'recorded_pilot_distance_miles',
    'reserved_stop_wait_minutes',
    'observed_pickup_and_stop_wait_seconds',
    'rider_gps_fixes',
    'pilot_gps_fixes',
  ];
  const rows = records.map(h => {
    const m = h.metrics || {};
    return [
      h.tripId,
      h.status,
      h.tripState,
      h.simulationMode ? 'AUTO_PILOT_DEMO' : 'LIVE_GPS',
      (h.hops || []).length || 1,
      h.depositStatus || 'UNPAID',
      ((Number(h.totalFareCents) || 0) / 100).toFixed(2),
      h.requestedAt,
      h.acceptedAt,
      h.completedAt,
      h.closedAt,
      m.requestToAcceptSeconds,
      m.rideDurationSeconds,
      m.endToEndSeconds,
      m.plannedDistanceMiles,
      m.recordedPilotDistanceMiles,
      m.reservedStopWaitMinutes,
      m.observedWaitSeconds,
      m.riderGpsFixes,
      m.pilotGpsFixes,
    ];
  });
  const csv = [columns, ...rows]
    .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `trickhopper-ride-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function post(path, data) {
  const r = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  const x = await r.json();
  if (!r.ok) throw Error(x.error || 'Request failed');
  return x;
}

function login(error = '') {
  root.innerHTML = `<div class="wrap">
    <header class="brand">
      <img src="/icons/trickhopper-wordmark.svg" alt="TRICKHOPPER">
      <span>PRIVATE OPERATIONS · <a href="/" style="color:#ff62b6">Rider</a> · <a href="/driver" style="color:#49d5a1">Pilot</a></span>
    </header>
    <section class="card form">
      <div class="eyebrow">DISPATCH CONSOLE · FLEET SWITCHBOARD</div>
      <h1 class="title">Operator Sign In</h1>
      <p class="sub">Monitor multi-trip fleet concurrency, multi-hop standby timers, 50% retainer deposits, curbside summons, and CSV audit records.</p>
      <button type="button" id="demo-login" ${busy ? 'disabled' : ''} style="margin-bottom:12px">
        ${busy ? 'Opening Switchboard…' : '⚡ 1-Tap Demo Operator Sign-In →'}
      </button>
      <form id="login">
        <label class="field" for="code">OR ENTER DISPATCH ACCESS CODE</label>
        <input id="code" type="password" placeholder="Optional in demo mode" autocomplete="current-password">
        <button type="submit" style="background:#24162d;border:1px solid var(--line)" ${busy ? 'disabled' : ''}>
          ${busy ? 'Signing in…' : 'Sign in with access code →'}
        </button>
      </form>
      ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
    </section>
  </div>`;

  root.querySelector('#demo-login')?.addEventListener('click', async () => {
    busy = true;
    try {
      const data = await post('/api/dispatch/login', { demo: true, code: 'DEMO' });
      token = data.operatorToken;
      sessionStorage.setItem(key, token);
      await refresh();
    } catch (err) {
      login(err.message);
    } finally {
      busy = false;
    }
  });

  root.querySelector('#login')?.addEventListener('submit', async e => {
    e.preventDefault();
    busy = true;
    try {
      const data = await post('/api/dispatch/login', { code: root.querySelector('#code').value || 'DEMO', demo: true });
      token = data.operatorToken;
      sessionStorage.setItem(key, token);
      await refresh();
    } catch (err) {
      login(err.message);
    } finally {
      busy = false;
    }
  });
}

function render(data) {
  const pilots = data.pilots || [];
  const activeTrips = data.activeTrips || (data.request && ['PENDING', 'ACCEPTED'].includes(data.request.status) ? [data.request] : []);
  const history = data.history || [];
  const exportableRecords = [...activeTrips, ...history];
  const available = pilots.filter(p => p.status === 'AVAILABLE').length;
  const busyPilots = pilots.filter(p => p.status === 'ON_TRIP').length;
  const standby = pilots.filter(p => p.status === 'STANDBY').length;

  const pilotRows = pilots.length
    ? pilots
        .map(p => {
          const topReq = activeTrips.find(t => t.status === 'PENDING');
          const message = topReq
            ? `TRICKHOPPER ride request ${topReq.tripId.slice(0, 8).toUpperCase()} · ${topReq.destination || 'new destination'}. Please open /driver to review.`
            : 'TRICKHOPPER dispatch: please check the pilot portal (/driver).';
          return `<div class="row">
            <div>
              <strong>${esc(p.name)}</strong>
              ${p.vehicle ? `<span class="small">${esc(p.vehicle)}${p.plate ? ` · Plate ${esc(p.plate)}` : ''}</span>` : '<span class="small">Vehicle details verified</span>'}
              <span class="small">Last heartbeat ${esc(date(p.lastSeenAt))}${p.activeTripId ? ` · Active Trip ${esc(p.activeTripId.slice(0, 8).toUpperCase())}` : ''}</span>
              ${p.phone ? `<a class="row-action" href="${esc(smsHref(p.phone, message))}">Text pilot</a>` : ''}
            </div>
            <span class="badge ${p.status === 'AVAILABLE' ? 'available' : p.status === 'ON_TRIP' ? 'busy' : 'offline'}">${esc(p.status.replace('_', ' '))}</span>
          </div>`;
        })
        .join('')
    : '<div class="empty">No pilot has signed into this roster yet.</div>';

  const reqHtml = activeTrips.length
    ? activeTrips
        .map(req => {
          const hops = req.hops || [];
          const hopsText = hops.length
            ? hops.map((h, i) => `Hop ${i + 1}: ${esc(h.label)} (${h.waitMinutes}m reserved · ${duration(h.elapsedSeconds)} elapsed)`).join(' · ')
            : esc(req.destination || 'Destination selected');
          return `<div class="row" style="flex-direction:column;align-items:stretch">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div>
                <strong>${req.status === 'PENDING' ? 'Incoming Multi-Hop Request' : `Active Trip · ${esc(req.tripState)}`} (${esc(req.tripId.slice(0, 8).toUpperCase())})</strong>
                <span class="small">${Number(req.passengerCount || 1)} passenger(s) · ${req.simulationMode ? '⚡ Auto-Pilot Simulator' : '📡 Live GPS'} · Est. ${money(req.totalFareCents)}</span>
                <span class="small"><strong>Itinerary:</strong> ${hopsText}</span>
                <span class="small"><strong>50% Retainer Deposit:</strong> ${req.depositStatus === 'HELD_DEMO' ? `Locked (${money(req.depositAmountCents)})` : 'Unpaid'} · <strong>Curbside:</strong> ${esc(req.curbsideStatus || 'NONE')}</span>
                ${req.acceptedPilotName ? `<span class="small">Assigned Pilot: <b>${esc(req.acceptedPilotName)}</b> (${esc(req.acceptedPilotVehicle || 'SUV')} · ${esc(req.acceptedPilotPlate || 'ATL-HOP1')})</span>` : ''}
                <span class="small">${esc(req.notificationMessage || '')}</span>
              </div>
              <span class="badge ${req.status === 'PENDING' ? 'pending' : 'busy'}">${esc(req.tripState || req.status)}</span>
            </div>
            <button type="button" class="danger-action" data-cancel-trip="${esc(req.tripId)}" ${actionBusy ? 'disabled' : ''}>
              Cancel trip ${esc(req.tripId.slice(0, 8).toUpperCase())} & release pilot
            </button>
          </div>`;
        })
        .join('')
    : '<div class="empty">No active ride requests right now. Open <a href="/" style="color:#ff62b6">/ (Rider Portal)</a> to launch a live or Auto-Pilot trip.</div>';

  const hist = history.length
    ? history
        .slice(0, 12)
        .map(h => {
          const m = h.metrics || {};
          return `<div class="row">
            <div>
              <strong>${esc(h.status)} · ${esc(h.tripId.slice(0, 8).toUpperCase())} (${h.simulationMode ? 'Auto-Pilot Demo' : 'Live GPS'})</strong>
              <span class="small">${esc(h.destination || 'Destination')} · ${esc(h.pilotName || 'No pilot assigned')} · Fare ${money(h.totalFareCents)}</span>
              <span class="small">Requested ${esc(date(h.requestedAt))} · Closed ${esc(date(h.closedAt))}</span>
              ${h.metrics ? `<span class="small">Route: ${Number(m.plannedDistanceMiles || 0).toFixed(1)} planned mi · ${Number(m.recordedPilotDistanceMiles || 0).toFixed(1)} GPS mi · ${Number(m.reservedStopWaitMinutes || 0)} reserved stop min · ${duration(m.observedWaitSeconds)} tracked wait</span>` : ''}
            </div>
            <span class="badge ${h.status === 'COMPLETED' ? 'completed' : h.status === 'EXPIRED' ? 'expired' : 'cancelled'}">${esc(h.status)}</span>
          </div>`;
        })
        .join('')
    : '<div class="empty">Completed and closed rides appear here automatically.</div>';

  root.innerHTML = `<div class="wrap">
    <header class="brand">
      <img src="/icons/trickhopper-wordmark.svg" alt="TRICKHOPPER">
      <span>DISPATCH · <a href="/" style="color:#ff62b6">Rider</a> · <a href="/driver" style="color:#49d5a1">Pilot</a> · <span id="updated">updating</span></span>
    </header>
    <div class="topline">
      <div>
        <div class="eyebrow">OPERATOR SWITCHBOARD · MULTI-TRIP FLEET ENGINE</div>
        <h1 class="title">Live Nightlife Dispatch</h1>
        <p class="sub">Real-time visibility across concurrent multi-hop trips, reserved standby timers, 50% upfront retainer holds, and curbside summons.</p>
      </div>
      <button id="signout">Sign out</button>
    </div>
    <div class="statline">
      <span class="chip">${activeTrips.length} active trip(s)</span>
      <span class="chip">${available} pilot(s) available</span>
      <span class="chip">${busyPilots} pilot(s) on trip</span>
      <span class="chip">${standby} auto-pilot sim ready</span>
      <span class="chip">${history.length} closed in session</span>
    </div>
    <div class="grid">
      <section class="card">
        <h2>Pilot Roster</h2>
        <div class="list">${pilotRows}</div>
      </section>
      <section class="card">
        <h2>Active Fleet Queue (${activeTrips.length})</h2>
        <div class="list">${reqHtml}</div>
      </section>
      <section class="card wide">
        <div class="card-title-row">
          <h2>Completed & Closed Rides (${history.length})</h2>
          <button type="button" class="export-action" id="export-metrics" ${exportableRecords.length ? '' : 'disabled'}>
            Export metrics CSV (${exportableRecords.length})
          </button>
        </div>
        <div class="list">${hist}</div>
        <p class="small">CSV export includes multi-hop counts, 50% deposit status, route estimate vs. recorded pilot GPS distance, standby wait seconds, and GPS sample counts.</p>
      </section>
    </div>
    <div class="note">
      <strong>Multi-Trip Fleet Engine Active:</strong> Concurrent riders are isolated in <code>tripId</code>-keyed rooms so simultaneous demos and live trips never collide.
    </div>
  </div>`;

  root.querySelector('#signout')?.addEventListener('click', () => {
    sessionStorage.removeItem(key);
    token = null;
    clearInterval(timer);
    timer = null;
    login();
  });
  root.querySelector('#updated').textContent = new Date().toLocaleTimeString();
  root.querySelector('#export-metrics')?.addEventListener('click', () => exportMetrics(exportableRecords));
  root.querySelectorAll('[data-cancel-trip]').forEach(btn => {
    btn.addEventListener('click', () =>
      runAction('/api/dispatch/cancel-trip', { tripId: btn.dataset.cancelTrip }, 'Cancel this trip and release the assigned pilot?')
    );
  });
}

async function runAction(path, data, confirmation) {
  if (actionBusy || !window.confirm(confirmation)) return;
  actionBusy = true;
  try {
    await post(path, data);
    await refresh();
  } catch (error) {
    const prior = root.querySelector('.action-error');
    if (prior) prior.remove();
    root.querySelector('.topline')?.insertAdjacentHTML('afterend', `<div class="error action-error" role="alert">${esc(error.message)}</div>`);
  } finally {
    actionBusy = false;
  }
}

async function refresh() {
  if (!token) {
    login();
    return;
  }
  if (refreshing) return;
  refreshing = true;
  try {
    const r = await fetch('/api/dispatch/board', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await r.json();
    if (r.status === 401) {
      sessionStorage.removeItem(key);
      token = null;
      clearInterval(timer);
      timer = null;
      login(data.error);
      return;
    }
    if (!r.ok) throw Error(data.error || 'Dispatch board unavailable');
    render(data);
    if (!timer) timer = setInterval(refresh, 2500);
  } catch (error) {
    if (!root.querySelector('.error')) {
      root.insertAdjacentHTML('beforeend', `<div class="error" role="alert">${esc(error.message)}</div>`);
    }
    if (!timer) timer = setInterval(refresh, 5000);
  } finally {
    refreshing = false;
  }
}

refresh();
