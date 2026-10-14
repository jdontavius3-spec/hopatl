# TRICKHOPPER · Closed GPS Proof of Concept

This app is for experimental, controlled rider/pilot ride validation with consenting participants. It captures device GPS, route estimates, pickup and destination wait, return legs, and trip completion. In-app checkout is simulated; it does not charge riders or pay pilots.

## Local demo

Run `npm start` and open `http://localhost:4242/` for the rider view and `http://localhost:4242/driver` for the pilot view. Both views share one local Node process. The browser asks for location only after the participant starts sharing. The pilot can accept the request, record pickup and drop-off events, run the return wait timer, and complete the GPS session. The checkout success/decline states are simulated and move no funds.

The destination flow requests a one-time round-trip estimate and offers 15, 30, or 60 minutes of included destination wait. The wait block is included at the demo rate of $0.25/minute ($3.75, $7.50, or $15.00). Destination overrun is tracked after the reserved block plus two minutes; pickup wait has its own two-minute grace. These are unvalidated examples, not fares or an offer of transportation.

Route estimates use the public OpenStreetMap Nominatim geocoder and OSRM demo router. They do not provide traffic-aware ETAs or a service guarantee. Pickup coordinates and destination are sent to these providers after the rider asks for a quote; include that in participant consent and avoid collecting more personal information than the test needs.

## Hosting and live trip limits

The local Node server keeps one current trip in process memory. Keep it running throughout a controlled test; restarting it clears the trip. Use the connected Vercel + shared-storage setup for cross-device sessions outside the local computer.

The Vercel build now includes a shared API handler at `api/[...path].js`. It uses Upstash Redis REST credentials (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) to serialize trip updates and share a trip state across function invocations. State and GPS tracks expire after 12 hours. The rider and pilot pages poll the authenticated state feed every two seconds on this hosting mode. If storage is not configured or reachable, `/api/*` returns an error and the app disables booking and pairing.

The rider booking portal requires no access code to reduce friction for controlled testing; anyone with the staging URL can submit a request when the pilot is online. The pilot portal remains protected by `DRIVER_ACCESS_CODE`, stored only in the staging Vercel project's Environment Variables. A successful driver sign-in receives an 8-hour signed session in browser session storage. The driver must explicitly go online before rider requests are accepted. Online state expires unless the driver portal sends a heartbeat, and an unaccepted ride request expires after 90 seconds. A rider can cancel a request before it is accepted. The driver code is a test access gate, not identity verification or a production account.

The Vercel project still has no database connected, so the production domain is not functional with this review copy until the Upstash database is created, connected, and its credentials are available to Vercel. Use the free tier only; Upstash lists $0/month with usage caps. If the free limit is reached, stop accepting demo trips rather than enabling paid usage. [Upstash pricing](https://upstash.com/pricing/redis). Vercel functions run as individual request invocations, so the shared store—not process memory—is the source of truth. [Vercel Functions](https://vercel.com/docs/functions).

For deployment setup, create an Upstash Redis database on its free tier, link it to the `hopatl` Vercel project, and verify Vercel has `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the target environment. `.env.example` shows the variable names only; it contains no credentials. The API uses Upstash's HTTPS REST commands so it needs no Redis TCP connection or third-party Node package. [Upstash REST API](https://upstash.com/docs/redis/features/restapi).

The rider portal and booking APIs are open to anyone who has the staging URL; request creation is limited to one active trip and requires an online pilot, a current GPS fix, and a selected route quote. The pilot portal and dispatch APIs remain protected by the driver code. Before any wider rollout, test rider/driver pairing from two separate devices, verify that updates survive separate function invocations, and review location consent/retention. Browser GPS is device-reported and can be spoofed. The current app supports one active demo trip at a time; it is not a production dispatch service.

The hosted `hopatl.com` app is a different, older build from this source. Replacing it requires connecting the correct source and backend to the Vercel project; no domain or deployment changes are included in this review copy.

## Demo limits

- GPS comes from the browser/device after permission; the app cannot independently prove a fix is authentic.
- Fare values are demonstration math only. No quote is guaranteed, invoiced, or charged.
- Checkout success and decline are simulated. There is no Stripe, Apple Pay, Cash App payment, SMS provider, or pilot payout integration in this demo interface.
- The local server's trip state is temporary and memory-only. The Vercel handler uses a temporary shared demo record, not a durable audit log; there is no identity verification, dispatcher account, support operation, or emergency-response workflow.
- Before any real public ride operation, resolve local/state licensing, driver screening, vehicle eligibility, appropriate insurance, privacy/retention, and safety procedures with qualified providers and counsel.
