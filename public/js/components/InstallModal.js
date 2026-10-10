/**
 * InstallModal Component
 * Interactive guide explaining how to save Wait & Return to home screen
 * on iOS (Safari) and Android (Chrome) as a standalone PWA.
 */

export function renderInstallModal(isOpen, { onClose }) {
  if (!isOpen) return '';

  const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  return `
    <div class="modal-overlay" id="installModalOverlay">
      <div class="modal-content" onclick="event.stopPropagation();" style="max-width:440px;">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:38px;height:38px;border-radius:10px;background:#080511;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(255,42,141,0.3);border:1px solid rgba(255,42,141,0.3);">
              <img src="/icons/icon.svg" alt="TRICKHOPPER Icon" style="width:28px;height:28px;" />
            </div>
            <div>
              <div class="modal-title" style="font-size:16px;">${(typeof window !== 'undefined' && window.location.pathname.startsWith('/driver')) ? 'Save Pilot Console 🐰' : 'Save TRICKHOPPER 🐰'}</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);">${(typeof window !== 'undefined' && window.location.pathname.startsWith('/driver')) ? 'Dedicated In-Car Camry Console' : 'Standalone Nightlife Bunny App'}</div>
            </div>
          </div>
          <button class="modal-close-btn" id="btnCloseInstallModal">&times;</button>
        </div>

        <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;display:flex;flex-direction:column;gap:14px;">
          <p style="margin:0;">
            ${(typeof window !== 'undefined' && window.location.pathname.startsWith('/driver')) ? 'Install the Pilot Console directly to your home screen for rapid 1-tap access while driving, with automatic Screen WakeLock and live GPS telemetry.' : 'TRICKHOPPER is a <strong>Progressive Web App (PWA)</strong>. You can install it directly to your phone\'s home screen without downloading from the App Store.'}
          </p>

          <!-- iOS SAFARI INSTRUCTIONS -->
          <div class="card" style="background:#130a24;border-color:rgba(255,42,141,0.25);padding:14px;margin:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:18px;">🍎</span>
              <strong style="color:var(--text-primary);font-size:13px;">iPhone / iPad (Safari)</strong>
            </div>
            <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;">
              <li>Open this page in <strong>Safari</strong> on your iPhone.</li>
              <li>Tap the <strong>Share button</strong> <span style="display:inline-block;padding:1px 6px;background:rgba(255,255,255,0.08);border-radius:4px;font-weight:700;font-size:12px;color:var(--text-primary);">⎋</span> in the bottom toolbar.</li>
              <li>Scroll down and tap <strong style="color:var(--primary);">"Add to Home Screen"</strong> <span style="display:inline-block;padding:1px 6px;background:rgba(255,255,255,0.08);border-radius:4px;font-weight:700;font-size:12px;color:var(--text-primary);">⊞</span>.</li>
              <li>Tap <strong>"Add"</strong> in the top-right corner.</li>
            </ol>
            <div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);">
              ✓ Launches full-screen with the custom Nightlife Bunny icon without browser address bars.
            </div>
          </div>

          <!-- ANDROID CHROME INSTRUCTIONS -->
          <div class="card" style="background:#130a24;border-color:rgba(255,42,141,0.25);padding:14px;margin:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:18px;">🤖</span>
              <strong style="color:var(--text-primary);font-size:13px;">Android (Google Chrome)</strong>
            </div>
            <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;">
              <li>Open this page in <strong>Google Chrome</strong>.</li>
              <li>Tap the <strong>Three Dots Menu</strong> <span style="display:inline-block;padding:1px 6px;background:rgba(255,255,255,0.08);border-radius:4px;font-weight:700;font-size:12px;color:var(--text-primary);">⋮</span> in the top-right.</li>
              <li>Tap <strong style="color:var(--primary);">"Install App"</strong> or <strong>"Add to Home screen"</strong>.</li>
              <li>Confirm prompt to place the icon on your home screen.</li>
            </ol>
            <div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);">
              ✓ Supports real-time GPS telemetry, Screen Wake Lock, and background notifications.
            </div>
          </div>

          <!-- APP MODES -->
          ${(typeof window !== 'undefined' && window.location.pathname.startsWith('/driver')) ? `
            <div style="background:#130a24;border:1px solid rgba(139,92,246,0.3);border-radius:var(--radius-sm);padding:10px 12px;font-size:12px;color:#c084fc;">
              💡 <strong>Pilot Console:</strong> Keep this saved to your vehicle phone mount for live telemetry, GPS tracking, and automatic screen wake lock.
            </div>
          ` : `
            <div style="background:#130a24;border:1px solid rgba(255,42,141,0.25);border-radius:var(--radius-sm);padding:10px 12px;font-size:12px;color:#f8fafc;">
              💡 <strong>VIP Nightlife Access:</strong> Keep TRICKHOPPER on your home screen for instant booking, zero 3 AM surge pricing, and guaranteed curbside return trips.
            </div>
          `}
        </div>

        <div style="margin-top:16px;">
          <button class="btn-primary" id="btnCloseInstallModalBtn" style="padding:12px;font-size:14px;">
            Done
          </button>
        </div>
      </div>
    </div>
  `;
}
