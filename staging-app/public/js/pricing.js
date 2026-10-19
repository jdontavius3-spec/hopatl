// Calibrated Atlanta Nightlife Pilot Rate Card (USD).
// Designed so dedicated standby wait blocks compensate pilots fairly vs. point-to-point driving,
// while protecting pilots from mid-stop abandonment via a 50% upfront retainer deposit.
export const RATE_CARD = Object.freeze({
  currency: 'USD',
  baseFareCents: 400,          // $4.00 roundtrip dispatch base
  perMileCents: 135,           // $1.35 per road/GPS mile
  perActiveMinuteCents: 30,    // $0.30 per active driving minute
  waitGraceSeconds: 120,       // 2 free grace minutes at pickup & each hop
  perWaitMinuteCents: 45,      // $0.45/min ($27/hr) dedicated pilot standby rate
  overrunWaitMinuteCents: 50,  // $0.50/min unreserved overrun rate after grace
  minimumFareCents: 1200,      // $12.00 minimum roundtrip retainer
  depositRatio: 0.5,           // 50% upfront retainer hold to prevent mid-hop bailouts
});

export const WAIT_TIERS = Object.freeze({
  15: { minutes: 15, label: 'Quick Hop', subtitle: 'Grab food, fit change, or quick pickup', ratePerMinCents: 40, blockCents: 600 },
  30: { minutes: 30, label: 'Lounge Hold', subtitle: 'Pre-game, cocktail stop, or VIP drop-in', ratePerMinCents: 45, blockCents: 1350 },
  60: { minutes: 60, label: 'VIP Standby', subtitle: 'Full venue session · pilot staged nearby', ratePerMinCents: 45, blockCents: 2700 },
});

export function getWaitBlockCents(minutes) {
  const m = Number(minutes) || 0;
  if (WAIT_TIERS[m]) return WAIT_TIERS[m].blockCents;
  return Math.round(Math.max(0, m) * RATE_CARD.perWaitMinuteCents);
}

export function calculateFare({
  distanceMiles = 0,
  activeSeconds = 0,
  waitSeconds = 0,
  includedWaitMinutes = 0,
  hops = null,
} = {}) {
  const baseCents = RATE_CARD.baseFareCents;
  const distanceCents = Math.round(Math.max(0, distanceMiles) * RATE_CARD.perMileCents);
  const timeCents = Math.round((Math.max(0, activeSeconds) / 60) * RATE_CARD.perActiveMinuteCents);

  const hopList = Array.isArray(hops) && hops.length
    ? hops
    : includedWaitMinutes > 0
      ? [{ waitMinutes: includedWaitMinutes }]
      : [];

  const hopWaitBreakdown = hopList.map((hop, index) => {
    const mins = Math.max(0, Number(hop?.waitMinutes ?? hop) || 0);
    const cents = getWaitBlockCents(mins);
    return {
      hopIndex: index,
      waitMinutes: mins,
      tierLabel: WAIT_TIERS[mins]?.label || `${mins} min standby`,
      cents,
    };
  });

  const includedWaitCents = hopWaitBreakdown.length
    ? hopWaitBreakdown.reduce((sum, h) => sum + h.cents, 0)
    : Math.round(Math.max(0, includedWaitMinutes) * RATE_CARD.perWaitMinuteCents);

  const billableWaitSeconds = Math.max(0, Math.max(0, waitSeconds) - RATE_CARD.waitGraceSeconds);
  const waitCents = Math.round((billableWaitSeconds / 60) * RATE_CARD.overrunWaitMinuteCents);

  const subtotalCents = baseCents + distanceCents + timeCents + includedWaitCents + waitCents;
  const totalCents = Math.max(RATE_CARD.minimumFareCents, subtotalCents);
  const upfrontDepositCents = Math.round(totalCents * RATE_CARD.depositRatio);
  const completionBalanceCents = Math.max(0, totalCents - upfrontDepositCents);

  // Benchmark comparison: N+1 separate point-to-point rides during 1.9x Atlanta late-night surge
  // (Each separate ride incurs booking/base fees + surge multiplier + risk of 25-min curb wait)
  const separateLegs = Math.max(2, hopList.length + 1);
  const p2pBaseFees = separateLegs * 580; // ~$5.80 base + booking fee per separate ride
  const p2pDriveRaw = distanceCents + timeCents;
  const uberSurgeEstimateCents = Math.round(p2pBaseFees + p2pDriveRaw * 1.95);

  return {
    baseCents,
    distanceCents,
    timeCents,
    includedWaitCents,
    hopWaitBreakdown,
    waitCents,
    subtotalCents,
    totalCents,
    upfrontDepositCents,
    completionBalanceCents,
    uberSurgeEstimateCents,
  };
}

export const money = cents => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: RATE_CARD.currency,
}).format((Number(cents) || 0) / 100);
