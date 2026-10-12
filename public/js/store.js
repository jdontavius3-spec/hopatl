/**
 * Reactive State Store for Wait & Return Prototype
 * Single source of truth synchronized between Rider and Driver demo views.
 * Includes Cash App Pay pre-authorization and instant $cashtag driver payout.
 */

import { calculateEstimate, PRICING_CONFIG } from './pricing.js';
import { PRESET_LOCATIONS, PRESET_DESTINATIONS, MOCK_DRIVERS, getCoordinatesForLocation } from './data.js';

export const TRIP_STATES = {
  IDLE: 'IDLE',                       // Landing page
  BOOKING: 'BOOKING',                 // Entering trip details
  REVIEW: 'REVIEW',                   // Itemized upfront fare review
  MATCHING: 'MATCHING',               // Driver match simulation
  DRIVER_ACCEPTED: 'DRIVER_ACCEPTED', // Driver heading to pickup
  OUTBOUND: 'OUTBOUND',               // Outbound or intermediate leg in transit
  WAITING: 'WAITING',                 // At stop destination; driver waiting; countdown active
  RIDER_READY: 'RIDER_READY',         // Rider tapped "I'm ready for next stop / return"
  RETURN_LEG: 'RETURN_LEG',           // Return leg in transit to origin
  COMPLETED: 'COMPLETED',             // Trip completed, receipt shown
};

const STORAGE_KEY = 'wait_return_prototype_state_v4';

const DEFAULT_STOPS = [
  {
    id: 'stop_1',
    name: PRESET_DESTINATIONS[0].name,
    category: PRESET_DESTINATIONS[0].category,
    waitMinutes: 20,
    lat: PRESET_DESTINATIONS[0].lat,
    lng: PRESET_DESTINATIONS[0].lng,
  }
];

// Default Initial State
const DEFAULT_STATE = {
  activeMode: 'rider', // 'rider' | 'driver'
  tripState: TRIP_STATES.IDLE,
  pickup: PRESET_LOCATIONS[0].name,
  pickupCoords: { lat: PRESET_LOCATIONS[0].lat, lng: PRESET_LOCATIONS[0].lng },
  stops: DEFAULT_STOPS,
  currentStopIndex: 0,
  odometerMiles: 0.0,
  destination: DEFAULT_STOPS[0].name,
  category: DEFAULT_STOPS[0].category,
  distanceMiles: 4.2,
  isCustomDestination: false,
  destinationInputMode: 'all', // 'all' | 'custom' | 'preset'
  waitMinutes: 20,
  extendedMinutes: 0,
  riders: 1,
  driver: MOCK_DRIVERS[0],
  waitTimerRemaining: 20 * 60, // in seconds
  waitTimerActive: false,
  pricing: calculateEstimate({ pickup: PRESET_LOCATIONS[0].name, stops: DEFAULT_STOPS }),
  notificationMessage: null,
  tripStartTime: null,
  tripCompletedTime: null,

  // Payment Integration State (Zelle, Cash App, Cash)
  paymentMethod: 'cashapp',          // 'cashapp' | 'zelle' | 'cash'
  riderCashTag: '$rider_guest',       // Rider's linked Cash App handle
  driverCashTag: '$2243Dohntay',      // Pilot driver's Cash App $cashtag
  driverZellePhone: '9432452611',    // Pilot driver's Zelle phone / identifier
  driverZelleFormatted: '(943) 245-2611',
  cashAppAuthorized: false,           // Pre-auth hold status
  cashAppHoldAmount: 34.00,           // Pre-auth hold with buffer ($ USD)
  driverWalletBalance: 142.50,        // Driver's simulated Cash App balance
  tipAmount: 0,                       // Added tip

  // Live GPS Telemetry & Fleet State
  driverGPS: {
    lat: MOCK_DRIVERS[0].lat,
    lng: MOCK_DRIVERS[0].lng,
    speed: 26,
    heading: 45,
    accuracy: 4,
    timestamp: 'Just now',
  },
  gpsActive: true,
  isSimulatedGPS: true,
  wakeLockActive: false,
  selectedDriverId: 'driver_1',

  // Overtime & Grace Period Wait Engine
  overtimeMinutes: 0,
  overtimeSeconds: 0,
  isOvertime: false,
  gracePeriodWarning: false,
  gracePeriodSecondsLeft: 0,
};

