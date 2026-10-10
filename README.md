# Wait & Return · Atlanta Nightlife Pilot (Cash App & Live Telemetry Edition)

A mobile-first web app prototype for booking short evening nightlife runs across Atlanta (Midtown, Buckhead, Edgewood, Peter St, West Midtown) where the rider can ask the same driver to wait during a quick stop and bring them right back. 

Built for a dedicated **2-driver fleet model** with continuous **HTML5 GPS telemetry**, **Screen Wake Lock**, **turn-by-turn navigation deep links**, **Cash App Pay** pre-authorization hold escrow, and instant **`$cashtag` driver payouts** with audio chimes.

> **⚠️ PROTOTYPE DEMONSTRATION NOTICE**  
> This software is a functional product prototype built for UX, fleet validation, and behavioral demonstration. It does not dispatch live commercial livery services or charge real payment cards. All pricing, driver profiles, and routing are modeled on Atlanta nightlife operational scenarios.

---

## The Core Product Promise
**One booking, one driver, a clear wait window, and an upfront total.**

Standard rideshare trips are designed strictly for point-to-point transit. In high-traffic Atlanta nightlife corridors (Peachtree Rd, Peter St, Edgewood, West Midtown), a rider making a quick 15–35 minute stop faces high friction:
1. Pay two separate full-fare rides with double base fees.
2. Wait twice, risking 2.5x surge pricing and vehicle unavailability outside crowded venues.
3. Drivers are under-compensated for idling and frequently cancel or refuse multi-stop trips.

**Wait & Return** solves this:
- **Riders**: Guaranteed vehicle holding curb position outside the venue, zero second-leg wait, upfront roundtrip pricing.
- **Drivers**: Guaranteed $0.51/min waiting pay ($30.60/hr effective compensation) with zero deadhead miles and instant Cash App payouts.

---

## 2-Driver Dedicated Atlanta Fleet Model

To ensure operational simplicity and reliability without algorithmic marketplace overhead, the pilot runs with 2 dedicated fleet vehicles:

1. **Driver 1 — Marcus T. (`$MarcusOnTheMove`)**:
   - **Vehicle**: 2024 Toyota Camry Hybrid (Midnight Black) · Tag: `ATL-792M`
   - **Rating**: ★ 4.98 (2,140 trips)
   - **Primary Zone**: Midtown (10th St, Peachtree St, Piedmont Rd)
2. **Driver 2 — Trevon B. (`$TrevonNightFleet`)**:
   - **Vehicle**: 2023 Chevrolet Tahoe LT (Gloss Black) · Tag: `GA-448TB`
   - **Rating**: ★ 4.96 (1,890 trips)
   - **Primary Zone**: Buckhead (Lenox / Phipps Plaza VIP strip, West Midtown)

---

## Live GPS & Vehicle Telemetry Architecture

1. **Continuous Coordinate Streaming**:
   - `navigator.geolocation.watchPosition` with `enableHighAccuracy: true` captures live latitude, longitude, heading angle, and speed (mph).
2. **Screen Wake Lock API (`navigator.wakeLock`)**:
   - Keeps the driver phone display awake on vehicle dashboard mounts without dimming or throttling background telemetry.
3. **Turn-by-Turn Navigation Deep Links**:
   - Instant 1-tap deep links to **Apple Maps**, **Google Maps**, and **Waze** pre-populated with exact pickup and stop coordinates.
4. **Live Vector Street Map (`LiveMap.js`)**:
   - Zero-dependency dark-mode vector map rendering Atlanta corridors (Peachtree St, Piedmont Rd, 10th St).
   - Moving vehicle marker with chassis orientation, radar pulse, speed HUD, and route polylines.
5. **Real-time Street Simulator**:
   - Automatically simulates high-accuracy vehicle movement along Atlanta nightlife routes for desktop demos and testing.

---

## Cash App Integration Architecture

### 1. Rider: Cash App Pay & Pre-Auth Escrow Hold
- On the **Fare Review** screen, riders can select **Cash App Pay** as their preferred payment method.
- **Dynamic Pre-Auth Hold Buffer**: To support on-the-fly wait extensions (`+10 min` or `+15 min`) without requiring the passenger to re-authorize payment mid-errand, the prototype pre-authorizes the upfront estimate plus a **$15.00 wait buffer** (e.g., $33.50 estimate + $15.00 buffer = $48.50 hold).
- **One-Tap Approval**: Clicking *Pay with Cash App* opens an authentic Cash App Pay authorization sheet with FaceID / TouchID confirmation.
- **Synthesized Audio Chime**: Approving plays the iconic Cash App two-tone chime synthesized in real time via the Web Audio API (`public/js/cashapp.js`).

