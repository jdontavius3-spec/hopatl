/**
 * Pricing Engine for Wait & Return Prototype
 * Pure calculation logic decoupled from presentation.
 * All figures are sample estimates for demonstration purposes only.
 */

import { calculateHaversineDistanceMiles, getCoordinatesForLocation } from './data.js';

export const PRICING_CONFIG = {
  BASE_FARE: 3.50,            // Base pickup fare ($ USD - competitive affordable entry)
  PER_MILE_RATE: 1.25,        // Mileage rate per mile ($ USD)
  WAIT_RATE_PER_MIN: 0.35,    // Transparent wait rate ($0.35/min = $21.00/hr - affordable quick stops)
  OVERTIME_RATE_PER_MIN: 0.50,// Overtime wait rate ($0.50/min = $30.00/hr) after reserved window expires
  GRACE_PERIOD_MINS: 3,       // 3-minute grace period before overtime rate applies
  RETURN_DISCOUNT_FACTOR: 0.80,// 20% roundtrip discount on return leg (zero deadhead)
  SERVICE_FEE: 1.50,          // Flat transparent platform & safety fee
  DRIVER_LEG_SPLIT: 0.85,     // Driver receives 85% of transit fares
  DRIVER_WAIT_SPLIT: 0.85,    // Driver receives 85% of wait-time pay ($17.85/hr guaranteed curb pay)
  DRIVER_OVERTIME_SPLIT: 0.85,// Driver receives 85% of overtime pay ($25.50/hr overtime curb pay)
};

/**
 * Calculate transparent upfront pricing breakdown for single or multi-stop itineraries
 * @param {Object} params
 * @param {string|Object} [params.pickup='Loews Atlanta Hotel (Midtown)'] - Origin location
 * @param {Array<Object>} [params.stops=null] - Multi-stop list: [{ name, waitMinutes, lat, lng }]
 * @param {number} [params.distanceMiles=null] - Explicit distance (if not computing from stops)
 * @param {number} [params.waitMinutes=null] - Explicit wait time (if not computing from stops)
 * @param {number} [params.riders=1] - Number of passengers
 * @param {number} [params.extendedMinutes=0] - Additional wait minutes added during stop
 * @param {number} [params.overtimeMinutes=0] - Overtime minutes accrued past reserved window
 * @returns {Object} itemized breakdown
 */
