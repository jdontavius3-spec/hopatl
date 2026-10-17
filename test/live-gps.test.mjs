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
