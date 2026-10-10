/**
 * Live GPS Telemetry & Screen Wake Lock Service
 * Connects browser Geolocation API with real-time driver coordinate streaming.
 */

import { store } from './store.js';

class TelemetryService {
  constructor() {
    this.watchId = null;
    this.wakeLock = null;
    this.isTracking = false;
    this.simTimer = null;
  }

  /**
   * Request Screen Wake Lock so driver phone never dims on dashboard mount
   */
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        store.setState({ wakeLockActive: true });
        this.wakeLock.addEventListener('release', () => {
          store.setState({ wakeLockActive: false });
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
    return false;
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
      store.setState({ wakeLockActive: false });
    }
  }

  /**
   * Start live GPS tracking via HTML5 Geolocation API
   */
  startLiveGPS() {
    if (this.isTracking) return;

    if (!('geolocation' in navigator)) {
      console.warn('Geolocation not supported by this browser. Using simulation fallback.');
      this.startSimulatedGPS();
      return;
    }

    this.requestWakeLock();
    this.isTracking = true;
    store.setState({ gpsActive: true, isSimulatedGPS: false });

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed !== null ? Math.round(pos.coords.speed * 2.23694) : 0, // mph
          heading: pos.coords.heading || 0,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: new Date().toLocaleTimeString(),
        };
        store.updateDriverGPS(coords);
        this._broadcastTelemetry(coords);
      },
      (err) => {
        console.warn('Live GPS watch error (falling back to Atlanta road simulation):', err.message);
        store.setState({ gpsActive: false });
        this.startSimulatedGPS();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  }

  _broadcastTelemetry(coords) {
    if (typeof fetch !== 'undefined' && store.getState().activeMode === 'driver') {
      fetch('/api/driver/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      }).catch(() => {});
    }
  }

  stopLiveGPS() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.stopSimulatedGPS();
    this.releaseWakeLock();
    this.isTracking = false;
    store.setState({ gpsActive: false });
  }

  /**
   * Realistic Atlanta Nightlife Street GPS Simulator (for desktop testing or pilot demos)
   */
  startSimulatedGPS() {
    this.stopSimulatedGPS();
    store.setState({ gpsActive: true, isSimulatedGPS: true });

    let step = 0;
    const state = store.getState();
    const startLat = state.driver?.lat || 33.7815;
    const startLng = state.driver?.lng || -84.3830;
    
    // Find target destination coordinates
    const targetLat = 33.8507;
    const targetLng = -84.3625;

    this.simTimer = setInterval(() => {
      step = (step + 1) % 40;
      const progress = step / 40;
      const currentLat = startLat + (targetLat - startLat) * progress + (Math.sin(step) * 0.0003);
      const currentLng = startLng + (targetLng - startLng) * progress + (Math.cos(step) * 0.0003);

      const coords = {
        lat: Number(currentLat.toFixed(5)),
        lng: Number(currentLng.toFixed(5)),
        speed: Math.floor(22 + Math.random() * 12), // 22-34 mph Midtown traffic speed
        heading: Math.floor(progress * 360),
        accuracy: 4,
        timestamp: new Date().toLocaleTimeString(),
      };
      store.updateDriverGPS(coords);
      this._broadcastTelemetry(coords);
    }, 2000);
  }

  stopSimulatedGPS() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  /**
   * Generate turn-by-turn navigation deep links
   */
  getNavigationLinks(destLat, destLng, destName) {
    const safeLat = destLat || 33.8507;
    const safeLng = destLng || -84.3625;
    const encodedName = encodeURIComponent(destName || 'Destination');

    return {
      appleMaps: `https://maps.apple.com/?daddr=${safeLat},${safeLng}&dirflg=d&t=m`,
      googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${safeLat},${safeLng}&travelmode=driving`,
      waze: `https://waze.com/ul?ll=${safeLat},${safeLng}&navigate=yes`,
    };
  }
}

export const telemetry = new TelemetryService();
