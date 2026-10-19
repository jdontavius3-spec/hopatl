export const TRIP_STATES = {
  IDLE: 'IDLE',
  REQUESTED: 'REQUESTED',
  EN_ROUTE: 'EN_ROUTE',
  WAITING_PICKUP: 'WAITING_PICKUP',
  ACTIVE: 'ACTIVE',
  WAITING_HOP: 'WAITING_HOP',
  WAITING_RETURN: 'WAITING_RETURN',
  RETURNING: 'RETURNING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
};

const defaultStop = (waitMinutes = 30) => ({
  destination: '',
  waitMinutes,
  suggestions: [],
  suggesting: false,
  selectedPlace: null,
});

const empty = () => ({
  tripState: TRIP_STATES.IDLE,
  simulationMode: false,
  liveLocations: { rider: null, pilot: null },
  tracks: { rider: [], pilot: [] },
  fixCounts: { rider: 0, pilot: 0 },
  gpsActiveByRole: { rider: false, pilot: false },
  gpsRequestingByRole: { rider: false, pilot: false },
  gpsErrors: {},
  tripDistanceMiles: 0,
  notificationMessage: null,
  rideStartedAt: null,
  rideCompletedAt: null,
  tripId: null,
  bookingPickup: null,
  destination: null,
  destinationText: '',
  waitSelectionMinutes: 30,
  stops: [defaultStop(30)],
  passengerCount: 2,
  holdDeposit: true,
  depositStatus: 'UNPAID',
  depositAmountCents: null,
  curbsideStatus: 'NONE',
  pings: [],
  stopIndex: 0,
  stopWaits: [],
  routeQuote: null,
  routeLoading: false,
  routeError: null,
  pilotName: sessionStorage.getItem('trickhopper_pilot_name') || 'Dohntay (VIP Pilot)',
  pilotVehicle: sessionStorage.getItem('trickhopper_pilot_vehicle') || 'Black Cadillac Escalade ESV',
  pilotPlate: sessionStorage.getItem('trickhopper_pilot_plate') || 'ATL-HOP1',
});

const fresh = p => {
  const age = Date.now() - Date.parse(p?.timestamp || '');
  return Number.isFinite(age) && age >= -5000 && age < 45000 && Number(p.accuracy) <= 100;
};

export class Store {
  constructor() {
    this.listeners = new Set();
    this.pendingFixes = {};
    const activeMode = location.pathname.replace(/\/+$/, '') === '/driver' ? 'pilot' : 'rider';
    this.state = { ...empty(), activeMode };
    this.role = activeMode;
    this.token = sessionStorage.getItem(`trickhopper_${this.role}_token`);
    this.tripId = sessionStorage.getItem(`trickhopper_${this.role}_trip`);
    this.checkBackend();
    if (this.token) this.restore();
    else if (this.role === 'pilot') this.startRequestPolling();
    window.addEventListener('popstate', () => {
      this.state.activeMode = location.pathname.replace(/\/+$/, '') === '/driver' ? 'pilot' : 'rider';
      this.notify();
    });
  }

