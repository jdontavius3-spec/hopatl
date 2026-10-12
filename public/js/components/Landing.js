/**
 * Landing Component
 * Explains the one-sentence use case and provides entry point into booking flow.
 */

export function renderLanding(state, { onStartBooking }) {
  return `
    <div class="content-body">
      <!-- HERO CALLOUT -->
      <div style="text-align:center;padding:16px 0 24px;">
        <div style="display:inline-block;background:var(--primary-subtle);color:var(--primary);font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;padding:4px 12px;border-radius:20px;margin-bottom:12px;border:1px solid rgba(255,42,141,0.3);">
          🐰 ATLANTA NIGHTLIFE BUNNY VIP SERVICE
        </div>
        <h1 class="page-title" style="font-size:28px;">
          Hop All Night. One Pilot Driver.<br><span style="color:var(--primary);">Never Lose Your Ride.</span>
        </h1>
        <p class="page-subtitle" style="max-width:390px;margin:10px auto 24px;font-size:15px;line-height:1.5;">
          Atlanta's late-night roundtrip rideshare. Dedicated fleet pilots Dohntay and Rocko wait curbside while you pre-game, hit the VIP lounge, grab a bite, or change fits—with guaranteed curbside wait and zero stranded rides.
        </p>

        <!-- PRIMARY CTA BUTTON -->
        <button class="btn-primary" id="btnPlanRide" style="font-size:16px;padding:18px 24px;margin-bottom:12px;">
          <span>Hop In · Plan a Nightlife Run 🐰</span>
          <span>→</span>
        </button>

        <!-- ADD TO HOME SCREEN / INSTALL PILL -->
        <div style="display:flex;justify-content:center;margin-bottom:24px;">
          <button id="btnHeroInstall" style="background:#130a24;border:1px solid rgba(255,42,141,0.3);color:#f8fafc;padding:6px 14px;border-radius:20px;font-size:11.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 12px rgba(255,42,141,0.15);">
            <span style="font-size:13px;">📲</span>
            <span>Save TRICKHOPPER to Home Screen (Mobile App)</span>
            <span style="color:#ff2a8d;font-size:11px;">→</span>
          </button>
        </div>
      </div>

      <!-- DEDICATED PILOT PORTALS CARD -->
      <div class="card" style="background:#090514;border:1.5px solid rgba(255,42,141,0.3);border-radius:var(--radius-md);padding:14px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">🚗</span>
            <strong style="font-size:13.5px;color:#ffffff;">Dedicated Pilot Portals</strong>
          </div>
          <span style="font-size:10.5px;background:#064e3b;color:#34d399;font-weight:800;padding:2px 8px;border-radius:10px;">2 Pilots Online</span>
        </div>
        <p style="font-size:12px;color:#cbd5e1;margin:0 0 12px;line-height:1.5;">
          Direct shift consoles with in-car telemetry, turn-by-turn navigation deep links, and instant Cash App payouts:
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <a href="/driver/dohntay" class="btn-secondary" style="background:#130a24;border:1.5px solid var(--primary);color:#ffffff;text-decoration:none;padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:3px;text-align:left;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:900;font-size:14px;color:#ffffff;">Dohntay's Portal</span>
              <span style="font-size:14px;">🐰</span>
            </div>
            <span style="font-size:12px;color:#00d632;font-weight:800;">$2243Dohntay</span>
            <span style="font-size:10.5px;color:#94a3b8;">Camry Hybrid · ATL-PILOT</span>
          </a>
          <a href="/driver/rocko" class="btn-secondary" style="background:#130a24;border:1.5px solid #a855f7;color:#ffffff;text-decoration:none;padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:3px;text-align:left;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:900;font-size:14px;color:#ffffff;">Rocko's Portal</span>
              <span style="font-size:14px;">🚗</span>
            </div>
            <span style="font-size:12px;color:#00d632;font-weight:800;">$chadowens46</span>
            <span style="font-size:10.5px;color:#94a3b8;">Accord Sport · ATL-ROCKO</span>
          </a>
        </div>
        <button id="btnLandingTestRocko" style="margin-top:10px;width:100%;background:linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);color:#ffffff;border:none;padding:11px 14px;border-radius:8px;font-size:12.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(168,85,247,0.35);">
          <span>⚡ Simulate In-Car Ride Request for Rocko ($22.00 Payout)</span>
          <span style="font-size:14px;">→</span>
        </button>
      </div>

      <!-- PRODUCT PROBLEM VS SOLUTION CARD -->
      <div class="card" style="margin-bottom:24px;">
        <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;color:var(--text-tertiary);letter-spacing:0.06em;margin-bottom:14px;">
          Why TRICKHOPPER?
        </h2>
        
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:50%;background:rgba(239,68,68,0.15);color:#f87171;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;border:1px solid rgba(239,68,68,0.3);">✕</div>
            <div>
              <div style="font-size:13.5px;font-weight:700;color:var(--text-primary);">Standard Rideshare Nightmares</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
                Waiting 35 mins at 2:30 AM outside Magic City or Tongue & Groove, paying 4x surge, getting cancelled on 3 times, leaving your jacket or belongings behind.
              </div>
            </div>
          </div>

          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:24px;height:24px;border-radius:50%;background:rgba(255,42,141,0.15);color:var(--primary);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;border:1px solid rgba(255,42,141,0.3);">🐰</div>
            <div>
              <div style="font-size:13.5px;font-weight:700;color:var(--text-primary);">The Nightlife Bunny Model</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
                Dedicated pilot drivers Dohntay (<code>ATL-PILOT</code>) and Rocko (<code>ATL-ROCKO</code>) stay curbside with your belongings locked safe inside and AC/heat running. Transparent wait pay, zero surge, return hop right to your crib.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- POPULAR NIGHTLIFE HOPS GRID -->
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);margin-bottom:12px;">
          Popular Atlanta Nightlife Hops
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="card-subtle" style="margin-bottom:0;padding:12px 14px;">
            <div style="font-size:18px;margin-bottom:4px;">🍸</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">VIP Lounge Hop</div>
            <div style="font-size:11px;color:var(--text-secondary);">Magic City / Compound / T&G (30-45m wait)</div>
          </div>
          <div class="card-subtle" style="margin-bottom:0;padding:12px 14px;">
            <div style="font-size:18px;margin-bottom:4px;">🍾</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">Pre-Game Liquor Grab</div>
            <div style="font-size:11px;color:var(--text-secondary);">Tower / Green's Beverage (10-15m wait)</div>
          </div>
          <div class="card-subtle" style="margin-bottom:0;padding:12px 14px;">
            <div style="font-size:18px;margin-bottom:4px;">👗</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">Fresh Fit Hotel Hop</div>
            <div style="font-size:11px;color:var(--text-secondary);">Buckhead / Midtown Suite (15-20m wait)</div>
          </div>
          <div class="card-subtle" style="margin-bottom:0;padding:12px 14px;">
            <div style="font-size:18px;margin-bottom:4px;">🍗</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">3 AM Lemon Pepper Run</div>
            <div style="font-size:11px;color:var(--text-secondary);">JR Crickets / Waffle House (15-25m wait)</div>
          </div>
        </div>
      </div>

      <!-- FOOTER REASSURANCE -->
      <div style="text-align:center;padding:10px;font-size:12px;color:var(--text-tertiary);">
        <span>🐰 Atlanta Nightlife Dedicated Pilot</span> &bull; <span>🟣 Zelle</span> &bull; <span>💚 Cash App</span> &bull; <span>💵 Cash in Car</span>
      </div>
    </div>
  `;
}
