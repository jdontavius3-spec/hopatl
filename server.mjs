import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {calculateFare} from './public/js/pricing.js';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const WAIT_GRACE_SECONDS=120, METERS_PER_MILE=1609.344;
const GEOCODER_ENDPOINT=process.env.GEOCODER_ENDPOINT||'https://nominatim.openstreetmap.org/search';
const ROUTER_ENDPOINT=process.env.ROUTER_ENDPOINT||'https://router.project-osrm.org/route/v1/driving';
const routeQuotes=new Map(),geocodeCache=new Map();let lastGeocodeAt=0,geocodeQueue=Promise.resolve();
let persistState=null,shouldPersistResponse=false;
const initialState=()=>({tripState:'IDLE',notificationMessage:null,pickupArrivedAt:null,rideStartedAt:null,destinationArrivedAt:null,returnStartedAt:null,stopIndex:0,stopWaits:[],rideCompletedAt:null,tripDistanceMiles:0,cashConfirmation:{status:'NOT_OFFERED',amountCents:null,attestations:{rider:false,pilot:false}},externalPayment:{status:'NOT_STARTED',amountCents:null,sentCents:null,receivedCents:null,attestations:{rider:false,pilot:false}},settlementMode:null,demoPayment:{status:'NOT_STARTED',amountCents:null,estimatedFeeCents:null,pilotPayoutCents:null}});
const initialShared=()=>({liveLocations:{rider:null,pilot:null},tracks:{rider:[],pilot:[]},fixCounts:{rider:0,pilot:0},gpsActiveByRole:{rider:false,pilot:false},gpsErrors:{}});
let state=initialState();
let shared=initialShared();
let access=null;const tickets=new Map(),joinAttempts=new Map(),clients=new Set();
const digest=value=>createHash('sha256').update(value).digest();
const same=(a,b)=>{const x=digest(a),y=digest(b);return timingSafeEqual(x,y)};
const snapshot=()=>{const elapsed=(start,end,live)=>{if(!start)return 0;const stop=end?Date.parse(end):live?Date.now():Date.parse(start);return Math.max(0,Math.floor((stop-Date.parse(start))/1000))};const pickupWaitElapsedSeconds=elapsed(state.pickupArrivedAt,state.rideStartedAt,state.tripState==='WAITING_PICKUP'),activeStopWait=state.stopWaits?.[state.stopIndex],returnWaitElapsedSeconds=elapsed(activeStopWait?.arrivedAt,activeStopWait?.departedAt,['WAITING_HOP','WAITING_RETURN'].includes(state.tripState)),reservedWaitSeconds=Number(state.routeQuote?.hops?.[state.stopIndex]?.waitMinutes||0)*60,stopWaits=(state.stopWaits||[]).map((wait,index)=>({...wait,elapsedSeconds:elapsed(wait.arrivedAt,wait.departedAt,['WAITING_HOP','WAITING_RETURN'].includes(state.tripState)&&index===state.stopIndex),billableSeconds:Math.max(0,elapsed(wait.arrivedAt,wait.departedAt,['WAITING_HOP','WAITING_RETURN'].includes(state.tripState)&&index===state.stopIndex)-Number(state.routeQuote?.hops?.[index]?.waitMinutes||0)*60-WAIT_GRACE_SECONDS)}));return{state:{...state,stopWaits,tripId:access?.tripId||null,pickupWaitElapsedSeconds,pickupWaitBillableSeconds:Math.max(0,pickupWaitElapsedSeconds-WAIT_GRACE_SECONDS),returnWaitElapsedSeconds,returnWaitBillableSeconds:Math.max(0,returnWaitElapsedSeconds-reservedWaitSeconds-WAIT_GRACE_SECONDS),waitGraceSeconds:WAIT_GRACE_SECONDS},shared}};
function broadcast(type,extra={}){const message=`data: ${JSON.stringify({type,...snapshot(),...extra})}\n\n`;for(const client of clients){if(!access||client.tripId!==access.tripId)continue;try{client.res.write(message)}catch{clients.delete(client)}}}
const send=async(res,code,data)=>{if(persistState&&shouldPersistResponse)await persistState(exportPersistentState());res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
export function exportPersistentState(){return{state,shared,access,routeQuotes:[...routeQuotes],tickets:[...tickets]}}
export function importPersistentState(value){state=value?.state||initialState();shared=value?.shared||initialShared();access=value?.access||null;routeQuotes.clear();for(const entry of value?.routeQuotes||[])routeQuotes.set(...entry);tickets.clear();for(const entry of value?.tickets||[])tickets.set(...entry)}
export function setPersistenceCallback(callback){persistState=callback}
function body(req,limit=16000){return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>limit){reject(Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)})}
function sameOrigin(req){try{return new URL(req.headers.origin).host===req.headers.host}catch{return false}}
function authRole(req){const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token||!access||Date.now()>access.expires)return null;if(same(digest(token).toString('hex'),access.riderHash))return'rider';if(access.pilotHash&&same(digest(token).toString('hex'),access.pilotHash))return'pilot';return null}
const fresh=role=>{const fix=shared.liveLocations[role],age=Date.now()-Date.parse(fix?.timestamp||'');return Boolean(shared.gpsActiveByRole[role]&&fix&&fix.accuracy<=100&&age>=-5000&&age<=30000)};
const haversine=(a,b)=>{const rad=x=>x*Math.PI/180,dl=rad(b.lat-a.lat),dn=rad(b.lng-a.lng),v=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;return 3958.8*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v))};
function freshFix(input){return input&&[input.lat,input.lng,input.accuracy].every(Number.isFinite)&&input.lat>=-90&&input.lat<=90&&input.lng>=-180&&input.lng<=180&&input.accuracy>=0&&input.accuracy<=100}
function buildLocation(role,input,simulated=false){return{role,lat:input.lat,lng:input.lng,accuracy:input.accuracy,speed:input.speed??null,heading:input.heading??null,source:simulated?'simulation':'live-gps',timestamp:new Date().toISOString()}}
async function geocodeDestination(address){
 const key=address.trim().toLocaleLowerCase();if(geocodeCache.has(key))return geocodeCache.get(key);
 const task=geocodeQueue.then(async()=>{const delay=Math.max(0,1100-(Date.now()-lastGeocodeAt));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastGeocodeAt=Date.now();const target=new URL(GEOCODER_ENDPOINT);target.searchParams.set('q',address);target.searchParams.set('format','jsonv2');target.searchParams.set('limit','1');
  const response=await fetch(target,{headers:{'User-Agent':'TRICKHOPPER-local-prototype/1.0 (destination route estimate)','Referer':'https://hopatl.com/'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error(`Geocoder unavailable (HTTP ${response.status})`);const rows=await response.json();if(!Array.isArray(rows)||!rows.length)throw Error('No matching destination found. Try a fuller street address or nearby place name.');const found={lat:Number(rows[0].lat),lng:Number(rows[0].lon),label:String(rows[0].display_name||address).slice(0,300)};if(!Number.isFinite(found.lat)||!Number.isFinite(found.lng))throw Error('The destination search returned invalid coordinates.');if(geocodeCache.size>=100)geocodeCache.delete(geocodeCache.keys().next().value);geocodeCache.set(key,found);return found;
 });geocodeQueue=task.catch(()=>{});return task;
}
async function roadRoute(from,to){const target=new URL(`${ROUTER_ENDPOINT}/${from.lng},${from.lat};${to.lng},${to.lat}`);target.searchParams.set('overview','false');target.searchParams.set('steps','false');const response=await fetch(target,{headers:{'User-Agent':'TRICKHOPPER-local-prototype/1.0 (destination route estimate)'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error(`Road router unavailable (HTTP ${response.status})`);const data=await response.json(),route=data.routes?.[0];if(data.code!=='Ok'||!route||!Number.isFinite(route.distance)||!Number.isFinite(route.duration))throw Error('No drivable road route was found between the selected points.');return{distanceMeters:route.distance,distanceMiles:route.distance/METERS_PER_MILE,durationSeconds:route.duration};}
export async function handleRequest(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 const url=new URL(req.url,`http://${req.headers.host}`),p=url.pathname;
 shouldPersistResponse=req.method==='POST';
 if(access&&Date.now()>access.expires){shouldPersistResponse=true;state={...initialState(),notificationMessage:'This demo session expired. Start a new test request.'};shared=initialShared();access=null;routeQuotes.clear();tickets.clear()}
 if(p==='/api/trip/events'&&req.method==='GET'){
  if(persistState)return send(res,410,{ok:false,error:'Long-lived event streams are unavailable on this host. Use the shared trip state feed.'});
  const ticket=url.searchParams.get('ticket'),key=ticket&&digest(ticket).toString('hex'),record=key&&tickets.get(key);if(!record||record.expires<Date.now()||!access||record.tripId!==access.tripId)return send(res,401,{ok:false,error:'Event stream ticket expired or invalid'});
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({type:'INIT',...snapshot()})}\n\n`);const client={res,tripId:record.tripId};clients.add(client);req.on('close',()=>clients.delete(client));return
 }
  if(p.startsWith('/api/')&&req.method==='GET'){
  if(p==='/api/health')return send(res,200,{ok:true,mode:persistState?'shared-persistent-demo':'single-process-demo',tripState:state.tripState});
  if(p==='/api/simulation/state'){if(!state.simulationMode||!access)return send(res,404,{ok:false,error:'No simulated ride is available'});return send(res,200,{ok:true,...snapshot()})}
  if(p==='/api/trip/state'){if(!authRole(req))return send(res,401,{ok:false,error:'Trip credential required'});return send(res,200,{ok:true,...snapshot()})}
  if(p==='/api/driver/request')return send(res,200,{ok:true,pending:state.tripState==='REQUESTED'&&!access?.pilotHash,tripState:state.tripState,tripId:access?.tripId||null,pickup:state.tripState==='REQUESTED'&&!access?.pilotHash?shared.liveLocations.rider:null,destination:state.tripState==='REQUESTED'&&!access?.pilotHash?state.destination:null,passengerCount:state.tripState==='REQUESTED'&&!access?.pilotHash?state.passengerCount:null,routeQuote:state.tripState==='REQUESTED'&&!access?.pilotHash?state.routeQuote:null});
 }
 if(p.startsWith('/api/')&&req.method==='POST'){
  if(!sameOrigin(req))return send(res,403,{ok:false,error:'Same-origin request required'});
  try{const data=await body(req);
   if(p==='/api/route/quote'){
    if(!['IDLE','COMPLETED'].includes(state.tripState))return send(res,409,{ok:false,error:'A route estimate can only be prepared before an active trip'});
    const pickup=data.pickup;if(!pickup||![pickup.lat,pickup.lng].every(Number.isFinite)||pickup.lat < -90||pickup.lat>90||pickup.lng < -180||pickup.lng>180)return send(res,422,{ok:false,error:'A valid live pickup location is required'});const rawStops=Array.isArray(data.stops)?data.stops:[{destination:data.destination,waitMinutes:data.waitMinutes}];if(rawStops.length<1||rawStops.length>3)return send(res,422,{ok:false,error:'Choose between 1 and 3 destination stops'});for(const [i,stop] of rawStops.entries()){const text=typeof stop?.destination==='string'?stop.destination.trim():'';if(text.length<4||text.length>180)return send(res,422,{ok:false,error:`Enter a valid place or address for stop ${i+1}`});if(![15,30,60].includes(Number(stop.waitMinutes)))return send(res,422,{ok:false,error:`Choose a 15, 30, or 60 minute reserved wait for stop ${i+1}`})}
    const hops=[];for(const stop of rawStops){const query=stop.destination.trim(),resolved=await geocodeDestination(query);hops.push({destination:{...resolved,query},waitMinutes:Number(stop.waitMinutes)})}const points=[{lat:pickup.lat,lng:pickup.lng},...hops.map(h=>h.destination)],legs=[];for(let i=0;i<points.length-1;i++)legs.push(await roadRoute(points[i],points[i+1]));const returnLeg=await roadRoute(points.at(-1),points[0]);legs.push(returnLeg);const distanceMiles=legs.reduce((sum,leg)=>sum+leg.distanceMiles,0),activeSeconds=legs.reduce((sum,leg)=>sum+leg.durationSeconds,0),waitMinutes=hops.reduce((sum,hop)=>sum+hop.waitMinutes,0),fare=calculateFare({distanceMiles,activeSeconds,includedWaitMinutes:waitMinutes}),quoteId=randomUUID(),quote={quoteId,waitMinutes,hops,destination:hops.at(-1).destination,route:{legs,return:returnLeg,totalDistanceMiles:distanceMiles,totalDurationSeconds:activeSeconds},fare,provider:'OpenStreetMap Nominatim + OSRM demo router',calculatedAt:new Date().toISOString()};
    for(const [id,record] of routeQuotes)if(record.expires<Date.now())routeQuotes.delete(id);routeQuotes.set(quoteId,{quote,pickup:{lat:pickup.lat,lng:pickup.lng},expires:Date.now()+10*60_000});return send(res,200,{ok:true,quote});
   }
   if(p==='/api/trip/create'){
    if(!['IDLE','COMPLETED'].includes(state.tripState))return send(res,409,{ok:false,error:'A trip is already in progress'});
    if(!freshFix(data.initialFix))return send(res,422,{ok:false,error:'A valid live GPS fix is required to create the trip'});
    const quoteRecord=routeQuotes.get(String(data.quoteId||''));if(!quoteRecord||quoteRecord.expires<Date.now()||haversine(quoteRecord.pickup,data.initialFix)>.2)return send(res,409,{ok:false,error:'Create a fresh route estimate from this pickup location before requesting the ride'});const passengerCount=Number(data.passengerCount??1);if(!Number.isInteger(passengerCount)||passengerCount<1||passengerCount>4)return send(res,422,{ok:false,error:'Passenger count must be between 1 and 4'});
    const riderToken=randomBytes(32).toString('base64url'),tripId=randomUUID();
    access={tripId,riderHash:digest(riderToken).toString('hex'),pilotHash:null,expires:Date.now()+12*60*60_000};
    state={tripState:'REQUESTED',simulationMode:data.simulationMode===true,notificationMessage:data.simulationMode===true?'SIMULATION: ride request created with generated test coordinates. No real GPS session or vehicle movement occurred.':'Ride request sent to the pilot queue. The route-based round-trip estimate is shown to both portals; actual distance/time can differ.',destination:quoteRecord.quote.destination,pickupCoordinates:quoteRecord.pickup,passengerCount,routeQuote:quoteRecord.quote,pickupArrivedAt:null,rideStartedAt:null,destinationArrivedAt:null,returnStartedAt:null,stopIndex:0,stopWaits:[],rideCompletedAt:null,tripDistanceMiles:0,cashConfirmation:{status:'NOT_OFFERED',amountCents:null,attestations:{rider:false,pilot:false}},externalPayment:{status:'NOT_STARTED',amountCents:null,sentCents:null,receivedCents:null,attestations:{rider:false,pilot:false}},settlementMode:null,demoPayment:{status:'NOT_STARTED',amountCents:null,estimatedFeeCents:null,pilotPayoutCents:null}};routeQuotes.delete(String(data.quoteId));
    const location=buildLocation('rider',data.initialFix,state.simulationMode);shared={liveLocations:{rider:location,pilot:null},tracks:{rider:[],pilot:[]},fixCounts:{rider:0,pilot:0},gpsActiveByRole:{rider:true,pilot:false},gpsErrors:{}};
    return send(res,201,{ok:true,tripId,riderToken,...snapshot()});
   }
   if(p==='/api/trip/claim'){
    if(!access||state.tripState!=='REQUESTED'||access.pilotHash||!fresh('rider')||!freshFix(data.initialFix))return send(res,409,{ok:false,error:'A pending request and fresh GPS from both ends are required'});
    const pilotToken=randomBytes(32).toString('base64url');access.pilotHash=digest(pilotToken).toString('hex');state.tripState='EN_ROUTE';state.notificationMessage=state.simulationMode?'SIMULATION: pilot test session accepted; both generated location streams are marked as simulation data.':'Pilot accepted and both portals are connected. Pilot records arrival at pickup to begin the shared wait clock.';const location=buildLocation('pilot',data.initialFix,state.simulationMode);shared.liveLocations={...shared.liveLocations,pilot:location};shared.gpsActiveByRole={...shared.gpsActiveByRole,pilot:true};shared.gpsErrors={...shared.gpsErrors,pilot:null};broadcast('STATE_UPDATE');return send(res,200,{ok:true,tripId:access.tripId,pilotToken,...snapshot()});
   }
   if(p==='/api/trip/events-ticket'){
    const role=authRole(req);if(!role)return send(res,401,{ok:false,error:'Trip credential required'});const ticket=randomBytes(24).toString('base64url');tickets.set(digest(ticket).toString('hex'),{tripId:access.tripId,role,expires:Date.now()+60*60_000});return send(res,200,{ok:true,ticket});
   }
   if(p==='/api/trip/state'){
    const role=authRole(req),next=data.tripState;if(!role)return send(res,401,{ok:false,error:'Trip credential required'});
    if(next==='COMPLETED'){
     if(role!=='pilot'||!['ACTIVE','RETURNING'].includes(state.tripState)||!fresh('rider')||!fresh('pilot')||shared.fixCounts.rider<2||shared.fixCounts.pilot<2)return send(res,409,{ok:false,error:'Fresh GPS and recorded telemetry from both ends are required'});if(state.tripState==='ACTIVE')return send(res,409,{ok:false,error:'Complete every selected hop and record each reserved wait before finishing the round trip.'});if(state.tripState==='RETURNING'&&state.pickupCoordinates&&haversine(shared.liveLocations.pilot,state.pickupCoordinates)>.25)return send(res,409,{ok:false,error:'Pilot GPS is not yet within a quarter mile of the recorded pickup. Keep the return leg active until arrival.'});state.rideCompletedAt=new Date().toISOString();
    }else return send(res,422,{ok:false,error:'Invalid trip transition'});
    state.tripState=next;if('notificationMessage'in data)state.notificationMessage=String(data.notificationMessage).slice(0,500);broadcast('STATE_UPDATE');return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/trip/wait-event'){
    const role=authRole(req),action=data.action;if(role!=='pilot')return send(res,403,{ok:false,error:'Only the paired pilot can record arrival, boarding, and return-leg events'});
    if(!fresh('rider')||!fresh('pilot'))return send(res,409,{ok:false,error:'Fresh GPS from rider and pilot is required to record this event'});
    const now=new Date().toISOString();
    if(action==='arrive_pickup'&&state.tripState==='EN_ROUTE'){
     if(state.pickupCoordinates&&haversine(shared.liveLocations.pilot,state.pickupCoordinates)>.25)return send(res,409,{ok:false,error:'Pilot GPS is more than a quarter mile from the pickup. Record arrival when nearby.'});state.pickupArrivedAt=now;state.tripState='WAITING_PICKUP';state.notificationMessage='Pilot recorded arrival at pickup. The shared pickup-wait clock is running with its own grace period.';
    }else if(action==='start_outbound'&&state.tripState==='WAITING_PICKUP'){
     state.rideStartedAt=now;state.tripState='ACTIVE';state.notificationMessage='Pilot recorded rider boarding and the outbound trip start. Pickup wait is closed and visible in the timeline.';
    }else if(action==='arrive_stop'&&state.tripState==='ACTIVE'){
     const target=state.routeQuote?.hops?.[state.stopIndex]?.destination;if(!target)return send(res,409,{ok:false,error:'No destination stop is active'});if(haversine(shared.liveLocations.pilot,target)>.25)return send(res,409,{ok:false,error:`Pilot GPS is more than a quarter mile from Hop ${state.stopIndex+1}. Record arrival when nearby.`});state.stopWaits=state.stopWaits||[];state.stopWaits[state.stopIndex]={arrivedAt:now,departedAt:null};state.destinationArrivedAt=now;const finalStop=state.stopIndex===state.routeQuote.hops.length-1;state.tripState=finalStop?'WAITING_RETURN':'WAITING_HOP';state.notificationMessage=`Pilot recorded arrival at stop ${state.stopIndex+1} of ${state.routeQuote.hops.length}. Its reserved wait clock is visible to both portals.`;
    }else if(action==='start_next_hop'&&state.tripState==='WAITING_HOP'){
     const current=state.stopWaits?.[state.stopIndex];if(!current)return send(res,409,{ok:false,error:'Stop arrival must be recorded before departure'});current.departedAt=now;state.stopIndex+=1;state.tripState='ACTIVE';state.notificationMessage=`Pilot recorded departure from stop ${state.stopIndex}. GPS tracking continues to the next selected stop.`;
    }else if(action==='start_return'&&state.tripState==='WAITING_RETURN'){
     const current=state.stopWaits?.[state.stopIndex];if(!current)return send(res,409,{ok:false,error:'Final stop arrival must be recorded before starting the return'});current.departedAt=now;state.returnStartedAt=now;state.tripState='RETURNING';state.notificationMessage='Pilot recorded the return-leg start. The final stop wait is closed and visible in the trip timeline.';
    }else return send(res,409,{ok:false,error:'Wait event is not available in the current trip state'});
    broadcast('STATE_UPDATE');return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/trip/settlement-mode'){
    const role=authRole(req),mode=data.mode;
    if(role!=='rider')return send(res,403,{ok:false,error:'Only the rider can choose the settlement path'});
    if(state.tripState!=='COMPLETED'||mode!=='DEMO_DIGITAL')return send(res,409,{ok:false,error:'Only the no-money demo checkout is enabled in this proof of concept'});
    if(state.settlementMode&&state.settlementMode!==mode)return send(res,409,{ok:false,error:'A settlement path has already been selected for this trip'});
    state.settlementMode=mode;state.notificationMessage=mode==='CASH'?'Cash selected. Both parties can attest to the agreed amount in-app.':mode==='CASHAPP'?'Cash App selected. The app will hand off to Cash App; payment remains external.':'Demo checkout selected. This sandbox moves no money.';broadcast('SETTLEMENT_UPDATE');return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/trip/external-payment'){
    const role=authRole(req),action=data.action;
    if(!role)return send(res,401,{ok:false,error:'Role-scoped trip credential required'});
    if(state.tripState!=='COMPLETED'||state.settlementMode!=='CASHAPP')return send(res,409,{ok:false,error:'External Cash App handoff is available only after a completed trip'});
    const payment=state.externalPayment;
    if(action==='propose'){
     const amountCents=data.amountCents;if(role!=='rider'||payment.status!=='NOT_STARTED'||!Number.isInteger(amountCents)||amountCents<1||amountCents>1000000)return send(res,422,{ok:false,error:'Enter an agreed amount between $0.01 and $10,000.00'});
     state.externalPayment={...payment,status:'AWAITING_EXTERNAL_PAYMENT',amountCents};
    }else if(action==='attest_sent'||action==='attest_received'){
     if(payment.status==='NOT_STARTED'||payment.status==='DISPUTED'||payment.status==='CONFIRMED')return send(res,409,{ok:false,error:'Set the agreed amount first; this confirmation is already final or unavailable'});
     const expectedRole=action==='attest_sent'?'rider':'pilot';if(role!==expectedRole)return send(res,403,{ok:false,error:'Only the relevant trip party can make this confirmation'});
     const amountCents=data.amountCents;if(!Number.isInteger(amountCents)||amountCents<1||amountCents>1000000)return send(res,422,{ok:false,error:'Enter the amount shown in the external payment app'});
     const sentCents=action==='attest_sent'?amountCents:payment.sentCents,receivedCents=action==='attest_received'?amountCents:payment.receivedCents;
     const attestations={...payment.attestations,[role]:true};
     const mismatch=(sentCents!==null&&sentCents!==payment.amountCents)||(receivedCents!==null&&receivedCents!==payment.amountCents)||(sentCents!==null&&receivedCents!==null&&sentCents!==receivedCents);
     state.externalPayment={...payment,status:mismatch?'DISPUTED':attestations.rider&&attestations.pilot?'BOTH_ATTESTED':'AWAITING_OTHER',sentCents,receivedCents,attestations};
    }else return send(res,422,{ok:false,error:'Invalid external payment action'});
    state.notificationMessage=state.externalPayment.status==='BOTH_ATTESTED'?'Both parties report matching Cash App amounts. Trickhopper did not verify the transfer.':state.externalPayment.status==='DISPUTED'?'Reported Cash App amounts do not match. Resolve directly in Cash App.':'External Cash App handoff updated; no funds pass through Trickhopper.';broadcast('EXTERNAL_PAYMENT_UPDATE');return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/demo/payment'){
    const role=authRole(req),action=data.action;
    if(!role)return send(res,401,{ok:false,error:'Role-scoped trip credential required'});
    if(state.tripState!=='COMPLETED'||state.settlementMode!=='DEMO_DIGITAL')return send(res,409,{ok:false,error:'Demo checkout is not selected for this completed trip'});
    const demo=state.demoPayment;
    if(action==='propose'){
     const amountCents=data.amountCents;if(role!=='rider'||!['NOT_STARTED','FARE_REJECTED'].includes(demo.status)||!Number.isInteger(amountCents)||amountCents<1||amountCents>1000000)return send(res,422,{ok:false,error:'Enter a demo fare between $0.01 and $10,000.00'});
     state.demoPayment={status:'FARE_AWAITING_PILOT',amountCents,estimatedFeeCents:null,pilotPayoutCents:null};
    }else if(action==='approve'||action==='reject'){
     if(role!=='pilot'||demo.status!=='FARE_AWAITING_PILOT')return send(res,409,{ok:false,error:'Pilot fare decision is not available'});
     state.demoPayment={...demo,status:action==='approve'?'FARE_APPROVED':'FARE_REJECTED'};
    }else if(action==='simulate_success'||action==='simulate_decline'){
     if(role!=='rider'||demo.status!=='FARE_APPROVED')return send(res,409,{ok:false,error:'Pilot must approve the fare before demo checkout'});
     if(action==='simulate_success'){
      const estimatedFeeCents=Math.round(demo.amountCents*0.029+30);state.demoPayment={...demo,status:'TEST_SUCCEEDED',estimatedFeeCents,pilotPayoutCents:Math.max(0,demo.amountCents-estimatedFeeCents)};
     }else state.demoPayment={...demo,status:'TEST_DECLINED',estimatedFeeCents:null,pilotPayoutCents:null};
    }else return send(res,422,{ok:false,error:'Invalid demo payment action'});
    state.notificationMessage=state.demoPayment.status==='TEST_SUCCEEDED'?'Demo payment succeeded. Estimated fee and pilot payout shown; no money moved.':state.demoPayment.status==='TEST_DECLINED'?'Demo payment declined. No money moved.':'Demo checkout updated. No money moved.';broadcast('DEMO_PAYMENT_UPDATE');return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/trip/cash-confirmation'){
    const role=authRole(req),amountCents=data.amountCents;
    if(!role)return send(res,401,{ok:false,error:'Role-scoped trip credential required'});
    if(state.tripState!=='COMPLETED'||state.settlementMode!=='CASH')return send(res,409,{ok:false,error:'Cash confirmation is available only when cash was selected after trip completion'});
    if(!Number.isInteger(amountCents)||amountCents<1||amountCents>1000000)return send(res,422,{ok:false,error:'Enter an agreed cash amount between $0.01 and $10,000.00'});
    const cash=state.cashConfirmation;
    if(cash.status==='CONFIRMED'||cash.status==='DISPUTED')return send(res,409,{ok:false,error:'Cash confirmation is already final'});
    if(cash.amountCents!==null&&cash.amountCents!==amountCents){state.cashConfirmation={...cash,status:'DISPUTED',attestations:{...cash.attestations,[role]:true}};state.notificationMessage='Cash amount did not match. Both parties need to resolve it outside the app.';broadcast('CASH_UPDATE');return send(res,200,{ok:true,...snapshot()});}
    const attestations={...cash.attestations,[role]:true},both=attestations.rider&&attestations.pilot;
    state.cashConfirmation={status:both?'CONFIRMED':'AWAITING_OTHER',amountCents,attestations};
    state.notificationMessage=both?'Both parties confirmed the cash exchange. TRICKHOPPER did not verify the physical payment.':'Your cash confirmation was recorded. Waiting for the other party to confirm the same amount.';
    broadcast('CASH_UPDATE');return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/trip/reset'){
    if(!authRole(req))return send(res,401,{ok:false,error:'Trip credential required'});broadcast('TRIP_RESET');state=initialState();shared=initialShared();access=null;tickets.clear();routeQuotes.clear();return send(res,200,{ok:true,...snapshot()});
   }
   if(p==='/api/telemetry/status'){
    const role=authRole(req);if(!role||data.role!==role||typeof data.active!=='boolean')return send(res,401,{ok:false,error:'Role-scoped trip credential required'});shared.gpsActiveByRole={...shared.gpsActiveByRole,[role]:data.active};shared.gpsErrors={...shared.gpsErrors,[role]:data.active?null:String(data.error||'')};broadcast('LOCATION_STATUS',{role,active:data.active,error:data.active?null:data.error||null});return send(res,200,{ok:true});
   }
   if(p==='/api/telemetry/location'){
    const role=authRole(req);if(!role||data.role!==role||!freshFix(data))return send(res,401,{ok:false,error:'Role-scoped credential and valid GPS fix required'});if(!['REQUESTED','EN_ROUTE','WAITING_PICKUP','ACTIVE','WAITING_HOP','WAITING_RETURN','RETURNING'].includes(state.tripState))return send(res,409,{ok:false,error:'Trip is not accepting locations'});
    const location=buildLocation(role,data,state.simulationMode),prev=shared.liveLocations[role];shared.liveLocations={...shared.liveLocations,[role]:location};shared.gpsActiveByRole={...shared.gpsActiveByRole,[role]:true};shared.gpsErrors={...shared.gpsErrors,[role]:null};
    if(['EN_ROUTE','WAITING_PICKUP','ACTIVE','WAITING_HOP','WAITING_RETURN','RETURNING'].includes(state.tripState)){shared.tracks={...shared.tracks,[role]:[...shared.tracks[role],location].slice(-2500)};shared.fixCounts={...shared.fixCounts,[role]:shared.fixCounts[role]+1};if(['ACTIVE','RETURNING'].includes(state.tripState)&&role==='pilot'&&prev&&prev.accuracy<=100&&Date.parse(prev.timestamp)>=Date.parse(state.rideStartedAt||'')){const delta=haversine(prev,location),seconds=(Date.parse(location.timestamp)-Date.parse(prev.timestamp))/1000,implied=seconds>0?delta*1609.344/seconds:Infinity;if(state.simulationMode?delta<25:delta<1&&implied<55)state.tripDistanceMiles+=delta}}
    broadcast('LOCATION_UPDATE',{role,location,track:shared.tracks[role],fixCounts:shared.fixCounts,tripDistanceMiles:state.tripDistanceMiles,gpsActiveByRole:shared.gpsActiveByRole});return send(res,200,{ok:true,...snapshot(),location,track:shared.tracks[role]});
   }
   return send(res,404,{ok:false,error:'Not found'});
  }catch(e){return send(res,400,{ok:false,error:e.message||'Invalid request'})}
 }
 if(p==='/driver'||p==='/driver/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(path.join(root,'driver/index.html')).pipe(res)}
 if(p.startsWith('/api/'))return send(res,404,{ok:false,error:'Not found'});
 if(p==='/pilot'||p.startsWith('/pilot/')||['/rocko','/dohntay'].includes(p)){res.writeHead(404);return res.end('Pilot not onboarded.')}
 const relative=path.normalize(p==='/'?'/index.html':p).replace(/^([/\\]|\.\.(?:[/\\]|$))+/,''),file=path.join(root,relative);
 fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found')}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res)})
}
const PORT=Number(process.env.PORT)||4242,HOST=process.env.HOST||'127.0.0.1';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=http.createServer(handleRequest);
 server.listen(PORT,HOST,()=>console.log(`TRICKHOPPER local GPS pilot: http://${HOST}:${PORT} (rider /, pilot /driver)`));
}
