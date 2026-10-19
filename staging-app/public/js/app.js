import { store, TRIP_STATES } from './store.js';
import { telemetry } from './telemetry.js';
import { renderHeader } from './components/Header.js';
import { renderLiveMap, updateLiveMap } from './components/LiveMap.js';
import { RATE_CARD, WAIT_TIERS, getWaitBlockCents, calculateFare, money } from './pricing.js';

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const POPULAR_ATL_SPOTS = [
  'Magic City, Atlanta, GA',
  'Ponce City Market, Atlanta, GA',
  'Compound Nightclub, Atlanta, GA',
  'Krog Street Market, Atlanta, GA',
  'The Battery Atlanta, Atlanta, GA',
  'Waffle House (Midtown)',
  'JR Crickets (Midtown)',
  'Buckhead Village District',
];

function shortMinutes(seconds) {
  const minutes = Math.max(1, Math.round(Math.max(0, Number(seconds) || 0) / 60));
  return `${minutes} min`;
}

function fmtDuration(total) {
  const n = Math.max(0, Math.floor(total || 0));
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function renderWhyTrickhopper() {
  return `<section class="card why-trickhopper" aria-labelledby="why-trickhopper-title">
    <h2 class="eyebrow" id="why-trickhopper-title">WHY TRICKHOPPER VS. UBER / LYFT AT 2 AM?</h2>
    <div class="why-trickhopper-row">
      <span class="why-trickhopper-icon" aria-hidden="true">×</span>
      <div>
        <h3>Point-to-point rideshare abandons you at the curb</h3>
        <p>Standard drivers leave immediately after drop-off. At 2 AM bar close, you face 2.5x surge pricing, 30-minute curb waits, driver cancellations, or items left across multiple cars.</p>
      </div>
    </div>
    <div class="why-trickhopper-row">
      <span class="why-trickhopper-icon bunny" aria-hidden="true">🐰</span>
      <div>
        <h3>The TRICKHOPPER Nightlife Retainer Model</h3>
        <p>One dedicated pilot stays assigned to your group across 1–3 stops and returns you home. Your pilot stages legally nearby while your standby timer runs, pulls up in 2 minutes when summoned, and locks in upfront pricing with a 50% retainer deposit.</p>
      </div>
    </div>
  </section>`;
}

function renderDemoWalkthroughBar(s) {
  if (!s.simulationMode && s.tripState !== TRIP_STATES.REQUESTED) return '';
  const nextStageLabel = {
    REQUESTED: 'Assign Pilot Rocko (En Route)',
    EN_ROUTE: 'Arrive at Pickup (Start Grace Timer)',
    WAITING_PICKUP: 'Board Rider & Start Outbound Leg',
    ACTIVE: `Arrive at Hop ${(s.stopIndex || 0) + 1} (Start Standby Timer)`,
    WAITING_HOP: `Depart Hop ${(s.stopIndex || 0) + 1} → Next Stop`,
    WAITING_RETURN: 'Summon & Start Return Leg to Pickup',
    RETURNING: 'Arrive Back at Pickup & Complete Trip',
    COMPLETED: 'Trip Completed',
  }[s.tripState] || 'Next Stage';

  return `<section class="card demo-controller-bar" role="region" aria-label="Interactive Prototype Walkthrough Controls">
    <div class="demo-controller-head">
      <div>
        <span class="eyebrow" style="color:#fde68a">⚡ INTERACTIVE PROTOTYPE WALKTHROUGH</span>
        <strong style="display:block;color:#fff;font-size:14px;margin-top:2px">${s.simulationMode ? 'Auto-Pilot Simulator Active (Pilot Rocko · Cadillac Escalade)' : 'Waiting in Live Queue — Want to Demo Solo Right Now?'}</strong>
      </div>
      <span class="live-pill" style="background:rgba(245,158,11,.22);color:#fde68a">${esc(s.tripState)}</span>
    </div>
    <p class="cash-note" style="color:#fef3c7;margin:6px 0 10px">
      ${s.simulationMode
        ? 'Step through each hop at your own speaking pace, or test the Curbside Summon & +15 Min Wait Extension buttons below.'
        : 'No second device needed: launch the Auto-Pilot Simulator to experience pilot acceptance, live map tracking, standby timers, and return completion right here.'}
    </p>
    <div class="demo-controller-actions">
      ${!s.simulationMode && s.tripState === TRIP_STATES.REQUESTED
        ? `<button type="button" class="btn-primary" id="start-autopilot">⚡ Launch Auto-Pilot Simulator Now →</button>`
        : s.tripState !== TRIP_STATES.COMPLETED
          ? `<button type="button" class="btn-primary" id="step-autopilot">⏭ Step: ${esc(nextStageLabel)} →</button>
             <button type="button" class="btn-secondary" id="pause-autopilot">⏸ Pause Auto-Timer</button>`
          : ''}
    </div>
  </section>`;
}

function renderCurbsideAndComms(s, role) {
  if (!['EN_ROUTE', 'WAITING_PICKUP', 'ACTIVE', 'WAITING_HOP', 'WAITING_RETURN', 'RETURNING'].includes(s.tripState)) return '';
  const statusBadges = {
    NONE: { label: 'EN ROUTE / DRIVING', color: '#38bdf8', desc: 'Vehicle is actively moving along the planned route.' },
    STAGED_NEARBY: { label: 'STAGED IN LEGAL STANDBY (1 BLOCK AWAY)', color: '#a855f7', desc: 'Pilot is parked legally nearby to avoid Atlanta curb tickets/boots. Tap "Summon to Curb" 2 mins before walking out.' },
    SUMMONED_BY_RIDER: { label: 'RIDER SUMMONED PILOT TO CURB!', color: '#f59e0b', desc: 'Rider is heading out of the venue! Pilot alerted to pull up to the pickup curb.' },
    PULLING_TO_CURB: { label: 'PILOT PULLING UP TO CURB (ETA ~90 SEC)', color: '#10b981', desc: 'Pilot has left the staging zone and is pulling up to the venue entrance.' },
    AT_CURB_HAZARDS: { label: 'OUTSIDE AT CURB · HAZARDS FLASHING', color: '#24d69a', desc: 'Pilot is waiting right at the curb with hazard lights on.' },
  };
  const curb = statusBadges[s.curbsideStatus] || statusBadges.NONE;
  const inStopWait = ['WAITING_HOP', 'WAITING_RETURN'].includes(s.tripState);
  const pings = (s.pings || []).slice(-4).reverse();

  return `<section class="card curbside-card">
    <div class="eyebrow">CURBSIDE STAGING & PRIVATE IN-APP COMMS · NO PHONE # EXPOSED</div>
    <div class="curbside-status-banner" style="border-color:${curb.color}66">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <strong style="color:${curb.color};font-size:13px">${curb.label}</strong>
        ${s.acceptedPilotPlate ? `<span class="live-pill">PLATE: ${esc(s.acceptedPilotPlate)}</span>` : ''}
      </div>
      <p class="cash-note" style="margin-top:4px;color:var(--text-secondary)">${curb.desc}</p>
    </div>

    ${role === 'rider' && inStopWait ? `
      <div class="curbside-action-grid" style="margin-top:12px">
        <button type="button" class="btn-primary" id="btn-summon-curb">🚨 Summon Pilot to Curb (Heading Out in 2 Min)</button>
        <div class="curbside-secondary-row">
          <button type="button" class="btn-secondary" id="btn-extend-15">⏱ +15 Min Standby (${money(getWaitBlockCents(15))})</button>
          <button type="button" class="btn-secondary" id="btn-ping-inside">👋 Check-In: Still Inside</button>
        </div>
      </div>
    ` : ''}

    ${role === 'rider' && !inStopWait ? `
      <div class="curbside-secondary-row" style="margin-top:12px">
        <button type="button" class="btn-secondary" id="btn-ping-ready">📍 I’m Standing at the Curb</button>
        <button type="button" class="btn-secondary" id="btn-ping-inside">👋 Be Right Out (1 Min)</button>
      </div>
    ` : ''}

    ${role === 'pilot' ? `
      <div class="curbside-secondary-row" style="margin-top:12px">
        <button type="button" class="btn-secondary" id="btn-pilot-staged">🅿️ Stage Nearby (Legal Standby)</button>
        <button type="button" class="btn-secondary" id="btn-pilot-pulling">🚗 Pulling to Curb Now</button>
        <button type="button" class="btn-secondary" id="btn-pilot-hazards">🚨 At Curb · Hazards On</button>
      </div>
    ` : ''}

    ${pings.length ? `
      <div class="ping-feed" style="margin-top:12px">
        <div class="eyebrow" style="margin-bottom:6px">LIVE TRIP CHECK-IN LOG</div>
        ${pings.map(p => `<div class="ping-item"><span class="ping-role ${p.role}">${p.role.toUpperCase()}</span><span>${esc(p.text)}</span><small>${new Date(p.timestamp).toLocaleTimeString()}</small></div>`).join('')}
      </div>
    ` : ''}
  </section>`;
}

function smsHref(phone, message) {
  const number = String(phone || '').replace(/[^\d+]/g, '');
  if (number.length < 7) return '';
  const delimiter = /iPhone|iPad|Macintosh/i.test(navigator.userAgent) ? '?&body=' : '?body=';
  return `sms:${number}${delimiter}${encodeURIComponent(message)}`;
}

function cashAppHref(value) {
  const input = String(value || '').trim();
  try {
    const url = new URL(input);
    if (url.protocol === 'https:' && url.hostname === 'cash.app' && url.username === '' && url.password === '' && url.pathname.length > 1) {
      return url.href;
    }
  } catch {}
  return '';
}

function renderSettlement(s, role) {
  const totalCents = s.routeQuote?.fare?.totalCents || 1200;
  const depositCents = s.depositStatus === 'HELD_DEMO' ? (s.depositAmountCents || Math.round(totalCents * 0.5)) : 0;
  const overrunCents = Math.round(((s.totalBillableStopWaitSeconds || 0) + (s.pickupWaitBillableSeconds || 0)) / 60 * RATE_CARD.overrunWaitMinuteCents);
  const balanceDueCents = Math.max(0, totalCents - depositCents + overrunCents);

  const summaryBanner = `<div class="settlement-summary-box">
    <div><span>Original Quoted Retainer</span><strong>${money(totalCents)}</strong></div>
    <div><span>50% Upfront Retainer Deposit (${s.depositStatus === 'HELD_DEMO' ? 'Locked' : 'Not Held'})</span><strong>−${money(depositCents)}</strong></div>
    ${overrunCents > 0 ? `<div><span>Metered Wait Overrun Past Grace</span><strong>+${money(overrunCents)}</strong></div>` : ''}
    <div class="settlement-balance-line"><span>Completion Balance Due Now</span><strong>${money(balanceDueCents)} USD</strong></div>
  </div>`;

  if (!s.settlementMode) {
    return `<section class="card cash-confirmation">
      <div class="eyebrow">SETTLEMENT · ROUNDTRIP COMPLETE</div>
      <h2 class="cash-title">Close out completion balance</h2>
      ${summaryBanner}
      ${role === 'rider'
        ? `<p class="page-subtitle">Choose how to settle the remaining balance (${money(balanceDueCents)} USD):</p>
           <div class="settlement-actions">
             <button class="btn-primary" id="choose-demo">Digital Checkout · Instant Demo Ledger</button>
             <button class="btn-secondary" id="choose-cashapp">Cash App · External Handoff</button>
             <button class="btn-secondary" id="choose-cash">Cash · Dual In-App Attestation</button>
           </div>`
        : '<p class="page-subtitle">Waiting for the rider to choose a settlement path.</p>'}
    </section>`;
  }
  if (s.settlementMode === 'CASH') return renderCashConfirmation(s, role, balanceDueCents, summaryBanner);
  if (s.settlementMode === 'CASHAPP') return renderExternalCashApp(s, role, balanceDueCents, summaryBanner);
  return renderDemoCheckout(s, role, balanceDueCents, summaryBanner);
}

function renderExternalCashApp(s, role, suggestedCents, summaryBanner) {
  const payment = s.externalPayment || { status: 'NOT_STARTED', amountCents: null, sentCents: null, receivedCents: null, attestations: { rider: false, pilot: false } };
  const defaultVal = ((payment.amountCents ?? suggestedCents) / 100).toFixed(2);
  const amount = payment.amountCents === null ? defaultVal : (payment.amountCents / 100).toFixed(2);
  const trip = String(s.tripId || '').slice(0, 8).toUpperCase();
  const contact = localStorage.getItem(`th_${role}_sms_contact`) || '';
  const tag = localStorage.getItem('th_pilot_cashapp_link') || '';
  const phoneId = role === 'rider' ? 'pilot-sms-contact' : 'rider-sms-contact';
  const label = role === 'rider' ? 'PILOT PHONE NUMBER (OPTIONAL)' : 'RIDER PHONE NUMBER (OPTIONAL)';
  let action = '';
  if (payment.status === 'NOT_STARTED') {
    action = role === 'rider'
      ? `<label class="eyebrow" for="external-fare">AGREED COMPLETION AMOUNT · USD</label>
         <div class="cash-input-row"><span>$</span><input id="external-fare" type="number" inputmode="decimal" min="0.01" max="10000" step="0.01" value="${defaultVal}" aria-label="Agreed amount in US dollars"><span>USD</span></div>
         <button class="btn-primary" id="save-external-fare">Set agreed amount</button>`
      : '<p class="page-subtitle">Waiting for rider to enter the agreed amount.</p>';
  } else if (payment.status === 'DISPUTED') {
    action = '<p role="alert" class="cash-dispute">Reported amounts differ. Contact each other and resolve directly in Cash App.</p>';
  } else if (payment.status === 'BOTH_ATTESTED') {
    action = `<strong class="cash-amount">Both parties attest to $${amount} USD</strong><p class="cash-note">Matching user report recorded.</p>`;
  } else {
    action = role === 'rider'
      ? `<label class="eyebrow" for="sent-amount">AMOUNT YOU SENT · USD</label>
         <div class="cash-input-row"><span>$</span><input id="sent-amount" type="number" inputmode="decimal" min="0.01" max="10000" step="0.01" value="${amount}" aria-label="Amount sent in US dollars"><span>USD</span></div>
         ${payment.attestations?.rider ? '<strong class="cash-amount">Your sent-payment report is recorded.</strong>' : '<button class="btn-secondary" id="attest-sent">I sent this amount in Cash App</button>'}`
      : `<label class="eyebrow" for="received-amount">AMOUNT YOU RECEIVED · USD</label>
         <div class="cash-input-row"><span>$</span><input id="received-amount" type="number" inputmode="decimal" min="0.01" max="10000" step="0.01" value="${amount}" aria-label="Amount received in US dollars"><span>USD</span></div>
         ${payment.attestations?.pilot ? '<strong class="cash-amount">Your received-payment report is recorded.</strong>' : '<button class="btn-secondary" id="attest-received">I received this amount in Cash App</button>'}`;
  }
  return `<section class="card cash-confirmation">
    <div class="eyebrow">CASH APP · EXTERNAL PAYMENT</div>
    <h2 class="cash-title">${payment.status === 'BOTH_ATTESTED' ? 'Trip handoff complete' : payment.status === 'DISPUTED' ? 'Payment amount mismatch' : 'Complete the external payment handoff'}</h2>
    ${summaryBanner}
    ${payment.amountCents !== null ? `<strong class="cash-amount">Agreed: $${amount} USD · Trip ${trip}</strong>` : ''}
    ${action}
    <div class="cash-input-row"><label class="eyebrow" for="${phoneId}">${label}</label><input id="${phoneId}" type="tel" autocomplete="tel" maxlength="30" value="${esc(contact)}" placeholder="+1 555 555 5555"></div>
    ${role === 'rider'
      ? `<div class="cash-input-row"><label class="eyebrow" for="pilot-cashapp-link">PILOT CASH APP LINK</label><input id="pilot-cashapp-link" maxlength="300" value="${esc(tag)}" placeholder="https://cash.app/$PilotTag"></div>
         <div class="settlement-actions"><button class="btn-primary" id="open-cashapp">Open Cash App payment →</button><button class="btn-secondary" id="send-sms">Text pilot · review and tap Send</button></div>`
      : `<div class="settlement-actions"><button class="btn-secondary" id="send-sms">Text rider · review and tap Send</button></div>`}
    <p class="cash-roles"><span>Rider ${payment.attestations?.rider ? '✓' : '·'}</span><span>Pilot ${payment.attestations?.pilot ? '✓' : '·'}</span></p>
  </section>`;
}

function renderCashConfirmation(s, role, suggestedCents, summaryBanner) {
  const cash = s.cashConfirmation || { status: 'NOT_OFFERED', amountCents: null, attestations: { rider: false, pilot: false } };
  const status =
    cash.status === 'CONFIRMED'
      ? 'Both parties confirmed the cash exchange'
      : cash.status === 'DISPUTED'
        ? 'Amount mismatch · resolve directly'
        : cash.attestations?.[role]
          ? 'Your confirmation is recorded · waiting for the other person'
          : 'Confirm the agreed cash balance';
  const amount = cash.amountCents === null ? (suggestedCents / 100).toFixed(2) : (cash.amountCents / 100).toFixed(2);
  return `<section class="card cash-confirmation">
    <div class="eyebrow">CASH · NO PROCESSING FEE</div>
    <h2 class="cash-title">${status}</h2>
    ${summaryBanner}
    <div class="cash-roles"><span>Rider ${cash.attestations?.rider ? '✓' : '·'}</span><span>Pilot ${cash.attestations?.pilot ? '✓' : '·'}</span></div>
    ${cash.status === 'CONFIRMED'
      ? `<strong class="cash-amount">$${amount} USD · confirmed by both</strong>`
      : cash.status === 'DISPUTED'
        ? '<p role="alert" class="cash-dispute">The amounts did not match. No payment is marked verified.</p>'
        : !cash.attestations?.[role]
          ? `<label class="eyebrow" for="cash-amount">AGREED CASH AMOUNT · USD</label>
             <div class="cash-input-row"><span>$</span><input id="cash-amount" type="number" inputmode="decimal" min="0.01" max="10000" step="0.01" value="${amount}" aria-label="Agreed cash amount in US dollars"><span>USD</span></div>
             <button class="btn-primary" id="confirm-cash">${role === 'rider' ? 'Confirm I paid cash' : 'Confirm I received cash'}</button>`
          : `<strong class="cash-amount">Waiting for the other person’s confirmation</strong>`}
  </section>`;
}

function renderDemoCheckout(s, role, suggestedCents, summaryBanner) {
  const d = s.demoPayment || { status: 'NOT_STARTED', amountCents: null, estimatedFeeCents: null, pilotPayoutCents: null };
  const amount = d.amountCents === null ? (suggestedCents / 100).toFixed(2) : (d.amountCents / 100).toFixed(2);
  const fee = d.estimatedFeeCents === null ? '' : (d.estimatedFeeCents / 100).toFixed(2);
  const net = d.pilotPayoutCents === null ? '' : (d.pilotPayoutCents / 100).toFixed(2);
  let body = '';
  if (d.status === 'NOT_STARTED' || d.status === 'FARE_REJECTED') {
    body = role === 'rider'
      ? `<label class="eyebrow" for="demo-fare">AGREED COMPLETION BALANCE · USD</label>
         <div class="cash-input-row"><span>$</span><input id="demo-fare" type="number" inputmode="decimal" min="0.01" max="10000" step="0.01" value="${amount}" aria-label="Demo fare in US dollars"><span>USD</span></div>
         <button class="btn-primary" id="propose-demo-fare">${s.simulationMode ? 'Approve & Settle Demo Balance →' : 'Send fare to pilot for approval →'}</button>`
      : '<p class="page-subtitle">Waiting for the rider to enter the agreed demo fare.</p>';
  } else if (d.status === 'FARE_AWAITING_PILOT') {
    body = role === 'pilot'
      ? `<strong class="cash-amount">Proposed fare: $${amount} USD</strong>
         <div class="settlement-actions"><button class="btn-primary" id="approve-demo-fare">Approve fare</button><button class="btn-secondary" id="reject-demo-fare">Reject fare</button></div>`
      : `<strong class="cash-amount">$${amount} USD · awaiting pilot approval</strong>`;
  } else if (d.status === 'FARE_APPROVED') {
    body = role === 'rider'
      ? `<strong class="cash-amount">Pilot approved $${amount} USD</strong>
         <div class="settlement-actions"><button class="btn-primary" id="demo-success">Complete Demo Settlement ✓</button><button class="btn-secondary" id="demo-decline">Simulate Card Decline</button></div>`
      : `<strong class="cash-amount">Fare approved: $${amount} USD · waiting for rider test outcome</strong>`;
  } else if (d.status === 'TEST_SUCCEEDED') {
    body = `<strong class="cash-amount">Demo settlement succeeded · $${amount} USD</strong>
      <div class="cash-roles"><span>Processor fee (2.9% + $0.30): $${fee}</span><span>Pilot net payout: $${net}</span></div>
      <p class="cash-note">100% of standby retainer goes to the pilot minus standard card processing. No money moved in this demo.</p>`;
  } else if (d.status === 'TEST_DECLINED') {
    body = `<strong class="cash-amount">Demo payment declined · $${amount} USD</strong><p class="cash-note">No money moved. Reset the trip to start another scenario.</p>`;
  }
  return `<section class="card cash-confirmation">
    <div class="eyebrow">DIGITAL CHECKOUT · SIMULATION</div>
    <h2 class="cash-title">${d.status === 'TEST_SUCCEEDED' ? 'Demo ledger completed' : d.status === 'TEST_DECLINED' ? 'Demo decline scenario' : 'Approve & simulate settlement'}</h2>
    ${summaryBanner}
    ${body}
  </section>`;
}

function renderRateCard() {
  const example = calculateFare({ distanceMiles: 6, activeSeconds: 18 * 60, hops: [{ waitMinutes: 30 }] });
  return `<details class="details-card">
    <summary>How TRICKHOPPER Nightlife Retainer pricing works</summary>
    <section class="card rate-card">
      <div class="eyebrow">NIGHTLIFE RETAINER RATE CARD · USD</div>
      <h2 class="cash-title">Transparent, pilot-fair roundtrip pricing</h2>
      <div class="rate-grid">
        <span>Roundtrip Dispatch Base</span><strong>${money(RATE_CARD.baseFareCents)}</strong>
        <span>Per Road / GPS Mile</span><strong>${money(RATE_CARD.perMileCents)}</strong>
        <span>Per Active Driving Minute</span><strong>${money(RATE_CARD.perActiveMinuteCents)}</strong>
        <span>15-Min Quick Hop Standby</span><strong>${money(WAIT_TIERS[15].blockCents)} ($0.40/min)</strong>
        <span>30-Min Lounge Hold Standby</span><strong>${money(WAIT_TIERS[30].blockCents)} ($0.45/min)</strong>
        <span>60-Min VIP Club Standby</span><strong>${money(WAIT_TIERS[60].blockCents)} ($0.45/min)</strong>
        <span>Overrun Past Reserved + 2m Grace</span><strong>${money(RATE_CARD.overrunWaitMinuteCents)}/min</strong>
        <span>Upfront Pilot Protection Deposit</span><strong>50% of Estimate</strong>
        <span>Minimum Roundtrip Retainer</span><strong>${money(RATE_CARD.minimumFareCents)}</strong>
      </div>
      <p class="cash-note">Example: 6 mi roundtrip + 18 active min + 30-min Lounge Hold = ${money(example.totalCents)} USD (${money(example.upfrontDepositCents)} upfront deposit, ${money(example.completionBalanceCents)} on return) vs. ~${money(example.uberSurgeEstimateCents)} for two separate 1.95x surged rideshare trips.</p>
    </section>
  </details>`;
}

function renderRouteQuote(quote, passengerCount = 1, holdDeposit = true) {
  if (!quote) return '';
  const route = quote.route || {};
  const fare = quote.fare || {};
  const hops = quote.hops || [{ destination: quote.destination, waitMinutes: quote.waitMinutes || 15 }];
  const legs = route.legs || [route.outbound, route.return].filter(Boolean);
  const perPersonCents = Math.round((fare.totalCents || 0) / Math.max(1, Number(passengerCount) || 1));
  const savingsCents = Math.max(0, (fare.uberSurgeEstimateCents || 0) - (fare.totalCents || 0));

  return `<section class="card route-quote-card">
    <div class="eyebrow">ROUND-TRIP NIGHTLIFE ITINERARY ESTIMATE · USD</div>
    <h2 class="cash-title">${hops.length > 1 ? `${hops.length}-Stop Atlanta Nightlife Loop` : esc(quote.destination?.label || 'Selected Destination')}</h2>
    <div class="route-itinerary">
      <div>📍 <strong>Origin & Return:</strong> Current Pickup Location</div>
      ${hops.map((hop, idx) => `
        <div class="route-hop-line">
          <span><strong>Hop ${idx + 1} · ${esc(hop.destination?.label || hop.destination?.query)}</strong></span>
          <strong>Leg ${idx + 1}: ${Number(legs[idx]?.distanceMiles || 0).toFixed(1)} mi · ${shortMinutes(legs[idx]?.durationSeconds)} drive · ${hop.waitMinutes} min (${esc(WAIT_TIERS[hop.waitMinutes]?.label || 'Standby')})</strong>
        </div>
      `).join('')}
      <div class="route-hop-line">
        <span>↩ <strong>Guaranteed Return Leg → Original Pickup</strong></span>
        <strong>${Number(legs.at(-1)?.distanceMiles || 0).toFixed(1)} mi · ${shortMinutes(legs.at(-1)?.durationSeconds)} drive</strong>
      </div>
    </div>

    <div class="route-leg-grid">
      <span>Total Round-Trip Distance & Drive Time</span>
      <strong>${Number(route.totalDistanceMiles || 0).toFixed(1)} mi · ${shortMinutes(route.totalDurationSeconds)}</strong>
    </div>

    <div class="fare-estimate">
      <span>Roundtrip Dispatch Base</span><strong>${money(fare.baseCents || 0)}</strong>
      <span>Road Distance (${Number(route.totalDistanceMiles || 0).toFixed(1)} mi)</span><strong>${money(fare.distanceCents || 0)}</strong>
      <span>Active Drive Time (${shortMinutes(route.totalDurationSeconds)})</span><strong>${money(fare.timeCents || 0)}</strong>
      ${hops.map((hop, idx) => `
        <span>Hop ${idx + 1} Standby (${hop.waitMinutes}m ${esc(WAIT_TIERS[hop.waitMinutes]?.label || '')})</span>
        <strong>${money(getWaitBlockCents(hop.waitMinutes))}</strong>
      `).join('')}
      <span>Total Roundtrip Retainer</span><strong>${money(fare.totalCents || 0)} USD</strong>
    </div>

    <div class="deposit-split-banner">
      <div>
        <span class="eyebrow" style="color:#6ee7b7">PILOT & RIDER PROTECTION SPLIT</span>
        <strong>50% Upfront Hold: ${money(fare.upfrontDepositCents || 0)} · Return Balance: ${money(fare.completionBalanceCents || 0)}</strong>
        <small>Splitting across ${passengerCount} ${passengerCount === 1 ? 'rider' : 'riders'}: <strong>${money(perPersonCents)} / person</strong></small>
      </div>
      ${savingsCents > 0 ? `<span class="surge-save-badge">Save ~${money(savingsCents)} vs. 2 AM Surge</span>` : `<span class="surge-save-badge">0x Surge Locked</span>`}
    </div>

    <label class="deposit-checkbox-row">
      <input type="checkbox" id="toggle-hold-deposit" ${holdDeposit ? 'checked' : ''}>
      <span>Lock 50% Upfront Retainer Deposit (${money(fare.upfrontDepositCents || 0)}) in demo ledger so pilot cannot be ghosted mid-hop.</span>
    </label>
  </section>`;
}

function renderWaitSegment(s, { label, start, end, activeState, elapsedKey, billableKey, includedSeconds = 0, elapsedValue, billableValue }) {
  const grace = Number(s.waitGraceSeconds || 120);
  const active = s.tripState === activeState;
  const elapsed = active && start ? Math.max(0, Math.floor((Date.now() - Date.parse(start)) / 1000)) : Number(elapsedValue ?? s[elapsedKey] ?? 0);
  const billable = active ? Math.max(0, elapsed - includedSeconds - grace) : Number(billableValue ?? s[billableKey] ?? 0);
  const accrued = money(Math.round((billable / 60) * RATE_CARD.overrunWaitMinuteCents));
  const reservedRemaining = Math.max(0, includedSeconds - elapsed);
  const graceRemaining = Math.max(0, includedSeconds + grace - elapsed);
  const remaining =
    reservedRemaining > 0
      ? `${fmtDuration(reservedRemaining)} reserved standby remaining`
      : graceRemaining > 0
        ? `${fmtDuration(graceRemaining)} free grace remaining`
        : `${fmtDuration(billable)} overrun · ${accrued} accrued`;
  const status = active ? 'CLOCK RUNNING' : end ? 'CLOSED' : start ? 'STARTED' : 'NOT STARTED';

  return `<div class="wait-segment">
    <div class="eyebrow">${label} · ${status}</div>
    ${start
      ? `<div class="return-wait-timer"><strong>${fmtDuration(elapsed)}</strong><span>${remaining}</span></div>
         <p class="cash-note">Started ${new Date(start).toLocaleTimeString()}${end ? ` · ended ${new Date(end).toLocaleTimeString()}` : ''}. ${
           includedSeconds
             ? `${Math.floor(includedSeconds / 60)}-min reserved block + ${Math.floor(grace / 60)}-min grace; overrun is ${money(RATE_CARD.overrunWaitMinuteCents)}/min.`
             : `${Math.floor(grace / 60)}-min pickup grace; overrun is ${money(RATE_CARD.overrunWaitMinuteCents)}/min.`
         }</p>`
      : `<p class="cash-note">Clock starts when the pilot records arrival. Synchronized across both portals.</p>`}
  </div>`;
}

function renderReturnWait(s, role) {
  const hops = s.routeQuote?.hops || [{ destination: s.destination, waitMinutes: s.routeQuote?.waitMinutes || 15 }];
  const current = Math.min(Number(s.stopIndex || 0), Math.max(0, hops.length - 1));
  const waits = s.stopWaits || [];

  return `<section class="card return-wait-card">
    <div class="eyebrow">WAIT-AND-RETURN · SYNCHRONIZED STOP TIMELINE</div>
    <h2 class="cash-title">Shared Standby & Wait Record</h2>
    ${renderWaitSegment(s, {
      label: 'Pickup wait',
      start: s.pickupArrivedAt,
      end: s.rideStartedAt,
      activeState: 'WAITING_PICKUP',
      elapsedKey: 'pickupWaitElapsedSeconds',
      billableKey: 'pickupWaitBillableSeconds',
    })}
    ${hops.map((hop, idx) => {
      const record = waits[idx] || {};
      const isActiveHop = idx === current && ['WAITING_HOP', 'WAITING_RETURN'].includes(s.tripState);
      return `<div class="stop-timeline ${idx === current ? 'current-stop' : ''}">
        <strong>Hop ${idx + 1} · ${esc(hop?.destination?.label || hop?.destination?.query || 'Stop')}</strong>
        ${renderWaitSegment(s, {
          label: `Reserved Standby · ${hop?.waitMinutes || 15} min (${WAIT_TIERS[hop?.waitMinutes]?.label || 'Standby'})`,
          start: record.arrivedAt || (idx === hops.length - 1 ? s.destinationArrivedAt : null),
          end: record.departedAt || (idx === hops.length - 1 ? s.returnStartedAt : null),
          activeState: isActiveHop ? s.tripState : '',
          elapsedKey: 'returnWaitElapsedSeconds',
          billableKey: 'returnWaitBillableSeconds',
          elapsedValue: record.elapsedSeconds,
          billableValue: record.billableSeconds,
          includedSeconds: Number(hop?.waitMinutes || 15) * 60,
        })}
      </div>`;
    }).join('')}

    ${role === 'pilot' && s.tripState === 'EN_ROUTE'
      ? '<button class="btn-primary btn-in-car" id="arrive-pickup">📍 Arrived at Pickup · Start Pickup Timer</button>'
      : ''}
    ${role === 'pilot' && s.tripState === 'WAITING_PICKUP'
      ? '<button class="btn-primary btn-in-car" id="start-outbound">🚀 Rider Boarded · Start Outbound Route →</button>'
      : ''}
    ${role === 'pilot' && s.tripState === 'ACTIVE'
      ? `<div class="settlement-actions">
           <button class="btn-primary btn-in-car" id="arrive-current-stop">🅿️ Arrived at Hop ${current + 1} · Start Standby Timer</button>
           <button class="btn-secondary" id="complete-ride" ${!s.simulationMode && (!s.gpsActiveByRole.pilot || (s.fixCounts.pilot || 0) < 2) ? 'disabled' : ''}>Complete One-Way Trip Early</button>
         </div>`
      : ''}
    ${role === 'pilot' && s.tripState === 'WAITING_HOP'
      ? `<button class="btn-primary btn-in-car" id="start-next-hop">➡️ Rider Boarded · Depart Hop ${current + 1} for Hop ${current + 2} →</button>`
      : ''}
    ${role === 'pilot' && s.tripState === 'WAITING_RETURN'
      ? '<button class="btn-primary btn-in-car" id="start-return-leg">↩️ Rider Boarded · Start Return Leg to Pickup →</button>'
      : ''}
  </section>`;
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;
  const retainedLiveMap = root.querySelector('#live-map');
  const focusedInput = document.activeElement?.dataset?.stopIndex !== undefined
    ? { id: document.activeElement.id, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }
    : null;

  const s = store.getState();
  const role = s.activeMode;
  const pilot = role === 'pilot';
  const own = s.liveLocations[role];
  const ownActive = s.gpsActiveByRole[role];

  const stageCopy = {
    IDLE: 'Ready when you are',
    REQUESTED: 'Ride request in queue',
    EN_ROUTE: 'Pilot en route to pickup',
    WAITING_PICKUP: 'Pilot outside · pickup wait',
    ACTIVE: `Driving to Hop ${(s.stopIndex || 0) + 1}`,
    WAITING_HOP: `Standby at Hop ${(s.stopIndex || 0) + 1}`,
    WAITING_RETURN: 'Standby at final stop · ready for return',
    RETURNING: 'Return trip to original pickup',
    COMPLETED: 'Roundtrip complete',
  }[s.tripState] || 'Ready';

  let controls = '';

  if (s.tripState === TRIP_STATES.IDLE && !pilot && !s.bookingPickup) {
    controls = `<section class="card nightlife-planner booking-card">
      <div class="booking-step-label"><span>1</span><span>Set Pickup Location</span></div>
      <h2 class="booking-title">Where should your pilot pick you up & return you?</h2>
      <p class="booking-intro">Share your live phone GPS or use our 1-tap Midtown Atlanta Demo Pickup to test the full multi-hop flow immediately.</p>
      <div class="planner-origin">
        <div>
          <span class="eyebrow">ORIGIN & GUARANTEED RETURN POINT</span>
          <strong>${s.gpsRequestingByRole?.rider ? 'Requesting browser GPS…' : 'Midtown / Current Location'}</strong>
          <small>Used as both your starting pickup and your final return drop-off.</small>
        </div>
        <span class="live-pill">${s.gpsRequestingByRole?.rider ? 'LOCATING…' : 'STEP 1'}</span>
      </div>
      <div class="settlement-actions">
        <button class="btn-primary booking-action" id="start-request" ${s.gpsRequestingByRole?.rider ? 'disabled' : ''}>
          ${s.gpsRequestingByRole?.rider ? 'Finding your location…' : '📍 Use My Live GPS Location →'}
        </button>
        <button class="btn-secondary" id="use-demo-gps">
          ⚡ Use Midtown Atlanta Demo Pickup (Instant Test) →
        </button>
      </div>
      ${s.gpsErrors.rider ? `<p class="gps-inline-error" role="alert">${esc(s.gpsErrors.rider)}</p>` : ''}
    </section>`;
  }

  if (s.tripState === TRIP_STATES.IDLE && !pilot && s.bookingPickup) {
    const stops = s.stops || [{ destination: '', waitMinutes: 30, suggestions: [] }];
    controls = `<section class="card destination-card nightlife-planner booking-card">
      <div class="booking-step-label"><span>2</span><span>Build Your Nightlife Loop (Up to 3 Hops)</span></div>
      <h2 class="booking-title">Where are you hopping tonight?</h2>
      <p class="booking-intro">Select up to 3 stops and reserve your pilot’s standby wait window at each venue.</p>

      <div class="planner-origin compact-origin">
        <div>
          <span class="eyebrow">PICKUP & RETURN POINT CONFIRMED</span>
          <strong>${Number(s.bookingPickup.lat).toFixed(4)}, ${Number(s.bookingPickup.lng).toFixed(4)} (Atlanta)</strong>
          <small>GPS accuracy ±${Math.round(s.bookingPickup.accuracy || 8)} m</small>
        </div>
        <span class="live-pill">READY</span>
      </div>

      <div class="hop-list">
        ${stops.map((stop, idx) => `
          <article class="hop-card">
            <div class="hop-heading">
              <strong>Hop ${idx + 1} · ${idx === 0 ? 'Primary Destination' : `Additional Stop ${idx + 1}`}</strong>
              ${stops.length > 1 ? `<button type="button" class="remove-hop" data-remove-hop="${idx}">✕ Remove</button>` : ''}
            </div>
            <label class="eyebrow" for="destination-input-${idx}">VENUE NAME OR STREET ADDRESS</label>
            <input
              class="destination-input"
              id="destination-input-${idx}"
              data-stop-index="${idx}"
              maxlength="180"
              value="${esc(stop.destination || '')}"
              placeholder="e.g. Magic City, Ponce City Market, Waffle House…"
              autocomplete="off"
            >
            ${stop.suggestions?.length ? `
              <div class="address-results" role="listbox" aria-label="Suggested Atlanta places">
                ${stop.suggestions.map((sug, sIdx) => `
                  <button type="button" class="address-result" data-suggest-stop="${idx}" data-suggest-idx="${sIdx}">
                    <strong>${esc(sug.name || sug.label)}</strong>
                    <small>${esc(sug.label)}</small>
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <div class="spot-picks">
              <span class="eyebrow">QUICK-PICK ATLANTA NIGHTLIFE SPOTS</span>
              <div class="spot-pick-list">
                ${POPULAR_ATL_SPOTS.map(place => `
                  <button type="button" class="spot-pick ${stop.destination === place ? 'active' : ''}" data-pick-stop="${idx}" data-place="${esc(place)}">
                    ${esc(place.split(',')[0])}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="wait-choice">
              <div class="wait-choice-title">Reserve Pilot Standby Window at Hop ${idx + 1}</div>
              <div class="wait-choice-buttons">
                ${[15, 30, 60].map(minutes => {
                  const tier = WAIT_TIERS[minutes];
                  const selected = Number(stop.waitMinutes || 30) === minutes;
                  return `<button
                    type="button"
                    class="btn-secondary wait-choice-button ${selected ? 'selected' : ''}"
                    data-wait-stop="${idx}"
                    data-wait-minutes="${minutes}"
                    aria-pressed="${selected}"
                  >
                    <span>${minutes} min · ${esc(tier.label)}</span>
                    <strong>${money(tier.blockCents)}</strong>
                  </button>`;
                }).join('')}
              </div>
              <small class="booking-footnote">Pilot stages legally nearby & pulls to the curb in 2 mins when you summon. Includes a 2-min grace period before ${money(RATE_CARD.overrunWaitMinuteCents)}/min overrun.</small>
            </div>
          </article>
        `).join('')}
      </div>

      ${stops.length < 3 ? `<button type="button" class="add-hop" id="add-hop">+ Add Another Hop Stop (${stops.length}/3)</button>` : ''}

      <div class="party-row" style="margin:14px 0">
        <label class="eyebrow" for="passenger-count">PARTY SIZE (FOR FARE SPLIT & VEHICLE CAPACITY)</label>
        <select id="passenger-count" class="destination-input">
          ${[1, 2, 3, 4].map(n => `<option value="${n}" ${Number(s.passengerCount || 2) === n ? 'selected' : ''}>${n} ${n === 1 ? 'Rider (Solo VIP)' : `Riders (Split Fare ÷ ${n})`}</option>`).join('')}
        </select>
      </div>

      ${s.routeError ? `<p class="cash-dispute" role="alert">${esc(s.routeError)}</p>` : ''}

      <button type="button" class="btn-secondary" id="build-route" ${s.routeLoading ? 'disabled' : ''}>
        ${s.routeLoading ? 'Calculating Atlanta road route…' : 'Calculate Upfront Round-Trip Estimate →'}
      </button>

      ${s.routeQuote ? `
        ${renderRouteQuote(s.routeQuote, s.passengerCount, s.holdDeposit)}
        <div class="settlement-actions">
          <button type="button" class="btn-primary booking-action" id="request-demo-autopilot">
            ⚡ Request & Launch Auto-Pilot Demo (${money(s.routeQuote.fare?.totalCents || 0)}) →
          </button>
          <button type="button" class="btn-secondary" id="request-estimated-trip">
            📡 Send Request to Live Pilot Console (/driver) →
          </button>
        </div>
      ` : ''}
    </section>`;
  }

  if (pilot && s.tripState === TRIP_STATES.IDLE) {
    controls = `<section class="card">
      <div class="eyebrow">PILOT CONSOLE · STANDBY QUEUE</div>
      <h2 class="cash-title">Waiting for next rider itinerary</h2>
      <p class="page-subtitle">Keep this console open on your dash. When a rider submits a trip on <code>/</code>, it appears here automatically with full hop & retainer details.</p>
      <div class="pilot-profile-grid">
        <div>
          <label class="eyebrow" for="pilot-name-input">YOUR PILOT CALLSIGN</label>
          <input class="destination-input" id="pilot-name-input" value="${esc(s.pilotName || '')}" maxlength="50">
        </div>
        <div>
          <label class="eyebrow" for="pilot-vehicle-input">VEHICLE DESCRIPTION</label>
          <input class="destination-input" id="pilot-vehicle-input" value="${esc(s.pilotVehicle || '')}" maxlength="80">
        </div>
      </div>
    </section>`;
  }

  if (pilot && s.tripState === TRIP_STATES.REQUESTED && !store.token) {
    const hops = s.routeQuote?.hops || (s.destination ? [{ destination: s.destination, waitMinutes: s.routeQuote?.waitMinutes || 15 }] : []);
    controls = `<section class="card">
      <div class="eyebrow">NEW NIGHTLIFE ROUNDTRIP REQUEST · ${s.passengerCount || 1} PASSENGER(S)</div>
      <h2 class="cash-title">${hops.length}-Hop Roundtrip · ${money(s.routeQuote?.fare?.totalCents || 0)} Est.</h2>
      <div class="route-itinerary" style="margin:10px 0">
        ${hops.map((h, i) => `<div><strong>Hop ${i + 1}:</strong> ${esc(h.destination?.label || 'Stop')} (${h.waitMinutes}m standby)</div>`).join('')}
      </div>
      <p class="page-subtitle">50% Upfront Deposit Protection: <strong>${money(s.routeQuote?.fare?.upfrontDepositCents || 0)}</strong>. Accept with Live GPS or Atlanta Demo GPS:</p>
      <div class="settlement-actions">
        <button class="btn-primary btn-in-car" id="accept-request">📍 Accept with Live Device GPS →</button>
        <button class="btn-secondary" id="accept-request-demo-gps">⚡ Accept with Midtown Demo GPS (Instant) →</button>
      </div>
    </section>`;
  }

  if (s.tripState === TRIP_STATES.RETURNING && pilot) {
    controls = `<button class="btn-primary btn-in-car" id="complete-ride" ${!s.simulationMode && (!ownActive || !own || (s.fixCounts.pilot || 0) < 2) ? 'disabled' : ''}>
      🏁 Complete Return Trip & Open Settlement →
    </button>`;
  }

  if (s.tripState === TRIP_STATES.COMPLETED) {
    controls = `<button class="btn-secondary" id="reset-trip" style="margin-top:12px">🔄 Clear Trip & Start Another Demo Run</button>`;
  }

  root.innerHTML = `<div class="app-shell ${pilot ? 'pilot-shell' : 'rider-shell'}">
    ${renderHeader(s)}
    <main class="content-body">
      ${!pilot && s.tripState === TRIP_STATES.IDLE ? `
        <section class="card rider-hero">
          <div class="eyebrow">ATLANTA NIGHTLIFE · DEDICATED ROUNDTRIP RIDES</div>
          <h1>Hop All Night.<br><span>Never Lose Your Ride.</span></h1>
          <p>Book one dedicated pilot for your entire night out. Reserve 15, 30, or 60-minute standby blocks while you hit the lounge, grab late-night food, or change fits—with zero 2 AM surge and a guaranteed return home.</p>
        </section>
      ` : ''}

      <section class="card trip-stage-card" style="padding:18px">
        <div class="eyebrow">${pilot ? 'PILOT DASHBOARD' : 'TRIP STATUS'} · ${s.simulationMode ? 'AUTO-PILOT DEMO' : 'LIVE SESSION'}</div>
        <h1 class="page-title" style="margin:6px 0">${stageCopy}</h1>
        <p class="page-subtitle" style="margin-bottom:0">${esc(
          s.notificationMessage ||
            (pilot
              ? 'Accept a request from the queue to pair portals and begin live telemetry.'
              : 'Set your pickup and hops below to calculate an upfront roundtrip retainer.')
        )}</p>
        ${s.acceptedPilotName ? `
          <div class="arrival-alert" role="status">
            <strong>Assigned Pilot: ${esc(s.acceptedPilotName)}</strong>
            <span>${esc(s.acceptedPilotVehicle || 'Verified SUV')} · Plate: ${esc(s.acceptedPilotPlate || 'ATL-HOP1')} · Deposit: ${s.depositStatus === 'HELD_DEMO' ? `Locked (${money(s.depositAmountCents || s.routeQuote?.fare?.upfrontDepositCents || 0)})` : 'Pending'}</span>
          </div>
        ` : ''}
      </section>

      ${renderDemoWalkthroughBar(s)}
      <div class="primary-flow">${controls}</div>
      ${renderCurbsideAndComms(s, role)}

      ${s.tripState !== TRIP_STATES.IDLE ? renderLiveMap(s) : ''}
      ${s.tripState !== TRIP_STATES.IDLE && s.routeQuote ? renderRouteQuote(s.routeQuote, s.passengerCount, s.holdDeposit) : ''}
      ${s.tripState !== TRIP_STATES.IDLE && s.tripState !== TRIP_STATES.REQUESTED ? renderReturnWait(s, role) : ''}
      ${s.tripState === TRIP_STATES.COMPLETED ? renderSettlement(s, role) : ''}

      ${!pilot && s.tripState === TRIP_STATES.IDLE ? renderWhyTrickhopper() : ''}
      ${renderRateCard()}

      <div class="footer-disclaimer" style="margin-top:16px">
        TRICKHOPPER Prototype · Built for live Atlanta multi-hop demonstration. Pilot actions stay operational even if the rider’s phone locks inside a venue.
      </div>
    </main>
  </div>`;

  const nextLiveMap = root.querySelector('#live-map');
  if (retainedLiveMap && nextLiveMap) nextLiveMap.replaceWith(retainedLiveMap);
  updateLiveMap(s);

  // Wire up event listeners
  document.getElementById('start-request')?.addEventListener('click', () => {
    const gps = store.pendingFixes.rider;
    if (store.getState().gpsActiveByRole.rider && gps && Date.now() - Date.parse(gps.timestamp) < 30000) {
      store.capturePickup(gps);
    } else {
      telemetry.startLiveGPS('rider', fix => store.capturePickup(fix));
    }
  });
  document.getElementById('use-demo-gps')?.addEventListener('click', () => {
    telemetry.useAtlantaDemoFix('rider', fix => store.capturePickup(fix));
  });

  document.querySelectorAll('[data-stop-index]').forEach(input => {
    input.addEventListener('input', event => {
      const idx = Number(event.target.dataset.stopIndex);
      const val = event.target.value;
      store.state.stops[idx].destination = val;
      store.state.stops[idx].selectedPlace = null;
      store.state.routeQuote = null;
      clearTimeout(input._sugTimer);
      input._sugTimer = setTimeout(() => store.suggestStopAddress(idx, val), 180);
    });
  });

  document.querySelectorAll('[data-suggest-stop]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stopIdx = Number(btn.dataset.suggestStop);
      const sugIdx = Number(btn.dataset.suggestIdx);
      const place = store.getState().stops?.[stopIdx]?.suggestions?.[sugIdx];
      if (place) store.setStopDestination(stopIdx, place.label || place.name, place);
    });
  });

  document.querySelectorAll('[data-pick-stop]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stopIdx = Number(btn.dataset.pickStop);
      store.setStopDestination(stopIdx, btn.dataset.place, null);
    });
  });

  document.querySelectorAll('[data-wait-stop]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.setStopWait(btn.dataset.waitMinutes, btn.dataset.waitStop);
    });
  });

  document.getElementById('add-hop')?.addEventListener('click', () => store.addStop());
  document.querySelectorAll('[data-remove-hop]').forEach(btn => {
    btn.addEventListener('click', () => store.removeStop(btn.dataset.removeHop));
  });

  document.getElementById('passenger-count')?.addEventListener('change', event => {
    store.state.passengerCount = Number(event.target.value) || 1;
    store.notify();
  });

  document.getElementById('toggle-hold-deposit')?.addEventListener('change', event => {
    store.state.holdDeposit = Boolean(event.target.checked);
    store.notify();
  });

  document.getElementById('build-route')?.addEventListener('click', () => {
    document.querySelectorAll('[data-stop-index]').forEach(input => {
      const idx = Number(input.dataset.stopIndex);
      if (store.state.stops[idx]) store.state.stops[idx].destination = input.value;
    });
    store.quoteDestination();
  });

  document.getElementById('request-estimated-trip')?.addEventListener('click', () => store.requestRide(false));
  document.getElementById('request-demo-autopilot')?.addEventListener('click', () => store.requestRide(true));

  document.getElementById('start-autopilot')?.addEventListener('click', () => store.startAutoPilot(true));
  document.getElementById('step-autopilot')?.addEventListener('click', () => store.stepAutoPilot());
  document.getElementById('pause-autopilot')?.addEventListener('click', () => store.pauseAutoPilot());

  document.getElementById('pilot-name-input')?.addEventListener('input', e => {
    store.state.pilotName = e.target.value;
    sessionStorage.setItem('trickhopper_pilot_name', e.target.value);
  });
  document.getElementById('pilot-vehicle-input')?.addEventListener('input', e => {
    store.state.pilotVehicle = e.target.value;
    sessionStorage.setItem('trickhopper_pilot_vehicle', e.target.value);
  });

  document.getElementById('accept-request')?.addEventListener('click', () => {
    telemetry.startLiveGPS('pilot', fix => store.claimOpenRequest(fix));
  });
  document.getElementById('accept-request-demo-gps')?.addEventListener('click', () => {
    telemetry.useAtlantaDemoFix('pilot', fix => store.claimOpenRequest(fix));
  });

  document.getElementById('arrive-pickup')?.addEventListener('click', () => store.waitEvent('arrive_pickup'));
  document.getElementById('start-outbound')?.addEventListener('click', () => store.waitEvent('start_outbound'));
  document.getElementById('arrive-current-stop')?.addEventListener('click', () => store.waitEvent('arrive_stop'));
  document.getElementById('start-next-hop')?.addEventListener('click', () => store.waitEvent('start_next_hop'));
  document.getElementById('start-return-leg')?.addEventListener('click', () => store.waitEvent('start_return'));
  document.getElementById('complete-ride')?.addEventListener('click', () => store.completeRide());

  // Curbside Summon, Wait Extension, and In-App Pings
  document.getElementById('btn-summon-curb')?.addEventListener('click', () => store.sendPing('SUMMON_CURB'));
  document.getElementById('btn-extend-15')?.addEventListener('click', () => store.extendWait(15));
  document.getElementById('btn-ping-inside')?.addEventListener('click', () => store.sendPing('STILL_INSIDE'));
  document.getElementById('btn-ping-ready')?.addEventListener('click', () => store.sendPing('READY_AT_CURB'));
  document.getElementById('btn-pilot-staged')?.addEventListener('click', () => store.sendPing('STAGED_NEARBY'));
  document.getElementById('btn-pilot-pulling')?.addEventListener('click', () => store.sendPing('PULLING_TO_CURB'));
  document.getElementById('btn-pilot-hazards')?.addEventListener('click', () => store.sendPing('AT_CURB_HAZARDS'));

  // Settlement listeners
  document.getElementById('choose-cash')?.addEventListener('click', () => store.chooseSettlement('CASH'));
  document.getElementById('choose-cashapp')?.addEventListener('click', () => store.chooseSettlement('CASHAPP'));
  document.getElementById('choose-demo')?.addEventListener('click', () => store.chooseSettlement('DEMO_DIGITAL'));
  document.getElementById('save-external-fare')?.addEventListener('click', () => store.externalPayment('propose', document.getElementById('external-fare')?.value));
  document.getElementById('attest-sent')?.addEventListener('click', () => store.externalPayment('attest_sent', document.getElementById('sent-amount')?.value));
  document.getElementById('attest-received')?.addEventListener('click', () => store.externalPayment('attest_received', document.getElementById('received-amount')?.value));
  for (const id of ['pilot-sms-contact', 'rider-sms-contact']) {
    document.getElementById(id)?.addEventListener('input', event => localStorage.setItem(`th_${role}_sms_contact`, event.target.value));
  }
  document.getElementById('pilot-cashapp-link')?.addEventListener('input', event => localStorage.setItem('th_pilot_cashapp_link', event.target.value));
  document.getElementById('open-cashapp')?.addEventListener('click', event => {
    event.preventDefault();
    const href = cashAppHref(document.getElementById('pilot-cashapp-link')?.value);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    else alert('Enter the pilot’s Cash App payment link (https://cash.app/$Tag).');
  });
  document.getElementById('send-sms')?.addEventListener('click', event => {
    event.preventDefault();
    const amount = store.getState().externalPayment?.amountCents;
    if (amount === null || amount === undefined) return alert('Set the agreed trip amount first.');
    const trip = String(store.getState().tripId || '').slice(0, 8).toUpperCase();
    const contact = document.getElementById(role === 'rider' ? 'pilot-sms-contact' : 'rider-sms-contact')?.value || '';
    const paymentLink = cashAppHref(document.getElementById('pilot-cashapp-link')?.value || localStorage.getItem('th_pilot_cashapp_link'));
    const text =
      role === 'rider'
        ? `TRICKHOPPER ride ${trip} complete. Agreed Cash App balance: $${(amount / 100).toFixed(2)} USD. ${paymentLink || ''}`
        : `TRICKHOPPER ride ${trip} complete. Confirmed $${(amount / 100).toFixed(2)} USD received via Cash App.`;
    const href = smsHref(contact, text);
    if (href) window.location.href = href;
    else alert('Enter a valid phone number first.');
  });
  document.getElementById('confirm-cash')?.addEventListener('click', async () => {
    const button = document.getElementById('confirm-cash');
    const amount = document.getElementById('cash-amount')?.value;
    button.disabled = true;
    const ok = await store.confirmCash(amount);
    if (!ok) button.disabled = false;
  });
  document.getElementById('propose-demo-fare')?.addEventListener('click', () => {
    store.demoPayment('propose', Math.round(Number(document.getElementById('demo-fare')?.value) * 100));
  });
  document.getElementById('approve-demo-fare')?.addEventListener('click', () => store.demoPayment('approve'));
  document.getElementById('reject-demo-fare')?.addEventListener('click', () => store.demoPayment('reject'));
  document.getElementById('demo-success')?.addEventListener('click', () => store.demoPayment('simulate_success'));
  document.getElementById('demo-decline')?.addEventListener('click', () => store.demoPayment('simulate_decline'));
  document.getElementById('reset-trip')?.addEventListener('click', () => store.resetTrip());

  if (focusedInput) {
    const input = document.getElementById(focusedInput.id);
    if (input) {
      input.focus({ preventScroll: true });
      try {
        input.setSelectionRange(focusedInput.start, focusedInput.end);
      } catch {}
    }
  }
}

let returnWaitTicker = null;
store.subscribe(state => {
  render();
  if (state.tripState === TRIP_STATES.COMPLETED) telemetry.stopLiveGPS(state.activeMode);
  if ([TRIP_STATES.WAITING_PICKUP, TRIP_STATES.WAITING_HOP, TRIP_STATES.WAITING_RETURN].includes(state.tripState) && !returnWaitTicker) {
    returnWaitTicker = setInterval(render, 1000);
  }
  if (![TRIP_STATES.WAITING_PICKUP, TRIP_STATES.WAITING_HOP, TRIP_STATES.WAITING_RETURN].includes(state.tripState) && returnWaitTicker) {
    clearInterval(returnWaitTicker);
    returnWaitTicker = null;
  }
});
render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(items => items.forEach(item => item.unregister()));
}
