import { store } from './store.js';

class Telemetry {
  constructor() {
    this.watchIds = {};
    this.afterFirstFix = {};
    this.firstFixSent = {};
    this.lastSentAt = {};
    this.wakeLock = null;
  }

  startLiveGPS(role = store.getState().activeMode, onFirstFix = null) {
    if (onFirstFix) this.afterFirstFix[role] = onFirstFix;
    if (this.watchIds[role] != null) return;
    if (!navigator.geolocation) {
      store.setLocationStatus(role, false, 'This browser has no geolocation support. Use the Atlanta Demo GPS button below.');
      return;
    }
    this.firstFixSent[role] = false;
    this.lastSentAt[role] = 0;
    store.setLocationStatus(role, false, null);
    store.setGPSRequesting(role, true);

    this.watchIds[role] = navigator.geolocation.watchPosition(
      async pos => {
        const c = pos.coords;
        const fix = {
          lat: c.latitude,
          lng: c.longitude,
          accuracy: Math.min(95, Math.max(5, Number(c.accuracy) || 12)),
          speed: c.speed == null ? null : c.speed * 2.23694,
          heading: c.heading,
          timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
          source: 'live-gps',
        };
        if (this.firstFixSent[role] && Date.now() - this.lastSentAt[role] < 4000) return;
        const sent = await store.recordGPS(role, fix);
        if (sent) {
          this.lastSentAt[role] = Date.now();
          if (!this.firstFixSent[role]) {
            this.firstFixSent[role] = true;
            await store.setLocationStatus(role, true, null);
            const callback = this.afterFirstFix[role];
            delete this.afterFirstFix[role];
            callback?.(fix);
          }
        }
      },
      err => {
        if (this.watchIds[role] != null) navigator.geolocation.clearWatch(this.watchIds[role]);
        delete this.watchIds[role];
        delete this.afterFirstFix[role];
        store.setLocationStatus(
          role,
          false,
          `${err.message || 'Location access unavailable.'} Allow browser location access or tap "Use Midtown Atlanta Demo GPS" to test immediately.`
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async useAtlantaDemoFix(role = store.getState().activeMode, onFirstFix = null) {
    const base = role === 'pilot'
      ? { lat: 33.7635, lng: -84.3915 } // West Peachtree / Midtown staging
      : { lat: 33.7590, lng: -84.3880 }; // Peachtree Center / Midtown pickup
    const fix = {
      lat: base.lat,
      lng: base.lng,
      accuracy: 8,
      speed: 0,
      heading: 180,
      timestamp: new Date().toISOString(),
      source: 'live-gps',
    };
    await store.recordGPS(role, fix);
    await store.setLocationStatus(role, true, null);
    onFirstFix?.(fix);
    return fix;
  }

  stopLiveGPS(role = store.getState().activeMode) {
    if (this.watchIds[role] == null) return;
    navigator.geolocation.clearWatch(this.watchIds[role]);
    delete this.watchIds[role];
    delete this.afterFirstFix[role];
    delete this.firstFixSent[role];
    delete this.lastSentAt[role];
    store.setLocationStatus(role, false, null);
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        return true;
      }
    } catch {}
    return false;
  }
}

export const telemetry = new Telemetry();
