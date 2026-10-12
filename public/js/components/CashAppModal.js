/**
 * CashAppModal Component
 * Simulated Cash App Pay native authorization sheet with pre-auth hold and FaceID / TouchID.
 */

export function renderCashAppModal(isOpen, state, { onApprove, onCancel }) {
  if (!isOpen) return '';

  const p = state.pricing;
  const holdTotal = (p.totalEstimate + 15.00).toFixed(2);

  return `
    <div class="modal-overlay" id="cashAppModalOverlay" style="background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);">
      <div class="modal-content" onclick="event.stopPropagation();" style="max-width:400px;border-radius:24px;padding:0;overflow:hidden;border:1px solid rgba(0,214,50,0.3);box-shadow:0 20px 40px rgba(0,0,0,0.9), 0 0 25px rgba(0,214,50,0.2);">
        <!-- CASH APP BRAND HEADER -->
        <div style="background:#00d632;color:#ffffff;padding:26px 20px;text-align:center;position:relative;">
          <button id="btnCancelCashApp" style="position:absolute;top:14px;right:16px;background:rgba(0,0,0,0.25);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">
            &times;
          </button>
          
          <div style="width:48px;height:48px;border-radius:12px;background:#ffffff;color:#00d632;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;margin:0 auto 10px;box-shadow:0 4px 12px rgba(0,0,0,0.25);">
            $
          </div>
          <div style="font-size:18px;font-weight:900;letter-spacing:-0.02em;">Cash App Pay</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,0.92);margin-top:2px;font-weight:600;">Fast & Secure Escrow Authorization</div>
        </div>

        <!-- AUTH SHEET BODY -->
        <div style="padding:22px 20px;background:#130a24;">
          <div style="text-align:center;margin-bottom:18px;">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#b4a9cb;letter-spacing:0.04em;">Pre-Authorization Hold</div>
            <div style="font-size:38px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;margin:4px 0;">$${holdTotal}</div>
            <div style="font-size:12px;color:#34d399;background:rgba(0,214,50,0.12);display:inline-block;padding:4px 12px;border-radius:20px;font-weight:700;margin-top:4px;border:1px solid rgba(52,211,153,0.3);">
              Upfront Fare ${p.formatted.totalEstimate} + $15.00 Wait Buffer
            </div>
          </div>

          <div style="background:#1b1033;border-radius:var(--radius-md);padding:14px;border:1px solid rgba(139,92,246,0.25);margin-bottom:20px;font-size:12.5px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#b4a9cb;">Account:</span>
              <strong style="color:#ffffff;font-size:13px;">${state.riderCashTag || '$rider_guest'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:#b4a9cb;">Recipient:</span>
              <strong style="color:#ffffff;font-size:13px;">${state.driver?.name || 'Dohntay'} · <span style="color:#00d632;">${state.driverCashTag || '$2243Dohntay'}</span></strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);">
              <span style="color:#b4a9cb;">Capture Policy:</span>
              <span style="color:#34d399;font-weight:700;">Only actual wait captured</span>
            </div>
          </div>

          <div style="font-size:11.5px;color:#ddd6fe;line-height:1.5;text-align:center;margin-bottom:20px;opacity:0.9;">
            Unused buffer is immediately released back to your Cash App balance upon trip completion.
          </div>

          <!-- APPROVE BUTTON (TRIGGERS CHIME & MATCH) -->
          <button class="btn-success" id="btnApproveCashApp" style="background:#00d632;color:#ffffff;padding:16px;font-size:16px;font-weight:800;border-radius:14px;box-shadow:0 4px 18px rgba(0,214,50,0.45);cursor:pointer;width:100%;border:none;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>⚡ Approve with Face ID / Touch ID</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