  async checkBackend() {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const body = r.ok ? await r.json() : null;
      this.state.backendMode = body?.mode || null;
      this.state.backendStatus = body?.ok ? 'ready' : 'offline';
    } catch {
      this.state.backendStatus = 'offline';
    }
    this.notify();
  }

  startTripPolling() {
    if (this.tripPollTimer) return;
    this.tripPollTimer = setInterval(async () => {
      if (!this.token) return;
      try {
        const r = await fetch('/api/trip/state', {
          headers: { Authorization: `Bearer ${this.token}` },
          cache: 'no-store',
        });
        if (r.ok) {
          this.mergeServer(await r.json());
          this.notify();
        }
      } catch {}
    }, 2000);
  }

  startRequestPolling() {
    if (this.queueTimer) return;
    this.refreshOpenRequest();
    this.queueTimer = setInterval(() => this.refreshOpenRequest(), 2000);
  }

  async refreshOpenRequest() {
    if (this.role !== 'pilot' || this.token) return;
    try {
      const r = await fetch('/api/driver/request', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.pending) {
        this.state.tripState = TRIP_STATES.REQUESTED;
        this.state.liveLocations = { ...this.state.liveLocations, rider: data.pickup };
        this.state.destination = data.destination;
        this.state.passengerCount = data.passengerCount || 1;
        this.state.routeQuote = data.routeQuote;
        this.state.notificationMessage = 'A new pickup request is waiting. Accept it to connect and share live GPS.';
      } else if (this.state.tripState === TRIP_STATES.REQUESTED) {
        this.state = {
          ...empty(),
          activeMode: this.state.activeMode,
          notificationMessage: data.tripState !== 'REQUESTED'
            ? 'That request was accepted or closed.'
            : 'No pickup request is currently waiting.',
        };
      }
      this.notify();
    } catch {}
  }

  async restore() {
    try {
      const r = await fetch('/api/trip/state', { headers: { Authorization: `Bearer ${this.token}` } });
      if (r.status === 401) {
        this.token = null;
        this.tripId = null;
        sessionStorage.removeItem(`trickhopper_${this.role}_token`);
        sessionStorage.removeItem(`trickhopper_${this.role}_trip`);
        if (this.role === 'pilot') this.startRequestPolling();
        this.notify();
        return;
      }
      if (!r.ok) return;
      const data = await r.json();
      this.mergeServer(data);
      this.connectEvents();
    } catch {}
  }

  async connectEvents() {
    if (!this.token) return;
    if (this.state.backendMode === 'shared-persistent-demo' || !window.EventSource) {
      this.startTripPolling();
      return;
    }
    this.events?.close();
    try {
      const r = await fetch('/api/trip/events-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) {
        this.startTripPolling();
        return;
      }
      const { ticket } = await r.json();
      this.events = new EventSource(`/api/trip/events?ticket=${encodeURIComponent(ticket)}`);
      this.events.onmessage = e => {
        try {
          const p = JSON.parse(e.data);
          if (
            ['INIT', 'STATE_UPDATE', 'CASH_UPDATE', 'SETTLEMENT_UPDATE', 'DEMO_PAYMENT_UPDATE', 'EXTERNAL_PAYMENT_UPDATE'].includes(p.type)
          ) {
            this.mergeServer(p);
          } else if (p.type === 'LOCATION_UPDATE') {
            this.state.liveLocations = { ...this.state.liveLocations, [p.role]: p.location };
            this.state.tracks = { ...this.state.tracks, [p.role]: p.track };
            this.state.fixCounts = p.fixCounts;
            this.state.tripDistanceMiles = p.tripDistanceMiles;
            this.state.gpsActiveByRole = p.gpsActiveByRole || this.state.gpsActiveByRole;
          } else if (p.type === 'LOCATION_STATUS') {
            this.state.gpsActiveByRole = { ...this.state.gpsActiveByRole, [p.role]: p.active };
            this.state.gpsErrors = { ...this.state.gpsErrors, [p.role]: p.error || null };
          } else if (p.type === 'TRIP_RESET') {
            this.token = null;
            this.tripId = null;
            sessionStorage.removeItem(`trickhopper_${this.role}_token`);
            sessionStorage.removeItem(`trickhopper_${this.role}_trip`);
            this.state = { ...empty(), activeMode: this.state.activeMode };
            if (this.role === 'pilot') this.startRequestPolling();
          }
          this.notify();
        } catch (err) {
          console.error(err);
        }
      };
      this.events.onerror = () => {
        this.events?.close();
        this.startTripPolling();
      };
    } catch {
      this.startTripPolling();
    }
  }

  mergeServer(data) {
    this.state = {
      ...this.state,
      ...(data.state || data),
      ...(data.shared || {}),
      tripId: data.tripId || data.state?.tripId || this.state.tripId,
      activeMode: this.state.activeMode,
    };
  }

  getState() {
    return this.state;
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify() {
    for (const fn of this.listeners) fn(this.state);
  }

  async post(path, data = {}, token = this.token) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(data) });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || 'Server rejected request');
      return result;
    } catch (e) {
      this.state.gpsErrors = { ...this.state.gpsErrors, [this.state.activeMode]: e.message || 'Trip server connection lost.' };
      this.notify();
      throw e;
    }
  }

  async recordGPS(role, fix) {
    if (this.token) return this.sendLocation(role, fix);
    this.pendingFixes[role] = fix;
    return true;
  }

  discardPendingFix(role) {
    delete this.pendingFixes[role];
  }

  async sendLocation(role, fix) {
    try {
      const result = await this.post('/api/telemetry/location', { role, ...fix });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  setGPSRequesting(role, requesting) {
    this.state.gpsRequestingByRole = { ...this.state.gpsRequestingByRole, [role]: requesting };
    if (requesting) this.state.gpsErrors = { ...this.state.gpsErrors, [role]: null };
    this.notify();
  }

  async setLocationStatus(role, active, error = null) {
    this.state.gpsActiveByRole = { ...this.state.gpsActiveByRole, [role]: active };
    this.state.gpsRequestingByRole = { ...this.state.gpsRequestingByRole, [role]: false };
    this.state.gpsErrors = { ...this.state.gpsErrors, [role]: error };
    this.notify();
    if (this.token) {
      try {
        await this.post('/api/telemetry/status', { role, active, error });
      } catch {}
    }
  }

  capturePickup(fix) {
    this.state.bookingPickup = fix;
    this.state.liveLocations = { ...this.state.liveLocations, rider: fix };
    this.state.routeQuote = null;
    this.state.routeError = null;
    this.notify();
  }

  setStopDestination(index, value, selectedPlace = null) {
    const stops = [...(this.state.stops || [defaultStop(30)])];
    if (!stops[index]) return;
    stops[index] = {
      ...stops[index],
      destination: value,
      selectedPlace,
      suggestions: selectedPlace ? [] : stops[index].suggestions,
    };
    this.state.stops = stops;
    if (index === 0) this.state.destinationText = value;
    this.state.routeQuote = null;
    this.state.routeError = null;
    this.notify();
  }

  async suggestStopAddress(index, query) {
    const q = String(query || '').trim();
    const stops = [...(this.state.stops || [])];
    if (!stops[index]) return;
    if (q.length < 2) {
      stops[index] = { ...stops[index], suggestions: [], suggesting: false };
      this.state.stops = stops;
      this.notify();
      return;
    }
    try {
      const res = await this.post('/api/address/suggest', { query: q }, null);
      const currentStops = [...(this.state.stops || [])];
      if (!currentStops[index]) return;
      currentStops[index] = { ...currentStops[index], suggestions: res.results || [], suggesting: false };
      this.state.stops = currentStops;
      this.notify();
    } catch {}
  }

  setStopWait(minutes, index = 0) {
    const value = Number(minutes);
    if (![15, 30, 60].includes(value)) return;
    const stops = [...(this.state.stops || [defaultStop(30)])];
    const idx = Number(index) || 0;
    if (!stops[idx]) return;
    stops[idx] = { ...stops[idx], waitMinutes: value };
    this.state.stops = stops;
    if (idx === 0) this.state.waitSelectionMinutes = value;
    this.state.routeQuote = null;
    this.state.routeError = null;
    this.notify();
  }

  setWaitSelection(minutes) {
    this.setStopWait(minutes, 0);
  }

  addStop() {
    if ((this.state.stops || []).length >= 3) return;
    this.state.stops = [...this.state.stops, defaultStop(15)];
    this.state.routeQuote = null;
    this.state.routeError = null;
    this.notify();
  }

  removeStop(index) {
    if ((this.state.stops || []).length <= 1) return;
    this.state.stops = this.state.stops.filter((_, i) => i !== Number(index));
    this.state.routeQuote = null;
    this.state.routeError = null;
    this.notify();
  }

  async quoteDestination() {
    const pickup = this.state.bookingPickup;
    const stops = this.state.stops || [];
    if (!pickup) {
      this.state.routeError = 'Share your pickup location first (or tap "Use Midtown Atlanta Demo GPS").';
      this.notify();
      return false;
    }
    if (stops.some(s => String(s.destination || '').trim().length < 4)) {
      this.state.routeError = 'Enter a destination address or select an Atlanta venue for every hop.';
      this.notify();
      return false;
    }
    this.state.routeLoading = true;
    this.state.routeError = null;
    this.notify();
    try {
      const payload = {
        pickup: { lat: pickup.lat, lng: pickup.lng },
        destination: stops[0].destination.trim(),
        waitMinutes: stops[0].waitMinutes,
        stops: stops.map(s => ({
          destination: s.destination.trim(),
          waitMinutes: Number(s.waitMinutes) || 15,
          coords: s.selectedPlace ? { lat: s.selectedPlace.lat, lng: s.selectedPlace.lng, label: s.selectedPlace.label } : null,
        })),
      };
      const result = await this.post('/api/route/quote', payload, null);
      this.state.routeQuote = result.quote;
      this.state.routeLoading = false;
      this.notify();
      return true;
    } catch (error) {
      this.state.routeLoading = false;
      this.state.routeError = error.message || 'Could not calculate a route. Please try again.';
      this.notify();
      return false;
    }
  }

  async requestRide(launchAutoPilotAfter = false) {
    const fix = this.pendingFixes.rider || this.state.bookingPickup;
    const quote = this.state.routeQuote;
    if (!fix) {
      this.state.notificationMessage = 'Set pickup location first.';
      this.notify();
      return false;
    }
    if (!quote) {
      this.state.routeError = 'Get a route estimate before requesting this wait-and-return ride.';
      this.notify();
      return false;
    }
    try {
      const result = await this.post(
        '/api/trip/create',
        {
          initialFix: fix,
          quoteId: quote.quoteId,
          passengerCount: this.state.passengerCount,
          holdDeposit: this.state.holdDeposit,
        },
        null
      );
      this.token = result.riderToken;
      this.tripId = result.tripId;
      sessionStorage.setItem('trickhopper_rider_token', this.token);
      sessionStorage.setItem('trickhopper_rider_trip', this.tripId);
      this.mergeServer(result);
      delete this.pendingFixes.rider;
      this.connectEvents();
      if (launchAutoPilotAfter) {
        await this.startAutoPilot(true);
      }
      this.notify();
      return true;
    } catch (error) {
      this.state.routeError = error.message || 'Could not create the ride request.';
      this.notify();
      return false;
    }
  }

  async startAutoPilot(autoAdvance = true) {
    try {
      const result = await this.post('/api/demo/auto-pilot', { action: 'start', autoAdvance, intervalMs: 5000 });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async stepAutoPilot() {
    try {
      const result = await this.post('/api/demo/auto-pilot', { action: 'step' });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async pauseAutoPilot() {
    try {
      const result = await this.post('/api/demo/auto-pilot', { action: 'pause' });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async claimOpenRequest(initialFix) {
    try {
      const result = await this.post(
        '/api/trip/claim',
        {
          initialFix,
          pilotName: this.state.pilotName,
          pilotVehicle: this.state.pilotVehicle,
          pilotPlate: this.state.pilotPlate,
        },
        null
      );
      this.token = result.pilotToken;
      this.tripId = result.tripId;
      sessionStorage.setItem('trickhopper_pilot_token', this.token);
      sessionStorage.setItem('trickhopper_pilot_trip', this.tripId);
      clearInterval(this.queueTimer);
      this.queueTimer = null;
      delete this.pendingFixes.pilot;
      this.mergeServer(result);
      this.connectEvents();
      return true;
    } catch {
      return false;
    }
  }

  async completeRide() {
    if (!['ACTIVE', 'RETURNING'].includes(this.state.tripState)) return false;
    if (!this.state.simulationMode && (!fresh(this.state.liveLocations.pilot) || (this.state.fixCounts.pilot || 0) < 2)) {
      this.state.notificationMessage = 'Pilot GPS stream needs a fresh fix and recorded telemetry before completion.';
      this.notify();
      return false;
    }
    try {
      const result = await this.post('/api/trip/state', {
        tripState: 'COMPLETED',
        notificationMessage: 'Roundtrip complete! GPS telemetry and standby wait timers recorded.',
      });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async waitEvent(action) {
    try {
      const result = await this.post('/api/trip/wait-event', { action });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async extendWait(addMinutes = 15) {
    try {
      const result = await this.post('/api/trip/extend-wait', { addMinutes });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async sendPing(code, text = '') {
    try {
      const result = await this.post('/api/trip/ping', { code, text });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async lockDeposit() {
    try {
      const result = await this.post('/api/trip/deposit', {});
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async chooseSettlement(mode) {
    try {
      const result = await this.post('/api/trip/settlement-mode', { mode });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async demoPayment(action, amountCents = null) {
    try {
      const result = await this.post('/api/demo/payment', { action, amountCents });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async confirmCash(amount) {
    const amountCents = Math.round(Number(amount) * 100);
    try {
      const result = await this.post('/api/trip/cash-confirmation', { amountCents });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async externalPayment(action, amount) {
    const amountCents = Math.round(Number(amount) * 100);
    try {
      const result = await this.post('/api/trip/external-payment', { action, amountCents });
      this.mergeServer(result);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  async resetTrip() {
    try {
      const result = await this.post('/api/trip/reset', {});
      this.events?.close();
      this.token = null;
      this.tripId = null;
      sessionStorage.removeItem(`trickhopper_${this.role}_token`);
      sessionStorage.removeItem(`trickhopper_${this.role}_trip`);
      this.state = {
        ...empty(),
        ...(result.state || {}),
        ...(result.shared || {}),
        activeMode: this.state.activeMode,
      };
      if (this.role === 'pilot') this.startRequestPolling();
      this.notify();
    } catch {}
  }
}

export const store = new Store();