class Store {
  constructor() {
    this.listeners = new Set();
    this.timerInterval = null;
    this.sse = null;
    this.state = this._loadState();

    // URL is strictly authoritative for activeMode: riders always get rider mode, only /driver gets driver mode
    if (typeof window !== 'undefined' && window.location) {
      const isExplicitDriver = window.location.pathname.startsWith('/driver') || 
                               new URLSearchParams(window.location.search).get('mode') === 'driver';
      this.state.activeMode = isExplicitDriver ? 'driver' : 'rider';

      window.addEventListener('popstate', () => {
        const isDriver = window.location.pathname.startsWith('/driver') || 
                         new URLSearchParams(window.location.search).get('mode') === 'driver';
        this.setState({ activeMode: isDriver ? 'driver' : 'rider' });
      });
    }

    // Connect to Server-Sent Events (SSE) for multi-device sync
    this._initSSE();

    // Start timer management if currently in WAITING state
    if (this.state.tripState === TRIP_STATES.WAITING) {
      this._startWaitTimer();
    }
  }

  _initSSE() {
    if (typeof window === 'undefined' || !window.EventSource) return;

    try {
      this.sse = new EventSource('/api/trip/events');
      this.sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INIT' && data.state) {
            const curMode = this.state.activeMode;
            this.state = { ...this.state, ...data.state, activeMode: curMode };
            if (data.telemetry) {
              this.state.driverGPS = { ...this.state.driverGPS, ...data.telemetry };
            }
            this.notify(false);
          } else if (data.type === 'STATE_UPDATE' && data.state) {
            const curMode = this.state.activeMode;
            this.state = { ...this.state, ...data.state, activeMode: curMode };
            this.notify(false);
          } else if (data.type === 'TELEMETRY_UPDATE' && data.telemetry) {
            this.state.driverGPS = { ...this.state.driverGPS, ...data.telemetry };
            this.notify(false);
          }
        } catch (e) {
          console.warn('SSE message parse error:', e);
        }
      };

      this.sse.onerror = () => {
        // EventSource will automatically retry connection
      };
    } catch (err) {
      console.warn('Failed to initialize SSE client:', err);
    }
  }

  syncToRemote(customPayload = null) {
    if (typeof fetch === 'undefined') return;
    const payload = customPayload || {
      tripState: this.state.tripState,
      pickup: this.state.pickup,
      pickupCoords: this.state.pickupCoords,
      stops: this.state.stops,
      currentStopIndex: this.state.currentStopIndex,
      destination: this.state.destination,
      waitMinutes: this.state.waitMinutes,
      extendedMinutes: this.state.extendedMinutes,
      overtimeMinutes: this.state.overtimeMinutes,
      overtimeSeconds: this.state.overtimeSeconds,
      isOvertime: this.state.isOvertime,
      gracePeriodWarning: this.state.gracePeriodWarning,
      driver: this.state.driver,
      selectedDriverId: this.state.selectedDriverId,
      waitTimerRemaining: this.state.waitTimerRemaining,
      pricing: this.state.pricing,
      notificationMessage: this.state.notificationMessage,
      tripStartTime: this.state.tripStartTime,
      tripCompletedTime: this.state.tripCompletedTime,
      paymentMethod: this.state.paymentMethod,
      driverCashTag: this.state.driverCashTag,
      driverZellePhone: this.state.driverZellePhone,
      cashAppAuthorized: this.state.cashAppAuthorized,
      cashAppHoldAmount: this.state.cashAppHoldAmount,
      driverWalletBalance: this.state.driverWalletBalance,
      tipAmount: this.state.tipAmount,
      odometerMiles: this.state.odometerMiles,
    };

    fetch('/api/trip/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  _loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const stops = (parsed.stops && Array.isArray(parsed.stops) && parsed.stops.length > 0)
          ? parsed.stops
          : DEFAULT_STOPS;

        const pickup = parsed.pickup || DEFAULT_STATE.pickup;
        parsed.stops = stops;
        parsed.pickup = pickup;
        parsed.currentStopIndex = Number(parsed.currentStopIndex) || 0;
        parsed.odometerMiles = Number(parsed.odometerMiles) || 0.0;
        parsed.destination = stops[0].name;
        parsed.waitMinutes = stops[0].waitMinutes;
        parsed.overtimeMinutes = Number(parsed.overtimeMinutes) || 0;
        parsed.overtimeSeconds = Number(parsed.overtimeSeconds) || 0;
        parsed.isOvertime = Boolean(parsed.isOvertime);

        parsed.pricing = calculateEstimate({
          pickup,
          stops,
          extendedMinutes: parsed.extendedMinutes || 0,
          overtimeMinutes: parsed.overtimeMinutes || 0,
          riders: parsed.riders || 1,
        });

        // Always enforce URL authority for activeMode
        const isExplicitDriver = typeof window !== 'undefined' && window.location && 
          (window.location.pathname.startsWith('/driver') || new URLSearchParams(window.location.search).get('mode') === 'driver');
        parsed.activeMode = isExplicitDriver ? 'driver' : 'rider';

        return { ...DEFAULT_STATE, ...parsed };
      }
    } catch (e) {
      console.warn('Could not read state from localStorage', e);
    }
    return { ...DEFAULT_STATE };
  }

  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Could not save state to localStorage', e);
    }
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(broadcast = true) {
    this._saveState();
    if (broadcast) {
      this.syncToRemote();
    }
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Store listener error:', err);
      }
    });
  }

  setState(partial, broadcast = true) {
    this.state = { ...this.state, ...partial };
    this.notify(broadcast);
  }

  // Set top-level mode (Rider vs Driver demo)
  setMode(mode) {
    if (typeof window !== 'undefined' && window.history) {
      if (mode === 'driver') {
        window.history.pushState({}, '', '/driver');
      } else {
        window.history.pushState({}, '', '/');
      }
    }
    this.setState({ activeMode: mode });
  }

  setPaymentMethod(method) {
    this.setState({ paymentMethod: method });
  }

  setRiderCashTag(tag) {
    let clean = tag.trim();
    if (clean && !clean.startsWith('$')) clean = '$' + clean;
    this.setState({ riderCashTag: clean });
  }

  setDriverCashTag(tag) {
    let clean = tag.trim();
    if (clean && !clean.startsWith('$')) clean = '$' + clean;
    this.setState({ driverCashTag: clean });
  }

  setDriverZellePhone(phone) {
    this.setState({ driverZellePhone: phone });
  }

  // Set active pilot driver (Dohntay)
  selectDriver(driverId) {
    const drv = MOCK_DRIVERS.find(d => d.id === driverId) || MOCK_DRIVERS[0];
    this.setState({
      selectedDriverId: drv.id,
      driver: drv,
      driverCashTag: drv.cashTag,
      driverZellePhone: drv.zellePhone || '9432452611',
      driverZelleFormatted: drv.zelleFormatted || '(943) 245-2611',
      driverGPS: {
        lat: drv.lat,
        lng: drv.lng,
        speed: 24,
        heading: drv.heading || 45,
        accuracy: 4,
        timestamp: 'Just now',
      },
      notificationMessage: `Dedicated pilot driver active: ${drv.name} (${drv.vehicle}).`,
    });
  }

  // Update live GPS coordinates from TelemetryService and increment transparent odometer
  updateDriverGPS(coords) {
    const prevGPS = this.state.driverGPS;
    let extraMiles = 0;
    if (coords.speed > 0 && (this.state.tripState === TRIP_STATES.OUTBOUND || this.state.tripState === TRIP_STATES.RETURN_LEG)) {
      // 2-second tick distance at speed: (speed mph * 2s / 3600s)
      extraMiles = Math.round((coords.speed * 2 / 3600) * 100) / 100;
    }
    const newOdo = Math.round((this.state.odometerMiles + extraMiles) * 100) / 100;

    this.setState({
      driverGPS: { ...prevGPS, ...coords },
      odometerMiles: newOdo,
    });
  }

  // Authorize Cash App Hold
  authorizeCashAppHold() {
    const total = this.state.pricing.totalEstimate;
    const holdWithBuffer = Math.round((total + 15.00) * 100) / 100;
    this.setState({
      cashAppAuthorized: true,
      cashAppHoldAmount: holdWithBuffer,
      notificationMessage: `Cash App Pay hold of $${holdWithBuffer.toFixed(2)} authorized ($15 buffer for wait extensions).`,
    });
  }

  // ---------------------------------------------------------------------------
  // MULTI-STOP ITINERARY ENGINE
  // ---------------------------------------------------------------------------

  _recalculateWithStops(newStops, partial = {}) {
    const pricing = calculateEstimate({
      pickup: this.state.pickup,
      stops: newStops,
      extendedMinutes: this.state.extendedMinutes,
      overtimeMinutes: this.state.overtimeMinutes || 0,
      riders: this.state.riders,
    });
    const holdWithBuffer = Math.round((pricing.totalEstimate + 15.00) * 100) / 100;
    const curStop = newStops[this.state.currentStopIndex] || newStops[0];

    this.setState({
      stops: newStops,
      destination: curStop.name,
      category: curStop.category,
      waitMinutes: curStop.waitMinutes,
      distanceMiles: pricing.distanceMiles,
      pricing,
      cashAppHoldAmount: holdWithBuffer,
      waitTimerRemaining: (curStop.waitMinutes + this.state.extendedMinutes) * 60,
      ...partial,
    });
  }

  addStop(customData = {}) {
    if (this.state.stops.length >= 3) return;
    const nextIdx = this.state.stops.length + 1;
    const defaultSugg = nextIdx === 2
      ? { name: 'Tower Beer, Wine & Spirits (Piedmont Rd)', waitMinutes: 15, category: 'Pre-Game / Liquor Stop' }
      : { name: 'Late-Night Food: JR Crickets / Waffle House (10th St)', waitMinutes: 20, category: 'Food Stop' };

    const name = customData.name || defaultSugg.name;
    const coords = getCoordinatesForLocation(name);
    const newStop = {
      id: `stop_${Date.now()}_${nextIdx}`,
      name,
      category: customData.category || coords.category || defaultSugg.category,
      waitMinutes: Number(customData.waitMinutes) || defaultSugg.waitMinutes,
      lat: coords.lat,
      lng: coords.lng,
    };
    const newStops = [...this.state.stops, newStop];
    this._recalculateWithStops(newStops, {
      notificationMessage: `Added Stop ${newStops.length}: ${newStop.name}. Route distance and pricing updated automatically via GPS.`,
    });
  }

  removeStop(index) {
    if (this.state.stops.length <= 1) return;
    const removedName = this.state.stops[index]?.name || `Stop ${index + 1}`;
    const newStops = this.state.stops.filter((_, i) => i !== index);
    const safeIdx = Math.min(this.state.currentStopIndex, newStops.length - 1);
    this._recalculateWithStops(newStops, {
      currentStopIndex: safeIdx,
      notificationMessage: `Removed ${removedName}. Route updated.`,
    });
  }

  updateStop(index, patch) {
    if (!this.state.stops[index]) return;
    const cur = this.state.stops[index];
    let coords = { lat: cur.lat, lng: cur.lng };
    if (patch.name && patch.name !== cur.name) {
      coords = getCoordinatesForLocation(patch.name);
    }
    const updated = {
      ...cur,
      ...patch,
      lat: coords.lat,
      lng: coords.lng,
    };
    const newStops = [...this.state.stops];
    newStops[index] = updated;
    this._recalculateWithStops(newStops);
  }

  updateStopQuiet(index, patch) {
    if (!this.state.stops[index]) return;
    const cur = this.state.stops[index];
    let coords = { lat: cur.lat, lng: cur.lng };
    if (patch.name && patch.name !== cur.name) {
      coords = getCoordinatesForLocation(patch.name);
    }
    const updated = {
      ...cur,
      ...patch,
      lat: coords.lat,
      lng: coords.lng,
    };
    const newStops = [...this.state.stops];
    newStops[index] = updated;

    const pricing = calculateEstimate({
      pickup: this.state.pickup,
      stops: newStops,
      extendedMinutes: this.state.extendedMinutes,
      riders: this.state.riders,
    });
    const holdWithBuffer = Math.round((pricing.totalEstimate + 15.00) * 100) / 100;
    const curStop = newStops[this.state.currentStopIndex] || newStops[0];

    this.state = {
      ...this.state,
      stops: newStops,
      destination: curStop.name,
      category: curStop.category,
      waitMinutes: curStop.waitMinutes,
      distanceMiles: pricing.distanceMiles,
      pricing,
      cashAppHoldAmount: holdWithBuffer,
      waitTimerRemaining: (curStop.waitMinutes + this.state.extendedMinutes) * 60,
    };
    this._saveState();
  }

  updatePickup(name) {
    const coords = getCoordinatesForLocation(name);
    const pricing = calculateEstimate({
      pickup: name,
      stops: this.state.stops,
      extendedMinutes: this.state.extendedMinutes,
      riders: this.state.riders,
    });
    const holdWithBuffer = Math.round((pricing.totalEstimate + 15.00) * 100) / 100;
    this.setState({
      pickup: name,
      pickupCoords: { lat: coords.lat, lng: coords.lng },
      pricing,
      distanceMiles: pricing.distanceMiles,
      cashAppHoldAmount: holdWithBuffer,
    });
  }

  updatePickupQuiet(name) {
    const coords = getCoordinatesForLocation(name);
    const pricing = calculateEstimate({
      pickup: name,
      stops: this.state.stops,
      extendedMinutes: this.state.extendedMinutes,
      riders: this.state.riders,
    });
    const holdWithBuffer = Math.round((pricing.totalEstimate + 15.00) * 100) / 100;
    this.state = {
      ...this.state,
      pickup: name,
      pickupCoords: { lat: coords.lat, lng: coords.lng },
      pricing,
      distanceMiles: pricing.distanceMiles,
      cashAppHoldAmount: holdWithBuffer,
    };
    this._saveState();
  }

  // Update trip parameters (backwards compatibility wrapper)
  updateTripForm({ pickup, destination, waitMinutes, riders, distanceMiles, category, isCustomDestination, destinationInputMode }) {
    if (pickup !== undefined) {
      this.state.pickup = pickup;
      this.state.pickupCoords = getCoordinatesForLocation(pickup);
    }
    if (destination !== undefined) {
      this.updateStop(0, { name: destination, category, waitMinutes });
      return;
    }
    if (waitMinutes !== undefined) {
      this.updateStop(0, { waitMinutes: Number(waitMinutes) || 20 });
      return;
    }
    if (riders !== undefined) {
      this.setState({ riders: Math.max(1, Math.min(4, Number(riders) || 1)) });
    }
  }

  updateTripFormQuiet(params) {
    if (params.pickup !== undefined) {
      this.updatePickupQuiet(params.pickup);
    }
    if (params.destination !== undefined) {
      this.updateStopQuiet(0, { name: params.destination });
    }
  }

  setDestinationInputMode(mode) {
    this.setState({ destinationInputMode: mode });
  }

  // Transition to REVIEW state
  goToReview() {
    if (!this.state.pickup || !this.state.stops || this.state.stops.length === 0) return false;
    this.setState({ tripState: TRIP_STATES.REVIEW });
    return true;
  }

  // Commit booking -> simulated matching -> accepted
  confirmBooking() {
    this.setState({ tripState: TRIP_STATES.MATCHING });

    const selectedDriver = MOCK_DRIVERS.find(d => d.id === this.state.selectedDriverId) || MOCK_DRIVERS[0];

    setTimeout(() => {
      const isCash = this.state.paymentMethod === 'cash';
      const isZelle = this.state.paymentMethod === 'zelle';
      const driverName = selectedDriver.name || 'Dohntay';
      const zellePhone = selectedDriver.zelleFormatted || this.state.driverZelleFormatted || '(943) 245-2611';

      let notif = `${driverName} accepted your multi-stop wait-and-return ride!`;
      if (isCash) {
        notif = `${driverName} accepted your cash ride! Please have ${this.state.pricing.formatted.totalEstimate} ready upon boarding.`;
      } else if (isZelle) {
        notif = `${driverName} accepted your ride! Send ${this.state.pricing.formatted.totalEstimate} via Zelle to ${zellePhone}.`;
      }

      this.setState({
        tripState: TRIP_STATES.DRIVER_ACCEPTED,
        driver: selectedDriver,
        currentStopIndex: 0,
        odometerMiles: 0.0,
        cashAppAuthorized: (!isCash && !isZelle) ? this.state.cashAppAuthorized : false,
        cashAppHoldAmount: (!isCash && !isZelle) ? this.state.cashAppHoldAmount : 0.00,
        tripStartTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        notificationMessage: notif,
      });
    }, 1200);
  }

  // Advance trip state across multi-stops (Rider or Driver demo trigger)
  advanceTripState() {
    const current = this.state.tripState;
    const stops = this.state.stops || DEFAULT_STOPS;
    const curIdx = this.state.currentStopIndex || 0;
    const activeStop = stops[curIdx] || stops[0];

    switch (current) {
      case TRIP_STATES.DRIVER_ACCEPTED:
        this.setState({
          tripState: TRIP_STATES.OUTBOUND,
          notificationMessage: `En route to Stop 1 of ${stops.length} (${activeStop.name}) with ${this.state.driver.name}.`,
        });
        break;

      case TRIP_STATES.OUTBOUND: {
        const stopWaitMins = activeStop.waitMinutes || 20;
        this.state.overtimeMinutes = 0;
        this.state.overtimeSeconds = 0;
        this.state.isOvertime = false;
        this.state.gracePeriodWarning = false;
        this.state.waitTimerRemaining = (stopWaitMins + this.state.extendedMinutes) * 60;
        this._startWaitTimer(stopWaitMins);
        this.setState({
          tripState: TRIP_STATES.WAITING,
          waitTimerRemaining: (stopWaitMins + this.state.extendedMinutes) * 60,
          overtimeMinutes: 0,
          overtimeSeconds: 0,
          isOvertime: false,
          gracePeriodWarning: false,
          notificationMessage: `Arrived at Stop ${curIdx + 1} of ${stops.length} (${activeStop.name}). Your ${stopWaitMins}m wait window is active.`,
        });
        break;
      }

      case TRIP_STATES.WAITING:
      case TRIP_STATES.RIDER_READY:
        this._stopWaitTimer();
        this.state.overtimeMinutes = 0;
        this.state.overtimeSeconds = 0;
        this.state.isOvertime = false;
        this.state.gracePeriodWarning = false;
        // If there are more stops remaining, advance to next stop
        if (curIdx < stops.length - 1) {
          const nextIdx = curIdx + 1;
          const nextStop = stops[nextIdx];
          this.setState({
            currentStopIndex: nextIdx,
            tripState: TRIP_STATES.OUTBOUND,
            extendedMinutes: 0,
            overtimeMinutes: 0,
            overtimeSeconds: 0,
            isOvertime: false,
            gracePeriodWarning: false,
            notificationMessage: `Departed Stop ${curIdx + 1}. Now en route to Stop ${nextIdx + 1} of ${stops.length} (${nextStop.name}).`,
          });
        } else {
          // All stops completed! Start return leg to origin pickup
          this.setState({
            tripState: TRIP_STATES.RETURN_LEG,
            extendedMinutes: 0,
            overtimeMinutes: 0,
            overtimeSeconds: 0,
            isOvertime: false,
            gracePeriodWarning: false,
            notificationMessage: `All ${stops.length} stops complete! Heading back to origin (${this.state.pickup}) with ${this.state.driver.name}.`,
          });
        }
        break;

      case TRIP_STATES.RETURN_LEG: {
        const isCash = this.state.paymentMethod === 'cash';
        const isZelle = this.state.paymentMethod === 'zelle';
        const payout = this.state.pricing.driverPayout.totalEarnings;
        const newDriverBalance = Math.round((this.state.driverWalletBalance + payout) * 100) / 100;

        let completionNotif = `🎉 Payout sent! +$${payout.toFixed(2)} instantly deposited to ${this.state.driverCashTag} via Cash App.`;
        if (isCash) {
          completionNotif = `💵 Cash received! ${this.state.pricing.formatted.totalEstimate} collected directly in car.`;
        } else if (isZelle) {
          completionNotif = `🟣 Zelle payment verified! ${this.state.pricing.formatted.totalEstimate} received by ${this.state.driver?.name || 'pilot'} via Zelle.`;
        }

        this.setState({
          tripState: TRIP_STATES.COMPLETED,
          tripCompletedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          driverWalletBalance: newDriverBalance,
          notificationMessage: completionNotif,
        });
        break;
      }

      default:
        break;
    }
  }

  // Rider action: "I'm ready for next stop / ready to return"
  markRiderReady() {
    if (this.state.tripState !== TRIP_STATES.WAITING) return;
    const curIdx = this.state.currentStopIndex || 0;
    const totalStops = this.state.stops.length;
    const isFinal = curIdx >= totalStops - 1;

    this.setState({
      tripState: TRIP_STATES.RIDER_READY,
      notificationMessage: isFinal 
        ? 'Driver notified that you are ready to head back to origin!'
        : `Driver notified that you are ready for Stop ${curIdx + 2} of ${totalStops}!`,
    });
  }

  // Extend wait window by +10 or +15 minutes
  extendWait(minutes = 10) {
    const additional = Number(minutes) || 10;
    const newExtended = this.state.extendedMinutes + additional;

    // Reset overtime upon extension if currently in overtime or grace warning
    this.state.isOvertime = false;
    this.state.gracePeriodWarning = false;
    this.state.overtimeMinutes = 0;
    this.state.overtimeSeconds = 0;

    const pricing = calculateEstimate({
      pickup: this.state.pickup,
      stops: this.state.stops,
      extendedMinutes: newExtended,
      overtimeMinutes: 0,
      riders: this.state.riders,
    });

    const holdWithBuffer = Math.round((pricing.totalEstimate + 15.00) * 100) / 100;
    const newRemaining = Math.max(0, this.state.waitTimerRemaining) + (additional * 60);

    this.setState({
      extendedMinutes: newExtended,
      waitTimerRemaining: newRemaining,
      isOvertime: false,
      gracePeriodWarning: false,
      overtimeMinutes: 0,
      overtimeSeconds: 0,
      pricing,
      cashAppHoldAmount: holdWithBuffer,
      notificationMessage: `Wait window extended by ${additional} min (+$${(additional * pricing.waitRatePerMin).toFixed(2)} at standard $0.35/min rate).`,
    });
  }

  // Add tip via Cash App or Zelle
  addTip(amount) {
    const tip = Number(amount) || 0;
    const newDriverBalance = Math.round((this.state.driverWalletBalance + tip) * 100) / 100;
    const isZelle = this.state.paymentMethod === 'zelle';
    const isCash = this.state.paymentMethod === 'cash';

    let tipNotif = `💚 +$${tip.toFixed(2)} tip sent directly to ${this.state.driverCashTag} via Cash App!`;
    if (isZelle) {
      tipNotif = `🟣 +$${tip.toFixed(2)} tip sent directly to ${this.state.driver?.name || 'pilot'} via Zelle (${this.state.driverZelleFormatted || '(943) 245-2611'})!`;
    } else if (isCash) {
      tipNotif = `💵 +$${tip.toFixed(2)} tip handed in cash directly to driver!`;
    }

    this.setState({
      tipAmount: tip,
      driverWalletBalance: newDriverBalance,
      notificationMessage: tipNotif,
    });
  }

  // Timer helpers for the WAITING state
  _startWaitTimer(durationMinutes = 20) {
    this._stopWaitTimer();
    this.state.waitTimerActive = true;

    this.timerInterval = setInterval(() => {
      if (this.state.tripState !== TRIP_STATES.WAITING && this.state.tripState !== TRIP_STATES.RIDER_READY) {
        this._stopWaitTimer();
        return;
      }

      if (this.state.waitTimerRemaining > 0) {
        this.state.waitTimerRemaining -= 1;
        this.state.isOvertime = false;

        // 3-minute grace period warning (<= 180 seconds)
        if (this.state.waitTimerRemaining <= 180) {
          this.state.gracePeriodWarning = true;
          this.state.gracePeriodSecondsLeft = this.state.waitTimerRemaining;
        } else {
          this.state.gracePeriodWarning = false;
        }

        if (this.state.waitTimerRemaining % 5 === 0) {
          this._saveState();
          this.syncToRemote();
        }
        this.listeners.forEach((listener) => listener(this.state));
      } else {
        // OVERTIME PHASE! Reserved wait timer expired, now ticking into overtime
        this.state.gracePeriodWarning = false;
        this.state.isOvertime = true;
        this.state.overtimeSeconds = (this.state.overtimeSeconds || 0) + 1;

        const otMins = Math.ceil(this.state.overtimeSeconds / 60);
        if (otMins !== this.state.overtimeMinutes) {
          this.state.overtimeMinutes = otMins;
          this.state.pricing = calculateEstimate({
            pickup: this.state.pickup,
            stops: this.state.stops,
            extendedMinutes: this.state.extendedMinutes,
            overtimeMinutes: this.state.overtimeMinutes,
            riders: this.state.riders,
          });
        }

        if (this.state.overtimeSeconds % 5 === 0) {
          this._saveState();
          this.syncToRemote();
        }
        this.listeners.forEach((listener) => listener(this.state));
      }
    }, 1000);
  }

  _stopWaitTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.state.waitTimerActive = false;
  }

  // Reset demo to start another trip
  resetTrip() {
    this._stopWaitTimer();
    this.setState({
      tripState: TRIP_STATES.IDLE,
      currentStopIndex: 0,
      odometerMiles: 0.0,
      extendedMinutes: 0,
      overtimeMinutes: 0,
      overtimeSeconds: 0,
      isOvertime: false,
      gracePeriodWarning: false,
      cashAppAuthorized: false,
      tipAmount: 0,
      pricing: calculateEstimate({
        pickup: this.state.pickup,
        stops: this.state.stops,
        extendedMinutes: 0,
        overtimeMinutes: 0,
        riders: this.state.riders,
      }),
      notificationMessage: null,
      tripStartTime: null,
      tripCompletedTime: null,
    });
  }

  clearNotification() {
    this.setState({ notificationMessage: null });
  }
}

export const store = new Store();
