/**
 * AboutModal Component
 * Explains how wait-and-return pricing works and prototype transparency notes.
 */

export function renderAboutModal(isOpen, { onClose }) {
  if (!isOpen) return '';

  return `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-content" onclick="event.stopPropagation();">
        <div class="modal-header">
          <div class="modal-title" style="display:flex;align-items:center;gap:8px;">
            <span>🐰</span>
            <span>How TRICKHOPPER Works</span>
          </div>
          <button class="modal-close-btn" id="btnCloseModal">&times;</button>
        </div>

        <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;display:flex;flex-direction:column;gap:14px;">
          <div>
            <strong style="color:var(--text-primary);display:block;margin-bottom:4px;">
              The Atlanta Nightlife Problem
            </strong>
            Club hopping, pre-gaming, or grabbing late-night food in Atlanta is notorious for stranded riders, 35-minute 2:30 AM wait times, 4x surge pricing, and lost jackets or belongings. Traditional rideshares penalize drivers who wait, forcing riders to book disjointed, expensive one-way trips.
          </div>

          <div style="background:var(--surface-subtle);border-radius:var(--radius-md);padding:14px;border:1px solid var(--border-light);">
            <strong style="color:var(--text-primary);display:block;margin-bottom:6px;">
              The Nightlife Bunny Model
            </strong>
            <ul style="padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;">
              <li><strong>Dedicated Pilot:</strong> Fleet pilot drivers Dohntay (<code>ATL-PILOT</code>) and Rocko (<code>ATL-ROCKO</code>) stay on-site with your vehicle warmed/cooled and belongings locked safe.</li>
              <li><strong>Guaranteed Curbside Wait:</strong> $0.35/min ($21.00/hr) transparently itemized upfront.</li>
              <li><strong>Return Hop Discount:</strong> 20% discount on the return leg back to your crib.</li>
              <li><strong>Direct Pilot Settlement:</strong> Zero card processing fees via <strong>Cash App</strong> (<code>$2243Dohntay</code> / <code>$chadowens46</code>), <strong>Zelle</strong> (<code>(943) 245-2611</code> / <code>(404) 555-0146</code>), or <strong>Cash in vehicle</strong>.</li>
            </ul>
          </div>

          <div style="background:#090d16;border-radius:var(--radius-md);padding:14px;border:1px solid rgba(255,42,141,0.25);color:#f8fafc;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:16px;">📲</span>
              <strong style="color:var(--primary);font-size:13px;">Save as Standalone Mobile App</strong>
            </div>
            <p style="font-size:12px;color:#94a3b8;margin:0 0 8px;">
              Works without an app store:
            </p>
            <div style="font-size:11.5px;color:#cbd5e1;display:flex;flex-direction:column;gap:4px;">
              <div>• <strong>iPhone (Safari)</strong>: Tap <strong>Share (⎋)</strong> → <strong>Add to Home Screen (⊞)</strong>.</div>
              <div>• <strong>Android (Chrome)</strong>: Tap <strong>Menu (⋮)</strong> → <strong>Install App</strong>.</div>
            </div>
          </div>

          <div>
            <strong style="color:var(--text-primary);display:block;margin-bottom:4px;">
              Prototype Boundaries
            </strong>
            This is a functional product prototype built for UX, fleet validation, and behavioral demonstration. All pricing, pilot profiles, and routing are modeled on Atlanta nightlife operational scenarios.
          </div>
        </div>

        <div style="margin-top:20px;">
          <button class="btn-primary" id="btnCloseModalBtn" style="padding:12px;">
            Got it, let's hop! 🐰
          </button>
        </div>
      </div>
    </div>
  `;
}
