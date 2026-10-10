/**
 * Main Application Coordinator
 * Mounts components, binds event handlers, coordinates reactive UI updates,
 * and handles Cash App Pay authorization and instant payout sound chimes.
 */

import { store, TRIP_STATES } from './store.js';
import { playCashAppChime } from './cashapp.js';
import { renderHeader } from './components/Header.js';
import { renderLanding } from './components/Landing.js';
import { renderBookingForm } from './components/BookingForm.js';
import { renderFareReview } from './components/FareReview.js';
import { renderTripStatus } from './components/TripStatus.js';
import { renderWaitingStop } from './components/WaitingStop.js';
import { renderTripComplete } from './components/TripComplete.js';
import { renderDriverView } from './components/DriverView.js';
import { renderAboutModal } from './components/AboutModal.js';
import { renderCashAppModal } from './components/CashAppModal.js';
import { renderZelleModal } from './components/ZelleModal.js';
import { renderInstallModal } from './components/InstallModal.js';
import { telemetry } from './telemetry.js';

let isAboutModalOpen = false;
let isCashAppModalOpen = false;
let isZelleModalOpen = false;
let isInstallModalOpen = false;
let deferredInstallPrompt = null;

function updateLiveBannerInPlace() {
  const state = store.getState();
  const bannerVal = document.querySelector('.upfront-estimate-val');
  const bannerSub = document.querySelector('.upfront-estimate-sub');
  const stops = state.stops || [];

  if (bannerVal) bannerVal.textContent = state.pricing.formatted.totalEstimate;
  if (bannerSub) {
    bannerSub.textContent = `${stops.length} Stop${stops.length > 1 ? 's' : ''} · ${state.pricing.totalWaitMinutes}m total wait (${state.pricing.formatted.waitCharge})`;
  }
}

function renderApp() {
  const root = document.getElementById('app');
  if (!root) return;

  const state = store.getState();

  // 1. Render Header
  const headerHtml = renderHeader(state, {
    onModeChange: (m) => store.setMode(m),
    onAboutClick: () => { isAboutModalOpen = true; renderApp(); },
    onLogoClick: () => { store.setMode('rider'); store.setState({ tripState: TRIP_STATES.IDLE }); },
  });

  // 2. Render Main Body based on Mode and State
  let bodyHtml = '';

  if (state.activeMode === 'driver') {
    bodyHtml = renderDriverView(state, {
      onAcceptRequest: () => store.advanceTripState(),
      onAdvanceDriverState: () => store.advanceTripState(),
      onResetDemo: () => store.resetTrip(),
      onUpdateDriverCashTag: (tag) => store.setDriverCashTag(tag),
    });
  } else {
    // Rider Mode Views
    switch (state.tripState) {
      case TRIP_STATES.IDLE:
        bodyHtml = renderLanding(state, {
          onStartBooking: () => store.setState({ tripState: TRIP_STATES.BOOKING }),
        });
        break;

      case TRIP_STATES.BOOKING:
        bodyHtml = renderBookingForm(state, {
          onUpdateField: (field, val) => store.updateTripForm({ [field]: val }),
          onSubmitReview: () => store.goToReview(),
        });
        break;

      case TRIP_STATES.REVIEW:
        bodyHtml = renderFareReview(state, {
          onConfirmBooking: () => {
            if (state.paymentMethod === 'cashapp') {
              isCashAppModalOpen = true;
              renderApp();
            } else if (state.paymentMethod === 'zelle') {
              isZelleModalOpen = true;
              renderApp();
            } else {
              store.confirmBooking();
            }
          },
          onEditDetails: () => store.setState({ tripState: TRIP_STATES.BOOKING }),
          onSelectPaymentMethod: (m) => store.setPaymentMethod(m),
          onUpdateRiderCashTag: (tag) => store.setRiderCashTag(tag),
        });
        break;

      case TRIP_STATES.MATCHING:
      case TRIP_STATES.DRIVER_ACCEPTED:
      case TRIP_STATES.OUTBOUND:
      case TRIP_STATES.RETURN_LEG:
        bodyHtml = renderTripStatus(state, {
          onAdvanceTrip: () => {
            if (state.tripState === TRIP_STATES.RETURN_LEG) {
              playCashAppChime();
            }
            store.advanceTripState();
          },
          onSwitchToDriver: () => store.setMode('driver'),
        });
        break;

      case TRIP_STATES.WAITING:
      case TRIP_STATES.RIDER_READY:
        bodyHtml = renderWaitingStop(state, {
          onReadyToReturn: () => store.markRiderReady(),
          onExtendWait: (mins) => store.extendWait(mins),
          onStartReturn: () => store.advanceTripState(),
        });
        break;

      case TRIP_STATES.COMPLETED:
        bodyHtml = renderTripComplete(state, {
          onPlanAnotherTrip: () => store.resetTrip(),
          onSendTip: (amt) => {
            playCashAppChime();
            store.addTip(amt);
          },
        });
        break;

      default:
        bodyHtml = renderLanding(state, {});
        break;
    }
  }

  // 3. Render Modals
  const modalHtml = renderAboutModal(isAboutModalOpen, {
    onClose: () => { isAboutModalOpen = false; renderApp(); },
  });

  const cashAppModalHtml = renderCashAppModal(isCashAppModalOpen, state, {
    onApprove: () => {
      isCashAppModalOpen = false;
      playCashAppChime();
      store.authorizeCashAppHold();
      store.confirmBooking();
    },
    onCancel: () => {
      isCashAppModalOpen = false;
      renderApp();
    },
  });

  const zelleModalHtml = renderZelleModal(isZelleModalOpen, state, {
    onConfirmZelle: () => {
      isZelleModalOpen = false;
      playCashAppChime();
      store.confirmBooking();
    },
    onCancel: () => {
      isZelleModalOpen = false;
      renderApp();
    },
  });

  const installModalHtml = renderInstallModal(isInstallModalOpen, {
    onClose: () => { isInstallModalOpen = false; renderApp(); },
  });

  // Assemble HTML
  root.innerHTML = `
    <div class="app-shell">
      ${headerHtml}
      ${bodyHtml}
      
      <!-- FOOTER -->
      <footer class="footer-nav">
        <div class="footer-links">
          <span class="footer-link" id="footerAboutLink">How TRICKHOPPER Works</span>
          <span class="footer-link" id="footerResetLink">Reset Demo</span>
          <span class="footer-link" id="footerDriverLink">Pilot Console</span>
        </div>
        <div class="footer-disclaimer">
          🐰 TRICKHOPPER · Nightlife Bunny Rides · Pilot: Dohntay · Zelle, Cash App & Cash in vehicle.
        </div>
      </footer>
    </div>
    ${modalHtml}
    ${cashAppModalHtml}
    ${zelleModalHtml}
    ${installModalHtml}
  `;

  // Attach Event Handlers
  bindEvents();
}

