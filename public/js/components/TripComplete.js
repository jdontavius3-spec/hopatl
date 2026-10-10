/**
 * TripComplete Component
 * Final receipt breakdown, Cash App settlement details, multi-stop log,
 * confirmed GPS odometer mileage, and tipping simulation.
 */

export function renderTripComplete(state, { onPlanAnotherTrip, onSendTip }) {
  const p = state.pricing;
  const driver = state.driver;
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    { name: state.destination || 'Destination', waitMinutes: state.waitMinutes || 20 }
  ];
  const legs = p.legs || [];
  const returnLeg = legs.find(l => l.type === 'return_leg') || {
    from: stops[stops.length - 1].name,
    to: state.pickup,
    distanceMiles: p.distanceMiles,
    fare: p.returnLeg || 4.80,
  };

  const isCashApp = state.paymentMethod === 'cashapp';
  const isCash = state.paymentMethod === 'cash';
  const isZelle = state.paymentMethod === 'zelle';
  const holdTotal = (p.totalEstimate + 15.00).toFixed(2);
  const totalSettled = (p.totalEstimate + (state.tipAmount || 0)).toFixed(2);

  return `
    <div class="content-body">
      <!-- SUCCESS CELEBRATION HEADER -->
      <div style="text-align:center;padding:14px 0 20px;">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,42,141,0.15);color:var(--primary);font-size:32px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 0 20px rgba(255,42,141,0.3);border:1px solid rgba(255,42,141,0.4);">
          🐰
        </div>
        <h1 class="page-title">Nightlife Run Completed! 🐰</h1>
        <p class="page-subtitle" style="margin-bottom:0;">
          ${stops.length} hop${stops.length > 1 ? 's' : ''} completed. Pilot Dohntay brought you back safe. Zero 3 AM surge.
        </p>
      </div>

      <!-- TRIP SUMMARY & RECEIPT CARD -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border-light);margin-bottom:14px;">
          <div>
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-tertiary);">Transparent GPS Receipt</div>
            <div style="font-size:13.5px;font-weight:800;color:var(--text-primary);">${state.tripCompletedTime || 'Just now'}</div>
          </div>
          <span class="state-badge completed" style="background:${isCash ? 'rgba(34,197,94,0.15)' : isZelle ? 'rgba(168,85,247,0.15)' : 'rgba(255,42,141,0.15)'};color:${isCash ? '#4ade80' : isZelle ? '#c084fc' : 'var(--primary)'};border:1px solid ${isCash ? 'rgba(34,197,94,0.4)' : isZelle ? 'rgba(168,85,247,0.4)' : 'rgba(255,42,141,0.3)'};">
            ${isCash ? '💵 Paid in Cash (In Car)' : isZelle ? '🟣 Paid via Zelle Bank Transfer' : '💚 Paid with Cash App Pay'}
          </span>
        </div>

        <!-- GPS ODOMETER VERIFICATION TAG -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,42,141,0.15);border-radius:var(--radius-sm);padding:8px 12px;margin-bottom:14px;font-size:11.5px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-secondary);">
            🛰 <strong>Verified Route Mileage:</strong> ${p.distanceMiles} mi
          </span>
          <span style="color:var(--primary);font-weight:700;">
            GPS Logged ✓
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
                    ${idx === 0 ? 'Leg 1 (Crib to Hop 1)' : `Leg ${idx + 1} (Hop ${idx} to Hop ${idx + 1})`}
                  </div>
                  <div class="pricing-item-desc">${dist} mi via GPS</div>
                </div>
                <div class="pricing-item-val">$${fare}</div>
              </div>

              <div class="pricing-row">
                <div>
                  <div class="pricing-item-name">
                    Hop ${idx + 1} Curbside Wait (${waitMins} min)
                  </div>
                  <div class="pricing-item-desc">
                    ${stop.name} @ $0.35/min
                  </div>
                </div>
                <div class="pricing-item-val">$${waitCharge}</div>
              </div>
            `;
          }).join('')}

          <!-- Return Leg -->
          <div class="pricing-row">
            <div>
              <div class="pricing-item-name">Return Hop to Crib (${returnLeg.distanceMiles} mi)</div>
              <div class="pricing-item-desc">${state.pickup} (20% discount applied)</div>
            </div>
            <div class="pricing-item-val">$${Number(returnLeg.fare).toFixed(2)}</div>
          </div>

          <!-- Service Fee -->
          <div class="pricing-row">
            <div>
              <div class="pricing-item-name">Platform & Safety Fee</div>
            </div>
            <div class="pricing-item-val">$${p.serviceFee.toFixed(2)}</div>
          </div>

          ${state.tipAmount > 0 ? `
            <div class="pricing-row">
              <div>
                <div class="pricing-item-name" style="color:${isZelle ? '#c084fc' : isCash ? '#4ade80' : 'var(--primary)'};font-weight:700;">Driver Tip (${isZelle ? (driver.zelleFormatted || '(943) 245-2611') : state.driverCashTag})</div>
                <div class="pricing-item-desc">${isZelle ? 'Sent directly via Zelle' : isCash ? 'Handed in cash' : 'Sent instantly via Cash App'}</div>
              </div>
              <div class="pricing-item-val" style="color:${isZelle ? '#c084fc' : isCash ? '#4ade80' : 'var(--primary)'};">+$${state.tipAmount.toFixed(2)}</div>
            </div>
          ` : ''}

          <div class="pricing-row total">
            <div>
              <div class="pricing-item-name">Total Settled</div>
              <div class="pricing-item-desc">
                ${isCash ? 'Paid in cash directly to pilot driver in vehicle' : isZelle ? `Direct bank transfer to Dohntay at ${driver.zelleFormatted || '(943) 245-2611'}` : isCashApp ? `Pre-auth hold of $${holdTotal} settled; unused buffer released.` : 'Matched upfront estimate'}
              </div>
            </div>
            <div class="pricing-item-val" style="color:${isCash ? '#4ade80' : isZelle ? '#c084fc' : '#ff2a8d'};font-weight:900;font-size:22px;text-shadow:0 0 12px ${isCash ? 'rgba(74,222,128,0.3)' : isZelle ? 'rgba(192,132,252,0.3)' : 'rgba(255,42,141,0.3)'};">
              $${totalSettled}
            </div>
          </div>
        </div>

        ${isCash ? `
          <div style="background:#092014;border-radius:var(--radius-sm);padding:12px 14px;border:1px solid rgba(74,222,128,0.35);font-size:12px;color:#dcfce7;margin-top:14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 12px rgba(34,197,94,0.15);">
            <div>
              <strong style="color:#4ade80;">💵 Cash Payment Collected:</strong><br>
              <span style="color:#ffffff;font-weight:700;">${p.formatted.totalEstimate}</span> paid directly to ${driver.name} in vehicle.
            </div>
            <div style="font-weight:800;color:#4ade80;font-size:12px;background:rgba(34,197,94,0.2);padding:4px 8px;border-radius:6px;border:1px solid rgba(34,197,94,0.4);">Paid in Person ✓</div>
          </div>
        ` : isZelle ? `
          <div style="background:#180b2a;border-radius:var(--radius-sm);padding:12px 14px;border:1.5px solid rgba(168,85,247,0.35);font-size:12px;color:#f3e8ff;margin-top:14px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 14px rgba(168,85,247,0.2);">
            <div>
              <strong style="color:#c084fc;">🟣 Zelle Bank Transfer Verified:</strong><br>
              <span style="color:#ffffff;font-weight:700;">${p.formatted.totalEstimate}</span> transferred to Dohntay at <strong style="color:#c084fc;">${driver.zelleFormatted || '(943) 245-2611'}</strong>.
            </div>
            <div style="font-weight:800;color:#c084fc;font-size:12px;background:rgba(168,85,247,0.2);padding:4px 8px;border-radius:6px;border:1px solid rgba(168,85,247,0.4);">Direct to Bank ✓</div>
          </div>
        ` : isCashApp ? `
          <div style="background:rgba(255,42,141,0.08);border-radius:var(--radius-sm);padding:12px 14px;border:1px solid rgba(255,42,141,0.3);font-size:12px;color:var(--text-primary);margin-top:14px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <strong style="color:var(--primary);">Cash App Escrow Settled:</strong><br>
              <span style="color:#ffffff;font-weight:700;">${p.formatted.totalEstimate}</span> charged to ${state.riderCashTag || '$rider_guest'}.
            </div>
            <div style="font-weight:800;color:var(--primary);font-size:12px;background:rgba(255,42,141,0.15);padding:4px 8px;border-radius:6px;border:1px solid rgba(255,42,141,0.4);">Buffer Released ✓</div>
          </div>
        ` : ''}
      </div>

      <!-- DRIVER TIP SECTION -->
      <div class="card" style="margin-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div>
            <div style="font-size:13.5px;font-weight:800;color:var(--text-primary);">
              Add a Pilot Tip for ${driver.name}
            </div>
            <div style="font-size:11.5px;color:var(--text-secondary);">
              100% of tip goes directly to ${driver.name} via ${isZelle ? `Zelle (${driver.zelleFormatted || '(943) 245-2611'})` : isCash ? 'Cash' : `Cash App (${driver.cashTag})`}.
            </div>
          </div>
          <div style="font-size:11px;font-weight:800;color:${isZelle ? '#c084fc' : isCash ? '#4ade80' : 'var(--primary)'};">Direct Tip</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-top:8px;">
          ${[2, 5, 8].map(amt => `
            <button 
              type="button" 
              class="btn-secondary" 
              data-tip-val="${amt}"
              style="padding:10px;text-align:center;border-color:${state.tipAmount === amt ? (isZelle ? '#a855f7' : isCash ? '#22c55e' : 'var(--primary)') : 'var(--border-medium)'};background:${state.tipAmount === amt ? (isZelle ? 'rgba(124,58,237,0.2)' : isCash ? 'rgba(34,197,94,0.2)' : 'rgba(255,42,141,0.2)') : 'transparent'};color:${state.tipAmount === amt ? '#ffffff' : 'var(--text-primary)'};font-weight:800;"
            >
              +$${amt}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- RESET & PLAN ANOTHER TRIP -->
      <div style="margin-top:24px;">
        <button class="btn-primary" id="btnPlanAnother">
          <span>Plan Another TRICKHOPPER Run 🐰</span>
          <span>↺</span>
        </button>
      </div>
    </div>
  `;
}
