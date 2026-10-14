# TRICKHOPPER · Closed GPS Proof of Concept

This app is for experimental, controlled rider/pilot ride validation with consenting participants. It captures device GPS, route estimates, pickup and destination wait, return legs, and trip completion. In-app checkout is simulated; it does not charge riders or pay pilots.

## Local demo

Run `npm start` and open `http://localhost:4242/` for the rider view and `http://localhost:4242/driver` for the pilot view. Both views share one local Node process. The browser asks for location only after the participant starts sharing. The pilot can accept the request, record pickup and drop-off events, run the return wait timer, and complete the GPS session. The checkout success/decline states are simulated and move no funds.

The destination flow requests a one-time round-trip estimate and offers 15, 30, or 60 minutes of included destination wait. The wait block is included at the demo rate of $0.25/minute ($3.75, $7.50, or $15.00). Destination overrun is tracked after the reserved block plus two minutes; pickup wait has its own two-minute grace. These are unvalidated examples, not fares or an offer of transportation.

Route estimates use the public OpenStreetMap Nominatim geocoder and OSRM demo router. They do not provide traffic-aware ETAs or a service guarantee. Pickup coordinates and destination are sent to these providers after the rider asks for a quote; include that in participant consent and avoid collecting more personal information than the test needs.

## Hosting and live trip limits

The local Node server keeps one current trip in process memory. Keep it running throughout a controlled test; restarting it clears the trip. Use the connected Vercel + shared-storage setup for cross-device sessions outside the local computer.

The Vercel build now includes a shared API handler at `api/[...path].js`. It uses Upstash Redis REST credentials (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) to serialize trip updates and share a trip state across function invocations. State and GPS tracks expire after 12 hours. The rider and pilot pages poll the authenticated state feed every two seconds on this hosting mode. If storage is not configured or reachable, `/api/*` returns an error and the app disables booking and pairing.

The rider booking portal requires no access code to reduce friction for controlled testing; anyone with the staging URL can submit a request when a pilot is online. Each pilot signs in with the shared staging `DRIVER_ACCESS_CODE` plus their roster name/callsign and receives a distinct 8-hour session. Online status is tracked per pilot and expires without heartbeats. Pilot claims bind the accepting pilot name to the active request; completed, cancelled, and expired rides enter a small dispatch history. The private `/dispatch` console accepts `DISPATCH_ACCESS_CODE`; for a small controlled test it falls back to `DRIVER_ACCESS_CODE` until a separate operator code is configured. Set a distinct dispatch Secret before expanding access. These are test access gates, not verified pilot or operator identities.

For the current single-pilot controlled test, riders provide a mobile number and consent to one ride confirmation. The online pilot receives the request in the pilot portal; after accepting, the pilot can open a prefilled text in the device's messaging app and tap Send. This uses the pilot phone's carrier, not an SMS service account. TRICKHOPPER only records the pilot's self-confirmation; it cannot verify carrier delivery. The rider number is kept with the active ride and exposed only to the accepting pilot. To enable automatic transactional texts later, add `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_FROM_NUMBER` to the staging Vercel project's Environment Variables as Secrets. Use a sender approved for the intended US texting use. Twilio's trial accounts have recipient and message-content restrictions, and US local-number application messaging has A2P 10DLC registration requirements. [Twilio Message API](https://www.twilio.com/docs/messaging/api/message-resource), [Twilio trial restrictions](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account), [A2P 10DLC options for sole proprietors](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview).

The staging API uses Upstash Redis REST credentials so pilot presence and the dispatch history can be shared across Vercel function invocations. Confirm the staging Vercel project has `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; use the free tier and stop accepting demo requests if its usage cap is reached. [Upstash pricing](https://upstash.com/pricing/redis), [Upstash REST API](https://upstash.com/docs/redis/features/restapi).

`.env.example` shows variable names and placeholders only; it contains no credentials. Keep staging secrets in the `trickhopper-staging` Vercel project. Do not use this setup to replace the separate hosted `hopatl.com` app.

The rider portal and booking APIs are open to anyone who has the staging URL; request creation requires an online pilot, a current GPS fix, a selected route quote, and configured SMS. The pilot portal and operator console have staging-code gates; configure a distinct operator code before widening access. The backend tracks multiple signed-in pilot presences, but the current ride engine intentionally supports one active trip globally. It does not yet dispatch several simultaneous requests, so keep the staging board in controlled tests. Before wider rollout, replace the single-trip state with tripId-keyed records and test claim races, cancellation, completion, and recovery across separate devices. Browser GPS is device-reported and can be spoofed; the staging codes do not establish identity or authorization to transport passengers.

The hosted `hopatl.com` app is a different, older build from this source. Replacing it requires connecting the correct source and backend to the Vercel project; no domain or deployment changes are included in this review copy.

## Demo limits

- GPS comes from the browser/device after permission; the app cannot independently prove a fix is authentic.
- Fare values are demonstration math only. No quote is guaranteed, invoiced, or charged.
- Checkout success and decline are simulated. There is no Stripe, Apple Pay, Cash App payment, or pilot payout integration in this demo interface. Without Twilio credentials, the pilot must initiate any confirmation text from their own messaging app; TRICKHOPPER does not send or verify it.
- The local server's trip state is temporary and memory-only. The Vercel handler uses an expiring shared demo record, not a durable audit log; dispatch sign-in is a shared test code, not an individually authenticated operator account, and there is no support or emergency-response workflow.
- Before any real public ride operation, resolve local/state licensing, driver screening, vehicle eligibility, appropriate insurance, privacy/retention, and safety procedures with qualified providers and counsel.
