import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';

const driverCode='test-driver-code-0123456789-abcdefghijklmnopqrstuvwxyz';
const dispatchCode='test-dispatch-code-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.DRIVER_ACCESS_CODE=driverCode;
process.env.DISPATCH_ACCESS_CODE=dispatchCode;
const service=await import('../trip-service.mjs');

async function call(path,{method='GET',data={},token}={}){
 const raw=method==='POST'?JSON.stringify(data):'';
 const req=Readable.from(raw?[raw]:[]);
 req.method=method;
 req.url=path;
 req.headers={host:'localhost',origin:'http://localhost',...(token?{authorization:`Bearer ${token}`}:{})};
 const res={headers:{},statusCode:200,headersSent:false,setHeader(key,value){this.headers[key]=value},writeHead(status,headers={}){this.statusCode=status;Object.assign(this.headers,headers);this.headersSent=true},end(body=''){this.body=String(body);this.headersSent=true}};
 await service.handleRequest(req,res);
 return{status:res.statusCode,body:res.body?JSON.parse(res.body):null};
}

test('online pilot receives a request and accepted pilot/vehicle details reach rider and dispatch',async()=>{
 const quoteId='test-quote';
 const pickup={lat:33.749,lng:-84.388,accuracy:5};
 service.importPersistentState({routeQuotes:[[quoteId,{quote:{quoteId,destination:{label:'Test destination',lat:33.75,lng:-84.39},route:{totalDistanceMiles:4,totalDurationSeconds:600},fare:{totalCents:2000},waitMinutes:15,hops:[]},pickup:{lat:pickup.lat,lng:pickup.lng},expires:Date.now()+60_000}]]});

 const login=await call('/api/driver/login',{method:'POST',data:{code:driverCode,name:'Test Pilot',phone:'+14045550123',smsConsent:true,vehicle:'Blue Test Sedan',plate:'TEST123'}});
 assert.equal(login.status,200);
 const driverToken=login.body.driverToken;
 assert.equal((await call('/api/rider/availability')).body.status,'OFFLINE');
 assert.equal((await call('/api/driver/availability',{method:'POST',token:driverToken,data:{available:true}})).status,200);
 assert.equal((await call('/api/rider/availability')).body.status,'READY');

 const created=await call('/api/trip/create',{method:'POST',data:{initialFix:pickup,quoteId,riderPhone:'+14045550123',smsConsent:true,passengerCount:1}});
 assert.equal(created.status,201);
 assert.equal((await call('/api/rider/availability')).body.status,'BUSY');
 const incoming=await call('/api/driver/request',{token:driverToken});
 assert.equal(incoming.body.pending,true);
 assert.equal(incoming.body.tripId,created.body.tripId);

 const accepted=await call('/api/trip/claim',{method:'POST',token:driverToken,data:{initialFix:pickup}});
 assert.equal(accepted.status,200);
 assert.equal((await call('/api/rider/availability')).body.status,'BUSY');
 assert.equal(accepted.body.state.acceptedPilotVehicle,'Blue Test Sedan');
 assert.equal(accepted.body.state.acceptedPilotPlate,'TEST123');

 const pilotToken=accepted.body.pilotToken;
 const fix=(role,token,lat,lng)=>call('/api/telemetry/location',{method:'POST',token,data:{role,lat,lng,accuracy:5,speed:0,heading:null}});
 assert.equal((await fix('pilot',created.body.riderToken,pickup.lat,pickup.lng)).status,401,'rider credential cannot write pilot GPS');
 assert.equal((await fix('rider',created.body.riderToken,pickup.lat+.0001,pickup.lng)).status,200);
 assert.equal((await fix('pilot',pilotToken,pickup.lat+.0002,pickup.lng)).status,200);

 const rider=await call('/api/trip/state',{token:created.body.riderToken});
 assert.equal(rider.status,200);
 assert.equal(rider.body.state.acceptedPilotName,'Test Pilot');
 assert.equal(rider.body.state.acceptedPilotVehicle,'Blue Test Sedan');
 assert.equal(rider.body.shared.fixCounts.rider,1);
 assert.equal(rider.body.shared.fixCounts.pilot,1);

 const operator=await call('/api/dispatch/login',{method:'POST',data:{code:dispatchCode}});
 const board=await call('/api/dispatch/board',{token:operator.body.operatorToken});
 assert.equal(board.status,200);
 assert.equal(board.body.request.acceptedPilotPlate,'TEST123');
 assert.equal(board.body.pilots[0].phone,'+14045550123');
 const removed=await call('/api/dispatch/remove-pilot',{method:'POST',token:operator.body.operatorToken,data:{pilotId:login.body.pilotId}});
 assert.equal(removed.status,200);
 assert.equal(removed.body.pilots.length,0);
 assert.equal(removed.body.request.status,'CANCELLED');
 const riderAfterRemoval=await call('/api/trip/state',{token:created.body.riderToken});
 assert.equal(riderAfterRemoval.body.state.tripState,'CANCELLED');
});

