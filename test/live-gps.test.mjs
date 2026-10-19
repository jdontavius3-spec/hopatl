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

test('5. Phase 2 Step 1: Multi-Trip Concurrency & Fleet Queue isolates simultaneous riders without 409 collisions', async () => {
  // Rider A creates a trip
  const quoteA = await (await post('/api/route/quote', {
    pickup: { lat: 33.759, lng: -84.388 },
    stops: [{ destination: 'Magic City, Atlanta, GA', waitMinutes: 30 }],
  })).json();
  const tripA = await (await post('/api/trip/create', {
    initialFix: { lat: 33.759, lng: -84.388, accuracy: 8 },
    quoteId: quoteA.quote.quoteId,
    passengerCount: 2,
    holdDeposit: true,
  })).json();
  assert.equal(tripA.ok, true);

  // Rider B simultaneously quotes and creates a second trip while Trip A is active (no 409 collision!)
  const quoteBRes = await post('/api/route/quote', {
    pickup: { lat: 33.784, lng: -84.383 },
    stops: [{ destination: 'Ponce City Market, Atlanta, GA', waitMinutes: 15 }],
  });
  assert.equal(quoteBRes.status, 200, 'Rider B can quote while Trip A is active');
  const quoteB = await quoteBRes.json();

  const tripBRes = await post('/api/trip/create', {
    initialFix: { lat: 33.784, lng: -84.383, accuracy: 7 },
    quoteId: quoteB.quote.quoteId,
    passengerCount: 4,
    holdDeposit: true,
  });
  assert.equal(tripBRes.status, 201, 'Rider B can create a concurrent trip without 409');
  const tripB = await tripBRes.json();
  assert.notEqual(tripA.tripId, tripB.tripId);

  // Pilot queue sees both open requests
  const queue = await (await get('/api/driver/request')).json();
  assert.equal(queue.openRequests.length, 2, 'Both Trip A and Trip B appear in openRequests fleet queue');

  // Pilot 1 claims Trip A specifically by tripId
  const claimARes = await post('/api/trip/claim', {
    tripId: tripA.tripId,
    initialFix: { lat: 33.760, lng: -84.389, accuracy: 6 },
    pilotName: 'Pilot Alpha',
    pilotVehicle: 'Suburban VIP',
  });
  assert.equal(claimARes.status, 200);
  const claimA = await claimARes.json();
  assert.equal(claimA.tripId, tripA.tripId);

  // Trip B is still pending in the open queue while Trip A is EN_ROUTE
  const queueAfterA = await (await get('/api/driver/request')).json();
  assert.equal(queueAfterA.openRequests.length, 1);
  assert.equal(queueAfterA.openRequests[0].tripId, tripB.tripId);

  // Rider B launches Auto-Pilot on Trip B
  const simB = await (await post('/api/demo/auto-pilot', { action: 'start', autoAdvance: false }, tripB.riderToken)).json();
  assert.equal(simB.state.tripId, tripB.tripId);
  assert.equal(simB.state.simulationMode, true);

  // Verify Trip A and Trip B states remain completely isolated
  const stateA = await (await get('/api/trip/state', tripA.riderToken)).json();
  const stateB = await (await get('/api/trip/state', tripB.riderToken)).json();
  assert.equal(stateA.state.tripId, tripA.tripId);
  assert.equal(stateA.state.acceptedPilotName, 'Pilot Alpha');
  assert.equal(stateA.state.simulationMode, false);
  assert.equal(stateB.state.tripId, tripB.tripId);
  assert.equal(stateB.state.simulationMode, true);

  // Resetting Trip A does NOT wipe Trip B
  await post('/api/trip/reset', {}, tripA.riderToken);
  const stateBAfterResetA = await get('/api/trip/state', tripB.riderToken);
  assert.equal(stateBAfterResetA.status, 200, 'Trip B remains active after Trip A is reset');
  await post('/api/trip/reset', {}, tripB.riderToken);
});

test('6. Phase 2 Step 2: Operator Dispatch Switchboard supports 1-tap login, multi-trip fleet view, and trip cancellation', async () => {
  const loginRes = await post('/api/dispatch/login', { demo: true, code: 'DEMO' });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.ok(loginData.operatorToken, 'Operator token issued for 1-tap demo login');

  // Create a 2-hop trip with deposit held
  const quote = await (await post('/api/route/quote', {
    pickup: { lat: 33.759, lng: -84.388 },
    stops: [
      { destination: 'Magic City, Atlanta, GA', waitMinutes: 30 },
      { destination: 'Waffle House (Midtown)', waitMinutes: 15 },
    ],
  })).json();
  const created = await (await post('/api/trip/create', {
    initialFix: { lat: 33.759, lng: -84.388, accuracy: 8 },
    quoteId: quote.quote.quoteId,
    passengerCount: 3,
    holdDeposit: true,
  })).json();

  await post('/api/demo/auto-pilot', { action: 'start', autoAdvance: false }, created.riderToken);

  const board = await (await get('/api/dispatch/board', loginData.operatorToken)).json();
  assert.equal(board.ok, true);
  assert.ok(board.activeTrips.length >= 1, 'Active trip visible on dispatch board');
  const active = board.activeTrips.find(t => t.tripId === created.tripId);
  assert.ok(active, 'Created trip found in activeTrips');
  assert.equal(active.hops.length, 2, 'Multi-hop itinerary exposed on dispatch board');
  assert.equal(active.depositStatus, 'HELD_DEMO', '50% retainer deposit status exposed on dispatch board');
  assert.equal(active.simulationMode, true, 'Simulation mode flag exposed on dispatch board');

  // Operator cancels the trip from dispatch switchboard
  const cancelRes = await post('/api/dispatch/cancel-trip', { tripId: created.tripId }, loginData.operatorToken);
  assert.equal(cancelRes.status, 200);

  const boardAfterCancel = await (await get('/api/dispatch/board', loginData.operatorToken)).json();
  const inHistory = boardAfterCancel.history.find(h => h.tripId === created.tripId);
  assert.ok(inHistory, 'Cancelled trip moved to dispatch history with metrics');
  assert.equal(inHistory.status, 'CANCELLED');

  await post('/api/trip/reset', {}, created.riderToken);
});

