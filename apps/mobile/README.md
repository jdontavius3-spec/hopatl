# TRICKHOPPER phone GPS client

This Expo app connects two separate phones to the TRICKHOPPER staging trip service. The phone's native location APIs provide GPS fixes; the shared staging API and Redis state let the rider and pilot see the same trip.

## Run the phone preview

1. Install **Expo Go** on each test phone.
2. From this directory, run `npx expo start --tunnel`.
3. Scan the QR code with each phone. Select **Rider** on one and **Pilot** on the other.
4. Keep both apps open and grant foreground location access. The live-trip screen stays awake so the GPS feed continues during a controlled test.

The API defaults to `https://trickhopper-staging.vercel.app`. Use **Server settings → Check connection** to confirm staging is reachable. Do not point test phones at the production domain.

Destination suggestions come from the live address search service. A rider must select a returned result for every hop before getting a road-route estimate and requesting a ride. The pilot request appears only after the server accepts that request; the pilot must have a fresh phone GPS fix to accept it. Pilot arrival, boarding, stop waits, each hop, return, and completion are recorded by the shared trip API.

For the current single-pilot controlled test, no phone number, carrier, or SMS provider is needed. The online pilot receives the request in the pilot portal; acceptance connects both portals and is confirmed in-app. No SMS is sent. Real transactional texts can be enabled later by configuring the staging Twilio secrets described in the repository README.

GPS fixes are sent only while the app is open in the foreground. Background location updates are not enabled in this demo build. No simulated route or status is used in this app.