function bindEvents() {
  // Mode Switchers
  const btnRider = document.getElementById('btnModeRider');
  const btnDriver = document.getElementById('btnModeDriver');
  if (btnRider) btnRider.onclick = () => store.setMode('rider');
  if (btnDriver) btnDriver.onclick = () => store.setMode('driver');

  // Logo Click
  const btnLogo = document.getElementById('btnLogo');
  if (btnLogo) btnLogo.onclick = () => {
    store.setMode('rider');
    store.setState({ tripState: TRIP_STATES.IDLE });
  };

  // About Modal Triggers
  const btnAbout = document.getElementById('btnAbout');
  const footerAbout = document.getElementById('footerAboutLink');
  if (btnAbout) btnAbout.onclick = () => { isAboutModalOpen = true; renderApp(); };
  if (footerAbout) footerAbout.onclick = () => { isAboutModalOpen = true; renderApp(); };

  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCloseModalBtn = document.getElementById('btnCloseModalBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  if (btnCloseModal) btnCloseModal.onclick = () => { isAboutModalOpen = false; renderApp(); };
  if (btnCloseModalBtn) btnCloseModalBtn.onclick = () => { isAboutModalOpen = false; renderApp(); };
  if (modalOverlay) modalOverlay.onclick = () => { isAboutModalOpen = false; renderApp(); };

  // Install / Save to Home Screen Modal Triggers
  const handleInstallClick = () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
      });
    } else {
      isInstallModalOpen = true;
      renderApp();
    }
  };

  const btnInstallApp = document.getElementById('btnInstallApp');
  const btnHeroInstall = document.getElementById('btnHeroInstall');
  if (btnInstallApp) btnInstallApp.onclick = handleInstallClick;
  if (btnHeroInstall) btnHeroInstall.onclick = handleInstallClick;

  const btnCloseInstallModal = document.getElementById('btnCloseInstallModal');
  const btnCloseInstallModalBtn = document.getElementById('btnCloseInstallModalBtn');
  const installModalOverlay = document.getElementById('installModalOverlay');
  if (btnCloseInstallModal) btnCloseInstallModal.onclick = () => { isInstallModalOpen = false; renderApp(); };
  if (btnCloseInstallModalBtn) btnCloseInstallModalBtn.onclick = () => { isInstallModalOpen = false; renderApp(); };
  if (installModalOverlay) installModalOverlay.onclick = () => { isInstallModalOpen = false; renderApp(); };

  // Cash App Modal Triggers
  const btnCancelCashApp = document.getElementById('btnCancelCashApp');
  const btnApproveCashApp = document.getElementById('btnApproveCashApp');
  const cashAppModalOverlay = document.getElementById('cashAppModalOverlay');
  if (btnCancelCashApp) btnCancelCashApp.onclick = () => { isCashAppModalOpen = false; renderApp(); };
  if (cashAppModalOverlay) cashAppModalOverlay.onclick = () => { isCashAppModalOpen = false; renderApp(); };
  if (btnApproveCashApp) {
    btnApproveCashApp.onclick = () => {
      isCashAppModalOpen = false;
      playCashAppChime();
      store.authorizeCashAppHold();
      store.confirmBooking();
    };
  }

  // Zelle Modal Triggers
  const btnCancelZelle = document.getElementById('btnCancelZelle');
  const btnApproveZelle = document.getElementById('btnApproveZelle');
  const zelleModalOverlay = document.getElementById('zelleModalOverlay');
  if (btnCancelZelle) btnCancelZelle.onclick = () => { isZelleModalOpen = false; renderApp(); };
  if (zelleModalOverlay) zelleModalOverlay.onclick = () => { isZelleModalOpen = false; renderApp(); };
  if (btnApproveZelle) {
    btnApproveZelle.onclick = () => {
      isZelleModalOpen = false;
      playCashAppChime();
      store.confirmBooking();
    };
  }

  // Zelle Copy buttons (in modal & on review card)
  const bindCopyBtn = (btnId, textId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.onclick = () => {
        const num = btn.getAttribute('data-zelle-number') || '9432452611';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(num).then(() => {
            const txt = document.getElementById(textId);
            if (txt) {
              const orig = txt.textContent;
              txt.textContent = 'Copied ✓';
              setTimeout(() => { txt.textContent = orig; }, 2000);
            }
          });
        }
      };
    }
  };
  bindCopyBtn('btnCopyZelle', 'copyZelleText');
  bindCopyBtn('btnModalCopyZelle', 'btnModalCopyText');

  // Payment Options on Review Screen
  const optPayCashApp = document.getElementById('optPayCashApp');
  const optPayZelle = document.getElementById('optPayZelle');
  const optPayCash = document.getElementById('optPayCash');
  if (optPayCashApp) optPayCashApp.onclick = () => { store.setPaymentMethod('cashapp'); };
  if (optPayZelle) optPayZelle.onclick = () => { store.setPaymentMethod('zelle'); };
  if (optPayCash) optPayCash.onclick = () => { store.setPaymentMethod('cash'); };

  // Rider CashTag input
  const inputRiderCashTag = document.getElementById('inputRiderCashTag');
  if (inputRiderCashTag) {
    inputRiderCashTag.onchange = (e) => store.setRiderCashTag(e.target.value);
  }

  // Toast close
  const btnCloseToast = document.getElementById('btnCloseToast');
  if (btnCloseToast) btnCloseToast.onclick = () => store.clearNotification();

  // Landing: Plan a ride CTA
  const btnPlan = document.getElementById('btnPlanRide');
  if (btnPlan) btnPlan.onclick = () => store.setState({ tripState: TRIP_STATES.BOOKING });

  // Booking Form: Destination mode tabs
  document.querySelectorAll('[data-dest-tab]').forEach(tabBtn => {
    tabBtn.onclick = () => {
      const mode = tabBtn.getAttribute('data-dest-tab');
      store.setDestinationInputMode(mode);
    };
  });

  // Booking Form: Clear Pickup
  const btnClearPickup = document.getElementById('btnClearPickup');
  if (btnClearPickup) {
    btnClearPickup.onclick = () => {
      store.updatePickup('');
      const el = document.getElementById('inputPickup');
      if (el) { el.value = ''; el.focus(); }
    };
  }

  // Booking Form: Preset pickups
  document.querySelectorAll('[data-preset-pickup]').forEach(btn => {
    btn.onclick = () => {
      const val = btn.getAttribute('data-preset-pickup');
      store.updatePickup(val);
    };
  });

  // Booking Form: Multi-Stop Address Inputs
  document.querySelectorAll('.stop-address-input').forEach(input => {
    input.oninput = (e) => {
      const idx = Number(input.getAttribute('data-stop-idx'));
      store.updateStopQuiet(idx, { name: e.target.value });
      updateLiveBannerInPlace();
    };
  });

  // Booking Form: Remove Stop Buttons
  document.querySelectorAll('[data-remove-stop-idx]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-remove-stop-idx'));
      store.removeStop(idx);
    };
  });

  // Booking Form: Add Stop Button
  const btnAddStopBtn = document.getElementById('btnAddStopBtn');
  if (btnAddStopBtn) {
    btnAddStopBtn.onclick = () => store.addStop();
  }

  // Booking Form: Stop Wait Window Buttons
  document.querySelectorAll('[data-stop-wait-btn]').forEach(btn => {
    btn.onclick = () => {
      const mins = Number(btn.getAttribute('data-stop-wait-btn'));
      const idx = Number(btn.getAttribute('data-stop-idx'));
      store.updateStop(idx, { waitMinutes: mins });
    };
  });

  // Booking Form: Stop Suggestion Chips
  document.querySelectorAll('[data-stop-chip-name]').forEach(btn => {
    btn.onclick = () => {
      const name = btn.getAttribute('data-stop-chip-name');
      const wait = Number(btn.getAttribute('data-stop-chip-wait')) || 20;
      const idx = Number(btn.getAttribute('data-stop-idx'));
      store.updateStop(idx, { name, waitMinutes: wait });
    };
  });

  // Booking Form: Passenger buttons
  document.querySelectorAll('[data-riders-val]').forEach(btn => {
    btn.onclick = () => {
      const val = Number(btn.getAttribute('data-riders-val'));
      store.setState({ riders: val });
    };
  });

  // Booking Form: Pickup Input with smooth in-place updating
  const inputPickup = document.getElementById('inputPickup');
  if (inputPickup) {
    inputPickup.oninput = (e) => {
      store.updatePickupQuiet(e.target.value);
      updateLiveBannerInPlace();
    };
  }

  // Submit Booking Form -> Review
  const btnSubmitReview = document.getElementById('btnSubmitReview');
  if (btnSubmitReview) {
    btnSubmitReview.onclick = () => {
      const ok = store.goToReview();
      if (!ok) alert('Please provide both a pickup location and at least one stop.');
    };
  }

  // Review: Back to form
  const btnBackToForm = document.getElementById('btnBackToForm');
  if (btnBackToForm) {
    btnBackToForm.onclick = () => store.setState({ tripState: TRIP_STATES.BOOKING });
  }

  // Review: Confirm Booking
  const btnConfirmBooking = document.getElementById('btnConfirmBooking');
  if (btnConfirmBooking) {
    btnConfirmBooking.onclick = () => {
      const state = store.getState();
      if (state.paymentMethod === 'cashapp') {
        isCashAppModalOpen = true;
        renderApp();
      } else if (state.paymentMethod === 'zelle') {
        isZelleModalOpen = true;
        renderApp();
      } else {
        store.confirmBooking();
      }
    };
  }

  // Trip Status: Advance status
  const btnAdvanceStatus = document.getElementById('btnAdvanceStatus');
  if (btnAdvanceStatus) {
    btnAdvanceStatus.onclick = () => {
      const state = store.getState();
      if (state.tripState === TRIP_STATES.RETURN_LEG) {
        playCashAppChime();
      }
      store.advanceTripState();
    };
  }

  const btnPeekDriver = document.getElementById('btnPeekDriver');
  if (btnPeekDriver) {
    btnPeekDriver.onclick = () => store.setMode('driver');
  }

  // Waiting Stop: Ready to return
  const btnReadyToReturn = document.getElementById('btnReadyToReturn');
  if (btnReadyToReturn) {
    btnReadyToReturn.onclick = () => store.markRiderReady();
  }

  // Waiting Stop: Extensions
  const btnExtend10 = document.getElementById('btnExtend10');
  const btnExtend15 = document.getElementById('btnExtend15');
  if (btnExtend10) btnExtend10.onclick = () => store.extendWait(10);
  if (btnExtend15) btnExtend15.onclick = () => store.extendWait(15);

  // Waiting Stop: Start return leg
  const btnStartReturnTrip = document.getElementById('btnStartReturnTrip');
  if (btnStartReturnTrip) {
    btnStartReturnTrip.onclick = () => store.advanceTripState();
  }

  const btnSwitchToDriverDemo = document.getElementById('btnSwitchToDriverDemo');
  if (btnSwitchToDriverDemo) {
    btnSwitchToDriverDemo.onclick = () => store.setMode('driver');
  }

  // In Transit Return: Arrive Home
  const btnSimulateArriveHome = document.getElementById('btnSimulateArriveHome');
  if (btnSimulateArriveHome) {
    btnSimulateArriveHome.onclick = () => {
      playCashAppChime();
      store.advanceTripState();
    };
  }

  // Tip Buttons
  document.querySelectorAll('[data-tip-val]').forEach(btn => {
    btn.onclick = () => {
      const amt = Number(btn.getAttribute('data-tip-val'));
      playCashAppChime();
      store.addTip(amt);
    };
  });

  // Trip Complete: Plan Another
  const btnPlanAnother = document.getElementById('btnPlanAnother');
  if (btnPlanAnother) {
    btnPlanAnother.onclick = () => store.resetTrip();
  }

  // Driver View Actions
  const btnDriverAcceptDemo = document.getElementById('btnDriverAcceptDemo');
  if (btnDriverAcceptDemo) {
    btnDriverAcceptDemo.onclick = () => store.confirmBooking();
  }

  const btnDriverArrivedPickup = document.getElementById('btnDriverArrivedPickup');
  if (btnDriverArrivedPickup) {
    btnDriverArrivedPickup.onclick = () => store.advanceTripState();
  }

  const btnDriverArrivedStop = document.getElementById('btnDriverArrivedStop');
  if (btnDriverArrivedStop) {
    btnDriverArrivedStop.onclick = () => store.advanceTripState();
  }

  const btnDriverSimulateReady = document.getElementById('btnDriverSimulateReady');
  if (btnDriverSimulateReady) {
    btnDriverSimulateReady.onclick = () => store.markRiderReady();
  }

  const btnDriverStartReturn = document.getElementById('btnDriverStartReturn');
  if (btnDriverStartReturn) {
    btnDriverStartReturn.onclick = () => store.advanceTripState();
  }

  const btnDriverCompleteTrip = document.getElementById('btnDriverCompleteTrip');
  if (btnDriverCompleteTrip) {
    btnDriverCompleteTrip.onclick = () => {
      playCashAppChime();
      store.advanceTripState();
    };
  }

  const btnDriverResetTrip = document.getElementById('btnDriverResetTrip');
  if (btnDriverResetTrip) {
    btnDriverResetTrip.onclick = () => store.resetTrip();
  }

  const inputDriverCashTag = document.getElementById('inputDriverCashTag');
  if (inputDriverCashTag) {
    inputDriverCashTag.onchange = (e) => store.setDriverCashTag(e.target.value);
  }

  // Driver Fleet Profile Switcher (Driver 1: Marcus Camry vs Driver 2: Trevon Tahoe)
  document.querySelectorAll('[data-driver-switch-id]').forEach(btn => {
    btn.onclick = () => {
      const driverId = btn.getAttribute('data-driver-switch-id');
      store.selectDriver(driverId);
    };
  });

  // Telemetry GPS Real/Sim Toggle
  const btnToggleRealGPS = document.getElementById('btnToggleRealGPS');
  if (btnToggleRealGPS) {
    btnToggleRealGPS.onclick = () => {
      const state = store.getState();
      if (state.isSimulatedGPS) {
        telemetry.startLiveGPS();
      } else {
        telemetry.startSimulatedGPS();
      }
    };
  }

  // Screen WakeLock Toggle
  const btnToggleWakeLock = document.getElementById('btnToggleWakeLock');
  if (btnToggleWakeLock) {
    btnToggleWakeLock.onclick = async () => {
      const state = store.getState();
      if (state.wakeLockActive) {
        telemetry.releaseWakeLock();
      } else {
        await telemetry.requestWakeLock();
      }
    };
  }

  const btnBackToRider = document.getElementById('btnBackToRider');
  if (btnBackToRider) {
    btnBackToRider.onclick = () => store.setMode('rider');
  }

  // Footer Actions
  const footerReset = document.getElementById('footerResetLink');
  if (footerReset) {
    footerReset.onclick = () => store.resetTrip();
  }

  const footerDriver = document.getElementById('footerDriverLink');
  if (footerDriver) {
    footerDriver.onclick = () => store.setMode('driver');
  }
}

// Initial Boot & Subscription
store.subscribe(() => {
  renderApp();
});

// Capture native Android/Chrome install prompt event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

// Initial Render on DOMContentLoaded & start telemetry streaming
window.addEventListener('DOMContentLoaded', () => {
  telemetry.startSimulatedGPS();
  renderApp();

  // Register Service Worker for PWA offline caching & standalone home screen capability
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration:', err);
    });
  }
});