test('7. Phase 2 Step 3: VIP Cabin Safe-Hold Checklist & 4-Digit Curbside Re-Boarding PIN verification', async () => {
  const created = await (await post('/api/trip/create', {
    initialFix: { lat: 33.759, lng: -84.388, accuracy: 8 },
    passengerCount: 2,
    holdDeposit: true,
  })).json();
  const token = created.riderToken;
  const pin = created.state.boardingPin;
  assert.match(pin, /^\d{4}$/, '4-digit Curbside Re-Boarding PIN generated on trip creation');
  assert.equal(created.state.boardingPinVerified, false);

  // Rider logs belongings left locked inside the SUV during a nightlife hop
  const added1 = await (await post('/api/trip/cabin-items', { action: 'add', label: 'Coat / Jacket' }, token)).json();
  assert.equal(added1.state.cabinItems.length, 1);
  assert.equal(added1.state.cabinItems[0].status, 'LOCKED_IN_CABIN');

  const added2 = await (await post('/api/trip/cabin-items', { action: 'add', label: 'Heels / Extra Shoes' }, token)).json();
  assert.equal(added2.state.cabinItems.length, 2);

  // Wrong PIN is rejected
  const wrongPinRes = await post('/api/trip/cabin-items', { action: 'verify_pin', pin: '0000' === pin ? '9999' : '0000' }, token);
  assert.equal(wrongPinRes.status, 422, 'Mismatched 4-digit PIN is rejected');

  // Matching PIN is verified
  const verified = await (await post('/api/trip/cabin-items', { action: 'verify_pin', pin }, token)).json();
  assert.equal(verified.state.boardingPinVerified, true, 'Matching 4-digit PIN verified');

  // Rider confirms all cabin belongings retrieved on return leg
  const retrieved = await (await post('/api/trip/cabin-items', { action: 'retrieve_all' }, token)).json();
  assert.ok(retrieved.state.cabinItems.every(it => it.status === 'RETRIEVED'), 'All cabin belongings marked RETRIEVED');

  await post('/api/trip/reset', {}, token);
});

test('8. Phase 2 Step 4: Expo Mobile App (apps/mobile) syncs to https://hopatl.com and supports native client workflow', async () => {
  const fs = await import('node:fs/promises');
  const mobileSource = await fs.readFile(new URL('../apps/mobile/src/app/index.js', import.meta.url), 'utf8');
  assert.match(mobileSource, /https:\/\/hopatl\.com/, 'Expo mobile app defaults to https://hopatl.com');
  assert.match(mobileSource, /\/api\/demo\/auto-pilot/, 'Expo mobile app supports Auto-Pilot Demo Simulator');
  assert.match(mobileSource, /\/api\/trip\/extend-wait/, 'Expo mobile app supports +15m standby wait extension');
  assert.match(mobileSource, /\/api\/trip\/cabin-items/, 'Expo mobile app supports VIP Cabin Safe-Hold & 4-Digit PIN');
  assert.match(mobileSource, /SUMMON_CURB/, 'Expo mobile app supports Curbside Summon');

  // Verify X-TRICKHOPPER-CLIENT: native requests succeed without browser Origin header
  const nativePost = (path, payload = {}, token = null) =>
    new Promise((resolve, reject) => {
      const req = new EventEmitter();
      req.method = 'POST';
      req.url = path;
      req.headers = {
        host: 'hopatl.com',
        'x-trickhopper-client': 'native',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
      req.destroy = () => {};
      const res = {
        status: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        writeHead(c, h = {}) { this.status = c; Object.assign(this.headers, h); },
        end(str = '') {
          resolve({ status: this.status, json: async () => (str ? JSON.parse(str) : {}) });
        },
      };
      handleRequest(req, res).catch(reject);
      process.nextTick(() => {
        req.emit('data', Buffer.from(JSON.stringify(payload)));
        req.emit('end');
      });
    });

  const createdRes = await nativePost('/api/trip/create', {
    initialFix: { lat: 33.7845, lng: -84.3832, accuracy: 8 },
    passengerCount: 2,
    holdDeposit: true,
  });
  assert.equal(createdRes.status, 201, 'Native mobile client creates trip without browser Origin header');
  const created = await createdRes.json();
  await nativePost('/api/trip/reset', {}, created.riderToken);
});





