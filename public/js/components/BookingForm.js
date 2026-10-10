/**
 * BookingForm Component
 * Multi-Stop Itinerary builder with automatic GPS coordinate distance routing.
 * All manual distance presets and steppers have been removed in favor of transparent GPS tracking.
 */

import { 
  PRESET_LOCATIONS, 
  PRESET_DESTINATIONS, 
  WAIT_PRESETS, 
  ATLANTA_CUSTOM_SUGGESTIONS,
  calculateHaversineDistanceMiles 
} from '../data.js';

export function renderBookingForm(state, { onUpdateField, onSubmitReview }) {
  const stops = state.stops && state.stops.length > 0 ? state.stops : [
    {
      id: 'stop_1',
      name: state.destination || PRESET_DESTINATIONS[0].name,
      category: state.category || PRESET_DESTINATIONS[0].category,
      waitMinutes: state.waitMinutes || 20,
    }
  ];

  const pricing = state.pricing;
  const pickup = state.pickup || PRESET_LOCATIONS[0].name;

  return `
    <div class="content-body">
      <div style="margin-bottom:16px;">
        <h1 class="page-title">Plan Your TRICKHOPPER Run 🐰</h1>
        <p class="page-subtitle">
          Add your nightlife hops across Atlanta. Pilot Dohntay waits curbside at each stop with your gear safe inside—calculated via real GPS coordinates.
        </p>
      </div>

      <!-- LIVE UPFRONT ESTIMATE BANNER -->
      <div class="upfront-estimate-banner">
        <div>
          <div class="upfront-estimate-label">Live Upfront Fare</div>
          <div class="upfront-estimate-sub">
            ${stops.length} Hop${stops.length > 1 ? 's' : ''} · ${pricing.totalWaitMinutes}m total curbside wait (${pricing.formatted.waitCharge})
          </div>
        </div>
        <div style="text-align:right;">
          <div class="upfront-estimate-val">${pricing.formatted.totalEstimate}</div>
          <div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;">
            ${pricing.distanceMiles} Total Mi · GPS Tracked
          </div>
        </div>
      </div>

      <form id="tripBookingForm" onsubmit="event.preventDefault();">
        <!-- 1. PICKUP LOCATION -->
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label class="form-label" for="inputPickup" style="margin-bottom:0;">
              📍 Origin / Starting Crib
            </label>
            <span style="font-size:11px;color:var(--text-tertiary);">Where nightlife run begins & ends</span>
          </div>

          <div class="input-wrapper">
            <input 
              type="text" 
              id="inputPickup" 
              class="input-field" 
              value="${pickup}" 
              placeholder="Enter apartment, hotel, or street address"
              autocomplete="off"
              required
            />
            ${pickup ? `<button type="button" class="input-clear-btn" id="btnClearPickup" title="Clear">✕</button>` : ''}
          </div>

          <!-- Quick Pickup Presets -->
          <div class="preset-grid" style="margin-top:6px;">
            ${PRESET_LOCATIONS.map(loc => `
              <button 
                type="button" 
                class="preset-btn ${pickup === loc.name ? 'active' : ''}" 
                data-preset-pickup="${loc.name}"
              >
                <div class="preset-name">${loc.name}</div>
                <div class="preset-sub">${loc.type}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 2. MULTI-STOP ITINERARY SECTION -->
        <div class="form-group" style="margin-top:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <label class="form-label" style="margin-bottom:0;">
                🐰 Nightlife Hops & Itinerary
              </label>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                Add up to 3 hops. Pilot Dohntay parks curbside at each stop with climate control active.
              </div>
            </div>
            <span style="font-size:11px;font-weight:800;background:var(--primary-subtle);color:var(--primary);padding:3px 8px;border-radius:12px;border:1px solid rgba(255,42,141,0.25);">
              ${stops.length} of 3 Hops
            </span>
          </div>

          <!-- RENDER EACH STOP -->
          <div style="display:flex;flex-direction:column;gap:14px;">
            ${stops.map((stop, idx) => {
              const prevLoc = idx === 0 ? pickup : stops[idx - 1].name;
              const legDist = calculateHaversineDistanceMiles(prevLoc, stop.name);
              const legFare = idx === 0 
                ? (3.50 + (legDist * 1.25)).toFixed(2)
                : (legDist * 1.25).toFixed(2);
              const stopWait = stop.waitMinutes || 20;
              const stopWaitCharge = (stopWait * 0.35).toFixed(2);

              return `
                <div class="card" style="border:1px solid rgba(255,42,141,0.25);background:var(--surface-card);padding:14px;border-radius:var(--radius-md);">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span style="background:var(--primary);color:#ffffff;font-size:11px;font-weight:800;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 8px rgba(255,42,141,0.4);">
                        ${idx + 1}
                      </span>
                      <strong style="font-size:13px;color:var(--text-primary);">
                        Hop ${idx + 1}${idx === 0 ? ' (First Destination)' : ''}
                      </strong>
                    </div>

                    ${stops.length > 1 ? `
                      <button 
                        type="button" 
                        class="btn-remove-stop" 
                        data-remove-stop-idx="${idx}"
                        style="background:transparent;border:none;color:#ef4444;font-size:11.5px;font-weight:700;cursor:pointer;padding:2px 6px;"
                      >
                        ✕ Remove Hop
                      </button>
                    ` : ''}
                  </div>

                  <!-- STOP INPUT -->
                  <div class="input-wrapper" style="margin-bottom:8px;">
                    <input 
                      type="text" 
                      class="input-field stop-address-input" 
                      data-stop-idx="${idx}"
                      value="${stop.name || ''}" 
                      placeholder="Type lounge, nightclub, bar, liquor store, hotel, or food spot..."
                      autocomplete="off"
                      required
                    />
                  </div>

                  <!-- TRANSPARENT GPS DISTANCE BADGE -->
                  <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,42,141,0.15);border-radius:var(--radius-sm);padding:6px 10px;margin-bottom:10px;font-size:11px;">
                    <span style="color:var(--text-secondary);">
                      📡 <strong>GPS Distance:</strong> ${legDist} mi from ${idx === 0 ? 'Crib' : `Hop ${idx}`}
                    </span>
                    <span style="font-weight:700;color:var(--primary);">
                      Transit: $${legFare}
                    </span>
                  </div>

                  <!-- STOP WAIT WINDOW SELECTOR -->
                  <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                      <span style="font-size:11px;font-weight:700;color:var(--text-secondary);">
                        Reserved Curbside Wait at Hop ${idx + 1}:
                      </span>
                      <span style="font-size:11px;font-weight:800;color:#f59e0b;">
                        ${stopWait} min ($${stopWaitCharge})
                      </span>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:6px;">
                      ${[10, 15, 20, 30, 45].map(mins => `
                        <button 
                          type="button" 
                          class="preset-btn ${stopWait === mins ? 'active' : ''}" 
                          data-stop-wait-btn="${mins}" 
                          data-stop-idx="${idx}"
                          style="padding:6px 2px;text-align:center;"
                        >
                          <div style="font-size:11.5px;font-weight:800;">${mins}m</div>
                          <div style="font-size:9.5px;color:var(--text-secondary);">$${(mins * 0.35).toFixed(2)}</div>
                        </button>
                      `).join('')}
                    </div>
                  </div>

                  <!-- QUICK POPULAR SPOT SUGGESTIONS -->
                  <div style="margin-top:10px;">
                    <div style="font-size:10.5px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:4px;">
                      Popular Atlanta Nightlife Spots:
                    </div>
                    <div class="popular-chips-wrap">
                      ${ATLANTA_CUSTOM_SUGGESTIONS.slice(idx * 3, (idx * 3) + 4).map(s => `
                        <button 
                          type="button" 
                          class="popular-chip ${stop.name === s.name ? 'active' : ''}" 
                          data-stop-chip-name="${s.name}"
                          data-stop-chip-idx="${idx}"
                          data-stop-chip-wait="${s.wait}"
                        >
                          <span>${s.name.split('(')[0].trim()}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- ADD STOP BUTTON (UP TO 3 STOPS) -->
          ${stops.length < 3 ? `
            <div style="margin-top:12px;">
              <button 
                type="button" 
                id="btnAddStopBtn" 
                class="btn-secondary" 
                style="width:100%;border-style:dashed;border-color:var(--primary);color:var(--primary);font-weight:800;padding:12px;background:rgba(255,42,141,0.06);"
              >
                + Add Another Hop 🐰 (Club, Lounge, Pre-Game, Wings, Hotel)
              </button>
            </div>
          ` : ''}
        </div>

        <!-- 3. RETURN LEG CONFIRMATION -->
        <div class="card" style="background:rgba(52,211,153,0.06);border-color:rgba(52,211,153,0.3);margin-top:20px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:16px;">↺</span>
              <strong style="font-size:13px;color:#34d399;">
                Return Hop: Roundtrip Back to the Crib
              </strong>
            </div>
            <span style="font-size:10.5px;font-weight:800;background:rgba(52,211,153,0.15);color:#34d399;padding:2px 8px;border-radius:10px;">
              20% Discount
            </span>
          </div>
          <div style="font-size:12px;color:#a7f3d0;line-height:1.5;">
            After your final hop, Pilot Dohntay returns you directly to <strong>${pickup}</strong>.
            Belongings stay safe inside the car, zero second booking, zero 3 AM surge, zero waiting in the cold.
          </div>
        </div>

        <!-- 4. TRANSPARENT GPS & TELEMETRY SUMMARY -->
        <div class="card" style="background:#090d16;color:#f8fafc;border-color:rgba(255,42,141,0.25);margin-top:16px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#ff2a8d;">
              🛰 Transparent GPS Route Tracking
            </span>
            <span style="font-size:10px;background:rgba(255,42,141,0.2);color:#ff2a8d;padding:2px 6px;border-radius:4px;font-weight:700;border:1px solid rgba(255,42,141,0.4);">
              Zero Manual Miles
            </span>
          </div>
          <div style="font-size:11.5px;color:#cbd5e1;line-height:1.6;">
            • <strong>Total Estimated Distance:</strong> ${pricing.distanceMiles} miles across ${stops.length + 1} nightlife legs.<br>
            • <strong>Total Reserved Curb Wait:</strong> ${pricing.totalWaitMinutes} min ($0.35/min transparent rate).<br>
            • Fares correspond strictly to actual route coordinates and real-time odometer logging.
          </div>
        </div>

        <!-- 5. PASSENGER COUNT -->
        <div class="form-group" style="margin-top:18px;">
          <label class="form-label">Passengers</label>
          <div style="display:flex;gap:10px;">
            ${[1, 2, 3, 4].map(num => `
              <button 
                type="button" 
                class="preset-btn ${state.riders === num ? 'active' : ''}" 
                style="flex:1;text-align:center;padding:12px;"
                data-riders-val="${num}"
              >
                <span style="font-size:15px;font-weight:800;">${num}</span>
                <div style="font-size:10px;color:var(--text-secondary);">${num === 1 ? 'Solo' : 'Group'}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- SUBMIT / PROCEED BUTTON -->
        <div style="margin-top:24px;">
          <button type="submit" class="btn-primary" id="btnSubmitReview">
            <span>Review Nightlife Route & Lock Fare 🐰</span>
            <span>→</span>
          </button>
        </div>
      </form>
    </div>
  `;
}
