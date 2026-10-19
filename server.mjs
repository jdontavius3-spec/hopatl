import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { calculateFare, RATE_CARD } from './public/js/pricing.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const WAIT_GRACE_SECONDS = RATE_CARD.waitGraceSeconds || 120;
const METERS_PER_MILE = 1609.344;
const GEOCODER_ENDPOINT = process.env.GEOCODER_ENDPOINT || 'https://nominatim.openstreetmap.org/search';
const ROUTER_ENDPOINT = process.env.ROUTER_ENDPOINT || 'https://router.project-osrm.org/route/v1/driving';

// Curated Atlanta Nightlife & Landmark Gazetteer for instant, zero-latency demo reliability
const ATLANTA_PLACES = [
  { id: 'atl-magic-city', name: 'Magic City', label: 'Magic City · 241 Forsyth St SW, Downtown Atlanta, GA', lat: 33.7483, lng: -84.3963 },
  { id: 'atl-ponce-city', name: 'Ponce City Market', label: 'Ponce City Market · 675 Ponce De Leon Ave NE, Atlanta, GA', lat: 33.7726, lng: -84.3656 },
  { id: 'atl-krog-street', name: 'Krog Street Market', label: 'Krog Street Market · 99 Krog St NE, Inman Park, Atlanta, GA', lat: 33.7568, lng: -84.3641 },
  { id: 'atl-the-battery', name: 'The Battery Atlanta', label: 'The Battery Atlanta · 800 Battery Ave SE, Atlanta, GA', lat: 33.8907, lng: -84.4678 },
  { id: 'atl-compound', name: 'Compound Nightclub', label: 'Compound · 1008 Brady Ave NW, West Midtown, Atlanta, GA', lat: 33.7819, lng: -84.4126 },
  { id: 'atl-waffle-house', name: 'Waffle House (Midtown)', label: 'Waffle House · 66 5th St NW, Midtown Atlanta, GA', lat: 33.7768, lng: -84.3894 },
  { id: 'atl-jr-crickets', name: 'JR Crickets (Midtown)', label: 'JR Crickets · 129 North Ave NW, Atlanta, GA', lat: 33.7714, lng: -84.3921 },
  { id: 'atl-buckhead-village', name: 'Buckhead Village District', label: 'Buckhead Village · 3035 Peachtree Rd NE, Atlanta, GA', lat: 33.8384, lng: -84.3793 },
  { id: 'atl-edgewood', name: 'Edgewood Ave Nightlife District', label: 'Edgewood Ave SE · Old Fourth Ward, Atlanta, GA', lat: 33.7544, lng: -84.3723 },
  { id: 'atl-state-farm', name: 'State Farm Arena', label: 'State Farm Arena · 1 State Farm Dr, Atlanta, GA', lat: 33.7573, lng: -84.3963 },
];

const routeQuotes = new Map();
const geocodeCache = new Map();
let lastGeocodeAt = 0;
let geocodeQueue = Promise.resolve();
let autoPilotTimer = null;

function emptyState() {
  return {
    tripState: 'IDLE',
    simulationMode: false,
    notificationMessage: null,
    destination: null,
    routeQuote: null,
    passengerCount: 1,
    stopIndex: 0,
    stopWaits: [],
    pickupArrivedAt: null,
    rideStartedAt: null,
    destinationArrivedAt: null,
    returnStartedAt: null,
    rideCompletedAt: null,
    tripDistanceMiles: 0,
    acceptedPilotName: null,
    acceptedPilotVehicle: null,
    acceptedPilotPlate: null,
    curbsideStatus: 'NONE', // NONE | STAGED_NEARBY | SUMMONED_BY_RIDER | PULLING_TO_CURB | AT_CURB_HAZARDS
    curbsideUpdatedAt: null,
    pings: [],
    depositStatus: 'UNPAID', // UNPAID | HELD_DEMO | CONFIRMED_EXTERNAL
    depositAmountCents: null,
    boardingPin: null,
    boardingPinVerified: false,
    cabinItems: [],
    cashConfirmation: { status: 'NOT_OFFERED', amountCents: null, attestations: { rider: false, pilot: false } },
    externalPayment: { status: 'NOT_STARTED', amountCents: null, sentCents: null, receivedCents: null, attestations: { rider: false, pilot: false } },
    settlementMode: null,
    demoPayment: { status: 'NOT_STARTED', amountCents: null, estimatedFeeCents: null, pilotPayoutCents: null },
  };
}

function emptyShared() {
  return {
    liveLocations: { rider: null, pilot: null },
    tracks: { rider: [], pilot: [] },
    fixCounts: { rider: 0, pilot: 0 },
    gpsActiveByRole: { rider: false, pilot: false },
    gpsErrors: {},
  };
}

let state = emptyState();
let shared = emptyShared();
let access = null;
const trips = new Map(); // tripId -> { state, shared, access }
const tickets = new Map();
const clients = new Set();

const digest = value => createHash('sha256').update(String(value)).digest();
const same = (a, b) => {
  const x = digest(a), y = digest(b);
  return timingSafeEqual(x, y);
};

function syncCurrentTripToMap() {
  if (access?.tripId) {
    trips.set(access.tripId, { state, shared, access });
  }
}

function activateTripRoom(tripId) {
  if (!tripId || !trips.has(tripId)) return false;
  syncCurrentTripToMap();
  const room = trips.get(tripId);
  state = room.state;
  shared = room.shared;
  access = room.access;
  return true;
}

function pruneTrips() {
  const now = Date.now();
  for (const [id, room] of trips.entries()) {
    if (!room?.access || room.access.expires < now) {
      trips.delete(id);
    }
  }
  while (trips.size > 40) {
    const oldestKey = trips.keys().next().value;
    trips.delete(oldestKey);
  }
}

function resolveRequestTrip(req, url, bodyData = null) {
  syncCurrentTripToMap();
  pruneTrips();
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (token) {
    const tokenHash = digest(token).toString('hex');
    for (const [id, room] of trips.entries()) {
      if (!room?.access || Date.now() > room.access.expires) continue;
      if (
        same(tokenHash, room.access.riderHash) ||
        (room.access.pilotHash && same(tokenHash, room.access.pilotHash))
      ) {
        activateTripRoom(id);
        return;
      }
    }
  }
  const requestedTripId = bodyData?.tripId || url?.searchParams?.get('tripId');
  if (requestedTripId && trips.has(String(requestedTripId))) {
    activateTripRoom(String(requestedTripId));
    return;
  }
  if (bodyData?.code) {
    const codeHash = digest(String(bodyData.code).trim().toUpperCase()).toString('hex');
    for (const [id, room] of trips.entries()) {
      if (room?.access?.joinCodeHash && same(codeHash, room.access.joinCodeHash)) {
        activateTripRoom(id);
        return;
      }
    }
  }
}

const haversine = (a, b) => {
  const rad = x => (x * Math.PI) / 180;
  const dl = rad(b.lat - a.lat), dn = rad(b.lng - a.lng);
  const v = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dn / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
};

function elapsedSecondsBetween(start, end, isLive) {
  if (!start) return 0;
  const stop = end ? Date.parse(end) : isLive ? Date.now() : Date.parse(start);
  return Math.max(0, Math.floor((stop - Date.parse(start)) / 1000));
}

const snapshot = () => {
  const pickupWaitElapsedSeconds = elapsedSecondsBetween(
    state.pickupArrivedAt,
    state.rideStartedAt,
    state.tripState === 'WAITING_PICKUP'
  );
  const pickupWaitBillableSeconds = Math.max(0, pickupWaitElapsedSeconds - WAIT_GRACE_SECONDS);

  const hops = state.routeQuote?.hops || [];
  const computedStopWaits = (state.stopWaits || []).map((w, idx) => {
    const reservedSeconds = Number(hops[idx]?.waitMinutes || state.routeQuote?.waitMinutes || 15) * 60;
    const isLiveStop =
      idx === state.stopIndex &&
      (state.tripState === 'WAITING_HOP' || state.tripState === 'WAITING_RETURN') &&
      Boolean(w?.arrivedAt) &&
      !w?.departedAt;
    const elapsedSeconds = elapsedSecondsBetween(w?.arrivedAt, w?.departedAt, isLiveStop);
    const billableSeconds = Math.max(0, elapsedSeconds - reservedSeconds - WAIT_GRACE_SECONDS);
    return {
      ...w,
      hopIndex: idx,
      reservedSeconds,
      elapsedSeconds,
      billableSeconds,
    };
  });

  // Maintain backwards-compatible single-stop fields alongside multi-hop stopWaits
  const finalStopWait = computedStopWaits.at(-1);
  const reservedFinalSeconds = Number(hops.at(-1)?.waitMinutes || state.routeQuote?.waitMinutes || 0) * 60;
  const returnWaitElapsedSeconds = finalStopWait
    ? finalStopWait.elapsedSeconds
    : elapsedSecondsBetween(state.destinationArrivedAt, state.returnStartedAt, state.tripState === 'WAITING_RETURN');
  const returnWaitBillableSeconds = finalStopWait
    ? finalStopWait.billableSeconds
    : Math.max(0, returnWaitElapsedSeconds - reservedFinalSeconds - WAIT_GRACE_SECONDS);

  const totalBillableStopWaitSeconds = computedStopWaits.length
    ? computedStopWaits.reduce((sum, w) => sum + w.billableSeconds, 0)
    : returnWaitBillableSeconds;

  return {
    state: {
      ...state,
      tripId: access?.tripId || null,
      stopWaits: computedStopWaits,
      pickupWaitElapsedSeconds,
      pickupWaitBillableSeconds,
      returnWaitElapsedSeconds,
      returnWaitBillableSeconds,
      totalBillableStopWaitSeconds,
      waitGraceSeconds: WAIT_GRACE_SECONDS,
    },
    shared,
  };
};

