import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

process.env.NO_LISTEN = '1';
const { handleRequest, exportPersistentState, importPersistentState } = await import('../server.mjs');
const { default: vercelApiHandler } = await import('../api/[...path].js');

const origin = 'http://127.0.0.1:4242';

function invoke(method, path, payload = null, token = null) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = { host: '127.0.0.1:4242', origin };
    if (token) req.headers.authorization = `Bearer ${token}`;
    req.destroy = () => {};
    const res = {
      status: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(c, h = {}) {
        this.status = c;
        Object.assign(this.headers, h);
      },
      end(str = '') {
        resolve({
          status: this.status,
          ok: this.status >= 200 && this.status < 300,
          async json() {
            return str ? JSON.parse(str) : {};
          },
        });
      },
    };
    handleRequest(req, res).catch(reject);
    if (method === 'POST') {
      process.nextTick(() => {
        if (payload !== null) req.emit('data', Buffer.from(JSON.stringify(payload)));
        req.emit('end');
      });
    }
  });
}

const post = (path, payload = {}, token = null) => invoke('POST', path, payload, token);
const get = (path, token = null) => invoke('GET', path, null, token);

test('1. trip token pairs rider and pilot GPS through connection and completion', async () => {
  const health = await (await get('/api/health')).json();
  assert.equal(health.ok, true, 'health check passes');

  const initialFix = { lat: 33.759, lng: -84.388, accuracy: 5, source: 'live-gps' };
  assert.equal((await post('/api/trip/create', {})).status, 422, 'trip creation requires the first GPS fix');

  const created = await (await post('/api/trip/create', { initialFix })).json();
  assert.ok(created.tripId);
  assert.ok(created.riderToken);
  assert.match(created.pilotJoinCode, /^[A-F0-9]{10}$/);
  assert.equal(created.state.tripState, 'REQUESTED');

  assert.equal((await get('/api/trip/state', 'invalid')).status, 401, 'private state requires a scoped token');
  assert.equal((await post('/api/trip/join', { code: '0000000000' })).status, 401, 'wrong pilot code is rejected');

  const joined = await (await post('/api/trip/join', { code: created.pilotJoinCode })).json();
  assert.ok(joined.pilotToken);
  assert.equal(joined.tripId, created.tripId);
  assert.equal((await post('/api/trip/join', { code: created.pilotJoinCode })).status, 401, 'pilot invite is one use');

  const fix = (role, lat, lng, token) =>
    post('/api/telemetry/location', { role, lat, lng, accuracy: 5, speed: 0, heading: null, source: 'live-gps' }, token);

  assert.equal((await fix('pilot', 33.759, -84.388, created.riderToken)).status, 401, 'rider token cannot send pilot locations');
  assert.equal((await fix('pilot', 33.759, -84.388, joined.pilotToken)).status, 200);
  assert.equal((await post('/api/trip/state', { tripState: 'ACTIVE' }, created.riderToken)).status, 409, 'only the paired pilot can connect');
  assert.equal((await post('/api/trip/state', { tripState: 'ACTIVE' }, joined.pilotToken)).status, 200);

  for (const role of ['rider', 'pilot']) {
    const token = role === 'rider' ? created.riderToken : joined.pilotToken;
    assert.equal((await fix(role, 33.75901, -84.38801, token)).status, 200);
    if (role === 'pilot') await sleep(120);
    assert.equal((await fix(role, 33.75902, -84.38802, token)).status, 200);
  }

  const state = await (await get('/api/trip/state', created.riderToken)).json();
  assert.equal(state.state.tripState, 'ACTIVE');
  assert.equal(state.shared.fixCounts.rider, 2);
  assert.ok(state.shared.fixCounts.pilot >= 2);
  assert.ok(state.state.tripDistanceMiles > 0);

  assert.equal((await post('/api/trip/state', { tripState: 'COMPLETED' }, created.riderToken)).status, 409);
  assert.equal((await post('/api/trip/state', { tripState: 'COMPLETED' }, joined.pilotToken)).status, 200);
  assert.equal((await post('/api/trip/reset', {}, joined.pilotToken)).status, 200);
});

