/**
 * ZelleModal Component
 * Interactive Zelle confirmation sheet with 1-tap copy, recipient details (Dohntay 9432452611),
 * and instant transfer confirmation.
 */

export function renderZelleModal(isOpen, state, { onConfirmZelle, onCancel }) {
  if (!isOpen) return '';

  const p = state.pricing;
  const zellePhone = state.driverZellePhone || '9432452611';
  const zelleFormatted = state.driverZelleFormatted || '(943) 245-2611';

  return `
    <div class="modal-overlay" id="zelleModalOverlay" style="background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);">
      <div class="modal-content" onclick="event.stopPropagation();" style="max-width:400px;border-radius:24px;padding:0;overflow:hidden;border:1px solid rgba(168,85,247,0.35);box-shadow:0 20px 40px rgba(0,0,0,0.9), 0 0 25px rgba(168,85,247,0.25);">
        <!-- ZELLE BRAND HEADER -->
        <div style="background:linear-gradient(135deg, #7c3aed 0%, #581c87 100%);color:#ffffff;padding:26px 20px;text-align:center;position:relative;">
          <button id="btnCancelZelle" style="position:absolute;top:14px;right:16px;background:rgba(0,0,0,0.25);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">
            &times;
          </button>
          
          <div style="width:48px;height:48px;border-radius:12px;background:#ffffff;color:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;margin:0 auto 10px;box-shadow:0 4px 12px rgba(0,0,0,0.25);">
            🟣
          </div>
          <div style="font-size:18px;font-weight:900;letter-spacing:-0.02em;">Zelle Instant Transfer</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,0.92);margin-top:2px;font-weight:600;">Direct Bank-to-Bank · Zero Processing Fees</div>
        </div>

        <!-- BODY -->
        <div style="padding:22px 20px;background:#130a24;">
          <div style="text-align:center;margin-bottom:18px;">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#b4a9cb;letter-spacing:0.04em;">Exact Fare to Send</div>
            <div style="font-size:38px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;margin:4px 0;">${p.formatted.totalEstimate}</div>
            <div style="font-size:12px;color:#c084fc;background:rgba(168,85,247,0.15);display:inline-block;padding:4px 12px;border-radius:20px;font-weight:700;margin-top:4px;border:1px solid rgba(168,85,247,0.3);">
              ${state.stops.length} Hop${state.stops.length > 1 ? 's' : ''} Run · 100% Goes to Pilot ${state.driver?.name || 'Dohntay'}
            </div>
          </div>

          <!-- RECIPIENT CARD WITH 1-TAP COPY -->
          <div style="background:#1e0e38;border-radius:var(--radius-md);padding:14px;border:1.5px solid rgba(168,85,247,0.35);margin-bottom:18px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-size:10.5px;color:#b4a9cb;text-transform:uppercase;font-weight:700;">Recipient Name:</span>
                <div style="font-size:15px;font-weight:800;color:#ffffff;">${state.driver?.name || 'Dohntay'}</div>
              </div>
              <span style="font-size:10px;background:#7c3aed;color:#ffffff;font-weight:800;padding:3px 8px;border-radius:6px;box-shadow:0 0 8px rgba(124,58,237,0.5);">Verified Pilot</span>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px dashed rgba(168,85,247,0.3);">
              <div>
                <span style="font-size:10.5px;color:#b4a9cb;text-transform:uppercase;font-weight:700;">Zelle Phone Number:</span>
                <div style="font-size:17px;font-weight:900;color:#c084fc;letter-spacing:0.03em;" id="zelleDisplayNum">${zelleFormatted}</div>
              </div>
              <button 
                type="button" 
                id="btnModalCopyZelle" 
                data-zelle-number="${zellePhone}"
                style="background:#7c3aed;color:#ffffff;border:none;font-size:12px;font-weight:800;padding:8px 14px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(124,58,237,0.4);"
              >
                <span>📋</span>
                <span id="btnModalCopyText">Copy Phone</span>
              </button>
            </div>
          </div>

          <!-- STEP-BY-STEP INSTRUCTIONS -->
          <div style="font-size:12px;color:#ddd6fe;line-height:1.5;margin-bottom:20px;background:#180b2a;padding:12px 14px;border-radius:10px;border:1px solid rgba(139,92,246,0.25);">
            <strong style="color:#ffffff;display:block;margin-bottom:4px;">How to pay via Zelle:</strong>
            1. Tap <strong style="color:#c084fc;">Copy Phone</strong> above (copies <code>${zellePhone}</code>).<br>
            2. Open your mobile bank app (Chase, BoA, Wells Fargo, etc.).<br>
            3. Send <strong style="color:#ffffff;">${p.formatted.totalEstimate}</strong> to <strong style="color:#c084fc;">${zelleFormatted}</strong>.<br>
            4. Tap the button below to dispatch your ride!
          </div>

          <!-- CONFIRM SENT BUTTON -->
          <button class="btn-primary" id="btnApproveZelle" style="background:#7c3aed;color:#ffffff;padding:16px;font-size:15px;font-weight:800;border-radius:14px;box-shadow:0 4px 18px rgba(124,58,237,0.4);width:100%;border:none;cursor:pointer;">
            <span>🟣 I've Sent ${p.formatted.totalEstimate} via Zelle → Confirm Run 🐰</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
