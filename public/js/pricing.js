// Provisional local pilot rate card. Values are USD and should be calibrated per city.
export const RATE_CARD = Object.freeze({
  currency: 'USD',
  baseFareCents: 300,
  perMileCents: 125,
  perActiveMinuteCents: 25,
  waitGraceSeconds: 120,
  perWaitMinuteCents: 25,
  minimumFareCents: 800,
});

export function calculateFare({ distanceMiles = 0, activeSeconds = 0, waitSeconds = 0, includedWaitMinutes = 0 } = {}) {
  const baseCents = RATE_CARD.baseFareCents;
  const distanceCents = Math.round(Math.max(0, distanceMiles) * RATE_CARD.perMileCents);
  const timeCents = Math.round(Math.max(0, activeSeconds) / 60 * RATE_CARD.perActiveMinuteCents);
  const includedWaitCents = Math.round(Math.max(0, includedWaitMinutes) * RATE_CARD.perWaitMinuteCents);
  const billableWaitSeconds = Math.max(0, Math.max(0, waitSeconds) - RATE_CARD.waitGraceSeconds);
  const waitCents = Math.round(billableWaitSeconds / 60 * RATE_CARD.perWaitMinuteCents);
  const subtotalCents = baseCents + distanceCents + timeCents + includedWaitCents + waitCents;
  return {
    baseCents,
    distanceCents,
    timeCents,
    includedWaitCents,
    waitCents,
    subtotalCents,
    totalCents: Math.max(RATE_CARD.minimumFareCents, subtotalCents),
  };
}

export const money = cents => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: RATE_CARD.currency,
}).format(cents / 100);
