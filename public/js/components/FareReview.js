/**
 * FareReview Component
 * Full itemized upfront summary of all transit legs and wait windows.
 * Integrated with Cash App Pay pre-auth hold and transparent GPS distance tracking.
 */

export function renderFareReview(state, { onConfirmBooking, onEditDetails, onSelectPaymentMethod, onUpdateRiderCashTag }) {
  const p = state.pricing;
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    { name: state.destination, waitMinutes: state.waitMinutes || 20 }
  ];
  const legs = p.legs || [];
  const returnLeg = legs.find(l => l.type === 'return_leg') || {
    from: stops[stops.length - 1].name,
    to: state.pickup,
    distanceMiles: p.distanceMiles,
    fare: p.returnLeg || 4.80,
  };

  const isCashApp = state.paymentMethod === 'cashapp';
  const holdBuffer = 15.00;
  const holdTotal = (p.totalEstimate + holdBuffer).toFixed(2);

  return `
    <div class="content-body">
      <div style="margin-bottom:16px;">
        <button id="btnBackToForm" style="background:transparent;border:none;color:var(--primary);font-size:13px;font-weight:700;cursor:pointer;padding:0 0 10px;">
          ← Back to trip details
        </button>
        <h1 class="page-title">TRICKHOPPER Route & Fare Review 🐰</h1>
        <p class="page-subtitle">
          Review your nightlife hops, curbside wait windows, and transparent upfront pricing before confirming.
        </p>
      </div>

      <!-- STYLIZED ROUTE SUMMARY CARD -->
      <div class="route-preview-box">
        <!-- ORIGIN -->
        <div class="route-leg-item">
          <div class="route-dot-wrap">
            <div class="route-dot"></div>
            <div class="route-connector"></div>
          </div>
          <div class="route-leg-content">
            <div class="route-leg-tag">Origin / Starting Crib</div>
            <div class="route-leg-name">${state.pickup}</div>
            <div class="route-leg-meta">Nightlife run begins here with Pilot ${state.driver.name}</div>
          </div>
        </div>

        <!-- STOPS -->
        ${stops.map((stop, idx) => {
          const legInfo = legs[idx] || {};
          const dist = legInfo.distanceMiles || 2.0;
          return `
            <div class="route-leg-item">
              <div class="route-dot-wrap">
                <div class="route-dot stop"></div>
                <div class="route-connector"></div>
              </div>
              <div class="route-leg-content">
                <div class="route-leg-tag" style="color:var(--warning);">
                  Hop ${idx + 1} & Curbside Wait · ${stop.waitMinutes || 20} Minutes · ${dist} mi (GPS)
                </div>
                <div class="route-leg-name">${stop.name}</div>
                <div class="route-leg-meta">
                  Pilot ${state.driver.name} holds vehicle curb position with climate control & security active
                </div>
              </div>
            </div>
          `;
        }).join('')}

        <!-- RETURN LEG -->
        <div class="route-leg-item">
          <div class="route-dot-wrap">
            <div class="route-dot return"></div>
          </div>
          <div class="route-leg-content">
            <div class="route-leg-tag" style="color:var(--success);">
              Return Hop to Crib · ${returnLeg.distanceMiles} mi (20% Roundtrip Discount)
            </div>
            <div class="route-leg-name">${state.pickup}</div>
            <div class="route-leg-meta">Pilot ${state.driver.name} brings you back safely to your front door</div>
          </div>
        </div>
      </div>

      <!-- ITEMIZED FARE BREAKDOWN CARD -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.06em;margin:0;">
            Transparent Nightlife Fare Breakdown
          </h2>
          <span style="font-size:10px;background:rgba(255,42,141,0.15);color:var(--primary);font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid rgba(255,42,141,0.3);">
            ${stops.length} Hop${stops.length > 1 ? 's' : ''} Run
          </span>
        </div>

        <div class="pricing-breakdown-table">
          <!-- Each Transit Leg & Wait -->
          ${stops.map((stop, idx) => {
            const legInfo = legs[idx] || {};
            const dist = legInfo.distanceMiles || 2.0;
            const fare = legInfo.fare ? legInfo.fare.toFixed(2) : (idx === 0 ? '6.00' : '2.50');
            const waitMins = stop.waitMinutes || 20;
            const waitCharge = (waitMins * 0.35).toFixed(2);

            return `
              <div class="pricing-row">
                <div>
                  <div class="pricing-item-name">
                    ${idx === 0 ? 'Crib to Hop 1' : `Hop ${idx} to Hop ${idx + 1}`}
                  </div>
                  <div class="pricing-item-desc">
                    ${dist} miles via GPS routing ${idx === 0 ? '($3.50 base + $1.25/mi)' : '($1.25/mi)'}
                  </div>
                </div>
                <div class="pricing-item-val">$${fare}</div>
              </div>

              <div class="pricing-row">
                <div>
                  <div class="pricing-item-name" style="color:#fbbf24;font-weight:800;">
                    Hop ${idx + 1} Guaranteed Curbside Wait
                  </div>
                  <div class="pricing-item-desc">
                    ${waitMins} mins reserved @ $0.35/min ($21.00/hr)
                  </div>
                </div>
                <div class="pricing-item-val" style="color:#fbbf24;font-weight:900;">$${waitCharge}</div>
              </div>
            `;
          }).join('')}

          <!-- Return Leg -->
          <div class="pricing-row">
            <div>
              <div class="pricing-item-name" style="color:#4ade80;font-weight:800;">
                Return Hop Back to Crib
              </div>
              <div class="pricing-item-desc">
                ${returnLeg.distanceMiles} miles back to ${state.pickup} (20% discount applied)
              </div>
            </div>
            <div class="pricing-item-val" style="color:#4ade80;font-weight:900;">
              $${Number(returnLeg.fare).toFixed(2)}
            </div>
          </div>

          <!-- Service Fee -->
          <div class="pricing-row">
            <div>
              <div class="pricing-item-name">Safety & Platform Fee</div>
              <div class="pricing-item-desc">Fixed transparent coverage</div>
            </div>
            <div class="pricing-item-val" style="font-weight:800;">$${p.serviceFee.toFixed(2)}</div>
          </div>

          <!-- Total Upfront Estimate -->
          <div class="pricing-row total" style="margin-top:10px;padding-top:12px;border-top:2px solid rgba(255,42,141,0.4);">
            <div>
              <div class="pricing-item-name" style="font-size:16px;font-weight:900;color:#ffffff;">Upfront Total Fare</div>
              <div class="pricing-item-desc" style="color:#cbd5e1;">Zero surge · ${p.distanceMiles} total miles · ${p.totalWaitMinutes}m wait</div>
            </div>
            <div class="pricing-item-val" style="font-size:24px;font-weight:900;color:#ff70ba;text-shadow:0 0 14px rgba(255,42,141,0.5);">
              ${p.formatted.totalEstimate}
            </div>
          </div>
        </div>
      </div>

      <!-- PAYMENT METHOD SELECTOR (CASH APP PAY EMPHASIS) -->
      <div class="card" style="margin-top:16px;">
        <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.06em;margin-bottom:12px;">
          Select Payment Method
        </h2>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <!-- I Have Cash Option -->
          <div 
            class="payment-option ${state.paymentMethod === 'cash' ? 'selected' : ''}" 
            id="optPayCash"
            style="border-color:${state.paymentMethod === 'cash' ? '#22c55e' : 'rgba(255,42,141,0.2)'};background:${state.paymentMethod === 'cash' ? 'rgba(34,197,94,0.12)' : '#150a28'};cursor:pointer;"
          >
            <div class="payment-icon" style="background:#15803d;color:#ffffff;font-size:18px;">💵</div>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:14px;color:#ffffff;display:flex;align-items:center;gap:6px;">
                <span>I Have Cash (Pay in Car)</span>
                <span style="font-size:9.5px;background:#15803d;color:#ffffff;padding:1px 6px;border-radius:10px;font-weight:800;">Cash in Hand</span>
              </div>
              <div style="font-size:12px;color:#cbd5e1;margin-top:2px;">
                Pay exact fare (<strong style="color:#4ade80;">${p.formatted.totalEstimate}</strong>) directly to Pilot ${state.driver.name} in vehicle.
              </div>
            </div>
            <input type="radio" name="payMethod" ${state.paymentMethod === 'cash' ? 'checked' : ''} style="accent-color:#22c55e;width:18px;height:18px;" />
          </div>

          <!-- Cash App Pay Option -->
          <div 
            class="payment-option ${state.paymentMethod === 'cashapp' ? 'selected' : ''}" 
            id="optPayCashApp"
            style="border-color:${state.paymentMethod === 'cashapp' ? '#00d632' : 'rgba(255,42,141,0.2)'};background:${state.paymentMethod === 'cashapp' ? 'rgba(0,214,50,0.12)' : '#150a28'};cursor:pointer;"
          >
            <div class="payment-icon" style="background:#00d632;color:#ffffff;font-size:18px;">$</div>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:14px;color:#ffffff;display:flex;align-items:center;gap:6px;">
                <span>Cash App Pay</span>
                <span style="font-size:9.5px;background:#00d632;color:#ffffff;padding:1px 6px;border-radius:10px;font-weight:800;">Instant Escrow</span>
              </div>
              <div style="font-size:12px;color:#cbd5e1;margin-top:2px;">
                Direct to Pilot ${state.driver.name} (<strong style="color:#34d399;">${state.driverCashTag || state.driver.cashTag}</strong>). Pre-authorizes estimate + $15 wait buffer.
              </div>
            </div>
            <input type="radio" name="payMethod" ${state.paymentMethod === 'cashapp' ? 'checked' : ''} style="accent-color:#00d632;width:18px;height:18px;" />
          </div>

          <!-- Zelle Instant Bank Transfer Option -->
          <div 
            class="payment-option ${state.paymentMethod === 'zelle' ? 'selected' : ''}" 
            id="optPayZelle"
            style="border-color:${state.paymentMethod === 'zelle' ? '#a855f7' : 'rgba(255,42,141,0.2)'};background:${state.paymentMethod === 'zelle' ? 'rgba(168,85,247,0.15)' : '#150a28'};cursor:pointer;"
          >
            <div class="payment-icon" style="background:#7c3aed;color:#ffffff;font-size:18px;font-weight:900;">🟣</div>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:14px;color:#ffffff;display:flex;align-items:center;gap:6px;">
                <span>Zelle Instant Transfer</span>
                <span style="font-size:9.5px;background:#7c3aed;color:#ffffff;padding:1px 6px;border-radius:10px;font-weight:800;">Direct to Pilot</span>
              </div>
              <div style="font-size:12px;color:#cbd5e1;margin-top:2px;">
                Send direct from bank app to <strong style="color:#c084fc;">${state.driver.zelleFormatted || '(943) 245-2611'}</strong>. Zero processing fees.
              </div>
            </div>
            <input type="radio" name="payMethod" ${state.paymentMethod === 'zelle' ? 'checked' : ''} style="accent-color:#a855f7;width:18px;height:18px;" />
          </div>
        </div>

        ${state.paymentMethod === 'zelle' ? `
          <!-- Zelle Payment Guidance Notice -->
          <div style="margin-top:14px;background:#180b2a;border:1.5px solid #a855f7;border-radius:var(--radius-sm);padding:14px;box-shadow:0 0 20px rgba(168,85,247,0.25);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:18px;">🟣</span>
                <div>
                  <strong style="color:#ffffff;font-size:13.5px;display:block;">Zelle Instant Transfer Details</strong>
                  <span style="font-size:11.5px;color:#d8b4fe;">Direct deposit to pilot driver ${state.driver.name}</span>
                </div>
              </div>
              <span style="font-size:10px;background:#7c3aed;color:#ffffff;font-weight:800;padding:2px 7px;border-radius:4px;">Direct Bank Payout</span>
            </div>

            <div style="background:#0e061a;border:1px solid rgba(168,85,247,0.3);border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:10.5px;color:#cbd5e1;text-transform:uppercase;font-weight:700;">Zelle Recipient Phone:</div>
                <div style="font-size:18px;font-weight:900;color:#ffffff;letter-spacing:0.03em;">${state.driver.zelleFormatted || '(943) 245-2611'}</div>
                <div style="font-size:11.5px;color:#c084fc;font-weight:700;">Registered Name: ${state.driver.name}</div>
              </div>
              <button 
                type="button" 
                id="btnCopyZelle" 
                data-zelle-number="${state.driver.zellePhone || '9432452611'}"
                style="background:#7c3aed;border:none;color:#ffffff;font-size:12px;font-weight:800;padding:8px 14px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(124,58,237,0.4);"
              >
                <span>📋</span>
                <span id="copyZelleText">Copy Number</span>
              </button>
            </div>

            <div style="font-size:12px;color:#e2d9fc;line-height:1.6;">
              • Open your bank app (Chase, Bank of America, Wells Fargo, Capital One, etc.)<br>
              • Select <strong>Zelle</strong> → Send <strong style="color:#ffffff;">${p.formatted.totalEstimate}</strong> to <strong style="color:#c084fc;">${state.driver.zelleFormatted || '(943) 245-2611'}</strong> (${state.driver.name})<br>
              • Tap below to confirm and your ride will be dispatched immediately!
            </div>
          </div>
        ` : ''}

        ${state.paymentMethod === 'cash' ? `
          <!-- Cash Payment Guidance Notice -->
          <div style="margin-top:14px;background:#092014;border:1.5px solid #22c55e;border-radius:var(--radius-sm);padding:14px;box-shadow:0 0 16px rgba(34,197,94,0.15);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:18px;">💵</span>
              <strong style="color:#4ade80;font-size:14px;">Agreed Cash Fare: ${p.formatted.totalEstimate}</strong>
            </div>
            <div style="font-size:12px;color:#dcfce7;line-height:1.6;">
              • Hand exact cash (<strong style="color:#ffffff;">${p.formatted.totalEstimate}</strong>) to <strong>${state.driver.name}</strong> upon boarding or completion.<br>
              • If you extend wait time (+$3.50 for +10m) or enter overtime ($0.50/min), pay the additional amount in cash.<br>
              • <strong style="color:#4ade80;">No digital hold or banking card required!</strong>
            </div>
          </div>
        ` : ''}

        ${state.paymentMethod === 'cashapp' ? `
          <!-- Rider CashTag -->
          <div style="margin-top:14px;background:#150a28;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid rgba(0,214,50,0.3);display:flex;justify-content:space-between;align-items:center;">
            <label for="inputRiderCashTag" style="font-size:12px;font-weight:700;color:#cbd5e1;">
              Your Cash App $cashtag:
            </label>
            <input 
              type="text" 
              id="inputRiderCashTag" 
              value="${state.riderCashTag || '$rider_guest'}" 
              style="background:#090514;border:1.5px solid #00d632;padding:6px 10px;border-radius:6px;font-size:13px;font-weight:800;color:#34d399;width:150px;text-align:right;"
            />
          </div>

          <!-- Pre-Auth Escrow Buffer Note -->
          <div style="margin-top:12px;background:rgba(0,214,50,0.08);border:1px solid rgba(0,214,50,0.3);border-radius:var(--radius-sm);padding:12px 14px;font-size:12px;line-height:1.6;color:#e2e8f0;">
            🔒 <strong style="color:#34d399;">Cash App Pre-Auth Hold: $${holdTotal}</strong><br>
            Direct escrow to pilot driver <strong>${state.driver.name} (${state.driverCashTag || state.driver.cashTag})</strong>. Includes your <strong style="color:#ffffff;">${p.formatted.totalEstimate}</strong> upfront estimate plus a <strong>$15.00 wait buffer</strong> so you can extend time at your stops without re-authorizing payment. Any unused buffer is released automatically upon return trip completion.
          </div>
        ` : ''}
      </div>

      <!-- CONFIRM CTA -->
      <div style="margin-top:24px;">
        <button class="btn-primary" id="btnConfirmBooking" style="background:${state.paymentMethod === 'cash' ? '#15803d' : state.paymentMethod === 'zelle' ? '#7c3aed' : 'var(--primary)'};color:#ffffff;box-shadow:${state.paymentMethod === 'cash' ? '0 4px 14px rgba(21,128,61,0.35)' : state.paymentMethod === 'zelle' ? '0 4px 14px rgba(124,58,237,0.35)' : '0 4px 14px rgba(255,42,141,0.35)'};">
          <span>${state.paymentMethod === 'cash' ? `Book with Cash · Pay ${p.formatted.totalEstimate} in Car 🐰 →` : state.paymentMethod === 'zelle' ? `Pay with Zelle (${p.formatted.totalEstimate}) & Confirm 🐰 →` : 'Hop In · Pay with Cash App & Confirm 🐰 →'}</span>
        </button>
      </div>
    </div>
  `;
}