export function calculateEstimate({ 
  pickup = 'Loews Atlanta Hotel (Midtown)', 
  stops = null, 
  distanceMiles = null, 
  waitMinutes = null, 
  riders = 1, 
  extendedMinutes = 0,
  overtimeMinutes = 0 
} = {}) {
  const safeOvertimeMins = Math.max(0, Number(overtimeMinutes) || 0);
  const overtimeCharge = Math.round((safeOvertimeMins * PRICING_CONFIG.OVERTIME_RATE_PER_MIN) * 100) / 100;

  // If multi-stop array is provided
  if (stops && Array.isArray(stops) && stops.length > 0) {
    const legs = [];
    let previousPoint = pickup;
    let transitSubtotal = 0;
    let totalMiles = 0;

    // 1. Process Intermediate Legs (Pickup -> Stop 1 -> Stop 2 -> ...)
    stops.forEach((stop, index) => {
      const legDist = calculateHaversineDistanceMiles(previousPoint, stop);
      totalMiles += legDist;

      // Base fare applies on the first leg of dispatch
      const legFare = index === 0 
        ? Math.round((PRICING_CONFIG.BASE_FARE + (legDist * PRICING_CONFIG.PER_MILE_RATE)) * 100) / 100
        : Math.round((legDist * PRICING_CONFIG.PER_MILE_RATE) * 100) / 100;

      transitSubtotal += legFare;

      const stopWaitMins = Math.max(0, Number(stop.waitMinutes) || 0);
      const stopWaitCharge = Math.round((stopWaitMins * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;

      legs.push({
        index: index + 1,
        type: 'stop_leg',
        from: typeof previousPoint === 'object' ? previousPoint.name : previousPoint,
        to: stop.name,
        distanceMiles: legDist,
        fare: legFare,
        waitMinutes: stopWaitMins,
        waitCharge: stopWaitCharge,
      });

      previousPoint = stop;
    });

    // 2. Process Return Leg (Last Stop -> Pickup Origin with 20% discount)
    const lastStop = stops[stops.length - 1];
    const returnDist = calculateHaversineDistanceMiles(lastStop, pickup);
    totalMiles += returnDist;

    const returnStandardFare = returnDist * PRICING_CONFIG.PER_MILE_RATE;
    const returnFare = Math.round((returnStandardFare * PRICING_CONFIG.RETURN_DISCOUNT_FACTOR) * 100) / 100;
    transitSubtotal += returnFare;

    const returnLeg = {
      index: stops.length + 1,
      type: 'return_leg',
      from: lastStop.name,
      to: typeof pickup === 'object' ? pickup.name : pickup,
      distanceMiles: returnDist,
      fare: returnFare,
      discountPercent: 20,
    };
    legs.push(returnLeg);

    // 3. Wait Calculations (Base + Extensions + Overtime)
    const initialWaitMinutes = stops.reduce((sum, s) => sum + (Math.max(0, Number(s.waitMinutes)) || 0), 0);
    const totalStandardWaitMinutes = initialWaitMinutes + (Math.max(0, Number(extendedMinutes)) || 0);
    const totalWaitMinutes = totalStandardWaitMinutes + safeOvertimeMins;
    
    const initialWaitCharge = Math.round((initialWaitMinutes * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;
    const extendedWaitCharge = Math.round((Math.max(0, Number(extendedMinutes)) * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;
    const standardWaitCharge = Math.round((totalStandardWaitMinutes * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;
    const totalWaitCharge = Math.round((standardWaitCharge + overtimeCharge) * 100) / 100;

    // 4. Totals
    const serviceFee = PRICING_CONFIG.SERVICE_FEE;
    const totalEstimate = Math.round((transitSubtotal + totalWaitCharge + serviceFee) * 100) / 100;

    // 5. Driver Earnings
    const driverTransitEarnings = Math.round((transitSubtotal * PRICING_CONFIG.DRIVER_LEG_SPLIT) * 100) / 100;
    const driverStandardWaitEarnings = Math.round((standardWaitCharge * PRICING_CONFIG.DRIVER_WAIT_SPLIT) * 100) / 100;
    const driverOvertimeEarnings = Math.round((overtimeCharge * PRICING_CONFIG.DRIVER_OVERTIME_SPLIT) * 100) / 100;
    const driverWaitEarnings = Math.round((driverStandardWaitEarnings + driverOvertimeEarnings) * 100) / 100;
    const totalDriverEarnings = Math.round((driverTransitEarnings + driverWaitEarnings) * 100) / 100;

    return {
      isMultiStop: stops.length > 1,
      stopCount: stops.length,
      stops,
      legs,
      returnLeg: legs[legs.length - 1].fare,
      outboundLeg: legs[0].fare,
      distanceMiles: Math.round(totalMiles * 10) / 10,
      totalDistanceMiles: Math.round(totalMiles * 10) / 10,
      waitMinutes: initialWaitMinutes,
      extendedMinutes: Number(extendedMinutes) || 0,
      overtimeMinutes: safeOvertimeMins,
      overtimeCharge,
      totalWaitMinutes,
      waitRatePerMin: PRICING_CONFIG.WAIT_RATE_PER_MIN,
      overtimeRatePerMin: PRICING_CONFIG.OVERTIME_RATE_PER_MIN,
      transitSubtotal: Math.round(transitSubtotal * 100) / 100,
      waitCharge: totalWaitCharge,
      initialWaitCharge,
      extendedWaitCharge,
      serviceFee,
      totalEstimate,
      driverPayout: {
        transitEarnings: driverTransitEarnings,
        waitEarnings: driverWaitEarnings,
        overtimeEarnings: driverOvertimeEarnings,
        totalEarnings: totalDriverEarnings,
        effectiveHourlyWait: (PRICING_CONFIG.WAIT_RATE_PER_MIN * PRICING_CONFIG.DRIVER_WAIT_SPLIT * 60).toFixed(2),
        effectiveHourlyOvertime: (PRICING_CONFIG.OVERTIME_RATE_PER_MIN * PRICING_CONFIG.DRIVER_OVERTIME_SPLIT * 60).toFixed(2),
      },
      formatted: {
        outboundLeg: `$${legs[0].fare.toFixed(2)}`,
        returnLeg: `$${returnLeg.fare.toFixed(2)}`,
        transitSubtotal: `$${transitSubtotal.toFixed(2)}`,
        waitCharge: `$${totalWaitCharge.toFixed(2)}`,
        initialWaitCharge: `$${initialWaitCharge.toFixed(2)}`,
        extendedWaitCharge: `$${extendedWaitCharge.toFixed(2)}`,
        overtimeCharge: `$${overtimeCharge.toFixed(2)}`,
        serviceFee: `$${serviceFee.toFixed(2)}`,
        totalEstimate: `$${totalEstimate.toFixed(2)}`,
        totalDriverEarnings: `$${totalDriverEarnings.toFixed(2)}`,
      },
    };
  }

  // Fallback: Single-distance calculation (backwards compatible for direct tests and presets)
  const safeDistance = Math.max(0.5, Number(distanceMiles !== null ? distanceMiles : 2.4));
  const safeWait = Math.max(0, Number(waitMinutes !== null ? waitMinutes : 20));
  const totalWaitMinutes = Math.max(0, safeWait + (Number(extendedMinutes) || 0));

  const outboundLeg = Math.round((PRICING_CONFIG.BASE_FARE + (safeDistance * PRICING_CONFIG.PER_MILE_RATE)) * 100) / 100;
  const returnLeg = Math.round((outboundLeg * PRICING_CONFIG.RETURN_DISCOUNT_FACTOR) * 100) / 100;
  const waitCharge = Math.round((totalWaitMinutes * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;

  const initialWaitMinutes = safeWait;
  const initialWaitCharge = Math.round((initialWaitMinutes * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;
  const extendedWaitCharge = Math.round((Math.max(0, Number(extendedMinutes) || 0) * PRICING_CONFIG.WAIT_RATE_PER_MIN) * 100) / 100;

  const serviceFee = PRICING_CONFIG.SERVICE_FEE;
  const totalEstimate = Math.round((outboundLeg + returnLeg + waitCharge + overtimeCharge + serviceFee) * 100) / 100;

  const driverTransitEarnings = Math.round(((outboundLeg + returnLeg) * PRICING_CONFIG.DRIVER_LEG_SPLIT) * 100) / 100;
  const driverWaitEarnings = Math.round((waitCharge * PRICING_CONFIG.DRIVER_WAIT_SPLIT) * 100) / 100;
  const driverOvertimeEarnings = Math.round((overtimeCharge * PRICING_CONFIG.DRIVER_OVERTIME_SPLIT) * 100) / 100;
  const totalDriverEarnings = Math.round((driverTransitEarnings + driverWaitEarnings + driverOvertimeEarnings) * 100) / 100;

  const legs = [
    {
      index: 1,
      type: 'stop_leg',
      from: typeof pickup === 'object' ? pickup.name : pickup,
      to: 'Destination',
      distanceMiles: safeDistance,
      fare: outboundLeg,
      waitMinutes: initialWaitMinutes,
      waitCharge: initialWaitCharge,
    },
    {
      index: 2,
      type: 'return_leg',
      from: 'Destination',
      to: typeof pickup === 'object' ? pickup.name : pickup,
      distanceMiles: safeDistance,
      fare: returnLeg,
      discountPercent: 20,
    }
  ];

  return {
    isMultiStop: false,
    stopCount: 1,
    legs,
    distanceMiles: safeDistance,
    totalDistanceMiles: Math.round(safeDistance * 2 * 10) / 10,
    waitMinutes: initialWaitMinutes,
    extendedMinutes: Number(extendedMinutes) || 0,
    overtimeMinutes: safeOvertimeMins,
    overtimeCharge,
    totalWaitMinutes,
    waitRatePerMin: PRICING_CONFIG.WAIT_RATE_PER_MIN,
    overtimeRatePerMin: PRICING_CONFIG.OVERTIME_RATE_PER_MIN,
    outboundLeg,
    returnLeg,
    waitCharge,
    initialWaitCharge,
    extendedWaitCharge,
    serviceFee,
    totalEstimate,
    driverPayout: {
      transitEarnings: driverTransitEarnings,
      waitEarnings: driverWaitEarnings,
      overtimeEarnings: driverOvertimeEarnings,
      totalEarnings: totalDriverEarnings,
      effectiveHourlyWait: (PRICING_CONFIG.WAIT_RATE_PER_MIN * PRICING_CONFIG.DRIVER_WAIT_SPLIT * 60).toFixed(2),
      effectiveHourlyOvertime: (PRICING_CONFIG.OVERTIME_RATE_PER_MIN * PRICING_CONFIG.DRIVER_OVERTIME_SPLIT * 60).toFixed(2),
    },
    formatted: {
      outboundLeg: `$${outboundLeg.toFixed(2)}`,
      returnLeg: `$${returnLeg.toFixed(2)}`,
      waitCharge: `$${waitCharge.toFixed(2)}`,
      initialWaitCharge: `$${initialWaitCharge.toFixed(2)}`,
      extendedWaitCharge: `$${extendedWaitCharge.toFixed(2)}`,
      overtimeCharge: `$${overtimeCharge.toFixed(2)}`,
      serviceFee: `$${serviceFee.toFixed(2)}`,
      totalEstimate: `$${totalEstimate.toFixed(2)}`,
      totalDriverEarnings: `$${totalDriverEarnings.toFixed(2)}`,
    },
  };
}

/**
 * Format currency helper
 */
export function formatCurrency(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}
