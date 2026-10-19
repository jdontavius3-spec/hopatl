import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiveMap from '../components/LiveMap';

const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL || 'https://hopatl.com';
const API_KEY = 'trickhopper-api-base';
const tokenKey = role => `trickhopper-${role}-token`;
const colors = {
  bg: '#100719',
  card: '#1a0e25',
  line: '#48204c',
  pink: '#ff2e9a',
  purple: '#bc4cff',
  text: '#f8f2ff',
  muted: '#b7a6c7',
  green: '#20d4a0',
  gold: '#ffbd42',
  red: '#ff7079',
};

const QUICK_SPOTS = [
  'Magic City, Atlanta, GA',
  'Ponce City Market, Atlanta, GA',
  'Waffle House (Midtown), Atlanta, GA',
];

/** @param {string} apiBase @param {string} path @param {{method?: string, body?: object, token?: string}} options */
async function request(apiBase, path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-TRICKHOPPER-CLIENT': 'native',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

const toFix = location => ({
  lat: location.coords.latitude,
  lng: location.coords.longitude,
  accuracy: Math.min(location.coords.accuracy ?? 999, 999),
  speed: location.coords.speed,
  heading: location.coords.heading,
});
const fmtMoney = cents =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
const fmtCoords = location =>
  location
    ? `${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)} · ±${Math.round(location.accuracy || 8)} m`
    : 'Waiting for a location fix';

const STAGES = {
  IDLE: 'Ready for a ride request',
  REQUESTED: 'Waiting for pilot acceptance',
  EN_ROUTE: 'Pilot en route to pickup',
  WAITING_PICKUP: 'Pilot at pickup · shared wait running',
  ACTIVE: 'Ride in progress',
  WAITING_HOP: 'At a stop · reserved wait running',
  WAITING_RETURN: 'At final stop · reserved wait running',
  RETURNING: 'Return leg in progress',
  COMPLETED: 'Round trip completed',
};

const actionFor = trip => {
  const st = trip?.tripState;
  const hopNum = (Number(trip?.stopIndex) || 0) + 1;
  return (
    {
      EN_ROUTE: ['arrive_pickup', '📍 Arrived at pickup · start pickup timer'],
      WAITING_PICKUP: ['start_outbound', '🚀 Rider boarded · start outbound route'],
      ACTIVE: ['arrive_stop', `🅿️ Record arrival at Hop ${hopNum} · start standby`],
      WAITING_HOP: ['start_next_hop', `➡️ Depart Hop ${hopNum} · continue to Hop ${hopNum + 1}`],
      WAITING_RETURN: ['start_return', '↩️ Rider boarded · start return leg to pickup'],
    }[st] || null
  );
};

function Button({ children, onPress, disabled = false, secondary = false, compact = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        compact && styles.buttonCompact,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

function KeepSessionAwake() {
  useKeepAwake('trickhopper-live-session');
  return null;
}

export default function HomeScreen() {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [role, setRole] = useState(null);
  const [token, setToken] = useState(null);
  const [trip, setTrip] = useState(null);
  const [shared, setShared] = useState(null);
  const [pilotRequest, setPilotRequest] = useState(null);
  const [fix, setFix] = useState(null);
  const [gpsMessage, setGpsMessage] = useState('Location permission has not been requested.');
  const [connection, setConnection] = useState('Connected to hopatl.com');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [places, setPlaces] = useState([
    { query: '', waitMinutes: 30, addressId: null, selectedLabel: '', coords: null, options: [], searching: false, searchedQuery: '' },
  ]);
  const [quote, setQuote] = useState(null);
  const [passengerCount, setPassengerCount] = useState(2);
  const [holdDeposit, setHoldDeposit] = useState(true);
  const [riderPhone, setRiderPhone] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const fixRef = useRef(null);
  const lastSentAt = useRef(0);
  const polling = useRef(false);

  useEffect(() => {
    SecureStore.getItemAsync(API_KEY)
      .then(value => value && setApiBase(value))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!role) return undefined;
    let active = true;
    let subscription;
    const publishLocation = position => {
      if (!active) return;
      const current = toFix(position);
      fixRef.current = current;
      setFix(current);
      setGpsMessage(`Live phone GPS · ${new Date().toLocaleTimeString()}`);
      if (token && Date.now() - lastSentAt.current >= 3000) {
        lastSentAt.current = Date.now();
        request(apiBase, '/api/telemetry/location', { method: 'POST', token, body: { ...current, role } })
          .then(result => {
            if (active && result.shared) setShared(result.shared);
          })
          .catch(problem => {
            if (active && !/not accepting locations/i.test(problem.message)) setGpsMessage(problem.message);
          });
      }
    };
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          setGpsMessage('Location permission is off. Enable it or tap Midtown Demo GPS below.');
          return;
        }
        setGpsMessage('Getting a fresh GPS fix from this phone…');
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2500, distanceInterval: 3 },
          publishLocation,
          message => setGpsMessage(String(message))
        );
        const first = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: true }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('GPS is taking longer than expected. Retry or use Midtown Demo GPS.')), 20000)
          ),
        ]);
        publishLocation(first);
      } catch (problem) {
        if (active && !fixRef.current)
          setGpsMessage(problem?.message || 'Phone could not get a GPS fix. Use Midtown Demo GPS or retry.');
      }
    })();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [role, token, apiBase, gpsAttempt]);

  const useDemoGps = () => {
    const demoFix = {
      lat: role === 'pilot' ? 33.7812 : 33.7845,
      lng: role === 'pilot' ? -84.3865 : -84.3832,
      accuracy: 8,
      speed: 0,
      heading: 0,
    };
    fixRef.current = demoFix;
    setFix(demoFix);
    setGpsMessage('Midtown Atlanta Demo GPS active');
  };

  const refresh = useCallback(async () => {
    if (!role || polling.current) return;
    polling.current = true;
    try {
      if (token) {
        const data = await request(apiBase, '/api/trip/state', { token });
        setTrip(data.state || null);
        setShared(data.shared || null);
        setPilotRequest(null);
      } else if (role === 'pilot') {
        const data = await request(apiBase, '/api/driver/request');
        setPilotRequest(data);
        if (data.tripState === 'REQUESTED') {
          setTrip({
            tripState: 'REQUESTED',
            tripId: data.tripId,
            destination: data.destination,
            passengerCount: data.passengerCount,
            routeQuote: data.routeQuote,
          });
        } else {
          setTrip(null);
        }
      } else {
        setTrip(null);
        setShared(null);
      }
    } catch (problem) {
      if (/credential|required|expired/i.test(problem.message) && token) {
        await SecureStore.deleteItemAsync(tokenKey(role)).catch(() => {});
        setToken(null);
        setTrip(null);
      }
      setError(problem.message);
    } finally {
      polling.current = false;
    }
  }, [apiBase, role, token]);

  useEffect(() => {
    if (!role) return undefined;
    const initialSync = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 2500);
    return () => {
      clearTimeout(initialSync);
      clearInterval(timer);
    };
  }, [role, refresh]);

  useEffect(() => {
    if (!role || !token || trip?.tripState === 'COMPLETED') return undefined;
    request(apiBase, '/api/telemetry/status', { method: 'POST', token, body: { role, active: true } }).catch(() => {});
    return undefined;
  }, [apiBase, role, token, trip?.tripState]);

  useEffect(() => {
    const timers = [];
    places.forEach((place, index) => {
      const query = place.query.trim();
      if (query.length < 2 || place.searching || place.searchedQuery === query || place.addressId) return;
      const timer = setTimeout(async () => {
        setPlaces(items =>
          items.map((item, at) => (at === index && item.query.trim() === query ? { ...item, searching: true } : item))
        );
        try {
          const data = await request(apiBase, '/api/address/suggest', { method: 'POST', body: { query } });
          setPlaces(items =>
            items.map((item, at) =>
              at === index && item.query.trim() === query
                ? { ...item, searching: false, searchedQuery: query, options: data.results || [] }
                : item
            )
          );
        } catch (problem) {
          setPlaces(items =>
            items.map((item, at) =>
              at === index && item.query.trim() === query
                ? { ...item, searching: false, searchedQuery: query, options: [] }
                : item
            )
          );
          setError(problem.message);
        }
      }, 450);
      timers.push(timer);
    });
    return () => timers.forEach(clearTimeout);
  }, [apiBase, places]);

  const selectRole = async nextRole => {
    setError('');
    setRole(nextRole);
    setTrip(null);
    setShared(null);
    setPilotRequest(null);
    setQuote(null);
    const saved = await SecureStore.getItemAsync(tokenKey(nextRole)).catch(() => null);
    setToken(saved || null);
  };

  const retryGps = () => {
    fixRef.current = null;
    setFix(null);
    setGpsMessage('Retrying phone GPS…');
    setGpsAttempt(value => value + 1);
  };

  const setPlace = (index, patch) => {
    setQuote(null);
    setPlaces(current => current.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  };

  const checkConnection = async () => {
    setWorking(true);
    setError('');
    try {
      const data = await request(apiBase, '/api/health');
      setConnection(`${data.mode} · ${data.addressSearchProvider || 'API online'}`);
      await SecureStore.setItemAsync(API_KEY, apiBase.trim());
    } catch (problem) {
      setConnection('Connection failed');
      setError(problem.message);
    } finally {
      setWorking(false);
    }
  };

  const makeQuote = async () => {
    setWorking(true);
    setError('');
    try {
      if (!fixRef.current) throw new Error('Set your GPS pickup first (or tap Midtown Atlanta Demo GPS).');
      if (places.some(item => item.query.trim().length < 4))
        throw new Error('Enter an Atlanta venue or street address for each hop.');
      const data = await request(apiBase, '/api/route/quote', {
        method: 'POST',
        body: {
          pickup: { lat: fixRef.current.lat, lng: fixRef.current.lng },
          stops: places.map(item => ({
            destination: item.query.trim(),
            addressId: item.addressId,
            coords: item.coords,
            waitMinutes: item.waitMinutes,
          })),
        },
      });
      setQuote(data.quote);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setWorking(false);
    }
  };

  const createRide = async (launchAutoPilot = false) => {
    setWorking(true);
    setError('');
    try {
      if (!quote?.quoteId || !fixRef.current) throw new Error('Get a fresh route estimate before requesting a ride.');
      const data = await request(apiBase, '/api/trip/create', {
        method: 'POST',
        body: {
          quoteId: quote.quoteId,
          initialFix: fixRef.current,
          passengerCount,
          holdDeposit,
          riderPhone: riderPhone.trim() || undefined,
        },
      });
      await SecureStore.setItemAsync(tokenKey('rider'), data.riderToken);
      setRole('rider');
      setToken(data.riderToken);
      setTrip(data.state);
      setShared(data.shared);
      setQuote(null);
      if (launchAutoPilot) {
        const sim = await request(apiBase, '/api/demo/auto-pilot', {
          method: 'POST',
          token: data.riderToken,
          body: { action: 'start', autoAdvance: true, intervalMs: 5000 },
        });
        setTrip(sim.state);
        setShared(sim.shared);
      }
    } catch (problem) {
      setError(problem.message);
    } finally {
      setWorking(false);
    }
  };

  const acceptRide = async () => {
    setWorking(true);
    setError('');
    try {
      if (!fixRef.current) throw new Error('Pilot needs a fresh phone GPS fix (or Midtown Demo GPS) before accepting.');
      const data = await request(apiBase, '/api/trip/claim', {
        method: 'POST',
        body: {
          tripId: pilotRequest?.tripId || null,
          initialFix: fixRef.current,
          pilotName: 'Dohntay (Mobile Pilot)',
          pilotVehicle: 'Black Cadillac Escalade ESV',
          pilotPlate: 'ATL-HOP1',
        },
      });
      await SecureStore.setItemAsync(tokenKey('pilot'), data.pilotToken);
      setToken(data.pilotToken);
      setTrip(data.state);
      setShared(data.shared);
      setPilotRequest(null);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setWorking(false);
    }
  };

  const pilotAction = async action => {
    setWorking(true);
    setError('');
    try {
      const data =
        action === 'complete'
          ? await request(apiBase, '/api/trip/state', { method: 'POST', token, body: { tripState: 'COMPLETED' } })
          : await request(apiBase, '/api/trip/wait-event', { method: 'POST', token, body: { action } });
      setTrip(data.state);
      setShared(data.shared);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setWorking(false);
    }
  };

  const runTripCommand = async (path, body) => {
    setWorking(true);
    setError('');
    try {
      const data = await request(apiBase, path, { method: 'POST', token, body });
      setTrip(data.state);
      setShared(data.shared);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setWorking(false);
    }
  };

  const leaveRole = () => {
    fixRef.current = null;
    setRole(null);
    setToken(null);
    setTrip(null);
    setShared(null);
    setPilotRequest(null);
    setFix(null);
    setRiderPhone('');
    setGpsMessage('Location permission has not been requested.');
    setError('');
  };

  const clearCompleted = async () => {
    if (token) {
      await request(apiBase, '/api/trip/reset', { method: 'POST', token, body: {} }).catch(() => {});
    }
    if (role) await SecureStore.deleteItemAsync(tokenKey(role)).catch(() => {});
    leaveRole();
  };

  const destinationCount = places.length;
  const action = actionFor(trip);
  const inStopWait = ['WAITING_HOP', 'WAITING_RETURN'].includes(trip?.tripState);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}>
          <View>
            <Text style={styles.brand}>TRICKHOPPER</Text>
            <Text style={styles.kicker}>ATLANTA NIGHTLIFE · MULTI-HOP ROUNDTRIPS</Text>
          </View>
          {role ? (
            <Pressable onPress={leaveRole} style={styles.switch}>
              <Text style={styles.switchText}>Change portal</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.apiCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.eyebrow}>TRIP SERVICE</Text>
            <Pressable onPress={() => setShowSettings(value => !value)}>
              <Text style={styles.switchText}>{showSettings ? 'Hide' : 'Server settings'}</Text>
            </Pressable>
          </View>
          {showSettings ? (
            <>
              <TextInput
                value={apiBase}
                onChangeText={setApiBase}
                autoCapitalize="none"
                keyboardType="url"
                style={styles.input}
                placeholder="https://hopatl.com"
                placeholderTextColor={colors.muted}
              />
              <Button compact secondary disabled={working} onPress={checkConnection}>
                {working ? 'Checking…' : 'Check connection'}
              </Button>
            </>
          ) : (
            <Text style={styles.small}>
              {connection} · {apiBase.replace(/^https?:\/\//, '')}
            </Text>
          )}
        </View>

        {!role ? (
          <>
            <Text style={styles.title}>Hop All Night. Never Lose Your Ride.</Text>
            <Text style={styles.copy}>
              Reserve one dedicated pilot across up to 3 Atlanta nightlife stops with 15, 30, or 60-minute standby blocks,
              50% upfront retainer protection, and zero 2 AM surge.
            </Text>
            <Button onPress={() => selectRole('rider')}>Rider · Book a Multi-Hop Roundtrip</Button>
            <Button secondary onPress={() => selectRole('pilot')}>
              Pilot · Open Fleet Queue Console
            </Button>
            <Button compact secondary disabled={working} onPress={checkConnection}>
              {working ? 'Checking…' : 'Check hopatl.com connection'}
            </Button>
          </>
        ) : (
          <>
            <KeepSessionAwake />
            <View style={styles.statusCard}>
              <Text style={styles.eyebrow}>
                {role === 'rider' ? 'RIDER PORTAL' : 'PILOT PORTAL'} · {trip?.simulationMode ? 'AUTO-PILOT DEMO' : 'LIVE GPS'}
              </Text>
              <Text style={styles.titleSmall}>
                {trip?.tripState
                  ? STAGES[trip.tripState] || trip.tripState
                  : role === 'pilot'
                    ? 'Listening for open fleet requests'
                    : 'Plan your Atlanta nightlife loop'}
              </Text>
              <Text style={styles.copySmall}>{gpsMessage}</Text>
              {fix ? <Text style={styles.coords}>{fmtCoords(fix)}</Text> : null}
              <View style={styles.waitRow}>
                <Button compact secondary onPress={useDemoGps}>
                  ⚡ Use Midtown Demo GPS
                </Button>
                {!fix ? (
                  <Button compact secondary onPress={retryGps}>
                    Retry Phone GPS
                  </Button>
                ) : null}
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {role === 'rider' && !token && (!trip || trip.tripState === 'COMPLETED') ? (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Nightlife Itinerary (Up to 3 Hops)</Text>
                  <Text style={styles.small}>{destinationCount} of 3</Text>
                </View>
                {places.map((place, index) => (
                  <View key={index} style={styles.stopCard}>
                    <Text style={styles.label}>HOP {index + 1} · VENUE OR ADDRESS</Text>
                    <TextInput
                      value={place.query}
                      onChangeText={value =>
                        setPlace(index, { query: value, addressId: null, selectedLabel: '', coords: null, options: [], searchedQuery: '' })
                      }
                      style={styles.input}
                      placeholder="e.g. Magic City, Ponce City Market, Waffle House"
                      placeholderTextColor={colors.muted}
                      autoCorrect={false}
                    />
                    <View style={styles.waitRow}>
                      {QUICK_SPOTS.map(spot => (
                        <Pressable
                          key={spot}
                          onPress={() => setPlace(index, { query: spot, addressId: spot, selectedLabel: spot, options: [] })}
                          style={styles.waitButton}
                        >
                          <Text style={styles.small}>{spot.split(',')[0]}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {place.searching ? <Text style={styles.small}>Searching Atlanta Gazetteer…</Text> : null}
                    {place.options.length ? (
                      <View style={styles.options}>
                        {place.options.map(option => (
                          <Pressable
                            key={option.id}
                            onPress={() =>
                              setPlace(index, {
                                query: option.label,
                                addressId: option.id,
                                selectedLabel: option.label,
                                coords: { lat: option.lat, lng: option.lng, label: option.label },
                                options: [],
                              })
                            }
                            style={styles.option}
                          >
                            <Text style={styles.optionText}>{option.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <Text style={styles.label}>RESERVED PILOT STANDBY WINDOW</Text>
                    <View style={styles.waitRow}>
                      {[
                        [15, '15m ($6)'],
                        [30, '30m ($12)'],
                        [60, '60m ($22)'],
                      ].map(([minutes, label]) => (
                        <Pressable
                          key={minutes}
                          onPress={() => setPlace(index, { waitMinutes: minutes })}
                          style={[styles.waitButton, place.waitMinutes === minutes && styles.waitActive]}
                        >
                          <Text style={styles.waitText}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {places.length > 1 ? (
                      <Pressable onPress={() => setPlaces(current => current.filter((_, at) => at !== index))}>
                        <Text style={styles.remove}>Remove Hop</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {places.length < 3 ? (
                  <Button
                    compact
                    secondary
                    onPress={() =>
                      setPlaces(current => [
                        ...current,
                        { query: '', waitMinutes: 15, addressId: null, selectedLabel: '', coords: null, options: [], searching: false, searchedQuery: '' },
                      ])
                    }
                  >
                    + Add Another Nightlife Hop
                  </Button>
                ) : null}

                <Text style={styles.sectionTitle}>Passengers (Split Fare)</Text>
                <View style={styles.waitRow}>
                  {[1, 2, 3, 4].map(count => (
                    <Pressable
                      key={count}
                      onPress={() => setPassengerCount(count)}
                      style={[styles.waitButton, passengerCount === count && styles.waitActive]}
                    >
                      <Text style={styles.waitText}>{count}</Text>
                    </Pressable>
                  ))}
                </View>

                {quote ? (
                  <View style={styles.fareCard}>
                    <Text style={styles.eyebrow}>UPFRONT ROUNDTRIP RETAINER · ZERO SURGE</Text>
                    <Text style={styles.fare}>{fmtMoney(quote.fare?.totalCents)}</Text>
                    <Text style={styles.copySmall}>
                      {Number(quote.route?.totalDistanceMiles || 0).toFixed(1)} road miles · {quote.waitMinutes} min reserved standby ·{' '}
                      {fmtMoney(Math.round((quote.fare?.totalCents || 0) / passengerCount))}/person
                    </Text>
                    <Text style={styles.coords}>
                      50% Upfront Deposit Hold: {fmtMoney(quote.fare?.upfrontDepositCents)} · Completion Balance:{' '}
                      {fmtMoney(quote.fare?.completionBalanceCents)}
                    </Text>
                    <Pressable onPress={() => setHoldDeposit(v => !v)} style={{ marginVertical: 8 }}>
                      <Text style={styles.copySmall}>
                        {holdDeposit ? '☑' : '□'} Lock 50% Upfront Retainer Deposit in Demo Ledger
                      </Text>
                    </Pressable>
                    <Button disabled={working || !fix} onPress={() => createRide(true)}>
                      {working ? 'Starting…' : '⚡ Request & Launch Auto-Pilot Demo'}
                    </Button>
                    <Button secondary disabled={working || !fix} onPress={() => createRide(false)}>
                      📡 Send to Live Pilot Queue (/driver)
                    </Button>
                  </View>
                ) : (
                  <Button disabled={working || !fix} onPress={makeQuote}>
                    {working ? 'Calculating Atlanta road route…' : 'Calculate Upfront Round-Trip Estimate'}
                  </Button>
                )}
              </>
            ) : null}

            {role === 'pilot' && !token && pilotRequest?.pending ? (
              <View style={styles.requestCard}>
                <Text style={styles.eyebrow}>
                  OPEN FLEET QUEUE ({pilotRequest.openRequests?.length || 1} ACTIVE) · {pilotRequest.passengerCount} PASSENGER(S)
                </Text>
                <Text style={styles.titleSmall}>{trip?.destination?.label || 'Multi-Hop Roundtrip Request'}</Text>
                <Text style={styles.copySmall}>
                  {Number(pilotRequest.routeQuote?.route?.totalDistanceMiles || 0).toFixed(1)} mi ·{' '}
                  {pilotRequest.routeQuote?.waitMinutes || 0} min standby · 50% Deposit:{' '}
                  {fmtMoney(pilotRequest.routeQuote?.fare?.upfrontDepositCents)}
                </Text>
                <Text style={styles.fare}>{fmtMoney(pilotRequest.routeQuote?.fare?.totalCents)}</Text>
                <Button disabled={working || !fix} onPress={acceptRide}>
                  {working ? 'Connecting…' : 'Accept Request & Connect Portals'}
                </Button>
              </View>
            ) : null}

            {trip?.tripState && trip.tripState !== 'COMPLETED' ? (
              <>
                <View style={styles.tripCard}>
                  <Text style={styles.eyebrow}>
                    SHARED TRIP STATUS · {trip.boardingPin ? `RE-BOARDING PIN: ${trip.boardingPin}${trip.boardingPinVerified ? ' ✓' : ''}` : ''}
                  </Text>
                  <Text style={styles.titleSmall}>{STAGES[trip.tripState] || trip.tripState}</Text>
                  <Text style={styles.copySmall}>{trip.notificationMessage || 'Synchronized across Rider and Pilot portals.'}</Text>
                  {trip.acceptedPilotName ? (
                    <Text style={styles.coords}>
                      Pilot: {trip.acceptedPilotName} · {trip.acceptedPilotVehicle} · Plate {trip.acceptedPilotPlate || 'ATL-HOP1'}
                    </Text>
                  ) : null}
                  {trip.routeQuote ? (
                    <>
                      <Text style={styles.label}>MULTI-HOP ITINERARY</Text>
                      {(trip.routeQuote.hops || []).map((hop, index) => (
                        <Text key={index} style={styles.copySmall}>
                          Hop {index + 1}: {hop.destination?.label || hop.destination?.query} · {hop.waitMinutes} min standby
                        </Text>
                      ))}
                      <Text style={styles.small}>
                        Total Retainer: {fmtMoney(trip.routeQuote.fare?.totalCents)} · 50% Deposit: {trip.depositStatus}
                      </Text>
                    </>
                  ) : null}

                  <View style={styles.waitRow}>
                    <Button
                      compact
                      secondary
                      disabled={working}
                      onPress={() => runTripCommand('/api/demo/auto-pilot', { action: 'step' })}
                    >
                      ⏭ Advance Auto-Pilot Stage
                    </Button>
                    {trip.boardingPin && !trip.boardingPinVerified ? (
                      <Button
                        compact
                        secondary
                        disabled={working}
                        onPress={() => runTripCommand('/api/trip/cabin-items', { action: 'verify_pin', pin: trip.boardingPin })}
                      >
                        🔐 Verify PIN ({trip.boardingPin})
                      </Button>
                    ) : null}
                  </View>

                  {inStopWait ? (
                    <View style={styles.waitRow}>
                      <Button
                        compact
                        disabled={working}
                        onPress={() => runTripCommand('/api/trip/ping', { code: 'SUMMON_CURB' })}
                      >
                        🚨 Summon Pilot to Curb
                      </Button>
                      <Button
                        compact
                        secondary
                        disabled={working}
                        onPress={() => runTripCommand('/api/trip/extend-wait', { addMinutes: 15 })}
                      >
                        ⏱ +15m Standby
                      </Button>
                    </View>
                  ) : null}

                  <Text style={styles.label}>VIP CABIN SAFE-HOLD (BELONGINGS IN SUV)</Text>
                  <View style={styles.waitRow}>
                    {['Coat / Jacket', 'Heels / Shoes', 'VIP Bag'].map(itemLabel => (
                      <Pressable
                        key={itemLabel}
                        onPress={() => runTripCommand('/api/trip/cabin-items', { action: 'add', label: itemLabel })}
                        style={styles.waitButton}
                      >
                        <Text style={styles.small}>+ {itemLabel}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {(trip.cabinItems || []).map(it => (
                    <Text key={it.id} style={styles.small}>
                      • {it.label}: {it.status}
                    </Text>
                  ))}
                  {(trip.cabinItems || []).some(it => it.status === 'LOCKED_IN_CABIN') ? (
                    <Button
                      compact
                      secondary
                      disabled={working}
                      onPress={() => runTripCommand('/api/trip/cabin-items', { action: 'retrieve_all' })}
                    >
                      ✅ Confirm All Belongings Retrieved
                    </Button>
                  ) : null}

                  <LiveMap trip={trip} shared={shared} />
                </View>

                {role === 'pilot' && action ? (
                  <View style={styles.actionCard}>
                    <Text style={styles.copySmall}>
                      Pilot controls remain unlocked even if the rider locks their phone inside the venue.
                    </Text>
                    <Button disabled={working || !fix} onPress={() => pilotAction(action[0])}>
                      {working ? 'Updating trip…' : action[1]}
                    </Button>
                  </View>
                ) : null}
                {role === 'pilot' && trip.tripState === 'RETURNING' ? (
                  <View style={styles.actionCard}>
                    <Button disabled={working || !fix} onPress={() => pilotAction('complete')}>
                      {working ? 'Saving completion…' : '🏁 Complete Round Trip'}
                    </Button>
                  </View>
                ) : null}
                <Button compact secondary disabled={working} onPress={refresh}>
                  Refresh Shared Status
                </Button>
              </>
            ) : null}

            {trip?.tripState === 'COMPLETED' ? (
              <View style={styles.tripCard}>
                <Text style={styles.eyebrow}>ROUNDTRIP COMPLETED</Text>
                <Text style={styles.copySmall}>
                  Returned to original pickup with full standby wait-timer and GPS audit log.
                </Text>
                <Button onPress={clearCompleted}>Close & Reset Trip</Button>
              </View>
            ) : null}

            {role === 'pilot' && !token && !pilotRequest?.pending ? (
              <View style={styles.locationPanel}>
                <Text style={styles.copySmall}>No open request in queue. Checking hopatl.com every 2.5 seconds.</Text>
                <Button compact secondary disabled={working} onPress={refresh}>
                  Check Fleet Queue Now
                </Button>
              </View>
            ) : null}
          </>
        )}
        <Text style={styles.footer}>
          TRICKHOPPER · HOPATL.COM · {role ? 'ACTIVE NIGHTLIFE SESSION' : 'READY'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { padding: 18, paddingBottom: 36, gap: 13, maxWidth: 620, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  brand: { color: colors.text, fontWeight: '900', fontSize: 24, letterSpacing: 1.5 },
  kicker: { color: colors.pink, fontWeight: '800', fontSize: 10, letterSpacing: 2, marginTop: 3 },
  switch: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  switchText: { color: colors.pink, fontSize: 12, fontWeight: '800' },
  apiCard: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: 14, padding: 13, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.pink, fontWeight: '900', letterSpacing: 1.5, fontSize: 10 },
  title: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 6 },
  titleSmall: { color: colors.text, fontWeight: '900', fontSize: 19, marginTop: 6 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 6 },
  copySmall: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  small: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginVertical: 8 },
  button: {
    backgroundColor: colors.pink,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 6,
    flex: 1,
  },
  buttonSecondary: { backgroundColor: '#291638', borderWidth: 1, borderColor: colors.line },
  buttonCompact: { minHeight: 42, borderRadius: 11 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.text, fontWeight: '900', fontSize: 14, textAlign: 'center' },
  statusCard: { backgroundColor: colors.card, padding: 16, borderRadius: 17, borderWidth: 1, borderColor: colors.line },
  coords: { color: colors.green, fontSize: 12, fontWeight: '700', marginTop: 9 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  label: { color: colors.muted, fontWeight: '900', fontSize: 10, letterSpacing: 1.1, marginTop: 8 },
  locationPanel: { backgroundColor: colors.card, borderRadius: 14, borderColor: colors.line, borderWidth: 1, padding: 14 },
  stopCard: { backgroundColor: colors.card, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: colors.line, gap: 7 },
  input: {
    backgroundColor: '#0d0613',
    color: colors.text,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  options: { borderRadius: 10, borderColor: colors.line, borderWidth: 1, overflow: 'hidden' },
  option: { padding: 11, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#21122e' },
  optionText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  selected: { color: colors.green, fontSize: 12, lineHeight: 17 },
  waitRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  waitButton: {
    backgroundColor: '#241332',
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
  },
  waitActive: { backgroundColor: '#4c123d', borderColor: colors.pink },
  waitText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  remove: { color: colors.red, fontSize: 12, fontWeight: '800', alignSelf: 'flex-end', padding: 7 },
  fareCard: {
    backgroundColor: '#1f102d',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.pink,
    marginTop: 4,
  },
  fare: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 4 },
  requestCard: { backgroundColor: colors.card, borderColor: colors.gold, borderWidth: 1, padding: 16, borderRadius: 16 },
  tripCard: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, padding: 16, borderRadius: 16, gap: 5 },
  actionCard: { borderColor: colors.pink, borderWidth: 1, borderRadius: 15, padding: 15, backgroundColor: '#21112d' },
  errorBox: { backgroundColor: '#35141e', borderColor: colors.red, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorText: { color: '#ffb1b7', lineHeight: 19, fontSize: 13 },
  footer: { color: '#816d91', fontWeight: '700', fontSize: 9, letterSpacing: 1.1, textAlign: 'center', marginTop: 15 },
});