test('2. multi-hop nightlife itinerary, pilot screen-lock independence, wait extension, and curbside summon', async () => {
  const quoteRes = await post('/api/route/quote', {
    pickup: { lat: 33.759, lng: -84.388 },
    stops: [
      { destination: 'Magic City, Atlanta, GA', waitMinutes: 30 },
      { destination: 'Waffle House (Midtown)', waitMinutes: 15 },
    ],
  });
  assert.equal(quoteRes.status, 200);
  const { quote } = await quoteRes.json();
  assert.equal(quote.hops.length, 2, '2 hops quoted');
  assert.ok(quote.fare.upfrontDepositCents > 0, '50% upfront deposit calculated');
  assert.ok(quote.fare.uberSurgeEstimateCents > quote.fare.totalCents, 'surge comparison calculated');

  const createRes = await post('/api/trip/create', {
    initialFix: { lat: 33.759, lng: -84.388, accuracy: 8 },
    quoteId: quote.quoteId,
    passengerCount: 3,
    holdDeposit: true,
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.state.depositStatus, 'HELD_DEMO');

  const claimRes = await post('/api/trip/claim', {
    initialFix: { lat: 33.762, lng: -84.391, accuracy: 8 },
    pilotName: 'Dohntay',
    pilotVehicle: 'Black Escalade ESV',
  });
  assert.equal(claimRes.status, 200);
  const claimed = await claimRes.json();

  // Simulate rider locking their phone screen inside Hop 1 (rider GPS goes inactive)
  await post('/api/telemetry/status', { role: 'rider', active: false, error: 'iOS background screen locked' }, created.riderToken);

  // Pilot must still be able to progress all wait events without being blocked by rider's locked screen
  assert.equal((await post('/api/trip/wait-event', { action: 'arrive_pickup' }, claimed.pilotToken)).status, 200);
  assert.equal((await post('/api/trip/wait-event', { action: 'start_outbound' }, claimed.pilotToken)).status, 200);

  const hop1 = await (await post('/api/trip/wait-event', { action: 'arrive_stop' }, claimed.pilotToken)).json();
  assert.equal(hop1.state.tripState, 'WAITING_HOP');
  assert.equal(hop1.state.curbsideStatus, 'STAGED_NEARBY');

  // Rider extends Hop 1 wait by +15 min and summons pilot to curb
  const extended = await (await post('/api/trip/extend-wait', { addMinutes: 15 }, created.riderToken)).json();
  assert.equal(extended.state.routeQuote.hops[0].waitMinutes, 45);

  const summoned = await (await post('/api/trip/ping', { code: 'SUMMON_CURB' }, created.riderToken)).json();
  assert.equal(summoned.state.curbsideStatus, 'SUMMONED_BY_RIDER');

  // Depart Hop 1 -> Arrive Hop 2 (final stop) -> Start Return -> Complete
  assert.equal((await (await post('/api/trip/wait-event', { action: 'start_next_hop' }, claimed.pilotToken)).json()).state.tripState, 'ACTIVE');
  assert.equal((await (await post('/api/trip/wait-event', { action: 'arrive_stop' }, claimed.pilotToken)).json()).state.tripState, 'WAITING_RETURN');
  assert.equal((await (await post('/api/trip/wait-event', { action: 'start_return' }, claimed.pilotToken)).json()).state.tripState, 'RETURNING');

  await post('/api/telemetry/location', { role: 'pilot', lat: 33.758, lng: -84.389, accuracy: 6 }, claimed.pilotToken);
  await post('/api/telemetry/location', { role: 'pilot', lat: 33.759, lng: -84.388, accuracy: 6 }, claimed.pilotToken);

  const done = await post('/api/trip/state', { tripState: 'COMPLETED' }, claimed.pilotToken);
  assert.equal(done.status, 200);
  await post('/api/trip/reset', {}, claimed.pilotToken);
});

test('3. self-serve Auto-Pilot Demo Simulator runs end-to-end without requiring a second device', async () => {
  const created = await (await post('/api/trip/create', { initialFix: { lat: 33.759, lng: -84.388, accuracy: 8 } })).json();
  const token = created.riderToken;

  let sim = await (await post('/api/demo/auto-pilot', { action: 'start', autoAdvance: false }, token)).json();
  assert.equal(sim.state.simulationMode, true);
  assert.equal(sim.state.tripState, 'EN_ROUTE');
  assert.ok(sim.state.acceptedPilotName.includes('Rocko'));

  const visitedStates = [sim.state.tripState];
  while (sim.state.tripState !== 'COMPLETED' && visitedStates.length < 12) {
    sim = await (await post('/api/demo/auto-pilot', { action: 'step' }, token)).json();
    visitedStates.push(sim.state.tripState);
  }
  assert.deepEqual(visitedStates, ['EN_ROUTE', 'WAITING_PICKUP', 'ACTIVE', 'WAITING_RETURN', 'RETURNING', 'COMPLETED']);

  // Verify Demo Checkout auto-approves pilot step when in simulationMode
  await post('/api/trip/settlement-mode', { mode: 'DEMO_DIGITAL' }, token);
  const proposed = await (await post('/api/demo/payment', { action: 'propose', amountCents: 1800 }, token)).json();
  assert.equal(proposed.state.demoPayment.status, 'FARE_APPROVED');
  const settled = await (await post('/api/demo/payment', { action: 'simulate_success' }, token)).json();
  assert.equal(settled.state.demoPayment.status, 'TEST_SUCCEEDED');

  await post('/api/trip/reset', {}, token);
});

test('4. serverless persistence hooks and Vercel catch-all handler preserve active trip across cold starts', async () => {
  const created = await (await post('/api/trip/create', { initialFix: { lat: 33.759, lng: -84.388, accuracy: 8 } })).json();
  const snapshot = JSON.parse(JSON.stringify(exportPersistentState()));
  assert.equal(snapshot.access.tripId, created.state.tripId);

  await post('/api/trip/reset', {}, created.riderToken);
  importPersistentState(snapshot);

  // Verify restored state via Vercel catch-all handler
  const restored = await new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = 'GET';
    req.url = `/api/state?tripId=${encodeURIComponent(created.state.tripId)}`;
    req.headers = { host: 'hopatl.com', authorization: `Bearer ${created.riderToken}` };
    req.destroy = () => {};
    const res = {
      status: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(c, h = {}) { this.status = c; Object.assign(this.headers, h); },
      end(str = '') { resolve({ status: this.status, body: JSON.parse(str) }); }
    };
    vercelApiHandler(req, res);
  });

  assert.equal(restored.status, 200);
  assert.equal(restored.body.state.tripId, created.state.tripId);
  assert.equal(restored.body.authRole, 'rider');

  await post('/api/trip/reset', {}, created.riderToken);
});

