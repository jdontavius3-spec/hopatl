const base = process.env.TRICKHOPPER_URL || 'http://127.0.0.1:4248';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Simulation is restricted to localhost.');
const api = async (path, body, token) => {
  const response = await fetch(`${base}${path}`, {method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${data.error||'request failed'}`);
  return data;
};
const health = await (await fetch(`${base}/api/health`)).json();
if (!health.ok || health.mode !== 'single-process-demo') throw new Error('Expected the local single-process demo service.');
if (!['IDLE','COMPLETED'].includes(health.tripState)) throw new Error(`Local service already has a ${health.tripState} trip; reset it in the portal before simulation.`);
const pickup = {lat:33.7577,lng:-84.3647,accuracy:8}; // Krog Street Market area, generated test coordinate
const stops = [
  {destination:'Ponce City Market, Atlanta, GA',waitMinutes:15},
  {destination:'Inman Park, Atlanta, GA',waitMinutes:15},
];
const quoteResult = await api('/api/route/quote',{pickup,stops});
const quote = quoteResult.quote;
const created = await api('/api/trip/create',{initialFix:pickup,quoteId:quote.quoteId,passengerCount:1,simulationMode:true});
const riderToken = created.riderToken;
const rider = {lat:pickup.lat,lng:pickup.lng,accuracy:8};
const location = async (role, token, point) => api('/api/telemetry/location',{role,...point},token);
const pilotInitial = {lat:pickup.lat,lng:pickup.lng,accuracy:7};
const claimed = await api('/api/trip/claim',{initialFix:pilotInitial},riderToken);
const pilotToken = claimed.pilotToken;
await location('rider',riderToken,rider);
await location('pilot',pilotToken,pilotInitial);
const waitEvent = action => api('/api/trip/wait-event',{action},pilotToken);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let current = pilotInitial;
await waitEvent('arrive_pickup');
await waitEvent('start_outbound');
for (let index=0; index<quote.hops.length; index++) {
  const target=quote.hops[index].destination;
  await location('pilot',pilotToken,{lat:target.lat,lng:target.lng,accuracy:8});
  await location('rider',riderToken,rider);
  current={lat:target.lat,lng:target.lng,accuracy:8};
  await waitEvent('arrive_stop'); await delay(1_100);
  if(index<quote.hops.length-1)await waitEvent('start_next_hop');
  else await waitEvent('start_return');
}
await location('pilot',pilotToken,pickup);
await location('rider',riderToken,rider);
await api('/api/trip/state',{tripState:'COMPLETED',notificationMessage:'SIMULATION COMPLETE: generated coordinates exercised pickup, each hop wait, return, and trip telemetry. No real ride occurred.'},pilotToken);
const final = await (await fetch(`${base}/api/trip/state`,{headers:{Authorization:`Bearer ${riderToken}`} })).json();
const state=final.state;
console.log(JSON.stringify({label:'SIMULATED RIDE · TEST DATA ONLY',tripState:state.tripState,tripId:state.tripId,routeDistanceEstimateMiles:Number(quote.route.totalDistanceMiles.toFixed(2)),routeDurationEstimateMinutes:Math.round(quote.route.totalDurationSeconds/60),fareEstimateUSD:(quote.fare.totalCents/100).toFixed(2),stops:state.stopWaits.map((wait,index)=>({hop:index+1,waitSeconds:wait.elapsedSeconds,overrunSeconds:wait.billableSeconds})),pilotGpsFixes:state.shared?.fixCounts?.pilot??final.shared?.fixCounts?.pilot,riderGpsFixes:final.shared?.fixCounts?.rider,pilotGpsDistanceMiles:Number(state.tripDistanceMiles.toFixed(2)),gpsSource:final.shared?.liveLocations?.pilot?.source,checkout:'not run; no money moved'},null,2));