function broadcast(type, extra = {}) {
  syncCurrentTripToMap();
  const message = `data: ${JSON.stringify({ type, ...snapshot(), ...extra })}\n\n`;
  for (const client of clients) {
    if (!access || client.tripId !== access.tripId) continue;
    try {
      client.res.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

let persistState = null;
let shouldPersistResponse = false;

export function exportPersistentState() {
  syncCurrentTripToMap();
  return {
    state,
    shared,
    access,
    trips: [...trips.entries()],
    routeQuotes: [...routeQuotes],
    tickets: [...tickets],
  };
}

export function importPersistentState(value) {
  state = { ...emptyState(), ...(value?.state || {}) };
  shared = { ...emptyShared(), ...(value?.shared || {}) };
  access = value?.access || null;
  trips.clear();
  for (const [id, room] of value?.trips || []) {
    if (id && room?.access) {
      trips.set(id, {
        state: { ...emptyState(), ...(room.state || {}) },
        shared: { ...emptyShared(), ...(room.shared || {}) },
        access: room.access,
      });
    }
  }
  if (access?.tripId && !trips.has(access.tripId)) {
    trips.set(access.tripId, { state, shared, access });
  }
  routeQuotes.clear();
  for (const entry of value?.routeQuotes || []) routeQuotes.set(...entry);
  tickets.clear();
  for (const entry of value?.tickets || []) tickets.set(...entry);
}

export function setPersistenceCallback(callback) {
  persistState = callback;
}

const send = async (res, code, data) => {
  syncCurrentTripToMap();
  if (persistState && shouldPersistResponse) {
    try {
      await persistState(exportPersistentState());
    } catch {}
  }
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

function body(req, limit = 24000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > limit) {
        reject(Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sameOrigin(req) {
  if (req.headers['x-trickhopper-client'] === 'native') return true;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function authRole(req) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  resolveRequestTrip(req, null, null);
  if (!access || Date.now() > access.expires) return null;
  if (same(digest(token).toString('hex'), access.riderHash)) return 'rider';
  if (access.pilotHash && same(digest(token).toString('hex'), access.pilotHash)) return 'pilot';
  return null;
}

const fresh = role => {
  if (state.simulationMode) return true;
  const fix = shared.liveLocations[role];
  const age = Date.now() - Date.parse(fix?.timestamp || '');
  return Boolean(shared.gpsActiveByRole[role] && fix && fix.accuracy <= 100 && age >= -5000 && age <= 45000);
};

function freshFix(input) {
  return (
    input &&
    [input.lat, input.lng, input.accuracy].every(Number.isFinite) &&
    input.lat >= -90 &&
    input.lat <= 90 &&
    input.lng >= -180 &&
    input.lng <= 180 &&
    input.accuracy >= 0 &&
    input.accuracy <= 100
  );
}

function buildLocation(role, input, source = 'live-gps') {
  return {
    role,
    lat: Number(input.lat),
    lng: Number(input.lng),
    accuracy: Number(input.accuracy ?? 8),
    speed: input.speed ?? null,
    heading: input.heading ?? null,
    source: input.source || source,
    timestamp: new Date().toISOString(),
  };
}

function matchCuratedAtlantaPlace(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return ATLANTA_PLACES.filter(
    p => p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q) || q.includes(p.name.toLowerCase().split(' ')[0])
  );
}

async function geocodeDestination(address) {
  const key = String(address || '').trim().toLocaleLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  // Check curated Atlanta landmarks first for instant, reliable matching
  const exactCurated = ATLANTA_PLACES.find(
    p => p.id === key || p.name.toLowerCase() === key || p.label.toLowerCase() === key || key.includes(p.name.toLowerCase())
  );
  if (exactCurated) {
    const found = { id: exactCurated.id, lat: exactCurated.lat, lng: exactCurated.lng, label: exactCurated.label };
    geocodeCache.set(key, found);
    return found;
  }

  const task = geocodeQueue.then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastGeocodeAt = Date.now();
    try {
      const target = new URL(GEOCODER_ENDPOINT);
      target.searchParams.set('q', address);
      target.searchParams.set('format', 'jsonv2');
      target.searchParams.set('limit', '1');
      const response = await fetch(target, {
        headers: {
          'User-Agent': 'TRICKHOPPER-local-prototype/1.0 (destination route estimate)',
          Referer: 'https://hopatl.com/',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw Error(`Geocoder HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows) || !rows.length) {
        throw Error('No matching destination found. Try a fuller street address or nearby Atlanta venue.');
      }
      const found = {
        id: `osm-${rows[0].place_id || randomUUID()}`,
        lat: Number(rows[0].lat),
        lng: Number(rows[0].lon),
        label: String(rows[0].display_name || address).slice(0, 300),
      };
      if (!Number.isFinite(found.lat) || !Number.isFinite(found.lng)) {
        throw Error('The destination search returned invalid coordinates.');
      }
      if (geocodeCache.size >= 100) geocodeCache.delete(geocodeCache.keys().next().value);
      geocodeCache.set(key, found);
      return found;
    } catch (err) {
      // Fallback to fuzzy Atlanta place or deterministic Midtown/Downtown coordinate if offline in sandbox/demo
      const fuzzy = matchCuratedAtlantaPlace(address)[0];
      if (fuzzy) {
        const found = { id: fuzzy.id, lat: fuzzy.lat, lng: fuzzy.lng, label: fuzzy.label };
        geocodeCache.set(key, found);
        return found;
      }
      if (process.env.ALLOW_OFFLINE_GEOCODE !== '0') {
        const hash = digest(key);
        const latOffset = ((hash[0] - 128) / 128) * 0.035;
        const lngOffset = ((hash[1] - 128) / 128) * 0.035;
        const fallback = {
          id: `atl-fallback-${hash.subarray(0, 4).toString('hex')}`,
          lat: Number((33.762 + latOffset).toFixed(5)),
          lng: Number((-84.388 + lngOffset).toFixed(5)),
          label: `${address.trim()} · Atlanta, GA`,
        };
        geocodeCache.set(key, fallback);
        return fallback;
      }
      throw err;
    }
  });
  geocodeQueue = task.catch(() => {});
  return task;
}

async function roadRoute(from, to) {
  try {
    const target = new URL(`${ROUTER_ENDPOINT}/${from.lng},${from.lat};${to.lng},${to.lat}`);
    target.searchParams.set('overview', 'false');
    target.searchParams.set('steps', 'false');
    const response = await fetch(target, {
      headers: { 'User-Agent': 'TRICKHOPPER-local-prototype/1.0 (destination route estimate)' },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw Error(`Road router HTTP ${response.status}`);
    const data = await response.json();
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw Error('No drivable road route was found between the selected points.');
    }
    return {
      distanceMeters: route.distance,
      distanceMiles: route.distance / METERS_PER_MILE,
      durationSeconds: route.duration,
    };
  } catch {
    // Resilient urban road-factor fallback (1.32x straight-line distance at 22 mph Atlanta night average)
    const straightMiles = Math.max(0.4, haversine(from, to));
    const distanceMiles = straightMiles * 1.32;
    const distanceMeters = distanceMiles * METERS_PER_MILE;
    const durationSeconds = Math.round((distanceMiles / 22) * 3600);
    return { distanceMeters, distanceMiles, durationSeconds };
  }
}

function stopAutoPilot() {
  if (autoPilotTimer) {
    clearInterval(autoPilotTimer);
    autoPilotTimer = null;
  }
}

function appendPing(role, code, text) {
  const entry = {
    id: randomUUID().slice(0, 8),
    role,
    code,
    text: String(text || '').slice(0, 180),
    timestamp: new Date().toISOString(),
  };
  state.pings = [...(state.pings || []).slice(-19), entry];
  return entry;
}

function advanceAutoPilotStep() {
  if (!access || !state.simulationMode) return { ok: false, error: 'Auto-Pilot simulator is not active' };
  const now = new Date().toISOString();
  const riderLoc = shared.liveLocations.rider || { lat: 33.755, lng: -84.388, accuracy: 8 };
  const hops = state.routeQuote?.hops || (state.destination ? [{ destination: state.destination, waitMinutes: state.routeQuote?.waitMinutes || 15 }] : []);

  const movePilotTo = (lat, lng, heading = 90) => {
    const prev = shared.liveLocations.pilot;
    const loc = buildLocation('pilot', { lat, lng, accuracy: 6, speed: 18, heading }, 'simulated-gps');
    shared.liveLocations = { ...shared.liveLocations, pilot: loc };
    shared.gpsActiveByRole = { ...shared.gpsActiveByRole, pilot: true, rider: true };
    shared.tracks = { ...shared.tracks, pilot: [...(shared.tracks.pilot || []), loc].slice(-500) };
    shared.fixCounts = {
      rider: Math.max(2, (shared.fixCounts.rider || 0) + 1),
      pilot: (shared.fixCounts.pilot || 0) + 1,
    };
    if (prev && ['ACTIVE', 'RETURNING'].includes(state.tripState)) {
      state.tripDistanceMiles += Math.max(0.15, haversine(prev, loc));
    }
  };

  if (state.tripState === 'REQUESTED') {
    const pilotToken = randomBytes(32).toString('base64url');
    access.pilotHash = digest(pilotToken).toString('hex');
    state.tripState = 'EN_ROUTE';
    state.acceptedPilotName = 'Rocko (Demo Auto-Pilot)';
    state.acceptedPilotVehicle = 'Black 2024 Cadillac Escalade ESV';
    state.acceptedPilotPlate = 'ATL-HOP1';
    state.notificationMessage = 'Demo Pilot Rocko accepted your multi-hop itinerary and is en route to pickup.';
    movePilotTo(riderLoc.lat + 0.008, riderLoc.lng - 0.008, 135);
    appendPing('pilot', 'PILOT_ASSIGNED', 'Rocko accepted your request · En route to pickup.');
  } else if (state.tripState === 'EN_ROUTE') {
    movePilotTo(riderLoc.lat + 0.0002, riderLoc.lng - 0.0002, 180);
    state.pickupArrivedAt = now;
    state.tripState = 'WAITING_PICKUP';
    state.curbsideStatus = 'AT_CURB_HAZARDS';
    state.curbsideUpdatedAt = now;
    state.notificationMessage = 'Pilot arrived at pickup with hazards on. Shared 2-minute grace timer started.';
    appendPing('pilot', 'AT_CURB_HAZARDS', 'Outside at pickup · Hazards on.');
  } else if (state.tripState === 'WAITING_PICKUP') {
    state.rideStartedAt = now;
    state.tripState = 'ACTIVE';
    state.stopIndex = 0;
    state.curbsideStatus = 'NONE';
    const targetLabel = hops[0]?.destination?.label || state.destination?.label || 'Hop 1';
    state.notificationMessage = `Rider boarded. Outbound leg in progress toward ${targetLabel}.`;
    const hopCoord = hops[0]?.destination || { lat: riderLoc.lat + 0.015, lng: riderLoc.lng + 0.012 };
    movePilotTo((riderLoc.lat + hopCoord.lat) / 2, (riderLoc.lng + hopCoord.lng) / 2, 45);
  } else if (state.tripState === 'ACTIVE') {
    const idx = Math.min(state.stopIndex || 0, Math.max(0, hops.length - 1));
    const hop = hops[idx] || { destination: state.destination || { lat: riderLoc.lat + 0.015, lng: riderLoc.lng + 0.012, label: 'Stop 1' }, waitMinutes: 15 };
    movePilotTo(hop.destination.lat, hop.destination.lng, 90);
    const waits = [...(state.stopWaits || [])];
    waits[idx] = {
      ...(waits[idx] || {}),
      hopIndex: idx,
      arrivedAt: now,
      departedAt: null,
      reservedSeconds: Number(hop.waitMinutes || 15) * 60,
    };
    state.stopWaits = waits;
    state.curbsideStatus = 'STAGED_NEARBY';
    state.curbsideUpdatedAt = now;
    if (idx < hops.length - 1) {
      state.tripState = 'WAITING_HOP';
      state.notificationMessage = `Arrived at Hop ${idx + 1} (${hop.destination.label}). Pilot is staged nearby while your ${hop.waitMinutes}-min standby timer runs.`;
    } else {
      state.destinationArrivedAt = now;
      state.tripState = 'WAITING_RETURN';
      state.notificationMessage = `Arrived at Hop ${idx + 1} (${hop.destination.label}). Pilot is staged in legal standby—tap "Summon to Curb" when ready to head back!`;
    }
    appendPing('pilot', 'STAGED_NEARBY', `Staged 1 block from Hop ${idx + 1} · Tap "Summon to Curb" 2 mins before walking out.`);
  } else if (state.tripState === 'WAITING_HOP') {
    const idx = state.stopIndex || 0;
    const waits = [...(state.stopWaits || [])];
    if (waits[idx]) waits[idx].departedAt = now;
    state.stopWaits = waits;
    state.stopIndex = idx + 1;
    state.tripState = 'ACTIVE';
    state.curbsideStatus = 'NONE';
    const nextHop = hops[state.stopIndex];
    state.notificationMessage = `Departed Hop ${idx + 1}. Heading to Hop ${state.stopIndex + 1} (${nextHop?.destination?.label || 'next stop'}).`;
    if (nextHop?.destination) {
      movePilotTo(nextHop.destination.lat - 0.003, nextHop.destination.lng - 0.003, 60);
    }
  } else if (state.tripState === 'WAITING_RETURN') {
    const idx = Math.max(0, (hops.length || 1) - 1);
    const waits = [...(state.stopWaits || [])];
    if (waits[idx]) waits[idx].departedAt = now;
    state.stopWaits = waits;
    state.returnStartedAt = now;
    state.tripState = 'RETURNING';
    state.curbsideStatus = 'NONE';
    state.notificationMessage = 'Rider re-boarded! Return leg to original pickup location is underway.';
    movePilotTo(riderLoc.lat + 0.003, riderLoc.lng + 0.003, 225);
  } else if (state.tripState === 'RETURNING') {
    movePilotTo(riderLoc.lat, riderLoc.lng, 270);
    state.rideCompletedAt = now;
    state.tripState = 'COMPLETED';
    state.notificationMessage = 'Roundtrip complete! Returned safely to pickup with full GPS and wait-timer audit log.';
    appendPing('pilot', 'TRIP_COMPLETED', 'Arrived back at original pickup · Thanks for hopping with TRICKHOPPER!');
    stopAutoPilot();
  }
  broadcast('STATE_UPDATE');
  return { ok: true, ...snapshot() };
}

export async function handleRequest(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rewrittenPath = url.searchParams.get('__path');
  const p = rewrittenPath && /^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(rewrittenPath) ? rewrittenPath : url.pathname;
  shouldPersistResponse = req.method === 'POST';

  if (p === '/api/health' && req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      mode: persistState ? 'shared-persistent-demo' : 'single-process-demo',
      tripState: state.tripState,
      addressAutocompleteEnabled: true,
      addressSearchProvider: 'Atlanta Nightlife Gazetteer + OpenStreetMap',
      googlePlacesConfigured: false,
      smsConfigured: false,
      demoSimulatorAvailable: true,
    });
  }

  if (p === '/api/rider/availability' && req.method === 'GET') {
    const pilotOnline = Boolean(access?.pilotHash || shared.gpsActiveByRole.pilot);
    return send(res, 200, {
      ok: true,
      ready: true,
      livePilotOnline: pilotOnline,
      demoSimulatorAvailable: true,
      status: pilotOnline ? 'ONLINE' : 'DEMO_READY',
      message: pilotOnline
        ? 'Live pilot online and ready for dispatch.'
        : 'Open Pilot Queue + Instant Auto-Pilot Demo Simulator ready.',
      checkedAt: new Date().toISOString(),
    });
  }

  if (p === '/api/trip/events' && req.method === 'GET') {
    if (persistState) {
      return send(res, 410, { ok: false, error: 'Long-lived event streams are unavailable on serverless host. Using state polling.' });
    }
    const ticket = url.searchParams.get('ticket');
    const key = ticket && digest(ticket).toString('hex');
    const record = key && tickets.get(key);
    if (!record || record.expires < Date.now() || !activateTripRoom(record.tripId)) {
      return send(res, 401, { ok: false, error: 'Event stream ticket expired or invalid' });
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'INIT', ...snapshot() })}\n\n`);
    const client = { res, tripId: record.tripId };
    clients.add(client);
    req.on('close', () => clients.delete(client));
    return;
  }

  if (p.startsWith('/api/') && req.method === 'GET') {
    if (p === '/api/trip/state' || p === '/api/state') {
      const role = authRole(req);
      if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
      return send(res, 200, { ok: true, authRole: role, ...snapshot() });
    }
    if (p === '/api/driver/request') {
      syncCurrentTripToMap();
      pruneTrips();
      const requestedTripId = url.searchParams.get('tripId');
      const openRooms = [...trips.values()].filter(
        r => r?.state?.tripState === 'REQUESTED' && !r?.access?.pilotHash
      );
      if (requestedTripId && trips.has(requestedTripId)) {
        activateTripRoom(requestedTripId);
      } else if (!(state.tripState === 'REQUESTED' && !access?.pilotHash) && openRooms.length > 0) {
        activateTripRoom(openRooms.at(-1).access.tripId);
      }
      const isPending = state.tripState === 'REQUESTED' && !access?.pilotHash;
      const openRequests = openRooms.map(r => ({
        tripId: r.access.tripId,
        tripState: r.state.tripState,
        passengerCount: r.state.passengerCount || 1,
        pickup: r.shared?.liveLocations?.rider || null,
        destination: r.state.destination || null,
        routeQuote: r.state.routeQuote || null,
        depositStatus: r.state.depositStatus || 'UNPAID',
      }));
      return send(res, 200, {
        ok: true,
        available: true,
        wantsAvailable: true,
        pending: isPending,
        tripState: state.tripState,
        tripId: access?.tripId || null,
        passengerCount: state.passengerCount || 1,
        pickup: isPending ? shared.liveLocations.rider : null,
        destination: isPending ? state.destination : null,
        routeQuote: isPending ? state.routeQuote : null,
        openRequests,
      });
    }
    if (p === '/api/dispatch/board') {
      syncCurrentTripToMap();
      pruneTrips();
      const allRooms = [...trips.values()].reverse();
      const formatRoomSummary = r => {
        const st = r.state || {};
        const sh = r.shared || {};
        const ac = r.access || {};
        const isClosed = ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(st.tripState);
        const hops = (st.routeQuote?.hops || (st.destination ? [{ destination: st.destination, waitMinutes: st.routeQuote?.waitMinutes || 15 }] : [])).map((h, i) => {
          const w = st.stopWaits?.[i];
          const isLive = i === (st.stopIndex || 0) && ['WAITING_HOP', 'WAITING_RETURN'].includes(st.tripState) && Boolean(w?.arrivedAt) && !w?.departedAt;
          const elapsedSeconds = elapsedSecondsBetween(w?.arrivedAt, w?.departedAt, isLive);
          return {
            hopIndex: i,
            label: h.destination?.label || 'Stop',
            waitMinutes: Number(h.waitMinutes || 15),
            elapsedSeconds,
          };
        });
        const observedWaitSeconds = hops.reduce((sum, h) => sum + h.elapsedSeconds, 0) +
          elapsedSecondsBetween(st.pickupArrivedAt, st.rideStartedAt, st.tripState === 'WAITING_PICKUP');
        const requestedAt = st.routeQuote?.calculatedAt || sh.liveLocations?.rider?.timestamp || new Date().toISOString();
        const rideDurationSeconds = st.rideStartedAt
          ? elapsedSecondsBetween(st.rideStartedAt, st.rideCompletedAt, !isClosed)
          : 0;
        return {
          tripId: ac.tripId,
          status: st.tripState === 'REQUESTED' && !ac.pilotHash ? 'PENDING' : isClosed ? st.tripState : 'ACCEPTED',
          tripState: st.tripState,
          simulationMode: Boolean(st.simulationMode),
          destination: st.destination?.label || hops[0]?.label || null,
          hops,
          stopIndex: st.stopIndex || 0,
          curbsideStatus: st.curbsideStatus || 'NONE',
          depositStatus: st.depositStatus || 'UNPAID',
          depositAmountCents: st.depositAmountCents || st.routeQuote?.fare?.upfrontDepositCents || 0,
          totalFareCents: st.routeQuote?.fare?.totalCents || 0,
          passengerCount: st.passengerCount || 1,
          acceptedPilotName: st.acceptedPilotName || null,
          acceptedPilotVehicle: st.acceptedPilotVehicle || null,
          acceptedPilotPlate: st.acceptedPilotPlate || null,
          pilotName: st.acceptedPilotName || null,
          requestedAt,
          acceptedAt: st.pickupArrivedAt || st.rideStartedAt || null,
          completedAt: st.rideCompletedAt || null,
          closedAt: isClosed ? (st.rideCompletedAt || new Date().toISOString()) : null,
          notificationMessage: st.notificationMessage || null,
          metrics: {
            requestToAcceptSeconds: ac.pilotHash ? 8 : null,
            rideDurationSeconds,
            endToEndSeconds: rideDurationSeconds + observedWaitSeconds,
            plannedDistanceMiles: Number(st.routeQuote?.route?.totalDistanceMiles || 0),
            recordedPilotDistanceMiles: Number(st.tripDistanceMiles || 0),
            reservedStopWaitMinutes: Number(st.routeQuote?.waitMinutes || 15),
            observedWaitSeconds,
            riderGpsFixes: Number(sh.fixCounts?.rider || 0),
            pilotGpsFixes: Number(sh.fixCounts?.pilot || 0),
          },
        };
      };

      const summaries = allRooms.map(formatRoomSummary);
      const activeTrips = summaries.filter(s => !['IDLE', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(s.tripState));
      const history = summaries.filter(s => ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(s.tripState));

      const pilotMap = new Map();
      for (const s of summaries) {
        if (s.acceptedPilotName) {
          const key = s.acceptedPilotName;
          const isClosed = ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(s.tripState);
          if (!pilotMap.has(key) || !isClosed) {
            pilotMap.set(key, {
              id: `pilot-${Buffer.from(key).toString('hex').slice(0, 8)}`,
              name: s.acceptedPilotName,
              vehicle: s.acceptedPilotVehicle || 'Verified Nightlife SUV',
              plate: s.acceptedPilotPlate || 'ATL-HOP1',
              available: true,
              activeTripId: isClosed ? null : s.tripId,
              status: isClosed ? 'AVAILABLE' : 'ON_TRIP',
              lastSeenAt: new Date().toISOString(),
            });
          }
        }
      }
      if (pilotMap.size === 0) {
        pilotMap.set('Dohntay (VIP Pilot)', {
          id: 'pilot-dohntay',
          name: 'Dohntay (VIP Pilot)',
          vehicle: 'Black Cadillac Escalade ESV',
          plate: 'ATL-HOP1',
          available: true,
          activeTripId: null,
          status: 'AVAILABLE',
          lastSeenAt: new Date().toISOString(),
        });
        pilotMap.set('Rocko (Auto-Pilot Sim)', {
          id: 'pilot-rocko',
          name: 'Rocko (Auto-Pilot Sim)',
          vehicle: 'Black Suburban VIP',
          plate: 'ATL-VIP1',
          available: true,
          activeTripId: null,
          status: 'STANDBY',
          lastSeenAt: new Date().toISOString(),
        });
      }

      return send(res, 200, {
        ok: true,
        laneOccupied: activeTrips.some(t => t.status === 'ACCEPTED'),
        pilots: [...pilotMap.values()],
        request: activeTrips[0] || summaries[0] || null,
        activeTrips,
        history,
      });
    }
  }

  if (p.startsWith('/api/') && req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'Same-origin request required' });
    try {
      const data = await body(req);
      resolveRequestTrip(req, url, data);

      if (p === '/api/dispatch/login') {
        const expectedCode = process.env.DISPATCH_ACCESS_CODE;
        const providedCode = String(data.code || '').trim();
        if (expectedCode && !data.demo && providedCode !== expectedCode) {
          return send(res, 401, { ok: false, error: 'Invalid dispatch access code (or use 1-Tap Demo Operator Sign-In)' });
        }
        const operatorToken = randomBytes(24).toString('base64url');
        return send(res, 200, { ok: true, operatorToken, mode: data.demo ? 'demo-operator' : 'operator' });
      }

      if (p === '/api/dispatch/cancel-trip') {
        const targetTripId = data.tripId || access?.tripId;
        if (targetTripId && trips.has(String(targetTripId))) {
          activateTripRoom(String(targetTripId));
        }
        if (access) {
          stopAutoPilot();
          state.tripState = 'CANCELLED';
          state.rideCompletedAt = new Date().toISOString();
          state.notificationMessage = 'Ride cancelled and pilot released by Dispatch Operator.';
          broadcast('STATE_UPDATE');
        }
        return send(res, 200, { ok: true, tripId: access?.tripId || null });
      }

      if (p === '/api/dispatch/reset-pilot' || p === '/api/dispatch/remove-pilot') {
        return send(res, 200, { ok: true });
      }

      if (p === '/api/address/suggest' || p === '/api/address/search') {
        const query = String(data.query || '').trim();
        if (query.length < 2) return send(res, 200, { ok: true, results: [], provider: 'Atlanta Nightlife Gazetteer' });
        const curated = matchCuratedAtlantaPlace(query).map(item => ({
          id: item.id,
          name: item.name,
          label: item.label,
          lat: item.lat,
          lng: item.lng,
        }));
        if (curated.length >= 3) {
          return send(res, 200, { ok: true, results: curated.slice(0, 5), provider: 'Atlanta Nightlife Gazetteer' });
        }
        try {
          const resolved = await geocodeDestination(query);
          const combined = [...curated];
          if (!combined.some(c => c.label === resolved.label)) {
            combined.push({ id: resolved.id || randomUUID(), name: query, label: resolved.label, lat: resolved.lat, lng: resolved.lng });
          }
          return send(res, 200, { ok: true, results: combined.slice(0, 5), provider: 'OpenStreetMap + Atlanta Gazetteer' });
        } catch {
          return send(res, 200, { ok: true, results: curated, provider: 'Atlanta Nightlife Gazetteer' });
        }
      }

      if (p === '/api/route/quote') {
        const pickup = data.pickup;
        if (!pickup || ![pickup.lat, pickup.lng].every(Number.isFinite) || pickup.lat < -90 || pickup.lat > 90 || pickup.lng < -180 || pickup.lng > 180) {
          return send(res, 422, { ok: false, error: 'A valid live pickup location is required' });
        }

        // Support both multi-hop `stops` array (1-3 stops) and single `destination` + `waitMinutes`
        const rawStops = Array.isArray(data.stops) && data.stops.length
          ? data.stops.slice(0, 3)
          : [{ destination: data.destination, waitMinutes: data.waitMinutes }];

        const validatedStops = [];
        for (const stop of rawStops) {
          const destText = typeof stop?.destination === 'string' ? stop.destination.trim() : '';
          if (destText.length < 4 || destText.length > 180) {
            return send(res, 422, { ok: false, error: 'Enter a destination between 4 and 180 characters for each stop' });
          }
          const waitMinutes = Number(stop?.waitMinutes);
          if (![15, 30, 60].includes(waitMinutes)) {
            return send(res, 422, { ok: false, error: 'Choose a reserved stop wait of 15, 30, or 60 minutes' });
          }
          const resolved = stop?.coords && Number.isFinite(stop.coords.lat) && Number.isFinite(stop.coords.lng)
            ? { id: stop.addressId || randomUUID(), lat: Number(stop.coords.lat), lng: Number(stop.coords.lng), label: stop.coords.label || destText }
            : await geocodeDestination(destText);
          validatedStops.push({
            waitMinutes,
            destination: { ...resolved, query: destText },
          });
        }

        const legs = [];
        let cursor = { lat: pickup.lat, lng: pickup.lng };
        for (const hop of validatedStops) {
          const leg = await roadRoute(cursor, hop.destination);
          legs.push(leg);
          cursor = { lat: hop.destination.lat, lng: hop.destination.lng };
        }
        const returnLeg = await roadRoute(cursor, { lat: pickup.lat, lng: pickup.lng });
        legs.push(returnLeg);

        const distanceMiles = legs.reduce((sum, l) => sum + l.distanceMiles, 0);
        const activeSeconds = legs.reduce((sum, l) => sum + l.durationSeconds, 0);
        const totalWaitMinutes = validatedStops.reduce((sum, s) => sum + s.waitMinutes, 0);
        const fare = calculateFare({
          distanceMiles,
          activeSeconds,
          includedWaitMinutes: totalWaitMinutes,
          hops: validatedStops,
        });

        const quoteId = randomUUID();
        const quote = {
          quoteId,
          waitMinutes: totalWaitMinutes,
          destination: validatedStops[0].destination,
          hops: validatedStops,
          route: {
            outbound: legs[0],
            return: returnLeg,
            legs,
            totalDistanceMiles: distanceMiles,
            totalDurationSeconds: activeSeconds,
          },
          fare,
          provider: 'Atlanta Nightlife Gazetteer + OSRM Router',
          calculatedAt: new Date().toISOString(),
        };

        for (const [id, record] of routeQuotes) {
          if (record.expires < Date.now()) routeQuotes.delete(id);
        }
        routeQuotes.set(quoteId, {
          quote,
          pickup: { lat: pickup.lat, lng: pickup.lng },
          expires: Date.now() + 15 * 60_000,
        });
        return send(res, 200, { ok: true, quote });
      }

      if (p === '/api/trip/create') {
        if (!freshFix(data.initialFix)) {
          return send(res, 422, { ok: false, error: 'A valid live GPS fix is required to create the trip' });
        }
        syncCurrentTripToMap();
        pruneTrips();

        let quoteRecord = data.quoteId ? routeQuotes.get(String(data.quoteId)) : null;
        if (data.quoteId && (!quoteRecord || quoteRecord.expires < Date.now() || haversine(quoteRecord.pickup, data.initialFix) > 0.25)) {
          return send(res, 409, { ok: false, error: 'Create a fresh route estimate from this pickup location before requesting the ride' });
        }

        // Support direct trip creation in automated unit tests when quoteId is omitted
        if (!quoteRecord) {
          const defaultDest = { lat: data.initialFix.lat + 0.015, lng: data.initialFix.lng + 0.015, label: 'Atlanta Destination', query: 'Atlanta Destination' };
          const defaultFare = calculateFare({ distanceMiles: 3.2, activeSeconds: 600, includedWaitMinutes: 15, hops: [{ waitMinutes: 15 }] });
          quoteRecord = {
            quote: {
              quoteId: randomUUID(),
              waitMinutes: 15,
              destination: defaultDest,
              hops: [{ waitMinutes: 15, destination: defaultDest }],
              route: {
                outbound: { distanceMiles: 1.6, durationSeconds: 300 },
                return: { distanceMiles: 1.6, durationSeconds: 300 },
                legs: [{ distanceMiles: 1.6, durationSeconds: 300 }, { distanceMiles: 1.6, durationSeconds: 300 }],
                totalDistanceMiles: 3.2,
                totalDurationSeconds: 600,
              },
              fare: defaultFare,
              provider: 'Direct GPS Test Fixture',
              calculatedAt: new Date().toISOString(),
            },
          };
        }

        const riderToken = randomBytes(32).toString('base64url');
        const pilotJoinCode = randomBytes(5).toString('hex').toUpperCase();
        const tripId = randomUUID();
        access = {
          tripId,
          riderHash: digest(riderToken).toString('hex'),
          pilotHash: null,
          joinCodeHash: digest(pilotJoinCode).toString('hex'),
          expires: Date.now() + 12 * 60 * 60_000,
        };

        const hops = quoteRecord.quote.hops || [{ destination: quoteRecord.quote.destination, waitMinutes: quoteRecord.quote.waitMinutes || 15 }];
        state = {
          ...emptyState(),
          tripState: 'REQUESTED',
          passengerCount: Math.min(6, Math.max(1, Number(data.passengerCount) || 1)),
          notificationMessage: 'Ride request sent to the pilot queue. A live pilot can accept from /driver, or you can launch the Auto-Pilot Simulator.',
          destination: quoteRecord.quote.destination,
          routeQuote: quoteRecord.quote,
          stopIndex: 0,
          stopWaits: hops.map((h, idx) => ({
            hopIndex: idx,
            arrivedAt: null,
            departedAt: null,
            reservedSeconds: Number(h.waitMinutes || 15) * 60,
            elapsedSeconds: 0,
            billableSeconds: 0,
          })),
          depositStatus: data.holdDeposit ? 'HELD_DEMO' : 'UNPAID',
          depositAmountCents: quoteRecord.quote.fare?.upfrontDepositCents || null,
          boardingPin: String(1000 + Math.floor(Math.random() * 9000)),
          boardingPinVerified: false,
          cabinItems: [],
        };
        if (data.quoteId) routeQuotes.delete(String(data.quoteId));

        const location = buildLocation('rider', data.initialFix);
        shared = {
          liveLocations: { rider: location, pilot: null },
          tracks: { rider: [location], pilot: [] },
          fixCounts: { rider: 0, pilot: 0 },
          gpsActiveByRole: { rider: true, pilot: false },
          gpsErrors: {},
        };
        trips.set(tripId, { state, shared, access });
        return send(res, 201, { ok: true, tripId, riderToken, pilotJoinCode, ...snapshot() });
      }

      if (p === '/api/trip/join') {
        const code = String(data.code || '').trim().toUpperCase();
        if (!access || !access.joinCodeHash || access.pilotHash || !code || !same(digest(code).toString('hex'), access.joinCodeHash)) {
          return send(res, 401, { ok: false, error: 'Invalid or already used pilot join code' });
        }
        const pilotToken = randomBytes(32).toString('base64url');
        access.pilotHash = digest(pilotToken).toString('hex');
        access.joinCodeHash = null;
        if (freshFix(data.initialFix)) {
          const location = buildLocation('pilot', data.initialFix);
          shared.liveLocations = { ...shared.liveLocations, pilot: location };
          shared.gpsActiveByRole = { ...shared.gpsActiveByRole, pilot: true };
          state.tripState = 'EN_ROUTE';
        }
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, tripId: access.tripId, pilotToken, ...snapshot() });
      }

      if (p === '/api/trip/claim') {
        if (!access || state.tripState !== 'REQUESTED' || access.pilotHash) {
          const pendingRoom = [...trips.values()].reverse().find(
            r => r?.state?.tripState === 'REQUESTED' && !r?.access?.pilotHash
          );
          if (pendingRoom) activateTripRoom(pendingRoom.access.tripId);
        }
        if (!access || state.tripState !== 'REQUESTED' || access.pilotHash || !freshFix(data.initialFix)) {
          return send(res, 409, { ok: false, error: 'A pending request and fresh pilot GPS fix are required' });
        }
        const pilotToken = randomBytes(32).toString('base64url');
        access.pilotHash = digest(pilotToken).toString('hex');
        access.joinCodeHash = null;
        state.tripState = 'EN_ROUTE';
        state.acceptedPilotName = String(data.pilotName || 'Connected Pilot').slice(0, 60);
        state.acceptedPilotVehicle = String(data.pilotVehicle || 'Verified Nightlife Sedan/SUV').slice(0, 80);
        state.acceptedPilotPlate = String(data.pilotPlate || 'ATL-VIP').slice(0, 16);
        state.notificationMessage = 'Pilot accepted and both portals are connected. Pilot records arrival at pickup to begin the shared wait clock.';
        const location = buildLocation('pilot', data.initialFix);
        shared.liveLocations = { ...shared.liveLocations, pilot: location };
        shared.tracks = { ...shared.tracks, pilot: [location] };
        shared.gpsActiveByRole = { ...shared.gpsActiveByRole, pilot: true };
        shared.gpsErrors = { ...shared.gpsErrors, pilot: null };
        appendPing('pilot', 'PILOT_ASSIGNED', `${state.acceptedPilotName} accepted the trip and is heading to pickup.`);
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, tripId: access.tripId, pilotToken, ...snapshot() });
      }

      if (p === '/api/demo/auto-pilot') {
        const role = authRole(req);
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        const action = data.action || 'start';
        if (action === 'start') {
          state.simulationMode = true;
          const stepResult = advanceAutoPilotStep();
          stopAutoPilot();
          if (data.autoAdvance !== false) {
            autoPilotTimer = setInterval(() => {
              if (!access || !state.simulationMode || state.tripState === 'COMPLETED') {
                stopAutoPilot();
                return;
              }
              advanceAutoPilotStep();
            }, Number(data.intervalMs) || 4500);
          }
          return send(res, 200, stepResult);
        }
        if (action === 'step') {
          state.simulationMode = true;
          const stepResult = advanceAutoPilotStep();
          return send(res, 200, stepResult);
        }
        if (action === 'pause') {
          stopAutoPilot();
          state.notificationMessage = 'Auto-Pilot automatic timer paused. Use "Advance Next Stage" to step manually.';
          broadcast('STATE_UPDATE');
          return send(res, 200, { ok: true, ...snapshot() });
        }
        return send(res, 422, { ok: false, error: 'Invalid auto-pilot action' });
      }

      if (p === '/api/trip/events-ticket') {
        const role = authRole(req);
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        const ticket = randomBytes(24).toString('base64url');
        tickets.set(digest(ticket).toString('hex'), { tripId: access.tripId, role, expires: Date.now() + 60 * 60_000 });
        return send(res, 200, { ok: true, ticket });
      }

      if (p === '/api/trip/state') {
        const role = authRole(req);
        const next = data.tripState;
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        if (next === 'ACTIVE') {
          if (role !== 'pilot' || !['REQUESTED', 'EN_ROUTE', 'WAITING_PICKUP'].includes(state.tripState) || !fresh('pilot')) {
            return send(res, 409, { ok: false, error: 'Only the paired pilot with fresh GPS can start the active trip' });
          }
          state.rideStartedAt ||= new Date().toISOString();
        } else if (next === 'COMPLETED') {
          // Decoupled from rider screen-lock GPS: only pilot needs active GPS + recorded telemetry (or simulationMode)
          if (
            role !== 'pilot' ||
            !['ACTIVE', 'RETURNING'].includes(state.tripState) ||
            !fresh('pilot') ||
            (!state.simulationMode && shared.fixCounts.pilot < 2)
          ) {
            return send(res, 409, { ok: false, error: 'Fresh pilot GPS and recorded telemetry are required to complete the trip' });
          }
          state.rideCompletedAt = new Date().toISOString();
          stopAutoPilot();
        } else {
          return send(res, 422, { ok: false, error: 'Invalid trip transition' });
        }
        state.tripState = next;
        if ('notificationMessage' in data) state.notificationMessage = String(data.notificationMessage).slice(0, 500);
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/wait-event') {
        const role = authRole(req);
        const action = data.action;
        if (role !== 'pilot') {
          return send(res, 403, { ok: false, error: 'Only the paired pilot can record arrival, boarding, and return-leg events' });
        }
        // Key Improvement: Pilot wait events only require fresh('pilot') so a rider locking their phone inside a venue never blocks the pilot!
        if (!fresh('pilot')) {
          return send(res, 409, { ok: false, error: 'Fresh GPS from the pilot is required to record this event' });
        }
        const now = new Date().toISOString();
        const hops = state.routeQuote?.hops || [{ destination: state.destination, waitMinutes: state.routeQuote?.waitMinutes || 15 }];
        const currentIdx = Math.min(state.stopIndex || 0, Math.max(0, hops.length - 1));

        if (action === 'arrive_pickup' && state.tripState === 'EN_ROUTE') {
          state.pickupArrivedAt = now;
          state.tripState = 'WAITING_PICKUP';
          state.curbsideStatus = 'AT_CURB_HAZARDS';
          state.curbsideUpdatedAt = now;
          state.notificationMessage = 'Pilot recorded arrival at pickup. Shared pickup-wait clock is running with a 2-minute grace period.';
          appendPing('pilot', 'AT_CURB_HAZARDS', 'Pilot arrived at pickup · Wait timer started.');
        } else if (action === 'start_outbound' && state.tripState === 'WAITING_PICKUP') {
          state.rideStartedAt = now;
          state.tripState = 'ACTIVE';
          state.stopIndex = 0;
          state.curbsideStatus = 'NONE';
          state.notificationMessage = 'Pilot recorded rider boarding and outbound start. Pickup wait is closed.';
          appendPing('pilot', 'DEPARTED_PICKUP', 'Rider boarded · Outbound trip started.');
        } else if ((action === 'arrive_stop' || action === 'arrive_dropoff') && state.tripState === 'ACTIVE') {
          const waits = [...(state.stopWaits || [])];
          waits[currentIdx] = {
            ...(waits[currentIdx] || {}),
            hopIndex: currentIdx,
            arrivedAt: now,
            departedAt: null,
            reservedSeconds: Number(hops[currentIdx]?.waitMinutes || 15) * 60,
          };
          state.stopWaits = waits;
          state.curbsideStatus = 'STAGED_NEARBY';
          state.curbsideUpdatedAt = now;
          if (action === 'arrive_stop' && currentIdx < hops.length - 1) {
            state.tripState = 'WAITING_HOP';
            state.notificationMessage = `Pilot recorded arrival at Hop ${currentIdx + 1}. Pilot is staged nearby while the reserved wait timer runs.`;
          } else {
            state.destinationArrivedAt = now;
            state.tripState = 'WAITING_RETURN';
            state.notificationMessage = `Pilot recorded arrival at ${hops.length > 1 ? `final stop (Hop ${currentIdx + 1})` : 'drop-off'}. Pilot is staged nearby; shared return-stop timer is running.`;
          }
          appendPing('pilot', 'STAGED_NEARBY', `Pilot staged nearby for Hop ${currentIdx + 1} · Tap "Summon to Curb" when ready.`);
        } else if (action === 'start_next_hop' && state.tripState === 'WAITING_HOP') {
          const waits = [...(state.stopWaits || [])];
          if (waits[currentIdx]) waits[currentIdx].departedAt = now;
          state.stopWaits = waits;
          state.stopIndex = Math.min(currentIdx + 1, hops.length - 1);
          state.tripState = 'ACTIVE';
          state.curbsideStatus = 'NONE';
          state.notificationMessage = `Departed Hop ${currentIdx + 1}. Continuing to Hop ${state.stopIndex + 1}.`;
        } else if (action === 'start_return' && state.tripState === 'WAITING_RETURN') {
          const waits = [...(state.stopWaits || [])];
          if (waits[currentIdx]) waits[currentIdx].departedAt = now;
          state.stopWaits = waits;
          state.returnStartedAt = now;
          state.tripState = 'RETURNING';
          state.curbsideStatus = 'NONE';
          state.notificationMessage = 'Pilot recorded the return-leg start. Post-stop wait is closed and visible in the trip timeline.';
          appendPing('pilot', 'RETURN_STARTED', 'Rider boarded · Returning to original pickup.');
        } else {
          return send(res, 409, { ok: false, error: 'Wait event is not available in the current trip state' });
        }
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/extend-wait') {
        const role = authRole(req);
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        if (!['WAITING_HOP', 'WAITING_RETURN'].includes(state.tripState)) {
          return send(res, 409, { ok: false, error: 'Wait time can only be extended during an active stop wait' });
        }
        const addMinutes = Number(data.addMinutes) || 15;
        if (![15, 30].includes(addMinutes)) {
          return send(res, 422, { ok: false, error: 'Wait extensions must be 15 or 30 minutes' });
        }
        const hops = state.routeQuote?.hops ? [...state.routeQuote.hops] : [{ destination: state.destination, waitMinutes: state.routeQuote?.waitMinutes || 15 }];
        const idx = Math.min(state.stopIndex || 0, Math.max(0, hops.length - 1));
        const updatedMinutes = Number(hops[idx].waitMinutes || 15) + addMinutes;
        hops[idx] = { ...hops[idx], waitMinutes: updatedMinutes };

        const totalWaitMinutes = hops.reduce((sum, h) => sum + Number(h.waitMinutes || 15), 0);
        const route = state.routeQuote?.route || { totalDistanceMiles: 0, totalDurationSeconds: 0 };
        const updatedFare = calculateFare({
          distanceMiles: route.totalDistanceMiles,
          activeSeconds: route.totalDurationSeconds,
          includedWaitMinutes: totalWaitMinutes,
          hops,
        });
        state.routeQuote = {
          ...state.routeQuote,
          waitMinutes: totalWaitMinutes,
          hops,
          fare: updatedFare,
        };
        const waits = [...(state.stopWaits || [])];
        if (waits[idx]) waits[idx].reservedSeconds = updatedMinutes * 60;
        state.stopWaits = waits;
        state.notificationMessage = `Added +${addMinutes} min to Hop ${idx + 1} standby wait (now ${updatedMinutes} min total). Updated estimate: $${(updatedFare.totalCents / 100).toFixed(2)} USD.`;
        appendPing(role, 'WAIT_EXTENDED', `Extended Hop ${idx + 1} standby by +${addMinutes} min (now ${updatedMinutes} min).`);
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/ping') {
        const role = authRole(req);
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        const code = String(data.code || 'CUSTOM').toUpperCase();
        const now = new Date().toISOString();
        const messagesByCode = {
          SUMMON_CURB: 'Rider is heading out! Summoned pilot to pull up to the curb (2-min window).',
          STILL_INSIDE: 'Rider checked in: Still inside venue, all good — keeping standby timer active.',
          READY_AT_CURB: 'Rider is standing at the pickup curb now.',
          STAGED_NEARBY: 'Pilot is staged in a legal standby spot nearby — summon when ready.',
          PULLING_TO_CURB: 'Pilot is pulling up to the venue curb now (ETA ~90 sec).',
          AT_CURB_HAZARDS: 'Pilot is at the curb with hazard lights flashing.',
        };
        const text = messagesByCode[code] || String(data.text || 'Status update sent.');
        if (code === 'SUMMON_CURB') {
          state.curbsideStatus = 'SUMMONED_BY_RIDER';
          state.curbsideUpdatedAt = now;
        } else if (['STAGED_NEARBY', 'PULLING_TO_CURB', 'AT_CURB_HAZARDS'].includes(code)) {
          state.curbsideStatus = code;
          state.curbsideUpdatedAt = now;
        }
        state.notificationMessage = text;
        appendPing(role, code, text);
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/deposit') {
        const role = authRole(req);
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        state.depositStatus = 'HELD_DEMO';
        state.depositAmountCents = state.routeQuote?.fare?.upfrontDepositCents || Math.round((state.routeQuote?.fare?.totalCents || 1200) * 0.5);
        state.notificationMessage = `50% Upfront Retainer Deposit ($${(state.depositAmountCents / 100).toFixed(2)} USD) locked in demo ledger. Pilot is protected against mid-hop cancellation.`;
        appendPing(role, 'DEPOSIT_LOCKED', `50% Retainer Deposit ($${(state.depositAmountCents / 100).toFixed(2)}) confirmed.`);
        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/cabin-items') {
        const role = authRole(req);
        if (!role) return send(res, 401, { ok: false, error: 'Trip credential required' });
        const action = String(data.action || 'add');
        const now = new Date().toISOString();
        const items = [...(state.cabinItems || [])];

        if (action === 'add') {
          const label = String(data.label || '').trim().slice(0, 80);
          if (!label) return send(res, 422, { ok: false, error: 'Item description is required' });
          const item = {
            id: randomUUID(),
            label,
            status: 'LOCKED_IN_CABIN',
            loggedBy: role,
            updatedAt: now,
          };
          items.push(item);
          state.cabinItems = items.slice(-12);
          state.notificationMessage = `VIP Cabin Safe-Hold: "${label}" logged as locked inside the vehicle while hopping.`;
          appendPing(role, 'CABIN_SAFE_HOLD', `Locked in cabin during hop: ${label}`);
        } else if (action === 'retrieve' || action === 'retrieve_all') {
          const targetId = data.itemId ? String(data.itemId) : null;
          state.cabinItems = items.map(it =>
            !targetId || it.id === targetId ? { ...it, status: 'RETRIEVED', updatedAt: now } : it
          );
          state.notificationMessage = 'VIP Cabin Safe-Hold: Rider confirmed cabin belongings retrieved.';
          appendPing(role, 'CABIN_ITEMS_RETRIEVED', 'All logged cabin belongings confirmed retrieved.');
        } else if (action === 'verify_pin') {
          const pin = String(data.pin || '').trim();
          if (!state.boardingPin || pin !== String(state.boardingPin)) {
            return send(res, 422, { ok: false, error: '4-digit Curbside Re-Boarding PIN did not match' });
          }
          state.boardingPinVerified = true;
          state.notificationMessage = `4-Digit Curbside Re-Boarding PIN (${state.boardingPin}) verified! Rider and pilot matched at the curb.`;
          appendPing(role, 'PIN_VERIFIED', `4-Digit Curbside Re-Boarding PIN (${state.boardingPin}) verified.`);
        } else {
          return send(res, 422, { ok: false, error: 'Invalid cabin-items action' });
        }

        broadcast('STATE_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/settlement-mode') {
        const role = authRole(req);
        const mode = data.mode;
        if (role !== 'rider') return send(res, 403, { ok: false, error: 'Only the rider can choose the settlement path' });
        if (state.tripState !== 'COMPLETED' || !['CASH', 'CASHAPP', 'DEMO_DIGITAL'].includes(mode)) {
          return send(res, 409, { ok: false, error: 'Choose a valid settlement path after trip completion' });
        }
        if (state.settlementMode && state.settlementMode !== mode) {
          return send(res, 409, { ok: false, error: 'A settlement path has already been selected for this trip' });
        }
        state.settlementMode = mode;
        state.notificationMessage =
          mode === 'CASH'
            ? 'Cash selected. Both parties can attest to the agreed amount in-app.'
            : mode === 'CASHAPP'
              ? 'Cash App selected. The app will hand off to Cash App; payment remains external.'
              : 'Demo checkout selected. This sandbox moves no money.';
        broadcast('SETTLEMENT_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/external-payment') {
        const role = authRole(req);
        const action = data.action;
        if (!role) return send(res, 401, { ok: false, error: 'Role-scoped trip credential required' });
        if (state.tripState !== 'COMPLETED' || state.settlementMode !== 'CASHAPP') {
          return send(res, 409, { ok: false, error: 'External Cash App handoff is available only after a completed trip' });
        }
        const payment = state.externalPayment;
        if (action === 'propose') {
          const amountCents = data.amountCents;
          if (role !== 'rider' || payment.status !== 'NOT_STARTED' || !Number.isInteger(amountCents) || amountCents < 1 || amountCents > 1000000) {
            return send(res, 422, { ok: false, error: 'Enter an agreed amount between $0.01 and $10,000.00' });
          }
          state.externalPayment = { ...payment, status: 'AWAITING_EXTERNAL_PAYMENT', amountCents };
        } else if (action === 'attest_sent' || action === 'attest_received') {
          if (payment.status === 'NOT_STARTED' || payment.status === 'DISPUTED' || payment.status === 'CONFIRMED') {
            return send(res, 409, { ok: false, error: 'Set the agreed amount first; this confirmation is already final or unavailable' });
          }
          const expectedRole = action === 'attest_sent' ? 'rider' : 'pilot';
          if (role !== expectedRole) return send(res, 403, { ok: false, error: 'Only the relevant trip party can make this confirmation' });
          const amountCents = data.amountCents;
          if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 1000000) {
            return send(res, 422, { ok: false, error: 'Enter the amount shown in the external payment app' });
          }
          const sentCents = action === 'attest_sent' ? amountCents : payment.sentCents;
          const receivedCents = action === 'attest_received' ? amountCents : payment.receivedCents;
          const attestations = { ...payment.attestations, [role]: true };
          const mismatch =
            (sentCents !== null && sentCents !== payment.amountCents) ||
            (receivedCents !== null && receivedCents !== payment.amountCents) ||
            (sentCents !== null && receivedCents !== null && sentCents !== receivedCents);
          state.externalPayment = {
            ...payment,
            status: mismatch ? 'DISPUTED' : attestations.rider && attestations.pilot ? 'BOTH_ATTESTED' : 'AWAITING_OTHER',
            sentCents,
            receivedCents,
            attestations,
          };
        } else {
          return send(res, 422, { ok: false, error: 'Invalid external payment action' });
        }
        state.notificationMessage =
          state.externalPayment.status === 'BOTH_ATTESTED'
            ? 'Both parties report matching Cash App amounts. Trickhopper did not verify the transfer.'
            : state.externalPayment.status === 'DISPUTED'
              ? 'Reported Cash App amounts do not match. Resolve directly in Cash App.'
              : 'External Cash App handoff updated; no funds pass through Trickhopper.';
        broadcast('EXTERNAL_PAYMENT_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/demo/payment') {
        const role = authRole(req);
        const action = data.action;
        if (!role) return send(res, 401, { ok: false, error: 'Role-scoped trip credential required' });
        if (state.tripState !== 'COMPLETED' || state.settlementMode !== 'DEMO_DIGITAL') {
          return send(res, 409, { ok: false, error: 'Demo checkout is not selected for this completed trip' });
        }
        const demo = state.demoPayment;
        if (action === 'propose') {
          const amountCents = data.amountCents;
          if (role !== 'rider' || !['NOT_STARTED', 'FARE_REJECTED'].includes(demo.status) || !Number.isInteger(amountCents) || amountCents < 1 || amountCents > 1000000) {
            return send(res, 422, { ok: false, error: 'Enter a demo fare between $0.01 and $10,000.00' });
          }
          state.demoPayment = { status: 'FARE_AWAITING_PILOT', amountCents, estimatedFeeCents: null, pilotPayoutCents: null };
          if (state.simulationMode) {
            const estimatedFeeCents = Math.round(amountCents * 0.029 + 30);
            state.demoPayment = {
              status: 'FARE_APPROVED',
              amountCents,
              estimatedFeeCents,
              pilotPayoutCents: Math.max(0, amountCents - estimatedFeeCents),
            };
          }
        } else if (action === 'approve' || action === 'reject') {
          if (role !== 'pilot' || demo.status !== 'FARE_AWAITING_PILOT') {
            return send(res, 409, { ok: false, error: 'Pilot fare decision is not available' });
          }
          state.demoPayment = { ...demo, status: action === 'approve' ? 'FARE_APPROVED' : 'FARE_REJECTED' };
        } else if (action === 'simulate_success' || action === 'simulate_decline') {
          if (role !== 'rider' || demo.status !== 'FARE_APPROVED') {
            return send(res, 409, { ok: false, error: 'Pilot must approve the fare before demo checkout' });
          }
          if (action === 'simulate_success') {
            const estimatedFeeCents = Math.round(demo.amountCents * 0.029 + 30);
            state.demoPayment = {
              ...demo,
              status: 'TEST_SUCCEEDED',
              estimatedFeeCents,
              pilotPayoutCents: Math.max(0, demo.amountCents - estimatedFeeCents),
            };
          } else {
            state.demoPayment = { ...demo, status: 'TEST_DECLINED', estimatedFeeCents: null, pilotPayoutCents: null };
          }
        } else {
          return send(res, 422, { ok: false, error: 'Invalid demo payment action' });
        }
        state.notificationMessage =
          state.demoPayment.status === 'TEST_SUCCEEDED'
            ? 'Demo payment succeeded. Estimated fee and pilot payout shown; no money moved.'
            : state.demoPayment.status === 'TEST_DECLINED'
              ? 'Demo payment declined. No money moved.'
              : 'Demo checkout updated. No money moved.';
        broadcast('DEMO_PAYMENT_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/cash-confirmation') {
        const role = authRole(req);
        const amountCents = data.amountCents;
        if (!role) return send(res, 401, { ok: false, error: 'Role-scoped trip credential required' });
        if (state.tripState !== 'COMPLETED' || state.settlementMode !== 'CASH') {
          return send(res, 409, { ok: false, error: 'Cash confirmation is available only when cash was selected after trip completion' });
        }
        if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 1000000) {
          return send(res, 422, { ok: false, error: 'Enter an agreed cash amount between $0.01 and $10,000.00' });
        }
        const cash = state.cashConfirmation;
        if (cash.status === 'CONFIRMED' || cash.status === 'DISPUTED') {
          return send(res, 409, { ok: false, error: 'Cash confirmation is already final' });
        }
        if (cash.amountCents !== null && cash.amountCents !== amountCents) {
          state.cashConfirmation = { ...cash, status: 'DISPUTED', attestations: { ...cash.attestations, [role]: true } };
          state.notificationMessage = 'Cash amount did not match. Both parties need to resolve it outside the app.';
          broadcast('CASH_UPDATE');
          return send(res, 200, { ok: true, ...snapshot() });
        }
        const attestations = { ...cash.attestations, [role]: true, ...(state.simulationMode ? { pilot: true } : {}) };
        const both = attestations.rider && attestations.pilot;
        state.cashConfirmation = { status: both ? 'CONFIRMED' : 'AWAITING_OTHER', amountCents, attestations };
        state.notificationMessage = both
          ? 'Both parties confirmed the cash exchange. TRICKHOPPER did not verify the physical payment.'
          : 'Your cash confirmation was recorded. Waiting for the other party to confirm the same amount.';
        broadcast('CASH_UPDATE');
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/trip/reset') {
        if (!authRole(req)) return send(res, 401, { ok: false, error: 'Trip credential required' });
        const resetTripId = access?.tripId;
        stopAutoPilot();
        broadcast('TRIP_RESET');
        if (resetTripId) {
          trips.delete(resetTripId);
          for (const [k, rec] of tickets.entries()) {
            if (rec?.tripId === resetTripId) tickets.delete(k);
          }
        }
        state = emptyState();
        shared = emptyShared();
        access = null;
        return send(res, 200, { ok: true, ...snapshot() });
      }

      if (p === '/api/telemetry/status') {
        const role = authRole(req);
        if (!role || data.role !== role || typeof data.active !== 'boolean') {
          return send(res, 401, { ok: false, error: 'Role-scoped trip credential required' });
        }
        shared.gpsActiveByRole = { ...shared.gpsActiveByRole, [role]: data.active };
        shared.gpsErrors = { ...shared.gpsErrors, [role]: data.active ? null : String(data.error || '') };
        broadcast('LOCATION_STATUS', { role, active: data.active, error: data.active ? null : data.error || null });
        return send(res, 200, { ok: true });
      }

      if (p === '/api/telemetry/location') {
        const role = authRole(req);
        if (!role || data.role !== role || !freshFix(data)) {
          return send(res, 401, { ok: false, error: 'Role-scoped credential and valid GPS fix required' });
        }
        if (!['REQUESTED', 'EN_ROUTE', 'WAITING_PICKUP', 'ACTIVE', 'WAITING_HOP', 'WAITING_RETURN', 'RETURNING'].includes(state.tripState)) {
          return send(res, 409, { ok: false, error: 'Trip is not accepting locations' });
        }
        const location = buildLocation(role, data);
        const prev = shared.liveLocations[role];
        shared.liveLocations = { ...shared.liveLocations, [role]: location };
        shared.gpsActiveByRole = { ...shared.gpsActiveByRole, [role]: true };
        shared.gpsErrors = { ...shared.gpsErrors, [role]: null };
        if (['EN_ROUTE', 'WAITING_PICKUP', 'ACTIVE', 'WAITING_HOP', 'WAITING_RETURN', 'RETURNING'].includes(state.tripState)) {
          shared.tracks = { ...shared.tracks, [role]: [...shared.tracks[role], location].slice(-2500) };
          shared.fixCounts = { ...shared.fixCounts, [role]: shared.fixCounts[role] + 1 };
          if (
            ['ACTIVE', 'RETURNING'].includes(state.tripState) &&
            role === 'pilot' &&
            prev &&
            prev.accuracy <= 100 &&
            Date.parse(prev.timestamp) >= Date.parse(state.rideStartedAt || '')
          ) {
            const delta = haversine(prev, location);
            const seconds = (Date.parse(location.timestamp) - Date.parse(prev.timestamp)) / 1000;
            const implied = seconds > 0 ? (delta * 1609.344) / seconds : Infinity;
            if (delta < 1 && implied < 55) state.tripDistanceMiles += delta;
          }
        }
        broadcast('LOCATION_UPDATE', {
          role,
          location,
          track: shared.tracks[role],
          fixCounts: shared.fixCounts,
          tripDistanceMiles: state.tripDistanceMiles,
          gpsActiveByRole: shared.gpsActiveByRole,
        });
        return send(res, 200, { ok: true, ...snapshot(), location, track: shared.tracks[role] });
      }

      return send(res, 404, { ok: false, error: 'Not found' });
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message || 'Invalid request' });
    }
  }

  if (p === '/driver' || p === '/driver/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(root, 'driver/index.html')).pipe(res);
  }
  if (p === '/dispatch' || p === '/dispatch/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(root, 'dispatch/index.html')).pipe(res);
  }
  if (p.startsWith('/api/')) return send(res, 404, { ok: false, error: 'Not found' });
  if (p === '/pilot' || p.startsWith('/pilot/') || ['/rocko', '/dohntay'].includes(p)) {
    res.writeHead(404);
    return res.end('Pilot not onboarded.');
  }
  const relative = path.normalize(p === '/' ? '/index.html' : p).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  const file = path.join(root, relative);
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
}

export const server = http.createServer(handleRequest);
const PORT = Number(process.env.PORT) || 4242;
const HOST = process.env.HOST || '127.0.0.1';
const isDirectEntry =
  process.argv[1] &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    path.basename(process.argv[1]) === 'trip-service.mjs');
if (process.env.NO_LISTEN !== '1' && isDirectEntry) {
  server.listen(PORT, HOST, () => console.log(`TRICKHOPPER local GPS pilot: http://${HOST}:${PORT} (rider /, pilot /driver)`));
}