### 2. Driver: Instant `$cashtag` Settlement (Zero Delay)
- Drivers configure their payout handle (e.g. `$MarcusOnTheMove`).
- The moment the return leg is completed, the driver’s 85% cut arrives in their Cash App balance instantly.
- Eliminates Uber/Lyft's $0.85–$1.50 instant cashout fees and multi-day ACH bank delays.
- Real-time chime alert upon trip completion and tip receipt.

### 3. "I Have Cash (Pay in Car)" Physical Payment Option
- **Zero Digital Pre-Auth Hold**: Riders who prefer physical currency can select **"I Have Cash (Pay in Car)"**.
- **Agreed Exact Fare**: Displays the exact cash total to hand the driver upon boarding or completion.
- **In-Vehicle Overtime & Extensions**: Any on-the-fly wait extensions (`+$3.50` for `+10m`) or overtime (`$0.50/min`) are settled directly in cash with the driver.
- **Driver Console Alert**: The Driver Dashboard displays a prominent **"💵 CASH TRIP · COLLECT IN CAR"** alert banner so Marcus or Trevon knows to collect cash in person before final drop-off.
- **One-Tap Driver Cash Receipt**: Drivers tap `"✓ Confirm Cash Received & Finish Trip"` upon arrival to finalize the ride and retain 100% of physical cash in hand with zero processing deductions.

---

## Key Features in this Prototype

1. **Rider Booking Flow**:
   - Preset or custom pickup locations and errand destinations with realistic mileage.
   - Interactive wait window selector (`10m`, `20m`, `30m`, `45m`, or custom duration).
   - Passenger selector (1–4 riders).
   - Dynamic upfront price calculation updating immediately when wait duration changes.

2. **Competitive & Affordable Itemized Pricing Engine (`public/js/pricing.js`)**:
   - Outbound leg ($3.50 base + $1.25/mi).
   - Guaranteed wait-time charge ($0.35/min transparent rate = $21.00/hr).
   - Roundtrip return leg with a 20% discount (since the vehicle is already positioned on-site with zero deadhead).
   - Flat platform and safety fee ($1.50).
   - Driver receives 85% of transit + 85% of wait pay ($17.85/hr guaranteed curb compensation).
   - Zero hidden surge fees.

3. **During-Stop Screen & Live Wait Timer**:
   - Real-time countdown timer tracking remaining reserved minutes.
   - Prominent, thumb-friendly **"✓ I'm ready to return"** button.
   - **"+10 min"** and **"+15 min"** wait extension buttons that recalculate and update the estimate in real time.

4. **Synchronized Driver Demo Mode**:
   - Top-level mode toggle between **Rider** and **Driver Demo**.
   - Shared reactive state store (`public/js/store.js`): changing state in one view updates the other view synchronously.
   - Driver sees complete earnings breakdown (transit earnings vs guaranteed wait pay).
   - Live Cash App wallet displaying balance and instant payout notifications.
   - Stepper allowing the driver to simulate lifecycle states (`Accepted` → `Heading to pickup` → `Outbound` → `Waiting at stop` → `Rider Ready` → `Return leg` → `Complete`).

5. **Trip Receipt & Completion**:
   - Itemized final receipt showing exact Cash App capture and release of unused buffer.
   - 5-star driver rating and simulated tip options ($2, $5, $8) paid directly via Cash App.
   - "Plan another trip" button that resets state cleanly.

---

## Multi-Stop & Transparent GPS Routing (Zero Manual Miles)

1. **Dynamic Multi-Stop Itineraries**:
   - Riders can chain up to **3 intermediate stops** (e.g. Pickup -> Pre-Game Stop -> Venue -> Late-Night Food) before heading home.
   - Each stop has an independent wait window (`10m`, `15m`, `20m`, `35m`, or custom duration).
2. **Transparent GPS Coordinate Distance Engine**:
   - **Zero manual distance presets or steppers**: Distances and leg fares are strictly and automatically computed from geographic GPS coordinates using the Haversine formula scaled by Atlanta's 1.28x urban street curvature factor.
   - Custom destinations resolve coordinates deterministically, providing transparent leg-by-leg breakdowns.

---

## Multi-Device Real-Time Synchronization & Telemetry Server