test('pilot can progress trip and send SMS updates independently without continuous rider GPS fixes',async()=>{
 const quoteId='test-quote-unbound';
 const pickup={lat:33.749,lng:-84.388,accuracy:5};
 const stop={label:'Test destination',lat:33.7491,lng:-84.388};
 service.importPersistentState({routeQuotes:[[quoteId,{quote:{quoteId,destination:stop,route:{totalDistanceMiles:4,totalDurationSeconds:600},fare:{totalCents:2000},waitMinutes:15,hops:[{destination:stop,waitMinutes:15}]},pickup:{lat:pickup.lat,lng:pickup.lng},expires:Date.now()+60_000}]]});

 const login=await call('/api/driver/login',{method:'POST',data:{code:driverCode,name:'Test Pilot',phone:'+14045550123',smsConsent:true,vehicle:'Blue Test Sedan',plate:'TEST123'}});
 const driverToken=login.body.driverToken;
 await call('/api/driver/availability',{method:'POST',token:driverToken,data:{available:true}});

 const created=await call('/api/trip/create',{method:'POST',data:{initialFix:pickup,quoteId,riderPhone:'+14045550199',smsConsent:true,passengerCount:1}});
 assert.equal(created.status,201);

 // Simulate rider GPS going stale before pilot claims and progresses trip
 const stateSnap=service.exportPersistentState();
 stateSnap.shared.liveLocations.rider.receivedAt=Date.now()-120_000;
 stateSnap.shared.fixCounts.rider=0;
 service.importPersistentState(stateSnap);

 const accepted=await call('/api/trip/claim',{method:'POST',token:driverToken,data:{initialFix:pickup}});
 assert.equal(accepted.status,200);
 assert.equal(accepted.body.state.acceptedPilotPhone,'+14045550123');
 const pilotToken=accepted.body.pilotToken;

 // Verify pilot SMS contact (both GET and POST) and milestone confirmation
 const smsContactGet=await call('/api/trip/pilot-sms-contact',{token:pilotToken});
 assert.equal(smsContactGet.status,200);
 assert.equal(smsContactGet.body.riderSmsContact,'+14045550199');
 const smsContact=await call('/api/trip/pilot-sms-contact',{method:'POST',token:pilotToken});
 assert.equal(smsContact.status,200);
 assert.equal(smsContact.body.riderSmsContact,'+14045550199');
 const smsAccept=await call('/api/trip/pilot-sms-sent',{method:'POST',token:pilotToken,data:{milestone:'acceptance'}});
 assert.equal(smsAccept.status,200);
 assert.equal(smsAccept.body.state.smsConfirmation.status,'PILOT_CONFIRMED_SENT');

 // Pilot sends GPS fixes and progresses trip through all stages without rider GPS fixes
 await call('/api/telemetry/location',{method:'POST',token:pilotToken,data:{role:'pilot',lat:pickup.lat+.0001,lng:pickup.lng,accuracy:5,speed:5,heading:90}});
 await call('/api/telemetry/location',{method:'POST',token:pilotToken,data:{role:'pilot',lat:pickup.lat+.0001,lng:pickup.lng,accuracy:5,speed:5,heading:90}});

 const step1=await call('/api/trip/wait-event',{method:'POST',token:pilotToken,data:{action:'arrive_pickup'}});
 assert.equal(step1.status,200);

 const smsPickup=await call('/api/trip/pilot-sms-sent',{method:'POST',token:pilotToken,data:{milestone:'pickup_arrival'}});
 assert.equal(smsPickup.status,200);
 assert.equal(smsPickup.body.state.pickupArrivalSms.status,'PILOT_CONFIRMED_SENT');

 for(const action of ['start_outbound','arrive_stop','start_return']){
  const step=await call('/api/trip/wait-event',{method:'POST',token:pilotToken,data:{action}});
  assert.equal(step.status,200,`wait-event ${action} should succeed without fresh rider GPS`);
 }

 const completed=await call('/api/trip/state',{method:'POST',token:pilotToken,data:{tripState:'COMPLETED'}});
 assert.equal(completed.status,200);
 assert.equal(completed.body.state.tripState,'COMPLETED');

 const smsComplete=await call('/api/trip/pilot-sms-sent',{method:'POST',token:pilotToken,data:{milestone:'completion'}});
 assert.equal(smsComplete.status,200);
 assert.equal(smsComplete.body.state.completionSms.status,'PILOT_CONFIRMED_SENT');

 const resetCompleted=await call('/api/trip/reset',{method:'POST',token:pilotToken});
 assert.equal(resetCompleted.status,200);
 assert.equal(resetCompleted.body.state.tripState,'IDLE');

 // Verify legacy/simulated state migration clears stuck active trips and frees pilots
 service.importPersistentState({
  state:{tripId:'legacy-sim-trip',tripState:'ACTIVE',simulationMode:true},
  shared:{fixCounts:{rider:2,pilot:2}},
  access:{tripId:'legacy-sim-trip',riderToken:'r1',pilotToken:'p1'},
  pilots:{'pilot-test':{id:'pilot-test',name:'Test Pilot',phone:'+14045550123',available:true,availableUntil:Date.now()+60_000,activeTripId:'legacy-sim-trip',lastSeenAt:new Date().toISOString()}}
 });
 const availAfterMigration=await call('/api/rider/availability');
 assert.equal(availAfterMigration.status,200);
 assert.equal(availAfterMigration.body.status,'READY');
 assert.equal(availAfterMigration.body.ready,true);
});
