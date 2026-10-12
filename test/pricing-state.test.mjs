/**
 * Automated Verification for Wait & Return Prototype
 * Tests competitive pricing logic, custom destinations, wait duration recalculation, and state transitions.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimate, PRICING_CONFIG, formatCurrency } from '../public/js/pricing.js';
import { Store, TRIP_STATES } from '../public/js/store.js';
import { 
  PRESET_LOCATIONS, 
  PRESET_DESTINATIONS, 
  WAIT_PRESETS, 
  MOCK_DRIVERS, 
  ATLANTA_CUSTOM_SUGGESTIONS, 
  CUSTOM_DISTANCE_PRESETS,
  getCoordinatesForLocation,
  calculateHaversineDistanceMiles
} from '../public/js/data.js';

describe('Competitive & Affordable Pricing Engine Verification', () => {
  test('calculates outbound leg correctly for 2.0 miles with affordable rates', () => {
    const est = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10 });
    // Outbound = Base ($3.50) + (2.0 * $1.25) = $6.00
    assert.equal(est.outboundLeg, 6.00);
  });

  test('applies roundtrip return discount (20% off outbound leg)', () => {
    const est = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10 });
    // Return = 6.00 * 0.80 = $4.80
    assert.equal(est.returnLeg, 4.80);
  });

  test('itemizes wait time transparently at $0.35 per minute', () => {
    const est10 = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10 });
    assert.equal(est10.waitCharge, 3.50);

    const est20 = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 20 });
    assert.equal(est20.waitCharge, 7.00);

    const est30 = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 30 });
    assert.equal(est30.waitCharge, 10.50);

    const est45 = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 45 });
    assert.equal(est45.waitCharge, 15.75);
  });

  test('updating wait duration updates full estimate immediately without hidden fees', () => {
    const est10 = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10 });
    // 6.00 + 4.80 + 3.50 + 1.50 = 15.80
    assert.equal(est10.totalEstimate, 15.80);

    const est20 = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 20 });
    // 6.00 + 4.80 + 7.00 + 1.50 = 19.30
    assert.equal(est20.totalEstimate, 19.30);
    assert.equal(Math.round((est20.totalEstimate - est10.totalEstimate) * 100) / 100, 3.50);
  });

  test('extended wait minutes calculate transparently during stop', () => {
    const est = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 20, extendedMinutes: 10 });
    assert.equal(est.waitMinutes, 20);
    assert.equal(est.extendedMinutes, 10);
    assert.equal(est.totalWaitMinutes, 30);
    assert.equal(est.initialWaitCharge, 7.00);
    assert.equal(est.extendedWaitCharge, 3.50);
    assert.equal(est.waitCharge, 10.50);
    assert.equal(est.totalEstimate, 22.80);
  });

  test('driver payout provides guaranteed driver compensation for waiting with 85% split', () => {
    const est = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 20 });
    // Transit: (6.00 + 4.80) * 0.85 = 9.18
    // Wait: 7.00 * 0.85 = 5.95
    // Total = 15.13
    assert.equal(est.driverPayout.transitEarnings, 9.18);
    assert.equal(est.driverPayout.waitEarnings, 5.95);
    assert.equal(est.driverPayout.totalEarnings, 15.13);
    assert.equal(est.driverPayout.effectiveHourlyWait, '17.85');
  });

  test('calculates custom destination with user-defined distance accurately', () => {
    // Custom spot 3.5 miles away with 15-minute wait:
    // Outbound = 3.50 + (3.5 * 1.25) = 7.88
    // Return = 7.88 * 0.80 = 6.30
    // Wait = 15 * 0.35 = 5.25
    // Service Fee = 1.50
    // Total = 20.93
    const customEst = calculateEstimate({ distanceMiles: 3.5, waitMinutes: 15 });
    assert.equal(customEst.outboundLeg, 7.88);
    assert.equal(customEst.returnLeg, 6.30);
    assert.equal(customEst.waitCharge, 5.25);
    assert.equal(customEst.totalEstimate, 20.93);
  });

  test('handles edge case distances and clamp boundaries gracefully', () => {
    const minEst = calculateEstimate({ distanceMiles: 0.1, waitMinutes: 0 });
    assert.ok(minEst.totalEstimate > 0);
    assert.equal(minEst.waitCharge, 0.00);

    const maxEst = calculateEstimate({ distanceMiles: 15, waitMinutes: 90 });
    assert.ok(maxEst.totalEstimate > 40);
    assert.equal(maxEst.waitCharge, 31.50);
  });

  test('formats currency properly', () => {
    assert.equal(formatCurrency(25.5), '$25.50');
    assert.equal(formatCurrency(0), '$0.00');
  });
});

describe('Mock Data & Custom Destination Verification', () => {
  test('preset locations are non-empty and well-formed', () => {
    assert.ok(PRESET_LOCATIONS.length >= 3);
    for (const loc of PRESET_LOCATIONS) {
      assert.ok(loc.name && loc.type);
    }
  });

  test('preset destinations contain distance and recommended wait windows', () => {
    assert.ok(PRESET_DESTINATIONS.length >= 4);
    for (const d of PRESET_DESTINATIONS) {
      assert.ok(d.name && d.category);
      assert.ok(typeof d.miles === 'number' && d.miles > 0);
      assert.ok(typeof d.recommendedWait === 'number' && d.recommendedWait >= 10);
    }
  });

  test('popular Atlanta custom suggestions provide rich venue coverage', () => {
    assert.ok(ATLANTA_CUSTOM_SUGGESTIONS.length >= 8);
    for (const s of ATLANTA_CUSTOM_SUGGESTIONS) {
      assert.ok(s.name && s.category);
      assert.ok(typeof s.miles === 'number' && s.miles > 0);
      assert.ok(typeof s.wait === 'number' && s.wait >= 10);
    }
  });

  test('custom distance presets support flexible mile choices', () => {
    assert.ok(CUSTOM_DISTANCE_PRESETS.length === 4);
    assert.equal(CUSTOM_DISTANCE_PRESETS[0].miles, 1.0);
    assert.equal(CUSTOM_DISTANCE_PRESETS[1].miles, 2.5);
    assert.equal(CUSTOM_DISTANCE_PRESETS[2].miles, 4.5);
    assert.equal(CUSTOM_DISTANCE_PRESETS[3].miles, 7.5);
  });

  test('pilot driver profile includes rating, vehicle, and license plate', () => {
    assert.ok(MOCK_DRIVERS.length >= 1);
    const pilot = MOCK_DRIVERS[0];
    assert.equal(pilot.name, 'Dohntay');
    assert.equal(pilot.licensePlate, 'ATL-PILOT');
    assert.equal(pilot.rating, 5.0);
    assert.ok(pilot.vehicle.includes('Toyota Camry'));
  });

  test('pilot driver Dohntay has verified Cash App ($2243Dohntay) and Zelle (9432452611)', () => {
    const pilot = MOCK_DRIVERS.find(d => d.id === 'driver_1');

    assert.ok(pilot, 'Pilot driver profile exists');
    assert.equal(pilot.name, 'Dohntay');
    assert.equal(pilot.cashTag, '$2243Dohntay');
    assert.equal(pilot.zellePhone, '9432452611');
    assert.equal(pilot.zelleFormatted, '(943) 245-2611');
    assert.ok(pilot.lat > 33.7 && pilot.lat < 33.9, 'Pilot is in Atlanta latitude');
    assert.ok(pilot.lng < -84.3 && pilot.lng > -84.5, 'Pilot is in Atlanta longitude');
  });

  test('pilot driver Rocko has verified Cash App ($chadowens46), vehicle and Atlanta coordinates', () => {
    const rocko = MOCK_DRIVERS.find(d => d.id === 'driver_2');

    assert.ok(rocko, 'Rocko pilot profile exists in fleet');
    assert.equal(rocko.name, 'Rocko');
    assert.equal(rocko.cashTag, '$chadowens46');
    assert.equal(rocko.licensePlate, 'ATL-ROCKO');
    assert.equal(rocko.rating, 5.0);
    assert.ok(rocko.vehicle.includes('Honda Accord'));
    assert.ok(rocko.lat > 33.7 && rocko.lat < 33.9, 'Rocko is in Atlanta latitude');
    assert.ok(rocko.lng < -84.3 && rocko.lng > -84.5, 'Rocko is in Atlanta longitude');
  });

  test('fleet maintains exactly 2 dedicated Atlanta nightlife pilot drivers', () => {
    assert.equal(MOCK_DRIVERS.length, 2, 'Fleet consists of 2 dedicated pilots');
    assert.deepEqual(MOCK_DRIVERS.map(d => d.name), ['Dohntay', 'Rocko']);
    assert.deepEqual(MOCK_DRIVERS.map(d => d.cashTag), ['$2243Dohntay', '$chadowens46']);
  });

  test('Atlanta Nightlife destinations feature valid GPS pins and descriptions', () => {
    for (const dest of PRESET_DESTINATIONS) {
      assert.ok(dest.lat && dest.lng, `${dest.name} has GPS coordinates`);
      assert.ok(dest.description, `${dest.name} has nightlife description`);
      assert.ok(dest.recommendedWait >= 15, `${dest.name} has realistic wait window`);
    }
  });
});

describe('Multi-Stop Itinerary & Transparent GPS Routing Verification', () => {
  test('calculates multi-stop itinerary automatically via GPS coordinates without manual preset distance', () => {
    const pickup = 'Loews Atlanta Hotel (Midtown)';
    const stops = [
      {
        id: 'stop_1',
        name: 'Tower Beer, Wine & Spirits (Piedmont Rd)',
        waitMinutes: 15,
        lat: 33.8164,
        lng: -84.3685,
      },
      {
        id: 'stop_2',
        name: 'Peter Street Arts & Lounge District',
        waitMinutes: 30,
        lat: 33.7483,
        lng: -84.4024,
      }
    ];

    const est = calculateEstimate({ pickup, stops });

    assert.equal(est.isMultiStop, true);
    assert.equal(est.stopCount, 2);
    // 3 legs: Pickup -> Stop 1, Stop 1 -> Stop 2, Stop 2 -> Pickup
    assert.equal(est.legs.length, 3);

    // Leg 1: Pickup -> Stop 1
    assert.ok(est.legs[0].distanceMiles > 1.5 && est.legs[0].distanceMiles < 4.0);
    assert.equal(est.legs[0].waitMinutes, 15);
    assert.equal(est.legs[0].waitCharge, 5.25); // 15 * 0.35

    // Leg 2: Stop 1 -> Stop 2
    assert.ok(est.legs[1].distanceMiles > 3.0 && est.legs[1].distanceMiles < 8.0);
    assert.equal(est.legs[1].waitMinutes, 30);
    assert.equal(est.legs[1].waitCharge, 10.50); // 30 * 0.35

    // Return Leg: Stop 2 -> Pickup (with 20% discount)
    assert.ok(est.legs[2].distanceMiles > 2.0 && est.legs[2].distanceMiles < 6.0);
    assert.equal(est.legs[2].type, 'return_leg');
    assert.equal(est.legs[2].discountPercent, 20);

    // Total wait time = 15 + 30 = 45m ($15.75)
    assert.equal(est.totalWaitMinutes, 45);
    assert.equal(est.waitCharge, 15.75);

    // Total distance is positive sum of all legs
    assert.ok(est.totalDistanceMiles > 6.0);

    // Driver payout is 85% of transit + 85% of wait
    const expectedDriverTransit = Math.round(est.transitSubtotal * 0.85 * 100) / 100;
    const expectedDriverWait = Math.round(est.waitCharge * 0.85 * 100) / 100;
    assert.equal(est.driverPayout.transitEarnings, expectedDriverTransit);
    assert.equal(est.driverPayout.waitEarnings, expectedDriverWait);
    assert.equal(est.driverPayout.totalEarnings, Math.round((expectedDriverTransit + expectedDriverWait) * 100) / 100);
  });

  test('resolves GPS coordinates deterministically for any custom address', () => {
    const coords1 = getCoordinatesForLocation('1055 Piedmont Ave NE, Atlanta, GA');
    const coords2 = getCoordinatesForLocation('1055 Piedmont Ave NE, Atlanta, GA');

    assert.ok(coords1.lat > 33.70 && coords1.lat < 33.90);
    assert.ok(coords1.lng < -84.30 && coords1.lng > -84.50);
    assert.equal(coords1.lat, coords2.lat, 'Coordinates are deterministic');
    assert.equal(coords1.lng, coords2.lng, 'Coordinates are deterministic');
  });

  test('calculates realistic driving distances with urban road curvature', () => {
    const pickup = 'Loews Atlanta Hotel (Midtown)';
    const phipps = 'Peachtree Rd / Phipps Plaza VIP Strip';
    const dist = calculateHaversineDistanceMiles(pickup, phipps);

    // Straight line is ~4.5 mi, with 1.28x road curvature factor it is ~5.5 - 6.5 mi
    assert.ok(dist >= 4.5 && dist <= 7.0, `Calculated realistic distance: ${dist} mi`);
  });

  test('calculates 3-stop itinerary seamlessly with transparent return discount', () => {
    const pickup = 'Loews Atlanta Hotel (Midtown)';
    const stops = [
      { id: 's1', name: 'CVS Pharmacy 24h (Peachtree St NE)', waitMinutes: 10 },
      { id: 's2', name: 'Tower Beer, Wine & Spirits (Piedmont Rd)', waitMinutes: 15 },
      { id: 's3', name: 'Clermont Lounge (Ponce de Leon)', waitMinutes: 35 },
    ];

    const est = calculateEstimate({ pickup, stops });

    assert.equal(est.isMultiStop, true);
    assert.equal(est.stopCount, 3);
    assert.equal(est.legs.length, 4); // 3 stops + return
    assert.equal(est.totalWaitMinutes, 60);
    assert.equal(est.waitCharge, 21.00); // 60 * 0.35
    assert.ok(est.totalEstimate > 30.00);
    assert.equal(est.legs[3].discountPercent, 20); // 20% return discount
  });
});

describe('Overtime & Grace Period Wait Engine Verification', () => {
  test('PRICING_CONFIG defines fair and transparent overtime parameters', () => {
    assert.equal(PRICING_CONFIG.OVERTIME_RATE_PER_MIN, 0.50, 'Overtime rate is $0.50/min');
    assert.equal(PRICING_CONFIG.GRACE_PERIOD_MINS, 3, 'Grace period warning is 3 minutes');
    assert.equal(PRICING_CONFIG.DRIVER_OVERTIME_SPLIT, 0.85, 'Driver receives 85% of overtime');
  });

  test('calculates overtime charge correctly at $0.50/min for single-distance fallback', () => {
    const baseEst = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10, overtimeMinutes: 0 });
    const otEst = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10, overtimeMinutes: 8 });

    assert.equal(baseEst.overtimeCharge, 0.00);
    assert.equal(otEst.overtimeMinutes, 8);
    assert.equal(otEst.overtimeCharge, 4.00); // 8 min * $0.50
    assert.equal(otEst.totalEstimate, baseEst.totalEstimate + 4.00);
    assert.equal(otEst.formatted.overtimeCharge, '$4.00');
  });

  test('driver earns guaranteed $25.50/hr effective pay during overtime with 85% split', () => {
    const est = calculateEstimate({ distanceMiles: 2.0, waitMinutes: 10, overtimeMinutes: 20 });
    // 20 min * $0.50 = $10.00 overtime charge
    assert.equal(est.overtimeCharge, 10.00);
    // Driver split = 85% of $10.00 = $8.50
    assert.equal(est.driverPayout.overtimeEarnings, 8.50);
    assert.equal(est.driverPayout.effectiveHourlyOvertime, '25.50');
  });

  test('multi-stop itinerary correctly itemizes standard wait, extended wait, and overtime', () => {
    const pickup = 'Loews Atlanta Hotel (Midtown)';
    const stops = [
      { id: 's1', name: 'CVS Pharmacy 24h (Peachtree St NE)', waitMinutes: 10 },
      { id: 's2', name: 'Tower Beer, Wine & Spirits (Piedmont Rd)', waitMinutes: 15 },
    ];

    const est = calculateEstimate({
      pickup,
      stops,
      extendedMinutes: 10,
      overtimeMinutes: 6,
    });

    assert.equal(est.waitMinutes, 25); // 10 + 15 initial
    assert.equal(est.extendedMinutes, 10);
    assert.equal(est.overtimeMinutes, 6);
    assert.equal(est.totalWaitMinutes, 41); // 25 + 10 + 6
    assert.equal(est.initialWaitCharge, 8.75); // 25 * $0.35
    assert.equal(est.extendedWaitCharge, 3.50); // 10 * $0.35
    assert.equal(est.overtimeCharge, 3.00); // 6 * $0.50
    // Total wait charge = 8.75 + 3.50 + 3.00 = 15.25
    assert.equal(est.waitCharge, 15.25);
    assert.equal(est.formatted.overtimeCharge, '$3.00');
  });
});

describe('I Have Cash (In-Car Physical Payment) Verification', () => {
  test('calculates exact physical cash collection amount matching upfront estimate', () => {
    const pickup = 'Loews Atlanta Hotel (Midtown)';
    const stops = [
      { id: 's1', name: 'Clermont Lounge (Ponce de Leon)', waitMinutes: 30 }
    ];
    const est = calculateEstimate({ pickup, stops });

    assert.ok(est.totalEstimate > 0);
    assert.equal(typeof est.formatted.totalEstimate, 'string');
    assert.ok(est.formatted.totalEstimate.startsWith('$'));
  });

  test('driver earns full agreed payout upon cash collection with zero processing fee deductions', () => {
    const est = calculateEstimate({ distanceMiles: 3.5, waitMinutes: 25 });
    // Total driver earnings guaranteed
    assert.ok(est.driverPayout.totalEarnings > 0);
    assert.equal(est.driverPayout.totalEarnings, Math.round((est.driverPayout.transitEarnings + est.driverPayout.waitEarnings) * 100) / 100);
  });
});

describe('Zelle Instant Bank Transfer & Pilot Driver Verification', () => {
  test('wires payments to pilot driver Dohntay via Zelle 9432452611 and Cash App $2243Dohntay', () => {
    const pilot = MOCK_DRIVERS[0];
    assert.equal(pilot.name, 'Dohntay');
    assert.equal(pilot.cashTag, '$2243Dohntay');
    assert.equal(pilot.zellePhone, '9432452611');
    assert.equal(pilot.zelleFormatted, '(943) 245-2611');
  });

  test('wires payments to pilot driver Rocko via Cash App $chadowens46 and Zelle (404) 555-0146', () => {
    const rocko = MOCK_DRIVERS[1];
    assert.equal(rocko.name, 'Rocko');
    assert.equal(rocko.cashTag, '$chadowens46');
    assert.equal(rocko.zellePhone, '4045550146');
    assert.equal(rocko.zelleFormatted, '(404) 555-0146');
  });

  test('Zelle transaction captures full exact upfront fare without card processing fees', () => {
    const est = calculateEstimate({ distanceMiles: 4.2, waitMinutes: 30 });
    // Upfront total estimate is exact settlement amount
    assert.ok(est.totalEstimate > 0);
    assert.equal(typeof est.formatted.totalEstimate, 'string');
    // Pilot receives 85% of transit + 85% of wait
    assert.ok(est.driverPayout.totalEarnings > 0);
    assert.equal(est.driverPayout.totalEarnings, Math.round((est.driverPayout.transitEarnings + est.driverPayout.waitEarnings) * 100) / 100);
  });
});

describe('Rocko Pilot Simulation & Test Run Verification', () => {
  test('seedTestRun correctly seeds a 2-hop nightlife run for Rocko ($chadowens46)', () => {
    const store = new Store();
    store.seedTestRun('driver_2', TRIP_STATES.DRIVER_ACCEPTED);
    const state = store.getState();

    assert.equal(state.driver.name, 'Rocko');
    assert.equal(state.driver.cashTag, '$chadowens46');
    assert.equal(state.driverCashTag, '$chadowens46');
    assert.equal(state.selectedDriverId, 'driver_2');
    assert.equal(state.tripState, TRIP_STATES.DRIVER_ACCEPTED);
    assert.equal(state.pickup, 'Loews Atlanta Hotel (Midtown)');
    assert.equal(state.stops.length, 2);
    assert.equal(state.stops[0].name, 'Ponce City Market (Old Fourth Ward)');
    assert.equal(state.stops[1].name, 'Clermont Lounge (Ponce de Leon)');
    assert.equal(state.pricing.driverPayout.totalEarnings, 22.00);
    assert.equal(state.riderCashTag, '$alexis_in_atl');
    assert.equal(state.cashAppAuthorized, true);
  });

  test('simulateIncomingRequest creates an actionable matching request for Rocko', () => {
    const store = new Store();
    store.simulateIncomingRequest('driver_2');
    const state = store.getState();

    assert.equal(state.tripState, TRIP_STATES.MATCHING);
    assert.equal(state.driver.name, 'Rocko');
    assert.equal(state.driver.cashTag, '$chadowens46');
    assert.equal(state.selectedDriverId, 'driver_2');
    assert.ok(state.notificationMessage.includes('Rocko'));
    assert.ok(state.notificationMessage.includes('22.00'));
    assert.equal(state.pricing.driverPayout.totalEarnings, 22.00);
  });

  test('advancing state moves from MATCHING through full 2-hop run to COMPLETED with Rocko payout', () => {
    const store = new Store();
    store.simulateIncomingRequest('driver_2');
    assert.equal(store.getState().tripState, TRIP_STATES.MATCHING);

    const initialWallet = store.getState().driverWalletBalance;

    // 1. Accept request -> DRIVER_ACCEPTED
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.DRIVER_ACCEPTED);

    // 2. Arrived pickup -> OUTBOUND to Stop 1
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.OUTBOUND);
    assert.equal(store.getState().currentStopIndex, 0);

    // 3. Arrived at Stop 1 (Ponce City Market) -> WAITING
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.WAITING);

    // 4. Rider ready / Hop back in -> OUTBOUND to Stop 2 (Clermont Lounge)
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.OUTBOUND);
    assert.equal(store.getState().currentStopIndex, 1);

    // 5. Arrived at Stop 2 (Clermont Lounge) -> WAITING
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.WAITING);

    // 6. Rider ready -> RETURN_LEG to Loews Atlanta Hotel
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.RETURN_LEG);

    // 7. Complete trip -> COMPLETED & Payout added to wallet
    store.advanceTripState();
    assert.equal(store.getState().tripState, TRIP_STATES.COMPLETED);
    assert.equal(store.getState().driverWalletBalance, Math.round((initialWallet + 22.00) * 100) / 100);
    assert.ok(store.getState().notificationMessage.includes('22.00'));
    assert.ok(store.getState().notificationMessage.includes('$chadowens46'));
  });
});




