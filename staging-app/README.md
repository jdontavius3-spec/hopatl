# TRICKHOPPER · Atlanta Nightlife Multi-Hop & Wait-and-Return Prototype

A live rider/pilot proof of flow for Atlanta nightlife roundtrip rides (`hopatl.com`) featuring **1–3 stop itineraries**, **reserved pilot standby blocks**, **2-minute curbside summon**, **50% upfront retainer deposit protection**, and a **self-serve Auto-Pilot Demo Simulator**.

## Quick Start & Demo Modes

Start the server with `npm start`, then open:
- **Rider Portal:** `http://localhost:4242/`
- **Pilot Console:** `http://localhost:4242/driver`

### Two Ways to Demo
1. **Solo / Investor Walkthrough (Auto-Pilot Simulator):**
   - On `/`, tap **⚡ Use Midtown Atlanta Demo Pickup** (or share live device GPS).
   - Add 1 to 3 stops (e.g., *Magic City* for 30 min, *Waffle House* for 15 min), calculate the upfront retainer quote, and tap **⚡ Request & Launch Auto-Pilot Demo**.
   - Simulated Pilot **Rocko (Black 2024 Cadillac Escalade ESV · ATL-HOP1)** automatically pairs, streams GPS telemetry on the Leaflet street map, and lets you step through every stage (`EN_ROUTE` → `WAITING_PICKUP` → `ACTIVE` → `WAITING_HOP` → `WAITING_RETURN` → `RETURNING` → `COMPLETED`) using the **Interactive Prototype Walkthrough Bar**.
2. **Two-Device Live GPS Run (Rider + Pilot):**
   - Rider requests a trip on `/` (`📡 Send Request to Live Pilot Console`).
   - Pilot accepts from `/driver` with live GPS (or Midtown Demo GPS).
   - Pilot records arrivals, standby waits, and return leg completion; **pilot actions remain fully operational even if the rider's phone screen locks inside a venue**.

## Calibrated Nightlife Retainer Economics (`public/js/pricing.js`)

Designed so dedicated standby blocks fairly compensate Atlanta pilots compared to point-to-point Uber/Lyft driving while protecting pilots from mid-stop abandonment:
- **Roundtrip Dispatch Base:** `$4.00`
- **Per Road / GPS Mile:** `$1.35/mi`
- **Per Active Driving Minute:** `$0.30/min`
- **Reserved Standby Tiers:**
  - `15 min` (**Quick Hop** — food run, fit change, quick pickup): `$6.00` (`$0.40/min`)
  - `30 min` (**Lounge Hold** — pre-game, cocktail stop, VIP drop-in): `$13.50` (`$0.45/min`)
  - `60 min` (**VIP Standby** — full venue session, pilot staged nearby): `$27.00` (`$0.45/min`)
- **Grace & Overrun:** Separate **2-minute free grace period** at pickup and after each reserved hop block; overrun past grace accrues at `$0.50/min`.
- **50% Upfront Retainer Deposit:** Locks 50% of the quoted retainer upfront so pilots are never left unpaid if a rider decides to stay at a venue; the remaining 50% + any wait overrun is settled upon return completion.
- **Minimum Roundtrip Retainer:** `$12.00`

## Legal Standby & 2-Minute Curbside Summon

Because Atlanta nightlife venues (*Magic City*, *Ponce City Market*, *Krog Street Market*, *Compound*, *Buckhead*) do not allow vehicles to idle at the curb for 30–60 minutes, TRICKHOPPER separates **Legal Standby Staging** from **Curbside Pull-Up**:
- Upon drop-off at a hop, the pilot transitions to `STAGED_NEARBY` (parked legally 1 block away) while the shared standby clock runs.
- When ready to leave, the rider taps **🚨 Summon Pilot to Curb (Heading Out in 2 Min)**—or taps **⏱ +15 Min Standby** to extend their reserved wait in-app.
- Both parties communicate via **in-app preset status pings** without exposing personal phone numbers.

## Verification & Automated Audit

Run `npm test` to execute `test/live-gps.test.mjs`, which verifies:
1. Scoped bearer token exchange, one-time pilot join codes, and role-based access control.
2. Multi-hop route quoting,Atlanta Nightlife Gazetteer lookup, 50% deposit split, and 2 AM surge comparison.
3. Pilot screen-lock independence (wait and completion events succeed even when rider GPS is background-suspended).
4. In-app wait extensions (`+15 min`) and Curbside Summon pings (`SUMMON_CURB`).
5. End-to-end self-serve Auto-Pilot Demo Simulator and settlement flows.