1. **Server-Sent Events (SSE) Stream (`/api/trip/events`)**:
   - Enables separate devices on the same Wi-Fi or across tabs to stay synchronized in real time.
   - **Rider Console**: `http://localhost:4242/?mode=rider`
   - **Driver Dashboard**: `http://localhost:4242/driver`
2. **Live Coordinate Broadcasts (`/api/driver/telemetry`)**:
   - When the driver's phone is mounted in the vehicle running the dashboard, live coordinates (`lat`, `lng`, `speed`, `heading`, `odometer`) are streamed to the server and instantly pushed via SSE to the passenger's phone.
3. **Rest API State Sync (`/api/trip/state`)**:
   - Local state transitions (`confirmBooking`, `advanceTripState`, `extendWait`, `markRiderReady`, `addStop`) automatically synchronize across all active clients.

---

## Overtime & Grace Period Wait Metering Engine

1. **3-Minute Grace Period Warning**:
   - When the reserved wait timer reaches 3 minutes remaining (`≤ 180s`), both rider and driver receive an active grace period warning banner.
   - Riders are prompted to return to the car or tap **"+10 min"** to lock in the standard **$0.35/min** rate.
2. **Transparent Overtime Metering ($0.50/min)**:
   - If the reserved window expires, the timer switches seamlessly to an **amber/red overtime meter** (`+02:14 Overtime`).
   - Overtime is metered transparently at **$0.50/min** directly against the rider's **$15.00 Cash App hold buffer**.
   - Drivers receive an **85% split** ($0.425/min = **$25.50/hr guaranteed passive compensation**) while waiting curbside during overtime.
   - Riders can tap **"+10 min"** at any point to halt the overtime meter and return to the standard $0.35/min rate.

---

## Project Structure

```
wait-and-return/
├── package.json                         # Scripts: "test", "check", "start", "dev"
├── README.md                            # Comprehensive product spec & Cash App architecture
├── server.mjs                           # Multi-Device SSE & REST Server (Port 4242)
├── test/
│   └── pricing-state.test.mjs           # Automated unit tests (24 passing tests)
└── public/
    ├── index.html                       # Mobile-first semantic HTML shell
    ├── css/
    │   └── styles.css                   # Calm transportation design system
    └── js/
        ├── app.js                       # Main application orchestrator & event bus
        ├── cashapp.js                   # Web Audio chime synthesizer & Cash App helpers
        ├── store.js                     # Reactive state machine with SSE sync & overtime timer
        ├── pricing.js                   # Haversine multi-stop pricing & overtime engine
        ├── data.js                      # Atlanta coordinates, venues, and 2-driver fleet
        ├── telemetry.js                 # GPS Geolocation watch & telemetry broadcasting
        └── components/
            ├── Header.js                # Mode switch, demo banner, active status pill
            ├── Landing.js               # One-sentence value proposition & CTA
            ├── BookingForm.js           # Multi-stop form controls with live GPS estimates
            ├── FareReview.js            # Leg-by-leg breakdown & Cash App Pay pre-auth hold
            ├── CashAppModal.js          # Simulated Cash App Pay authorization sheet
            ├── TripStatus.js            # Driver profile & transit simulation
            ├── WaitingStop.js           # Active stop timer, grace alert, overtime meter
            ├── TripComplete.js          # Itemized receipt & Cash App tipping
            ├── DriverView.js            # Dedicated driver perspective & Cash App wallet
            └── AboutModal.js            # How pricing works & prototype disclosures
```

---

## Setup & Run Instructions

### Prerequisites
- Node.js v18+ (tested on Node v24.18.0)
- No external packages or `npm install` required (uses native Web standards and Node standard library).

### 1. Run Automated Checks & Unit Tests
```bash
npm test
# or
node --test test/pricing-state.test.mjs
```

### 2. Start the Local Server
```bash
npm start
# or
node server.mjs
```
Open **`http://127.0.0.1:4100`** in any mobile or desktop browser.

---

## Production Integration Notes for Cash App

To make Cash App functional in production:
1. **Block (Square) Developer Account**: Register at [developer.squareup.com](https://developer.squareup.com) and create an application.
2. **Square Web Payments SDK**: Add Cash App Pay button element on the review screen.
3. **Delayed Capture API**:
   - `client.paymentsApi.createPayment({ sourceId, amountMoney: { amount: holdAmount, currency: 'USD' }, delayedCapture: true })`
4. **Instant Payouts to Drivers**:
   - Drivers register their `$cashtag`.
   - Use the Square Payouts API / Cash App Pay Push API to push net earnings immediately upon return trip completion.
